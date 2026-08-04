import {
  immutableValue,
  isSignal,
  isSignalValue,
  sample,
} from '../core/signals.js';

export function animationValue(value, name) {
  if (!isSignalValue(value)) throw new TypeError(`${name} must be plain data or a built-in Signal`);
  return isSignal(value) ? value : immutableValue(value);
}

export function sampled(value, context) {
  return sample(value, context);
}

export function immutableConfig(target, config) {
  Object.defineProperty(target, 'config', {
    configurable: false,
    enumerable: true,
    value: freezeConfig(config),
    writable: false,
  });
}

function freezeConfig(value) {
  if (isSignal(value)) return value;
  if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)) {
    return immutableValue(value);
  }
  if (Array.isArray(value)) return Object.freeze(value.map(freezeConfig));
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Behaviour config must be plain data or a built-in Signal');
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, freezeConfig(nested)]),
  ));
}

export function number(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

export function plainOptions(value, allowed, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} options must be plain data`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${name} options must be plain data`);
  }
  const unsupported = Object.keys(value).find((key) => !allowed.includes(key));
  if (unsupported) throw new TypeError(`${name} has unsupported field ${unsupported}`);
}

export function writeTransform(unit, name, value) {
  const transform = unit.transform;
  if (transform !== undefined && (!transform || typeof transform !== 'object' || Array.isArray(transform))) {
    throw new TypeError('Unit transform state must be a plain object');
  }
  unit.transform = { ...(transform ?? {}), [name]: value };
}

export function writeFilter(unit, name, value) {
  const filter = unit.filter;
  if (filter !== undefined && (!filter || typeof filter !== 'object' || Array.isArray(filter))) {
    throw new TypeError('Unit filter state must be a plain object');
  }
  unit.filter = { ...(filter ?? {}), [name]: value };
}
