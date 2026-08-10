export function frameContext(input = {}) {
  const frame = finite(input.frame ?? 0, 'frame');
  const absoluteFrame = finite(input.absoluteFrame ?? frame, 'absoluteFrame');
  const fps = positive(input.fps ?? 30, 'fps');
  const motion = motionCapability(input.motion);
  return Object.freeze({
    absoluteFrame,
    duration: positive(input.duration ?? 1, 'duration'),
    fps,
    frame,
    height: positive(input.height ?? 1920, 'height'),
    ...(motion === undefined ? {} : { motion }),
    width: positive(input.width ?? 1080, 'width'),
  });
}

/** Preserve the host timing functions while rejecting partial timing engines. */
export function motionCapability(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('motion must be an object');
  }
  if (typeof value.interpolate !== 'function') {
    throw new TypeError('motion.interpolate must be a function');
  }
  if (typeof value.spring !== 'function') {
    throw new TypeError('motion.spring must be a function');
  }
  // Remotion's real Easing export is itself a callable function carrying
  // .bezier/.in/.out as properties (same shape React Native uses), not a
  // plain object, so both shapes are accepted here.
  if (
    !value.Easing
    || (typeof value.Easing !== 'object' && typeof value.Easing !== 'function')
    || Array.isArray(value.Easing)
  ) {
    throw new TypeError('motion.Easing must be an object or function');
  }
  for (const method of ['bezier', 'in', 'out']) {
    if (typeof value.Easing[method] !== 'function') {
      throw new TypeError(`motion.Easing.${method} must be a function`);
    }
  }
  return value;
}

export function requireMotion(context, owner = 'Behaviour') {
  if (context?.motion === undefined) {
    throw new TypeError(`${owner} requires context.motion`);
  }
  return motionCapability(context.motion);
}

export function localContext(context, offset) {
  return frameContext({ ...context, frame: context.frame - finite(offset, 'offset') });
}

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function progress(frame, from, duration) {
  if (duration <= 0) return Number(frame >= from);
  return clamp((frame - from) / duration);
}

export function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

export function easeOutCubic(value) {
  return 1 - ((1 - clamp(value)) ** 3);
}

export function easeOutBack(value, overshoot = 1.70158) {
  const x = clamp(value) - 1;
  return 1 + ((overshoot + 1) * (x ** 3)) + (overshoot * (x ** 2));
}

export function smoothstep(value) {
  const x = clamp(value);
  return x * x * (3 - (2 * x));
}

/** Piecewise numeric interpolation with explicit edge behaviour. */
export function interpolateRange(input, inputRange, outputRange, options = {}) {
  finite(input, 'interpolate input');
  numericRange(inputRange, 'inputRange');
  numericRange(outputRange, 'outputRange');
  if (inputRange.length !== outputRange.length) {
    throw new TypeError('inputRange and outputRange must have the same length');
  }
  for (let index = 1; index < inputRange.length; index += 1) {
    if (inputRange[index] <= inputRange[index - 1]) {
      throw new RangeError('inputRange must be strictly increasing');
    }
  }

  const index = segmentIndex(input, inputRange);
  const inputMin = inputRange[index];
  const inputMax = inputRange[index + 1];
  const outputMin = outputRange[index];
  const outputMax = outputRange[index + 1];
  const edge = input < inputMin ? options.extrapolateLeft : options.extrapolateRight;
  let value = input;

  if (input < inputMin) value = extrapolate(input, inputMin, inputMax, edge ?? 'extend');
  if (input > inputMax) value = extrapolate(input, inputMin, inputMax, edge ?? 'extend');
  if ((input < inputMin || input > inputMax) && edge === 'identity') return input;
  if (outputMin === outputMax) return outputMin;

  const amount = (value - inputMin) / (inputMax - inputMin);
  const eased = (options.easing ?? linear)(amount);
  return outputMin + ((outputMax - outputMin) * eased);
}

export function linear(value) {
  return value;
}

