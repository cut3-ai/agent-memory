import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { flashPhotoShutter } from '@cut3/agent-memory/compositions/FlashPhotoShutter';
import { ExposureBloom } from '@cut3/agent-memory/behaviours/flash-photo/ExposureBloom';
import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { publicSnapshot } from '@cut3/agent-memory/core/state';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import {
  FLASH_PHOTO_VARIANTS,
  FlashPhotoCanvasFrame,
  FlashPhotoPlate,
  FlashPhotoTexture,
  ShutterExposurePlate,
  ShutterGradePlate,
} from '@cut3/agent-memory/units/flash-photo/FlashPhotoPlate';

const LINEAR = (value) => value;
const EASE_IN_QUAD = (value) => value * value;
const EASE_OUT_QUAD = (value) => 1 - ((1 - value) ** 2);
const EASE_OUT_CUBIC = (value) => 1 - ((1 - value) ** 3);
const TO_DEGREES = 180 / Math.PI;

const recipes = Object.freeze({
  'vignette-push': frames(49, 60, EASE_OUT_QUAD, {
    scale: motion(1, 1.1, EASE_OUT_CUBIC),
  }),
  'vertical-reveal': frames(61, 60, LINEAR, {
    y: motion(0, -30),
  }),
  'shutter-pullback': frames(61, 60, LINEAR, {
    scale: motion(1.08, 1),
  }),
  'long-push': frames(158, 80, LINEAR, {
    scale: motion(1, 1.06),
  }, { staticFlow: true }),
  'lateral-drift': frames(61, 60, LINEAR, {
    scale: motion(1.1, 1.1),
    x: motion(0, -40),
  }, { staticFlow: true }),
  'paired-tilt': segmentedFrames(68, [
    segment(0, 33, { rotate: motion(0.052, 0), scale: motion(1.15, 1) }),
    segment(33, Infinity, { rotate: motion(0, -0.052), scale: motion(1, 1.15) }, 67),
  ], [0, 33], 5, { flashPresentation: 'opacity' }),
  'paired-snap': timed(67, [
    segment(0, 558, { scale: motion(1.25, 1), x: motion(-40, 0) }),
    segment(558, Infinity, { scale: motion(1, 1.25), x: motion(0, 40) }, 1115),
  ], { flashPresentation: 'rgba' }),
  'blue-triptych': timed(135, [
    segment(0, 743, { scale: motion(1.05, 1.05), x: motion(100, 0) }),
    segment(743, 1486, { rotate: motion(0.07, 0), scale: motion(1.18, 1) }),
    segment(1486, Infinity, {
      rotate: motion(0, -0.052),
      scale: motion(1, 1.18),
      y: motion(-50, 0),
    }, 2229),
  ], { flashPresentation: 'rgba' }),
  'balanced-triptych': timed(135, [
    segment(0, 750, { scale: motion(1, 1.12), x: motion(-40, 40) }),
    segment(750, 1500, { rotate: motion(-0.087, 0), scale: motion(1.2, 1) }),
    segment(1500, Infinity, {
      rotate: motion(0, 0.087),
      scale: motion(1, 1.15),
      y: motion(40, 0),
    }, 2252),
  ], {
    flashPresentation: 'rgba',
    slotLayout: 'motion-over-visible-media',
    staticMedia: true,
  }),
  'graded-triptych': timed(134, [
    segment(0, 750, {
      rotate: motion(-0.052, 0),
      scale: motion(1, 1.2, EASE_IN_QUAD),
    }),
    segment(750, 1500, {
      rotate: motion(0, 0.052),
      scale: motion(1.2, 1, EASE_OUT_QUAD),
    }),
    segment(1500, Infinity, {
      scale: motion(1, 1.2, EASE_IN_QUAD),
      y: motion(60, 0),
    }, 2252),
  ], {
    canvas: true,
    canvasExposure: true,
    canvasFill: '#000000',
    contrast: 1.15,
    saturate: 1.2,
  }),
  'cross-pan-triptych': timed(130, [
    segment(0, 758, { scale: motion(1, 1.12), y: motion(70, -70) }),
    segment(758, 1516, {
      rotate: motion(0.07, 0),
      scale: motion(1.15, 1),
      x: motion(70, -70),
    }),
    segment(1516, Infinity, {
      rotate: motion(-0.07, 0),
      scale: motion(1, 1.15),
      y: motion(-50, 0),
    }, 2275),
  ], {
    canvas: true,
    canvasExposure: true,
  }),
  'cover-triptych': timed(135, [
    segment(0, 743, { rotate: motion(0.052, 0), scale: motion(1, 1.12) }),
    segment(743, 1486, { scale: motion(1.15, 1), x: motion(-60, 60) }),
    segment(1486, 2229, { rotate: motion(-0.052, 0), scale: motion(1, 1.15) }),
  ], {
    contrast: 1.2,
    coverFrame: { height: 1920, width: 1440, x: -180, y: 0 },
    flashPresentation: 'rgba',
    saturate: 1.3,
  }),
  'vignette-triptych': timed(130, [
    segment(0, 735, { rotate: motion(0, 0.052), scale: motion(1, 1.22) }),
    segment(735, 1470, { rotate: motion(0.052, -0.052), scale: motion(1.22, 1) }),
    segment(1470, Infinity, { rotate: motion(-0.052, 0), scale: motion(1, 1.22) }, 2206),
  ], {
    filters: [filter('saturate', 1.5), filter('contrast', 1.1)],
    flashPresentation: 'opacity',
  }),
  'counterturn-triptych': timed(135, [
    segment(0, 743, { rotate: motion(0.087, 0), scale: motion(1.18, 1) }),
    segment(743, 1486, { scale: motion(1, 1.18), y: motion(60, -60) }),
    segment(1486, Infinity, {
      rotate: motion(-0.087, 0),
      scale: motion(1.18, 1),
      x: motion(40, 0),
    }, 2229),
  ], {
    canvas: true,
    canvasExposure: true,
  }),
  'four-beat-fade': timed(202, [
    segment(0, 600, { rotate: motion(0.052, 0), scale: motion(1, 1.15) }),
    segment(600, 1200, {
      rotate: motion(0, -0.052),
      scale: motion(1.15, 1),
    }),
    segment(1200, 1800, {
      scale: motion(1, 1.15),
      x: motion(-50, 0),
    }),
    segment(1800, Infinity, {
      scale: motion(1, 1.12),
    }, 2996),
  ], {
    flashPresentation: 'rgba',
    gradeFade: [2500, 496],
    gradePresentation: 'rgba',
    slotLayout: 'visibility-over-motion-over-media',
  }),
  'wide-angle-triptych': timed(137, [
    segment(0, 751, { scale: motion(1, 1), y: motion(-60, 60) }),
    segment(751, 1502, { rotate: motion(-0.1, 0), scale: motion(1.2, 1) }),
    segment(1502, Infinity, {
      rotate: motion(0, 0.1),
      scale: motion(1, 1.2),
      x: motion(0, 50),
    }, 2253),
  ], {
    canvas: true,
    canvasExposure: true,
    canvasFill: '#000000',
  }),
  'scatter-five': scatter(134, [
    placement(580, 750, 520, 0.21, 1300, 100),
    placement(905, 280, 820, -0.14, -350, 1000),
    placement(1138, 580, 1150, 0.09, 580, -600),
    placement(1486, 200, 1400, -0.24, -450, 1600),
    placement(1741, 820, 1100, 0.05, 1400, 900),
  ], { canvas: true }),
});

