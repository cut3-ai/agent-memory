import { FlipTitleReveal } from '@cut3/agent-memory/behaviours/neon-heart-pop/FlipTitleReveal';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { NeonFlipTitle } from '@cut3/agent-memory/units/neon-heart-pop/NeonFlipTitle';

/** Plain application output for the authored chromatic 3D title flip. */
export function neonFlipTitle(text) {
  const ghost = new Text(text);
  const title = new Text(text);
  const unit = new NeonFlipTitle(ghost, title);
  const { flip } = unit.animationTargets();
  const reveal = new FlipTitleReveal(flip);

  flip.addBehaviour(reveal);

  return unit;
}
