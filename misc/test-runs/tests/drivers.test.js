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
import { Image } from '@cut3/agent-memory/units/base/Image';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { VectorPath, vectorPathData } from '@cut3/agent-memory/units/base/VectorPath';
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

test('Remotion driver maps Composition to AbsoluteFill and omits browser-default image CSS', () => {
  const Remotion = {
    AbsoluteFill: 'remotion-absolute-fill',
    Img: 'remotion-img',
    OffthreadVideo: 'remotion-video',
    Sequence: 'remotion-sequence',
  };
  const image = new Image('asset://runtime-image', {
    frame: { position: 'static' },
  });
  const tree = createRemotionDriver(React, Remotion).render(new Composition(image, {
    background: '#123456',
  }), { frame: 0 });
  const renderedImage = find(tree, (node) => node.type === 'remotion-img')[0];

  assert.equal(tree.type, 'remotion-absolute-fill');
  assert.deepEqual(tree.props.style, { backgroundColor: '#123456' });
  assert.equal(renderedImage.props.decoding, undefined);
  assert.equal(renderedImage.props.style.objectPosition, undefined);
  assert.equal(renderedImage.props.style.position, undefined);
  assert.equal(renderedImage.props.style.zIndex, undefined);
  assert.equal(renderedImage.props.style.opacity, undefined);
  assert.equal(renderedImage.props.style.overflow, undefined);
  assert.equal(renderedImage.props.style.backfaceVisibility, undefined);
  assert.equal(renderedImage.props.style.isolation, undefined);
  assert.equal(renderedImage.props.style.mixBlendMode, undefined);
  assert.equal(renderedImage.props.style.transformStyle, undefined);
});

test('Remotion driver leaves image loading and decode policy to the host', () => {
  const events = [];
  const Remotion = {
    AbsoluteFill: 'remotion-absolute-fill',
    Img: 'remotion-img',
    OffthreadVideo: 'remotion-video',
    Sequence: 'remotion-sequence',
    cancelRender(error) { events.push(['cancel', error.message]); },
    continueRender(handle) { events.push(['continue', handle]); },
    delayRender(label) {
      events.push(['delay', label]);
      return 42;
    },
  };
  const tree = createRemotionDriver(React, Remotion)
    .render(new Image('asset://runtime-image'), { frame: 0 });

  assert.equal(tree.props.src, 'asset://runtime-image');
  assert.equal(tree.props.onImageFrame, undefined);
  assert.deepEqual(events, []);
  assert.equal('onImageFrame' in tree.props, false);
});

test('React and Remotion drivers delegate semantic Unit kinds to native renderers', () => {
  class NativeProbe extends Unit {
    static kind = 'unit.test.native-probe';

    constructor(resource) {
      super();
      this.resource = resource;
    }
  }

  const unitRenderers = {
    [NativeProbe.kind]: ({ React: RuntimeReact, children, context, state, unit }) => (
      RuntimeReact.createElement('native-probe', {
        childCount: children.length,
        frame: context.frame,
        resource: state.resource,
        unitKind: unit.constructor.kind,
      })
    ),
  };
  const reactTree = createReactDriver(React, { unitRenderers })
    .render(new NativeProbe('resource://opaque-runtime-input'), { frame: 19 });
  assert.equal(reactTree.type, 'native-probe');
  assert.equal(reactTree.props.childCount, 0);
  assert.equal(reactTree.props.frame, 19);
  assert.equal(reactTree.props.resource, 'resource://opaque-runtime-input');

  const remotionTree = createRemotionDriver(React, {
    Img: 'remotion-img',
    Sequence: 'remotion-sequence',
  }, { unitRenderers }).render(
    new NativeProbe('resource://opaque-runtime-input'),
    { frame: 23 },
  );
  assert.equal(remotionTree.type, 'native-probe');
  assert.equal(remotionTree.props.childCount, 0);
  assert.equal(remotionTree.props.frame, 23);
  assert.equal(remotionTree.props.resource, 'resource://opaque-runtime-input');
  assert.throws(
    () => createReactDriver(React, { unitRenderers: { [NativeProbe.kind]: 'component' } }),
    /must be a function/u,
  );
});

test('Remotion receives source offset while generic React stays a thin media mapping', () => {
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
  assert.equal(reactVideo.props.src, 'clip.mp4');
  assert.equal(Object.hasOwn(reactVideo.props, 'preload'), false);
  assert.equal(Object.hasOwn(reactVideo.props, 'ref'), false);
  assert.equal(Object.hasOwn(reactVideo.props, 'data-frame'), false);
  assert.equal(Object.hasOwn(reactVideo.props, 'data-start-frame'), false);

  const path = createReactDriver(React).render(new VectorPath([
    { command: 'move', x: 0, y: 0 },
    { command: 'line', x: 100, y: 0 },
  ], { draw: { start: 0.2, end: 0.65 } }), { frame: 0 });
  assert.equal(path.children[0].props.strokeDasharray, '0.45 0.55');
  assert.equal(path.children[0].props.strokeDashoffset, -0.2);
});

test('standalone VectorPath keeps the ordinary M/L/C/Q/Z SVG contract', () => {
  const segments = [
    { command: 'move', x: 0, y: 0 },
    { command: 'line', x: 10, y: 5 },
    { command: 'cubic', x1: 12, y1: 7, x2: 16, y2: 9, x: 20, y: 10 },
    { command: 'quadratic', x1: 25, y1: 15, x: 30, y: 0 },
    { command: 'close' },
  ];
  const unit = new VectorPath(segments, {
    paint: { fill: '#112233', stroke: '#abcdef', strokeWidth: 4 },
    viewBox: [0, 0, 30, 15],
  });
  const tree = createReactDriver(React).render(unit, { frame: 0 });

  assert.equal(tree.type, 'svg');
  assert.equal(tree.props.viewBox, '0 0 30 15');
  assert.equal(tree.children[0].type, 'path');
  assert.equal(tree.children[0].props.d, 'M 0 0 L 10 5 C 12 7 16 9 20 10 Q 25 15 30 0 Z');
  assert.equal(tree.children[0].props.fill, '#112233');
  assert.equal(tree.children[0].props.stroke, '#abcdef');
  assert.equal(tree.children[0].props.strokeWidth, 4);
  assert.equal(vectorPathData(unit.segments), tree.children[0].props.d);
  assert.throws(
    () => new VectorPath([{ command: 'arc', rx: 1, ry: 1, x: 2, y: 2 }]),
    /Unsupported vector command/u,
  );
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
