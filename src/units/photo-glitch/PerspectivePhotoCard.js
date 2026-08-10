import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';

/** Centered white photo card with exact authored dimensions and depth shadows. */
export class PerspectivePhotoCard extends Box {
  static kind = 'unit.photo-glitch.perspective-card';

  constructor(image) {
    requireUnit(image, 'PerspectivePhotoCard image');
    requireDetachedUnit(image, 'PerspectivePhotoCard image');
    if (image.constructor.kind !== 'unit.image') {
      throw new TypeError('PerspectivePhotoCard requires an Image Unit');
    }
    image.frame = { x: 18, y: 18, width: 420, height: 520, z: 1 };
    image.fit = 'cover';

    super(image, {
      frame: {
        x: 'calc(50% - 228px)',
        y: 'calc(50% - 297px)',
        width: 456,
        height: 594,
      },
      effects: {
        boxShadows: [
          { x: 0, y: 30, blur: 60, spread: 0, color: 'rgba(0,0,0,0.55)' },
          { x: 0, y: 8, blur: 20, spread: 0, color: 'rgba(0,0,0,0.4)' },
        ],
      },
      paint: { fill: '#ffffff', radius: 4 },
      pose: { transformStyle: 'preserve-3d' },
      name: 'perspective-photo-card',
    });
  }
}
