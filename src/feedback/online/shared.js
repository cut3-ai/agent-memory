import { HASH } from './constants.js';

export function requireInterface(value, methods, label) {
  if (!value || typeof value !== 'object') throw new TypeError(`${label} is required`);
  for (const method of methods) requireFunction(value[method], `${label}.${method}`);
  return value;
}

export function requireFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function`);
  return value;
}

export function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} contains unexpected fields`);
  }
}

export function boundedDuration(value, label, maximum) {
  const result = timestamp(value, label);
  if (result > maximum) throw new RangeError(`${label} cannot exceed ${maximum}`);
  return result;
}

export function positiveDuration(value, label) {
  const result = timestamp(value, label);
  if (result < 1) throw new RangeError(`${label} must be positive`);
  return result;
}

export function timestamp(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

export function optionalTimestamp(value, label) {
  if (value !== null) timestamp(value, label);
}

export function requireHash(value, label) {
  if (typeof value !== 'string' || !HASH.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256`);
  }
  return value;
}

export function optionalHash(value, label) {
  if (value !== null) requireHash(value, label);
}

export function boundedAdd(left, right) {
  return left > Number.MAX_SAFE_INTEGER - right ? Number.MAX_SAFE_INTEGER : left + right;
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
