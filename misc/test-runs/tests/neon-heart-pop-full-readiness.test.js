import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { neonFiveHitPhotoNameplate } from '@cut3/agent-memory/compositions/NeonFiveHitPhotoNameplate';
import { neonFlipTitle } from '@cut3/agent-memory/compositions/NeonFlipTitle';
import { neonOrbitHeart } from '@cut3/agent-memory/compositions/NeonOrbitHeart';
import { neonSpinningHeart } from '@cut3/agent-memory/compositions/NeonSpinningHeart';
import {
  neonChromaWordStack,
  neonDualLineGlitch,
  neonSplitNameplate,
} from '@cut3/agent-memory/compositions/NeonTypePlates';
import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { publicSnapshot } from '@cut3/agent-memory/core/state';
import {
  cubicBezier,
  interpolateRange,
  springValue,
} from '@cut3/agent-memory/core/timeline';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { NeonChromaWordStack } from '@cut3/agent-memory/units/neon-heart-pop/NeonChromaWordStack';
import { NeonFlipTitle } from '@cut3/agent-memory/units/neon-heart-pop/NeonFlipTitle';
import { NeonSplitNameplate } from '@cut3/agent-memory/units/neon-heart-pop/NeonSplitNameplate';

const SOURCES = Object.freeze(['one', 'two', 'three', 'four', 'five']);
const CLAMP = Object.freeze({ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const LANDING = cubicBezier(0.16, 1, 0.3, 1);
const RECIPES = Object.freeze([
  Object.freeze({ duration: 36, id: 'W10C13', root: () => neonSpinningHeart() }),
  Object.freeze({ duration: 24, id: 'W10C14', root: () => neonFlipTitle('RUNTIME') }),
  Object.freeze({
    duration: 42,
    id: 'W10C15',
    root: () => neonChromaWordStack(['ONE', 'TWO', 'THREE']),
  }),
  Object.freeze({
    duration: 36,
    id: 'W10C16',
    root: () => neonSplitNameplate('PRIMARY', 'ACCENT', 'LABEL'),
  }),
  Object.freeze({
    duration: 30,
    id: 'W10C17',
    root: () => neonDualLineGlitch('FIRST', 'SECOND'),
  }),
  Object.freeze({ duration: 42, id: 'W10C18', root: () => neonOrbitHeart('FIRST', 'SECOND') }),
  Object.freeze({
    duration: 60,
    id: 'W10C19',
    root: () => neonFiveHitPhotoNameplate(SOURCES, 'RUNTIME'),
  }),
]);

test('C13-C17 static topology preserves authored positioning and named semantic owners', () => {
  const flip = new NeonFlipTitle(new Text('RUNTIME'), new Text('RUNTIME'));
  const flipTexts = collect(flip).filter((unit) => unit instanceof Text);
  assert.deepEqual(flipTexts.map((unit) => unit.frame.position), ['absolute', 'static']);
  assert.equal(flip.animationTargets().flip.constructor.kind, 'unit.neon-heart-pop.flip-title-stage');

  const chroma = new NeonChromaWordStack(['A', 'B', 'C'].map((word) => (
    [new Text(word), new Text(word), new Text(word)]
  )));
  assert.deepEqual(chroma.layout.gap, { column: 0, row: 0 });

  const split = new NeonSplitNameplate(new Text('A'), new Text('B'), new Text('C'));
  assert.equal(split.constructor.kind, 'unit.neon-heart-pop.split-nameplate');
  assert.equal(split.units[0].name, 'neon-split-content-stage');
  assert.equal(split.units[0].constructor.kind, 'unit.layer');
  assert.equal(split.units[0].frame.y, 10);
  assert.deepEqual(
    split.animationTargets().map(({ owner }) => owner.constructor.kind),
    [
      'unit.neon-heart-pop.split-primary-stage',
      'unit.neon-heart-pop.split-accent-stage',
      'unit.neon-heart-pop.split-label-stage',
      ...Array.from({ length: 8 }, () => 'unit.neon-heart-pop.gold-particle'),
    ],
  );

  for (const recipe of RECIPES.slice(0, 5)) {
    const root = recipe.root();
    collect(root).forEach((unit) => unit.behaviours.forEach((behaviour) => {
      assert.equal(behaviour.unit, unit);
      assert.match(unit.constructor.kind, /^unit\.neon-heart-pop\./u);
    }));
  }
});

test('C13 and C14 match every authored spring, twinkle, flip and wobble frame', () => {
  const heartRoot = neonSpinningHeart();
  const heartTargets = heartRoot.animationTargets();
  for (let frame = 0; frame < 36; frame += 1) {
    const projection = project(heartRoot, frame, 36);
    const heart = projection.stateOf(heartTargets.heart);
    const expectedScale = springValue({
      config: { damping: 12, stiffness: 100 },
      durationInFrames: 18,
      fps: 60,
      frame,
    });
    assert.deepEqual(heart.pose.operations, [
      { kind: 'rotate-y', degrees: (frame / 60) * 360 },
      { kind: 'scale-2d', x: expectedScale, y: expectedScale },
    ]);
    heartTargets.stars.forEach(({ offset, owner }) => {
      const wave = Math.sin(((frame + offset) / 60) * Math.PI * 2);
      const expected = interpolateRange(wave, [-1, 1], [0.2, 1], CLAMP);
      assert.equal(projection.stateOf(owner).opacity, expected);
    });
  }

  const flipRoot = neonFlipTitle('RUNTIME');
  const flip = flipRoot.animationTargets().flip;
  for (let frame = 0; frame < 24; frame += 1) {
    const amount = Math.min(frame / 15, 1);
    const landingRotate = interpolateRange(amount, [0, 1], [90, 0], {
      ...CLAMP,
      easing: LANDING,
    });
    const translateZ = interpolateRange(amount, [0, 1], [-300, 0], {
      ...CLAMP,
      easing: LANDING,
    });
    const wobble = frame > 15
      ? Math.sin(((frame - 15) / 60) * Math.PI * 0.5) * 3
      : 0;
    assert.deepEqual(project(flipRoot, frame, 24).stateOf(flip).pose.operations, [
      { kind: 'rotate-x', degrees: landingRotate + wobble },
      { kind: 'translate-z', value: translateZ },
    ]);
  }
});

test('all seven occurrences are finite, history-independent and roll back over exactly 270 frames', () => {
  let frames = 0;
  for (const recipe of RECIPES) {
    const root = recipe.root();
    const tree = collect(root);
    const authored = new Map(tree.map((unit) => [unit, structuredClone(publicSnapshot(unit))]));
    for (let frame = 0; frame < recipe.duration; frame += 1) {
      const first = project(root, frame, recipe.duration);
      project(root, recipe.duration - frame - 1, recipe.duration);
      const repeated = project(root, frame, recipe.duration);
      tree.forEach((unit) => {
        assertFinite(first.stateOf(unit));
        assert.deepEqual(repeated.stateOf(unit), first.stateOf(unit));
        assert.deepEqual(publicSnapshot(unit), authored.get(unit));
      });
      frames += 1;
    }
  }
  assert.equal(frames, 270);
});

test('accepted C18 orbit contract remains unchanged', () => {
  const root = neonOrbitHeart('FIRST', 'SECOND');
  const { caption, heart, particles } = root.animationTargets();
  assert.deepEqual(heart.behaviours.map(kind), ['behaviour.neon-heart-pop.orbit-heart-burst']);
  assert.deepEqual(particles.map(({ owner }) => owner.behaviours.map(kind)), (
    Array.from({ length: 4 }, () => ['behaviour.neon-heart-pop.orbit-particle-cadence'])
  ));
  assert.deepEqual(caption.behaviours.map(kind), ['behaviour.neon-heart-pop.orbit-caption-reveal']);

  for (let frame = 0; frame < 42; frame += 1) {
    const projection = project(root, frame, 42);
    const heartState = projection.stateOf(heart);
    assert.equal(heartState.pose.operations[0].degrees, (frame / 60) * 360);
    particles.forEach(({ offset, owner }) => {
      const angle = ((frame / 60) * 4 * Math.PI) + offset;
      const state = projection.stateOf(owner);
      assert.equal(state.frame.x, Math.cos(angle) * 140);
      assert.equal(state.frame.y, Math.sin(angle) * 140);
      assert.equal(state.opacity, heartState.pose.operations[1].x);
    });
    assert.equal(
      projection.stateOf(caption).opacity,
      frame < 21 ? 0 : Math.min(1, Math.max(0, (frame - 21) / 12)),
    );
  }
});

test('accepted C19 five-hit contract remains unchanged', () => {
  const root = neonFiveHitPhotoNameplate(SOURCES, 'RUNTIME');
  const targets = root.animationTargets();
  const delays = [0, 9, 18, 27, 36];
  assert.deepEqual(targets.cards.map(({ owner }) => owner.behaviours.map(kind)), (
    Array.from({ length: 5 }, () => ['behaviour.neon-heart-pop.five-hit-photo-slam'])
  ));
  assert.deepEqual(targets.camera.behaviours.map(kind), [
    'behaviour.neon-heart-pop.five-hit-camera-shake',
  ]);
  assert.deepEqual(targets.title.behaviours.map(kind), [
    'behaviour.neon-heart-pop.five-hit-title-slam',
  ]);
  assert.deepEqual(targets.exposure.behaviours.map(kind), [
    'behaviour.neon-heart-pop.five-hit-exposure-burst',
  ]);

  for (let frame = 0; frame < 60; frame += 1) {
    const projection = project(root, frame, 60);
    targets.cards.forEach(({ index, owner }) => {
      assert.equal(projection.stateOf(owner).present, frame >= delays[index]);
    });
    const title = projection.stateOf(targets.title);
    assert.equal(title.present, frame >= 45);
    assert.equal(title.opacity, frame >= 45 ? 1 : 0);
    const flash = projection.stateOf(targets.exposure);
    assert.equal(flash.present, delays.some((delay) => frame >= delay && frame < delay + 5));
  }
});

test('all seven application builders remain guard-free, style-free and position-independent', async () => {
  const files = [
    'NeonSpinningHeart.js',
    'NeonFlipTitle.js',
    'NeonTypePlates.js',
    'NeonOrbitHeart.js',
    'NeonFiveHitPhotoNameplate.js',
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../../../src/compositions/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\b(?:if|switch|throw|try|catch|typeof|instanceof)\b/u);
    assert.doesNotMatch(
      source,
      /\b(?:appearance|effects|frame|layout|opacity|paint|pose|typography|viewBox)\s*:/u,
    );
    assert.doesNotMatch(source, /\.units\b|\.children\b|\.at\s*\(|\[[0-9]+\]/u);
  }
});

function project(root, frame, duration) {
  return projectFrame(root, { duration, fps: 60, frame, height: 1920, width: 1080 });
}

function collect(root) {
  const units = [];
  visitUnits(root, (unit) => units.push(unit));
  return units;
}

function kind(behaviour) {
  return behaviour.constructor.kind;
}

function assertFinite(value) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value));
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(assertFinite);
    return;
  }
  Object.values(value).forEach(assertFinite);
}
