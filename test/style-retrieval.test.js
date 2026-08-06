import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNavigationIndex, validateNavigationIndex } from '../src/library/index.js';
import { retrieveStyleMemories } from '../src/memory/retrieval.js';

const editorial = memoryEntry('unit.signal-editorial', {
  family: 'signal-editorial',
  composition: ['asymmetric-stack', 'edge-anchored'],
  typography: ['condensed-uppercase', 'oversized-copy'],
  palette: ['ink-black', 'paper-white', 'signal-red'],
  rendering: ['hard-shadow', 'paper-grain'],
  motion: ['two-beat-snap'],
});
const quiet = memoryEntry('unit.quiet-editorial', {
  family: 'quiet-editorial',
  composition: ['edge-anchored', 'layered-composition'],
  typography: ['oversized-copy', 'tight-leading'],
  palette: ['ink-black', 'paper-white'],
  rendering: ['paper-grain', 'soft-shadow'],
  motion: ['eased-curve'],
});

test('retrieval ranks exact family and explains exact cue coverage without confidence', () => {
  const results = retrieveStyleMemories({ entries: [quiet, editorial, {
    ...quiet,
    kind: 'unit.infrastructure-only',
    role: 'infrastructure',
  }] }, {
    family: 'signal-editorial',
    composition: ['edge-anchored'],
    typography: ['condensed-uppercase'],
    palette: ['signal-red'],
    rendering: ['paper-grain'],
    motion: ['two-beat-snap'],
  });

  assert.equal(results[0].entry.kind, 'unit.signal-editorial');
  assert.equal(results[0].match.family, true);
  assert.deepEqual(results[0].match.cues.motion, ['two-beat-snap']);
  assert.deepEqual(results[0].match.missing.motion, []);
  assert.equal(Object.hasOwn(results[0], 'confidence'), false);
  assert.equal(results.some(({ entry }) => entry.role !== 'memory'), false);
});

test('retrieval can reuse another family through exact visual cues and is deterministic', () => {
  const query = {
    composition: ['edge-anchored'],
    typography: ['oversized-copy'],
    palette: ['paper-white'],
    rendering: ['paper-grain'],
    motion: ['eased-curve'],
  };
  const first = retrieveStyleMemories([editorial, quiet], query);
  const second = retrieveStyleMemories([quiet, editorial], query);
  assert.deepEqual(first, second);
  assert.equal(first[0].entry.kind, 'unit.quiet-editorial');
  assert.deepEqual(first[0].match.missing.motion, []);
});

test('exact derived font and color cues distinguish otherwise similar styles', () => {
  const redCondensed = memoryEntry('unit.red-condensed', {
    ...editorial.scent,
    typography: [...editorial.scent.typography, 'font-barlow-condensed'].sort(),
    palette: [...editorial.scent.palette, 'color-ff3b30'].sort(),
  });
  const blueImpact = memoryEntry('unit.blue-impact', {
    ...editorial.scent,
    typography: [...editorial.scent.typography, 'font-impact'].sort(),
    palette: [...editorial.scent.palette, 'color-2563eb'].sort(),
  });
  const results = retrieveStyleMemories([blueImpact, redCondensed], {
    typography: ['font-barlow-condensed'],
    palette: ['color-ff3b30'],
  });

  assert.deepEqual(results.map(({ entry }) => entry.kind), ['unit.red-condensed']);
  assert.deepEqual(results[0].match.cues.typography, ['font-barlow-condensed']);
  assert.deepEqual(results[0].match.cues.palette, ['color-ff3b30']);
});

test('retrieval includes standalone authored transitions with motion-only scent', () => {
  const transition = {
    ...memoryEntry('behaviour.editorial-snap', {
      family: 'signal-editorial',
      composition: [],
      typography: [],
      palette: [],
      rendering: [],
      motion: ['two-beat-snap'],
    }),
    type: 'behaviour',
    source: 'behaviours/editorial-snap.js',
  };
  const results = retrieveStyleMemories([transition, editorial], {
    motion: ['two-beat-snap'],
  });
  assert.deepEqual(results.map(({ entry }) => entry.kind), [
    'behaviour.editorial-snap',
    'unit.signal-editorial',
  ]);
});

test('retrieval rejects invented fields, prose cues, empty queries, and invalid limits', () => {
  assert.throws(() => retrieveStyleMemories([], {}), /family or at least one cue/u);
  assert.throws(() => retrieveStyleMemories([], { mood: ['cool'] }), /unsupported key/u);
  assert.throws(() => retrieveStyleMemories([], { motion: ['very smooth'] }), /kebab-case/u);
  assert.throws(() => retrieveStyleMemories([], { family: 'signal-editorial' }, { limit: 0 }), /limit/u);
});

test('navigation schema accepts motion-only Behaviour scent and rejects invented visual axes', () => {
  const transition = {
    ...memoryEntry('behaviour.editorial-snap', {
      family: 'signal-editorial',
      composition: [],
      typography: [],
      palette: [],
      rendering: [],
      motion: ['two-beat-snap'],
    }),
    type: 'behaviour',
    source: 'behaviours/editorial-snap.js',
  };
  const valid = buildNavigationIndex({ publicEntries: [transition] });
  assert.equal(validateNavigationIndex(valid).ok, true);

  const invalid = buildNavigationIndex({
    publicEntries: [{
      ...transition,
      scent: { ...transition.scent, typography: ['condensed-uppercase'] },
    }],
  });
  assert.equal(validateNavigationIndex(invalid).ok, false);
});

function memoryEntry(kind, scent) {
  return {
    kind,
    type: 'unit',
    role: 'memory',
    source: `units/${kind.slice(5)}.js`,
    export: 'Example',
    scent,
  };
}
