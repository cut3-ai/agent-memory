import { Unit } from '../core/Unit.js';
import { addLeafBehaviours, finite, plain } from './shared.js';

/** A reusable color layer. Flash timing is an Opacity Behaviour. */
export class SolidFill extends Unit {
  static kind = 'unit.solid-fill';

  constructor({ color, opacity = 1 } = {}) {
    super();
    if (typeof color !== 'string' || color.length === 0) throw new TypeError('SolidFill requires color');
    const alpha = finite(opacity, 'opacity');
    if (alpha < 0 || alpha > 1) throw new RangeError('opacity must be between 0 and 1');
    this.appearance = plain({
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      backgroundColor: color,
      opacity: alpha,
    }, 'appearance');
  }

  add(...members) {
    return addLeafBehaviours(this, members);
  }
}
