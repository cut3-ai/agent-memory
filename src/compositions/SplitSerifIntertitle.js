import { ProgressTrace } from '@cut3/agent-memory/behaviours/kinetic-intertitles/ProgressTrace';
import { ShimmerSweep } from '@cut3/agent-memory/behaviours/kinetic-intertitles/ShimmerSweep';
import { SplitWordCadence } from '@cut3/agent-memory/behaviours/kinetic-intertitles/SplitWordCadence';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { SplitSerifIntertitle } from '@cut3/agent-memory/units/kinetic-intertitles/SplitSerifIntertitle';

/** Plain application output for runtime serif words and their complete typed accents. */
export function splitSerifIntertitle(text, variant) {
  const words = text.split(' ').map((word) => new Text(word));
  const unit = new SplitSerifIntertitle(words, variant);
  const targets = unit.animationTargets();
  const cadences = targets.words.map(
    (target) => new SplitWordCadence(target.owner),
  );
  const shimmer = new ShimmerSweep(targets.sweep.owner);
  const progress = new ProgressTrace(targets.trace.owner);

  targets.words.forEach((target, index) => target.owner.addBehaviour(cadences[index]));
  targets.sweep.owner.addBehaviour(shimmer);
  targets.trace.owner.addBehaviour(progress);

  return unit;
}
