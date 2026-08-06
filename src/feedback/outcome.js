import { sha256, stableStringify } from '../lib.js';

export const REVISION_OUTCOME_POLICY_VERSION = 'revision-outcome-v1';
export const REVISION_OUTCOME_EVENT_SCHEMA_VERSION = 1;
export const DEFAULT_OUTCOME_GRACE_MS = 30_000;
export const DEFAULT_OUTCOME_WINDOW_MS = 10 * 60_000;
export const MAXIMUM_OUTCOME_WINDOW_MS = 60 * 60_000;
export const MAXIMUM_OUTCOME_EVENTS = 200;

export const REVISION_OUTCOME_EVENT_TYPES = Object.freeze([
  'generation',
  'validation',
  'workspace-action',
]);

export const REVISION_OUTCOME_ACTIONS = Object.freeze({
  accepted: 'positive',
  reused: 'positive',
  exported: 'neutral',
  'continued-unchanged': 'neutral',
  corrected: 'negative',
  regenerated: 'negative',
  reverted: 'negative',
  deleted: 'negative',
  'manual-edit': 'negative',
  ambiguous: 'ambiguous',
  // These are observations, not approval. In particular, a topic change must
  // never turn silence into neutral feedback.
  'topic-changed': null,
  previewed: null,
  autosaved: null,
  'session-closed': null,
});

const HASH = /^[a-f0-9]{64}$/u;
const SIGNALS = Object.freeze(['negative', 'positive', 'neutral', 'ambiguous']);
const VALIDATION_STAGES = Object.freeze(['compile', 'render']);
const VALIDATION_STATUSES = Object.freeze(['passed', 'failed']);

/**
 * Reduce append-only events for one immutable generated revision.
 *
 * The reducer is pure: the caller supplies the clock, and the returned receipt
 * is a deterministic, hash-sealed projection. Event input contains no source,
 * prompt, dialogue, URL, or workspace identifier.
 */
