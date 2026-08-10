import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  cubicBezier,
  progress,
} from '@cut3/agent-memory/core/timeline';
import {
  requireEmulsionTarget,
} from '@cut3/agent-memory/units/turbulent-emulsion/emulsionSemantics';

const REVEAL = cubicBezier(0.45, 0, 0.25, 1);

/** Complete frame-to-state law for emulsion drift and the neon reveal. */
export class EmulsionDrift extends Behaviour {
  static kind = 'behaviour.turbulent-emulsion.drift';

  #variant;
  #role;

  constructor(unit) {
    const target = requireEmulsionTarget(unit, 'drift');
    super(target.owner);
    this.#variant = target.variant;
    this.#role = target.role;
  }

  onFrame({ duration, frame }) {
    if (this.#role === 'neon') {
      const revealEnd = Math.round(duration * 0.78);
      const reveal = REVEAL(progress(frame, 0, revealEnd));
      const afterReveal = Math.max(frame - revealEnd, 0);
      const wobble = reveal >= 1
        ? Math.sin(afterReveal * 0.45) * 0.04 * Math.exp(-afterReveal * 0.03)
        : 0;
      const intro = progress(frame, 0, 6);
      const exitDuration = Math.round(duration * 0.4);
      const exit = cubicIn(progress(frame, duration - exitDuration, exitDuration));
      const glow = 6 + (reveal * 10);
      const scale = (0.92 + (intro * 0.08) + wobble) * (1 + (exit * 0.18));
      this.unit.opacity = intro * (1 - exit);
      this.unit.motion = {
        fillOpacity: reveal < 0.75 ? 0 : ((reveal - 0.75) / 0.25) * 0.16,
        glow,
        scale,
        traceProgress: reveal,
      };
      return;
    }

    if (this.#variant === 'handwritten-cues') {
      const frequencyX = Number((0.9 + (Math.sin(frame * 0.06) * 0.09)).toFixed(4));
      const frequencyY = Number((0.9 + (Math.cos(frame * 0.05) * 0.09)).toFixed(4));
      const displacement = Number((33
        + (Math.sin(frame * 0.22) * 9)
        + (Math.sin(frame * 0.9) * 3)).toFixed(2));
      const blur = Number((10.6 + (Math.sin(frame * 0.35) * 1.4)).toFixed(2));
      this.unit.motion = {
        blur,
        displacement,
        frequencyX,
        frequencyY,
        seed: Math.floor(frame / 3),
      };
      return;
    }

    if (this.#variant === 'soft-grain') {
      const frequency = Number((0.95 + (Math.sin(frame * 0.6) * 0.02)).toFixed(4));
      this.unit.motion = { frequency, seed: (frame % 991) + 1 };
      return;
    }

    const seed = this.#variant === 'dense-grain'
      ? frame % 9973
      : ((frame * 7) + 3) % 9973;
    this.unit.motion = {
      dustSeed: ((seed * 3) + 17) % 9973,
      fineSeed: seed,
    };
  }
}

function cubicIn(value) {
  return value ** 3;
}
