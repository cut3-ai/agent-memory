import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { inspectPublicArtifact } from '../../src/memory/privacy.js';
import { runModelAdvisoryLab } from '../model-lab/loop.js';

test('crash after Kimi receipt resumes at evaluation without replaying the paid call', async () => {
  const calls = { kimi: 0, anthropic: 0, evaluations: 0 };
  const binding = 'a'.repeat(64);
  let durableSelection;
  const common = options({
    rounds: 2,
    reviewCheckpoints: [2],
    binding,
    calls,
  });

  await assert.rejects(runModelAdvisoryLab({
    ...common,
    evaluateCandidate(candidate) {
      calls.evaluations += 1;
      return candidate.metrics;
    },
    async onPhaseCheckpoint(checkpoint) {
      if (checkpoint.round === 1 && checkpoint.phase === 'kimi-selected') {
        durableSelection = checkpoint;
        throw new Error('crash-after-durable-kimi-selection');
      }
    },
  }), /kimi-checkpoint/);

  assert.equal(durableSelection.phase, 'kimi-selected');
  assert.deepEqual(calls, { kimi: 1, anthropic: 0, evaluations: 0 });
  assert.deepEqual(inspectPublicArtifact(durableSelection), []);
  assert.doesNotMatch(JSON.stringify(durableSelection), /private rationale|transcript|https?:/iu);

  const result = await runModelAdvisoryLab({
    ...common,
    resumeCheckpoint: durableSelection,
    evaluateCandidate(candidate) {
      calls.evaluations += 1;
      return candidate.metrics;
    },
    onPhaseCheckpoint() {},
  });

  assert.equal(result.roundsCompleted, 2);
  assert.deepEqual(calls, { kimi: 2, anthropic: 1, evaluations: 2 });
  assert.equal(result.phaseCheckpointsCompleted, 5);
  assert.equal(new Set(result.history.map(({ candidateId }) => candidateId)).size, 2);
});

test('crash after Anthropic receipt resumes finalization without replaying either provider', async () => {
  const calls = { kimi: 0, anthropic: 0, evaluations: 0, finalized: 0 };
  const binding = 'b'.repeat(64);
  let durableReview;
  const common = options({
    rounds: 1,
    reviewCheckpoints: [1],
    binding,
    calls,
  });

  await assert.rejects(runModelAdvisoryLab({
    ...common,
    evaluateCandidate(candidate) {
      calls.evaluations += 1;
      return candidate.metrics;
    },
    async onPhaseCheckpoint(checkpoint) {
      if (checkpoint.phase === 'anthropic-reviewed') {
        durableReview = checkpoint;
        throw new Error('crash-after-durable-anthropic-review');
      }
    },
  }), /anthropic-checkpoint/);

  assert.equal(durableReview.phase, 'anthropic-reviewed');
  assert.deepEqual(calls, {
    kimi: 1,
    anthropic: 1,
    evaluations: 1,
    finalized: 0,
  });
  assert.deepEqual(inspectPublicArtifact(durableReview), []);

  const result = await runModelAdvisoryLab({
    ...common,
    resumeCheckpoint: durableReview,
    evaluateCandidate() {
      calls.evaluations += 1;
      throw new Error('evaluation must not replay');
    },
    onPhaseCheckpoint() {
      throw new Error('no new phase should be written');
    },
    onRound() {
      calls.finalized += 1;
    },
  });

  assert.equal(result.roundsCompleted, 1);
  assert.deepEqual(calls, {
    kimi: 1,
    anthropic: 1,
    evaluations: 1,
    finalized: 1,
  });
  assert.equal(result.lastCheckpointSha256, durableReview.checkpointSha256);
});

