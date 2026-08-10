import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { cubicBezier, interpolateRange } from '@cut3/agent-memory/core/timeline';

const LANDING = cubicBezier(0.16, 1, 0.3, 1);
const CLAMP = Object.freeze({
  easing: LANDING,
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});

/** 250ms deep flip followed by the authored slow three-degree X-axis wobble. */
export class FlipTitleReveal extends Behaviour {
  static kind = 'behaviour.neon-heart-pop.flip-title-reveal';

  constructor(unit) {
    super(requireFlipOwner(unit));
  }

  onFrame({ fps, frame }) {
    const duration = 0.25 * fps;
    const amount = Math.min(frame / duration, 1);
    const landingRotate = interpolateRange(amount, [0, 1], [90, 0], CLAMP);
    const translateZ = interpolateRange(amount, [0, 1], [-300, 0], CLAMP);
    const wobble = frame > duration
      ? Math.sin(((frame - duration) / fps) * Math.PI * 0.5) * 3
      : 0;
    this.unit.pose = {
      ...this.unit.pose,
      operations: [
        { kind: 'rotate-x', degrees: landingRotate + wobble },
        { kind: 'translate-z', value: translateZ },
      ],
      transformStyle: 'preserve-3d',
    };
  }
}

function requireFlipOwner(unit) {
  if (unit?.constructor?.kind !== 'unit.neon-heart-pop.flip-title-stage') {
    throw new TypeError('FlipTitleReveal requires the authored flip-title stage');
  }
  return unit;
}
