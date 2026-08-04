import { sha256, stableStringify } from '../lib.js';
import {
  entryForDetector,
  promotionPolicyForDetector,
} from './catalog.js';
import { aggregateMemoryEvidence } from './evidence.js';

const TRANSFORM_CHANNELS = Object.freeze([
  'transform.rotate',
  'transform.scale',
  'transform.translate',
]);

/**
 * These are compiler stages, not twenty independent re-runs of one detector.
 * Every pass consumes the state produced by its predecessors and leaves a
 * deterministic receipt in the state chain.
 */
export const REFINEMENT_PASSES = Object.freeze([
  pass(1, 'private-input-and-parse-audit', applyCompositionAudit),
  pass(2, 'reachable-render-graph-audit', applyReachabilityAudit),
  pass(3, 'render-boundary-census', applyUnitAudit),
  pass(4, 'visual-write-census', applyBehaviourAudit),
  pass(5, 'one-write-behaviour-boundaries', applyAtomicWriteBoundaries),
  pass(6, 'ordered-transform-slot-lowering', applyTransformSlots),
  pass(7, 'dom-leaf-unit-specs', coverUnitRoots(['div', 'span', 'pre', 'text'], 'core-dom-unit')),
  pass(8, 'remotion-layer-unit-specs', coverUnitRoots(['absolute-fill'], 'core-layer-unit')),
  pass(9, 'media-unit-specs', coverUnitRoots(['image', 'video', 'audio'], 'core-media-unit')),
  pass(10, 'svg-unit-specs', coverUnitRoots(['svg'], 'core-svg-unit')),
  pass(11, 'retained-canvas-unit-specs', coverUnitRoots(['canvas'], 'retained-canvas-unit')),
  pass(12, 'engine-neutral-three-unit-specs', coverUnitRoots(['three'], 'engine-neutral-three-unit')),
  pass(13, 'exact-private-unit-specs', coverRemainingUnits),
  pass(14, 'exact-unit-spec-deduplication', deduplicateUnitSpecs),
  pass(15, 'atomic-opacity-behaviour-specs', coverBehaviourChannels(['opacity'])),
  pass(16, 'atomic-scale-behaviour-specs', coverBehaviourChannels(['transform.scale'])),
  pass(17, 'atomic-translate-behaviour-specs', coverBehaviourChannels(['transform.translate'])),
  pass(18, 'remaining-one-target-behaviour-specs', coverRemainingBehaviours),
  pass(19, 'detector-evidence-not-promotion', classifyDetectorEvidence),
  pass(20, 'esm-privacy-and-release-gates', applyReleaseGates),
]);

export function runTwentyRefinements(mineResult, options = {}) {
  const observations = Array.isArray(mineResult?.observationsPrivate)
    ? mineResult.observationsPrivate
    : Array.isArray(mineResult?.observations)
      ? mineResult.observations
      : [];
  const universe = createUniverse(observations);
  const state = createState(universe, options);
  const rounds = [];
  let previousMetrics = metrics(state);
  let previousRoundSha256 = sha256(`round-chain:${publicUniverse(universe).universeSha256}`);

  for (const definition of REFINEMENT_PASSES) {
    assertNextPass(state, definition);
    const inputStateSha256 = stateSha256(state);
    const receipt = normalizeReceipt(definition.apply(state));
    state.completedPasses.push(definition.id);
    state.passReceipts.push({
      round: definition.round,
      pass: definition.id,
      ...receipt,
    });
    const outputStateSha256 = stateSha256(state);
    const currentMetrics = metrics(state);
    const body = {
      schemaVersion: 2,
      round: definition.round,
      pass: definition.id,
      previousRoundSha256,
      inputStateSha256,
      outputStateSha256,
      changed: inputStateSha256 !== outputStateSha256,
      receipt,
      metrics: currentMetrics,
      delta: numericDelta(previousMetrics, currentMetrics),
    };
    const roundRecord = {
      ...body,
      roundSha256: sha256(stableStringify(body)),
    };
    rounds.push(roundRecord);
    previousMetrics = currentMetrics;
    previousRoundSha256 = roundRecord.roundSha256;
  }

  const blockers = releaseBlockers(state);
  return {
    universe: publicUniverse(universe),
    rounds,
    final: {
      ...previousMetrics,
      reconstructionProven: false,
      oneToOneReproductionVerified: false,
      automaticPromotionAllowed: false,
      blockers,
    },
  };
}

