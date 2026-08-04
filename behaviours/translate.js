import { Behaviour } from '../core/Behaviour.js';
import {
  animationValue,
  immutableConfig,
  number,
  plainOptions,
  sampled,
  writeTransform,
} from './shared.js';

export class Translate extends Behaviour {
  static kind = 'behaviour.translate';

  constructor(unit, value = { x: 0, y: 0 }, options = {}) {
    super(unit);
    plainOptions(options, ['unit'], 'translate');
    const cssUnit = options.unit ?? 'px';
    if (typeof cssUnit !== 'string' || cssUnit.length === 0) throw new TypeError('translate unit is required');
    immutableConfig(this, { value: animationValue(value, 'translate'), unit: cssUnit });
  }

  onFrame(context) {
    const value = sampled(this.config.value, context);
    const vector = typeof value === 'number' ? { x: value, y: 0 } : value;
    if (!vector || typeof vector !== 'object' || Array.isArray(vector)) {
      throw new TypeError('translate must be a number or numeric vector');
    }
    const unsupported = Object.keys(vector).find((key) => !['x', 'y', 'z'].includes(key));
    if (unsupported) throw new TypeError(`translate has unsupported axis ${unsupported}`);
    writeTransform(this.unit, 'translate', {
      x: number(vector.x ?? 0, 'translate.x'),
      y: number(vector.y ?? 0, 'translate.y'),
      ...(vector.z === undefined ? {} : { z: number(vector.z, 'translate.z') }),
      unit: this.config.unit,
    });
  }
}
