import {
  ImpactCutStage,
} from '@cut3/agent-memory/units/impact/ImpactCutStage';
import { requireUnit } from '@cut3/agent-memory/core/identity';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layout } from '@cut3/agent-memory/units/base/Layout';
import { typography, visual } from '@cut3/agent-memory/units/base/visual';

const RECIPES = Object.freeze({
  'photo-depth-zoom': buildPhotoDepthZoom,
  'photo-chroma-depth': buildPhotoChromaDepth,
  'photo-punch-2d': buildPhotoPunch2d,
  'photo-screen-blend': buildPhotoScreenBlend,
  'triptych-depth': buildTriptychDepth,
  'photo-shadow-punch': buildPhotoShadowPunch,
  'collage-depth-outline': buildCollageDepthOutline,
  'solid-card-depth': buildSolidCardDepth,
  'type-depth-rise': buildTypeDepthRise,
  'type-depth-panel': buildTypeDepthPanel,
  'type-depth-stack': buildTypeDepthStack,
  'type-depth-stamp': buildTypeDepthStamp,
  'type-depth-tilt': buildTypeDepthTilt,
  'type-collage-depth': buildTypeCollageDepth,
});

const ROLE_BINDINGS = Object.freeze({
  'photo-depth-zoom': [
    ['imageGroup', 'image'],
    ['text', 'text'],
    ['flash', 'flash'],
  ],
  'photo-chroma-depth': [
    ['imageGroup', 'image'],
    ['gradientGroup', 'gradient'],
    ['text', 'text'],
    ['flash', 'flash'],
  ],
  'photo-punch-2d': [
    ['imageGroup', 'image'],
    ['textGroup', 'text'],
    ['flash', 'flash'],
  ],
  'photo-screen-blend': [
    ['imageGroup', 'image'],
    ['red', 'red'],
    ['flash', 'flash'],
    ['textGroup', 'text'],
  ],
  'triptych-depth': [
    ['imageGroup', 'image'],
    ['ghosts', 'ghost', [{ opacity: 0.5 }, { opacity: 0.4 }]],
    ['red', 'red'],
    ['black', 'black'],
  ],
  'photo-shadow-punch': [
    ['imageGroup', 'image'],
    ['black', 'black'],
  ],
  'collage-depth-outline': [
    ['imageGroup', 'image'],
    ['text', 'text'],
    ['flash', 'flash'],
  ],
  'solid-card-depth': [
    ['stage', 'stage'],
    ['ring', 'ring'],
  ],
  'type-depth-rise': [['stack', 'stack']],
  'type-depth-panel': [['stack', 'stack'], ['ring', 'ring']],
  'type-depth-stack': [
    ['starGroup', 'star-group'],
    ['star', 'star'],
    ['textGroup', 'text-group'],
    ['textStack', 'text-stack'],
  ],
  'type-depth-stamp': [['stage', 'stage'], ['cube', 'cube']],
  'type-depth-tilt': [['stack', 'stack']],
  'type-collage-depth': [
    ['content', 'content'],
    ['chroma', 'chroma'],
    ['glitchBars', 'glitch'],
    ['topGroup', 'top-group'],
    ['topText', 'top-text'],
    ['bottomGroup', 'bottom-group'],
    ['flash', 'flash'],
  ],
});
const IMPACT_ROLES = new WeakMap();

class ImpactRecipeUnit extends ImpactCutStage {
  #cadenceBindings;

  constructor(images, captions, recipe) {
    const runtime = { captions, images, imageIndex: 0, textIndex: 0 };
    const spec = RECIPES[recipe](runtime);
    super(spec.children[0], recipe, spec.background);
    addRest(this.authoredStage, spec.children);
    if (spec.stagePose) {
      this.authoredStage.pose = { ...this.authoredStage.pose, ...spec.stagePose };
    }
    const parts = spec.mapParts(this.authoredStage);
    this.#cadenceBindings = Object.freeze(ROLE_BINDINGS[recipe].flatMap(
      ([key, role, params]) => {
        const owners = Array.isArray(parts[key]) ? parts[key] : [parts[key]];
        return owners.map((owner, index) => {
          bindSemanticRole(owner, recipe, role);
          return Object.freeze({
            owner,
            params: Object.freeze({ ...(params?.[index] ?? {}) }),
            role,
          });
        });
      },
    ));
  }

  get cadenceBindings() {
    return this.#cadenceBindings;
  }
}

export class PhotoDepthZoomImpact extends ImpactRecipeUnit {
  static kind = 'unit.impact.photo-depth-zoom';
  constructor(images, captions) { super(images, captions, 'photo-depth-zoom'); }
}

