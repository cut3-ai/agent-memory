import assert from 'node:assert/strict';
import test from 'node:test';

import { OnlineMemoryAgent } from '@cut3/agent-memory/online/OnlineMemoryAgent';
import { buildMemoryAgentPrompt } from '@cut3/agent-memory/online/agent-prompt';
import { decideOnlineMemory } from '@cut3/agent-memory/online/outcome';

const successful = Object.freeze([
  { type: 'compile.succeeded' },
  { type: 'render.succeeded' },
  { type: 'workspace.next-task-unchanged' },
]);

test('online policy has three exact outcomes and negative feedback has absolute priority', () => {
  assert.deepEqual(decideOnlineMemory([]), { action: 'wait', reason: 'no-success-signal' });
  assert.deepEqual(decideOnlineMemory([{ type: 'workspace.exported' }]), {
    action: 'wait',
    reason: 'awaiting-compile-and-render',
  });
  assert.deepEqual(decideOnlineMemory(successful), {
    action: 'save',
    reason: 'workspace.next-task-unchanged',
  });
  assert.deepEqual(decideOnlineMemory([...successful, { type: 'revision.corrected' }]), {
    action: 'discard',
    reason: 'revision.corrected',
  });
});

test('coding and review happen in an isolated candidate before its reviewed artifact is applied', async () => {
  const log = [];
  const sourceSha256 = digest('a');
  const authority = inMemoryAuthorityTestDouble({ log });
  authority.register('revision-7', sourceSha256, successful);
  const candidates = candidateWorkspaceTestDouble({ log });
  const agent = new OnlineMemoryAgent({
    candidateWorkspace: candidates,
    revisionAuthority: authority,
    reviewResult: async (input) => {
      log.push('review');
      assert.deepEqual(input.artifact.changedFiles, [
        'src/behaviours/example/SpecificLook.js',
      ]);
      return acceptedReview(input);
    },
    runAgent: async (input) => {
      log.push('agent');
      assert.equal(input.workspace.kind, 'isolated-test-workspace');
      assert.notEqual(input.workspace, candidates.mainWorkspaceSentinel);
      assert.equal(input.source.sha256, sourceSha256);
      assert.equal(input.source.immutable, true);
      assert.match(input.prompt, /never create Opacity, Scale, Translate/iu);
      input.workspace.changedFiles.push('src/behaviours/example/SpecificLook.js');
    },
  });

  const revision = { revisionId: 'revision-7', sourceSha256 };
  const first = await agent.handleRevision(revision);
  const duplicate = await agent.handleRevision(revision);

  assert.equal(first.decision.action, 'save');
  assert.equal(first.review.checks.semantic.passed, true);
  assert.equal(first.applyReceipt.candidateDigest, first.candidate.candidateDigest);
  assert.equal(duplicate.skipped, 'completed');
  assert.equal(candidates.applyCount, 1);
  assert.ok(log.indexOf('review') < log.indexOf('authority:commit-authorized'));
  assert.ok(log.indexOf('authority:commit-authorized') < log.indexOf('candidate:apply'));
  assert.ok(log.indexOf('candidate:apply') < log.indexOf('authority:complete'));
  assert.ok(log.indexOf('authority:complete') < log.indexOf('candidate:dispose:committed'));

  await authority.appendEvent('revision-7', { type: 'revision.corrected' });
  assert.equal(authority.isReusable('revision-7'), false);
  assert.deepEqual(authority.retractionFor('revision-7'), {
    persistedCommit: first.applyReceipt.persistedCommit,
    status: 'pending',
  });
  assert.ok(log.includes('authority:retraction-required'));
});

