import { Unit } from '../core/Unit.js';
import { addLeafBehaviours, finite, plain, source } from './shared.js';

export class Video extends Unit {
  static kind = 'unit.video';

  constructor(value, { from = 0, to = null, volume = 1, rate = 1, muted = false, appearance = {} } = {}) {
    super();
    this.source = source(value);
    this.from = finite(from, 'from');
    this.to = to === null ? null : finite(to, 'to');
    if (this.to !== null && this.to < this.from) throw new RangeError('to must not be before from');
    this.volume = finite(volume, 'volume');
    this.rate = finite(rate, 'rate');
    this.muted = Boolean(muted);
    this.appearance = plain(appearance, 'appearance');
  }

  add(...members) {
    return addLeafBehaviours(this, members);
  }
}
