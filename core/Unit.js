import { Behaviour } from './Behaviour.js';
import { requireConcreteKind } from './identity.js';
import { captureOwnDescriptors, restoreOwnDescriptors } from './state.js';

/**
 * Renderer-neutral node in a composition graph.
 *
 * A concrete Unit owns child Units and Behaviours. Its constructor accepts at
 * most one child Unit so primitive and composite constructors stay explicit:
 * primitives call `super()`, composites call `super(unit)`.
 */
export class Unit {
  static kind = 'unit';
  static #instances = new WeakSet();

  #parent = null;
  #units = [];
  #behaviours = [];

  constructor(unit) {
    if (arguments.length > 1) {
      throw new TypeError('Unit constructor accepts at most one child Unit');
    }
    requireConcreteKind(this, 'unit');
    Unit.#instances.add(this);
    if (arguments.length === 1) this.addUnit(unit);
  }

  static [Symbol.hasInstance](value) {
    if (!Unit.#instances.has(value)) return false;
    return this === Unit || Function.prototype[Symbol.hasInstance].call(this, value);
  }

  get units() {
    return Object.freeze([...this.#units]);
  }

  get parent() {
    return this.#parent;
  }

  /** Compatibility name for render drivers; both getters expose one graph. */
  get children() {
    return this.units;
  }

  get behaviours() {
    return Object.freeze([...this.#behaviours]);
  }

  /** Add only already-created Units or Behaviours. */
  add(...members) {
    if (members.length === 0) {
      throw new TypeError('Unit.add() requires an existing Unit or Behaviour');
    }
    for (const member of members) {
      if (isUnit(member)) this.addUnit(member);
      else if (isBehaviour(member)) this.addBehaviour(member);
      else throw new TypeError('Unit.add() accepts only an existing Unit or Behaviour');
    }
    return this;
  }

  addUnit(unit) {
    if (!isUnit(unit)) throw new TypeError('addUnit() requires a Unit');
    requireConcreteKind(unit, 'unit');
    if (unit === this || containsUnit(unit, this)) {
      throw new TypeError('A Unit cannot contain itself');
    }
    if (unit.#parent && unit.#parent !== this) {
      throw new TypeError('A Unit can only have one parent');
    }
    if (!this.#units.includes(unit)) {
      unit.#parent = this;
      this.#units.push(unit);
    }
    return this;
  }

  addBehaviour(behaviour) {
    if (!isBehaviour(behaviour)) throw new TypeError('addBehaviour() requires a Behaviour');
    if (behaviour.unit !== this) {
      throw new TypeError('A Behaviour can only be added to its constructor Unit');
    }
    if (this.#behaviours.includes(behaviour)) return this;

    const kind = requireConcreteKind(behaviour, 'behaviour');
    if (this.#behaviours.some((current) => current.constructor.kind === kind)) {
      throw new TypeError(`Unit already has Behaviour ${kind}`);
    }

    const publicState = captureOwnDescriptors(this);
    const previousUnits = [...this.#units];
    const previousBehaviours = [...this.#behaviours];
    this.#behaviours.push(behaviour);
    try {
      behaviour.onAdded();
    } catch (error) {
      for (const child of this.#units) {
        if (!previousUnits.includes(child)) child.#parent = null;
      }
      this.#units = previousUnits;
      for (const child of this.#units) child.#parent = this;
      this.#behaviours = previousBehaviours;
      restoreOwnDescriptors(this, publicState);
      throw error;
    }
    return this;
  }

  remove(member) {
    if (isBehaviour(member)) return this.removeBehaviour(member);
    if (isUnit(member)) return this.removeUnit(member);
    throw new TypeError('Unit.remove() accepts only a Unit or Behaviour');
  }

  removeUnit(unit) {
    if (!isUnit(unit)) throw new TypeError('removeUnit() requires a Unit');
    const index = this.#units.indexOf(unit);
    if (index >= 0) {
      this.#units.splice(index, 1);
      unit.#parent = null;
    }
    return this;
  }

  removeBehaviour(behaviour) {
    if (!isBehaviour(behaviour)) throw new TypeError('removeBehaviour() requires a Behaviour');
    const index = this.#behaviours.indexOf(behaviour);
    if (index >= 0) {
      this.#behaviours.splice(index, 1);
      behaviour.onRemoved();
    }
    return this;
  }
}

export function isUnit(value) {
  return value instanceof Unit;
}

export function isBehaviour(value) {
  return value instanceof Behaviour;
}

export function requireUnit(value, name = 'unit') {
  if (!isUnit(value)) throw new TypeError(`${name} must be a Unit`);
  return value;
}

export { requireConcreteKind } from './identity.js';

function containsUnit(root, target, visited = new Set()) {
  if (root === target) return true;
  if (visited.has(root)) return false;
  visited.add(root);
  return root.children.some((child) => containsUnit(child, target, visited));
}
