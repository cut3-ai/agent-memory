import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { neonFlipTitle } from '@cut3/agent-memory/compositions/NeonFlipTitle';
import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { NeonFlipTitle } from '@cut3/agent-memory/units/neon-heart-pop/NeonFlipTitle';

const React = {
  createElement(type, props, ...children) {
    return { children, props, type };
  },
};

test('bare flip title owns two styled runtime Text Units and no hidden Behaviours', () => {
  const unit = new NeonFlipTitle(new Text('RUNTIME'), new Text('RUNTIME'));
  const children = [];
  visitUnits(unit, (child) => children.push(child));

  assert.equal(children.filter((child) => child.constructor.kind === 'unit.text').length, 2);
  children.forEach((child) => assert.deepEqual(child.behaviours, []));
});

test('builder attaches one owner-first complete flip law to the named stage', () => {
  const unit = neonFlipTitle('RUNTIME');
  const { flip } = unit.animationTargets();

  assert.deepEqual(flip.behaviours.map((behaviour) => behaviour.constructor.kind), [
    'behaviour.neon-heart-pop.flip-title-reveal',
  ]);
  assert.equal(flip.behaviours[0].unit, flip);
  assert.deepEqual(unit.behaviours, []);
});

test('all 24 authored frames preserve exact transform order and deterministic 3D law', () => {
  const unit = neonFlipTitle('RUNTIME');
  const owner = unit.animationTargets().flip;

  for (let frame = 0; frame < 24; frame += 1) {
    const state = projectFrame(unit, { duration: 24, fps: 60, frame }).stateOf(owner);
    assert.deepEqual(state.pose.operations.map(({ kind }) => kind), [
      'rotate-x',
      'translate-z',
    ]);
    state.pose.operations.forEach((entry) => {
      Object.values(entry).filter((value) => typeof value === 'number').forEach((value) => {
        assert.ok(Number.isFinite(value));
      });
    });
  }

  const at = (frame) => projectFrame(
    unit,
    { duration: 24, fps: 60, frame },
  ).stateOf(owner).pose.operations;
  assert.deepEqual(at(0), [
    { kind: 'rotate-x', degrees: 90 },
    { kind: 'translate-z', value: -300 },
  ]);
  assert.deepEqual(at(15), [
    { kind: 'rotate-x', degrees: 0 },
    { kind: 'translate-z', value: 0 },
  ]);
  assert.equal(at(23)[0].degrees, Math.sin((8 / 60) * Math.PI * 0.5) * 3);
});

test('generic driver emits perspective, authored transform order and true gradient text fill', () => {
  const output = createReactDriver(React).render(neonFlipTitle('RUNTIME'), {
    duration: 24,
    fps: 60,
    frame: 0,
  });
  const nodes = flatten(output);
  const perspective = nodes.find((node) => node.props?.style?.perspective === '500px');
  const flip = nodes.find((node) => node.props?.style?.transform === 'rotateX(90deg) translateZ(-300px)');
  const gradient = nodes.find((node) => node.props?.style?.background === (
    'linear-gradient(180deg, #ffffff 0%, #ff69b4 100%)'
  ));

  assert.ok(perspective);
  assert.ok(flip);
  assert.equal(perspective.props.style.position, undefined);
  assert.equal(perspective.props.style.zIndex, undefined);
  assert.equal(flip.props.style.zIndex, undefined);
  assert.equal(flip.props.style.transformStyle, 'preserve-3d');
  assert.equal(gradient.props.style.WebkitBackgroundClip, 'text');
  assert.equal(gradient.props.style.WebkitTextFillColor, 'transparent');
});

test('projection restores stage state and application output remains guard/style-free', async () => {
  const unit = neonFlipTitle('RUNTIME');
  const owner = unit.animationTargets().flip;
  const before = structuredClone(owner.pose);
  projectFrame(unit, { duration: 24, fps: 60, frame: 23 });
  assert.deepEqual(owner.pose, before);

  const source = await readFile(
    new URL('../../../src/compositions/NeonFlipTitle.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /\b(?:if|switch|throw|try|catch|typeof|instanceof)\b/u);
  assert.doesNotMatch(source, /\b(?:appearance|effects|frame|layout|opacity|paint|pose|typography|viewBox)\s*:/u);
  assert.doesNotMatch(source, /\.units\b|\.children\b|\.at\s*\(/u);
});

function flatten(node, result = []) {
  if (!node || typeof node !== 'object') return result;
  result.push(node);
  node.children?.forEach((child) => flatten(child, result));
  return result;
}
