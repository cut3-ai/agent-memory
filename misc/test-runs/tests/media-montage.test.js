import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { publicSnapshot } from '@cut3/agent-memory/core/state';
import {
  clamp,
  cubicBezier,
  easeOut,
  lerp,
  progress,
  springValue,
} from '@cut3/agent-memory/core/timeline';
import { flashCutVideoMontage } from '@cut3/agent-memory/compositions/FlashCutVideoMontage';
import { offthreadVideoCandidate } from '@cut3/agent-memory/compositions/OffthreadVideoCandidate';
import { sourceOffsetVideoMontage } from '@cut3/agent-memory/compositions/SourceOffsetVideoMontage';
import { strobeImageMontage } from '@cut3/agent-memory/compositions/StrobeImageMontage';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { createRemotionDriver } from '@cut3/agent-memory/drivers/remotion';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { Video } from '@cut3/agent-memory/units/base/Video';
import {
  CutFlashPlate,
  FlashCutSegment,
} from '@cut3/agent-memory/units/media-montage/FlashCutSegment';
import {
  FlashCutVideoMontage,
  FlashCutVignette,
} from '@cut3/agent-memory/units/media-montage/FlashCutVideoMontage';
import { PremountedMediaShot } from '@cut3/agent-memory/units/media-montage/PremountedMediaShot';
import { SourceOffsetVideoMontage } from '@cut3/agent-memory/units/media-montage/SourceOffsetVideoMontage';
import { StrobeImageMontage } from '@cut3/agent-memory/units/media-montage/StrobeImageMontage';
import {
  FirstClipBlackStutter,
  FirstClipVignette,
  VignetteRevealClip,
} from '@cut3/agent-memory/units/media-montage/VignetteRevealClip';

const FPS = 60;
const flashCutSlots = Object.freeze([
  cut(1, 0, 1509, 0.5, 1, 1.3, 'in'),
  cut(2, 1509, 2229, 2, 1.5, 1, 'out'),
  cut(3, 2229, 2972, 2.5, 0.8, 1, 'bounce'),
  cut(4, 2972, 3738, 1.5, 1, 1.2, 'in'),
  cut(5, 3738, 4481, 3, 1.4, 1, 'out'),
  cut(6, 4481, 5247, 0.5, 1, 1.1, 'in'),
  cut(7, 5247, 5990, 1, 1.3, 1, 'hard'),
  cut(1, 5990, 7500, 0.4, 1.5, 1, 'out'),
]);
const sourceOffsetSegments = Object.freeze([
  segment(1, 4080, 639, 1),
  segment(2, 6419, 0, 1),
  segment(3, 8467, 0, 1),
  segment(4, 11767, 0, 0.5),
]);
const flashCutFrames = Object.freeze([0, 91, 134, 178, 224, 269, 315, 359, 450]);
const sourceOffsetFrames = Object.freeze([0, 245, 385, 508, 706]);
const inEase = cubicBezier(0.42, 0, 1, 1);
const outEase = cubicBezier(0, 0, 0.58, 1);
const revealEase = cubicBezier(0.42, 0, 0.58, 1);
const brightnessEase = cubicBezier(0.4, 0, 0.6, 1);
const quad = (value) => value * value;

