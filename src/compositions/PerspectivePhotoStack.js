import { PerspectiveCardDrop } from '@cut3/agent-memory/behaviours/photo-glitch/PerspectiveCardDrop';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { PerspectivePhotoStack } from '@cut3/agent-memory/units/photo-glitch/PerspectivePhotoStack';

/** Plain application output for four runtime images on an authored 3D card stage. */
export function perspectivePhotoStack(sources) {
  const images = sources.map((source) => new Image(source));
  const unit = new PerspectivePhotoStack(images);
  const drops = unit.cards.map((card, index) => new PerspectiveCardDrop(card, index));

  unit.cards.forEach((card, index) => card.addBehaviour(drops[index]));

  return unit;
}
