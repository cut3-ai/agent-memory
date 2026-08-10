import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { easeOutCubic, interpolateRange } from '@cut3/agent-memory/core/timeline';

const CLAMP = Object.freeze({
  easing: easeOutCubic,
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});

/** Complete 300ms chromatic word-stack overshoot and settle. */
export class ChromaStackPop extends Behaviour {
  static kind = 'behaviour.neon-heart-pop.chroma-stack-pop';

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.neon-heart-pop.chroma-word-stack', 'ChromaStackPop'));
  }

  onFrame({ fps, frame }) {
    const duration = Math.round((300 / 1000) * fps);
    const scale = interpolateRange(
      frame,
      [0, duration * 0.6, duration],
      [0, 1.08, 1],
      CLAMP,
    );
    this.unit.pose = {
      ...this.unit.pose,
      operations: [
        { kind: 'translate-2d', x: '-50%', y: '-50%' },
        { kind: 'scale-2d', x: scale, y: scale },
      ],
    };
  }
}
