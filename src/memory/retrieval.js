import {
  isStyleFamily,
  isStyleScentToken,
  STYLE_SCENT_KEYS,
} from './scent-schema.js';

const AXES = Object.freeze(STYLE_SCENT_KEYS.filter((key) => key !== 'family'));

/**
 * Deterministically select reusable style classes from a navigation index.
 *
 * There is deliberately no model-authored confidence score. The returned
 * match explains the exact controlled cues that were present or absent, and
 * ordering is a stable tuple over those facts.
 */
export function retrieveStyleMemories(indexOrEntries, query, options = {}) {
  const entries = Array.isArray(indexOrEntries)
    ? indexOrEntries
    : indexOrEntries?.entries;
  if (!Array.isArray(entries)) throw new TypeError('style index entries must be an array');
  const normalizedQuery = normalizeQuery(query);
  const limit = normalizeLimit(options.limit);

  const matches = entries
    .filter((entry) => entry?.role === 'memory' && ['unit', 'behaviour'].includes(entry.type))
    .map((entry) => matchEntry(entry, normalizedQuery))
    .filter(Boolean)
    .sort(compareMatches)
    .slice(0, limit)
    .map(({ sort: _sort, ...match }) => deepFreeze(match));

  return Object.freeze(matches);
}

function matchEntry(entry, query) {
  const scent = normalizeCandidateScent(entry.scent);
  if (!scent) return null;
  const familyMatched = query.family !== null && query.family === scent.family;
  const matched = {};
  const missing = {};
  let matchedCues = 0;
  let missingCues = 0;
  let coveredAxes = 0;
  let extraCues = 0;

  for (const axis of AXES) {
    const candidate = new Set(scent[axis]);
    matched[axis] = query[axis].filter((cue) => candidate.has(cue));
    missing[axis] = query[axis].filter((cue) => !candidate.has(cue));
    matchedCues += matched[axis].length;
    missingCues += missing[axis].length;
    if (matched[axis].length > 0) coveredAxes += 1;
    extraCues += scent[axis].filter((cue) => !query[axis].includes(cue)).length;
  }

  if (!familyMatched && matchedCues === 0) return null;
  return {
    entry: cloneEntry(entry, scent),
    match: {
      family: familyMatched,
      cues: matched,
      missing: missing,
    },
    sort: {
      familyMatched,
      coveredAxes,
      matchedCues,
      missingCues,
      extraCues,
      kind: String(entry.kind ?? ''),
    },
  };
}

function normalizeQuery(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('style query must be an object');
  }
  const unknown = Object.keys(value).filter((key) => !STYLE_SCENT_KEYS.includes(key));
  if (unknown.length > 0) throw new TypeError(`style query contains unsupported key: ${unknown[0]}`);
  const family = value.family === undefined ? null : requireFamily(value.family);
  const query = { family };
  for (const axis of AXES) query[axis] = normalizeCues(value[axis] ?? [], axis, true);
  if (family === null && AXES.every((axis) => query[axis].length === 0)) {
    throw new TypeError('style query must contain a family or at least one cue');
  }
  return deepFreeze(query);
}

function normalizeCandidateScent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const scent = { family: requireFamily(value.family) };
    for (const axis of AXES) scent[axis] = normalizeCues(value[axis], axis, true);
    return scent;
  } catch {
    return null;
  }
}

function cloneEntry(entry, scent) {
  return {
    kind: entry.kind,
    type: entry.type,
    role: entry.role,
    source: entry.source,
    export: entry.export,
    scent: {
      family: scent.family,
      ...Object.fromEntries(AXES.map((axis) => [axis, [...scent[axis]]])),
    },
  };
}

function normalizeCues(value, axis, allowEmpty) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > 8) {
    throw new TypeError(`${axis} cues are invalid`);
  }
  const cues = value.map((cue) => requireToken(cue, axis));
  if (new Set(cues).size !== cues.length) throw new TypeError(`${axis} cues must be unique`);
  return [...cues].sort();
}

function requireToken(value, label) {
  if (!isStyleScentToken(value)) {
    throw new TypeError(`${label} must be a lowercase kebab-case token`);
  }
  return value;
}

function requireFamily(value) {
  if (!isStyleFamily(value)) {
    throw new TypeError('family must use the controlled style-family vocabulary');
  }
  return value;
}

function normalizeLimit(value) {
  const limit = value ?? 8;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new RangeError('style retrieval limit must be an integer from 1 through 50');
  }
  return limit;
}

function compareMatches(left, right) {
  return Number(right.sort.familyMatched) - Number(left.sort.familyMatched)
    || right.sort.coveredAxes - left.sort.coveredAxes
    || right.sort.matchedCues - left.sort.matchedCues
    || left.sort.missingCues - right.sort.missingCues
    || left.sort.extraCues - right.sort.extraCues
    || left.sort.kind.localeCompare(right.sort.kind);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
