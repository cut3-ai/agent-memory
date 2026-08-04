import { Unit } from '../core/Unit.js';
import { plain } from './shared.js';

/** A renderer-neutral layout container; the React adapter chooses the element. */
export class Box extends Unit {
  static kind = 'unit.box';

  constructor(unit, appearance = {}) {
    super(unit);
    this.appearance = plain(appearance, 'appearance');
  }
}
