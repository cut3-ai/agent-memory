import assert from 'node:assert/strict';
import test from 'node:test';

import { Opacity } from '../behaviours/opacity.js';
import { Group } from '../units/group.js';
import { NativeUnit, renderNativeTree } from '../src/cba-v2/runtime/NativeUnit.js';

const React = Object.freeze({
  Fragment: Symbol.for('test.fragment'),
  createElement(type, props, ...children) { return { type, props, children }; },
});

test('NativeUnit rejects a render plan whose Unit order differs from its owned tree', () => {
  const left = new Group();
  const right = new Group();
  const reversedTree = new Group(right, left);

  assert.throws(
    () => new NativeUnit('div', {}, [left, right], reversedTree),
    /render slots require one transparent Group child/u,
  );
});

test('NativeUnit revalidates the render frontier after tree mutation', () => {
  const left = new Group();
  const right = new Group();
  const tree = new Group(left, right);
  const native = new NativeUnit('div', {}, ['before', [left, null], right, 'after'], tree);

  const rendered = renderNativeTree(native, React, {}, ({ renderChildren }) => renderChildren());
  assert.deepEqual(rendered.children, ['before', [[], null], [], 'after']);

  tree.remove(left);
  assert.throws(
    () => renderNativeTree(native, React, {}, ({ renderChildren }) => renderChildren()),
    /render slots require one transparent Group child/u,
  );
});

test('NativeUnit rejects observable state on its synthetic multi-child Group', () => {
  const left = new Group();
  const right = new Group();
  const tree = new Group(left, right);
  const native = new NativeUnit('div', {}, [left, right], tree);

  tree.add(new Opacity(tree, 0.5));
  assert.throws(
    () => renderNativeTree(native, React, {}, ({ renderChildren }) => renderChildren()),
    /render slots require one transparent Group child/u,
  );
});
