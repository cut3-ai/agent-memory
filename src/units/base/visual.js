import { finite, positive } from '@cut3/agent-memory/core/timeline';

const ALIGNMENTS = Object.freeze(['start', 'center', 'end', 'stretch', 'baseline']);
const BACKFACE_VISIBILITIES = Object.freeze(['visible', 'hidden']);
const BOX_SIZINGS = Object.freeze(['border-box', 'content-box']);
const BLEND_MODES = Object.freeze([
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference',
  'exclusion', 'hue', 'saturation', 'color', 'luminosity',
]);
const BORDER_STYLES = Object.freeze(['none', 'solid', 'dashed', 'dotted', 'double']);
const FRAME_POSITIONS = Object.freeze(['absolute', 'relative', 'static']);
const ISOLATIONS = Object.freeze(['auto', 'isolate']);
const JUSTIFICATIONS = Object.freeze([
  'start', 'center', 'end', 'stretch', 'space-between', 'space-around', 'space-evenly',
]);
const OVERFLOW_WRAPS = Object.freeze(['normal', 'break-word', 'anywhere']);
const TEXT_OVERFLOWS = Object.freeze(['clip', 'ellipsis']);
const TRANSFORM_STYLES = Object.freeze(['flat', 'preserve-3d']);
const WHITE_SPACES = Object.freeze([
  'normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces',
]);
const WORD_BREAKS = Object.freeze(['normal', 'break-all', 'keep-all', 'break-word']);
const PAINT_ORDER_COMPONENTS = Object.freeze(['fill', 'stroke', 'markers']);
const INLINE_DISPLAYS = Object.freeze(['inline', 'inline-block']);
const INLINE_VERTICAL_ALIGNMENTS = Object.freeze([
  'baseline', 'sub', 'super', 'text-top', 'text-bottom', 'middle', 'top', 'bottom',
]);

export function frame(options = {}) {
  plain(options, 'frame');
  if (options.x !== undefined && options.left !== undefined) {
    throw new TypeError('frame accepts x or left, not both');
  }
  if (options.y !== undefined && options.top !== undefined) {
    throw new TypeError('frame accepts y or top, not both');
  }
  const horizontalEnd = options.right !== undefined;
  const verticalEnd = options.bottom !== undefined;
  return {
    boxSizing: choice(options.boxSizing ?? 'border-box', BOX_SIZINGS, 'frame.boxSizing'),
    x: optionalDimension(options.x ?? options.left, horizontalEnd ? undefined : 0, 'frame.x'),
    y: optionalDimension(options.y ?? options.top, verticalEnd ? undefined : 0, 'frame.y'),
    right: optionalDimension(options.right, undefined, 'frame.right'),
    bottom: optionalDimension(options.bottom, undefined, 'frame.bottom'),
    width: optionalDimension(
      options.width,
      horizontalEnd && (options.x !== undefined || options.left !== undefined) ? undefined : '100%',
      'frame.width',
    ),
    height: optionalDimension(
      options.height,
      verticalEnd && (options.y !== undefined || options.top !== undefined) ? undefined : '100%',
      'frame.height',
    ),
    minWidth: optionalDimension(options.minWidth, undefined, 'frame.minWidth'),
    maxWidth: optionalDimension(options.maxWidth, undefined, 'frame.maxWidth'),
    minHeight: optionalDimension(options.minHeight, undefined, 'frame.minHeight'),
    maxHeight: optionalDimension(options.maxHeight, undefined, 'frame.maxHeight'),
    aspectRatio: optionalPositive(options.aspectRatio, 'frame.aspectRatio'),
    position: choice(options.position ?? 'absolute', FRAME_POSITIONS, 'frame.position'),
    z: options.z === undefined || options.z === 'auto'
      ? 'auto'
      : finite(options.z, 'frame.z'),
  };
}