export class PhotoChromaDepthImpact extends ImpactRecipeUnit {
  static kind = 'unit.impact.photo-chroma-depth';
  constructor(images, captions) { super(images, captions, 'photo-chroma-depth'); }
}

export class PhotoPunch2dImpact extends ImpactRecipeUnit {
  static kind = 'unit.impact.photo-punch-2d';
  constructor(images, captions) { super(images, captions, 'photo-punch-2d'); }
}

export class PhotoScreenBlendImpact extends ImpactRecipeUnit {
  static kind = 'unit.impact.photo-screen-blend';
  constructor(images, captions) { super(images, captions, 'photo-screen-blend'); }
}

export class TriptychDepthImpact extends ImpactRecipeUnit {
  static kind = 'unit.impact.triptych-depth';
  constructor(images, captions) { super(images, captions, 'triptych-depth'); }
}

export class PhotoShadowPunchImpact extends ImpactRecipeUnit {
  static kind = 'unit.impact.photo-shadow-punch';
  constructor(images, captions) { super(images, captions, 'photo-shadow-punch'); }
}

export class CollageDepthOutlineImpact extends ImpactRecipeUnit {
  static kind = 'unit.impact.collage-depth-outline';
  constructor(images, captions) { super(images, captions, 'collage-depth-outline'); }
}

export class SolidCardDepthImpact extends ImpactRecipeUnit {
  static kind = 'unit.impact.solid-card-depth';
  constructor(images, captions) { super(images, captions, 'solid-card-depth'); }
}

export class TypeDepthRiseImpact extends ImpactRecipeUnit {
  static kind = 'unit.impact.type-depth-rise';
  constructor(images, captions) { super(images, captions, 'type-depth-rise'); }
}

export class TypeDepthPanelImpact extends ImpactRecipeUnit {
  static kind = 'unit.impact.type-depth-panel';
  constructor(images, captions) { super(images, captions, 'type-depth-panel'); }
}

export class TypeDepthStackImpact extends ImpactRecipeUnit {
  static kind = 'unit.impact.type-depth-stack';
  constructor(images, captions) { super(images, captions, 'type-depth-stack'); }
}

export class TypeDepthStampImpact extends ImpactRecipeUnit {
  static kind = 'unit.impact.type-depth-stamp';
  constructor(images, captions) { super(images, captions, 'type-depth-stamp'); }
}

export class TypeDepthTiltImpact extends ImpactRecipeUnit {
  static kind = 'unit.impact.type-depth-tilt';
  constructor(images, captions) { super(images, captions, 'type-depth-tilt'); }
}

export class TypeCollageDepthImpact extends ImpactRecipeUnit {
  static kind = 'unit.impact.type-collage-depth';
  constructor(images, captions) { super(images, captions, 'type-collage-depth'); }
}

/** Closed semantic-role identity shared by recipe Units and their owner-first cadence. */
export function requireImpactRole(unit, recipe, role) {
  requireUnit(unit, 'impact cadence owner');
  const authored = IMPACT_ROLES.get(unit);
  if (authored?.recipe !== recipe || authored?.role !== role) {
    throw new TypeError('Impact cadence owner does not match its authored semantic role');
  }
  return unit;
}

class ImpactVisualBox extends Box {
  static kind = 'unit.impact.visual-box';
}

class ImpactVisualLayout extends Layout {
  static kind = 'unit.impact.visual-layout';
}

function buildPhotoDepthZoom(runtime) {
  const back = image(runtime, {
    frame: absoluteFull(),
    opacity: 0.4,
    pose: { operations: [translateZ(-80), scale(1.1)] },
    effects: { filters: [brightness(0.5)] },
  });
  const front = image(runtime, {
    frame: absoluteFull(),
    effects: { filters: [contrast(1.3), saturate(1.6), brightness(0.95)] },
  });
  const imageGroup = box(back, {
    frame: absoluteFull(),
    pose: { transformStyle: 'preserve-3d' },
  });
  imageGroup.addUnit(front);
  const perspective = box(imageGroup, {
    frame: absolutePixels(1080, 1920),
    pose: { perspective: 1000, transformStyle: 'preserve-3d' },
  });
  const flash = fill('#fff');
  const text = impactText(runtime, {
    frame: autoFrame('static'),
    paint: { color: '#fff' },
    typography: impactTypography({ size: 130, letterSpacing: 20 }),
    typographyShadows: [shadow(0, 0, 20, 'red'), shadow(0, 0, 40, 'red')],
  });
  const textGroup = layout(text, {
    frame: anchored({ x: 0, y: 80, right: 0, width: undefined, height: 'auto' }),
    layout: { align: 'center', justify: 'center' },
    pose: { perspective: 600 },
  });
  return finish('photo-depth-zoom', '#000', [perspective, flash, textGroup], {
    flash,
    imageGroup,
    text,
  });
}

