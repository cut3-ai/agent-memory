import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { clamp } from '@cut3/agent-memory/core/timeline';
import { requireInkTarget } from '@cut3/agent-memory/units/sculptural-3d/sculpturalSemantics';

/** Frame-pure sine reveal for the authored procedural ink treatment. */
export class InkTendrilReveal extends Behaviour {
  static kind = 'behaviour.sculptural-3d.ink-tendril-reveal';

  constructor(unit) {
    requireInkTarget(unit);
    super(unit);
  }

  onFrame({ duration, frame }) {
    const linear = clamp(frame / Math.max(1, duration - 1));
    this.unit.reveal = {
      aspect: 1080 / 1920,
      progress: (1 - Math.cos(Math.PI * linear)) / 2,
      time: frame * 0.1,
    };
  }
}
