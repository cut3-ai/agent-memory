import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { cubicBezier, interpolateRange } from '@cut3/agent-memory/core/timeline';

const LANDING = cubicBezier(0.16, 1, 0.3, 1);
const CLAMP = Object.freeze({ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** Complete two-line RGB landing and luminous-divider cadence on semantic owners. */
export class DualLineGlitchCadence extends Behaviour {
  static kind = 'behaviour.neon-heart-pop.dual-line-glitch-cadence';

  #role;

  constructor(unit, role) {
    super(requireCadenceOwner(unit, role));
    this.#role = String(role);
  }

  onFrame({ fps, frame }) {
    if (this.#role === 'rule') {
      const start = Math.round((250 / 1000) * fps);
      const end = start + Math.round((150 / 1000) * fps);
      this.unit.opacity = interpolateRange(frame, [start, end], [0, 1], CLAMP);
      return;
    }

    const first = this.#role === 'first-line';
    const start = first ? 0 : Math.round((80 / 1000) * fps);
    const end = start + Math.round((200 / 1000) * fps);
    const origin = first ? -500 : 500;
    const x = interpolateRange(frame, [start, end], [origin, 0], {
      ...CLAMP,
      easing: LANDING,
    });
    const glitch = first ? Math.sin(frame * 2.3) * 4 : 0;
    this.unit.pose = {
      ...this.unit.pose,
      operations: [
        { kind: 'translate-x', value: x + glitch },
        ...(!first ? [{ kind: 'rotate-z', degrees: -4 }] : []),
      ],
    };
  }
}

function requireCadenceOwner(unit, role) {
  const expected = role === 'rule'
    ? 'unit.neon-heart-pop.glitch-rule'
    : 'unit.neon-heart-pop.glitch-line';
  const authoredRole = role === 'rule'
    || (role === 'first-line' && unit?.line === 1)
    || (role === 'second-line' && unit?.line === 2);
  if (!authoredRole || unit?.constructor?.kind !== expected) {
    throw new TypeError('DualLineGlitchCadence requires an authored semantic owner');
  }
  return unit;
}
