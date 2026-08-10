import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { springValue } from '@cut3/agent-memory/core/timeline';
import { requireHeartTarget } from '@cut3/agent-memory/units/sculptural-3d/sculpturalSemantics';

/** One beat-synchronous law for sculpture punch, aura, light and particle orbit. */
export class HeartPulseOrbit extends Behaviour {
  static kind = 'behaviour.sculptural-3d.heart-pulse-orbit';

  #variant;

  constructor(unit) {
    const target = requireHeartTarget(unit);
    super(unit);
    this.#variant = target.variant;
  }

  onFrame({ fps, frame }) {
    const bpm = this.#variant === 'slow-pulse' ? 117.5 : 161.5;
    const beatFrames = (fps * 60) / bpm;
    const beat = springValue({
      frame: frame % beatFrames,
      fps,
      config: { damping: 7, stiffness: 210, mass: 0.22 },
    });
    const punch = 1 - beat;
    const scale = 1.1 + (0.28 * punch);
    this.unit.motion = {
      aura: {
        innerOpacity: 0.11 + (0.3 * punch),
        outerOpacity: 0.04 + (0.22 * punch),
      },
      particles: { orbitFrame: frame },
      pulseLight: { intensity: 3 + (5 * punch) },
      sculpture: {
        position: [0, Math.sin(frame * 0.034) * 15, 0],
        rotation: [0, frame * 0.0065, 0],
        scale: [scale, scale, scale],
      },
    };
  }
}
