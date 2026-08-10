import { Unit } from '@cut3/agent-memory/core/Unit';
import { bindScissorTarget } from '@cut3/agent-memory/units/sculptural-3d/sculpturalSemantics';

const VARIANTS = Object.freeze(['impact', 'minimal']);
const CAPABILITIES = Object.freeze({
  impact: Object.freeze({
    contract: 'scissors-impact/v1',
    kind: 'native-sculptural-scene',
  }),
  minimal: Object.freeze({
    contract: 'scissors-minimal/v1',
    kind: 'native-sculptural-scene',
  }),
});
const SCENES = Object.freeze({
  impact: Object.freeze({
    form: 'open-scissors',
    framing: 'upper-stage-impact',
    lighting: 'cold-metal-punch',
    treatment: 'polished-cobalt',
  }),
  minimal: Object.freeze({
    form: 'floating-open-scissors',
    framing: 'portrait-center',
    lighting: 'soft-neutral-metal',
    treatment: 'brushed-silver',
  }),
});

/** Semantic scissors scene; native shape, light and surface work belongs to its host. */
export class SculpturalScissorsHero extends Unit {
  static kind = 'unit.sculptural-3d.scissors-hero';

  #animationTargets;

  constructor(variant) {
    const recipe = String(variant);
    if (!VARIANTS.includes(recipe)) {
      throw new TypeError('SculpturalScissorsHero variant is not authored');
    }
    super();
    const height = recipe === 'impact' ? 1440 : 1920;
    this.capability = CAPABILITIES[recipe];
    this.frame = Object.freeze({ x: 0, y: 0, width: 1080, height });
    this.height = height;
    this.motion = recipe === 'impact' ? impactMotion() : minimalMotion();
    this.name = `sculptural-scissors-${recipe}`;
    this.opacity = 1;
    this.present = true;
    this.scene = SCENES[recipe];
    this.variant = recipe;
    this.width = 1080;
    this.#animationTargets = Object.freeze([
      bindScissorTarget(this, recipe, `${recipe}-scene`),
    ]);
  }

  animationTargets() {
    return this.#animationTargets;
  }

  /** The complete scene motion is projected by one owner-first law. */
  motionTargets() {
    return this.#animationTargets;
  }
}

function impactMotion() {
  return {
    blades: [
      pose([0, 0, 0], [0, 0, 0.67], [1, 1, 1]),
      pose([0, 0, 0], [0, 0, -0.67], [1, -1, 1]),
    ],
    sculpture: pose([0, 0, 0], [0, 0, 0], [1, 1, 1]),
  };
}

function minimalMotion() {
  return {
    blades: [
      pose([0, 0, 0.04], [0, 0, 0], [1, 1, 1]),
      pose([0, 0, -0.04], [0, 0, 0], [1, 1, 1]),
    ],
    entrance: pose([0, 1.1, 0], [0, 0, 0], [0, 0, 0]),
    sculpture: pose([0, 0, 0], [0.1, 0, 0], [1, 1, 1]),
  };
}

function pose(position, rotation, scale) {
  return { position, rotation, scale };
}
