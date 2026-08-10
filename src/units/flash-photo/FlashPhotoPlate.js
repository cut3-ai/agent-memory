import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';

export const FLASH_PHOTO_VARIANTS = Object.freeze([
  'vignette-push',
  'vertical-reveal',
  'shutter-pullback',
  'long-push',
  'lateral-drift',
  'paired-tilt',
  'paired-snap',
  'blue-triptych',
  'balanced-triptych',
  'graded-triptych',
  'cross-pan-triptych',
  'cover-triptych',
  'vignette-triptych',
  'counterturn-triptych',
  'four-beat-fade',
  'wide-angle-triptych',
  'scatter-five',
]);

const STRUCTURES = Object.freeze({
  'vignette-push': structure(1, 49, '#0a0a0a', {
    backgrounds: [radial([
      stop(0.5, 'transparent'),
      stop(0.78, 'rgba(0,0,0,0.45)'),
      stop(1, 'rgba(0,0,0,0.85)'),
    ])],
    scanlines: true,
    slotLayout: 'motion-over-visible-media',
  }),
  'vertical-reveal': structure(1, 61, '#0a0a0a', {
    backgrounds: [radial([
      stop(0.55, 'transparent'),
      stop(1, 'rgba(0,0,0,0.55)'),
    ])],
    imageHeight: 1920,
    imageWidth: 1080,
    slotLayout: 'clipped-motion-over-visible-media',
  }),
  'shutter-pullback': structure(1, 61, '#0a0a0a', {
    backgrounds: [radial([
      stop(0.5, 'transparent'),
      stop(0.75, 'rgba(0,0,0,0.45)'),
      stop(1, 'rgba(0,0,0,0.80)'),
    ])],
  }),
  'long-push': structure(1, 158, '#0a0a0a', {
    backgrounds: [radial([
      stop(0.55, 'transparent'),
      stop(1, 'rgba(0,0,0,0.5)'),
    ])],
    slotLayout: 'visibility-over-motion-over-media',
    staticFlow: true,
  }),
  'lateral-drift': structure(1, 61, '#050505', {
    backgrounds: [radial([
      stop(0.4, 'transparent'),
      stop(0.85, 'rgba(0,0,0,0.55)'),
      stop(1, 'rgba(0,0,0,0.85)'),
    ])],
    slotLayout: 'motion-visible-over-media',
    staticFlow: true,
  }),
  'paired-tilt': structure(2, 68, '#000000', {
    flashExposure: true,
    flashPresentation: 'opacity',
  }),
  'paired-snap': structure(2, 67, '#000000', {
    flashExposure: true,
    flashPresentation: 'rgba',
  }),
  'blue-triptych': structure(3, 135, '#000000', {
    fill: 'rgba(30,60,255,0.08)',
    flashExposure: true,
    flashPresentation: 'rgba',
  }),
  'balanced-triptych': structure(3, 135, '#000000', {
    flashExposure: true,
    flashPresentation: 'rgba',
    slotLayout: 'motion-over-visible-media',
    staticMedia: true,
  }),
  'graded-triptych': structure(3, 134, '#000000', {
    canvasFill: '#000000',
    canvasExposure: true,
    contrast: 1.15,
    saturate: 1.2,
    slotLayout: 'canvas-cover',
  }),
  'cross-pan-triptych': structure(3, 130, '#000000', {
    canvasExposure: true,
    slotLayout: 'canvas-cover',
  }),
  'cover-triptych': structure(3, 135, '#000000', {
    contrast: 1.2,
    flashExposure: true,
    flashPresentation: 'rgba',
    saturate: 1.3,
    slotLayout: 'authored-cover-geometry',
  }),
  'vignette-triptych': structure(3, 130, '#000000', {
    backgrounds: [radial([
      stop(0.35, 'transparent'),
      stop(1, 'rgba(0,0,0,0.45)'),
    ])],
    filters: [effectFilter('saturate', 1.5), effectFilter('contrast', 1.1)],
    flashExposure: true,
    flashPresentation: 'opacity',
  }),
  'counterturn-triptych': structure(3, 135, '#000000', {
    canvasExposure: true,
    slotLayout: 'canvas-cover',
  }),
  'four-beat-fade': structure(4, 202, '#000000', {
    fill: '#000000',
    flashExposure: true,
    flashPresentation: 'rgba',
    gradeFade: true,
    gradeOpacity: 0,
    gradePresentation: 'rgba',
    slotLayout: 'visibility-over-motion-over-media',
  }),
  'wide-angle-triptych': structure(3, 137, '#000000', {
    canvasFill: '#000000',
    canvasExposure: true,
    slotLayout: 'canvas-cover',
  }),
  'scatter-five': structure(5, 134, 'transparent', {
    imageHeight: 'auto',
    imageWidth: 620,
    slotLayout: 'canvas-scatter',
  }),
});

