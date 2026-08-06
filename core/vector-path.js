const COMMANDS = Object.freeze({
  move: Object.freeze({ code: 'M', arity: 2 }),
  line: Object.freeze({ code: 'L', arity: 2 }),
  horizontal: Object.freeze({ code: 'H', arity: 1 }),
  vertical: Object.freeze({ code: 'V', arity: 1 }),
  cubic: Object.freeze({ code: 'C', arity: 6 }),
  smoothCubic: Object.freeze({ code: 'S', arity: 4 }),
  quadratic: Object.freeze({ code: 'Q', arity: 4 }),
  smoothQuadratic: Object.freeze({ code: 'T', arity: 2 }),
  arc: Object.freeze({ code: 'A', arity: 7 }),
  close: Object.freeze({ code: 'Z', arity: 0 }),
});

const MAX_SEGMENTS = 512;
const MAX_COORDINATE = 1_000_000;

/**
 * Normalize a closed declarative SVG path grammar.
 *
 * Commands are object keys and every payload is numeric, so saved memory code
 * never needs an executable drawing callback or an opaque path-data string.
 */
export function normalizeVectorPathSegments(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_SEGMENTS) {
    throw new TypeError(`VectorPath requires between 2 and ${MAX_SEGMENTS} segments`);
  }

  let hasDrawingSegment = false;
  let subpathOpen = false;
  const segments = value.map((segment, index) => {
    if (!isPlainRecord(segment) || Object.keys(segment).length !== 1) {
      throw new TypeError(`VectorPath segment ${index} must contain exactly one command`);
    }
    const [name] = Object.keys(segment);
    const definition = COMMANDS[name];
    if (!definition) throw new TypeError(`VectorPath command ${name} is unsupported`);
    if (index === 0 && name !== 'move') {
      throw new TypeError('VectorPath must begin with a move command');
    }
    if (name === 'move') {
      subpathOpen = true;
    } else if (name === 'close') {
      if (segment[name] !== true || !subpathOpen) {
        throw new TypeError('VectorPath close requires an open subpath and literal true');
      }
      subpathOpen = false;
      return Object.freeze({ command: definition.code, values: Object.freeze([]) });
    } else {
      if (!subpathOpen) throw new TypeError('VectorPath drawing command requires an open subpath');
      hasDrawingSegment = true;
    }

    const raw = segment[name];
    if (!Array.isArray(raw) || raw.length !== definition.arity) {
      throw new TypeError(`VectorPath ${name} requires ${definition.arity} numeric values`);
    }
    const values = raw.map((nested, valueIndex) => vectorNumber(nested, name, valueIndex));
    if (name === 'arc') {
      if (values[0] <= 0 || values[1] <= 0 || ![0, 1].includes(values[3])
          || ![0, 1].includes(values[4])) {
        throw new TypeError('VectorPath arc radii must be positive and flags must be 0 or 1');
      }
    }
    return Object.freeze({ command: definition.code, values: Object.freeze(values) });
  });

  if (!hasDrawingSegment) throw new TypeError('VectorPath requires an authored drawing segment');
  const d = segments.map(({ command, values }) => (
    values.length === 0 ? command : `${command} ${values.map(formatNumber).join(' ')}`
  )).join(' ');
  return Object.freeze({
    d,
    segments: Object.freeze(segments),
  });
}

function vectorNumber(value, command, index) {
  if (typeof value !== 'number' || !Number.isFinite(value)
      || Math.abs(value) > MAX_COORDINATE) {
    throw new TypeError(`VectorPath ${command}[${index}] must be a bounded finite number`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function formatNumber(value) {
  return String(value);
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}
