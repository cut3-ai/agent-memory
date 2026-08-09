import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { VectorPath } from '@cut3/agent-memory/units/base/VectorPath';

/** Layered cobalt system message with an ice border and pixel status rail. */
export class BlueTerminalMessagePanel extends CompositionPivot {
  static kind = 'unit.blue-terminal.message-panel';

  constructor(content) {
    requireUnit(content, 'BlueTerminalMessagePanel content');
    requireDetachedUnit(content, 'BlueTerminalMessagePanel content');
    if (content.constructor.kind !== 'unit.text') {
      throw new TypeError('BlueTerminalMessagePanel requires a Text Unit');
    }

    content.frame = { x: 44, y: 104, width: 790, height: 222, z: 10 };
    content.paint = { ...content.paint, color: '#e8f0ff' };
    content.typography = {
      align: 'left',
      family: 'Press Start 2P, monospace',
      letterSpacing: 0,
      lineHeight: 1.45,
      size: 32,
      style: 'normal',
      transform: 'none',
      weight: 400,
    };
    content.effects = {
      ...content.effects,
      contrast: 1.08,
      shadow: '2px 3px 0 #001055',
    };

    const channel = new Text('SYSTEM // MESSAGE', {
      frame: { x: 34, y: 20, width: 430, height: 34, z: 12 },
      paint: { color: '#aaccff' },
      typography: {
        family: 'Press Start 2P, monospace',
        letterSpacing: 0,
        lineHeight: 1,
        size: 22,
        transform: 'uppercase',
        weight: 400,
      },
    });
    const status = new Text('READY', {
      frame: { x: 716, y: 20, width: 126, height: 30, z: 12 },
      paint: { color: '#ffe87c' },
      typography: {
        align: 'right',
        family: 'Press Start 2P, monospace',
        letterSpacing: 0,
        lineHeight: 1,
        size: 19,
        transform: 'uppercase',
        weight: 400,
      },
    });
    const header = new Box(undefined, {
      frame: { x: 0, y: 0, width: 896, height: 70, z: 6 },
      paint: { fill: '#112266' },
      name: 'blue-terminal-header-rail',
    });
    const headerRule = new Box(undefined, {
      frame: { x: 0, y: 68, width: 896, height: 4, z: 8 },
      paint: { fill: '#aaccff' },
      name: 'blue-terminal-ice-rule',
    });
    const innerBorder = new Box(undefined, {
      frame: { x: 20, y: 88, width: 856, height: 274, z: 7 },
      paint: { fill: 'transparent', stroke: '#3050c0', strokeWidth: 3 },
      name: 'blue-terminal-inner-border',
    });
    const statusLamp = new Box(undefined, {
      effects: { shadow: '4px 4px 0 #001055' },
      frame: { x: 680, y: 22, width: 18, height: 18, z: 13 },
      paint: { fill: '#ffe87c', stroke: '#000820', strokeWidth: 2 },
      name: 'blue-terminal-status-lamp',
    });
    const panel = new Box(content, {
      effects: { shadow: '10px 12px 0 #001055' },
      frame: { x: 92, y: 1150, width: 896, height: 390, z: 4 },
      overflow: 'hidden',
      paint: { fill: '#07143c', stroke: '#4488ff', strokeWidth: 8 },
      name: 'blue-terminal-message-body',
    });
    panel.add(channel, status, header, headerRule, innerBorder, statusLamp);

    const outerBorder = new Box(undefined, {
      effects: { shadow: '18px 22px 0 #00000c' },
      frame: { x: 72, y: 1130, width: 936, height: 430, z: 1 },
      paint: { fill: '#020515', stroke: '#001055', strokeWidth: 10 },
      name: 'blue-terminal-deep-frame',
    });
    const tail = new VectorPath([
      { command: 'move', x: 0, y: 0 },
      { command: 'line', x: 154, y: 0 },
      { command: 'line', x: 42, y: 118 },
      { command: 'line', x: 34, y: 36 },
      { command: 'line', x: 0, y: 36 },
      { command: 'close' },
    ], {
      frame: { x: 770, y: 1532, width: 164, height: 128, z: 3 },
      paint: { fill: '#07143c', stroke: '#4488ff', strokeWidth: 8 },
      viewBox: [0, 0, 164, 128],
    });
    const leftCap = new Box(undefined, {
      frame: { x: 58, y: 1192, width: 30, height: 92, z: 5 },
      paint: { fill: '#aaccff', stroke: '#001055', strokeWidth: 4 },
      name: 'blue-terminal-left-cap',
    });
    const signalLow = signalBar(890, 1490, 18);
    const signalMid = signalBar(918, 1474, 34);
    const signalHigh = signalBar(946, 1454, 54);

    const stack = new Layer(outerBorder, {
      frame: { x: 0, y: 0, width: 1080, height: 1920 },
      name: 'blue-terminal-message-stack',
    });
    stack.add(tail, panel, leftCap, signalLow, signalMid, signalHigh);
    super(stack, {
      name: 'blue-terminal-message-motion',
      x: 540,
      y: 1345,
    });
  }
}

function signalBar(x, y, height) {
  return new Box(undefined, {
    frame: { x, y, width: 16, height, z: 9 },
    paint: { fill: '#aaccff' },
    name: 'blue-terminal-signal-bar',
  });
}
