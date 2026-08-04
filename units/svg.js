import { Unit } from '../core/Unit.js';
import { plain } from './shared.js';

export class Svg extends Unit {
  static kind = 'unit.svg';

  constructor(units = [], { viewBox = null, appearance = {} } = {}) {
    super();
    if (!Array.isArray(units)) throw new TypeError('Svg requires an array of Units');
    this.viewBox = viewBox === null ? null : String(viewBox);
    this.appearance = plain(appearance, 'appearance');
    if (units.length > 0) this.add(...units);
  }
}
