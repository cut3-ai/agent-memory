import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { publicSnapshot } from '@cut3/agent-memory/core/state';
import {
  easeOut,
  lerp,
  progress,
  springValue,
} from '@cut3/agent-memory/core/timeline';
import { beatGlitchPhoto } from '@cut3/agent-memory/compositions/BeatGlitchPhoto';
import { maskedPanelTriptych } from '@cut3/agent-memory/compositions/MaskedPanelTriptych';
import { perspectivePhotoStack } from '@cut3/agent-memory/compositions/PerspectivePhotoStack';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { BeatPhotoCadence } from '@cut3/agent-memory/behaviours/photo-glitch/BeatPhotoCadence';
import { PanelKenBurnsDrift } from '@cut3/agent-memory/behaviours/photo-glitch/PanelKenBurnsDrift';
import { Image } from '@cut3/agent-memory/units/base/Image';
import {
  BeatExposureVignette,
  BeatGlitchPhoto,
} from '@cut3/agent-memory/units/photo-glitch/BeatGlitchPhoto';
import { MaskedPanelTriptych } from '@cut3/agent-memory/units/photo-glitch/MaskedPanelTriptych';
import {
  MaskedPanelMedia,
  MaskedPhotoPanel,
} from '@cut3/agent-memory/units/photo-glitch/MaskedPhotoPanel';
import { PerspectivePhotoCard } from '@cut3/agent-memory/units/photo-glitch/PerspectivePhotoCard';
import { PerspectivePhotoStack } from '@cut3/agent-memory/units/photo-glitch/PerspectivePhotoStack';
import { PolygonClipContent } from '@cut3/agent-memory/units/photo-glitch/PolygonClipContent';
import {
  BeatPhotoMedia,
  RgbGlitchStage,
} from '@cut3/agent-memory/units/photo-glitch/RgbGlitchStage';

const FPS = 60;
const BEAT_FRAMES = 22.3;
const cubic = (value) => value ** 3;
const panels = Object.freeze([
  panel(0, 0, -1200, [[0, 0], [1, 0], [1, 0.46], [0, 0.58]], 1.12, -2, -3, 14, 110),
  panel(10, -1200, 0, [[0, 0.6], [0.56, 0.5], [0.44, 1], [0, 1]], 1, 3, 2, 16, 120),
  panel(20, 1200, 0, [[0.56, 0.48], [1, 0.48], [1, 1], [0.44, 1]], 1.13, -3, 3, 16, 120),
]);
const cards = Object.freeze([
  card(0, -180, -120, -14, 18, -20, 0.92),
  card(15, 200, -40, 12, -14, 22, 1),
  card(30, -120, 180, 9, 20, 16, 0.96),
  card(45, 150, 220, -10, -18, -18, 1.04),
]);

