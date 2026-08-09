import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { VectorPath } from '@cut3/agent-memory/units/base/VectorPath';

const INK = '#141414';
const PAPER = '#f4f1ea';
const TAPE = '#ffd24a';

/** Cream fight-zine ranking row with marker copy, yellow tape and rough ink. */
export class FightZineRankRow extends CompositionPivot {
  static kind = 'unit.fight-zine.rank-row';

  constructor(rank, name, value, gain) {
    const content = [rank, name, value, gain];
    for (const [index, unit] of content.entries()) {
      requireUnit(unit, `FightZineRankRow content ${index + 1}`);
      requireDetachedUnit(unit, `FightZineRankRow content ${index + 1}`);
      if (unit.constructor.kind !== 'unit.text') {
        throw new TypeError('FightZineRankRow requires four Text Units');
      }
    }
    if (new Set(content).size !== content.length) {
      throw new TypeError('FightZineRankRow requires four distinct Text Units');
    }

    rank.frame = { x: 102, y: 46, width: 152, height: 176, z: 7 };
    rank.paint = { ...rank.paint, color: INK };
    rank.typography = {
      align: 'left',
      family: 'Anton, system-ui',
      letterSpacing: 1,
      lineHeight: 0.9,
      size: 150,
      style: 'normal',
      transform: 'uppercase',
      weight: 400,
    };

    name.frame = { x: 276, y: 54, width: 476, height: 112, z: 7 };
    name.paint = { ...name.paint, color: INK };
    name.typography = {
      align: 'left',
      family: 'Permanent Marker, system-ui',
      letterSpacing: 0.5,
      lineHeight: 1,
      size: 66,
      style: 'normal',
      transform: 'uppercase',
      weight: 400,
    };

    value.frame = { x: 748, y: 46, width: 222, height: 112, z: 7 };
    value.paint = { ...value.paint, color: INK };
    value.typography = {
      align: 'right',
      family: 'Anton, system-ui',
      letterSpacing: 1,
      lineHeight: 1,
      size: 84,
      style: 'normal',
      transform: 'uppercase',
      weight: 400,
    };

    gain.frame = { x: 816, y: 194, width: 144, height: 60, z: 9 };
    gain.paint = { ...gain.paint, color: INK };
    gain.typography = {
      align: 'center',
      family: 'Permanent Marker, system-ui',
      letterSpacing: 0,
      lineHeight: 1,
      size: 42,
      style: 'normal',
      transform: 'uppercase',
      weight: 400,
    };

    const paper = new Box(undefined, {
      effects: { shadow: '14px 16px 0 rgba(20,20,20,.34)' },
      frame: { x: 70, y: 18, width: 940, height: 270, z: 2 },
      overflow: 'hidden',
      paint: { fill: PAPER, stroke: INK, strokeWidth: 6 },
      pose: { rotate: -0.35 },
      name: 'fight-zine-cream-paper',
    });
    const rankBlock = new Box(undefined, {
      frame: { x: 88, y: 36, width: 174, height: 198, z: 4 },
      paint: { fill: TAPE, stroke: INK, strokeWidth: 4 },
      pose: { rotate: -1.8 },
      name: 'fight-zine-rank-block',
    });
    const gainTape = new Box(undefined, {
      frame: { x: 798, y: 180, width: 180, height: 82, z: 8 },
      paint: { fill: TAPE, stroke: INK, strokeWidth: 4 },
      pose: { rotate: -2.4 },
      name: 'fight-zine-gain-tape',
    });
    const rule = new VectorPath([
      { command: 'move', x: 0, y: 15 },
      { command: 'cubic', x1: 106, y1: 2, x2: 254, y2: 25, x: 374, y: 10 },
      { command: 'cubic', x1: 432, y1: 3, x2: 496, y2: 20, x: 548, y: 8 },
    ], {
      frame: { x: 274, y: 174, width: 548, height: 32, z: 6 },
      paint: { stroke: INK, strokeWidth: 6 },
      viewBox: [0, 0, 548, 32],
    });
    const scratch = new VectorPath([
      { command: 'move', x: 4, y: 22 },
      { command: 'line', x: 42, y: 4 },
      { command: 'line', x: 74, y: 20 },
    ], {
      frame: { x: 944, y: 52, width: 78, height: 28, z: 10 },
      paint: { stroke: INK, strokeWidth: 5 },
      viewBox: [0, 0, 78, 28],
    });

    const stack = new Layer(paper, {
      frame: { x: 0, y: 0, width: 1080, height: 1920 },
      name: 'fight-zine-rank-row-stack',
    });
    stack.add(rankBlock, gainTape, rule, scratch, rank, name, value, gain);
    super(stack, {
      name: 'fight-zine-rank-row-motion',
      x: 540,
      y: 153,
    });
  }
}
