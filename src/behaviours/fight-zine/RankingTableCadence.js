import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  easeOutCubic,
  interpolateRange,
  springValue,
} from '@cut3/agent-memory/core/timeline';
import { requireFightZineTableTarget } from '@cut3/agent-memory/units/fight-zine/FightZineRankingTable';

const CLAMP = Object.freeze({ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const TICKS = Object.freeze([18, 26, 34, 42, 50]);

/** Complete table reveal: paper exit, marker vibration, row settles and score ticks. */
export class RankingTableCadence extends Behaviour {
  static kind = 'behaviour.fight-zine.ranking-table-cadence';

  #index;
  #role;

  constructor(unit, role, index = 0) {
    super(requireTableOwner(unit, role, index));
    this.#role = String(role);
    this.#index = Number(index);
  }

  onFrame({ duration, fps, frame }) {
    if (this.#role === 'stage') {
      const exitStart = duration - Math.round(fps * 0.4);
      this.unit.opacity = interpolateRange(frame, [exitStart, duration - 1], [1, 0], {
        ...CLAMP,
        easing: cubicIn,
      });
      return;
    }
    const appear = interpolateRange(frame, [0, 8], [0, 1], CLAMP);
    if (this.#role === 'grid') {
      this.unit.opacity = 0.05 * appear;
      return;
    }
    const x = boil(1.1, frame, 3.5);
    const y = boil(2.2, frame, 3.5);
    if (this.#role === 'rule-stage' || this.#role === 'rows-stage') {
      const amount = this.#role === 'rows-stage' ? 0.6 : 1;
      this.unit.opacity = this.#role === 'rule-stage' ? appear : 1;
      this.unit.pose = { ...this.unit.pose, x: x * amount, y: y * amount };
      return;
    }
    if (this.#role === 'title') {
      this.unit.opacity = appear;
      this.unit.pose = { ...this.unit.pose, rotate: boil(99, frame, 1) };
      return;
    }
    if (this.#role === 'subtitle') {
      this.unit.opacity = appear * 0.8;
      return;
    }
    if (this.#role === 'row') {
      const amount = springValue({
        frame: frame - (4 + (this.#index * 3)),
        fps,
        config: { damping: 18, stiffness: 130 },
      });
      this.unit.opacity = amount;
      this.unit.pose = {
        ...this.unit.pose,
        operations: [{
          kind: 'translate-x',
          value: `${interpolateRange(amount, [0, 1], [-120, 0])}px`,
        }],
      };
      return;
    }
    if (this.#role === 'row-rank') {
      this.unit.pose = {
        ...this.unit.pose,
        operations: [{ kind: 'rotate-z', degrees: boil(80 + this.#index, frame, 2) }],
      };
      return;
    }
    const tickAt = TICKS[this.#index];
    if (this.#role === 'score') {
      const tick = interpolateRange(frame, [tickAt, tickAt + 10], [0, 1], {
        ...CLAMP,
        easing: easeOutCubic,
      });
      const pop = 1 + interpolateRange(
        frame,
        [tickAt, tickAt + 4, tickAt + 12],
        [0, 0.22, 0],
        CLAMP,
      );
      this.unit.text = String(Math.round(this.unit.baseScore + (this.unit.gain * tick)));
      this.unit.pose = {
        ...this.unit.pose,
        operations: [
          { kind: 'scale-2d', x: pop, y: pop },
          { kind: 'rotate-z', degrees: boil(70 + (this.#index * 5), frame, 1.2) },
        ],
      };
      return;
    }
    const badge = springValue({
      frame: frame - tickAt,
      fps,
      config: { damping: 10, stiffness: 170, mass: 0.7 },
    });
    this.unit.opacity = badge;
    this.unit.pose = {
      ...this.unit.pose,
      operations: [
        { kind: 'scale-2d', x: badge, y: badge },
        { kind: 'rotate-z', degrees: -8 + boil(90 + this.#index, frame, 2) },
      ],
    };
  }
}

function requireTableOwner(unit, role, index) {
  const numericIndex = Number(index);
  if (['row', 'row-rank', 'score', 'badge'].includes(role)
      && (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= TICKS.length)) {
    throw new TypeError('RankingTableCadence requires an authored semantic owner');
  }
  return requireFightZineTableTarget(unit, role, numericIndex);
}

function boil(seed, frame, amplitude) {
  const bucket = Math.floor(frame / 2);
  const sample = Math.sin((seed * 12.9898) + (bucket * 78.233)) * 43_758.5453;
  return (sample - Math.floor(sample) - 0.5) * 2 * amplitude;
}

function cubicIn(value) {
  return value ** 3;
}
