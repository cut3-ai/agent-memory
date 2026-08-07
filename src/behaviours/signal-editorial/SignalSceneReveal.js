import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { easeOutCubic, lerp, progress } from '@cut3/agent-memory/core/timeline';

/** Holds incoming footage until the razor covers frame, then lands it through white focus. */
export class SignalSceneReveal extends Behaviour {
  static kind = 'behaviour.signal-editorial.scene-reveal';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.composition-pivot', 'SignalSceneReveal'));
  }

  onFrame({ frame }) {
    const reveal = easeOutCubic(progress(frame, 8, 6));
    this.unit.opacity = reveal;
    this.unit.pose = {
      ...this.unit.pose,
      scaleX: lerp(1.04, 1, reveal),
      scaleY: lerp(1.04, 1, reveal),
      x: lerp(34, 0, reveal),
    };
    this.unit.effects = {
      ...this.unit.effects,
      blur: lerp(8, 0, reveal),
      brightness: lerp(1.85, 1, reveal),
      contrast: lerp(1.32, 1, reveal),
      saturate: lerp(0.55, 1, reveal),
    };
  }
}
