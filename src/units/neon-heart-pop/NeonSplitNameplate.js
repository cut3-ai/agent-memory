import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';

const PARTICLES = Object.freeze([
  Object.freeze({ x: -180, y: -40, delay: 0, size: 6 }),
  Object.freeze({ x: -120, y: -70, delay: 0.3, size: 5 }),
  Object.freeze({ x: 140, y: -50, delay: 0.6, size: 7 }),
  Object.freeze({ x: 180, y: -20, delay: 0.9, size: 4 }),
  Object.freeze({ x: -160, y: 10, delay: 1.2, size: 8 }),
  Object.freeze({ x: 160, y: 15, delay: 1.5, size: 6 }),
  Object.freeze({ x: -100, y: 30, delay: 1.8, size: 5 }),
  Object.freeze({ x: 120, y: 40, delay: 2.1, size: 7 }),
]);

/** Split royal nameplate with a title, handwritten counter-line and authored gold particles. */
export class NeonSplitNameplate extends Layout {
  static kind = 'unit.neon-heart-pop.split-nameplate';

  #animationTargets;

  constructor(primary, accent, label) {
    const content = [primary, accent, label];
    content.forEach((unit, index) => requireText(unit, `NeonSplitNameplate text ${index + 1}`));
    if (new Set(content).size !== content.length) {
      throw new TypeError('NeonSplitNameplate requires distinct Text Units');
    }

    styleText(primary, {
      family: 'Bebas Neue', size: 160, weight: 700, letterSpacing: 10,
      color: '#fff', shadows: [
        { x: 0, y: 0, blur: 30, color: 'rgba(255,255,255,0.5)' },
        { x: 0, y: 4, blur: 20, color: 'rgba(0,0,0,0.8)' },
      ],
    });
    styleText(accent, {
      family: 'Caveat', size: 110, weight: 700, letterSpacing: 0,
      color: '#FFD700', shadows: [
        { x: 0, y: 0, blur: 20, color: 'rgba(255,215,0,0.6)' },
        { x: 0, y: 3, blur: 15, color: 'rgba(0,0,0,0.7)' },
      ],
    });
    styleText(label, {
      family: 'Arial, sans-serif', size: 28, weight: 300, letterSpacing: 10,
      color: '#fff', transform: 'uppercase', shadows: [
        { x: 0, y: 2, blur: 10, color: 'rgba(0,0,0,0.8)' },
      ],
    });

    primary.frame = { x: 0, y: 0, width: 'auto', height: 'auto', position: 'static' };
    accent.frame = { x: 0, y: 0, width: '100%', height: 'auto', position: 'static' };
    label.frame = {
      x: 0,
      y: 0,
      width: 'auto',
      height: 'auto',
      position: 'relative',
    };

    const particles = PARTICLES.map((recipe) => new NeonGoldParticle(recipe));
    const primaryStage = new NeonSplitPrimaryStage(primary, {
      frame: { x: 0, y: 0, width: 'auto', height: 'auto', position: 'relative' },
      name: 'neon-split-primary-stage',
    });
    const accentStage = new NeonSplitAccentStage(accent, {
      frame: { x: 0, y: -20, width: '100%', height: 'auto', position: 'relative' },
      name: 'neon-split-accent-stage',
    });
    particles.forEach((particle, index) => {
      primaryStage.addUnit(particle);
    });
    const contentStage = new Layer(primaryStage, {
      frame: {
        x: 0,
        y: 10,
        width: 'auto',
        height: 'auto',
        position: 'relative',
      },
      name: 'neon-split-content-stage',
    });
    contentStage.addUnit(accentStage);
    const labelStage = new NeonSplitLabelStage(label, {
      frame: { x: 0, right: 0, bottom: 80, width: 'auto', height: 'auto' },
      name: 'neon-split-label-stage',
      opacity: 0,
    });
    super(contentStage, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      layout: { align: 'center', justify: 'center' },
      name: 'neon-split-nameplate',
    });
    this.addUnit(labelStage);
    this.#animationTargets = Object.freeze([
      target(primaryStage, 'primary-stage', 0, 0),
      target(accentStage, 'accent-stage', 0, 0),
      target(labelStage, 'label-stage', 0, 0),
      ...particles.map((owner, index) => target(
        owner,
        'particle',
        index,
        PARTICLES[index].delay,
      )),
    ]);
  }

  /** Frozen semantic owners in authored attachment order. */
  animationTargets() {
    return this.#animationTargets;
  }
}

class NeonSplitPrimaryStage extends Layer {
  static kind = 'unit.neon-heart-pop.split-primary-stage';
}

class NeonSplitAccentStage extends Layer {
  static kind = 'unit.neon-heart-pop.split-accent-stage';
}

class NeonSplitLabelStage extends Layer {
  static kind = 'unit.neon-heart-pop.split-label-stage';
}

class NeonGoldParticle extends Box {
  static kind = 'unit.neon-heart-pop.gold-particle';

  constructor(recipe) {
    super(undefined, {
      effects: {
        boxShadows: [{ x: 0, y: 0, blur: 8, spread: 0, color: '#FFD700' }],
      },
      frame: {
        x: `calc(50% + ${recipe.x}px)`,
        y: `calc(50% + ${recipe.y}px)`,
        width: recipe.size,
        height: recipe.size,
      },
      paint: { fill: '#FFD700', radius: recipe.size / 2 },
    });
  }
}

export const neonSplitParticleRecipes = PARTICLES;

function requireText(unit, name) {
  requireUnit(unit, name);
  requireDetachedUnit(unit, name);
  if (unit.constructor.kind !== 'unit.text') throw new TypeError(`${name} must be a Text Unit`);
}

function styleText(unit, options) {
  unit.paint = { ...unit.paint, color: options.color };
  unit.typography = {
    ...unit.typography,
    align: 'center',
    family: options.family,
    letterSpacing: options.letterSpacing,
    lineHeight: 'normal',
    shadows: options.shadows,
    size: options.size,
    style: 'normal',
    transform: options.transform ?? 'none',
    weight: options.weight,
    wrap: { ...unit.typography.wrap, whiteSpace: 'nowrap' },
  };
}

function target(owner, role, index, delay) {
  return Object.freeze({ delay, index, owner, role });
}
