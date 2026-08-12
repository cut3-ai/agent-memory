import { requireUnit, Unit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { VectorPath } from '@cut3/agent-memory/units/base/VectorPath';

/** Dark slate board with chalk stroke, dust plume and eraser smudge. */
export class ChalkboardSlate extends Unit {
  static kind = 'unit.chalkboard.slate';

  #animationTargets;

  constructor(content) {
    requireUnit(content, 'ChalkboardSlate content');
    requireDetachedUnit(content, 'ChalkboardSlate content');

    content.frame = { x: 90, y: 660, width: 900, height: 540, z: 4 };
    content.paint = { ...content.paint, color: '#ede9dd' };
    content.opacity = 0;
    content.typography = {
      align: 'center',
      family: 'Caveat, cursive',
      letterSpacing: 1.5,
      lineHeight: 1.35,
      size: 80,
      style: 'normal',
      weight: 700,
    };

    const slate = new Box(undefined, {
      frame: { x: 0, y: 0, width: 1080, height: 1920, z: 1 },
      paint: { fill: '#1a2e1c', radius: 0 },
      name: 'chalk-slate-bg',
    });

    // Curved chalk stroke drawn beneath the text content
    const stroke = new VectorPath([
      { command: 'move', x: 4, y: 28 },
      { command: 'cubic', x1: 190, y1: 6, x2: 560, y2: 48, x: 868, y: 16 },
    ], {
      draw: { start: 0, end: 0 },
      frame: { x: 106, y: 1240, width: 868, height: 56, z: 3 },
      paint: { fill: 'transparent', stroke: '#dcd6c4', strokeWidth: 7 },
      viewBox: [0, 0, 868, 56],
    });

    // Chalk dust plume that tracks the drawing tip
    const dust = new Box(undefined, {
      effects: { blur: 18 },
      frame: { x: 776, y: 1210, width: 230, height: 96, z: 5 },
      opacity: 0,
      paint: { fill: '#f0ebe0', radius: 48 },
      name: 'chalk-dust',
    });

    // Eraser smudge — a dusty streak left by a chalk eraser
    const eraser = new Box(undefined, {
      effects: { blur: 10 },
      frame: { x: 68, y: 1164, width: 280, height: 68, z: 6 },
      opacity: 0,
      paint: { fill: '#b4ae9e', radius: 6 },
      name: 'chalk-eraser-smudge',
    });

    const stack = new Layer(slate, { name: 'chalkboard-stack' });
    stack.add(stroke, content, dust, eraser);

    super(stack);

    this.#animationTargets = Object.freeze({ content, dust, eraser, stroke });
  }

  /** Frozen semantic owners for ChalkStrokeDraw wiring. */
  animationTargets() {
    return this.#animationTargets;
  }
}
