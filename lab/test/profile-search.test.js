import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CBA_V2_BASELINE_PROFILE,
  CBA_V2_SEARCH_SPACE,
} from '../../src/cba-v2/features.js';
import { createSequentialProfileFrontier } from '../experiment/profile-search.js';
import { selectDeterministicProfile } from '../experiment/profile-selection.js';

test('profile search lazily reveals a bounded neighbourhood from a larger space', () => {
  const reveal = createSequentialProfileFrontier(CBA_V2_SEARCH_SPACE, CBA_V2_BASELINE_PROFILE);
  const initial = reveal(context());
  assert.equal(CBA_V2_SEARCH_SPACE.length, 96);
  assert.equal(initial.length, 6);
  assert.ok(initial.every((id) => /^p_[a-f0-9]{16}$/u.test(id)));
  const allFeature = CBA_V2_SEARCH_SPACE.find(({ features }) => (
    Object.values(features).every(Boolean)
  ));
  assert.equal(initial[0], allFeature.id);

  const afterSelection = reveal(context({ evaluatedCandidateIds: [initial[0]] }));
  assert.equal(afterSelection.includes(initial[0]), false);
  assert.notDeepEqual(afterSelection, initial.slice(1));

  const alternateSeed = reveal(context({
    evaluatedCandidateIds: initial.slice(0, 5),
    advisorySeedId: initial[4],
  }));
  const differentSeed = reveal(context({
    evaluatedCandidateIds: initial.slice(0, 5),
    advisorySeedId: initial[0],
  }));
  assert.notDeepEqual(alternateSeed, differentSeed);
});

test('final Pareto selection is independent of evaluated-record order', () => {
  const baseline = record('b_0000000000000000', metrics());
  const unitProfile = record('p_1111111111111111', metrics({
    nativeUnits: 0,
    foundationUnitOccurrences: 1,
    foundationUnitKinds: 1,
    foundationUnitCoverage: 1,
    foundationBrickStructuralExactCases: 1,
    fallbackExactCases: 0,
    fallbackMatchedCases: 0,
  }));
  const pseudoFoundationBehaviour = record('p_2222222222222222', metrics({
    foundationBehaviours: 100,
    foundationBehaviourKinds: 10,
    foundationBehaviourCoverage: 1,
  }));
  const observationalMemory = record('p_3333333333333333', metrics({
    authenticMemoryUnitOccurrences: 100,
    authenticMemoryBehaviourOccurrences: 100,
    authenticMemoryKinds: 20,
    authenticMemoryStructuralExactCases: 1,
  }));
  const forward = selectDeterministicProfile(baseline, [
    unitProfile,
    pseudoFoundationBehaviour,
    observationalMemory,
  ]);
  const reverse = selectDeterministicProfile(baseline, [
    observationalMemory,
    pseudoFoundationBehaviour,
    unitProfile,
  ]);
  assert.deepEqual(forward, reverse);
  assert.equal(forward.selectedProfileId, unitProfile.profile.id);
  assert.equal(
    forward.eligibleProfileIds.includes(pseudoFoundationBehaviour.profile.id),
    false,
  );
  assert.equal(
    forward.eligibleProfileIds.includes(observationalMemory.profile.id),
    false,
  );
});

test('deterministic Pareto tie-break prefers lower static escape-hatch potential', () => {
  const baseline = record('b_0000000000000000', metrics({
    staticNativeUnitPotential: 10,
  }));
  const lexicallyEarlierButWorse = record('p_1111111111111111', metrics({
    nativeUnits: 0,
    staticNativeUnitPotential: 5,
    foundationUnitOccurrences: 1,
    foundationUnitKinds: 1,
    foundationUnitCoverage: 1,
    foundationBrickStructuralExactCases: 1,
    fallbackExactCases: 0,
    fallbackMatchedCases: 0,
  }));
  const lowerEscapeHatchPotential = record('p_9999999999999999', metrics({
    nativeUnits: 0,
    staticNativeUnitPotential: 2,
    foundationUnitOccurrences: 1,
    foundationUnitKinds: 1,
    foundationUnitCoverage: 1,
    foundationBrickStructuralExactCases: 1,
    fallbackExactCases: 0,
    fallbackMatchedCases: 0,
  }));

  const selected = selectDeterministicProfile(baseline, [
    lexicallyEarlierButWorse,
    lowerEscapeHatchPotential,
  ]);
  assert.equal(selected.selectedProfileId, lowerEscapeHatchPotential.profile.id);
  assert.deepEqual(selected.paretoProfileIds, [lowerEscapeHatchPotential.profile.id]);
});

function context(overrides = {}) {
  return {
    round: 1,
    currentMetrics: { quality: 0 },
    remainingCandidateIds: CBA_V2_SEARCH_SPACE.map(({ id }) => id),
    evaluatedCandidateIds: [],
    acceptedCandidateIds: [],
    advisorySeedId: null,
    ...overrides,
  };
}

function record(id, value) {
  return {
    profile: { id, features: CBA_V2_BASELINE_PROFILE.features },
    metrics: { train: value, validation: { ...value } },
  };
}

function metrics(overrides = {}) {
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
    authenticMemoryUnitOccurrences: 0,
    authenticMemoryBehaviourOccurrences: 0,
    authenticMemoryKinds: 0,
    authenticMemoryStructuralExactCases: 0,
    localBehaviours: 0,
    staticLocalBehaviourPotential: 0,
    residualVisualComputations: 0,
    staticResidualVisualPotential: 0,
    nativeUnits: 1,
    staticNativeUnitPotential: 1,
    foundationBrickStructuralExactCases: 0,
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
