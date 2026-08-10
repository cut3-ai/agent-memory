import { Text } from '@cut3/agent-memory/units/base/Text';
import {
  BEVEL_STATUS_BODY_TYPOGRAPHY,
  PIXEL_CRT_BODY_TYPOGRAPHY,
  PIXEL_CRT_STATUS_TYPOGRAPHY,
  PRESS_START_CRT_BODY_TYPOGRAPHY,
  SOFT_SPEAKER_BODY_TYPOGRAPHY,
  STEEL_SPEAKER_BODY_TYPOGRAPHY,
  TAGGED_STATUS_BODY_TYPOGRAPHY,
} from '@cut3/agent-memory/units/blue-terminal/terminalTypography';

const CURSORS = Object.freeze({
  'pixel-crt': cursor({
    anchor: inlineAnchor(3, 'block'),
    color: '#e8f0ff',
    fill: '#e8f0ff',
    frame: { x: 131, y: 748, width: 16, height: 22, z: 45 },
    inline: inline('inline-block', 3, 'middle'),
    shadows: [outerShadow(0, 0, 8, '#4488ff')],
    typography: PIXEL_CRT_BODY_TYPOGRAPHY,
  }),
  'soft-speaker': cursor({
    anchor: inlineAnchor(3, 'block'),
    color: '#ffffff',
    fill: '#ffffff',
    frame: { x: 166, y: 700, width: 14, height: 24, z: 40 },
    inline: inline('inline-block', 3, 'middle'),
    shadows: [outerShadow(0, 0, 0, '#000000', 2)],
    typography: SOFT_SPEAKER_BODY_TYPOGRAPHY,
  }),
  'bevel-status': cursor({
    anchor: inlineAnchor(1, 'placeholder'),
    color: '#ffffff',
    fill: 'transparent',
    frame: { x: 134.2, y: 699, width: 'auto', height: 'auto', z: 40 },
    inline: inline('inline', 1, 'baseline'),
    opacity: 0,
    typography: BEVEL_STATUS_BODY_TYPOGRAPHY,
  }),
  'tagged-status': cursor({
    anchor: inlineAnchor(2, 'block'),
    color: '#ffffff',
    fill: '#ffffff',
    frame: { x: 158.8, y: 706, width: 14, height: 26, z: 40 },
    inline: inline('inline-block', 2, 'middle'),
    shadows: [outerShadow(1, 1, 0, '#000000')],
    typography: TAGGED_STATUS_BODY_TYPOGRAPHY,
  }),
  'press-start-crt': cursor({
    anchor: inlineAnchor(0, 'glyph'),
    color: '#ffe080',
    fill: 'transparent',
    frame: { x: 146.8, y: 600, width: 'auto', height: 'auto', z: 55 },
    inline: inline('inline', 0, 'baseline'),
    typography: PRESS_START_CRT_BODY_TYPOGRAPHY,
  }),
  'steel-speaker': cursor({
    anchor: inlineAnchor(3, 'block'),
    color: '#ffffff',
    fill: '#ffffff',
    frame: { position: 'static', width: 14, height: 24, z: 42 },
    inline: inline('inline-block', 3, 'middle'),
    typography: STEEL_SPEAKER_BODY_TYPOGRAPHY,
  }),
});

