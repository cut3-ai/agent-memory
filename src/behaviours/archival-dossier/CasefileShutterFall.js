import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { easeOutBack, lerp, progress } from '@cut3/agent-memory/core/timeline';

/** Documentary shutter slats: drop, overshoot and dense paper-black hold. */
export class CasefileShutterFall extends Behaviour {
  static kind = 'behaviour.archival-dossier.casefile-shutter-fall';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.composition-pivot', 'CasefileShutterFall'));
  }

  onFrame({ frame }) {
    const fall = easeOutBack(progress(frame, 0, 15), 1.35);
    const leave = progress(frame, 22, 8);
    this.unit.opacity = Math.min(progress(frame, 0, 2), 1 - leave);
    this.unit.pose = {
      ...this.unit.pose,
      rotate: lerp(-1.8, 0.35, fall),
      scaleX: lerp(1.04, 1, fall),
      scaleY: lerp(0.76, 1, fall),
      x: lerp(-18, 0, fall),
      y: lerp(-1260, 0, fall) + lerp(0, 1180, leave),
    };
    this.unit.effects = {
      ...this.unit.effects,
      // The authored back-ease intentionally overshoots the resting pose, but
      // CSS blur has no negative domain. Keep the recoil while emitting a
      // valid filter value at every frame.
      blur: Math.max(0, lerp(16, 0, fall) + lerp(0, 8, leave)),
      brightness: 0.92,
      contrast: 1.16,
      shadow: '0 24px 0 #a33a2b',
    };
  }
}
