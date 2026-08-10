import { requireUnit, Unit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Shot } from '@cut3/agent-memory/units/base/Shot';
import {
  bindEmulsionTarget,
} from '@cut3/agent-memory/units/turbulent-emulsion/emulsionSemantics';

const BLACK_ALPHA = Object.freeze([
  0, 0, 0, 0, 0,
  0, 0, 0, 0, 0,
  0, 0, 0, 0, 0,
  1.4, 0, 0, 0, -0.25,
]);
const DUST_ALPHA = Object.freeze([
  0, 0, 0, 0, 0,
  0, 0, 0, 0, 0,
  0, 0, 0, 0, 0,
  1, 0, 0, 0, 0,
]);
const INK_MATRIX = Object.freeze([
  0, 0, 0, 0, 1,
  0, 0, 0, 0, 0,
  0, 0, 0, 0, 0,
  0, 0, 0, 1, 0,
]);
const LUMA_MATRIX = Object.freeze([
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0.33, 0.5, 0.16, 0, 0,
]);
const MONO_MATRIX = Object.freeze([
  0.33, 0.33, 0.33, 0, 0,
  0.33, 0.33, 0.33, 0, 0,
  0.33, 0.33, 0.33, 0, 0,
  0, 0, 0, 0, 1,
]);
const SOFT_GRAIN_MATRIX = Object.freeze([
  0, 0, 0, 0, 0.5,
  0, 0, 0, 0, 0.5,
  0, 0, 0, 0, 0.5,
  0.6, 0.6, 0.6, 0, -0.35,
]);
const STOCK_DUST_TABLE = Object.freeze([0, 0, 0.15625, 0.5, 0.84375, 1, 1, 1, 1, 1, 1]);
const TRACE_DATA = 'M 50 90 C 12 62 2 40 2 25 C 2 9 16 1 28 1 C 40 1 47 9 50 17 C 53 9 60 1 72 1 C 84 1 98 9 98 25 C 98 40 88 62 50 90 Z';
const OVERLAY_VARIANTS = Object.freeze([
  'soft-grain',
  'stock-video',
  'dense-grain',
  'driven-grain',
]);
const SURFACE_VARIANTS = Object.freeze([
  'handwritten-cues',
  ...OVERLAY_VARIANTS,
  'neon-trace',
]);
const CAPABILITY = Object.freeze({
  contract: 'turbulent-emulsion-svg/v1',
  kind: 'native-svg',
});
const SCENES = Object.freeze({
  'dense-grain': Object.freeze({ form: 'dual-grain-planes', treatment: 'dense-monochrome-emulsion' }),
  'driven-grain': Object.freeze({ form: 'dual-grain-planes', treatment: 'driven-monochrome-emulsion' }),
  'handwritten-cues': Object.freeze({ form: 'filter-definitions', treatment: 'displaced-ink-cues' }),
  'neon-trace': Object.freeze({ form: 'three-layer-heart-path', treatment: 'displaced-neon-trace' }),
  'soft-grain': Object.freeze({ form: 'single-grain-plane', treatment: 'soft-light-emulsion' }),
  'stock-video': Object.freeze({ form: 'filter-definitions', treatment: 'graded-stock-emulsion' }),
});

/** Exact overlay topology: procedural-only grain, or one authored runtime video slot. */
export class EmulsionOverlay extends Layer {
  static kind = 'unit.turbulent-emulsion.overlay';

  #animationTargets;
  #runtimeVideo;
  #surface;

  constructor(video, variant) {
    const recipe = String(variant);
    if (!OVERLAY_VARIANTS.includes(recipe)) {
      throw new TypeError('EmulsionOverlay variant is not authored');
    }
    if (recipe === 'stock-video') {
      requireUnit(video, 'EmulsionOverlay video');
      requireDetachedUnit(video, 'EmulsionOverlay video');
      if (video.constructor.kind !== 'unit.video') {
        throw new TypeError('stock-video requires a Video Unit');
      }
    } else if (video !== undefined) {
      throw new TypeError('procedural emulsion variants do not accept runtime media');
    }

    super(undefined, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      overflow: 'hidden',
      name: 'turbulent-emulsion-overlay',
    });
    this.variant = recipe;
    this.#runtimeVideo = video ?? null;
    this.#surface = new EmulsionSurface(recipe);

