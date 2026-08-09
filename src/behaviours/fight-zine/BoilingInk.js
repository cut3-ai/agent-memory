import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';

/** Two-frame ink boil that stays deterministic and layers over the row entrance. */
export class BoilingInk extends Behaviour {
  static kind = 'behaviour.fight-zine.boiling-ink';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.fight-zine.rank-row', 'BoilingInk'));
  }

  onFrame({ frame }) {
    const bucket = Math.floor(frame / 2);
    const x = boil(bucket, 1.1, 3.5);
    const y = boil(bucket, 2.2, 3.5);
    const rotate = boil(bucket, 3.3, 0.55);
    this.unit.pose = {
      ...this.unit.pose,
      rotate: this.unit.pose.rotate + rotate,
      x: this.unit.pose.x + x,
      y: this.unit.pose.y + y,
    };
  }
}

function boil(bucket, seed, amplitude) {
  const sample = Math.sin((seed * 12.9898) + (bucket * 78.233)) * 43_758.5453;
  return ((sample - Math.floor(sample) - 0.5) * 2) * amplitude;
}