export function easeIn(easing) {
  requireEasing(easing);
  return easing;
}

export function easeOut(easing) {
  requireEasing(easing);
  return (value) => 1 - easing(1 - value);
}

export function easeInOut(easing) {
  requireEasing(easing);
  return (value) => (
    value < 0.5
      ? easing(value * 2) / 2
      : 1 - (easing((1 - value) * 2) / 2)
  );
}

export function easingBack(overshoot = 1.70158) {
  finite(overshoot, 'back overshoot');
  return (value) => value * value * (((overshoot + 1) * value) - overshoot);
}

/** Deterministic cubic-bezier easing with x control points constrained to [0, 1]. */
export function cubicBezier(x1, y1, x2, y2) {
  [x1, y1, x2, y2].forEach((value, index) => finite(value, `bezier.${index}`));
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
    throw new RangeError('bezier x control points must stay between zero and one');
  }
  if (x1 === y1 && x2 === y2) return linear;
  // Match the Float32 sample table and Newton/subdivision path used by
  // React Native Animated and Remotion, so reconstructed easing does not
  // drift at pixel boundaries.
  const samples = new Float32Array(11);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = bezierCoordinate(index / 10, x1, x2);
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
    let parameter;
    if (slope >= 0.001) parameter = newtonBezier(value, guess, x1, x2);
    else if (slope === 0) parameter = guess;
    else parameter = subdivideBezier(value, intervalStart, intervalStart + 0.1, x1, x2);
    return bezierCoordinate(parameter, y1, y2);
  };
}

/** Deterministic damped spring compatible with frame-based Remotion timing. */
export function springValue(options = {}) {
  const frame = finite(options.frame ?? 0, 'spring.frame');
  const fps = positive(options.fps ?? 30, 'spring.fps');
  const config = springConfig(options.config);
  const from = finite(options.from ?? 0, 'spring.from');
  const to = finite(options.to ?? 1, 'spring.to');
  const delay = finite(options.delay ?? 0, 'spring.delay');
  const duration = options.durationInFrames === undefined
    ? undefined
    : positive(options.durationInFrames, 'spring.durationInFrames');
  const naturalDuration = duration !== undefined || options.reverse === true
    ? measureSpring({ config, fps, threshold: options.durationRestThreshold })
    : undefined;
  const reversed = options.reverse === true
    ? (duration ?? naturalDuration) - frame
    : frame;
  const delayed = reversed + (options.reverse === true ? delay : -delay);
  const sampledFrame = duration === undefined
    ? delayed
    : delayed / (duration / naturalDuration);
  if (duration !== undefined && delayed > duration) return to;
  let amount = springCalculation(sampledFrame, fps, config);
  if (config.overshootClamping) amount = to >= from ? Math.min(amount, 1) : Math.max(amount, 1);
  return from + ((to - from) * amount);
}

export function measureSpring(options = {}) {
  const fps = positive(options.fps ?? 30, 'spring.fps');
  const config = springConfig(options.config);
  const threshold = finite(options.threshold ?? 0.005, 'spring.threshold');
  if (threshold < 0 || threshold > 1) {
    throw new RangeError('spring.threshold must stay between zero and one');
  }
  if (threshold === 0) return Infinity;
  if (threshold === 1) return 0;

  let frame = 0;
  let settledAt = 0;
  while (Math.abs(springCalculation(frame, fps, config) - 1) >= threshold) frame += 1;
  settledAt = frame;
  for (let held = 0; held < 20; held += 1) {
    frame += 1;
    if (Math.abs(springCalculation(frame, fps, config) - 1) >= threshold) {
      held = 0;
      settledAt = frame + 1;
    }
  }
  return settledAt;
}

/** Stable frame noise in [-1, 1], suitable for authored jitter without mutable random state. */
export function frameNoise(frame, seed = 0) {
  const sample = Math.sin(
    (finite(frame, 'noise.frame') * 78.233) + (finite(seed, 'noise.seed') * 12.9898),
  ) * 43_758.5453;
  return ((sample - Math.floor(sample)) * 2) - 1;
}

