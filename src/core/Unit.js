import {
  isBehaviour,
  isUnit,
  registerUnit,
  requireKind,
} from '@cut3/agent-memory/core/identity';
import {
  BEGIN_PROJECTION,
  END_PROJECTION,
  RESET_PROJECTION,
} from '@cut3/agent-memory/core/projection';
import {
  capturePublicState,
  freezePublicState,
  restorePublicState,
} from '@cut3/agent-memory/core/state';

/** Renderer-neutral node. A Unit may own Units and Behaviours, never a backend. */
export class Unit {
  static kind = 'unit.base';

  #parent = null;
  #units = [];
  #behaviours = [];
  #projecting = false;
  #projectionSnapshot = null;

  constructor(unit) {
    requireKind(this, 'unit');
    registerUnit(this);
    if (arguments.length > 1) {
      throw new TypeError('Unit constructor accepts at most one child Unit');
    }
    if (unit !== undefined) this.addUnit(unit);
  }

  get parent() {
    return this.#parent;
  }

  get units() {
    return Object.freeze([...this.#units]);
  }

  get children() {
    return this.units;
  }

  get behaviours() {
    return Object.freeze([...this.#behaviours]);
  }

  add(...members) {
    this.#requireMutableTree();
    if (members.length === 0) throw new TypeError('Unit.add() requires a Unit or Behaviour');
    for (const member of members) {
      if (isUnit(member)) this.addUnit(member);
      else if (isBehaviour(member)) this.addBehaviour(member);
      else throw new TypeError('Unit.add() accepts only Units and Behaviours');
    }
    return this;
  }

  addUnit(unit) {
    this.#requireMutableTree();
    if (!isUnit(unit)) throw new TypeError('addUnit() requires a Unit');
    if (unit === this || contains(unit, this)) throw new TypeError('A Unit tree cannot contain a cycle');
    if (unit.#parent && unit.#parent !== this) throw new TypeError('A Unit can only have one parent');
    if (!this.#units.includes(unit)) {
      unit.#parent = this;
      this.#units.push(unit);
    }
    return this;
  }

  addBehaviour(behaviour) {
    this.#requireMutableTree();
    if (!isBehaviour(behaviour)) throw new TypeError('addBehaviour() requires a Behaviour');
    if (behaviour.unit !== this) {
      throw new TypeError('A Behaviour belongs to the Unit passed to its constructor');
    }
    const kind = requireKind(behaviour, 'behaviour');
    if (this.#behaviours.some((current) => current.constructor.kind === kind)) {
      throw new TypeError(`Unit already owns ${kind}`);
    }
    const transaction = this.#captureLifecycleTransaction();
    this.#behaviours.push(behaviour);
    try {
      behaviour.onAdded();
      Object.freeze(behaviour);
    } catch (error) {
      this.#rollbackLifecycleTransaction(transaction, error);
      throw error;
    }
    return this;
  }

  removeBehaviour(behaviour) {
    this.#requireMutableTree();
    const index = this.#behaviours.indexOf(behaviour);
    if (index >= 0) {
      const transaction = this.#captureLifecycleTransaction();
      this.#behaviours.splice(index, 1);
      try {
        behaviour.onRemoved();
      } catch (error) {
        this.#rollbackLifecycleTransaction(transaction, error);
        throw error;
      }
    }
    return this;
  }

  isVisible(_context) {
    return true;
  }

  contextForChildren(context) {
    return context;
  }

  validateProjection(_context, _ancestry) {}

  [BEGIN_PROJECTION]() {
    if (this.#projecting) throw new TypeError('Unit is already being projected');
    const snapshot = Object.freeze({
      behaviours: Object.freeze([...this.#behaviours]),
      parent: this.#parent,
      units: Object.freeze([...this.#units]),
    });
    this.#projectionSnapshot = snapshot;
    this.#projecting = true;
    return snapshot;
  }

  [RESET_PROJECTION](snapshot) {
    this.#requireProjection(snapshot);
    this.#restoreOwnership(snapshot.units, snapshot.behaviours, snapshot.parent);
  }

  [END_PROJECTION](snapshot) {
    this.#requireProjection(snapshot);
    try {
      this.#restoreOwnership(snapshot.units, snapshot.behaviours, snapshot.parent);
    } finally {
      this.#projectionSnapshot = null;
      this.#projecting = false;
    }
  }

  #requireMutableTree() {
    if (this.#projecting) {
      throw new TypeError('A Behaviour cannot change Unit ownership during onFrame()');
    }
  }

  #requireProjection(snapshot) {
    if (!this.#projecting || this.#projectionSnapshot !== snapshot) {
      throw new TypeError('Invalid Unit projection transaction');
    }
  }

  #restoreOwnership(units, behaviours, parent) {
    for (const child of this.#units) {
      if (!units.includes(child) && child.#parent === this) child.#parent = null;
    }
    this.#units = [...units];
    this.#behaviours = [...behaviours];
    this.#parent = parent;
    for (const child of this.#units) child.#parent = this;
  }

  #captureLifecycleTransaction() {
    let root = this;
    const ancestors = new Set();
    while (root.#parent) {
      if (ancestors.has(root)) throw new TypeError('A Unit tree cannot contain a cycle');
      ancestors.add(root);
      root = root.#parent;
    }
    const records = [];
    const visited = new Set();
    const visit = (unit) => {
      if (visited.has(unit)) throw new TypeError('A Unit tree cannot contain a cycle');
      visited.add(unit);
      freezePublicState(unit);
      records.push({
        behaviours: [...unit.#behaviours],
        parent: unit.#parent,
        state: capturePublicState(unit),
        unit,
        units: [...unit.#units],
      });
      for (const child of unit.#units) visit(child);
    };
    visit(root);
    return records;
  }

  #rollbackLifecycleTransaction(records, lifecycleError) {
    let rollbackError;
    for (const record of [...records].reverse()) {
      try {
        record.unit.#restoreOwnership(record.units, record.behaviours, record.parent);
      } catch (error) {
        rollbackError ??= error;
      }
    }
    for (const record of records) {
      try {
        restorePublicState(record.unit, record.state);
      } catch (error) {
        rollbackError ??= error;
      }
    }
    if (rollbackError) {
      throw new AggregateError(
        [lifecycleError, rollbackError],
        'Behaviour lifecycle failed and could not be fully rolled back',
      );
    }
  }
}

export { isUnit, requireUnit } from '@cut3/agent-memory/core/identity';

function contains(root, target, visited = new Set()) {
  if (root === target) return true;
  if (visited.has(root)) return false;
  visited.add(root);
  return root.children.some((child) => contains(child, target, visited));
}
