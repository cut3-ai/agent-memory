import assert from 'node:assert/strict';
import test from 'node:test';

import { parseExpression } from '@babel/parser';

import {
  lowerSignalFormula,
  lowerTransformSignal,
  signalIrClassNames,
} from '../src/cba-v2/signal-ir.js';

test('formula IR recognizes only callback-free timeline arithmetic and interpolation', () => {
  const signal = lowerSignalFormula(parse(`
    Math.round(interpolate(
      context.frame,
      [0, context.durationInFrames - 1],
      [0, 100],
      {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      }
    )) / 100
  `));
  assert.ok(signal);
  assert.deepEqual(signalIrClassNames(signal), ['Computed', 'ContextValue', 'Interpolation']);
  assert.equal(Object.isFrozen(signal), true);
  assert.equal(JSON.stringify(signal).includes('function'), false);
  assert.equal(lowerSignalFormula(parse('(() => context.frame)()')), null);
  assert.equal(lowerSignalFormula(parse('userFunction(context.frame)')), null);
});

test('transform IR separates scale and translate into independent value signals', () => {
  const expression = parse('`translateY(${interpolate(context.frame, [0, 10], [20, 0])}px) scale(${1 + context.frame / 100})`');
  const translate = lowerTransformSignal(expression, {
    kind: 'translate', operation: 'translateY', operationIndex: 0, unit: 'px',
  });
  const scale = lowerTransformSignal(expression, {
    kind: 'scale', operation: 'scale', operationIndex: 1, unit: null,
  });
  assert.deepEqual(signalIrClassNames(translate), ['ContextValue', 'Interpolation', 'RecordValue']);
  assert.deepEqual(signalIrClassNames(scale), ['Computed', 'ContextValue']);
  assert.equal(translate.type, 'record');
  assert.equal(scale.type, 'computed');
});

test('transform IR rejects nested CSS functions instead of storing a source script', () => {
  const expression = parse('`translate(calc(${context.frame}px), 0px)`');
  assert.equal(lowerTransformSignal(expression, {
    kind: 'translate', operation: 'translate', operationIndex: 0, unit: 'px',
  }), null);
});

function parse(source) {
  return parseExpression(source, { plugins: ['typescript'] });
}
