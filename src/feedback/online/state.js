import {
  reduceRevisionOutcome,
  REVISION_OUTCOME_POLICY_VERSION,
  verifyRevisionOutcomeReceipt,
} from '../outcome.js';
import { sha256, stableStringify } from '../../lib.js';
import {
  ONLINE_MEMORY_CALLBACK_SCHEMA_VERSION,
  ONLINE_MEMORY_CANDIDATE_BINDING_SCHEMA_VERSION,
  ONLINE_MEMORY_LIFECYCLE_STATES,
  ONLINE_MEMORY_OBSERVER_SCHEMA_VERSION,
  OPERATION_KINDS,
  OPERATION_STATUSES,
} from './constants.js';
import { normalizeEventBatch, oneRevision } from './events.js';
import {
  assertExactKeys,
  boundedAdd,
  cloneJson,
  deepFreeze,
  optionalHash,
  optionalTimestamp,
  requireHash,
  timestamp,
} from './shared.js';

export function normalizeCandidateBinding(value, revisionSha256) {
  assertExactKeys(
    value,
    ['schemaVersion', 'revisionSha256', 'candidateSha256', 'bindingReceiptSha256'],
    'resolveCandidate result',
  );
  if (value.schemaVersion !== ONLINE_MEMORY_CANDIDATE_BINDING_SCHEMA_VERSION) {
    throw new TypeError('resolveCandidate result schema version is unsupported');
  }
  if (requireHash(value.revisionSha256, 'resolved revisionSha256') !== revisionSha256) {
    throw new TypeError('resolveCandidate returned a binding for another revision');
  }
  return deepFreeze({
    schemaVersion: ONLINE_MEMORY_CANDIDATE_BINDING_SCHEMA_VERSION,
    revisionSha256,
    candidateSha256: requireHash(value.candidateSha256, 'resolved candidateSha256'),
    bindingReceiptSha256: requireHash(
      value.bindingReceiptSha256,
      'resolved bindingReceiptSha256',
    ),
  });
}

export function initialRecord(binding, events, policy) {
  return {
    schemaVersion: ONLINE_MEMORY_OBSERVER_SCHEMA_VERSION,
    version: 0,
    revisionSha256: binding.revisionSha256,
    candidateSha256: binding.candidateSha256,
    candidateBindingReceiptSha256: binding.bindingReceiptSha256,
    policy,
    events,
    outcome: null,
    lifecycle: emptyLifecycle(),
    operation: null,
    dueAtMs: null,
    updatedAtMs: 0,
  };
}

export function reconcileRecord(record, nowMs, policy) {
  assertPolicy(record.policy, policy);
  const outcome = reduceRevisionOutcome({
    events: record.events,
    revisionSha256: record.revisionSha256,
    nowMs,
    graceMs: policy.graceMs,
    feedbackWindowMs: policy.feedbackWindowMs,
  });
  let next = { ...record, outcome };
  let operation = next.operation;

  if (operation?.status === 'running' && operation.leaseUntilMs <= nowMs) {
    operation = {
      ...operation,
      status: 'pending',
      leaseOwnerSha256: null,
      leaseUntilMs: null,
      retryAtMs: nowMs,
    };
    next = { ...next, operation };
  }

  // A callback that never started can be withdrawn. Once an attempt starts,
  // the stable operation id must be resolved before cancellation/revocation.
  if (operation?.status === 'pending'
      && operation.attempts === 0
      && ['quarantine', 'commit'].includes(operation.kind)
      && outcome.state !== 'candidate') {
    operation = null;
    next = { ...next, operation: null };
  }

  if (operation !== null) {
    return {
      ...next,
      dueAtMs: operation.status === 'running'
        ? operation.leaseUntilMs
        : operation.retryAtMs,
    };
  }

  const lifecycle = next.lifecycle;
  if (lifecycle.state === 'observing') {
    if (isNegative(outcome)) {
      return {
        ...next,
        lifecycle: { ...lifecycle, state: 'discarded', discardedAtMs: nowMs },
        dueAtMs: null,
      };
    }
    if (outcome.state === 'candidate') {
      return withOperation(next, createOperation('quarantine', next, nowMs));
    }
    return { ...next, dueAtMs: outcome.dueAtMs };
  }

  if (lifecycle.state === 'quarantined') {
    if (outcome.state === 'discard' || outcome.state === 'quarantine') {
      return withOperation(next, createOperation('cancel', next, nowMs));
    }
    if (outcome.state === 'candidate') {
      const publicationDueAtMs = boundedAdd(lifecycle.quarantinedAtMs, policy.publicationHoldMs);
      if (nowMs >= publicationDueAtMs) {
        return withOperation(next, createOperation('commit', next, nowMs));
      }
      return { ...next, dueAtMs: publicationDueAtMs };
    }
    return { ...next, dueAtMs: outcome.dueAtMs };
  }

  if (lifecycle.state === 'committed') {
    if (outcome.state === 'discard') {
      return withOperation(next, createOperation('revoke', next, nowMs));
    }
    return { ...next, dueAtMs: null };
  }

  return { ...next, dueAtMs: null };
}

