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

const CONTEXT_FIELDS = new Set([
  'frame',
  'fps',
  'width',
  'height',
  'durationInFrames',
]);
const COMPUTE_ARITY = Object.freeze({
  add: 2,
  subtract: 2,
  multiply: 2,
  divide: 2,
  round: 1,
  max: -1,
});
const EXTRAPOLATION = new Set(['clamp', 'extend']);

/** A renderer-neutral, whitelisted read from the immutable frame context. */
export class ContextValue extends Signal {
  static kind = 'signal.context-value';

  constructor(field) {
    super();
    if (!CONTEXT_FIELDS.has(field)) throw new TypeError(`Unknown frame context field: ${String(field)}`);
    this.field = field;
    Object.freeze(this);
  }

  at(context) {
    return frameContext(context)[this.field];
  }
}

/**
 * Small arithmetic expression node. It is deliberately data-only: the
 * operator is selected from a closed table and operands cannot be callbacks.
 */
export class Computed extends Signal {
  static kind = 'signal.computed';

  constructor(operator, operands) {
    super();
    if (!Object.hasOwn(COMPUTE_ARITY, operator)) {
      throw new TypeError(`Unknown signal computation: ${String(operator)}`);
    }
    if (!Array.isArray(operands)) throw new TypeError('Computed operands must be an array');
    const arity = COMPUTE_ARITY[operator];
    if ((arity >= 0 && operands.length !== arity) || (arity < 0 && operands.length < 1)) {
      throw new TypeError(`Computed ${operator} has invalid arity`);
    }
    this.operator = operator;
    this.operands = Object.freeze(operands.map((value) => signalValue(value, 'computed operand')));
    Object.freeze(this);
  }

  at(context) {
    const values = this.operands.map((value) => numericSample(value, context, 'computed operand'));
    let output;
    if (this.operator === 'add') output = values[0] + values[1];
    else if (this.operator === 'subtract') output = values[0] - values[1];
    else if (this.operator === 'multiply') output = values[0] * values[1];
    else if (this.operator === 'divide') output = values[0] / values[1];
    else if (this.operator === 'round') output = Math.round(values[0]);
    else output = Math.max(...values);
    if (!Number.isFinite(output)) throw new RangeError(`Computed ${this.operator} produced a non-finite value`);
    return output;
  }
}

/** Build a sampled plain record, for example the x/y value of Translate. */
export class RecordValue extends Signal {
  static kind = 'signal.record-value';

  constructor(fields) {
    super();
    const entries = Array.isArray(fields) ? fields : isPlainRecord(fields) ? Object.entries(fields) : null;
    if (!entries || entries.some((entry) => !Array.isArray(entry) || entry.length !== 2
        || typeof entry[0] !== 'string')) {
      throw new TypeError('RecordValue fields must be plain data');
    }
    this.fields = Object.freeze(Object.fromEntries(
      entries.map(([key, value]) => [key, signalValue(value, `record field ${key}`)]),
    ));
    Object.freeze(this);
  }

  at(context) {
    return immutableValue(Object.fromEntries(
      Object.entries(this.fields).map(([key, value]) => [key, sample(value, context)]),
    ));
  }
}

/**
 * Numeric piecewise interpolation with declarative easing. Unlike a callback,
 * its complete executable vocabulary is fixed by this module.
 */
export class Interpolation extends Signal {
  static kind = 'signal.interpolation';

  constructor({
    input,
    inputRange,
    outputRange,
    easing = 'linear',
    extrapolateLeft = 'extend',
    extrapolateRight = 'extend',
  }) {
    super();
    if (!Array.isArray(inputRange) || !Array.isArray(outputRange)
        || inputRange.length < 2 || inputRange.length !== outputRange.length) {
      throw new TypeError('Interpolation requires matching ranges of at least two values');
    }
    if (!EXTRAPOLATION.has(extrapolateLeft) || !EXTRAPOLATION.has(extrapolateRight)) {
      throw new TypeError('Interpolation extrapolation must be clamp or extend');
    }
    this.input = signalValue(input, 'interpolation input');
    this.inputRange = Object.freeze(inputRange.map(
      (value) => signalValue(value, 'interpolation input range'),
    ));
    this.outputRange = Object.freeze(outputRange.map(
      (value) => signalValue(value, 'interpolation output range'),
    ));
    this.easing = normalizeEasing(easing);
    this.extrapolateLeft = extrapolateLeft;
    this.extrapolateRight = extrapolateRight;
    Object.freeze(this);
  }

