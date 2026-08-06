import { sha256, stableStringify } from '../lib.js';

export const DEFAULT_FEEDBACK_GRACE_MS = 30_000;
export const DEFAULT_FEEDBACK_WINDOW_MS = 10 * 60_000;
export const MAXIMUM_FEEDBACK_WINDOW_MS = 60 * 60_000;
export const MAXIMUM_PROVIDER_FEEDBACK_MESSAGES = 20;
export const MAXIMUM_PROVIDER_FEEDBACK_CHARACTERS = 8_000;
export const FEEDBACK_SIGNALS = Object.freeze(['negative', 'positive', 'neutral', 'ambiguous']);

const PROVIDER_SECRET_TOKEN = /(?<![A-Z0-9_])(?:sk-(?:ant-)?[A-Z0-9_-]{8,}|gh[pousr]_[A-Z0-9]{20,}|github_pat_[A-Z0-9_]{20,})(?![A-Z0-9_])/giu;
const PROVIDER_SECRET_ASSIGNMENT = /(?<![A-Z0-9_])([A-Z_][A-Z0-9_.-]{0,100})(\s*[:=]\s*)(?:"[^"\r\n]{12,}"|'[^'\r\n]{12,}'|[^\s,;]{12,})/giu;
const SECRET_KEY_NAME = /(?:^|[_.-])(?:API_KEY|KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)(?:$|[_.-])/u;

export const FEEDBACK_CLASSIFICATION_SCHEMA = deepFreeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    signal: { enum: FEEDBACK_SIGNALS },
    evidenceMessageIds: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      uniqueItems: true,
      items: { type: 'string', minLength: 1, maxLength: 120 },
    },
  },
  required: ['signal', 'evidenceMessageIds'],
});

/**
 * Aggregate already-classified feedback events. The function has no clock and
 * no I/O: callers must pass nowMs explicitly, making a decision reproducible.
 */
export function aggregateFeedbackSignals(signalsOrInput, options = {}) {
  const input = Array.isArray(signalsOrInput)
    ? { ...options, signals: signalsOrInput }
    : { ...(signalsOrInput ?? {}), ...options };
  const generatedAtMs = timestamp(input.generatedAtMs ?? 0, 'generatedAtMs');
  const nowMs = timestamp(input.nowMs, 'nowMs');
  const graceMs = duration(input.graceMs ?? DEFAULT_FEEDBACK_GRACE_MS, 'graceMs');
  if (nowMs < generatedAtMs) throw new RangeError('nowMs cannot precede generatedAtMs');
  if (!Array.isArray(input.signals)) throw new TypeError('signals must be an array');

  const signals = input.signals
    .map((signal, index) => normalizeSignal(signal, index))
    .filter((signal) => signal.atMs >= generatedAtMs)
    .sort(compareSignals);
  for (const signal of signals) {
    if (signal.atMs > nowMs) throw new RangeError('Feedback signal cannot be in the future');
  }

  const counts = Object.freeze(Object.fromEntries(
    FEEDBACK_SIGNALS.map((kind) => [kind, signals.filter((signal) => signal.kind === kind).length]),
  ));
  const evidenceMessageIds = Object.freeze([...new Set(
    signals.flatMap((signal) => signal.messageIds),
  )].sort());

  if (counts.negative > 0) {
    return decision({
      state: 'reject',
      signal: 'negative',
      reason: 'negative-signal',
      counts,
      evidenceMessageIds,
      graceMs,
      remainingMs: 0,
    });
  }

  if (counts.ambiguous > 0) {
    return decision({
      state: 'quarantine',
      signal: 'ambiguous',
      reason: 'ambiguous-signal',
      counts,
      evidenceMessageIds,
      graceMs,
      remainingMs: 0,
    });
  }

  const acceptedSignals = signals.filter(({ kind }) => kind === 'positive' || kind === 'neutral');
  if (acceptedSignals.length === 0) {
    return decision({
      state: 'quarantine',
      signal: 'ambiguous',
      reason: 'no-classified-signal',
      counts,
      evidenceMessageIds,
      graceMs,
      remainingMs: 0,
    });
  }

  const graceAnchorMs = Math.max(generatedAtMs, ...acceptedSignals.map(({ atMs }) => atMs));
  const remainingMs = Math.max(0, graceMs - (nowMs - graceAnchorMs));
  const signal = counts.positive > 0 ? 'positive' : 'neutral';
  return decision({
    state: remainingMs === 0 ? 'candidate' : 'pending',
    signal,
    reason: remainingMs === 0 ? `${signal}-after-grace` : 'grace-period',
    counts,
    evidenceMessageIds,
    graceMs,
    remainingMs,
  });
}

