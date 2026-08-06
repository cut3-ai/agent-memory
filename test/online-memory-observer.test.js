import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInMemoryOnlineMemoryStore,
  OnlineMemoryObserver,
} from '../src/feedback/online-observer.js';
import { inspectPublicArtifact } from '../src/memory/privacy.js';

const REVISION = 'a'.repeat(64);
const CANDIDATE = 'b'.repeat(64);
const WORKER = 'c'.repeat(64);
const QUARANTINE_RECEIPT = '1'.repeat(64);
const COMMIT_RECEIPT = '2'.repeat(64);
const CANCELLATION_RECEIPT = '3'.repeat(64);
const REVOCATION_RECEIPT = '4'.repeat(64);
const TOMBSTONE = '5'.repeat(64);
const BINDING_RECEIPT = '8'.repeat(64);

function generation(atMs = 1_000) {
  return { schemaVersion: 1, type: 'generation', revisionSha256: REVISION, atMs };
}

function validation(stage, atMs, status = 'passed') {
  return {
    schemaVersion: 1,
    type: 'validation',
    revisionSha256: REVISION,
    atMs,
    stage,
    status,
    resultSha256: stage === 'compile' ? '6'.repeat(64) : '7'.repeat(64),
  };
}

function action(name, atMs) {
  return {
    schemaVersion: 1,
    type: 'workspace-action',
    revisionSha256: REVISION,
    atMs,
    action: name,
  };
}

function acceptedEvents() {
  return [
    generation(),
    validation('compile', 1_100),
    validation('render', 1_200),
    action('accepted', 1_300),
  ];
}

class ManualScheduler {
  tasks = new Map();

  async cancel(key) {
    this.tasks.delete(key);
  }

  async schedule(key, atMs, task) {
    this.tasks.set(key, { atMs, task });
  }

  async runDue(nowMs) {
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const due = [...this.tasks.entries()]
        .filter(([, scheduled]) => scheduled.atMs <= nowMs)
        .sort((left, right) => left[1].atMs - right[1].atMs || left[0].localeCompare(right[0]));
      if (due.length === 0) return;
      const [key, scheduled] = due[0];
      this.tasks.delete(key);
      await scheduled.task();
    }
    throw new Error('manual scheduler did not settle');
  }

  onlyDueAt() {
    assert.equal(this.tasks.size, 1);
    return [...this.tasks.values()][0].atMs;
  }
}

function observerHarness(overrides = {}) {
  let nowMs = overrides.nowMs ?? 1_300;
  const calls = [];
  const store = overrides.store ?? createInMemoryOnlineMemoryStore();
  const scheduler = overrides.scheduler ?? new ManualScheduler();
  const bindingCalls = [];
  const observer = new OnlineMemoryObserver({
    store,
    scheduler,
    clock: () => nowMs,
    workerSha256: overrides.workerSha256 ?? WORKER,
    onError: overrides.onError,
    resolveCandidate: Object.hasOwn(overrides, 'resolveCandidate')
      ? overrides.resolveCandidate
      : async (input) => {
        bindingCalls.push(input);
        return {
          schemaVersion: 1,
          revisionSha256: input.revisionSha256,
          candidateSha256: CANDIDATE,
          bindingReceiptSha256: BINDING_RECEIPT,
        };
      },
    promoteCandidate: overrides.promoteCandidate ?? (async (input) => {
      assert.equal(input.outcome.state, 'candidate');
      calls.push(input);
      return { receiptSha256: QUARANTINE_RECEIPT };
    }),
    commitCandidate: overrides.commitCandidate ?? (async (input) => {
      assert.equal(input.outcome.state, 'candidate');
      calls.push(input);
      return { receiptSha256: COMMIT_RECEIPT };
    }),
    cancelCandidate: overrides.cancelCandidate ?? (async (input) => {
      calls.push(input);
      return { receiptSha256: CANCELLATION_RECEIPT };
    }),
    revokeCandidate: overrides.revokeCandidate ?? (async (input) => {
      calls.push(input);
      return { receiptSha256: REVOCATION_RECEIPT, tombstoneSha256: TOMBSTONE };
    }),
    retryMs: 5_000,
  });
  return {
    observer,
    scheduler,
    store,
    calls,
    bindingCalls,
    now() { return nowMs; },
    advance(value) { nowMs = value; },
  };
}

