import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { clamp, lerp } from '@cut3/agent-memory/core/timeline';

const LINEAR = (value) => value;
const EASE_IN_QUAD = (value) => value * value;
const EASE_OUT_QUAD = (value) => 1 - ((1 - value) ** 2);
const EASE_OUT_CUBIC = (value) => 1 - ((1 - value) ** 3);
const RADIANS_TO_DEGREES = 180 / Math.PI;

const REFRAMES = Object.freeze({
  'vignette-push': frameRecipe(49, [frameSlot({
    fadeMs: 60,
    fadeEasing: EASE_OUT_QUAD,
    scale: channel(1, 1.1, EASE_OUT_CUBIC),
  })], { transformMode: 'scale-operation' }),
  'vertical-reveal': frameRecipe(61, [frameSlot({
    fadeMs: 60,
    y: channel(0, -30),
  })], { transformMode: 'translate-y-operation' }),
  'shutter-pullback': frameRecipe(61, [frameSlot({
    fadeMs: 60,
    scale: channel(1.08, 1),
  })]),
  'long-push': frameRecipe(158, [frameSlot({
    fadeMs: 80,
    scale: channel(1, 1.06),
  })], { transformMode: 'scale-operation' }),
  'lateral-drift': frameRecipe(61, [frameSlot({
    fadeMs: 60,
    scale: channel(1.1, 1.1),
    x: channel(0, -40),
  })], { transformMode: 'translate-x-scale-operation' }),
  'paired-tilt': segmentedFrameRecipe(68, [
    segmentedFrameSlot(0, 33, 33, {
      rotate: channel(0.052, 0),
      scale: channel(1.15, 1),
    }),
    segmentedFrameSlot(33, Infinity, 67, {
      rotate: channel(0, -0.052),
      scale: channel(1, 1.15),
    }),
  ]),
  'paired-snap': timeRecipe(67, [
    timeSlot(0, 558, {
      scale: channel(1.25, 1),
      x: channel(-40, 0),
    }),
    timeSlot(558, Infinity, {
      motionEnd: 1115,
      scale: channel(1, 1.25),
      x: channel(0, 40),
    }),
  ], { transformMode: 'translate-scale-operation' }),
  'blue-triptych': timeRecipe(135, [
    timeSlot(0, 743, {
      scale: channel(1.05, 1.05),
      x: channel(100, 0),
    }),
    timeSlot(743, 1486, {
      rotate: channel(0.07, 0),
      scale: channel(1.18, 1),
    }),
    timeSlot(1486, Infinity, {
      motionEnd: 2229,
      rotate: channel(0, -0.052),
      scale: channel(1, 1.18),
      y: channel(-50, 0),
    }),
  ], { transformMode: 'translate-rotate-scale-operation' }),
  'balanced-triptych': timeRecipe(135, [
    timeSlot(0, 750, {
      scale: channel(1, 1.12),
      x: channel(-40, 40),
    }),
    timeSlot(750, 1500, {
      rotate: channel(-0.087, 0),
      scale: channel(1.2, 1),
    }),
    timeSlot(1500, Infinity, {
      motionEnd: 2252,
      rotate: channel(0, 0.087),
      scale: channel(1, 1.15),
      y: channel(40, 0),
    }),
  ], { transformMode: 'scale-rotate-translate-operation' }),
  'graded-triptych': timeRecipe(134, [
    timeSlot(0, 750, {
      rotate: channel(-0.052, 0),
      scale: channel(1, 1.2, EASE_IN_QUAD),
    }),
    timeSlot(750, 1500, {
      rotate: channel(0, 0.052),
      scale: channel(1.2, 1, EASE_OUT_QUAD),
    }),
    timeSlot(1500, Infinity, {
      motionEnd: 2252,
      scale: channel(1, 1.2, EASE_IN_QUAD),
      y: channel(60, 0),
    }),
  ], {
    canvasExposure: true,
    contrast: 1.15,
    saturate: 1.2,
  }),
  'cross-pan-triptych': timeRecipe(130, [
    timeSlot(0, 758, {
      scale: channel(1, 1.12),
      y: channel(70, -70),
    }),
    timeSlot(758, 1516, {
      rotate: channel(0.07, 0),
      scale: channel(1.15, 1),
      x: channel(70, -70),
    }),
    timeSlot(1516, Infinity, {
      motionEnd: 2275,
      rotate: channel(-0.07, 0),
      scale: channel(1, 1.15),
      y: channel(-50, 0),
    }),
  ], { canvasExposure: true }),
  'cover-triptych': timeRecipe(135, [
    timeSlot(0, 743, {
      rotate: channel(0.052, 0),
      scale: channel(1, 1.12),
    }),
    timeSlot(743, 1486, {
      scale: channel(1.15, 1),
      x: channel(-60, 60),
    }),
    timeSlot(1486, 2229, {
      rotate: channel(-0.052, 0),
      scale: channel(1, 1.15),
    }),
  ], {
    coverFrame: Object.freeze({ height: 1920, width: 1440, x: -180, y: 0 }),
    contrast: 1.2,
    saturate: 1.3,
    transformMode: 'scale-rotate-operation',
  }),
  'vignette-triptych': timeRecipe(130, [
    timeSlot(0, 735, {
      rotate: channel(0, 0.052),
      scale: channel(1, 1.22),
    }),
    timeSlot(735, 1470, {
      rotate: channel(0.052, -0.052),
      scale: channel(1.22, 1),
    }),
    timeSlot(1470, Infinity, {
      motionEnd: 2206,
      rotate: channel(-0.052, 0),
      scale: channel(1, 1.22),
    }),
  ], { filters: [filter('saturate', 1.5), filter('contrast', 1.1)] }),
  'counterturn-triptych': timeRecipe(135, [
    timeSlot(0, 743, {
      rotate: channel(0.087, 0),
      scale: channel(1.18, 1),
    }),
    timeSlot(743, 1486, {
      scale: channel(1, 1.18),
      y: channel(60, -60),
    }),
    timeSlot(1486, Infinity, {
      motionEnd: 2229,
      rotate: channel(-0.087, 0),
      scale: channel(1.18, 1),
      x: channel(40, 0),
    }),
  ], { canvasExposure: true }),
  'four-beat-fade': timeRecipe(202, [
    timeSlot(0, 600, {
      rotate: channel(0.052, 0),
      scale: channel(1, 1.15),
    }),
    timeSlot(600, 1200, {
      rotate: channel(0, -0.052),
      scale: channel(1.15, 1),
    }),
    timeSlot(1200, 1800, {
      scale: channel(1, 1.15),
      x: channel(-50, 0),
    }),
    timeSlot(1800, Infinity, {
      motionEnd: 2996,
      scale: channel(1, 1.12),
    }),
  ], { transformMode: 'rotate-scale-translate-operation' }),
  'wide-angle-triptych': timeRecipe(137, [
    timeSlot(0, 751, {
      scale: channel(1, 1),
      y: channel(-60, 60),
    }),
    timeSlot(751, 1502, {
      rotate: channel(-0.1, 0),
      scale: channel(1.2, 1),
    }),
    timeSlot(1502, Infinity, {
      motionEnd: 2253,
      rotate: channel(0, 0.1),
      scale: channel(1, 1.2),
      x: channel(0, 50),
    }),
  ], { canvasExposure: true }),
  'scatter-five': scatterRecipe(134, [
    scatterSlot(580, 750, 520, 0.21, 1300, 100),
    scatterSlot(905, 280, 820, -0.14, -350, 1000),
    scatterSlot(1138, 580, 1150, 0.09, 580, -600),
    scatterSlot(1486, 200, 1400, -0.24, -450, 1600),
    scatterSlot(1741, 820, 1100, 0.05, 1400, 900),
  ]),
});

