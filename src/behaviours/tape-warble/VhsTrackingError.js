import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { clamp } from '@cut3/agent-memory/core/timeline';
import { requireVhsSignalTarget } from '@cut3/agent-memory/units/tape-warble/VhsTrackingField';

/**
 * VHS tape tracking error: sync roll band scrolling from bottom to top,
 * tape warble/wow-flutter displacement, and timecode frame counter.
 * Drives frameState on the owned VhsSignal each frame.
 */
export class VhsTrackingError extends Behaviour {
  static kind = 'behaviour.tape-warble.vhs-tracking-error';

  constructor(signal) {
    const target = requireVhsSignalTarget(signal);
    super(target.owner);
  }

  onFrame({ frame, duration, fps }) {
    // Warp amplitude ramps up fast (first 20% of duration) then holds at full
    const warpAmplitude = clamp(frame / (duration * 0.2));

    // Sync roll: two complete top-to-bottom traversals over the full duration
    // Progress cycles 0→1 twice; syncRollY goes 1920 → 0 (bottom to top)
    const rollCycles = 2;
    const rollPhase = ((frame / duration) * rollCycles) % 1;
    const syncRollY = 1920 * (1 - rollPhase);

    this.unit.frameState = {
      frame,
      fps,
      syncRollY,
      warpAmplitude,
    };
  }
}
