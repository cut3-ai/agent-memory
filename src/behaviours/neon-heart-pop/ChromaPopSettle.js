import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import {
  easeOutCubic,
  lerp,
  progress,
  smoothstep,
} from '@cut3/agent-memory/core/timeline';

/** Two-dimensional neon pop with a short chromatic recoil into a clean landing. */
export class ChromaPopSettle extends Behaviour {
  static kind = 'behaviour.neon-heart-pop.chroma-pop-settle';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.neon-heart-pop.chroma-nameplate', 'ChromaPopSettle'));
  }

  onFrame({ frame }) {
    const pop = easeOutCubic(progress(frame, 0, 10));
    const settle = smoothstep(progress(frame, 10, 8));
    const landing = smoothstep(progress(frame, 0, 18));
    const idlePhase = Math.max(0, frame - 18);
    const heldJitter = Math.sin(Math.floor(idlePhase / 2) * 1.7);
    const idlePulse = Math.sin(idlePhase * 0.24);
    const entranceScale = frame < 10
      ? lerp(0, 1.08, pop)
      : lerp(1.08, 1, settle);
    const scale = entranceScale + (idlePhase > 0 ? idlePulse * 0.008 : 0);
    const chromaticShadow = frame < 5
      ? '-3px 0 0 #31e7ff'
      : frame < 10
        ? '3px 0 0 #ff304f'
        : '0 0 20px rgba(255,45,166,.58)';

    this.unit.opacity = progress(frame, 0, 3);
    this.unit.pose = {
      ...this.unit.pose,
      rotate: idlePhase > 0 ? heldJitter * 0.32 : lerp(-1.4, 0, landing),
      scaleX: scale,
      scaleY: scale,
      x: idlePhase > 0 ? heldJitter * 1.5 : 0,
      y: lerp(34, 0, pop) + (idlePhase > 0 ? idlePulse * 2 : 0),
    };
    this.unit.effects = {
      ...this.unit.effects,
      blur: lerp(3, 0, progress(frame, 0, 8)),
      brightness: lerp(1.42, 1, landing),
      contrast: lerp(1.24, 1.08, landing),
      saturate: lerp(1.62, 1.12, landing),
      shadow: chromaticShadow,
    };
  }
}