const React = {
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
};

test('plain builder preserves runtime cardinality, child order and owner-first attachment', () => {
  assertGuardFree(flashPhotoShutter);
  assert.doesNotMatch(flashPhotoShutter.toString(), /\.units\b|\.at\s*\(/u);
  assert.doesNotMatch(flashPhotoShutter.toString(), /\b(?:effects|frame|paint|pose|style)\b/u);
  assert.deepEqual(Object.keys(recipes), [...FLASH_PHOTO_VARIANTS]);

  for (const [recipe, authored] of Object.entries(recipes)) {
    const sources = authored.slots.map((_, index) => `runtime-image-${index}`);
    const unit = flashPhotoShutter(sources, recipe, mediaMetadata(sources.length));
    const targets = unit.animationTargets();
    const images = targets.images.map(({ owner }) => owner);
    const grade = targets.grade.owner;
    const exposure = targets.exposure.owner;
    const texture = unit.units.find((child) => child instanceof FlashPhotoTexture);
    const canvasTargets = targets.reframes.filter(({ role }) => role === 'canvas-media');

    assert.ok(unit instanceof FlashPhotoPlate);
    assert.deepEqual(images.map((image) => image.source), sources);
    assert.ok(images.every((image) => image instanceof Image));
    assert.ok(images.every((image) => image.parent !== null));
    assert.deepEqual(targets.images.map(({ owner }) => owner), images);
    assert.deepEqual(targets.images.map(({ index, role }) => ({ index, role })),
      images.map((_, index) => ({ index, role: 'image' })));
    assert.deepEqual(targets.grade, { channel: 'grade', owner: grade, role: 'grade' });
    assert.deepEqual(targets.exposure, { channel: 'flash', owner: exposure, role: 'exposure' });
    const hasFlash = !authored.canvasExposure
      && (authored.frameFlashes.length > 0 || authored.flashes.length > 0);
    assert.deepEqual(
      targets.exposureLaws.map(({ channel, owner }) => ({ channel, owner })),
      [
        ...(hasFlash ? [{ channel: 'flash', owner: exposure }] : []),
        ...(authored.gradeFade ? [{ channel: 'grade', owner: grade }] : []),
      ],
    );
    assert.deepEqual(unit.behaviours, []);
    assert.deepEqual(images.map(behaviourKinds), authored.slots.map(() => (
      authored.canvas ? [] : ['behaviour.flash-photo.shutter-flash-reframe']
    )));
    if (!authored.canvas) {
      images.forEach((image) => assert.equal(image.behaviours[0].unit, image));
    }
    assert.deepEqual(
      [...new Set(targets.reframes.map(({ index }) => index))],
      authored.slots.map((_, index) => index),
    );
    targets.reframes.forEach(({ owner }) => {
      assert.deepEqual(behaviourKinds(owner), ['behaviour.flash-photo.shutter-flash-reframe']);
      assert.equal(owner.behaviours[0].unit, owner);
    });
    assert.equal(canvasTargets.length, authored.canvas ? sources.length : 0);
    canvasTargets.forEach(({ index, owner }) => {
      assert.ok(owner instanceof FlashPhotoCanvasFrame);
      assert.ok(owner instanceof Layer);
      assert.equal(Object.hasOwn(owner, 'commands'), false);
      assert.deepEqual(owner.canvas, { height: 1920, width: 1080 });
      assert.equal(owner.rendering.mode, authored.basis === 'scatter' ? 'scatter' : 'cover');
      assert.equal(owner.source, sources[index]);
    });
    assert.equal(grade.name, 'flash-photo-grade');
    assert.ok(grade instanceof ShutterGradePlate);
    assert.equal(grade.presentation, authored.gradePresentation);
    assert.deepEqual(behaviourKinds(grade), authored.gradeFade
      ? ['behaviour.flash-photo.exposure-bloom']
      : []);
    if (authored.gradeFade) assert.equal(grade.behaviours[0].unit, grade);
    assert.ok(texture instanceof FlashPhotoTexture);
    assert.deepEqual(texture.behaviours, []);
    assert.equal(exposure.name, 'flash-photo-exposure');
    assert.ok(exposure instanceof ShutterExposurePlate);
    assert.equal(exposure.presentation, authored.flashPresentation);
    assert.deepEqual(behaviourKinds(exposure), hasFlash
      ? ['behaviour.flash-photo.exposure-bloom']
      : []);
    if (hasFlash) assert.equal(exposure.behaviours[0].unit, exposure);
  }
});

test('ExposureBloom is a closed authored shutter law, never a generic opacity wrapper', () => {
  const flashOwner = new FlashPhotoPlate(
    [new Image('first'), new Image('second')],
    'paired-tilt',
  ).animationTargets().exposure.owner;
  const gradeOwner = new FlashPhotoPlate(
    Array.from({ length: 4 }, (_, index) => new Image(`grade-${index}`)),
    'four-beat-fade',
  ).animationTargets().grade.owner;
  const flash = new ExposureBloom(flashOwner, 'paired-tilt', 'flash');
  const rgbaOwner = new FlashPhotoPlate(
    [new Image('rgba-first'), new Image('rgba-second')],
    'paired-snap',
  ).animationTargets().exposure.owner;
  const rgbaFlash = new ExposureBloom(rgbaOwner, 'paired-snap', 'flash');
  const grade = new ExposureBloom(gradeOwner, 'four-beat-fade', 'grade');

  assert.equal(flash.unit, flashOwner);
  assert.equal(grade.unit, gradeOwner);
  assert.throws(
    () => new ExposureBloom(new Box(), 'paired-tilt', 'flash'),
    /semantic shutter plate/u,
  );
  assert.throws(
    () => new ExposureBloom(flashOwner, 'paired-tilt', 'opacity'),
    /semantic shutter plate/u,
  );
  assert.throws(
    () => new ExposureBloom(flashOwner, 'unregistered-recipe', 'flash'),
    /recipe is not authored/u,
  );

  flash.onFrame({ frame: 0, fps: 60 });
  assert.equal(flashOwner.opacity, 0.9);
  assert.equal(flashOwner.present, true);
  assert.equal(flashOwner.paint.fill, '#ffffff');
  flash.onFrame({ frame: 5, fps: 60 });
  assert.equal(flashOwner.opacity, 0);
  assert.equal(flashOwner.present, false);
  rgbaFlash.onFrame({ frame: 0, fps: 60 });
  assert.equal(rgbaOwner.opacity, 1);
  assert.equal(rgbaOwner.present, true);
  assert.equal(rgbaOwner.paint.fill, 'rgba(255,255,255,0.9)');
  rgbaFlash.onFrame({ frame: 5, fps: 60 });
  assert.equal(rgbaOwner.opacity, 1);
  assert.equal(rgbaOwner.present, false);
  assert.equal(rgbaOwner.paint.fill, 'rgba(255,255,255,0)');
  grade.onFrame({ frame: 150, fps: 60 });
  assert.equal(gradeOwner.opacity, 1);
  assert.equal(gradeOwner.present, false);
  assert.equal(gradeOwner.paint.fill, 'rgba(0,0,0,0)');
  grade.onFrame({ frame: 180, fps: 60 });
  assert.equal(gradeOwner.opacity, 1);
  assert.equal(gradeOwner.present, true);
  assert.equal(gradeOwner.paint.fill, 'rgba(0,0,0,1)');
});

test('bare plates expose every static slot and never hide Behaviours', () => {
  for (const [recipe, authored] of Object.entries(recipes)) {
    const images = authored.slots.map((_, index) => new Image(`bare-image-${index}`));
    const unit = new FlashPhotoPlate(images, recipe, mediaMetadata(images.length));
    const targets = unit.animationTargets();
    const behaviours = [];
    visitUnits(unit, (child) => behaviours.push(...child.behaviours));

    assert.deepEqual(behaviours, []);
    assert.equal(unit.units.length, authored.slots.length * (authored.canvas ? 2 : 1) + 3);
    assert.deepEqual(targets.images.map(({ owner }) => owner), images);
    assert.equal(targets.reframes.length >= images.length, true);
    assert.throws(
      () => new FlashPhotoPlate(images.slice(1), recipe),
      /cardinality/u,
    );
  }
});

test('all seventeen recipes reproduce every authored 60fps frame deterministically and roll back', () => {
  let projectedFrames = 0;
  for (const [recipe, authored] of Object.entries(recipes)) {
    const unit = flashPhotoShutter(
      authored.slots.map((_, index) => `frame-image-${index}`),
      recipe,
      mediaMetadata(authored.slots.length),
    );
    const targets = unit.animationTargets();
    const images = targets.images.map(({ owner }) => owner);
    const grade = targets.grade.owner;
    const exposure = targets.exposure.owner;
    const projectedOwners = [...new Set([
      unit,
      ...images,
      ...targets.reframes.map(({ owner }) => owner),
      grade,
      exposure,
    ])];
    const authoredStates = new Map(projectedOwners.map((owner) => [
      owner,
      structuredClone(publicSnapshot(owner)),
    ]));

    for (let frame = 0; frame < authored.duration; frame += 1) {
      const input = {
        duration: authored.duration,
        fps: 60,
        frame,
        height: 1920,
        width: 1080,
      };
      const projection = projectFrame(unit, input);
      const repeated = projectFrame(unit, input);
      const time = (frame / 60) * 1000;

      images.forEach((image, index) => {
        const state = projection.stateOf(image);
        const expected = {
          ...expectedImage(authored, authored.slots[index], frame, time),
          exposure: expectedFlash(authored, time, frame),
        };
        const slotTargets = targets.reframes.filter((target) => target.index === index);
        assertProjectedSlot(slotTargets, projection, expected, recipe, index, frame);
        if (authored.canvas) {
          assert.equal(state.frame.width, 0);
          assert.equal(state.frame.height, 0);
          assert.equal(state.opacity, 0);
          finiteData(state, `${recipe} source slot ${index} frame ${frame}`);
          return;
        }
        close(state.frame.x, expected.frameX, `${recipe} slot ${index} frame.x at ${frame}`);
        close(state.frame.y, expected.frameY, `${recipe} slot ${index} frame.y at ${frame}`);
        assert.equal(state.frame.width, authored.coverFrame ? '100%' : authored.width);
        assert.equal(state.frame.height, authored.coverFrame ? '100%' : authored.height);
        assert.equal(state.fit, authored.coverFrame ? 'fill' : authored.fit);
        assert.deepEqual(state.position, { x: 0.5, y: 0.5 });
        close(state.effects.contrast, authored.coverFrame ? 1 : authored.contrast,
          `${recipe} contrast at ${frame}`);
        close(state.effects.saturate, authored.coverFrame ? 1 : authored.saturate,
          `${recipe} saturate at ${frame}`);
        assert.deepEqual(state.effects.filters, authored.coverFrame ? [] : authored.filters);
        assert.equal(state.effects.shadow, authored.coverFrame ? 'none' : authored.shadow);
        if (authored.basis === 'scatter') {
          assert.deepEqual(state.pose.operations, [
            { kind: 'translate-2d', x: '-50%', y: '-50%' },
          ]);
        }
        finiteData(state, `${recipe} slot ${index} frame ${frame}`);
      });

      const flashAmount = authored.canvasExposure ? 0 : expectedFlash(authored, time, frame);
      const exposureState = projection.stateOf(exposure);
      assert.equal(exposureState.present, flashAmount > 0, `${recipe} exposure presence at ${frame}`);
      close(
        exposureState.opacity,
        authored.flashPresentation === 'rgba' && authored.flashes.length > 0 ? 1 : flashAmount,
        `${recipe} exposure at ${frame}`,
      );
      assert.equal(
        exposureState.paint.fill,
        authored.flashPresentation === 'rgba' && authored.flashes.length > 0
          ? `rgba(255,255,255,${flashAmount})`
          : '#ffffff',
        `${recipe} exposure paint at ${frame}`,
      );

      const gradeAmount = expectedGrade(authored.gradeFade, time);
      const gradeState = projection.stateOf(grade);
      if (authored.gradeFade) {
        assert.equal(gradeState.present, gradeAmount > 0, `${recipe} grade presence at ${frame}`);
        close(
          gradeState.opacity,
          authored.gradePresentation === 'rgba' ? 1 : gradeAmount,
          `${recipe} grade at ${frame}`,
        );
        assert.equal(
          gradeState.paint.fill,
          authored.gradePresentation === 'rgba'
            ? `rgba(0,0,0,${gradeAmount})`
            : '#000000',
          `${recipe} grade paint at ${frame}`,
        );
      } else {
        close(gradeState.opacity, gradeAmount, `${recipe} grade at ${frame}`);
      }

      projectedOwners.forEach((owner) => {
        assert.deepEqual(projection.stateOf(owner), repeated.stateOf(owner));
        assert.deepEqual(publicSnapshot(owner), authoredStates.get(owner));
      });
      projectedFrames += 1;
    }
  }
  assert.equal(projectedFrames, Object.values(recipes).reduce((sum, recipe) => (
    sum + recipe.duration
  ), 0));
});

test('authored millisecond windows, hard-cut gaps, conditional segments and cumulative scatter remain explicit', () => {
  const sixty = flashPhotoShutter(['runtime-image'], 'vertical-reveal');
  const eighty = flashPhotoShutter(['runtime-image'], 'long-push');
  const sixtyImage = sixty.animationTargets().images[0].owner;
  const eightyVisibility = eighty.animationTargets().reframes.find(({ role }) => role === 'visibility').owner;
  assert.equal(stateAt(sixty, sixtyImage, 3, 61).opacity, 0.75);
  assert.equal(stateAt(sixty, sixtyImage, 4, 61).opacity, 1);
  assert.equal(stateAt(eighty, eightyVisibility, 4, 158).opacity, 0.8);
  assert.equal(stateAt(eighty, eightyVisibility, 5, 158).opacity, 1);

  const hardCut = flashPhotoShutter(['first', 'second'], 'paired-tilt');
  assert.deepEqual(
    hardCut.animationTargets().images.map(({ owner }) => stateAt(hardCut, owner, 34, 68).opacity),
    [0, 1],
  );
  assert.deepEqual(
    hardCut.animationTargets().images.map(({ owner }) => stateAt(hardCut, owner, 67, 68).opacity),
    [0, 1],
  );

  const conditionalSegments = flashPhotoShutter(
    ['first', 'second', 'third', 'fourth'],
    'four-beat-fade',
  );
  const conditionalSegmentTargets = conditionalSegments.animationTargets().reframes.filter(({ role }) => (
    role === 'visibility'
  ));
  assert.deepEqual(
    conditionalSegmentTargets.map(({ owner }) => stateAt(conditionalSegments, owner, 0, 202).opacity),
    [1, 0, 0, 0],
  );
  assert.deepEqual(
    conditionalSegmentTargets.map(({ owner }) => stateAt(conditionalSegments, owner, 36, 202).opacity),
    [0, 1, 0, 0],
  );
  assert.deepEqual(
    conditionalSegmentTargets.map(({ owner }) => stateAt(conditionalSegments, owner, 201, 202).present),
    [false, false, false, true],
  );

  const scatterSources = Array.from({ length: 5 }, (_, index) => `scatter-${index}`);
  const scatterUnit = flashPhotoShutter(
    scatterSources,
    'scatter-five',
    mediaMetadata(scatterSources.length),
  );
  assert.deepEqual(
    scatterUnit.animationTargets().reframes.map(({ owner }) => (
      stateAt(scatterUnit, owner, 90, 134).opacity
    )),
    [1, 1, 1, 1, 0],
  );
});

test('authored DOM flow and transform-owner topology remain semantic', () => {
  const longPush = flashPhotoShutter(['runtime-image'], 'long-push');
  const longTargets = longPush.animationTargets();
  assert.equal(longTargets.images[0].owner.frame.position, 'static');
  assert.deepEqual(
    longTargets.reframes.map(({ owner, role }) => ({ position: owner.frame.position, role })),
    [
      { position: 'static', role: 'media-static' },
      { position: 'static', role: 'motion' },
      { position: 'static', role: 'visibility' },
    ],
  );

  const lateral = flashPhotoShutter(['runtime-image'], 'lateral-drift');
  assert.deepEqual(
    lateral.animationTargets().reframes.map(({ owner, role }) => ({
      position: owner.frame.position,
      role,
    })),
    [
      { position: 'static', role: 'media-static' },
      { position: 'static', role: 'motion-visible' },
    ],
  );

  const balanced = flashPhotoShutter(['first', 'second', 'third'], 'balanced-triptych');
  assert.equal(balanced.animationTargets().images[0].owner.frame.position, 'static');
  assert.deepEqual(
    balanced.animationTargets().reframes.slice(0, 2).map(({ owner, role }) => ({
      position: owner.frame.position,
      role,
    })),
    [
      { position: 'static', role: 'media-visible' },
      { position: 'absolute', role: 'motion' },
    ],
  );

  const fourBeat = flashPhotoShutter(
    ['first', 'second', 'third', 'fourth'],
    'four-beat-fade',
  );
  assert.deepEqual(
    fourBeat.animationTargets().reframes.slice(0, 3).map(({ owner, role }) => ({
      position: owner.frame.position,
      role,
    })),
    [
      { position: 'absolute', role: 'media-static' },
      { position: 'absolute', role: 'motion' },
      { position: 'absolute', role: 'visibility' },
    ],
  );
});

test('scanline texture preserves authored DOM alpha compositing without hidden Behaviour', () => {
  const unit = new FlashPhotoPlate([new Image('runtime-image')], 'vignette-push');
  const texture = unit.units.find((child) => child instanceof FlashPhotoTexture);

  assert.ok(texture instanceof FlashPhotoTexture);
  assert.equal(texture.units.length, 480);
  texture.units.forEach((stripe, index) => {
    assert.ok(stripe instanceof Box);
    assert.equal(stripe.frame.x, 0);
    assert.equal(stripe.frame.y, index * 4);
    assert.equal(stripe.frame.width, '100%');
    assert.equal(stripe.frame.height, 2);
    assert.equal(stripe.paint.fill, 'rgba(0,0,0,0.03)');
    assert.deepEqual(stripe.behaviours, []);
    finiteData(stripe.frame, `scanline ${index}`);
  });
  assert.doesNotMatch(
    JSON.stringify(texture.units.map(({ frame, paint }) => ({ frame, paint }))),
    /"kind":"draw-image"|"source":|callback/iu,
  );
  assert.deepEqual(
    texture.units.slice(0, 3).map(({ frame: value }) => [value.y, value.y + value.height]),
    [[0, 2], [4, 6], [8, 10]],
  );
});

test('canvas-authored recipes call a native 2D context with a host-resolved resource', () => {
  const cover = flashPhotoShutter(
    ['cover-resource-key-0', 'cover-resource-key-1', 'cover-resource-key-2'],
    'graded-triptych',
    mediaMetadata(3),
  );
  const coverOwner = cover.animationTargets().reframes[0].owner;
  const coverState = projectFrame(cover, {
    duration: recipes['graded-triptych'].duration,
    fps: 60,
    frame: 0,
    height: 1920,
    width: 1080,
  }).stateOf(coverOwner);
  const coverResource = { id: 'already-resolved-cover-resource' };
  const coverTrace = [];
  coverOwner.draw(tracingContext(coverTrace), coverResource, coverState);

  assert.deepEqual(coverTrace.slice(0, 4), [
    ['save'],
    ['setTransform', 1, 0, 0, 1, 0, 0],
    ['set', 'globalAlpha', 1],
    ['set', 'globalCompositeOperation', 'source-over'],
  ]);
  assert.ok(coverTrace.some((entry) => (
    entry[0] === 'set' && entry[1] === 'filter'
      && entry[2] === 'contrast(1.15) saturate(1.2)'
  )));
  assert.ok(coverTrace.some((entry) => (
    entry[0] === 'translate' && entry[1] === 540 && entry[2] === 960
  )));
  assert.ok(coverTrace.some((entry) => (
    entry[0] === 'rotate' && entry[1] === coverState.frameState.rotate
  )));
  assert.ok(coverTrace.some((entry) => (
    entry[0] === 'scale'
      && entry[1] === coverState.frameState.scale
      && entry[2] === coverState.frameState.scale
  )));
  const coverDraw = coverTrace.find(([operation]) => operation === 'drawImage');
  assert.deepEqual(coverDraw, ['drawImage', coverResource, -640, -960, 1280, 1920]);
  assert.notEqual(coverDraw[1], coverOwner.source);
  assert.ok(coverTrace.some((entry) => (
    entry[0] === 'set' && entry[1] === 'fillStyle'
      && entry[2] === `rgba(255,255,255,${coverState.frameState.exposure})`
  )));
  assert.deepEqual(coverTrace.at(-1), ['restore']);

  const scatter = flashPhotoShutter(
    Array.from({ length: 5 }, (_, index) => `scatter-resource-key-${index}`),
    'scatter-five',
    mediaMetadata(5),
  );
  const scatterOwner = scatter.animationTargets().reframes[0].owner;
  const scatterState = projectFrame(scatter, {
    duration: recipes['scatter-five'].duration,
    fps: 60,
    frame: 36,
    height: 1920,
    width: 1080,
  }).stateOf(scatterOwner);
  const scatterResource = { id: 'already-resolved-scatter-resource' };
  const scatterTrace = [];
  scatterOwner.draw(tracingContext(scatterTrace), scatterResource, scatterState);

  assert.ok(scatterTrace.some((entry) => (
    entry[0] === 'translate'
      && entry[1] === scatterState.frameState.frameX
      && entry[2] === scatterState.frameState.frameY
  )));
  assert.ok(scatterTrace.some((entry) => (
    entry[0] === 'set' && entry[1] === 'shadowBlur' && entry[2] === 25
  )));
  assert.deepEqual(
    scatterTrace.find(([operation]) => operation === 'drawImage'),
    ['drawImage', scatterResource, -310, -465, 620, 930],
  );
  assert.equal(scatterTrace.some(([operation]) => operation === 'fillRect'), false);
  assert.deepEqual(scatterTrace.at(-1), ['restore']);
});

test('generic React rendering creates no canvas until a host unitRenderer replaces the semantic frame', () => {
  const sources = ['host-key-0', 'host-key-1', 'host-key-2'];
  const unit = flashPhotoShutter(sources, 'cross-pan-triptych', mediaMetadata(3));
  const input = {
    duration: recipes['cross-pan-triptych'].duration,
    fps: 60,
    frame: 0,
    height: 1920,
    width: 1080,
  };
  const genericTree = createReactDriver(React).render(unit, input);
  assert.equal(findType(genericTree, 'canvas'), null);

  const rendererInputs = [];
  const nativeTree = createReactDriver(React, {
    unitRenderers: {
      [FlashPhotoCanvasFrame.kind]: (rendererInput) => {
        rendererInputs.push(rendererInput);
        return React.createElement('native-photo-frame', {
          draw: (context, resource) => rendererInput.unit.draw(
            context,
            resource,
            rendererInput.state,
          ),
          frameState: rendererInput.state.frameState,
          source: rendererInput.state.source,
        });
      },
    },
  }).render(unit, input);
  const nativeFrame = findType(nativeTree, 'native-photo-frame');

  assert.ok(nativeFrame);
  assert.equal(findType(nativeTree, 'canvas'), null);
  assert.equal(rendererInputs.length, 1);
  assert.equal(rendererInputs[0].unit.constructor.kind, FlashPhotoCanvasFrame.kind);
  assert.equal(rendererInputs[0].projectedChildren.length, 0);
  assert.equal(typeof rendererInputs[0].renderChildren, 'function');
  assert.equal(nativeFrame.props.source, sources[0]);
  const trace = [];
  const resource = { id: 'host-owned-image' };
  nativeFrame.props.draw(tracingContext(trace), resource);
  assert.equal(trace.find(([operation]) => operation === 'drawImage')[1], resource);
});

test('new family files contain semantic constants but no private source material', async () => {
  const files = [
    '../../../src/units/flash-photo/FlashPhotoPlate.js',
    '../../../src/behaviours/flash-photo/ShutterFlashReframe.js',
    '../../../src/behaviours/flash-photo/ExposureBloom.js',
    '../../../src/compositions/FlashPhotoShutter.js',
  ];
  const contents = await Promise.all(files.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  const source = contents.join('\n');

  assert.doesNotMatch(source, /https?:|workspace|prompt|[a-f0-9]{40,}/iu);
  assert.doesNotMatch(source, /\bW(?:2|6)C\d+\b/u);
});

function frames(duration, fadeMs, fadeEasing, values, options = {}) {
  return specification(duration, 'frame', [segment(-Infinity, Infinity, values)], {
    ...options,
    fadeEasing,
    fadeMs,
  });
}

function timed(duration, slots, options = {}) {
  return specification(duration, 'time', slots, {
    ...options,
    flashes: slots.map((slot) => slot.start),
    mountActive: options.mountActive ?? true,
  });
}

function segmentedFrames(duration, slots, frameFlashes, flashDurationFrames, options = {}) {
  return specification(duration, 'segmented-frame', slots, {
    ...options,
    flashDurationFrames,
    frameFlashes,
    mountActive: options.mountActive ?? true,
  });
}

function scatter(duration, slots, options = {}) {
  return specification(duration, 'scatter', slots, {
    ...options,
    fit: 'contain',
    height: 'auto',
    mountActive: true,
    shadow: '6px 8px 25px rgba(0,0,0,0.6)',
    width: 620,
  });
}

function specification(duration, basis, slots, options = {}) {
  return Object.freeze({
    basis,
    canvas: options.canvas === true,
    canvasExposure: options.canvasExposure === true,
    canvasFill: options.canvasFill ?? 'transparent',
    contrast: options.contrast ?? 1,
    coverFrame: options.coverFrame ?? null,
    duration,
    fadeEasing: options.fadeEasing ?? LINEAR,
    fadeMs: options.fadeMs ?? 0,
    fit: options.fit ?? 'cover',
    filters: Object.freeze(options.filters ?? []),
    flashPresentation: options.flashPresentation ?? 'opacity',
    flashes: Object.freeze(options.flashes ?? []),
    flashDurationFrames: options.flashDurationFrames ?? null,
    frameFlashes: Object.freeze(options.frameFlashes ?? []),
    gradeFade: options.gradeFade ?? null,
    gradePresentation: options.gradePresentation ?? 'opacity',
    height: options.height ?? '100%',
    mountActive: options.mountActive === true,
    saturate: options.saturate ?? 1,
    shadow: options.shadow ?? 'none',
    slotLayout: options.slotLayout ?? 'direct',
    slots: Object.freeze(slots),
    staticFlow: options.staticFlow === true,
    staticMedia: options.staticMedia === true,
    width: options.width ?? '100%',
  });
}

function segment(start, end, values = {}, motionEnd = end) {
  return Object.freeze({
    end,
    motionEnd,
    rotate: values.rotate ?? motion(0, 0),
    scale: values.scale ?? motion(1, 1),
    start,
    x: values.x ?? motion(0, 0),
    y: values.y ?? motion(0, 0),
  });
}

function placement(start, x, y, rotate, fromX, fromY) {
  return Object.freeze({
    end: Infinity,
    rotate: motion(rotate, rotate),
    scale: motion(1, 1),
    start,
    x: motion(fromX, x, EASE_OUT_QUAD),
    y: motion(fromY, y, EASE_OUT_QUAD),
  });
}

function motion(from, to, easing = LINEAR) {
  return Object.freeze({ easing, from, to });
}

function filter(kind, amount) {
  return Object.freeze({ amount, kind });
}

function expectedImage(recipe, slot, frame, time) {
  if (recipe.basis === 'frame') {
    const amount = clamp(frame / recipe.duration);
    const fadeFrames = Math.round((recipe.fadeMs / 1000) * 60);
    return sample(slot, amount, recipe.fadeEasing(clamp(frame / fadeFrames)), false);
  }
  if (recipe.basis === 'segmented-frame') {
    const amount = clamp((frame - slot.start) / (slot.motionEnd - slot.start));
    return sample(slot, amount, Number(frame >= slot.start && frame < slot.end), false);
  }
  if (recipe.basis === 'scatter') {
    const amount = clamp((time - slot.start) / 100);
    return sample(slot, amount, Number(time >= slot.start), true);
  }
  const amount = clamp((time - slot.start) / (slot.motionEnd - slot.start));
  const visible = Number(time >= slot.start && time < slot.end);
  return sample(slot, amount, visible, false);
}

function sample(slot, amount, opacity, scatterValue) {
  const x = sampleMotion(slot.x, amount);
  const y = sampleMotion(slot.y, amount);
  return {
    frameX: scatterValue ? x : 0,
    frameY: scatterValue ? y : 0,
    opacity,
    rotate: sampleMotion(slot.rotate, amount),
    scale: sampleMotion(slot.scale, amount),
    x: scatterValue ? 0 : x,
    y: scatterValue ? 0 : y,
  };
}

function sampleMotion(value, amount) {
  return value.from + ((value.to - value.from) * value.easing(amount));
}

function expectedFlash(recipe, time, frame) {
  if (recipe.frameFlashes.length > 0) {
    return recipe.frameFlashes.reduce((peak, point) => {
      const elapsed = frame - point;
      const active = Number(elapsed >= 0 && elapsed < recipe.flashDurationFrames);
      return Math.max(peak, active * 0.9 * (1 - clamp(elapsed / recipe.flashDurationFrames)));
    }, 0);
  }
  return recipe.flashes.reduce((peak, point) => {
    const elapsed = time - point;
    const active = Number(elapsed >= 0 && elapsed < 80);
    return Math.max(peak, active * 0.9 * (1 - clamp(elapsed / 80)));
  }, 0);
}

function assertProjectedSlot(targets, projection, expected, recipe, index, frame) {
  for (const { owner, role } of targets) {
    const state = projection.stateOf(owner);
    const location = `${recipe} slot ${index} ${role} at ${frame}`;
    assert.equal(
      state.present,
      !recipes[recipe].mountActive || expected.opacity > 0,
      `${location} presence`,
    );
    if (role === 'canvas-media') {
      assertCanvasSlot(owner, state, expected, recipes[recipe], location);
      continue;
    }
    const motion = effectiveMotion(state.pose);
    const cover = recipes[recipe].coverFrame;
    const ownsMotion = role === 'media-direct'
      || role === 'motion'
      || role === 'motion-visible'
      || role === 'cover-motion-visible';
    const ownsVisibility = role === 'media-direct'
      || role === 'media-visible'
      || role === 'visibility'
      || role === 'motion-visible'
      || role === 'cover-motion-visible';
    close(state.opacity, ownsVisibility ? expected.opacity : 1, `${location} opacity`);
    close(motion.scaleX, ownsMotion ? expected.scale : 1, `${location} scaleX`);
    close(motion.scaleY, ownsMotion ? expected.scale : 1, `${location} scaleY`);
    close(motion.rotate, ownsMotion ? expected.rotate * TO_DEGREES : 0, `${location} rotate`);
    close(motion.x, ownsMotion && !cover ? expected.x : 0, `${location} x`);
    close(motion.y, ownsMotion && !cover ? expected.y : 0, `${location} y`);
    if (role === 'cover-motion-visible') {
      const x = cover.x + expected.x;
      const y = cover.y + expected.y;
      assert.deepEqual(state.frame, {
        ...state.frame,
        height: cover.height,
        width: cover.width,
        x,
        y,
      });
      assert.deepEqual(state.pose.origin, { x: 540 - x, y: 960 - y, z: 0 });
      close(state.effects.contrast, recipes[recipe].contrast, `${location} contrast`);
      close(state.effects.saturate, recipes[recipe].saturate, `${location} saturate`);
    }
  }
}

function assertCanvasSlot(owner, state, expected, authored, location) {
  close(state.opacity, expected.opacity, `${location} opacity`);
  assert.equal(Object.hasOwn(state, 'commands'), false);
  assert.deepEqual(state.canvas, { height: 1920, width: 1080 });
  assert.deepEqual(state.frameState, {
    exposure: expected.exposure,
    frameX: expected.frameX,
    frameY: expected.frameY,
    opacity: expected.opacity,
    rotate: expected.rotate,
    scale: expected.scale,
    x: expected.x,
    y: expected.y,
  });
  assert.deepEqual(state.rendering, {
    contrast: authored.contrast,
    fill: authored.canvasFill,
    mode: authored.basis === 'scatter' ? 'scatter' : 'cover',
    saturate: authored.saturate,
  });
  assert.equal(state.source, owner.source);
  finiteData(state.frameState, `${location} frame state`);
}

function effectiveMotion(pose) {
  const value = {
    rotate: pose.rotate,
    scaleX: pose.scaleX,
    scaleY: pose.scaleY,
    x: pose.x,
    y: pose.y,
  };
  for (const operation of pose.operations) {
    if (operation.kind === 'scale-2d') {
      value.scaleX *= operation.x;
      value.scaleY *= operation.y;
    } else if (operation.kind === 'translate-x') value.x += operation.value;
    else if (operation.kind === 'translate-y') value.y += operation.value;
    else if (operation.kind === 'translate-2d'
      && typeof operation.x === 'number'
      && typeof operation.y === 'number') {
      value.x += operation.x;
      value.y += operation.y;
    }
    else if (operation.kind === 'rotate-z') value.rotate += operation.degrees;
  }
  return value;
}

function expectedGrade(fade, time) {
  return fade ? clamp((time - fade[0]) / fade[1]) : 1;
}

function stateAt(root, unit, frame, duration) {
  return projectFrame(root, {
    duration,
    fps: 60,
    frame,
    height: 1920,
    width: 1080,
  }).stateOf(unit);
}

function behaviourKinds(unit) {
  return unit.behaviours.map((entry) => entry.constructor.kind);
}

function mediaMetadata(cardinality) {
  return Array.from({ length: cardinality }, (_, index) => ({
    height: 900 + (index * 137),
    width: 600 + (index * 83),
  }));
}

function tracingContext(trace) {
  const target = {
    clearRect: (...args) => trace.push(['clearRect', ...args]),
    drawImage: (...args) => trace.push(['drawImage', ...args]),
    fillRect: (...args) => trace.push(['fillRect', ...args]),
    restore: () => trace.push(['restore']),
    rotate: (...args) => trace.push(['rotate', ...args]),
    save: () => trace.push(['save']),
    scale: (...args) => trace.push(['scale', ...args]),
    setTransform: (...args) => trace.push(['setTransform', ...args]),
    translate: (...args) => trace.push(['translate', ...args]),
  };
  return new Proxy(target, {
    set(object, property, value) {
      object[property] = value;
      trace.push(['set', String(property), value]);
      return true;
    },
  });
}

function findType(element, type) {
  if (element?.type === type) return element;
  for (const child of element?.children ?? []) {
    const found = findType(child, type);
    if (found) return found;
  }
  return null;
}

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} !== ${expected}`);
}

function clamp(value) {
  return Math.min(1, Math.max(0, value));
}

function finiteData(value, location) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${location} must be finite`);
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => finiteData(entry, `${location}[${index}]`));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => finiteData(entry, `${location}.${key}`));
  }
}

function assertGuardFree(builder) {
  const forbidden = /\b(?:if|else|switch|case|throw|try|catch|finally|typeof|instanceof|for|while|do)\b|\?|&&|\|\|/u;
  assert.doesNotMatch(builder.toString(), forbidden);
}
