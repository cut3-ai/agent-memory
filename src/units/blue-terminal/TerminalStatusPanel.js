import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';
import { textInline } from '@cut3/agent-memory/units/base/visual';
import { TerminalScanlineField } from '@cut3/agent-memory/units/blue-terminal/TerminalScanlineField';
import {
  BEVEL_STATUS_BODY_TYPOGRAPHY,
  TAGGED_STATUS_BODY_TYPOGRAPHY,
  TAGGED_STATUS_LABEL_TYPOGRAPHY,
} from '@cut3/agent-memory/units/blue-terminal/terminalTypography';
import {
  registerTerminalTextTarget,
  registerTerminalTransitTarget,
} from '@cut3/agent-memory/units/blue-terminal/terminalSemantics';

const BUILDERS = Object.freeze({
  'bevel-status': bevelStatus,
  'tagged-status': taggedStatus,
});

/** Runtime status copy in authored dark-blue bevel and tagged panel systems. */
export class TerminalStatusPanel extends CompositionPivot {
  static kind = 'unit.blue-terminal.status-panel';

  #cursor;

  #indicator;

  #label;

  #message;

  #scanlines;

  #transitTargets;

  constructor(message, label, cursor, indicator, recipe) {
    requirePanelInputs(message, label, cursor, indicator, 'TerminalStatusPanel');
    const build = BUILDERS[String(recipe)];
    if (!build) throw new TypeError('TerminalStatusPanel recipe is not authored');
    const authored = build(message, label, cursor, indicator);
    super(authored.layer, {
      name: 'blue-terminal-status-motion',
      x: authored.pivot.x,
      y: authored.pivot.y,
    });
    this.#cursor = authored.cursor;
    this.#indicator = authored.indicator;
    this.#label = label;
    this.#message = message;
    this.#scanlines = authored.scanlines;
    const transitTargets = authored.transitTargets ?? [{ role: 'panel', unit: this }];
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

function bevelStatus(message, label, cursor, indicator) {
  const left = 97.2;
  const top = 672;
  const width = 885.6;
  const height = 210;

  styleText(message, {
    color: '#ffffff',
    frame: { x: 134.2, y: 699, width: 819.6, height: 156, z: 35 },
    shadows: [
      { x: 2, y: 2, blur: 0, color: '#000020' },
      { x: -1, y: -1, blur: 0, color: '#000020' },
    ],
    typography: BEVEL_STATUS_BODY_TYPOGRAPHY,
  });
  styleText(label, {
    color: 'transparent',
    frame: { x: 0, y: 0, width: 0, height: 0, z: 0 },
    opacity: 0,
    shadows: [],
    typography: BEVEL_STATUS_BODY_TYPOGRAPHY,
  });
  message.add(cursor, indicator);

  const outer = panelBox(left, top, width, height, '#050518', 1, 'blue-terminal-bevel-status-outer');
  const light = panelBox(left + 7, top + 7, width - 14, height - 14, '#a0a8d0', 2, 'blue-terminal-bevel-status-light');
  const offsetDark = panelBox(left + 13, top + 13, width - 20, height - 20, '#050518', 3, 'blue-terminal-bevel-status-offset-dark');
  const mid = panelBox(left + 13, top + 13, width - 26, height - 26, '#1a1a5e', 4, 'blue-terminal-bevel-status-mid');
  const topHighlight = panelBox(left + 16, top + 16, width - 32, 3, '#d0d8ff', 5, 'blue-terminal-bevel-status-top-highlight');
  topHighlight.opacity = 0.5;
  const leftHighlight = panelBox(left + 16, top + 16, 3, height - 32, '#d0d8ff', 5, 'blue-terminal-bevel-status-left-highlight');
  leftHighlight.opacity = 0.5;
  const screen = panelBox(left + 18, top + 18, width - 36, height - 36, '#0a0a2e', 6, 'blue-terminal-bevel-status-screen');
  const scanlines = new TerminalScanlineField('bevel-status', {
    x: left,
    y: top,
    width,
    height,
    z: 30,
  });
  const tailOuter = rightTail(863.6, 882, 19.2, 32, '#050518', 7);
  const tailInner = rightTail(872.8, 882, 12, 20, '#0a0a2e', 8);
  const corners = [
    corner(left + 2, top + 2, '#c8d0ff'),
    corner(left + width - 12, top + 2, '#c8d0ff'),
    corner(left + 2, top + height - 12, '#c8d0ff'),
    corner(left + width - 12, top + height - 12, '#c8d0ff'),
  ];
  const layer = new Layer(outer, fullLayer());
  layer.add(
    light,
    offsetDark,
    mid,
    topHighlight,
    leftHighlight,
    screen,
    tailOuter,
    tailInner,
    ...corners,
    message,
    label,
    scanlines,
  );
  return { cursor, indicator, label, layer, message, pivot: { x: 540, y: top }, scanlines };
}

function taggedStatus(message, label, cursor, indicator) {
  const left = 118.8;
  const top = 672;
  const width = 842.4;
  const height = 220;

  styleText(message, {
    color: '#ffffff',
    frame: { x: 158.8, y: 706, width: 762.4, height: 168, z: 35 },
    shadows: [
      { x: 2, y: 2, blur: 0, color: '#000033' },
      { x: 3, y: 3, blur: 0, color: '#000010' },
    ],
    typography: TAGGED_STATUS_BODY_TYPOGRAPHY,
  });
  styleText(label, {
    color: '#88ccff',
    frame: { position: 'static', width: 'auto', height: 'auto' },
    shadows: [{ x: 1, y: 1, blur: 0, color: '#000033' }],
    typography: TAGGED_STATUS_LABEL_TYPOGRAPHY,
    inline: { display: 'inline', marginStart: 0, verticalAlign: 'baseline' },
    wrap: { whiteSpace: 'nowrap', wordBreak: 'normal' },
  });
  message.add(cursor);

  const outer = panelBox(left, top, width, height, '#001440', 1, 'blue-terminal-tagged-status-outer');
  outer.effects = {
    ...outer.effects,
    boxShadows: [
      outerShadow(4, 4, '#000000'),
      outerShadow(-2, -2, '#000000'),
    ],
  };
  const mid = panelBox(left + 6, top + 6, width - 12, height - 12, '#7090cc', 2, 'blue-terminal-tagged-status-mid');
  const cobalt = panelBox(left + 8, top + 8, width - 12, height - 12, '#223388', 3, 'blue-terminal-tagged-status-cobalt');
  const inner = panelBox(left + 12, top + 12, width - 24, height - 24, '#0a1a5c', 4, 'blue-terminal-tagged-status-inner');
  const screen = panelBox(left + 16, top + 16, width - 32, height - 32, '#000828', 5, 'blue-terminal-tagged-status-screen');
  screen.effects = {
    ...screen.effects,
    boxShadows: [
      insetShadow(2, 2, '#000a30'),
      insetShadow(-2, -2, '#0020a0'),
    ],
  };
  const labelRail = new Layout(label, {
    effects: { boxShadows: [outerShadow(2, -2, '#000000')] },
    frame: { right: 142.8, y: 650, width: 'auto', height: 'auto', z: 42 },
    layout: {
      align: 'start',
      justify: 'start',
      padding: { top: 2, right: 14, bottom: 0, left: 14 },
    },
    paint: {
      fill: '#001440',
      border: {
        all: { width: 3, style: 'solid', color: '#7090cc' },
        bottom: { width: 3, style: 'solid', color: '#001440' },
      },
    },
    name: 'blue-terminal-tagged-status-label-rail',
  });
  const tailOuter = rightTail(867.2, 890, 38, 38, '#001440', 6);
  const tailMid = rightTail(873.2, 890, 30, 30, '#7090cc', 7);
  const tailInner = rightTail(878.2, 890, 24, 24, '#000828', 8);
  const cornerEdges = [
    cornerEdge(left + 6, top + 6, 'top-left'),
    cornerEdge(left + width - 26, top + 6, 'top-right'),
    cornerEdge(left + 6, top + height - 26, 'bottom-left'),
    cornerEdge(left + width - 26, top + height - 26, 'bottom-right'),
  ];
  const scanlines = new TerminalScanlineField('tagged-status', {
    x: left,
    y: top,
    width,
    height,
    z: 30,
  });
  const bodyLayer = new Layer(outer, fullLayer());
  bodyLayer.add(
    mid,
    cobalt,
    inner,
    screen,
    labelRail,
    ...cornerEdges,
    message,
    indicator,
    scanlines,
  );
  const bodyMotion = new CompositionPivot(bodyLayer, {
    name: 'blue-terminal-tagged-body-motion',
    x: 540,
    y: top,
  });
  const tailLayer = new Layer(tailOuter, fullLayer());
  tailLayer.add(tailMid, tailInner);
  const tailMotion = new CompositionPivot(tailLayer, {
    name: 'blue-terminal-tagged-tail-motion',
    x: 897.2,
    y: 890,
  });
  const layer = new Layer(tailMotion, fullLayer());
  layer.add(bodyMotion);
  return {
    cursor,
    indicator,
    label,
    layer,
    message,
    pivot: { x: 0, y: 0 },
    scanlines,
    transitTargets: [
      { role: 'tagged-tail', unit: tailMotion },
      { role: 'tagged-body', unit: bodyMotion },
    ],
  };
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
    name: 'blue-terminal-status-layer',
  };
}

function panelBox(x, y, width, height, fill, z, name) {
  return new Box(undefined, {
    frame: { x, y, width, height, z },
    paint: { fill },
    name,
  });
}

function insetShadow(x, y, color) {
  return { x, y, blur: 0, spread: 0, color, inset: true };
}

function outerShadow(x, y, color) {
  return { x, y, blur: 0, spread: 0, color, inset: false };
}

function rightTail(x, y, width, height, fill, z) {
  const hidden = { width: 0, style: 'none', color: 'transparent' };
  return new Box(undefined, {
    frame: { boxSizing: 'content-box', x, y, width: 0, height: 0, z },
    paint: { border: {
      top: { width: height, style: 'solid', color: fill },
      right: hidden,
      bottom: hidden,
      left: { width, style: 'solid', color: 'transparent' },
    } },
    name: 'blue-terminal-status-tail-plane',
  });
}

function corner(x, y, fill) {
  return new Box(undefined, {
    effects: { boxShadows: [outerShadow(1, 1, '#000018')] },
    frame: { x, y, width: 10, height: 10, z: 32 },
    paint: { fill },
    name: 'blue-terminal-bevel-status-corner',
  });
}

function cornerEdge(x, y, cornerName) {
  return new Box(undefined, {
    frame: { x, y, width: 20, height: 20, z: 32 },
    paint: {
      fill: 'transparent',
      border: cornerBorder(cornerName),
    },
    name: 'blue-terminal-tagged-status-corner',
  });
}

function cornerBorder(name) {
  const visible = { width: 3, style: 'solid', color: '#7090cc' };
  const hidden = { width: 0, style: 'none', color: 'transparent' };
  return {
    top: name.startsWith('top') ? visible : hidden,
    right: name.endsWith('right') ? visible : hidden,
    bottom: name.startsWith('bottom') ? visible : hidden,
    left: name.endsWith('left') ? visible : hidden,
  };
}