/** Authored DOM scanline texture; each stripe preserves CSS alpha compositing. */
export class FlashPhotoTexture extends Layer {
  static kind = 'unit.flash-photo.texture';

  constructor(enabled) {
    super(undefined, {
      frame: { x: 0, y: 0, width: '100%', height: '100%', z: 101 },
      opacity: enabled ? 1 : 0,
      name: 'flash-photo-scanline-texture',
    });
    if (enabled) scanlineStripes().forEach((stripe) => this.addUnit(stripe));
  }
}

/** Semantic state for one native-canvas photo slot; hosts own the actual canvas and resource. */
export class FlashPhotoCanvasFrame extends Layer {
  static kind = 'unit.flash-photo.canvas-frame';

  constructor(image, metadata, index, authored) {
    super(undefined, {
      frame: { x: 0, y: 0, width: '100%', height: '100%', z: index },
      opacity: 0,
      name: 'flash-photo-native-frame',
    });
    this.canvas = Object.freeze({ height: 1920, width: 1080 });
    this.frameState = initialCanvasFrameState();
    this.media = Object.freeze({ height: metadata.height, width: metadata.width });
    this.rendering = Object.freeze({
      contrast: authored.contrast,
      fill: authored.canvasFill,
      mode: authored.slotLayout === 'canvas-scatter' ? 'scatter' : 'cover',
      saturate: authored.saturate,
    });
    this.source = image.source;
  }

  /** Run this authored family function against a host-owned native 2D context and resource. */
  draw(context, resource, state = this) {
    drawFlashPhotoCanvasFrame(context, resource, state);
  }
}

/** Draw one projected photo frame directly; this is family code, not a command interpreter. */
export function drawFlashPhotoCanvasFrame(context, resource, state) {
  if (!context || typeof context.drawImage !== 'function') {
    throw new TypeError('drawFlashPhotoCanvasFrame requires a CanvasRenderingContext2D');
  }
  if (resource == null) {
    throw new TypeError('drawFlashPhotoCanvasFrame requires a host-resolved image resource');
  }
  if (!state?.canvas || !state?.media || !state?.rendering || !state?.frameState) {
    throw new TypeError('drawFlashPhotoCanvasFrame requires projected flash-photo state');
  }

  const { height, width } = state.canvas;
  context.save();
  try {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.filter = 'none';
    resetShadow(context);
    context.clearRect(0, 0, width, height);
    if (state.rendering.fill !== 'transparent') {
      context.fillStyle = state.rendering.fill;
      context.fillRect(0, 0, width, height);
    }
    if (state.present === false || state.frameState.opacity <= 0) return;

    context.save();
    try {
      if (state.rendering.mode === 'scatter') drawScatterFrame(context, resource, state);
      else drawCoverFrame(context, resource, state);
    } finally {
      context.restore();
    }

    if (state.frameState.exposure > 0) {
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
      context.filter = 'none';
      resetShadow(context);
      context.fillStyle = `rgba(255,255,255,${state.frameState.exposure})`;
      context.fillRect(0, 0, width, height);
    }
  } finally {
    context.restore();
  }
}

