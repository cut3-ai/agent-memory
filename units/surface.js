import { Unit } from '../core/Unit.js';
import { finite } from './shared.js';

export class Surface extends Unit {
  static kind = 'unit.surface';

  constructor({ width, height, background = 'transparent' } = {}, ...units) {
    super();
    this.width = finite(width, 'width');
    this.height = finite(height, 'height');
    if (this.width <= 0 || this.height <= 0) throw new RangeError('width and height must be positive');
    this.background = String(background);
    if (units.length > 0) this.add(...units);
  }
}
