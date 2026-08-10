import assert from 'node:assert/strict';
import test from 'node:test';

import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { publicSnapshot } from '@cut3/agent-memory/core/state';
import {
  lerp,
  linear,
  progress,
} from '@cut3/agent-memory/core/timeline';
import { microFlashCard } from '@cut3/agent-memory/compositions/MicroFlashCard';
import { rapidPhotoCut } from '@cut3/agent-memory/compositions/RapidPhotoCut';
import { RapidPhotoCut } from '@cut3/agent-memory/behaviours/rapid-photo/RapidPhotoCut';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import {
  MicroFlashCard,
  microFlashUnitRenderers,
  renderMicroFlashCard,
} from '@cut3/agent-memory/units/micro-flash/MicroFlashCard';
import { RapidPhotoPlate } from '@cut3/agent-memory/units/rapid-photo/RapidPhotoPlate';

const cuts = Object.freeze({
  'zoom-out': law(24, 1.3, 1, 0, 0, 0, 0, oracleBezier(0.16, 1, 0.3, 1), [
    filter('contrast', 1.4), filter('brightness', 1.1),
  ]),
  'zoom-in': law(36, 1, 1.12, 0, 0, 0, 0, linear, [
    filter('contrast', 1.35), filter('saturate', 1.3),
  ]),
  'snap-zoom': law(42, 1.25, 1, 0, 0, 0, 0, oracleBezier(0.16, 1, 0.3, 1), [
    filter('contrast', 1.4), filter('brightness', 1.05),
  ]),
  'lateral-pan': law(30, 1.1, 1.1, -20, 20, 0, 0, oracleBezier(0.45, 0, 0.55, 1), [
    filter('contrast', 1.3),
  ]),
  'ease-in-zoom': law(
    42,
    1,
    1.15,
    0,
    0,
    0,
    0,
    oracleBezier(0.42, 0, 1, 1),
    [],
  ),
  'vertical-drift': law(36, 1.15, 1.15, 0, 0, 30, -30, linear, [
    filter('contrast', 1.25), filter('saturate', 1.2),
  ]),
});

test('rapid photo builder creates runtime Image ownership and one explicit owner-first cut', () => {
  assertGuardFree(rapidPhotoCut);
  const unit = rapidPhotoCut('asset://runtime-photo', 'zoom-out');
  const [camera, overlay] = unit.units;
  const image = unit.imageUnit();

  assert.ok(unit instanceof RapidPhotoPlate);
  assert.ok(image instanceof Image);
  assert.equal(image.source, 'asset://runtime-photo');
  assert.equal(image.parent, camera);
  assert.equal(camera.parent, unit);
  assert.ok(overlay instanceof Box);
  assert.equal(overlay.name, 'rapid-photo-grade-overlay');
  assert.equal(overlay.parent, unit);
  assert.equal(Object.isFrozen(unit.animationTargets()), true);
  assert.equal(Object.isFrozen(unit.animationTargets().motion), true);
  assert.equal(unit.animationTargets().motion.recipe, 'zoom-out');
  assert.equal(unit.animationTargets().motion.role, 'motion');
  assert.equal(unit.animationTargets().camera.owner, camera);
  assert.equal(unit.animationTargets().grade.owner, overlay);
  assert.equal(unit.animationTargets().image.owner, image);
  assert.equal(unit.animationTargets().motion.owner, camera);
  assert.deepEqual(overlay.paint.backgrounds[0].stops, [
    { offset: 0.2, color: 'transparent' },
    { offset: 1, color: 'rgba(0,0,0,0.6)' },
  ]);
  assert.deepEqual(unit.behaviours, []);
  assert.deepEqual(camera.behaviours.map((entry) => entry.constructor.kind), [
    'behaviour.rapid-photo.cut',
  ]);
  assert.equal(camera.behaviours[0].unit, camera);
  assert.deepEqual(image.behaviours, []);
  assert.deepEqual(overlay.behaviours, []);
});

test('rapid photo cut rejects arbitrary generic owners and cross-recipe targets', () => {
  assert.throws(
    () => new RapidPhotoCut(new Layer(), 'zoom-out'),
    /authored RapidPhotoPlate motion target/u,
  );
  assert.throws(
    () => new RapidPhotoCut(new Image('asset://arbitrary'), 'zoom-in'),
    /authored RapidPhotoPlate motion target/u,
  );

  const zoomOut = new RapidPhotoPlate(new Image('asset://zoom-out'), 'zoom-out');
  const target = zoomOut.animationTargets().motion;
  assert.throws(
    () => new RapidPhotoCut(target.owner, 'snap-zoom'),
    /authored RapidPhotoPlate motion target/u,
  );
  const cut = new RapidPhotoCut(target.owner, target.recipe);
  assert.equal(cut.unit, target.owner);
});

test('bare rapid photo plate has a static semantic tree and no hidden Behaviours', () => {
  const unit = new RapidPhotoPlate(new Image('asset://bare-photo'), 'vertical-drift');
  const behaviours = [];
  visitUnits(unit, (child) => {
    behaviours.push(...child.behaviours);
    assert.equal(Object.hasOwn(child, 'style'), false);
    assert.equal(Object.hasOwn(child, 'css'), false);
  });
  assert.deepEqual(behaviours, []);
  assert.equal(unit.units.length, 2);
  assert.equal(unit.units[0].units[0], unit.imageUnit());
});

