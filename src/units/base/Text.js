import { Unit } from '@cut3/agent-memory/core/Unit';
import { typography, visual } from '@cut3/agent-memory/units/base/visual';

export class Text extends Unit {
  static kind = 'unit.text';

  constructor(content, options = {}) {
    super();
    Object.assign(this, visual(options));
    this.text = String(content ?? '');
    this.typography = typography(options.typography);
  }
}
