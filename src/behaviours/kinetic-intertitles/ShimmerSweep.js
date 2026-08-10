import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  easeOutCubic,
  lerp,
  progress,
} from '@cut3/agent-memory/core/timeline';
import {
  requireSplitSerifTarget,
  splitSerifTarget,
} from '@cut3/agent-memory/units/kinetic-intertitles/SplitSerifIntertitle';

const SHIMMER_VARIANTS = Object.freeze(['shimmer', 'shimmer-hold']);
const cubic = (value) => value ** 3;

/** Typed traveling highlight with authored serif entrance and hold envelopes. */
export class ShimmerSweep extends Behaviour {
  static kind = 'behaviour.kinetic-intertitles.shimmer-sweep';

  #variant;

  constructor(unit) {
    super(requireSplitSerifTarget(unit, 'sweep', 'ShimmerSweep'));
    this.#variant = splitSerifTarget(unit, 'sweep', 'ShimmerSweep').variant;
  }

  onFrame({ duration, fps, frame }) {
    const fadeOutDuration = Math.round(fps * 0.5);
    const fadeInDuration = Math.round(fps * 0.6);

    if (SHIMMER_VARIANTS.includes(this.#variant)) {
      const fadeOut = 1 - cubic(progress(
        frame,
        duration - fadeOutDuration,
        fadeOutDuration,
      ));
      const fadeIn = easeOutCubic(progress(frame, 0, fadeInDuration));
      const start = fadeInDuration + Math.round(fps * 0.08);
      const amount = progress(frame, start, Math.round(fps * 1.05));

      this.unit.present = true;
      this.unit.opacity = sweepOpacity(amount) * fadeIn * fadeOut;
      this.unit.frame = { ...this.unit.frame, x: lerp(-280, 280, amount), y: 0 };
      return;
    }

    this.unit.present = false;
    this.unit.opacity = 0;
    this.unit.frame = { ...this.unit.frame, x: 0, y: 0 };
  }
}

function sweepOpacity(amount) {
  if (amount <= 0.08) return lerp(0, 0.45, progress(amount, 0, 0.08));
  if (amount <= 0.92) return 0.45;
  return lerp(0.45, 0, progress(amount, 0.92, 0.08));
}