function buildPhotoChromaDepth(runtime) {
  const media = image(runtime, { frame: staticFull() });
  const imageGroup = layout(media, {
    frame: absoluteFillFrame(),
    layout: { direction: 'column' },
    effects: { filters: [contrast(1.2), saturate(1.5), brightness(1)] },
    pose: { transformStyle: 'preserve-3d' },
  });
  const gradient = box(undefined, {
    frame: anchored({ x: 0, right: 0, bottom: 0, width: undefined, height: '40%' }),
    paint: {
      backgrounds: [{
        kind: 'linear-gradient',
        angle: 0,
        stops: [
          { offset: 0, color: 'rgba(0, 0, 0, 0.8)' },
          { offset: 1, color: 'transparent' },
        ],
      }],
    },
  });
  const gradientGroup = box(gradient, { frame: absoluteFillFrame() });
  const text = impactText(runtime, {
    frame: autoFrame('static'),
    paint: { color: '#fff' },
    typography: impactTypography({
      size: 68,
      weight: 700,
      letterSpacing: 10,
      align: 'center',
    }),
    typographyShadows: [
      shadow(0, 0, 20, 'rgba(255, 165, 0, 0.8)'),
      shadow(0, 0, 40, 'rgba(255, 140, 0, 0.6)'),
      shadow(0, 0, 60, 'rgba(255, 100, 0, 0.4)'),
      shadow(3, 3, 8, 'rgba(0, 0, 0, 0.9)'),
    ],
    pose: { transformStyle: 'preserve-3d' },
  });
  const textGroup = layout(text, {
    frame: { ...absoluteFillFrame(), boxSizing: 'border-box' },
    layout: {
      direction: 'column',
      align: 'start',
      justify: 'center',
      padding: { top: 280, right: 0, bottom: 0, left: 0 },
    },
    pose: { perspective: 1400 },
  });
  const flash = fill('#fff');
  return finish('photo-chroma-depth', '#000', [imageGroup, gradientGroup, textGroup, flash], {
    flash,
    gradientGroup,
    imageGroup,
    text,
  }, { perspective: 1400 });
}

function buildPhotoPunch2d(runtime) {
  const media = image(runtime, { frame: staticFull() });
  const imageGroup = box(media, {
    frame: staticFull(),
    effects: {
      filters: [contrast(1.5), saturate(1.4), brightness(0.9), hueRotate(-10)],
    },
  });
  const text = impactText(runtime, {
    frame: autoFrame('static'),
    paint: { color: '#fff' },
    typography: impactTypography({
      family: 'Impact, sans-serif',
      size: 72,
      weight: 700,
      letterSpacing: 6,
      align: 'center',
      shadows: [
        shadow(0, 0, 30, 'rgba(255, 0, 0, 0.8)'),
        shadow(0, 0, 60, 'rgba(255, 0, 0, 0.5)'),
      ],
    }),
    effects: {
      filters: [
        dropShadow(0, 0, 20, 'rgba(255, 0, 0, 0.9)'),
        dropShadow(0, 0, 40, 'rgba(255, 0, 0, 0.6)'),
      ],
    },
  });
  const textGroup = layout(text, {
    frame: anchored({ x: 0, right: 0, bottom: 100, width: undefined, height: 'auto' }),
    layout: { align: 'center', justify: 'center' },
  });
  const flash = fill('#fff');
  return finish('photo-punch-2d', '#000', [imageGroup, textGroup, flash], {
    flash,
    imageGroup,
    textGroup,
  });
}

function buildPhotoScreenBlend(runtime) {
  const media = image(runtime, { frame: staticFull() });
  const imageGroup = box(media, {
    frame: absoluteFull(),
    effects: { filters: [contrast(1.5), brightness(0.8), saturate(1.2)] },
  });
  const red = fill('#ff0000', { effects: { blendMode: 'multiply' }, opacity: 0.3 });
  const flash = fill('#ffffff');
  const primary = impactText(runtime, {
    frame: autoFrame('static'),
    paint: { color: '#ffffff' },
    typography: impactTypography({
      size: 80,
      weight: 700,
      letterSpacing: 12,
      shadows: [
        shadow(0, 0, 20, 'rgba(255, 0, 0, 0.9)'),
        shadow(0, 0, 40, 'rgba(255, 0, 0, 0.6)'),
        shadow(0, 0, 60, 'rgba(255, 0, 0, 0.4)'),
      ],
    }),
  });
  const secondary = impactText(runtime, {
    frame: autoFrame('static'),
    paint: { color: '#ffffff' },
    opacity: 0.9,
    typography: impactTypography({ family: 'serif', size: 36, style: 'italic', weight: 400 }),
  });
  const textGroup = layout(primary, {
    frame: anchored({ x: 0, right: 0, bottom: 180, width: undefined, height: 'auto' }),
    layout: { direction: 'column', align: 'center', gap: 12 },
  });
  textGroup.addUnit(secondary);
  return finish('photo-screen-blend', '#000', [imageGroup, red, flash, textGroup], {
    flash,
    imageGroup,
    red,
    textGroup,
  });
}