test('observer schedules grace, quarantines only a candidate, then commits after the full window', async () => {
  const harness = observerHarness();
  let record = await harness.observer.observe(acceptedEvents(), { candidateSha256: CANDIDATE });

  assert.equal(record.outcome.state, 'pending');
  assert.equal(record.lifecycle.state, 'observing');
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.scheduler.onlyDueAt(), 31_300);
  assert.deepEqual(inspectPublicArtifact(record), []);

  harness.advance(31_300);
  await harness.scheduler.runDue(harness.now());
  record = await harness.observer.read(REVISION);
  assert.equal(record.lifecycle.state, 'quarantined');
  assert.equal(record.lifecycle.quarantineReceiptSha256, QUARANTINE_RECEIPT);
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].phase, 'quarantine');
  assert.equal(harness.scheduler.onlyDueAt(), 631_300);

  harness.advance(631_300);
  await harness.scheduler.runDue(harness.now());
  record = await harness.observer.read(REVISION);
  assert.equal(record.lifecycle.state, 'committed');
  assert.equal(record.lifecycle.commitReceiptSha256, COMMIT_RECEIPT);
  assert.deepEqual(harness.calls.map(({ phase }) => phase), ['quarantine', 'commit']);
  assert.equal(harness.scheduler.tasks.size, 0);
});

test('pending state survives a process restart and resume restores its timer', async () => {
  const first = observerHarness();
  await first.observer.observe(acceptedEvents(), { candidateSha256: CANDIDATE });

  const secondScheduler = new ManualScheduler();
  const second = observerHarness({
    store: first.store,
    scheduler: secondScheduler,
    nowMs: 2_000,
    workerSha256: 'd'.repeat(64),
  });
  const resumed = await second.observer.resume();
  assert.equal(resumed.length, 1);
  assert.equal(secondScheduler.onlyDueAt(), 31_300);
  assert.equal(second.calls.length, 0);

  second.advance(31_300);
  await secondScheduler.runDue(second.now());
  assert.equal((await second.observer.read(REVISION)).lifecycle.state, 'quarantined');
  assert.equal(second.calls[0].phase, 'quarantine');
});

test('negative before irreversible publication cancels the quarantined candidate', async () => {
  const harness = observerHarness();
  await harness.observer.observe(acceptedEvents(), { candidateSha256: CANDIDATE });
  harness.advance(31_300);
  await harness.scheduler.runDue(harness.now());

  harness.advance(40_000);
  const record = await harness.observer.observe(action('corrected', 40_000));
  assert.equal(record.outcome.state, 'discard');
  assert.equal(record.lifecycle.state, 'cancelled');
  assert.equal(record.lifecycle.commitReceiptSha256, null);
  assert.equal(record.lifecycle.cancellationReceiptSha256, CANCELLATION_RECEIPT);
  assert.deepEqual(harness.calls.map(({ phase }) => phase), ['quarantine', 'cancel']);
});

test('negative after commit appends a revocation tombstone and never claims Git history was erased', async () => {
  const harness = observerHarness();
  await harness.observer.observe(acceptedEvents(), { candidateSha256: CANDIDATE });
  harness.advance(31_300);
  await harness.scheduler.runDue(harness.now());
  harness.advance(631_300);
  await harness.scheduler.runDue(harness.now());

  harness.advance(700_000);
  const record = await harness.observer.observe(action('reverted', 700_000));
  assert.equal(record.lifecycle.state, 'revoked');
  assert.equal(record.lifecycle.commitReceiptSha256, COMMIT_RECEIPT);
  assert.equal(record.lifecycle.revocationReceiptSha256, REVOCATION_RECEIPT);
  assert.equal(record.lifecycle.tombstoneSha256, TOMBSTONE);
  assert.deepEqual(harness.calls.map(({ phase }) => phase), [
    'quarantine',
    'commit',
    'revoke',
  ]);
  assert.equal(harness.calls.at(-1).historyPolicy, 'append-tombstone-never-erase');
  assert.deepEqual(inspectPublicArtifact(record), []);
});