/**
 * Classify dialogue only when no structured signal is available. The provider
 * receives a bounded, redacted window of user-authored messages strictly after
 * generation; assistant content, URLs, and code never enter its request.
 * Deterministic aggregation still owns save/reject/quarantine semantics.
 */
export async function classifyDialogueFeedback(input = {}, options = {}) {
  const signals = input.signals ?? [];
  const aggregateInput = {
    signals,
    generatedAtMs: input.generatedAtMs,
    nowMs: input.nowMs,
    graceMs: input.graceMs,
  };
  const deterministic = aggregateFeedbackSignals(aggregateInput);
  if (deterministic.reason !== 'no-classified-signal') return deterministic;

  const provider = options.provider ?? input.provider;
  if (!provider) return deterministic;
  if (typeof provider.generateStructured !== 'function') {
    throw new TypeError('Feedback provider must implement generateStructured');
  }

  const feedbackWindowMs = boundedFeedbackWindow(input.feedbackWindowMs);
  const minimized = minimizeDialogueForProvider(
    input.dialogue,
    input.generatedMessageId,
    aggregateInput.generatedAtMs ?? 0,
    aggregateInput.nowMs,
    feedbackWindowMs,
  );
  const dialogue = minimized.messages;
  if (dialogue.length === 0) {
    return quarantine(deterministic, 'no-feedback-dialogue', providerMetadata(provider, undefined, {
      externalProviderInput: { ...minimized.metadata, sent: false },
    }));
  }

  const providerRequest = {
    name: 'classify_feedback',
    schema: FEEDBACK_CLASSIFICATION_SCHEMA,
    system: feedbackClassifierInstruction(),
    prompt: JSON.stringify({
      userMessages: dialogue.map(({ providerId: id, atMs, content }) => ({ id, atMs, content })),
    }),
  };
  const externalProviderInput = { ...minimized.metadata, sent: true };
  let result;
  try {
    result = await provider.generateStructured(providerRequest);
  } catch {
    return quarantine(deterministic, 'classifier-error', providerMetadata(provider, undefined, {
      externalProviderInput,
    }));
  }

  let classified;
  try {
    classified = validateClassification(result?.data, dialogue);
  } catch {
    return quarantine(deterministic, 'invalid-classifier-output', providerMetadata(provider, result, {
      externalProviderInput,
    }));
  }

  const messages = new Map(dialogue.map((message) => [message.id, message]));
  const atMs = Math.max(...classified.evidenceMessageIds.map((id) => messages.get(id).atMs));
  const neutralRetainedRevision = classified.signal !== 'neutral'
    || (isHash(input.revisionSha256)
      && input.retainedRevisionSha256 === input.revisionSha256);
  const classifiedSignal = neutralRetainedRevision ? classified.signal : 'ambiguous';
  const aggregated = aggregateFeedbackSignals({
    ...aggregateInput,
    signals: [{
      kind: classifiedSignal,
      atMs,
      messageIds: classified.evidenceMessageIds,
    }],
  });
  const resolved = classifiedSignal === classified.signal
    ? aggregated
    : { ...aggregated, reason: 'neutral-requires-retained-revision' };
  return withClassification(resolved, providerMetadata(provider, result, {
    requestSha256: sha256(stableStringify(providerRequest)),
    responseSha256: sha256(stableStringify(result.data)),
    evidenceEventSha256s: classified.evidenceEventSha256s,
    generationEventSha256: minimized.generationEventSha256,
    userAuthoredEvidence: true,
    externalProviderInput,
  }));
}

export const classifyFeedback = classifyDialogueFeedback;

export function feedbackClassifierInstruction() {
  return [
    'Classify only the user reaction to the generated edit or code.',
    'Use negative for rejection, correction, redo requests, regressions, or dissatisfaction.',
    'Use positive only for explicit approval or satisfaction.',
    'Use neutral only when the user explicitly says that the generated revision is retained or used unchanged.',
    'A topic change, continuation, silence, timeout, preview, autosave, or absence of an objection is not neutral feedback; classify it as ambiguous.',
    'Use ambiguous for mixed, uncertain, or insufficient evidence.',
    'Every supplied message is a redacted, post-generation user message.',
    'Return only the required structured object and cite only user message ids.',
  ].join(' ');
}