export function paint(options = {}) {
  plain(options, 'paint');
  exactKeys(
    options,
    ['color', 'fill', 'radius', 'stroke', 'strokeWidth', 'backgrounds', 'border', 'outline'],
    'paint',
  );
  return {
    color: text(options.color ?? '#ffffff', 'paint.color'),
    fill: text(options.fill ?? 'transparent', 'paint.fill'),
    radius: finite(options.radius ?? 0, 'paint.radius'),
    stroke: text(options.stroke ?? 'transparent', 'paint.stroke'),
    strokeWidth: finite(options.strokeWidth ?? 0, 'paint.strokeWidth'),
    backgrounds: backgrounds(options.backgrounds),
    border: options.border == null ? null : structuredBorder(options.border),
    ...(options.outline == null ? {} : { outline: structuredOutline(options.outline) }),
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
    operations: transformOperations(options.operations),
    origin: options.origin == null ? null : point3(options.origin, 'pose.origin'),
    perspective: optionalPositive(options.perspective, 'pose.perspective'),
    perspectiveOrigin: options.perspectiveOrigin == null
      ? null
      : point2Dimensions(options.perspectiveOrigin, 'pose.perspectiveOrigin'),
    transformStyle: choice(
      options.transformStyle ?? 'flat',
      TRANSFORM_STYLES,
      'pose.transformStyle',
    ),
    backfaceVisibility: choice(
      options.backfaceVisibility ?? 'visible',
      BACKFACE_VISIBILITIES,
      'pose.backfaceVisibility',
    ),
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
    filters: filters(options.filters, 'effects.filters'),
    backdropFilters: filters(options.backdropFilters, 'effects.backdropFilters'),
    boxShadows: shadows(options.boxShadows, true, 'effects.boxShadows'),
    blendMode: choice(options.blendMode ?? 'normal', BLEND_MODES, 'effects.blendMode'),
    isolation: choice(options.isolation ?? 'auto', ISOLATIONS, 'effects.isolation'),
  };
}

export function typography(options = {}) {
  plain(options, 'typography');
  return {
    align: text(options.align ?? 'left', 'typography.align'),
    family: text(options.family ?? 'Inter, sans-serif', 'typography.family'),
    letterSpacing: finite(options.letterSpacing ?? 0, 'typography.letterSpacing'),
    lineHeight: textLineHeight(options.lineHeight ?? 1),
    fill: textGradient(options.fill),
    paintOrder: textPaintOrder(options.paintOrder),
    size: finite(options.size ?? 48, 'typography.size'),
    style: text(options.style ?? 'normal', 'typography.style'),
    transform: text(options.transform ?? 'none', 'typography.transform'),
    weight: finite(options.weight ?? 400, 'typography.weight'),
    stroke: options.stroke == null ? null : textStroke(options.stroke),
    shadows: shadows(options.shadows, false, 'typography.shadows'),
    wrap: textWrap(options.wrap),
  };
}

function textGradient(value) {
  if (value == null) return null;
  plain(value, 'typography.fill');
  const gradient = background(value, 'typography.fill');
  if (!['linear-gradient', 'radial-gradient', 'conic-gradient'].includes(gradient.kind)) {
    throw new TypeError('typography.fill must be a structured gradient');
  }
  if (gradient.blendMode !== 'normal') {
    throw new TypeError('typography.fill does not support blend modes');
  }
  return gradient;
}

export function layout(options = {}) {
  plain(options, 'layout');
  const mode = choice(options.mode ?? 'flex', ['flex', 'grid'], 'layout.mode');
  return {
    mode,
    direction: choice(options.direction ?? 'row', ['row', 'row-reverse', 'column', 'column-reverse'], 'layout.direction'),
    wrap: choice(options.wrap ?? 'nowrap', ['nowrap', 'wrap', 'wrap-reverse'], 'layout.wrap'),
    align: choice(options.align ?? 'stretch', ALIGNMENTS, 'layout.align'),
    justify: choice(options.justify ?? 'start', JUSTIFICATIONS, 'layout.justify'),
    gap: spacing(options.gap, 'layout.gap'),
    padding: edges(options.padding, 'layout.padding'),
    columns: gridTracks(options.columns, 'layout.columns'),
    rows: gridTracks(options.rows, 'layout.rows'),
  };
}

