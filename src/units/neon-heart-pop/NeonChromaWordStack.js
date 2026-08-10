import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';

/** Three-word chromatic type lockup with authored cyan/red registration ghosts. */
export class NeonChromaWordStack extends Layout {
  static kind = 'unit.neon-heart-pop.chroma-word-stack';

  constructor(wordLayers) {
    if (!Array.isArray(wordLayers) || wordLayers.length !== 3) {
      throw new TypeError('NeonChromaWordStack requires three word layer groups');
    }
    const seen = new Set();
    const groups = wordLayers.map((layers, index) => {
      if (!Array.isArray(layers) || layers.length !== 3) {
        throw new TypeError('Each chroma word requires cyan, red and main Text Units');
      }
      for (const unit of layers) {
        requireUnit(unit, `NeonChromaWordStack word ${index + 1}`);
        requireDetachedUnit(unit, `NeonChromaWordStack word ${index + 1}`);
        if (unit.constructor.kind !== 'unit.text' || seen.has(unit)) {
          throw new TypeError('Chroma word layers must be distinct Text Units');
        }
        seen.add(unit);
      }
      const [cyan, red, main] = layers;
      const handwritten = index === 1;
      const typography = {
        align: 'left',
        family: handwritten ? 'Caveat' : 'Bebas Neue',
        letterSpacing: handwritten ? 0 : 4,
        lineHeight: 'normal',
        size: handwritten ? 110 : 130,
        style: 'normal',
        transform: 'none',
        weight: handwritten ? 700 : 400,
        wrap: { whiteSpace: 'nowrap' },
      };
      styleText(cyan, typography, '#00ffff', 0.4, -3, true);
      styleText(red, typography, '#ff0000', 0.4, 3, true);
      styleText(main, typography, handwritten ? '#ff1493' : '#ffffff', 1, 0, false);
      const group = new Layer(cyan, {
        frame: { x: 0, y: 0, width: 'auto', height: 'auto', position: 'relative' },
        pose: handwritten
          ? { operations: [{ kind: 'rotate-z', degrees: -6 }] }
          : undefined,
        name: `neon-chroma-word-${index + 1}`,
      });
      group.addUnit(red);
      group.addUnit(main);
      return group;
    });

    super(groups[0], {
      frame: { x: '50%', y: '55%', width: 'auto', height: 'auto' },
      layout: { align: 'center', direction: 'row', justify: 'center' },
      name: 'neon-chroma-word-stack',
      pose: { operations: [{ kind: 'translate-2d', x: '-50%', y: '-50%' }] },
    });
    this.addUnit(groups[1]);
    this.addUnit(groups[2]);
  }
}

function styleText(unit, typography, color, opacity, x, absolute) {
  unit.frame = {
    x,
    y: 0,
    width: 'auto',
    height: 'auto',
    position: absolute ? 'absolute' : 'static',
  };
  unit.opacity = opacity;
  unit.paint = { ...unit.paint, color };
  unit.typography = typography;
}