test('a durable negative tombstone arriving during generation aborts and prevents seal/apply', async () => {
  const log = [];
  const sourceSha256 = digest('b');
  const authority = inMemoryAuthorityTestDouble({ log });
  authority.register('revision-negative', sourceSha256, successful);
  const candidates = candidateWorkspaceTestDouble({ log });
  let generationStarted;
  const started = new Promise((resolve) => { generationStarted = resolve; });
  const agent = new OnlineMemoryAgent({
    candidateWorkspace: candidates,
    heartbeatIntervalMs: 2,
    heartbeatTimeoutMs: 5,
    leaseDurationMs: 50,
    revisionAuthority: authority,
    reviewResult: async (input) => acceptedReview(input),
    runAgent: async ({ abortSignal }) => {
      generationStarted();
      await new Promise((resolve) => abortSignal.addEventListener('abort', resolve, { once: true }));
    },
  });

  const pending = agent.handleRevision({ revisionId: 'revision-negative', sourceSha256 });
  await started;
  await authority.appendEvent('revision-negative', { type: 'revision.corrected' });
  const result = await pending;

  assert.deepEqual(result.decision, { action: 'discard', reason: 'revision.corrected' });
  assert.equal(result.canceled, 'revision.corrected');
  assert.equal(candidates.sealCount, 0);
  assert.equal(candidates.applyCount, 0);
  assert.ok(log.includes('candidate:dispose:abandoned'));
  assert.ok(log.includes('authority:release-denied'));
});

test('a rejected candidate is disposed and conditionally released so a clean retry can commit', async () => {
  const log = [];
  const sourceSha256 = digest('c');
  const authority = inMemoryAuthorityTestDouble({ log });
  authority.register('revision-retry', sourceSha256, successful);
  const candidates = candidateWorkspaceTestDouble({ log });
  let accept = false;
  const agent = new OnlineMemoryAgent({
    candidateWorkspace: candidates,
    revisionAuthority: authority,
    reviewResult: async (input) => (
      accept ? acceptedReview(input) : { accepted: false, reason: 'semantic-style-review-failed' }
    ),
    runAgent: async () => {},
  });
  const revision = { revisionId: 'revision-retry', sourceSha256 };

  await assert.rejects(agent.handleRevision(revision), /semantic-style-review-failed/u);
  assert.equal(candidates.applyCount, 0);
  assert.ok(log.includes('candidate:dispose:abandoned'));
  assert.ok(log.includes('authority:released'));

  accept = true;
  const retry = await agent.handleRevision(revision);
  assert.equal(retry.review.accepted, true);
  assert.equal(candidates.applyCount, 1);
  assert.equal(authority.fencingToken('revision-retry'), 2);
});

test('a negative tombstone recorded after review is caught by the pre-commit authority check', async () => {
  const sourceSha256 = digest('6');
  const authority = inMemoryAuthorityTestDouble();
  authority.register('revision-after-review', sourceSha256, successful);
  const candidates = candidateWorkspaceTestDouble();
  const agent = new OnlineMemoryAgent({
    candidateWorkspace: candidates,
    revisionAuthority: authority,
    reviewResult: async (input) => {
      await authority.appendEvent('revision-after-review', { type: 'revision.regenerated' });
      return acceptedReview(input);
    },
    runAgent: async () => {},
  });

  const result = await agent.handleRevision({
    revisionId: 'revision-after-review',
    sourceSha256,
  });
  assert.deepEqual(result.decision, { action: 'discard', reason: 'revision.regenerated' });
  assert.equal(candidates.sealCount, 1);
  assert.equal(candidates.applyCount, 0);
});

test('an expired lease is recovered with a higher fence and the stale worker cannot apply or release it', async () => {
  const log = [];
  const sourceSha256 = digest('d');
  const authority = inMemoryAuthorityTestDouble({ log });
  authority.register('revision-fenced', sourceSha256, successful);
  const candidates = candidateWorkspaceTestDouble({ log });
  let releaseFirst;
  let firstStarted;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const started = new Promise((resolve) => { firstStarted = resolve; });
  let run = 0;
  const agent = new OnlineMemoryAgent({
    candidateWorkspace: candidates,
    heartbeatIntervalMs: 90,
    heartbeatTimeoutMs: 5,
    leaseDurationMs: 100,
    revisionAuthority: authority,
    reviewResult: async (input) => acceptedReview(input),
    runAgent: async () => {
      run += 1;
      if (run === 1) {
        firstStarted();
        await firstGate;
      }
    },
  });
  const revision = { revisionId: 'revision-fenced', sourceSha256 };

  const stale = agent.handleRevision(revision);
  await started;
  authority.advance(101);
  const recovered = await agent.handleRevision(revision);
  assert.equal(recovered.applyReceipt.applied, true);
  assert.equal(authority.fencingToken('revision-fenced'), 2);

  releaseFirst();
  await assert.rejects(stale, /lease lost|checkpoint-rejected/iu);
  assert.equal(candidates.applyCount, 1);
  assert.ok(log.includes('authority:release-denied'));
});

