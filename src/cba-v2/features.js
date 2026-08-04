export const FEATURE_KEYS = Object.freeze([
  'opacityTween',
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

const PRESET_DATA = Object.freeze([
  ['p_a194ce72', 31],
  ['p_71b30fd4', 1],
  ['p_e62c4a09', 2],
  ['p_35fa817c', 4],
  ['p_c4802e6b', 8],
  ['p_89de105f', 16],
  ['p_167ab3e8', 3],
  ['p_f2509c4d', 5],
  ['p_4be178a2', 9],
  ['p_d03f65b7', 17],
  ['p_62ac901e', 6],
  ['p_b7194fd0', 10],
  ['p_2e85ca63', 18],
  ['p_943bd728', 12],
  ['p_5c10e9af', 20],
  ['p_ed7462c1', 24],
  ['p_308fae59', 7],
  ['p_ae6217d3', 15],
  ['p_796c04b8', 23],
  ['p_0d8f6a31', 27],
]);

export const CBA_V2_PROFILES = Object.freeze(PRESET_DATA.map(([id, mask]) => Object.freeze({
  id,
  features: Object.freeze(Object.fromEntries(FEATURE_KEYS.map((key, index) => [
    key,
    Boolean(mask & (1 << index)),
  ]))),
})));

export const CBA_V2_BASELINE_PROFILE = Object.freeze({
  id: 'b_41f0c68d',
  features: Object.freeze(Object.fromEntries(FEATURE_KEYS.map((key) => [key, false]))),
});

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