test('negative racing an in-flight commit is revoked after the commit resolves', async () => {
  let commitStarted;
  let releaseCommit;
  const started = new Promise((resolve) => { commitStarted = resolve; });
  const released = new Promise((resolve) => { releaseCommit = resolve; });
  const phases = [];
  const harness = observerHarness({
    commitCandidate: async (input) => {
      phases.push(input.phase);
      commitStarted();
      await released;
      return { receiptSha256: COMMIT_RECEIPT };
    },
    promoteCandidate: async (input) => {
      phases.push(input.phase);
      return { receiptSha256: QUARANTINE_RECEIPT };
    },
    revokeCandidate: async (input) => {
      phases.push(input.phase);
      return { receiptSha256: REVOCATION_RECEIPT, tombstoneSha256: TOMBSTONE };
    },
  });
  await harness.observer.observe(acceptedEvents(), { candidateSha256: CANDIDATE });
  harness.advance(31_300);
  await harness.scheduler.runDue(harness.now());

  harness.advance(631_300);
  const committing = harness.scheduler.runDue(harness.now());
  await started;
  harness.advance(631_400);
  const duringCommit = await harness.observer.observe(action('manual-edit', 631_400));
  assert.equal(duringCommit.outcome.state, 'discard');
  assert.equal(duringCommit.operation.kind, 'commit');
  releaseCommit();
  await committing;

  const record = await harness.observer.read(REVISION);
  assert.equal(record.lifecycle.state, 'revoked');
  assert.deepEqual(phases, ['quarantine', 'commit', 'revoke']);
  assert.equal(record.lifecycle.tombstoneSha256, TOMBSTONE);
});

test('failed external operation retries after restart with one stable idempotency key', async () => {
  const operationIds = [];
  let attempt = 0;
  const store = createInMemoryOnlineMemoryStore();
  const first = observerHarness({
    store,
    promoteCandidate: async (input) => {
      operationIds.push(input.operationId);
      attempt += 1;
      if (attempt === 1) throw new Error('transient external failure');
      return { receiptSha256: QUARANTINE_RECEIPT };
    },
  });
  await first.observer.observe(acceptedEvents(), { candidateSha256: CANDIDATE });
  first.advance(31_300);
  await first.scheduler.runDue(first.now());
  let record = await first.observer.read(REVISION);
  assert.equal(record.lifecycle.state, 'observing');
  assert.equal(record.operation.status, 'pending');
  assert.equal(record.operation.attempts, 1);
  assert.equal(record.dueAtMs, 36_300);

  const secondScheduler = new ManualScheduler();
  const second = observerHarness({
    store,
    scheduler: secondScheduler,
    nowMs: 36_300,
    workerSha256: 'e'.repeat(64),
    promoteCandidate: async (input) => {
      operationIds.push(input.operationId);
      return { receiptSha256: QUARANTINE_RECEIPT };
    },
  });
  await second.observer.resume();
  record = await second.observer.read(REVISION);
  assert.equal(record.lifecycle.state, 'quarantined');
  assert.equal(new Set(operationIds).size, 1);
});

test('negative after a possibly partial quarantine resolves that operation and then cancels it', async () => {
  const phases = [];
  let attempt = 0;
  const harness = observerHarness({
    promoteCandidate: async (input) => {
      assert.equal(input.outcome.state, 'candidate');
      phases.push(input.phase);
      attempt += 1;
      if (attempt === 1) throw new Error('quarantine may have been created before transport failed');
      return { receiptSha256: QUARANTINE_RECEIPT };
    },
    cancelCandidate: async (input) => {
      phases.push(input.phase);
      return { receiptSha256: CANCELLATION_RECEIPT };
    },
  });
  await harness.observer.observe(acceptedEvents(), { candidateSha256: CANDIDATE });
  harness.advance(31_300);
  await harness.scheduler.runDue(harness.now());

  harness.advance(32_000);
  const afterNegative = await harness.observer.observe(action('corrected', 32_000));
  assert.equal(afterNegative.outcome.state, 'discard');
  assert.equal(afterNegative.operation.kind, 'quarantine');
  assert.equal(afterNegative.operation.attempts, 1);
  assert.deepEqual(phases, ['quarantine']);

  harness.advance(36_300);
  await harness.scheduler.runDue(harness.now());
  const record = await harness.observer.read(REVISION);
  assert.equal(record.lifecycle.state, 'cancelled');
  assert.equal(record.lifecycle.commitReceiptSha256, null);
  assert.deepEqual(phases, ['quarantine', 'quarantine', 'cancel']);
});