function buildTriptychDepth(runtime) {
  const base = image(runtime, { frame: absoluteFull() });
  const firstGhost = image(runtime, {
    frame: absoluteFull(),
    opacity: 0,
    pose: { operations: [translateX(-6)] },
    effects: { blendMode: 'screen', filters: [hueRotate(0)] },
  });
  const secondGhost = image(runtime, {
    frame: absoluteFull(),
    opacity: 0,
    pose: { operations: [translateX(6)] },
    effects: { blendMode: 'screen', filters: [hueRotate(180)] },
  });
  const imageGroup = box(base, {
    frame: staticFull(),
    effects: { filters: [contrast(1.8), brightness(0.8), saturate(1.6)] },
    pose: { transformStyle: 'preserve-3d' },
  });
  imageGroup.addUnit(firstGhost);
  imageGroup.addUnit(secondGhost);
  const perspective = box(imageGroup, {
    frame: staticFull(),
    pose: { perspective: 800 },
  });
  const red = fill('rgba(255, 0, 0, 0)');
  const black = fill('#000');
  return finish('triptych-depth', '#000', [perspective, red, black], {
    black,
    ghosts: [firstGhost, secondGhost],
    imageGroup,
    red,
  });
}

function buildPhotoShadowPunch(runtime) {
  const media = image(runtime, { frame: staticFull() });
  const imageGroup = box(media, {
    frame: absoluteFull(),
    effects: { filters: [contrast(1.4), brightness(0.85), saturate(0.6)] },
  });
  const vignette = box(undefined, {
    frame: absoluteFull(),
    effects: {
      boxShadows: [{
        x: 0,
        y: 0,
        blur: 120,
        spread: 40,
        color: 'rgba(255, 0, 0, 0.4)',
        inset: true,
      }],
    },
  });
  const black = fill('#000');
  return finish('photo-shadow-punch', '#000', [imageGroup, vignette, black], {
    black,
    imageGroup,
  });
}

function buildCollageDepthOutline(runtime) {
  const base = image(runtime, {
    frame: staticFull(),
    effects: { filters: [brightness(0.85), contrast(1.3), saturate(0.9)] },
  });
  const firstGhost = image(runtime, {
    frame: anchored({ x: -4, y: 0, width: '100%', height: '100%' }),
    opacity: 0.4,
    effects: { blendMode: 'screen', filters: [brightness(1.2)] },
  });
  const secondGhost = image(runtime, {
    frame: anchored({ x: 4, y: 0, width: '100%', height: '100%' }),
    opacity: 0.3,
    effects: { blendMode: 'screen', filters: [brightness(1.2), hueRotate(180)] },
  });
  const vignette = box(undefined, {
    frame: anchored({ x: 0, y: 0, right: 0, bottom: 0, width: undefined, height: undefined }),
    paint: {
      backgrounds: [{
        kind: 'radial-gradient',
        shape: 'circle',
        position: { x: '50%', y: '50%' },
        stops: [
          { offset: 0.3, color: 'transparent' },
          { offset: 1, color: 'rgba(0,0,0,0.6)' },
        ],
      }],
    },
  });
  const imageGroup = box(base, {
    frame: relativeFull(),
    pose: { transformStyle: 'preserve-3d' },
  });
  imageGroup.addUnit(firstGhost);
  imageGroup.addUnit(secondGhost);
  imageGroup.addUnit(vignette);
  const imagePerspective = layout(imageGroup, {
    frame: absoluteFull(),
    layout: { align: 'center', justify: 'center' },
    pose: { perspective: 1200 },
  });
  const text = impactText(runtime, {
    frame: autoFrame('static'),
    paint: { color: '#fff' },
    typography: impactTypography({
      family: 'Impact, sans-serif',
      size: 80,
      letterSpacing: 8,
      align: 'center',
      transform: 'uppercase',
      stroke: { width: 2, color: 'rgba(0,0,0,0.5)' },
    }),
    effects: {
      filters: [
        dropShadow(0, 0, 20, 'rgba(255,0,0,0.9)'),
        dropShadow(0, 0, 40, 'rgba(255,0,0,0.6)'),
        dropShadow(2, 2, 8, 'rgba(0,0,0,0.9)'),
      ],
    },
  });
  const textGroup = layout(text, {
    frame: anchored({ x: 0, y: 120, right: 0, width: undefined, height: 'auto' }),
    layout: { align: 'center', justify: 'center' },
    pose: { perspective: 600 },
  });
  const flash = fill('#fff');
  return finish(
    'collage-depth-outline',
    '#000',
    [imagePerspective, textGroup, flash],
    { flash, imageGroup, text },
  );
}

