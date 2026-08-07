export function capturePublicState(target) {
  return new Map(Reflect.ownKeys(target).map((key) => [
    key,
    Object.getOwnPropertyDescriptor(target, key),
  ]));
}

export function restorePublicState(target, state) {
  for (const key of Reflect.ownKeys(target)) {
    if (!state.has(key)) delete target[key];
  }
  for (const [key, descriptor] of state) Object.defineProperty(target, key, descriptor);
}

export function freezePublicState(target) {
  for (const key of Reflect.ownKeys(target)) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor && 'value' in descriptor) deepFreeze(descriptor.value);
  }
  return target;
}

export function publicSnapshot(target) {
  return Object.freeze(Object.fromEntries(
    Object.keys(target).map((key) => [key, freeze(clone(target[key]))]),
  ));
}

/** Exact equality for the plain data accepted by publicSnapshot(). */
export function plainDataEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (typeof left !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      const leftOwns = Object.hasOwn(left, index);
      if (leftOwns !== Object.hasOwn(right, index)) return false;
      if (leftOwns && !plainDataEqual(left[index], right[index])) return false;
    }
    return true;
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => Object.hasOwn(right, key)
    && plainDataEqual(left[key], right[key]));
}

export function matchesPublicState(target, state) {
  const keys = Reflect.ownKeys(target);
  if (keys.length !== state.size || keys.some((key) => !state.has(key))) return false;
  return keys.every((key) => descriptorEqual(
    Object.getOwnPropertyDescriptor(target, key),
    state.get(key),
  ));
}

export function deepFreeze(value) {
  return freeze(value);
}

function clone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  if (!isPlainObject(value)) {
    throw new TypeError('Unit public state must contain only plain data');
  }
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, clone(nested)]));
}

function freeze(value) {
  if (value === null || typeof value !== 'object') return value;
  // Object.freeze() is shallow. An already-frozen container may still expose
  // mutable nested data, so projection must always walk the complete value.
  for (const nested of Object.values(value)) freeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function descriptorEqual(left, right) {
  if (!left || !right
    || left.configurable !== right.configurable
    || left.enumerable !== right.enumerable) return false;
  if ('value' in left || 'value' in right) {
    return 'value' in left && 'value' in right
      && left.writable === right.writable
      && plainDataEqual(left.value, right.value);
  }
  return left.get === right.get && left.set === right.set;
}

function isPlainObject(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
