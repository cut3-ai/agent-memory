import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { easeOutCubic, lerp, progress } from '@cut3/agent-memory/core/timeline';

/** Simple scale-and-fade entrance for the connectivity-check marker unit. */
export class ConnCheckSettle88bf76acecbb extends Behaviour {
  static kind = 'behaviour.conn-check-88bf76acecbb.marker';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.conn-check-88bf76acecbb.marker', 'ConnCheckSettle88bf76acecbb'));
  }

  onFrame({ frame }) {
    const t = easeOutCubic(progress(frame, 0, 18));
    this.unit.opacity = progress(frame, 0, 8);
    this.unit.pose = {
      ...this.unit.pose,
      scaleX: lerp(0.72, 1, t),
      scaleY: lerp(0.72, 1, t),
      y: lerp(40, 0, t),
    };
  }
}
