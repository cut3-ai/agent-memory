import { projectFrame } from '@cut3/agent-memory/core/frame';
import { isUnit } from '@cut3/agent-memory/core/identity';
import { deepFreeze } from '@cut3/agent-memory/core/state';
import { frameContext } from '@cut3/agent-memory/core/timeline';

export class Engine {
  #root;

  constructor(composition) {
    const root = typeof composition === 'function' ? composition() : composition;
    if (!isUnit(root)) throw new TypeError('Engine requires a root Unit');
    this.#root = root;
  }

  get root() {
    return this.#root;
  }

  at(input = {}) {
    const context = frameContext({
      duration: this.#root.duration ?? input.duration,
      fps: this.#root.fps ?? input.fps,
      height: this.#root.height ?? input.height,
      width: this.#root.width ?? input.width,
      ...input,
    });
    return evaluate(this.#root, projectFrame(this.#root, context), new Set());
  }
}

export function visitUnits(root, visitor) {
  if (!isUnit(root)) throw new TypeError('visitUnits() requires a Unit');
  if (typeof visitor !== 'function') throw new TypeError('visitor must be a function');
  const seen = new Set();
  const walk = (unit, depth) => {
    if (seen.has(unit)) return;
    seen.add(unit);
    visitor(unit, depth);
    unit.children.forEach((child) => walk(child, depth + 1));
  };
  walk(root, 0);
}

function evaluate(unit, projection, active) {
  if (!projection.has(unit)) return null;
  const state = projection.stateOf(unit);
  if (state.present === false) return null;
  if (active.has(unit)) throw new TypeError('A Unit tree cannot contain a cycle');
  active.add(unit);
  try {
    const children = projection.childrenOf(unit)
      .map((child) => evaluate(child, projection, active))
      .filter(Boolean);
    return deepFreeze({
      kind: unit.constructor.kind,
      ...state,
      children,
    });
  } finally {
    active.delete(unit);
  }
}
