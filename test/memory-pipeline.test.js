import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runMemoryPipeline } from '../src/memory/pipeline.js';

test('memory pipeline emits deterministic privacy-safe independent-census artifacts', async (t) => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-memory-run-'));
  t.after(() => fs.rm(outputRoot, { recursive: true, force: true }));
  const source = [
    'const GeneratedComposition = () => {',
    '  const frame = useCurrentFrame();',
    '  return <AbsoluteFill><div style={{opacity: interpolate(frame, [0, 9], [0, 1])}} /></AbsoluteFill>;',
    '};',
  ].join('\n');
  const input = `${JSON.stringify({
    width: 100,
    height: 100,
    fps: 10,
    length: 1_000,
    tracks: [{ id: 'private-id', type: 'composition', start: 0, length: 1_000, source }],
  })}\n`;

  const first = await runMemoryPipeline(input, {
    repositoryRoot: process.cwd(),
    outputRoot,
    writeIndex: false,
  });
  const second = await runMemoryPipeline(input, {
    repositoryRoot: process.cwd(),
    outputRoot,
    writeIndex: false,
  });
  assert.equal(first.runId, second.runId);
  assert.equal(first.privacy.valid, true);
  assert.equal(first.classValidation.valid, true);
  assert.equal(first.manifest.reconstructionProven, false);
  assert.equal(first.manifest.automaticPromotionAllowed, false);
  assert.equal(first.manifest.refinementAuthority, 'experiment-profile-lab');
  assert.equal(first.index.entries.some((entry) => entry.kind === 'behaviour.opacity'), true);
  for (const entry of first.index.entries) {
    assert.deepEqual(Object.keys(entry).sort(), ['export', 'kind', 'source', 'type']);
  }

  const files = (await fs.readdir(first.runDirectory)).sort();
  assert.deepEqual(files, [
    'artifact-manifest.json',
    'class-validation.json',
    'corpus.json',
    'index.snapshot.json',
    'manifest.json',
    'metrics.json',
    'privacy.json',
  ]);
  const bytes = await Promise.all(files.map((file) => fs.readFile(path.join(first.runDirectory, file), 'utf8')));
  assert.doesNotMatch(bytes.join('\n'), /private-id|GeneratedComposition|https?:\/\//iu);
  const artifactManifest = JSON.parse(await fs.readFile(
    path.join(first.runDirectory, 'artifact-manifest.json'),
    'utf8',
  ));
  assert.equal(artifactManifest.artifacts.some(({ file }) => file === 'privacy.json'), true);
});
