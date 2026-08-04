import { Unit } from '../core/Unit.js';
import { plain } from './shared.js';

export class DialogueCard extends Unit {
  static kind = 'unit.dialogue-card';

  constructor(unit, appearance = {}) {
    super(unit);
    this.appearance = plain(appearance, 'appearance');
  }
}
