import {
  OrbitCaptionReveal,
  OrbitHeartBurst,
  OrbitParticleCadence,
} from '@cut3/agent-memory/behaviours/neon-heart-pop/OrbitHeartCadence';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { NeonOrbitHeart } from '@cut3/agent-memory/units/neon-heart-pop/NeonOrbitHeart';

/** Plain application output for the authored orbiting-heart title lockup. */
export function neonOrbitHeart(primaryText, accentText) {
  const primary = new Text(primaryText);
  const accent = new Text(accentText);
  const unit = new NeonOrbitHeart(primary, accent);
  const { caption, heart, particles } = unit.animationTargets();
  const burst = new OrbitHeartBurst(heart);
  const orbits = particles.map(
    ({ index, offset, owner }) => new OrbitParticleCadence(owner, index, offset),
  );
  const reveal = new OrbitCaptionReveal(caption);

  heart.addBehaviour(burst);
  orbits.forEach((orbit) => orbit.unit.addBehaviour(orbit));
  caption.addBehaviour(reveal);

  return unit;
}
