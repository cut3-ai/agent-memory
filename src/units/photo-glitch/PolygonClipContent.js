import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { finite } from '@cut3/agent-memory/core/timeline';
import { Layer } from '@cut3/agent-memory/units/base/Layer';

/** Bordered image content carrying a renderer-neutral polygon mask contract. */
export class PolygonClipContent extends Layer {
  static kind = 'unit.photo-glitch.polygon-clip-content';

  constructor(image, polygon) {
    requireUnit(image, 'PolygonClipContent image');
    requireDetachedUnit(image, 'PolygonClipContent image');
    if (image.constructor.kind !== 'unit.photo-glitch.masked-panel-media') {
      throw new TypeError('PolygonClipContent requires a MaskedPanelMedia Unit');
    }
    image.frame = { x: 0, y: 0, width: '100%', height: '100%', z: 1 };
    image.fit = 'cover';

    super(image, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      overflow: 'hidden',
      paint: {
        border: { all: { width: 10, style: 'solid', color: '#000000' } },
      },
      name: 'polygon-clip-content',
    });
    this.maskPolygon = polygonPoints(polygon, 'PolygonClipContent polygon');
  }
}

export function polygonPoints(value, name) {
  if (!Array.isArray(value) || value.length < 3) {
    throw new TypeError(`${name} must contain at least three points`);
  }
  return value.map((point, index) => {
    if (!point || typeof point !== 'object' || Array.isArray(point)) {
      throw new TypeError(`${name} point ${index + 1} must be an object`);
    }
    const x = finite(point.x, `${name} point ${index + 1} x`);
    const y = finite(point.y, `${name} point ${index + 1} y`);
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      throw new RangeError(`${name} points must stay inside the unit square`);
    }
    return { x, y };
  });
}
