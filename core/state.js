import { immutableValue } from './signals.js';

/** Lightweight lifecycle checkpoint which can retain opaque internal values. */
export function captureOwnDescriptors(target) {
  return Object.freeze(Object.fromEntries(Object.keys(target).map((key) => [
    key,
    Object.freeze({ ...Object.getOwnPropertyDescriptor(target, key) }),
  ])));
}

export function restoreOwnDescriptors(target, descriptors) {
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(descriptors, key)) delete target[key];
  }
  for (const [key, descriptor] of Object.entries(descriptors)) {
    Object.defineProperty(target, key, descriptor);
  }
}

/** Capture enumerable Unit state while retaining immutable object identities. */
export function capturePublicState(target) {
  const descriptors = Object.fromEntries(Object.entries(target).map(([key, value]) => [
    key,
    Object.freeze({
      descriptor: Object.freeze({ ...Object.getOwnPropertyDescriptor(target, key) }),
      immutable: deeplyFrozen(value),
      original: value,
      snapshot: clonePlain(value),
    }),
  ]));
  return Object.freeze({ descriptors: Object.freeze(descriptors) });
}

export function publicSnapshot(target) {
  return clonePlain(Object.fromEntries(Object.entries(target)));
}

export function restorePublicState(target, state) {
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(state.descriptors, key)) delete target[key];
  }
  for (const [key, record] of Object.entries(state.descriptors)) {
    if (!Object.hasOwn(record.descriptor, 'value')) {
      Object.defineProperty(target, key, record.descriptor);
      continue;
    }
    const value = record.immutable ? record.original : immutableValue(record.snapshot);
    Object.defineProperty(target, key, { ...record.descriptor, value });
  }
}

export function clonePlain(value) {
  if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(clonePlain);
  if (isPlainRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, clonePlain(nested)]));
  }
  throw new TypeError('Unit public state must contain only plain serializable data');
}

function deeplyFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value).every((nested) => deeplyFrozen(nested, seen));
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