function drawCoverFrame(context, resource, state) {
  const { frameState, media, rendering } = state;
  const { height: canvasHeight, width: canvasWidth } = state.canvas;
  const coverScale = Math.max(canvasWidth / media.width, canvasHeight / media.height);
  const width = media.width * coverScale;
  const height = media.height * coverScale;
  context.translate(canvasWidth / 2, canvasHeight / 2);
  context.rotate(frameState.rotate);
  context.scale(frameState.scale, frameState.scale);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.filter = canvasFilter(rendering);
  resetShadow(context);
  context.drawImage(
    resource,
    (-width / 2) + frameState.x,
    (-height / 2) + frameState.y,
    width,
    height,
  );
}

function drawScatterFrame(context, resource, state) {
  const { frameState, media } = state;
  const width = 620;
  const height = width * (media.height / media.width);
  context.translate(frameState.frameX, frameState.frameY);
  context.rotate(frameState.rotate);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.filter = 'none';
  context.shadowOffsetX = 6;
  context.shadowOffsetY = 8;
  context.shadowBlur = 25;
  context.shadowColor = 'rgba(0,0,0,0.6)';
  context.drawImage(resource, -width / 2, -height / 2, width, height);
}

function canvasFilter({ contrast, saturate }) {
  return [
    ...(contrast === 1 ? [] : [`contrast(${contrast})`]),
    ...(saturate === 1 ? [] : [`saturate(${saturate})`]),
  ].join(' ') || 'none';
}

function resetShadow(context) {
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.shadowBlur = 0;
  context.shadowColor = 'rgba(0,0,0,0)';
}

function initialCanvasFrameState() {
  return Object.freeze({
    exposure: 0,
    frameX: 0,
    frameY: 0,
    opacity: 0,
    rotate: 0,
    scale: 1,
    x: 0,
    y: 0,
  });
}

/** Semantic authored frame used when motion and media compositing live on distinct owners. */
export class FlashPhotoFrame extends Layer {
  static kind = 'unit.flash-photo.frame';

  constructor(unit, role, options = {}) {
    super(unit, {
      frame: {
        x: 0,
        y: 0,
        width: '100%',
        height: '100%',
        position: options.position ?? 'absolute',
        z: options.z ?? 0,
      },
      overflow: options.overflow ?? 'visible',
      name: `flash-photo-${role}-frame`,
    });
    this.role = String(role);
  }
}

/** Semantic color-grade plate; animated only when an authored grade fade exists. */
export class ShutterGradePlate extends Box {
  static kind = 'unit.flash-photo.grade-plate';

  constructor(authored) {
    super(undefined, {
      frame: { x: 0, y: 0, width: '100%', height: '100%', z: 100 },
      opacity: authored.gradeOpacity,
      paint: {
        backgrounds: authored.backgrounds,
        fill: authored.fill,
      },
      name: 'flash-photo-grade',
    });
    this.presentation = authored.gradePresentation;
  }
}

/** Semantic white shutter-exposure plate; animated only for authored flash cuts. */
export class ShutterExposurePlate extends Box {
  static kind = 'unit.flash-photo.exposure-plate';

  constructor(authored) {
    super(undefined, {
      frame: { x: 0, y: 0, width: '100%', height: '100%', z: 102 },
      opacity: 0,
      paint: { fill: '#ffffff' },
      present: false,
      name: 'flash-photo-exposure',
    });
    this.presentation = authored.flashPresentation;
  }
}

/** Runtime photographs plus renderer-neutral grade, texture and exposure plates. */
export class FlashPhotoPlate extends Layer {
  static kind = 'unit.flash-photo.plate';

  #animationTargets;

  constructor(images, recipe, mediaMetadata = []) {
    const authored = STRUCTURES[String(recipe)];
    if (!authored) throw new TypeError('FlashPhotoPlate recipe is not authored');
    if (!Array.isArray(images) || images.length !== authored.cardinality) {
      throw new TypeError('FlashPhotoPlate runtime image cardinality does not match its recipe');
    }
    images.forEach((image, index) => {
      requireUnit(image, `FlashPhotoPlate image ${index}`);
      requireDetachedUnit(image, `FlashPhotoPlate image ${index}`);
      if (image.constructor.kind !== 'unit.image') {
        throw new TypeError('FlashPhotoPlate requires Image Units');
      }
    });

    super(undefined, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      overflow: 'hidden',
      paint: { fill: authored.background },
      name: 'flash-photo-plate',
    });

