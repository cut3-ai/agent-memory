import fs from 'node:fs/promises';
import path from 'node:path';

import {
  aggregateFeedbackSignals,
  classifyDialogueFeedback,
  DEFAULT_FEEDBACK_GRACE_MS,
  hashDialogueEvent,
} from '../feedback/classify.js';
import { sha256, stableStringify } from '../lib.js';
import {
  appendPromotionDecision,
  buildDependencyClosure,
  candidateRevisionSha256,
  loadPromotionLedger,
  writePromotionLedger,
} from '../library/promotion-ledger.js';
import {
  collectStaticSpecifiers,
  discoverLibrary,
  findExportedClasses,
  parseModule,
  propertyName,
  readOwnStaticKind,
} from '../library/discover.js';
import { assertValidLibrary, verifyDiscovery } from '../library/verify.js';
import {
  decideMemoryPromotion,
  MINIMUM_FEEDBACK_GRACE_MS,
} from './feedback.js';
import { isPromotionGateVerifier } from './gate-receipts.js';
import { assertPublicArtifact } from './privacy.js';

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

const HASH = /^[a-f0-9]{64}$/u;

/**
 * Human-feedback loop for one exact class revision. Raw dialogue and staged
 * source are transient inputs; every returned/persisted receipt is hash-only.
 */
