import assert from 'node:assert/strict';
import test from 'node:test';

import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { createRemotionDriver } from '@cut3/agent-memory/drivers/remotion';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Text } from '@cut3/agent-memory/units/base/Text';

const React = {
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
};

const Remotion = { Sequence: 'remotion-sequence' };

test('Text emits ordered inline Text children after runtime copy and omits absent subtrees', () => {
  const root = new Text('RUNTIME');
  const first = new Text('FIRST', {
    inline: { display: 'inline-block', marginStart: 3, verticalAlign: 'middle' },
  });
  const absent = new Text('ABSENT', {
    inline: { display: 'inline', marginStart: '0.25em', verticalAlign: 'super' },
    present: false,
  });
  const last = new Text('LAST', {
    inline: { display: 'inline', marginStart: 1, verticalAlign: -2 },
  });
  root.add(first, absent, last);

  for (const driver of [
    createReactDriver(React),
    createRemotionDriver(React, Remotion),
  ]) {
    const output = driver.render(root, { frame: 0 });
    assert.equal(output.type, 'div');
    assert.equal(output.children[0], 'RUNTIME');
    assert.deepEqual(output.children.slice(1).map((node) => node.type), ['span', 'span']);
    assert.deepEqual(output.children.slice(1).map((node) => node.children[0]), ['FIRST', 'LAST']);
    assert.equal(output.children[1].props.style.display, 'inline-block');
    assert.equal(output.children[1].props.style.position, 'static');
    assert.equal(output.children[1].props.style.left, undefined);
    assert.equal(output.children[1].props.style.marginInlineStart, '3px');
    assert.equal(output.children[1].props.style.verticalAlign, 'middle');
    assert.equal(output.children[2].props.style.marginInlineStart, '1px');
    assert.equal(output.children[2].props.style.verticalAlign, '-2px');
  }
});

test('Text children and inline placement fail closed', () => {
  const root = new Text('RUNTIME');
  assert.throws(() => root.add(new Text('BLOCK')), /inline contract/u);
  assert.throws(() => root.add(new Box()), /inline contract/u);
  assert.throws(
    () => new Text('BAD', { inline: { display: 'flex' } }),
    /inline\.display/u,
  );
  assert.throws(
    () => new Text('BAD', { inline: { verticalAlign: {} } }),
    /inline\.verticalAlign/u,
  );
  assert.throws(
    () => new Text('BAD', { inline: { marginStart: null } }),
    /inline\.marginStart/u,
  );
  assert.throws(
    () => new Text('BAD', { inline: { display: 'inline', raw: 'position:absolute' } }),
    /unsupported field raw/u,
  );

  const child = new Text('CHILD', { inline: { display: 'inline' } });
  root.add(child);
  child.inline = { display: 'inline', marginStart: 0, verticalAlign: {} };
  assert.throws(() => createReactDriver(React).render(root, { frame: 0 }), /inline\.verticalAlign/u);
});

test('typed outline preserves a negative offset in React and Remotion and rejects raw values', () => {
  const box = new Box(undefined, {
    paint: {
      outline: { width: 4, style: 'solid', color: '#112233', offset: -8 },
    },
  });
  for (const driver of [
    createReactDriver(React),
    createRemotionDriver(React, Remotion),
  ]) {
    const style = driver.render(box, { frame: 0 }).props.style;
    assert.equal(style.outline, '4px solid #112233');
    assert.equal(style.outlineOffset, '-8px');
  }
  assert.throws(
    () => new Box(undefined, { paint: { outline: { width: -1 } } }),
    /non-negative/u,
  );
  assert.throws(
    () => new Box(undefined, { paint: { outline: { style: 'raw-style' } } }),
    /paint\.outline\.style/u,
  );
  assert.throws(
    () => new Box(undefined, { paint: { outline: { css: '4px solid red' } } }),
    /unsupported field css/u,
  );
});

test('gradients preserve normalized legacy stops and map pixel repeating/tiled layers', () => {
  const legacy = new Box(undefined, {
    paint: { backgrounds: [{
      angle: 180,
      kind: 'linear-gradient',
      stops: [
        { offset: 0, color: '#000000' },
        { offset: 1, color: '#ffffff' },
      ],
    }] },
  });
  const scanlines = new Box(undefined, {
    paint: { backgrounds: [{
      angle: 0,
      kind: 'linear-gradient',
      repeating: true,
      stops: [
        { offset: 0, unit: 'px', color: 'transparent' },
        { offset: 3, unit: 'px', color: 'transparent' },
        { offset: 3, unit: 'px', color: 'rgba(0,0,0,0.18)' },
        { offset: 4, unit: 'px', color: 'rgba(0,0,0,0.18)' },
      ],
    }] },
  });
  const dots = new Box(undefined, {
    paint: { backgrounds: [{
      kind: 'radial-gradient',
      position: { x: '50%', y: '50%' },
      shape: 'circle',
      stops: [
        { offset: 1, unit: 'px', color: '#2244aa' },
        { offset: 1, unit: 'px', color: 'transparent' },
      ],
      tile: {
        position: { x: 2, y: 3 },
        repeat: 'repeat',
        size: { width: 10, height: 12 },
      },
    }] },
  });

  for (const driver of [
    createReactDriver(React),
    createRemotionDriver(React, Remotion),
  ]) {
    assert.equal(
      driver.render(legacy, { frame: 0 }).props.style.background,
      'linear-gradient(180deg, #000000 0%, #ffffff 100%)',
    );
    assert.equal(
      driver.render(scanlines, { frame: 0 }).props.style.background,
      'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(0,0,0,0.18) 3px, rgba(0,0,0,0.18) 4px)',
    );
    const dotStyle = driver.render(dots, { frame: 0 }).props.style;
    assert.equal(
      dotStyle.background,
      'radial-gradient(circle at 50% 50%, #2244aa 1px, transparent 1px)',
    );
    assert.equal(dotStyle.backgroundPosition, '2px 3px');
    assert.equal(dotStyle.backgroundRepeat, 'repeat');
    assert.equal(dotStyle.backgroundSize, '10px 12px');
  }
});

test('pixel gradient domains, repeating flags and tile schema fail closed', () => {
  const gradient = (overrides = {}) => ({
    angle: 0,
    kind: 'linear-gradient',
    stops: [
      { offset: 0, unit: 'px', color: '#000000' },
      { offset: 4, unit: 'px', color: '#ffffff' },
    ],
    ...overrides,
  });
  assert.throws(
    () => new Box(undefined, { paint: { backgrounds: [gradient({
      stops: [
        { offset: 0, color: '#000000' },
        { offset: 4, unit: 'px', color: '#ffffff' },
      ],
    })] } }),
    /one offset unit/u,
  );
  assert.throws(
    () => new Box(undefined, { paint: { backgrounds: [gradient({
      stops: [
        { offset: 4, unit: 'px', color: '#000000' },
        { offset: 3, unit: 'px', color: '#ffffff' },
      ],
    })] } }),
    /pixel offsets/u,
  );
  assert.throws(
    () => new Box(undefined, { paint: { backgrounds: [gradient({ repeating: 'yes' })] } }),
    /repeating must be a boolean/u,
  );
  assert.throws(
    () => new Box(undefined, { paint: { backgrounds: [gradient({
      tile: { repeat: 'space', size: { width: 4, height: 4 } },
    })] } }),
    /tile\.repeat/u,
  );
  assert.throws(
    () => new Box(undefined, { paint: { backgrounds: [gradient({
      tile: { repeat: 'repeat', size: { width: 4, height: 4 }, css: 'raw' },
    })] } }),
    /unsupported field css/u,
  );
});