test('accepted=true without exact structured receipts cannot publish and remains retryable', async () => {
  const sourceSha256 = digest('e');
  const authority = inMemoryAuthorityTestDouble();
  authority.register('revision-receipt', sourceSha256, successful);
  const candidates = candidateWorkspaceTestDouble();
  let valid = false;
  const agent = new OnlineMemoryAgent({
    candidateWorkspace: candidates,
    revisionAuthority: authority,
    reviewResult: async (input) => {
      if (valid) return acceptedReview(input);
      return { accepted: true, checks: ['compile', 'tests', 'render', 'privacy', 'semantic'] };
    },
    runAgent: async () => {},
  });
  const revision = { revisionId: 'revision-receipt', sourceSha256 };

  await assert.rejects(agent.handleRevision(revision), /review receipt/iu);
  assert.equal(candidates.applyCount, 0);
  valid = true;
  const retry = await agent.handleRevision(revision);
  assert.equal(retry.review.candidateDigest, retry.candidate.candidateDigest);
  assert.equal(retry.review.candidateCommit, retry.candidate.candidateCommit);
  assert.equal(candidates.applyCount, 1);
});

test('different revisions use different candidates and publication callbacks are serialized', async () => {
  const sourceA = digest('1');
  const sourceB = digest('2');
  const authority = inMemoryAuthorityTestDouble();
  authority.register('revision-a', sourceA, successful);
  authority.register('revision-b', sourceB, successful);
  let activeApplies = 0;
  let maximumActiveApplies = 0;
  const candidates = candidateWorkspaceTestDouble({
    async onApply() {
      activeApplies += 1;
      maximumActiveApplies = Math.max(maximumActiveApplies, activeApplies);
      await new Promise((resolve) => setTimeout(resolve, 3));
      activeApplies -= 1;
    },
  });
  const workspaces = [];
  const agent = new OnlineMemoryAgent({
    candidateWorkspace: candidates,
    revisionAuthority: authority,
    reviewResult: async (input) => acceptedReview(input),
    runAgent: async ({ workspace }) => { workspaces.push(workspace); },
  });

  await Promise.all([
    agent.handleRevision({ revisionId: 'revision-a', sourceSha256: sourceA }),
    agent.handleRevision({ revisionId: 'revision-b', sourceSha256: sourceB }),
  ]);
  assert.equal(workspaces.length, 2);
  assert.notEqual(workspaces[0], workspaces[1]);
  assert.notEqual(workspaces[0].candidateId, workspaces[1].candidateId);
  assert.equal(maximumActiveApplies, 1);
});

test('the overall deadline releases a job whose coding agent never settles', async () => {
  const log = [];
  const sourceSha256 = digest('7');
  const authority = inMemoryAuthorityTestDouble({ log });
  authority.register('revision-deadline', sourceSha256, successful);
  const candidates = candidateWorkspaceTestDouble({ log });
  let agentSignal;
  const agent = new OnlineMemoryAgent({
    candidateWorkspace: candidates,
    cleanupTimeoutMs: 20,
    heartbeatIntervalMs: 3,
    heartbeatTimeoutMs: 3,
    leaseDurationMs: 30,
    operationTimeoutMs: 25,
    revisionAuthority: authority,
    reviewResult: async (input) => acceptedReview(input),
    runAgent: async ({ abortSignal }) => {
      agentSignal = abortSignal;
      await new Promise(() => {});
    },
  });

  const startedAt = Date.now();
  await assert.rejects(
    agent.handleRevision({ revisionId: 'revision-deadline', sourceSha256 }),
    /operation deadline exceeded/iu,
  );
  assert.ok(Date.now() - startedAt < 500, 'deadline must settle the coordinator promptly');
  assert.equal(agentSignal.aborted, true);
  assert.equal(candidates.applyCount, 0);
  assert.ok(log.includes('candidate:dispose:abandoned'));
  assert.ok(log.includes('authority:released'));
});