export function callbackInput(record, operation) {
  const common = {
    schemaVersion: ONLINE_MEMORY_CALLBACK_SCHEMA_VERSION,
    operationId: operation.id,
    revisionSha256: record.revisionSha256,
    candidateSha256: record.candidateSha256,
    candidateBindingReceiptSha256: record.candidateBindingReceiptSha256,
  };
  if (operation.kind === 'quarantine') {
    return deepFreeze({
      ...common,
      phase: 'quarantine',
      outcome: operation.candidateOutcome,
      evaluatedAtMs: operation.candidateEvaluatedAtMs,
      events: operation.candidateEvents,
    });
  }
  if (operation.kind === 'commit') {
    return deepFreeze({
      ...common,
      phase: 'commit',
      outcome: operation.candidateOutcome,
      evaluatedAtMs: operation.candidateEvaluatedAtMs,
      quarantineReceiptSha256: record.lifecycle.quarantineReceiptSha256,
    });
  }
  if (operation.kind === 'cancel') {
    return deepFreeze({
      ...common,
      phase: 'cancel',
      outcome: record.outcome,
      quarantineReceiptSha256: record.lifecycle.quarantineReceiptSha256,
    });
  }
  return deepFreeze({
    ...common,
    phase: 'revoke',
    outcome: record.outcome,
    commitReceiptSha256: record.lifecycle.commitReceiptSha256,
    historyPolicy: 'append-tombstone-never-erase',
  });
}

export function normalizeCallbackResult(kind, value) {
  assertExactKeys(
    value,
    kind === 'revoke' ? ['receiptSha256', 'tombstoneSha256'] : ['receiptSha256'],
    `${kind} callback result`,
  );
  const result = {
    receiptSha256: requireHash(value.receiptSha256, `${kind} receiptSha256`),
  };
  if (kind === 'revoke') {
    result.tombstoneSha256 = requireHash(value.tombstoneSha256, 'revoke tombstoneSha256');
  }
  return Object.freeze(result);
}

export function applyOperationResult(lifecycle, kind, result, atMs) {
  if (kind === 'quarantine') {
    return Object.freeze({
      ...lifecycle,
      state: 'quarantined',
      quarantineReceiptSha256: result.receiptSha256,
      quarantinedAtMs: atMs,
    });
  }
  if (kind === 'commit') {
    return Object.freeze({
      ...lifecycle,
      state: 'committed',
      commitReceiptSha256: result.receiptSha256,
      committedAtMs: atMs,
    });
  }
  if (kind === 'cancel') {
    return Object.freeze({
      ...lifecycle,
      state: 'cancelled',
      cancellationReceiptSha256: result.receiptSha256,
      cancelledAtMs: atMs,
    });
  }
  return Object.freeze({
    ...lifecycle,
    state: 'revoked',
    revocationReceiptSha256: result.receiptSha256,
    tombstoneSha256: result.tombstoneSha256,
    revokedAtMs: atMs,
  });
}

export function validateRecord(raw, policy) {
  assertExactKeys(raw, [
    'schemaVersion',
    'version',
    'revisionSha256',
    'candidateSha256',
    'candidateBindingReceiptSha256',
    'policy',
    'events',
    'outcome',
    'lifecycle',
    'operation',
    'dueAtMs',
    'updatedAtMs',
  ], 'stored observer record');
  if (raw.schemaVersion !== ONLINE_MEMORY_OBSERVER_SCHEMA_VERSION) {
    throw new TypeError('stored observer schema version is unsupported');
  }
  if (!Number.isSafeInteger(raw.version) || raw.version < 1) {
    throw new TypeError('stored observer version is invalid');
  }
  const revisionSha256 = requireHash(raw.revisionSha256, 'stored revisionSha256');
  const candidateSha256 = requireHash(raw.candidateSha256, 'stored candidateSha256');
  const bindingReceiptSha256 = requireHash(
    raw.candidateBindingReceiptSha256,
    'stored candidateBindingReceiptSha256',
  );
  assertPolicy(raw.policy, policy);
  const events = normalizeEventBatch(raw.events);
  if (oneRevision(events) !== revisionSha256) {
    throw new TypeError('stored events do not target the record revision');
  }
  if (stableStringify(events) !== stableStringify(raw.events)) {
    throw new TypeError('stored events are not canonical');
  }
  const updatedAtMs = timestamp(raw.updatedAtMs, 'stored updatedAtMs');
  const expectedOutcome = reduceRevisionOutcome({
    events,
    revisionSha256,
    nowMs: updatedAtMs,
    graceMs: policy.graceMs,
    feedbackWindowMs: policy.feedbackWindowMs,
  });
  if (!verifyRevisionOutcomeReceipt(raw.outcome)
      || stableStringify(raw.outcome) !== stableStringify(expectedOutcome)) {
    throw new TypeError('stored outcome is not the pure projection of stored events');
  }
  validateLifecycle(raw.lifecycle);
  validateOperation(raw.operation, {
    revisionSha256,
    candidateSha256,
    candidateBindingReceiptSha256: bindingReceiptSha256,
    lifecycle: raw.lifecycle,
  }, policy);
  optionalTimestamp(raw.dueAtMs, 'stored dueAtMs');
  const record = cloneJson(raw);
  validateLifecycleOperation(record.lifecycle, record.operation);
  return deepFreeze(record);
}

