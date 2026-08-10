import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  lerp,
  linear,
  progress,
} from '@cut3/agent-memory/core/timeline';
import {
  rapidPhotoCutTarget,
  requireRapidPhotoCutTarget,
} from '@cut3/agent-memory/units/rapid-photo/RapidPhotoPlate';

const EMPHATIC_SETTLE = remotionBezier(0.16, 1, 0.3, 1);
const BALANCED_PAN = remotionBezier(0.45, 0, 0.55, 1);
const REMOTION_EASE = remotionBezier(0.42, 0, 1, 1);

const CUTS = Object.freeze({
  'zoom-out': cut('scale', 24, 1.3, 1, 0, 0, EMPHATIC_SETTLE, [
    filter('contrast', 1.4),
    filter('brightness', 1.1),
  ]),
  'zoom-in': cut('scale', 36, 1, 1.12, 0, 0, linear, [
    filter('contrast', 1.35),
    filter('saturate', 1.3),
  ]),
  'snap-zoom': cut('scale', 42, 1.25, 1, 0, 0, EMPHATIC_SETTLE, [
    filter('contrast', 1.4),
    filter('brightness', 1.05),
  ]),
  'lateral-pan': cut('x', 30, 1.1, 1.1, -20, 20, BALANCED_PAN, [
    filter('contrast', 1.3),
  ]),
  'ease-in-zoom': cut('scale', 42, 1, 1.15, 0, 0, REMOTION_EASE, []),
  'vertical-drift': cut('y', 36, 1.15, 1.15, 30, -30, linear, [
    filter('contrast', 1.25),
    filter('saturate', 1.2),
  ]),
});

/** One authored law coordinating a rapid photograph's camera cut and grade settle. */
export class RapidPhotoCut extends Behaviour {
  static kind = 'behaviour.rapid-photo.cut';

  #cut;

  constructor(unit, recipe) {
    super(requireRapidPhotoCutTarget(unit, recipe, 'RapidPhotoCut'));
    const target = rapidPhotoCutTarget(unit, recipe, 'RapidPhotoCut');
    this.#cut = CUTS[target.recipe];
  }

  onFrame({ frame }) {
    const amount = this.#cut.easing(progress(frame, 0, this.#cut.duration));
    const scale = lerp(this.#cut.scale[0], this.#cut.scale[1], amount);

    const offset = lerp(this.#cut.offset[0], this.#cut.offset[1], amount);
    this.unit.pose = {
      ...this.unit.pose,
      operations: transformOperations(this.#cut.motion, scale, offset),
    };
    this.unit.effects = {
      ...this.unit.effects,
      brightness: 1,
      contrast: 1,
      filters: this.#cut.filters,
      saturate: 1,
    };
  }
}

function cut(
  motion,
  duration,
  scaleFrom,
  scaleTo,
  offsetFrom,
  offsetTo,
  easing,
  filters,
) {
  return Object.freeze({
    duration,
    easing,
    filters: Object.freeze(filters),
    motion,
    offset: Object.freeze([offsetFrom, offsetTo]),
    scale: Object.freeze([scaleFrom, scaleTo]),
  });
}

function transformOperations(motion, scale, offset) {
  if (motion === 'x') {
    return [
      { kind: 'scale-2d', x: scale, y: scale },
      { kind: 'translate-x', value: offset },
    ];
  }
  if (motion === 'y') {
    return [
      { kind: 'translate-y', value: offset },
      { kind: 'scale-2d', x: scale, y: scale },
    ];
  }
  return [{ kind: 'scale-2d', x: scale, y: scale }];
}

function filter(kind, amount) {
  return Object.freeze({ kind, amount });
}

/* Horner-form parity with the exact Remotion Easing.bezier raster oracle. */
function remotionBezier(x1, y1, x2, y2) {
  const samples = new Float32Array(11);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = bezierCoordinate(index * 0.1, x1, x2);
  }
  return (value) => {
    if (value === 0 || value === 1) return value;
    let intervalStart = 0;
    let sample = 1;
    for (; sample !== 10 && samples[sample] <= value; sample += 1) intervalStart += 0.1;
    sample -= 1;
    const distance = (value - samples[sample]) / (samples[sample + 1] - samples[sample]);
    const guess = intervalStart + (distance * 0.1);
    const slope = bezierSlope(guess, x1, x2);
    const parameter = slope >= 0.001
      ? newtonBezier(value, guess, x1, x2)
      : slope === 0
        ? guess
        : subdivideBezier(value, intervalStart, intervalStart + 0.1, x1, x2);
    return bezierCoordinate(parameter, y1, y2);
  };
}

function bezierCoefficientA(first, second) {
  return 1 - (3 * second) + (3 * first);
}

function bezierCoefficientB(first, second) {
  return (3 * second) - (6 * first);
}

function bezierCoordinate(parameter, first, second) {
  return (((bezierCoefficientA(first, second) * parameter
    + bezierCoefficientB(first, second)) * parameter
    + (3 * first)) * parameter);
}

function bezierSlope(parameter, first, second) {
  return (3 * bezierCoefficientA(first, second) * parameter * parameter)
    + (2 * bezierCoefficientB(first, second) * parameter)
    + (3 * first);
}

function newtonBezier(target, initial, first, second) {
  let parameter = initial;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const slope = bezierSlope(parameter, first, second);
    if (slope === 0) return parameter;
    parameter -= (bezierCoordinate(parameter, first, second) - target) / slope;
  }
  return parameter;
}

function subdivideBezier(target, initialLow, initialHigh, first, second) {
  let low = initialLow;
  let high = initialHigh;
  let parameter;
  let difference;
  let iteration = 0;
  do {
    parameter = low + ((high - low) / 2);
    difference = bezierCoordinate(parameter, first, second) - target;
    if (difference > 0) high = parameter;
    else low = parameter;
    iteration += 1;
  } while (Math.abs(difference) > 0.0000001 && iteration < 10);
  return parameter;
}