test('a hung heartbeat aborts the active job within its own RPC timeout', async () => {
  const log = [];
  const sourceSha256 = digest('8');
  const authority = inMemoryAuthorityTestDouble({ log });
  authority.register('revision-heartbeat-timeout', sourceSha256, successful);
  let heartbeatSignal;
  authority.heartbeat = async ({ abortSignal }) => {
    heartbeatSignal = abortSignal;
    await new Promise(() => {});
  };
  const candidates = candidateWorkspaceTestDouble({ log });
  const agent = new OnlineMemoryAgent({
    candidateWorkspace: candidates,
    cleanupTimeoutMs: 20,
    heartbeatIntervalMs: 2,
    heartbeatTimeoutMs: 5,
    leaseDurationMs: 30,
    operationTimeoutMs: 100,
    revisionAuthority: authority,
    reviewResult: async (input) => acceptedReview(input),
    runAgent: async ({ abortSignal }) => {
      await new Promise((resolve) => abortSignal.addEventListener('abort', resolve, { once: true }));
    },
  });

  await assert.rejects(
    agent.handleRevision({ revisionId: 'revision-heartbeat-timeout', sourceSha256 }),
    /heartbeat timed out/iu,
  );
  assert.equal(heartbeatSignal.aborted, true);
  assert.equal(candidates.applyCount, 0);
  assert.ok(log.includes('candidate:dispose:abandoned'));
});

test('stopping after a successful apply never waits for an unresponsive heartbeat', async () => {
  const log = [];
  const sourceSha256 = digest('9');
  const authority = inMemoryAuthorityTestDouble({ log });
  authority.register('revision-heartbeat-stop', sourceSha256, successful);
  let heartbeatStarted;
  let heartbeatSignal;
  const started = new Promise((resolve) => { heartbeatStarted = resolve; });
  authority.heartbeat = async ({ abortSignal }) => {
    heartbeatSignal = abortSignal;
    heartbeatStarted();
    await new Promise(() => {});
  };
  const candidates = candidateWorkspaceTestDouble({
    log,
    async onApply() { await started; },
  });
  const agent = new OnlineMemoryAgent({
    candidateWorkspace: candidates,
    cleanupTimeoutMs: 20,
    heartbeatIntervalMs: 2,
    heartbeatTimeoutMs: 20,
    leaseDurationMs: 50,
    operationTimeoutMs: 100,
    revisionAuthority: authority,
    reviewResult: async (input) => acceptedReview(input),
    runAgent: async () => {},
  });

  const result = await agent.handleRevision({
    revisionId: 'revision-heartbeat-stop',
    sourceSha256,
  });
  assert.equal(result.applyReceipt.applied, true);
  assert.equal(heartbeatSignal.aborted, true);
  assert.equal(candidates.applyCount, 1);
  assert.ok(log.includes('candidate:dispose:committed'));
});

test('agent prompt describes an isolated code-writing candidate, not AST admission or main access', () => {
  const prompt = buildMemoryAgentPrompt();
  assert.match(prompt, /isolated candidate change set is the output/iu);
  assert.match(prompt, /writable main memory checkout is never mounted/iu);
  assert.match(prompt, /global @cut3\/agent-memory/iu);
  assert.match(prompt, /real nested Unit tree/iu);
  assert.match(prompt, /compile, tests, render, privacy and semantic evidence/iu);
  assert.match(prompt, /preserves:/iu);
  assert.match(prompt, /context\.frame for Shot-local motion/iu);
  assert.match(prompt, /plain ESM builder function/iu);
  assert.match(prompt, /do not validate, classify or guard runtime input inside the builder/iu);
  assert.match(prompt, /unit\.addBehaviour\(entry\)/u);
  assert.match(prompt, /not a Composition class, descriptor, schema or JSON response/iu);
  assert.doesNotMatch(prompt, /confidence|probability|source parser/iu);
  assert.doesNotMatch(prompt, /task summary|composition module/iu);
});

function digest(character) {
  return character.repeat(64);
}

