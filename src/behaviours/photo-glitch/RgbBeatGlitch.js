import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { lerp, progress } from '@cut3/agent-memory/core/timeline';
import { ghostState } from '@cut3/agent-memory/units/photo-glitch/RgbGlitchStage';

const BEAT_FRAMES = 22.3;

/** Four-frame RGB ghost burst and deterministic horizontal beat jitter. */
export class RgbBeatGlitch extends Behaviour {
  static kind = 'behaviour.photo-glitch.rgb-beat-glitch';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.photo-glitch.rgb-stage', 'RgbBeatGlitch'));
  }

  onFrame({ frame }) {
    const index = Math.floor(frame / BEAT_FRAMES);
    const beatPhase = frame % BEAT_FRAMES;
    const glitching = beatPhase < 4;
    const strength = glitching ? lerp(5, 0, progress(beatPhase, 0, 4)) : 0;
    this.unit.glitchStrength = strength;
    this.unit.mediaEpoch = index;
    this.unit.rgbGhosts = ghostState(strength);
    this.unit.pose = {
      ...this.unit.pose,
      operations: [{
        kind: 'translate-x',
        value: glitching ? Math.sin(frame * 7.3) * strength * 0.8 : 0,
      }],
      x: 0,
      y: 0,
    };
    this.unit.opacity = 1;
  }
}
