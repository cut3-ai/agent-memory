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
        totals.nativeUnits += compiled.escapeHatches.nativeUnits;
        totals.localBehaviours += compiled.escapeHatches.localBehaviours;
        totals.reusableBehaviours += compiled.memoryCandidates.behaviours.length;
        totals.reusableUnits += compiled.memoryCandidates.units.length;
        totals.warnings += compiled.warnings.length;
        totals.invalidOwners = Math.max(
          totals.invalidOwners,
          verification.invalidBehaviourOwners,
        );
        for (const candidate of compiled.memoryCandidates.behaviours) {
          reusableKinds.add(candidate.kind);
        }
        for (const candidate of compiled.memoryCandidates.units) {
          reusableUnitKinds.add(candidate.kind);
        }
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
  totals.reusableUnitKinds = reusableUnitKinds.size;
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
  const lowerIsBetter = [
    'compileFailures',
    'renderErrorFrames',
    'mismatchedFrames',
    'invalidOwners',
  ];
  const higherIsBetter = ['matchedFrames', 'exactCases'];
  const secondaryLowerIsBetter = ['localBehaviours', 'warnings'];
  const secondaryHigherIsBetter = [
    'reusableUnits',
    'reusableUnitKinds',
    'reusableBehaviours',
    'reusableKinds',
  ];
  let improved = false;

  for (const group of ['validation', 'train']) {
    for (const metric of lowerIsBetter) {
      if (candidate[group][metric] > baseline[group][metric]) return false;
      if (candidate[group][metric] < baseline[group][metric]) improved = true;
    }
    for (const metric of higherIsBetter) {
      if (candidate[group][metric] < baseline[group][metric]) return false;
      if (candidate[group][metric] > baseline[group][metric]) improved = true;
    }
  }

  if (improved) return true;

  for (const group of ['validation', 'train']) {
    for (const metric of secondaryLowerIsBetter) {
      if (candidate[group][metric] > baseline[group][metric]) return false;
      if (candidate[group][metric] < baseline[group][metric]) improved = true;
    }
    for (const metric of secondaryHigherIsBetter) {
      if (candidate[group][metric] < baseline[group][metric]) return false;
      if (candidate[group][metric] > baseline[group][metric]) improved = true;
    }
  }
  return improved;
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
    reusableUnits: value.reusableUnits,
    reusableUnitKinds: value.reusableUnitKinds,
    localBehaviours: value.localBehaviours,
    nativeUnits: value.nativeUnits,
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
    localBehaviours: 0,
    reusableBehaviours: 0,
    reusableKinds: 0,
    reusableUnits: 0,
    reusableUnitKinds: 0,
    warnings: 0,
    invalidOwners: 0,
    failureCases: {},
    treeExact: false,
    pixelComparedFrames: 0,
    pixelExact: false,
  };
}

function mismatchCode(verification) {
  return verification.firstMismatch?.evaluatorError
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
