import { writeTransform } from '../../../behaviours/shared.js';
import { Behaviour } from '../../../core/Behaviour.js';

export class EditorialSnap extends Behaviour {
  static kind = 'behaviour.test-editorial-snap';

  constructor(unit) {
    super(unit);
  }

  onFrame(context) {
    const beat = Math.max(0, Math.min(1, (context.frame - 6) / 12));
    const snap = beat < 0.72
      ? Math.pow(beat / 0.72, 2) * 1.08
      : 1.08 - ((beat - 0.72) / 0.28) * 0.08;
    writeTransform(this.unit, 'scale', { x: snap, y: snap });
  }
}
