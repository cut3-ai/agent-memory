import { Unit } from '../core/Unit.js';
import { finite } from './shared.js';

/**
 * A renderer-neutral transform pivot in absolute composition coordinates.
 *
 * Behaviours such as Rotate and Scale belong to this Unit. A renderer adapter
 * is responsible for preserving the child's composition coordinate system
 * while applying those transforms around `pivot`.
 */
export class CompositionPivot extends Unit {
  static kind = 'unit.composition-pivot';

  constructor(unit, { x = 0, y = 0 } = {}) {
    super(unit);
    this.pivot = Object.freeze({
      x: finite(x, 'pivot.x'),
      y: finite(y, 'pivot.y'),
    });
  }
}
