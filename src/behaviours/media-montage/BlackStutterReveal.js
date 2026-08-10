import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import {
  cubicBezier,
  lerp,
  progress,
} from '@cut3/agent-memory/core/timeline';

const revealEase = cubicBezier(0.42, 0, 0.58, 1);
const STUTTERS = Object.freeze([0.24, 0.44, 0.64]);

/** Black reveal envelope with three impulses and its authored removal threshold. */
export class BlackStutterReveal extends Behaviour {
  static kind = 'behaviour.media-montage.black-stutter-reveal';

  #entranceFrames;

  constructor(unit, entranceFrames) {
    super(requireOwnerKind(
      unit,
      'unit.media-montage.first-clip-black-stutter',
      'BlackStutterReveal',
    ));
    this.#entranceFrames = entranceFrames;
  }

  onFrame({ frame }) {
    const amount = revealEase(progress(frame, 0, this.#entranceFrames));
    let opacity = lerp(1, 0, amount);
    for (const stutter of STUTTERS) {
      const distance = Math.abs(frame - (stutter * this.#entranceFrames));
      if (distance < 1.6) opacity += ((1.6 - distance) / 1.6) * 0.55;
    }
    const clamped = Math.min(1, opacity);
    this.unit.opacity = clamped > 0.001 ? clamped : 0;
    this.unit.paint = { ...this.unit.paint, fill: '#000000' };
  }
}
