import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';
import { textInline } from '@cut3/agent-memory/units/base/visual';
import { TerminalScanlineField } from '@cut3/agent-memory/units/blue-terminal/TerminalScanlineField';
import {
  PIXEL_CRT_BODY_TYPOGRAPHY,
  PIXEL_CRT_STATUS_TYPOGRAPHY,
  PRESS_START_CRT_BODY_TYPOGRAPHY,
  PRESS_START_CRT_LABEL_TYPOGRAPHY,
} from '@cut3/agent-memory/units/blue-terminal/terminalTypography';
import {
  registerTerminalTextTarget,
  registerTerminalTransitTarget,
} from '@cut3/agent-memory/units/blue-terminal/terminalSemantics';

const BUILDERS = Object.freeze({
  'pixel-crt': pixelCrt,
  'press-start-crt': pressStartCrt,
});

/** Two authored CRT dialogue systems with runtime-only copy and label Units. */
export class TerminalCrtPanel extends CompositionPivot {
  static kind = 'unit.blue-terminal.crt-panel';

  #cursor;

  #indicator;

  #label;

  #message;

  #scanlines;

  #transitTargets;

  constructor(message, label, cursor, indicator, recipe) {
    requirePanelInputs(message, label, cursor, indicator, 'TerminalCrtPanel');
    const build = BUILDERS[String(recipe)];
    if (!build) throw new TypeError('TerminalCrtPanel recipe is not authored');
    const authored = build(message, label, cursor, indicator);
    super(authored.layer, {
      name: 'blue-terminal-crt-motion',
      x: authored.pivot.x,
      y: authored.pivot.y,
    });
    this.#cursor = authored.cursor;
    this.#indicator = authored.indicator;
    this.#label = label;
    this.#message = message;
    this.#scanlines = authored.scanlines;
    this.#transitTargets = Object.freeze([this]);
    this.recipe = String(recipe);
    registerTerminalTextTarget(message, this.recipe);
    registerTerminalTransitTarget(this, this.recipe, 'panel');
  }

  get cursor() {
    return this.#cursor;
  }

  get indicator() {
    return this.#indicator;
  }

  get label() {
    return this.#label;
  }

  get message() {
    return this.#message;
  }

  get scanlines() {
    return this.#scanlines;
  }

  get transitTargets() {
    return this.#transitTargets;
  }
}

function pixelCrt(message, label, cursor, indicator) {
  const left = 89;
  const top = 710;
  const width = 820;
  const height = 220;

  styleText(message, {
    color: '#e8f0ff',
    frame: { x: 133, y: 750, width: 732, height: 140, z: 40 },
    shadows: [
      { x: 0, y: 0, blur: 10, color: '#4488ff' },
      { x: 1, y: 1, blur: 0, color: '#000022' },
    ],
    typography: PIXEL_CRT_BODY_TYPOGRAPHY,
  });
  styleText(label, {
    color: '#aaccff',
    frame: { x: 854, y: 880, width: 24, height: 20, z: 44 },
    opacity: 0,
    shadows: [{ x: 0, y: 0, blur: 8, color: '#4488ff' }],
    typography: PIXEL_CRT_STATUS_TYPOGRAPHY,
  });
  message.add(cursor);

  const shadow = new Box(undefined, {
    frame: { x: left + 8, y: top + 8, width, height, z: 1 },
    paint: { fill: 'rgba(0,0,0,0.75)' },
    name: 'blue-terminal-crt-drop-shadow',
  });
  const shell = new Box(undefined, {
    effects: { boxShadows: [
      insetShadow(5, 5, '#8ab4ff'),
      insetShadow(-5, -5, '#001055'),
      insetShadow(10, 10, '#3366cc'),
      insetShadow(-10, -10, '#000820'),
      insetShadow(15, 15, '#1a3a8a'),
      insetShadow(-15, -15, '#00051a'),
    ] },
    frame: { x: left, y: top, width, height, z: 2 },
    paint: { fill: '#050520' },
    name: 'blue-terminal-crt-six-step-shell',
  });
  const screen = new Box(undefined, {
    effects: { boxShadows: [
      insetShadow(2, 2, '#000010'),
      insetShadow(-1, -1, '#1a2a7a'),
    ] },
    frame: { x: left + 18, y: top + 18, width: 784, height: 184, z: 10 },
    paint: {
      backgrounds: [{
        kind: 'linear-gradient',
        angle: 160,
        stops: [
          { offset: 0, color: '#060625' },
          { offset: 1, color: '#03031a' },
        ],
      }],
      border: { all: { width: 2, style: 'solid', color: '#0d1a5e' } },
    },
    name: 'blue-terminal-crt-screen',
  });
  const dotField = dotTexture(left + 18, top + 18, 784, 184);
  const scanlines = new TerminalScanlineField('pixel-crt', {
    x: left,
    y: top,
    width,
    height,
    z: 42,
  });
  const tailShadow = triangle(left + 85, top + height + 3, 44, 30, 'rgba(0,0,0,0.65)', 3);
  const tailBorder = triangle(left + 80, top + height, 52, 26, '#001055', 4);
  const tailFill = triangle(left + 84, top + height, 44, 22, '#050520', 5);
  const corners = [
    corner(left + 4, top + 4, '#aaccff'),
    corner(left + width - 14, top + 4, '#aaccff'),
    corner(left + 4, top + height - 14, '#001055'),
    corner(left + width - 14, top + height - 14, '#001055'),
  ];
  const topRule = new Box(undefined, {
    frame: { x: left + 14, y: top + 4, width: width - 28, height: 3, z: 30 },
    paint: { backgrounds: [{
      kind: 'linear-gradient',
      angle: 90,
      stops: [
        { offset: 0, color: '#6699dd' },
        { offset: 0.5, color: '#aaccff' },
        { offset: 1, color: '#6699dd' },
      ],
    }] },
    name: 'blue-terminal-crt-top-rule',
  });
  const bottomRule = new Box(undefined, {
    frame: { x: left + 14, y: top + height - 7, width: width - 28, height: 3, z: 30 },
    paint: { fill: '#000820' },
    name: 'blue-terminal-crt-bottom-rule',
  });
  const layer = new Layer(shadow, fullLayer());
  layer.add(
    shell,
    screen,
    dotField,
    tailShadow,
    tailBorder,
    tailFill,
    ...corners,
    topRule,
    bottomRule,
    message,
    label,
    indicator,
    scanlines,
  );
  return { cursor, indicator, label, layer, message, pivot: { x: left, y: top }, scanlines };
}

