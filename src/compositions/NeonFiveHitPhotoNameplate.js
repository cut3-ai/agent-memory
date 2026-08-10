import {
  FiveHitCameraShake,
  FiveHitExposureBurst,
  FiveHitPhotoSlam,
  FiveHitTitleSlam,
} from '@cut3/agent-memory/behaviours/neon-heart-pop/FiveHitPhotoCadence';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { Text } from '@cut3/agent-memory/units/base/Text';
import {
  NeonFiveHitPhotoNameplate,
} from '@cut3/agent-memory/units/neon-heart-pop/NeonFiveHitPhotoNameplate';

/** Plain application output for the authored five-impact photo/nameplate sequence. */
export function neonFiveHitPhotoNameplate(sources, titleText) {
  const images = sources.map((source) => new Image(source));
  const title = new Text(titleText);
  const unit = new NeonFiveHitPhotoNameplate(images, title);
  const targets = unit.animationTargets();
  const cardSlams = targets.cards.map(
    ({ index, owner }) => new FiveHitPhotoSlam(owner, index),
  );
  const shake = new FiveHitCameraShake(targets.camera);
  const titleSlam = new FiveHitTitleSlam(targets.title);
  const exposure = new FiveHitExposureBurst(targets.exposure);

  cardSlams.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  targets.camera.addBehaviour(shake);
  targets.title.addBehaviour(titleSlam);
  targets.exposure.addBehaviour(exposure);

  return unit;
}