export function layoutItem(options) {
  if (options == null) return null;
  plain(options, 'layoutItem');
  return {
    grow: nonNegative(options.grow ?? 0, 'layoutItem.grow'),
    shrink: nonNegative(options.shrink ?? 1, 'layoutItem.shrink'),
    basis: optionalDimension(options.basis, 'auto', 'layoutItem.basis'),
    order: integer(options.order ?? 0, 'layoutItem.order'),
    align: choice(options.align ?? 'auto', ['auto', ...ALIGNMENTS], 'layoutItem.align'),
    column: gridPlacement(options.column, 'layoutItem.column'),
    row: gridPlacement(options.row, 'layoutItem.row'),
  };
}

export function textInline(options) {
  if (options == null) return null;
  plain(options, 'inline');
  exactKeys(options, ['display', 'marginStart', 'verticalAlign'], 'inline');
  return {
    display: choice(
      options.display === undefined ? 'inline' : options.display,
      INLINE_DISPLAYS,
      'inline.display',
    ),
    marginStart: dimension(
      options.marginStart === undefined ? 0 : options.marginStart,
      'inline.marginStart',
    ),
    verticalAlign: inlineVerticalAlign(
      options.verticalAlign === undefined ? 'baseline' : options.verticalAlign,
    ),
  };
}

export function visual(options = {}) {
  plain(options, 'visual options');
  if (Object.hasOwn(options, 'style') || Object.hasOwn(options, 'css')) {
    throw new TypeError('raw style or CSS bags are not supported');
  }
  return {
    effects: effects(options.effects),
    frame: frame(options.frame),
    layoutItem: layoutItem(options.layoutItem),
    opacity: finite(options.opacity ?? 1, 'opacity'),
    present: presence(options.present),
    overflow: text(options.overflow ?? 'visible', 'overflow'),
    paint: paint(options.paint),
    pose: pose(options.pose),
  };
}

