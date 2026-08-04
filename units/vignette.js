import { Unit } from '../core/Unit.js';
import { addLeafBehaviours, finite, plain } from './shared.js';

export class Vignette extends Unit {
  static kind = 'unit.vignette';

  constructor({ color = 'rgba(0,0,0,1)', strength = 0.65, radius = 55 } = {}) {
    super();
    if (typeof color !== 'string' || color.length === 0) throw new TypeError('Vignette requires color');
    const opacity = finite(strength, 'strength');
    const edge = finite(radius, 'radius');
    if (opacity < 0 || opacity > 1) throw new RangeError('strength must be between 0 and 1');
    if (edge < 0 || edge > 100) throw new RangeError('radius must be between 0 and 100');
    this.appearance = plain({
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      opacity,
      background: `radial-gradient(circle at center, transparent ${edge}%, ${color} 100%)`,
    }, 'appearance');
  }

  add(...members) {
    return addLeafBehaviours(this, members);
  }
}
