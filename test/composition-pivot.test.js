import assert from 'node:assert/strict';
import test from 'node:test';

import { Rotate } from '../behaviours/rotate.js';
import { Scale } from '../behaviours/scale.js';
import { createReactDriver } from '../core/drivers/react.js';
import { renderCompositionPivot } from '../core/drivers/react/adapters/composition-pivot.js';
import { renderText } from '../core/drivers/react/adapters/text.js';
import { CompositionPivot } from '../units/composition-pivot.js';
import { Text } from '../units/text.js';

const React = Object.freeze({
  Fragment: Symbol('fragment'),
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
});

function renderPivotTree(context) {
  const pivot = renderCompositionPivot(context);
  if (pivot !== context.unhandled) return pivot;
  return renderText(context);
}

test('React adapter preserves composition coordinates and transforms around the absolute pivot', () => {
  const pivot = new CompositionPivot(new Text('CUT3'), { x: 480, y: 270 });
  pivot.add(new Scale(pivot, 2), new Rotate(pivot, 15));

  const rendered = createReactDriver(React, renderPivotTree).render(pivot, {
    frame: 8,
    height: 1080,
    width: 1920,
  });

  assert.deepEqual(rendered.props.style, {
    height: 1080,
    left: 480,
    position: 'absolute',
    top: 270,
    transformOrigin: '0px 0px',
    width: 1920,
    transform: 'scale(2) rotate(15deg)',
  });
  const content = rendered.children[0];
  assert.deepEqual(content.props.style, {
    height: 1080,
    left: -480,
    position: 'absolute',
    top: -270,
    width: 1920,
  });
  assert.equal(content.children[0].type, 'span');
  assert.deepEqual(content.children[0].children, ['CUT3']);
});

test('React adapter fails closed when the composition extent is unavailable', () => {
  const pivot = new CompositionPivot(new Text('CUT3'), { x: 480, y: 270 });
  const driver = createReactDriver(React, renderPivotTree);

  assert.throws(
    () => driver.render(pivot),
    /positive composition width and height/,
  );
  assert.throws(
    () => driver.render(pivot, { width: 1920, height: 0 }),
    /positive composition width and height/,
  );
});