function pressStartCrt(message, label, cursor, indicator) {
  const left = 118.8;
  const top = 576;
  const width = 842.4;
  const height = 220;

  styleText(message, {
    color: '#ffffff',
    frame: { x: 146.8, y: 600, width: 786.4, height: 172, z: 40 },
    shadows: [
      { x: 2, y: 2, blur: 0, color: '#000000' },
      { x: 1, y: 1, blur: 0, color: 'rgba(0,0,200,0.5)' },
    ],
    typography: PRESS_START_CRT_BODY_TYPOGRAPHY,
  });
  const outer = bevelBox(left, top, width, height, '#1a1a5e', 1, 'blue-terminal-press-crt-outer');
  outer.effects = {
    ...outer.effects,
    boxShadows: [
      { x: 4, y: 4, blur: 0, spread: 0, color: '#000000', inset: false },
      { x: -2, y: -2, blur: 0, spread: 0, color: '#000000', inset: false },
    ],
  };
  const highlight = bevelBox(left + 2, top + 2, width - 4, height - 4, '#c0c0ff', 2, 'blue-terminal-press-crt-highlight');
  const lightBevel = edgeBox(left + 2, top + 2, width - 4, height - 4, 5, '#c0c0ff', '#181840', 3);
  const midBevel = edgeBox(left + 7, top + 7, width - 14, height - 14, 3, '#8080d0', '#0c0c30', 4);
  const darkBevel = edgeBox(left + 10, top + 10, width - 20, height - 20, 2, '#4040a0', '#060618', 5);
  const body = bevelBox(left + 12, top + 12, width - 24, height - 24, '#0a0a2e', 6, 'blue-terminal-press-crt-body');
  styleText(label, {
    color: '#ffe080',
    frame: { position: 'static', width: 'auto', height: 'auto' },
    shadows: [
      { x: 1, y: 1, blur: 0, color: '#000000' },
      { x: 0, y: 0, blur: 8, color: '#ffaa00' },
    ],
    typography: PRESS_START_CRT_LABEL_TYPOGRAPHY,
    inline: { display: 'inline', marginStart: 0, verticalAlign: 'baseline' },
    wrap: { whiteSpace: 'nowrap', wordBreak: 'normal' },
  });
  message.add(cursor, indicator);
  const labelRail = new Layout(label, {
    effects: { boxShadows: [
      insetShadow(1, 1, '#c0c0ff'),
      insetShadow(-1, -1, '#181840'),
    ] },
    frame: { right: 136.8, y: 554, width: 'auto', height: 'auto', z: 45 },
    layout: {
      align: 'start',
      justify: 'start',
      padding: { top: 4, right: 14, bottom: 4, left: 14 },
    },
    paint: {
      fill: '#1a1a5e',
      border: {
        all: { width: 3, style: 'solid', color: '#4040a0' },
        bottom: { width: 0, style: 'none', color: 'transparent' },
      },
    },
    name: 'blue-terminal-press-crt-label-rail',
  });
  const scanlines = new TerminalScanlineField('press-start-crt', {
    x: left,
    y: top,
    width,
    height,
    z: 60,
  });
  const tailX = 783.12;
  const tailY = 789;
  const tailOuter = oneSidedTriangle(tailX, tailY, 42, 37, '#1a1a5e', 7);
  const tailMid = oneSidedTriangle(tailX + 5, tailY, 37, 32, '#4040a0', 8);
  const tailInner = oneSidedTriangle(tailX + 10, tailY, 32, 27, '#0a0a2e', 9);
  const corners = [
    corner(left + 2, top + 2, '#000000'),
    corner(left + width - 12, top + 2, '#000000'),
    corner(left + 2, top + height - 12, '#000000'),
    corner(left + width - 12, top + height - 12, '#000000'),
  ];
  const layer = new Layer(outer, fullLayer());
  layer.add(
    highlight,
    lightBevel,
    midBevel,
    darkBevel,
    body,
    tailOuter,
    tailMid,
    tailInner,
    labelRail,
    ...corners,
    message,
    scanlines,
  );
  return { cursor, indicator, label, layer, message, pivot: { x: left, y: top }, scanlines };
}

