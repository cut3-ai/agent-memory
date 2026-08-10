import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import {
  easeOut,
  lerp,
  progress,
} from '@cut3/agent-memory/core/timeline';

const quad = (value) => value * value;

/** Radial vignette release coordinating aperture, edge density and authored removal. */
export class VignetteRelease extends Behaviour {
  static kind = 'behaviour.media-montage.vignette-release';

  #entranceFrames;

  constructor(unit, entranceFrames) {
    super(requireOwnerKind(
      unit,
      'unit.media-montage.first-clip-vignette',
      'VignetteRelease',
    ));
    this.#entranceFrames = entranceFrames;
  }

  onFrame({ frame }) {
    const amount = easeOut(quad)(progress(frame, 0, this.#entranceFrames));
    const inner = lerp(0.06, 0.62, amount);
    const edgeOpacity = lerp(0.92, 0, amount);
    this.unit.opacity = edgeOpacity > 0.001 ? 1 : 0;
    this.unit.paint = {
      ...this.unit.paint,
      backgrounds: [{
        kind: 'radial-gradient',
        shape: 'circle',
        position: { x: '50%', y: '50%' },
        stops: [
          { offset: inner, color: 'transparent' },
          { offset: 1, color: `rgba(0,0,0,${edgeOpacity})` },
        ],
        blendMode: 'normal',
      }],
    };
  }
}
