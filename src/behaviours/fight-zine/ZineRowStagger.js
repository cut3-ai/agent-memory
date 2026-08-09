import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import {
  easeOutBack,
  lerp,
  progress,
} from '@cut3/agent-memory/core/timeline';

/** Authored fight-card entrance: a hard lateral throw with a short paper settle. */
export class ZineRowStagger extends Behaviour {
  static kind = 'behaviour.fight-zine.row-stagger';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.fight-zine.rank-row', 'ZineRowStagger'));
  }

  onFrame({ frame }) {
    const settle = easeOutBack(progress(frame, 0, 14), 1.45);
    this.unit.opacity = progress(frame, 0, 4);
    this.unit.pose = {
      ...this.unit.pose,
      rotate: lerp(-2.8, 0, settle),
      scaleX: lerp(0.96, 1, settle),
      scaleY: lerp(1.04, 1, settle),
      x: lerp(-120, 0, settle),
    };
    this.unit.effects = {
      ...this.unit.effects,
      brightness: lerp(1.18, 1, settle),
      contrast: 1.08,
    };
  }
}
