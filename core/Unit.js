export const CBA_FRAGMENT = Symbol.for('@cut3/agent-memory.fragment');

/** A renderable object composed from child Units and executable Behaviours. */
export class Unit {
  constructor(type, props = {}, children = [], options = {}) {
    this.kind = 'unit';
    this.type = type;
    this.props = props ?? {};
    this.children = [];
    this.behaviours = [];
    this.factoryId = options.factoryId ?? null;
    this.backend = options.backend ?? 'react';
    this.componentKind = options.componentKind ?? 'external';
    this.add(...children);
  }

  add(...members) {
    for (const member of members) {
      if (Array.isArray(member)) {
        this.add(...member);
      } else if (member?.kind === 'behaviour') {
        this.behaviours.push(member.attach(this));
        member.onAdded();
        if (member.channel === 'content') this.children.push(member);
      } else if (member?.kind === 'behaviour-group') {
        member.attach(this, ['children', this.children.length]);
        this.behaviours.push(...member.behaviours);
        member.behaviours.forEach((behaviour) => behaviour.onAdded());
        this.children.push(member);
      } else {
        this.children.push(member);
      }
    }
    return this;
  }

  remove(behaviour) {
    const index = this.behaviours.indexOf(behaviour);
    if (index >= 0) {
      this.behaviours.splice(index, 1);
      behaviour.onRemoved();
      detachStoredBehaviour(this.props, behaviour);
      detachStoredBehaviour(this.children, behaviour);
      behaviour.unit = undefined;
    }
    return this;
  }
}

function detachStoredBehaviour(container, behaviour, seen = new WeakSet()) {
  if (!container || typeof container !== 'object' || seen.has(container)) return;
  seen.add(container);
  for (const [key, value] of Object.entries(container)) {
    if (value === behaviour) {
      container[key] = behaviour.onFrame();
    } else if (value?.kind === 'behaviour-group' && value.behaviours.includes(behaviour)) {
      value.behaviours = value.behaviours.filter((nested) => nested !== behaviour);
      if (value.behaviours.length === 0) container[key] = value.onFrame();
    } else {
      detachStoredBehaviour(value, behaviour, seen);
    }
  }
}

export function isUnit(value) {
  return value instanceof Unit || value?.kind === 'unit';
}