function buildSolidCardDepth(runtime) {
  const panels = Array.from({ length: 12 }, (_, index) => box(undefined, {
    frame: anchored({ x: -40, y: -2, width: 80, height: 4 }),
    paint: { fill: 'rgba(255, 0, 0, 0.8)' },
    effects: {
      boxShadows: [{ x: 0, y: 0, blur: 12, spread: 4, color: 'rgba(255, 0, 0, 0.6)' }],
    },
    pose: {
      transformStyle: 'preserve-3d',
      operations: [rotateY(index * 30), translateZ(120)],
    },
  }));
  const ring = box(panels[0], {
    frame: autoFrame('relative'),
    pose: { transformStyle: 'preserve-3d' },
  });
  addRest(ring, panels);
  const outer = box(ring, {
    frame: anchored({ x: '50%', y: '40%', width: 'auto', height: 'auto' }),
    pose: { perspective: 800, transformStyle: 'preserve-3d' },
  });
  return finish('solid-card-depth', 'transparent', [outer], { ring, stage: null }, undefined, (stage) => ({ ring, stage }));
}

function buildTypeDepthRise(runtime) {
  const layers = Array.from({ length: 20 }, (_, index) => impactText(runtime, {
    frame: autoFrame('absolute'),
    paint: { color: index === 0 ? 'white' : depthRed(index) },
    typography: impactTypography({ size: 90, letterSpacing: 8, wrap: 'nowrap' }),
    typographyShadows: index === 0
      ? [shadow(0, 0, 30, 'red'), shadow(0, 0, 60, 'red')]
      : [],
    pose: {
      operations: [
        translateZ(-index * 2),
        translateX(index * 0.8),
        translateY(index * 0.8),
      ],
    },
  }));
  const stack = box(layers[0], {
    frame: autoFrame('relative'),
    pose: { transformStyle: 'preserve-3d' },
  });
  addRest(stack, layers);
  const outer = box(stack, {
    frame: anchored({ x: '50%', y: 100, width: 'auto', height: 'auto' }),
    pose: { perspective: 1000, transformStyle: 'preserve-3d', operations: [translateX('-50%')] },
  });
  return finish('type-depth-rise', 'transparent', [outer], { layers, stack });
}

function buildTypeDepthPanel(runtime) {
  const colors = ['#ffffff', ...Array(8).fill('#ff0000'), ...Array(12).fill('#880000'), ...Array(9).fill('#220000')];
  const layers = Array.from({ length: 30 }, (_, index) => impactText(runtime, {
    frame: autoFrame('absolute'),
    paint: { color: colors[index] },
    typography: impactTypography({ size: 130, letterSpacing: 20, wrap: 'nowrap' }),
    typographyShadows: index === 0
      ? [
        shadow(0, 0, 30, '#ff0000'),
        shadow(0, 0, 60, '#ff0000'),
        shadow(0, 0, 80, '#ff0000'),
      ]
      : [],
    pose: {
      operations: [
        translateZ(-index * 2.5),
        translateX(index),
        translateY(index),
      ],
    },
  }));
  const stack = box(layers[0], {
    frame: autoFrame('relative'),
    pose: { transformStyle: 'preserve-3d' },
  });
  addRest(stack, layers);
  const textOuter = box(stack, {
    frame: anchored({ x: '50%', y: 80, width: 'auto', height: 'auto' }),
    pose: { perspective: 1000, operations: [translateX('-50%')] },
  });
  const panels = Array.from({ length: 8 }, (_, index) => box(undefined, {
    frame: autoFrame('absolute', { width: 60, height: 3 }),
    paint: { fill: '#ff0000' },
    effects: {
      boxShadows: [
        { x: 0, y: 0, blur: 20, spread: 0, color: '#ff0000' },
        { x: 0, y: 0, blur: 40, spread: 0, color: '#ff0000' },
      ],
    },
    pose: { operations: [rotateY(index * 45), translateZ(80)] },
  }));
  const ring = box(panels[0], {
    frame: autoFrame('relative', { width: 0, height: 0 }),
    pose: { transformStyle: 'preserve-3d' },
  });
  addRest(ring, panels);
  const ringOuter = box(ring, {
    frame: anchored({ x: '50%', y: 400, width: 'auto', height: 'auto' }),
    pose: { perspective: 1000, operations: [translateX('-50%')] },
  });
  return finish('type-depth-panel', 'transparent', [textOuter, ringOuter], { ring, stack });
}