function createUniverse(observations) {
  const compositions = [];
  const units = [];
  const behaviours = [];
  const matches = [];

  observations.forEach((observation, observationIndex) => {
    const observationKey = publicKey(
      'composition',
      observation?.observationId ?? observationIndex,
      24,
    );
    const workspaceKey = publicKey(
      'workspace',
      observation?.workspace?.index ?? observationIndex,
      16,
    );
    const parseValid = observation?.code?.parseStatus === 'valid';
    compositions.push({ observationKey, workspaceKey, parseValid });

    (observation?.code?.visualFragments ?? []).forEach((fragment, fragmentIndex) => {
      units.push({
        id: publicKey(
          'unit',
          `${observationKey}:${fragment?.fragmentId ?? fragmentIndex}`,
          32,
        ),
        observationKey,
        workspaceKey,
        rootKind: safeRootKind(fragment?.rootKind),
        structuralHash: normalizedHash(fragment?.structuralHash),
        spanValid: validSpan(fragment?.span),
      });
    });

    (observation?.code?.visualAtoms ?? []).forEach((atom, atomIndex) => {
      const writeTargets = writeTargetsForAtom(atom);
      behaviours.push({
        id: publicKey(
          'behaviour',
          `${observationKey}:${atom?.atomId ?? atomIndex}`,
          32,
        ),
        observationKey,
        workspaceKey,
        writeTargets,
        channel: writeTargets.length === 1 ? writeTargets[0] : null,
        drivers: safeDrivers(atom?.drivers),
        structuralHash: normalizedHash(atom?.expressionHash),
        spanValid: validSpan(atom?.span),
      });
    });

    (observation?.atomicMatches ?? []).forEach((match, matchIndex) => {
      const entry = entryForDetector(match?.id);
      const policy = promotionPolicyForDetector(match?.id);
      if (!entry || !policy) return;
      matches.push({
        id: publicKey(
          'match',
          `${observationKey}:${match?.id}:${matchIndex}:${match?.span?.start ?? ''}`,
          32,
        ),
        observationKey,
        workspaceKey,
        detectorId: match.id,
        kind: entry.kind,
        entryType: entry.entryType,
        policyReviewable: policy.reviewable,
        atomicBoundary: detectorMatchIsAtomic(entry, match),
        structuralHash: normalizedHash(match?.structuralHash),
        spanValid: validSpan(match?.span),
      });
    });
  });

  return { observations, compositions, units, behaviours, matches };
}

function createState(universe, options) {
  return {
    universe,
    completedPasses: [],
    passReceipts: [],
    auditedCompositions: new Set(),
    reachableCompositions: new Set(),
    renderBoundaries: new Set(),
    visualWriteCandidates: new Set(),
    atomicVisualWrites: new Set(),
    transformSlots: new Set(),
    unitSpecs: new Map(),
    behaviourSpecs: new Map(),
    uniqueUnitSpecs: 0,
    detectorEvidence: [],
    releaseGatesEvaluated: false,
    moduleValidation: normalizeModuleValidation(options.moduleValidation),
    privacyValid: options.privacyValid === true,
    indexJsonOnly: options.indexJsonOnly === true,
  };
}

function applyCompositionAudit(state) {
  const valid = state.universe.compositions.filter((value) => value.parseValid);
  valid.forEach((value) => state.auditedCompositions.add(value.observationKey));
  return receipt(state.universe.compositions.length, valid.length);
}

function applyReachabilityAudit(state) {
  // visualFragments/visualAtoms are emitted only for functions reachable from
  // GeneratedComposition. Preserve that fact as an explicit compiler gate.
  for (const value of state.universe.compositions) {
    if (state.auditedCompositions.has(value.observationKey)) {
      state.reachableCompositions.add(value.observationKey);
    }
  }
  return receipt(state.auditedCompositions.size, state.reachableCompositions.size);
}

function applyUnitAudit(state) {
  const candidates = state.universe.units.filter((value) => (
    state.reachableCompositions.has(value.observationKey)
    && value.spanValid
    && value.structuralHash !== null
  ));
  candidates.forEach((value) => state.renderBoundaries.add(value.id));
  return receipt(state.universe.units.length, candidates.length);
}

function applyBehaviourAudit(state) {
  const candidates = state.universe.behaviours.filter((value) => (
    state.reachableCompositions.has(value.observationKey)
    && value.spanValid
    && value.structuralHash !== null
  ));
  candidates.forEach((value) => state.visualWriteCandidates.add(value.id));
  return receipt(state.universe.behaviours.length, candidates.length);
}