function emptyLifecycle() {
  return Object.freeze({
    state: 'observing',
    quarantineReceiptSha256: null,
    commitReceiptSha256: null,
    cancellationReceiptSha256: null,
    revocationReceiptSha256: null,
    tombstoneSha256: null,
    discardedAtMs: null,
    quarantinedAtMs: null,
    committedAtMs: null,
    cancelledAtMs: null,
    revokedAtMs: null,
  });
}

function createOperation(kind, record, nowMs) {
  if (!OPERATION_KINDS.includes(kind)) throw new TypeError('observer operation kind is unsupported');
  const candidateOutcome = ['quarantine', 'commit'].includes(kind) ? record.outcome : null;
  if (candidateOutcome !== null && candidateOutcome.state !== 'candidate') {
    throw new TypeError(`${kind} operation requires a candidate outcome`);
  }
  const identity = operationIdentity(kind, record, candidateOutcome);
  return Object.freeze({
    kind,
    id: sha256(stableStringify(identity)),
    status: 'pending',
    attempts: 0,
    candidateOutcome,
    candidateEvents: ['quarantine', 'commit'].includes(kind) ? record.events : null,
    candidateEvaluatedAtMs: candidateOutcome === null ? null : nowMs,
    leaseOwnerSha256: null,
    leaseUntilMs: null,
    retryAtMs: nowMs,
  });
}

function withOperation(record, operation) {
  return { ...record, operation, dueAtMs: operation.retryAtMs };
}

function validateLifecycle(value) {
  assertExactKeys(value, [
    'state',
    'quarantineReceiptSha256',
    'commitReceiptSha256',
    'cancellationReceiptSha256',
    'revocationReceiptSha256',
    'tombstoneSha256',
    'discardedAtMs',
    'quarantinedAtMs',
    'committedAtMs',
    'cancelledAtMs',
    'revokedAtMs',
  ], 'stored lifecycle');
  if (!ONLINE_MEMORY_LIFECYCLE_STATES.includes(value.state)) {
    throw new TypeError('stored lifecycle state is unsupported');
  }
  for (const key of [
    'quarantineReceiptSha256',
    'commitReceiptSha256',
    'cancellationReceiptSha256',
    'revocationReceiptSha256',
    'tombstoneSha256',
  ]) optionalHash(value[key], `stored ${key}`);
  for (const key of [
    'discardedAtMs',
    'quarantinedAtMs',
    'committedAtMs',
    'cancelledAtMs',
    'revokedAtMs',
  ]) optionalTimestamp(value[key], `stored ${key}`);

  const required = {
    observing: [],
    discarded: ['discardedAtMs'],
    quarantined: ['quarantineReceiptSha256', 'quarantinedAtMs'],
    cancelled: [
      'quarantineReceiptSha256',
      'quarantinedAtMs',
      'cancellationReceiptSha256',
      'cancelledAtMs',
    ],
    committed: [
      'quarantineReceiptSha256',
      'quarantinedAtMs',
      'commitReceiptSha256',
      'committedAtMs',
    ],
    revoked: [
      'quarantineReceiptSha256',
      'quarantinedAtMs',
      'commitReceiptSha256',
      'committedAtMs',
      'revocationReceiptSha256',
      'tombstoneSha256',
      'revokedAtMs',
    ],
  }[value.state];
  if (required.some((key) => value[key] === null)) {
    throw new TypeError('stored lifecycle is missing required receipts or timestamps');
  }
  const allowed = new Set(['state', ...required]);
  if (Object.entries(value).some(([key, nested]) => !allowed.has(key) && nested !== null)) {
    throw new TypeError('stored lifecycle contains receipts from an impossible transition');
  }
}

