import assert from 'node:assert/strict';
import test from 'node:test';

import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { SignalEditorialComposition } from '@cut3/agent-memory/compositions/SignalEditorialComposition';
import { Unit } from '@cut3/agent-memory/core/Unit';
import {
  BEGIN_PROJECTION,
  END_PROJECTION,
  RESET_PROJECTION,
} from '@cut3/agent-memory/core/projection';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { createRemotionDriver } from '@cut3/agent-memory/drivers/remotion';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { VectorPath } from '@cut3/agent-memory/units/base/VectorPath';
import { Video } from '@cut3/agent-memory/units/base/Video';

const React = {
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
};

const projectionCounts = new WeakMap();
const childrenReadCounts = new WeakMap();

class ProjectionProbeUnit extends Unit {
  static kind = 'unit.test.driver-projection-probe';

  constructor(unit) {
    super(unit);
    projectionCounts.set(this, { begin: 0, end: 0, reset: 0 });
  }

  [BEGIN_PROJECTION]() {
    projectionCounts.get(this).begin += 1;
    return super[BEGIN_PROJECTION]();
  }

  [RESET_PROJECTION](snapshot) {
    projectionCounts.get(this).reset += 1;
    return super[RESET_PROJECTION](snapshot);
  }

  [END_PROJECTION](snapshot) {
    projectionCounts.get(this).end += 1;
    return super[END_PROJECTION](snapshot);
  }
}

class FirstPassChildrenUnit extends Unit {
  static kind = 'unit.test.driver-first-pass-children';

  constructor(unit) {
    super(unit);
    childrenReadCounts.set(this, 0);
  }

  get children() {
    const count = (childrenReadCounts.get(this) ?? 0) + 1;
    childrenReadCounts.set(this, count);
    return count > 3 ? Object.freeze([]) : super.children;
  }
}

class DynamicContainingBlockShift extends Behaviour {
  static kind = 'behaviour.test.dynamic-containing-block-shift';

  onFrame() {
    this.unit.pose = { ...this.unit.pose, x: 40 };
  }
}

test('React driver renders absolute composition pivots from the same Unit tree', () => {
  const tree = createReactDriver(React).render(new SignalEditorialComposition(), { frame: 12 });
  const pivots = find(tree, (node) => node.props?.style?.transformOrigin);
  assert.ok(pivots.length >= 2);
  assert.ok(pivots.some((node) => node.props.style.transformOrigin === '144px 1390px'));
  assert.ok(pivots.some((node) => /translate3d/u.test(node.props.style.transform)));
  assert.ok(pivots.some((node) => /drop-shadow/u.test(node.props.style.filter)));
  assert.ok(pivots.every((node) => node.props.style.boxShadow === undefined));
});

test('absolute CompositionPivot rejects a shifted containing block', () => {
  const pivot = new CompositionPivot(new Box(undefined), { x: 120, y: 400 });
  const shifted = new Layer(pivot, {
    frame: { x: 40, y: 0, width: 1040, height: 1920 },
  });
  const composition = new Composition(shifted);
  assert.throws(
    () => createReactDriver(React).render(composition, { frame: 0 }),
    /unshifted, untransformed, borderless, full-composition/iu,
  );

  const transformedPivot = new CompositionPivot(new Box(undefined), { x: 120, y: 400 });
  const transformed = new Layer(transformedPivot, {
    frame: { x: 0, y: 0, width: 1080, height: 1920 },
    pose: { x: 100 },
  });
  assert.throws(
    () => createReactDriver(React).render(new Composition(transformed), { frame: 0 }),
    /unshifted, untransformed, borderless, full-composition/iu,
  );

  const dynamicPivot = new CompositionPivot(new Box(undefined), { x: 120, y: 400 });
  const dynamic = new Layer(dynamicPivot, {
    frame: { x: 0, y: 0, width: 1080, height: 1920 },
  });
  dynamic.addBehaviour(new DynamicContainingBlockShift(dynamic));
  assert.throws(
    () => createReactDriver(React).render(new Composition(dynamic), { frame: 0 }),
    /unshifted, untransformed, borderless, full-composition/iu,
  );
});

test('Remotion driver is injection-only and emits static Sequence elements', () => {
  const Remotion = {
    Img: 'remotion-img',
    OffthreadVideo: 'remotion-video',
    Sequence: 'remotion-sequence',
  };
  const tree = createRemotionDriver(React, Remotion)
    .render(new SignalEditorialComposition(), { frame: 60 });
  const sequences = find(tree, (node) => node.type === 'remotion-sequence');
  assert.equal(sequences.length, 2);
  assert.deepEqual(sequences.map((node) => node.props.from), [0, 56]);
});

test('driver preserves video source offset and the full VectorPath draw interval', () => {
  const Remotion = {
    Img: 'remotion-img',
    OffthreadVideo: 'remotion-video',
    Sequence: 'remotion-sequence',
  };
  const video = createRemotionDriver(React, Remotion)
    .render(new Video('clip.mp4', { startFrom: 17 }), { frame: 0 });
  assert.equal(video.type, 'remotion-video');
  assert.equal(video.props.startFrom, 17);
  assert.equal(video.props.frame, undefined);
  assert.equal(video.props.absoluteFrame, undefined);
  assert.equal(video.props.fps, undefined);
  assert.throws(() => new Video('clip.mp4', { startFrom: -1 }), /non-negative/u);

  const reactVideo = createReactDriver(React)
    .render(new Video('clip.mp4', { startFrom: 15 }), { fps: 30, frame: 30 });
  let paused = false;
  const element = {
    currentTime: 0,
    pause() { paused = true; },
  };
  reactVideo.props.ref(element);
  assert.equal(paused, true);
  assert.equal(element.currentTime, 1.5);
  assert.equal(reactVideo.props['data-frame'], 30);

  const path = createReactDriver(React).render(new VectorPath([
    { command: 'move', x: 0, y: 0 },
    { command: 'line', x: 100, y: 0 },
  ], { draw: { start: 0.2, end: 0.65 } }), { frame: 0 });
  assert.equal(path.children[0].props.strokeDasharray, '0.45 0.55');
  assert.equal(path.children[0].props.strokeDashoffset, -0.2);
});

test('React driver shares one projection transaction across the rendered frame', () => {
  const units = Array.from({ length: 48 }, () => new ProjectionProbeUnit());
  const root = new ProjectionProbeUnit();
  root.add(...units);

  const tree = createReactDriver(React).render(root, { frame: 7 });
  assert.equal(tree.children.length, units.length);

  const counts = [root, ...units].reduce((total, unit) => {
    const current = projectionCounts.get(unit);
    total.begin += current.begin;
    total.reset += current.reset;
    total.end += current.end;
    return total;
  }, { begin: 0, end: 0, reset: 0 });
  const treeSize = units.length + 1;
  assert.deepEqual(counts, { begin: treeSize, end: treeSize, reset: treeSize });
});

test('React driver renders the locked first-pass child snapshot after projection', () => {
  const child = new ProjectionProbeUnit();
  const root = new FirstPassChildrenUnit(child);

  const tree = createReactDriver(React).render(root, { frame: 1 });
  assert.equal(tree.children.length, 1);
  assert.equal(childrenReadCounts.get(root), 3);
});

function find(node, predicate, results = []) {
  if (!node || typeof node !== 'object') return results;
  if (predicate(node)) results.push(node);
  for (const child of node.children ?? []) find(child, predicate, results);
  return results;
}