function applyAtomicWriteBoundaries(state) {
  const candidates = state.universe.behaviours.filter((value) => (
    state.visualWriteCandidates.has(value.id)
    && value.writeTargets.length === 1
  ));
  candidates.forEach((value) => state.atomicVisualWrites.add(value.id));
  return receipt(state.visualWriteCandidates.size, candidates.length);
}

function applyTransformSlots(state) {
  const candidates = state.universe.behaviours.filter((value) => (
    state.atomicVisualWrites.has(value.id)
    && TRANSFORM_CHANNELS.includes(value.channel)
  ));
  candidates.forEach((value) => state.transformSlots.add(value.id));
  return receipt(state.atomicVisualWrites.size, candidates.length);
}

function coverUnitRoots(rootKinds, specificationKind) {
  const allowed = new Set(rootKinds);
  return (state) => {
    const unresolved = state.universe.units.filter((value) => (
      state.renderBoundaries.has(value.id)
      && !state.unitSpecs.has(value.id)
    ));
    const candidates = unresolved.filter((value) => allowed.has(value.rootKind));
    candidates.forEach((value) => state.unitSpecs.set(value.id, specificationKind));
    return receipt(unresolved.length, candidates.length);
  };
}

function coverRemainingUnits(state) {
  const candidates = state.universe.units.filter((value) => (
    state.renderBoundaries.has(value.id)
    && !state.unitSpecs.has(value.id)
  ));
  candidates.forEach((value) => state.unitSpecs.set(value.id, 'private-exact-unit-spec'));
  return receipt(candidates.length, candidates.length);
}

function deduplicateUnitSpecs(state) {
  const signatures = new Set(state.universe.units
    .filter((value) => state.unitSpecs.has(value.id))
    .map((value) => stableStringify({
      rootKind: value.rootKind,
      specificationKind: state.unitSpecs.get(value.id),
      structuralHash: value.structuralHash,
    })));
  state.uniqueUnitSpecs = signatures.size;
  return receipt(state.unitSpecs.size, signatures.size);
}

function coverBehaviourChannels(channels) {
  const allowed = new Set(channels);
  return (state) => {
    const unresolved = state.universe.behaviours.filter((value) => (
      state.atomicVisualWrites.has(value.id)
      && !state.behaviourSpecs.has(value.id)
    ));
    const candidates = unresolved.filter((value) => allowed.has(value.channel));
    candidates.forEach((value) => {
      state.behaviourSpecs.set(value.id, `atomic:${value.channel}`);
    });
    return receipt(unresolved.length, candidates.length);
  };
}

function coverRemainingBehaviours(state) {
  const candidates = state.universe.behaviours.filter((value) => (
    state.atomicVisualWrites.has(value.id)
    && !state.behaviourSpecs.has(value.id)
  ));
  candidates.forEach((value) => {
    state.behaviourSpecs.set(value.id, `private-one-target:${value.channel}`);
  });
  return receipt(candidates.length, candidates.length);
}

function classifyDetectorEvidence(state) {
  state.detectorEvidence = aggregateMemoryEvidence(state.universe.observations);
  const accepted = state.detectorEvidence.reduce(
    (total, value) => total + value.detectorEvidence.atomicOccurrences,
    0,
  );
  return receipt(state.universe.matches.length, accepted);
}

function applyReleaseGates(state) {
  state.releaseGatesEvaluated = true;
  const passed = Number(state.moduleValidation.valid)
    + Number(state.privacyValid)
    + Number(state.indexJsonOnly);
  return receipt(3, passed);
}

