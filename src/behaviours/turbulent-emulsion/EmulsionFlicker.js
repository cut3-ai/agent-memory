import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  requireEmulsionTarget,
} from '@cut3/agent-memory/units/turbulent-emulsion/emulsionSemantics';

const CUE_FRAMES = Object.freeze([4, 20, 34, 98, 113, 130, 142]);

/** Complete hard-cue presence and authored grain-exposure breath law. */
export class EmulsionFlicker extends Behaviour {
  static kind = 'behaviour.turbulent-emulsion.flicker';

  #variant;
  #role;
  #index;

  constructor(unit) {
    const target = requireEmulsionTarget(unit, 'flicker');
    super(target.owner);
    this.#variant = target.variant;
    this.#role = target.role;
    this.#index = target.index;
  }

  onFrame({ frame }) {
    if (this.#role === 'cue') {
      this.unit.present = frame >= CUE_FRAMES[this.#index];
      return;
    }
    if (this.#variant === 'soft-grain') {
      this.unit.opacity = 0.0325 + (Math.sin(frame * 0.2) * 0.0075);
      return;
    }
    if (this.#variant === 'dense-grain') {
      this.unit.opacity = 0.39 + (Math.sin(frame * 0.9) * 0.03);
      return;
    }
    this.unit.opacity = 0.38 + (Math.sin(frame * 0.75) * 0.03);
  }
}
