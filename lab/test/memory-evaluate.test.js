import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateMemoryCandidate } from '../census/evaluate.js';

function censusFixture() {
  return {
    counts: {
      compositions: 2,
      visualSinks: 5,
      atomicBehaviourWitnesses: 5,
      rejectedNonVisualHelperDeclarations: 2,
      structuralReclassifications: 0,
      imperativeResiduals: 0,
    },
    units: [
      {
        capability: 'structure.layer',
        infrastructureKind: 'unit.layer',
        status: 'infrastructure-mapped',
        witnesses: 6,
        workspaces: 2,
        compositions: 2,
      },
      {
        capability: 'visual.container',
        status: 'residual',
        residualCode: 'typed-container-unit-required',
        witnesses: 2,
        workspaces: 1,
        compositions: 1,
      },
    ],
    behaviours: [
      {
        capability: 'style.opacity',
        infrastructureKind: 'behaviour.opacity',
        status: 'infrastructure-mapped',
        witnesses: 4,
        workspaces: 2,
        compositions: 2,
      },
      {
        capability: 'paint.dynamic-filter',
        status: 'residual',
        residualCode: 'typed-property-behaviour-required',
        witnesses: 1,
        workspaces: 1,
        compositions: 1,
      },
    ],
    memoryCandidates: [
      {
        kind: 'unit',
        candidateKind: 'unit.dialogue-card.0123456789ab',
        witnesses: 3,
        workspaces: 2,
        eligibility: {
          evidenceReady: true,
          promotionEligible: false,
          blockers: ['human-feedback-not-provided'],
        },
      },
      {
        kind: 'behaviour',
        candidateKind: 'behaviour.staged-curve.fedcba987654',
        witnesses: 2,
        workspaces: 2,
        eligibility: {
          evidenceReady: true,
          promotionEligible: false,
          blockers: ['human-feedback-not-provided'],
        },
      },
    ],
  };
}

test('mapping metrics count authentic memory only, never infrastructure', () => {
  const index = {
    entries: [
      { kind: 'unit.dialogue-card.0123456789ab', type: 'unit', role: 'memory' },
      {
        kind: 'behaviour.staged-curve.fedcba987654',
        type: 'behaviour',
        role: 'memory',
      },
      { kind: 'unit.layer', type: 'unit', role: 'infrastructure' },
      { kind: 'behaviour.opacity', type: 'behaviour', role: 'infrastructure' },
    ],
  };
  const metrics = evaluateMemoryCandidate(
    censusFixture(),
    index,
    { valid: true, violations: [] },
  );

  assert.equal(metrics.schemaVersion, 6);
  assert.equal(metrics.mapping.scope, 'stylistic-candidates-to-indexed-memory');
  assert.equal(metrics.mapping.proof, 'navigation-only');
  assert.equal(metrics.mapping.candidateUnitWitnesses, 3);
  assert.equal(metrics.mapping.mappedUnitWitnesses, 3);
  assert.equal(metrics.mapping.unitKindMappingCoverage, 1);
  assert.equal(metrics.mapping.candidateBehaviourWitnesses, 2);
  assert.equal(metrics.mapping.mappedBehaviourWitnesses, 2);
  assert.equal(metrics.mapping.behaviourKindMappingCoverage, 1);
  assert.deepEqual(metrics.infrastructure, {
    unitWitnesses: 6,
    behaviourWitnesses: 4,
    countedAsMemory: false,
  });
  assert.equal(metrics.residualEvidence.unitCapabilities.length, 1);
  assert.equal(metrics.residualEvidence.behaviourCapabilities.length, 1);
  assert.equal(metrics.reuseEvidence.motifCandidates, 2);
  assert.equal(metrics.reuseEvidence.evidenceReadyMotifs, 2);
  assert.equal(metrics.reuseEvidence.evidenceReadyUnpromoted, 2);
  assert.equal(Object.hasOwn(metrics.reuseEvidence, 'candidatesAwaitingFeedback'), false);
  assert.equal(metrics.reuseEvidence.behaviourKinds, 1);
  assert.equal(metrics.reconstruction.oneToOneVerified, false);
  assert.equal(metrics.release.acceptedForAutomaticPromotion, false);
});

test('an unlabelled navigation entry cannot silently become memory', () => {
  const index = {
    entries: [
      { kind: 'unit.dialogue-card.0123456789ab', type: 'unit' },
      { kind: 'behaviour.opacity', type: 'behaviour' },
    ],
  };
  const metrics = evaluateMemoryCandidate(
    censusFixture(),
    index,
    { valid: true, violations: [] },
  );

  assert.equal(metrics.mapping.mappedUnitWitnesses, 0);
  assert.equal(metrics.mapping.unmappedUnitWitnesses, 3);
  assert.equal(metrics.mapping.unitKindMappingCoverage, 0);
  assert.equal(metrics.mapping.unmappedBehaviourWitnesses, 2);
  assert.equal(metrics.classContract.indexedUnits, 0);
  assert.equal(metrics.classContract.indexedBehaviours, 0);
});