function requirePanelInputs(message, label, cursor, indicator, name) {
  requireUnit(message, `${name} message`);
  requireUnit(label, `${name} label`);
  requireUnit(cursor, `${name} cursor`);
  requireUnit(indicator, `${name} indicator`);
  requireDetachedUnit(message, `${name} message`);
  requireDetachedUnit(label, `${name} label`);
  requireDetachedUnit(cursor, `${name} cursor`);
  requireDetachedUnit(indicator, `${name} indicator`);
  const members = [message, label, cursor, indicator];
  if (
    new Set(members).size !== members.length
    || message.constructor.kind !== 'unit.text'
    || label.constructor.kind !== 'unit.text'
    || cursor.constructor.kind !== 'unit.blue-terminal.cursor'
    || indicator.constructor.kind !== 'unit.blue-terminal.indicator'
  ) {
    throw new TypeError(`${name} requires distinct runtime text and affordance Units`);
  }
}

function styleText(unit, options) {
  unit.effects = { ...unit.effects };
  unit.frame = { ...unit.frame, ...options.frame };
  unit.opacity = options.opacity ?? 1;
  if (options.inline !== undefined) unit.inline = textInline(options.inline);
  unit.paint = { ...unit.paint, color: options.color };
  unit.typography = {
    ...unit.typography,
    ...options.typography,
    shadows: options.shadows,
    wrap: {
      ...unit.typography.wrap,
      whiteSpace: options.wrap?.whiteSpace ?? 'pre-wrap',
      wordBreak: options.wrap?.wordBreak ?? 'break-word',
    },
  };
}

function fullLayer() {
  return {
    frame: { x: 0, y: 0, width: 1080, height: 1920 },
    name: 'blue-terminal-crt-layer',
  };
}

function insetShadow(x, y, color) {
  return { x, y, blur: 0, spread: 0, color, inset: true };
}

function bevelBox(x, y, width, height, fill, z, name) {
  return new Box(undefined, {
    frame: { x, y, width, height, z },
    paint: { fill },
    name,
  });
}

function edgeBox(x, y, width, height, size, light, dark, z) {
  return new Box(undefined, {
    frame: { x, y, width, height, z },
    paint: { border: {
      top: { width: size, style: 'solid', color: light },
      left: { width: size, style: 'solid', color: light },
      right: { width: size, style: 'solid', color: dark },
      bottom: { width: size, style: 'solid', color: dark },
    } },
    name: 'blue-terminal-crt-bevel-edge',
  });
}

function corner(x, y, fill) {
  return new Box(undefined, {
    frame: { x, y, width: 10, height: 10, z: 32 },
    paint: { fill },
    name: 'blue-terminal-crt-corner',
  });
}

function triangle(x, y, width, height, fill, z) {
  return borderTriangle(x, y, width / 2, width / 2, height, fill, z);
}

function oneSidedTriangle(x, y, left, top, fill, z) {
  return borderTriangle(x, y, left, 0, top, fill, z);
}

function borderTriangle(x, y, left, right, top, fill, z) {
  const hidden = { width: 0, style: 'none', color: 'transparent' };
  return new Box(undefined, {
    frame: { boxSizing: 'content-box', x, y, width: 0, height: 0, z },
    paint: { border: {
      top: { width: top, style: 'solid', color: fill },
      right: { width: right, style: right === 0 ? 'none' : 'solid', color: 'transparent' },
      bottom: hidden,
      left: { width: left, style: left === 0 ? 'none' : 'solid', color: 'transparent' },
    } },
    name: 'blue-terminal-crt-tail-plane',
  });
}

function dotTexture(x, y, width, height) {
  return new Box(undefined, {
    frame: { x, y, width, height, z: 12 },
    paint: { backgrounds: [{
      kind: 'radial-gradient',
      shape: 'circle',
      position: { x: '50%', y: '50%' },
      stops: [
        { offset: 1, unit: 'px', color: 'rgba(30,60,180,0.18)' },
        { offset: 1, unit: 'px', color: 'transparent' },
      ],
      tile: {
        position: { x: 0, y: 0 },
        repeat: 'repeat',
        size: { width: 10, height: 10 },
      },
    }] },
    name: 'blue-terminal-crt-dot-field',
  });
}
