import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseProfileLabArgs } from '../src/experiment/profile-lab-cli.js';
import {
  DEFAULT_PROFILE_LAB_ATTEMPT_ID,
  normalizeProfileLabAttemptId,
  runCbaProfileLab,
} from '../src/experiment/profile-lab.js';
import { CBA_V2_SEARCH_SPACE } from '../src/cba-v2/features.js';
import { createProviderCallIntent } from '../src/model-lab/intent.js';

test('profile lab CLI accepts and preserves explicit paid-call confirmation', () => {
  const options = parseProfileLabArgs([
    '--input',
    'workspaces.jsonl',
    '--confirm-paid-calls',
    'RUN_20_KIMI_AND_4_ANTHROPIC_CALLS',
    '--attempt-id',
    'live-20260804-a',
  ]);
  assert.equal(options.input, 'workspaces.jsonl');
  assert.equal(
    options.confirmPaidCalls,
    'RUN_20_KIMI_AND_4_ANTHROPIC_CALLS',
  );
  assert.equal(options.attemptId, 'live-20260804-a');
});

test('profile lab attempt identifiers are bounded and path-safe', () => {
  assert.equal(normalizeProfileLabAttemptId(), DEFAULT_PROFILE_LAB_ATTEMPT_ID);
  assert.equal(normalizeProfileLabAttemptId('retry_20260804-01'), 'retry_20260804-01');
  for (const invalid of [
    '',
    '../retry',
    'retry/next',
    'retry\\next',
    '-retry',
    'retry-',
    'Retry',
    'a'.repeat(65),
  ]) {
    assert.throws(() => normalizeProfileLabAttemptId(invalid), /attempt id/u);
  }
});

