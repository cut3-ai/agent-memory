export const MAX_MODEL_LAB_ROUNDS = 20;
export const DEFAULT_REVIEW_CHECKPOINTS = Object.freeze([5, 10, 15, 20]);

const MAX_CANDIDATES = 200;
const MAX_CATALOG_BYTES = 240_000;
const MAX_METRIC_DEPTH = 8;
const MAX_METRIC_LEAVES = 512;
const MAX_METRIC_KEY_LENGTH = 80;
const UNSAFE_METRIC_NAME = /(?:corpus|source|url|uri|transcript|dialog|prompt|content|text|code|patch|file|path|workspace|secret|credential|apikey|api_key|session)/i;

export function normalizeRounds(value = MAX_MODEL_LAB_ROUNDS) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_MODEL_LAB_ROUNDS) {
    throw new RangeError(`Model lab rounds must be from 1 through ${MAX_MODEL_LAB_ROUNDS}`);
  }
  return value;
}

export function normalizeReviewCheckpoints(value, rounds) {
  const requested = value === undefined
    ? DEFAULT_REVIEW_CHECKPOINTS.filter((round) => round <= rounds)
    : value;
  if (!Array.isArray(requested)) throw new TypeError('reviewCheckpoints must be an array');
  const checkpoints = requested.map((round) => {
    if (!Number.isSafeInteger(round) || round < 1 || round > rounds) {
      throw new RangeError('Review checkpoints must refer to configured rounds');
    }
    return round;
  });
  if (new Set(checkpoints).size !== checkpoints.length) {
    throw new Error('Review checkpoints must be unique');
  }
  return Object.freeze([...checkpoints].sort((left, right) => left - right));
}

export function normalizeCandidateCatalog(value, rounds) {
  if (!Array.isArray(value) || value.length < rounds || value.length > MAX_CANDIDATES) {
    throw new RangeError(`Candidate catalog must contain ${rounds} through ${MAX_CANDIDATES} entries`);
  }
  const ids = new Set();
  const candidates = value.map((candidate, index) => {
    assertPlainDataObject(candidate, `candidate ${index + 1}`);
    assertExactKeys(candidate, ['id', 'metrics'], `candidate ${index + 1}`);
    const id = normalizeCandidateId(candidate.id);
    if (ids.has(id)) throw new Error(`Duplicate candidate id: ${id}`);
    ids.add(id);
    return Object.freeze({
      id,
      metrics: normalizeAggregateMetrics(candidate.metrics, `candidate ${id} metrics`),
    });
  });
  if (Buffer.byteLength(JSON.stringify(candidates), 'utf8') > MAX_CATALOG_BYTES) {
    throw new RangeError('Candidate catalog is too large');
  }
  return Object.freeze(candidates);
}

export function normalizeCandidateId(value) {
  if (typeof value !== 'string'
      || value.length > 80
      || value === '.'
      || value === '..'
      || value.includes('..')
      || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
      || UNSAFE_METRIC_NAME.test(value)) {
    throw new TypeError('Candidate id must be a bounded opaque identifier');
  }
  return value;
}

export function normalizeAggregateMetrics(value, label = 'aggregate metrics') {
  const state = { leaves: 0 };
  const normalized = normalizeMetricObject(value, label, 0, state);
  if (state.leaves === 0) throw new Error(`${label} must contain at least one aggregate value`);
  return normalized;
}

export function createCandidateChoiceSchema(candidateIds) {
  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    throw new Error('At least one candidate id is required');
  }
  const ids = candidateIds.map(normalizeCandidateId);
  if (new Set(ids).size !== ids.length) throw new Error('Candidate schema ids must be unique');
  return deepFreeze({
    type: 'object',
    additionalProperties: false,
    required: ['candidateId', 'rationale'],
    properties: {
      candidateId: { type: 'string', enum: ids },
      rationale: { type: 'string', minLength: 1, maxLength: 512 },
    },
  });
}

export function validateCandidateChoice(value, remainingIds) {
  assertPlainDataObject(value, 'provider choice');
  assertExactKeys(value, ['candidateId', 'rationale'], 'provider choice');
  const candidateId = normalizeCandidateId(value.candidateId);
  if (!remainingIds.includes(candidateId)) throw new Error('Provider selected an unavailable candidate');
  if (typeof value.rationale !== 'string'
      || value.rationale.length < 1
      || value.rationale.length > 512) {
    throw new Error('Provider rationale is invalid');
  }
  return Object.freeze({ candidateId, rationale: value.rationale });
}

export function assertAdvisoryProvider(value, expectedProvider) {
  if (!value
      || value.provider !== expectedProvider
      || typeof value.generateStructured !== 'function'
      || typeof value.model !== 'string'
      || !/^[A-Za-z0-9._-]{1,100}$/.test(value.model)) {
    throw new TypeError(`A configured ${expectedProvider} structured provider is required`);
  }
  return value;
}

function normalizeMetricObject(value, label, depth, state) {
  if (depth > MAX_METRIC_DEPTH) throw new RangeError(`${label} is too deeply nested`);
  assertPlainDataObject(value, label);
  const keys = Object.keys(value);
  if (keys.length === 0 && depth > 0) throw new Error(`${label} contains an empty metric group`);
  const normalized = {};
  for (const key of keys.sort()) {
    assertMetricKey(key, label);
    const entry = value[key];
    if (isPlainDataObject(entry)) {
      normalized[key] = normalizeMetricObject(entry, label, depth + 1, state);
      continue;
    }
    if (typeof entry === 'number') {
      if (!Number.isFinite(entry)) throw new TypeError(`${label} contains a non-finite number`);
      normalized[key] = Object.is(entry, -0) ? 0 : entry;
    } else if (typeof entry === 'boolean' || entry === null) {
      normalized[key] = entry;
    } else {
      throw new TypeError(`${label} may contain only finite numbers, booleans, null, and metric groups`);
    }
    state.leaves += 1;
    if (state.leaves > MAX_METRIC_LEAVES) throw new RangeError(`${label} contains too many values`);
  }
  return Object.freeze(normalized);
}

function assertMetricKey(value, label) {
  if (typeof value !== 'string'
      || value.length < 1
      || value.length > MAX_METRIC_KEY_LENGTH
      || !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(value)
      || value.includes('..')
      || UNSAFE_METRIC_NAME.test(value)
      || ['constructor', 'prototype'].includes(value)) {
    throw new TypeError(`${label} contains an unsafe metric name`);
  }
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain only ${wanted.join(' and ')}`);
  }
}

function isPlainDataObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) => (
    Object.hasOwn(descriptor, 'value')
  ));
}

function assertPlainDataObject(value, label) {
  if (!isPlainDataObject(value)) throw new TypeError(`${label} must be a plain data object`);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
