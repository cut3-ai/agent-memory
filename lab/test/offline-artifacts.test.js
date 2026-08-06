import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import { inspectPublicArtifact } from '../../src/memory/privacy.js';

test('tracked offline archive contains only privacy-safe aggregate metadata', async () => {
  const archive = JSON.parse(await fs.readFile(
    new URL('../artifacts/offline-runs.json', import.meta.url),
    'utf8',
  ));
  assert.deepEqual(inspectPublicArtifact(archive), []);
});
