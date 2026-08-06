import {
  aggregateFeedbackSignals,
  DEFAULT_FEEDBACK_GRACE_MS,
  hashDialogueEvent,
} from '../../feedback/classify.js';
import { verifyRevisionOutcomeReceipt } from '../../feedback/outcome.js';
import { sha256, stableStringify } from '../../lib.js';
import { MINIMUM_FEEDBACK_GRACE_MS } from '../feedback.js';
import { assertPublicArtifact } from '../privacy/artifact.js';

const HASH = /^[a-f0-9]{64}$/u;

/** Bind one pure online outcome to a candidate without exposing event payloads. */
export function createStructuredFeedbackReceipt({ candidateSha256, outcome }) {
  if (!verifyRevisionOutcomeReceipt(outcome)) {
    throw new TypeError('outcome must be a valid hash-sealed revision receipt');
  }
  if (!['negative', 'positive', 'neutral', 'ambiguous'].includes(outcome.feedback.signal)
      || outcome.feedback.eventSha256s.length === 0) {
    return null;
  }
  const state = outcome.feedback.signal === 'negative'
    ? 'reject'
    : outcome.state === 'candidate'
      ? 'candidate'
      : outcome.state === 'pending'
        ? 'pending'
        : 'quarantine';
  return createFeedbackReceipt({
    candidateSha256,
    revisionSha256: outcome.revisionSha256,
    generationEventSha256: outcome.generationEventSha256,
    validationReceiptSha256: outcome.validation.receiptSha256,
    origin: 'workspace-outcome',
    signal: outcome.feedback.signal,
    state,
    counts: outcome.feedback.counts,
    eventSha256s: outcome.feedback.eventSha256s,
    grace: outcome.grace,
    classifier: null,
  });
}

export function explicitFeedbackReceipt(input) {
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
    eventSha256s: aggregate.evidenceMessageIds,
    bindings: input.bindings,
  });
}

export function classifiedFeedbackReceipt({ candidateSha256, classified, bindings }) {
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
    eventSha256s: metadata.evidenceEventSha256s,
    bindings,
  });
}

export function feedbackBindings({ input, outcome, dialogue, prepared }) {
  if (outcome) {
    return Object.freeze({
      revisionSha256: requireHash(outcome.revisionSha256, 'outcome.revisionSha256'),
      generationEventSha256: requireHash(
        outcome.generationEventSha256,
        'outcome.generationEventSha256',
      ),
      validationReceiptSha256: outcome.validation.receiptSha256,
    });
  }
  let generationEventSha256 = null;
  if (typeof input.generatedMessageId === 'string') {
    generationEventSha256 = requireGenerationAnchor(
      dialogue,
      input.generatedMessageId,
      input.generatedAtMs,
    ).eventSha256;
  }
  return Object.freeze({
    revisionSha256: input.revisionSha256 === undefined
      ? prepared.candidate.outcomeRevisionSha256
      : requireHash(input.revisionSha256, 'revisionSha256'),
    generationEventSha256,
    validationReceiptSha256: null,
  });
}

export function combineFeedbackReceipts(left, right) {
  for (const name of [
    'candidateSha256',
    'revisionSha256',
    'generationEventSha256',
    'validationReceiptSha256',
  ]) {
    if (left[name] !== right[name]) throw new TypeError(`feedback receipts disagree on ${name}`);
  }
  const counts = Object.fromEntries(['negative', 'positive', 'neutral', 'ambiguous'].map((signal) => [
    signal,
    left.counts[signal] + right.counts[signal],
  ]));
  const signal = counts.negative > 0
    ? 'negative'
    : counts.ambiguous > 0
      ? 'ambiguous'
      : counts.positive > 0
        ? 'positive'
        : 'neutral';
  const remainingMs = Math.max(left.grace.remainingMs, right.grace.remainingMs);
  const state = signal === 'negative'
    ? 'reject'
    : signal === 'ambiguous'
      ? 'quarantine'
      : remainingMs > 0 || left.state === 'pending' || right.state === 'pending'
        ? 'pending'
        : left.validationReceiptSha256 === null
          ? 'quarantine'
          : 'candidate';
  const classified = left.origin === 'human-dialogue-classified'
    ? left
    : right.origin === 'human-dialogue-classified' ? right : null;
  const origin = classified
    ? 'human-dialogue-classified'
    : [left.origin, right.origin].includes('explicit-human')
      ? 'explicit-human'
      : 'workspace-outcome';
  return createFeedbackReceipt({
    candidateSha256: left.candidateSha256,
    revisionSha256: left.revisionSha256,
    generationEventSha256: left.generationEventSha256,
    validationReceiptSha256: left.validationReceiptSha256,
    origin,
    signal,
    state,
    counts,
    eventSha256s: [...new Set([...left.eventSha256s, ...right.eventSha256s])],
    grace: {
      requiredMs: Math.max(left.grace.requiredMs, right.grace.requiredMs),
      remainingMs,
    },
    classifier: classified?.classifier ?? null,
  });
}

export function quarantineFeedbackReceipt(receipt) {
  return createFeedbackReceipt({
    ...receipt,
    state: 'quarantine',
    classifier: receipt.classifier,
  });
}

