import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MEMORY_CANDIDATES,
  MEMORY_ENTRIES,
  promotionPolicyForDetector,
} from '../src/memory/catalog.js';
import { aggregateMemoryEvidence } from '../src/memory/evidence.js';
import { buildMemoryIndex } from '../src/memory/index.js';
import {
  REFINEMENT_PASSES,
  runTwentyRefinements,
} from '../src/memory/rounds.js';

const HASHES = Object.freeze({
  card: '1'.repeat(64),
  opacity: '2'.repeat(64),
  scale: '3'.repeat(64),
  translate: '4'.repeat(64),
  rotate: '5'.repeat(64),
  filter: '6'.repeat(64),
});

test('catalog Behaviours own one write and heuristic item boundaries stay candidate-only', () => {
  const behaviours = MEMORY_ENTRIES.filter((entry) => entry.entryType === 'behaviour');
  const indexedDetectorKinds = new Set(buildMemoryIndex().entries.map((entry) => entry.kind));
  assert.ok(behaviours.length > 0);
  behaviours.forEach((entry) => assert.equal(entry.writes.length, 1, entry.kind));

  for (const detectorId of [
    'text.scatter-chunk',
    'text.dialogue-card',
    'card.ranking',
  ]) {
    assert.deepEqual(promotionPolicyForDetector(detectorId), {
      evidenceKind: 'heuristic-render-fragment',
      reviewable: false,
      blocker: 'single-item-boundary-not-proven',
    });
    assert.equal(MEMORY_ENTRIES.some((entry) => entry.detectorId === detectorId), false);
    const candidate = MEMORY_CANDIDATES.find((entry) => entry.detectorId === detectorId);
    assert.ok(candidate);
    assert.equal(indexedDetectorKinds.has(candidate.kind), false);
  }

  assert.doesNotMatch(JSON.stringify(MEMORY_ENTRIES), /confidence/iu);
});

test('evidence requires the same structure in independent workspaces and never promotes it', () => {
  const observations = fixtureObservations();
  const evidence = aggregateMemoryEvidence(observations);
  const opacity = evidence.find((entry) => entry.detectorId === 'motion.opacity');
  const ranking = evidence.find((entry) => entry.detectorId === 'card.ranking');

  assert.equal(opacity.detectorEvidence.independentReuseObserved, true);
  assert.equal(opacity.promotion.status, 'evidence-only-awaiting-reconstruction');
  assert.equal(opacity.promotion.promoted, false);

  assert.equal(ranking.detectorEvidence.independentReuseObserved, true);
  assert.equal(ranking.promotion.status, 'candidate-only-unproven-boundary');
  assert.equal(ranking.promotion.reviewableDetectorEvidence, false);
  assert.equal(ranking.promotion.promoted, false);
  assert.ok(ranking.promotion.blockers.includes('single-item-boundary-not-proven'));

  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /confidence|private prompt|private\.invalid/iu);
});

test('twenty class refinement passes are cumulative without claiming reproduction or promotion', () => {
  const result = runTwentyRefinements({
    observationsPrivate: fixtureObservations(),
  }, {
    moduleValidation: { valid: true, modules: 9 },
    privacyValid: true,
    indexJsonOnly: true,
  });

  assert.equal(REFINEMENT_PASSES.length, 20);
  assert.equal(new Set(REFINEMENT_PASSES.map((entry) => entry.id)).size, 20);
  assert.equal(result.rounds.length, 20);
  assert.equal(new Set(result.rounds.map((entry) => entry.roundSha256)).size, 20);
  assert.equal(new Set(result.rounds.map((entry) => entry.outputStateSha256)).size, 20);
  assert.ok(result.rounds.every((entry) => entry.changed));

  result.rounds.forEach((round, index) => {
    assert.equal(round.round, index + 1);
    assert.equal(round.metrics.process.completedPasses, index + 1);
    if (index > 0) {
      assert.equal(round.previousRoundSha256, result.rounds[index - 1].roundSha256);
      assert.equal(round.inputStateSha256, result.rounds[index - 1].outputStateSha256);
    }
  });

  assert.equal(result.final.reconstruction.staticInventoryCoverage, 1);
  assert.equal(result.final.reconstruction.oneToOneVerified, false);
  assert.equal(result.final.reconstruction.semanticExactCompositions, 0);
  assert.equal(result.final.reconstruction.pixelComparedFrames, 0);
  assert.equal(result.final.reconstructionProven, false);
  assert.equal(result.final.oneToOneReproductionVerified, false);

  assert.equal(result.final.promotion.reviewableEvidenceOccurrences, 2);
  assert.equal(result.final.promotion.candidateOnlyOccurrences, 2);
  assert.equal(result.final.promotion.promotedEntries, 0);
  assert.equal(result.final.promotion.promotedWitnesses, 0);
  assert.equal(result.final.promotion.promotedMemoryCoverage, 0);
  assert.equal(result.final.automaticPromotionAllowed, false);

  assert.equal(result.final.atomicity.visualWriteCandidatesRejectedAsNonAtomic, 1);
  assert.equal(result.final.atomicity.multiWriteBehaviourSpecs, 0);
  assert.equal(result.final.atomicity.cardinalitySpecificUnitsPromoted, 0);
  assert.equal(result.final.atomicity.candidateItemBoundariesBlocked, 2);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /confidence|private prompt|private\.invalid/iu);
});

