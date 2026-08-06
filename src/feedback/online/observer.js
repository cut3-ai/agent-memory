import crypto from 'node:crypto';

import {
  DEFAULT_OUTCOME_GRACE_MS,
  DEFAULT_OUTCOME_WINDOW_MS,
  MAXIMUM_OUTCOME_WINDOW_MS,
  REVISION_OUTCOME_POLICY_VERSION,
} from '../outcome.js';
import { sha256 } from '../../lib.js';
import {
  DEFAULT_OBSERVER_OPERATION_LEASE_MS,
  DEFAULT_OBSERVER_RETRY_MS,
  DEFAULT_PUBLICATION_HOLD_MS,
  MAXIMUM_OBSERVER_TRANSITIONS,
  ONLINE_MEMORY_CANDIDATE_BINDING_SCHEMA_VERSION,
  ONLINE_MEMORY_OBSERVER_SCHEMA_VERSION,
} from './constants.js';
import { createOnlineMemoryTimeoutScheduler } from './adapters.js';
import { mergeEvents, normalizeEventBatch, oneRevision } from './events.js';
import {
  applyOperationResult,
  callbackInput,
  initialRecord,
  normalizeCallbackResult,
  normalizeCandidateBinding,
  reconcileRecord,
  validateRecord,
} from './state.js';
import {
  boundedAdd,
  boundedDuration,
  cloneJson,
  deepFreeze,
  positiveDuration,
  requireFunction,
  requireHash,
  requireInterface,
  timestamp,
} from './shared.js';

/**
 * Durable coordinator for one-revision-at-a-time online memory decisions.
 *
 * The CAS store is authoritative for pending events and its outbox operation.
 * Callbacks are idempotent by `operationId`. Quarantine is reversible; commit
 * may publish; a later negative can only append a revocation tombstone.
 */
export class OnlineMemoryObserver {
  #store;
  #scheduler;
  #callbacks;
  #resolveCandidate;
  #clock;
  #workerSha256;
  #onError;
  #policy;
  #operationLeaseMs;
  #retryMs;