const INDICATORS = Object.freeze({
  'pixel-crt': indicator({
    anchor: cornerAnchor(32, 22),
    color: '#aaccff',
    frame: { x: 867, y: 901, width: 'auto', height: 'auto', z: 45 },
    shadows: [textShadow(0, 0, 8, '#4488ff')],
    typography: PIXEL_CRT_STATUS_TYPOGRAPHY,
  }),
  'soft-speaker': indicator({
    anchor: cornerAnchor(0, 0),
    color: 'transparent',
    frame: { x: 0, y: 0, width: 0, height: 0, z: 40 },
  }),
  'bevel-status': indicator({
    anchor: inlineAnchor(2, 'glyph'),
    color: '#a0c8ff',
    frame: { x: 134.2, y: 699, width: 'auto', height: 'auto', z: 40 },
    inline: inline('inline', 2, 'baseline'),
    shadows: [textShadow(0, 0, 6, '#6090ff')],
    typography: {
      ...BEVEL_STATUS_BODY_TYPOGRAPHY,
      size: 22,
    },
  }),
  'tagged-status': indicator({
    anchor: cornerAnchor(22, 14),
    color: '#88aaff',
    frame: { x: 919.2, y: 864, width: 'auto', height: 'auto', z: 40 },
    shadows: [textShadow(1, 1, 0, '#000033')],
    typography: {
      family: 'serif',
      letterSpacing: 0,
      lineHeight: 'normal',
      size: 22,
      weight: 900,
    },
  }),
  'press-start-crt': indicator({
    anchor: inlineAnchor(4, 'glyph'),
    color: '#ffe080',
    frame: { x: 915.2, y: 753, width: 'auto', height: 'auto', z: 55 },
    inline: inline('inline-block', 4, 'baseline'),
    typography: {
      ...PRESS_START_CRT_BODY_TYPOGRAPHY,
      size: 13,
    },
  }),
  'steel-speaker': indicator({
    anchor: cornerAnchor(20, 12),
    color: '#ffffff',
    fill: 'transparent',
    frame: { boxSizing: 'content-box', position: 'static', width: 0, height: 0, z: 42 },
    border: triangleBorder(10, 14, '#ffffff'),
    filters: [{
      kind: 'drop-shadow',
      x: 1,
      y: 1,
      blur: 0,
      color: '#000000',
    }],
  }),
});

/** Runtime cursor glyph or authored block surface with an explicit inline-end contract. */
export class TerminalCursor extends Text {
  static kind = 'unit.blue-terminal.cursor';

  constructor(glyph, recipe) {
    const authored = CURSORS[String(recipe)];
    if (!authored) throw new TypeError('TerminalCursor recipe is not authored');
    super(glyph, {
      effects: { boxShadows: authored.shadows },
      frame: authored.frame,
      inline: authored.inline,
      opacity: authored.opacity,
      paint: { color: authored.color, fill: authored.fill },
      typography: authored.typography,
    });
    this.anchor = authored.anchor;
    this.recipe = String(recipe);
  }
}

/** Runtime completion glyph or authored triangle with a named panel/inline anchor. */
export class TerminalIndicator extends Text {
  static kind = 'unit.blue-terminal.indicator';

  constructor(glyph, recipe) {
    const authored = INDICATORS[String(recipe)];
    if (!authored) throw new TypeError('TerminalIndicator recipe is not authored');
    super(glyph, {
      effects: {
        filters: authored.filters,
      },
      frame: authored.frame,
      inline: authored.inline,
      opacity: 0,
      paint: {
        border: authored.border,
        color: authored.color,
        fill: authored.fill,
      },
      typography: {
        ...authored.typography,
        shadows: authored.shadows,
      },
    });
    this.anchor = authored.anchor;
    this.recipe = String(recipe);
  }
}

function cursor(options) {
  return Object.freeze({
    ...options,
    fill: options.fill ?? 'transparent',
    inline: options.inline,
    opacity: options.opacity ?? 0,
    shadows: Object.freeze([...(options.shadows ?? [])]),
  });
}

function indicator(options) {
  return Object.freeze({
    ...options,
    border: options.border ?? null,
    fill: options.fill ?? 'transparent',
    filters: Object.freeze([...(options.filters ?? [])]),
    inline: options.inline,
    shadows: Object.freeze([...(options.shadows ?? [])]),
    typography: options.typography ?? {},
  });
}

function inlineAnchor(margin, shape) {
  return Object.freeze({ kind: 'inline-end', margin, shape });
}

function inline(display, marginStart, verticalAlign) {
  return Object.freeze({ display, marginStart, verticalAlign });
}

function cornerAnchor(right, bottom) {
  return Object.freeze({ bottom, kind: 'panel-corner', right });
}

function outerShadow(x, y, blur, color, spread = 0) {
  return Object.freeze({ blur, color, inset: false, spread, x, y });
}

function textShadow(x, y, blur, color) {
  return Object.freeze({ blur, color, x, y });
}

function triangleBorder(side, top, color) {
  const hidden = { width: 0, style: 'none', color: 'transparent' };
  return Object.freeze({
    top: { width: top, style: 'solid', color },
    right: { width: side, style: 'solid', color: 'transparent' },
    bottom: hidden,
    left: { width: side, style: 'solid', color: 'transparent' },
  });
}
