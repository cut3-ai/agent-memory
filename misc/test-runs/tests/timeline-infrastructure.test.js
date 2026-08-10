import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cubicBezier,
  easeInOut,
  easingBack,
  frameNoise,
  interpolateRange,
  measureSpring,
  springValue,
} from '@cut3/agent-memory/core/timeline';

test('piecewise interpolation preserves authored ranges and explicit extrapolation', () => {
  assert.equal(interpolateRange(5, [0, 10, 20], [0, 100, 50]), 50);
  assert.equal(interpolateRange(15, [0, 10, 20], [0, 100, 50]), 75);
  assert.equal(interpolateRange(-4, [0, 10], [20, 40], { extrapolateLeft: 'clamp' }), 20);
  assert.equal(interpolateRange(14, [0, 10], [20, 40], { extrapolateRight: 'identity' }), 14);
  assert.equal(interpolateRange(12, [0, 10], [0, 1], { extrapolateRight: 'wrap' }), 0.2);
  assert.throws(() => interpolateRange(1, [0, 0], [0, 1]), /strictly increasing/u);
});

test('named easing curves and springs are deterministic finite timeline infrastructure', () => {
  const bezier = cubicBezier(0.42, 0, 0.58, 1);
  const inOutBack = easeInOut(easingBack(1.4));
  assert.equal(bezier(0), 0);
  assert.equal(bezier(1), 1);
  assert.ok(bezier(0.5) > 0.49 && bezier(0.5) < 0.51);
  assert.equal(inOutBack(0.5), 0.5);

  const config = { damping: 12, mass: 0.8, stiffness: 140 };
  const values = [0, 1, 6, 12, 30].map((frame) => springValue({ config, fps: 60, frame }));
  assert.deepEqual(values, [0, ...values.slice(1)]);
  values.forEach((value) => assert.ok(Number.isFinite(value)));
  assert.deepEqual(
    values,
    [0, 1, 6, 12, 30].map((frame) => springValue({ config, fps: 60, frame })),
  );
  assert.ok(Number.isInteger(measureSpring({ config, fps: 60 })));
});

test('frame noise has no history and returns the same bounded value for the same frame and seed', () => {
  const first = frameNoise(19, 7);
  frameNoise(20, 7);
  const repeated = frameNoise(19, 7);
  assert.equal(first, repeated);
  assert.ok(first >= -1 && first <= 1);
  assert.notEqual(first, frameNoise(19, 8));
});
