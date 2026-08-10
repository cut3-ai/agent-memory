import { requireUnit, Unit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layer } from '@cut3/agent-memory/units/base/Layer';

/** Incoming scene under uneven black case-file shutter slats. */
export class CasefileShutterTransition extends Unit {
  static kind = 'unit.archival-dossier.shutter-transition';

  #animationTargets;

  constructor(incomingScene) {
    requireUnit(incomingScene, 'CasefileShutterTransition incomingScene');
    requireDetachedUnit(incomingScene, 'CasefileShutterTransition incomingScene');
    const incoming = new CompositionPivot(incomingScene, {
      name: 'dossier-incoming-reveal',
      x: 540,
      y: 960,
    });
    const slats = new Layer(undefined, { name: 'casefile-shutter-slats' });
    [0, 1, 2, 3].forEach((index) => slats.add(new Box(undefined, {
      frame: { x: 0, y: index * 486, width: 1080, height: 510, z: 40 + index },
      paint: { fill: index === 2 ? '#a33a2b' : '#211c18' },
      pose: { x: index % 2 === 0 ? -36 : 28 },
      name: `casefile-slat-${index + 1}`,
    })));
    const pivot = new CompositionPivot(slats, { x: 540, y: 960 });
    const root = new Layer(incoming, { name: 'casefile-shutter-transition' });
    root.add(pivot);
    super(root);
    this.#animationTargets = Object.freeze({
      incoming,
      shutter: pivot,
    });
  }

  /** Frozen semantic owners in authored reveal-then-shutter attachment order. */
  animationTargets() {
    return this.#animationTargets;
  }
}
