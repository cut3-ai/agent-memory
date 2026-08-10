import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { EmulsionDrift } from '@cut3/agent-memory/behaviours/turbulent-emulsion/EmulsionDrift';
import { EmulsionFlicker } from '@cut3/agent-memory/behaviours/turbulent-emulsion/EmulsionFlicker';
import {
  denseGrainEmulsion,
  drivenGrainEmulsion,
  handwrittenEmulsionTitle,
  neonEmulsionTrace,
  softGrainEmulsion,
  stockVideoEmulsion,
} from '@cut3/agent-memory/compositions/TurbulentEmulsion';
import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { publicSnapshot } from '@cut3/agent-memory/core/state';
import { cubicBezier, progress } from '@cut3/agent-memory/core/timeline';
import { Unit } from '@cut3/agent-memory/core/Unit';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Shot } from '@cut3/agent-memory/units/base/Shot';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { Video } from '@cut3/agent-memory/units/base/Video';
import {
  EmulsionOverlay,
  EmulsionSurface,
  renderEmulsionSvg,
} from '@cut3/agent-memory/units/turbulent-emulsion/EmulsionOverlay';
import {
  HandwrittenEmulsionTitle,
} from '@cut3/agent-memory/units/turbulent-emulsion/HandwrittenEmulsionTitle';

const CUE_FRAMES = Object.freeze([4, 20, 34, 98, 113, 130, 142]);
const CUE_LAYOUT = Object.freeze([
  Object.freeze({ x: '45%', y: '35%', size: 165 }),
  Object.freeze({ x: '55%', y: '40%', size: 165 }),
  Object.freeze({ x: '50%', y: '46%', size: 158 }),
  Object.freeze({ x: '42%', y: '53%', size: 165 }),
  Object.freeze({ x: '58%', y: '58%', size: 165 }),
  Object.freeze({ x: '47%', y: '63%', size: 165 }),
  Object.freeze({ x: '50%', y: '70%', size: 330 }),
]);
const REVEAL = cubicBezier(0.45, 0, 0.25, 1);
const TRACE_DATA = 'M 50 90 C 12 62 2 40 2 25 C 2 9 16 1 28 1 C 40 1 47 9 50 17 C 53 9 60 1 72 1 C 84 1 98 9 98 25 C 98 40 88 62 50 90 Z';
const STOCK_VIDEO_FILTERS = Object.freeze([
  Object.freeze({ kind: 'grayscale', amount: 0.85 }),
  Object.freeze({ kind: 'saturate', amount: 0.7 }),
  Object.freeze({ kind: 'contrast', amount: 1.55 }),
  Object.freeze({ kind: 'brightness', amount: 1.05 }),
  Object.freeze({ kind: 'svg-filter-ref', id: 'emulsion-fine' }),
  Object.freeze({ kind: 'svg-filter-ref', id: 'emulsion-dust' }),
]);
const RECIPES = Object.freeze([
  Object.freeze({ duration: 210, make: () => neonEmulsionTrace(), variant: 'neon-trace' }),
  Object.freeze({
    duration: 186,
    make: () => handwrittenEmulsionTitle(['alpha', 'to', 'signal', 'at', 'night', 'in', 'ink']),
    variant: 'handwritten-cues',
  }),
  Object.freeze({ duration: 426, make: () => softGrainEmulsion(), variant: 'soft-grain' }),
  Object.freeze({
    duration: 67,
    make: () => stockVideoEmulsion('synthetic-stock-media'),
    variant: 'stock-video',
  }),
  Object.freeze({ duration: 240, make: () => denseGrainEmulsion(), variant: 'dense-grain' }),
  Object.freeze({ duration: 790, make: () => drivenGrainEmulsion(), variant: 'driven-grain' }),
]);

