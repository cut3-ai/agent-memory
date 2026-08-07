import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { lerp, progress, smoothstep } from '@cut3/agent-memory/core/timeline';

/** Keeps the next case file hidden until slats close, then develops it like a print. */
export class DossierSceneReveal extends Behaviour {
  static kind = 'behaviour.archival-dossier.scene-reveal';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.composition-pivot', 'DossierSceneReveal'));
  }

  onFrame({ frame }) {
    const reveal = smoothstep(progress(frame, 13, 7));
    this.unit.opacity = reveal;
    this.unit.pose = {
      ...this.unit.pose,
      scaleX: lerp(1.025, 1, reveal),
      scaleY: lerp(1.025, 1, reveal),
      y: lerp(18, 0, reveal),
    };
    this.unit.effects = {
      ...this.unit.effects,
      blur: lerp(5, 0, reveal),
      brightness: lerp(0.72, 1, reveal),
      contrast: lerp(1.28, 1.06, reveal),
      saturate: lerp(0.35, 0.82, reveal),
    };
  }
}
