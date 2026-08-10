import assert from 'node:assert/strict';
import test from 'node:test';

import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { Box } from '@cut3/agent-memory/units/base/Box';

const React = {
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
};

test('closed translate-z state preserves the authored CSS3D operation', () => {
  const unit = new Box(undefined, {
    pose: {
      operations: [
        { kind: 'translate-z', value: -80 },
        { kind: 'scale-2d', x: 1.1, y: 1.1 },
      ],
      transformStyle: 'preserve-3d',
    },
  });

  assert.deepEqual(unit.pose.operations, [
    { kind: 'translate-z', value: -80 },
    { kind: 'scale-2d', x: 1.1, y: 1.1 },
  ]);
  assert.equal(
    createReactDriver(React).render(unit, { frame: 0 }).props.style.transform,
    'translateZ(-80px) scale(1.1)',
  );
  assert.throws(
    () => new Box(undefined, { pose: { operations: [{ kind: 'translate-z', value: null }] } }),
    /must be a finite number or CSS dimension string/iu,
  );
  assert.throws(
    () => new Box(undefined, {
      pose: { operations: [{ kind: 'translate-z', value: 4, extra: true }] },
    }),
    /unsupported field extra/iu,
  );
});