function normalizeSignal(value, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Feedback signal ${index} must be an object`);
  }
  const kind = value.kind ?? value.signal;
  if (!FEEDBACK_SIGNALS.includes(kind)) {
    throw new RangeError(`Feedback signal ${index} has an unsupported kind`);
  }
  return Object.freeze({
    kind,
    atMs: timestamp(value.atMs, `signals[${index}].atMs`),
    messageIds: normalizeSignalMessageIds(value, index),
    index,
  });
}

function normalizeSignalMessageIds(value, index) {
  if (value.messageIds !== undefined) {
    if (!Array.isArray(value.messageIds) || value.messageIds.length > 20) {
      throw new RangeError(`signals[${index}].messageIds must contain at most 20 ids`);
    }
    const ids = [...new Set(
      value.messageIds.map((entry) => id(entry, `signals[${index}].messageIds`)),
    )];
    if (ids.length !== value.messageIds.length) {
      throw new Error(`signals[${index}].messageIds must be unique`);
    }
    return Object.freeze(ids.sort());
  }
  return Object.freeze(value.messageId === undefined
    ? []
    : [id(value.messageId, `signals[${index}].messageId`)]);
}

function minimizeDialogueForProvider(
  value,
  generatedMessageId,
  generatedAtMs,
  nowMs,
  feedbackWindowMs,
) {
  if (!Array.isArray(value) || value.length > 200) {
    throw new TypeError('dialogue must be an array of at most 200 messages');
  }
  const seen = new Set();
  const normalized = value.map((message, index) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw new TypeError(`Dialogue message ${index} must be an object`);
    }
    const messageId = id(message.id, `dialogue[${index}].id`);
    if (seen.has(messageId)) throw new Error(`Duplicate dialogue message id: ${messageId}`);
    seen.add(messageId);
    if (!['assistant', 'user'].includes(message.role)) {
      throw new RangeError(`Dialogue message ${index} has an unsupported role`);
    }
    const atMs = timestamp(message.atMs, `dialogue[${index}].atMs`);
    const content = boundedContent(message.content, index);
    return {
      id: messageId,
      role: message.role,
      atMs,
      content,
      index,
      eventSha256: hashDialogueEvent({ id: messageId, role: message.role, atMs, content }),
    };
  });

  const anchorId = id(generatedMessageId, 'generatedMessageId');
  const generation = normalized.find((message) => message.id === anchorId);
  if (!generation || generation.role !== 'assistant') {
    throw new TypeError('generatedMessageId must reference an assistant dialogue event');
  }
  if (generation.atMs !== generatedAtMs) {
    throw new TypeError('generatedAtMs must match the generated assistant dialogue event');
  }

  const upperBound = generation.atMs > Number.MAX_SAFE_INTEGER - feedbackWindowMs
    ? Number.MAX_SAFE_INTEGER
    : generation.atMs + feedbackWindowMs;
  const eligible = normalized
    .filter((message) => message.role === 'user'
      && message.index > generation.index
      && message.atMs > generation.atMs
      && message.atMs <= nowMs
      && message.atMs <= upperBound)
    .sort((left, right) => left.atMs - right.atMs || left.id.localeCompare(right.id))
    .slice(-MAXIMUM_PROVIDER_FEEDBACK_MESSAGES);

  let remainingCharacters = MAXIMUM_PROVIDER_FEEDBACK_CHARACTERS;
  let urlsRedacted = false;
  let codeRedacted = false;
  const selected = [];
  for (const message of [...eligible].reverse()) {
    if (remainingCharacters === 0) break;
    const sanitized = redactProviderContent(message.content);
    urlsRedacted ||= sanitized.urlsRedacted;
    codeRedacted ||= sanitized.codeRedacted;
    const content = sanitized.content.slice(0, Math.min(2_000, remainingCharacters));
    if (!content) continue;
    remainingCharacters -= content.length;
    selected.push(Object.freeze({ ...message, content }));
  }
  selected.reverse();
  const providerMessages = selected.map((message, index) => Object.freeze({
    ...message,
    providerId: `feedback-${String(index + 1).padStart(2, '0')}`,
  }));
  const charactersSent = providerMessages.reduce((sum, message) => sum + message.content.length, 0);
  return Object.freeze({
    messages: Object.freeze(providerMessages),
    generationEventSha256: generation.eventSha256,
    metadata: Object.freeze({
      policyVersion: 'feedback-provider-minimization-v1',
      generationBound: true,
      userMessagesOnly: true,
      strictlyAfterGeneratedAtOnly: true,
      boundedFeedbackWindow: true,
      feedbackWindowMs,
      maximumMessages: MAXIMUM_PROVIDER_FEEDBACK_MESSAGES,
      maximumCharacters: MAXIMUM_PROVIDER_FEEDBACK_CHARACTERS,
      messagesSent: providerMessages.length,
      charactersSent,
      opaqueMessageIds: true,
      urlsRedacted,
      codeBlocksRedacted: codeRedacted,
    }),
  });
}

function redactProviderContent(value) {
  let content = value;
  let codeRedacted = false;
  let urlsRedacted = false;
  const redactCode = (pattern) => {
    content = content.replace(pattern, () => {
      codeRedacted = true;
      return '[code-redacted]';
    });
  };
  redactCode(/```[\s\S]*?```/gu);
  redactCode(/~~~[\s\S]*?~~~/gu);
  redactCode(/```[\s\S]*$/gu);
  redactCode(/~~~[\s\S]*$/gu);
  redactCode(/`[^`\r\n]+`/gu);
  redactCode(/(?:^|\r?\n)(?:(?: {4}|\t)[^\r\n]*(?:\r?\n|$))+/gu);
  content = content.replace(
    PROVIDER_SECRET_ASSIGNMENT,
    (match, key, separator) => (
      isSecretKeyName(key) ? `${key}${separator}[secret-redacted]` : match
    ),
  );
  content = content.replace(PROVIDER_SECRET_TOKEN, '[secret-redacted]');
  const redactNetworkIdentifier = (pattern) => {
    content = content.replace(pattern, () => {
      urlsRedacted = true;
      return '[url-redacted]';
    });
  };
  redactNetworkIdentifier(/\b[A-Z0-9._%+-]+@(?:[A-Z0-9-]+\.)*[A-Z0-9-]{2,63}\b/giu);
  redactNetworkIdentifier(/\b[A-Z][A-Z0-9+.-]{1,31}:\/\/[^\s<>()]+/giu);
  redactNetworkIdentifier(/\b(?:mailto|data|tel|urn):[^\s<>()]+/giu);
  redactNetworkIdentifier(/(?:\/\/|www\.)[^\s<>()]+/giu);
  redactNetworkIdentifier(/(?<![\p{L}\p{N}_@-])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+(?:[\p{L}]{2,63}|xn--[a-z0-9-]{2,59})(?::\d{1,5})?(?:\/[^\s<>()]*)?/giu);
  redactNetworkIdentifier(/(?<![\w@])(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:\/[^\s<>()]*)?/gu);
  redactNetworkIdentifier(/(?<![\w@])\[[0-9a-f:]+\](?::\d{1,5})?(?:\/[^\s<>()]*)?/giu);
  redactNetworkIdentifier(/(?<![\w@])localhost(?::\d{1,5})?(?:\/[^\s<>()]*)?/giu);
  content = content.replace(/(?:https?:\/\/)[^\s<>()]+/giu, () => {
    urlsRedacted = true;
    return '[url-redacted]';
  });
  return {
    content: content.trim() || '[redacted]',
    codeRedacted,
    urlsRedacted,
  };
}

function isSecretKeyName(value) {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .toUpperCase();
  return SECRET_KEY_NAME.test(normalized);
}

function validateClassification(value, dialogue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Classifier output must be an object');
  }
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'evidenceMessageIds,signal') {
    throw new Error('Classifier output contains unexpected fields');
  }
  if (!FEEDBACK_SIGNALS.includes(value.signal)) throw new RangeError('Invalid classified signal');
  if (!Array.isArray(value.evidenceMessageIds)
      || value.evidenceMessageIds.length < 1
      || value.evidenceMessageIds.length > 20) {
    throw new RangeError('Classifier evidence must contain 1 through 20 message ids');
  }
  const messages = new Map(dialogue.map((message) => [message.providerId, message]));
  const providerEvidenceIds = [...new Set(value.evidenceMessageIds.map((entry) => id(entry, 'evidence id')))];
  if (providerEvidenceIds.length !== value.evidenceMessageIds.length) {
    throw new Error('Classifier evidence ids must be unique');
  }
  for (const messageId of providerEvidenceIds) {
    if (!messages.has(messageId)) {
      throw new Error('Classifier evidence must reference a user message');
    }
  }
  const evidenceMessages = providerEvidenceIds.map((messageId) => messages.get(messageId));
  const evidenceMessageIds = evidenceMessages.map((message) => message.id);
  return Object.freeze({
    signal: value.signal,
    evidenceMessageIds: Object.freeze(evidenceMessageIds.sort()),
    evidenceEventSha256s: Object.freeze(evidenceMessages
      .map((message) => message.eventSha256)
      .sort()),
  });
}

function decision(value) {
  return Object.freeze({
    state: value.state,
    signal: value.signal,
    reason: value.reason,
    counts: value.counts,
    evidenceMessageIds: value.evidenceMessageIds,
    grace: Object.freeze({
      requiredMs: value.graceMs,
      remainingMs: value.remainingMs,
    }),
    classification: Object.freeze({ source: 'deterministic' }),
  });
}

function quarantine(base, reason, classification) {
  return Object.freeze({
    ...base,
    state: 'quarantine',
    signal: 'ambiguous',
    reason,
    classification: Object.freeze(classification),
  });
}

function withClassification(base, classification) {
  return Object.freeze({ ...base, classification: Object.freeze(classification) });
}

function providerMetadata(provider, result, evidence = {}) {
  const metadata = {
    source: 'llm',
    provider: safeLabel(result?.provider ?? provider?.provider),
    model: safeLabel(result?.model ?? provider?.model),
  };
  if (isHash(evidence.requestSha256)) metadata.requestSha256 = evidence.requestSha256;
  if (isHash(evidence.responseSha256)) metadata.responseSha256 = evidence.responseSha256;
  if (evidence.userAuthoredEvidence === true) metadata.userAuthoredEvidence = true;
  if (Array.isArray(evidence.evidenceEventSha256s)) {
    metadata.evidenceEventSha256s = Object.freeze([...evidence.evidenceEventSha256s]);
  }
  if (isHash(evidence.generationEventSha256)) {
    metadata.generationEventSha256 = evidence.generationEventSha256;
  }
  if (evidence.externalProviderInput) {
    metadata.externalProviderReceivedMinimizedContent = evidence.externalProviderInput.sent === true;
    metadata.externalProviderInput = deepFreeze({ ...evidence.externalProviderInput });
  }
  if (result?.usage) metadata.usage = sanitizeUsage(result.usage);
  if (result?.request) metadata.request = sanitizeRequest(result.request);
  return metadata;
}

function sanitizeUsage(value) {
  const inputTokens = nonNegativeInteger(value.inputTokens);
  const outputTokens = nonNegativeInteger(value.outputTokens);
  const suppliedTotal = nonNegativeInteger(value.totalTokens);
  return Object.freeze({
    inputTokens,
    outputTokens,
    cachedTokens: nonNegativeInteger(value.cachedTokens),
    cacheCreationTokens: nonNegativeInteger(value.cacheCreationTokens),
    totalTokens: suppliedTotal || inputTokens + outputTokens,
  });
}

function sanitizeRequest(value) {
  return Object.freeze({
    attempts: nonNegativeInteger(value.attempts),
    retries: nonNegativeInteger(value.retries),
    status: Number.isInteger(value.status) && value.status >= 100 && value.status <= 599
      ? value.status
      : null,
  });
}

function safeLabel(value) {
  const label = String(value ?? 'unknown');
  return /^[A-Za-z0-9._-]{1,100}$/.test(label) ? label : 'unknown';
}

function compareSignals(left, right) {
  return left.atMs - right.atMs
    || left.messageIds.join(',').localeCompare(right.messageIds.join(','))
    || left.kind.localeCompare(right.kind)
    || left.index - right.index;
}

function timestamp(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer`);
  return value;
}

function duration(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 86_400_000) {
    throw new RangeError(`${label} must be from 0 through 86400000`);
  }
  return value;
}

function id(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 120) {
    throw new RangeError(`${label} must contain 1 through 120 characters`);
  }
  return value;
}

function boundedContent(value, index) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 20_000) {
    throw new RangeError(`dialogue[${index}].content must contain 1 through 20000 characters`);
  }
  return value;
}

function boundedFeedbackWindow(value) {
  const windowMs = value ?? DEFAULT_FEEDBACK_WINDOW_MS;
  if (!Number.isSafeInteger(windowMs) || windowMs < 1 || windowMs > MAXIMUM_FEEDBACK_WINDOW_MS) {
    throw new RangeError(`feedbackWindowMs must be from 1 through ${MAXIMUM_FEEDBACK_WINDOW_MS}`);
  }
  return windowMs;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function hashDialogueEvent(message) {
  return sha256(stableStringify({
    id: message.id,
    role: message.role,
    atMs: message.atMs,
    content: message.content,
  }));
}

function isHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