function buildTypeDepthStack(runtime) {
  const bars = Array.from({ length: 5 }, (_, index) => box(undefined, {
    frame: anchored({ x: -3, y: 0, width: 6, height: 90 }),
    paint: { fill: 'rgba(255,0,0,0.85)' },
    effects: {
      boxShadows: [{ x: 0, y: 0, blur: 15, spread: 5, color: 'rgba(255,0,0,0.5)' }],
    },
    pose: {
      transformStyle: 'preserve-3d',
      operations: [rotateZ(index * 72), translateY(-90)],
    },
  }));
  const star = box(bars[0], {
    frame: autoFrame('static'),
    pose: { transformStyle: 'preserve-3d' },
  });
  addRest(star, bars);
  const starGroup = box(star, {
    frame: anchored({ x: '50%', y: 700, width: 'auto', height: 'auto' }),
    pose: { perspective: 600, operations: [translateX('-50%')] },
  });
  const layers = Array.from({ length: 20 }, (_, index) => impactText(runtime, {
    frame: anchored({ x: 0, y: 0, width: 'auto', height: 'auto' }),
    paint: { color: index === 0 ? 'white' : `rgb(${Math.round(139 * (1 - (index / 20)))}, 0, 0)` },
    typography: impactTypography({
      family: 'Impact, sans-serif',
      size: 85,
      weight: 700,
      letterSpacing: 12,
      wrap: 'nowrap',
    }),
    typographyShadows: index === 0
      ? [shadow(0, 0, 20, 'red'), shadow(0, 0, 40, 'red')]
      : [],
    pose: {
      operations: [
        translateZ(-index * 2),
        translateX(index * 0.9),
        translateY(index * 0.9),
      ],
    },
  }));
  const textStack = box(layers[0], {
    frame: autoFrame('relative'),
    pose: { transformStyle: 'preserve-3d' },
  });
  addRest(textStack, layers);
  const textGroup = box(textStack, {
    frame: anchored({ x: '50%', bottom: 200, width: 'auto', height: 'auto' }),
    pose: { perspective: 1000, operations: [translateX('-50%')] },
  });
  return finish('type-depth-stack', 'transparent', [starGroup, textGroup], {
    layers,
    star,
    starGroup,
    textGroup,
    textStack,
  });
}

function buildTypeDepthStamp(runtime) {
  const faceTransforms = [
    [translateZ(70)],
    [translateZ(-70), rotateY(180)],
    [rotateY(-90), translateZ(70)],
    [rotateY(90), translateZ(70)],
    [rotateX(90), translateZ(70)],
    [rotateX(-90), translateZ(70)],
  ];
  const faces = faceTransforms.map((operations) => box(undefined, {
    frame: autoFrame('absolute', { width: 140, height: 140, boxSizing: 'border-box' }),
    paint: {
      fill: 'transparent',
      border: { all: { width: 2, style: 'solid', color: 'rgba(255,100,0,0.7)' } },
    },
    effects: {
      boxShadows: [
        { x: 0, y: 0, blur: 20, spread: 0, color: 'rgba(255,100,0,0.3)', inset: true },
        { x: 0, y: 0, blur: 10, spread: 0, color: 'rgba(255,100,0,0.5)' },
      ],
    },
    pose: { operations },
  }));
  const cube = box(faces[0], {
    frame: autoFrame('relative', { width: 140, height: 140 }),
    pose: { transformStyle: 'preserve-3d' },
  });
  addRest(cube, faces);
  const cubeOuter = box(cube, {
    frame: anchored({ right: 80, y: 200, width: 'auto', height: 'auto' }),
    pose: { perspective: 1200 },
  });
  const layers = Array.from({ length: 15 }, (_, index) => impactText(runtime, {
    frame: anchored({ x: 0, y: 0, width: 'auto', height: 'auto' }),
    paint: { color: index === 0 ? '#ffffff' : depthOrange(index) },
    typography: impactTypography({ size: 70, letterSpacing: 10, wrap: 'nowrap' }),
    typographyShadows: index === 0
      ? [
        shadow(0, 0, 20, 'rgba(255,165,0,0.8)'),
        shadow(0, 0, 40, 'rgba(255,140,0,0.6)'),
      ]
      : [],
    pose: {
      operations: [
        {
          kind: 'translate',
          x: `${index * 1.5}px`,
          y: `${index * 1.5}px`,
          z: -index * 1.5,
        },
      ],
    },
  }));
  const textStack = box(layers[0], {
    frame: autoFrame('relative'),
    pose: { transformStyle: 'preserve-3d', operations: [rotateX(-10)] },
  });
  addRest(textStack, layers);
  const textOuter = box(textStack, {
    frame: anchored({ x: '50%', y: 400, width: 'auto', height: 'auto' }),
    pose: { perspective: 1200, operations: [translateX('-50%')] },
  });
  return finish('type-depth-stamp', 'transparent', [cubeOuter, textOuter], {
    cube,
    layers,
    stage: null,
  }, undefined, (stage) => ({ cube, layers, stage }));
}

