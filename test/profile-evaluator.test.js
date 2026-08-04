import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateCbaProfile,
  isProfileImprovement,
  modelMetrics,
} from '../src/experiment/profile-evaluator.js';
import { createWorkspaceSplit, parseWorkspaceDataset } from '../src/experiment/split.js';

const input = `${JSON.stringify({
  width: 100,
  height: 100,
  fps: 10,
  tracks: [{
    type: 'composition',
    length: 1000,
    source: 'export function GeneratedComposition(){const frame=useCurrentFrame();return <div style={{opacity:interpolate(frame,[0,9],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})}}/>}',
  }],
})}\n`;

test('profile evaluator returns aggregate all-frame metrics without corpus material', () => {
  const dataset = parseWorkspaceDataset(input);
  const split = createWorkspaceSplit(dataset);
  const result = evaluateCbaProfile(dataset, split, {
    id: 'baseline',
    features: {
      opacityTween: false,
      opacityFormula: false,
      scaleFormula: false,
      translateFormula: false,
      rotateFormula: false,
    },
  }, { splits: ['train'] });
  assert.equal(result.cases, 1);
  assert.equal(result.frames, 10);
  assert.equal(result.exactCases, 1);
  assert.equal(result.pixelComparedFrames, 0);
  assert.equal(result.pixelExact, false);
  assert.doesNotMatch(JSON.stringify(result), /GeneratedComposition|interpolate|source|transcript|https?:/iu);
});

test('acceptance is deterministic and models receive only aggregate counters', () => {
  const baseline = modelMetrics(
    metric({ matchedFrames: 9, exactCases: 0, reusableBehaviours: 0 }),
    metric({ matchedFrames: 9, exactCases: 0, reusableBehaviours: 0 }),
  );
  const better = modelMetrics(
    metric({ matchedFrames: 10, exactCases: 1, reusableBehaviours: 1 }),
    metric({ matchedFrames: 10, exactCases: 1, reusableBehaviours: 1 }),
  );
  const worse = modelMetrics(
    metric({ matchedFrames: 10, exactCases: 1, reusableBehaviours: 100 }),
    metric({ matchedFrames: 8, exactCases: 0, reusableBehaviours: 100 }),
  );
  assert.equal(isProfileImprovement(better, baseline), true);
  assert.equal(isProfileImprovement(worse, baseline), false);
  const fidelityTrade = modelMetrics(
    metric({ matchedFrames: 10, exactCases: 0, reusableBehaviours: 100 }),
    metric({ matchedFrames: 10, exactCases: 0, renderErrorFrames: 1, reusableBehaviours: 100 }),
  );
  assert.equal(isProfileImprovement(fidelityTrade, baseline), false);
  assert.doesNotMatch(JSON.stringify(better), /source|url|transcript|prompt|text|code|workspace/iu);
});

function metric(overrides = {}) {
  return {
    cases: 1,
    frames: 10,
    exactCases: 1,
    matchedFrames: 10,
    mismatchedFrames: 0,
    compileFailures: 0,
    renderErrorFrames: 0,
    reusableBehaviours: 0,
    reusableKinds: 0,
    reusableUnits: 0,
    reusableUnitKinds: 0,
    localBehaviours: 0,
    nativeUnits: 1,
    warnings: 0,
    invalidOwners: 0,
    ...overrides,
  };
}
