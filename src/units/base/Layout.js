import { Unit } from '@cut3/agent-memory/core/Unit';
import { layout, visual } from '@cut3/agent-memory/units/base/visual';

/** Typed flex/grid infrastructure. It carries no style-family memory. */
export class Layout extends Unit {
  static kind = 'unit.layout';

  constructor(unit, options = {}) {
    super(unit);
    Object.assign(this, visual(options));
    this.layout = layout(options.layout);
    this.name = String(options.name ?? 'layout');
  }
}
