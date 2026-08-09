import { BoilingInk } from '@cut3/agent-memory/behaviours/fight-zine/BoilingInk';
import { ZineRowStagger } from '@cut3/agent-memory/behaviours/fight-zine/ZineRowStagger';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { FightZineRankRow } from '@cut3/agent-memory/units/fight-zine/FightZineRankRow';

/** Plain output builder for one runtime fight-zine ranking row. */
export function fightZineRankRow(rank, name, value, gain) {
  const unit = new FightZineRankRow(
    new Text(rank),
    new Text(name),
    new Text(value),
    new Text(gain),
  );
  const entry = new ZineRowStagger(unit);
  const animation = new BoilingInk(unit);

  unit.addBehaviour(entry);
  unit.addBehaviour(animation);

  return unit;
}
