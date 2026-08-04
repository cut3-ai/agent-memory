import { Behaviour } from '../core/Behaviour.js';
import {
  animationValue,
  immutableConfig,
  number,
  plainOptions,
  sampled,
  writeTransform,
} from './shared.js';

export class Rotate extends Behaviour {
  static kind = 'behaviour.rotate';

  constructor(unit, value = 0, options = {}) {
    super(unit);
    plainOptions(options, ['unit'], 'rotate');
    const cssUnit = options.unit ?? 'deg';
    if (typeof cssUnit !== 'string' || cssUnit.length === 0) throw new TypeError('rotate unit is required');
    immutableConfig(this, { value: animationValue(value, 'rotate'), unit: cssUnit });
  }

  onFrame(context) {
    writeTransform(this.unit, 'rotate', {
      value: number(sampled(this.config.value, context), 'rotate'),
      unit: this.config.unit,
    });
  }
}