function acceptedReview({ candidate }) {
  const evidence = (name, summary) => ({
    candidateCommit: candidate.candidateCommit,
    candidateDigest: candidate.candidateDigest,
    evidenceId: `${name}-${candidate.candidateId}`,
    summary,
  });
  return {
    accepted: true,
    candidateCommit: candidate.candidateCommit,
    candidateDigest: candidate.candidateDigest,
    checks: {
      compile: { passed: true, evidence: evidence('compile', 'npm package import compiled') },
      privacy: { passed: true, evidence: evidence('privacy', 'candidate diff privacy scan receipt') },
      render: { passed: true, evidence: evidence('render', 'representative frame render receipt') },
      semantic: { passed: true, evidence: evidence('semantic', 'style reuse review receipt') },
      tests: { passed: true, evidence: evidence('tests', 'node test receipt') },
    },
    reviewId: `review-${candidate.candidateId}`,
    sourceSha256: candidate.baseSourceSha256,
  };
}

/**
 * Faithful single-process authority test double. Production must implement the
 * same operations with durable storage and a distributed publication lock.
 */
function inMemoryAuthorityTestDouble({ log = [] } = {}) {
  const records = new Map();
  let now = 1_000;
  let publicationTail = Promise.resolve();

  function recordForId(revisionId) {
    const record = records.get(revisionId);
    if (!record) throw new Error(`unknown test revision: ${revisionId}`);
    return record;
  }

  function recordForKey(revisionKey) {
    const record = [...records.values()].find((item) => item.revisionKey === revisionKey);
    if (!record) throw new Error(`unknown test revision key: ${revisionKey}`);
    return record;
  }

  function currentDecision(record) {
    return decideOnlineMemory(record.events);
  }

  function validateCurrent(record, request) {
    const decision = currentDecision(record);
    if (decision.action !== 'save') {
      return { active: false, decision, reason: decision.reason };
    }
    const lease = record.lease;
    if (
      !lease
      || lease.token !== request.token
      || lease.fencingToken !== request.fencingToken
      || lease.expiresAt <= now
    ) return { active: false, reason: 'stale-or-expired-lease' };
    return { active: true, decision, sourceSha256: record.sourceSha256 };
  }

  return {
    register(revisionId, sourceSha256, events) {
      records.set(revisionId, {
        completed: false,
        events: [...events],
        fence: 0,
        lease: undefined,
        revisionId,
        revisionKey: `${revisionId}:${sourceSha256}`,
        sourceSha256,
      });
    },

    advance(milliseconds) {
      now += milliseconds;
    },

    async appendEvent(revisionId, event) {
      // Event ingestion and publication share the same linearization tail.
      await publicationTail;
      const record = recordForId(revisionId);
      record.events.push(event);
      if (currentDecision(record).action === 'discard') {
        record.lease = undefined;
        if (record.completed) {
          record.invalidated = true;
          record.retraction = {
            persistedCommit: record.persistedCommit,
            status: 'pending',
          };
          log.push('authority:retraction-required');
        }
      }
      log.push(`authority:event:${event.type}`);
    },

    fencingToken(revisionId) {
      return recordForId(revisionId).fence;
    },

    isReusable(revisionId) {
      const record = recordForId(revisionId);
      return record.completed && !record.invalidated;
    },

    retractionFor(revisionId) {
      const obligation = recordForId(revisionId).retraction;
      return obligation ? { ...obligation } : undefined;
    },

    async acquire(request) {
      const record = recordForId(request.revisionId);
      if (
        request.revisionKey !== record.revisionKey
        || request.sourceSha256 !== record.sourceSha256
      ) throw new Error('source binding mismatch in test authority');
      const decision = currentDecision(record);
      if (decision.action === 'discard') return { decision, status: 'discarded' };
      if (decision.action === 'wait') return { decision, status: 'waiting' };
      if (record.completed) return { decision, status: 'completed' };
      if (record.lease?.expiresAt > now) return { decision, status: 'busy' };
      record.fence += 1;
      record.lease = {
        expiresAt: now + request.leaseDurationMs,
        fencingToken: record.fence,
        token: `lease-${request.revisionId}-${record.fence}`,
      };
      log.push(`authority:acquired:${record.fence}`);
      return {
        decision,
        key: record.revisionKey,
        lease: { ...record.lease },
        source: {
          checkoutId: `checkout-${request.revisionId}`,
          immutable: true,
          sha256: record.sourceSha256,
        },
        status: 'acquired',
      };
    },

    async heartbeat(request) {
      const record = recordForKey(request.revisionKey);
      const status = validateCurrent(record, request);
      if (!status.active) return status;
      record.lease.expiresAt = now + request.leaseDurationMs;
      log.push('authority:heartbeat');
      return { ...status, expiresAt: record.lease.expiresAt };
    },

    async checkpoint(request) {
      const status = validateCurrent(recordForKey(request.revisionKey), request);
      log.push(status.active ? 'authority:checkpoint' : 'authority:checkpoint-denied');
      return status;
    },

    async commit(request) {
      let releasePublication;
      const previous = publicationTail;
      publicationTail = new Promise((resolve) => { releasePublication = resolve; });
      await previous;
      try {
        const record = recordForKey(request.revisionKey);
        const status = validateCurrent(record, request);
        if (!status.active) return { ...status, committed: false };
        if (
          request.sourceSha256 !== record.sourceSha256
          || request.review.candidateDigest !== request.candidateDigest
          || request.review.candidateCommit !== request.candidateCommit
        ) return { committed: false, reason: 'candidate-binding-mismatch' };
        log.push('authority:commit-authorized');
        const applyReceipt = await request.apply();
        record.completed = true;
        record.completedCandidateDigest = request.candidateDigest;
        record.persistedCommit = applyReceipt.persistedCommit;
        record.lease = undefined;
        log.push('authority:complete');
        return {
          applyReceipt,
          candidateCommit: request.candidateCommit,
          candidateDigest: request.candidateDigest,
          committed: true,
        };
      } finally {
        releasePublication();
      }
    },

    async release(request) {
      const record = recordForKey(request.revisionKey);
      if (
        record.lease?.token !== request.token
        || record.lease?.fencingToken !== request.fencingToken
      ) {
        log.push('authority:release-denied');
        return false;
      }
      record.lease = undefined;
      log.push('authority:released');
      return true;
    },
  };
}

