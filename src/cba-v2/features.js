export const FEATURE_KEYS = Object.freeze([
  'publicGroupUnit',
  'publicBoxUnit',
  'publicLayerUnit',
  'publicLabelUnit',
  'publicImageUnit',
  'publicAudioUnit',
  'publicVideoUnit',
  'collectionChildren',
  'primitiveChildUnit',
  'opacityTween',
  'declarativeSignalIr',
  'opacityFormula',
  'scaleFormula',
  'translateFormula',
  'rotateFormula',
]);

export const CBA_V2_FEATURE_DEFAULTS = Object.freeze(Object.fromEntries(
  FEATURE_KEYS.map((key) => [key, true]),
));

export function normalizeCbaV2Features(input = undefined) {
  if (input === undefined) return CBA_V2_FEATURE_DEFAULTS;
  if (!isPlainRecord(input)) throw new TypeError('features must be a plain object');
  const unknown = Object.keys(input).find((key) => !FEATURE_KEYS.includes(key));
  if (unknown) throw new TypeError(`Unknown cba-v2 feature: ${unknown}`);
  const profile = {};
  for (const key of FEATURE_KEYS) {
    const value = Object.hasOwn(input, key) ? input[key] : CBA_V2_FEATURE_DEFAULTS[key];
    if (typeof value !== 'boolean') throw new TypeError(`features.${key} must be boolean`);
    profile[key] = value;
  }
  return Object.freeze(profile);
}

// The search space is deliberately bounded. It samples single capabilities,
// the all-feature profile, complements and low-order interactions without
// enumerating 2^N compiler configurations.
const MAX_SEARCH_PROFILES = 96;
const SEARCH_FEATURE_VECTORS = buildSearchFeatureVectors(FEATURE_KEYS.length, MAX_SEARCH_PROFILES);

export const CBA_V2_SEARCH_SPACE = Object.freeze(SEARCH_FEATURE_VECTORS.map((vector) => {
  const fingerprint = vector.map(Number).join('');
  return Object.freeze({
    id: `p_${opaqueHash(`cba-profile-search-v4:${fingerprint}`)}`,
    features: Object.freeze(Object.fromEntries(FEATURE_KEYS.map((key, index) => [
      key,
      vector[index],
    ]))),
  });
}));

// Compatibility alias for callers that only need the available compiler
// profiles.  Evaluation policy lives in experiment/profile-search.js.
export const CBA_V2_PROFILES = CBA_V2_SEARCH_SPACE;

export const CBA_V2_BASELINE_PROFILE = Object.freeze({
  id: 'b_41f0c68d',
  features: Object.freeze(Object.fromEntries(FEATURE_KEYS.map((key) => [key, false]))),
});

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function buildSearchFeatureVectors(count, limit) {
  const vectors = new Map();
  const add = (enabled) => {
    if (vectors.size >= limit) return;
    const selected = new Set(enabled);
    const vector = Array.from({ length: count }, (_, index) => selected.has(index));
    if (vector.some(Boolean)) vectors.set(vector.map(Number).join(''), Object.freeze(vector));
  };
  for (let index = 0; index < count; index += 1) add([index]);
  add(Array.from({ length: count }, (_, index) => index));
  for (let omitted = 0; omitted < count; omitted += 1) {
    add(Array.from({ length: count }, (_, index) => index).filter((index) => index !== omitted));
  }
  for (let size = 2; size < count && vectors.size < limit; size += 1) {
    visitCombinations(count, size, 0, [], add, () => vectors.size >= limit);
  }
  return Object.freeze([...vectors.values()]);
}

function visitCombinations(count, size, start, selected, visit, done) {
  if (done()) return;
  if (selected.length === size) {
    visit(selected);
    return;
  }
  for (let index = start; index <= count - (size - selected.length); index += 1) {
    selected.push(index);
    visitCombinations(count, size, index + 1, selected, visit, done);
    selected.pop();
    if (done()) return;
  }
}

// FNV-1a 64 produces stable non-semantic identifiers without importing Node
// crypto into compiler feature configuration.
function opaqueHash(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}
