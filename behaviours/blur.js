import { Behaviour } from '../core/Behaviour.js';
import { animationValue, immutableConfig, number, sampled, writeFilter } from './shared.js';

export class Blur extends Behaviour {
  static kind = 'behaviour.blur';

  constructor(unit, value = 0) {
    super(unit);
    immutableConfig(this, { value: animationValue(value, 'blur') });
  }

  onFrame(context) {
    writeFilter(this.unit, 'blur', Math.max(0, number(sampled(this.config.value, context), 'blur')));
  }
}
