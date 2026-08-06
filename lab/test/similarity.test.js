import assert from 'node:assert/strict';
import test from 'node:test';

import { completeLinkClusters, observationSimilarity } from '../legacy/similarity.js';

function fake(id, tokens, renderMode = 'dom') {
  return {
    observationId: `obs-${id}`,
    sourceHash: `source-${id}`,
    signals: [],
    code: {
      parseStatus: 'valid',
      structuralHash: `structure-${id}`,
      fingerprintTokens: tokens.map((token) => [token, 1]),
      features: { renderMode, families: [], motionPrimitives: {}, jsxTags: {} },
      dependencies: { counts: {} },
    },
  };
}

test('complete-link avoids A-B-C single-link chaining', () => {
  const observations = [
    fake('a', ['rare:x', 'rare:y']),
    fake('b', ['rare:x', 'rare:y', 'rare:z']),
    fake('c', ['rare:y', 'rare:z']),
  ];
  const clusters = completeLinkClusters(observations, { threshold: 0.8 });

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].uniqueSources, 2);
});

test('renderer backend is a hard clustering gate', () => {
  const dom = fake('dom', ['call:interpolate'], 'dom');
  const canvas = fake('canvas', ['call:interpolate'], 'canvas2d');
  canvas.code.structuralHash = dom.code.structuralHash;

  assert.equal(observationSimilarity(dom, canvas), 0);
});
