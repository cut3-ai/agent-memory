import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { easeOutBack, lerp, progress } from '@cut3/agent-memory/core/timeline';

/** Integer-snapped tarot deal with purple recoil and zero smoothing. */
export class RitualCardDeal extends Behaviour {
  static kind = 'behaviour.retro-ritual.ritual-card-deal';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.composition-pivot', 'RitualCardDeal'));
  }

  onFrame({ frame }) {
    const raw = easeOutBack(progress(frame, 0, 16), 1.75);
    const stepped = Math.round(raw * 12) / 12;
    this.unit.opacity = frame < 2 ? 0 : 1;
    this.unit.pose = {
      ...this.unit.pose,
      rotate: Math.round(lerp(-9, 0, stepped) * 2) / 2,
      scaleX: Math.round(lerp(0.62, 1, stepped) * 16) / 16,
      scaleY: Math.round(lerp(1.22, 1, stepped) * 16) / 16,
      x: Math.round(lerp(520, 0, stepped)),
      y: Math.round(lerp(96, 0, stepped)),
    };
    this.unit.effects = {
      ...this.unit.effects,
      blur: 0,
      brightness: frame % 4 === 0 && frame < 16 ? 1.45 : 1,
      contrast: 1.18,
      saturate: 1.1,
      shadow: `${Math.round(lerp(28, 14, stepped))}px ${Math.round(lerp(28, 14, stepped))}px 0 #5d3aa8`,
    };
  }
}
