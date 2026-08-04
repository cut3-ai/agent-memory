import { Unit } from '../core/Unit.js';
import { addLeafBehaviours, plain, source } from './shared.js';

export class Image extends Unit {
  static kind = 'unit.image';

  constructor(value, { alt = '', fit = 'cover', appearance = {} } = {}) {
    super();
    this.source = source(value);
    this.alt = alt === null ? null : String(alt);
    this.fit = fit === null ? null : String(fit);
    this.appearance = plain(appearance, 'appearance');
  }

  add(...members) {
    return addLeafBehaviours(this, members);
  }
}
