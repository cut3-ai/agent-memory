import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateCbaProfile,
  isProfileImprovement,
  modelMetrics,
} from '../src/experiment/profile-evaluator.js';
import { CBA_V2_BASELINE_PROFILE } from '../src/cba-v2/features.js';
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
  const fallbackTrade = modelMetrics(
    metric({ matchedFrames: 10, exactCases: 1, localBehaviours: 1, staticLocalBehaviourPotential: 1 }),
    metric({ matchedFrames: 10, exactCases: 1, localBehaviours: 1, staticLocalBehaviourPotential: 1 }),
  );
  assert.equal(isProfileImprovement(fallbackTrade, baseline), false);
  const nativePseudoReuse = modelMetrics(
    metric({ matchedFrames: 9, exactCases: 0, mismatchedFrames: 1, reusableBehaviours: 100 }),
    metric({ matchedFrames: 9, exactCases: 0, mismatchedFrames: 1, reusableBehaviours: 100 }),
  );
  assert.equal(isProfileImprovement(nativePseudoReuse, baseline), false);
  const publicReplacement = modelMetrics(
    metric({
      nativeUnits: 0,
      publicUnitOccurrences: 1,
      publicUnitKinds: 1,
      publicUnitCoverage: 1,
      publicBrickStructuralExactCases: 1,
      fallbackExactCases: 0,
      fallbackMatchedCases: 0,
    }),
    metric({
      nativeUnits: 0,
      publicUnitOccurrences: 1,
      publicUnitKinds: 1,
      publicUnitCoverage: 1,
      publicBrickStructuralExactCases: 1,
      fallbackExactCases: 0,
      fallbackMatchedCases: 0,
    }),
  );
  assert.equal(isProfileImprovement(publicReplacement, baseline), true);
  const publicReplacementWithDiagnostics = modelMetrics(
    metric({
      nativeUnits: 0,
      publicUnitOccurrences: 1,
      publicUnitKinds: 1,
      publicUnitCoverage: 1,
      publicBrickStructuralExactCases: 1,
      fallbackExactCases: 0,
      fallbackMatchedCases: 0,
      warnings: 12,
    }),
    metric({
      nativeUnits: 0,
      publicUnitOccurrences: 1,
      publicUnitKinds: 1,
      publicUnitCoverage: 1,
      publicBrickStructuralExactCases: 1,
      fallbackExactCases: 0,
      fallbackMatchedCases: 0,
      warnings: 12,
    }),
  );
  assert.equal(isProfileImprovement(publicReplacementWithDiagnostics, baseline), true);
  const decomposedFallback = modelMetrics(
    metric({
      nativeUnits: 0,
      staticNativeUnitPotential: 0,
      localBehaviours: 5,
      staticLocalBehaviourPotential: 1,
      publicUnitOccurrences: 1,
      publicUnitKinds: 1,
      publicUnitCoverage: 1,
    }),
    metric({
      nativeUnits: 0,
      staticNativeUnitPotential: 0,
      localBehaviours: 5,
      staticLocalBehaviourPotential: 1,
      publicUnitOccurrences: 1,
      publicUnitKinds: 1,
      publicUnitCoverage: 1,
    }),
  );
  assert.equal(isProfileImprovement(decomposedFallback, baseline), true);
  assert.doesNotMatch(JSON.stringify(better), /source|url|transcript|prompt|text|code|workspace/iu);
});

test('unsupported effects remain an explicit residual category', () => {
  const dataset = parseWorkspaceDataset(`${JSON.stringify({
    width: 100,
    height: 100,
    fps: 1,
    tracks: [{
      type: 'composition',
      length: 1000,
      source: 'export function GeneratedComposition(){const c=document.createElement("canvas");c.getContext("2d");return <canvas/>}',
    }],
  })}\n`);
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
  assert.equal(result.unsupportedEffectCases, 1);
  assert.equal(result.failureCases.UnsupportedEffects, 1);
});

test('public-brick structural exact requires runtime public classes and indexed kinds', () => {
  const dataset = parseWorkspaceDataset(`${JSON.stringify({
    width: 100,
    height: 100,
    fps: 1,
    tracks: [{
      type: 'composition',
      length: 1000,
      source: 'export function GeneratedComposition(){return <div style={{backgroundColor:"red"}}/>}',
    }],
  })}\n`);
  const split = createWorkspaceSplit(dataset);
  const profile = {
    id: 'baseline',
    features: {
      opacityTween: false,
      opacityFormula: false,
      scaleFormula: false,
      translateFormula: false,
      rotateFormula: false,
    },
  };
  const assured = evaluateCbaProfile(dataset, split, profile, {
    splits: ['train'],
    libraryVerified: true,
    promotionVerified: true,
    indexVerified: true,
    indexedKinds: new Set(['unit.box', 'unit.group']),
  });
  const missingIndex = evaluateCbaProfile(dataset, split, profile, {
    splits: ['train'],
    libraryVerified: true,
    promotionVerified: true,
    indexVerified: true,
    indexedKinds: new Set(),
  });
  assert.equal(assured.publicUnitCoverage, 1);
  assert.equal(assured.nativeUnits, 0);
  assert.equal(assured.publicBrickStructuralExactCases, 1);
  assert.equal(missingIndex.publicBrickStructuralExactCases, 0);
});

test('an empty render is not vacuous public-brick reconstruction', () => {
  const dataset = parseWorkspaceDataset(`${JSON.stringify({
    width: 100,
    height: 100,
    fps: 1,
    tracks: [{
      type: 'composition',
      length: 1000,
      source: 'const GeneratedComposition = () => null;',
    }],
  })}\n`);
  const split = createWorkspaceSplit(dataset);
  const metrics = evaluateCbaProfile(dataset, split, CBA_V2_BASELINE_PROFILE, {
    splits: ['train'],
    libraryVerified: true,
    indexVerified: true,
    indexedKinds: new Set(),
  });
  assert.equal(metrics.exactCases, 1);
  assert.equal(metrics.publicUnitOccurrences, 0);
  assert.equal(metrics.publicBrickStructuralExactCases, 0);
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
    publicBehaviourCoverage: 0,
    publicUnitOccurrences: 0,
    publicUnitKinds: 0,
    publicUnitCoverage: 0,
    localBehaviours: 0,
    staticLocalBehaviourPotential: 0,
    residualVisualComputations: 0,
    staticResidualVisualPotential: 0,
    nativeUnits: 1,
    staticNativeUnitPotential: 1,
    publicBrickStructuralExactCases: 0,
    fallbackExactCases: 1,
    structurallyMatchedCases: 1,
    fallbackMatchedCases: 1,
    unsupportedEffectCases: 0,
    unsupportedEffectFrames: 0,
    unsupportedEffectOccurrences: 0,
    unsupportedEffectKinds: 0,
    warnings: 0,
    invalidOwners: 0,
    ...overrides,
  };
}
