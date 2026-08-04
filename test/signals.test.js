import assert from 'node:assert/strict';
import test from 'node:test';

import { isBehaviour } from '../core/Behaviour.js';
import {
  Computed,
  ContextValue,
  Interpolation,
  RecordValue,
  sample,
} from '../core/signals.js';

test('callback-free Signals express timeline interpolation as plain immutable config', () => {
  const frame = new ContextValue('frame');
  const duration = new ContextValue('durationInFrames');
  const end = new Computed('subtract', [duration, 1]);
  const value = new Interpolation({
    input: frame,
    inputRange: [0, end],
    outputRange: [0, 1],
    easing: { name: 'out', easing: 'cubic' },
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  assert.equal(sample(value, { frame: 0, durationInFrames: 11 }), 0);
  assert.equal(sample(value, { frame: 5, durationInFrames: 11 }), 0.875);
  assert.equal(sample(value, { frame: 20, durationInFrames: 11 }), 1);
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.inputRange), true);
  assert.equal(Object.isFrozen(value.easing), true);
  assert.equal(containsOwnFunction(value), false);
});

test('numeric helpers stay reusable Signal computations and never become Behaviours', () => {
  const halfFrame = new Computed('divide', [new ContextValue('frame'), 2]);
  const vector = new RecordValue({ x: 0, y: new Computed('round', [halfFrame]) });

  assert.equal(sample(halfFrame, { frame: 7 }), 3.5);
  assert.deepEqual(sample(vector, { frame: 7 }), { x: 0, y: 4 });
  assert.equal(isBehaviour(halfFrame), false);
  assert.equal(isBehaviour(vector), false);
  assert.equal(Computed.kind, 'signal.computed');
  assert.equal(RecordValue.kind, 'signal.record-value');
  assert.throws(
    () => sample(new Computed('divide', [1, 0]), { frame: 0 }),
    /non-finite value/,
  );
});

test('Interpolation selects exact boundaries from the adjacent piecewise segment', () => {
  const value = new Interpolation({
    input: new ContextValue('frame'),
    inputRange: [0, 5, 10],
    outputRange: [10, 50, 20],
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  assert.equal(sample(value, { frame: 0 }), 10);
  assert.equal(sample(value, { frame: 5 }), 50);
  assert.equal(sample(value, { frame: 10 }), 20);
  assert.equal(sample(value, { frame: 2.5 }), 30);
  assert.equal(sample(value, { frame: 7.5 }), 35);
});

test('Signal IR rejects callbacks, unknown operations and executable easing', () => {
  assert.throws(() => new Computed('divide', [() => 1, 2]), /plain data or a built-in Signal/);
  assert.throws(() => new Computed('eval', [1]), /Unknown signal computation/);
  assert.throws(() => new RecordValue({ x: () => 1 }), /plain data or a built-in Signal/);
  assert.throws(() => new Interpolation({
    input: 0,
    inputRange: [0, 1],
    outputRange: [0, 1],
    easing: () => 1,
  }), /declarative descriptor/);
});

function containsOwnFunction(value, seen = new Set()) {
  if (typeof value === 'function') return true;
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((nested) => containsOwnFunction(nested, seen));
}
