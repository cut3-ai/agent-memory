import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Layer } from '@cut3/agent-memory/units/base/Layer';

/** Full-frame runtime Image slot for deterministic rapid source cuts. */
export class StrobeImageMontage extends Layer {
  static kind = 'unit.media-montage.strobe-image';

  constructor(image) {
    requireUnit(image, 'StrobeImageMontage image');
    requireDetachedUnit(image, 'StrobeImageMontage image');
    if (image.constructor.kind !== 'unit.image') {
      throw new TypeError('StrobeImageMontage requires an Image Unit');
    }
    image.frame = { x: 0, y: 0, width: '100%', height: '100%', z: 1 };
    image.fit = 'cover';

    super(image, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      overflow: 'hidden',
      paint: { fill: '#000000' },
      name: 'strobe-image-montage',
    });
  }
}