function candidateWorkspaceTestDouble({ log = [], onApply = async () => {} } = {}) {
  let candidateNumber = 0;
  const mainWorkspaceSentinel = Object.freeze({ kind: 'main-must-never-be-sent' });
  const counters = { apply: 0, seal: 0 };
  return {
    mainWorkspaceSentinel,
    get applyCount() { return counters.apply; },
    get sealCount() { return counters.seal; },

    async open({ source }) {
      candidateNumber += 1;
      const candidateId = `candidate-${candidateNumber}`;
      log.push('candidate:open');
      return {
        baseSourceSha256: source.sha256,
        candidateId,
        isolation: 'isolated-candidate',
        workspace: {
          baseSourceSha256: source.sha256,
          candidateId,
          changedFiles: [],
          kind: 'isolated-test-workspace',
        },
      };
    },

    async seal({ candidateId, workspace }) {
      counters.seal += 1;
      log.push('candidate:seal');
      const ordinal = Number(candidateId.slice(candidateId.lastIndexOf('-') + 1));
      const hexadecimal = String((ordinal % 9) + 1);
      return {
        artifact: Object.freeze({
          candidateId,
          changedFiles: Object.freeze([...workspace.changedFiles]),
        }),
        baseSourceSha256: workspace.baseSourceSha256 ?? undefined,
        candidateCommit: hexadecimal.repeat(40),
        candidateDigest: hexadecimal.repeat(64),
        candidateId,
      };
    },

    async apply(input) {
      counters.apply += 1;
      log.push('candidate:apply');
      await onApply(input);
      return {
        applied: true,
        candidateCommit: input.candidateCommit,
        candidateDigest: input.candidateDigest,
        persistedCommit: 'f'.repeat(40),
      };
    },

    async dispose({ committed }) {
      log.push(`candidate:dispose:${committed ? 'committed' : 'abandoned'}`);
    },
  };
}
