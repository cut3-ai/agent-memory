import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { interpolateRange, springValue } from '@cut3/agent-memory/core/timeline';

const CLAMP = Object.freeze({ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** 400ms spring burst with a continuous authored Y-axis heart rotation. */
export class OrbitHeartBurst extends Behaviour {
  static kind = 'behaviour.neon-heart-pop.orbit-heart-burst';

  constructor(unit) {
    super(requireOwner(unit, 'unit.neon-heart-pop.orbit-heart-core'));
  }

  onFrame({ fps, frame }) {
    const scale = heartScale(frame, fps);
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

/** One of four fixed-phase orbital lights, including its shared spring reveal. */
export class OrbitParticleCadence extends Behaviour {
  static kind = 'behaviour.neon-heart-pop.orbit-particle-cadence';

  #offset;

  constructor(unit, index, offset) {
    super(requireParticleOwner(unit, index, offset));
    this.#offset = Number(offset);
  }

  onFrame({ fps, frame }) {
    const angle = ((frame / fps) * 2 * 2 * Math.PI) + this.#offset;
    this.unit.frame = {
      ...this.unit.frame,
      x: Math.cos(angle) * 140,
      y: Math.sin(angle) * 140,
    };
    this.unit.opacity = heartScale(frame, fps);
  }
}

/** Late 350–550ms caption reveal shared by both fixed styled text runs. */
export class OrbitCaptionReveal extends Behaviour {
  static kind = 'behaviour.neon-heart-pop.orbit-caption-reveal';

  constructor(unit) {
    super(requireOwner(unit, 'unit.neon-heart-pop.orbit-caption'));
  }

  onFrame({ fps, frame }) {
    const timeMs = (frame / fps) * 1000;
    const start = Math.round((350 / 1000) * fps);
    const end = Math.round((550 / 1000) * fps);
    this.unit.opacity = timeMs >= 350
      ? interpolateRange(frame, [start, end], [0, 1], CLAMP)
      : 0;
  }
}

function heartScale(frame, fps) {
  return springValue({
    config: { damping: 12, stiffness: 100 },
    durationInFrames: Math.round((400 / 1000) * fps),
    fps,
    frame,
  });
}

function requireOwner(unit, kind) {
  if (unit?.constructor?.kind !== kind) {
    throw new TypeError('Orbit-heart cadence requires an authored semantic owner');
  }
  return unit;
}

function requireParticleOwner(unit, index, offset) {
  requireOwner(unit, 'unit.neon-heart-pop.orbit-particle');
  if (unit.orbitIndex !== index || unit.orbitOffset !== offset) {
    throw new TypeError('Orbit particle does not match its authored phase');
  }
  return unit;
}