test('media montage builders are guard-free and attach only explicit owner-first Behaviours', () => {
  [
    flashCutVideoMontage,
    offthreadVideoCandidate,
    sourceOffsetVideoMontage,
    strobeImageMontage,
  ].forEach(assertGuardFree);

  const flashRoot = flashCutVideoMontage(flashCutSlots, FPS);
  assert.ok(flashRoot instanceof FlashCutVideoMontage);
  assert.equal(flashRoot.units.length, 9);
  flashRoot.units.slice(0, -1).forEach((shot, index) => {
    assert.ok(shot instanceof PremountedMediaShot);
    assert.equal(shot.parent, flashRoot);
    assert.equal(shot.from, flashCutFrames[index]);
    assert.equal(shot.duration, flashCutFrames[index + 1] - flashCutFrames[index]);
    assert.equal(shot.mediaBackend, 'video');
    assert.equal(shot.premountFor, FPS);
    assert.equal(shot.pauseWhenBuffering, false);
    assert.equal(shot.reconciliationKey, `flash-cut-video-${index + 1}`);
    const [clip] = shot.units;
    const [video, flash] = clip.units;
    assert.ok(clip instanceof FlashCutSegment);
    assert.ok(video instanceof Video);
    assert.ok(flash instanceof CutFlashPlate);
    assert.equal(clip.flashPlate, flash);
    assert.deepEqual(video.behaviours.map((entry) => entry.constructor.kind), [
      'behaviour.media-montage.flash-cut-motion',
    ]);
    assert.equal(video.behaviours[0].unit, video);
    assert.deepEqual(flash.behaviours.map((entry) => entry.constructor.kind), [
      'behaviour.media-montage.cut-flash-envelope',
    ]);
    assert.equal(flash.behaviours[0].unit, flash);
  });
  assert.deepEqual(flashRoot.behaviours, []);
  assert.ok(flashRoot.vignette instanceof FlashCutVignette);
  assert.deepEqual(flashRoot.vignette.behaviours, []);

  const imageRoot = strobeImageMontage(imageSources(), 40);
  const [image] = imageRoot.units;
  assert.ok(imageRoot instanceof StrobeImageMontage);
  assert.deepEqual(image.behaviours.map((entry) => entry.constructor.kind), [
    'behaviour.media-montage.image-strobe-cuts',
  ]);
  assert.equal(image.behaviours[0].unit, image);
  assert.deepEqual(imageRoot.behaviours, []);

  const offsetRoot = sourceOffsetVideoMontage(sourceOffsetSegments, FPS);
  assert.ok(offsetRoot instanceof SourceOffsetVideoMontage);
  assert.equal(offsetRoot.units.length, 4);
  offsetRoot.units.forEach((shot, index) => {
    assert.ok(shot instanceof PremountedMediaShot);
    assert.equal(shot.from, sourceOffsetFrames[index]);
    assert.equal(shot.duration, sourceOffsetFrames[index + 1] - sourceOffsetFrames[index]);
    assert.equal(shot.mediaBackend, 'offthread-video');
    assert.equal(shot.pauseWhenBuffering, true);
    assert.equal(shot.premountFor, FPS);
    assert.equal(shot.reconciliationKey, `source-offset-video-${index + 1}`);
  });
  const [firstClip] = offsetRoot.units[0].units;
  const [firstVideo, vignette, blackPlate] = firstClip.units;
  assert.ok(firstClip instanceof VignetteRevealClip);
  assert.ok(vignette instanceof FirstClipVignette);
  assert.ok(blackPlate instanceof FirstClipBlackStutter);
  assert.equal(firstClip.vignette, vignette);
  assert.equal(firstClip.blackStutter, blackPlate);
  assert.deepEqual(firstVideo.behaviours.map((entry) => entry.constructor.kind), [
    'behaviour.media-montage.first-clip-grade-reveal',
  ]);
  assert.deepEqual(vignette.behaviours.map((entry) => entry.constructor.kind), [
    'behaviour.media-montage.vignette-release',
  ]);
  assert.deepEqual(blackPlate.behaviours.map((entry) => entry.constructor.kind), [
    'behaviour.media-montage.black-stutter-reveal',
  ]);
  assert.equal(firstVideo.behaviours[0].unit, firstVideo);
  assert.equal(vignette.behaviours[0].unit, vignette);
  assert.equal(blackPlate.behaviours[0].unit, blackPlate);

  const candidate = offthreadVideoCandidate('runtime-video-candidate', 67, FPS);
  assert.ok(candidate instanceof PremountedMediaShot);
  assert.equal(candidate.units[0].behaviours.length, 0);
  assert.deepEqual(candidate.behaviours, []);
});

test('bare media montage Units keep static renderer-neutral trees with zero hidden Behaviours', () => {
  const bareRoots = [
    new StrobeImageMontage(new Image('runtime-image-bare')),
    bareFlashRoot(),
    bareOffsetRoot(),
    new VignetteRevealClip(new Video('runtime-video-bare-reveal')),
    new PremountedMediaShot(new Video('runtime-video-bare-shot'), {
      duration: 20,
      mediaBackend: 'offthread-video',
      premountFor: FPS,
    }),
  ];

  bareRoots.forEach((root) => {
    visitUnits(root, (unit) => {
      assert.deepEqual(unit.behaviours, []);
      assert.equal(Object.hasOwn(unit, 'style'), false);
      assert.equal(Object.hasOwn(unit, 'css'), false);
    });
  });
});

