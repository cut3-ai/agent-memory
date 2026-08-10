import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { cubicBezier, interpolateRange } from '@cut3/agent-memory/core/timeline';
import {
  requireFiveHitTitleOwner,
} from '@cut3/agent-memory/units/neon-heart-pop/NeonFiveHitPhotoNameplate';

const HIT_MILLISECONDS = Object.freeze([0, 150, 300, 450, 600]);
const CARD_RECIPES = Object.freeze([
  Object.freeze({ fromX: -1000, fromY: -1000, rotate: -12, fromScale: 1 }),
  Object.freeze({ fromX: 1000, fromY: 1000, rotate: 8, fromScale: 1 }),
  Object.freeze({ fromX: 0, fromY: -1200, rotate: -5, fromScale: 1 }),
  Object.freeze({ fromX: 1200, fromY: 0, rotate: 15, fromScale: 1 }),
  Object.freeze({ fromX: 0, fromY: 0, rotate: 0, fromScale: 4 }),
]);
const SLAM = cubicBezier(0.16, 1, 0.3, 1);
const CLAMP = Object.freeze({ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** One authored photo hit: delayed directional slam, rotation and scale landing. */
export class FiveHitPhotoSlam extends Behaviour {
  static kind = 'behaviour.neon-heart-pop.five-hit-photo-slam';

  #index;

  constructor(unit, index) {
    super(requireOwner(unit, 'unit.neon-heart-pop.five-hit-photo-card', index));
    this.#index = Number(index);
  }

  onFrame({ fps, frame }) {
    const recipe = CARD_RECIPES[this.#index];
    const local = frame - millisecondsToFrames(HIT_MILLISECONDS[this.#index], fps);
    const duration = millisecondsToFrames(150, fps);
    const amount = interpolateRange(local, [0, duration], [0, 1], {
      ...CLAMP,
      easing: SLAM,
    });
    const x = interpolateRange(amount, [0, 1], [recipe.fromX, 0], CLAMP);
    const y = interpolateRange(amount, [0, 1], [recipe.fromY, 0], CLAMP);
    const rotate = interpolateRange(
      amount,
      [0, 1],
      [recipe.rotate * 1.6, recipe.rotate],
      CLAMP,
    );
    const scale = interpolateRange(amount, [0, 1], [recipe.fromScale, 1], CLAMP);
    this.unit.present = local >= 0;
    this.unit.pose = {
      ...this.unit.pose,
      operations: [
        { kind: 'translate-2d', x: '-50%', y: '-50%' },
        { kind: 'translate-2d', x, y },
        { kind: 'rotate-z', degrees: rotate },
        { kind: 'scale-2d', x: scale, y: scale },
      ],
    };
  }
}

/** Shared five-impact camera shake with authored sinusoidal phase offsets and decay. */
export class FiveHitCameraShake extends Behaviour {
  static kind = 'behaviour.neon-heart-pop.five-hit-camera-shake';

  constructor(unit) {
    super(requireOwner(unit, 'unit.neon-heart-pop.five-hit-camera-stage'));
  }

  onFrame({ fps, frame }) {
    const shakeWindow = millisecondsToFrames(100, fps);
    let x = 0;
    let y = 0;
    let rotate = 0;
    HIT_MILLISECONDS.forEach((milliseconds, index) => {
      const elapsed = frame - millisecondsToFrames(milliseconds, fps);
      if (elapsed < 0 || elapsed >= shakeWindow) return;
      const decay = interpolateRange(elapsed, [0, shakeWindow], [1, 0], {
        extrapolateRight: 'clamp',
      });
      const amplitude = 34 * decay;
      x += Math.sin((elapsed + (index * 13)) * 5.7) * amplitude;
      y += Math.cos((elapsed + (index * 7)) * 6.3) * amplitude;
      rotate += Math.sin((elapsed + (index * 5)) * 7.1) * 1.4 * decay;
    });
    this.unit.pose = {
      ...this.unit.pose,
      operations: [
        { kind: 'translate-2d', x, y },
        { kind: 'rotate-z', degrees: rotate },
      ],
    };
  }
}

/** Late chromatic title hit with a fixed 80ms three-to-one scale slam. */
export class FiveHitTitleSlam extends Behaviour {
  static kind = 'behaviour.neon-heart-pop.five-hit-title-slam';

  constructor(unit) {
    super(requireFiveHitTitleOwner(unit));
  }

  onFrame({ fps, frame }) {
    const local = frame - millisecondsToFrames(750, fps);
    const duration = millisecondsToFrames(80, fps);
    const scale = interpolateRange(local, [0, duration], [3, 1], {
      ...CLAMP,
      easing: SLAM,
    });
    this.unit.present = local >= 0;
    this.unit.opacity = local >= 0 ? 1 : 0;
    this.unit.pose = {
      ...this.unit.pose,
      operations: [{ kind: 'scale-2d', x: scale, y: scale }],
    };
  }
}

/** Five short exposure hits aligned to the photo impacts. */
export class FiveHitExposureBurst extends Behaviour {
  static kind = 'behaviour.neon-heart-pop.five-hit-exposure-burst';

  constructor(unit) {
    super(requireOwner(unit, 'unit.neon-heart-pop.five-hit-exposure-plate'));
  }

  onFrame({ fps, frame }) {
    let opacity = 0;
    HIT_MILLISECONDS.forEach((milliseconds) => {
      const elapsed = frame - millisecondsToFrames(milliseconds, fps);
      if (elapsed < 0) return;
      opacity = Math.max(opacity, interpolateRange(
        elapsed,
        [0, 1, 5],
        [0.85, 0.9, 0],
        CLAMP,
      ));
    });
    this.unit.opacity = opacity;
    this.unit.present = opacity > 0;
  }
}

function requireOwner(unit, kind, index) {
  if (unit?.constructor?.kind !== kind) {
    throw new TypeError('Five-hit cadence requires an authored semantic owner');
  }
  if (index !== undefined && (unit.hitIndex !== index || !CARD_RECIPES[index])) {
    throw new TypeError('Five-hit photo owner does not match its authored hit');
  }
  return unit;
}

function millisecondsToFrames(milliseconds, fps) {
  return Math.round((milliseconds / 1000) * fps);
}
