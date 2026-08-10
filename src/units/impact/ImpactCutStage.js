import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layout } from '@cut3/agent-memory/units/base/Layout';

/** Renderer-neutral root for one authored impact cut. It owns no hidden motion. */
export class ImpactCutStage extends Box {
  static kind = 'unit.impact.cut-stage';
  #authoredStage;

  constructor(unit, recipe, background = 'transparent') {
    const authoredStage = new ImpactAuthoredStage(unit, {
      frame: {
        x: 0,
        y: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        boxSizing: 'content-box',
        z: 'auto',
      },
      paint: { fill: background },
      layout: { direction: 'column' },
      name: `impact-${recipe}-authored-stage`,
    });
    const sequenceFrame = new Layout(authoredStage, {
      frame: {
        x: 0,
        y: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        boxSizing: 'content-box',
        z: 'auto',
      },
      layout: { direction: 'column' },
      name: `impact-${recipe}-sequence-frame`,
    });
    super(sequenceFrame, {
      frame: {
        x: 0,
        y: 0,
        width: '100%',
        height: '100%',
        boxSizing: 'content-box',
        z: 0,
      },
      name: `impact-${recipe}`,
    });
    this.#authoredStage = authoredStage;
    this.recipe = String(recipe);
  }

  get authoredStage() {
    return this.#authoredStage;
  }
}

class ImpactAuthoredStage extends Layout {
  static kind = 'unit.impact.authored-stage';
}
