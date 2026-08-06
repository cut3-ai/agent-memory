import { compileCompositionV2 } from '../../src/cba-v2/compiler.js';
import { verifyCompositionV2 } from '../../src/cba-v2/verifier.js';

const SPLITS = new Set(['train', 'validation', 'heldout']);

/**
 * Compile and compare every frame selected by a workspace-level split.
 * Only aggregate counters leave this module; source, URLs and rendered trees do not.
 */
export function evaluateCbaProfile(dataset, split, profile, options = {}) {
  const selectedSplits = normalizeSplits(options.splits ?? ['train']);
  const totals = emptyMetrics();
  const foundationKinds = options.foundationKinds instanceof Set
    ? options.foundationKinds : new Set();
  const memoryKinds = options.memoryKinds instanceof Set
    ? options.memoryKinds : new Set();
  const foundationBehaviourKinds = new Set();
  const foundationUnitKinds = new Set();
  const authenticMemoryKinds = new Set();
  const unsupportedEffectKinds = new Set();
  let indexedBehaviourOccurrences = 0;
  let indexedUnitOccurrences = 0;

  for (const workspace of dataset.workspaces) {
    const assigned = split.assignmentByWorkspaceKey.get(workspace.workspaceKey);
    if (!selectedSplits.has(assigned)) continue;
    for (const composition of workspace.compositions) {
      totals.cases += 1;
      const video = {
        lengthMs: composition.lengthMs,
        fps: workspace.fps,
        width: workspace.width,
        height: workspace.height,
      };
      const expectedFrames = frameCount(video);
      try {
        const compiled = compileCompositionV2(composition.source, {
          features: profile.features,
        });
        const verification = verifyCompositionV2(compiled, video);
        totals.frames += verification.totalFrames;
        totals.matchedFrames += verification.matchedFrames;
        totals.exactCases += Number(verification.exact);
        totals.baselineErrorFrames += verification.baselineRenderErrors;
        totals.generatedErrorFrames += verification.generatedRenderErrors;
        totals.nativeUnits += verification.maximumNativeUnits;
        totals.staticNativeUnitPotential += compiled.escapeHatches.nativeUnits;
        totals.localBehaviours += verification.maximumLocalBehaviours;
        totals.staticLocalBehaviourPotential += compiled.escapeHatches.localBehaviours;
        totals.residualVisualComputations += verification.sourceDependentVisualComputations;
        totals.staticResidualVisualPotential += (
          compiled.escapeHatches.sourceDependentVisualComputations
        );
        const unitCounts = verification.publicUnitKindCounts ?? {};
        const behaviourCounts = verification.publicBehaviourKindCounts ?? {};
        const foundationUnits = selectedOccurrences(unitCounts, foundationKinds);
        const foundationBehaviours = selectedOccurrences(behaviourCounts, foundationKinds);
        const authenticMemoryUnits = selectedOccurrences(unitCounts, memoryKinds);
        const authenticMemoryBehaviours = selectedOccurrences(behaviourCounts, memoryKinds);
        totals.foundationUnitOccurrences += foundationUnits;
        totals.foundationBehaviours += foundationBehaviours;
        totals.authenticMemoryUnitOccurrences += authenticMemoryUnits;
        totals.authenticMemoryBehaviourOccurrences += authenticMemoryBehaviours;
        indexedUnitOccurrences += sumCountRecord(unitCounts);
        indexedBehaviourOccurrences += sumCountRecord(behaviourCounts);
        totals.warnings += compiled.warnings.length;
        totals.invalidOwners = Math.max(
          totals.invalidOwners,
          verification.invalidBehaviourOwners,
        );
        selectedObservedKinds(behaviourCounts, foundationKinds)
          .forEach((kind) => foundationBehaviourKinds.add(kind));
        selectedObservedKinds(unitCounts, foundationKinds)
          .forEach((kind) => foundationUnitKinds.add(kind));
        selectedObservedKinds(unitCounts, memoryKinds)
          .forEach((kind) => authenticMemoryKinds.add(kind));
        selectedObservedKinds(behaviourCounts, memoryKinds)
          .forEach((kind) => authenticMemoryKinds.add(kind));
        if (verification.unsupportedEffects.length > 0) {
          totals.unsupportedEffectCases += 1;
          totals.unsupportedEffectFrames += verification.totalFrames;
          totals.unsupportedEffectOccurrences += verification.unsupportedEffects.length;
          verification.unsupportedEffects.forEach((kind) => unsupportedEffectKinds.add(kind));
        }
        const publicKinds = [
          ...Object.keys(unitCounts),
          ...Object.keys(behaviourCounts),
        ];
        const structuralExact = verification.exact
          && verification.maximumPublicUnits > 0
          && verification.maximumNativeUnits === 0
          && verification.maximumLocalBehaviours === 0
          && verification.sourceDependentVisualComputations === 0
          && verification.unsupportedEffects.length === 0
          && verification.baselineRenderErrors === 0
          && verification.generatedRenderErrors === 0
          && compiled.verification.generatedParse === true
          && compiled.verification.publishableEsm === true
          && options.libraryVerified === true
          && options.promotionVerified === true
          && options.indexVerified === true
          && foundationKinds instanceof Set
          && memoryKinds instanceof Set;
        const foundationBrickStructuralExact = structuralExact
          && foundationUnits > 0
          && publicKinds.every((kind) => foundationKinds.has(kind));
        const authenticMemoryStructuralExact = structuralExact
          && authenticMemoryUnits + authenticMemoryBehaviours > 0
          && publicKinds.every((kind) => foundationKinds.has(kind) || memoryKinds.has(kind));
        const structurallyMatched = verification.matchedFrames === verification.totalFrames
          && verification.baselineRenderErrors === 0
          && verification.generatedRenderErrors === 0;
        totals.foundationBrickStructuralExactCases += Number(foundationBrickStructuralExact);
        totals.authenticMemoryStructuralExactCases += Number(authenticMemoryStructuralExact);
        const classifiedStructuralExact = foundationBrickStructuralExact
          || authenticMemoryStructuralExact;
        totals.fallbackExactCases += Number(verification.exact && !classifiedStructuralExact);
        totals.structurallyMatchedCases += Number(structurallyMatched);
        totals.fallbackMatchedCases += Number(structurallyMatched && !classifiedStructuralExact);
        if (!verification.exact) {
          const code = mismatchCode(verification);
          totals.failureCases[code] = (totals.failureCases[code] ?? 0) + 1;
        }
      } catch (error) {
        totals.frames += expectedFrames;
        totals.compileFailures += 1;
        totals.failureCases[`Compile:${safeErrorName(error)}`] = (
          totals.failureCases[`Compile:${safeErrorName(error)}`] ?? 0
        ) + 1;
      }
    }
  }

  totals.foundationBehaviourKinds = foundationBehaviourKinds.size;
  totals.foundationUnitKinds = foundationUnitKinds.size;
  totals.authenticMemoryKinds = authenticMemoryKinds.size;
  totals.unsupportedEffectKinds = unsupportedEffectKinds.size;
  const unitOccurrences = indexedUnitOccurrences + totals.nativeUnits;
  totals.foundationUnitCoverage = unitOccurrences === 0
    ? 0
    : totals.foundationUnitOccurrences / unitOccurrences;
  const behaviourOccurrences = indexedBehaviourOccurrences + totals.localBehaviours;
  totals.foundationBehaviourCoverage = behaviourOccurrences === 0
    ? 0
    : totals.foundationBehaviours / behaviourOccurrences;
  totals.mismatchedFrames = totals.frames - totals.matchedFrames;
  totals.renderErrorFrames = totals.baselineErrorFrames + totals.generatedErrorFrames;
  totals.treeExact = totals.cases > 0
    && totals.exactCases === totals.cases
    && totals.compileFailures === 0
    && totals.renderErrorFrames === 0;
  totals.pixelComparedFrames = 0;
  totals.pixelExact = false;
  return deepFreeze(totals);
}

