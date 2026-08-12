import { requireUnit, Unit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { VectorPath } from '@cut3/agent-memory/units/base/VectorPath';

/** Paper-black condensed headline with signal-red gutter and hand-struck rule.
 *  Pass an optional kicker Text as the second argument to render a small
 *  signal-red uppercase label line above the main headline. */
export class SignalHeadlineBand extends Unit {
  static kind = 'unit.signal-editorial.headline-band';

  #animationTargets;

  constructor(content, kicker = null) {
    requireUnit(content, 'SignalHeadlineBand content');
    requireDetachedUnit(content, 'SignalHeadlineBand content');
    if (content.constructor.kind !== 'unit.text') {
      throw new TypeError('SignalHeadlineBand requires a Text Unit');
    }
    if (kicker !== null) {
      requireUnit(kicker, 'SignalHeadlineBand kicker');
      requireDetachedUnit(kicker, 'SignalHeadlineBand kicker');
      if (kicker.constructor.kind !== 'unit.text') {
        throw new TypeError('SignalHeadlineBand kicker must be a Text Unit');
      }
    }

    const KICKER_EXTRA = kicker ? 70 : 0;
    const PAPER_H = 330 + KICKER_EXTRA;
    const CONTENT_Y = kicker ? 118 : 50;
    const RULE_Y = 1516 + KICKER_EXTRA;

    content.frame = { x: 78, y: CONTENT_Y, width: 790, height: 230, z: 3 };
    content.paint = { ...content.paint, color: '#f4efe6' };
    content.typography = {
      align: 'left',
      family: 'Barlow Condensed, sans-serif',
      letterSpacing: -2.8,
      lineHeight: 0.86,
      size: 104,
      style: 'normal',
      transform: 'uppercase',
      weight: 800,
    };

    if (kicker) {
      kicker.frame = { x: 78, y: 44, width: 790, height: 48, z: 6 };
      kicker.paint = { ...kicker.paint, color: '#ff3b30' };
      kicker.typography = {
        align: 'left',
        family: 'Barlow Condensed, sans-serif',
        letterSpacing: 2.5,
        lineHeight: 1,
        size: 26,
        style: 'normal',
        transform: 'uppercase',
        weight: 700,
      };
    }

    const paper = new Box(content, {
      effects: { shadow: '22px 24px 0 #ff3b30' },
      frame: { x: 96, y: 1260, width: 888, height: PAPER_H, z: 2 },
      overflow: 'hidden',
      paint: { fill: '#111111', radius: 0, stroke: '#111111', strokeWidth: 6 },
      name: 'signal-headline-paper',
    });
    if (kicker) {
      paper.add(kicker);
    }
    const gutter = new Box(undefined, {
      frame: { x: 96, y: 1260, width: 22, height: PAPER_H, z: 4 },
      paint: { fill: '#ff3b30' },
      name: 'signal-red-gutter',
    });
    const rule = new VectorPath([
      { command: 'move', x: 4, y: 18 },
      { command: 'cubic', x1: 160, y1: 2, x2: 530, y2: 25, x: 794, y: 9 },
    ], {
      frame: { x: 158, y: RULE_Y, width: 800, height: 34, z: 5 },
      paint: { stroke: '#ff3b30', strokeWidth: 11 },
      viewBox: [0, 0, 800, 34],
    });
    const stack = new Layer(paper, { name: 'signal-headline-stack' });
    stack.add(gutter, rule);
    const pivot = new CompositionPivot(stack, { x: 144, y: 1390 });
    super(pivot);
    this.#animationTargets = Object.freeze({
      impact: pivot,
      rule,
    });
  }

  /** Frozen semantic owners for application-level Behaviour wiring. */
  animationTargets() {
    return this.#animationTargets;
  }
}
