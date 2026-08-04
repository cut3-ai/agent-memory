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
    metric({ matchedFrames: 9, exactCases: 0, foundationBehaviours: 0 }),
    metric({ matchedFrames: 9, exactCases: 0, foundationBehaviours: 0 }),
  );
  const better = modelMetrics(
    metric({ matchedFrames: 10, exactCases: 1, foundationBehaviours: 1 }),
    metric({ matchedFrames: 10, exactCases: 1, foundationBehaviours: 1 }),
  );
  const worse = modelMetrics(
    metric({ matchedFrames: 10, exactCases: 1, foundationBehaviours: 100 }),
    metric({ matchedFrames: 8, exactCases: 0, foundationBehaviours: 100 }),
  );
  assert.equal(isProfileImprovement(better, baseline), true);
  assert.equal(isProfileImprovement(worse, baseline), false);
  const fidelityTrade = modelMetrics(
    metric({ matchedFrames: 10, exactCases: 0, foundationBehaviours: 100 }),
    metric({ matchedFrames: 10, exactCases: 0, renderErrorFrames: 1, foundationBehaviours: 100 }),
  );
  assert.equal(isProfileImprovement(fidelityTrade, baseline), false);
  const fallbackTrade = modelMetrics(
    metric({ matchedFrames: 10, exactCases: 1, localBehaviours: 1, staticLocalBehaviourPotential: 1 }),
    metric({ matchedFrames: 10, exactCases: 1, localBehaviours: 1, staticLocalBehaviourPotential: 1 }),
  );
  assert.equal(isProfileImprovement(fallbackTrade, baseline), false);
  const nativePseudoReuse = modelMetrics(
    metric({ matchedFrames: 9, exactCases: 0, mismatchedFrames: 1, foundationBehaviours: 100 }),
    metric({ matchedFrames: 9, exactCases: 0, mismatchedFrames: 1, foundationBehaviours: 100 }),
  );
  assert.equal(isProfileImprovement(nativePseudoReuse, baseline), false);
  const foundationReplacement = modelMetrics(
    metric({
      nativeUnits: 0,
      foundationUnitOccurrences: 1,
      foundationUnitKinds: 1,
      foundationUnitCoverage: 1,
      foundationBrickStructuralExactCases: 1,
      fallbackExactCases: 0,
      fallbackMatchedCases: 0,
    }),
    metric({
      nativeUnits: 0,
      foundationUnitOccurrences: 1,
      foundationUnitKinds: 1,
      foundationUnitCoverage: 1,
      foundationBrickStructuralExactCases: 1,
      fallbackExactCases: 0,
      fallbackMatchedCases: 0,
    }),
  );
  assert.equal(isProfileImprovement(foundationReplacement, baseline), true);
  const foundationReplacementWithDiagnostics = modelMetrics(
    metric({
      nativeUnits: 0,
      foundationUnitOccurrences: 1,
      foundationUnitKinds: 1,
      foundationUnitCoverage: 1,
      foundationBrickStructuralExactCases: 1,
      fallbackExactCases: 0,
      fallbackMatchedCases: 0,
      warnings: 12,
    }),
    metric({
      nativeUnits: 0,
      foundationUnitOccurrences: 1,
      foundationUnitKinds: 1,
      foundationUnitCoverage: 1,
      foundationBrickStructuralExactCases: 1,
      fallbackExactCases: 0,
      fallbackMatchedCases: 0,
      warnings: 12,
    }),
  );
  assert.equal(isProfileImprovement(foundationReplacementWithDiagnostics, baseline), true);
  const decomposedFallback = modelMetrics(
    metric({
      nativeUnits: 0,
      staticNativeUnitPotential: 0,
      localBehaviours: 5,
      staticLocalBehaviourPotential: 1,
      foundationUnitOccurrences: 1,
      foundationUnitKinds: 1,
      foundationUnitCoverage: 1,
    }),
    metric({
      nativeUnits: 0,
      staticNativeUnitPotential: 0,
      localBehaviours: 5,
      staticLocalBehaviourPotential: 1,
      foundationUnitOccurrences: 1,
      foundationUnitKinds: 1,
      foundationUnitCoverage: 1,
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

test('foundation-brick structural exact requires runtime foundation classes', () => {
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
    foundationKinds: new Set(['unit.box', 'unit.group']),
    memoryKinds: new Set(),
  });
  const missingIndex = evaluateCbaProfile(dataset, split, profile, {
    splits: ['train'],
    libraryVerified: true,
    promotionVerified: true,
    indexVerified: true,
    foundationKinds: new Set(),
    memoryKinds: new Set(),
  });
  assert.equal(assured.foundationUnitCoverage, 1);
  assert.equal(assured.nativeUnits, 0);
  assert.equal(assured.foundationBrickStructuralExactCases, 1);
  assert.equal(missingIndex.foundationBrickStructuralExactCases, 0);
});

test('foundation and authentic-memory metrics use verifier per-kind occurrence maps', () => {
  const dataset = parseWorkspaceDataset(input);
  const split = createWorkspaceSplit(dataset);
  const profile = {
    id: 'all-features',
    features: {
      opacityTween: true,
      opacityFormula: true,
      scaleFormula: true,
      translateFormula: true,
      rotateFormula: true,
    },
  };
  const foundationOnly = evaluateCbaProfile(dataset, split, profile, {
    splits: ['train'],
    libraryVerified: true,
    promotionVerified: true,
    indexVerified: true,
    foundationKinds: new Set(['unit.box', 'unit.group', 'behaviour.opacity']),
    memoryKinds: new Set(),
  });
  assert.equal(foundationOnly.foundationUnitOccurrences, 2);
  assert.equal(foundationOnly.foundationUnitKinds, 2);
  assert.equal(foundationOnly.foundationUnitCoverage, 1);
  assert.equal(foundationOnly.foundationBehaviours, 1);
  assert.equal(foundationOnly.foundationBehaviourKinds, 1);
  assert.equal(foundationOnly.foundationBehaviourCoverage, 1);
  assert.equal(foundationOnly.foundationBrickStructuralExactCases, 1);
  assert.equal(foundationOnly.authenticMemoryUnitOccurrences, 0);
  assert.equal(foundationOnly.authenticMemoryBehaviourOccurrences, 0);
  assert.equal(foundationOnly.authenticMemoryKinds, 0);
  assert.equal(foundationOnly.authenticMemoryStructuralExactCases, 0);

  const splitRoles = evaluateCbaProfile(dataset, split, profile, {
    splits: ['train'],
    libraryVerified: true,
    promotionVerified: true,
    indexVerified: true,
    foundationKinds: new Set(['unit.group']),
    memoryKinds: new Set(['unit.box', 'behaviour.opacity']),
  });
  assert.equal(splitRoles.foundationUnitOccurrences, 1);
  assert.equal(splitRoles.foundationUnitKinds, 1);
  assert.equal(splitRoles.foundationUnitCoverage, 0.5);
  assert.equal(splitRoles.foundationBehaviours, 0);
  assert.equal(splitRoles.authenticMemoryUnitOccurrences, 1);
  assert.equal(splitRoles.authenticMemoryBehaviourOccurrences, 1);
  assert.equal(splitRoles.authenticMemoryKinds, 2);
  assert.equal(splitRoles.foundationBrickStructuralExactCases, 0);
  assert.equal(splitRoles.authenticMemoryStructuralExactCases, 1);
  for (const removedAlias of [
    'publicUnitOccurrences',
    'publicUnitKinds',
    'publicUnitCoverage',
    'reusableBehaviours',
    'reusableKinds',
    'publicBehaviourCoverage',
    'publicBrickStructuralExactCases',
  ]) {
    assert.equal(Object.hasOwn(splitRoles, removedAlias), false);
  }
});

test('an empty render is not vacuous foundation-brick reconstruction', () => {
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
    foundationKinds: new Set(),
    memoryKinds: new Set(),
  });
  assert.equal(metrics.cases, 1);
  assert.equal(metrics.foundationUnitOccurrences, 0);
  assert.equal(metrics.foundationBrickStructuralExactCases, 0);
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
    foundationBehaviours: 0,
    foundationBehaviourKinds: 0,
    foundationBehaviourCoverage: 0,
    foundationUnitOccurrences: 0,
    foundationUnitKinds: 0,
    foundationUnitCoverage: 0,
    localBehaviours: 0,
    staticLocalBehaviourPotential: 0,
    residualVisualComputations: 0,
    staticResidualVisualPotential: 0,
    nativeUnits: 1,
    staticNativeUnitPotential: 1,
    foundationBrickStructuralExactCases: 0,
    authenticMemoryUnitOccurrences: 0,
    authenticMemoryBehaviourOccurrences: 0,
    authenticMemoryKinds: 0,
    authenticMemoryStructuralExactCases: 0,
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