export function modelMetrics(train, validation) {
  return deepFreeze({
    train: compactMetrics(train),
    validation: compactMetrics(validation),
  });
}

/**
 * Deterministic authority: a profile may never trade fidelity for reuse.
 *
 * Foundation classes are useful only after the generated graph remains at least
 * as faithful on both tuning splits.  This is deliberately a Pareto gate,
 * rather than a weighted score or lexicographic shortcut: one extra matched
 * frame cannot hide a new compile failure, render error, or lost exact case.
 */
export function isProfileImprovement(candidate, baseline) {
  const hardLowerIsBetter = [
    'compileFailures',
    'renderErrorFrames',
    'mismatchedFrames',
    'invalidOwners',
    'unsupportedEffectCases',
    'unsupportedEffectFrames',
    'unsupportedEffectOccurrences',
    'unsupportedEffectKinds',
  ];
  const reuseLowerIsBetter = [
    'nativeUnits',
    'residualVisualComputations',
  ];
  const hardHigherIsBetter = [
    'matchedFrames',
    'exactCases',
    'foundationBrickStructuralExactCases',
    'structurallyMatchedCases',
    'foundationUnitCoverage',
    'foundationUnitOccurrences',
    'foundationUnitKinds',
  ];
  const secondaryHigherIsBetter = [
    'foundationBehaviours',
    'foundationBehaviourKinds',
    'foundationBehaviourCoverage',
  ];
  let fidelityImproved = false;
  let unitImproved = false;
  let escapeHatchPotentialReduced = false;

  for (const group of ['validation', 'train']) {
    for (const metric of hardLowerIsBetter) {
      if (candidate[group][metric] > baseline[group][metric]) return false;
      if (candidate[group][metric] < baseline[group][metric]) fidelityImproved = true;
    }
    for (const metric of hardHigherIsBetter) {
      if (candidate[group][metric] < baseline[group][metric]) return false;
      if (candidate[group][metric] > baseline[group][metric]) {
        if (['foundationUnitCoverage', 'foundationUnitOccurrences', 'foundationUnitKinds']
          .includes(metric)) {
          unitImproved = true;
        } else {
          fidelityImproved = true;
        }
      }
    }
    for (const metric of reuseLowerIsBetter) {
      if (candidate[group][metric] > baseline[group][metric]) return false;
    }
    const candidateEscapeHatches = staticEscapeHatchPotential(candidate[group]);
    const baselineEscapeHatches = staticEscapeHatchPotential(baseline[group]);
    if (candidateEscapeHatches > baselineEscapeHatches) return false;
    if (candidateEscapeHatches < baselineEscapeHatches) escapeHatchPotentialReduced = true;
    for (const metric of secondaryHigherIsBetter) {
      if (candidate[group][metric] < baseline[group][metric]) return false;
    }
  }

  if (fidelityImproved) return true;

  // A foundation Unit improvement must replace fallback nodes, not merely add
  // a foundation class beside the same NativeUnit graph.
  const replacedFallback = ['validation', 'train'].some((group) => (
    candidate[group].nativeUnits < baseline[group].nativeUnits
      && candidate[group].foundationUnitOccurrences
        > baseline[group].foundationUnitOccurrences
      && candidate[group].foundationUnitCoverage > baseline[group].foundationUnitCoverage
  ));
  if (unitImproved && replacedFallback) return true;

  // Behaviour-only improvements cannot turn a NativeUnit-only reconstruction
  // into a successful foundation result. They become eligible only after both
  // tuning splits already have non-zero foundation Unit coverage.
  if (['validation', 'train'].some((group) => candidate[group].foundationUnitCoverage <= 0)) {
    return false;
  }

  let secondaryImproved = escapeHatchPotentialReduced;
  for (const group of ['validation', 'train']) {
    for (const metric of secondaryHigherIsBetter) {
      if (candidate[group][metric] > baseline[group][metric]) secondaryImproved = true;
    }
  }
  return secondaryImproved;
}

