import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  lerp,
  progress,
} from '@cut3/agent-memory/core/timeline';
import {
  impactCaptionTarget,
  requireImpactCaptionTarget,
} from '@cut3/agent-memory/units/kinetic-intertitles/ScanlineImpactCaption';

/** Typed CRT scanline law coupled to completion of the impact-letter cadence. */
export class ImpactScanlineSweep extends Behaviour {
  static kind = 'behaviour.kinetic-intertitles.impact-scanline-sweep';

  #count;
  #variant;

  constructor(unit) {
    super(requireImpactCaptionTarget(unit, 'scanline', 'ImpactScanlineSweep'));
    const target = impactCaptionTarget(unit, 'scanline', 'ImpactScanlineSweep');
    this.#variant = target.variant;
    this.#count = target.count;
  }

  onFrame({ frame }) {
    if (this.#variant === 'spring-breath') {
      this.unit.present = false;
      this.unit.opacity = 0;
      this.unit.frame = { ...this.unit.frame, y: -12 };
      return;
    }

    const start = (this.#count * 5) + 12;
    const amount = progress(frame, start, 22);
    this.unit.present = amount > 0;
    this.unit.opacity = sweepOpacity(amount);
    this.unit.frame = { ...this.unit.frame, y: lerp(-12, 108, amount) };
  }
}

function sweepOpacity(amount) {
  if (amount <= 0.08) return lerp(0, 0.9, progress(amount, 0, 0.08));
  if (amount <= 0.92) return 0.9;
  return lerp(0.9, 0, progress(amount, 0.92, 0.08));
}
