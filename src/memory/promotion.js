import path from 'node:path';

import { classifyDialogueFeedback } from '../feedback/classify.js';
import { reduceRevisionOutcome } from '../feedback/outcome.js';
import {
  appendPromotionBundleDecision,
  loadPromotionLedger,
} from '../library/promotion-ledger.js';
import { discoverLibrary } from '../library/discover.js';
import { decideMemoryPromotion } from './feedback.js';
import { isPromotionGateVerifier } from './gate-receipts.js';
import { assertPublicArtifact } from './privacy/artifact.js';
import { prepareCandidate } from './promotion/candidate.js';
import {
  classifiedFeedbackReceipt,
  combineFeedbackReceipts,
  createStructuredFeedbackReceipt,
  deepFreeze,
  dialogueForClassification,
  explicitFeedbackReceipt,
  feedbackBindings,
  normalizeDialogue,
  promotionGraceMs,
  quarantineFeedbackReceipt,
} from './promotion/feedback-evidence.js';
import { materializePromotion } from './promotion/materialize.js';

export {
  createPromotionGateAuthority,
  createPromotionGateIssuer,
  createPromotionGateVerifier,
  isPromotionGateIssuer,
  isPromotionGateVerifier,
  loadPromotionGateAuthorityFile,
  loadPromotionGateVerifierFile,
  PromotionGateConfigurationError,
  PROMOTION_GATE_NAMES,
  PROMOTION_GATE_RECEIPT_SCHEMA,
  PROMOTION_GATE_RECEIPT_VERSION,
  verifyPromotionGateReceipt,
} from './gate-receipts.js';

/**
 * Online outcome loop for one exact class revision. Workspace events and
 * optional human dialogue are transient inputs; persisted receipts are hash-only.
 */