    const canvasMetadata = authored.slotLayout.startsWith('canvas-')
      ? requireCanvasMetadata(mediaMetadata, authored.cardinality)
      : [];
    const imageSlots = images.map((image, index) => {
      const authoredCover = authored.slotLayout === 'authored-cover-geometry';
      const authoredCanvas = authored.slotLayout.startsWith('canvas-');
      image.effects = {
        ...image.effects,
        contrast: authoredCover || authoredCanvas ? 1 : authored.contrast,
        filters: authoredCover || authoredCanvas ? [] : authored.filters,
        saturate: authoredCover || authoredCanvas ? 1 : authored.saturate,
        shadow: authoredCover || authoredCanvas ? 'none' : authored.imageShadow,
      };
      image.fit = authoredCover ? 'fill' : authored.imageHeight === 'auto' ? 'contain' : 'cover';
      image.frame = {
        ...image.frame,
        x: 0,
        y: 0,
        width: authored.imageWidth,
        height: authored.imageHeight,
        z: authored.slotLayout === 'direct' ? index : 0,
      };
      image.position = { x: 0.5, y: 0.5 };
      const slot = createImageSlot(image, authored, index, canvasMetadata[index]);
      slot.roots.forEach((root) => this.addUnit(root));
      return slot;
    });

    const grade = new ShutterGradePlate(authored);
    const texture = new FlashPhotoTexture(authored.scanlines);
    const exposure = new ShutterExposurePlate(authored);

    this.addUnit(grade);
    this.addUnit(texture);
    this.addUnit(exposure);

    const exposureLaws = [];
    if (authored.flashExposure) {
      exposureLaws.push(Object.freeze({ channel: 'flash', owner: exposure, role: 'exposure' }));
    }
    if (authored.gradeFade) {
      exposureLaws.push(Object.freeze({ channel: 'grade', owner: grade, role: 'grade' }));
    }
    this.#animationTargets = Object.freeze({
      exposure: Object.freeze({ channel: 'flash', owner: exposure, role: 'exposure' }),
      exposureLaws: Object.freeze(exposureLaws),
      grade: Object.freeze({ channel: 'grade', owner: grade, role: 'grade' }),
      images: Object.freeze(images.map((owner, index) => Object.freeze({
        index,
        owner,
        role: 'image',
      }))),
      reframes: Object.freeze(imageSlots.flatMap((slot) => slot.targets)),
    });
  }

  /** Named projection owners; application code never depends on child positions. */
  animationTargets() {
    return this.#animationTargets;
  }
}

function structure(cardinality, durationFrames, background, options = {}) {
  return Object.freeze({
    background,
    backgrounds: Object.freeze(options.backgrounds ?? []),
    canvasFill: options.canvasFill ?? 'transparent',
    canvasExposure: options.canvasExposure === true,
    cardinality,
    contrast: options.contrast ?? 1,
    durationFrames,
    fill: options.fill ?? 'transparent',
    filters: Object.freeze(options.filters ?? []),
    flashExposure: options.flashExposure === true,
    flashPresentation: options.flashPresentation ?? 'opacity',
    gradeFade: options.gradeFade === true,
    gradeOpacity: options.gradeOpacity ?? 1,
    gradePresentation: options.gradePresentation ?? 'opacity',
    imageHeight: options.imageHeight ?? '100%',
    imageShadow: options.imageShadow ?? 'none',
    imageWidth: options.imageWidth ?? '100%',
    saturate: options.saturate ?? 1,
    scanlines: options.scanlines === true,
    slotLayout: options.slotLayout ?? 'direct',
    staticFlow: options.staticFlow === true,
    staticMedia: options.staticMedia === true,
  });
}