function staticEscapeHatchPotential(metrics) {
  return metrics.staticNativeUnitPotential
    + metrics.staticLocalBehaviourPotential
    + metrics.staticResidualVisualPotential;
}

function compactMetrics(value) {
  return {
    cases: value.cases,
    frames: value.frames,
    exactCases: value.exactCases,
    matchedFrames: value.matchedFrames,
    mismatchedFrames: value.mismatchedFrames,
    compileFailures: value.compileFailures,
    renderErrorFrames: value.renderErrorFrames,
    foundationBehaviours: value.foundationBehaviours,
    foundationBehaviourKinds: value.foundationBehaviourKinds,
    foundationBehaviourCoverage: value.foundationBehaviourCoverage,
    foundationUnitOccurrences: value.foundationUnitOccurrences,
    foundationUnitKinds: value.foundationUnitKinds,
    foundationUnitCoverage: value.foundationUnitCoverage,
    authenticMemoryUnitOccurrences: value.authenticMemoryUnitOccurrences,
    authenticMemoryBehaviourOccurrences: value.authenticMemoryBehaviourOccurrences,
    authenticMemoryKinds: value.authenticMemoryKinds,
    authenticMemoryStructuralExactCases: value.authenticMemoryStructuralExactCases,
    localBehaviours: value.localBehaviours,
    staticLocalBehaviourPotential: value.staticLocalBehaviourPotential,
    residualVisualComputations: value.residualVisualComputations,
    staticResidualVisualPotential: value.staticResidualVisualPotential,
    nativeUnits: value.nativeUnits,
    staticNativeUnitPotential: value.staticNativeUnitPotential,
    foundationBrickStructuralExactCases: value.foundationBrickStructuralExactCases,
    fallbackExactCases: value.fallbackExactCases,
    structurallyMatchedCases: value.structurallyMatchedCases,
    fallbackMatchedCases: value.fallbackMatchedCases,
    unsupportedEffectCases: value.unsupportedEffectCases,
    unsupportedEffectFrames: value.unsupportedEffectFrames,
    unsupportedEffectOccurrences: value.unsupportedEffectOccurrences,
    unsupportedEffectKinds: value.unsupportedEffectKinds,
    warnings: value.warnings,
    invalidOwners: value.invalidOwners,
  };
}

