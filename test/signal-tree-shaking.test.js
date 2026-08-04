import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { build } from 'esbuild';

test('named Signal ESM imports tree-shake unrelated animation implementations', async () => {
  const result = await build({
    stdin: {
      contents: [
        "import { Computed, ContextValue } from './core/signals.js';",
        "export const halfFrame = new Computed('divide', [new ContextValue('frame'), 2]);",
      ].join('\n'),
      resolveDir: path.resolve('.'),
      sourcefile: 'signal-entry.js',
    },
    bundle: true,
    format: 'esm',
    minify: false,
    treeShaking: true,
    write: false,
  });
  const output = result.outputFiles[0].text;
  assert.match(output, /Computed operands must be an array/u);
  assert.match(output, /Unknown frame context field/u);
  assert.doesNotMatch(output, /Interpolation requires matching ranges/u);
  assert.doesNotMatch(output, /Keyframes requires at least two points/u);
  assert.doesNotMatch(output, /signal\.spring|signal\.oscillation/u);
  assert.doesNotMatch(output, /ThreeScene|@react-three|remotion-three/iu);
});
