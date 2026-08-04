import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runCbaProfileLab } from '../src/experiment/profile-lab.js';

test('profile lab runs twenty real profiles and publishes privacy-safe receipts', async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-profile-lab-'));
  const sources = [0, 1, 2].map((index) => JSON.stringify({
    width: 100,
    height: 100,
    fps: 10,
    tracks: [{
      type: 'composition',
      length: 100,
      source: `export function GeneratedComposition(){const frame=useCurrentFrame();return <div data-i={${index}} style={{opacity:interpolate(frame,[0,1],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})}}/>}`,
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
  assert.equal(result.manifest.roundsCompleted, 20);
  assert.equal(result.manifest.modelDecisionAuthority, false);
  assert.equal(result.manifest.privateMaterialSentToProviders, false);
  assert.equal(result.manifest.pixelComparisonPerformed, false);
  assert.equal(result.rounds.history.length, 20);
  assert.equal(new Set(result.rounds.history.map((entry) => entry.candidateId)).size, 20);
  assert.equal(calls.kimi, 20);
  assert.equal(calls.anthropic, 4);
  assert.equal(result.privacy.valid, true);
  assert.equal(result.navigationIndex.format, 'cut3-static-library-index');
  assert.deepEqual(Object.keys(result.navigationIndex.entries[0]).sort(), [
    'export', 'kind', 'source', 'type',
  ]);
  const publicBytes = JSON.stringify(result);
  assert.doesNotMatch(publicBytes, /GeneratedComposition|data-i|private rationale|https?:/iu);
  const files = await fs.readdir(result.experimentDirectory);
  assert.ok(files.includes('final-metrics.json'));
  assert.ok(files.includes('rounds.json'));
  assert.equal(files.includes('README.md'), false);
});

function fakeProvider(provider, calls) {
  return Object.freeze({
    provider,
    model: `${provider}-test`,
    async generateStructured(request) {
      calls[provider] += 1;
      const candidateId = request.schema.properties.candidateId.enum[0];
      const data = { candidateId, rationale: 'private rationale never persisted' };
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

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