function metrics(state) {
  const formulaAtoms = state.universe.behaviours.filter((value) => (
    state.atomicVisualWrites.has(value.id)
    && value.drivers.includes('formula')
  )).length;
  const unitTotal = state.renderBoundaries.size;
  const behaviourTotal = state.atomicVisualWrites.size;
  const reconstructedWitnesses = state.unitSpecs.size + state.behaviourSpecs.size;
  const reconstructionTotal = unitTotal + behaviourTotal;
  const candidateOnlyEvidence = state.detectorEvidence.filter((value) => (
    !value.promotion.reviewableDetectorEvidence
  ));
  const reviewableEvidence = state.detectorEvidence.filter((value) => (
    value.promotion.reviewableDetectorEvidence
    && value.detectorEvidence.independentReuseObserved
  ));
  const candidateOnlyOccurrences = sumEvidence(candidateOnlyEvidence, 'atomicOccurrences');
  const reviewableEvidenceOccurrences = sumEvidence(reviewableEvidence, 'atomicOccurrences');
  const invalidWriteCandidates = state.visualWriteCandidates.size - state.atomicVisualWrites.size;

  return {
    process: {
      completedPasses: state.completedPasses.length,
      plannedPasses: REFINEMENT_PASSES.length,
      lastCompletedPass: state.completedPasses.at(-1) ?? null,
    },
    audit: {
      compositions: state.auditedCompositions.size,
      reachableCompositions: state.reachableCompositions.size,
      renderBoundaries: unitTotal,
      visualWriteCandidates: state.visualWriteCandidates.size,
      atomicVisualWrites: behaviourTotal,
      orderedTransformSlots: state.transformSlots.size,
    },
    reconstruction: {
      proofLevel: 'static-class-specification-only',
      units: {
        inventoried: unitTotal,
        classSpecified: state.unitSpecs.size,
        unresolved: unitTotal - state.unitSpecs.size,
        uniqueClassSpecifications: state.uniqueUnitSpecs,
      },
      behaviours: {
        inventoried: behaviourTotal,
        classSpecified: state.behaviourSpecs.size,
        unresolved: behaviourTotal - state.behaviourSpecs.size,
        formulaAtomsNeedingConcreteCode: formulaAtoms,
        signalConfigsClosureConverted: 0,
      },
      staticInventoryCoverage: ratio(reconstructedWitnesses, reconstructionTotal),
      emittedCompositionModules: 0,
      importedCompositionModules: 0,
      semanticExactCompositions: 0,
      semanticExactFrames: 0,
      pixelComparedFrames: 0,
      pixelExactFrames: 0,
      oneToOneVerified: false,
    },
    promotion: {
      detectorCandidateOccurrences: state.detectorEvidence.reduce(
        (total, value) => total + value.detectorEvidence.atomicOccurrences,
        0,
      ),
      reviewableEvidenceOccurrences,
      candidateOnlyOccurrences,
      promotedEntries: 0,
      promotedWitnesses: 0,
      promotedMemoryCoverage: 0,
      humanFeedback: 'not-provided',
      automaticAllowed: false,
    },
    atomicity: {
      visualWriteCandidatesRejectedAsNonAtomic: invalidWriteCandidates,
      multiWriteBehaviourSpecs: countMultiWriteSpecs(state),
      combinedOpacityScaleBehaviours: 0,
      numericHelperBehaviours: 0,
      cardinalitySpecificUnitsPromoted: 0,
      candidateItemBoundariesBlocked: candidateOnlyOccurrences,
    },
    esm: {
      jsonNavigationIndex: state.indexJsonOnly,
      modulesLinked: state.releaseGatesEvaluated ? state.moduleValidation.modules : 0,
      moduleContractValid: state.releaseGatesEvaluated && state.moduleValidation.valid,
      publicPrivacyValid: state.releaseGatesEvaluated && state.privacyValid,
    },
  };
}

function publicUniverse(universe) {
  const body = {
    compositions: universe.compositions.length,
    renderBoundaryCandidates: universe.units.length,
    visualWriteCandidates: universe.behaviours.length,
    detectorMatches: universe.matches.length,
  };
  return {
    ...body,
    universeSha256: sha256(stableStringify({
      ...body,
      units: universe.units.map(({ id, rootKind, structuralHash }) => ({
        id,
        rootKind,
        structuralHash,
      })),
      behaviours: universe.behaviours.map(({ id, writeTargets, structuralHash }) => ({
        id,
        writeTargets,
        structuralHash,
      })),
    })),
  };
}

function releaseBlockers(state) {
  const blockers = [
    'composition-entry-esm-not-emitted',
    'signal-config-closure-conversion-not-proven',
    'remotion-frame-and-pixel-equivalence-not-measured',
    'human-feedback-not-provided',
  ];
  if (!state.moduleValidation.valid) blockers.push('class-modules-not-linked');
  if (!state.privacyValid) blockers.push('public-privacy-gate-not-proven');
  if (!state.indexJsonOnly) blockers.push('navigation-index-contract-not-proven');
  return blockers;
}

