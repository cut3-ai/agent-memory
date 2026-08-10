import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import {
  MaskedPanelMedia,
  MaskedPhotoPanel,
} from '@cut3/agent-memory/units/photo-glitch/MaskedPhotoPanel';
import { PolygonClipContent } from '@cut3/agent-memory/units/photo-glitch/PolygonClipContent';

const PANEL_POLYGONS = Object.freeze([
  polygon([[0, 0], [1, 0], [1, 0.46], [0, 0.58]]),
  polygon([[0, 0.6], [0.56, 0.5], [0.44, 1], [0, 1]]),
  polygon([[0.56, 0.48], [1, 0.48], [1, 1], [0.44, 1]]),
]);

/** Three authored polygon panels sharing one global exit envelope. */
export class MaskedPanelTriptych extends Layer {
  static kind = 'unit.photo-glitch.masked-triptych';
  #animationTargets;

  constructor(images) {
    if (!Array.isArray(images) || images.length !== 3) {
      throw new TypeError('MaskedPanelTriptych requires three runtime images');
    }
    images.forEach((image, index) => {
      requireUnit(image, `MaskedPanelTriptych image ${index + 1}`);
      requireDetachedUnit(image, `MaskedPanelTriptych image ${index + 1}`);
      if (!(image instanceof MaskedPanelMedia) || image.panelIndex !== index) {
        throw new TypeError('MaskedPanelTriptych requires ordered MaskedPanelMedia Units');
      }
    });
    if (new Set(images).size !== images.length) {
      throw new TypeError('MaskedPanelTriptych requires distinct images');
    }
    const targets = images.map((image, index) => {
      const mask = PANEL_POLYGONS[index];
      const content = new PolygonClipContent(image, mask);
      const panel = new MaskedPhotoPanel(content, mask);
      return Object.freeze({ image, index, panel });
    });
    const panels = targets.map(({ panel }) => panel);

    super(panels[0], {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      name: 'masked-panel-triptych',
    });
    panels.slice(1).forEach((panel) => this.addUnit(panel));
    this.sceneCadence = Object.freeze({ exit: 0, phase: 'reveal', reveal: 0 });
    this.#animationTargets = Object.freeze(targets);
  }

  animationTargets() {
    return this.#animationTargets;
  }
}

function polygon(entries) {
  return Object.freeze(entries.map(([x, y]) => Object.freeze({ x, y })));
}
