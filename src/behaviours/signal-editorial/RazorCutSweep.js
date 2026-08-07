import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { easeOutCubic, lerp, progress, smoothstep } from '@cut3/agent-memory/core/timeline';

/** A short diagonal paper-and-signal-red cut, including its authored exit. */
export class RazorCutSweep extends Behaviour {
  static kind = 'behaviour.signal-editorial.razor-cut-sweep';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.composition-pivot', 'RazorCutSweep'));
  }

  onFrame({ frame }) {
    const enter = easeOutCubic(progress(frame, 0, 9));
    const exit = smoothstep(progress(frame, 14, 8));
    this.unit.opacity = Math.min(progress(frame, 0, 2), 1 - progress(frame, 19, 3));
    this.unit.pose = {
      ...this.unit.pose,
      rotate: lerp(-11, -6, enter),
      scaleX: lerp(0.72, 1.08, enter),
      scaleY: lerp(1.35, 1, enter),
      skewX: -12,
      x: lerp(-1320, 1240, exit) + lerp(0, 1320, enter),
      y: lerp(180, -40, enter),
    };
    this.unit.effects = {
      ...this.unit.effects,
      blur: lerp(24, 0, enter) + lerp(0, 10, exit),
      brightness: lerp(1.9, 1.08, enter),
      contrast: 1.22,
      shadow: '-34px 0 0 #ff3b30',
    };
  }
}
