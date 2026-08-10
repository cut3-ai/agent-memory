import assert from 'node:assert/strict';
import test from 'node:test';

import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { createRemotionDriver } from '@cut3/agent-memory/drivers/remotion';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layout } from '@cut3/agent-memory/units/base/Layout';
import { Text } from '@cut3/agent-memory/units/base/Text';

const React = {
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
};

test('typed Layout maps anchors, constraints, flex flow and child layout data in both drivers', () => {
  const first = new Box(undefined, {
    frame: { position: 'relative', width: 180, height: 120 },
    layoutItem: { grow: 2, shrink: 0, basis: 160, align: 'end', order: 3 },
  });
  const second = new Box(undefined, {
    frame: { position: 'relative', width: 120, height: 120 },
  });
  const layout = new Layout(first, {
    frame: {
      left: 20,
      right: 30,
      top: 40,
      bottom: 50,
      minWidth: 320,
      maxWidth: 980,
      minHeight: 240,
      maxHeight: 1400,
      aspectRatio: 9 / 16,
    },
    layout: {
      mode: 'flex',
      direction: 'row-reverse',
      wrap: 'wrap',
      align: 'center',
      justify: 'space-between',
      gap: { row: 8, column: 12 },
      padding: { top: 4, right: 6, bottom: 8, left: 10 },
    },
  });
  layout.add(second);
  const composition = new Composition(layout);

  const reactTree = createReactDriver(React).render(composition, { frame: 0 });
  const reactLayout = find(reactTree, (node) => node.props?.style?.display === 'flex')[0];
  const firstChild = reactLayout.children[0];
  assert.deepEqual(pick(reactLayout.props.style, [
    'left', 'right', 'top', 'bottom', 'width', 'height',
    'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'aspectRatio',
    'display', 'flexDirection', 'flexWrap', 'alignItems', 'justifyContent',
    'rowGap', 'columnGap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  ]), {
    left: '20px',
    right: '30px',
    top: '40px',
    bottom: '50px',
    width: undefined,
    height: undefined,
    minWidth: '320px',
    maxWidth: '980px',
    minHeight: '240px',
    maxHeight: '1400px',
    aspectRatio: 9 / 16,
    display: 'flex',
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    rowGap: '8px',
    columnGap: '12px',
    paddingTop: '4px',
    paddingRight: '6px',
    paddingBottom: '8px',
    paddingLeft: '10px',
  });
  assert.deepEqual(pick(firstChild.props.style, [
    'position', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'order',
  ]), {
    position: 'relative',
    flexGrow: 2,
    flexShrink: 0,
    flexBasis: '160px',
    alignSelf: 'flex-end',
    order: 3,
  });

  const remotionTree = createRemotionDriver(React, {
    Sequence: 'remotion-sequence',
  }).render(composition, { frame: 0 });
  const remotionLayout = find(remotionTree, (node) => node.props?.style?.display === 'flex')[0];
  assert.equal(remotionLayout.props.style.right, '30px');
  assert.equal(remotionLayout.props.style.columnGap, '12px');
});

test('typed grid tracks and child placement remain structured until driver mapping', () => {
  const child = new Box(undefined, {
    frame: { position: 'relative' },
    layoutItem: {
      column: { start: 2, span: 2 },
      row: { start: 1, span: 1 },
    },
  });
  const grid = new Layout(child, {
    layout: {
      mode: 'grid',
      align: 'center',
      justify: 'space-evenly',
      columns: [
        { kind: 'fixed', value: 120 },
        { kind: 'fraction', value: 2 },
        {
          kind: 'minmax',
          min: { kind: 'content', size: 'min' },
          max: { kind: 'fraction', value: 3 },
        },
      ],
      rows: [{ kind: 'auto' }, { kind: 'fixed', value: '20%' }],
    },
  });

  const node = createReactDriver(React).render(grid, { frame: 0 });
  assert.equal(node.props.style.display, 'grid');
  assert.equal(node.props.style.gridTemplateColumns, '120px 2fr minmax(min-content, 3fr)');
  assert.equal(node.props.style.gridTemplateRows, 'auto 20%');
  assert.equal(node.props.style.alignItems, 'center');
  assert.equal(node.props.style.justifyContent, 'space-evenly');
  assert.equal(node.children[0].props.style.gridColumn, '2 / span 2');
  assert.equal(node.children[0].props.style.gridRow, '1 / span 1');
});

test('structured paint, borders, ordered CSS3D transforms and typed effects map without a CSS bag', () => {
  const box = new Box(undefined, {
    paint: {
      backgrounds: [
        {
          kind: 'linear-gradient',
          angle: 35,
          stops: [
            { offset: 0, color: '#112233' },
            { offset: 1, color: '#445566' },
          ],
        },
        {
          kind: 'radial-gradient',
          blendMode: 'multiply',
          shape: 'circle',
          position: { x: '25%', y: '75%' },
          stops: [
            { offset: 0, color: 'rgba(255,255,255,.8)' },
            { offset: 1, color: 'rgba(255,255,255,0)' },
          ],
        },
        {
          kind: 'image',
          source: '/synthetic-texture.png',
          fit: 'contain',
          position: { x: '50%', y: '50%' },
          repeat: 'no-repeat',
        },
      ],
      border: {
        all: { width: 3, style: 'solid', color: '#ffffff' },
        bottom: { width: 7, style: 'dashed', color: '#ffee00' },
        radii: { topLeft: 4, topRight: 8, bottomRight: 12, bottomLeft: 16 },
      },
    },
    pose: {
      origin: { x: '25%', y: '75%', z: 4 },
      perspective: 900,
      perspectiveOrigin: { x: '40%', y: '60%' },
      transformStyle: 'preserve-3d',
      backfaceVisibility: 'hidden',
      operations: [
        { kind: 'perspective', depth: 700 },
        { kind: 'translate', x: 12, y: -8, z: 40 },
        { kind: 'rotate-y', degrees: 24 },
        { kind: 'scale', x: 1.1, y: 0.9, z: 1 },
      ],
    },
    effects: {
      filters: [
        { kind: 'hue-rotate', degrees: 18 },
        { kind: 'opacity', amount: 0.82 },
      ],
      backdropFilters: [{ kind: 'blur', amount: 6 }],
      boxShadows: [
        { x: 8, y: 10, blur: 18, spread: 2, color: 'rgba(0,0,0,.45)' },
        { x: 0, y: 0, blur: 4, spread: 1, color: '#ffffff', inset: true },
      ],
      blendMode: 'screen',
      isolation: 'isolate',
    },
  });

  const style = createReactDriver(React).render(box, { frame: 0 }).props.style;
  assert.match(style.background, /linear-gradient\(35deg/u);
  assert.match(style.background, /radial-gradient\(circle at 25% 75%/u);
  assert.match(style.background, /synthetic-texture\.png/u);
  assert.equal(style.backgroundBlendMode, 'normal, multiply, normal');
  assert.equal(style.borderTop, '3px solid #ffffff');
  assert.equal(style.borderBottom, '7px dashed #ffee00');
  assert.equal(style.borderRadius, '4px 8px 12px 16px');
  assert.equal(style.perspective, '900px');
  assert.equal(style.perspectiveOrigin, '40% 60%');
  assert.equal(style.transformStyle, 'preserve-3d');
  assert.equal(style.backfaceVisibility, 'hidden');
  assert.equal(style.transformOrigin, '25% 75% 4px');
  assert.ok(style.transform.indexOf('perspective(700px)') < style.transform.indexOf('translate3d(12px, -8px, 40px)'));
  assert.ok(style.transform.indexOf('translate3d(12px, -8px, 40px)') < style.transform.indexOf('rotateY(24deg)'));
  assert.ok(style.transform.indexOf('rotateY(24deg)') < style.transform.indexOf('scale3d(1.1, 0.9, 1)'));
  assert.match(style.filter, /hue-rotate\(18deg\).*opacity\(0\.82\)/u);
  assert.equal(style.backdropFilter, 'blur(6px)');
  assert.match(style.boxShadow, /8px 10px 18px 2px rgba/u);
  assert.match(style.boxShadow, /inset 0px 0px 4px 1px #ffffff/u);
  assert.equal(style.mixBlendMode, 'screen');
  assert.equal(style.isolation, 'isolate');
});

test('advanced typography maps stroke, multiple shadows and deterministic wrapping', () => {
  const text = new Text('SYNTHETIC WRAPPED COPY', {
    typography: {
      stroke: { width: 2, color: '#101010' },
      shadows: [
        { x: 2, y: 3, blur: 0, color: '#ff00aa' },
        { x: -1, y: 0, blur: 4, color: 'rgba(0,220,255,.7)' },
      ],
      wrap: {
        whiteSpace: 'normal',
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
        textOverflow: 'ellipsis',
        maxLines: 3,
      },
    },
  });

  const style = createReactDriver(React).render(text, { frame: 0 }).props.style;
  assert.equal(style.WebkitTextStroke, '2px #101010');
  assert.equal(style.textShadow, '2px 3px 0px #ff00aa, -1px 0px 4px rgba(0,220,255,.7)');
  assert.equal(style.whiteSpace, 'normal');
  assert.equal(style.wordBreak, 'break-word');
  assert.equal(style.overflowWrap, 'anywhere');
  assert.equal(style.textOverflow, 'ellipsis');
  assert.equal(style.WebkitLineClamp, 3);
  assert.equal(style.display, '-webkit-box');
  assert.equal(style.overflow, 'hidden');
});

test('closed SVG filter references preserve authored order in React and Remotion', () => {
  const text = new Text('FILTERED', {
    effects: {
      filters: [
        { kind: 'grayscale', amount: 0.8 },
        { kind: 'svg-filter-ref', id: 'grain-pass' },
        { kind: 'contrast', amount: 1.4 },
        { kind: 'svg-filter-ref', id: 'ink-pass' },
      ],
    },
  });
  assert.deepEqual(text.effects.filters, [
    { kind: 'grayscale', amount: 0.8 },
    { kind: 'svg-filter-ref', id: 'grain-pass' },
    { kind: 'contrast', amount: 1.4 },
    { kind: 'svg-filter-ref', id: 'ink-pass' },
  ]);
  const expected = 'grayscale(0.8) url(#grain-pass) contrast(1.4) url(#ink-pass)';
  assert.equal(createReactDriver(React).render(text, { frame: 0 }).props.style.filter, expected);
  assert.equal(
    createRemotionDriver(React, { Sequence: 'remotion-sequence' })
      .render(text, { frame: 0 }).props.style.filter,
    expected,
  );

  for (const id of ['', '#grain', 'url(#grain)', 'https://invalid.example/filter', 'grain pass']) {
    assert.throws(
      () => new Text('INVALID', {
        effects: { filters: [{ kind: 'svg-filter-ref', id }] },
      }),
      /safe local identifier/iu,
    );
  }
  assert.throws(
    () => new Text('INVALID', {
      effects: { filters: [{ kind: 'svg-filter-ref', id: 'grain', href: '#grain' }] },
    }),
    /unsupported field href/iu,
  );
});

test('typed DOM state rejects unknown operations and raw style bags, and pivots reject 3D ancestors', () => {
  assert.throws(
    () => new Box(undefined, { style: { display: 'flex' } }),
    /raw style/iu,
  );
  assert.throws(
    () => new Box(undefined, { paint: { backgrounds: [{ kind: 'custom-css', value: 'none' }] } }),
    /paint\.backgrounds\[0\]\.kind/iu,
  );
  assert.throws(
    () => new Box(undefined, { pose: { operations: [{ kind: 'matrix', values: [] }] } }),
    /pose\.operations\[0\]\.kind/iu,
  );
  assert.throws(
    () => new Box(undefined, { effects: { filters: [{ kind: 'url', amount: 1 }] } }),
    /effects\.filters\[0\]\.kind/iu,
  );
  assert.throws(
    () => new Layout(undefined, { layout: { mode: 'block' } }),
    /layout\.mode/iu,
  );

  const pivot = new CompositionPivot(new Box(undefined), { x: 540, y: 960 });
  const transformed = new Layout(pivot, {
    frame: { x: 0, y: 0, width: 1080, height: 1920 },
    pose: { operations: [{ kind: 'rotate-y', degrees: 20 }] },
  });
  assert.throws(
    () => createReactDriver(React).render(new Composition(transformed), { frame: 0 }),
    /unshifted, untransformed, borderless, full-composition/iu,
  );

  const borderedPivot = new CompositionPivot(new Box(undefined), { x: 540, y: 960 });
  const bordered = new Layout(borderedPivot, {
    frame: { x: 0, y: 0, width: 1080, height: 1920 },
    paint: { border: { all: { width: 2, style: 'solid', color: '#ffffff' } } },
  });
  assert.throws(
    () => createReactDriver(React).render(new Composition(bordered), { frame: 0 }),
    /unshifted, untransformed, borderless, full-composition/iu,
  );

  const paddedPivot = new CompositionPivot(new Box(undefined), { x: 540, y: 960 });
  const padded = new Layout(paddedPivot, {
    frame: { x: 0, y: 0, width: 1080, height: 1920 },
    layout: { padding: 12 },
  });
  assert.throws(
    () => createReactDriver(React).render(new Composition(padded), { frame: 0 }),
    /unshifted, untransformed, borderless, full-composition/iu,
  );

  const constrainedPivot = new CompositionPivot(new Box(undefined), { x: 540, y: 960 });
  const constrained = new Box(constrainedPivot, {
    frame: { x: 0, y: 0, right: 0, height: 1920 },
  });
  assert.throws(
    () => createReactDriver(React).render(new Composition(constrained), { frame: 0 }),
    /unshifted, untransformed, borderless, full-composition/iu,
  );
});

function find(node, predicate, results = []) {
  if (!node || typeof node !== 'object') return results;
  if (predicate(node)) results.push(node);
  for (const child of node.children ?? []) find(child, predicate, results);
  return results;
}

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
