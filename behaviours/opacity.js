import { Behaviour } from '../core/Behaviour.js';
import { clamp } from '../core/signals.js';
import { animationValue, immutableConfig, number, sampled } from './shared.js';

/** Opacity animation; a fade is Opacity + Tween, never a combined script. */
export class Opacity extends Behaviour {
  static kind = 'behaviour.opacity';

  constructor(unit, value = 1) {
    super(unit);
    immutableConfig(this, { value: animationValue(value, 'opacity') });
  }

  onFrame(context) {
    this.unit.opacity = clamp(number(sampled(this.config.value, context), 'opacity'), 0, 1);
  }
}
