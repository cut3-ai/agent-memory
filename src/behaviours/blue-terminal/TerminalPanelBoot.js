import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import {
  easeOutBack,
  easeOutCubic,
  lerp,
  progress,
} from '@cut3/agent-memory/core/timeline';

/** Pixel-stepped cobalt boot with an ice flash and deep terminal settle. */
export class TerminalPanelBoot extends Behaviour {
  static kind = 'behaviour.blue-terminal.panel-boot';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.blue-terminal.message-panel', 'TerminalPanelBoot'));
  }

  onFrame({ frame }) {
    const entrance = easeOutBack(progress(frame, 0, 18), 1.72);
    const focus = easeOutCubic(progress(frame, 0, 12));
    const stepped = Math.round(entrance * 16) / 16;
    const bootFlash = frame < 12 && Math.floor(frame) % 4 === 0 ? 0.42 : 0;

    this.unit.opacity = progress(frame, 0, 3);
    this.unit.pose = {
      ...this.unit.pose,
      rotate: lerp(-2.5, 0, stepped),
      scaleX: lerp(0.78, 1, stepped),
      scaleY: lerp(0.56, 1, stepped),
      x: Math.round(lerp(-24, 0, stepped)),
      y: Math.round(lerp(86, 0, stepped)),
    };
    this.unit.effects = {
      ...this.unit.effects,
      blur: 0,
      brightness: lerp(1.32, 1, focus) + bootFlash,
      contrast: lerp(1.34, 1.12, focus),
      saturate: 1.08,
      shadow: frame < 10
        ? '24px 28px 0 #4488ff'
        : `${Math.round(lerp(24, 12, focus))}px ${Math.round(lerp(28, 16, focus))}px 0 #001055`,
    };
  }
}
