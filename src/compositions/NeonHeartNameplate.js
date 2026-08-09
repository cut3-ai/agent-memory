import { ChromaPopSettle } from '@cut3/agent-memory/behaviours/neon-heart-pop/ChromaPopSettle';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { NeonChromaNameplate } from '@cut3/agent-memory/units/neon-heart-pop/NeonChromaNameplate';

export function neonHeartNameplate(primary, accent) {
  const unit = new NeonChromaNameplate(new Text(primary), new Text(accent));
  const settle = new ChromaPopSettle(unit);

  unit.addBehaviour(settle);

  return unit;
}
