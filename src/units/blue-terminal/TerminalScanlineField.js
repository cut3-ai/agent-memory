import { Box } from '@cut3/agent-memory/units/base/Box';

const SCANLINES = Object.freeze({
  'pixel-crt': scanline(820, 220, 0.04, repeating([
    stop(0, '#000000'),
    stop(1, 'transparent'),
    stop(3, 'transparent'),
  ])),
  'soft-speaker': scanline(820, 170, 0, null),
  'bevel-status': scanline(885.6, 210, 0, null),
  'tagged-status': scanline(842.4, 220, 0, null),
  'press-start-crt': scanline(842.4, 220, 0.10, repeating([
    stop(0, 'transparent'),
    stop(3, 'transparent'),
    stop(3, '#000000'),
    stop(4, '#000000'),
  ])),
  'steel-speaker': scanline(851.6, 186, 0.18, repeating([
    stop(0, 'transparent'),
    stop(3, 'transparent'),
    stop(3, '#000000'),
    stop(4, '#000000'),
  ])),
});

/** Authored DOM/CSS phosphor mask with a recipe-specific repeating gradient. */
export class TerminalScanlineField extends Box {
  static kind = 'unit.blue-terminal.scanline-field';

  constructor(recipe, frame) {
    const authored = SCANLINES[String(recipe)];
    if (!authored) throw new TypeError('TerminalScanlineField recipe is not authored');
    super(undefined, {
      frame: {
        ...frame,
        width: authored.width,
        height: authored.height,
      },
      opacity: authored.opacity,
      paint: { backgrounds: authored.background === null ? [] : [authored.background] },
      name: 'blue-terminal-scanline-field',
    });
  }
}

function scanline(width, height, opacity, background) {
  return Object.freeze({ background, height, opacity, width });
}

function repeating(stops) {
  return Object.freeze({
    angle: 0,
    kind: 'linear-gradient',
    repeating: true,
    stops: Object.freeze(stops),
  });
}

function stop(offset, color) {
  return Object.freeze({ color, offset, unit: 'px' });
}
