import { Unit } from '../core/Unit.js';
import { plain } from './shared.js';

export class Layer extends Unit {
  static kind = 'unit.layer';

  constructor(unit, appearance = {}) {
    super(unit);
    this.appearance = plain(appearance, 'appearance');
  }
}
