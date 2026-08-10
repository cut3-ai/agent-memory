import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { VectorPath } from '@cut3/agent-memory/units/base/VectorPath';

const STAR_RECIPES = Object.freeze([
  Object.freeze({ x: -140, y: -80, offset: 0 }),
  Object.freeze({ x: 140, y: -80, offset: 5 }),
  Object.freeze({ x: -160, y: 40, offset: 10 }),
  Object.freeze({ x: 160, y: 40, offset: 15 }),
  Object.freeze({ x: 0, y: 140, offset: 20 }),
]);

/** Hot-pink vector heart and five authored twinkle points in a 3D perspective field. */
export class NeonSpinningHeart extends Layer {
  static kind = 'unit.neon-heart-pop.spinning-heart';

  #animationTargets;

  constructor() {
    const heartPath = new VectorPath([
      { command: 'move', x: 140, y: 50 },
      { command: 'cubic', x1: 140, y1: 30, x2: 110, y2: 20, x: 90, y: 40 },
      { command: 'cubic', x1: 70, y1: 60, x2: 70, y2: 90, x: 90, y: 110 },
      { command: 'line', x: 140, y: 160 },
      { command: 'line', x: 190, y: 110 },
      { command: 'cubic', x1: 210, y1: 90, x2: 210, y2: 60, x: 190, y: 40 },
      { command: 'cubic', x1: 170, y1: 20, x2: 140, y2: 30, x: 140, y: 50 },
      { command: 'close' },
    ], {
      frame: { x: 0, y: 0, width: 280, height: 280, position: 'static' },
      paint: { fill: '#ff1493' },
      viewBox: [0, 0, 280, 280],
    });
    const heart = new NeonSpinningHeartCore(heartPath, {
      effects: {
        filters: [
          { kind: 'drop-shadow', x: 0, y: 0, blur: 20, color: '#ff1493' },
          { kind: 'drop-shadow', x: 0, y: 0, blur: 50, color: '#ff69b4' },
        ],
      },
      frame: { x: 0, y: 0, width: 280, height: 280, position: 'static' },
      name: 'neon-spinning-heart-core',
      pose: { transformStyle: 'preserve-3d' },
    });
    const stars = STAR_RECIPES.map((recipe, index) => new NeonTwinkleStar(recipe, index));
    const field = new Layout(heart, {
      frame: { x: '50%', y: '30%', width: 280, height: 280 },
      layout: { align: 'center', justify: 'center' },
      name: 'neon-spinning-heart-field',
      pose: {
        operations: [{ kind: 'translate-x', value: '-50%' }],
        perspective: 600,
      },
    });
    stars.forEach((star) => field.addUnit(star));
    super(field, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      name: 'neon-spinning-heart',
    });
    this.#animationTargets = Object.freeze({
      heart,
      stars: Object.freeze(stars.map((owner, index) => Object.freeze({
        index,
        offset: STAR_RECIPES[index].offset,
        owner,
      }))),
    });
  }

  /** Frozen semantic owners for the heart burst and five-point constellation. */
  animationTargets() {
    return this.#animationTargets;
  }
}

class NeonSpinningHeartCore extends Layer {
  static kind = 'unit.neon-heart-pop.spinning-heart-core';
}

class NeonTwinkleStar extends Text {
  static kind = 'unit.neon-heart-pop.twinkle-star';

  constructor(recipe, index) {
    super('\u2726', {
      frame: {
        x: `calc(50% + ${recipe.x}px)`,
        y: `calc(50% + ${recipe.y}px)`,
        width: 'auto',
        height: 'auto',
      },
      paint: { color: '#ff69b4' },
      pose: { operations: [{ kind: 'translate-2d', x: '-50%', y: '-50%' }] },
      typography: {
        family: 'Times New Roman, serif',
        lineHeight: 'normal',
        shadows: [{ x: 0, y: 0, blur: 10, color: '#ff1493' }],
        size: 36,
      },
    });
    Object.defineProperty(this, 'starIndex', {
      enumerable: true,
      value: index,
      writable: false,
    });
  }
}
