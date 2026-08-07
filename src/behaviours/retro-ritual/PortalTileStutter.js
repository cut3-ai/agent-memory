import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { progress } from '@cut3/agent-memory/core/timeline';

/** Four-phase pixel portal cut with authored green/purple light pulses. */
export class PortalTileStutter extends Behaviour {
  static kind = 'behaviour.retro-ritual.portal-tile-stutter';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.composition-pivot', 'PortalTileStutter'));
  }

  onFrame({ frame }) {
    const step = Math.min(4, Math.floor(progress(frame, 0, 16) * 5));
    const scales = [0.08, 0.42, 0.36, 0.78, 1];
    const verticalScales = [0.12, 0.36, 0.48, 0.82, 1];
    const turns = [-8, 5, -3, 1, 0];
    const leave = progress(frame, 20, 8);
    this.unit.opacity = (frame % 3 === 1 && frame < 14 ? 0.58 : 1) * (1 - leave);
    this.unit.pose = {
      ...this.unit.pose,
      rotate: turns[step] + (leave * 3),
      scaleX: scales[step] + (leave * 0.14),
      scaleY: verticalScales[step] + (leave * 0.14),
      x: [80, -32, 18, -6, 0][step] + (leave * 36),
      y: [-48, 24, -12, 4, 0][step] - (leave * 24),
    };
    this.unit.effects = {
      ...this.unit.effects,
      blur: 0,
      brightness: [2.2, 1.15, 1.8, 1.1, 1][step] + (leave * 0.8),
      contrast: 1.35,
      saturate: 1.4,
      shadow: step % 2 === 0 ? '16px 0 0 #78d64b' : '-16px 0 0 #8d5bd1',
    };
  }
}