test('all six rapid photo recipes preserve their exact authored wrapper topology', () => {
  for (const recipe of Object.keys(cuts)) {
    const unit = new RapidPhotoPlate(new Image(`asset://${recipe}`), recipe);
    const camera = unit.units[0];
    const image = unit.imageUnit();
    assert.equal(image.frame.position, 'static');
    assert.equal(image.parent, camera);
    assert.equal(unit.animationTargets().camera.owner, camera);
    assert.equal(unit.animationTargets().image.owner, image);
    assert.equal(unit.animationTarget(), recipe === 'zoom-in' ? image : camera);
    assert.equal(unit.animationTargets().motion.owner, recipe === 'zoom-in' ? image : camera);
    assert.equal(camera.constructor.kind, recipe === 'zoom-in' ? 'unit.layout' : 'unit.layer');
    assert.equal(camera.frame.position, ['zoom-in', 'snap-zoom', 'lateral-pan'].includes(recipe)
      ? 'static'
      : 'absolute');
    if (recipe === 'zoom-in') {
      assert.equal(camera.layout.mode, 'flex');
      assert.equal(camera.layout.align, 'center');
      assert.equal(camera.layout.justify, 'center');
      assert.equal(camera.overflow, 'hidden');
    }
    assert.deepEqual(image.effects.filters, recipe === 'ease-in-zoom'
      ? [filter('contrast', 1.2), filter('brightness', 1.05)]
      : []);
  }
});

test('all six rapid photo recipes reproduce every authored transform and ordered grade frame', () => {
  for (const [recipe, authored] of Object.entries(cuts)) {
    const unit = rapidPhotoCut(`asset://${recipe}`, recipe);
    const owner = unit.animationTarget();
    for (let frame = 0; frame <= authored.duration; frame += 1) {
      const amount = authored.easing(progress(frame, 0, authored.duration));
      const state = stateAt(unit, owner, frame, authored.duration + 1);
      const scale = lerp(authored.scale[0], authored.scale[1], amount);

      const offset = authored.motion === 'x'
        ? lerp(authored.x[0], authored.x[1], amount)
        : authored.motion === 'y'
          ? lerp(authored.y[0], authored.y[1], amount)
          : 0;
      assert.deepEqual(
        state.pose.operations,
        authored.motion === 'x'
          ? [
            { kind: 'scale-2d', x: scale, y: scale },
            { kind: 'translate-x', value: offset },
          ]
          : authored.motion === 'y'
            ? [
              { kind: 'translate-y', value: offset },
              { kind: 'scale-2d', x: scale, y: scale },
            ]
            : [{ kind: 'scale-2d', x: scale, y: scale }],
        `${recipe} exact transform operation at ${frame}`,
      );
      assert.deepEqual(state.effects.filters, authored.filters);
      close(state.effects.brightness, 1, `${recipe} legacy brightness at ${frame}`);
      close(state.effects.contrast, 1, `${recipe} legacy contrast at ${frame}`);
      close(state.effects.saturate, 1, `${recipe} legacy saturate at ${frame}`);
    }
  }
});

test('micro flash builder uses one static semantic Unit and one explicit owner-first pulse', () => {
  assertGuardFree(microFlashCard);
  const unit = microFlashCard('#7ae7ff');

  assert.ok(unit instanceof MicroFlashCard);
  assert.equal(unit.units.length, 0);
  assert.deepEqual(unit.capability, {
    contract: 'micro-flash-card/v1',
    kind: 'native-dom',
  });
  assert.deepEqual(unit.style, {
    background: 'transparent',
    inset: 0,
    opacity: 0,
    position: 'absolute',
  });
  for (const legacy of ['frame', 'paint', 'pose', 'effects', 'opacity']) {
    assert.equal(Object.hasOwn(unit, legacy), false);
  }
  assert.deepEqual(unit.behaviours.map((entry) => entry.constructor.kind), [
    'behaviour.micro-flash.pulse',
  ]);
  assert.equal(unit.behaviours[0].unit, unit);
});

test('all seven micro flash frames are exact, repeatable and fully rolled back', () => {
  for (const [timing, endFrame] of [
    ['last-rendered-frame', 6],
    ['duration-endpoint', 7],
  ]) {
    const unit = microFlashCard('#7ae7ff', timing);
    const authored = structuredClone(publicSnapshot(unit));
    for (let frame = 0; frame < 7; frame += 1) {
      const input = frameInput(frame, 7);
      const first = projectFrame(unit, input).stateOf(unit);
      const second = projectFrame(unit, input).stateOf(unit);
      const normalized = frame / endFrame;
      const expected = normalized <= 0.3
        ? normalized / 0.3
        : (1 - normalized) / 0.7;
      close(first.style.opacity, expected, `${timing} opacity at ${frame}`);
      assert.equal(first.style.background, '#7ae7ff');
      assert.deepEqual(first.style, second.style);
      assert.deepEqual(publicSnapshot(unit), authored, `${timing} rollback at ${frame}`);
    }
  }

  const unit = microFlashCard('#7ae7ff');
  assert.equal(stateAt(unit, unit, -1, 7).style.opacity, 0);
  assert.equal(stateAt(unit, unit, 7, 7).style.opacity, 0);
  assert.equal(stateAt(unit, unit, 1.8, 7).style.opacity, 1);
});

