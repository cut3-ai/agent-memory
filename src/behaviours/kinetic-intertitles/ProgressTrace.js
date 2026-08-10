import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  lerp,
  progress,
} from '@cut3/agent-memory/core/timeline';
import {
  requireSplitSerifTarget,
  splitSerifTarget,
} from '@cut3/agent-memory/units/kinetic-intertitles/SplitSerifIntertitle';

const SHIMMER_VARIANTS = Object.freeze(['shimmer', 'shimmer-hold']);
/** Semantic filled-tear law coordinating authored fall, opacity and presence. */
export class ProgressTrace extends Behaviour {
  static kind = 'behaviour.kinetic-intertitles.progress-trace';

  #variant;

  constructor(unit) {
    super(requireSplitSerifTarget(unit, 'trace', 'ProgressTrace'));
    this.#variant = splitSerifTarget(unit, 'trace', 'ProgressTrace').variant;
  }

  onFrame({ fps, frame }) {
    if (SHIMMER_VARIANTS.includes(this.#variant)) {
      this.unit.present = false;
      this.unit.opacity = 0;
      this.unit.frame = { ...this.unit.frame, y: 64 };
      return;
    }

    const shimmerEnd = Math.round(fps * 0.6)
      + Math.round(fps * 0.06)
      + Math.round(fps * 0.38);
    const duration = Math.round(fps * 0.65);
    const amount = progress(frame, shimmerEnd, duration);
    const opacity = traceOpacity(frame, shimmerEnd, duration, fps);

    this.unit.present = true;
    this.unit.opacity = opacity;
    this.unit.frame = { ...this.unit.frame, y: 64 + (amount * 80) };
  }
}

function traceOpacity(frame, start, duration, fps) {
  const riseEnd = start + Math.round(fps * 0.1);
  const fallStart = start + duration - Math.round(fps * 0.3);
  const end = start + duration;
  if (frame <= riseEnd) return lerp(0, 0.9, progress(frame, start, riseEnd - start));
  if (frame <= fallStart) return lerp(0.9, 0.6, progress(frame, riseEnd, fallStart - riseEnd));
  return lerp(0.6, 0, progress(frame, fallStart, end - fallStart));
}
