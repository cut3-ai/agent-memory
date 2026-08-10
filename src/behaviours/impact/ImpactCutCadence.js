import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  cubicBezier,
  easeOut,
  interpolateRange,
} from '@cut3/agent-memory/core/timeline';
import { requireImpactRole } from '@cut3/agent-memory/units/impact/ImpactRecipeUnits';

const EMPHATIC = cubicBezier(0.16, 1, 0.3, 1);
const BALANCED = cubicBezier(0.45, 0, 0.55, 1);
const EASE = cubicBezier(0.42, 0, 1, 1);
const CUBIC = (value) => value ** 3;
const QUAD = (value) => value ** 2;

/** Complete authored law for one semantic impact role, mutating its owner only. */
export class ImpactCutCadence extends Behaviour {
  static kind = 'behaviour.impact.cut-cadence';

  #apply;
  #params;

  constructor(unit, recipe, role, params = {}) {
    super(requireImpactRole(unit, recipe, role));
    this.#apply = ROLES[`${recipe}:${role}`];
    this.#params = Object.freeze({ ...params });
  }

  onFrame(context) {
    this.#apply(this.unit, context, this.#params);
  }
}

const ROLES = Object.freeze({
  'photo-depth-zoom:image': (unit, { fps, frame }) => {
    const end = Math.round(0.8 * fps);
    pose(unit, [
      rotateX(at(frame, [0, end], [-20, 0], EMPHATIC)),
      scale(at(frame, [0, end], [0.9, 1.2], EMPHATIC)),
    ]);
  },
  'photo-depth-zoom:text': (unit, { fps, frame }) => {
    const end = Math.round(0.3 * fps);
    pose(unit, [
      rotateX(at(frame, [0, end], [90, 0], EMPHATIC)),
      scale(at(frame, [0, end], [1.3, 1], EMPHATIC)),
    ]);
  },
  'photo-depth-zoom:flash': (unit, { fps, frame }) => {
    unit.opacity = at(frame, [0, Math.round(0.1 * fps)], [1, 0]);
  },

  'photo-chroma-depth:image': (unit, { fps, frame }) => {
    pose(unit, [
      rotateX(at(frame, [0, Math.round(fps)], [6, 0], BALANCED)),
      scale(at(frame, [0, Math.round(fps)], [1, 1.12], BALANCED)),
    ]);
  },
  'photo-chroma-depth:gradient': (unit, { fps, frame }) => {
    pose(unit, [translateY(at(frame, [0, Math.round(fps)], [20, 0], BALANCED))]);
  },
  'photo-chroma-depth:text': (unit, { fps, frame }) => {
    const start = Math.round(0.3 * fps);
    const duration = Math.round(0.4 * fps);
    const progress = at(frame, [start, start + duration], [0, 1], EMPHATIC);
    unit.opacity = progress;
    pose(unit, [rotateX(at(progress, [0, 1], [45, 0]))]);
  },
  'photo-chroma-depth:flash': (unit, { fps, frame }) => {
    unit.opacity = at(frame, [0, Math.round(0.12 * fps)], [1, 0]);
  },

  'photo-punch-2d:image': (unit, { fps, frame }) => {
    pose(unit, [
      scale(at(frame, [0, fps * 2], [1, 1.2])),
      translateX(at(frame, [0, fps * 2], [0, -20])),
    ]);
  },
  'photo-punch-2d:text': (unit, { fps, frame }) => {
    const end = Math.round(0.4 * fps);
    unit.opacity = at(frame, [0, end], [0, 1]);
    pose(unit, [translateY(at(frame, [0, end], [40, 0], easeOut(CUBIC)))]);
  },
  'photo-punch-2d:flash': (unit, { fps, frame }) => {
    unit.opacity = at(frame, [0, Math.round(0.1 * fps)], [1, 0]);
  },

  'photo-screen-blend:image': (unit, { frame }) => {
    pose(unit, [scale(at(frame, [0, 90], [1.15, 1], BALANCED))]);
  },
  'photo-screen-blend:red': (unit, { fps, frame }) => {
    unit.opacity = at(frame, [0, Math.round(0.9 * fps)], [0.3, 0]);
  },
  'photo-screen-blend:flash': (unit, { frame }) => {
    unit.opacity = at(frame, [0, 5], [1, 0]);
  },
  'photo-screen-blend:text': (unit, { fps, frame }) => {
    unit.opacity = at(
      frame,
      [Math.round(0.3 * fps), Math.round(0.7 * fps)],
      [0, 1],
      easeOut(EASE),
    );
  },

  'triptych-depth:image': (unit, { fps, frame }) => {
    const slam = Math.round(0.4 * fps);
    let x = 0;
    let rotate = 0;
    if ([3, 6, 9].includes(frame)) {
      x = 10;
      rotate = 5;
    }
    if ([4, 7, 10].includes(frame)) {
      x = -10;
      rotate = -5;
    }
    pose(unit, [
      scale(at(frame, [0, slam], [1, 1.3], EMPHATIC)),
      rotateY(at(frame, [0, slam], [20, 0], EMPHATIC) + rotate),
      translateX(x),
    ]);
  },
  'triptych-depth:ghost': (unit, { frame }, { opacity }) => {
    const positive = [3, 6, 9].includes(frame);
    const negative = [4, 7, 10].includes(frame);
    unit.present = positive || negative;
    unit.opacity = opacity;
  },
  'triptych-depth:red': (unit, { frame }) => {
    unit.paint = {
      ...unit.paint,
      fill: `rgba(255, 0, 0, ${Math.abs(Math.sin(frame * 0.5)) * 0.2})`,
    };
  },
  'triptych-depth:black': (unit, { fps, frame }) => {
    unit.opacity = at(frame, [0, Math.round(0.06 * fps)], [1, 0]);
  },

  'photo-shadow-punch:image': (unit, { fps, frame }) => {
    pose(unit, [
      scale(at(frame, [0, Math.round(0.7 * fps)], [1, 1.15], EMPHATIC)),
    ]);
  },
  'photo-shadow-punch:black': (unit, { fps, frame }) => {
    unit.opacity = at(frame, [0, Math.round(0.08 * fps)], [1, 0]);
  },

  'collage-depth-outline:image': (unit, { fps, frame }) => {
    const end = Math.round(fps);
    pose(unit, [
      rotateY(at(frame, [0, end], [-15, 0], EMPHATIC)),
      rotateX(at(frame, [0, end], [8, 0], EMPHATIC)),
      scale(at(frame, [0, end], [1, 1.2], EMPHATIC)),
    ]);
  },
  'collage-depth-outline:text': (unit, { fps, frame }) => {
    pose(unit, [
      rotateX(at(frame, [0, Math.round(0.3 * fps)], [-90, 0], EMPHATIC)),
    ]);
  },
  'collage-depth-outline:flash': (unit, { fps, frame }) => {
    unit.opacity = at(
      frame,
      [0, Math.round(0.15 * fps)],
      [1, 0],
      easeOut(QUAD),
    );
  },

  'solid-card-depth:stage': (unit, { fps, frame }) => {
    unit.opacity = at(frame, [0, Math.round(0.2 * fps)], [0, 1]);
  },
  'solid-card-depth:ring': (unit, { fps, frame }) => {
    const rotation = ((frame % (1.2 * fps)) / (1.2 * fps)) * 360;
    pose(unit, [rotateX(30), rotateY(rotation)]);
  },

  'type-depth-rise:stack': (unit, { fps, frame }) => {
    const entrance = at(frame, [0, 18], [0, 1], EMPHATIC);
    const y = at(entrance, [0, 1], [-90, 0])
      + (entrance === 1 ? Math.sin((frame / fps) * Math.PI) * 8 : 0);
    const x = entrance === 1 ? Math.sin((frame / fps) * Math.PI * 0.7) * 3 : 0;
    pose(unit, [rotateY(y), rotateX(x)]);
  },

  'type-depth-panel:stack': (unit, { fps, frame }) => {
    const seconds = frame / fps;
    const amount = seconds < 0.3
      ? interpolateRange(frame, [0, fps * 0.3], [1.3, 1], { extrapolateRight: 'clamp' })
      : 1;
    pose(unit, [scale(amount), rotateY(Math.sin(seconds * Math.PI * 1.5) * 5)]);
  },
  'type-depth-panel:ring': (unit, { fps, frame }) => {
    pose(unit, [rotateX(20), rotateY((frame / fps) * 300)]);
  },

  'type-depth-stack:star-group': (unit, { fps, frame }) => {
    unit.opacity = at(frame, [0, Math.round(0.3 * fps)], [0, 1]);
  },
  'type-depth-stack:star': (unit, { fps, frame }) => {
    const seconds = frame / fps;
    pose(unit, [rotateZ(seconds * 180), rotateX(Math.sin(seconds) * 15)]);
  },
  'type-depth-stack:text-group': (unit, { fps, frame }) => {
    unit.opacity = at(
      frame,
      [Math.round(0.3 * fps), Math.round(0.7 * fps)],
      [0, 1],
    );
  },
  'type-depth-stack:text-stack': (unit, { fps, frame }) => {
    pose(unit, [rotateY(Math.sin((frame / fps) * 2) * 4)]);
  },

  'type-depth-stamp:stage': (unit, { fps, frame }) => {
    unit.opacity = at(frame, [0, Math.round(0.3 * fps)], [0, 1]);
  },
  'type-depth-stamp:cube': (unit, { fps, frame }) => {
    pose(unit, [rotateX((frame / fps) * 90), rotateY((frame / fps) * 120)]);
  },

  'type-depth-tilt:stack': (unit, { fps, frame }) => {
    const end = Math.round(0.3 * fps);
    const slam = at(frame, [0, end], [0, 1], EMPHATIC);
    const pulse = frame > end ? 1 + (0.04 * Math.sin((frame - end) * 0.08)) : 1;
    pose(unit, [
      rotateX(at(slam, [0, 1], [-60, 0])),
      scale(at(slam, [0, 1], [0.5, 1]) * pulse),
      translateX('-50%'),
    ]);
  },

  'type-collage-depth:content': (unit, { frame }) => {
    const phase = frame % 30;
    pose(unit, [scale(phase < 8 ? at(phase, [0, 8], [1.08, 1], EMPHATIC) : 1)]);
  },
  'type-collage-depth:chroma': (unit, { frame }) => {
    const opacity = at(frame, [0, 4, 5], [1, 1, 0]);
    unit.present = opacity > 0;
    unit.opacity = opacity;
  },
  'type-collage-depth:glitch': (unit, { frame }) => {
    const visible = (frame >= 10 && frame <= 12) || (frame >= 40 && frame <= 42);
    unit.present = visible;
    unit.opacity = visible ? 1 : 0;
  },
  'type-collage-depth:top-group': (unit, { frame }) => {
    unit.opacity = at(frame, [10, 28], [0, 1]);
  },
  'type-collage-depth:top-text': (unit, { fps, frame }) => {
    pose(unit, [rotateY(Math.sin((frame / fps) * Math.PI * 1.5) * 3)]);
  },
  'type-collage-depth:bottom-group': (unit, { frame }) => {
    unit.opacity = at(frame, [30, 48], [0, 0.7]);
  },
  'type-collage-depth:flash': (unit, { frame }) => {
    const opacity = at(frame, [0, 5], [1, 0]);
    unit.present = opacity > 0;
    unit.opacity = opacity;
  },
});

function at(input, inputRange, outputRange, easing) {
  return interpolateRange(input, inputRange, outputRange, {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

function pose(unit, operations) {
  unit.pose = { ...unit.pose, operations, x: 0, y: 0 };
}

function rotateX(degrees) {
  return { kind: 'rotate-x', degrees };
}

function rotateY(degrees) {
  return { kind: 'rotate-y', degrees };
}

function rotateZ(degrees) {
  return { kind: 'rotate-z', degrees };
}

function scale(value) {
  return { kind: 'scale-2d', x: value, y: value };
}

function translateX(value) {
  return { kind: 'translate-x', value: typeof value === 'number' ? `${value}px` : value };
}

function translateY(value) {
  return { kind: 'translate-y', value: typeof value === 'number' ? `${value}px` : value };
}
