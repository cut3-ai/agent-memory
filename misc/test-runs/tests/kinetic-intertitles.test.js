import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { publicSnapshot } from '@cut3/agent-memory/core/state';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import {
  easeIn,
  easeOut,
  interpolateRange,
  lerp,
  progress,
  springValue,
} from '@cut3/agent-memory/core/timeline';
import { scanlineImpactCaption } from '@cut3/agent-memory/compositions/ScanlineImpactCaption';
import { splitSerifIntertitle } from '@cut3/agent-memory/compositions/SplitSerifIntertitle';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layout } from '@cut3/agent-memory/units/base/Layout';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { ScanlineImpactCaption } from '@cut3/agent-memory/units/kinetic-intertitles/ScanlineImpactCaption';
import {
  renderSplitSerifProgressTrace,
  SplitSerifIntertitle,
  SplitSerifProgressTrace,
} from '@cut3/agent-memory/units/kinetic-intertitles/SplitSerifIntertitle';

const CLAMP = Object.freeze({ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const cubic = (value) => value ** 3;
const patterns = Object.freeze([
  Object.freeze([0.08, 0.72, 0.22, 0.88, 0.38, 1]),
  Object.freeze([0.18, 0.58, 0.82, 0.28, 0.68, 1]),
  Object.freeze([0.04, 0.78, 0.18, 0.72, 0.48, 1]),
  Object.freeze([0.28, 0.48, 0.92, 0.18, 0.62, 1]),
  Object.freeze([0.12, 0.38, 0.84, 0.32, 0.52, 1]),
  Object.freeze([0.22, 0.65, 0.35, 0.78, 0.42, 1]),
  Object.freeze([0.06, 0.82, 0.15, 0.68, 0.55, 1]),
]);
const variants = Object.freeze([
  Object.freeze({ family: 'serif', variant: 'shimmer', duration: 210, law: 'shimmer' }),
  Object.freeze({ family: 'impact', variant: 'scanline', duration: 210, law: 'scanline' }),
  Object.freeze({ family: 'impact', variant: 'spring-breath', duration: 300, law: 'spring' }),
  Object.freeze({ family: 'serif', variant: 'trace', duration: 210, law: 'trace' }),
  Object.freeze({ family: 'serif', variant: 'shimmer-hold', duration: 239, law: 'shimmer' }),
  Object.freeze({ family: 'serif', variant: 'trace-reprise', duration: 210, law: 'trace' }),
]);
const React = Object.freeze({
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
});

test('plain builders are guard/style-free and attach owner-first laws to named semantic targets', () => {
  assertGuardFree(splitSerifIntertitle);
  assertGuardFree(scanlineImpactCaption);
  assert.doesNotMatch(splitSerifIntertitle.toString(), /\b(?:Box|Layout|VectorPath|VectorScene)\b|backgrounds|typography/u);
  assert.doesNotMatch(scanlineImpactCaption.toString(), /\b(?:Box|Layout|VectorPath|VectorScene)\b|backgrounds|typography/u);

  const serif = splitSerifIntertitle('ALPHA BETA GAMMA', 'trace');
  const serifTargets = serif.animationTargets();
  assert.ok(serif instanceof SplitSerifIntertitle);
  assert.equal(Object.isFrozen(serifTargets), true);
  assert.equal(Object.isFrozen(serifTargets.words), true);
  assert.deepEqual(serif.behaviours, []);
  serifTargets.words.forEach((target) => assertOwner(target.owner, [
    'behaviour.kinetic-intertitles.split-word-cadence',
  ]));
  assertOwner(serifTargets.sweep.owner, [
    'behaviour.kinetic-intertitles.shimmer-sweep',
  ]);
  assertOwner(serifTargets.trace.owner, [
    'behaviour.kinetic-intertitles.progress-trace',
  ]);
  assert.equal(serifTargets.words.at(-1).owner.name, 'split-serif-last-word-cluster');
  assert.equal(serifTargets.trace.owner.name, 'split-serif-progress-trace');

  const impact = scanlineImpactCaption('PULSE', 'spring-breath');
  const impactTargets = impact.animationTargets();
  assert.ok(impact instanceof ScanlineImpactCaption);
  assert.equal(Object.isFrozen(impactTargets), true);
  assert.equal(Object.isFrozen(impactTargets.cadence), true);
  assert.deepEqual(impact.behaviours, []);
  assert.deepEqual(impactTargets.cadence.map((target) => target.role), [
    'spring-back-row',
    ...Array(5).fill('spring-back-letter'),
    'spring-front-row',
    ...Array(5).fill('spring-front-letter'),
  ]);
  impactTargets.cadence.forEach((target) => assertOwner(target.owner, [
    'behaviour.kinetic-intertitles.impact-letter-cadence',
  ]));
  assertOwner(impactTargets.scanline.owner, [
    'behaviour.kinetic-intertitles.impact-scanline-sweep',
  ]);
  assert.deepEqual(impactTargets.letters.map((target) => target.owner.text), [...'PULSE']);
});

test('bare Units own exact static-flow, gradient, dual-plane and last-word-relative trees', () => {
  const shimmer = new SplitSerifIntertitle(
    ['ALPHA', 'BETA', 'GAMMA'].map((word) => new Text(word)),
    'shimmer',
  );
  const trace = new SplitSerifIntertitle(
    ['ALPHA', 'BETA', 'GAMMA'].map((word) => new Text(word)),
    'trace',
  );
  const scanline = new ScanlineImpactCaption(
    [...'A B'].map((letter) => new Text(letter)),
    'scanline',
  );
  const spring = new ScanlineImpactCaption(
    [...'AB'].map((letter) => new Text(letter)),
    'spring-breath',
  );

  for (const root of [shimmer, trace, scanline, spring]) {
    for (const unit of collect(root)) {
      assert.deepEqual(unit.behaviours, []);
      assert.equal(Object.hasOwn(unit, 'style'), false);
      assert.equal(Object.hasOwn(unit, 'css'), false);
    }
  }
  assert.equal(collect(shimmer).length, 8);
  assert.equal(collect(trace).length, 9);
  assert.equal(collect(scanline).length, 7);
  assert.equal(collect(spring).length, 9);

  for (const root of [shimmer, trace]) {
    const units = collect(root);
    const stage = named(units, 'split-serif-stage-row');
    const words = units.filter((unit) => unit instanceof Text);
    assert.deepEqual({ y: stage.frame.y, right: stage.frame.right }, { y: 1720, right: 0 });
    words.forEach((word) => {
      assert.equal(word.frame.position, 'static');
      assert.equal(word.frame.width, 'auto');
      assert.equal(word.frame.height, 'auto');
      assert.equal(word.typography.lineHeight, 'normal');
      assert.equal(word.typography.family, 'Georgia, "Times New Roman", serif');
    });
  }
  assert.equal(named(collect(shimmer), 'split-serif-shimmer-row').layout.gap.column, 15);
  assert.equal(named(collect(trace), 'split-serif-trace-row').layout.gap.column, 18.56);
  assert.equal(named(collect(trace), 'split-serif-last-word-cluster').frame.position, 'relative');

  const sweep = named(collect(shimmer), 'split-serif-shimmer-sweep');
  assert.ok(sweep instanceof Box);
  assert.equal(sweep.frame.width, 220);
  assert.equal(sweep.frame.bottom, 0);
  assert.equal(sweep.paint.radius, 2);
  assert.deepEqual(sweep.paint.backgrounds[0].stops.map((stop) => stop.offset), [0, 0.25, 0.5, 0.75, 1]);
  assert.equal(sweep.paint.backgrounds[0].angle, 90);

  const tear = named(collect(trace), 'split-serif-progress-trace');
  assert.ok(tear instanceof SplitSerifProgressTrace);
  assert.equal(tear.units.length, 0);
  assert.equal(Object.hasOwn(tear, 'definitions'), false);
  assert.equal(Object.hasOwn(tear, 'commands'), false);
  assert.equal(Object.hasOwn(tear, 'appearance'), false);
  assert.deepEqual(tear.frame, {
    aspectRatio: undefined,
    bottom: undefined,
    boxSizing: 'border-box',
    height: 16,
    maxHeight: undefined,
    maxWidth: undefined,
    minHeight: undefined,
    minWidth: undefined,
    position: 'absolute',
    right: -6,
    width: 12,
    x: undefined,
    y: 64,
    z: 'auto',
  });

  const scanlineUnits = collect(scanline);
  const scanlineLetters = scanlineUnits.filter((unit) => unit instanceof Text);
  assert.deepEqual(scanlineLetters.map((letter) => letter.frame.width), ['auto', 22, 'auto']);
  scanlineLetters.forEach((letter) => {
    assert.equal(letter.typography.weight, 400);
    assert.equal(letter.typography.lineHeight, 'normal');
    assert.equal(letter.typography.family, 'Impact, sans-serif');
  });
  const line = named(scanlineUnits, 'impact-caption-scanline');
  assert.ok(line instanceof Box);
  assert.deepEqual(
    { x: line.frame.x, right: line.frame.right, y: line.frame.y, height: line.frame.height },
    { x: -40, right: -40, y: -12, height: 2 },
  );
  assert.equal(line.paint.backgrounds[0].angle, 90);

  const springUnits = collect(spring);
  const backRow = named(springUnits, 'spring-breath-back-row');
  const frontRow = named(springUnits, 'spring-breath-front-row');
  assert.ok(backRow instanceof Layout);
  assert.ok(frontRow instanceof Layout);
  assert.equal(backRow.effects.blur, 20);
  assert.equal(backRow.units.length, 2);
  assert.equal(frontRow.units.length, 2);
  backRow.units.forEach((letter) => assert.equal(letter.paint.color, '#ff0033'));
  frontRow.units.forEach((letter) => {
    assert.equal(letter.paint.color, '#ffffff');
    assert.deepEqual(letter.typography.shadows, [{ x: 4, y: 4, blur: 0, color: '#cc0022' }]);
  });
});

test('all six recipes reproduce every authored motion, grouping and typed accent frame', () => {
  let authoredFrames = 0;
  for (const entry of variants) {
    if (entry.family === 'serif') verifySerifVariant(entry);
    else verifyImpactVariant(entry);
    authoredFrames += entry.duration;
  }
  assert.equal(authoredFrames, 1379);
});

test('all authored states are finite and projection restores deterministic baselines', () => {
  for (const entry of variants) {
    const root = entry.family === 'serif'
      ? splitSerifIntertitle('ALPHA BETA GAMMA', entry.variant)
      : scanlineImpactCaption('PULSE', entry.variant);
    const units = collect(root);
    for (let frame = 0; frame < entry.duration; frame += 1) {
      const projection = projected(root, frame, entry.duration);
      units.forEach((unit) => assertFinite(projection.stateOf(unit)));
    }
  }

  for (const root of [
    splitSerifIntertitle('ALPHA BETA GAMMA', 'trace'),
    scanlineImpactCaption('PULSE', 'spring-breath'),
  ]) {
    const units = collect(root);
    const before = units.map((unit) => publicSnapshot(unit));
    const first = projected(root, 80, 210);
    units.forEach((unit, index) => assert.deepEqual(publicSnapshot(unit), before[index]));
    projected(root, 12, 210);
    const repeated = projected(root, 80, 210);
    units.forEach((unit, index) => {
      assert.deepEqual(repeated.stateOf(unit), first.stateOf(unit));
      assert.deepEqual(publicSnapshot(unit), before[index]);
    });
  }
});

test('generic driver emits no SVG and the host can opt into the direct family SVG helper', () => {
  const root = splitSerifIntertitle('ALPHA BETA GAMMA', 'trace');
  const input = { duration: 210, fps: 60, frame: 90, height: 1920, width: 1080 };
  const genericTree = createReactDriver(React).render(root, input);
  assert.equal(findType(genericTree, 'svg'), null);
  assert.equal(findType(genericTree, 'path'), null);

  let rendererInput;
  const nativeTree = createReactDriver(React, {
    unitRenderers: {
      [SplitSerifProgressTrace.kind]: (input) => {
        rendererInput = input;
        return renderSplitSerifProgressTrace(input);
      },
    },
  }).render(root, input);
  const svg = findType(nativeTree, 'svg');
  const path = findType(nativeTree, 'path');

  assert.ok(svg);
  assert.ok(path);
  assert.ok(rendererInput.unit instanceof SplitSerifProgressTrace);
  assert.equal(rendererInput.projectedChildren.length, 0);
  assert.equal(typeof rendererInput.renderChildren, 'function');
  assert.equal(svg.props.viewBox, '0 0 12 16');
  assert.equal(svg.props.style.position, 'absolute');
  assert.equal(svg.props.style.width, 12);
  assert.equal(svg.props.style.height, 16);
  assert.equal(svg.props.style.top, rendererInput.state.frame.y);
  assert.equal(svg.props.style.opacity, rendererInput.state.opacity);
  assert.match(svg.props.style.filter, /drop-shadow/u);
  assert.equal(path.props.fill, '#ff7070');
  assert.equal(path.props.d, 'M6 0 C6 0 12 9 12 11 C12 13.8 9.3 16 6 16 C2.7 16 0 13.8 0 11 C0 9 6 0 6 0 Z');
});

test('kinetic family source contains no private literal, URL, hash or raw style bag', async () => {
  const files = [
    'src/units/kinetic-intertitles/SplitSerifIntertitle.js',
    'src/units/kinetic-intertitles/ScanlineImpactCaption.js',
    'src/behaviours/kinetic-intertitles/SplitWordCadence.js',
    'src/behaviours/kinetic-intertitles/ShimmerSweep.js',
    'src/behaviours/kinetic-intertitles/ProgressTrace.js',
    'src/behaviours/kinetic-intertitles/ImpactLetterCadence.js',
    'src/behaviours/kinetic-intertitles/ImpactScanlineSweep.js',
    'src/compositions/SplitSerifIntertitle.js',
    'src/compositions/ScanlineImpactCaption.js',
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../../../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /https?:\/\//iu);
    assert.doesNotMatch(source, /\b[a-f0-9]{40,64}\b/iu);
    assert.doesNotMatch(source, /\bW\d+C\d+\b/u);
    if (!source.includes('renderSplitSerifProgressTrace')) {
      assert.doesNotMatch(source, /\b(?:style|css)\s*:\s*\{/u);
    }
    assert.doesNotMatch(source, /Vector(?:Scene|Path)|\bdefinitions\b|\bcommands\b/u);
    if (file.includes('/behaviours/')) {
      assert.doesNotMatch(source, /createElement|<svg|<path|CanvasRenderingContext2D/u);
    }
  }
});

function verifySerifVariant(entry) {
  const root = splitSerifIntertitle('ALPHA BETA GAMMA', entry.variant);
  const targets = root.animationTargets();
  const texts = collect(root).filter((unit) => unit instanceof Text);

  for (let frame = 0; frame < entry.duration; frame += 1) {
    const projection = projected(root, frame, entry.duration);
    const fadeOutDuration = Math.round(60 * 0.5);
    if (entry.law === 'shimmer') {
      const fadeInDuration = Math.round(60 * 0.6);
      const fadeIn = interpolateRange(frame, [0, fadeInDuration], [0, 1], {
        ...CLAMP,
        easing: easeOut(cubic),
      });
      const fadeOut = interpolateRange(
        frame,
        [entry.duration - fadeOutDuration, entry.duration],
        [1, 0],
        { ...CLAMP, easing: easeIn(cubic) },
      );
      targets.words.forEach((target, index) => {
        const wordDuration = Math.round(60 * 0.3);
        const start = fadeInDuration + (index * Math.round(60 * 0.16));
        const scale = interpolateRange(
          frame,
          [start, start + (wordDuration * 0.5), start + wordDuration],
          [1, 1.055, 1],
          CLAMP,
        );
        const state = projection.stateOf(target.owner);
        close(state.opacity, fadeIn * fadeOut);
        close(state.pose.scaleX, scale);
        close(state.pose.scaleY, scale);
      });
      const amount = progress(
        frame,
        fadeInDuration + Math.round(60 * 0.08),
        Math.round(60 * 1.05),
      );
      const opacity = interpolateRange(
        amount,
        [0, 0.08, 0.92, 1],
        [0, 0.45, 0.45, 0],
        CLAMP,
      );
      const sweep = projection.stateOf(targets.sweep.owner);
      assert.equal(sweep.present, true);
      close(sweep.opacity, opacity * fadeIn * fadeOut);
      close(sweep.frame.x, lerp(-280, 280, amount));
      assert.equal(projection.stateOf(targets.trace.owner).present, false);
      continue;
    }

    const fadeOut = interpolateRange(
      frame,
      [entry.duration - fadeOutDuration, entry.duration],
      [1, 0],
      CLAMP,
    );
    const fadeInDuration = Math.round(60 * 0.6);
    targets.words.forEach((target, index) => {
      const wordFrame = frame - (index * fadeInDuration / targets.words.length);
      const opacity = interpolateRange(
        wordFrame,
        [0, Math.round(60 * 0.12)],
        [0, 1],
        CLAMP,
      );
      const scale = 0.7 + (springValue({
        frame: wordFrame,
        fps: 60,
        config: { damping: 15, stiffness: 85, mass: 0.55 },
      }) * 0.3);
      const state = projection.stateOf(target.owner);
      close(state.opacity, opacity * fadeOut);
      close(state.pose.scaleX, scale);
      close(state.pose.scaleY, scale);
    });
    assert.equal(projection.stateOf(targets.sweep.owner).present, false);

    const shimmerStart = fadeInDuration + Math.round(60 * 0.06);
    const shimmerDuration = Math.round(60 * 0.38);
    const tearStart = shimmerStart + shimmerDuration;
    const tearDuration = Math.round(60 * 0.65);
    const tearAmount = progress(frame, tearStart, tearDuration);
    const tearOpacity = interpolateRange(
      frame,
      [
        tearStart,
        tearStart + Math.round(60 * 0.1),
        tearStart + tearDuration - Math.round(60 * 0.3),
        tearStart + tearDuration,
      ],
      [0, 0.9, 0.6, 0],
      CLAMP,
    );
    const trace = projection.stateOf(targets.trace.owner);
    assert.equal(trace.present, true);
    close(trace.opacity, tearOpacity);
    close(trace.frame.y, 64 + (tearAmount * 80));
    texts.forEach((text) => assert.deepEqual(
      text.typography.shadows.map((shadow) => shadow.blur),
      [14, 32, 60],
    ));
  }
}

function verifyImpactVariant(entry) {
  const root = scanlineImpactCaption('PULSE', entry.variant);
  const targets = root.animationTargets();
  const units = collect(root);
  const line = targets.scanline.owner;

  for (let frame = 0; frame < entry.duration; frame += 1) {
    const projection = projected(root, frame, entry.duration);
    const fade = interpolateRange(
      frame,
      [entry.duration - Math.round(60 * 0.5), entry.duration],
      [1, 0],
      CLAMP,
    );
    if (entry.law === 'scanline') {
      const row = named(units, 'scanline-impact-stage-row');
      const rowState = projection.stateOf(row);
      close(rowState.opacity, fade);
      close(rowState.effects.brightness, 1 + (0.05 * Math.sin((frame * Math.PI * 16) / 60)));
      targets.letters.forEach((target, index) => {
        const localFrame = frame - (index * 5);
        let opacity = 1;
        if (localFrame < 0) opacity = 0;
        else if (localFrame < 6) opacity = patterns[index % patterns.length][Math.floor(localFrame)];
        const transition = progress(frame, (targets.letters.length * 5) - 5, 25);
        const pulse = 1
          + (0.45 * Math.sin((frame - (targets.letters.length * 5)) * 0.065) * transition);
        const state = projection.stateOf(target.owner);
        close(state.opacity, opacity);
        state.typography.shadows.forEach((shadow, shadowIndex) => {
          close(shadow.blur, [18, 36, 54, 80][shadowIndex] * pulse);
        });
      });
      const start = (targets.letters.length * 5) + 12;
      const amount = progress(frame, start, 22);
      const opacity = interpolateRange(
        amount,
        [0, 0.08, 0.92, 1],
        [0, 0.9, 0.9, 0],
        CLAMP,
      );
      const lineState = projection.stateOf(line);
      assert.equal(lineState.present, amount > 0);
      close(lineState.opacity, opacity);
      close(lineState.frame.y, lerp(-12, 108, amount));
      continue;
    }

    const backRow = named(units, 'spring-breath-back-row');
    const frontRow = named(units, 'spring-breath-front-row');
    const breathStart = ((targets.letters.length - 1) * 4) + 12;
    const breathTime = Math.max(0, frame - breathStart);
    const breath = 1 + (Math.sin(breathTime * 0.04) * 0.03 * progress(breathTime, 0, 30));
    const backRowState = projection.stateOf(backRow);
    const frontRowState = projection.stateOf(frontRow);
    close(backRowState.opacity, 0.6 * fade);
    close(frontRowState.opacity, fade);
    assert.deepEqual(backRowState.pose.operations, [
      { kind: 'scale-2d', x: breath, y: breath },
      { kind: 'translate-2d', x: 2, y: 3 },
    ]);
    assert.deepEqual(frontRowState.pose.operations, [
      { kind: 'scale-2d', x: breath, y: breath },
    ]);
    backRow.units.forEach((letter, index) => verifySpringLetter(
      projection.stateOf(letter),
      frame,
      index,
      false,
    ));
    frontRow.units.forEach((letter, index) => verifySpringLetter(
      projection.stateOf(letter),
      frame,
      index,
      true,
    ));
    assert.equal(projection.stateOf(line).present, false);
    assert.equal(projection.stateOf(line).opacity, 0);
  }
}

function verifySpringLetter(state, frame, index, front) {
  const spring = springValue({
    frame: frame - (index * 4),
    fps: 60,
    config: { damping: 8, stiffness: 120 },
  });
  close(state.opacity, spring);
  assert.deepEqual(state.pose.operations, [{
    kind: 'scale-2d',
    x: front ? Math.max(0.01, spring) : spring,
    y: front ? Math.max(0.01, spring) : spring,
  }]);
}

function assertOwner(owner, kinds) {
  assert.deepEqual(owner.behaviours.map((entry) => entry.constructor.kind), kinds);
  owner.behaviours.forEach((entry) => assert.equal(entry.unit, owner));
}

function named(units, name) {
  const unit = units.find((entry) => entry.name === name);
  assert.ok(unit, `Missing ${name}`);
  return unit;
}

function collect(root) {
  const units = [];
  visitUnits(root, (unit) => units.push(unit));
  return units;
}

function projected(root, frame, duration) {
  return projectFrame(root, {
    duration,
    fps: 60,
    frame,
    height: 1920,
    width: 1080,
  });
}

function assertFinite(value) {
  if (typeof value === 'number') {
    assert.equal(Number.isFinite(value), true);
    return;
  }
  if (!value || typeof value !== 'object') return;
  Object.values(value).forEach(assertFinite);
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} !== ${expected}`);
}

function assertGuardFree(builder) {
  const forbidden = /\b(?:if|else|switch|case|throw|try|catch|finally|typeof|instanceof|for|while|do)\b|\?|&&|\|\|/u;
  assert.doesNotMatch(builder.toString(), forbidden);
}

function findType(node, type) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node;
  for (const child of node.children ?? []) {
    const match = findType(child, type);
    if (match) return match;
  }
  return null;
}
