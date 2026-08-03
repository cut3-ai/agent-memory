import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runCbaPipeline } from '../src/cba/pipeline.js';

test('pipeline writes private reconstructions and a URL-free lazy public library', async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-cba-'));
  const workspace = {
    width: 100,
    height: 100,
    fps: 10,
    length: 100,
    tracks: [{
      id: 'track-1',
      type: 'composition',
      start: 0,
      length: 100,
      source: `
        const GeneratedComposition = () => {
          const frame = useCurrentFrame();
          return <Img src="https://private.example/image.jpg" style={{opacity: frame / 10}} />;
        };
      `,
    }],
  };
  const result = await runCbaPipeline(`${JSON.stringify(workspace)}\n`, {
    cycles: 2,
    publicRoot: path.join(temporaryRoot, 'public'),
    privateRoot: path.join(temporaryRoot, 'private'),
    repoRoot: path.resolve('.'),
  });
  assert.equal(result.final.semanticExactCompositions, 1);
  assert.equal(result.final.deterministicReplay.matchingCycles, 2);
  assert.equal(result.final.acceptedForAutomaticMemoryPromotion, false);
  assert.equal(result.privacy.rawUrls, 0);
  const publicIndex = await fs.readFile(
    path.join(result.publicRunDirectory, 'index.generated.js'),
    'utf8',
  );
  assert.match(publicIndex, /import\(/);
  assert.doesNotMatch(publicIndex, /private\.example/);
  const privateProgram = await fs.readFile(
    path.join(result.privateRunDirectory, 'reconstructions', 'composition-001', 'program.js'),
    'utf8',
  );
  assert.match(privateProgram, /private\.example/);
});
