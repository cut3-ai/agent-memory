import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { polygonPoints } from '@cut3/agent-memory/units/photo-glitch/PolygonClipContent';

/** Runtime image carrier retaining its authored masked-panel camera identity. */
export class MaskedPanelMedia extends Image {
  static kind = 'unit.photo-glitch.masked-panel-media';

  constructor(source, panelIndex) {
    super(source);
    if (!Number.isInteger(panelIndex) || panelIndex < 0 || panelIndex > 2) {
      throw new RangeError('MaskedPanelMedia panelIndex must select an authored panel');
    }
    this.panelIndex = panelIndex;
    this.cameraProgress = 0;
  }
}

/** Full-frame masked panel retaining the authored alpha-aware shadow contract. */
export class MaskedPhotoPanel extends Layer {
  static kind = 'unit.photo-glitch.masked-panel';

  constructor(content, polygon) {
    requireUnit(content, 'MaskedPhotoPanel content');
    requireDetachedUnit(content, 'MaskedPhotoPanel content');
    if (content.constructor.kind !== 'unit.photo-glitch.polygon-clip-content') {
      throw new TypeError('MaskedPhotoPanel requires PolygonClipContent');
    }

    super(content, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      effects: { shadow: '0 18px 28px rgba(0,0,0,0.6)' },
      name: 'masked-photo-panel',
    });
    this.maskPolygon = polygonPoints(polygon, 'MaskedPhotoPanel polygon');
  }
}
