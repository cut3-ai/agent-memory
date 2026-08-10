import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  easeOutCubic,
  lerp,
  progress,
  requireMotion,
} from '@cut3/agent-memory/core/timeline';
import {
  requireSplitSerifTarget,
  splitSerifTarget,
} from '@cut3/agent-memory/units/kinetic-intertitles/SplitSerifIntertitle';

const SHIMMER_VARIANTS = Object.freeze(['shimmer', 'shimmer-hold']);
const cubic = (value) => value ** 3;

/** Complete per-word serif law against the Unit-owned authored glow stack. */
export class SplitWordCadence extends Behaviour {
  static kind = 'behaviour.kinetic-intertitles.split-word-cadence';

  #count;
  #index;
  #variant;

  constructor(unit) {
    super(requireSplitSerifTarget(unit, 'word', 'SplitWordCadence'));
    const target = splitSerifTarget(unit, 'word', 'SplitWordCadence');
    this.#variant = target.variant;
    this.#index = target.index;
    this.#count = target.count;
  }

  onFrame(context) {
    const { duration, fps, frame } = context;
    const fadeOutDuration = Math.round(fps * 0.5);

    if (SHIMMER_VARIANTS.includes(this.#variant)) {
      const fadeOut = 1 - cubic(progress(
        frame,
        duration - fadeOutDuration,
        fadeOutDuration,
      ));
      const fadeInDuration = Math.round(fps * 0.6);
      const fadeIn = easeOutCubic(progress(frame, 0, fadeInDuration));
      const wordDuration = Math.round(fps * 0.3);
      const start = fadeInDuration + (this.#index * Math.round(fps * 0.16));
      const midpoint = start + (wordDuration * 0.5);
      const scale = frame <= midpoint
        ? lerp(1, 1.055, progress(frame, start, midpoint - start))
        : lerp(1.055, 1, progress(frame, midpoint, start + wordDuration - midpoint));

      this.unit.opacity = fadeIn * fadeOut;
      this.unit.pose = { ...this.unit.pose, scaleX: scale, scaleY: scale, x: 0, y: 0 };
      return;
    }

    const fadeOut = 1 - progress(frame, duration - fadeOutDuration, fadeOutDuration);
    const fadeInDuration = Math.round(fps * 0.6);
    const wordFrame = frame - (this.#index * fadeInDuration / this.#count);
    const wordOpacity = progress(wordFrame, 0, Math.round(fps * 0.12));
    const scale = 0.7 + (requireMotion(context, 'SplitWordCadence').spring({
      frame: wordFrame,
      fps,
      config: { damping: 15, stiffness: 85, mass: 0.55 },
    }) * 0.3);

    this.unit.opacity = wordOpacity * fadeOut;
    this.unit.pose = { ...this.unit.pose, scaleX: scale, scaleY: scale, x: 0, y: 0 };
  }
}
