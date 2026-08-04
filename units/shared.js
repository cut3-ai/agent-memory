import { immutableValue } from '../core/signals.js';
import { isBehaviour, isUnit, Unit } from '../core/Unit.js';

export function addLeafBehaviours(instance, members) {
  if (members.length === 0) throw new TypeError('add() requires an existing Behaviour');
  for (const member of members) {
    if (isUnit(member)) throw new TypeError(`${instance.constructor.name} is a primitive Unit`);
    if (!isBehaviour(member)) throw new TypeError('add() accepts only an existing Behaviour');
    Unit.prototype.add.call(instance, member);
  }
  return instance;
}

export function plain(value, name = 'value') {
  try {
    return immutableValue(value);
  } catch {
    throw new TypeError(`${name} must be plain serializable data`);
  }
}

export function source(value) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('source must be a non-empty string');
  return value;
}

export function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${name} must be finite`);
  return number;
}

export function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new RangeError(`${name} must be a positive integer`);
  return number;
}