test('profile lab runs twenty real profiles and publishes privacy-safe receipts', async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-profile-lab-'));
  const sources = [0, 1, 2].map((index) => JSON.stringify({
    width: 100,
    height: 100,
    fps: 10,
    tracks: [{
      type: 'composition',
      length: 100,
      source: `export function GeneratedComposition(){const marker=${index};const frame=useCurrentFrame();return <div style={{opacity:interpolate(frame,[0,1],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})}}/>}`,
    }],
  })).join('\n');
  const calls = { kimi: 0, anthropic: 0 };
  const result = await runCbaProfileLab(`${sources}\n`, {
    repositoryRoot: path.resolve('.'),
    outputRoot,
    writeIndex: false,
    kimi: fakeProvider('kimi', calls),
    anthropic: fakeProvider('anthropic', calls),
  });

  assert.equal(result.manifest.profilesEvaluated, 20);
  assert.equal(result.manifest.attemptId, DEFAULT_PROFILE_LAB_ATTEMPT_ID);
  assert.match(result.manifest.checkpointBindingSha256, /^[a-f0-9]{64}$/u);
  assert.equal(result.manifest.searchSpaceSize, 96);
  assert.equal(result.manifest.profilesPreEvaluated, true);
  assert.equal(result.manifest.preflightProfilesEvaluated, 1);
  assert.equal(result.manifest.preflightPassed, true);
  assert.equal(result.manifest.sequentialReveal, true);
  assert.equal(result.manifest.roundsCompleted, 20);
  assert.equal(result.manifest.checkpointMode, 'append-only-hash-chain');
  assert.equal(result.manifest.providerResponsesCheckpointedBeforeContinuation, true);
  assert.equal(result.manifest.providerIntentPersistedBeforeNetwork, true);
  assert.equal(result.manifest.ambiguousProviderReplayPolicy,
    'fail-closed-manual-reconciliation');
  assert.equal(result.manifest.transparentAmbiguousResume, false);
  assert.equal(result.manifest.atomicCheckpointPublication, true);
  assert.equal(result.manifest.phaseCheckpoints, 44);
  assert.deepEqual(result.manifest.providerCallsCumulative, {
    kimi: 20,
    anthropic: 4,
    total: 24,
  });
  assert.equal(result.manifest.modelAcceptanceAuthority, false);
  assert.equal(result.manifest.modelSearchOrderAuthority, true);
  assert.equal(result.manifest.finalSelectionOrderIndependentWithinEvaluatedSet, true);
  assert.equal(result.manifest.privateMaterialSentToProviders, false);
  assert.equal(result.manifest.splitOutcomeBlind, true);
  assert.equal(result.manifest.validationRole, 'workspace-disjoint-tuning-split');
  assert.equal(result.manifest.heldoutRole, 'process-heldout-within-known-development-corpus');
  assert.equal(result.manifest.externalUnseenCorpusEvaluated, false);
  assert.equal(result.manifest.pixelComparisonPerformed, false);
  assert.equal(result.rounds.history.length, 20);
  assert.equal(new Set(result.rounds.history.map((entry) => entry.candidateId)).size, 20);
  assert.equal(calls.kimi, 20);
  assert.equal(calls.anthropic, 4);
  assert.equal(result.privacy.valid, true);
  assert.equal(result.navigationIndex.format, 'cut3-static-library-index');
  assert.ok(result.navigationIndex.entries.every((entry) => (
    Object.keys(entry).sort().join(',') === 'export,kind,source,type'
  )));
  const publicBytes = JSON.stringify(result);
  assert.doesNotMatch(publicBytes, /GeneratedComposition|data-i|private rationale|https?:/iu);
  const files = await fs.readdir(result.experimentDirectory);
  assert.ok(files.includes('final-metrics.json'));
  assert.ok(files.includes('rounds.json'));
  assert.ok(files.includes('preflight.json'));
  assert.equal(files.includes('README.md'), false);
  const candidates = JSON.parse(await fs.readFile(
    path.join(result.experimentDirectory, 'candidates.json'),
    'utf8',
  ));
  assert.equal(candidates.length, 96);
  assert.equal(candidates.filter(({ evaluated }) => evaluated).length, 20);
  const allFeature = candidates.find(({ features }) => Object.values(features).every(Boolean));
  assert.equal(result.rounds.history[0].candidateId, allFeature.id);
  assert.equal(allFeature.evaluatedInPreflight, true);
  assert.equal(allFeature.evaluatedInSearch, true);
  const preflight = JSON.parse(await fs.readFile(
    path.join(result.experimentDirectory, 'preflight.json'),
    'utf8',
  ));
  assert.equal(Object.hasOwn(preflight, 'publicBrickCaseDelta'), false);
  assert.ok(preflight.validationPublicBrickCaseDelta > 0);
  assert.equal(preflight.generalizationSplit, 'validation');
  const artifactManifest = JSON.parse(await fs.readFile(
    path.join(result.experimentDirectory, 'artifact-manifest.json'),
    'utf8',
  ));
  assert.equal(artifactManifest.artifacts.some(({ file }) => file === 'privacy.json'), true);
  const checkpointChain = JSON.parse(await fs.readFile(
    path.join(result.experimentDirectory, 'checkpoint-chain.json'),
    'utf8',
  ));
  assert.equal(checkpointChain.phaseCheckpoints, 44);
  assert.equal(checkpointChain.checkpointSha256s.length, 44);
  assert.equal(checkpointChain.attemptId, DEFAULT_PROFILE_LAB_ATTEMPT_ID);
  assert.equal(checkpointChain.bindingSha256, result.manifest.checkpointBindingSha256);

  const resumedCalls = { kimi: 0, anthropic: 0 };
  const resumed = await runCbaProfileLab(`${sources}\n`, {
    repositoryRoot: path.resolve('.'),
    outputRoot,
    writeIndex: false,
    kimi: fakeProvider('kimi', resumedCalls),
    anthropic: fakeProvider('anthropic', resumedCalls),
  });
  assert.equal(resumed.experimentId, result.experimentId);
  assert.deepEqual(resumedCalls, { kimi: 0, anthropic: 0 });

  const unresolvedIntent = createProviderCallIntent({
    schemaVersion: 1,
    bindingSha256: result.manifest.checkpointBindingSha256,
    previousCheckpointSha256: checkpointChain.lastCheckpointSha256,
    expectedCheckpointSequence: checkpointChain.phaseCheckpoints + 1,
    round: 20,
    provider: 'kimi',
    expectedPhase: 'kimi-selected',
    advisoryRequestSha256: digest('unresolved-old-attempt'),
  });
  const oldProgressDirectory = path.join(
    outputRoot,
    '.profile-lab-progress',
    result.manifest.checkpointBindingSha256,
  );
  const oldIntentPath = path.join(oldProgressDirectory, 'provider-inflight.json');
  await fs.writeFile(oldIntentPath, `${JSON.stringify(unresolvedIntent)}\n`, 'utf8');
  const oldIntentBytes = await fs.readFile(oldIntentPath, 'utf8');
  const isolatedCalls = { kimi: 0, anthropic: 0 };
  await assert.rejects(runCbaProfileLab(`${sources}\n`, {
    repositoryRoot: path.resolve('.'),
    outputRoot,
    writeIndex: false,
    attemptId: 'retry-after-ambiguous-a',
    kimi: failingProvider('kimi', isolatedCalls),
    anthropic: fakeProvider('anthropic', isolatedCalls),
  }));
  assert.deepEqual(isolatedCalls, { kimi: 1, anthropic: 0 });
  assert.equal(await fs.readFile(oldIntentPath, 'utf8'), oldIntentBytes);
});

