import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { easeOutCubic, lerp, progress } from '@cut3/agent-memory/core/timeline';

/** A thick imperfect signal-red underline that lands with a slight tilt. */
export class InkRuleStrike extends Behaviour {
  static kind = 'behaviour.signal-editorial.ink-rule-strike';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.vector-path', 'InkRuleStrike'));
  }

  onFrame({ frame }) {
    const amount = easeOutCubic(progress(frame, 5, 12));
    this.unit.draw = { start: 0, end: amount };
    this.unit.opacity = progress(frame, 5, 3);
    this.unit.paint = {
      ...this.unit.paint,
      fill: 'transparent',
      stroke: '#ff3b30',
      strokeWidth: lerp(18, 11, amount),
    };
    this.unit.pose = {
      ...this.unit.pose,
      rotate: lerp(-5, -1.5, amount),
      scaleX: lerp(0.82, 1, amount),
      y: lerp(18, 0, amount),
    };
  }
}