export function presence(value = true) {
  return strictBoolean(value, 'present');
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

function backgrounds(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError('paint.backgrounds must be an array');
  return value.map((entry, index) => background(entry, `paint.backgrounds[${index}]`));
}

function background(value, name) {
  plain(value, name);
  const kind = choice(
    value.kind,
    ['solid', 'linear-gradient', 'radial-gradient', 'conic-gradient', 'image'],
    `${name}.kind`,
  );
  if (kind === 'solid') {
    exactKeys(value, ['kind', 'color', 'blendMode'], name);
    return {
      kind,
      color: text(value.color, `${name}.color`),
      blendMode: choice(value.blendMode ?? 'normal', BLEND_MODES, `${name}.blendMode`),
    };
  }
  if (kind === 'image') {
    exactKeys(value, ['kind', 'source', 'fit', 'position', 'repeat', 'blendMode'], name);
    return {
      kind,
      source: text(value.source, `${name}.source`),
      fit: choice(value.fit ?? 'cover', ['cover', 'contain', 'auto', 'stretch'], `${name}.fit`),
      position: point2Dimensions(value.position ?? {}, `${name}.position`, '50%'),
      repeat: choice(value.repeat ?? 'no-repeat', ['no-repeat', 'repeat', 'repeat-x', 'repeat-y'], `${name}.repeat`),
      blendMode: choice(value.blendMode ?? 'normal', BLEND_MODES, `${name}.blendMode`),
    };
  }
  const common = {
    kind,
    stops: gradientStops(value.stops, `${name}.stops`),
    blendMode: choice(value.blendMode ?? 'normal', BLEND_MODES, `${name}.blendMode`),
  };
  if (kind === 'linear-gradient') {
    exactKeys(value, ['kind', 'angle', 'stops', 'blendMode', 'repeating', 'tile'], name);
    const repeating = strictBoolean(
      value.repeating === undefined ? false : value.repeating,
      `${name}.repeating`,
    );
    const tile = gradientTile(value.tile, `${name}.tile`);
    return {
      ...common,
      angle: finite(value.angle ?? 0, `${name}.angle`),
      ...(value.repeating === undefined ? {} : { repeating }),
      ...(tile === null ? {} : { tile }),
    };
  }
  if (kind === 'radial-gradient') {
    exactKeys(
      value,
      ['kind', 'shape', 'position', 'stops', 'blendMode', 'repeating', 'tile'],
      name,
    );
    const repeating = strictBoolean(
      value.repeating === undefined ? false : value.repeating,
      `${name}.repeating`,
    );
    const tile = gradientTile(value.tile, `${name}.tile`);
    return {
      ...common,
      shape: choice(value.shape ?? 'ellipse', ['circle', 'ellipse'], `${name}.shape`),
      position: point2Dimensions(value.position ?? {}, `${name}.position`, '50%'),
      ...(value.repeating === undefined ? {} : { repeating }),
      ...(tile === null ? {} : { tile }),
    };
  }
  exactKeys(value, ['kind', 'angle', 'position', 'stops', 'blendMode'], name);
  return {
    ...common,
    angle: finite(value.angle ?? 0, `${name}.angle`),
    position: point2Dimensions(value.position ?? {}, `${name}.position`, '50%'),
  };
}

function gradientStops(value, name) {
  if (!Array.isArray(value) || value.length < 2) {
    throw new TypeError(`${name} must contain at least two stops`);
  }
  let previous = -Infinity;
  let domain;
  return value.map((entry, index) => {
    plain(entry, `${name}[${index}]`);
    exactKeys(entry, ['offset', 'color', 'unit'], `${name}[${index}]`);
    const offset = finite(entry.offset, `${name}[${index}].offset`);
    const unit = choice(
      entry.unit === undefined ? 'normalized' : entry.unit,
      ['normalized', 'px'],
      `${name}[${index}].unit`,
    );
    domain ??= unit;
    if (unit !== domain) throw new TypeError(`${name} must use one offset unit`);
    if (offset < 0 || (unit === 'normalized' && offset > 1) || offset < previous) {
      throw new RangeError(
        unit === 'normalized'
          ? `${name} offsets must be ordered in [0, 1]`
          : `${name} pixel offsets must be non-negative and ordered`,
      );
    }
    previous = offset;
    return {
      offset,
      color: text(entry.color, `${name}[${index}].color`),
      ...(unit === 'px' ? { unit } : {}),
    };
  });
}

function gradientTile(value, name) {
  if (value == null) return null;
  plain(value, name);
  exactKeys(value, ['repeat', 'size', 'position'], name);
  plain(value.size, `${name}.size`);
  exactKeys(value.size, ['width', 'height'], `${name}.size`);
  return {
    repeat: choice(
      value.repeat === undefined ? 'repeat' : value.repeat,
      ['no-repeat', 'repeat', 'repeat-x', 'repeat-y'],
      `${name}.repeat`,
    ),
    size: {
      width: dimension(value.size.width, `${name}.size.width`),
      height: dimension(value.size.height, `${name}.size.height`),
    },
    position: point2Dimensions(value.position ?? {}, `${name}.position`, 0),
  };
}

function structuredBorder(value) {
  plain(value, 'paint.border');
  exactKeys(value, ['all', 'top', 'right', 'bottom', 'left', 'radii'], 'paint.border');
  const all = borderSide(value.all ?? {}, 'paint.border.all');
  return {
    top: borderSide(value.top ?? all, 'paint.border.top'),
    right: borderSide(value.right ?? all, 'paint.border.right'),
    bottom: borderSide(value.bottom ?? all, 'paint.border.bottom'),
    left: borderSide(value.left ?? all, 'paint.border.left'),
    radii: borderRadii(value.radii),
  };
}

function structuredOutline(value) {
  plain(value, 'paint.outline');
  exactKeys(value, ['width', 'style', 'color', 'offset'], 'paint.outline');
  return {
    width: nonNegative(value.width ?? 0, 'paint.outline.width'),
    style: choice(value.style ?? 'solid', BORDER_STYLES, 'paint.outline.style'),
    color: text(value.color ?? 'transparent', 'paint.outline.color'),
    offset: finite(value.offset ?? 0, 'paint.outline.offset'),
  };
}

function borderSide(value, name) {
  plain(value, name);
  exactKeys(value, ['width', 'style', 'color'], name);
  return {
    width: nonNegative(value.width ?? 0, `${name}.width`),
    style: choice(value.style ?? 'solid', BORDER_STYLES, `${name}.style`),
    color: text(value.color ?? 'transparent', `${name}.color`),
  };
}

function borderRadii(value = {}) {
  plain(value, 'paint.border.radii');
  exactKeys(value, ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'], 'paint.border.radii');
  return {
    topLeft: nonNegative(value.topLeft ?? 0, 'paint.border.radii.topLeft'),
    topRight: nonNegative(value.topRight ?? 0, 'paint.border.radii.topRight'),
    bottomRight: nonNegative(value.bottomRight ?? 0, 'paint.border.radii.bottomRight'),
    bottomLeft: nonNegative(value.bottomLeft ?? 0, 'paint.border.radii.bottomLeft'),
  };
}

function transformOperations(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError('pose.operations must be an array');
  return value.map((entry, index) => transformOperation(entry, `pose.operations[${index}]`));
}

function transformOperation(value, name) {
  plain(value, name);
  const kind = choice(
    value.kind,
    [
      'translate', 'translate-2d', 'translate-x', 'translate-y', 'translate-z',
      'rotate-x', 'rotate-y', 'rotate-z', 'rotate-3d',
      'scale', 'scale-2d', 'skew', 'perspective',
    ],
    `${name}.kind`,
  );
  if (kind === 'translate-2d') {
    exactKeys(value, ['kind', 'x', 'y'], name);
    return {
      kind,
      x: dimension(value.x ?? 0, `${name}.x`),
      y: dimension(value.y ?? 0, `${name}.y`),
    };
  }
  if (kind === 'translate-x' || kind === 'translate-y' || kind === 'translate-z') {
    exactKeys(value, ['kind', 'value'], name);
    return {
      kind,
      value: dimension(value.value === undefined ? 0 : value.value, `${name}.value`),
    };
  }
  if (kind === 'translate') {
    exactKeys(value, ['kind', 'x', 'y', 'z'], name);
    return {
      kind,
      x: dimension(value.x ?? 0, `${name}.x`),
      y: dimension(value.y ?? 0, `${name}.y`),
      z: finite(value.z ?? 0, `${name}.z`),
    };
  }
  if (kind === 'scale') {
    exactKeys(value, ['kind', 'x', 'y', 'z'], name);
    return { kind, x: finite(value.x ?? 1, `${name}.x`), y: finite(value.y ?? 1, `${name}.y`), z: finite(value.z ?? 1, `${name}.z`) };
  }
  if (kind === 'scale-2d') {
    exactKeys(value, ['kind', 'x', 'y'], name);
    return {
      kind,
      x: finite(value.x ?? 1, `${name}.x`),
      y: finite(value.y ?? value.x ?? 1, `${name}.y`),
    };
  }
  if (kind === 'skew') {
    exactKeys(value, ['kind', 'x', 'y'], name);
    return { kind, x: finite(value.x ?? 0, `${name}.x`), y: finite(value.y ?? 0, `${name}.y`) };
  }
  if (kind === 'perspective') {
    exactKeys(value, ['kind', 'depth'], name);
    return { kind, depth: positive(value.depth, `${name}.depth`) };
  }
  if (kind === 'rotate-3d') {
    exactKeys(value, ['kind', 'x', 'y', 'z', 'degrees'], name);
    const axis = [value.x, value.y, value.z].map((entry, axisIndex) => finite(entry, `${name}.axis[${axisIndex}]`));
    if (axis.every((entry) => entry === 0)) throw new RangeError(`${name} axis must be non-zero`);
    return { kind, x: axis[0], y: axis[1], z: axis[2], degrees: finite(value.degrees, `${name}.degrees`) };
  }
  exactKeys(value, ['kind', 'degrees'], name);
  return { kind, degrees: finite(value.degrees, `${name}.degrees`) };
}

function filters(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return value.map((entry, index) => filter(entry, `${name}[${index}]`));
}

function filter(value, name) {
  plain(value, name);
  const kind = choice(
    value.kind,
    [
      'blur', 'brightness', 'contrast', 'saturate', 'hue-rotate', 'grayscale',
      'sepia', 'invert', 'opacity', 'drop-shadow', 'svg-filter-ref',
    ],
    `${name}.kind`,
  );
  if (kind === 'svg-filter-ref') {
    exactKeys(value, ['kind', 'id'], name);
    return { kind, id: localIdentifier(value.id, `${name}.id`) };
  }
  if (kind === 'hue-rotate') {
    exactKeys(value, ['kind', 'degrees'], name);
    return { kind, degrees: finite(value.degrees, `${name}.degrees`) };
  }
  if (kind === 'drop-shadow') {
    exactKeys(value, ['kind', 'x', 'y', 'blur', 'color'], name);
    return {
      kind,
      x: finite(value.x ?? 0, `${name}.x`),
      y: finite(value.y ?? 0, `${name}.y`),
      blur: nonNegative(value.blur ?? 0, `${name}.blur`),
      color: text(value.color, `${name}.color`),
    };
  }
  exactKeys(value, ['kind', 'amount'], name);
  return { kind, amount: nonNegative(value.amount, `${name}.amount`) };
}

function localIdentifier(value, name) {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(value)) {
    throw new TypeError(`${name} must be a safe local identifier`);
  }
  return value;
}

function shadows(value, box, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return value.map((entry, index) => {
    const entryName = `${name}[${index}]`;
    plain(entry, entryName);
    exactKeys(entry, box
      ? ['x', 'y', 'blur', 'spread', 'color', 'inset']
      : ['x', 'y', 'blur', 'color'], entryName);
    return {
      x: finite(entry.x ?? 0, `${entryName}.x`),
      y: finite(entry.y ?? 0, `${entryName}.y`),
      blur: nonNegative(entry.blur ?? 0, `${entryName}.blur`),
      ...(box ? {
        spread: finite(entry.spread ?? 0, `${entryName}.spread`),
        inset: Boolean(entry.inset),
      } : {}),
      color: text(entry.color, `${entryName}.color`),
    };
  });
}

function textStroke(value) {
  plain(value, 'typography.stroke');
  exactKeys(value, ['width', 'color'], 'typography.stroke');
  return {
    width: nonNegative(value.width ?? 0, 'typography.stroke.width'),
    color: text(value.color ?? 'transparent', 'typography.stroke.color'),
  };
}

function textLineHeight(value) {
  if (value === 'normal') return value;
  return positive(value, 'typography.lineHeight');
}

function inlineVerticalAlign(value) {
  if (typeof value === 'string' && INLINE_VERTICAL_ALIGNMENTS.includes(value)) return value;
  return dimension(value, 'inline.verticalAlign');
}

function textPaintOrder(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length === 0 || value.length > 3) {
    throw new TypeError('typography.paintOrder must be a non-empty array');
  }
  const entries = value.map((entry, index) => choice(
    entry,
    PAINT_ORDER_COMPONENTS,
    `typography.paintOrder[${index}]`,
  ));
  if (new Set(entries).size !== entries.length) {
    throw new TypeError('typography.paintOrder entries must be unique');
  }
  return entries;
}