export function reduceRevisionOutcome(eventsOrInput, options = {}) {
  const input = Array.isArray(eventsOrInput)
    ? { ...options, events: eventsOrInput }
    : { ...(eventsOrInput ?? {}), ...options };
  const nowMs = timestamp(input.nowMs, 'nowMs');
  const graceMs = duration(
    input.graceMs ?? input.feedbackGraceMs ?? DEFAULT_OUTCOME_GRACE_MS,
    'graceMs',
  );
  const feedbackWindowMs = feedbackWindow(
    input.feedbackWindowMs ?? DEFAULT_OUTCOME_WINDOW_MS,
  );
  if (!Array.isArray(input.events) || input.events.length > MAXIMUM_OUTCOME_EVENTS) {
    throw new TypeError(`events must be an array of at most ${MAXIMUM_OUTCOME_EVENTS} events`);
  }

  const normalized = deduplicate(input.events.map(normalizeEvent));
  for (const event of normalized) {
    if (event.atMs > nowMs) throw new RangeError('Outcome event cannot be in the future');
  }
  const expectedRevisionSha256 = input.revisionSha256 === undefined
    ? null
    : requireHash(input.revisionSha256, 'revisionSha256');
  const revisions = [...new Set(normalized.map(({ revisionSha256 }) => revisionSha256))].sort();
  const revisionSha256 = expectedRevisionSha256 ?? (revisions.length === 1 ? revisions[0] : null);

  if (revisionSha256 === null
      || revisions.some((revision) => revision !== revisionSha256)) {
    return outcomeReceipt({
      revisionSha256,
      generatedAtMs: null,
      generationEventSha256: null,
      validation: emptyValidation(),
      state: 'quarantine',
      signal: 'unknown',
      reason: 'revision-scope-mismatch',
      counts: emptyCounts(),
      evidenceEventSha256s: [],
      graceMs,
      remainingMs: 0,
      dueAtMs: null,
      providerEligible: false,
    });
  }

  const scoped = normalized.filter((event) => event.revisionSha256 === revisionSha256);
  const generations = scoped.filter(({ type }) => type === 'generation');
  if (generations.length !== 1) {
    return outcomeReceipt({
      revisionSha256,
      generatedAtMs: null,
      generationEventSha256: null,
      validation: emptyValidation(),
      state: 'quarantine',
      signal: 'unknown',
      reason: generations.length === 0 ? 'generation-missing' : 'generation-conflict',
      counts: emptyCounts(),
      evidenceEventSha256s: [],
      graceMs,
      remainingMs: 0,
      dueAtMs: null,
      providerEligible: false,
    });
  }

  const generation = generations[0];
  if (scoped.some((event) => event.type !== 'generation' && event.atMs < generation.atMs)) {
    return outcomeReceipt({
      revisionSha256,
      generatedAtMs: generation.atMs,
      generationEventSha256: generation.eventSha256,
      validation: emptyValidation(),
      state: 'quarantine',
      signal: 'unknown',
      reason: 'event-precedes-generation',
      counts: emptyCounts(),
      evidenceEventSha256s: [],
      graceMs,
      remainingMs: 0,
      dueAtMs: null,
      providerEligible: false,
    });
  }

  const validation = reduceValidation(scoped, revisionSha256);
  const workspaceEvents = scoped.filter(({ type }) => type === 'workspace-action');
  const signals = workspaceEvents
    .map((event) => ({ ...event, signal: REVISION_OUTCOME_ACTIONS[event.action] }))
    .filter(({ signal }) => signal !== null);
  const counts = Object.freeze(Object.fromEntries(SIGNALS.map((signal) => [
    signal,
    signals.filter((event) => event.signal === signal).length,
  ])));
  const evidenceEventSha256s = Object.freeze(signals.map(({ eventSha256 }) => eventSha256).sort());

  const base = {
    revisionSha256,
    generatedAtMs: generation.atMs,
    generationEventSha256: generation.eventSha256,
    validation,
    counts,
    evidenceEventSha256s,
    graceMs,
  };

  if (counts.negative > 0) {
    return outcomeReceipt({
      ...base,
      state: 'discard',
      signal: 'negative',
      reason: 'negative-outcome',
      remainingMs: 0,
      dueAtMs: null,
      providerEligible: false,
    });
  }
  if (counts.ambiguous > 0) {
    return outcomeReceipt({
      ...base,
      state: 'quarantine',
      signal: 'ambiguous',
      reason: 'ambiguous-outcome',
      remainingMs: 0,
      dueAtMs: null,
      providerEligible: false,
    });
  }

  if (validation.failedStage !== null) {
    return outcomeReceipt({
      ...base,
      state: 'discard',
      signal: counts.positive > 0 ? 'positive' : counts.neutral > 0 ? 'neutral' : 'unknown',
      reason: `${validation.failedStage}-validation-failed`,
      remainingMs: 0,
      dueAtMs: null,
      providerEligible: false,
    });
  }

  const accepted = signals.filter(({ signal }) => signal === 'positive' || signal === 'neutral');
  if (accepted.length === 0) {
    const deadlineMs = boundedAdd(generation.atMs, feedbackWindowMs);
    const waiting = nowMs < deadlineMs;
    return outcomeReceipt({
      ...base,
      state: waiting ? 'pending' : 'quarantine',
      signal: 'unknown',
      reason: waiting ? 'outcome-window' : 'no-qualified-outcome',
      remainingMs: 0,
      dueAtMs: waiting ? deadlineMs : null,
      providerEligible: validation.complete && nowMs <= deadlineMs,
    });
  }

  const signal = counts.positive > 0 ? 'positive' : 'neutral';
  const graceAnchorMs = Math.max(...accepted.map(({ atMs }) => atMs));
  const graceDueAtMs = boundedAdd(graceAnchorMs, graceMs);
  const remainingMs = Math.max(0, graceDueAtMs - nowMs);
  if (!validation.complete) {
    return outcomeReceipt({
      ...base,
      state: 'pending',
      signal,
      reason: 'compile-render-validation-pending',
      remainingMs,
      dueAtMs: remainingMs > 0 ? graceDueAtMs : null,
      providerEligible: false,
    });
  }
  if (remainingMs > 0) {
    return outcomeReceipt({
      ...base,
      state: 'pending',
      signal,
      reason: 'feedback-grace',
      remainingMs,
      dueAtMs: graceDueAtMs,
      providerEligible: false,
    });
  }
  return outcomeReceipt({
    ...base,
    state: 'candidate',
    signal,
    reason: `${signal}-after-validation-and-grace`,
    remainingMs: 0,
    dueAtMs: null,
    providerEligible: false,
  });
}

export function hashRevisionOutcomeEvent(value) {
  return sha256(stableStringify(normalizeEvent(value).body));
}

/** Return the exact privacy-safe event body accepted by the pure reducer. */
export function canonicalRevisionOutcomeEvent(value) {
  return normalizeEvent(value).body;
}

export function verifyRevisionOutcomeReceipt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!isHash(value.outcomeSha256)) return false;
  const { outcomeSha256, ...body } = value;
  return sha256(stableStringify(body)) === outcomeSha256;
}

