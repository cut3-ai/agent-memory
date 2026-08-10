import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  terminalCrtPanel,
  terminalSpeakerPanel,
  terminalStatusPanel,
} from '@cut3/agent-memory/compositions/BlueTerminalPanels';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import {
  easeOutCubic,
  lerp,
  progress,
  springValue,
} from '@cut3/agent-memory/core/timeline';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { TerminalCursor, TerminalIndicator } from '@cut3/agent-memory/units/blue-terminal/TerminalAffordances';
import { TerminalCrtPanel } from '@cut3/agent-memory/units/blue-terminal/TerminalCrtPanel';
import { TerminalSpeakerPanel } from '@cut3/agent-memory/units/blue-terminal/TerminalSpeakerPanel';
import { TerminalStatusPanel } from '@cut3/agent-memory/units/blue-terminal/TerminalStatusPanel';
import {
  terminalTextTarget,
  terminalTransitTarget,
} from '@cut3/agent-memory/units/blue-terminal/terminalSemantics';

const runtimeMessage = Array.from(
  { length: 60 },
  (_, index) => String.fromCharCode(65 + (index % 26)),
).join('');
const runtimeLabel = 'SYNTHETIC RUNTIME LABEL';
const runtimeCursorGlyph = 'SYNTHETIC CURSOR GLYPH';
const runtimeIndicatorGlyph = 'SYNTHETIC INDICATOR GLYPH';

const contracts = Object.freeze({
  'pixel-crt': contract(terminalCrtPanel, TerminalCrtPanel, 0, 154, {
    body: typography("'Press Start 2P', 'Courier New', Courier, monospace", 22, 400, 2.1, 0.88),
    bodyFrame: frame(133, 750, 732, 140),
    label: typography("'Press Start 2P', monospace", 13, 400, 1, 0),
    transitRoles: ['panel'],
    indicatorAnchor: 'panel-corner',
  }),
  'soft-speaker': contract(terminalSpeakerPanel, TerminalSpeakerPanel, 1162, 187, {
    body: typography("'Nunito', monospace", 26, 800, 1.55, 1.5),
    bodyFrame: frame(166, 700, 748, 114),
    label: typography("'Nunito', monospace", 20, 900, 'normal', 2),
    transitRoles: ['panel'],
    indicatorAnchor: 'panel-corner',
  }),
  'bevel-status': contract(terminalStatusPanel, TerminalStatusPanel, 826, 336, {
    body: typography("'Nunito', monospace", 26, 900, 1.55, 1.5),
    bodyFrame: frame(134.2, 699, 819.6, 156),
    label: typography("'Nunito', monospace", 26, 900, 1.55, 1.5),
    transitRoles: ['panel'],
    indicatorAnchor: 'inline-end',
  }),
  'tagged-status': contract(terminalStatusPanel, TerminalStatusPanel, 1349, 331, {
    body: typography("'Nunito', monospace", 28, 800, 1.55, 1),
    bodyFrame: frame(158.8, 706, 762.4, 168),
    label: typography("'Nunito', monospace", 20, 900, 'normal', 2),
    transitRoles: ['tagged-tail', 'tagged-body'],
    indicatorAnchor: 'panel-corner',
  }),
  'press-start-crt': contract(terminalCrtPanel, TerminalCrtPanel, 154, 317, {
    body: typography("'Press Start 2P', monospace", 15, 400, 1.9, 0.5),
    bodyFrame: frame(146.8, 600, 786.4, 172),
    label: typography("'Press Start 2P', monospace", 11, 400, 'normal', 1),
    transitRoles: ['panel'],
    indicatorAnchor: 'inline-end',
  }),
  'steel-speaker': contract(terminalSpeakerPanel, TerminalSpeakerPanel, 470, 355, {
    body: typography('Nunito, monospace', 26, 900, 1.55, 1.5),
    bodyFrame: { position: 'static', width: 'auto', height: 'auto' },
    label: typography('Nunito, monospace', 20, 900, 'normal', 3),
    transitRoles: [
      'steel-scene',
      'steel-label',
      'steel-body',
      'steel-tail',
      'steel-corner-top',
      'steel-corner-top',
      'steel-corner-bottom',
      'steel-corner-bottom',
    ],
    indicatorAnchor: 'panel-corner',
  }),
});

