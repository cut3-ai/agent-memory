import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { lerp, progress, smoothstep } from '@cut3/agent-memory/core/timeline';

/** Heavy evidence card: pin-first drop with three authored rotational settles. */
export class PinnedEvidenceDrop extends Behaviour {
  static kind = 'behaviour.archival-dossier.pinned-evidence-drop';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.composition-pivot', 'PinnedEvidenceDrop'));
  }

  onFrame({ frame }) {
    const fall = smoothstep(progress(frame, 0, 10));
    const rotation = frame < 10
      ? lerp(-8.5, 2.4, fall)
      : frame < 16
        ? lerp(2.4, -0.9, smoothstep(progress(frame, 10, 6)))
        : lerp(-0.9, -0.25, smoothstep(progress(frame, 16, 8)));
    this.unit.opacity = progress(frame, 0, 3);
    this.unit.pose = {
      ...this.unit.pose,
      rotate: rotation,
      scaleX: lerp(1.08, 1, fall),
      scaleY: lerp(0.9, 1, fall),
      x: lerp(-26, 0, fall),
      y: lerp(-310, 0, fall),
    };
    this.unit.effects = {
      ...this.unit.effects,
      blur: lerp(9, 0, fall),
      brightness: lerp(1.18, 0.96, fall),
      contrast: 1.08,
      shadow: `${Math.round(lerp(30, 18, fall))}px ${Math.round(lerp(38, 24, fall))}px 0 rgba(38,31,25,.42)`,
    };
  }
}
