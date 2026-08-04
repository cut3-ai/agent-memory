import { compileCompositionV2 } from '../cba-v2/compiler.js';
import { verifyCompositionV2 } from '../cba-v2/verifier.js';

const SPLITS = new Set(['train', 'validation', 'heldout']);

/**
 * Compile and compare every frame selected by a workspace-level split.
 * Only aggregate counters leave this module; source, URLs and rendered trees do not.
 */
export function evaluateCbaProfile(dataset, split, profile, options = {}) {
  const selectedSplits = normalizeSplits(options.splits ?? ['train']);
  const totals = emptyMetrics();
  const reusableKinds = new Set();
  const reusableUnitKinds = new Set();
  const unsupportedEffectKinds = new Set();

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
        totals.reusableBehaviours += verification.maximumPublicBehaviours;
        totals.publicUnitOccurrences += verification.maximumPublicUnits;
        totals.warnings += compiled.warnings.length;
        totals.invalidOwners = Math.max(
          totals.invalidOwners,
          verification.invalidBehaviourOwners,
        );
        verification.publicBehaviourKinds.forEach((kind) => reusableKinds.add(kind));
        verification.publicUnitKinds.forEach((kind) => reusableUnitKinds.add(kind));
        if (verification.unsupportedEffects.length > 0) {
          totals.unsupportedEffectCases += 1;
          totals.unsupportedEffectFrames += verification.totalFrames;
          totals.unsupportedEffectOccurrences += verification.unsupportedEffects.length;
          verification.unsupportedEffects.forEach((kind) => unsupportedEffectKinds.add(kind));
        }
        const publicBrickStructuralExact = verification.exact
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
          && options.indexedKinds instanceof Set
          && [...verification.publicUnitKinds, ...verification.publicBehaviourKinds]
            .every((kind) => options.indexedKinds.has(kind));
        const structurallyMatched = verification.matchedFrames === verification.totalFrames
          && verification.baselineRenderErrors === 0
          && verification.generatedRenderErrors === 0;
        totals.publicBrickStructuralExactCases += Number(publicBrickStructuralExact);
        totals.fallbackExactCases += Number(verification.exact && !publicBrickStructuralExact);
        totals.structurallyMatchedCases += Number(structurallyMatched);
        totals.fallbackMatchedCases += Number(structurallyMatched && !publicBrickStructuralExact);
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

  totals.reusableKinds = reusableKinds.size;
  totals.publicUnitKinds = reusableUnitKinds.size;
  totals.unsupportedEffectKinds = unsupportedEffectKinds.size;
  const unitOccurrences = totals.publicUnitOccurrences + totals.nativeUnits;
  totals.publicUnitCoverage = unitOccurrences === 0
    ? 0
    : totals.publicUnitOccurrences / unitOccurrences;
  const behaviourOccurrences = totals.reusableBehaviours + totals.localBehaviours;
  totals.publicBehaviourCoverage = behaviourOccurrences === 0
    ? 0
    : totals.reusableBehaviours / behaviourOccurrences;
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
 * Reusable classes are useful only after the generated graph remains at least
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
    'publicBrickStructuralExactCases',
    'structurallyMatchedCases',
    'publicUnitCoverage',
    'publicUnitOccurrences',
    'publicUnitKinds',
  ];
  const secondaryHigherIsBetter = [
    'reusableBehaviours',
    'reusableKinds',
    'publicBehaviourCoverage',
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
        if (['publicUnitCoverage', 'publicUnitOccurrences', 'publicUnitKinds'].includes(metric)) {
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

  // A reusable Unit improvement must replace fallback nodes, not merely add a
  // public class beside the same NativeUnit graph.
  const replacedFallback = ['validation', 'train'].some((group) => (
    candidate[group].nativeUnits < baseline[group].nativeUnits
      && candidate[group].publicUnitOccurrences > baseline[group].publicUnitOccurrences
      && candidate[group].publicUnitCoverage > baseline[group].publicUnitCoverage
  ));
  if (unitImproved && replacedFallback) return true;

  // Behaviour-only improvements cannot turn a NativeUnit-only reconstruction
  // into a successful memory result.  They become eligible only after both
  // tuning splits already have a non-zero public Unit foundation.
  if (['validation', 'train'].some((group) => candidate[group].publicUnitCoverage <= 0)) {
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
    reusableBehaviours: value.reusableBehaviours,
    reusableKinds: value.reusableKinds,
    publicBehaviourCoverage: value.publicBehaviourCoverage,
    publicUnitOccurrences: value.publicUnitOccurrences,
    publicUnitKinds: value.publicUnitKinds,
    publicUnitCoverage: value.publicUnitCoverage,
    localBehaviours: value.localBehaviours,
    staticLocalBehaviourPotential: value.staticLocalBehaviourPotential,
    residualVisualComputations: value.residualVisualComputations,
    staticResidualVisualPotential: value.staticResidualVisualPotential,
    nativeUnits: value.nativeUnits,
    staticNativeUnitPotential: value.staticNativeUnitPotential,
    publicBrickStructuralExactCases: value.publicBrickStructuralExactCases,
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
    reusableBehaviours: 0,
    reusableKinds: 0,
    publicBehaviourCoverage: 0,
    publicUnitOccurrences: 0,
    publicUnitKinds: 0,
    publicUnitCoverage: 0,
    publicBrickStructuralExactCases: 0,
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
