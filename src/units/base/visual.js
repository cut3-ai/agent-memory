import { finite } from '@cut3/agent-memory/core/timeline';

export function frame(options = {}) {
  plain(options, 'frame');
  return {
    x: dimension(options.x ?? 0, 'frame.x'),
    y: dimension(options.y ?? 0, 'frame.y'),
    width: dimension(options.width ?? '100%', 'frame.width'),
    height: dimension(options.height ?? '100%', 'frame.height'),
    z: finite(options.z ?? 0, 'frame.z'),
  };
}

export function paint(options = {}) {
  plain(options, 'paint');
  return {
    color: text(options.color ?? '#ffffff', 'paint.color'),
    fill: text(options.fill ?? 'transparent', 'paint.fill'),
    radius: finite(options.radius ?? 0, 'paint.radius'),
    stroke: text(options.stroke ?? 'transparent', 'paint.stroke'),
    strokeWidth: finite(options.strokeWidth ?? 0, 'paint.strokeWidth'),
  };
}

export function pose(options = {}) {
  plain(options, 'pose');
  return {
    rotate: finite(options.rotate ?? 0, 'pose.rotate'),
    scaleX: finite(options.scaleX ?? options.scale ?? 1, 'pose.scaleX'),
    scaleY: finite(options.scaleY ?? options.scale ?? 1, 'pose.scaleY'),
    skewX: finite(options.skewX ?? 0, 'pose.skewX'),
    x: finite(options.x ?? 0, 'pose.x'),
    y: finite(options.y ?? 0, 'pose.y'),
  };
}

export function effects(options = {}) {
  plain(options, 'effects');
  return {
    blur: finite(options.blur ?? 0, 'effects.blur'),
    brightness: finite(options.brightness ?? 1, 'effects.brightness'),
    contrast: finite(options.contrast ?? 1, 'effects.contrast'),
    saturate: finite(options.saturate ?? 1, 'effects.saturate'),
    shadow: text(options.shadow ?? 'none', 'effects.shadow'),
  };
}

export function typography(options = {}) {
  plain(options, 'typography');
  return {
    align: text(options.align ?? 'left', 'typography.align'),
    family: text(options.family ?? 'Inter, sans-serif', 'typography.family'),
    letterSpacing: finite(options.letterSpacing ?? 0, 'typography.letterSpacing'),
    lineHeight: finite(options.lineHeight ?? 1, 'typography.lineHeight'),
    size: finite(options.size ?? 48, 'typography.size'),
    style: text(options.style ?? 'normal', 'typography.style'),
    transform: text(options.transform ?? 'none', 'typography.transform'),
    weight: finite(options.weight ?? 400, 'typography.weight'),
  };
}

export function visual(options = {}) {
  plain(options, 'visual options');
  return {
    effects: effects(options.effects),
    frame: frame(options.frame),
    opacity: finite(options.opacity ?? 1, 'opacity'),
    overflow: text(options.overflow ?? 'visible', 'overflow'),
    paint: paint(options.paint),
    pose: pose(options.pose),
  };
}

export function dimension(value, name) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length > 0) return value;
  throw new TypeError(`${name} must be a finite number or CSS dimension string`);
}

export function plain(value, name) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${name} must be a plain object`);
  }
  return value;
}

function text(value, name) {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`);
  return value;
}
