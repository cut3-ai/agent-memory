import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOutlinedWordCueTarget } from '@cut3/agent-memory/units/outlined-word-card/OutlinedWordGroup';

/** Complete hard-cue persistence law for one closed semantic outlined-word owner. */
export class WordCueState extends Behaviour {
  static kind = 'behaviour.outlined-word-card.word-cue-state';

  #appearFrame;
  #disappearFrame;

  constructor(unit, index) {
    const binding = requireOutlinedWordCueTarget(unit, index);
    super(binding.owner);
    this.#appearFrame = binding.cue.appearFrame;
    this.#disappearFrame = binding.cue.disappearFrame;
  }

  onFrame({ frame }) {
    this.unit.present = frame >= this.#appearFrame && frame < this.#disappearFrame;
  }
}
