import { Unit } from '../core/Unit.js';
import { finite, plain } from './shared.js';

/** One positioned item; two or ten items reuse this same class. */
export class ScatterText extends Unit {
  static kind = 'unit.scatter-text';

  constructor(unit, { x = 0, y = 0, appearance = {} } = {}) {
    super(unit);
    this.appearance = plain({
      ...appearance,
      position: 'absolute',
      left: finite(x, 'x'),
      top: finite(y, 'y'),
    }, 'appearance');
  }
}
