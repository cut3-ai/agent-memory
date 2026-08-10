import assert from 'node:assert/strict';
import test from 'node:test';

import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { Engine } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { capturePublicState, matchesPublicState } from '@cut3/agent-memory/core/state';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { createRemotionDriver } from '@cut3/agent-memory/drivers/remotion';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Image } from '@cut3/agent-memory/units/base/Image';

const React = {
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
};

class AuthoredPresenceWindow extends Behaviour {
  static kind = 'behaviour.test.authored-presence-window';

  onFrame({ frame }) {
    this.unit.present = frame >= 2 && frame < 4;
    this.unit.opacity = frame === 3 ? 0 : 1;
  }
}

test('typed present defaults true and rejects non-boolean constructor input', () => {
  const defaultBox = new Box();
  assert.equal(defaultBox.present, true);
  assert.equal(defaultBox.frame.z, 'auto');
  assert.equal(new Box(undefined, { frame: { z: 0 } }).frame.z, 0);
  assert.equal(createReactDriver(React).render(defaultBox, { frame: 0 }).props.style.zIndex, undefined);
  assert.equal(
    createReactDriver(React).render(new Box(undefined, { frame: { z: 0 } }), { frame: 0 })
      .props.style.zIndex,
    0,
  );
  assert.equal(new Box(undefined, { present: false }).present, false);
  assert.throws(() => new Box(undefined, { present: 0 }), /present must be a boolean/iu);
  assert.throws(() => new Image('/synthetic.png', { present: 'false' }), /present must be a boolean/iu);
});

test('projected presence toggles deterministically and rolls owner state back', () => {
  const child = new Image('/synthetic.png');
  const owner = new Box(child);
  owner.addBehaviour(new AuthoredPresenceWindow(owner));
  const baseline = capturePublicState(owner);

  for (const [frame, present, opacity] of [
    [0, false, 1],
    [2, true, 1],
    [3, true, 0],
    [4, false, 1],
  ]) {
    const first = projectFrame(owner, { frame, duration: 8, fps: 60 });
    const second = projectFrame(owner, { frame, duration: 8, fps: 60 });
    assert.equal(first.stateOf(owner).present, present);
    assert.equal(first.stateOf(owner).opacity, opacity);
    assert.deepEqual(first.stateOf(owner), second.stateOf(owner));
    assert.equal(matchesPublicState(owner, baseline), true);
  }
});

test('React and Remotion omit a present-false subtree while opacity zero stays mounted', () => {
  const image = new Image('/synthetic.png');
  const owner = new Box(image);
  owner.addBehaviour(new AuthoredPresenceWindow(owner));
  const composition = new Composition(owner, { duration: 8, fps: 60 });
  const reactDriver = createReactDriver(React);
  const remotionDriver = createRemotionDriver(React, { Sequence: 'remotion-sequence' });

  for (const driver of [reactDriver, remotionDriver]) {
    assert.equal(find(driver.render(composition, { frame: 0 }), 'img').length, 0);
    assert.equal(find(driver.render(composition, { frame: 2 }), 'img').length, 1);
    const transparentOwner = find(
      driver.render(composition, { frame: 3 }),
      (node) => node.type === 'div' && node.props?.style?.opacity === 0,
    );
    assert.equal(transparentOwner.length, 1);
    assert.equal(find(transparentOwner[0], 'img').length, 1);
    assert.equal(find(driver.render(composition, { frame: 4 }), 'img').length, 0);
  }
});

test('Engine output applies projected presence before traversing the subtree', () => {
  const owner = new Box(new Image('/synthetic.png'));
  owner.addBehaviour(new AuthoredPresenceWindow(owner));
  const composition = new Composition(owner, { duration: 8, fps: 60 });
  const engine = new Engine(composition);

  assert.deepEqual(engine.at({ frame: 0 }).children, []);
  assert.equal(engine.at({ frame: 2 }).children[0].present, true);
  assert.equal(engine.at({ frame: 2 }).children[0].children.length, 1);
  assert.equal(engine.at({ frame: 3 }).children[0].opacity, 0);
  assert.deepEqual(engine.at({ frame: 4 }).children, []);
});

test('CompositionPivot uses the same projected presence contract for its complete subtree', () => {
  const pivot = new CompositionPivot(new Image('/synthetic.png'), { x: 540, y: 960 });
  pivot.addBehaviour(new AuthoredPresenceWindow(pivot));
  const composition = new Composition(pivot, { duration: 8, fps: 60 });
  const driver = createReactDriver(React);

  assert.equal(find(driver.render(composition, { frame: 0 }), 'img').length, 0);
  assert.equal(find(driver.render(composition, { frame: 2 }), 'img').length, 1);
  assert.equal(find(driver.render(composition, { frame: 4 }), 'img').length, 0);
  assert.throws(
    () => new CompositionPivot(undefined, { present: 'yes' }),
    /present must be a boolean/iu,
  );
});

function find(root, predicate) {
  const testNode = typeof predicate === 'function'
    ? predicate
    : (node) => node.type === predicate;
  const result = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (testNode(node)) result.push(node);
    for (const child of node.children ?? []) walk(child);
  };
  walk(root);
  return result;
}