test('preflight-evaluated all-feature anchor remains a final candidate when models avoid it', async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-profile-anchor-'));
  const sources = [0, 1, 2].map((index) => JSON.stringify({
    width: 100,
    height: 100,
    fps: 10,
    tracks: [{
      type: 'composition',
      length: 100,
      source: `export function GeneratedComposition(){const marker=${index};const frame=useCurrentFrame();return <div style={{opacity:interpolate(frame,[0,1],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})}}/>}`,
    }],
  })).join('\n');
  const allFeatureId = CBA_V2_SEARCH_SPACE.find(({ features }) => (
    Object.values(features).every(Boolean)
  )).id;
  const calls = { kimi: 0, anthropic: 0 };
  const result = await runCbaProfileLab(`${sources}\n`, {
    repositoryRoot: path.resolve('.'),
    outputRoot,
    writeIndex: false,
    attemptId: 'anchor-order-test',
    kimi: fakeProvider('kimi', calls, (ids) => ids.find((id) => id !== allFeatureId)),
    anthropic: fakeProvider('anthropic', calls),
  });

  assert.equal(result.rounds.history.some(({ candidateId }) => candidateId === allFeatureId), false);
  assert.equal(result.manifest.attemptId, 'anchor-order-test');
  assert.equal(result.selection.eligibleProfileIds.includes(allFeatureId), true);
  const candidates = JSON.parse(await fs.readFile(
    path.join(result.experimentDirectory, 'candidates.json'),
    'utf8',
  ));
  const anchor = candidates.find(({ id }) => id === allFeatureId);
  assert.equal(anchor.evaluated, true);
  assert.equal(anchor.evaluatedInPreflight, true);
  assert.equal(anchor.evaluatedInSearch, false);
  assert.ok(anchor.metrics);
  assert.deepEqual(calls, { kimi: 20, anthropic: 4 });
});

test('profile lab fails its free all-feature preflight before any provider call', async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-profile-preflight-'));
  const input = `${JSON.stringify({
    width: 100,
    height: 100,
    fps: 1,
    tracks: [{
      type: 'composition',
      length: 1000,
      source: 'export function GeneratedComposition(){return <div data-private="x" style={{color:"red"}}/>}',
    }],
  })}\n`;
  const calls = { kimi: 0, anthropic: 0 };
  await assert.rejects(runCbaProfileLab(input, {
    repositoryRoot: path.resolve('.'),
    outputRoot,
    writeIndex: false,
    kimi: fakeProvider('kimi', calls),
    anthropic: fakeProvider('anthropic', calls),
  }), /public-brick preflight/);
  assert.deepEqual(calls, { kimi: 0, anthropic: 0 });
});

function fakeProvider(provider, calls, chooseCandidate = (ids) => ids[0]) {
  return Object.freeze({
    provider,
    model: `${provider}-test`,
    async generateStructured(request) {
      calls[provider] += 1;
      const candidateId = chooseCandidate(request.schema.properties.candidateId.enum);
      const data = { candidateId };
      const result = {
        provider,
        model: `${provider}-test`,
        usage: {
          inputTokens: 2,
          outputTokens: 1,
          cachedTokens: 0,
          cacheCreationTokens: 0,
          totalTokens: 3,
        },
        requestSha256: digest(JSON.stringify(request)),
        responseSha256: digest(JSON.stringify(data)),
      };
      Object.defineProperty(result, 'data', { value: data, enumerable: false });
      return Object.freeze(result);
    },
  });
}

function failingProvider(provider, calls) {
  return Object.freeze({
    provider,
    model: `${provider}-test`,
    async generateStructured() {
      calls[provider] += 1;
      throw new Error('simulated ambiguous provider outcome');
    },
  });
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
