import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';
import { textInline } from '@cut3/agent-memory/units/base/visual';
import { TerminalScanlineField } from '@cut3/agent-memory/units/blue-terminal/TerminalScanlineField';
import {
  SOFT_SPEAKER_BODY_TYPOGRAPHY,
  SOFT_SPEAKER_LABEL_TYPOGRAPHY,
  STEEL_SPEAKER_BODY_TYPOGRAPHY,
  STEEL_SPEAKER_LABEL_TYPOGRAPHY,
} from '@cut3/agent-memory/units/blue-terminal/terminalTypography';
import {
  registerTerminalTextTarget,
  registerTerminalTransitTarget,
} from '@cut3/agent-memory/units/blue-terminal/terminalSemantics';

const BUILDERS = Object.freeze({
  'soft-speaker': softSpeaker,
  'steel-speaker': steelSpeaker,
});

/** Runtime-labelled left-tail dialogue panels with two distinct authored bevel systems. */
export class TerminalSpeakerPanel extends CompositionPivot {
  static kind = 'unit.blue-terminal.speaker-panel';

  #cursor;

  #indicator;

  #label;

  #message;

  #scanlines;

  #transitTargets;

  constructor(message, label, cursor, indicator, recipe) {
    requirePanelInputs(message, label, cursor, indicator, 'TerminalSpeakerPanel');
    const build = BUILDERS[String(recipe)];
    if (!build) throw new TypeError('TerminalSpeakerPanel recipe is not authored');
    const authored = build(message, label, cursor, indicator);
    super(authored.roots[0], {
      name: 'blue-terminal-speaker-motion',
      x: authored.pivot.x,
      y: authored.pivot.y,
    });
    authored.roots.slice(1).forEach((root) => this.addUnit(root));
    this.#cursor = authored.cursor;
    this.#indicator = authored.indicator;
    this.#label = label;
    this.#message = message;
    this.#scanlines = authored.scanlines;
    const transitTargets = [
      ...(authored.sceneRole ? [{ role: authored.sceneRole, unit: this }] : []),
      ...(authored.transitTargets ?? [{ role: 'panel', unit: this }]),
    ];
    this.#transitTargets = Object.freeze(transitTargets.map(({ unit }) => unit));
    this.recipe = String(recipe);
    registerTerminalTextTarget(message, this.recipe);
    transitTargets.forEach(({ role, unit }) => {
      registerTerminalTransitTarget(unit, this.recipe, role);
    });
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

function softSpeaker(message, label, cursor, indicator) {
  const left = 130;
  const top = 672;
  const width = 820;
  const height = 170;

  styleText(message, {
    color: '#ffffff',
    frame: { x: 166, y: 700, width: 748, height: 114, z: 30 },
    shadows: [
      { x: 2, y: 2, blur: 0, color: '#000000' },
      { x: 3, y: 3, blur: 0, color: 'rgba(0,0,0,0.6)' },
    ],
    typography: SOFT_SPEAKER_BODY_TYPOGRAPHY,
  });
  styleText(label, {
    color: '#ffe87c',
    frame: { position: 'static', width: 'auto', height: 'auto' },
    shadows: [],
    typography: SOFT_SPEAKER_LABEL_TYPOGRAPHY,
    inline: { display: 'inline', marginStart: 0, verticalAlign: 'baseline' },
    wrap: { whiteSpace: 'nowrap', wordBreak: 'normal' },
  });
  message.add(cursor);

  const body = new Box(undefined, {
    effects: { boxShadows: [
      insetShadow(6, 6, '#a0b8ff'),
      insetShadow(-6, -6, '#3050c0'),
      insetShadow(12, 12, 'rgba(180,200,255,0.08)'),
      outerShadow(6, 6, '#000000'),
      outerShadow(9, 9, 'rgba(0,0,0,0.4)'),
    ] },
    frame: { x: left, y: top, width, height, z: 3 },
    paint: {
      fill: '#0a0a2e',
      border: { all: { width: 6, style: 'solid', color: '#d0d8ff' } },
    },
    name: 'blue-terminal-soft-speaker-body',
  });
  const inner = new Box(undefined, {
    frame: { x: left + 10, y: top + 10, width: width - 20, height: height - 20, z: 5 },
    paint: {
      fill: 'transparent',
      border: { all: { width: 2, style: 'solid', color: '#3050c0' } },
    },
    name: 'blue-terminal-soft-speaker-inner-rule',
  });
  const labelRail = new Layout(label, {
    effects: { boxShadows: [
      insetShadow(6, 6, '#a0b8ff'),
      insetShadow(-6, -6, '#3050c0'),
      outerShadow(4, 4, '#000000'),
    ] },
    frame: { x: 154, y: 642, width: 'auto', height: 'auto', z: 32 },
    layout: {
      align: 'start',
      justify: 'start',
      padding: { top: 2, right: 18, bottom: 2, left: 18 },
    },
    paint: {
      fill: '#0a0a2e',
      border: { all: { width: 6, style: 'solid', color: '#d0d8ff' } },
    },
    name: 'blue-terminal-soft-speaker-label-rail',
  });
  const tailOuter = asymmetricTail(210, 836, 38, 22.8, 38, '#d0d8ff', 4, true);
  const tailInner = asymmetricTail(217, 840, 30, 19, 30, '#0a0a2e', 5, false);
  const scanlines = new TerminalScanlineField('soft-speaker', {
    x: left,
    y: top,
    width,
    height,
    z: 25,
  });
  const layer = new Layer(body, fullLayer());
  layer.add(
    inner,
    labelRail,
    tailOuter,
    tailInner,
    message,
    indicator,
    scanlines,
  );
  return {
    cursor,
    indicator,
    label,
    message,
    pivot: { x: left, y: top },
    roots: [layer],
    scanlines,
  };
}

function steelSpeaker(message, label, cursor, indicator) {
  const left = 97.2;
  const top = 614.4;
  const width = 885.6;
  const height = 220;

  styleText(message, {
    color: '#ffffff',
    frame: { position: 'static', width: 'auto', height: 'auto' },
    shadows: [
      { x: 2, y: 2, blur: 0, color: '#000000' },
      { x: -1, y: 0, blur: 0, color: '#000000' },
      { x: 0, y: -1, blur: 0, color: '#000000' },
    ],
    typography: STEEL_SPEAKER_BODY_TYPOGRAPHY,
  });
  styleText(label, {
    color: '#ffcc44',
    frame: { position: 'static', width: 'auto', height: 'auto' },
    shadows: [
      { x: 2, y: 2, blur: 0, color: '#000000' },
      { x: -1, y: -1, blur: 0, color: '#000000' },
    ],
    typography: STEEL_SPEAKER_LABEL_TYPOGRAPHY,
    inline: { display: 'inline', marginStart: 0, verticalAlign: 'baseline' },
    wrap: { whiteSpace: 'nowrap', wordBreak: 'normal' },
  });
  message.add(cursor);

  const labelMotion = new SteelSpeakerLabelMotion(label);
  const bodyMotion = new SteelSpeakerBodyMotion(message, cursor, indicator);
  const tailMotion = new SteelSpeakerTailMotion();
  const topLeftCorner = new SteelSpeakerCorner(left + 2, top + 2, '0%');
  const topRightCorner = new SteelSpeakerCorner(left + width - 14, top + 2, '0%');
  const bottomLeftCorner = new SteelSpeakerCorner(left + 2, top + height - 14, '100%');
  const bottomRightCorner = new SteelSpeakerCorner(left + width - 14, top + height - 14, '100%');
  const corners = [topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner];
  return {
    cursor,
    indicator,
    label,
    message,
    pivot: { x: 0, y: 0 },
    roots: [labelMotion, bodyMotion, tailMotion, ...corners],
    scanlines: bodyMotion.scanlines,
    sceneRole: 'steel-scene',
    transitTargets: [
      { role: 'steel-label', unit: labelMotion },
      { role: 'steel-body', unit: bodyMotion },
      { role: 'steel-tail', unit: tailMotion },
      { role: 'steel-corner-top', unit: topLeftCorner },
      { role: 'steel-corner-top', unit: topRightCorner },
      { role: 'steel-corner-bottom', unit: bottomLeftCorner },
      { role: 'steel-corner-bottom', unit: bottomRightCorner },
    ],
  };
}

class SteelSpeakerLabelMotion extends Layer {
  static kind = 'unit.blue-terminal.steel-label-motion';

  constructor(label) {
    const rail = new Layout(label, {
      effects: { boxShadows: [
        insetShadow(3, 3, '#c8d8f0'),
        insetShadow(-3, -3, '#1a2030'),
        outerShadow(4, 4, '#1a2030'),
      ] },
      frame: { position: 'static', width: 'auto', height: 'auto' },
      layout: {
        align: 'start',
        justify: 'start',
        padding: { top: 4, right: 18, bottom: 4, left: 14 },
      },
      paint: {
        fill: '#0a0e1f',
        border: { all: { width: 4, style: 'solid', color: '#c8d8f0' } },
        outline: { width: 4, style: 'solid', color: '#1a2030', offset: -8 },
      },
      name: 'blue-terminal-steel-speaker-label-rail',
    });
    super(rail, {
      frame: { x: 115.2, y: 570.4, width: 'auto', height: 'auto', z: 40 },
      pose: { origin: { x: '50%', y: '100%', z: 0 } },
      name: 'blue-terminal-steel-label-motion',
    });
  }
}

class SteelSpeakerBodyMotion extends Layer {
  static kind = 'unit.blue-terminal.steel-body-motion';

  #scanlines;

  constructor(message, cursor, indicator) {
    const shadow = new Box(undefined, {
      effects: { boxShadows: [outerShadow(6, 6, '#000000')] },
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      paint: { fill: '#1a2030' },
      name: 'blue-terminal-steel-speaker-shadow',
    });
    const outer = edgeBox(0, 0, '100%', '100%', 8, '#c8d8f0', '#1a2030', 2);
    outer.paint = { ...outer.paint, fill: 'transparent' };
    const mid = new Box(undefined, {
      frame: { x: 8, y: 8, right: 8, bottom: 8, z: 3 },
      paint: {
        fill: '#3a4a6a',
        border: {
          top: { width: 4, style: 'solid', color: '#aab8cc' },
          left: { width: 4, style: 'solid', color: '#aab8cc' },
          right: { width: 4, style: 'solid', color: '#0a0e20' },
          bottom: { width: 4, style: 'solid', color: '#0a0e20' },
        },
      },
      name: 'blue-terminal-steel-speaker-mid-bevel',
    });
    const screen = new Box(undefined, {
      frame: { x: 12, y: 12, right: 12, bottom: 12, z: 4 },
      paint: {
        fill: '#0a0e1f',
        border: {
          top: { width: 5, style: 'solid', color: '#1a2030' },
          left: { width: 5, style: 'solid', color: '#1a2030' },
          right: { width: 5, style: 'solid', color: '#c8d8f0' },
          bottom: { width: 5, style: 'solid', color: '#c8d8f0' },
        },
      },
      name: 'blue-terminal-steel-speaker-screen',
    });
    const scanlines = new TerminalScanlineField('steel-speaker', {
      x: 17,
      y: 17,
      width: 851.6,
      height: 186,
      z: 30,
    });
    const content = new Layout(message, {
      frame: { x: 17, y: 17, right: 17, bottom: 17, z: 35 },
      layout: {
        align: 'center',
        justify: 'start',
        padding: { top: 18, right: 22, bottom: 18, left: 22 },
      },
      name: 'blue-terminal-steel-speaker-content',
    });
    const indicatorMount = new Box(indicator, {
      frame: { right: 20, bottom: 12, width: 20, height: 14, z: 42 },
      name: 'blue-terminal-steel-indicator-mount',
    });
    super(shadow, {
      frame: { x: 97.2, y: 614.4, width: 885.6, height: 220, z: 2 },
      pose: { origin: { x: '50%', y: '0%', z: 0 } },
      name: 'blue-terminal-steel-body-motion',
    });
    this.add(outer, mid, screen, scanlines, content, indicatorMount);
    this.#scanlines = scanlines;
  }

  get scanlines() {
    return this.#scanlines;
  }
}

class SteelSpeakerTailMotion extends Layer {
  static kind = 'unit.blue-terminal.steel-tail-motion';

  constructor() {
    const shadow = leftTail(4, 4, 36, 32, '#000000', 1);
    const outer = leftTail(0, 0, 36, 32, '#1a2030', 2);
    const mid = leftTail(4, 0, 30, 28, '#3a4a6a', 3);
    const inner = leftTail(7, 0, 24, 24, '#0a0e1f', 4);
    super(shadow, {
      frame: { x: 177.2, y: 832.4, width: 0, height: 0, z: 5 },
      pose: { origin: { x: '0%', y: '0%', z: 0 } },
      name: 'blue-terminal-steel-tail-motion',
    });
    this.add(outer, mid, inner);
  }
}

class SteelSpeakerCorner extends Box {
  static kind = 'unit.blue-terminal.steel-corner';

  constructor(x, y, originY) {
    super(undefined, {
      effects: { boxShadows: [outerShadow(1, 1, '#1a2030')] },
      frame: { x, y, width: 12, height: 12, z: 38 },
      opacity: 0.8,
      paint: { fill: '#c8d8f0' },
      pose: { origin: { x: '50%', y: originY, z: 0 } },
      name: 'blue-terminal-steel-speaker-corner',
    });
  }
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
  unit.frame = { ...unit.frame, ...options.frame };
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
    name: 'blue-terminal-speaker-layer',
  };
}

function insetShadow(x, y, color) {
  return { x, y, blur: 0, spread: 0, color, inset: true };
}

function outerShadow(x, y, color) {
  return { x, y, blur: 0, spread: 0, color, inset: false };
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
    name: 'blue-terminal-speaker-bevel',
  });
}

