import { Unit } from '../core/Unit.js';
import { finite } from './shared.js';

export class Sequence extends Unit {
  static kind = 'unit.sequence';

  constructor(unit, { from = 0, duration = null, name = null } = {}) {
    super(unit);
    this.from = finite(from, 'from');
    this.duration = duration === null ? null : finite(duration, 'duration');
    if (this.duration !== null && this.duration < 0) throw new RangeError('duration must not be negative');
    this.name = name === null ? null : String(name);
  }
}
