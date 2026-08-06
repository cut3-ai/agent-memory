import { FEATURE_KEYS } from '../../src/cba-v2/features.js';

export const PROFILE_SEARCH_ROUNDS = 20;
export const PROFILE_FRONTIER_SIZE = 6;

/**
 * Public descriptors contain compiler capability switches and counters only.
 * They never contain composition material or predicted outcome metrics.
 */
export function profileStructuralMetrics(profile) {
  const flags = Object.fromEntries(FEATURE_KEYS.map((key) => [key, profile.features[key]]));
  return deepFreeze({
    enabledFeatureCount: Object.values(flags).filter(Boolean).length,
    featureFlags: flags,
  });
}

/**
 * Reveal a bounded neighbourhood instead of sending the entire search space.
 * Kimi's selection determines the most recent seed; an Anthropic checkpoint
 * may nominate an already-evaluated seed.  Both influence which neighbours
 * become visible next, while neither can accept a compiler profile.
 */
export function createSequentialProfileFrontier(profiles, baselineProfile, options = {}) {
  const frontierSize = options.frontierSize ?? PROFILE_FRONTIER_SIZE;
  if (!Number.isSafeInteger(frontierSize) || frontierSize < 2 || frontierSize > 12) {
    throw new RangeError('profile frontier size must be from 2 through 12');
  }
  const records = profiles.map((profile) => ({ profile }));
  const byId = new Map(records.map((record) => [record.profile.id, record]));
  if (byId.size !== records.length) throw new Error('profile search ids must be unique');
  const allFeatureId = records.find(({ profile }) => (
    FEATURE_KEYS.every((key) => profile.features[key] === true)
  ))?.profile.id ?? null;
  if (allFeatureId === null) throw new Error('profile search requires an all-feature anchor');

  return Object.freeze(function revealProfileCandidates(context) {
    const evaluated = new Set(context.evaluatedCandidateIds);
    const remaining = records.filter(({ profile }) => !evaluated.has(profile.id));
    if (remaining.length === 0) return Object.freeze([]);

    const recentId = context.evaluatedCandidateIds.at(-1) ?? null;
    const acceptedId = context.acceptedCandidateIds.at(-1) ?? null;
    const advisoryId = context.advisorySeedId ?? null;
    const advisoryFeatures = byId.get(advisoryId)?.profile.features ?? null;
    const recentFeatures = byId.get(recentId)?.profile.features ?? null;
    const acceptedFeatures = byId.get(acceptedId)?.profile.features ?? baselineProfile.features;
    const seenFeatures = context.evaluatedCandidateIds
      .map((id) => byId.get(id)?.profile.features)
      .filter(Boolean);

    const ranked = remaining
      .map((record) => ({
        ...record,
        advisoryDistance: advisoryFeatures === null
          ? Number.MAX_SAFE_INTEGER
          : hamming(record.profile.features, advisoryFeatures),
        recentDistance: recentFeatures === null
          ? Number.MAX_SAFE_INTEGER
          : hamming(record.profile.features, recentFeatures),
        acceptedDistance: hamming(record.profile.features, acceptedFeatures),
        novelty: seenFeatures.length === 0
          ? hamming(record.profile.features, baselineProfile.features)
          : Math.min(...seenFeatures.map((features) => hamming(record.profile.features, features))),
      }))
      .sort(compareSearchRecords)
      .map(({ profile }) => profile.id);
    const anchored = ranked.includes(allFeatureId)
      ? [allFeatureId, ...ranked.filter((id) => id !== allFeatureId)]
      : ranked;
    return Object.freeze(anchored.slice(0, frontierSize));
  });
}

function compareSearchRecords(left, right) {
  return compareDistance(left.advisoryDistance, right.advisoryDistance)
    || compareDistance(left.recentDistance, right.recentDistance)
    || compareDistance(left.acceptedDistance, right.acceptedDistance)
    || right.novelty - left.novelty
    || enabledCount(left.profile.features) - enabledCount(right.profile.features)
    || left.profile.id.localeCompare(right.profile.id);
}

// A direct neighbour is preferred; otherwise distance is a deterministic
// exploration cost. Number.MAX_SAFE_INTEGER represents an absent seed.
function compareDistance(left, right) {
  const leftBand = left === 1 ? 0 : left === Number.MAX_SAFE_INTEGER ? 2 : 1;
  const rightBand = right === 1 ? 0 : right === Number.MAX_SAFE_INTEGER ? 2 : 1;
  return leftBand - rightBand || left - right;
}

function enabledCount(features) {
  return FEATURE_KEYS.reduce((count, key) => count + Number(features[key]), 0);
}

function hamming(left, right) {
  return FEATURE_KEYS.reduce((distance, key) => (
    distance + Number(left[key] !== right[key])
  ), 0);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
