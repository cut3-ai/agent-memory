import { Behaviour } from '../core/Behaviour.js';
import { animationValue, immutableConfig, number, sampled, writeTransform } from './shared.js';

export class Scale extends Behaviour {
  static kind = 'behaviour.scale';

  constructor(unit, value = 1) {
    super(unit);
    immutableConfig(this, { value: animationValue(value, 'scale') });
  }

  onFrame(context) {
    const value = sampled(this.config.value, context);
    if (typeof value === 'number') {
      writeTransform(this.unit, 'scale', number(value, 'scale'));
      return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('scale must be a number or numeric vector');
    }
    const unsupported = Object.keys(value).find((key) => !['x', 'y', 'z'].includes(key));
    if (unsupported) throw new TypeError(`scale has unsupported axis ${unsupported}`);
    writeTransform(this.unit, 'scale', Object.fromEntries(
      Object.entries(value).map(([axis, amount]) => [axis, number(amount, `scale.${axis}`)]),
    ));
  }
}
