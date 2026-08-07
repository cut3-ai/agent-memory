import {
  registerBehaviour,
  requireKind,
  requireUnit,
} from '@cut3/agent-memory/core/identity';

/** A concrete visual law permanently owned by one Unit. */
export class Behaviour {
  static kind = 'behaviour.base';

  constructor(unit) {
    requireKind(this, 'behaviour');
    requireUnit(unit, 'Behaviour owner');
    registerBehaviour(this);
    Object.defineProperty(this, 'unit', {
      enumerable: true,
      value: unit,
      writable: false,
    });
  }

  onAdded() {}

  onRemoved() {}

  onFrame(_context) {}
}
