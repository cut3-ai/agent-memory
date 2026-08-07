import { Unit } from '@cut3/agent-memory/core/Unit';
import { finite, localContext, positive } from '@cut3/agent-memory/core/timeline';

export class Shot extends Unit {
  static kind = 'unit.shot';

  constructor(unit, options = {}) {
    super(unit);
    this.from = finite(options.from ?? 0, 'shot.from');
    this.duration = positive(options.duration ?? 1, 'shot.duration');
    this.name = String(options.name ?? 'shot');
  }

  isVisible(context) {
    return context.frame >= this.from && context.frame < this.from + this.duration;
  }

  contextForChildren(context) {
    return localContext(context, this.from);
  }
}
