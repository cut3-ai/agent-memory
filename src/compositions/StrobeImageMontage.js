import { ImageStrobeCuts } from '@cut3/agent-memory/behaviours/media-montage/ImageStrobeCuts';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { StrobeImageMontage } from '@cut3/agent-memory/units/media-montage/StrobeImageMontage';

/** Plain application output for runtime image slots and an authored cut cadence. */
export function strobeImageMontage(sources, cutMilliseconds = 40) {
  const image = new Image(sources[0]);
  const unit = new StrobeImageMontage(image);
  const cuts = new ImageStrobeCuts(image, sources, cutMilliseconds);

  image.addBehaviour(cuts);

  return unit;
}
