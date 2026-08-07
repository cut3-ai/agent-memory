import { Unit } from '@cut3/agent-memory/core/Unit';
import { finite } from '@cut3/agent-memory/core/timeline';
import { frame, paint, pose } from '@cut3/agent-memory/units/base/visual';

export class VectorPath extends Unit {
  static kind = 'unit.vector-path';

  constructor(segments, options = {}) {
    super();
    const drawStart = finite(options.draw?.start ?? 0, 'path.draw.start');
    const drawEnd = finite(options.draw?.end ?? 1, 'path.draw.end');
    if (drawStart < 0 || drawEnd > 1 || drawEnd < drawStart) {
      throw new RangeError('VectorPath draw interval must satisfy 0 <= start <= end <= 1');
    }
    this.frame = frame(options.frame);
    this.paint = paint(options.paint);
    this.pose = pose(options.pose);
    this.opacity = finite(options.opacity ?? 1, 'path.opacity');
    this.draw = {
      start: drawStart,
      end: drawEnd,
    };
    this.segments = normalizeSegments(segments);
    this.viewBox = normalizeViewBox(options.viewBox ?? [0, 0, 100, 100]);
  }
}

export function vectorPathData(segments) {
  return normalizeSegments(segments).map((segment) => {
    switch (segment.command) {
      case 'move': return `M ${segment.x} ${segment.y}`;
      case 'line': return `L ${segment.x} ${segment.y}`;
      case 'cubic': return `C ${segment.x1} ${segment.y1} ${segment.x2} ${segment.y2} ${segment.x} ${segment.y}`;
      case 'quadratic': return `Q ${segment.x1} ${segment.y1} ${segment.x} ${segment.y}`;
      case 'close': return 'Z';
      default: throw new TypeError(`Unknown path command ${segment.command}`);
    }
  }).join(' ');
}

function normalizeSegments(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('VectorPath requires numeric segments');
  }
  return value.map((segment, index) => {
    if (!segment || typeof segment !== 'object' || Array.isArray(segment)) {
      throw new TypeError(`segment ${index} must be plain data`);
    }
    const command = String(segment.command ?? '');
    const fields = commandFields(command);
    const unsupported = Object.keys(segment).find((key) => key !== 'command' && !fields.includes(key));
    if (unsupported) throw new TypeError(`segment ${index} has unsupported field ${unsupported}`);
    return Object.freeze({
      command,
      ...Object.fromEntries(fields.map((key) => [key, finite(segment[key], `segment ${index}.${key}`)])),
    });
  });
}

function commandFields(command) {
  if (command === 'move' || command === 'line') return ['x', 'y'];
  if (command === 'quadratic') return ['x1', 'y1', 'x', 'y'];
  if (command === 'cubic') return ['x1', 'y1', 'x2', 'y2', 'x', 'y'];
  if (command === 'close') return [];
  throw new TypeError(`Unsupported vector command ${command}`);
}

function normalizeViewBox(value) {
  if (!Array.isArray(value) || value.length !== 4) throw new TypeError('viewBox must have four numbers');
  return value.map((entry, index) => finite(entry, `viewBox.${index}`));
}
