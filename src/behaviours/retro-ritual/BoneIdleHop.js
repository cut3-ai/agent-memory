import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';

/** Norman-inspired low-resolution hop: integer position, held frames, hard shadow. */
export class BoneIdleHop extends Behaviour {
  static kind = 'behaviour.retro-ritual.bone-idle-hop';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.retro-ritual.offer-card', 'BoneIdleHop'));
  }

  onFrame({ frame }) {
    const phase = (Math.floor(frame / 2) % 12) / 12;
    const hop = Math.max(0, Math.sin(phase * Math.PI));
    const height = Math.round(hop * -12);
    const groundedSquash = hop === 0 ? 0.025 : 0;
    this.unit.pose = {
      ...this.unit.pose,
      rotate: this.unit.pose.rotate + Math.round(Math.sin(phase * Math.PI * 2) * 1.5),
      scaleX: this.unit.pose.scaleX * (1 + groundedSquash),
      scaleY: this.unit.pose.scaleY * (1 - groundedSquash),
      y: this.unit.pose.y + height,
    };
    this.unit.effects = {
      ...this.unit.effects,
      blur: 0,
      contrast: Math.max(this.unit.effects.contrast, 1.24),
      shadow: frame < 16
        ? this.unit.effects.shadow
        : `${8 + Math.round(hop * 5)}px ${10 + Math.round(hop * 7)}px 0 #09060f`,
    };
  }
}