export async function orchestrateMemoryPromotion(input = {}, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? input.repositoryRoot ?? process.cwd());
  const currentDiscovery = options.discovery ?? await discoverLibrary({
    rootDir: repositoryRoot,
    promotionLedger: options.ledger,
    promotionLedgerFile: options.ledgerFile,
  });
  const prepared = prepareCandidate(currentDiscovery, input.candidate);
  const dialogue = normalizeDialogue(input.dialogue ?? []);
  const explicitSignals = input.humanSignals ?? [];
  let feedbackReceipt = null;
  let classifierStatus = 'not-requested';
  let classifierInputPolicy = null;

  if (explicitSignals.length > 0) {
    feedbackReceipt = explicitFeedbackReceipt({
      candidateSha256: prepared.candidate.candidateSha256,
      dialogue,
      humanSignals: explicitSignals,
      generatedMessageId: input.generatedMessageId,
      generatedAtMs: input.generatedAtMs,
      nowMs: input.nowMs,
      graceMs: promotionGraceMs(input.graceMs),
    });
    classifierStatus = 'bypassed-explicit-human';
  } else if (options.provider ?? input.provider) {
    const classified = await classifyDialogueFeedback({
      signals: [],
      generatedMessageId: input.generatedMessageId,
      generatedAtMs: input.generatedAtMs,
      nowMs: input.nowMs,
      graceMs: promotionGraceMs(input.graceMs),
      feedbackWindowMs: input.feedbackWindowMs,
      dialogue: dialogue.map(({ id, role, atMs, content }) => ({ id, role, atMs, content })),
    }, { provider: options.provider ?? input.provider });
    classifierInputPolicy = classified.classification?.externalProviderInput ?? null;
    feedbackReceipt = classifiedFeedbackReceipt({
      candidateSha256: prepared.candidate.candidateSha256,
      classified,
    });
    classifierStatus = feedbackReceipt ? 'classified-user-dialogue' : 'quarantined';
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
    appendPrepared = prepareCandidate(latestDiscovery, input.candidate);
  }
  const nextLedger = decision.eligibleForPromotion
    ? appendPromotionDecision(ledgerValidation.ledger, appendPrepared.discovery, decision, {
      gateVerifier: options.gateVerifier,
      gates: input.gates,
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
      staged: appendPrepared.staged,
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

/** Build the only feedback object accepted by decideMemoryPromotion. */
export function createFeedbackReceipt(value) {
  if (!['explicit-human', 'human-dialogue-classified'].includes(value.origin)) {
    throw new TypeError('feedback receipt origin is invalid');
  }
  if (value.origin === 'explicit-human' && value.classifier !== null) {
    throw new TypeError('explicit feedback cannot carry classifier authority');
  }
  if (value.origin === 'human-dialogue-classified' && !value.classifier) {
    throw new TypeError('classified feedback requires classifier hashes');
  }
  const body = {
    schemaVersion: 2,
    candidateSha256: requireHash(value.candidateSha256, 'candidateSha256'),
    generationEventSha256: requireHash(
      value.generationEventSha256,
      'generationEventSha256',
    ),
    origin: value.origin,
    signal: value.signal,
    state: value.state,
    counts: normalizeCounts(value.counts),
    eventSha256s: normalizeHashes(value.eventSha256s, 'eventSha256s'),
    grace: normalizeGrace(value.grace),
    classifier: value.classifier === null ? null : normalizeClassifier(value.classifier),
  };
  const receipt = { ...body, receiptSha256: sha256(stableStringify(body)) };
  assertPublicArtifact(receipt);
  return deepFreeze(receipt);
}

function explicitFeedbackReceipt(input) {
  const generation = requireGenerationAnchor(
    input.dialogue,
    input.generatedMessageId,
    input.generatedAtMs,
  );
  const messages = new Map(input.dialogue.map((message) => [message.id, message]));
  const signals = input.humanSignals.map((signal, index) => {
    if (!signal || typeof signal !== 'object' || signal.source !== 'human') {
      throw new TypeError(`humanSignals[${index}] must be an explicit human event`);
    }
    const message = messages.get(signal.messageId);
    if (!message || message.role !== 'user') {
      throw new TypeError(`humanSignals[${index}] must reference a user-authored dialogue event`);
    }
    if (message.atMs <= generation.atMs
        || input.dialogue.indexOf(message) <= input.dialogue.indexOf(generation)) {
      throw new TypeError(`humanSignals[${index}] must follow the generated assistant event`);
    }
    return {
      kind: signal.kind ?? signal.signal,
      atMs: message.atMs,
      messageIds: [message.eventSha256],
    };
  });
  const aggregate = aggregateFeedbackSignals({
    signals,
    generatedAtMs: input.generatedAtMs,
    nowMs: input.nowMs,
    graceMs: input.graceMs ?? DEFAULT_FEEDBACK_GRACE_MS,
  });
  return receiptFromAggregate(input.candidateSha256, aggregate, {
    origin: 'explicit-human',
    classifier: null,
    generationEventSha256: generation.eventSha256,
    eventSha256s: aggregate.evidenceMessageIds,
  });
}

function classifiedFeedbackReceipt({ candidateSha256, classified }) {
  const metadata = classified?.classification;
  if (metadata?.source !== 'llm'
      || metadata.userAuthoredEvidence !== true
      || !isHash(metadata.requestSha256)
      || !isHash(metadata.responseSha256)
      || !isHash(metadata.generationEventSha256)
      || !Array.isArray(metadata.evidenceEventSha256s)
      || metadata.evidenceEventSha256s.length === 0) {
    return null;
  }
  return receiptFromAggregate(candidateSha256, classified, {
    origin: 'human-dialogue-classified',
    classifier: {
      provider: metadata.provider,
      model: metadata.model,
      requestSha256: metadata.requestSha256,
      responseSha256: metadata.responseSha256,
    },
    generationEventSha256: metadata.generationEventSha256,
    eventSha256s: metadata.evidenceEventSha256s,
  });
}

function receiptFromAggregate(candidateSha256, aggregate, metadata) {
  return createFeedbackReceipt({
    candidateSha256,
    generationEventSha256: metadata.generationEventSha256,
    origin: metadata.origin,
    signal: aggregate.signal,
    state: aggregate.state,
    counts: aggregate.counts,
    eventSha256s: metadata.eventSha256s,
    grace: aggregate.grace,
    classifier: metadata.classifier,
  });
}

function requireGenerationAnchor(dialogue, generatedMessageId, generatedAtMs) {
  if (typeof generatedMessageId !== 'string' || generatedMessageId.length < 1) {
    throw new TypeError('generatedMessageId is required for human feedback');
  }
  const generation = dialogue.find((message) => message.id === generatedMessageId);
  if (!generation || generation.role !== 'assistant') {
    throw new TypeError('generatedMessageId must reference an assistant dialogue event');
  }
  if (generation.atMs !== generatedAtMs) {
    throw new TypeError('generatedAtMs must match the generated assistant dialogue event');
  }
  return generation;
}

function prepareCandidate(discovery, value = {}) {
  const evidenceSha256 = requireHash(value.evidenceSha256, 'candidate.evidenceSha256');
  const existing = discovery.entries.find((entry) => entry.kind === value.kind);
  if (value.moduleSource === undefined) {
    if (!existing) throw new Error('Candidate class is neither discovered nor supplied as staged source');
    const alreadyPublic = discovery.publicEntries?.some((entry) => (
      entry.kind === existing.kind
      && entry.source === existing.source
      && entry.export === existing.export
    ));
    if (!alreadyPublic) {
      throw new Error('Unpromoted classes must enter through transient staged source');
    }
    const module = discovery.modules.find((item) => item.file === existing.source);
    const identity = {
      kind: existing.kind,
      type: existing.type,
      source: existing.source,
      export: existing.export,
      moduleSha256: sha256(module.source),
    };
    const dependencyClosureSha256 = buildDependencyClosure(
      discovery,
      existing.source,
    ).closureSha256;
    return {
      candidate: candidateMetadata(identity, evidenceSha256, dependencyClosureSha256),
      discovery,
      staged: null,
    };
  }

  const staged = parseStagedCandidate(value);
  if (existing && (
    existing.type !== staged.entry.type
    || existing.source !== staged.entry.source
    || existing.export !== staged.entry.export
  )) {
    throw new Error('Staged revision cannot change the public class identity');
  }
  if (existing) {
    const currentModule = discovery.modules.find((item) => item.file === existing.source);
    staged.previousModuleSha256 = sha256(currentModule.source);
  }
  const virtualDiscovery = {
    ...discovery,
    modules: [
      ...discovery.modules.filter((module) => module.file !== staged.module.file),
      staged.module,
    ],
    entries: [
      ...discovery.entries.filter((entry) => entry.kind !== staged.entry.kind),
      staged.entry,
    ],
  };
  assertValidLibrary(verifyDiscovery(virtualDiscovery));
  const identity = {
    kind: staged.entry.kind,
    type: staged.entry.type,
    source: staged.entry.source,
    export: staged.entry.export,
    moduleSha256: sha256(staged.module.source),
  };
  const dependencyClosureSha256 = buildDependencyClosure(
    virtualDiscovery,
    staged.entry.source,
  ).closureSha256;
  return {
    candidate: candidateMetadata(identity, evidenceSha256, dependencyClosureSha256),
    discovery: virtualDiscovery,
    staged,
  };
}

function parseStagedCandidate(value) {
  const source = safeTargetSource(value.source, value.type);
  if (typeof value.moduleSource !== 'string' || value.moduleSource.length < 1) {
    throw new TypeError('candidate.moduleSource must contain ESM source');
  }
  const ast = parseModule(value.moduleSource, source);
  const classes = findExportedClasses(ast).filter((entry) => readOwnStaticKind(entry.node) === value.kind);
  if (classes.length !== 1) throw new Error('Staged module must export exactly one matching concrete class');
  const exported = classes[0];
  if (exported.exportName !== value.export) throw new Error('Staged export does not match candidate.export');
  const entry = {
    type: value.type,
    kind: value.kind,
    export: exported.exportName,
    className: exported.className,
    hasSuperClass: Boolean(exported.node.superClass),
    superClass: propertyName(exported.node.superClass),
    source,
    loc: exported.node.loc?.start ?? null,
  };
  const module = {
    file: source,
    filename: source,
    source: value.moduleSource,
    ast,
    type: value.type,
    imports: collectStaticSpecifiers(ast),
  };
  return { entry, module, moduleSource: value.moduleSource };
}

function candidateMetadata(identity, evidenceSha256, dependencyClosureSha256) {
  return {
    kind: identity.kind,
    candidateSha256: candidateRevisionSha256({
      ...identity,
      dependencyClosureSha256,
    }),
    moduleSha256: identity.moduleSha256,
    dependencyClosureSha256,
    evidenceSha256,
  };
}

async function materializePromotion(options) {
  const ledgerFile = path.resolve(
    options.repositoryRoot,
    options.ledgerFile ?? 'promotion-ledger.json',
  );
  if (!options.staged) {
    await writePromotionLedger(options.nextLedger, ledgerFile);
    return;
  }
  const moduleFile = path.resolve(options.repositoryRoot, options.staged.entry.source);
  if (!isInside(options.repositoryRoot, moduleFile)) throw new Error('Staged module escapes repository root');
  let previousBytes = null;
  try {
    previousBytes = await fs.readFile(moduleFile, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (previousBytes !== null) {
    if (!isHash(options.staged.previousModuleSha256)
        || sha256(previousBytes) !== options.staged.previousModuleSha256) {
      throw new Error('Promotion target changed after staging');
    }
  } else if (options.staged.previousModuleSha256 !== undefined) {
    throw new Error('Promotion revision target disappeared after staging');
  }

  // Ledger-first is fail-closed: an interruption can block index generation,
  // but can never expose an unapproved wildcard-exported module.
  const transactionId = options.nextLedger.ledgerSha256.slice(0, 16);
  const temporaryFile = path.join(
    options.repositoryRoot,
    'staging',
    'promotion-transactions',
    `${transactionId}.module.tmp`,
  );
  const backupFile = `${moduleFile}.promotion-${transactionId}.bak`;
  await fs.mkdir(path.dirname(moduleFile), { recursive: true });
  await fs.mkdir(path.dirname(temporaryFile), { recursive: true });
  await fs.writeFile(temporaryFile, options.staged.moduleSource, { encoding: 'utf8', flag: 'wx' });
  try {
    await writePromotionLedger(options.nextLedger, ledgerFile);
    if (previousBytes !== null) await fs.rename(moduleFile, backupFile);
    await fs.rename(temporaryFile, moduleFile);
    if (previousBytes !== null) await fs.rm(backupFile);
  } catch (error) {
    if (previousBytes !== null && await fileExists(backupFile)) {
      if (await fileExists(moduleFile)) await fs.rm(moduleFile);
      await fs.rename(backupFile, moduleFile);
    }
    if (await fileExists(temporaryFile)) await fs.rm(temporaryFile);
    await writePromotionLedger(options.currentLedger, ledgerFile);
    throw error;
  }
}

function normalizeDialogue(value) {
  if (!Array.isArray(value) || value.length > 200) throw new TypeError('dialogue must be an array');
  const seen = new Set();
  return value.map((message, index) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw new TypeError(`dialogue[${index}] must be an object`);
    }
    if (typeof message.id !== 'string' || message.id.length < 1 || message.id.length > 120) {
      throw new TypeError(`dialogue[${index}].id is invalid`);
    }
    if (seen.has(message.id)) throw new TypeError(`duplicate dialogue id: ${message.id}`);
    seen.add(message.id);
    if (!['assistant', 'user'].includes(message.role)) throw new TypeError('dialogue role is invalid');
    if (!Number.isSafeInteger(message.atMs) || message.atMs < 0) throw new TypeError('dialogue timestamp is invalid');
    if (typeof message.content !== 'string' || message.content.length < 1 || message.content.length > 20_000) {
      throw new TypeError('dialogue content is invalid');
    }
    return {
      id: message.id,
      role: message.role,
      atMs: message.atMs,
      content: message.content,
      eventSha256: hashDialogueEvent(message),
    };
  });
}

function normalizeCounts(value) {
  return Object.fromEntries(['negative', 'positive', 'neutral', 'ambiguous'].map((signal) => {
    const count = value?.[signal];
    if (!Number.isSafeInteger(count) || count < 0) throw new TypeError('feedback counts are invalid');
    return [signal, count];
  }));
}

function normalizeGrace(value) {
  if (!Number.isSafeInteger(value?.requiredMs) || value.requiredMs < 0
      || !Number.isSafeInteger(value?.remainingMs) || value.remainingMs < 0) {
    throw new TypeError('feedback grace receipt is invalid');
  }
  return { requiredMs: value.requiredMs, remainingMs: value.remainingMs };
}

function promotionGraceMs(value) {
  const graceMs = value ?? DEFAULT_FEEDBACK_GRACE_MS;
  if (!Number.isSafeInteger(graceMs) || graceMs < MINIMUM_FEEDBACK_GRACE_MS) {
    throw new TypeError(`promotion grace must be at least ${MINIMUM_FEEDBACK_GRACE_MS}ms`);
  }
  return graceMs;
}

function normalizeClassifier(value) {
  return {
    provider: safeLabel(value?.provider),
    model: safeLabel(value?.model),
    requestSha256: requireHash(value?.requestSha256, 'classifier.requestSha256'),
    responseSha256: requireHash(value?.responseSha256, 'classifier.responseSha256'),
  };
}

function normalizeHashes(value, name) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new TypeError(`${name} must contain 1 through 20 hashes`);
  }
  const hashes = [...new Set(value.map((entry) => requireHash(entry, name)))].sort();
  if (hashes.length !== value.length) throw new TypeError(`${name} must be unique`);
  return hashes;
}

function safeTargetSource(value, type) {
  if (typeof value !== 'string' || value.includes('\\') || path.posix.isAbsolute(value)) {
    throw new TypeError('candidate.source must be a safe relative module path');
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new TypeError('candidate.source contains unsafe traversal');
  }
  if (segments[0] !== (type === 'unit' ? 'units' : 'behaviours') || !value.endsWith('.js')) {
    throw new TypeError('candidate.source does not match candidate.type');
  }
  return value;
}

function safeLabel(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/u.test(value)) {
    throw new TypeError('classifier label is invalid');
  }
  return value;
}

function isInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function fileExists(filename) {
  try {
    await fs.access(filename);
    return true;
  } catch {
    return false;
  }
}

function isHash(value) {
  return typeof value === 'string' && HASH.test(value);
}

function requireHash(value, name) {
  if (!isHash(value)) throw new TypeError(`${name} must be a lowercase SHA-256`);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
