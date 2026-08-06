import assert from 'node:assert/strict';
import test from 'node:test';

import { createReactDriver } from '../core/drivers/react.js';
import { createRemotionDriver } from '../core/drivers/remotion.js';
import { renderVectorPath } from '../core/drivers/react/adapters/vector-path.js';
import { Text } from '../units/text.js';
import { VectorPath } from '../units/vector-path.js';

const React = Object.freeze({
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children };
  },
});
const SEGMENTS = Object.freeze([
  Object.freeze({ move: Object.freeze([4, 8]) }),
  Object.freeze({ line: Object.freeze([120, 12]) }),
  Object.freeze({ cubic: Object.freeze([144, 20, 148, 72, 96, 84]) }),
  Object.freeze({ close: true }),
]);

test('VectorPath normalizes numeric authored geometry and renders through React and Remotion', () => {
  const path = new VectorPath(SEGMENTS, {
    fill: '#ff3b30',
    nonScalingStroke: true,
    roundCaps: true,
    roundJoins: true,
    stroke: '#f5f1e8',
    strokeDasharray: [8, 3],
    strokeWidth: 6,
  });
  const react = createReactDriver(React, renderVectorPath).render(path, { frame: 0 });
  const remotion = createRemotionDriver(React, { Sequence: 'Sequence' }, renderVectorPath)
    .render(path, { frame: 0 });

  assert.equal(path.d, 'M 4 8 L 120 12 C 144 20 148 72 96 84 Z');
  assert.equal(Object.isFrozen(path.path), true);
  assert.equal(Object.isFrozen(path.path[0].values), true);
  assert.deepEqual(react, remotion);
  assert.equal(react.type, 'path');
  assert.equal(react.props.d, path.d);
  assert.equal(react.props.strokeDasharray, '8 3');
  assert.equal(react.props.strokeLinecap, 'round');
  assert.equal(react.props.strokeLinejoin, 'round');
  assert.equal(react.props.vectorEffect, 'non-scaling-stroke');
});

test('VectorPath grammar rejects callbacks, prose, URLs, malformed commands, and child Units', () => {
  assert.throws(() => new VectorPath(() => SEGMENTS), /between 2 and 512 segments/u);
  assert.throws(() => new VectorPath('https://example.test/private'), /between 2 and 512 segments/u);
  assert.throws(() => new VectorPath([
    { move: [0, 0] },
    { line: ['private transcript', 1] },
  ]), /bounded finite number/u);
  assert.throws(() => new VectorPath([
    { line: [0, 0] },
    { close: true },
  ]), /begin with a move/u);
  assert.throws(() => new VectorPath([
    { move: [0, 0] },
    { arc: [10, 10, 0, 2, 0, 20, 20] },
  ]), /flags must be 0 or 1/u);
  assert.throws(() => new VectorPath(SEGMENTS, { renderer: () => null }), /unsupported field/u);
  assert.throws(() => new VectorPath(SEGMENTS).add(new Text('child')), /primitive Unit/u);
});