function textWrap(value = {}) {
  plain(value, 'typography.wrap');
  exactKeys(value, ['whiteSpace', 'wordBreak', 'overflowWrap', 'textOverflow', 'maxLines'], 'typography.wrap');
  return {
    whiteSpace: choice(value.whiteSpace ?? 'pre-wrap', WHITE_SPACES, 'typography.wrap.whiteSpace'),
    wordBreak: choice(value.wordBreak ?? 'normal', WORD_BREAKS, 'typography.wrap.wordBreak'),
    overflowWrap: choice(value.overflowWrap ?? 'normal', OVERFLOW_WRAPS, 'typography.wrap.overflowWrap'),
    textOverflow: choice(value.textOverflow ?? 'clip', TEXT_OVERFLOWS, 'typography.wrap.textOverflow'),
    maxLines: value.maxLines === undefined ? null : positiveInteger(value.maxLines, 'typography.wrap.maxLines'),
  };
}

function spacing(value, name) {
  if (value === undefined) return { row: 0, column: 0 };
  if (typeof value === 'number' || typeof value === 'string') {
    const shared = dimension(value, name);
    return { row: shared, column: shared };
  }
  plain(value, name);
  exactKeys(value, ['row', 'column'], name);
  return {
    row: dimension(value.row ?? 0, `${name}.row`),
    column: dimension(value.column ?? 0, `${name}.column`),
  };
}

