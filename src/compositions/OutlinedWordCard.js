import { WordCueState } from '@cut3/agent-memory/behaviours/outlined-word-card/WordCueState';
import { OutlinedWordGroup } from '@cut3/agent-memory/units/outlined-word-card/OutlinedWordGroup';

/** Plain application output: runtime copy, cue sheet, semantic Unit, owner-first laws. */
export function outlinedWordCard(words, cues) {
  const unit = new OutlinedWordGroup(words, cues);
  const cadence = unit.animationTargets().map(
    ({ owner, index }) => new WordCueState(owner, index),
  );

  cadence.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));

  return unit;
}
