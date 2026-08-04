import { isProfileImprovement } from './profile-evaluator.js';

const LOWER_IS_BETTER = Object.freeze([
  'compileFailures',
  'renderErrorFrames',
  'mismatchedFrames',
  'invalidOwners',
  'unsupportedEffectCases',
  'unsupportedEffectFrames',
  'unsupportedEffectOccurrences',
  'unsupportedEffectKinds',
  'nativeUnits',
  'localBehaviours',
  'warnings',
  'residualVisualComputations',
  'staticEscapeHatchPotential',
]);

const HIGHER_IS_BETTER = Object.freeze([
  'foundationBrickStructuralExactCases',
  'structurallyMatchedCases',
  'exactCases',
  'matchedFrames',
  'foundationUnitCoverage',
  'foundationUnitOccurrences',
  'foundationUnitKinds',
  'foundationBehaviours',
  'foundationBehaviourKinds',
  'foundationBehaviourCoverage',
]);

/**
 * Select from the evaluated set only. Model order controls which profiles are
 * measured, but never the Pareto relation or the deterministic final tie-break.
 */
export function selectDeterministicProfile(baselineRecord, evaluatedRecords) {
  const eligible = [
    baselineRecord,
    ...evaluatedRecords.filter((record) => (
      isProfileImprovement(record.metrics, baselineRecord.metrics)
    )),
  ];
  const frontier = eligible.filter((record) => !eligible.some((other) => (
    other !== record && dominates(other.metrics, record.metrics)
  )));
  const selected = [...frontier].sort(compareRecords)[0];
  return deepFreeze({
    selectedProfileId: selected.profile.id,
    eligibleProfileIds: eligible.map(({ profile }) => profile.id).sort(),
    paretoProfileIds: frontier.map(({ profile }) => profile.id).sort(),
  });
}

export function dominates(left, right) {
  let improved = false;
  for (const split of ['validation', 'train']) {
    for (const metric of LOWER_IS_BETTER) {
      if (metricValue(left[split], metric) > metricValue(right[split], metric)) return false;
      if (metricValue(left[split], metric) < metricValue(right[split], metric)) improved = true;
    }
    for (const metric of HIGHER_IS_BETTER) {
      if (left[split][metric] < right[split][metric]) return false;
      if (left[split][metric] > right[split][metric]) improved = true;
    }
  }
  return improved;
}

function compareRecords(left, right) {
  for (const split of ['validation', 'train']) {
    for (const metric of HIGHER_IS_BETTER) {
      const compared = right.metrics[split][metric] - left.metrics[split][metric];
      if (compared !== 0) return compared;
    }
    for (const metric of LOWER_IS_BETTER) {
      const compared = metricValue(left.metrics[split], metric)
        - metricValue(right.metrics[split], metric);
      if (compared !== 0) return compared;
    }
  }
  return left.profile.id.localeCompare(right.profile.id);
}

function metricValue(metrics, key) {
  if (key !== 'staticEscapeHatchPotential') return metrics[key];
  return metrics.staticNativeUnitPotential
    + metrics.staticLocalBehaviourPotential
    + metrics.staticResidualVisualPotential;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