test('silence, duplicate delivery and a direct negative never invoke promotion', async () => {
  const silent = observerHarness({ nowMs: 1_200 });
  const validationOnly = [generation(), validation('compile', 1_100), validation('render', 1_200)];
  await silent.observer.observe([...validationOnly, ...validationOnly], {
    candidateSha256: CANDIDATE,
  });
  silent.advance(601_000);
  await silent.scheduler.runDue(silent.now());
  assert.equal((await silent.observer.read(REVISION)).outcome.state, 'quarantine');
  assert.equal(silent.calls.length, 0);

  const negative = observerHarness({ nowMs: 1_300 });
  const record = await negative.observer.observe([
    ...validationOnly,
    action('deleted', 1_300),
  ], { candidateSha256: CANDIDATE });
  assert.equal(record.lifecycle.state, 'discarded');
  assert.equal(negative.calls.length, 0);
});

test('observer fails closed on a missing or mismatched binding and rejects corrupt state', async () => {
  assert.throws(
    () => observerHarness({ resolveCandidate: null }),
    /resolveCandidate must be a function/u,
  );
  const harness = observerHarness({ nowMs: 1_000 });
  await assert.rejects(
    harness.observer.observe(generation(), { candidateSha256: 'f'.repeat(64) }),
    /does not match the expected candidate/u,
  );
  await assert.rejects(
    harness.observer.observe([
      generation(),
      { ...generation(), revisionSha256: 'f'.repeat(64) },
    ], { candidateSha256: CANDIDATE }),
    /exactly one revision/u,
  );

  const clean = observerHarness({ nowMs: 1_300 });
  const record = await clean.observer.observe(acceptedEvents(), { candidateSha256: CANDIDATE });
  const corruptStore = createInMemoryOnlineMemoryStore([{ ...record, prompt: 'raw user text' }]);
  const corrupt = observerHarness({ store: corruptStore, nowMs: 1_300 });
  await assert.rejects(corrupt.observer.resume(), /unexpected fields/u);
});

test('a lease watchdog reclaims a callback that never settles with the same operation id', async () => {
  let started;
  const callbackStarted = new Promise((resolve) => { started = resolve; });
  const neverSettles = new Promise(() => {});
  const operationIds = [];
  let attempts = 0;
  const harness = observerHarness({
    promoteCandidate: async (input) => {
      operationIds.push(input.operationId);
      attempts += 1;
      if (attempts === 1) {
        started();
        return neverSettles;
      }
      return { receiptSha256: QUARANTINE_RECEIPT };
    },
  });
  await harness.observer.observe(acceptedEvents(), { candidateSha256: CANDIDATE });
  harness.advance(31_300);
  void harness.scheduler.runDue(harness.now());
  await callbackStarted;

  let record = await harness.observer.read(REVISION);
  assert.equal(record.operation.status, 'running');
  assert.equal(record.dueAtMs, 61_300);
  assert.equal(harness.scheduler.onlyDueAt(), 61_300);

  harness.advance(61_300);
  await harness.scheduler.runDue(harness.now());
  record = await harness.observer.read(REVISION);
  assert.equal(record.lifecycle.state, 'quarantined');
  assert.equal(attempts, 2);
  assert.equal(new Set(operationIds).size, 1);
});

test('a late result from an expired attempt cannot complete the newer lease attempt', async () => {
  let startFirst;
  let startSecond;
  let releaseFirst;
  let releaseSecond;
  const firstStarted = new Promise((resolve) => { startFirst = resolve; });
  const secondStarted = new Promise((resolve) => { startSecond = resolve; });
  const firstResult = new Promise((resolve) => { releaseFirst = resolve; });
  const secondResult = new Promise((resolve) => { releaseSecond = resolve; });
  let attempt = 0;
  const harness = observerHarness({
    promoteCandidate: async () => {
      attempt += 1;
      if (attempt === 1) {
        startFirst();
        return firstResult;
      }
      startSecond();
      return secondResult;
    },
  });
  await harness.observer.observe(acceptedEvents());

  harness.advance(31_300);
  const firstDrain = harness.scheduler.runDue(harness.now());
  await firstStarted;
  harness.advance(61_300);
  const secondDrain = harness.scheduler.runDue(harness.now());
  await secondStarted;

  releaseFirst({ receiptSha256: QUARANTINE_RECEIPT });
  await firstDrain;
  let record = await harness.observer.read(REVISION);
  assert.equal(record.lifecycle.state, 'observing');
  assert.equal(record.operation.status, 'running');
  assert.equal(record.operation.attempts, 2);
  assert.equal(record.dueAtMs, 91_300);

  releaseSecond({ receiptSha256: QUARANTINE_RECEIPT });
  await secondDrain;
  record = await harness.observer.read(REVISION);
  assert.equal(record.lifecycle.state, 'quarantined');
});

