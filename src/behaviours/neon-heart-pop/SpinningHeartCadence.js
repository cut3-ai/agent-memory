import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { interpolateRange, springValue } from '@cut3/agent-memory/core/timeline';

/** 300ms spring burst and one-turn-per-second Y rotation for the vector heart. */
export class SpinningHeartBurst extends Behaviour {
  static kind = 'behaviour.neon-heart-pop.spinning-heart-burst';

  constructor(unit) {
    super(requireOwner(unit, 'unit.neon-heart-pop.spinning-heart-core'));
  }

  onFrame({ fps, frame }) {
    const scale = springValue({
      config: { damping: 12, stiffness: 100 },
      durationInFrames: Math.round(0.3 * fps),
      fps,
      frame,
    });
    this.unit.pose = {
      ...this.unit.pose,
      operations: [
        { kind: 'rotate-y', degrees: (frame / fps) * 360 },
        { kind: 'scale-2d', x: scale, y: scale },
      ],
      transformStyle: 'preserve-3d',
    };
  }
}

/** Five-point authored constellation twinkle with fixed phase offsets. */
export class HeartConstellationTwinkle extends Behaviour {
  static kind = 'behaviour.neon-heart-pop.heart-constellation-twinkle';

  #offset;

  constructor(unit, index, offset) {
    super(requireStarOwner(unit, index));
    this.#offset = Number(offset);
    if (!Number.isFinite(this.#offset)) throw new TypeError('Twinkle offset must be finite');
  }

  onFrame({ fps, frame }) {
    const wave = Math.sin(((frame + this.#offset) / fps) * Math.PI * 2);
    this.unit.opacity = interpolateRange(wave, [-1, 1], [0.2, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }
}

function requireOwner(unit, kind) {
  if (unit?.constructor?.kind !== kind) {
    throw new TypeError('Spinning-heart cadence requires an authored semantic owner');
  }
  return unit;
}

function requireStarOwner(unit, index) {
  requireOwner(unit, 'unit.neon-heart-pop.twinkle-star');
  if (unit.starIndex !== index) throw new TypeError('Twinkle owner does not match its authored point');
  return unit;
}
