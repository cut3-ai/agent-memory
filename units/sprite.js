import { Unit } from '../core/Unit.js';
import { addLeafBehaviours, plain, positiveInteger, source } from './shared.js';

export class Sprite extends Unit {
  static kind = 'unit.sprite';

  constructor(value, { columns = 1, rows = 1, index = 0, appearance = {} } = {}) {
    super();
    this.source = source(value);
    this.columns = positiveInteger(columns, 'columns');
    this.rows = positiveInteger(rows, 'rows');
    this.index = Number(index);
    if (!Number.isInteger(this.index) || this.index < 0) throw new RangeError('index must be non-negative');
    this.appearance = plain(appearance, 'appearance');
  }

  add(...members) {
    return addLeafBehaviours(this, members);
  }
}
