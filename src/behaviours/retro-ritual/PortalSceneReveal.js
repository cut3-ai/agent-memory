import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { progress } from '@cut3/agent-memory/core/timeline';

/** Reveals the next scene only under a fully closed portal, using held pixel steps. */
export class PortalSceneReveal extends Behaviour {
  static kind = 'behaviour.retro-ritual.portal-scene-reveal';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.composition-pivot', 'PortalSceneReveal'));
  }

  onFrame({ frame }) {
    const stepped = Math.floor(progress(frame, 15, 6) * 4) / 4;
    this.unit.opacity = stepped;
    this.unit.pose = {
      ...this.unit.pose,
      scaleX: 1 + ((1 - stepped) * 0.06),
      scaleY: 1 + ((1 - stepped) * 0.06),
      x: stepped < 0.5 ? 12 : 0,
      y: stepped < 0.75 ? -8 : 0,
    };
    this.unit.effects = {
      ...this.unit.effects,
      blur: 0,
      brightness: stepped < 1 ? 1.55 : 1,
      contrast: 1.28 - (stepped * 0.08),
      saturate: 1.4 - (stepped * 0.25),
    };
  }
}