test('eight flash-cut recipes reproduce every authored cut, flash and crop frame', () => {
  const root = flashCutVideoMontage(flashCutSlots, FPS);
  const shots = root.units.slice(0, -1);
  const vignette = root.vignette;

  for (let frame = 0; frame < 450; frame += 1) {
    const projection = projected(root, frame, 450);
    const active = activeIndex(frame, flashCutFrames);
    shots.forEach((shot) => assert.equal(projection.has(shot), isMounted(shot, frame)));

    const shot = shots[active];
    const [clip] = shot.units;
    const [video, flash] = clip.units;
    const localFrame = frame - shot.from;
    const slot = flashCutSlots[active];
    const amount = flashAmount(slot.easeMode, localFrame, shot.duration);
    const expectedScale = lerp(slot.scaleFrom, slot.scaleTo, amount);
    const videoState = projection.stateOf(video);
    const flashState = projection.stateOf(flash);

    close(videoState.pose.scaleX, expectedScale, `flash-cut scaleX frame ${frame}`);
    close(videoState.pose.scaleY, expectedScale, `flash-cut scaleY frame ${frame}`);
    assert.equal(videoState.pose.x, 0);
    assert.equal(videoState.pose.y, 0);
    assert.equal(videoState.source, slot.source);
    assert.equal(videoState.playbackRate, slot.playbackRate);
    assert.equal(videoState.muted, true);
    assert.equal(videoState.fit, 'cover');
    assert.deepEqual(videoState.position, { x: 0.5, y: 0.5 });
    close(
      flashState.opacity,
      lerp(0.35, 0, progress(localFrame, 0, 3)),
      `flash-cut white flash frame ${frame}`,
    );
    assert.equal(flashState.paint.fill, '#ffffff');
    assert.equal(projection.stateOf(root).paint.fill, '#000000');
    assert.deepEqual(projection.stateOf(vignette).paint.backgrounds[0].stops, [
      { offset: 0.4, color: 'transparent' },
      { offset: 1, color: 'rgba(0,0,0,0.45)' },
    ]);
  }
});

test('image strobe reproduces every authored frame at the millisecond-derived cadence', () => {
  const sources = imageSources();
  const root = strobeImageMontage(sources, 40);
  const [image] = root.units;
  const cutFrames = Math.max(1, Math.round((40 / 1000) * FPS));

  for (let frame = 0; frame < 67; frame += 1) {
    const state = projected(root, frame, 67).stateOf(image);
    assert.equal(state.source, sources[Math.floor(frame / cutFrames) % sources.length]);
    assert.equal(state.opacity, 1);
    assert.equal(state.fit, 'cover');
    assert.deepEqual(state.position, { x: 0.5, y: 0.5 });
    assert.deepEqual({
      scaleX: state.pose.scaleX,
      scaleY: state.pose.scaleY,
      x: state.pose.x,
      y: state.pose.y,
    }, { scaleX: 1, scaleY: 1, x: 0, y: 0 });
  }
});

