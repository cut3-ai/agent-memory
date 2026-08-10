import { Unit } from '@cut3/agent-memory/core/Unit';
import { textInline, typography, visual } from '@cut3/agent-memory/units/base/visual';

export class Text extends Unit {
  static kind = 'unit.text';

  constructor(content, options = {}) {
    super();
    Object.assign(this, visual(options));
    this.inline = textInline(options.inline);
    this.text = String(content ?? '');
    this.typography = typography(options.typography);
  }

  addUnit(unit) {
    if (!(unit instanceof Text) || unit.inline === null) {
      throw new TypeError('Text children must be Text Units with an inline contract');
    }
    return super.addUnit(unit);
  }

  validateProjection() {
    textInline(this.inline);
    for (const unit of this.units) {
      if (!(unit instanceof Text) || unit.inline === null) {
        throw new TypeError('Text children must be Text Units with an inline contract');
      }
      textInline(unit.inline);
    }
  }
}
