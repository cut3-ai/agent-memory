import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import {
  BehaviourGroup,
  OpacityBehaviour,
  ScaleBehaviour,
  TranslateBehaviour,
} from '../core/Behaviour.js';
import { createReactDriver } from '../core/drivers/react.js';
import { createRuntime } from '../core/runtime.js';

const React = {
  Fragment: 'fragment',
  createElement: (type, props, ...children) => ({ type, props, children }),
};

test('Unit applies and removes a manually attached Behaviour', () => {
  const runtime = createRuntime({ driver: createReactDriver(React) });
  const unit = runtime.makeUnit('div', { style: {} });
  const opacity = new OpacityBehaviour({ read: () => 0.25 });
  unit.add(opacity);
  assert.equal(runtime.render(unit).props.style.opacity, 0.25);
  unit.remove(opacity);
  assert.equal(runtime.render(unit).props.style.opacity, undefined);
});

test('BehaviourGroup renders the atomic factory outputs, not its original combined value', () => {
  const runtime = createRuntime({ driver: createReactDriver(React) });
  const group = new BehaviourGroup([
    new ScaleBehaviour({ read: () => 'scale(999)' }),
    new TranslateBehaviour({ read: () => 'translateX(999px)' }),
  ], () => 'scale(1) translateX(10px)');
  const unit = runtime.makeUnit('div', { style: { transform: group } });
  assert.equal(runtime.render(unit).props.style.transform, 'scale(999) translateX(999px)');
  unit.remove(group.behaviours[0]);
  assert.equal(runtime.render(unit).props.style.transform, 'translateX(999px)');
});

test('spread evaluates its source exactly once', () => {
  let calls = 0;
  const runtime = createRuntime();
  const value = runtime.spread('behaviour.dom.properties', () => {
    calls += 1;
    return { a: calls, b: calls };
  });
  assert.equal(calls, 1);
  assert.equal(value.a.onFrame(), 1);
  assert.equal(value.b.onFrame(), 1);
  assert.equal(calls, 1);
});

test('lifecycle Behaviour attaches to the root and preserves one-argument useEffect arity', () => {
  const runtime = createRuntime();
  let hookArguments = null;
  runtime.effect('behaviour.lifecycle.effect', (...args) => {
    hookArguments = args;
  }, [() => undefined], { channel: 'lifecycle' });
  const child = runtime.makeUnit('span', {});
  const root = runtime.makeUnit('div', {}, [child]);
  runtime.finish(root);
  assert.equal(hookArguments.length, 1);
  assert.equal(root.behaviours.length, 1);
  assert.equal(child.behaviours.length, 0);
});

test('strict runtime rejects an unresolved factory', () => {
  const runtime = createRuntime({ strict: true });
  assert.throws(
    () => runtime.template('unit.missing', 'div', null),
    /Unresolved Unit factory/,
  );
  assert.throws(
    () => runtime.value('behaviour.missing', () => 1),
    /Unresolved Behaviour factory/,
  );
});

test('React driver materializes Behaviour values inside cross-realm props', () => {
  const runtime = createRuntime({ driver: createReactDriver(React) });
  const props = vm.runInNewContext('({ style: {} })');
  props.style.opacity = new OpacityBehaviour({ read: () => 0.25 });
  const rendered = runtime.render(runtime.makeUnit('div', props));
  assert.deepEqual(rendered.props, { style: { opacity: 0.25 } });
});
