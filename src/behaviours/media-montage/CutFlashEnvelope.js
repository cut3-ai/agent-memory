import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { lerp, progress } from '@cut3/agent-memory/core/timeline';

/** Three-frame white flash coupled to every montage cut. */
export class CutFlashEnvelope extends Behaviour {
  static kind = 'behaviour.media-montage.cut-flash-envelope';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.media-montage.cut-flash-plate', 'CutFlashEnvelope'));
  }

  onFrame({ frame }) {
    this.unit.opacity = lerp(0.35, 0, progress(frame, 0, 3));
    this.unit.paint = { ...this.unit.paint, fill: '#ffffff' };
  }
}
