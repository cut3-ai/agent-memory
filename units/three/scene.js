import { Unit } from '../../core/Unit.js';

/** Engine-neutral scene root. The optional adapter owns all Three imports. */
export class ThreeScene extends Unit {
  static kind = 'unit.three-scene';

  constructor(...units) {
    super();
    if (units.length > 0) this.add(...units);
  }
}
