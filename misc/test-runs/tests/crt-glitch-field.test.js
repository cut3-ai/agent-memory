import assert from 'node:assert/strict';
import test from 'node:test';

import {
  crtFilmField,
  crtGlitchTitle,
} from '@cut3/agent-memory/compositions/CrtGlitchField';
import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { publicSnapshot } from '@cut3/agent-memory/core/state';
import {
  cubicBezier,
  interpolateRange,
} from '@cut3/agent-memory/core/timeline';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import {
  createCrtGlitchUnitRenderers,
  CrtGlitchField,
  CrtSignal,
  requireCrtSignalTarget,
} from '@cut3/agent-memory/units/crt-glitch/CrtGlitchField';

const FILM_DURATION = 420;
const TITLE_DURATION = 180;
const ENTRY_EASE = cubicBezier(0.16, 1, 0.3, 1);
const EXIT_EASE = cubicBezier(0.45, 0, 0.55, 1);
const EXIT_SPLIT_EASE = cubicBezier(0.34, 1.56, 0.64, 1);
const React = {
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
};

test('builders attach one owner-first behaviour to a substantive semantic CrtSignal', () => {
  assertGuardFree(crtFilmField);
  assertGuardFree(crtGlitchTitle);

  const film = crtFilmField();
  assert.ok(film instanceof CrtGlitchField);
  assert.equal(film.units.length, 1);
  assertSignalOwner(film.animationTargets().signal.owner);

  const title = crtGlitchTitle('synthetic runtime title');
  assert.equal(title.units.length, 1);
  assert.ok(title.units[0] instanceof CrtSignal);
  assertSignalOwner(title.animationTargets().signal.owner);
  assert.equal(title.animationTargets().signal.owner.content, 'synthetic runtime title');
  const titleKinds = [];
  visitUnits(title, (unit) => titleKinds.push(unit.constructor.kind));
  assert.deepEqual(titleKinds, [CrtGlitchField.kind, CrtSignal.kind]);
  assert.doesNotMatch(crtFilmField.toString(), /\.units|\.children|\.at\(|\[[0-9]+\]/u);
  assert.doesNotMatch(crtGlitchTitle.toString(), /\.units|\.children|\.at\(|\[[0-9]+\]/u);
});

test('AnalogScanBurst accepts only the closed semantic target and owns no render model', async () => {
  const { AnalogScanBurst } = await import(
    '@cut3/agent-memory/behaviours/crt-glitch/AnalogScanBurst'
  );
  const title = crtGlitchTitle('synthetic bound title');
  const target = title.animationTargets().signal;
  assert.equal(requireCrtSignalTarget(target.owner), target);
  assert.throws(
    () => new AnalogScanBurst(new CrtSignal('glitch-title')),
    /authored CRT signal target/u,
  );
  assert.doesNotMatch(AnalogScanBurst.toString(), /command|canvas|context/iu);
  assert.doesNotMatch(CrtSignal.toString(), /Canvas2D|commands/u);
});

test('bare CRT units are static semantic trees with plain initial frame state', () => {
  const units = [
    new CrtGlitchField('film-field'),
    new CrtGlitchField('glitch-title', 'synthetic bare title'),
  ];
  for (const unit of units) {
    assert.deepEqual(unit.style, {
      inset: 0,
      overflow: 'hidden',
      position: 'absolute',
    });
    assert.equal(unit.units.length, 1);
    const behaviours = [];
    visitUnits(unit, (child) => {
      behaviours.push(...child.behaviours);
      assert.equal(Object.hasOwn(child, 'css'), false);
      assert.equal(Object.hasOwn(child, 'commands'), false);
    });
    assert.deepEqual(behaviours, []);
    const signal = unit.animationTargets().signal.owner;
    assert.equal(Object.hasOwn(signal, 'style'), false);
    assert.ok(signal.frameState && !Array.isArray(signal.frameState));
    assertFinite(signal.frameState);
  }
});

test('all 600 authored frames are exact, deterministic, finite and fully rolled back', () => {
  const recipes = [
    [crtFilmField(), FILM_DURATION, expectedFilmState],
    [crtGlitchTitle('synthetic rollback title'), TITLE_DURATION, expectedTitleState],
  ];
  let projectedStates = 0;

  for (const [unit, duration, expected] of recipes) {
    const signal = unit.animationTargets().signal.owner;
    const composition = new Composition(unit, { duration, fps: 60 });
    const tree = [];
    visitUnits(composition, (child) => tree.push(child));
    const authored = new Map(tree.map((child) => [
      child,
      structuredClone(publicSnapshot(child)),
    ]));

    for (let frame = 0; frame < duration; frame += 1) {
      const first = projectFrame(composition, context(frame, duration));
      const second = projectFrame(composition, context(frame, duration));
      const firstState = first.stateOf(signal);
      const secondState = second.stateOf(signal);
      assert.deepEqual(firstState.frameState, expected(frame, duration));
      assert.deepEqual(firstState, secondState);
      assertFinite(firstState);
      tree.forEach((child) => {
        assert.deepEqual(publicSnapshot(child), authored.get(child));
      });
      projectedStates += 1;
    }
  }

  assert.equal(projectedStates, 600);
});

test('family draw function calls the native 2D context directly for both recipes', () => {
  const film = crtFilmField();
  const filmSignal = film.animationTargets().signal.owner;
  const filmState = projectFrame(film, context(23, FILM_DURATION)).stateOf(filmSignal);
  const filmTrace = [];
  filmSignal.draw(tracingContext(filmTrace), filmState);

  const radius = Math.sqrt((540 * 540) + (960 * 960));
  assert.deepEqual(filmTrace.slice(0, 11), [
    ['save'],
    ['set', 'globalAlpha', 1],
    ['set', 'globalCompositeOperation', 'source-over'],
    ['clearRect', 0, 0, 1080, 1920],
    ['createRadialGradient', 'gradient-1', 540, 960, radius * 0.25, 540, 960, radius],
    ['addColorStop', 'gradient-1', 0, 'rgba(0,0,0,0)'],
    ['addColorStop', 'gradient-1', 0.45, 'rgba(0,0,0,0.03)'],
    ['addColorStop', 'gradient-1', 0.7, 'rgba(0,0,0,0.18)'],
    ['addColorStop', 'gradient-1', 1, 'rgba(0,0,0,0.75)'],
    ['set', 'fillStyle', 'gradient-1'],
    ['fillRect', 0, 0, 1080, 1920],
  ]);
  assert.equal(countTrace(filmTrace, 'createRadialGradient'), 5);
  assert.equal(countTrace(filmTrace, 'addColorStop'), 16);
  assert.equal(countTrace(filmTrace, 'fillRect'), 3765);
  assert.deepEqual(filmTrace.at(-1), ['restore']);

  const title = crtGlitchTitle('CRT');
  const titleSignal = title.animationTargets().signal.owner;
  const titleState = projectFrame(title, context(7, TITLE_DURATION)).stateOf(titleSignal);
  const titleTrace = [];
  titleSignal.draw(tracingContext(titleTrace), titleState);

  assert.deepEqual(titleTrace.slice(0, 4), [
    ['save'],
    ['set', 'globalAlpha', 1],
    ['set', 'globalCompositeOperation', 'source-over'],
    ['clearRect', 0, 0, 1080, 1920],
  ]);
  assert.equal(countTrace(titleTrace, 'measureText'), 18);
  assert.equal(countTrace(titleTrace, 'fillText'), 15);
  assert.equal(countTrace(titleTrace, 'strokeText'), 3);
  assert.ok(titleTrace.some((entry) => (
    entry[0] === 'set' && entry[1] === 'fillStyle' && entry[2] === '#0099ff'
  )));
  assert.deepEqual(titleTrace.at(-1), ['restore']);
});

test('generic driver emits no DOM/canvas and family renderers expose the native host seam', () => {
  const genericTree = createReactDriver(React).render(
    crtGlitchTitle('generic semantic title'),
    context(7, TITLE_DURATION),
  );
  assert.equal(findType(genericTree, 'canvas'), null);
  assert.equal(findAllTypes(genericTree, 'div').length, 0);

  assert.throws(
    () => createCrtGlitchUnitRenderers(),
    /native canvas host/u,
  );
  const unitRenderers = createCrtGlitchUnitRenderers('native-crt-canvas');
  assert.equal(Object.isFrozen(unitRenderers), true);
  const driver = createReactDriver(React, {
    unitRenderers,
  });
  const nativeTree = driver.render(
    crtGlitchTitle('host semantic title'),
    context(31, TITLE_DURATION),
  );

  assert.equal(nativeTree.type, 'div');
  assert.equal(nativeTree.props['data-memory-unit'], CrtGlitchField.kind);
  assert.deepEqual(nativeTree.props.style, {
    inset: 0,
    overflow: 'hidden',
    position: 'absolute',
  });
  assert.equal(findType(nativeTree, 'canvas'), null);
  const nativeCanvas = findType(nativeTree, 'native-crt-canvas');
  assert.ok(nativeCanvas);
  assert.equal(nativeCanvas.props['data-memory-unit'], CrtSignal.kind);
  assert.equal(nativeCanvas.props.variant, 'glitch-title');
  assert.equal(nativeCanvas.props.height, 1920);
  assert.equal(nativeCanvas.props.width, 1080);
  assert.deepEqual(nativeCanvas.props.frameState, expectedTitleState(31, TITLE_DURATION));
  assert.deepEqual(nativeCanvas.props.style, {
    display: 'block',
    height: '100%',
    width: '100%',
  });
  const nativeTrace = [];
  nativeCanvas.props.draw(tracingContext(nativeTrace));
  assert.ok(countTrace(nativeTrace, 'fillText') > 0);
});

function assertSignalOwner(signal) {
  assert.ok(signal instanceof CrtSignal);
  assert.equal(signal.constructor.kind, 'unit.crt-glitch.signal');
  assert.equal(Object.hasOwn(signal, 'commands'), false);
  assert.deepEqual(signal.behaviours.map((behaviour) => behaviour.constructor.kind), [
    'behaviour.crt-glitch.analog-scan-burst',
  ]);
  assert.equal(signal.behaviours[0].unit, signal);
}

function assertGuardFree(builder) {
  const forbidden = /\b(?:if|else|switch|case|throw|try|catch|finally|typeof|instanceof|for|while|do)\b|\?|&&|\|\||\?\?/u;
  assert.doesNotMatch(builder.toString(), forbidden);
}

function expectedFilmState(frame) {
  return {
    frame,
    grainSeed: (frame * 7919) + 104729,
  };
}

function expectedTitleState(frame, duration) {
  const fps = 60;
  const entryDuration = Math.round(0.4 * fps);
  const exitDuration = Math.round(0.4 * fps);
  const exitStart = Math.max(entryDuration, duration - exitDuration);
  const interval = Math.round(0.6 * fps);
  const phase = Math.floor(frame / interval);
  const inPhase = frame % interval;
  const mid = expectedPseudoRandom((phase * 1000) + 42) > 0.5
    && inPhase < 4 && frame > entryDuration && frame < exitStart;
  const entry = frame < entryDuration;
  const entryProgress = entry ? frame / entryDuration : 1;
  const exit = frame >= exitStart;
  const exitProgress = exit ? (frame - exitStart) / exitDuration : 0;
  let opacity = 1;
  if (entry) {
    opacity = interpolateRange(frame, [0, entryDuration * 0.35, entryDuration], [0, 0.65, 1], {
      easing: ENTRY_EASE,
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    if (expectedPseudoRandom((frame * 11) + 3) > 0.55) {
      opacity = Math.max(0.08, opacity - ((1 - entryProgress) * 0.55));
    }
  }
  if (exit) {
    const base = interpolateRange(exitProgress, [0, 0.4, 1], [1, 0.55, 0], {
      easing: EXIT_EASE,
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    opacity = expectedPseudoRandom((frame * 13) + 7) > 0.5
      ? base * (expectedPseudoRandom((frame * 19) + 1) > 0.65 ? 0.15 : 0.7)
      : base;
  }
  let splitAmount = 0;
  let shakeY = 0;
  if (entry) {
    const base = interpolateRange(entryProgress, [0, 0.35, 1], [16, 9, 0], {
      easing: ENTRY_EASE,
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    splitAmount = base
      + ((expectedPseudoRandom((frame * 3) + 5) - 0.5) * 10 * (1 - entryProgress));
    shakeY = (expectedPseudoRandom((frame * 5) + 1) - 0.5) * 6 * (1 - entryProgress);
  } else if (mid) {
    splitAmount = 8 + (expectedPseudoRandom((phase * 2000) + 77) * 10);
    shakeY = (expectedPseudoRandom((frame * 17) + 3) - 0.5) * 5;
  } else if (exit) {
    splitAmount = interpolateRange(exitProgress, [0, 0.5, 1], [0, 10, 22], {
      easing: EXIT_SPLIT_EASE,
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    shakeY = (expectedPseudoRandom((frame * 11) + 9) - 0.5) * 5 * exitProgress;
  }
  return { frame, opacity, shakeY, splitAmount };
}

function expectedPseudoRandom(seed) {
  const value = Math.sin((seed * 127.1) + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function context(frame, duration) {
  return { duration, fps: 60, frame, height: 1920, width: 1080 };
}

function tracingContext(trace) {
  let gradientCount = 0;
  const target = {
    clearRect: (...args) => trace.push(['clearRect', ...args]),
    createRadialGradient(...args) {
      gradientCount += 1;
      const name = `gradient-${gradientCount}`;
      trace.push(['createRadialGradient', name, ...args]);
      return {
        traceName: name,
        addColorStop: (...values) => trace.push(['addColorStop', name, ...values]),
      };
    },
    fillRect: (...args) => trace.push(['fillRect', ...args]),
    fillText: (...args) => trace.push(['fillText', ...args]),
    measureText(glyph) {
      trace.push(['measureText', glyph]);
      return { width: 60 + (glyph.charCodeAt(0) % 13) };
    },
    restore: () => trace.push(['restore']),
    save: () => trace.push(['save']),
    strokeText: (...args) => trace.push(['strokeText', ...args]),
  };
  return new Proxy(target, {
    set(object, property, value) {
      object[property] = value;
      trace.push(['set', String(property), value?.traceName ?? value]);
      return true;
    },
  });
}

function countTrace(trace, operation) {
  return trace.filter(([current]) => current === operation).length;
}

function findType(element, type) {
  if (element?.type === type) return element;
  for (const child of element?.children ?? []) {
    const found = findType(child, type);
    if (found) return found;
  }
  return null;
}

function findAllTypes(element, type, found = []) {
  if (element?.type === type) found.push(element);
  for (const child of element?.children ?? []) findAllTypes(child, type, found);
  return found;
}

function assertFinite(value) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value));
    return;
  }
  if (!value || typeof value !== 'object') return;
  Object.values(value).forEach(assertFinite);
}
