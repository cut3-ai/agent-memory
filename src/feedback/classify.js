export const DEFAULT_FEEDBACK_GRACE_MS = 30_000;
export const FEEDBACK_SIGNALS = Object.freeze(['negative', 'positive', 'neutral', 'ambiguous']);

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
 * Classify raw dialogue only when no structured signal is available. The model
 * supplies one strict signal; deterministic aggregation still owns the final
 * save/reject/quarantine decision and its grace-period semantics.
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

  const dialogue = normalizeDialogue(input.dialogue, aggregateInput.generatedAtMs ?? 0);
  if (dialogue.length === 0) {
    return quarantine(deterministic, 'no-feedback-dialogue', providerMetadata(provider));
  }

  let result;
  try {
    result = await provider.generateStructured({
      name: 'classify_feedback',
      schema: FEEDBACK_CLASSIFICATION_SCHEMA,
      system: feedbackClassifierInstruction(),
      prompt: JSON.stringify({
        generatedMessageId: optionalId(input.generatedMessageId),
        dialogue,
      }),
    });
  } catch {
    return quarantine(deterministic, 'classifier-error', providerMetadata(provider));
  }

  let classified;
  try {
    classified = validateClassification(result?.data, dialogue);
  } catch {
    return quarantine(deterministic, 'invalid-classifier-output', providerMetadata(provider, result));
  }

  const messages = new Map(dialogue.map((message) => [message.id, message]));
  const atMs = Math.max(...classified.evidenceMessageIds.map((id) => messages.get(id).atMs));
  const aggregated = aggregateFeedbackSignals({
    ...aggregateInput,
    signals: [{
      kind: classified.signal,
      atMs,
      messageIds: classified.evidenceMessageIds,
    }],
  });
  return withClassification(aggregated, providerMetadata(provider, result));
}

export const classifyFeedback = classifyDialogueFeedback;

export function feedbackClassifierInstruction() {
  return [
    'Classify only the user reaction to the generated edit or code.',
    'Use negative for rejection, correction, redo requests, regressions, or dissatisfaction.',
    'Use positive for explicit approval or satisfaction.',
    'Use neutral when the user continues without an objection or changes topic.',
    'Use ambiguous for mixed, uncertain, or insufficient evidence.',
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

function normalizeDialogue(value, generatedAtMs) {
  if (!Array.isArray(value) || value.length > 200) {
    throw new TypeError('dialogue must be an array of at most 200 messages');
  }
  const seen = new Set();
  return value.map((message, index) => {
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
    return Object.freeze({ id: messageId, role: message.role, atMs, content });
  }).filter((message) => message.atMs >= generatedAtMs);
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
  const messages = new Map(dialogue.map((message) => [message.id, message]));
  const evidenceMessageIds = [...new Set(value.evidenceMessageIds.map((entry) => id(entry, 'evidence id')))];
  if (evidenceMessageIds.length !== value.evidenceMessageIds.length) {
    throw new Error('Classifier evidence ids must be unique');
  }
  for (const messageId of evidenceMessageIds) {
    if (messages.get(messageId)?.role !== 'user') {
      throw new Error('Classifier evidence must reference a user message');
    }
  }
  return Object.freeze({ signal: value.signal, evidenceMessageIds: Object.freeze(evidenceMessageIds.sort()) });
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

function providerMetadata(provider, result) {
  const metadata = {
    source: 'llm',
    provider: safeLabel(result?.provider ?? provider?.provider),
    model: safeLabel(result?.model ?? provider?.model),
  };
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

function optionalId(value) {
  return value === undefined ? null : id(value, 'generatedMessageId');
}

function boundedContent(value, index) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 20_000) {
    throw new RangeError(`dialogue[${index}].content must contain 1 through 20000 characters`);
  }
  return value;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
