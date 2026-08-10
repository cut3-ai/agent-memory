import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  neonFiveHitPhotoNameplate,
} from '@cut3/agent-memory/compositions/NeonFiveHitPhotoNameplate';
import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { Text } from '@cut3/agent-memory/units/base/Text';
import {
  NeonFiveHitPhotoNameplate,
} from '@cut3/agent-memory/units/neon-heart-pop/NeonFiveHitPhotoNameplate';

const SOURCES = Object.freeze(['one', 'two', 'three', 'four', 'five']);
const DELAYS = Object.freeze([0, 9, 18, 27, 36]);

test('bare five-hit Unit is a substantial static tree with zero hidden Behaviours', () => {
  const unit = new NeonFiveHitPhotoNameplate(
    SOURCES.map((source) => new Image(source)),
    new Text('RUNTIME TITLE'),
  );
  const units = [];
  visitUnits(unit, (child) => units.push(child));

  assert.ok(units.length >= 16);
  assert.equal(units.filter((child) => child.constructor.kind === 'unit.image').length, 5);
  assert.equal(units.filter((child) => child.constructor.kind === 'unit.text').length, 1);
  units.forEach((child) => assert.deepEqual(child.behaviours, []));
});

test('builder attaches five slams and the coordinated camera, title and exposure laws', () => {
  const unit = neonFiveHitPhotoNameplate(SOURCES, 'RUNTIME TITLE');
  const targets = unit.animationTargets();

  assert.deepEqual(targets.cards.map(({ owner }) => kinds(owner)), [
    ['behaviour.neon-heart-pop.five-hit-photo-slam'],
    ['behaviour.neon-heart-pop.five-hit-photo-slam'],
    ['behaviour.neon-heart-pop.five-hit-photo-slam'],
    ['behaviour.neon-heart-pop.five-hit-photo-slam'],
    ['behaviour.neon-heart-pop.five-hit-photo-slam'],
  ]);
  assert.deepEqual(kinds(targets.camera), [
    'behaviour.neon-heart-pop.five-hit-camera-shake',
  ]);
  assert.deepEqual(kinds(targets.title), [
    'behaviour.neon-heart-pop.five-hit-title-slam',
  ]);
  assert.equal(targets.title.constructor.kind, 'unit.text');
  assert.deepEqual(kinds(targets.exposure), [
    'behaviour.neon-heart-pop.five-hit-exposure-burst',
  ]);
  visitUnits(unit, (child) => child.behaviours.forEach((behaviour) => {
    assert.equal(behaviour.unit, child);
  }));
});

test('all 60 authored frames preserve hit visibility, transform order and finite state', () => {
  const unit = neonFiveHitPhotoNameplate(SOURCES, 'RUNTIME TITLE');
  const targets = unit.animationTargets();

  for (let frame = 0; frame < 60; frame += 1) {
    const projection = projectFrame(unit, { duration: 60, fps: 60, frame });
    targets.cards.forEach(({ index, owner }) => {
      const state = projection.stateOf(owner);
      assert.equal(state.present, frame >= DELAYS[index]);
      assert.deepEqual(state.pose.operations.map(({ kind }) => kind), [
        'translate-2d',
        'translate-2d',
        'rotate-z',
        'scale-2d',
      ]);
      assertFinite(state.pose.operations);
    });
    const camera = projection.stateOf(targets.camera);
    assert.deepEqual(camera.pose.operations.map(({ kind }) => kind), [
      'translate-2d',
      'rotate-z',
    ]);
    assertFinite(camera.pose.operations);

    const title = projection.stateOf(targets.title);
    assert.equal(title.present, frame >= 45);
    assert.equal(title.opacity, frame >= 45 ? 1 : 0);
    assertFinite(title.pose.operations);

    const exposure = projection.stateOf(targets.exposure);
    const inFlashWindow = DELAYS.some((delay) => frame >= delay && frame < delay + 5);
    assert.equal(exposure.present, inFlashWindow);
    assert.ok(exposure.opacity >= 0 && exposure.opacity <= 0.9);
  }
});

test('authored hit endpoints match five entrances, title slam and exposure envelope', () => {
  const unit = neonFiveHitPhotoNameplate(SOURCES, 'RUNTIME TITLE');
  const targets = unit.animationTargets();
  const at = (frame, owner) => projectFrame(
    unit,
    { duration: 60, fps: 60, frame },
  ).stateOf(owner);

  assert.equal(operation(at(0, targets.cards[0].owner), 'translate-2d', 1).x, -1000);
  assert.equal(operation(at(9, targets.cards[0].owner), 'translate-2d', 1).x, 0);
  assert.equal(operation(at(9, targets.cards[1].owner), 'translate-2d', 1).x, 1000);
  assert.equal(operation(at(18, targets.cards[1].owner), 'translate-2d', 1).x, 0);
  assert.equal(operation(at(36, targets.cards[4].owner), 'scale-2d').x, 4);
  assert.equal(operation(at(45, targets.cards[4].owner), 'scale-2d').x, 1);
  assert.equal(operation(at(45, targets.title), 'scale-2d').x, 3);
  assert.equal(operation(at(50, targets.title), 'scale-2d').x, 1);
  assert.equal(at(0, targets.exposure).opacity, 0.85);
  assert.equal(at(1, targets.exposure).opacity, 0.9);
  assert.equal(at(5, targets.exposure).present, false);
});

test('projection is history-independent and restores every owner after all frames', () => {
  const unit = neonFiveHitPhotoNameplate(SOURCES, 'RUNTIME TITLE');
  const targets = unit.animationTargets();
  const owners = [unit, targets.camera, ...targets.cards.map(({ owner }) => owner), targets.title, targets.exposure];
  const before = owners.map(snapshot);

  for (let frame = 0; frame < 60; frame += 1) {
    projectFrame(unit, { duration: 60, fps: 60, frame });
  }
  assert.deepEqual(owners.map(snapshot), before);

  const first = projectFrame(unit, { duration: 60, fps: 60, frame: 37 });
  projectFrame(unit, { duration: 60, fps: 60, frame: 2 });
  const repeated = projectFrame(unit, { duration: 60, fps: 60, frame: 37 });
  owners.forEach((owner) => assert.deepEqual(repeated.stateOf(owner), first.stateOf(owner)));
});

test('application output is guard-free, style-free and never discovers children by position', async () => {
  const source = await readFile(
    new URL('../../../src/compositions/NeonFiveHitPhotoNameplate.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /\b(?:if|switch|throw|try|catch|typeof|instanceof)\b/u);
  assert.doesNotMatch(source, /\b(?:appearance|effects|frame|layout|opacity|paint|pose|typography|viewBox)\s*:/u);
  assert.doesNotMatch(source, /\.units\b|\.children\b|\.at\s*\(|\[[0-9]+\]/u);
});

function kinds(unit) {
  return unit.behaviours.map((behaviour) => behaviour.constructor.kind);
}

function operation(state, kind, occurrence = 0) {
  return state.pose.operations.filter((entry) => entry.kind === kind)[occurrence];
}

function assertFinite(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  else if (Array.isArray(value)) value.forEach(assertFinite);
  else if (value && typeof value === 'object') Object.values(value).forEach(assertFinite);
}

function snapshot(unit) {
  return structuredClone({
    effects: unit.effects,
    opacity: unit.opacity,
    pose: unit.pose,
    present: unit.present,
  });
}