function edges(value, name) {
  if (value === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof value === 'number' || typeof value === 'string') {
    const shared = dimension(value, name);
    return { top: shared, right: shared, bottom: shared, left: shared };
  }
  plain(value, name);
  exactKeys(value, ['top', 'right', 'bottom', 'left'], name);
  return {
    top: dimension(value.top ?? 0, `${name}.top`),
    right: dimension(value.right ?? 0, `${name}.right`),
    bottom: dimension(value.bottom ?? 0, `${name}.bottom`),
    left: dimension(value.left ?? 0, `${name}.left`),
  };
}

function gridTracks(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return value.map((entry, index) => gridTrack(entry, `${name}[${index}]`));
}

function gridTrack(value, name) {
  plain(value, name);
  const kind = choice(value.kind, ['fixed', 'fraction', 'auto', 'content', 'minmax'], `${name}.kind`);
  if (kind === 'fixed') {
    exactKeys(value, ['kind', 'value'], name);
    return { kind, value: dimension(value.value, `${name}.value`) };
  }
  if (kind === 'fraction') {
    exactKeys(value, ['kind', 'value'], name);
    return { kind, value: positive(value.value, `${name}.value`) };
  }
  if (kind === 'auto') {
    exactKeys(value, ['kind'], name);
    return { kind };
  }
  if (kind === 'content') {
    exactKeys(value, ['kind', 'size'], name);
    return { kind, size: choice(value.size, ['min', 'max'], `${name}.size`) };
  }
  exactKeys(value, ['kind', 'min', 'max'], name);
  return {
    kind,
    min: gridTrack(value.min, `${name}.min`),
    max: gridTrack(value.max, `${name}.max`),
  };
}