function buildTypeDepthTilt(runtime) {
  const colors = ['#ffffff', ...Array(5).fill('#ff2200'), ...Array(10).fill('#990000'), ...Array(9).fill('#1a0000')];
  const layers = Array.from({ length: 25 }, (_, index) => impactText(runtime, {
    frame: autoFrame('absolute'),
    paint: { color: colors[index] },
    typography: impactTypography({ size: 180, letterSpacing: 24, wrap: 'nowrap' }),
    typographyShadows: index === 0
      ? [shadow(0, 0, 20, '#ff0000'), shadow(0, 0, 40, '#ff0000')]
      : [],
    pose: {
      operations: [
        translateZ(-index * 3),
        translateX(index * 1.2),
        translateY(index * 1.2),
      ],
    },
  }));
  const stack = box(layers[0], {
    frame: autoFrame('relative'),
    pose: { transformStyle: 'preserve-3d' },
  });
  addRest(stack, layers);
  const outer = box(stack, {
    frame: anchored({ x: '50%', y: 750, width: 'auto', height: 'auto' }),
    pose: { perspective: 1200, transformStyle: 'preserve-3d' },
  });
  return finish('type-depth-tilt', 'transparent', [outer], { stack });
}

function buildTypeCollageDepth(runtime) {
  const red = fill('rgba(255,0,0,0.15)', {
    effects: { blendMode: 'screen' },
    pose: { operations: [translateX(-8)] },
  });
  const blue = fill('rgba(0,0,255,0.10)', {
    effects: { blendMode: 'screen' },
    pose: { operations: [translateX(8)] },
  });
  const vignette = box(undefined, {
    frame: anchored({ x: 0, y: 0, right: 0, bottom: 0, width: undefined, height: undefined }),
    effects: {
      boxShadows: [{
        x: 0,
        y: 0,
        blur: 160,
        spread: 60,
        color: 'rgba(255,0,0,0.45)',
        inset: true,
      }],
    },
  });
  const scanlines = Array.from({ length: 20 }, (_, index) => box(undefined, {
    frame: anchored({ x: 0, right: 0, y: index * 96, width: undefined, height: 2 }),
    paint: { fill: 'rgba(0,0,0,0.08)' },
  }));
  const barRecords = [
    { y: 320, height: 18, x: -22 },
    { y: 780, height: 28, x: 24 },
    { y: 1380, height: 14, x: -18 },
  ];
  const glitchBars = barRecords.map((record) => box(undefined, {
    frame: anchored({ x: 0, right: 0, y: record.y, width: undefined, height: record.height }),
    opacity: 0,
    paint: { fill: 'rgba(255,0,0,0.25)' },
    pose: { operations: [translateX(record.x)] },
  }));
  const topText = impactText(runtime, {
    frame: autoFrame('static'),
    paint: { color: '#fff' },
    typography: impactTypography({
      family: 'Impact, "Arial Black", sans-serif',
      size: 72,
      letterSpacing: 8,
      weight: 400,
      shadows: [shadow(0, 0, 20, 'red'), shadow(0, 0, 40, 'red')],
    }),
    pose: { transformStyle: 'preserve-3d' },
  });
  const topGroup = layout(topText, {
    frame: anchored({ x: 0, right: 0, y: 180, width: undefined, height: 'auto' }),
    layout: { justify: 'center' },
    pose: { perspective: 800 },
  });
  const bottomText = impactText(runtime, {
    frame: autoFrame('static'),
    paint: { color: '#fff' },
    typography: impactTypography({ family: 'serif', size: 32, style: 'italic', weight: 400 }),
  });
  const bottomGroup = layout(bottomText, {
    frame: anchored({ x: 0, right: 0, bottom: 180, width: undefined, height: 'auto' }),
    layout: { justify: 'center' },
  });
  const flash = fill('#fff');
  const children = [
    red,
    blue,
    vignette,
    ...scanlines,
    ...glitchBars,
    topGroup,
    bottomGroup,
    flash,
  ];
  const content = layout(children[0], {
    frame: absoluteFillFrame(),
    layout: { direction: 'column' },
  });
  addRest(content, children);
  const parts = {
    bottomGroup,
    chroma: [red, blue],
    content,
    flash,
    glitchBars,
    topGroup,
    topText,
  };
  return finish(
    'type-collage-depth',
    'transparent',
    [content],
    parts,
    undefined,
    (stage) => ({ ...parts, stage }),
  );
}