function stateSha256(state) {
  return sha256(stableStringify({
    completedPasses: state.completedPasses,
    auditedCompositions: sorted(state.auditedCompositions),
    reachableCompositions: sorted(state.reachableCompositions),
    renderBoundaries: sorted(state.renderBoundaries),
    visualWriteCandidates: sorted(state.visualWriteCandidates),
    atomicVisualWrites: sorted(state.atomicVisualWrites),
    transformSlots: sorted(state.transformSlots),
    unitSpecs: sortedMap(state.unitSpecs),
    behaviourSpecs: sortedMap(state.behaviourSpecs),
    uniqueUnitSpecs: state.uniqueUnitSpecs,
    detectorEvidence: state.detectorEvidence.map((value) => value.evidenceSha256),
    releaseGatesEvaluated: state.releaseGatesEvaluated,
  }));
}

function assertNextPass(state, definition) {
  if (definition.round !== state.completedPasses.length + 1) {
    throw new Error(`Refinement pass ${definition.id} executed out of order`);
  }
}

function normalizeReceipt(value = {}) {
  return Object.freeze({
    examined: nonNegativeInteger(value.examined),
    accepted: nonNegativeInteger(value.accepted),
    rejected: nonNegativeInteger(value.rejected),
  });
}

function receipt(examined, accepted) {
  const safeExamined = nonNegativeInteger(examined);
  const safeAccepted = Math.min(safeExamined, nonNegativeInteger(accepted));
  return {
    examined: safeExamined,
    accepted: safeAccepted,
    rejected: safeExamined - safeAccepted,
  };
}

function numericDelta(before, after) {
  const output = {};
  walkNumbers(after, [], (path, value) => {
    const previous = readPath(before, path);
    if (typeof previous === 'number' && value !== previous) {
      output[path.join('.')] = value - previous;
    }
  });
  return output;
}

function walkNumbers(value, path, visitor) {
  if (typeof value === 'number') visitor(path, value);
  else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => {
      walkNumbers(nested, [...path, key], visitor);
    });
  }
}

function readPath(value, path) {
  return path.reduce((current, key) => current?.[key], value);
}

function pass(round, id, apply) {
  return Object.freeze({ round, id, apply });
}

function normalizedHash(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  return /^[a-f0-9]{16,128}$/iu.test(value)
    ? value.toLowerCase()
    : sha256(`structural:${value}`);
}

function publicKey(namespace, value, length) {
  return sha256(`${namespace}:${String(value)}`).slice(0, length);
}

function validSpan(span) {
  return Number.isInteger(span?.start)
    && Number.isInteger(span?.end)
    && span.start >= 0
    && span.end > span.start;
}

function safeRootKind(value) {
  const known = new Set([
    'absolute-fill',
    'audio',
    'canvas',
    'custom',
    'div',
    'image',
    'pre',
    'span',
    'svg',
    'text',
    'three',
    'video',
  ]);
  return known.has(value) ? value : 'custom';
}

function writeTargetsForAtom(atom) {
  const values = Array.isArray(atom?.writes)
    ? atom.writes
    : Array.isArray(atom?.channels)
      ? atom.channels
      : [atom?.channel];
  return [...new Set(values.filter((value) => (
    typeof value === 'string' && /^[a-z][a-z0-9.-]*$/iu.test(value)
  )))].sort();
}

function safeDrivers(value) {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(['derived', 'formula', 'keyframes', 'oscillation', 'spring']);
  return [...new Set(value.filter((item) => allowed.has(item)))].sort();
}

function detectorMatchIsAtomic(entry, match) {
  if (!validSpan(match?.span) || normalizedHash(match?.structuralHash) === null) return false;
  if (entry.entryType === 'behaviour') {
    return match?.occurrenceKind === 'channel-write'
      && match?.channel === entry.writes[0].replace(/^style\./u, '');
  }
  return match?.occurrenceKind === 'renderable-fragment';
}

function normalizeModuleValidation(value) {
  return {
    valid: value?.valid === true,
    modules: nonNegativeInteger(value?.modules),
  };
}

function sumEvidence(entries, field) {
  return entries.reduce(
    (total, value) => total + Number(value.detectorEvidence[field] ?? 0),
    0,
  );
}

function countMultiWriteSpecs(state) {
  return state.universe.behaviours.filter((value) => (
    state.behaviourSpecs.has(value.id)
    && value.writeTargets.length !== 1
  )).length;
}

function ratio(numerator, denominator) {
  if (denominator === 0) return 0;
  return Number((numerator / denominator).toFixed(6));
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sortedMap(value) {
  return [...value.entries()].sort(([left], [right]) => left.localeCompare(right));
}
