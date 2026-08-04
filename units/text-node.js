import { Unit } from '../core/Unit.js';

/** A renderer-neutral primitive child; unlike Text it adds no wrapper element. */
export class TextNode extends Unit {
  static kind = 'unit.text-node';

  constructor(value) {
    super();
    if (!['string', 'number'].includes(typeof value)) {
      throw new TypeError('TextNode requires a string or number');
    }
    this.value = value;
  }

  add() {
    throw new TypeError('TextNode does not accept children or Behaviours');
  }
}
