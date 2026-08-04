import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertPublicArtifact,
  inspectPublicArtifact,
} from '../src/memory/privacy.js';

test('public artifact validation rejects raw user payloads', () => {
  const value = {
    safeHash: 'a'.repeat(64),
    nested: {
      prompt: 'private',
      detail: 'https://private.invalid/media.mp4',
    },
  };
  assert.deepEqual(inspectPublicArtifact(value).map((entry) => entry.code).sort(), [
    'forbidden-key',
    'raw-url',
  ]);
  assert.throws(() => assertPublicArtifact(value), /privacy validation/);
});
