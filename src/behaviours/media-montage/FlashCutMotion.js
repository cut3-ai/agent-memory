import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import {
  clamp,
  cubicBezier,
  finite,
  lerp,
  progress,
  springValue,
} from '@cut3/agent-memory/core/timeline';

const MODES = Object.freeze(['hard', 'in', 'out', 'bounce']);
const easeIn = cubicBezier(0.42, 0, 1, 1);
const easeOut = cubicBezier(0, 0, 0.58, 1);

/** Complete per-cut camera law for hard, eased and spring montage recipes. */
export class FlashCutMotion extends Behaviour {
  static kind = 'behaviour.media-montage.flash-cut-motion';

  #duration;
  #mode;
  #scaleFrom;
  #scaleTo;

  constructor(unit, mode, duration, scaleFrom, scaleTo) {
    super(requireOwnerKind(unit, 'unit.video', 'FlashCutMotion'));
    this.#mode = String(mode);
    if (!MODES.includes(this.#mode)) throw new TypeError('FlashCutMotion mode is not authored');
    this.#duration = finite(duration, 'FlashCutMotion duration');
    this.#scaleFrom = finite(scaleFrom, 'FlashCutMotion scaleFrom');
    this.#scaleTo = finite(scaleTo, 'FlashCutMotion scaleTo');
    if (this.#duration <= 0) throw new RangeError('FlashCutMotion duration must be positive');
  }

  onFrame({ fps, frame }) {
    let amount;
    if (this.#mode === 'hard') amount = frame === 0 ? 0 : 1;
    else if (this.#mode === 'in') amount = easeIn(progress(frame, 0, this.#duration));
    else if (this.#mode === 'out') amount = easeOut(progress(frame, 0, this.#duration));
    else amount = clamp(springValue({
      frame,
      fps,
      config: { damping: 10, stiffness: 200, mass: 0.6 },
    }));

    const scale = lerp(this.#scaleFrom, this.#scaleTo, amount);
    this.unit.pose = { ...this.unit.pose, scaleX: scale, scaleY: scale, x: 0, y: 0 };
    this.unit.opacity = 1;
  }
}
