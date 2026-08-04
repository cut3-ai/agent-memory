import { Unit } from '../core/Unit.js';
import { plain } from './shared.js';

export class RankingCard extends Unit {
  static kind = 'unit.ranking-card';

  constructor(unit, appearance = {}) {
    super(unit);
    this.appearance = plain(appearance, 'appearance');
  }
}
