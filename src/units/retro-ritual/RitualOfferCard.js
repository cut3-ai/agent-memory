import { requireUnit, Unit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { finite } from '@cut3/agent-memory/core/timeline';
import { BoneIdleHop } from '@cut3/agent-memory/behaviours/retro-ritual/BoneIdleHop';
import { RitualCardDeal } from '@cut3/agent-memory/behaviours/retro-ritual/RitualCardDeal';
import { RuneTrace } from '@cut3/agent-memory/behaviours/retro-ritual/RuneTrace';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { VectorPath } from '@cut3/agent-memory/units/base/VectorPath';

/** Pixel-necromancy ranking card: bone frame, soul-green rune and held hop. */
export class RitualOfferCard extends Unit {
  static kind = 'unit.retro-ritual.offer-card';

  constructor(content, options = {}) {
    requireUnit(content, 'RitualOfferCard content');
    requireDetachedUnit(content, 'RitualOfferCard content');
    const top = finite(options.y ?? 0, 'RitualOfferCard y');
    if (content.constructor.kind === 'unit.text') {
      content.frame = { x: 76, y: 58, width: 720, height: 154, z: 5 };
      content.paint = { ...content.paint, color: '#efe7cf' };
      content.typography = {
        align: 'left',
        family: 'Silkscreen, monospace',
        letterSpacing: 1,
        lineHeight: 1,
        size: 54,
        style: 'normal',
        transform: 'uppercase',
        weight: 700,
      };
    }
    const card = new Box(content, {
      effects: { shadow: '14px 14px 0 #09060f' },
      frame: { x: 120, y: top, width: 840, height: 270, z: 4 },
      overflow: 'hidden',
      paint: { fill: '#21172f', stroke: '#c9b98e', strokeWidth: 8 },
      name: 'ritual-offer-card',
    });
    const soulBar = new Box(undefined, {
      frame: { x: 120, y: top + 222, width: 840, height: 48, z: 6 },
      paint: { fill: '#78d64b' },
      name: 'soul-green-rank-bar',
    });
    const rune = new VectorPath([
      { command: 'move', x: 8, y: 70 },
      { command: 'line', x: 40, y: 8 },
      { command: 'line', x: 72, y: 70 },
      { command: 'line', x: 8, y: 32 },
      { command: 'line', x: 72, y: 32 },
      { command: 'close' },
    ], {
      frame: { x: 844, y: top + 86, width: 76, height: 76, z: 8 },
      paint: { stroke: '#78d64b', strokeWidth: 6 },
      viewBox: [0, 0, 80, 80],
    });
    rune.add(new RuneTrace(rune));
    const cardStack = new Layer(card, {
      frame: { x: 0, y: 0, width: 1080, height: 1920 },
      name: 'ritual-card-stack',
    });
    cardStack.add(soulBar, rune);
    const idlePivot = new CompositionPivot(cardStack, { x: 540, y: top + 135 });
    idlePivot.add(new BoneIdleHop(idlePivot));
    const dealPivot = new CompositionPivot(idlePivot, { x: 540, y: top + 135 });
    dealPivot.add(new RitualCardDeal(dealPivot));
    super(dealPivot);
  }
}
