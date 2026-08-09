import { BoneIdleHop } from '@cut3/agent-memory/behaviours/retro-ritual/BoneIdleHop';
import { RitualCardDeal } from '@cut3/agent-memory/behaviours/retro-ritual/RitualCardDeal';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { RitualOfferCard } from '@cut3/agent-memory/units/retro-ritual/RitualOfferCard';

/** Plain Norman-shaped output produced by an online coding agent. */
export function ritualOffer(text) {
  const unit = new RitualOfferCard(new Text(text));
  const entry = new RitualCardDeal(unit);
  const animation = new BoneIdleHop(unit);

  unit.addBehaviour(entry);
  unit.addBehaviour(animation);

  return unit;
}
