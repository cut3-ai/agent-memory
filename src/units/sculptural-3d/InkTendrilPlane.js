import { Unit } from '@cut3/agent-memory/core/Unit';
import { bindInkTarget } from '@cut3/agent-memory/units/sculptural-3d/sculpturalSemantics';

const CAPABILITY = Object.freeze({
  contract: 'ink-tendril-plane/v1',
  kind: 'native-sculptural-scene',
});
const SCENE = Object.freeze({
  form: 'full-frame-ink-tendrils',
  framing: 'orthographic-cover',
  treatment: 'procedural-monochrome-reveal',
});

/** Semantic full-frame ink reveal; its host owns the procedural implementation. */
export class InkTendrilPlane extends Unit {
  static kind = 'unit.sculptural-3d.ink-tendril-plane';

  #animationTargets;

  constructor() {
    super();
    this.capability = CAPABILITY;
    this.frame = Object.freeze({ x: 0, y: 0, width: 1080, height: 1920 });
    this.height = 1920;
    this.name = 'ink-tendril-plane';
    this.opacity = 1;
    this.present = true;
    this.reveal = {
      aspect: 1080 / 1920,
      progress: 0,
      time: 0,
    };
    this.scene = SCENE;
    this.width = 1080;
    this.#animationTargets = Object.freeze([bindInkTarget(this)]);
  }

  get plane() {
    return this;
  }

  animationTargets() {
    return this.#animationTargets;
  }
}
