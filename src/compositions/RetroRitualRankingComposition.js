import { Box } from '@cut3/agent-memory/units/base/Box';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { portalTileTransition } from '@cut3/agent-memory/compositions/PortalTileHandoff';
import { ritualOffer } from '@cut3/agent-memory/compositions/RitualOffer';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Shot } from '@cut3/agent-memory/units/base/Shot';
import { Text } from '@cut3/agent-memory/units/base/Text';

/** Arbitrary-cardinality ranking assembled from one reusable ritual card Unit. */
export class RetroRitualRankingComposition extends Composition {
  static kind = 'unit.composition.retro-ritual-ranking';

  constructor(options = {}) {
    const items = options.items ?? ['BONE CHOIR', 'GREEN PORTAL', 'KING\'S DEBT', 'SOUL STATIC'];
    if (!Array.isArray(items) || items.length === 0) {
      throw new TypeError('RetroRitualRankingComposition requires at least one item');
    }
    const pages = chunk(items, 4);
    const pageDuration = 72;
    const rankingDuration = pages.length * pageDuration;
    const transitionFrom = rankingDuration - 20;
    const duration = transitionFrom + 60;
    const winner = winnerScene(items[0]);
    const timeline = new Layer(new Shot(rankingPage(pages[0], 0, pages.length, pageDuration), {
      duration: pageDuration,
      from: 0,
      name: 'ritual-ranking-page-1',
    }), { name: 'retro-ritual-timeline' });
    pages.slice(1).forEach((page, index) => timeline.add(new Shot(
      rankingPage(page, index + 1, pages.length, pageDuration),
      {
        duration: pageDuration,
        from: (index + 1) * pageDuration,
        name: `ritual-ranking-page-${index + 2}`,
      },
    )));
    timeline.add(new Shot(portalTileTransition(winner), {
      duration: 60,
      from: transitionFrom,
      name: 'portal-to-winner',
    }));
    super(timeline, {
      background: '#120d1c',
      duration,
      fps: 30,
      height: 1920,
      width: 1080,
    });
  }
}

function rankingPage(items, pageIndex, pageCount, duration) {
  const root = ritualBackground('RITUAL RANKING', `PAGE ${pageIndex + 1}/${pageCount}`);
  items.forEach((item, index) => {
    const rank = (pageIndex * 4) + index + 1;
    const card = place(ritualOffer(`${rank}. ${String(item)}`), {
      y: 390 + (index * 310),
    });
    root.add(new Shot(card, {
      duration: duration - (index * 6),
      from: index * 6,
      name: `deal-rank-${rank}`,
    }));
  });
  return root;
}

function winnerScene(winner) {
  const root = ritualBackground('CHOSEN RITUAL');
  root.add(place(ritualOffer(`1. ${String(winner)}`), { y: 770 }));
  return root;
}

function place(unit, pose) {
  return new CompositionPivot(unit, {
    name: 'ritual-offer-placement',
    pose,
  });
}

function ritualBackground(title, page = '') {
  const root = new Layer(new Box(undefined, {
    frame: { x: 0, y: 0, width: 1080, height: 1920 },
    paint: { fill: '#120d1c' },
    name: 'ritual-black-purple-background',
  }), { name: 'retro-ritual-scene' });
  root.add(new Text(title, {
    frame: { x: 92, y: 124, width: 896, height: 160, z: 9 },
    paint: { color: '#78d64b' },
    typography: {
      align: 'center',
      family: 'Silkscreen, monospace',
      letterSpacing: 5,
      lineHeight: 1,
      size: 74,
      transform: 'uppercase',
      weight: 700,
    },
  }));
  if (page) root.add(new Text(page, {
    frame: { x: 92, y: 286, width: 896, height: 60, z: 9 },
    paint: { color: '#c9b98e' },
    typography: {
      align: 'center',
      family: 'Silkscreen, monospace',
      letterSpacing: 2,
      lineHeight: 1,
      size: 28,
      transform: 'uppercase',
      weight: 700,
    },
  }));
  return root;
}

function chunk(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => (
    items.slice(index * size, (index + 1) * size)
  ));
}