function fixtureObservations() {
  const first = observation({
    observationId: 'private-composition-one',
    workspaceIndex: 0,
    fragments: [
      fragment('dom', 'div', 0),
      fragment('layer', 'absolute-fill', 10),
      fragment('media', 'image', 20),
      fragment('svg', 'svg', 30),
      fragment('canvas', 'canvas', 40),
      fragment('three', 'three', 50),
      fragment('custom', 'custom', 60),
    ],
    atoms: [
      atom('opacity', 'opacity', HASHES.opacity, 100),
      atom('scale', 'transform.scale', HASHES.scale, 110),
      atom('translate', 'transform.translate', HASHES.translate, 120),
      atom('rotate', 'transform.rotate', HASHES.rotate, 130),
      atom('filter', 'filter', HASHES.filter, 140),
      {
        atomId: 'invalid-combined-write',
        writes: ['opacity', 'transform.scale'],
        drivers: ['formula'],
        expressionHash: '7'.repeat(64),
        span: { start: 150, end: 159 },
      },
    ],
    matches: [
      behaviourMatch('motion.opacity', 'opacity', HASHES.opacity, 200),
      unitMatch('card.ranking', HASHES.card, 210),
    ],
  });
  const second = observation({
    observationId: 'private-composition-two',
    workspaceIndex: 1,
    fragments: [fragment('dom-2', 'div', 0)],
    atoms: [atom('opacity-2', 'opacity', HASHES.opacity, 100)],
    matches: [
      behaviourMatch('motion.opacity', 'opacity', HASHES.opacity, 200),
      unitMatch('card.ranking', HASHES.card, 210),
    ],
  });
  return [first, second];
}

function observation({
  observationId,
  workspaceIndex,
  fragments,
  atoms,
  matches,
}) {
  return {
    observationId,
    workspace: {
      index: workspaceIndex,
      prompt: 'private prompt',
      media: 'https://private.invalid/video.mp4',
    },
    code: {
      parseStatus: 'valid',
      visualFragments: fragments,
      visualAtoms: atoms,
    },
    atomicMatches: matches,
    private: {
      source: 'const userTranscript = "never publish";',
    },
  };
}

function fragment(fragmentId, rootKind, start) {
  return {
    fragmentId,
    rootKind,
    structuralHash: hashFor(fragmentId),
    span: { start, end: start + 9 },
  };
}

function atom(atomId, channel, expressionHash, start) {
  return {
    atomId,
    channel,
    drivers: ['formula'],
    expressionHash,
    span: { start, end: start + 9 },
  };
}

function behaviourMatch(id, channel, structuralHash, start) {
  return {
    id,
    occurrenceKind: 'channel-write',
    channel,
    structuralHash,
    variantHash: structuralHash,
    span: { start, end: start + 9 },
  };
}

function unitMatch(id, structuralHash, start) {
  return {
    id,
    occurrenceKind: 'renderable-fragment',
    structuralHash,
    variantHash: structuralHash,
    span: { start, end: start + 9 },
  };
}

function hashFor(value) {
  const code = [...String(value)].reduce((sum, character) => sum + character.codePointAt(0), 0);
  return (code.toString(16).padStart(2, '0')).repeat(32).slice(0, 64);
}