function emptyMetrics() {
  return {
    cases: 0,
    frames: 0,
    exactCases: 0,
    matchedFrames: 0,
    mismatchedFrames: 0,
    compileFailures: 0,
    baselineErrorFrames: 0,
    generatedErrorFrames: 0,
    renderErrorFrames: 0,
    nativeUnits: 0,
    staticNativeUnitPotential: 0,
    localBehaviours: 0,
    staticLocalBehaviourPotential: 0,
    residualVisualComputations: 0,
    staticResidualVisualPotential: 0,
    foundationBehaviours: 0,
    foundationBehaviourKinds: 0,
    foundationBehaviourCoverage: 0,
    foundationUnitOccurrences: 0,
    foundationUnitKinds: 0,
    foundationUnitCoverage: 0,
    foundationBrickStructuralExactCases: 0,
    authenticMemoryUnitOccurrences: 0,
    authenticMemoryBehaviourOccurrences: 0,
    authenticMemoryKinds: 0,
    authenticMemoryStructuralExactCases: 0,
    fallbackExactCases: 0,
    structurallyMatchedCases: 0,
    fallbackMatchedCases: 0,
    unsupportedEffectCases: 0,
    unsupportedEffectFrames: 0,
    unsupportedEffectOccurrences: 0,
    unsupportedEffectKinds: 0,
    warnings: 0,
    invalidOwners: 0,
    failureCases: {},
    treeExact: false,
    pixelComparedFrames: 0,
    pixelExact: false,
  };
}

function selectedOccurrences(counts, selectedKinds) {
  return Object.entries(counts).reduce((total, [kind, count]) => (
    total + (selectedKinds.has(kind) ? Number(count) : 0)
  ), 0);
}

function selectedObservedKinds(counts, selectedKinds) {
  return Object.entries(counts)
    .filter(([kind, count]) => selectedKinds.has(kind) && Number(count) > 0)
    .map(([kind]) => kind);
}

function sumCountRecord(counts) {
  return Object.values(counts).reduce((total, count) => total + Number(count), 0);
}

function mismatchCode(verification) {
  return verification.mismatchCategory
    ?? verification.firstMismatch?.evaluatorError
    ?? verification.firstMismatch?.baselineError
    ?? verification.firstMismatch?.generatedError
    ?? 'TreeMismatch';
}

function normalizeSplits(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError('At least one dataset split is required');
  }
  const output = new Set(values);
  if (output.size !== values.length || [...output].some((value) => !SPLITS.has(value))) {
    throw new TypeError('Dataset splits must be unique train, validation or heldout values');
  }
  return output;
}

function frameCount(video) {
  return Math.max(1, Math.ceil(video.lengthMs / 1000 * video.fps));
}

function safeErrorName(error) {
  return ['Error', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError']
    .includes(error?.name) ? error.name : 'Error';
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
