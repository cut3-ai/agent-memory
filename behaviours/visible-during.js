import { Behaviour } from '../core/Behaviour.js';
import { absoluteFrame } from '../core/signals.js';
import { immutableConfig, number, plainOptions } from './shared.js';

export class VisibleDuring extends Behaviour {
  static kind = 'behaviour.visible-during';

  constructor(unit, options = {}) {
    super(unit);
    plainOptions(options, ['from', 'to'], 'visible-during');
    const from = number(options.from ?? 0, 'from');
    const to = number(options.to ?? Number.MAX_SAFE_INTEGER, 'to');
    if (to < from) throw new RangeError('to must not be before from');
    immutableConfig(this, { from, to });
  }

  onFrame(context) {
    const frame = absoluteFrame(context);
    this.unit.visible = frame >= this.config.from && frame < this.config.to;
  }
}