  constructor(options = {}) {
    requireInterface(options.store, ['load', 'compareAndSet', 'list'], 'store');
    const scheduler = options.scheduler ?? createOnlineMemoryTimeoutScheduler();
    requireInterface(scheduler, ['schedule', 'cancel'], 'scheduler');
    const callbacks = {
      quarantine: requireFunction(options.promoteCandidate, 'promoteCandidate'),
      commit: requireFunction(options.commitCandidate, 'commitCandidate'),
      cancel: requireFunction(options.cancelCandidate, 'cancelCandidate'),
      revoke: requireFunction(options.revokeCandidate, 'revokeCandidate'),
    };
    const graceMs = boundedDuration(
      options.graceMs ?? DEFAULT_OUTCOME_GRACE_MS,
      'graceMs',
      MAXIMUM_OUTCOME_WINDOW_MS,
    );
    if (graceMs < DEFAULT_OUTCOME_GRACE_MS) {
      throw new RangeError(`graceMs cannot be less than ${DEFAULT_OUTCOME_GRACE_MS}`);
    }
    const feedbackWindowMs = boundedDuration(
      options.feedbackWindowMs ?? DEFAULT_OUTCOME_WINDOW_MS,
      'feedbackWindowMs',
      MAXIMUM_OUTCOME_WINDOW_MS,
    );
    const publicationHoldMs = boundedDuration(
      options.publicationHoldMs ?? DEFAULT_PUBLICATION_HOLD_MS,
      'publicationHoldMs',
      MAXIMUM_OUTCOME_WINDOW_MS,
    );
    if (publicationHoldMs < feedbackWindowMs) {
      throw new RangeError('publicationHoldMs must cover the complete feedbackWindowMs');
    }

    this.#store = options.store;
    this.#scheduler = scheduler;
    this.#callbacks = Object.freeze(callbacks);
    this.#resolveCandidate = requireFunction(options.resolveCandidate, 'resolveCandidate');
    this.#clock = options.clock ?? Date.now;
    requireFunction(this.#clock, 'clock');
    this.#workerSha256 = options.workerSha256 === undefined
      ? sha256(crypto.randomUUID())
      : requireHash(options.workerSha256, 'workerSha256');
    this.#onError = options.onError === undefined ? null : requireFunction(options.onError, 'onError');
    this.#policy = Object.freeze({
      outcomePolicyVersion: REVISION_OUTCOME_POLICY_VERSION,
      graceMs,
      feedbackWindowMs,
      publicationHoldMs,
    });
    this.#operationLeaseMs = positiveDuration(
      options.operationLeaseMs ?? DEFAULT_OBSERVER_OPERATION_LEASE_MS,
      'operationLeaseMs',
    );
    this.#retryMs = positiveDuration(options.retryMs ?? DEFAULT_OBSERVER_RETRY_MS, 'retryMs');
  }

  /** Append trusted server-side events and drive all immediately due work. */
  async observe(eventsOrEvent, bindings = {}) {
    const events = normalizeEventBatch(eventsOrEvent);
    const revisionSha256 = oneRevision(events);
    const physicalNow = this.#now();
    if (events.some(({ atMs }) => atMs > physicalNow)) {
      throw new RangeError('Outcome event cannot be in the future');
    }
    const expectedCandidateSha256 = bindings.candidateSha256 === undefined
      ? null
      : requireHash(bindings.candidateSha256, 'candidateSha256');

    // Resolve only when creating the record. Existing revisions must continue
    // accepting terminal feedback even if artifact storage is unavailable.
    const raw = await this.#store.load(revisionSha256);
    const current = raw === null || raw === undefined ? null : this.#validateRecord(raw);
    let resolvedBinding = null;
    if (current === null) {
      if (!events.some(({ type }) => type === 'generation')) {
        throw new TypeError('the first observed batch must include a generation event');
      }
      resolvedBinding = await this.#resolveBinding(revisionSha256);
      if (expectedCandidateSha256 !== null
          && resolvedBinding.candidateSha256 !== expectedCandidateSha256) {
        throw new TypeError('resolved candidateSha256 does not match the expected candidate');
      }
    } else if (expectedCandidateSha256 !== null
        && expectedCandidateSha256 !== current.candidateSha256) {
      throw new TypeError('candidateSha256 cannot be rebound to an observed revision');
    }

    const record = await this.#mutate(revisionSha256, physicalNow, (stored) => {
      if (stored === null) {
        if (resolvedBinding === null) {
          throw new Error('candidate binding was not resolved for a new revision');
        }
        return initialRecord(resolvedBinding, events, this.#policy);
      }
      if (resolvedBinding !== null
          && (resolvedBinding.candidateSha256 !== stored.candidateSha256
            || resolvedBinding.bindingReceiptSha256 !== stored.candidateBindingReceiptSha256)) {
        throw new TypeError('candidate binding changed during concurrent observation');
      }
      return { ...stored, events: mergeEvents(stored.events, events) };
    });
    return this.#drain(record);
  }

  /** Re-run grace/window/publication clocks without inventing an event. */
  async reevaluate(revisionSha256) {
    const revision = requireHash(revisionSha256, 'revisionSha256');
    const record = await this.#mutate(revision, this.#now(), (current) => {
      if (current === null) throw new Error('Observed revision does not exist');
      return current;
    });
    return this.#drain(record);
  }

  /** Restore timers and expired operation leases after a process restart. */
  async resume() {
    const rawRecords = await this.#store.list();
    if (!Array.isArray(rawRecords)) throw new TypeError('store.list() must return an array');
    const revisions = [];
    const seen = new Set();
    for (const raw of rawRecords) {
      const record = this.#validateRecord(raw);
      if (seen.has(record.revisionSha256)) {
        throw new Error('store.list() returned a duplicate revision');
      }
      seen.add(record.revisionSha256);
      revisions.push(record.revisionSha256);
    }
    const records = [];
    for (const revisionSha256 of revisions.sort()) {
      records.push(await this.reevaluate(revisionSha256));
    }
    return Object.freeze(records);
  }

  /** Read durable hash-only state without advancing its clock. */
  async read(revisionSha256) {
    const revision = requireHash(revisionSha256, 'revisionSha256');
    const raw = await this.#store.load(revision);
    return raw === null || raw === undefined ? null : this.#validateRecord(raw);
  }

  async #drain(start) {
    let record = start;
    for (let transition = 0; transition < MAXIMUM_OBSERVER_TRANSITIONS; transition += 1) {
      if (record.operation === null) {
        await this.#arm(record);
        return record;
      }
      const nowMs = Math.max(this.#now(), record.updatedAtMs);
      if (record.dueAtMs !== null && record.dueAtMs > nowMs) {
        await this.#arm(record);
        return record;
      }

      record = await this.#claim(record.revisionSha256, record.operation.id, nowMs);
      const operation = record.operation;
      if (operation === null) continue;
      if (operation.status !== 'running'
          || operation.leaseOwnerSha256 !== this.#workerSha256) {
        await this.#arm(record);
        return record;
      }

      // Arm the persisted lease before awaiting any external code. If it never
      // settles, this worker or another one can reclaim the same idempotent op.
      await this.#arm(record);
      let result;
      try {
        if (operation.kind === 'quarantine' || operation.kind === 'commit') {
          await this.#verifyBinding(record);
        }
        result = normalizeCallbackResult(
          operation.kind,
          await this.#callbacks[operation.kind](callbackInput(record, operation)),
        );
      } catch (error) {
        record = await this.#retry(record.revisionSha256, operation.id, operation.attempts);
        await this.#arm(record);
        await this.#reportError(error, record.revisionSha256, operation);
        return record;
      }

      record = await this.#complete(
        record.revisionSha256,
        operation.id,
        operation.attempts,
        result,
      );
    }
    throw new Error(`Observer exceeded ${MAXIMUM_OBSERVER_TRANSITIONS} immediate transitions`);
  }

  async #claim(revisionSha256, operationId, requestedNowMs) {
    return this.#mutate(revisionSha256, requestedNowMs, (current) => {
      if (current === null || current.operation?.id !== operationId) return current;
      const operation = current.operation;
      const nowMs = Math.max(requestedNowMs, current.updatedAtMs);
      if (operation.status === 'running' && operation.leaseUntilMs > nowMs) return current;
      if (operation.status === 'pending' && operation.retryAtMs > nowMs) return current;
      if (operation.attempts === 0
          && ['quarantine', 'commit'].includes(operation.kind)
          && current.outcome.state !== 'candidate') {
        return { ...current, operation: null };
      }
      return {
        ...current,
        operation: {
          ...operation,
          status: 'running',
          attempts: operation.attempts + 1,
          leaseOwnerSha256: this.#workerSha256,
          leaseUntilMs: boundedAdd(nowMs, this.#operationLeaseMs),
          retryAtMs: null,
        },
      };
    });
  }

  async #retry(revisionSha256, operationId, expectedAttempt) {
    const nowMs = this.#now();
    return this.#mutate(revisionSha256, nowMs, (current) => {
      if (current === null || current.operation?.id !== operationId) return current;
      if (current.operation.leaseOwnerSha256 !== this.#workerSha256
          || current.operation.attempts !== expectedAttempt) return current;
      return {
        ...current,
        operation: {
          ...current.operation,
          status: 'pending',
          leaseOwnerSha256: null,
          leaseUntilMs: null,
          retryAtMs: boundedAdd(Math.max(nowMs, current.updatedAtMs), this.#retryMs),
        },
      };
    });
  }

  async #complete(revisionSha256, operationId, expectedAttempt, result) {
    const nowMs = this.#now();
    return this.#mutate(revisionSha256, nowMs, (current) => {
      if (current === null || current.operation?.id !== operationId) return current;
      if (current.operation.status !== 'running'
          || current.operation.leaseOwnerSha256 !== this.#workerSha256
          || current.operation.attempts !== expectedAttempt) {
        return current;
      }
      const completedAtMs = Math.max(nowMs, current.updatedAtMs);
      const lifecycle = applyOperationResult(
        current.lifecycle,
        current.operation.kind,
        result,
        completedAtMs,
      );
      return { ...current, lifecycle, operation: null };
    });
  }

  async #mutate(revisionSha256, requestedNowMs, mutation) {
    for (let attempt = 0; attempt < MAXIMUM_OBSERVER_TRANSITIONS; attempt += 1) {
      const raw = await this.#store.load(revisionSha256);
      const current = raw === null || raw === undefined ? null : this.#validateRecord(raw);
      const nowMs = Math.max(requestedNowMs, current?.updatedAtMs ?? 0);
      const changed = mutation(current);
      if (changed === null) throw new Error('Observed revision does not exist');
      const reconciled = reconcileRecord(changed, nowMs, this.#policy);
      const next = deepFreeze({
        ...reconciled,
        schemaVersion: ONLINE_MEMORY_OBSERVER_SCHEMA_VERSION,
        version: (current?.version ?? 0) + 1,
        updatedAtMs: nowMs,
      });
      const saved = await this.#store.compareAndSet(
        revisionSha256,
        current?.version ?? null,
        cloneJson(next),
      );
      if (saved === true) return next;
      if (saved !== false) throw new TypeError('store.compareAndSet() must return a boolean');
    }
    throw new Error('Observer store remained contended');
  }

  #validateRecord(raw) {
    return validateRecord(raw, this.#policy);
  }

  async #resolveBinding(revisionSha256) {
    const value = await this.#resolveCandidate(deepFreeze({
      schemaVersion: ONLINE_MEMORY_CANDIDATE_BINDING_SCHEMA_VERSION,
      revisionSha256,
    }));
    return normalizeCandidateBinding(value, revisionSha256);
  }

  async #verifyBinding(record) {
    const binding = await this.#resolveBinding(record.revisionSha256);
    if (binding.candidateSha256 !== record.candidateSha256
        || binding.bindingReceiptSha256 !== record.candidateBindingReceiptSha256) {
      throw new Error('Durable candidate binding changed');
    }
  }

  async #arm(record) {
    const key = `online-memory:${record.revisionSha256}`;
    await this.#scheduler.cancel(key);
    if (record.dueAtMs === null) return;
    const task = () => Promise.resolve(this.reevaluate(record.revisionSha256)).catch((error) => (
      this.#reportError(error, record.revisionSha256, null)
    ));
    await this.#scheduler.schedule(key, record.dueAtMs, task);
  }

  async #reportError(error, revisionSha256, operation) {
    if (this.#onError === null) return;
    const serialized = error instanceof Error
      ? `${error.name}\n${error.message}\n${error.stack ?? ''}`
      : String(error);
    const receipt = deepFreeze({
      revisionSha256,
      operationId: operation?.id ?? null,
      operationKind: operation?.kind ?? null,
      errorCode: operation === null ? 'observer-scheduled-task-failed' : 'observer-operation-failed',
      errorSha256: sha256(serialized),
    });
    try {
      await this.#onError(receipt);
    } catch {
      // Diagnostics are best-effort and must never mutate memory authority.
    }
  }

  #now() {
    return timestamp(this.#clock(), 'clock()');
  }
}
