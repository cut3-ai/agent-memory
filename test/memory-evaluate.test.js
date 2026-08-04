import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateMemoryCandidate } from '../src/memory/evaluate.js';

test('kind mapping is never reported as exact reconstruction', () => {
  const census = {
    counts: {
      compositions: 2,
      jsxUnitWitnesses: 4,
      controlUnitWitnesses: 1,
      visualSinks: 3,
      atomicBehaviourWitnesses: 4,
      rejectedNonVisualHelperDeclarations: 2,
    },
    units: [{ kind: 'unit.text', witnesses: 4, workspaces: 2 }],
    behaviours: [
      { kind: 'behaviour.opacity', witnesses: 3, workspaces: 2 },
      { kind: 'unmapped:behaviour.canvas.draw', witnesses: 1, workspaces: 1 },
    ],
  };
  const index = {
    units: [{ kind: 'unit.text' }],
    behaviours: [{ kind: 'behaviour.opacity' }],
  };
  const metrics = evaluateMemoryCandidate(census, index, { valid: true, violations: [] });
  assert.equal(metrics.mapping.behaviourKindMappingCoverage, 0.75);
  assert.equal(metrics.reconstruction.semanticExactCompositions, 0);
  assert.equal(metrics.reconstruction.oneToOneVerified, false);
  assert.equal(metrics.residuals.sourceDependentVisualComputations, 4);
  assert.equal(metrics.release.acceptedForAutomaticPromotion, false);
});
