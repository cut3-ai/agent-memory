import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  interpolateRange,
  springValue,
} from '@cut3/agent-memory/core/timeline';
import { fightZineTitleWordRecipes } from '@cut3/agent-memory/units/fight-zine/FightZineTitle';

const CLAMP = Object.freeze({ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const KINDS = Object.freeze({
  'border-stage': 'unit.fight-zine.title-border-scene',
  content: 'unit.fight-zine.title-content',
  grid: 'unit.fight-zine.title-grid',
  stage: 'unit.fight-zine.title',
  word: 'unit.fight-zine.title-word',
});

/** Complete boiling-title law for the paper stage, border, content and words. */
export class FightZineTitleCadence extends Behaviour {
  static kind = 'behaviour.fight-zine.title-cadence';

  #index;
  #role;

  constructor(unit, role, index = 0) {
    super(requireTitleOwner(unit, role, index));
    this.#role = String(role);
    this.#index = Number(index);
  }

  onFrame({ duration, fps, frame }) {
    if (this.#role === 'stage') {
      const exitStart = duration - Math.round(fps * 0.5);
      this.unit.opacity = interpolateRange(frame, [exitStart, duration - 1], [1, 0], {
        ...CLAMP,
        easing: cubicIn,
      });
      const scale = interpolateRange(frame, [exitStart, duration - 1], [1, 1.12], CLAMP);
      this.unit.pose = { ...this.unit.pose, scaleX: scale, scaleY: scale };
      return;
    }

    const appear = interpolateRange(frame, [0, 8], [0, 1], CLAMP);
    const x = boil(1.1, frame, 4);
    const y = boil(2.2, frame, 4);
    if (this.#role === 'grid') {
      this.unit.opacity = 0.05 * appear;
      return;
    }
    if (this.#role === 'border-stage') {
      this.unit.opacity = appear;
      this.unit.pose = { ...this.unit.pose, x, y };
      return;
    }
    if (this.#role === 'content') {
      this.unit.pose = { ...this.unit.pose, x: x * 0.6, y: y * 0.6 };
      return;
    }

    const recipe = fightZineTitleWordRecipes[this.#index];
    const spring = springValue({
      frame: frame - recipe.delay,
      fps,
      config: { damping: 13, stiffness: 150, mass: 0.8 },
    });
    const scale = interpolateRange(spring, [0, 1], [0.4, 1], CLAMP);
    const translateY = interpolateRange(spring, [0, 1], [70, 0], CLAMP);
    this.unit.opacity = spring;
    this.unit.pose = {
      ...this.unit.pose,
      rotate: recipe.rotate + boil(20 + (this.#index * 5), frame, 1.4),
      scaleX: scale,
      scaleY: scale,
      y: translateY,
    };
    const shadowX = 2 + boil(30 + this.#index, frame, 1);
    const shadowY = 2 + boil(31 + this.#index, frame, 1);
    this.unit.typography = {
      ...this.unit.typography,
      shadows: [{ x: shadowX, y: shadowY, blur: 0, color: 'rgba(20,20,20,0.18)' }],
    };
  }
}

function requireTitleOwner(unit, role, index) {
  const validIndex = role !== 'word'
    || (Number.isInteger(Number(index))
      && Number(index) >= 0
      && Number(index) < fightZineTitleWordRecipes.length
      && unit?.wordIndex === Number(index));
  if (!validIndex || unit?.constructor?.kind !== KINDS[role]) {
    throw new TypeError('FightZineTitleCadence requires an authored semantic owner');
  }
  return unit;
}

function boil(seed, frame, amplitude) {
  const bucket = Math.floor(frame / 2);
  const sample = Math.sin((seed * 12.9898) + (bucket * 78.233)) * 43_758.5453;
  return (sample - Math.floor(sample) - 0.5) * 2 * amplitude;
}

function cubicIn(value) {
  return value ** 3;
}