/** Complete owner-only law for visibility, crop, pose and grade of one authored image slot. */
export class ShutterFlashReframe extends Behaviour {
  static kind = 'behaviour.flash-photo.shutter-flash-reframe';

  #recipe;

  #slot;

  #role;

  constructor(unit, recipe, slotIndex, role = 'media-direct') {
    super(requireReframeOwner(unit, role));
    this.#recipe = REFRAMES[String(recipe)];
    if (!this.#recipe) throw new TypeError('ShutterFlashReframe recipe is not authored');
    this.#slot = this.#recipe.slots[slotIndex];
    if (!this.#slot) throw new TypeError('ShutterFlashReframe slot is not authored');
    this.#role = String(role);
  }

  onFrame({ frame, fps }) {
    const sample = sampleSlot(this.#recipe, this.#slot, frame, fps);
    this.unit.present = !this.#recipe.mountActive || sample.opacity > 0;

    if (this.#role.startsWith('media-')) this.#applyMedia(sample);
    if (this.#role === 'canvas-media') this.#applyCanvas(sample, frame, fps);
    if (this.#role === 'motion' || this.#role === 'motion-visible') this.#applyMotion(sample);
    if (this.#role === 'cover-motion-visible') this.#applyCover(sample);
    if (this.#role === 'visibility' || this.#role === 'motion-visible') {
      this.unit.opacity = sample.opacity;
    }
  }

  #applyMedia(sample) {
    const fillStatic = this.#role === 'media-fill-static';
    this.unit.fit = fillStatic ? 'fill' : this.#recipe.fit;
    this.unit.position = { x: 0.5, y: 0.5 };
    this.unit.frame = {
      ...this.unit.frame,
      x: sample.frameX,
      y: sample.frameY,
      width: fillStatic ? '100%' : this.#recipe.width,
      height: fillStatic ? '100%' : this.#recipe.height,
    };
    this.unit.opacity = this.#role === 'media-static' || fillStatic ? 1 : sample.opacity;
    this.unit.pose = this.#role === 'media-direct'
      ? motionPose(this.unit.pose, this.#recipe, sample)
      : identityPose(this.unit.pose);
    this.unit.effects = {
      ...this.unit.effects,
      contrast: fillStatic ? 1 : this.#recipe.contrast,
      filters: fillStatic ? [] : this.#recipe.filters,
      saturate: fillStatic ? 1 : this.#recipe.saturate,
      shadow: fillStatic ? 'none' : this.#recipe.shadow,
    };
  }

  #applyMotion(sample) {
    this.unit.pose = motionPose(this.unit.pose, this.#recipe, sample);
  }

  #applyCover(sample) {
    const cover = this.#recipe.coverFrame;
    const x = cover.x + sample.x;
    const y = cover.y + sample.y;
    this.unit.effects = {
      ...this.unit.effects,
      contrast: this.#recipe.contrast,
      saturate: this.#recipe.saturate,
    };
    this.unit.frame = {
      ...this.unit.frame,
      height: cover.height,
      width: cover.width,
      x,
      y,
    };
    this.unit.opacity = sample.opacity;
    this.unit.pose = {
      ...motionPose(this.unit.pose, this.#recipe, sample),
      origin: { x: 540 - x, y: 960 - y, z: 0 },
    };
  }

  #applyCanvas(sample, frame, fps) {
    this.unit.frameState = Object.freeze({
      exposure: canvasExposure(this.#recipe, frame, fps),
      frameX: sample.frameX,
      frameY: sample.frameY,
      opacity: sample.opacity,
      rotate: sample.rotate,
      scale: sample.scale,
      x: sample.x,
      y: sample.y,
    });
    this.unit.opacity = sample.opacity;
  }
}

function requireReframeOwner(unit, role) {
  const value = String(role);
  const imageRole = value.startsWith('media-');
  const expected = imageRole
    ? 'unit.image'
    : value === 'canvas-media'
      ? 'unit.flash-photo.canvas-frame'
      : 'unit.flash-photo.frame';
  if (unit?.constructor?.kind !== expected) {
    throw new TypeError(`ShutterFlashReframe ${value} requires ${expected}`);
  }
  if (![
    'media-direct', 'media-fill-static', 'media-static', 'media-visible',
    'canvas-media', 'cover-motion-visible', 'motion', 'motion-visible', 'visibility',
  ].includes(value)) {
    throw new TypeError('ShutterFlashReframe role is not authored');
  }
  return unit;
}

function motionPose(previous, recipeValue, sample) {
  const authoredOperations = transformOperations(recipeValue.transformMode, sample);
  if (authoredOperations) {
    return {
      ...previous,
      operations: authoredOperations,
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
      x: 0,
      y: 0,
    };
  }
  return {
    ...previous,
    operations: recipeValue.scatter
      ? [{ kind: 'translate-2d', x: '-50%', y: '-50%' }]
      : [],
    rotate: sample.rotate * RADIANS_TO_DEGREES,
    scaleX: sample.scale,
    scaleY: sample.scale,
    x: sample.x,
    y: sample.y,
  };
}

function transformOperations(mode, sample) {
  if (mode === 'scale-operation') {
    return [{ kind: 'scale-2d', x: sample.scale, y: sample.scale }];
  }
  if (mode === 'translate-y-operation') {
    return [{ kind: 'translate-y', value: sample.y }];
  }
  if (mode === 'translate-scale-operation') {
    return [
      { kind: 'translate-2d', x: sample.x, y: sample.y },
      { kind: 'scale-2d', x: sample.scale, y: sample.scale },
    ];
  }
  if (mode === 'translate-x-scale-operation') {
    return [
      { kind: 'translate-x', value: sample.x },
      { kind: 'scale-2d', x: sample.scale, y: sample.scale },
    ];
  }
  if (mode === 'translate-rotate-scale-operation') {
    return [
      { kind: 'translate-2d', x: sample.x, y: sample.y },
      { kind: 'rotate-z', degrees: sample.rotate * RADIANS_TO_DEGREES },
      { kind: 'scale-2d', x: sample.scale, y: sample.scale },
    ];
  }
  if (mode === 'scale-rotate-translate-operation') {
    return [
      { kind: 'scale-2d', x: sample.scale, y: sample.scale },
      { kind: 'rotate-z', degrees: sample.rotate * RADIANS_TO_DEGREES },
      { kind: 'translate-2d', x: sample.x, y: sample.y },
    ];
  }
  if (mode === 'scale-rotate-operation') {
    return [
      { kind: 'scale-2d', x: sample.scale, y: sample.scale },
      { kind: 'rotate-z', degrees: sample.rotate * RADIANS_TO_DEGREES },
    ];
  }
  if (mode === 'rotate-scale-translate-operation') {
    return [
      { kind: 'rotate-z', degrees: sample.rotate * RADIANS_TO_DEGREES },
      { kind: 'scale-2d', x: sample.scale, y: sample.scale },
      { kind: 'translate-2d', x: sample.x, y: sample.y },
    ];
  }
  return null;
}

function identityPose(previous) {
  return {
    ...previous,
    operations: [],
    rotate: 0,
    scaleX: 1,
    scaleY: 1,
    x: 0,
    y: 0,
  };
}

function frameRecipe(durationFrames, slots, options = {}) {
  return recipe(durationFrames, slots, { ...options, basis: 'frame' });
}

function timeRecipe(durationFrames, slots, options = {}) {
  return recipe(durationFrames, slots, {
    ...options,
    basis: 'time',
    mountActive: options.mountActive ?? true,
  });
}

function segmentedFrameRecipe(durationFrames, slots, options = {}) {
  return recipe(durationFrames, slots, {
    ...options,
    basis: 'segmented-frame',
    mountActive: options.mountActive ?? true,
  });
}

function scatterRecipe(durationFrames, slots) {
  return recipe(durationFrames, slots, {
    basis: 'scatter',
    fit: 'contain',
    height: 'auto',
    mountActive: true,
    scatter: true,
    shadow: '6px 8px 25px rgba(0,0,0,0.6)',
    width: 620,
  });
}

function recipe(durationFrames, slots, options = {}) {
  return Object.freeze({
    basis: options.basis,
    canvasExposure: options.canvasExposure === true,
    coverFrame: options.coverFrame ?? null,
    contrast: options.contrast ?? 1,
    durationFrames,
    fit: options.fit ?? 'cover',
    filters: Object.freeze(options.filters ?? []),
    height: options.height ?? '100%',
    mountActive: options.mountActive === true,
    saturate: options.saturate ?? 1,
    scatter: options.scatter === true,
    shadow: options.shadow ?? 'none',
    slots: Object.freeze(slots),
    transformMode: options.transformMode ?? 'pose',
    width: options.width ?? '100%',
  });
}

function canvasExposure(recipeValue, frame, fps) {
  if (!recipeValue.canvasExposure) return 0;
  const time = (frame / fps) * 1000;
  return recipeValue.slots.reduce((peak, slotValue) => {
    const elapsed = time - slotValue.start;
    const active = Number(elapsed >= 0 && elapsed < 80);
    return Math.max(peak, active * 0.9 * (1 - clamp(elapsed / 80)));
  }, 0);
}

function frameSlot(options = {}) {
  return slot({
    end: Infinity,
    fadeEasing: options.fadeEasing ?? LINEAR,
    fadeMs: options.fadeMs,
    rotate: options.rotate,
    scale: options.scale,
    start: -Infinity,
    x: options.x,
    y: options.y,
  });
}

function timeSlot(start, end, options = {}) {
  return slot({ ...options, end, motionEnd: options.motionEnd ?? end, start });
}

function segmentedFrameSlot(start, end, motionEnd, options = {}) {
  return slot({ ...options, end, motionEnd, start });
}

function scatterSlot(start, x, y, rotate, fromX, fromY) {
  return Object.freeze({
    end: Infinity,
    fromX,
    fromY,
    rotate: channel(rotate, rotate),
    scale: channel(1, 1),
    start,
    x: channel(fromX, x, EASE_OUT_QUAD),
    y: channel(fromY, y, EASE_OUT_QUAD),
  });
}

function slot(options) {
  return Object.freeze({
    end: options.end,
    fadeEasing: options.fadeEasing ?? LINEAR,
    fadeMs: options.fadeMs ?? 0,
    motionEnd: options.motionEnd ?? options.end,
    rotate: options.rotate ?? channel(0, 0),
    scale: options.scale ?? channel(1, 1),
    start: options.start,
    x: options.x ?? channel(0, 0),
    y: options.y ?? channel(0, 0),
  });
}

function channel(from, to, easing = LINEAR) {
  return Object.freeze({ easing, from, to });
}

function filter(kind, amount) {
  return Object.freeze({ amount, kind });
}

function sampleSlot(recipeValue, slotValue, frame, fps) {
  if (recipeValue.basis === 'frame') return sampleFrame(recipeValue, slotValue, frame, fps);
  if (recipeValue.basis === 'segmented-frame') return sampleSegmentedFrame(slotValue, frame);
  const time = (frame / fps) * 1000;
  if (recipeValue.basis === 'scatter') return sampleScatter(slotValue, time);
  return sampleTime(slotValue, time);
}

function sampleSegmentedFrame(slotValue, frame) {
  const amount = clamp((frame - slotValue.start) / (slotValue.motionEnd - slotValue.start));
  const visible = Number(frame >= slotValue.start && frame < slotValue.end);
  return sampled(slotValue, amount, visible);
}

function sampleFrame(recipeValue, slotValue, frame, fps) {
  const amount = clamp(frame / recipeValue.durationFrames);
  const fadeFrames = Math.max(1, Math.round((slotValue.fadeMs / 1000) * fps));
  const fadeAmount = clamp(frame / fadeFrames);
  return sampled(slotValue, amount, slotValue.fadeEasing(fadeAmount));
}

function sampleTime(slotValue, time) {
  const amount = clamp((time - slotValue.start) / (slotValue.motionEnd - slotValue.start));
  const visible = Number(time >= slotValue.start && time < slotValue.end);
  return sampled(slotValue, amount, visible);
}

function sampleScatter(slotValue, time) {
  const amount = clamp((time - slotValue.start) / 100);
  const visible = Number(time >= slotValue.start);
  return {
    frameX: sampleChannel(slotValue.x, amount),
    frameY: sampleChannel(slotValue.y, amount),
    opacity: visible,
    rotate: sampleChannel(slotValue.rotate, amount),
    scale: sampleChannel(slotValue.scale, amount),
    x: 0,
    y: 0,
  };
}

function sampled(slotValue, amount, opacity) {
  return {
    frameX: 0,
    frameY: 0,
    opacity,
    rotate: sampleChannel(slotValue.rotate, amount),
    scale: sampleChannel(slotValue.scale, amount),
    x: sampleChannel(slotValue.x, amount),
    y: sampleChannel(slotValue.y, amount),
  };
}

function sampleChannel(value, amount) {
  return lerp(value.from, value.to, value.easing(amount));
}
