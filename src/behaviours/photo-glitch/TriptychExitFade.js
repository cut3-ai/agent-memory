import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { progress } from '@cut3/agent-memory/core/timeline';

const REVEAL_END_FRAME = 24;

/** Complete reveal/hold/exit cadence for the complete masked triptych scene. */
export class TriptychSceneCadence extends Behaviour {
  static kind = 'behaviour.photo-glitch.triptych-exit';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.photo-glitch.masked-triptych', 'TriptychSceneCadence'));
  }

  onFrame({ duration, fps, frame }) {
    const exitDuration = Math.round(fps * 0.4);
    const reveal = progress(frame, 0, REVEAL_END_FRAME);
    const exit = progress(frame, duration - exitDuration, exitDuration);
    const phase = exit > 0 ? 'exit' : reveal < 1 ? 'reveal' : 'hold';
    this.unit.sceneCadence = { exit, phase, reveal };
    this.unit.opacity = 1 - (exit ** 3);
    this.unit.present = exit < 1;
  }
}

export { TriptychSceneCadence as TriptychExitFade };