    if (recipe === 'dense-grain' || recipe === 'driven-grain') {
      this.addUnit(new EmulsionDarkGrade(undefined, {
        frame: { x: 0, y: 0, width: '100%', height: '100%' },
        paint: { fill: 'rgba(0,0,0,0.28)' },
        name: 'turbulent-emulsion-dark-grade',
      }));
    }
    this.addUnit(this.#surface);

    if (recipe === 'stock-video') {
      styleStockVideo(video);
      this.addUnit(new Shot(video, {
        duration: 67,
        from: 0,
        name: 'turbulent-emulsion-stock-video',
        premountFor: 60,
      }));
    }

    const animated = recipe !== 'stock-video';
    const target = animated
      ? bindEmulsionTarget(this.#surface, recipe, 'surface', 0, ['drift', 'flicker'])
      : null;
    this.#animationTargets = Object.freeze({
      drift: Object.freeze(target ? [target] : []),
      flicker: Object.freeze(target ? [target] : []),
    });
  }

  animationTargets() {
    return this.#animationTargets;
  }

  nativeSurface() {
    return this.#surface;
  }

  runtimeVideo() {
    return this.#runtimeVideo;
  }
}

class EmulsionDarkGrade extends Box {
  static kind = 'unit.turbulent-emulsion.dark-grade';
}

/** Compact semantic SVG surface. The host supplies React and owns native mounting. */
export class EmulsionSurface extends Unit {
  static kind = 'unit.turbulent-emulsion.surface';

  constructor(variant) {
    const recipe = String(variant);
    if (!SURFACE_VARIANTS.includes(recipe)) {
      throw new TypeError('EmulsionSurface variant is not authored');
    }
    super();
    this.capability = CAPABILITY;
    this.frame = surfaceFrame(recipe);
    this.motion = initialMotion(recipe);
    this.name = 'turbulent-emulsion-surface';
    this.opacity = initialOpacity(recipe);
    this.present = true;
    this.scene = SCENES[recipe];
    this.variant = recipe;
  }
}

/** Direct family-local SVG authoring; this is a renderer callback, not an SVG AST. */
export function renderEmulsionSvg(React, state) {
  if (!React || typeof React.createElement !== 'function') {
    throw new TypeError('renderEmulsionSvg requires React.createElement');
  }
  if (!state || state.capability?.contract !== CAPABILITY.contract) {
    throw new TypeError('renderEmulsionSvg requires projected EmulsionSurface state');
  }
  if (state.variant === 'handwritten-cues') return renderInkDefinitions(React, state);
  if (state.variant === 'soft-grain') return renderSoftGrain(React, state);
  if (state.variant === 'stock-video') return renderStockDefinitions(React, state);
  if (state.variant === 'dense-grain') return renderDualGrain(React, state, 0.32, 0.9);
  if (state.variant === 'driven-grain') return renderDualGrain(React, state, 0.3, 0.92);
  return renderNeonTrace(React, state);
}

function renderInkDefinitions(React, state) {
  const h = React.createElement;
  const motion = state.motion;
  return h('svg', hiddenSvgProps(state),
    h('defs', null,
      h('filter', {
        id: 'emulsion-main',
        x: '-50%',
        y: '-50%',
        width: '200%',
        height: '200%',
        filterUnits: 'objectBoundingBox',
        primitiveUnits: 'userSpaceOnUse',
      },
      h('feTurbulence', {
        baseFrequency: `${motion.frequencyX} ${motion.frequencyY}`,
        numOctaves: 2,
        result: 'ink-noise',
        seed: motion.seed,
        stitchTiles: 'noStitch',
        type: 'fractalNoise',
      }),
      h('feGaussianBlur', {
        in: 'SourceGraphic',
        result: 'ink-softness',
        stdDeviation: `${motion.blur} ${motion.blur}`,
      }),
      h('feDisplacementMap', {
        in: 'ink-softness',
        in2: 'ink-noise',
        result: 'ink-displaced',
        scale: motion.displacement,
        xChannelSelector: 'A',
        yChannelSelector: 'A',
      }),
      h('feColorMatrix', {
        in: 'ink-displaced',
        result: 'ink-colored',
        type: 'matrix',
        values: matrix(INK_MATRIX),
      }),
      h('feMerge', { result: 'ink-combined' },
        h('feMergeNode', { in: 'ink-colored' }),
        h('feMergeNode', { in: 'ink-colored' }),
        h('feMergeNode', { in: 'SourceGraphic' })))));
}

