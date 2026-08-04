import { requireConcreteKind } from './identity.js';
import { Unit } from './Unit.js';

/** Frame-aware logic permanently owned by exactly one Unit. */
export class Behaviour {
  static kind = 'behaviour';
  static #instances = new WeakSet();

  constructor(unit) {
    if (!(unit instanceof Unit)) throw new TypeError('Behaviour requires a Unit');
    requireConcreteKind(this, 'behaviour');
    Behaviour.#instances.add(this);
    Object.defineProperty(this, 'unit', {
      configurable: false,
      enumerable: true,
      value: unit,
      writable: false,
    });
  }

  static [Symbol.hasInstance](value) {
    if (!Behaviour.#instances.has(value)) return false;
    return this === Behaviour || Function.prototype[Symbol.hasInstance].call(this, value);
  }

  onAdded() {}

  onRemoved() {}

  onFrame(_context) {}
}

export function isBehaviour(value) {
  return value instanceof Behaviour;
}