test('source-offset montage reproduces all authored cuts, offsets, grade, stutters and crop frames', () => {
  const root = sourceOffsetVideoMontage(sourceOffsetSegments, FPS, 880);
  const shots = root.units;
  const entranceFrames = Math.max(1, Math.round((880 / 1000) * FPS));

  for (let frame = 0; frame < 706; frame += 1) {
    const projection = projected(root, frame, 706);
    const active = activeIndex(frame, sourceOffsetFrames);
    shots.forEach((shot) => assert.equal(projection.has(shot), isMounted(shot, frame)));
    const shot = shots[active];
    const mediaRoot = shot.units[0];
    const video = active === 0 ? mediaRoot.units[0] : mediaRoot;
    const state = projection.stateOf(video);
    const authored = sourceOffsetSegments[active];

    assert.equal(state.source, authored.source);
    assert.equal(state.startFrom, Math.round((authored.sourceOffsetMilliseconds / 1000) * FPS));
    assert.equal(state.volume, authored.volume);
    assert.equal(state.playbackRate, 1);
    assert.equal(state.muted, false);
    assert.equal(state.fit, 'cover');
    assert.deepEqual(state.position, { x: 0.5, y: 0.5 });

    if (active === 0) {
      const [, vignette, blackPlate] = mediaRoot.units;
      const linear = progress(frame, 0, entranceFrames);
      const soft = easeOut(quad)(linear);
      const bright = brightnessEase(linear);
      assert.deepEqual(state.effects.filters, [
        { kind: 'saturate', amount: lerp(0.35, 1, soft) },
        { kind: 'contrast', amount: lerp(1.55, 1, soft) },
        { kind: 'brightness', amount: lerp(0.55, 1, bright) },
      ]);
      assert.deepEqual(pick(state.effects, ['brightness', 'contrast', 'saturate']), {
        brightness: 1,
        contrast: 1,
        saturate: 1,
      });

      const vignetteState = projection.stateOf(vignette);
      const expectedInner = lerp(0.06, 0.62, soft);
      const expectedEdge = lerp(0.92, 0, soft);
      assert.equal(vignetteState.opacity, expectedEdge > 0.001 ? 1 : 0);
      assert.deepEqual(vignetteState.paint.backgrounds, [{
        kind: 'radial-gradient',
        shape: 'circle',
        position: { x: '50%', y: '50%' },
        stops: [
          { offset: expectedInner, color: 'transparent' },
          { offset: 1, color: `rgba(0,0,0,${expectedEdge})` },
        ],
        blendMode: 'normal',
      }]);

      let blackOpacity = lerp(1, 0, revealEase(linear));
      for (const impulse of [0.24, 0.44, 0.64]) {
        const distance = Math.abs(frame - (impulse * entranceFrames));
        if (distance < 1.6) blackOpacity += ((1.6 - distance) / 1.6) * 0.55;
      }
      const clampedBlack = Math.min(1, blackOpacity);
      close(
        projection.stateOf(blackPlate).opacity,
        clampedBlack > 0.001 ? clampedBlack : 0,
        `black stutter frame ${frame}`,
      );
      assert.equal(projection.stateOf(blackPlate).paint.fill, '#000000');
    } else {
      assert.deepEqual(pick(state.effects, ['brightness', 'contrast', 'saturate']), {
        brightness: 1,
        contrast: 1,
        saturate: 1,
      });
      assert.deepEqual(state.effects.filters, []);
    }
  }
});

test('single offthread candidate preserves its exact 67-frame semantic contract', () => {
  const root = offthreadVideoCandidate('runtime-video-candidate', 67, FPS);
  const [video] = root.units;

  for (let frame = 0; frame < 67; frame += 1) {
    const projection = projected(root, frame, 67);
    assert.equal(projection.has(root), true);
    const state = projection.stateOf(video);
    assert.equal(state.source, 'runtime-video-candidate');
    assert.equal(state.startFrom, 0);
    assert.equal(state.playbackRate, 1.5);
    assert.equal(state.muted, true);
    assert.equal(state.fit, 'cover');
    assert.deepEqual(state.position, { x: 0.5, y: 0.5 });
  }
  assert.equal(root.from, 0);
  assert.equal(root.duration, 67);
  assert.equal(root.mediaBackend, 'offthread-video');
  assert.equal(root.premountFor, FPS);
  assert.equal(root.pauseWhenBuffering, false);
  assert.equal(root.reconciliationKey, 'offthread-video-candidate-1');
});

test('all 1290 authored states are finite and every projection rolls public state back', () => {
  const entries = [
    [flashCutVideoMontage(flashCutSlots, FPS), 450],
    [strobeImageMontage(imageSources(), 40), 67],
    [sourceOffsetVideoMontage(sourceOffsetSegments, FPS, 880), 706],
    [offthreadVideoCandidate('runtime-video-candidate', 67, FPS), 67],
  ];

  entries.forEach(([root, duration]) => {
    const units = collect(root);
    const before = units.map((unit) => publicSnapshot(unit));
    for (let frame = 0; frame < duration; frame += 1) {
      const projection = projected(root, frame, duration);
      units.forEach((unit) => {
        if (projection.has(unit)) assertFinite(projection.stateOf(unit));
      });
      units.forEach((unit, index) => assert.deepEqual(publicSnapshot(unit), before[index]));
    }
    const late = projected(root, duration - 1, duration);
    projected(root, 0, duration);
    const repeated = projected(root, duration - 1, duration);
    units.forEach((unit) => {
      if (late.has(unit)) assert.deepEqual(repeated.stateOf(unit), late.stateOf(unit));
    });
  });
});

