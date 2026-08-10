import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { PerspectivePhotoCard } from '@cut3/agent-memory/units/photo-glitch/PerspectivePhotoCard';

/** Full-frame perspective stage for four independently settling photo cards. */
export class PerspectivePhotoStack extends Layer {
  static kind = 'unit.photo-glitch.perspective-stack';
  #cards;

  constructor(images) {
    if (!Array.isArray(images) || images.length !== 4) {
      throw new TypeError('PerspectivePhotoStack requires four runtime images');
    }
    images.forEach((image, index) => {
      requireUnit(image, `PerspectivePhotoStack image ${index + 1}`);
      requireDetachedUnit(image, `PerspectivePhotoStack image ${index + 1}`);
      if (!(image instanceof Image)) {
        throw new TypeError('PerspectivePhotoStack requires Image Units');
      }
    });
    if (new Set(images).size !== images.length) {
      throw new TypeError('PerspectivePhotoStack requires distinct images');
    }
    const cards = images.map((image) => new PerspectivePhotoCard(image));

    const stage = new Layer(cards[0], {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      pose: { transformStyle: 'preserve-3d' },
      name: 'perspective-photo-stage',
    });
    cards.slice(1).forEach((card) => stage.addUnit(card));
    super(stage, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      pose: { perspective: 1400 },
      name: 'perspective-photo-stack',
    });
    this.#cards = Object.freeze([...cards]);
  }

  get cards() {
    return this.#cards;
  }
}
