import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { writeJsonAtomically } from '../experiment/durable-storage.js';
import {
  AmbiguousProviderCallError,
  persistProviderCallIntent,
  PROVIDER_INFLIGHT_FILE,
  reconcileProviderCallIntent,
  settleProviderCallIntent,
} from '../experiment/profile-progress.js';
import { createProviderCallIntent } from '../model-lab/intent.js';
import { runModelAdvisoryLab } from '../model-lab/loop.js';

test('atomic JSON publication leaves no partial temp file and preserves immutable targets', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-atomic-json-'));
  const target = path.join(directory, 'checkpoint.json');
  await writeJsonAtomically(target, { schemaVersion: 1, value: 1 });
  await writeJsonAtomically(target, { schemaVersion: 1, value: 1 });

  assert.deepEqual(JSON.parse(await fs.readFile(target, 'utf8')), {
    schemaVersion: 1,
    value: 1,
  });
  await assert.rejects(
    writeJsonAtomically(target, { schemaVersion: 1, value: 2 }),
    /immutable-experiment-artifact-collision/,
  );
  assert.deepEqual((await fs.readdir(directory)).sort(), ['checkpoint.json']);
});

test('response-before-checkpoint intent blocks restart before a duplicate provider call', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-ambiguous-intent-'));
  const binding = 'a'.repeat(64);
  const calls = { kimi: 0 };
  const common = oneRoundOptions(binding, calls, directory);

  await assert.rejects(runModelAdvisoryLab({
    ...common,
    async onPhaseCheckpoint() {
      throw new Error('crash-before-durable-checkpoint');
    },
  }), (error) => error.stage === 'kimi-checkpoint');
  assert.equal(calls.kimi, 1);
  assert.equal(await exists(path.join(directory, PROVIDER_INFLIGHT_FILE)), true);

  await assert.rejects(
    reconcileProviderCallIntent(directory, { bindingSha256: binding, checkpoints: [] }),
    (error) => error instanceof AmbiguousProviderCallError
      && error.code === 'provider-call-outcome-ambiguous',
  );
  await assert.rejects(runModelAdvisoryLab({
    ...common,
    onPhaseCheckpoint() {},
  }), (error) => error.stage === 'kimi-selection');
  assert.equal(calls.kimi, 1);
});

test('provider intent publication is no-replace under concurrent starts', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-concurrent-intent-'));
  const intent = createProviderCallIntent({
    schemaVersion: 1,
    bindingSha256: 'c'.repeat(64),
    previousCheckpointSha256: null,
    expectedCheckpointSequence: 1,
    round: 1,
    provider: 'kimi',
    expectedPhase: 'kimi-selected',
    advisoryRequestSha256: 'd'.repeat(64),
  });
  const results = await Promise.allSettled([
    persistProviderCallIntent(directory, intent),
    persistProviderCallIntent(directory, intent),
  ]);

  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  const rejected = results.find(({ status }) => status === 'rejected');
  assert.ok(rejected.reason instanceof AmbiguousProviderCallError);
  assert.equal(rejected.reason.code, 'provider-intent-already-present');
});

test('checkpoint-before-intent-clear is recovered without replaying the provider', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-settled-intent-'));
  const binding = 'b'.repeat(64);
  const calls = { kimi: 0 };
  let durableCheckpoint;
  const common = oneRoundOptions(binding, calls, directory);

  await assert.rejects(runModelAdvisoryLab({
    ...common,
    async onPhaseCheckpoint(checkpoint) {
      durableCheckpoint = checkpoint;
      await writeJsonAtomically(path.join(directory, 'phase-001.json'), checkpoint);
    },
    async onProviderCheckpointed() {
      throw new Error('crash-before-intent-clear');
    },
  }), (error) => error.stage === 'kimi-intent-settlement');
  assert.equal(calls.kimi, 1);
  assert.equal(await exists(path.join(directory, PROVIDER_INFLIGHT_FILE)), true);

  const reconciliation = await reconcileProviderCallIntent(directory, {
    bindingSha256: binding,
    checkpoints: [durableCheckpoint],
  });
  assert.equal(reconciliation.status, 'settled-checkpoint-recovered');
  assert.equal(await exists(path.join(directory, PROVIDER_INFLIGHT_FILE)), false);

  const resumed = await runModelAdvisoryLab({
    ...common,
    resumeCheckpoint: durableCheckpoint,
    onPhaseCheckpoint() {},
  });
  assert.equal(resumed.roundsCompleted, 1);
  assert.equal(calls.kimi, 1);
});

function oneRoundOptions(binding, calls, directory) {
  return {
    rounds: 1,
    reviewCheckpoints: [],
    candidates: [{ id: 'p_00000001', metrics: { failures: 0, quality: 1 } }],
    initialMetrics: { failures: 1, quality: 0 },
    checkpointBindingSha256: binding,
    kimi: provider(calls),
    evaluateCandidate: (candidate) => candidate.metrics,
    acceptCandidate: () => true,
    onProviderIntent: (intent) => persistProviderCallIntent(directory, intent),
    onProviderCheckpointed: (intent, checkpoint) => (
      settleProviderCallIntent(directory, intent, checkpoint)
    ),
  };
}

function provider(calls) {
  return {
    provider: 'kimi',
    model: 'kimi-test',
    async generateStructured(request) {
      calls.kimi += 1;
      const data = {
        candidateId: request.schema.properties.candidateId.enum[0],
      };
      const result = {
        provider: 'kimi',
        model: 'kimi-test',
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

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