function createImageSlot(image, authored, index, metadata) {
  const { slotLayout: layout } = authored;
  const media = (role) => Object.freeze({ index, owner: image, role });
  const target = (owner, role) => Object.freeze({ index, owner, role });
  if (layout === 'motion-over-visible-media' || layout === 'clipped-motion-over-visible-media') {
    if (authored.staticMedia) image.frame = { ...image.frame, position: 'static' };
    const motion = new FlashPhotoFrame(image, 'motion', {
      overflow: layout === 'clipped-motion-over-visible-media' ? 'hidden' : 'visible',
      z: index,
    });
    return Object.freeze({
      roots: Object.freeze([motion]),
      targets: Object.freeze([media('media-visible'), target(motion, 'motion')]),
    });
  }
  if (layout === 'visibility-over-motion-over-media') {
    if (authored.staticFlow) image.frame = { ...image.frame, position: 'static' };
    const motion = new FlashPhotoFrame(image, 'motion', {
      position: authored.staticFlow ? 'static' : 'absolute',
    });
    const visibility = new FlashPhotoFrame(motion, 'visibility', {
      overflow: 'hidden',
      position: authored.staticFlow ? 'static' : 'absolute',
      z: index,
    });
    return Object.freeze({
      roots: Object.freeze([visibility]),
      targets: Object.freeze([
        media('media-static'),
        target(motion, 'motion'),
        target(visibility, 'visibility'),
      ]),
    });
  }
  if (layout === 'motion-visible-over-media') {
    if (authored.staticFlow) image.frame = { ...image.frame, position: 'static' };
    const motion = new FlashPhotoFrame(image, 'motion-visible', {
      position: authored.staticFlow ? 'static' : 'absolute',
      z: index,
    });
    return Object.freeze({
      roots: Object.freeze([motion]),
      targets: Object.freeze([media('media-static'), target(motion, 'motion-visible')]),
    });
  }
  if (layout === 'authored-cover-geometry') {
    const motion = new FlashPhotoFrame(image, 'cover-motion-visible', { z: index });
    motion.frame = { ...motion.frame, height: 1920, width: 1440, x: -180, y: 0 };
    return Object.freeze({
      roots: Object.freeze([motion]),
      targets: Object.freeze([
        media('media-fill-static'),
        target(motion, 'cover-motion-visible'),
      ]),
    });
  }
  if (layout === 'canvas-cover' || layout === 'canvas-scatter') {
    image.frame = { ...image.frame, height: 0, width: 0, x: 0, y: 0, z: -1 };
    image.opacity = 0;
    const canvas = new FlashPhotoCanvasFrame(image, metadata, index, authored);
    return Object.freeze({
      roots: Object.freeze([image, canvas]),
      targets: Object.freeze([target(canvas, 'canvas-media')]),
    });
  }
  return Object.freeze({
    roots: Object.freeze([image]),
    targets: Object.freeze([media('media-direct')]),
  });
}

function requireCanvasMetadata(value, cardinality) {
  if (!Array.isArray(value) || value.length !== cardinality) {
    throw new TypeError('FlashPhotoPlate canvas metadata cardinality does not match its recipe');
  }
  return value.map((entry, index) => {
    if (
      !entry
      || !Number.isFinite(entry.width)
      || entry.width <= 0
      || !Number.isFinite(entry.height)
      || entry.height <= 0
    ) throw new TypeError(`FlashPhotoPlate canvas metadata ${index} is invalid`);
    return Object.freeze({ height: entry.height, width: entry.width });
  });
}

function radial(stops) {
  return Object.freeze({
    kind: 'radial-gradient',
    position: Object.freeze({ x: 'center', y: 'center' }),
    shape: 'ellipse',
    stops: Object.freeze(stops),
  });
}

function stop(offset, color) {
  return Object.freeze({ color, offset });
}

function effectFilter(kind, amount) {
  return Object.freeze({ amount, kind });
}

function scanlineStripes() {
  return Array.from({ length: 480 }, (_, index) => new Box(undefined, {
    // A zero-degree CSS gradient advances bottom-to-top. Since 1920 is an exact
    // multiple of the authored four-pixel period, its terminal dark band is on top.
    frame: { x: 0, y: index * 4, width: '100%', height: 2 },
    paint: { fill: 'rgba(0,0,0,0.03)' },
    name: 'flash-photo-scanline',
  }));
}
