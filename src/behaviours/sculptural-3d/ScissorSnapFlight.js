import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  easeOutCubic,
  interpolateRange,
  progress,
  springValue,
} from '@cut3/agent-memory/core/timeline';
import { requireScissorTarget } from '@cut3/agent-memory/units/sculptural-3d/sculpturalSemantics';

/** Complete sculptural-scissors law: entrance, snap, float and authored exit/fade. */
export class ScissorSnapFlight extends Behaviour {
  static kind = 'behaviour.sculptural-3d.scissor-snap-flight';

  #variant;

  constructor(unit) {
    const target = requireScissorTarget(unit);
    super(unit);
    this.#variant = target.variant;
  }

  onFrame({ duration, fps, frame }) {
    if (this.#variant === 'impact') {
      const flight = springValue({
        frame,
        fps,
        config: { damping: 18, stiffness: 90, mass: 0.9 },
      });
      const exit = progress(frame, Math.round(fps * 2.5), Math.round(fps * 0.5)) ** 3;
      const scale = flight * (1 - exit);
      const snapDuration = fps * 0.35;
      const snap = interpolateRange(
        frame - Math.round(fps * 0.65),
        [0, snapDuration * 0.5, snapDuration],
        [1, 0.02, 0.08],
        {
          easing: easeOutCubic,
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        },
      );
      this.unit.motion = {
        blades: [
          pose([0, 0, 0], [0, 0, 0.22 + (snap * 0.45)], [1, 1, 1]),
          pose([0, 0, 0], [0, 0, -0.22 - (snap * 0.45)], [1, -1, 1]),
        ],
        sculpture: pose(
          [8 - (8 * flight), Math.sin(frame * 0.025) * 0.12, 0],
          [Math.sin(frame * 0.018) * 0.04, 0, -0.08],
          [scale, scale, scale],
        ),
      };
      return;
    }

    const fadeFrames = Math.round(fps * 0.5);
    const fadeOutStart = duration - fadeFrames;
    const entrance = springValue({
      frame: frame - 10,
      fps,
      config: { damping: 18, stiffness: 50, mass: 1.4 },
    });
    const open = springValue({
      frame,
      fps,
      config: { damping: 20, stiffness: 60, mass: 1.2 },
    }) * 0.32;
    this.unit.opacity = interpolateRange(
      frame,
      [0, fadeFrames, fadeOutStart, duration],
      [0, 1, 1, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );
    this.unit.motion = {
      blades: [
        pose([0, 0, 0.04], [0, 0, -open], [1, 1, 1]),
        pose([0, 0, -0.04], [0, 0, open], [1, 1, 1]),
      ],
      entrance: pose([0, 1.1, 0], [0, 0, 0], [entrance, entrance, entrance]),
      sculpture: pose(
        [0, Math.sin(frame * 0.035) * 0.06, 0],
        [0.1, Math.sin(frame * 0.018) * 0.18, 0],
        [1, 1, 1],
      ),
    };
  }
}

function pose(position, rotation, scale) {
  return { position, rotation, scale };
}