function asymmetricTail(x, y, left, right, top, fill, z, shadow) {
  return borderTriangle(x, y, left, right, top, fill, z, shadow);
}

function leftTail(x, y, right, top, fill, z) {
  return borderTriangle(x, y, 0, right, top, fill, z, false);
}

function borderTriangle(x, y, left, right, top, fill, z, shadow) {
  const hidden = { width: 0, style: 'none', color: 'transparent' };
  return new Box(undefined, {
    effects: { filters: shadow ? [{
      kind: 'drop-shadow',
      x: 3,
      y: 3,
      blur: 0,
      color: '#000000',
    }] : [] },
    frame: { boxSizing: 'content-box', x, y, width: 0, height: 0, z },
    paint: { border: {
      top: { width: top, style: 'solid', color: fill },
      right: { width: right, style: right === 0 ? 'none' : 'solid', color: 'transparent' },
      bottom: hidden,
      left: { width: left, style: left === 0 ? 'none' : 'solid', color: 'transparent' },
    } },
    name: 'blue-terminal-speaker-tail-plane',
  });
}

function corner(x, y, originY) {
  return new Box(undefined, {
    effects: { boxShadows: [outerShadow(1, 1, '#1a2030')] },
    frame: { x, y, width: 12, height: 12, z: 38 },
    opacity: 0.8,
    paint: { fill: '#c8d8f0' },
    pose: { origin: { x: '50%', y: originY, z: 0 } },
    name: 'blue-terminal-steel-speaker-corner',
  });
}
