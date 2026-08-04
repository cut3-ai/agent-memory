import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateReconstructionReceipts } from '../src/memory/reconstruction.js';

test('an empty corpus is not reported as vacuous one-to-one proof', () => {
  const result = evaluateReconstructionReceipts({ compositions: [] }, []);
  assert.equal(result.semanticOneToOneVerified, false);
  assert.equal(result.pixelOneToOneVerified, false);
  assert.equal(result.oneToOneVerified, false);
});
