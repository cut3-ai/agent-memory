import { Unit } from '@cut3/agent-memory/core/Unit';
import { visual } from '@cut3/agent-memory/units/base/visual';

export class Image extends Unit {
  static kind = 'unit.image';

  constructor(source, options = {}) {
    super();
    Object.assign(this, visual(options));
    this.fit = String(options.fit ?? 'cover');
    this.source = String(source ?? '');
  }
}
