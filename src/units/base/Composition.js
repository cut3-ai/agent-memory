import { Unit } from '@cut3/agent-memory/core/Unit';
import { positive } from '@cut3/agent-memory/core/timeline';

export class Composition extends Unit {
  static kind = 'unit.composition';

  constructor(unit, options = {}) {
    super(unit);
    this.width = positive(options.width ?? 1080, 'composition.width');
    this.height = positive(options.height ?? 1920, 'composition.height');
    this.duration = positive(options.duration ?? 90, 'composition.duration');
    this.fps = positive(options.fps ?? 30, 'composition.fps');
    this.background = String(options.background ?? '#000000');
  }
}
