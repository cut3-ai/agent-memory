import { Unit } from '../core/Unit.js';

export class Group extends Unit {
  static kind = 'unit.group';

  constructor(...units) {
    super();
    if (units.length > 0) this.add(...units);
  }
}