function validateOperation(value, record, policy) {
  if (value === null) return;
  assertExactKeys(value, [
    'kind',
    'id',
    'status',
    'attempts',
    'candidateOutcome',
    'candidateEvents',
    'candidateEvaluatedAtMs',
    'leaseOwnerSha256',
    'leaseUntilMs',
    'retryAtMs',
  ], 'stored operation');
  if (!OPERATION_KINDS.includes(value.kind) || !OPERATION_STATUSES.includes(value.status)) {
    throw new TypeError('stored operation kind or status is unsupported');
  }
  requireHash(value.id, 'stored operation id');
  if (!Number.isSafeInteger(value.attempts) || value.attempts < 0) {
    throw new TypeError('stored operation attempts are invalid');
  }
  if (['quarantine', 'commit'].includes(value.kind)) {
    if (!verifyRevisionOutcomeReceipt(value.candidateOutcome)
        || value.candidateOutcome.state !== 'candidate'
        || value.candidateOutcome.revisionSha256 !== record.revisionSha256) {
      throw new TypeError('stored operation lacks its candidate outcome authority');
    }
    timestamp(value.candidateEvaluatedAtMs, 'stored candidateEvaluatedAtMs');
  } else if (value.candidateOutcome !== null) {
    throw new TypeError('stored lifecycle operation cannot carry candidate authority');
  } else if (value.candidateEvaluatedAtMs !== null) {
    throw new TypeError('lifecycle operation cannot carry a candidate evaluation clock');
  }
  if (['quarantine', 'commit'].includes(value.kind)) {
    const candidateEvents = normalizeEventBatch(value.candidateEvents);
    if (oneRevision(candidateEvents) !== record.revisionSha256
        || stableStringify(candidateEvents) !== stableStringify(value.candidateEvents)) {
      throw new TypeError('stored candidate operation events are not canonical');
    }
    const expectedOutcome = reduceRevisionOutcome({
      events: candidateEvents,
      revisionSha256: record.revisionSha256,
      nowMs: value.candidateEvaluatedAtMs,
      graceMs: policy.graceMs,
      feedbackWindowMs: policy.feedbackWindowMs,
    });
    if (stableStringify(expectedOutcome) !== stableStringify(value.candidateOutcome)) {
      throw new TypeError('stored candidate authority does not match its event snapshot');
    }
  } else if (value.candidateEvents !== null) {
    throw new TypeError('only candidate operations may carry candidate events');
  }
  if (value.status === 'running') {
    requireHash(value.leaseOwnerSha256, 'stored operation lease owner');
    timestamp(value.leaseUntilMs, 'stored operation leaseUntilMs');
    if (value.retryAtMs !== null) throw new TypeError('running operation cannot have retryAtMs');
  } else {
    if (value.leaseOwnerSha256 !== null || value.leaseUntilMs !== null) {
      throw new TypeError('pending operation cannot own a lease');
    }
    timestamp(value.retryAtMs, 'stored operation retryAtMs');
  }
  const expectedId = sha256(stableStringify(operationIdentity(
    value.kind,
    { ...record, outcome: value.candidateOutcome },
    value.candidateOutcome,
  )));
  if (value.id !== expectedId) throw new TypeError('stored operation id is invalid');
}

function operationIdentity(kind, record, candidateOutcome) {
  return {
    schemaVersion: ONLINE_MEMORY_CALLBACK_SCHEMA_VERSION,
    kind,
    revisionSha256: record.revisionSha256,
    candidateSha256: record.candidateSha256,
    candidateBindingReceiptSha256: record.candidateBindingReceiptSha256,
    candidateOutcomeSha256: candidateOutcome?.outcomeSha256 ?? null,
    quarantineReceiptSha256: record.lifecycle.quarantineReceiptSha256,
    commitReceiptSha256: record.lifecycle.commitReceiptSha256,
  };
}

function validateLifecycleOperation(lifecycle, operation) {
  if (operation === null) return;
  const expectedState = {
    quarantine: 'observing',
    commit: 'quarantined',
    cancel: 'quarantined',
    revoke: 'committed',
  }[operation.kind];
  if (lifecycle.state !== expectedState) {
    throw new TypeError('stored operation is incompatible with lifecycle state');
  }
}

function assertPolicy(value, expected) {
  assertExactKeys(value, [
    'outcomePolicyVersion',
    'graceMs',
    'feedbackWindowMs',
    'publicationHoldMs',
  ], 'stored observer policy');
  if (value.outcomePolicyVersion !== REVISION_OUTCOME_POLICY_VERSION
      || stableStringify(value) !== stableStringify(expected)) {
    throw new TypeError('stored observer policy does not match this observer');
  }
}

function isNegative(outcome) {
  return outcome.feedback.signal === 'negative';
}
