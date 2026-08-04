import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCorpusCensus } from '../src/memory/corpus.js';
import { inspectPublicArtifact } from '../src/memory/privacy.js';

test('corpus census separates visual sinks from atomic Behaviours', () => {
  const source = [
    'const clamp = (value, min, max) => Math.min(max, Math.max(min, value));',
    'const GeneratedComposition = () => {',
    '  const frame = useCurrentFrame();',
    '  return <AbsoluteFill><div style={{',
    '    opacity: interpolate(frame, [0, 9], [0, 1]),',
    '    transform: `scale(${frame}) translateX(${frame}px)`,',
    '  }} /></AbsoluteFill>;',
    '};',
  ].join('\n');
  const input = `${JSON.stringify({
    width: 100,
    height: 100,
    fps: 10,
    length: 1_000,
    tracks: [{
      id: 'private-track-id',
      type: 'composition',
      start: 0,
      length: 1_000,
      source,
      meta: { prompt: 'private prompt' },
    }],
  })}\n`;

  const first = buildCorpusCensus(input);
  const second = buildCorpusCensus(input);
  assert.equal(first.censusSha256, second.censusSha256);
  assert.equal(first.counts.compositions, 1);
  assert.equal(first.counts.visualSinks, 2);
  assert.equal(first.counts.atomicBehaviourWitnesses, 3);
  assert.equal(first.counts.rejectedNonVisualHelperDeclarations, 1);
  assert.deepEqual(
    first.behaviours.filter((entry) => entry.memoryKind).map((entry) => entry.memoryKind),
    ['behaviour.opacity', 'behaviour.scale', 'behaviour.translate'],
  );
  assert.deepEqual(inspectPublicArtifact(first), []);
  assert.doesNotMatch(JSON.stringify(first), /private prompt|private-track-id/);
});
