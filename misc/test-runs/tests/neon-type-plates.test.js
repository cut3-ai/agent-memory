import assert from 'node:assert/strict';
import test from 'node:test';

import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import {
  cubicBezier,
  easeOut,
  easeOutCubic,
  interpolateRange,
} from '@cut3/agent-memory/core/timeline';
import {
  neonChromaWordStack,
  neonDualLineGlitch,
  neonSplitNameplate,
} from '@cut3/agent-memory/compositions/NeonTypePlates';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { NeonChromaWordStack } from '@cut3/agent-memory/units/neon-heart-pop/NeonChromaWordStack';
import { NeonDualLineGlitch } from '@cut3/agent-memory/units/neon-heart-pop/NeonDualLineGlitch';
import {
  NeonSplitNameplate,
  neonSplitParticleRecipes,
} from '@cut3/agent-memory/units/neon-heart-pop/NeonSplitNameplate';

const CLAMP = Object.freeze({ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const LANDING = cubicBezier(0.16, 1, 0.3, 1);
const OUT_EASE = easeOut(cubicBezier(0.42, 0, 1, 1));

test('neon type builders are guard-free and attach explicit owner-first semantic laws', () => {
  [neonChromaWordStack, neonSplitNameplate, neonDualLineGlitch].forEach(assertGuardFree);

  const chroma = neonChromaWordStack(['ONE', 'TWO', 'THREE']);
  const split = neonSplitNameplate('PRIMARY', 'ACCENT', 'LABEL');
  const dual = neonDualLineGlitch('FIRST', 'SECOND');

  assert.ok(chroma instanceof NeonChromaWordStack);
  assert.ok(split instanceof NeonSplitNameplate);
  assert.ok(dual instanceof NeonDualLineGlitch);
  assert.deepEqual(chroma.behaviours.map(kind), ['behaviour.neon-heart-pop.chroma-stack-pop']);
  assert.equal(chroma.behaviours[0].unit, chroma);

  const splitUnits = collect(split);
  const splitTargets = split.animationTargets();
  assert.equal(splitUnits.filter((unit) => unit instanceof Text).length, 3);
  assert.equal(splitUnits.filter((unit) => unit instanceof Box).length, 8);
  assert.equal(splitTargets.length, 11);
  assert.deepEqual(
    splitTargets.map(({ owner, role }) => [owner.constructor.kind, role]),
    [
      ['unit.neon-heart-pop.split-primary-stage', 'primary-stage'],
      ['unit.neon-heart-pop.split-accent-stage', 'accent-stage'],
      ['unit.neon-heart-pop.split-label-stage', 'label-stage'],
      ...Array.from({ length: 8 }, () => ['unit.neon-heart-pop.gold-particle', 'particle']),
    ],
  );
  splitTargets.forEach(({ owner }) => {
    assert.deepEqual(owner.behaviours.map(kind), [
      'behaviour.neon-heart-pop.split-nameplate-cadence',
    ]);
  });
  splitUnits.forEach((unit) => unit.behaviours.forEach((behaviour) => {
    assert.equal(behaviour.unit, unit);
  }));

  const dualUnits = collect(dual);
  const dualTargets = dual.animationTargets();
  assert.equal(dualUnits.filter((unit) => unit instanceof Text).length, 6);
  assert.equal(dualUnits.filter((unit) => unit instanceof Box).length, 1);
  assert.deepEqual(
    dualTargets.map(({ owner, role }) => [owner.constructor.kind, role]),
    [
      ['unit.neon-heart-pop.glitch-line', 'first-line'],
      ['unit.neon-heart-pop.glitch-line', 'second-line'],
      ['unit.neon-heart-pop.glitch-rule', 'rule'],
    ],
  );
  dualTargets.forEach(({ owner }) => {
    assert.deepEqual(owner.behaviours.map(kind), [
      'behaviour.neon-heart-pop.dual-line-glitch-cadence',
    ]);
  });
  dualUnits.forEach((unit) => unit.behaviours.forEach((behaviour) => {
    assert.equal(behaviour.unit, unit);
  }));
});

test('bare neon type Units contain no hidden Behaviours', () => {
  const chromaLayers = ['A', 'B', 'C'].map((word) => [
    new Text(word), new Text(word), new Text(word),
  ]);
  const chroma = new NeonChromaWordStack(chromaLayers);
  const primary = new Text('A');
  const accent = new Text('B');
  const label = new Text('C');
  const split = new NeonSplitNameplate(primary, accent, label);
  const first = [new Text('A'), new Text('A'), new Text('A')];
  const second = [new Text('B'), new Text('B'), new Text('B')];
  const dual = new NeonDualLineGlitch(first, second);

  for (const root of [chroma, split, dual]) {
    collect(root).forEach((unit) => assert.deepEqual(unit.behaviours, []));
  }

  const chromaTexts = collect(chroma).filter((unit) => unit instanceof Text);
  assert.deepEqual(
    chromaTexts.map((unit) => unit.frame.position),
    ['absolute', 'absolute', 'static', 'absolute', 'absolute', 'static', 'absolute', 'absolute', 'static'],
  );
  const [primaryTarget, accentTarget] = split.animationTargets();
  assert.equal(primaryTarget.owner.parent.frame.y, 10);
  assert.equal(accentTarget.owner.frame.y, -20);
  assert.equal(accentTarget.owner.frame.width, '100%');
  assert.equal(accent.frame.position, 'static');
  assert.equal(accent.frame.width, '100%');
});

test('chroma stack matches every authored scale frame', () => {
  const root = neonChromaWordStack(['ONE', 'TWO', 'THREE']);
  for (let frame = 0; frame < 42; frame += 1) {
    const state = projected(root, frame, 42).stateOf(root);
    const expected = interpolateRange(
      frame,
      [0, 18 * 0.6, 18],
      [0, 1.08, 1],
      { ...CLAMP, easing: easeOutCubic },
    );
    assert.deepEqual(state.pose.operations, [
      { kind: 'translate-2d', x: '-50%', y: '-50%' },
      { kind: 'scale-2d', x: expected, y: expected },
    ]);
  }
});

test('split nameplate matches every authored entrance, label and particle frame', () => {
  const root = neonSplitNameplate('PRIMARY', 'ACCENT', 'LABEL');
  const texts = collect(root).filter((unit) => unit instanceof Text);
  const [primary, accent, label] = texts;
  const [primaryTarget, accentTarget, labelTarget, ...particleTargets] = root.animationTargets();

  assert.equal(accentTarget.owner.behaviours.length, 1);
  assert.equal(accentTarget.owner.behaviours[0].unit, accentTarget.owner);
  assert.deepEqual(primary.behaviours, []);
  assert.deepEqual(accent.behaviours, []);
  assert.deepEqual(label.behaviours, []);

  for (let frame = 0; frame < 36; frame += 1) {
    const projection = projected(root, frame, 36);
    const primaryY = interpolateRange(frame, [0, 18], [-150, 0], {
      ...CLAMP, easing: OUT_EASE,
    });
    const accentY = interpolateRange(frame, [6, 24], [150, 0], {
      ...CLAMP, easing: OUT_EASE,
    });
    const labelOpacity = interpolateRange(frame, [24, 30], [0, 0.7], CLAMP);
    const entrance = interpolateRange(frame, [0, 18], [0, 1], {
      ...CLAMP, easing: OUT_EASE,
    });
    assert.deepEqual(projection.stateOf(primaryTarget.owner).pose.operations, [
      { kind: 'translate-y', value: primaryY },
    ]);
    assert.deepEqual(projection.stateOf(accentTarget.owner).pose.operations, [
      { kind: 'translate-y', value: accentY },
      { kind: 'rotate-z', degrees: -8 },
    ]);
    assert.deepEqual(projection.stateOf(primary).pose.operations, []);
    assert.deepEqual(projection.stateOf(accent).pose.operations, []);
    assert.equal(projection.stateOf(labelTarget.owner).opacity, labelOpacity);
    assert.equal(projection.stateOf(label).opacity, 1);
    particleTargets.forEach(({ owner: particle }, index) => {
      const recipe = neonSplitParticleRecipes[index];
      const pulse = (Math.sin(((frame / 60) + recipe.delay) * Math.PI * 2) * 0.5) + 0.5;
      const state = projection.stateOf(particle);
      close(state.opacity, pulse * entrance);
      assert.deepEqual(state.pose.operations, []);
    });
  }
});

test('dual-line glitch matches every authored slide, jitter and rule frame', () => {
  const root = neonDualLineGlitch('FIRST', 'SECOND');
  const texts = collect(root).filter((unit) => unit instanceof Text);
  const [firstTarget, secondTarget, ruleTarget] = root.animationTargets();
  const offsets = [3, -3, 0];

  assert.deepEqual(texts.map((unit) => unit.frame.x), [...offsets, ...offsets]);
  texts.forEach((unit) => assert.deepEqual(unit.behaviours, []));

  for (let frame = 0; frame < 30; frame += 1) {
    const projection = projected(root, frame, 30);
    const firstX = interpolateRange(frame, [0, 12], [-500, 0], {
      ...CLAMP, easing: LANDING,
    });
    const secondX = interpolateRange(frame, [5, 17], [500, 0], {
      ...CLAMP, easing: LANDING,
    });
    const glitch = Math.sin(frame * 2.3) * 4;
    assert.deepEqual(projection.stateOf(firstTarget.owner).pose.operations, [
      { kind: 'translate-x', value: firstX + glitch },
    ]);
    assert.deepEqual(projection.stateOf(secondTarget.owner).pose.operations, [
      { kind: 'translate-x', value: secondX },
      { kind: 'rotate-z', degrees: -4 },
    ]);
    texts.forEach((unit) => assert.deepEqual(projection.stateOf(unit).pose.operations, []));
    assert.equal(
      projection.stateOf(ruleTarget.owner).opacity,
      interpolateRange(frame, [15, 24], [0, 1], CLAMP),
    );
  }
});

function projected(root, frame, duration) {
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

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} !== ${expected}`);
}

function assertGuardFree(builder) {
  const forbidden = /\b(?:if|else|switch|case|throw|try|catch|finally|typeof|instanceof|for|while|do)\b|\?|&&|\|\|/u;
  assert.doesNotMatch(builder.toString(), forbidden);
}
