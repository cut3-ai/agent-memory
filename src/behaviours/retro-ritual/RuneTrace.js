import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { progress } from '@cut3/agent-memory/core/timeline';

/** Pixel-rune drawing with held increments and alternating soul-green intensity. */
export class RuneTrace extends Behaviour {
  static kind = 'behaviour.retro-ritual.rune-trace';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.vector-path', 'RuneTrace'));
  }

  onFrame({ frame }) {
    const stepped = Math.floor(progress(frame, 2, 18) * 10) / 10;
    this.unit.draw = { start: 0, end: stepped };
    this.unit.opacity = frame < 2 ? 0 : (frame % 4 === 0 ? 0.72 : 1);
    this.unit.paint = {
      ...this.unit.paint,
      fill: 'transparent',
      stroke: '#78d64b',
      strokeWidth: frame % 4 === 0 ? 8 : 6,
    };
    this.unit.pose = {
      ...this.unit.pose,
      rotate: frame < 12 ? -2 : 0,
      scaleX: stepped < 0.5 ? 0.96 : 1,
      scaleY: stepped < 0.5 ? 1.04 : 1,
    };
  }
}