function normalizeEvent(value, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`events[${index ?? 0}] must be an object`);
  }
  const base = {
    schemaVersion: value.schemaVersion,
    type: value.type,
    revisionSha256: requireHash(value.revisionSha256, 'event.revisionSha256'),
    atMs: timestamp(value.atMs, 'event.atMs'),
  };
  if (base.schemaVersion !== REVISION_OUTCOME_EVENT_SCHEMA_VERSION) {
    throw new TypeError('Outcome event schema version is unsupported');
  }
  if (!REVISION_OUTCOME_EVENT_TYPES.includes(base.type)) {
    throw new TypeError('Outcome event type is unsupported');
  }

  let body;
  if (base.type === 'generation') {
    assertExactKeys(value, ['schemaVersion', 'type', 'revisionSha256', 'atMs']);
    body = base;
  } else if (base.type === 'validation') {
    assertExactKeys(value, [
      'schemaVersion',
      'type',
      'revisionSha256',
      'atMs',
      'stage',
      'status',
      'resultSha256',
    ]);
    if (!VALIDATION_STAGES.includes(value.stage)) throw new TypeError('Validation stage is unsupported');
    if (!VALIDATION_STATUSES.includes(value.status)) throw new TypeError('Validation status is unsupported');
    body = {
      ...base,
      stage: value.stage,
      status: value.status,
      resultSha256: requireHash(value.resultSha256, 'event.resultSha256'),
    };
  } else {
    assertExactKeys(value, ['schemaVersion', 'type', 'revisionSha256', 'atMs', 'action']);
    if (!Object.hasOwn(REVISION_OUTCOME_ACTIONS, value.action)) {
      throw new TypeError('Workspace outcome action is unsupported');
    }
    body = { ...base, action: value.action };
  }
  return Object.freeze({
    ...body,
    body: Object.freeze(body),
    eventSha256: sha256(stableStringify(body)),
  });
}

function deduplicate(events) {
  const byHash = new Map(events.map((event) => [event.eventSha256, event]));
  return [...byHash.values()].sort((left, right) => (
    left.atMs - right.atMs
      || left.type.localeCompare(right.type)
      || left.eventSha256.localeCompare(right.eventSha256)
  ));
}

function reduceValidation(events, revisionSha256) {
  const stages = Object.fromEntries(VALIDATION_STAGES.map((stage) => {
    const attempts = events.filter((event) => event.type === 'validation' && event.stage === stage);
    if (attempts.length === 0) return [stage, null];
    const latestAtMs = Math.max(...attempts.map(({ atMs }) => atMs));
    const latest = attempts.filter(({ atMs }) => atMs === latestAtMs);
    const selected = latest.find(({ status }) => status === 'failed') ?? latest[0];
    return [stage, Object.freeze({
      status: selected.status,
      atMs: selected.atMs,
      resultSha256: selected.resultSha256,
      eventSha256: selected.eventSha256,
    })];
  }));
  const failedStage = VALIDATION_STAGES.find((stage) => stages[stage]?.status === 'failed') ?? null;
  const complete = VALIDATION_STAGES.every((stage) => stages[stage]?.status === 'passed');
  const receiptSha256 = complete ? sha256(stableStringify({
    schemaVersion: 1,
    revisionSha256,
    compileEventSha256: stages.compile.eventSha256,
    renderEventSha256: stages.render.eventSha256,
  })) : null;
  return Object.freeze({
    compile: stages.compile,
    render: stages.render,
    complete,
    failedStage,
    receiptSha256,
  });
}

function emptyValidation() {
  return Object.freeze({
    compile: null,
    render: null,
    complete: false,
    failedStage: null,
    receiptSha256: null,
  });
}

function outcomeReceipt(value) {
  const body = {
    schemaVersion: 1,
    policyVersion: REVISION_OUTCOME_POLICY_VERSION,
    revisionSha256: value.revisionSha256,
    generatedAtMs: value.generatedAtMs,
    generationEventSha256: value.generationEventSha256,
    validation: value.validation,
    feedback: Object.freeze({
      signal: value.signal,
      counts: value.counts,
      eventSha256s: value.evidenceEventSha256s,
    }),
    state: value.state,
    reason: value.reason,
    grace: Object.freeze({
      requiredMs: value.graceMs,
      remainingMs: value.remainingMs,
    }),
    dueAtMs: value.dueAtMs,
    eligibleForPromotion: value.state === 'candidate' && value.validation.complete,
    providerEligible: value.providerEligible,
  };
  return deepFreeze({
    ...body,
    outcomeSha256: sha256(stableStringify(body)),
  });
}

function emptyCounts() {
  return Object.freeze(Object.fromEntries(SIGNALS.map((signal) => [signal, 0])));
}

function feedbackWindow(value) {
  const result = duration(value, 'feedbackWindowMs');
  if (result > MAXIMUM_OUTCOME_WINDOW_MS) {
    throw new RangeError(`feedbackWindowMs cannot exceed ${MAXIMUM_OUTCOME_WINDOW_MS}`);
  }
  return result;
}

function assertExactKeys(value, expected) {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    throw new TypeError('Outcome event contains unexpected fields');
  }
}

function boundedAdd(left, right) {
  return left > Number.MAX_SAFE_INTEGER - right ? Number.MAX_SAFE_INTEGER : left + right;
}

function timestamp(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function duration(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function requireHash(value, label) {
  if (!isHash(value)) throw new TypeError(`${label} must be a lowercase SHA-256`);
  return value;
}

function isHash(value) {
  return typeof value === 'string' && HASH.test(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
