import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  cubicBezier,
  interpolateRange,
} from '@cut3/agent-memory/core/timeline';
import { requireFightZineTableTarget } from '@cut3/agent-memory/units/fight-zine/FightZineRankingTable';

const CLAMP = Object.freeze({ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const BALANCED = cubicBezier(0.45, 0, 0.55, 1);

/** Complete marker-line law for chart traces, boiling borders and table rules. */
export class MarkerScrawlTrace extends Behaviour {
  static kind = 'behaviour.fight-zine.marker-scrawl-trace';

  #family;
  #index;
  #role;

  constructor(unit, family, role, index = 0) {
    super(requireTraceOwner(unit, family, role, index));
    this.#family = String(family);
    this.#role = String(role);
    this.#index = Number(index);
    if (!Number.isInteger(this.#index) || this.#index < 0) {
      throw new TypeError('MarkerScrawlTrace index must be a non-negative integer');
    }
  }

  onFrame({ frame }) {
    if (this.#family === 'chart') {
      const windows = {
        axis: [0, 16],
        'falling-echo': [20, 78],
        'falling-primary': [20, 78],
        'rising-echo': [12, 70],
        'rising-primary': [12, 70],
      };
      this.unit.traceProgress = interpolateRange(frame, windows[this.#role], [0, 1], {
        ...CLAMP,
        easing: this.#role === 'axis' ? undefined : BALANCED,
      });
      return;
    }

    if (this.#family === 'title' && this.#role.startsWith('border')) {
      this.unit.boilBucket = Math.floor(frame / 2);
      this.unit.traceProgress = interpolateRange(frame, [2, 28], [0, 1], CLAMP);
      return;
    }

    if (this.#family === 'title') {
      const echo = this.#role === 'underline-echo';
      this.unit.boilBucket = Math.floor(frame / 2);
      this.unit.traceProgress = interpolateRange(
        frame,
        echo ? [34, 52] : [30, 48],
        [0, 1],
        CLAMP,
      );
      return;
    }

    const start = 4 + (this.#index * 3);
    this.unit.boilBucket = Math.floor(frame / 2);
    this.unit.traceProgress = interpolateRange(frame, [start, start + 12], [0, 1], CLAMP);
  }
}

function requireTraceOwner(unit, family, role, index) {
  const kind = unit?.constructor?.kind;
  const valid = family === 'chart'
    ? kind === 'unit.fight-zine.chart-stroke' && unit.traceRole === role
    : family === 'title'
      ? kind === 'unit.fight-zine.title-stroke' && unit.traceRole === role
      : family === 'table'
        ? Boolean(requireFightZineTableTarget(unit, 'rule', index))
        : false;
  if (!valid) throw new TypeError('MarkerScrawlTrace requires an authored marker owner');
  return unit;
}
