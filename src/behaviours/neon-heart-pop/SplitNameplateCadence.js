import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  cubicBezier,
  easeOut,
  interpolateRange,
} from '@cut3/agent-memory/core/timeline';

const OUT_EASE = easeOut(cubicBezier(0.42, 0, 1, 1));
const CLAMP = Object.freeze({ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const OWNER_KINDS = Object.freeze({
  'accent-stage': 'unit.neon-heart-pop.split-accent-stage',
  'label-stage': 'unit.neon-heart-pop.split-label-stage',
  particle: 'unit.neon-heart-pop.gold-particle',
  'primary-stage': 'unit.neon-heart-pop.split-primary-stage',
});

/**
 * Complete split-nameplate cadence across its semantic title, counter-line,
 * attribution and phased gold-particle owners.
 */
export class SplitNameplateCadence extends Behaviour {
  static kind = 'behaviour.neon-heart-pop.split-nameplate-cadence';

  #delay;
  #role;

  constructor(unit, role, delay = 0) {
    super(requireCadenceOwner(unit, role));
    this.#role = String(role);
    this.#delay = Number(delay);
    if (!Number.isFinite(this.#delay)) {
      throw new TypeError('SplitNameplateCadence delay must be finite');
    }
  }

  onFrame({ fps, frame }) {
    if (this.#role === 'primary-stage') {
      const end = Math.round((300 / 1000) * fps);
      const y = interpolateRange(frame, [0, end], [-150, 0], {
        ...CLAMP,
        easing: OUT_EASE,
      });
      this.unit.pose = { ...this.unit.pose, operations: [{ kind: 'translate-y', value: y }] };
      return;
    }

    if (this.#role === 'accent-stage') {
      const start = Math.round((100 / 1000) * fps);
      const end = Math.round((400 / 1000) * fps);
      const y = interpolateRange(frame, [start, end], [150, 0], {
        ...CLAMP,
        easing: OUT_EASE,
      });
      this.unit.pose = {
        ...this.unit.pose,
        operations: [
          { kind: 'translate-y', value: y },
          { kind: 'rotate-z', degrees: -8 },
        ],
      };
      return;
    }

    if (this.#role === 'label-stage') {
      const start = Math.round((400 / 1000) * fps);
      const end = Math.round((500 / 1000) * fps);
      this.unit.opacity = interpolateRange(frame, [start, end], [0, 0.7], CLAMP);
      return;
    }

    const end = Math.round((300 / 1000) * fps);
    const entrance = interpolateRange(frame, [0, end], [0, 1], {
      ...CLAMP,
      easing: OUT_EASE,
    });
    const pulse = (Math.sin(((frame / fps) + this.#delay) * Math.PI * 2) * 0.5) + 0.5;
    this.unit.opacity = pulse * entrance;
  }
}

function requireCadenceOwner(unit, role) {
  const expected = OWNER_KINDS[role];
  if (!expected || unit?.constructor?.kind !== expected) {
    throw new TypeError('SplitNameplateCadence requires an authored semantic owner');
  }
  return unit;
}
