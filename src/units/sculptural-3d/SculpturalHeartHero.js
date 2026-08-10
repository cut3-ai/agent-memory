import { Unit } from '@cut3/agent-memory/core/Unit';
import { bindHeartTarget } from '@cut3/agent-memory/units/sculptural-3d/sculpturalSemantics';

const VARIANTS = Object.freeze(['slow-pulse', 'fast-pulse']);
const CAPABILITY = Object.freeze({
  contract: 'heart-hero/v1',
  kind: 'native-sculptural-scene',
});
const SCENE = Object.freeze({
  aura: 'concentric-crimson-glow',
  form: 'centered-extruded-heart',
  framing: 'portrait-center',
  lighting: 'pulse-linked-crimson',
  particles: Object.freeze({ count: 80, treatment: 'orbiting-embers' }),
});

/** Semantic heart scene; a host capability owns its visual implementation. */
export class SculpturalHeartHero extends Unit {
  static kind = 'unit.sculptural-3d.heart-hero';

  #animationTargets;

  constructor(variant) {
    const recipe = String(variant);
    if (!VARIANTS.includes(recipe)) {
      throw new TypeError('SculpturalHeartHero variant is not authored');
    }
    super();
    this.capability = CAPABILITY;
    this.frame = Object.freeze({ x: 0, y: 0, width: 1080, height: 1920 });
    this.height = 1920;
    this.motion = initialHeartMotion();
    this.name = 'sculptural-heart-hero';
    this.opacity = 1;
    this.present = true;
    this.scene = SCENE;
    this.variant = recipe;
    this.width = 1080;
    this.#animationTargets = Object.freeze([
      bindHeartTarget(this, recipe, 'heart-scene'),
    ]);
  }

  animationTargets() {
    return this.#animationTargets;
  }
}

function initialHeartMotion() {
  return {
    aura: { innerOpacity: 0.11, outerOpacity: 0.04 },
    particles: { orbitFrame: 0 },
    pulseLight: { intensity: 3 },
    sculpture: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  };
}
