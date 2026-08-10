import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';

const BEAT_FRAMES = 22.3;

/** Complete beat-local exposure cadence for the authored vignette scene layer. */
export class BeatExposureCadence extends Behaviour {
  static kind = 'behaviour.photo-glitch.beat-vignette-flicker';

  constructor(unit) {
    super(requireOwnerKind(
      unit,
      'unit.photo-glitch.beat-exposure-vignette',
      'BeatExposureCadence',
    ));
  }

  onFrame({ frame }) {
    const beatIndex = Math.floor(frame / BEAT_FRAMES);
    const beatLocalFrame = frame - (beatIndex * BEAT_FRAMES);
    const oscillation = frame * 0.9;
    const level = 0.6 + (Math.sin(oscillation) * 0.04);
    this.unit.exposureCadence = {
      beatIndex,
      beatLocalFrame,
      level,
      oscillation,
    };
    this.unit.exposureLevel = level;
    this.unit.opacity = level;
    this.unit.present = true;
  }
}

export { BeatExposureCadence as BeatVignetteFlicker };
