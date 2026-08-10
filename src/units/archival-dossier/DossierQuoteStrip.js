import { requireUnit, Unit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { VectorPath } from '@cut3/agent-memory/units/base/VectorPath';

/** Carbon-copy transcript fragment on torn warm paper. */
export class DossierQuoteStrip extends Unit {
  static kind = 'unit.archival-dossier.quote-strip';

  #animationTargets;

  constructor(content) {
    requireUnit(content, 'DossierQuoteStrip content');
    requireDetachedUnit(content, 'DossierQuoteStrip content');
    if (content.constructor.kind !== 'unit.text') {
      throw new TypeError('DossierQuoteStrip requires a Text Unit');
    }
    content.frame = { x: 62, y: 54, width: 824, height: 270, z: 3 };
    const paper = new Box(content, {
      effects: { shadow: '14px 18px 0 rgba(42,32,24,.28)' },
      frame: { x: 86, y: 1216, width: 940, height: 372, z: 4 },
      overflow: 'hidden',
      paint: { fill: '#e9ddc7', stroke: '#6c5847', strokeWidth: 3 },
      pose: { rotate: 0.7 },
      name: 'carbon-copy-paper',
    });
    const scratch = new VectorPath([
      { command: 'move', x: 0, y: 13 },
      { command: 'cubic', x1: 170, y1: 2, x2: 460, y2: 23, x: 760, y: 8 },
    ], {
      frame: { x: 160, y: 1514, width: 762, height: 28, z: 7 },
      paint: { stroke: '#a33a2b', strokeWidth: 6 },
      viewBox: [0, 0, 762, 28],
    });
    const stack = new Layer(paper, { name: 'dossier-quote-stack' });
    stack.add(scratch);
    super(stack);
    this.#animationTargets = Object.freeze({ copy: content });
  }

  /** Frozen semantic text owner for the carbon-copy cadence. */
  animationTargets() {
    return this.#animationTargets;
  }
}
