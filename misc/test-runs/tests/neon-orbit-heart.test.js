import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { neonOrbitHeart } from '@cut3/agent-memory/compositions/NeonOrbitHeart';
import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { NeonOrbitHeart } from '@cut3/agent-memory/units/neon-heart-pop/NeonOrbitHeart';

test('bare orbit-heart owns CSS heart geometry, four lights and two runtime texts', () => {
  const unit = new NeonOrbitHeart(new Text('PRIMARY'), new Text('ACCENT'));
  const units = [];
  visitUnits(unit, (child) => units.push(child));

  assert.equal(units.filter((child) => child.constructor.kind === 'unit.neon-heart-pop.orbit-particle').length, 4);
  assert.equal(units.filter((child) => child.constructor.kind === 'unit.text').length, 2);
  assert.ok(units.length >= 13);
  units.forEach((child) => assert.deepEqual(child.behaviours, []));
});

test('builder explicitly attaches heart, four orbit and caption laws to named owners', () => {
  const unit = neonOrbitHeart('PRIMARY', 'ACCENT');
  const { caption, heart, particles } = unit.animationTargets();

  assert.deepEqual(heart.behaviours.map(kind), [
    'behaviour.neon-heart-pop.orbit-heart-burst',
  ]);
  assert.deepEqual(particles.map(({ owner }) => owner.behaviours.map(kind)), [
    ['behaviour.neon-heart-pop.orbit-particle-cadence'],
    ['behaviour.neon-heart-pop.orbit-particle-cadence'],
    ['behaviour.neon-heart-pop.orbit-particle-cadence'],
    ['behaviour.neon-heart-pop.orbit-particle-cadence'],
  ]);
  assert.deepEqual(caption.behaviours.map(kind), [
    'behaviour.neon-heart-pop.orbit-caption-reveal',
  ]);
  visitUnits(unit, (child) => child.behaviours.forEach((behaviour) => {
    assert.equal(behaviour.unit, child);
  }));
});

test('all 42 authored frames preserve exact orbit radius, transform order and caption cue', () => {
  const unit = neonOrbitHeart('PRIMARY', 'ACCENT');
  const { caption, heart, particles } = unit.animationTargets();

  for (let frame = 0; frame < 42; frame += 1) {
    const projection = projectFrame(unit, { duration: 42, fps: 60, frame });
    const heartState = projection.stateOf(heart);
    assert.deepEqual(heartState.pose.operations.map(({ kind }) => kind), [
      'rotate-y',
      'scale-2d',
    ]);
    assert.equal(heartState.pose.operations[0].degrees, (frame / 60) * 360);
    particles.forEach(({ offset, owner }) => {
      const state = projection.stateOf(owner);
      const angle = ((frame / 60) * 2 * 2 * Math.PI) + offset;
      assert.equal(state.frame.x, Math.cos(angle) * 140);
      assert.equal(state.frame.y, Math.sin(angle) * 140);
      assert.equal(
        state.opacity,
        heartState.pose.operations[1].x,
      );
    });
    const captionState = projection.stateOf(caption);
    assert.equal(captionState.opacity, expectedCaption(frame));
  }
});

test('projection is history-independent and restores all animated semantic owners', () => {
  const unit = neonOrbitHeart('PRIMARY', 'ACCENT');
  const targets = unit.animationTargets();
  const owners = [targets.heart, ...targets.particles.map(({ owner }) => owner), targets.caption];
  const before = owners.map(snapshot);

  for (const frame of [41, 0, 23, 9, 41]) {
    projectFrame(unit, { duration: 42, fps: 60, frame });
  }
  assert.deepEqual(owners.map(snapshot), before);
});

test('application output remains guard-free, style-free and target-name driven', async () => {
  const source = await readFile(
    new URL('../../../src/compositions/NeonOrbitHeart.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /\b(?:if|switch|throw|try|catch|typeof|instanceof)\b/u);
  assert.doesNotMatch(source, /\b(?:appearance|effects|frame|layout|opacity|paint|pose|typography|viewBox)\s*:/u);
  assert.doesNotMatch(source, /\.units\b|\.children\b|\.at\s*\(/u);
});

function expectedCaption(frame) {
  if ((frame / 60) * 1000 < 350) return 0;
  return Math.min(1, Math.max(0, (frame - 21) / 12));
}

function kind(behaviour) {
  return behaviour.constructor.kind;
}

function snapshot(unit) {
  return structuredClone({ frame: unit.frame, opacity: unit.opacity, pose: unit.pose });
}