export async function orchestrateMemoryPromotion(input = {}, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? input.repositoryRoot ?? process.cwd());
  const currentDiscovery = options.discovery ?? await discoverLibrary({
    rootDir: repositoryRoot,
    promotionLedger: options.ledger,
    promotionLedgerFile: options.ledgerFile,
  });
  const prepared = prepareCandidate(currentDiscovery, input.candidate, input.bundle);
  const dialogue = normalizeDialogue(input.dialogue ?? []);
  const explicitSignals = input.humanSignals ?? [];
  const graceMs = promotionGraceMs(input.graceMs);
  const outcome = input.outcomeEvents === undefined ? null : reduceRevisionOutcome({
    events: input.outcomeEvents,
    revisionSha256: input.revisionSha256,
    nowMs: input.nowMs,
    graceMs,
    feedbackWindowMs: input.feedbackWindowMs,
  });
  if (outcome && input.generatedAtMs !== undefined
      && outcome.generatedAtMs !== input.generatedAtMs) {
    throw new TypeError('generatedAtMs must match the revision outcome generation event');
  }
  if (input.feedbackReceipt !== undefined) {
    throw new TypeError('prebuilt feedback receipts are not accepted; supply source outcome events');
  }
  const bindings = feedbackBindings({ input, outcome, dialogue, prepared });
  let feedbackReceipt = null;
  let classifierStatus = 'not-requested';
  let classifierInputPolicy = null;

  if (outcome && outcome.feedback.signal !== 'unknown') {
    feedbackReceipt = createStructuredFeedbackReceipt({
      candidateSha256: prepared.candidate.candidateSha256,
      outcome,
    });
    classifierStatus = 'bypassed-structured-workspace-outcome';
  }
  if (explicitSignals.length > 0) {
    const explicitReceipt = explicitFeedbackReceipt({
      candidateSha256: prepared.candidate.candidateSha256,
      dialogue,
      humanSignals: explicitSignals,
      generatedMessageId: input.generatedMessageId,
      generatedAtMs: input.generatedAtMs,
      nowMs: input.nowMs,
      graceMs,
      bindings,
    });
    feedbackReceipt = feedbackReceipt
      ? combineFeedbackReceipts(feedbackReceipt, explicitReceipt)
      : explicitReceipt;
    classifierStatus = outcome && outcome.feedback.signal !== 'unknown'
      ? 'combined-workspace-and-explicit-outcomes'
      : 'bypassed-explicit-human';
  }

  const provider = options.provider ?? input.provider;
  const classificationDialogue = dialogueForClassification(
    dialogue,
    input.generatedMessageId,
    feedbackReceipt,
  );
  const hasDialogueAnchor = classificationDialogue.some(
    (message) => message.id === input.generatedMessageId && message.role === 'assistant',
  );
  const hasUnclassifiedUserMessage = classificationDialogue.some(
    (message) => message.role === 'user',
  );
  const canClassify = provider
    && hasDialogueAnchor
    && hasUnclassifiedUserMessage
    && (!feedbackReceipt || ['positive', 'neutral'].includes(feedbackReceipt.signal))
    && (outcome === null || outcome.validation.complete);
  if (canClassify) {
    const classified = await classifyDialogueFeedback({
      signals: [],
      generatedMessageId: input.generatedMessageId,
      generatedAtMs: input.generatedAtMs ?? outcome?.generatedAtMs,
      nowMs: input.nowMs,
      graceMs,
      feedbackWindowMs: input.feedbackWindowMs,
      revisionSha256: bindings.revisionSha256,
      retainedRevisionSha256: feedbackReceipt ? bindings.revisionSha256 : undefined,
      dialogue: classificationDialogue.map(
        ({ id, role, atMs, content }) => ({ id, role, atMs, content }),
      ),
    }, { provider });
    classifierInputPolicy = classified.classification?.externalProviderInput ?? null;
    const classifiedReceipt = classifiedFeedbackReceipt({
      candidateSha256: prepared.candidate.candidateSha256,
      classified,
      bindings,
    });
    if (classifiedReceipt) {
      feedbackReceipt = feedbackReceipt
        ? combineFeedbackReceipts(feedbackReceipt, classifiedReceipt)
        : classifiedReceipt;
      classifierStatus = 'classified-user-dialogue';
    } else if (classified.reason === 'no-feedback-dialogue' && feedbackReceipt) {
      classifierStatus = 'no-additional-dialogue-evidence';
    } else {
      feedbackReceipt = feedbackReceipt ? quarantineFeedbackReceipt(feedbackReceipt) : null;
      classifierStatus = 'quarantined';
    }
  }

  const decision = decideMemoryPromotion({
    candidate: prepared.candidate,
    feedbackReceipt,
    gates: input.gates,
    policy: input.policy,
    stability: input.stability,
  }, { gateVerifier: options.gateVerifier });
  const ledgerValidation = options.ledger
    ? await loadPromotionLedger({ ledger: options.ledger })
    : await loadPromotionLedger({
      rootDir: repositoryRoot,
      ledgerFile: options.ledgerFile,
    });
  if (!ledgerValidation.ok) throw new Error('Current promotion ledger is invalid');
  let appendPrepared = prepared;
  // Feedback classification may await an external provider. Re-read the
  // repository after that boundary so signed gates cannot append a class
  // against shared/core bytes that changed while feedback was pending. Even
  // callers that injected an initial discovery must pass this disk-backed
  // compare-and-append boundary.
  if (decision.eligibleForPromotion) {
    const latestDiscovery = await discoverLibrary({
      rootDir: repositoryRoot,
      promotionLedger: ledgerValidation.ledger,
    });
    appendPrepared = prepareCandidate(latestDiscovery, input.candidate, input.bundle);
  }
  const nextLedger = decision.eligibleForPromotion
    ? appendPromotionBundleDecision(ledgerValidation.ledger, appendPrepared.discovery, decision, {
      gateVerifier: options.gateVerifier,
      gates: input.gates,
      bundleKinds: appendPrepared.bundleKinds,
    })
    : ledgerValidation.ledger;
  assertPublicArtifact(nextLedger);

  let materialized = false;
  if (options.materialize === true && decision.eligibleForPromotion) {
    if (!isPromotionGateVerifier(options.gateVerifier)) {
      throw new Error('Materialization requires a configured promotion gate authority');
    }
    await materializePromotion({
      repositoryRoot,
      ledgerFile: options.ledgerFile,
      currentLedger: ledgerValidation.ledger,
      nextLedger,
      stagedModules: appendPrepared.stagedModules,
      primaryKind: appendPrepared.bundleKinds[0],
    });
    materialized = true;
  }

  const result = {
    schemaVersion: 1,
    candidate: prepared.candidate,
    feedbackReceipt,
    classifierStatus,
    classifierInputPolicy,
    decision,
    ledgerChanged: nextLedger.ledgerSha256 !== ledgerValidation.ledger.ledgerSha256,
    nextLedgerSha256: nextLedger.ledgerSha256,
    materialized,
    evaluatedModules: 0,
  };
  assertPublicArtifact(result);
  return deepFreeze({ ...result, nextLedger });
}