export function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

export function positive(value, name) {
  const number = finite(value, name);
  if (number <= 0) throw new RangeError(`${name} must be greater than zero`);
  return number;
}

function numericRange(value, name) {
  if (!Array.isArray(value) || value.length < 2) {
    throw new TypeError(`${name} must contain at least two finite numbers`);
  }
  value.forEach((entry, index) => finite(entry, `${name}.${index}`));
}

function segmentIndex(input, range) {
  for (let index = 1; index < range.length - 1; index += 1) {
    if (range[index] >= input) return index - 1;
  }
  return range.length - 2;
}

function extrapolate(value, min, max, mode) {
  if (mode === 'identity' || mode === 'extend') return value;
  if (mode === 'clamp') return Math.min(max, Math.max(min, value));
  if (mode === 'wrap') {
    const span = max - min;
    return ((((value - min) % span) + span) % span) + min;
  }
  throw new TypeError('extrapolation must be extend, clamp, identity, or wrap');
}

function requireEasing(value) {
  if (typeof value !== 'function') throw new TypeError('easing must be a function');
}

function bezierCoordinate(parameter, first, second) {
  const a = 1 - (3 * second) + (3 * first);
  const b = (3 * second) - (6 * first);
  const c = 3 * first;
  return (((a * parameter) + b) * parameter + c) * parameter;
}

function bezierSlope(parameter, first, second) {
  const a = 1 - (3 * second) + (3 * first);
  const b = (3 * second) - (6 * first);
  const c = 3 * first;
  return (3 * a * parameter * parameter) + (2 * b * parameter) + c;
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

function springConfig(value = {}) {
  const damping = positive(value.damping ?? 10, 'spring.damping');
  const mass = positive(value.mass ?? 1, 'spring.mass');
  const stiffness = positive(value.stiffness ?? 100, 'spring.stiffness');
  return {
    damping,
    mass,
    overshootClamping: value.overshootClamping === true,
    stiffness,
  };
}

function springCalculation(frame, fps, config) {
  let current = 0;
  let velocity = 0;
  let lastTime = 0;
  const clamped = Math.max(0, frame);
  const remainder = clamped % 1;
  for (let index = 0; index <= Math.floor(clamped); index += 1) {
    const sample = index === Math.floor(clamped) ? index + remainder : index;
    const now = (sample / fps) * 1000;
    const delta = Math.min(now - lastTime, 64) / 1000;
    const displacement = 1 - current;
    const initialVelocity = -velocity;
    const ratio = config.damping / (2 * Math.sqrt(config.stiffness * config.mass));
    const frequency = Math.sqrt(config.stiffness / config.mass);
    const dampedFrequency = frequency * Math.sqrt(1 - (ratio ** 2));
    const envelope = Math.exp(-ratio * frequency * delta);
    const sine = Math.sin(dampedFrequency * delta);
    const cosine = Math.cos(dampedFrequency * delta);
    const underFragment = envelope * (
      sine * ((initialVelocity + (ratio * frequency * displacement)) / dampedFrequency)
      + (displacement * cosine)
    );
    const underPosition = 1 - underFragment;
    const underVelocity = (ratio * frequency * underFragment) - (envelope * (
      cosine * (initialVelocity + (ratio * frequency * displacement))
      - (dampedFrequency * displacement * sine)
    ));
    const criticalEnvelope = Math.exp(-frequency * delta);
    const criticalPosition = 1 - (criticalEnvelope * (
      displacement + ((initialVelocity + (frequency * displacement)) * delta)
    ));
    const criticalVelocity = criticalEnvelope * (
      initialVelocity * ((delta * frequency) - 1)
      + (delta * displacement * frequency * frequency)
    );
    current = ratio < 1 ? underPosition : criticalPosition;
    velocity = ratio < 1 ? underVelocity : criticalVelocity;
    lastTime = now;
  }
  return current;
}