test('Remotion handoff preserves keyed premount lifecycle, offsets, buffering and backend', () => {
  const React = fakeReact();
  const Remotion = {
    Audio: 'remotion-audio',
    Img: 'remotion-image',
    OffthreadVideo: 'remotion-offthread-video',
    Sequence: 'remotion-sequence',
    Video: 'remotion-video',
  };
  const offsetRoot = sourceOffsetVideoMontage(sourceOffsetSegments, FPS, 880);
  const offsetTree = createRemotionDriver(React, Remotion).render(offsetRoot, {
    duration: 706,
    fps: FPS,
    frame: 0,
    height: 1920,
    width: 1080,
  });
  const offsetSequence = find(offsetTree, (node) => node.type === 'remotion-sequence');
  const offsetVideo = find(offsetTree, (node) => node.type === 'remotion-offthread-video');
  assert.equal(offsetVideo.props.startFrom, 38);
  assert.equal(offsetSequence.props.premountFor, FPS);
  assert.equal(offsetVideo.props.pauseWhenBuffering, true);
  assert.equal(offsetRoot.units[0].premountFor, FPS);
  assert.equal(offsetRoot.units[0].pauseWhenBuffering, true);
  assert.equal(
    offsetVideo.props.style.filter,
    'saturate(0.35) contrast(1.55) brightness(0.55)',
  );
  assert.equal(findAll(offsetTree, (node) => node.type === 'remotion-sequence').length, 1);
  assert.equal(offsetSequence.props.key, 'source-offset-video-1');

  const offsetPremountTree = createRemotionDriver(React, Remotion).render(offsetRoot, {
    duration: 706,
    fps: FPS,
    frame: 185,
    height: 1920,
    width: 1080,
  });
  const offsetPremounted = findAll(
    offsetPremountTree,
    (node) => node.type === 'remotion-sequence',
  );
  assert.deepEqual(
    offsetPremounted.map((node) => node.props.key),
    ['source-offset-video-1', 'source-offset-video-2'],
  );
  assert.deepEqual(offsetPremounted.map((node) => node.props.from), [0, 245]);
  assert.equal(
    findAll(offsetPremountTree, (node) => node.type === 'remotion-offthread-video').length,
    2,
  );

  const flashRoot = flashCutVideoMontage(flashCutSlots, FPS);
  const flashTree = createRemotionDriver(React, Remotion).render(flashRoot, {
    duration: 450,
    fps: FPS,
    frame: 0,
    height: 1920,
    width: 1080,
  });
  assert.equal(flashRoot.units[0].mediaBackend, 'video');
  assert.ok(find(flashTree, (node) => node.type === 'remotion-video'));
  assert.equal(find(flashTree, (node) => node.type === 'remotion-offthread-video'), null);
  assert.equal(findAll(flashTree, (node) => node.type === 'remotion-sequence').length, 1);
  assert.equal(
    find(flashTree, (node) => node.type === 'remotion-sequence').props.key,
    'flash-cut-video-1',
  );

  const flashPremountTree = createRemotionDriver(React, Remotion).render(flashRoot, {
    duration: 450,
    fps: FPS,
    frame: 31,
    height: 1920,
    width: 1080,
  });
  assert.deepEqual(
    findAll(flashPremountTree, (node) => node.type === 'remotion-sequence')
      .map((node) => node.props.key),
    ['flash-cut-video-1', 'flash-cut-video-2'],
  );

  const reactTree = createReactDriver(React).render(offsetRoot, {
    duration: 706,
    fps: FPS,
    frame: 0,
    height: 1920,
    width: 1080,
  });
  const nativeVideo = find(reactTree, (node) => node.type === 'video');
  assert.equal(nativeVideo.props.src, 'runtime-video-segment-1');
  assert.equal(Object.hasOwn(nativeVideo.props, 'preload'), false);
  assert.equal(Object.hasOwn(nativeVideo.props, 'ref'), false);
  assert.equal(Object.hasOwn(nativeVideo.props, 'data-start-frame'), false);
  const reactPremountTree = createReactDriver(React).render(offsetRoot, {
    duration: 706,
    fps: FPS,
    frame: 185,
    height: 1920,
    width: 1080,
  });
  assert.equal(findAll(reactPremountTree, (node) => node.type === 'video').length, 1);
});

