import { Unit } from '../core/Unit.js';
import { finite, plain } from './shared.js';

/** Retained canvas root. Drawing primitives are child Units, never callbacks. */
export class Canvas extends Unit {
  static kind = 'unit.canvas';

  constructor({ width = null, height = null, appearance = {} } = {}, ...units) {
    super();
    this.width = width === null ? null : finite(width, 'width');
    this.height = height === null ? null : finite(height, 'height');
    this.appearance = plain(appearance, 'appearance');
    if (units.length > 0) this.add(...units);
  }
}