test('photo-glitch builders are guard-free and attach cohesive owner-first laws explicitly', () => {
  [beatGlitchPhoto, maskedPanelTriptych, perspectivePhotoStack].forEach(assertGuardFree);

  const masked = maskedPanelTriptych(maskedSources());
  assert.ok(masked instanceof MaskedPanelTriptych);
  assert.deepEqual(masked.behaviours.map((entry) => entry.constructor.kind), [
    'behaviour.photo-glitch.triptych-exit',
  ]);
  assert.equal(masked.behaviours[0].unit, masked);
  masked.units.forEach((maskedPanel, index) => {
    assert.ok(maskedPanel instanceof MaskedPhotoPanel);
    assert.equal(maskedPanel.parent, masked);
    assert.deepEqual(maskedPanel.maskPolygon, panels[index].polygon);
    assert.deepEqual(maskedPanel.behaviours.map((entry) => entry.constructor.kind), [
      'behaviour.photo-glitch.masked-panel-reveal',
    ]);
    assert.equal(maskedPanel.behaviours[0].unit, maskedPanel);
    const [content] = maskedPanel.units;
    const [image] = content.units;
    assert.ok(image instanceof MaskedPanelMedia);
    assert.equal(image.panelIndex, index);
    assert.ok(content instanceof PolygonClipContent);
    assert.deepEqual(content.maskPolygon, panels[index].polygon);
    assert.deepEqual(content.behaviours, []);
    assert.deepEqual(image.behaviours.map((entry) => entry.constructor.kind), [
      'behaviour.photo-glitch.panel-ken-burns',
    ]);
    assert.equal(image.behaviours[0].unit, image);
  });

  const perspective = perspectivePhotoStack(perspectiveSources());
  assert.ok(perspective instanceof PerspectivePhotoStack);
  const [stage] = perspective.units;
  assert.equal(stage.units.length, 4);
  stage.units.forEach((photoCard) => {
    assert.ok(photoCard instanceof PerspectivePhotoCard);
    assert.deepEqual(photoCard.behaviours.map((entry) => entry.constructor.kind), [
      'behaviour.photo-glitch.perspective-card-drop',
    ]);
    assert.equal(photoCard.behaviours[0].unit, photoCard);
    assert.deepEqual(photoCard.units[0].behaviours, []);
  });
  assert.deepEqual(perspective.behaviours, []);
  assert.deepEqual(stage.behaviours, []);

  const glitch = beatGlitchPhoto(beatSources());
  const [rgbStage, scanlines, vignette] = glitch.units;
  const [image] = rgbStage.units;
  assert.ok(glitch instanceof BeatGlitchPhoto);
  assert.ok(rgbStage instanceof RgbGlitchStage);
  assert.equal(scanlines.constructor.kind, 'unit.photo-glitch.beat-scanline-field');
  assert.ok(vignette instanceof BeatExposureVignette);
  assert.ok(image instanceof BeatPhotoMedia);
  assert.equal(glitch.vignette, vignette);
  assert.deepEqual(rgbStage.behaviours.map((entry) => entry.constructor.kind), [
    'behaviour.photo-glitch.rgb-beat-glitch',
  ]);
  assert.deepEqual(image.behaviours.map((entry) => entry.constructor.kind), [
    'behaviour.photo-glitch.beat-photo-cadence',
  ]);
  assert.deepEqual(vignette.behaviours.map((entry) => entry.constructor.kind), [
    'behaviour.photo-glitch.beat-vignette-flicker',
  ]);
  assert.equal(Object.hasOwn(scanlines, 'commands'), false);
  assert.equal(rgbStage.behaviours[0].unit, rgbStage);
  assert.equal(image.behaviours[0].unit, image);
  assert.equal(vignette.behaviours[0].unit, vignette);
  assert.deepEqual(glitch.behaviours, []);
  assert.deepEqual(scanlines.behaviours, []);
});

test('every F7 law rejects generic visual owners and targets a closed family semantic Unit', () => {
  assert.throws(
    () => new PanelKenBurnsDrift(new Image('generic-panel'), 0),
    /unit\.photo-glitch\.masked-panel-media/u,
  );
  assert.throws(
    () => new BeatPhotoCadence(new Image('generic-beat'), ['runtime-source']),
    /unit\.photo-glitch\.beat-media/u,
  );

  const source = maskedSources()[0];
  const panelMedia = new MaskedPanelMedia(source, 0);
  const beatMedia = new BeatPhotoMedia(beatSources()[0]);
  assert.equal(new PanelKenBurnsDrift(panelMedia, 0).unit, panelMedia);
  assert.equal(new BeatPhotoCadence(beatMedia, beatSources()).unit, beatMedia);

  const roots = [
    maskedPanelTriptych(maskedSources()),
    perspectivePhotoStack(perspectiveSources()),
    beatGlitchPhoto(beatSources()),
  ];
  const owners = [];
  roots.forEach((root) => visitUnits(root, (unit) => {
    unit.behaviours.forEach((behaviour) => owners.push(behaviour.unit.constructor.kind));
  }));
  assert.equal(owners.length, 14);
  assert.equal(owners.every((kind) => kind.startsWith('unit.photo-glitch.')), true);
});

test('bare semantic Units retain their complete static trees with zero hidden Behaviours', () => {
  const roots = [bareMasked(), barePerspective(), bareGlitch()];
  roots.forEach((root) => {
    visitUnits(root, (unit) => {
      assert.deepEqual(unit.behaviours, []);
      assert.equal(Object.hasOwn(unit, 'style'), false);
      assert.equal(Object.hasOwn(unit, 'css'), false);
      assert.notEqual(unit.constructor.kind, 'unit.canvas-2d');
    });
  });
  assert.equal(collect(roots[0]).length, 10);
  assert.equal(collect(roots[1]).length, 10);
  assert.equal(collect(roots[2]).length, 5);
});