function finish(recipe, background, children, parts, stagePose, mapParts = (stage) => ({ ...parts, stage })) {
  return { background, children, mapParts, parts, recipe, stagePose };
}

function addRest(parent, children) {
  for (let index = 1; index < children.length; index += 1) parent.addUnit(children[index]);
  return parent;
}

function box(unit, options) {
  return new ImpactVisualBox(unit, { ...options, name: 'impact-box' });
}

function layout(unit, options) {
  return new ImpactVisualLayout(unit, { ...options, name: 'impact-layout' });
}

function image(runtime, options) {
  const unit = runtime.images[runtime.imageIndex];
  runtime.imageIndex += 1;
  Object.assign(unit, visual(options));
  unit.fit = 'cover';
  return unit;
}

function impactText(runtime, options) {
  const unit = runtime.captions[runtime.textIndex];
  runtime.textIndex += 1;
  const type = {
    ...options.typography,
    shadows: options.typographyShadows ?? options.typography?.shadows ?? [],
  };
  const { typographyShadows: _typographyShadows, ...visualOptions } = options;
  const { typography: _typography, ...appearance } = visualOptions;
  Object.assign(unit, visual(appearance));
  unit.typography = typography(type);
  return unit;
}

function impactTypography(options = {}) {
  return {
    family: options.family ?? 'Impact',
    size: options.size,
    weight: options.weight ?? 900,
    style: options.style ?? 'normal',
    letterSpacing: options.letterSpacing ?? 0,
    align: options.align ?? 'left',
    lineHeight: 'normal',
    transform: options.transform ?? 'none',
    stroke: options.stroke,
    shadows: options.shadows ?? [],
    wrap: {
      whiteSpace: options.wrap ?? 'normal',
      wordBreak: 'normal',
      overflowWrap: 'normal',
      textOverflow: 'clip',
    },
  };
}

function fill(color, options = {}) {
  return box(undefined, {
    ...options,
    frame: absoluteFillFrame(),
    paint: { fill: color },
  });
}

function bindSemanticRole(owner, recipe, role) {
  IMPACT_ROLES.set(owner, Object.freeze({ recipe, role }));
}

function anchored(overrides = {}) {
  return {
    position: 'absolute',
    boxSizing: 'content-box',
    z: 'auto',
    ...overrides,
  };
}

function absoluteFillFrame() {
  return anchored({ x: 0, y: 0, right: 0, bottom: 0, width: '100%', height: '100%' });
}

function absoluteFull() {
  return anchored({ right: 'auto', bottom: 'auto', width: '100%', height: '100%' });
}

function absolutePixels(width, height) {
  return anchored({ right: 'auto', bottom: 'auto', width, height });
}

function staticFull() {
  return autoFrame('static', { width: '100%', height: '100%' });
}

function relativeFull() {
  return autoFrame('relative', { width: '100%', height: '100%' });
}

function autoFrame(position, overrides = {}) {
  return {
    position,
    right: 'auto',
    bottom: 'auto',
    width: 'auto',
    height: 'auto',
    boxSizing: 'content-box',
    z: 'auto',
    ...overrides,
  };
}

function shadow(x, y, blur, color) {
  return { x, y, blur, color };
}

function brightness(amount) {
  return { kind: 'brightness', amount };
}

function contrast(amount) {
  return { kind: 'contrast', amount };
}

function saturate(amount) {
  return { kind: 'saturate', amount };
}

function hueRotate(degrees) {
  return { kind: 'hue-rotate', degrees };
}

function dropShadow(x, y, blur, color) {
  return { kind: 'drop-shadow', x, y, blur, color };
}

function translateX(value) {
  return { kind: 'translate-x', value: typeof value === 'number' ? `${value}px` : value };
}

function translateY(value) {
  return { kind: 'translate-y', value: typeof value === 'number' ? `${value}px` : value };
}

function translateZ(z) {
  return { kind: 'translate-z', value: typeof z === 'number' ? `${z}px` : z };
}

function rotateX(degrees) {
  return { kind: 'rotate-x', degrees };
}

function rotateY(degrees) {
  return { kind: 'rotate-y', degrees };
}

function rotateZ(degrees) {
  return { kind: 'rotate-z', degrees };
}

function scale(value) {
  return { kind: 'scale-2d', x: value, y: value };
}

function depthRed(index) {
  return `rgb(${Math.round(204 - (((index - 1) / 18) * 153))}, 0, 0)`;
}

function depthOrange(index) {
  const red = Math.max(Math.floor(255 - (index * 12)), 50);
  const green = Math.max(Math.floor(100 - (index * 6)), 0);
  return `rgb(${red}, ${green}, 0)`;
}
