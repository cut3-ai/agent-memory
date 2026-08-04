import { Unit } from '../core/Unit.js';

/** Cardinality is constructor data and never part of static identity. */
export class Repeat extends Unit {
  static kind = 'unit.repeat';

  constructor(units = []) {
    super();
    if (!Array.isArray(units)) throw new TypeError('Repeat requires an array of Units');
    if (units.length > 0) this.add(...units);
  }
}