test('multiple provider-boundary crashes still consume exactly the cumulative 20 plus 4 budget', async () => {
  const calls = { kimi: 0, anthropic: 0, evaluations: 0 };
  const common = options({
    rounds: 20,
    reviewCheckpoints: [5, 10, 15, 20],
    binding: 'c'.repeat(64),
    calls,
  });
  const journal = [];
  let resumeCheckpoint;

  await assert.rejects(runModelAdvisoryLab({
    ...common,
    evaluateCandidate(candidate) {
      calls.evaluations += 1;
      return candidate.metrics;
    },
    async onPhaseCheckpoint(checkpoint) {
      journal.push(checkpoint);
      if (checkpoint.round === 7 && checkpoint.phase === 'kimi-selected') {
        resumeCheckpoint = checkpoint;
        throw new Error('crash-after-durable-kimi-selection');
      }
    },
  }), /kimi-checkpoint/);

  assert.deepEqual(calls, { kimi: 7, anthropic: 1, evaluations: 6 });

  await assert.rejects(runModelAdvisoryLab({
    ...common,
    resumeCheckpoint,
    evaluateCandidate(candidate) {
      calls.evaluations += 1;
      return candidate.metrics;
    },
    async onPhaseCheckpoint(checkpoint) {
      journal.push(checkpoint);
      if (checkpoint.round === 10 && checkpoint.phase === 'anthropic-reviewed') {
        resumeCheckpoint = checkpoint;
        throw new Error('crash-after-durable-anthropic-review');
      }
    },
  }), /anthropic-checkpoint/);

  assert.deepEqual(calls, { kimi: 10, anthropic: 2, evaluations: 10 });

  const result = await runModelAdvisoryLab({
    ...common,
    resumeCheckpoint,
    evaluateCandidate(candidate) {
      calls.evaluations += 1;
      return candidate.metrics;
    },
    onPhaseCheckpoint(checkpoint) {
      journal.push(checkpoint);
    },
  });

  assert.deepEqual(calls, { kimi: 20, anthropic: 4, evaluations: 20 });
  assert.equal(result.roundsCompleted, 20);
  assert.equal(result.phaseCheckpointsCompleted, 44);
  assert.deepEqual(journal.map(({ sequence }) => sequence),
    Array.from({ length: 44 }, (_, index) => index + 1));
  assert.equal(journal.filter(({ phase }) => phase === 'kimi-selected').length, 20);
  assert.equal(journal.filter(({ phase }) => phase === 'evaluated').length, 20);
  assert.equal(journal.filter(({ phase }) => phase === 'anthropic-reviewed').length, 4);
  assert.ok(journal.every((checkpoint, index) => (
    checkpoint.previousCheckpointSha256
      === (index === 0 ? null : journal[index - 1].checkpointSha256)
  )));
  assert.deepEqual(inspectPublicArtifact(journal), []);
});

function options({ rounds, reviewCheckpoints, binding, calls }) {
  const candidates = Array.from({ length: Math.max(rounds + 2, 3) }, (_, index) => ({
    id: `p_${String(index + 1).padStart(8, '0')}`,
    metrics: { failures: rounds - index, publicCoverage: index / 10 },
  }));
  return {
    rounds,
    reviewCheckpoints,
    candidates,
    initialMetrics: { failures: rounds + 1, publicCoverage: 0 },
    kimi: provider('kimi', calls),
    anthropic: provider('anthropic', calls),
    revealCandidateIds({ remainingCandidateIds }) {
      return remainingCandidateIds.slice(0, 3);
    },
    acceptCandidate: () => false,
    checkpointBindingSha256: binding,
  };
}

function provider(name, calls) {
  return {
    provider: name,
    model: `${name}-test`,
    async generateStructured(request) {
      calls[name] += 1;
      const candidateId = request.schema.properties.candidateId.enum[0];
      const data = { candidateId };
      const result = {
        provider: name,
        model: `${name}-test`,
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cachedTokens: 0,
          cacheCreationTokens: 0,
          totalTokens: 2,
        },
        requestSha256: sha(JSON.stringify(request)),
        responseSha256: sha(JSON.stringify(data)),
      };
      Object.defineProperty(result, 'data', { value: data, enumerable: false });
      return result;
    },
  };
}

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
