const EASINGS = Object.freeze({
  linear: (value) => value,
  'ease-in': (value) => value * value,
  'ease-out': (value) => 1 - ((1 - value) ** 2),
  'ease-in-out': (value) => (value < 0.5
    ? 2 * value * value
    : 1 - (((-2 * value) + 2) ** 2) / 2),
});

class Signal {
  at(_context) {
    throw new Error('Signal.at() is abstract');
  }
}

export class Tween extends Signal {
  static kind = 'signal.tween';

  constructor({ from, to, start = 0, end = 30, easing = 'linear' }) {
    super();
    this.from = immutableValue(from);
    this.to = immutableValue(to);
    assertMatchingShape(this.from, this.to);
    this.start = finite(start, 'start');
    this.end = finite(end, 'end');
    if (this.end < this.start) throw new RangeError('end must not be before start');
    this.easing = easingName(easing);
    Object.freeze(this);
  }

  at(context) {
    const frame = absoluteFrame(context);
    if (this.end === this.start) return frame < this.start ? this.from : this.to;
    const progress = clamp((frame - this.start) / (this.end - this.start), 0, 1);
    return immutableValue(interpolate(this.from, this.to, EASINGS[this.easing](progress)));
  }
}

export class Keyframes extends Signal {
  static kind = 'signal.keyframes';

  constructor(points, { easing = 'linear' } = {}) {
    super();
    if (!Array.isArray(points) || points.length < 2) {
      throw new TypeError('Keyframes requires at least two points');
    }
    this.easing = easingName(easing);
    this.points = Object.freeze(points.map((point, index) => {
      if (!isPlainRecord(point) || !Object.hasOwn(point, 'frame') || !Object.hasOwn(point, 'value')) {
        throw new TypeError(`Keyframe ${index} requires frame and value data`);
      }
      const extra = Object.keys(point).find((key) => !['frame', 'value'].includes(key));
      if (extra) throw new TypeError(`Keyframe ${index} has unsupported field ${extra}`);
      return Object.freeze({
        frame: finite(point.frame, 'frame'),
        value: immutableValue(point.value),
      });
    }).sort((left, right) => left.frame - right.frame));
    for (let index = 1; index < this.points.length; index += 1) {
      if (this.points[index - 1].frame === this.points[index].frame) {
        throw new TypeError('Keyframe frames must be unique');
      }
      assertMatchingShape(this.points[index - 1].value, this.points[index].value);
    }
    Object.freeze(this);
  }

  at(context) {
    const frame = absoluteFrame(context);
    const first = this.points[0];
    const last = this.points.at(-1);
    if (frame <= first.frame) return first.value;
    if (frame >= last.frame) return last.value;
    const rightIndex = this.points.findIndex((point) => point.frame >= frame);
    const left = this.points[rightIndex - 1];
    const right = this.points[rightIndex];
    const progress = (frame - left.frame) / (right.frame - left.frame);
    return immutableValue(interpolate(left.value, right.value, EASINGS[this.easing](progress)));
  }
}

export class Spring extends Signal {
  static kind = 'signal.spring';

  constructor({ from = 0, to = 1, start = 0, damping = 12, frequency = 0.16 } = {}) {
    super();
    this.from = finite(from, 'from');
    this.to = finite(to, 'to');
    this.start = finite(start, 'start');
    this.damping = positive(damping, 'damping');
    this.frequency = positive(frequency, 'frequency');
    Object.freeze(this);
  }

  at(context) {
    const elapsed = Math.max(0, absoluteFrame(context) - this.start);
    const decay = Math.exp(-elapsed / this.damping);
    const response = 1 - (decay * Math.cos(elapsed * this.frequency));
    return this.from + ((this.to - this.from) * response);
  }
}

export class Oscillation extends Signal {
  static kind = 'signal.oscillation';

  constructor({ center = 0, amplitude = 1, period = 60, phase = 0 } = {}) {
    super();
    this.center = finite(center, 'center');
    this.amplitude = finite(amplitude, 'amplitude');
    this.period = positive(period, 'period');
    this.phase = finite(phase, 'phase');
    Object.freeze(this);
  }

  at(context) {
    return this.center + (this.amplitude * Math.sin(
      ((absoluteFrame(context) + this.phase) / this.period) * Math.PI * 2,
    ));
  }
}

export function sample(value, context = {}) {
  if (value instanceof Signal) return value.at(frameContext(context));
  if (typeof value === 'function'
      || (value && typeof value === 'object' && !Array.isArray(value) && typeof value.at === 'function')) {
    throw new TypeError('Animation config must be plain data or a built-in Signal');
  }
  return immutableValue(value);
}

export function isSignal(value) {
  return value instanceof Signal;
}

export function frameContext(input = {}) {
  const source = typeof input === 'number' ? { frame: input } : input;
  if (!isPlainRecord(source)) throw new TypeError('frame context must be plain data');
  const context = {
    ...immutableValue(source),
    frame: absoluteFrame(source),
    fps: finite(source.fps ?? 60, 'fps'),
    width: finite(source.width ?? 0, 'width'),
    height: finite(source.height ?? 0, 'height'),
    durationInFrames: finite(source.durationInFrames ?? 0, 'durationInFrames'),
  };
  if (context.fps <= 0) throw new RangeError('fps must be positive');
  return immutableValue(context);
}

export function absoluteFrame(input = 0) {
  const value = typeof input === 'object' && input !== null ? input.frame : input;
  return finite(value ?? 0, 'frame');
}

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function interpolate(from, to, progress) {
  if (typeof from === 'number' && typeof to === 'number') {
    return from + ((to - from) * progress);
  }
  if (isNumericRecord(from) && isNumericRecord(to)) {
    return Object.fromEntries(Object.keys(from).map((key) => [
      key,
      interpolate(from[key], to[key], progress),
    ]));
  }
  throw new TypeError('Animation endpoints must have matching numeric shapes');
}

export function immutableValue(value) {
  if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)) {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Values must be finite');
    return value;
  }
  if (Array.isArray(value)) return Object.freeze(value.map(immutableValue));
  if (isPlainRecord(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, immutableValue(nested)]),
    ));
  }
  throw new TypeError('Values must be plain serializable data');
}

export function isSignalValue(value) {
  if (isSignal(value)) return true;
  try {
    immutableValue(value);
    return true;
  } catch {
    return false;
  }
}

function assertMatchingShape(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return;
  if (isNumericRecord(left) && isNumericRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.hasOwn(right, key))) return;
  }
  throw new TypeError('Animation endpoints must have matching numeric shapes');
}

function isNumericRecord(value) {
  return isPlainRecord(value) && Object.values(value).every((nested) => typeof nested === 'number');
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function easingName(value) {
  if (typeof value !== 'string' || !Object.hasOwn(EASINGS, value)) {
    throw new TypeError(`Unknown easing: ${String(value)}`);
  }
  return value;
}

function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

function positive(value, name) {
  const number = finite(value, name);
  if (number <= 0) throw new RangeError(`${name} must be positive`);
  return number;
}
