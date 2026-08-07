import { requireUnit, Unit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { PortalTileStutter } from '@cut3/agent-memory/behaviours/retro-ritual/PortalTileStutter';
import { PortalSceneReveal } from '@cut3/agent-memory/behaviours/retro-ritual/PortalSceneReveal';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layer } from '@cut3/agent-memory/units/base/Layer';

/** A 6x10 hard-edged portal mosaic over the incoming scene. */
export class PortalTileTransition extends Unit {
  static kind = 'unit.retro-ritual.portal-tile-transition';

  constructor(incomingScene) {
    requireUnit(incomingScene, 'PortalTileTransition incomingScene');
    requireDetachedUnit(incomingScene, 'PortalTileTransition incomingScene');
    const incoming = new CompositionPivot(incomingScene, {
      name: 'portal-incoming-reveal',
      x: 540,
      y: 960,
    });
    incoming.add(new PortalSceneReveal(incoming));
    const tiles = new Layer(undefined, { name: 'portal-pixel-tiles' });
    for (let row = 0; row < 10; row += 1) {
      for (let column = 0; column < 6; column += 1) {
        const odd = (row + column) % 2 === 1;
        tiles.add(new Box(undefined, {
          frame: { x: column * 180, y: row * 192, width: 184, height: 196, z: 50 },
          paint: { fill: odd ? '#21172f' : '#78d64b', stroke: '#09060f', strokeWidth: 4 },
          name: `portal-tile-${row}-${column}`,
        }));
      }
    }
    const pivot = new CompositionPivot(tiles, { x: 540, y: 960 });
    pivot.add(new PortalTileStutter(pivot));
    const root = new Layer(incoming, { name: 'portal-tile-transition' });
    root.add(pivot);
    super(root);
  }
}
