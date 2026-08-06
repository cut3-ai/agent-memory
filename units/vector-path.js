import { normalizeVectorPathSegments } from '../core/vector-path.js';
import { Unit } from '../core/Unit.js';
import { addLeafBehaviours } from './shared.js';

const OPTION_KEYS = new Set([
  'fill',
  'nonScalingStroke',
  'roundCaps',
  'roundJoins',
  'stroke',
  'strokeDasharray',
  'strokeWidth',
]);
const PAINT = /^(?:#[a-f0-9]{3,4}|#[a-f0-9]{6}|#[a-f0-9]{8}|currentColor|none)$/iu;

/** Declarative renderer-neutral SVG path primitive; authored style lives above it. */
export class VectorPath extends Unit {
  static kind = 'unit.vector-path';

  constructor(segments, options = {}) {
    super();
    if (!isPlainRecord(options)
        || Object.keys(options).some((key) => !OPTION_KEYS.has(key))) {
      throw new TypeError('VectorPath options contain an unsupported field');
    }
    const path = normalizeVectorPathSegments(segments);
    this.d = path.d;
    this.path = path.segments;
    this.fill = paint(options.fill ?? 'none', 'fill');
    this.stroke = paint(options.stroke ?? 'currentColor', 'stroke');
    this.strokeWidth = positiveFinite(options.strokeWidth ?? 1, 'strokeWidth');
    this.strokeDasharray = dasharray(options.strokeDasharray ?? []);
    this.roundCaps = boolean(options.roundCaps ?? false, 'roundCaps');
    this.roundJoins = boolean(options.roundJoins ?? false, 'roundJoins');
    this.nonScalingStroke = boolean(
      options.nonScalingStroke ?? false,
      'nonScalingStroke',
    );
  }

  add(...members) {
    return addLeafBehaviours(this, members);
  }
}

function paint(value, name) {
  if (typeof value !== 'string' || !PAINT.test(value)) {
    throw new TypeError(`${name} must be a literal SVG paint`);
  }
  return value;
}

function positiveFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number`);
  }
  return value;
}

function dasharray(value) {
  if (!Array.isArray(value) || value.length > 16
      || value.some((entry) => typeof entry !== 'number'
        || !Number.isFinite(entry) || entry < 0)
      || (value.length > 0 && value.every((entry) => entry === 0))) {
    throw new TypeError('strokeDasharray must contain bounded non-negative numbers');
  }
  return Object.freeze([...value]);
}

function boolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be boolean`);
  return value;
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}