test('masked triptych reproduces every spring, polygon, camera drift and exit frame', () => {
  const sources = maskedSources();
  const root = maskedPanelTriptych(sources);

  for (let frame = 0; frame < 210; frame += 1) {
    const projection = projected(root, frame, 210);
    const exitDuration = Math.round(FPS * 0.4);
    const exitAmount = progress(frame, 210 - exitDuration, exitDuration);
    close(projection.stateOf(root).opacity, 1 - (exitAmount ** 3), `triptych exit ${frame}`);
    const reveal = progress(frame, 0, 24);
    assert.deepEqual(projection.stateOf(root).sceneCadence, {
      exit: exitAmount,
      phase: exitAmount > 0 ? 'exit' : reveal < 1 ? 'reveal' : 'hold',
      reveal,
    });
    assert.equal(projection.stateOf(root).present, exitAmount < 1);

    root.units.forEach((maskedPanel, index) => {
      const authored = panels[index];
      const localFrame = frame - authored.delay;
      const spring = springValue({
        frame: localFrame,
        fps: FPS,
        config: {
          damping: authored.damping,
          stiffness: authored.stiffness,
          mass: 1,
        },
      });
      const panelState = projection.stateOf(maskedPanel);
      assert.deepEqual(panelState.maskPolygon, authored.polygon);
      assert.deepEqual(panelState.pose.operations, [{
        kind: 'translate-2d',
        x: lerp(authored.fromX, 0, spring),
        y: lerp(authored.fromY, 0, spring),
      }]);
      close(panelState.opacity, progress(localFrame, 0, 4), `panel opacity ${frame}/${index}`);
      assert.equal(panelState.effects.shadow, '0 18px 28px rgba(0,0,0,0.6)');

      const [content] = maskedPanel.units;
      const [image] = content.units;
      const contentState = projection.stateOf(content);
      assert.deepEqual(contentState.maskPolygon, authored.polygon);
      assert.equal(contentState.overflow, 'hidden');
      assert.deepEqual(contentState.paint.border.top, {
        width: 10,
        style: 'solid',
        color: '#000000',
      });

      const amount = progress(frame, 0, 210);
      const scaleTo = 1 + ((authored.scaleAxis - 1) * 0.5) + 0.12;
      const imageState = projection.stateOf(image);
      assert.ok(image instanceof MaskedPanelMedia);
      close(imageState.cameraProgress, amount, `camera progress ${frame}/${index}`);
      assert.equal(imageState.source, sources[index]);
      assert.equal(imageState.fit, 'cover');
      assert.deepEqual(imageState.pose.operations, [
        {
          kind: 'scale-2d',
          x: lerp(1, scaleTo, amount),
          y: lerp(1, scaleTo, amount),
        },
        {
          kind: 'translate-2d',
          x: lerp(0, authored.panX * 6, amount),
          y: lerp(0, authored.panY * 6, amount),
        },
      ]);
    });
  }
});

test('perspective stack reproduces every authored two-spring 3D card frame', () => {
  const sources = perspectiveSources();
  const root = perspectivePhotoStack(sources);
  const [stage] = root.units;

  for (let frame = 0; frame < 150; frame += 1) {
    const projection = projected(root, frame, 150);
    assert.equal(projection.stateOf(root).pose.perspective, 1400);
    assert.equal(projection.stateOf(stage).pose.transformStyle, 'preserve-3d');
    stage.units.forEach((photoCard, index) => {
      const authored = cards[index];
      const localFrame = frame - authored.delay;
      const drop = springValue({
        frame: localFrame,
        fps: FPS,
        config: { damping: 16, stiffness: 90, mass: 1.1 },
      });
      const settle = springValue({
        frame: localFrame,
        fps: FPS,
        config: { damping: 11, stiffness: 120, mass: 0.8 },
      });
      const state = projection.stateOf(photoCard);
      assert.deepEqual(state.pose.operations, [
        {
          kind: 'translate',
          x: lerp(authored.x * 0.3, authored.x, settle),
          y: lerp(-1300, authored.y, drop),
          z: lerp(600, 0, drop),
        },
        { kind: 'rotate-x', degrees: lerp(authored.rotateX * 3, 0, drop) },
        { kind: 'rotate-y', degrees: lerp(authored.rotateY * 2.5, 0, settle) },
        { kind: 'rotate-z', degrees: lerp(authored.rotate * 4, authored.rotate, settle) },
        {
          kind: 'scale-2d',
          x: lerp(0.4, authored.scale, drop),
          y: lerp(0.4, authored.scale, drop),
        },
      ]);
      close(state.opacity, progress(localFrame, 0, 6), `card opacity ${frame}/${index}`);
      assert.equal(state.pose.transformStyle, 'preserve-3d');
      assert.equal(state.paint.fill, '#ffffff');
      assert.equal(state.paint.radius, 4);
      assert.deepEqual(state.effects.boxShadows, [
        { x: 0, y: 30, blur: 60, spread: 0, inset: false, color: 'rgba(0,0,0,0.55)' },
        { x: 0, y: 8, blur: 20, spread: 0, inset: false, color: 'rgba(0,0,0,0.4)' },
      ]);
      const imageState = projection.stateOf(photoCard.units[0]);
      assert.equal(imageState.source, sources[index]);
      assert.deepEqual(pick(imageState.frame, ['x', 'y', 'width', 'height']), {
        x: 18,
        y: 18,
        width: 420,
        height: 520,
      });
    });
  }
});

