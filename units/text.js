import { Unit } from '../core/Unit.js';
import { addLeafBehaviours, plain } from './shared.js';

export class Text extends Unit {
  static kind = 'unit.text';

  constructor(text, typography = {}) {
    super();
    this.text = String(text ?? '');
    this.typography = plain(typography, 'typography');
  }

  add(...members) {
    return addLeafBehaviours(this, members);
  }
}
