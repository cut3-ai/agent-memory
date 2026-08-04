import { Behaviour } from '../core/Behaviour.js';
import { absoluteFrame, clamp } from '../core/signals.js';
import { immutableConfig, number, plainOptions } from './shared.js';

export class TextReveal extends Behaviour {
  static kind = 'behaviour.text-reveal';

  constructor(unit, options = {}) {
    super(unit);
    if (unit.constructor.kind !== 'unit.text') throw new TypeError('TextReveal requires a Text Unit');
    plainOptions(options, ['from', 'to', 'by'], 'text-reveal');
    const from = number(options.from ?? 0, 'from');
    const to = number(options.to ?? 30, 'to');
    if (to < from) throw new RangeError('to must not be before from');
    const by = options.by ?? 'character';
    if (!['character', 'word'].includes(by)) throw new TypeError('by must be character or word');
    immutableConfig(this, { by, from, sourceText: unit.text, to });
  }

  onFrame(context) {
    const frame = absoluteFrame(context);
    const progress = this.config.to === this.config.from
      ? Number(frame >= this.config.from)
      : clamp((frame - this.config.from) / (this.config.to - this.config.from), 0, 1);
    if (this.config.by === 'word') {
      const words = this.config.sourceText.split(/\s+/u).filter(Boolean);
      this.unit.text = words.slice(0, Math.floor(words.length * progress)).join(' ');
      return;
    }
    const characters = [...this.config.sourceText];
    this.unit.text = characters.slice(0, Math.floor(characters.length * progress)).join('');
  }
}
