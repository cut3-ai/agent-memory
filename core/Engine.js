import { projectUnit } from './frame.js';
import { frameContext, immutableValue } from './signals.js';
import { isUnit, requireConcreteKind } from './Unit.js';

/** Evaluates a Unit graph without React, Remotion, registries, or factories. */
export class Engine {
  #root;

  constructor(composition) {
    const root = typeof composition === 'function' ? composition() : composition;
    if (!isUnit(root)) throw new TypeError('Engine composition must return a Unit');
    this.#root = root;
  }

  get root() {
    return this.#root;
  }

  at(input = {}) {
    const context = frameContext(input);
    return evaluate(this.#root, context, new Set());
  }
}

function evaluate(unit, context, active) {
  if (active.has(unit)) throw new TypeError('A composition cannot contain a Unit cycle');
  active.add(unit);
  const output = {
    kind: requireConcreteKind(unit, 'unit'),
    ...projectUnit(unit, context),
    children: unit.children.map((child) => evaluate(child, context, active)),
  };
  active.delete(unit);
  return immutableValue(output);
}