test('preview noise is compacted and can never crowd out a late terminal negative', async () => {
  const previews = Array.from({ length: 196 }, (_, index) => action('previewed', 1_301 + index));
  const harness = observerHarness({ nowMs: 1_500 });
  await harness.observer.observe([...acceptedEvents(), ...previews], {
    candidateSha256: CANDIDATE,
  });
  let record = await harness.observer.read(REVISION);
  assert.equal(record.events.filter(({ action: name }) => name === 'previewed').length, 1);
  assert.ok(record.events.length < 20);

  harness.advance(31_300);
  await harness.scheduler.runDue(harness.now());
  harness.advance(631_300);
  await harness.scheduler.runDue(harness.now());
  harness.advance(700_000);
  record = await harness.observer.observe(action('corrected', 700_000));
  assert.equal(record.lifecycle.state, 'revoked');
  assert.ok(record.events.some(({ action: name }) => name === 'corrected'));
});

test('durable candidate binding is rechecked before quarantine and commit', async () => {
  const bindingInputs = [];
  const callbackBindings = [];
  const harness = observerHarness({
    resolveCandidate: async (input) => {
      bindingInputs.push(input);
      return {
        schemaVersion: 1,
        revisionSha256: input.revisionSha256,
        candidateSha256: CANDIDATE,
        bindingReceiptSha256: BINDING_RECEIPT,
      };
    },
    promoteCandidate: async (input) => {
      callbackBindings.push(input.candidateBindingReceiptSha256);
      return { receiptSha256: QUARANTINE_RECEIPT };
    },
    commitCandidate: async (input) => {
      callbackBindings.push(input.candidateBindingReceiptSha256);
      return { receiptSha256: COMMIT_RECEIPT };
    },
  });
  await harness.observer.observe(acceptedEvents());
  harness.advance(31_300);
  await harness.scheduler.runDue(harness.now());
  harness.advance(631_300);
  await harness.scheduler.runDue(harness.now());

  assert.equal(bindingInputs.length, 3);
  assert.deepEqual(callbackBindings, [BINDING_RECEIPT, BINDING_RECEIPT]);
  assert.equal((await harness.observer.read(REVISION)).candidateBindingReceiptSha256, BINDING_RECEIPT);
});

test('a changed candidate binding fails closed before any quarantine side effect', async () => {
  let resolutions = 0;
  let promotions = 0;
  const harness = observerHarness({
    resolveCandidate: async (input) => {
      resolutions += 1;
      return {
        schemaVersion: 1,
        revisionSha256: input.revisionSha256,
        candidateSha256: CANDIDATE,
        bindingReceiptSha256: (resolutions === 1 ? '8' : '9').repeat(64),
      };
    },
    promoteCandidate: async () => {
      promotions += 1;
      return { receiptSha256: QUARANTINE_RECEIPT };
    },
  });
  await harness.observer.observe(acceptedEvents());
  harness.advance(31_300);
  await harness.scheduler.runDue(harness.now());

  const record = await harness.observer.read(REVISION);
  assert.equal(promotions, 0);
  assert.equal(record.lifecycle.state, 'observing');
  assert.equal(record.operation.status, 'pending');
  assert.equal(record.dueAtMs, 36_300);
});

test('diagnostics receive only a stable error code and hash, never raw callback data', async () => {
  const diagnostics = [];
  const sensitive = 'secret-token https://private.example/user/transcript';
  const harness = observerHarness({
    onError: async (receipt) => diagnostics.push(receipt),
    promoteCandidate: async () => { throw new Error(sensitive); },
  });
  await harness.observer.observe(acceptedEvents());
  harness.advance(31_300);
  await harness.scheduler.runDue(harness.now());

  assert.equal(diagnostics.length, 1);
  const serialized = JSON.stringify(diagnostics[0]);
  assert.doesNotMatch(serialized, /secret-token|private\.example|transcript/u);
  assert.equal(diagnostics[0].errorCode, 'observer-operation-failed');
  assert.match(diagnostics[0].errorSha256, /^[a-f0-9]{64}$/u);
  assert.equal(Object.hasOwn(diagnostics[0], 'error'), false);
  assert.equal(Object.hasOwn(diagnostics[0], 'message'), false);
  assert.equal(Object.hasOwn(diagnostics[0], 'stack'), false);
});
