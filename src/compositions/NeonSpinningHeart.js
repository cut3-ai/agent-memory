import {
  HeartConstellationTwinkle,
  SpinningHeartBurst,
} from '@cut3/agent-memory/behaviours/neon-heart-pop/SpinningHeartCadence';
import { NeonSpinningHeart } from '@cut3/agent-memory/units/neon-heart-pop/NeonSpinningHeart';

/** Plain application output for the authored spinning-heart constellation. */
export function neonSpinningHeart() {
  const unit = new NeonSpinningHeart();
  const { heart, stars } = unit.animationTargets();
  const burst = new SpinningHeartBurst(heart);
  const twinkles = stars.map(
    ({ index, offset, owner }) => new HeartConstellationTwinkle(owner, index, offset),
  );

  heart.addBehaviour(burst);
  twinkles.forEach((twinkle) => twinkle.unit.addBehaviour(twinkle));

  return unit;
}