test('new media montage sources contain no private identifiers, URLs, hashes or raw style bags', async () => {
  const paths = [
    'src/units/media-montage/FlashCutSegment.js',
    'src/units/media-montage/FlashCutVideoMontage.js',
    'src/units/media-montage/PremountedMediaShot.js',
    'src/units/media-montage/SourceOffsetVideoMontage.js',
    'src/units/media-montage/StrobeImageMontage.js',
    'src/units/media-montage/VignetteRevealClip.js',
    'src/behaviours/media-montage/BlackStutterReveal.js',
    'src/behaviours/media-montage/CutFlashEnvelope.js',
    'src/behaviours/media-montage/FirstClipGradeReveal.js',
    'src/behaviours/media-montage/FlashCutMotion.js',
    'src/behaviours/media-montage/ImageStrobeCuts.js',
    'src/behaviours/media-montage/VignetteRelease.js',
    'src/compositions/FlashCutVideoMontage.js',
    'src/compositions/OffthreadVideoCandidate.js',
    'src/compositions/SourceOffsetVideoMontage.js',
    'src/compositions/StrobeImageMontage.js',
  ];
  const source = (await Promise.all(paths.map((path) => readFile(path, 'utf8')))).join('\n');
  assert.doesNotMatch(source, /https?:\/\/|(?:workspace|composition)-\d|[a-f\d]{32,}/iu);
  assert.doesNotMatch(source, /\b(?:prompt|jsonl|customer|private)\b/iu);
  assert.doesNotMatch(source, /\b(?:style|css)\s*:/iu);
});

function cut(index, startMilliseconds, endMilliseconds, playbackRate, scaleFrom, scaleTo, easeMode) {
  return Object.freeze({
    easeMode,
    endMilliseconds,
    playbackRate,
    scaleFrom,
    scaleTo,
    source: `runtime-video-cut-${index}`,
    startMilliseconds,
  });
}

function segment(index, endMilliseconds, sourceOffsetMilliseconds, volume) {
  return Object.freeze({
    endMilliseconds,
    source: `runtime-video-segment-${index}`,
    sourceOffsetMilliseconds,
    volume,
  });
}

function imageSources() {
  return Array.from({ length: 12 }, (_, index) => `runtime-image-${index + 1}`);
}

function flashAmount(mode, frame, duration) {
  if (mode === 'hard') return frame === 0 ? 0 : 1;
  if (mode === 'in') return inEase(progress(frame, 0, duration));
  if (mode === 'out') return outEase(progress(frame, 0, duration));
  return clamp(springValue({
    frame,
    fps: FPS,
    config: { damping: 10, stiffness: 200, mass: 0.6 },
  }));
}

function bareFlashRoot() {
  const segmentUnit = new FlashCutSegment(new Video('runtime-video-bare-flash'));
  const shot = new PremountedMediaShot(segmentUnit, {
    duration: 20,
    mediaBackend: 'video',
  });
  return new FlashCutVideoMontage([shot]);
}

function bareOffsetRoot() {
  const shot = new PremountedMediaShot(new Video('runtime-video-bare-offset'), {
    duration: 20,
    mediaBackend: 'offthread-video',
  });
  return new SourceOffsetVideoMontage([shot]);
}

function activeIndex(frame, boundaries) {
  return boundaries.findIndex((to, index) => index > 0 && frame < to) - 1;
}

function isMounted(shot, frame) {
  return shot.mountPhase({ frame }) !== 'inactive';
}

function projected(root, frame, duration) {
  return projectFrame(root, {
    duration,
    fps: FPS,
    frame,
    height: 1920,
    width: 1080,
  });
}

function collect(root) {
  const units = [];
  visitUnits(root, (unit) => units.push(unit));
  return units;
}

function assertFinite(value) {
  if (typeof value === 'number') {
    assert.equal(Number.isFinite(value), true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertFinite);
    return;
  }
  if (value && typeof value === 'object') Object.values(value).forEach(assertFinite);
}

function assertGuardFree(builder) {
  const forbidden = /\b(?:if|else|switch|case|throw|try|catch|finally|typeof|instanceof|for|while|do)\b|\?|&&|\|\|/u;
  assert.doesNotMatch(builder.toString(), forbidden);
  assert.doesNotMatch(builder.toString(), /\.units\b|\.children\b|\.at\(/u);
  assert.doesNotMatch(builder.toString(), /\b(?:filter|transform|style|css)\b/u);
}

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} !== ${expected}`);
}

function fakeReact() {
  return {
    Fragment: 'fragment',
    createElement(type, props, ...children) {
      return { children, props: props ?? {}, type };
    },
  };
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}

function findAll(node, predicate, output = []) {
  if (!node || typeof node !== 'object') return output;
  if (predicate(node)) output.push(node);
  for (const child of node.children ?? []) findAll(child, predicate, output);
  return output;
}

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
