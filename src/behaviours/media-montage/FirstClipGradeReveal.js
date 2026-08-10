import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import {
  cubicBezier,
  easeOut,
  lerp,
  progress,
} from '@cut3/agent-memory/core/timeline';

const quad = (value) => value * value;
const brightnessEase = cubicBezier(0.4, 0, 0.6, 1);

/** First-clip color recovery coordinating saturation, contrast and brightness. */
export class FirstClipGradeReveal extends Behaviour {
  static kind = 'behaviour.media-montage.first-clip-grade-reveal';

  #entranceFrames;

  constructor(unit, entranceFrames) {
    super(requireOwnerKind(unit, 'unit.video', 'FirstClipGradeReveal'));
    this.#entranceFrames = entranceFrames;
  }

  onFrame({ frame }) {
    const linear = progress(frame, 0, this.#entranceFrames);
    const soft = easeOut(quad)(linear);
    const bright = brightnessEase(linear);
    this.unit.effects = {
      ...this.unit.effects,
      brightness: 1,
      contrast: 1,
      saturate: 1,
      filters: [
        { kind: 'saturate', amount: lerp(0.35, 1, soft) },
        { kind: 'contrast', amount: lerp(1.55, 1, soft) },
        { kind: 'brightness', amount: lerp(0.55, 1, bright) },
      ],
    };
    this.unit.opacity = 1;
  }
}
