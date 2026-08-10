import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { neonSpinningHeart } from '@cut3/agent-memory/compositions/NeonSpinningHeart';
import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { NeonSpinningHeart } from '@cut3/agent-memory/units/neon-heart-pop/NeonSpinningHeart';

test('bare heart is a fixed vector-and-five-star tree with no hidden Behaviours', () => {
  const unit = new NeonSpinningHeart();
  const units = [];
  visitUnits(unit, (child) => units.push(child));

  assert.equal(units.filter((child) => child.constructor.kind === 'unit.vector-path').length, 1);
  assert.equal(units.filter((child) => child.constructor.kind === 'unit.neon-heart-pop.twinkle-star').length, 5);
  units.forEach((child) => assert.deepEqual(child.behaviours, []));
});

test('builder explicitly attaches one heart burst and five phased constellation twinkles', () => {
  const unit = neonSpinningHeart();
  const { heart, stars } = unit.animationTargets();

  assert.deepEqual(heart.behaviours.map(kind), [
    'behaviour.neon-heart-pop.spinning-heart-burst',
  ]);
  assert.deepEqual(stars.map(({ owner }) => owner.behaviours.map(kind)), [
    ['behaviour.neon-heart-pop.heart-constellation-twinkle'],
    ['behaviour.neon-heart-pop.heart-constellation-twinkle'],
    ['behaviour.neon-heart-pop.heart-constellation-twinkle'],
    ['behaviour.neon-heart-pop.heart-constellation-twinkle'],
    ['behaviour.neon-heart-pop.heart-constellation-twinkle'],
  ]);
  visitUnits(unit, (child) => child.behaviours.forEach((behaviour) => {
    assert.equal(behaviour.unit, child);
  }));
});

test('all 36 authored frames preserve heart transform order and exact twinkle range', () => {
  const unit = neonSpinningHeart();
  const { heart, stars } = unit.animationTargets();

  for (let frame = 0; frame < 36; frame += 1) {
    const projection = projectFrame(unit, { duration: 36, fps: 60, frame });
    const heartState = projection.stateOf(heart);
    assert.deepEqual(heartState.pose.operations.map(({ kind }) => kind), [
      'rotate-y',
      'scale-2d',
    ]);
    assert.equal(heartState.pose.operations[0].degrees, (frame / 60) * 360);
    assert.ok(Number.isFinite(heartState.pose.operations[1].x));
    assert.equal(heartState.pose.operations[1].x, heartState.pose.operations[1].y);
    stars.forEach(({ owner }) => {
      const state = projection.stateOf(owner);
      assert.ok(state.opacity >= 0.2 && state.opacity <= 1);
      assert.ok(Number.isFinite(state.opacity));
    });
  }
});

test('vector geometry and authored glow remain static across projection rollback', () => {
  const unit = neonSpinningHeart();
  const { heart, stars } = unit.animationTargets();
  const before = [heart, ...stars.map(({ owner }) => owner)].map(snapshot);
  for (const frame of [35, 0, 17, 5, 35]) {
    projectFrame(unit, { duration: 36, fps: 60, frame });
  }
  assert.deepEqual([heart, ...stars.map(({ owner }) => owner)].map(snapshot), before);
});

test('application output remains guard-free, style-free and target-name driven', async () => {
  const source = await readFile(
    new URL('../../../src/compositions/NeonSpinningHeart.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /\b(?:if|switch|throw|try|catch|typeof|instanceof)\b/u);
  assert.doesNotMatch(source, /\b(?:appearance|effects|frame|layout|opacity|paint|pose|typography|viewBox)\s*:/u);
  assert.doesNotMatch(source, /\.units\b|\.children\b|\.at\s*\(/u);
});

function kind(behaviour) {
  return behaviour.constructor.kind;
}

function snapshot(unit) {
  return structuredClone({ effects: unit.effects, opacity: unit.opacity, pose: unit.pose });
}