function renderSoftGrain(React, state) {
  const h = React.createElement;
  return h('svg', visibleSvgProps(state, '0 0 1080 1920', 'soft-light'),
    h('defs', null,
      h('filter', { id: 'emulsion-main' },
        h('feTurbulence', {
          baseFrequency: state.motion.frequency,
          numOctaves: 2,
          result: 'soft-noise',
          seed: state.motion.seed,
          stitchTiles: 'stitch',
          type: 'fractalNoise',
        }),
        h('feColorMatrix', {
          in: 'soft-noise',
          result: 'soft-grain',
          type: 'matrix',
          values: matrix(SOFT_GRAIN_MATRIX),
        }))),
    h('rect', { filter: 'url(#emulsion-main)', height: 1920, width: 1080, x: 0, y: 0 }));
}

function renderStockDefinitions(React, state) {
  const h = React.createElement;
  return h('svg', hiddenSvgProps(state),
    h('defs', null,
      h('filter', { colorInterpolationFilters: 'sRGB', id: 'emulsion-fine' },
        h('feTurbulence', {
          baseFrequency: '0.9 0.9',
          numOctaves: 2,
          result: 'stock-noise',
          seed: 0,
          stitchTiles: 'stitch',
          type: 'fractalNoise',
        }),
        h('feColorMatrix', {
          in: 'stock-noise', result: 'stock-mono', type: 'matrix', values: matrix(MONO_MATRIX),
        }),
        h('feComponentTransfer', { in: 'stock-mono', result: 'stock-contrast' },
          h('feFuncR', { intercept: -0.3, slope: 1.6, type: 'linear' }),
          h('feFuncG', { intercept: -0.3, slope: 1.6, type: 'linear' }),
          h('feFuncB', { intercept: -0.3, slope: 1.6, type: 'linear' })),
        h('feComposite', {
          in: 'stock-contrast', in2: 'SourceAlpha', operator: 'in', result: 'stock-clipped',
        }),
        h('feBlend', {
          in: 'SourceGraphic', in2: 'stock-clipped', mode: 'overlay', result: 'stock-mixed',
        })),
      h('filter', { colorInterpolationFilters: 'sRGB', id: 'emulsion-dust' },
        h('feColorMatrix', {
          in: 'SourceGraphic', result: 'stock-luma', type: 'matrix', values: matrix(LUMA_MATRIX),
        }),
        h('feComponentTransfer', { in: 'stock-luma', result: 'stock-threshold' },
          h('feFuncA', { tableValues: STOCK_DUST_TABLE.join(' '), type: 'table' })),
        h('feComposite', {
          in: 'stock-threshold', in2: 'SourceAlpha', operator: 'in', result: 'stock-matte',
        }))));
}

function renderDualGrain(React, state, fineFrequency, dustFrequency) {
  const h = React.createElement;
  return h('svg', visibleSvgProps(state, '0 0 1080 1920'),
    h('defs', null,
      h('filter', { id: 'emulsion-fine' },
        h('feTurbulence', {
          baseFrequency: `${fineFrequency} ${fineFrequency}`,
          numOctaves: 2,
          result: 'fine-noise',
          seed: state.motion.fineSeed,
          stitchTiles: 'stitch',
          type: 'fractalNoise',
        }),
        h('feColorMatrix', {
          in: 'fine-noise', result: 'fine-alpha', type: 'matrix', values: matrix(BLACK_ALPHA),
        }),
        h('feComponentTransfer', { in: 'fine-alpha', result: 'fine-grain' },
          h('feFuncA', { amplitude: 1.4, exponent: 1.6, offset: 0, type: 'gamma' }))),
      h('filter', { id: 'emulsion-dust' },
        h('feTurbulence', {
          baseFrequency: `${dustFrequency} ${dustFrequency}`,
          numOctaves: 2,
          result: 'dust-noise',
          seed: state.motion.dustSeed,
          stitchTiles: 'stitch',
          type: 'fractalNoise',
        }),
        h('feColorMatrix', {
          in: 'dust-noise', result: 'dust-alpha', type: 'matrix', values: matrix(DUST_ALPHA),
        }),
        h('feComponentTransfer', { in: 'dust-alpha', result: 'dust-grain' },
          h('feFuncA', { amplitude: 1.2, exponent: 2.1, offset: 0, type: 'gamma' })))),
    h('rect', { filter: 'url(#emulsion-fine)', height: 1920, width: 1080, x: 0, y: 0 }),
    h('rect', { filter: 'url(#emulsion-dust)', height: 1920, width: 1080, x: 0, y: 0 }));
}