test('beat photo reproduces every fractional beat cut, motion, RGB ghost and overlay frame', () => {
  const sources = beatSources();
  const root = beatGlitchPhoto(sources);
  const [stage, scanlines, vignette] = root.units;
  const [image] = stage.units;

  assert.equal(Object.hasOwn(scanlines, 'commands'), false);
  assert.deepEqual(scanlines.paint.backgrounds, [{
    angle: 0,
    blendMode: 'normal',
    kind: 'linear-gradient',
    repeating: true,
    stops: [
      { offset: 0, unit: 'px', color: 'rgba(0,0,0,0.18)' },
      { offset: 1, unit: 'px', color: 'rgba(0,0,0,0.18)' },
      { offset: 1, unit: 'px', color: 'transparent' },
      { offset: 3, unit: 'px', color: 'transparent' },
    ],
  }]);

  for (let frame = 0; frame < 270; frame += 1) {
    const projection = projected(root, frame, 270);
    const index = Math.floor(frame / BEAT_FRAMES);
    const localFrame = frame - (index * BEAT_FRAMES);
    const beatPhase = frame % BEAT_FRAMES;
    const variant = index % 4;
    const snap = springValue({
      frame: localFrame,
      fps: FPS,
      config: { damping: 14, stiffness: 200, mass: 0.7 },
    });
    let x = 0;
    let y = 0;
    let scale = 1;
    let rotate = 0;
    if (variant === 0) {
      scale = lerp(1.5, 1, easeOut(cubic)(progress(localFrame, 0, 6)));
    } else if (variant === 1) {
      const direction = index % 8 === 1 ? -1 : 1;
      x = lerp(direction * 1080, 0, snap);
      scale = lerp(1.08, 1, progress(localFrame, 0, 8));
    } else if (variant === 2) {
      rotate = lerp(15, 0, snap);
      scale = lerp(1.4, 1, snap);
    } else {
      y = lerp(1920, 0, snap);
      scale = lerp(1.08, 1, progress(localFrame, 0, 8));
    }

    const imageState = projection.stateOf(image);
    assert.ok(image instanceof BeatPhotoMedia);
    assert.equal(imageState.source, sources[index % sources.length]);
    assert.equal(imageState.beatIndex, index);
    close(imageState.beatLocalFrame, localFrame, `beat local frame ${frame}`);
    assert.equal(imageState.beatVariant, variant);
    assert.deepEqual(imageState.pose.operations, [
      { kind: 'translate-2d', x, y },
      { kind: 'scale-2d', x: scale, y: scale },
      { kind: 'rotate-z', degrees: rotate },
    ]);
    assert.deepEqual(imageState.pose.origin, { x: '50%', y: '50%', z: 0 });

    const glitching = beatPhase < 4;
    const strength = glitching ? lerp(5, 0, progress(beatPhase, 0, 4)) : 0;
    const stageState = projection.stateOf(stage);
    close(stageState.glitchStrength, strength, `glitch strength ${frame}`);
    assert.equal(stageState.mediaEpoch, index);
    assert.deepEqual(stageState.rgbGhosts, [
      { x: -strength, y: 0, blur: 0, color: 'rgba(255,0,0,0.75)' },
      { x: strength, y: 0, blur: 0, color: 'rgba(0,200,255,0.75)' },
    ]);
    assert.deepEqual(stageState.pose.operations, [{
      kind: 'translate-x',
      value: glitching ? Math.sin(frame * 7.3) * strength * 0.8 : 0,
    }]);

    const scanlineState = projection.stateOf(scanlines);
    assert.equal(scanlineState.opacity, 0.5);
    assert.equal(scanlineState.effects.blendMode, 'multiply');
    const vignetteState = projection.stateOf(vignette);
    const exposure = 0.6 + (Math.sin(frame * 0.9) * 0.04);
    close(vignetteState.opacity, exposure, `vignette ${frame}`);
    close(vignetteState.exposureLevel, exposure, `exposure level ${frame}`);
    assert.deepEqual(vignetteState.exposureCadence, {
      beatIndex: index,
      beatLocalFrame: localFrame,
      level: exposure,
      oscillation: frame * 0.9,
    });
    assert.equal(vignetteState.present, true);
    assert.deepEqual(vignetteState.paint.backgrounds[0].stops, [
      { offset: 0.55, color: 'transparent' },
      { offset: 1, color: 'rgba(0,0,0,0.55)' },
    ]);
  }
});

