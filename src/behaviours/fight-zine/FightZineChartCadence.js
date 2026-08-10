import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  cubicBezier,
  interpolateRange,
  springValue,
} from '@cut3/agent-memory/core/timeline';

const CLAMP = Object.freeze({ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const BALANCED = cubicBezier(0.45, 0, 0.55, 1);
const KINDS = Object.freeze({
  doodle: 'unit.fight-zine.chart-doodle',
  'falling-callout': 'unit.fight-zine.chart-callout',
  'falling-endpoint': 'unit.fight-zine.chart-endpoint',
  grid: 'unit.fight-zine.grid-scene',
  plot: 'unit.fight-zine.chart-plot-stage',
  'rising-callout': 'unit.fight-zine.chart-callout',
  'rising-endpoint': 'unit.fight-zine.chart-endpoint',
  stage: 'unit.fight-zine.chart',
  subtitle: 'unit.fight-zine.chart-subtitle-stage',
  title: 'unit.fight-zine.chart-title-stage',
});

/** Complete chart cadence: paper exit, marker shake, headings and endpoint callouts. */
export class FightZineChartCadence extends Behaviour {
  static kind = 'behaviour.fight-zine.chart-cadence';

  #role;

  constructor(unit, role) {
    super(requireChartOwner(unit, role));
    this.#role = String(role);
  }

  onFrame({ duration, fps, frame }) {
    if (this.#role === 'stage') {
      const exitStart = duration - Math.round(fps * 0.5);
      this.unit.opacity = interpolateRange(frame, [exitStart, duration - 1], [1, 0], {
        ...CLAMP,
        easing: cubicIn,
      });
      const scale = interpolateRange(frame, [exitStart, duration - 1], [1, 1.06], CLAMP);
      this.unit.pose = { ...this.unit.pose, scaleX: scale, scaleY: scale };
      return;
    }

    const appear = interpolateRange(frame, [0, 10], [0, 1], CLAMP);
    if (this.#role === 'grid') {
      this.unit.opacity = 0.06 * appear;
      return;
    }
    if (this.#role === 'plot') {
      this.unit.opacity = appear;
      this.unit.pose = {
        ...this.unit.pose,
        x: Math.sin(frame * 0.5) * 1.2,
        y: Math.cos(frame * 0.43) * 1.2,
      };
      return;
    }
    if (this.#role === 'title') {
      const title = springValue({
        frame: frame - 4,
        fps,
        config: { damping: 16, stiffness: 110 },
      });
      this.unit.opacity = title;
      this.unit.pose = {
        ...this.unit.pose,
        rotate: jitter(99, 1.5),
        y: interpolateRange(title, [0, 1], [-40, 0], CLAMP),
      };
      return;
    }
    if (this.#role === 'subtitle') {
      this.unit.opacity = interpolateRange(frame, [8, 22], [0, 0.8], CLAMP);
      return;
    }

    const rising = this.#role.startsWith('rising') || this.#role === 'doodle';
    const value = springValue({
      frame: frame - (rising ? 74 : 82),
      fps,
      config: { damping: 12, stiffness: 140, mass: 0.7 },
    });
    if (this.#role.endsWith('endpoint')) {
      const draw = interpolateRange(
        frame,
        rising ? [12, 70] : [20, 78],
        [0, 1],
        { ...CLAMP, easing: BALANCED },
      );
      this.unit.opacity = draw > 0.98 ? 1 : 0;
      return;
    }
    this.unit.opacity = value;
    if (this.#role.endsWith('callout')) {
      this.unit.pose = {
        ...this.unit.pose,
        rotate: rising ? -6 + jitter(7, 2) : 5 + jitter(8, 2),
        scaleX: value,
        scaleY: value,
      };
    }
  }
}

function requireChartOwner(unit, role) {
  if (unit?.constructor?.kind !== KINDS[role]) {
    throw new TypeError('FightZineChartCadence requires an authored semantic owner');
  }
  return unit;
}

function jitter(seed, amplitude) {
  const sample = Math.sin(seed * 12.9898) * 43_758.5453;
  return (sample - Math.floor(sample) - 0.5) * 2 * amplitude;
}

function cubicIn(value) {
  return value ** 3;
}