test('six application functions preserve runtime slots and attach laws owner-first', async () => {
  const builders = [
    handwrittenEmulsionTitle,
    softGrainEmulsion,
    stockVideoEmulsion,
    denseGrainEmulsion,
    drivenGrainEmulsion,
    neonEmulsionTrace,
  ];
  builders.forEach(assertGuardFree);

  for (const words of [
    ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff', 'ggggggg'],
    ['north', 'by', 'signal', 'at', 'dawn', 'in', 'type'],
  ]) {
    const unit = handwrittenEmulsionTitle(words);
    assert.ok(unit instanceof HandwrittenEmulsionTitle);
    assert.deepEqual(unit.runtimeTexts().map((text) => text.text), words);
  }
  for (const source of ['opaque-resource-a', 'opaque-resource-b']) {
    const unit = stockVideoEmulsion(source);
    assert.ok(unit instanceof EmulsionOverlay);
    assert.equal(unit.runtimeVideo().source, source);
  }
  assert.deepEqual(neonEmulsionTrace().runtimeTexts(), []);

  assertAttached(handwrittenEmulsionTitle(['a', 'b', 'c', 'd', 'e', 'f', 'g']), {
    drift: [['surface', ['behaviour.turbulent-emulsion.drift']]],
    flicker: Array.from({ length: 7 }, () => ['cue', ['behaviour.turbulent-emulsion.flicker']]),
  });
  for (const unit of [softGrainEmulsion(), denseGrainEmulsion(), drivenGrainEmulsion()]) {
    const expected = [
      'behaviour.turbulent-emulsion.drift',
      'behaviour.turbulent-emulsion.flicker',
    ];
    assertAttached(unit, {
      drift: [['surface', expected]],
      flicker: [['surface', expected]],
    });
  }
  assertAttached(stockVideoEmulsion('opaque-resource'), { drift: [], flicker: [] });
  assertAttached(neonEmulsionTrace(), {
    drift: [['neon', ['behaviour.turbulent-emulsion.drift']]],
    flicker: [],
  });

  const applicationSource = await readFile(
    new URL('../../../src/compositions/TurbulentEmulsion.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    applicationSource,
    /\b(?:appearance|definitions|effects|frame|opacity|paint|pose|typography|viewBox)\s*:/u,
  );
  assert.doesNotMatch(applicationSource, /\.(?:units|children)\s*\[|\.at\s*\(/u);
  assert.doesNotMatch(applicationSource, /https?:\/\/|workspace|sourceHash|prompt/iu);
});

test('semantic roots are compact Units and retain authored text/media topology', () => {
  for (const { make, variant } of RECIPES) {
    const unit = make();
    const surface = unit.nativeSurface();
    assert.ok(unit instanceof Layer);
    assert.ok(surface instanceof Unit);
    assert.ok(surface instanceof EmulsionSurface);
    assert.equal(surface.variant, variant);
    assert.equal(surface.capability.contract, 'turbulent-emulsion-svg/v1');
    assert.equal(surface.capability.kind, 'native-svg');
    assert.equal(surface.units.length, 0);
    for (const key of ['definitions', 'primitives', 'commands', 'segments', 'draw', 'effects', 'pose']) {
      assert.equal(Object.hasOwn(surface, key), false, `${variant} leaked ${key}`);
    }
    assert.deepEqual(Object.keys(surface.motion).sort(), motionKeys(variant));
  }

  const title = handwrittenEmulsionTitle(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  title.runtimeTexts().forEach((text, index) => {
    assert.deepEqual(text.frame, {
      x: CUE_LAYOUT[index].x,
      y: CUE_LAYOUT[index].y,
      width: 'auto',
      height: 'auto',
    });
    assert.equal(text.paint.color, '#0a0a0a');
    assert.deepEqual(text.pose.operations, [{ kind: 'translate-2d', x: '-50%', y: '-50%' }]);
    assert.equal(text.typography.family, 'Estonia, cursive');
    assert.equal(text.typography.weight, 600);
    assert.equal(text.typography.size, CUE_LAYOUT[index].size);
    assert.equal(text.typography.letterSpacing, 2);
    assert.equal(text.typography.lineHeight, 1);
    assert.equal(text.typography.wrap.whiteSpace, 'nowrap');
    assert.deepEqual(text.effects.filters, [{ kind: 'svg-filter-ref', id: 'emulsion-main' }]);
    assert.equal(text.present, false);
  });

  const stock = stockVideoEmulsion('opaque-stock-resource');
  const video = stock.runtimeVideo();
  const shot = findUnits(stock, Shot)[0];
  assert.equal(video.backend, 'offthread-video');
  assert.equal(video.source, 'opaque-stock-resource');
  assert.equal(video.fit, 'cover');
  assert.equal(video.muted, true);
  assert.equal(video.transparent, true);
  assert.deepEqual(video.effects.filters, STOCK_VIDEO_FILTERS);
  assert.deepEqual(
    { duration: shot.duration, from: shot.from, premountFor: shot.premountFor },
    { duration: 67, from: 0, premountFor: 60 },
  );

  for (const make of [denseGrainEmulsion, drivenGrainEmulsion]) {
    const dark = findUnits(make(), Box).find((unit) => unit.paint.fill === 'rgba(0,0,0,0.28)');
    assert.ok(dark);
  }
});

test('bare roots contain no hidden Behaviours and closed roles reject arbitrary owners', () => {
  const roots = [
    new HandwrittenEmulsionTitle(syntheticTexts(7), 'handwritten-cues'),
    new EmulsionOverlay(undefined, 'soft-grain'),
    new EmulsionOverlay(new Video('opaque-bare-media'), 'stock-video'),
    new EmulsionOverlay(undefined, 'dense-grain'),
    new EmulsionOverlay(undefined, 'driven-grain'),
    new HandwrittenEmulsionTitle([], 'neon-trace'),
  ];
  roots.forEach((root) => visitUnits(root, (unit) => assert.deepEqual(unit.behaviours, [])));

  assert.throws(() => new EmulsionDrift(new EmulsionSurface('soft-grain')), TypeError);
  assert.throws(() => new EmulsionFlicker(new Text('generic')), TypeError);
  const stock = new EmulsionOverlay(new Video('opaque-stock'), 'stock-video');
  assert.throws(() => new EmulsionDrift(stock.nativeSurface()), TypeError);
  const neon = neonEmulsionTrace();
  assert.throws(() => new EmulsionFlicker(neon.nativeSurface()), TypeError);
});

test('family-native helper directly authors exact SVG elements without a definition AST', () => {
  const cases = [
    ['handwritten-cues', handwrittenEmulsionTitle(['a', 'b', 'c', 'd', 'e', 'f', 'g']), 186, 34],
    ['soft-grain', softGrainEmulsion(), 426, 71],
    ['stock-video', stockVideoEmulsion('opaque-stock-resource'), 67, 0],
    ['dense-grain', denseGrainEmulsion(), 240, 42],
    ['driven-grain', drivenGrainEmulsion(), 790, 93],
    ['neon-trace', neonEmulsionTrace(), 210, 91],
  ];

  for (const [variant, unit, duration, frame] of cases) {
    const projection = projectFrame(unit, context(frame, duration));
    const state = projection.stateOf(unit.nativeSurface());
    const { React, calls } = tracingReact();
    const tree = renderEmulsionSvg(React, state);
    assert.equal(tree.type, 'svg');
    assert.equal(tree.props['data-emulsion-variant'], variant);
    assert.equal(calls[0].type.startsWith('fe') || calls[0].type === 'path', true);
    assert.equal(calls.at(-1).type, 'svg');
    assert.equal(find(tree, (node) => node.type === 'svg').length, 1);
    assert.equal(Object.hasOwn(state, 'definitions'), false);
  }

  const handwritten = nativeTree(
    handwrittenEmulsionTitle(['a', 'b', 'c', 'd', 'e', 'f', 'g']),
    186,
    34,
  );
  const inkNoise = find(handwritten, (node) => node.props?.result === 'ink-noise')[0];
  const inkBlur = find(handwritten, (node) => node.props?.result === 'ink-softness')[0];
  const inkDisplace = find(handwritten, (node) => node.props?.result === 'ink-displaced')[0];
  assert.equal(inkNoise.type, 'feTurbulence');
  assert.equal(inkNoise.props.baseFrequency, `${round4(0.9 + (Math.sin(34 * 0.06) * 0.09))} ${round4(0.9 + (Math.cos(34 * 0.05) * 0.09))}`);
  assert.equal(inkNoise.props.seed, Math.floor(34 / 3));
  assert.equal(inkBlur.props.stdDeviation, `${round2(10.6 + (Math.sin(34 * 0.35) * 1.4))} ${round2(10.6 + (Math.sin(34 * 0.35) * 1.4))}`);
  assert.equal(inkDisplace.props.scale, round2(33 + (Math.sin(34 * 0.22) * 9) + (Math.sin(34 * 0.9) * 3)));
  assert.deepEqual(
    find(find(handwritten, (node) => node.type === 'feMerge')[0], (node) => node.type === 'feMergeNode')
      .map((node) => node.props.in),
    ['ink-colored', 'ink-colored', 'SourceGraphic'],
  );

  const stock = nativeTree(stockVideoEmulsion('opaque-stock'), 67, 0);
  assert.deepEqual(
    find(stock, (node) => /^feFunc/u.test(node.type)).map((node) => node.type),
    ['feFuncR', 'feFuncG', 'feFuncB', 'feFuncA'],
  );
  assert.equal(find(stock, (node) => node.type === 'filter').length, 2);

  const dense = nativeTree(denseGrainEmulsion(), 240, 42);
  assert.equal(find(dense, (node) => node.type === 'rect').length, 2);
  assert.deepEqual(
    find(dense, (node) => node.type === 'feTurbulence').map((node) => node.props.seed),
    [42, 143],
  );

  const neon = nativeTree(neonEmulsionTrace(), 210, 91);
  const paths = find(neon, (node) => node.type === 'path');
  assert.equal(paths.length, 3);
  paths.forEach((path) => assert.equal(path.props.d, TRACE_DATA));
  assert.deepEqual(paths.map((path) => path.props.strokeWidth), [undefined, 3.4, 1.4]);
  assert.equal(paths[1].props.strokeDashoffset, paths[2].props.strokeDashoffset);
  assert.match(neon.props.style.filter, /^drop-shadow/u);
  assert.match(neon.props.style.transform, /^scale\(/u);
});

test('all 1919 authored frames are exact, finite, deterministic and rollback-safe', () => {
  assert.equal(RECIPES.reduce((total, recipe) => total + recipe.duration, 0), 1919);
  let projectedFrames = 0;
  for (const { duration, make, variant } of RECIPES) {
    const unit = make();
    const composition = new Composition(unit, {
      background: 'transparent',
      duration,
      fps: 60,
      height: 1920,
      width: 1080,
    });
    const units = [];
    visitUnits(composition, (child) => units.push(child));
    const authored = new Map(units.map((child) => [
      child,
      structuredClone(publicSnapshot(child)),
    ]));

    for (let frame = 0; frame < duration; frame += 1) {
      const input = context(frame, duration);
      const first = projectFrame(composition, input);
      assertExactFrame(unit, variant, first, frame, duration);
      const firstStates = units.map((child) => first.stateOf(child));
      firstStates.forEach(assertFinite);
      units.forEach((child) => assert.deepEqual(
        publicSnapshot(child),
        authored.get(child),
        `${variant} rollback failed at frame ${frame}`,
      ));
      const second = projectFrame(composition, input);
      assert.deepEqual(
        units.map((child) => second.stateOf(child)),
        firstStates,
        `${variant} was not deterministic at frame ${frame}`,
      );
      units.forEach((child) => assert.deepEqual(publicSnapshot(child), authored.get(child)));
      projectedFrames += 1;
    }
  }
  assert.equal(projectedFrames, 1919);
});

test('generic React driver emits no SVG; host unitRenderer mounts the family helper', () => {
  for (const { duration, make } of RECIPES) {
    const frame = Math.floor(duration * 0.41);
    const generic = createReactDriver(React, {
      selectVideoComponent: () => 'OffthreadVideo',
    }).render(make(), context(frame, duration));
    assert.equal(find(generic, (node) => node.type === 'svg').length, 0);
  }

  const captured = [];
  const driver = createReactDriver(React, {
    selectVideoComponent: () => 'OffthreadVideo',
    unitRenderers: {
      [EmulsionSurface.kind]: (input) => {
        captured.push(input);
        return renderEmulsionSvg(input.React, input.state);
      },
    },
  });
  for (const { duration, make, variant } of RECIPES) {
    const frame = Math.floor(duration * 0.41);
    const output = driver.render(make(), context(frame, duration));
    const svg = find(output, (node) => node.type === 'svg')[0];
    assert.ok(svg);
    assert.equal(svg.props['data-emulsion-variant'], variant);
  }
  assert.equal(captured.length, 6);
  captured.forEach((input) => {
    assert.equal(input.unit.constructor.kind, EmulsionSurface.kind);
    assert.equal(input.projectedChildren.length, 0);
    assert.equal(typeof input.renderChildren, 'function');
    assert.equal(Object.hasOwn(input.state, 'definitions'), false);
  });
});

test('family source has no generic vector scene, vector commands or private resources', async () => {
  const paths = [
    '../../../src/units/turbulent-emulsion/EmulsionOverlay.js',
    '../../../src/units/turbulent-emulsion/HandwrittenEmulsionTitle.js',
    '../../../src/units/turbulent-emulsion/emulsionSemantics.js',
    '../../../src/behaviours/turbulent-emulsion/EmulsionFlicker.js',
    '../../../src/behaviours/turbulent-emulsion/EmulsionDrift.js',
    '../../../src/compositions/TurbulentEmulsion.js',
  ];
  const source = (await Promise.all(paths.map((path) => (
    readFile(new URL(path, import.meta.url), 'utf8')
  )))).join('\n');
  assert.doesNotMatch(source, /Vector(?:Scene|Path|Rect|Circle|Line|Polyline|Group)/u);
  assert.doesNotMatch(source, /\.definitions\b|\bprimitives\s*:/u);
  assert.doesNotMatch(source, /https?:\/\/|workspace|sourceHash|prompt|[a-f0-9]{40,}/iu);
});

function assertExactFrame(unit, variant, projection, frame, duration) {
  const surfaceState = projection.stateOf(unit.nativeSurface());
  assert.equal(Object.hasOwn(surfaceState, 'definitions'), false);
  if (variant === 'handwritten-cues') {
    assert.deepEqual(surfaceState.motion, {
      blur: round2(10.6 + (Math.sin(frame * 0.35) * 1.4)),
      displacement: round2(33 + (Math.sin(frame * 0.22) * 9) + (Math.sin(frame * 0.9) * 3)),
      frequencyX: round4(0.9 + (Math.sin(frame * 0.06) * 0.09)),
      frequencyY: round4(0.9 + (Math.cos(frame * 0.05) * 0.09)),
      seed: Math.floor(frame / 3),
    });
    unit.runtimeTexts().forEach((text, index) => {
      assert.equal(projection.stateOf(text).present, frame >= CUE_FRAMES[index]);
    });
    return;
  }
  if (variant === 'soft-grain') {
    assert.deepEqual(surfaceState.motion, {
      frequency: round4(0.95 + (Math.sin(frame * 0.6) * 0.02)),
      seed: (frame % 991) + 1,
    });
    close(surfaceState.opacity, 0.0325 + (Math.sin(frame * 0.2) * 0.0075));
    return;
  }
  if (variant === 'dense-grain' || variant === 'driven-grain') {
    const seed = variant === 'dense-grain' ? frame % 9973 : ((frame * 7) + 3) % 9973;
    assert.deepEqual(surfaceState.motion, {
      dustSeed: ((seed * 3) + 17) % 9973,
      fineSeed: seed,
    });
    close(
      surfaceState.opacity,
      variant === 'dense-grain'
        ? 0.39 + (Math.sin(frame * 0.9) * 0.03)
        : 0.38 + (Math.sin(frame * 0.75) * 0.03),
    );
    return;
  }
  if (variant === 'stock-video') {
    assert.deepEqual(surfaceState.motion, {});
    assert.equal(surfaceState.opacity, 1);
    const videoState = projection.stateOf(unit.runtimeVideo());
    assert.equal(videoState.source, 'synthetic-stock-media');
    assert.deepEqual(videoState.effects.filters, STOCK_VIDEO_FILTERS);
    assert.equal(videoState.transparent, true);
    return;
  }

  const revealEnd = Math.round(duration * 0.78);
  const reveal = REVEAL(progress(frame, 0, revealEnd));
  const afterReveal = Math.max(frame - revealEnd, 0);
  const wobble = reveal >= 1
    ? Math.sin(afterReveal * 0.45) * 0.04 * Math.exp(-afterReveal * 0.03)
    : 0;
  const intro = progress(frame, 0, 6);
  const exitDuration = Math.round(duration * 0.4);
  const exit = progress(frame, duration - exitDuration, exitDuration) ** 3;
  close(surfaceState.opacity, intro * (1 - exit));
  close(surfaceState.motion.scale, (0.92 + (intro * 0.08) + wobble) * (1 + (exit * 0.18)));
  close(surfaceState.motion.glow, 6 + (reveal * 10));
  close(surfaceState.motion.traceProgress, reveal);
  close(surfaceState.motion.fillOpacity, reveal < 0.75
    ? 0
    : ((reveal - 0.75) / 0.25) * 0.16);
}

function assertAttached(unit, expected) {
  const targets = unit.animationTargets();
  for (const law of ['drift', 'flicker']) {
    assert.deepEqual(
      targets[law].map(({ owner, role }) => [
        role,
        owner.behaviours.map((behaviour) => behaviour.constructor.kind),
      ]),
      expected[law],
    );
    targets[law].forEach(({ owner }) => owner.behaviours.forEach((behaviour) => {
      assert.equal(behaviour.unit, owner);
    }));
  }
}

function assertGuardFree(builder) {
  const forbidden = /\b(?:if|else|switch|case|throw|try|catch|finally|typeof|instanceof|for|while|do)\b|\?|&&|\|\||\?\?/u;
  assert.doesNotMatch(Function.prototype.toString.call(builder), forbidden);
}

function motionKeys(variant) {
  if (variant === 'handwritten-cues') {
    return ['blur', 'displacement', 'frequencyX', 'frequencyY', 'seed'];
  }
  if (variant === 'soft-grain') return ['frequency', 'seed'];
  if (variant === 'dense-grain' || variant === 'driven-grain') return ['dustSeed', 'fineSeed'];
  if (variant === 'neon-trace') return ['fillOpacity', 'glow', 'scale', 'traceProgress'];
  return [];
}

function syntheticTexts(count) {
  return Array.from({ length: count }, (_, index) => new Text(`synthetic-${index + 1}`));
}

function findUnits(root, Class) {
  const values = [];
  visitUnits(root, (unit) => {
    if (unit instanceof Class) values.push(unit);
  });
  return values;
}

function nativeTree(unit, duration, frame) {
  const projection = projectFrame(unit, context(frame, duration));
  return renderEmulsionSvg(React, projection.stateOf(unit.nativeSurface()));
}

function tracingReact() {
  const calls = [];
  const ReactRuntime = {
    createElement(type, props, ...children) {
      const element = { props: { ...(props ?? {}), children }, type };
      calls.push(element);
      return element;
    },
  };
  return { calls, React: ReactRuntime };
}

function context(frame, duration) {
  return { duration, fps: 60, frame, height: 1920, width: 1080 };
}

function round2(value) {
  return Number(value.toFixed(2));
}

function round4(value) {
  return Number(value.toFixed(4));
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} !== ${expected}`);
}

function assertFinite(value) {
  if (typeof value === 'number') {
    assert.equal(Number.isFinite(value), true);
    return;
  }
  if (!value || typeof value !== 'object') return;
  Object.values(value).forEach(assertFinite);
}

const React = Object.freeze({
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { props: { ...(props ?? {}), children }, type };
  },
});

function find(tree, predicate, found = []) {
  if (!tree || typeof tree !== 'object') return found;
  if (predicate(tree)) found.push(tree);
  const children = tree.props?.children ?? [];
  for (const child of children.flat(Infinity)) find(child, predicate, found);
  return found;
}