test('all 630 authored states stay finite and projection rollback is deterministic', () => {
  const entries = [
    [maskedPanelTriptych(maskedSources()), 210],
    [perspectivePhotoStack(perspectiveSources()), 150],
    [beatGlitchPhoto(beatSources()), 270],
  ];
  entries.forEach(([root, duration]) => {
    const units = collect(root);
    const before = units.map((unit) => publicSnapshot(unit));
    for (let frame = 0; frame < duration; frame += 1) {
      const projection = projected(root, frame, duration);
      units.forEach((unit) => assertFinite(projection.stateOf(unit)));
      units.forEach((unit, index) => assert.deepEqual(publicSnapshot(unit), before[index]));
    }
    const first = projected(root, duration - 1, duration);
    projected(root, 0, duration);
    const repeated = projected(root, duration - 1, duration);
    units.forEach((unit) => assert.deepEqual(repeated.stateOf(unit), first.stateOf(unit)));
  });
});

test('driver maps exact CSS3D but leaves polygon, RGB ghost and keyed-remount contracts explicit', () => {
  const React = fakeReact();
  const driver = createReactDriver(React, { imageComponent: 'runtime-image' });

  const masked = maskedPanelTriptych(maskedSources());
  const maskedTree = driver.render(masked, frameInput(30, 210));
  const maskedStyles = collectElements(maskedTree).map((node) => node.props.style).filter(Boolean);
  assert.equal(maskedStyles.some((style) => Object.hasOwn(style, 'clipPath')), false);
  assert.equal(maskedStyles.some((style) => Object.hasOwn(style, 'WebkitClipPath')), false);
  assert.equal(maskedStyles.some((style) => (
    style.filter === 'drop-shadow(0 18px 28px rgba(0,0,0,0.6))'
  )), true);
  assert.deepEqual(projected(masked, 30, 210).stateOf(masked.units[0]).maskPolygon, panels[0].polygon);

  const perspective = perspectivePhotoStack(perspectiveSources());
  const perspectiveTree = driver.render(perspective, frameInput(60, 150));
  const cardNode = collectElements(perspectiveTree).find((node) => (
    typeof node.props.style?.transform === 'string'
    && node.props.style.transform.includes('rotateX(')
  ));
  assert.ok(cardNode);
  assert.ok(cardNode.props.style.transform.indexOf('translate3d(') < cardNode.props.style.transform.indexOf('rotateX('));
  assert.ok(cardNode.props.style.transform.indexOf('rotateX(') < cardNode.props.style.transform.indexOf('rotateY('));
  assert.ok(cardNode.props.style.transform.indexOf('rotateY(') < cardNode.props.style.transform.indexOf('rotateZ('));
  assert.ok(cardNode.props.style.transform.indexOf('rotateZ(') < cardNode.props.style.transform.indexOf('scale('));

  const glitch = beatGlitchPhoto(beatSources());
  const glitchTree = driver.render(glitch, frameInput(23, 270));
  const glitchElements = collectElements(glitchTree);
  const scanlineNode = glitchElements.find((node) => (
    String(node.props.style?.background ?? '').startsWith('repeating-linear-gradient')
  ));
  assert.equal(
    scanlineNode.props.style.background,
    'repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)',
  );
  assert.equal(scanlineNode.props.style.mixBlendMode, 'multiply');
  const serializedFilters = glitchElements.map((node) => node.props.style?.filter ?? '').join(' ');
  assert.doesNotMatch(serializedFilters, /rgba\((?:255,0,0|0,200,255),0\.75\)/u);
  const renderedImage = glitchElements.find((node) => node.type === 'runtime-image');
  assert.equal(Object.hasOwn(renderedImage.props, 'key'), false);
  const glitchState = projected(glitch, 23, 270).stateOf(glitch.units[0]);
  assert.equal(glitchState.mediaEpoch, 1);
  assert.equal(glitchState.rgbGhosts.length, 2);
});

