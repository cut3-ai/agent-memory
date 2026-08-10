import assert from 'node:assert/strict';
import test from 'node:test';

import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { Text } from '@cut3/agent-memory/units/base/Text';

const React = {
  createElement(type, props, ...children) {
    return { children, props, type };
  },
};

test('typed text gradient maps to clipped standard and WebKit text fill', () => {
  const unit = new Text('RUNTIME', {
    typography: {
      fill: {
        kind: 'linear-gradient',
        angle: 180,
        stops: [
          { offset: 0, color: '#ffffff' },
          { offset: 1, color: '#ff69b4' },
        ],
      },
    },
  });
  const output = createReactDriver(React).render(unit, { frame: 0 });

  assert.equal(output.props.style.background, 'linear-gradient(180deg, #ffffff 0%, #ff69b4 100%)');
  assert.equal(output.props.style.backgroundClip, 'text');
  assert.equal(output.props.style.WebkitBackgroundClip, 'text');
  assert.equal(output.props.style.WebkitTextFillColor, 'transparent');
  assert.equal(output.props.style.color, 'transparent');
});

test('text fill is fail-closed to structured gradients and leaves legacy color unchanged', () => {
  assert.throws(
    () => new Text('NO RAW CSS', { typography: { fill: 'linear-gradient(red, blue)' } }),
    /plain object/u,
  );
  assert.throws(
    () => new Text('NO IMAGE', {
      typography: { fill: { kind: 'image', source: 'private' } },
    }),
    /structured gradient/u,
  );

  const legacy = createReactDriver(React).render(new Text('LEGACY', {
    paint: { color: '#123456' },
  }), { frame: 0 });
  assert.equal(legacy.props.style.color, '#123456');
  assert.equal(legacy.props.style.backgroundClip, undefined);
  assert.equal(legacy.props.style.WebkitTextFillColor, undefined);
});