  at(context) {
    const input = numericSample(this.input, context, 'interpolation input');
    const inputRange = this.inputRange.map(
      (value) => numericSample(value, context, 'interpolation input range'),
    );
    const outputRange = this.outputRange.map(
      (value) => numericSample(value, context, 'interpolation output range'),
    );
    for (let index = 1; index < inputRange.length; index += 1) {
      if (inputRange[index] < inputRange[index - 1]) {
        throw new RangeError('Interpolation input range must be ascending');
      }
    }
    let rightIndex;
    if (input <= inputRange[0]) rightIndex = 1;
    else if (input >= inputRange.at(-1)) rightIndex = inputRange.length - 1;
    else rightIndex = inputRange.findIndex((point) => point >= input);
    const left = inputRange[rightIndex - 1];
    const right = inputRange[rightIndex];
    let progress = right === left ? 1 : (input - left) / (right - left);
    if (input < inputRange[0] && this.extrapolateLeft === 'clamp') progress = 0;
    else if (input > inputRange.at(-1) && this.extrapolateRight === 'clamp') progress = 1;
    const eased = evaluateEasing(this.easing, progress);
    return outputRange[rightIndex - 1]
      + ((outputRange[rightIndex] - outputRange[rightIndex - 1]) * eased);
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

function signalValue(value, name) {
  if (isSignal(value)) return value;
  try {
    return immutableValue(value);
  } catch {
    throw new TypeError(`${name} must be plain data or a built-in Signal`);
  }
}

function numericSample(value, context, name) {
  const output = sample(value, context);
  if (typeof output !== 'number' || !Number.isFinite(output)) {
    throw new TypeError(`${name} must resolve to a finite number`);
  }
  return output;
}

function normalizeEasing(value) {
  if (typeof value === 'string') {
    if (!['linear', 'ease', 'quad', 'cubic'].includes(value)) {
      throw new TypeError(`Unknown interpolation easing: ${String(value)}`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value[0] === 'bezier' && value.length === 5) {
      return normalizeEasing({ name: 'bezier', values: value.slice(1) });
    }
    if (['in', 'out'].includes(value[0]) && value.length === 2) {
      return immutableValue({ name: value[0], easing: normalizeEasing(value[1]) });
    }
    throw new TypeError('Interpolation easing must be a declarative descriptor');
  }
  if (!isPlainRecord(value) || typeof value.name !== 'string') {
    throw new TypeError('Interpolation easing must be a declarative descriptor');
  }
  const allowedFields = value.name === 'in' || value.name === 'out'
    ? ['name', 'easing']
    : value.name === 'bezier' ? ['name', 'values'] : [];
  if (allowedFields.length === 0 || Object.keys(value).some((key) => !allowedFields.includes(key))) {
    throw new TypeError(`Unknown interpolation easing: ${String(value.name)}`);
  }
  if (value.name === 'bezier') {
    if (!Array.isArray(value.values) || value.values.length !== 4
        || value.values.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) {
      throw new TypeError('Bezier easing requires four finite values');
    }
    return immutableValue({ name: value.name, values: value.values });
  }
  return immutableValue({ name: value.name, easing: normalizeEasing(value.easing) });
}

function evaluateEasing(descriptor, value) {
  if (descriptor === 'linear') return value;
  if (descriptor === 'quad') return value * value;
  if (descriptor === 'cubic') return value * value * value;
  if (descriptor === 'ease') return cubicBezier(0.42, 0, 1, 1)(value);
  if (descriptor.name === 'bezier') return cubicBezier(...descriptor.values)(value);
  const nested = evaluateEasing(descriptor.easing, descriptor.name === 'out' ? 1 - value : value);
  return descriptor.name === 'out' ? 1 - nested : nested;
}

function cubicBezier(x1, y1, x2, y2) {
  const point = (a, b, value) => 3 * a * (1 - value) ** 2 * value
    + 3 * b * (1 - value) * value ** 2 + value ** 3;
  return (value) => {
    if (value <= 0 || value >= 1) return value;
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 16; iteration += 1) {
      const middle = (low + high) / 2;
      if (point(x1, x2, middle) < value) low = middle;
      else high = middle;
    }
    return point(y1, y2, (low + high) / 2);
  };
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
