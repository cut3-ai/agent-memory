import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import {
  easeOutBack,
  easeOutCubic,
  lerp,
  progress,
} from '@cut3/agent-memory/core/timeline';

/** Signal-red editorial impact: lateral slam, vertical recoil and hard focus. */
export class EditorialImpactSettle extends Behaviour {
  static kind = 'behaviour.signal-editorial.impact-settle';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.composition-pivot', 'EditorialImpactSettle'));
  }

  onFrame({ frame }) {
    const entrance = easeOutCubic(progress(frame, 0, 14));
    const recoil = easeOutBack(progress(frame, 0, 20), 2.2);
    this.unit.opacity = progress(frame, 0, 4);
    this.unit.pose = {
      ...this.unit.pose,
      rotate: lerp(-5.5, 0, recoil),
      scaleX: lerp(1.28, 1, recoil),
      scaleY: lerp(0.82, 1, recoil),
      skewX: lerp(-8, 0, entrance),
      x: lerp(-148, 0, entrance),
      y: lerp(92, 0, recoil),
    };
    this.unit.effects = {
      ...this.unit.effects,
      blur: lerp(14, 0, entrance),
      brightness: lerp(1.55, 1, entrance),
      contrast: lerp(1.35, 1, recoil),
      shadow: `${Math.round(lerp(32, 18, recoil))}px ${Math.round(lerp(34, 20, recoil))}px 0 #ff3b30`,
    };
  }
}