export function normalizeDialogue(value) {
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

export function dialogueForClassification(dialogue, generatedMessageId, receipt) {
  if (!receipt || typeof generatedMessageId !== 'string') return dialogue;
  const generationIndex = dialogue.findIndex((message) => message.id === generatedMessageId);
  if (generationIndex < 0) return dialogue;
  const classified = new Set(receipt.eventSha256s);
  return dialogue.filter((message, index) => (
    index === generationIndex
    || (index > generationIndex
      && message.role === 'user'
      && !classified.has(message.eventSha256))
  ));
}

export function promotionGraceMs(value) {
  const graceMs = value ?? DEFAULT_FEEDBACK_GRACE_MS;
  if (!Number.isSafeInteger(graceMs) || graceMs < MINIMUM_FEEDBACK_GRACE_MS) {
    throw new TypeError(`promotion grace must be at least ${MINIMUM_FEEDBACK_GRACE_MS}ms`);
  }
  return graceMs;
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

/** Build the only feedback object accepted by decideMemoryPromotion. */
function createFeedbackReceipt(value) {
  if (!['workspace-outcome', 'explicit-human', 'human-dialogue-classified'].includes(value.origin)) {
    throw new TypeError('feedback receipt origin is invalid');
  }
  if (value.origin !== 'human-dialogue-classified' && value.classifier !== null) {
    throw new TypeError('non-classified feedback cannot carry classifier authority');
  }
  if (value.origin === 'human-dialogue-classified' && !value.classifier) {
    throw new TypeError('classified feedback requires classifier hashes');
  }
  const counts = normalizeCounts(value.counts);
  const resolvedSignal = resolveFeedbackCounts(counts);
  if (value.signal !== resolvedSignal) {
    throw new TypeError('feedback receipt signal violates negative-first outcome precedence');
  }
  if ((resolvedSignal === 'negative' && value.state !== 'reject')
      || (resolvedSignal === 'ambiguous' && value.state !== 'quarantine')
      || (['positive', 'neutral'].includes(resolvedSignal)
        && !['pending', 'candidate', 'quarantine'].includes(value.state))) {
    throw new TypeError('feedback receipt state is inconsistent with its resolved outcome');
  }
  const body = {
    schemaVersion: 3,
    candidateSha256: requireHash(value.candidateSha256, 'candidateSha256'),
    revisionSha256: requireHash(value.revisionSha256, 'revisionSha256'),
    generationEventSha256: requireHash(
      value.generationEventSha256,
      'generationEventSha256',
    ),
    validationReceiptSha256: value.validationReceiptSha256 === null
      ? null
      : requireHash(value.validationReceiptSha256, 'validationReceiptSha256'),
    origin: value.origin,
    signal: value.signal,
    state: value.state,
    counts,
    eventSha256s: normalizeHashes(value.eventSha256s, 'eventSha256s'),
    grace: normalizeGrace(value.grace),
    classifier: value.classifier === null ? null : normalizeClassifier(value.classifier),
  };
  const receipt = { ...body, receiptSha256: sha256(stableStringify(body)) };
  assertPublicArtifact(receipt);
  return deepFreeze(receipt);
}

function receiptFromAggregate(candidateSha256, aggregate, metadata) {
  const validationReceiptSha256 = metadata.bindings.validationReceiptSha256;
  const state = aggregate.signal === 'negative'
    ? 'reject'
    : aggregate.state === 'candidate' && validationReceiptSha256 === null
      ? 'quarantine'
      : aggregate.state;
  return createFeedbackReceipt({
    candidateSha256,
    revisionSha256: metadata.bindings.revisionSha256,
    generationEventSha256: metadata.bindings.generationEventSha256,
    validationReceiptSha256,
    origin: metadata.origin,
    signal: aggregate.signal,
    state,
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

function normalizeCounts(value) {
  return Object.fromEntries(['negative', 'positive', 'neutral', 'ambiguous'].map((signal) => {
    const count = value?.[signal];
    if (!Number.isSafeInteger(count) || count < 0) throw new TypeError('feedback counts are invalid');
    return [signal, count];
  }));
}

function resolveFeedbackCounts(counts) {
  if (counts.negative > 0) return 'negative';
  if (counts.ambiguous > 0) return 'ambiguous';
  if (counts.positive > 0) return 'positive';
  if (counts.neutral > 0) return 'neutral';
  throw new TypeError('feedback counts require a qualified outcome');
}

function normalizeGrace(value) {
  if (!Number.isSafeInteger(value?.requiredMs) || value.requiredMs < 0
      || !Number.isSafeInteger(value?.remainingMs) || value.remainingMs < 0) {
    throw new TypeError('feedback grace receipt is invalid');
  }
  return { requiredMs: value.requiredMs, remainingMs: value.remainingMs };
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

function safeLabel(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/u.test(value)) {
    throw new TypeError('classifier label is invalid');
  }
  return value;
}

function isHash(value) {
  return typeof value === 'string' && HASH.test(value);
}

function requireHash(value, name) {
  if (!isHash(value)) throw new TypeError(`${name} must be a lowercase SHA-256`);
  return value;
}
