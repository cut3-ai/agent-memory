import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  interpolateRange,
  progress,
  springValue,
} from '@cut3/agent-memory/core/timeline';
import {
  impactAtmosphere,
  minimalMarkShadows,
  snapFlashGradient,
} from '@cut3/agent-memory/units/sculptural-3d/SculpturalScissorsStage';
import { requireScissorStageTarget } from '@cut3/agent-memory/units/sculptural-3d/sculpturalSemantics';

/** One full-stage law for authored light fields, copy entrance, pulse and exit. */
export class ScissorsStageCadence extends Behaviour {
  static kind = 'behaviour.sculptural-3d.scissors-stage-cadence';

  #role;

  constructor(unit) {
    const target = requireScissorStageTarget(unit);
    super(unit);
    this.#role = target.role;
  }

  onFrame({ duration, fps, frame }) {
    if (this.#role === 'minimal-stage') {
      const fadeFrames = Math.round(fps * 0.5);
      this.unit.opacity = interpolateRange(
        frame,
        [0, fadeFrames, duration - fadeFrames, duration],
        [0, 1, 1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      );
      return;
    }
    if (this.#role === 'minimal-copy-group') {
      const entrance = springValue({
        frame,
        fps,
        config: { damping: 22, stiffness: 55, mass: 1 },
      });
      const y = interpolateRange(entrance, [0, 1], [60, 0]);
      const scale = interpolateRange(entrance, [0, 1], [0.75, 1]);
      this.unit.pose = {
        ...this.unit.pose,
        operations: [
          { kind: 'translate-y', value: y },
          { kind: 'scale-2d', x: scale, y: scale },
        ],
      };
      return;
    }
    if (this.#role === 'minimal-mark') {
      const signal = Math.sin(frame * 0.07);
      const glow = interpolateRange(signal, [-1, 1], [18, 38]);
      this.unit.opacity = interpolateRange(signal, [-1, 1], [0.6, 1]);
      this.unit.typography = {
        ...this.unit.typography,
        shadows: minimalMarkShadows(glow),
      };
      return;
    }

    const globalOpacity = interpolateRange(frame, [0, 4], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const exit = progress(frame, Math.round(fps * 2.5), Math.round(fps * 0.5)) ** 3;
    const exitOpacity = 1 - exit;
    const shimmer = interpolateRange(Math.sin(frame * 0.07), [-1, 1], [0.85, 1.15]);
    if (this.#role === 'impact-large-glow') {
      this.unit.opacity = globalOpacity * exitOpacity * shimmer;
      return;
    }
    if (this.#role === 'impact-core-glow') {
      const idleFloat = Math.sin(frame * 0.025) * 6;
      this.unit.opacity = globalOpacity * exitOpacity;
      this.unit.pose = {
        ...this.unit.pose,
        operations: [{
          kind: 'translate-2d',
          x: '-50%',
          y: `calc(-50% + ${idleFloat}px)`,
        }],
      };
      return;
    }
    if (this.#role === 'impact-atmosphere') {
      this.unit.opacity = globalOpacity * exitOpacity * 0.6;
      this.unit.paint = {
        ...this.unit.paint,
        backgrounds: [impactAtmosphere(frame * 0.5)],
      };
      return;
    }
    if (this.#role === 'impact-snap-flash') {
      const start = Math.round(fps * 0.9);
      const flash = interpolateRange(frame, [start, start + 4, start + 10], [0, 0.55, 0], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      });
      this.unit.paint = {
        ...this.unit.paint,
        backgrounds: [snapFlashGradient(flash)],
      };
      return;
    }
    if (this.#role === 'impact-copy-group') {
      const entrance = springValue({
        frame: frame - 5,
        fps,
        config: { damping: 20, stiffness: 85, mass: 0.8 },
      });
      const scale = entrance * exitOpacity;
      const idleBob = Math.sin(frame * 0.033) * 3;
      this.unit.opacity = globalOpacity * exitOpacity;
      this.unit.pose = {
        ...this.unit.pose,
        operations: [
          { kind: 'scale-2d', x: scale, y: scale },
          { kind: 'translate-y', value: idleBob },
        ],
      };
      return;
    }
    if (this.#role === 'impact-mark') {
      this.unit.effects = { ...this.unit.effects, brightness: shimmer };
      return;
    }
    this.unit.effects = { ...this.unit.effects, blur: 0.5, brightness: shimmer };
  }
}
