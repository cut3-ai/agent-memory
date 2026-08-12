import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import {
  easeOutCubic,
  frameNoise,
  lerp,
  progress,
} from '@cut3/agent-memory/core/timeline';

/**
 * Complete chalk-drawing law: stroke draw-in, chalk dust, eraser smudge, text reveal.
 * Designed for a 72-frame (2 400 ms at 30 fps) timeline.
 */
export class ChalkStrokeDraw extends Behaviour {
  static kind = 'behaviour.chalkboard.stroke-draw';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.chalkboard.slate', 'ChalkStrokeDraw'));
  }

  onFrame({ frame }) {
    const { content, dust, eraser, stroke } = this.unit.animationTargets();

    // Stroke draws from left to right over the first ~1.2 s
    const strokeP = easeOutCubic(progress(frame, 0, 36));
    stroke.draw = { start: 0, end: strokeP };

    // Chalk width jitter — slight pressure variation as hand moves
    const widthJitter = frameNoise(frame, 1) * 1.6;
    stroke.paint = { ...stroke.paint, strokeWidth: 7 + widthJitter };

    // Chalk text fades in once the stroke is roughly half drawn
    content.opacity = easeOutCubic(progress(frame, 14, 22));

    // Dust puff tracks the drawing tip: rises then dissipates
    const dustOn = progress(frame, 2, 38);
    const dustOff = easeOutCubic(progress(frame, 46, 14));
    const dustJitter = Math.abs(frameNoise(frame, 2)) * 0.3;
    dust.opacity = lerp(0, 0.65 + dustJitter, dustOn) * (1 - dustOff);

    // Eraser smudge appears near the end, then fades before the composition closes
    const eraseOn = easeOutCubic(progress(frame, 52, 12));
    const eraseOff = progress(frame, 65, 7);
    eraser.opacity = lerp(0, 0.48, eraseOn) * (1 - eraseOff);
  }
}