test('new photo-glitch sources contain no private literals, URLs, hashes or raw style bags', async () => {
  const paths = [
    'src/units/photo-glitch/BeatGlitchPhoto.js',
    'src/units/photo-glitch/MaskedPanelTriptych.js',
    'src/units/photo-glitch/MaskedPhotoPanel.js',
    'src/units/photo-glitch/PerspectivePhotoCard.js',
    'src/units/photo-glitch/PerspectivePhotoStack.js',
    'src/units/photo-glitch/PolygonClipContent.js',
    'src/units/photo-glitch/RgbGlitchStage.js',
    'src/behaviours/photo-glitch/BeatPhotoCadence.js',
    'src/behaviours/photo-glitch/BeatVignetteFlicker.js',
    'src/behaviours/photo-glitch/MaskedPanelSpringReveal.js',
    'src/behaviours/photo-glitch/PanelKenBurnsDrift.js',
    'src/behaviours/photo-glitch/PerspectiveCardDrop.js',
    'src/behaviours/photo-glitch/RgbBeatGlitch.js',
    'src/behaviours/photo-glitch/TriptychExitFade.js',
    'src/compositions/BeatGlitchPhoto.js',
    'src/compositions/MaskedPanelTriptych.js',
    'src/compositions/PerspectivePhotoStack.js',
  ];
  const source = (await Promise.all(paths.map((path) => readFile(path, 'utf8')))).join('\n');
  assert.doesNotMatch(source, /https?:\/\/|(?:workspace|composition)-\d|[a-f\d]{32,}/iu);
  assert.doesNotMatch(source, /\b(?:prompt|jsonl|customer|private)\b/iu);
  assert.doesNotMatch(source, /\b(?:style|css)\s*:\s*\{/iu);
});

function panel(delay, fromX, fromY, polygon, scaleAxis, panX, panY, damping, stiffness) {
  return Object.freeze({
    damping,
    delay,
    fromX,
    fromY,
    panX,
    panY,
    polygon: Object.freeze(polygon.map(([x, y]) => Object.freeze({ x, y }))),
    scaleAxis,
    stiffness,
  });
}

function card(delay, x, y, rotate, rotateX, rotateY, scale) {
  return Object.freeze({ delay, rotate, rotateX, rotateY, scale, x, y });
}

function maskedSources() {
  return ['runtime-masked-a', 'runtime-masked-b', 'runtime-masked-c'];
}

function perspectiveSources() {
  return ['runtime-depth-a', 'runtime-depth-b', 'runtime-depth-c', 'runtime-depth-d'];
}

function beatSources() {
  return Array.from({ length: 11 }, (_, index) => `runtime-beat-${index + 1}`);
}

function bareMasked() {
  const images = panels.map((_, index) => new MaskedPanelMedia(`bare-masked-${index}`, index));
  return new MaskedPanelTriptych(images);
}

function barePerspective() {
  const images = cards.map((_, index) => new Image(`bare-depth-${index}`));
  return new PerspectivePhotoStack(images);
}

function bareGlitch() {
  return new BeatGlitchPhoto(new RgbGlitchStage(new BeatPhotoMedia('bare-beat')));
}

function projected(root, frame, duration) {
  return projectFrame(root, frameInput(frame, duration));
}

function frameInput(frame, duration) {
  return { duration, fps: FPS, frame, height: 1920, width: 1080 };
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
  assert.doesNotMatch(builder.toString(), /\b(?:clipPath|filter|transform|style|css)\b/u);
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

function collectElements(node, output = []) {
  if (!node || typeof node !== 'object') return output;
  output.push(node);
  (node.children ?? []).forEach((child) => collectElements(child, output));
  return output;
}

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