function gridPlacement(value, name) {
  if (value === undefined) return null;
  plain(value, name);
  exactKeys(value, ['start', 'span'], name);
  return {
    start: positiveInteger(value.start, `${name}.start`),
    span: positiveInteger(value.span ?? 1, `${name}.span`),
  };
}

function point3(value, name) {
  plain(value, name);
  exactKeys(value, ['x', 'y', 'z'], name);
  return {
    x: dimension(value.x ?? '50%', `${name}.x`),
    y: dimension(value.y ?? '50%', `${name}.y`),
    z: finite(value.z ?? 0, `${name}.z`),
  };
}

function point2Dimensions(value, name, fallback = '50%') {
  plain(value, name);
  exactKeys(value, ['x', 'y'], name);
  return {
    x: dimension(value.x ?? fallback, `${name}.x`),
    y: dimension(value.y ?? fallback, `${name}.y`),
  };
}

function optionalDimension(value, fallback, name) {
  const selected = value === undefined ? fallback : value;
  return selected === undefined ? undefined : dimension(selected, name);
}

function optionalPositive(value, name) {
  return value === undefined ? undefined : positive(value, name);
}

function nonNegative(value, name) {
  const number = finite(value, name);
  if (number < 0) throw new RangeError(`${name} must be non-negative`);
  return number;
}

function integer(value, name) {
  const number = finite(value, name);
  if (!Number.isInteger(number)) throw new TypeError(`${name} must be an integer`);
  return number;
}

function positiveInteger(value, name) {
  const number = integer(value, name);
  if (number <= 0) throw new RangeError(`${name} must be greater than zero`);
  return number;
}

function choice(value, choices, name) {
  if (!choices.includes(value)) {
    throw new TypeError(`${name} must be one of ${choices.join(', ')}`);
  }
  return value;
}

function exactKeys(value, allowed, name) {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) throw new TypeError(`${name} has unsupported field ${unexpected}`);
}

function text(value, name) {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`);
  return value;
}

function strictBoolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`);
  return value;
}