function renderNeonTrace(React, state) {
  const h = React.createElement;
  const draw = 1 - state.motion.traceProgress;
  return h('svg', {
    ...visibleSvgProps(state, '0 0 100 100'),
    style: {
      ...visibleSvgProps(state, '0 0 100 100').style,
      filter: `drop-shadow(0 0 ${state.motion.glow}px #ff2d95) drop-shadow(0 0 ${state.motion.glow * 2}px #ff2d95)`,
      transform: `scale(${state.motion.scale})`,
      transformOrigin: 'center',
    },
  },
  h('defs', null,
    h('filter', {
      id: 'emulsion-main', x: '-20%', y: '-20%', width: '140%', height: '140%',
    },
    h('feTurbulence', {
      baseFrequency: '0.02 0.02',
      numOctaves: 2,
      result: 'trace-noise',
      seed: 7,
      stitchTiles: 'noStitch',
      type: 'fractalNoise',
    }),
    h('feDisplacementMap', {
      in: 'SourceGraphic',
      in2: 'trace-noise',
      result: 'trace-displaced',
      scale: 3.2,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
    }))),
  h('path', {
    d: TRACE_DATA,
    fill: '#ff2d95',
    filter: 'url(#emulsion-main)',
    opacity: state.motion.fillOpacity,
  }),
  h('path', {
    d: TRACE_DATA,
    fill: 'none',
    filter: 'url(#emulsion-main)',
    pathLength: 1,
    stroke: '#ff2d95',
    strokeDasharray: 1,
    strokeDashoffset: draw,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 3.4,
  }),
  h('path', {
    d: TRACE_DATA,
    fill: 'none',
    filter: 'url(#emulsion-main)',
    opacity: 0.85,
    pathLength: 1,
    stroke: '#ff7ec2',
    strokeDasharray: 1,
    strokeDashoffset: draw,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.4,
  }));
}

function hiddenSvgProps(state) {
  return {
    'aria-hidden': true,
    focusable: false,
    height: 0,
    style: { height: 0, overflow: 'hidden', position: 'absolute', width: 0 },
    viewBox: '0 0 0 0',
    width: 0,
    'data-emulsion-variant': state.variant,
  };
}

function visibleSvgProps(state, viewBox, blendMode = 'normal') {
  return {
    'aria-hidden': true,
    focusable: false,
    height: state.frame.height,
    style: {
      left: dimension(state.frame.x),
      mixBlendMode: blendMode,
      opacity: state.opacity,
      overflow: 'visible',
      pointerEvents: 'none',
      position: 'absolute',
      top: dimension(state.frame.y),
    },
    viewBox,
    width: state.frame.width,
    'data-emulsion-variant': state.variant,
  };
}

function matrix(values) {
  return values.join(' ');
}

function dimension(value) {
  return typeof value === 'number' ? `${value}px` : value;
}

function surfaceFrame(recipe) {
  if (recipe === 'handwritten-cues' || recipe === 'stock-video') {
    return Object.freeze({ x: 0, y: 0, width: 0, height: 0 });
  }
  if (recipe === 'neon-trace') {
    return Object.freeze({ x: 230, y: 675, width: 620, height: 570 });
  }
  return Object.freeze({ x: 0, y: 0, width: 1080, height: 1920 });
}

function initialMotion(recipe) {
  if (recipe === 'handwritten-cues') {
    return { blur: 10.6, displacement: 33, frequencyX: 0.9, frequencyY: 0.9, seed: 0 };
  }
  if (recipe === 'soft-grain') return { frequency: 0.95, seed: 1 };
  if (recipe === 'dense-grain') return { dustSeed: 17, fineSeed: 0 };
  if (recipe === 'driven-grain') return { dustSeed: 26, fineSeed: 3 };
  if (recipe === 'neon-trace') {
    return { fillOpacity: 0, glow: 6, scale: 0.92, traceProgress: 0 };
  }
  return {};
}

function initialOpacity(recipe) {
  if (recipe === 'soft-grain') return 0.0325;
  if (recipe === 'dense-grain') return 0.39;
  if (recipe === 'driven-grain') return 0.38;
  if (recipe === 'neon-trace') return 0;
  return 1;
}

function styleStockVideo(video) {
  video.backend = 'offthread-video';
  video.frame = { x: 0, y: 0, width: '100%', height: '100%' };
  video.fit = 'cover';
  video.muted = true;
  video.effects = {
    ...video.effects,
    filters: [
      { kind: 'grayscale', amount: 0.85 },
      { kind: 'saturate', amount: 0.7 },
      { kind: 'contrast', amount: 1.55 },
      { kind: 'brightness', amount: 1.05 },
      { kind: 'svg-filter-ref', id: 'emulsion-fine' },
      { kind: 'svg-filter-ref', id: 'emulsion-dust' },
    ],
  };
  video.transparent = true;
}
