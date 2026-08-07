import { Unit } from '@cut3/agent-memory/core/Unit';
import { visual } from '@cut3/agent-memory/units/base/visual';

export class Box extends Unit {
  static kind = 'unit.box';

  constructor(unit, options = {}) {
    super(unit);
    Object.assign(this, visual(options));
    this.name = String(options.name ?? 'box');
  }
}