test('duration-endpoint flash preserves the authored non-zero seventh rendered frame', () => {
  const unit = microFlashCard('white', 'duration-endpoint');

  assert.equal(stateAt(unit, unit, 0, 7).style.opacity, 0);
  close(stateAt(unit, unit, 2.1, 7).style.opacity, 1, 'duration endpoint peak');
  close(stateAt(unit, unit, 6, 7).style.opacity, 10 / 49, 'duration endpoint frame six');
  assert.equal(stateAt(unit, unit, 7, 7).style.opacity, 0);
});

test('generic driver emits no flash DOM and host unitRenderer mounts one native div', () => {
  const unit = microFlashCard('#7ae7ff');
  const input = frameInput(3, 7);
  const generic = createReactDriver(React).render(unit, input);
  assert.equal(findType(generic, 'div'), null);

  let rendererInput;
  const native = createReactDriver(React, {
    unitRenderers: {
      ...microFlashUnitRenderers,
      [MicroFlashCard.kind]: (current) => {
        rendererInput = current;
        return microFlashUnitRenderers[MicroFlashCard.kind](current);
      },
    },
  }).render(unit, input);

  assert.equal(native.type, 'div');
  assert.equal(native.props['aria-hidden'], true);
  assert.equal(native.props['data-memory-unit'], MicroFlashCard.kind);
  assert.equal(native.props.style, rendererInput.state.style);
  assert.equal(native.props.style.background, '#7ae7ff');
  close(native.props.style.opacity, 5 / 7, 'native frame-three opacity');
  assert.deepEqual(native.props.children, []);
  assert.equal(rendererInput.unit, unit);
  assert.equal(rendererInput.projectedChildren.length, 0);
  assert.equal(typeof rendererInput.renderChildren, 'function');
  assert.throws(() => renderMicroFlashCard({}, rendererInput.state), TypeError);
  assert.throws(() => renderMicroFlashCard(React, {}), TypeError);
});

function law(
  duration,
  scaleFrom,
  scaleTo,
  xFrom,
  xTo,
  yFrom,
  yTo,
  easing,
  filters,
) {
  const motion = xFrom !== xTo ? 'x' : yFrom !== yTo ? 'y' : 'scale';
  return Object.freeze({
    duration,
    easing,
    filters: Object.freeze(filters),
    motion,
    scale: Object.freeze([scaleFrom, scaleTo]),
    x: Object.freeze([xFrom, xTo]),
    y: Object.freeze([yFrom, yTo]),
  });
}

function filter(kind, amount) {
  return Object.freeze({ kind, amount });
}

function oracleBezier(x1, y1, x2, y2) {
  const samples = new Float32Array(11);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = coordinate(index * 0.1, x1, x2);
  }
  return (value) => {
    if (value === 0 || value === 1) return value;
    let start = 0;
    let sample = 1;
    for (; sample !== 10 && samples[sample] <= value; sample += 1) start += 0.1;
    sample -= 1;
    const distance = (value - samples[sample]) / (samples[sample + 1] - samples[sample]);
    let parameter = start + (distance * 0.1);
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const currentSlope = slope(parameter, x1, x2);
      if (currentSlope === 0) break;
      parameter -= (coordinate(parameter, x1, x2) - value) / currentSlope;
    }
    return coordinate(parameter, y1, y2);
  };
}

function coordinate(parameter, first, second) {
  const a = 1 - (3 * second) + (3 * first);
  const b = (3 * second) - (6 * first);
  return (((a * parameter + b) * parameter + (3 * first)) * parameter);
}

function slope(parameter, first, second) {
  const a = 1 - (3 * second) + (3 * first);
  const b = (3 * second) - (6 * first);
  return (3 * a * parameter * parameter) + (2 * b * parameter) + (3 * first);
}

function stateAt(root, unit, frame, duration) {
  return projectFrame(root, frameInput(frame, duration)).stateOf(unit);
}

function frameInput(frame, duration) {
  return { duration, fps: 60, frame, height: 1920, width: 1080 };
}

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} !== ${expected}`);
}

function assertGuardFree(builder) {
  const forbidden = /\b(?:if|else|switch|case|throw|try|catch|finally|typeof|instanceof|for|while|do)\b|\?|&&|\|\|/u;
  assert.doesNotMatch(builder.toString(), forbidden);
}

const React = Object.freeze({
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { props: { ...(props ?? {}), children }, type };
  },
});

function findType(tree, type) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.type === type) return tree;
  for (const child of (tree.props?.children ?? []).flat(Infinity)) {
    const found = findType(child, type);
    if (found) return found;
  }
  return null;
}
