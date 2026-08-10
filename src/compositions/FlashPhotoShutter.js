import { ExposureBloom } from '@cut3/agent-memory/behaviours/flash-photo/ExposureBloom';
import { ShutterFlashReframe } from '@cut3/agent-memory/behaviours/flash-photo/ShutterFlashReframe';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { FlashPhotoPlate } from '@cut3/agent-memory/units/flash-photo/FlashPhotoPlate';

/** Plain application output: runtime media slots plus complete owner-first shutter laws. */
export function flashPhotoShutter(sources, recipe, mediaMetadata) {
  const images = sources.map((source) => new Image(source));
  const unit = new FlashPhotoPlate(images, recipe, mediaMetadata);
  const targets = unit.animationTargets();
  const reframes = targets.reframes.map(({ owner, index, role }) => (
    new ShutterFlashReframe(owner, recipe, index, role)
  ));
  const exposureBlooms = targets.exposureLaws.map(({ owner, channel }) => (
    new ExposureBloom(owner, recipe, channel)
  ));

  reframes.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  exposureBlooms.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));

  return unit;
}
