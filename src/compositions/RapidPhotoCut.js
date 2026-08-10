import { RapidPhotoCut } from '@cut3/agent-memory/behaviours/rapid-photo/RapidPhotoCut';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { RapidPhotoPlate } from '@cut3/agent-memory/units/rapid-photo/RapidPhotoPlate';

/** Plain application output: runtime image, semantic plate and one complete cut law. */
export function rapidPhotoCut(source, recipe) {
  const image = new Image(source);
  const unit = new RapidPhotoPlate(image, recipe);
  const target = unit.animationTargets().motion;
  const cut = new RapidPhotoCut(target.owner, target.recipe);

  target.owner.addBehaviour(cut);

  return unit;
}
