import { ChromaStackPop } from '@cut3/agent-memory/behaviours/neon-heart-pop/ChromaStackPop';
import {
  DualLineGlitchCadence,
} from '@cut3/agent-memory/behaviours/neon-heart-pop/DualLineGlitchCadence';
import {
  SplitNameplateCadence,
} from '@cut3/agent-memory/behaviours/neon-heart-pop/SplitNameplateCadence';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { NeonChromaWordStack } from '@cut3/agent-memory/units/neon-heart-pop/NeonChromaWordStack';
import { NeonDualLineGlitch } from '@cut3/agent-memory/units/neon-heart-pop/NeonDualLineGlitch';
import {
  NeonSplitNameplate,
} from '@cut3/agent-memory/units/neon-heart-pop/NeonSplitNameplate';

/** Plain application output for the authored three-word chromatic stack. */
export function neonChromaWordStack(words) {
  const layers = words.map((word) => [new Text(word), new Text(word), new Text(word)]);
  const unit = new NeonChromaWordStack(layers);
  const pop = new ChromaStackPop(unit);

  unit.addBehaviour(pop);

  return unit;
}

/** Plain application output for the authored split royal nameplate. */
export function neonSplitNameplate(primaryText, accentText, labelText) {
  const primary = new Text(primaryText);
  const accent = new Text(accentText);
  const label = new Text(labelText);
  const unit = new NeonSplitNameplate(primary, accent, label);
  const cadences = unit.animationTargets().map(
    ({ owner, role, delay }) => new SplitNameplateCadence(owner, role, delay),
  );

  cadences.forEach((cadence) => cadence.unit.addBehaviour(cadence));

  return unit;
}

/** Plain application output for the authored two-line RGB glitch plate. */
export function neonDualLineGlitch(firstText, secondText) {
  const first = [new Text(firstText), new Text(firstText), new Text(firstText)];
  const second = [new Text(secondText), new Text(secondText), new Text(secondText)];
  const unit = new NeonDualLineGlitch(first, second);
  const cadences = unit.animationTargets().map(
    ({ owner, role }) => new DualLineGlitchCadence(owner, role),
  );

  cadences.forEach((cadence) => cadence.unit.addBehaviour(cadence));

  return unit;
}