test('plain builders are guard/style-free and attach only named semantic owners', async () => {
  for (const builder of [terminalCrtPanel, terminalSpeakerPanel, terminalStatusPanel]) {
    assertGuardFree(builder);
  }
  const applicationSource = await readFile(
    new URL('../../../src/compositions/BlueTerminalPanels.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    applicationSource,
    /\b(?:appearance|effects|frame|layout|opacity|overflow|paint|pose|typography|viewBox)\s*:/u,
  );

  for (const [recipe, authored] of Object.entries(contracts)) {
    const unit = buildAuthored(authored, recipe);
    assert.ok(unit instanceof authored.UnitClass);
    assert.equal(unit.recipe, recipe);
    assert.equal(unit.message.text, runtimeMessage);
    assert.equal(unit.label.text, runtimeLabel);
    assert.equal(unit.cursor.text, runtimeCursorGlyph);
    assert.equal(unit.indicator.text, runtimeIndicatorGlyph);
    assert.equal(terminalTextTarget(unit.message, 'test').recipe, recipe);
    assert.deepEqual(
      unit.transitTargets.map((target) => terminalTransitTarget(target, 'test').role),
      authored.transitRoles,
    );
    assert.deepEqual(
      unit.transitTargets.map((target) => behaviourKinds(target)),
      authored.transitRoles.map(() => ['behaviour.blue-terminal.panel-transit']),
    );
    assert.deepEqual(behaviourKinds(unit.message), ['behaviour.blue-terminal.text-cadence']);
    assert.deepEqual(behaviourKinds(unit.cursor), ['behaviour.blue-terminal.cursor-cadence']);
    assert.deepEqual(behaviourKinds(unit.indicator), ['behaviour.blue-terminal.indicator-cadence']);
    assert.deepEqual(behaviourKinds(unit.scanlines), ['behaviour.blue-terminal.scanline-cadence']);
    assert.deepEqual(behaviourKinds(unit.label), []);
    unit.transitTargets.forEach((target) => assert.equal(target.behaviours[0].unit, target));
    assert.equal(unit.message.behaviours[0].unit, unit.message);
    assert.equal(unit.cursor.behaviours[0].unit, unit.cursor);
    assert.equal(unit.indicator.behaviours[0].unit, unit.indicator);
    assert.equal(unit.scanlines.behaviours[0].unit, unit.scanlines);

    const kinds = treeBehaviourKinds(unit);
    assert.equal(
      kinds.filter((kind) => kind === 'behaviour.blue-terminal.panel-transit').length,
      authored.transitRoles.length,
    );
    for (const required of [
      'behaviour.blue-terminal.text-cadence',
      'behaviour.blue-terminal.cursor-cadence',
      'behaviour.blue-terminal.indicator-cadence',
      'behaviour.blue-terminal.scanline-cadence',
    ]) assert.equal(kinds.filter((kind) => kind === required).length, 1);
  }
});

test('bare panels own substantial source-shaped trees with zero hidden Behaviours', () => {
  for (const [recipe, authored] of Object.entries(contracts)) {
    const message = new Text(runtimeMessage);
    const label = new Text(runtimeLabel);
    const cursor = new TerminalCursor(runtimeCursorGlyph, recipe);
    const indicator = new TerminalIndicator(runtimeIndicatorGlyph, recipe);
    const unit = new authored.UnitClass(message, label, cursor, indicator, recipe);
    const units = [];
    const texts = [];
    visitUnits(unit, (child) => {
      units.push(child);
      assert.deepEqual(child.behaviours, []);
      assert.notEqual(child.constructor.kind, 'unit.canvas-2d');
      if (child instanceof Text) texts.push(child.text);
    });

    assert.ok(units.length >= 10, `${recipe} must remain a semantic panel tree`);
    assert.deepEqual(
      texts.sort(),
      [runtimeCursorGlyph, runtimeIndicatorGlyph, runtimeLabel, runtimeMessage].sort(),
    );
    assert.equal(unit.message, message);
    assert.equal(unit.label, label);
    assert.equal(unit.cursor.anchor.kind, 'inline-end');
    assert.equal(unit.indicator.anchor.kind, authored.indicatorAnchor);
    assert.ok(unit.scanlines instanceof Box);
    assert.equal(unit.scanlines.constructor.kind, 'unit.blue-terminal.scanline-field');
    assert.equal(Object.hasOwn(unit.scanlines, 'commands'), false);
    assert.deepEqual(selectFrame(unit.message.frame), authored.bodyFrame);
    assertTypography(unit.message.typography, authored.body, `${recipe} body`);
    assertTypography(unit.label.typography, authored.label, `${recipe} label`);
  }

  const shared = new Text('SYNTHETIC SHARED VALUE');
  for (const [recipe, authored] of Object.entries(contracts)) {
    const before = structuredClone({
      frame: shared.frame,
      parent: shared.parent,
      text: shared.text,
      typography: shared.typography,
    });
    const cursor = new TerminalCursor(runtimeCursorGlyph, recipe);
    const indicator = new TerminalIndicator(runtimeIndicatorGlyph, recipe);
    assert.throws(
      () => new authored.UnitClass(shared, shared, cursor, indicator, recipe),
      /distinct runtime text and affordance Units/u,
    );
    assert.equal(shared.parent, before.parent);
    assert.equal(shared.text, before.text);
    assert.deepEqual(shared.frame, before.frame);
    assert.deepEqual(shared.typography, before.typography);
  }
});

test('source topology constants preserve natural labels, CSS border tails and scanlines', () => {
  for (const recipe of ['soft-speaker', 'tagged-status', 'press-start-crt', 'steel-speaker']) {
    const authored = contracts[recipe];
    const unit = buildAuthored(authored, recipe);
    assert.equal(unit.label.frame.position, 'static');
    assert.equal(unit.label.frame.width, 'auto');
    assert.equal(unit.label.frame.height, 'auto');
    assert.deepEqual(unit.label.inline, {
      display: 'inline',
      marginStart: 0,
      verticalAlign: 'baseline',
    });
    assert.equal(unit.label.typography.wrap.whiteSpace, 'nowrap');
  }

  for (const [recipe, authored] of Object.entries(contracts)) {
    const unit = buildAuthored(authored, recipe);
    const tails = [];
    visitUnits(unit, (child) => {
      if (/tail-plane/u.test(child.name ?? '')) tails.push(child);
    });
    assert.ok(tails.length >= 2, `${recipe} requires layered border tails`);
    for (const tail of tails) {
      assert.equal(tail.frame.boxSizing, 'content-box');
      assert.equal(tail.frame.width, 0);
      assert.equal(tail.frame.height, 0);
      assert.ok(tail.paint.border.top.width > 0);
      assert.equal(tail.paint.border.top.style, 'solid');
    }
  }

  const pixelPanel = terminalCrtPanel(runtimeMessage, runtimeLabel, 'pixel-crt');
  const pressPanel = terminalCrtPanel(runtimeMessage, runtimeLabel, 'press-start-crt');
  const steelPanel = terminalSpeakerPanel(runtimeMessage, runtimeLabel, 'steel-speaker');
  const pixel = pixelPanel.scanlines;
  const press = pressPanel.scanlines;
  const steel = steelPanel.scanlines;
  assert.deepEqual(pixel.paint.backgrounds[0], repeatingGradient([
    pixelStop(0, '#000000'),
    pixelStop(1, 'transparent'),
    pixelStop(3, 'transparent'),
  ]));
  for (const scanlines of [press, steel]) {
    assert.deepEqual(scanlines.paint.backgrounds[0], repeatingGradient([
      pixelStop(0, 'transparent'),
      pixelStop(3, 'transparent'),
      pixelStop(3, '#000000'),
      pixelStop(4, '#000000'),
    ]));
  }
  assert.equal(steel.frame.width, 851.6);
  assert.equal(steel.frame.height, 186);
  assert.equal([pixel, press, steel].every((unit) => !Object.hasOwn(unit, 'commands')), true);

  assert.deepEqual(steelPanel.units.map((unit) => unit.constructor.kind), [
    'unit.blue-terminal.steel-label-motion',
    'unit.blue-terminal.steel-body-motion',
    'unit.blue-terminal.steel-tail-motion',
    'unit.blue-terminal.steel-corner',
    'unit.blue-terminal.steel-corner',
    'unit.blue-terminal.steel-corner',
    'unit.blue-terminal.steel-corner',
  ]);
  const steelBody = steelPanel.units[1];
  assert.deepEqual(selectFrame(steelBody.frame), frame(97.2, 614.4, 885.6, 220));
  assert.deepEqual(
    steelBody.units.map((unit) => unit.name),
    [
      'blue-terminal-steel-speaker-shadow',
      'blue-terminal-speaker-bevel',
      'blue-terminal-steel-speaker-mid-bevel',
      'blue-terminal-steel-speaker-screen',
      'blue-terminal-scanline-field',
      'blue-terminal-steel-speaker-content',
      'blue-terminal-steel-indicator-mount',
    ],
  );
  const steelLabelRail = findUnit(steelPanel, (unit) => (
    unit.name === 'blue-terminal-steel-speaker-label-rail'
  ));
  assert.deepEqual(steelLabelRail.paint.outline, {
    color: '#1a2030',
    offset: -8,
    style: 'solid',
    width: 4,
  });
  assert.equal(findUnit(steelPanel, (unit) => (
    unit.name === 'blue-terminal-steel-label-outline-fallback'
  )), undefined);

  const dotField = findUnit(pixelPanel, (unit) => unit.name === 'blue-terminal-crt-dot-field');
  assert.ok(dotField instanceof Box);
  assert.equal(Object.hasOwn(dotField, 'commands'), false);
  assert.deepEqual(dotField.paint.backgrounds[0], {
    blendMode: 'normal',
    kind: 'radial-gradient',
    position: { x: '50%', y: '50%' },
    shape: 'circle',
    stops: [
      pixelStop(1, 'rgba(30,60,180,0.18)'),
      pixelStop(1, 'transparent'),
    ],
    tile: {
      position: { x: 0, y: 0 },
      repeat: 'repeat',
      size: { width: 10, height: 10 },
    },
  });
});

test('all authored affordances use ordered inline Text ownership and standard driver spans', () => {
  const React = {
    createElement(type, props, ...children) {
      return { children, props: props ?? {}, type };
    },
  };
  for (const [recipe, authored] of Object.entries(contracts)) {
    const unit = new authored.UnitClass(
      new Text(runtimeMessage),
      new Text(runtimeLabel),
      new TerminalCursor(runtimeCursorGlyph, recipe),
      new TerminalIndicator(runtimeIndicatorGlyph, recipe),
      recipe,
    );
    const expectedInline = recipe === 'bevel-status' || recipe === 'press-start-crt'
      ? [unit.cursor, unit.indicator]
      : [unit.cursor];
    assert.deepEqual(unit.message.units, expectedInline, `${recipe} inline order`);
    expectedInline.forEach((child) => assert.equal(child.parent, unit.message));
    assert.equal(unit.cursor.inline.display, unit.cursor.anchor.shape === 'block' ? 'inline-block' : 'inline');
    assert.equal(unit.cursor.inline.marginStart, unit.cursor.anchor.margin);
    assert.equal(
      unit.indicator.parent === unit.message,
      unit.indicator.anchor.kind === 'inline-end',
    );

    const output = createReactDriver(React).render(new Composition(unit, {
      duration: authored.duration,
      fps: 60,
      height: 1920,
      width: 1080,
    }), { frame: 0 });
    const messageNode = findReact(output, (node) => node.children?.[0] === runtimeMessage)[0];
    assert.ok(messageNode, `${recipe} runtime message node`);
    assert.equal(messageNode.children[1].type, 'span');
    assert.equal(messageNode.children[1].children[0], runtimeCursorGlyph);
    assert.equal(messageNode.children[1].props.style.position, 'static');
    if (expectedInline.length === 2) {
      assert.equal(messageNode.children[2].type, 'span');
      assert.equal(messageNode.children[2].children[0], runtimeIndicatorGlyph);
    }
  }
});

test('all 1680 authored frames obey exact laws, stay finite and roll back', () => {
  let framesChecked = 0;
  for (const [recipe, authored] of Object.entries(contracts)) {
    const unit = buildAuthored(authored, recipe);
    const composition = new Composition(unit, {
      background: '#000000',
      duration: authored.duration,
      fps: 60,
      height: 1920,
      width: 1080,
    });
    const baselines = new Map();
    visitUnits(composition, (child) => baselines.set(child, structuredClone(publicState(child))));

    for (let authoredFrame = 0; authoredFrame < authored.duration; authoredFrame += 1) {
      framesChecked += 1;
      const projection = projectFrame(composition, context(authored.duration, authoredFrame));
      const visible = expectedCharacters(recipe, runtimeMessage.length, authoredFrame);
      const complete = visible >= runtimeMessage.length;
      assert.equal(
        projection.stateOf(unit.message).text,
        runtimeMessage.slice(0, visible),
        `${recipe} text at ${authoredFrame}`,
      );

      for (const target of unit.transitTargets) {
        const role = terminalTransitTarget(target, 'test').role;
        assertTransit(
          projection.stateOf(target),
          expectedTransit(recipe, role, authoredFrame),
          `${recipe}:${role} at ${authoredFrame}`,
        );
      }

      const cursor = expectedCursor(recipe, complete, authoredFrame);
      const cursorState = projection.stateOf(unit.cursor);
      assert.equal(cursorState.present, cursor.present, `${recipe} cursor present at ${authoredFrame}`);
      assert.equal(cursorState.opacity, cursor.opacity, `${recipe} cursor opacity at ${authoredFrame}`);

      const indicator = expectedIndicator(recipe, complete, authoredFrame);
      const indicatorState = projection.stateOf(unit.indicator);
      assert.equal(indicatorState.present, indicator.present, `${recipe} indicator present at ${authoredFrame}`);
      assert.equal(indicatorState.opacity, indicator.opacity, `${recipe} indicator opacity at ${authoredFrame}`);
      assert.equal(indicatorState.paint.color, indicator.color, `${recipe} indicator color at ${authoredFrame}`);
      close(indicatorState.pose.y, indicator.y, `${recipe} indicator y at ${authoredFrame}`);
      close(
        projection.stateOf(unit.scanlines).opacity,
        expectedScanlines(recipe, authoredFrame),
        `${recipe} scanlines at ${authoredFrame}`,
      );

      visitUnits(composition, (child) => {
        assert.ok(projection.has(child));
        finiteData(projection.stateOf(child), `${recipe} frame ${authoredFrame}`);
      });
    }

    for (const [child, baseline] of baselines) {
      assert.deepEqual(publicState(child), baseline, `${recipe} rollback ${child.constructor.kind}`);
    }
    const repeated = projectFrame(composition, context(authored.duration, authored.duration - 1));
    const repeatedAgain = projectFrame(composition, context(authored.duration, authored.duration - 1));
    assert.deepEqual(
      repeated.stateOf(unit.message),
      repeatedAgain.stateOf(unit.message),
      `${recipe} repeated projection`,
    );
  }
  assert.equal(framesChecked, 1680);
  assert.equal(Object.values(contracts).reduce((sum, entry) => sum + entry.duration, 0), 1680);
});

test('blue terminal keeps font roles semantic and leaves font resources to the host', async () => {
  const source = await readFile(
    new URL('../../../src/units/blue-terminal/terminalTypography.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /Press Start 2P/u);
  assert.match(source, /Nunito/u);
  assert.doesNotMatch(source, /assets\/fonts|memory-fonts|FontFace|loadMemoryFonts/u);
});

test('blue family has no generic owner lookup, positional child lookup or private literal', async () => {
  const files = [
    '../../../src/units/blue-terminal/terminalTypography.js',
    '../../../src/units/blue-terminal/terminalSemantics.js',
    '../../../src/units/blue-terminal/TerminalScanlineField.js',
    '../../../src/units/blue-terminal/TerminalAffordances.js',
    '../../../src/units/blue-terminal/TerminalCrtPanel.js',
    '../../../src/units/blue-terminal/TerminalSpeakerPanel.js',
    '../../../src/units/blue-terminal/TerminalStatusPanel.js',
    '../../../src/behaviours/blue-terminal/TerminalTextCadence.js',
    '../../../src/behaviours/blue-terminal/TerminalPanelTransit.js',
    '../../../src/behaviours/blue-terminal/TerminalCursorCadence.js',
    '../../../src/behaviours/blue-terminal/TerminalIndicatorCadence.js',
    '../../../src/behaviours/blue-terminal/TerminalScanlineCadence.js',
    '../../../src/compositions/BlueTerminalPanels.js',
  ];
  const contents = await Promise.all(files.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  const source = contents.join('\n');
  assert.doesNotMatch(source, /requireOwnerKind\(\s*unit\s*,\s*['"]unit\.(?:text|box|layer)['"]/u);
  assert.doesNotMatch(source, /\.(?:units|children)\s*\[/u);
  assert.doesNotMatch(source, /https?:|workspace|prompt|[a-f0-9]{40,}/iu);
  assert.doesNotMatch(source, /\bW7C\d+\b/u);
});

function contract(builder, UnitClass, startFrame, duration, options) {
  return Object.freeze({ builder, UnitClass, duration, startFrame, ...options });
}

function buildAuthored(authored, recipe) {
  return authored.builder(
    runtimeMessage,
    runtimeLabel,
    recipe,
    runtimeCursorGlyph,
    runtimeIndicatorGlyph,
  );
}

function typography(family, size, weight, lineHeight, letterSpacing) {
  return Object.freeze({ family, letterSpacing, lineHeight, size, weight });
}

function frame(x, y, width, height) {
  return Object.freeze({ height, width, x, y });
}

function selectFrame(value) {
  if (value.position === 'static') {
    return { height: value.height, position: value.position, width: value.width };
  }
  return { height: value.height, width: value.width, x: value.x, y: value.y };
}

function expectedCharacters(recipe, length, authoredFrame) {
  let visible;
  if (recipe === 'pixel-crt') visible = Math.floor(length * clamp(authoredFrame / 108));
  else if (recipe === 'soft-speaker') visible = Math.floor((Math.max(0, authoredFrame - 4) / 60) * 22);
  else if (recipe === 'bevel-status' || recipe === 'steel-speaker') visible = Math.floor((authoredFrame / 60) * 28);
  else if (recipe === 'tagged-status') visible = Math.floor(authoredFrame * 1.7);
  else visible = Math.floor((authoredFrame / 60) * 18);
  return Math.min(length, visible);
}

function expectedTransit(recipe, role, authoredFrame) {
  if (recipe === 'pixel-crt') {
    const entrance = springValue({ frame: authoredFrame, fps: 60, config: { damping: 20, stiffness: 120 } });
    return transit(
      entrance * (1 - progress(authoredFrame, 130, 24)),
      lerp(0.85, 1, entrance),
      lerp(0.85, 1, entrance),
      0,
    );
  }
  if (recipe === 'soft-speaker') {
    return transit(
      progress(authoredFrame, 0, 8),
      1,
      1,
      lerp(30, 0, easeOutCubic(progress(authoredFrame, 0, 10))),
    );
  }
  if (recipe === 'bevel-status') {
    return transit(
      progress(authoredFrame, 0, 6),
      1,
      lerp(0.1, 1, easeOutCubic(progress(authoredFrame, 0, 8))),
      0,
    );
  }
  if (recipe === 'tagged-status') {
    return transit(
      easeOutCubic(progress(authoredFrame, 0, 8)),
      1,
      lerp(0.05, 1, easeOutCubic(progress(authoredFrame, 0, 10))),
      0,
    );
  }
  if (recipe === 'steel-speaker') {
    const entrance = easeOutCubic(progress(authoredFrame, 0, 12));
    const opacity = entrance < 0.4 ? entrance / 0.4 : 1;
    if (role === 'steel-scene') {
      return transit(1 - progress(authoredFrame, 345, 10), 1, 1, 0);
    }
    const scaleY = lerp(0.05, 1, entrance);
    if (role === 'steel-tail') return transit(opacity, 1, 1, 220 * (scaleY - 1));
    if (role.startsWith('steel-corner')) return transit(opacity * 0.8, 1, scaleY, 0);
    return transit(opacity, 1, scaleY, 0);
  }
  return transit(1, 1, 1, 0);
}

function expectedCursor(recipe, complete, authoredFrame) {
  if (recipe === 'pixel-crt') {
    const visible = !complete || Math.floor(authoredFrame / 21) % 2 === 0;
    return { opacity: Number(visible), present: visible };
  }
  if (recipe === 'soft-speaker') {
    const visible = !complete || Math.floor(authoredFrame / 18) % 2 === 0;
    return { opacity: Number(visible), present: visible };
  }
  if (recipe === 'bevel-status') return { opacity: 0, present: !complete };
  const period = recipe === 'tagged-status' ? 14 : recipe === 'press-start-crt' ? 8 : 5;
  return {
    opacity: Number(!complete && Math.floor(authoredFrame / period) % 2 === 0),
    present: !complete,
  };
}

function expectedIndicator(recipe, complete, authoredFrame) {
  if (!complete || recipe === 'soft-speaker') return indicator(false, 0, offColor(recipe), 0);
  if (recipe === 'pixel-crt') {
    const bright = ((Math.sin(authoredFrame * 0.15) + 1) / 2) > 0.65;
    return indicator(true, 1, bright ? '#aaccff' : '#4466aa', 0);
  }
  if (recipe === 'bevel-status') {
    const blink = Math.floor(authoredFrame / 24) % 2 === 0;
    return indicator(blink, Number(blink), '#a0c8ff', 0);
  }
  if (recipe === 'tagged-status') {
    const bright = Math.floor(authoredFrame / 14) % 2 === 0;
    return indicator(true, 1, bright ? '#88aaff' : '#4466cc', bright ? -3 : 0);
  }
  if (recipe === 'press-start-crt') {
    return indicator(true, Number(Math.floor(authoredFrame / 8) % 2 === 0), '#ffe080', -2);
  }
  return indicator(true, Number(Math.floor(authoredFrame / 10) % 2 === 0), '#ffffff', 0);
}

function offColor(recipe) {
  if (recipe === 'pixel-crt') return '#4466aa';
  if (recipe === 'bevel-status') return '#a0c8ff';
  if (recipe === 'tagged-status') return '#4466cc';
  if (recipe === 'press-start-crt') return '#ffe080';
  if (recipe === 'steel-speaker') return '#ffffff';
  return 'transparent';
}

function expectedScanlines(recipe, authoredFrame) {
  if (recipe === 'pixel-crt') return 0.04 + (Math.sin(authoredFrame * 0.2) * 0.01);
  if (recipe === 'press-start-crt') return 0.10;
  if (recipe === 'steel-speaker') return 0.18;
  return 0;
}

function transit(opacity, scaleX, scaleY, y) {
  return { opacity, scaleX, scaleY, y };
}

function indicator(present, opacity, color, y) {
  return { color, opacity, present, y };
}

function assertTransit(actual, expected, location) {
  close(actual.opacity, expected.opacity, `${location} opacity`);
  close(actual.pose.scaleX, expected.scaleX, `${location} scaleX`);
  close(actual.pose.scaleY, expected.scaleY, `${location} scaleY`);
  close(actual.pose.y, expected.y, `${location} y`);
}

function assertTypography(actual, expected, location) {
  assert.equal(actual.family, expected.family, `${location} family`);
  assert.equal(actual.size, expected.size, `${location} size`);
  assert.equal(actual.weight, expected.weight, `${location} weight`);
  assert.equal(actual.lineHeight, expected.lineHeight, `${location} lineHeight`);
  assert.equal(actual.letterSpacing, expected.letterSpacing, `${location} letterSpacing`);
}

function behaviourKinds(unit) {
  return unit.behaviours.map((behaviour) => behaviour.constructor.kind);
}

function treeBehaviourKinds(root) {
  const kinds = [];
  visitUnits(root, (unit) => kinds.push(...behaviourKinds(unit)));
  return kinds;
}

function publicState(unit) {
  const state = {};
  for (const [key, value] of Object.entries(unit)) state[key] = value;
  return state;
}

function repeatingGradient(stops) {
  return {
    angle: 0,
    blendMode: 'normal',
    kind: 'linear-gradient',
    repeating: true,
    stops,
  };
}

function pixelStop(offset, color) {
  return { color, offset, unit: 'px' };
}

function findUnit(root, predicate) {
  let found;
  visitUnits(root, (unit) => {
    if (found === undefined && predicate(unit)) found = unit;
  });
  return found;
}

function findReact(root, predicate, found = []) {
  if (!root || typeof root !== 'object') return found;
  if (predicate(root)) found.push(root);
  for (const child of root.children ?? []) findReact(child, predicate, found);
  return found;
}

function context(duration, authoredFrame) {
  return { duration, fps: 60, frame: authoredFrame, height: 1920, width: 1080 };
}

function finiteData(value, location) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${location} must be finite`);
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => finiteData(entry, `${location}[${index}]`));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => finiteData(entry, `${location}.${key}`));
  }
}

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} !== ${expected}`);
}

function clamp(value) {
  return Math.min(1, Math.max(0, value));
}

function assertGuardFree(builder) {
  const forbidden = /\b(?:if|else|switch|case|throw|try|catch|finally|typeof|instanceof|for|while|do)\b|\?|&&|\|\|/u;
  assert.doesNotMatch(builder.toString(), forbidden);
}
