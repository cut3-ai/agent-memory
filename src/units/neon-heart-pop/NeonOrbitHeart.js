import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';

const PARTICLE_OFFSETS = Object.freeze([
  0,
  Math.PI / 2,
  Math.PI,
  (3 * Math.PI) / 2,
]);

/** CSS-built hot-pink heart with four orbital lights and a late two-part caption. */
export class NeonOrbitHeart extends Layer {
  static kind = 'unit.neon-heart-pop.orbit-heart';

  #animationTargets;

  constructor(primary, accent) {
    requireText(primary, 'NeonOrbitHeart primary');
    requireText(accent, 'NeonOrbitHeart accent');
    if (primary === accent) throw new TypeError('NeonOrbitHeart requires distinct Text Units');

    const heart = new NeonOrbitHeartCore(new Box(undefined, {
      frame: { x: 50, y: 75, width: 100, height: 100 },
      paint: { fill: '#ff1493' },
      pose: { operations: [{ kind: 'rotate-z', degrees: -45 }] },
      name: 'neon-orbit-heart-square',
    }), {
      effects: {
        filters: [
          { kind: 'drop-shadow', x: 0, y: 0, blur: 15, color: '#ff1493' },
          { kind: 'drop-shadow', x: 0, y: 0, blur: 40, color: '#ff69b4' },
        ],
      },
      frame: { x: 0, y: 0, width: 200, height: 200, position: 'relative' },
      name: 'neon-orbit-heart-core',
      pose: { transformStyle: 'preserve-3d' },
    });
    heart.addUnit(new Box(undefined, {
      frame: { x: 25, y: 25, width: 100, height: 100 },
      paint: { fill: '#ff1493', radius: 50 },
      name: 'neon-orbit-heart-left-lobe',
    }));
    heart.addUnit(new Box(undefined, {
      frame: { x: 75, y: 25, width: 100, height: 100 },
      paint: { fill: '#ff1493', radius: 50 },
      name: 'neon-orbit-heart-right-lobe',
    }));

    const particles = PARTICLE_OFFSETS.map((offset, index) => (
      new NeonOrbitParticle(offset, index)
    ));
    const heartField = new Layer(particles[0], {
      frame: { x: '50%', y: '45%', width: 200, height: 200 },
      name: 'neon-orbit-heart-field',
      pose: {
        operations: [{ kind: 'translate-2d', x: '-50%', y: '-50%' }],
        perspective: 500,
      },
    });
    particles.slice(1).forEach((particle) => heartField.addUnit(particle));
    heartField.addUnit(heart);

    stylePrimary(primary);
    styleAccent(accent);
    const caption = new NeonOrbitCaption(primary, {
      frame: { x: '50%', bottom: 140, width: 'auto', height: 'auto' },
      layout: { align: 'center', gap: 12, justify: 'start' },
      name: 'neon-orbit-heart-caption',
      opacity: 0,
      pose: { operations: [{ kind: 'translate-x', value: '-50%' }] },
    });
    caption.addUnit(accent);

    super(heartField, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      name: 'neon-orbit-heart',
    });
    this.addUnit(caption);
    this.#animationTargets = Object.freeze({
      caption,
      heart,
      particles: Object.freeze(particles.map((owner, index) => Object.freeze({
        index,
        offset: PARTICLE_OFFSETS[index],
        owner,
      }))),
    });
  }

  /** Frozen semantic owners for heart, orbit and caption laws. */
  animationTargets() {
    return this.#animationTargets;
  }
}

class NeonOrbitHeartCore extends Layer {
  static kind = 'unit.neon-heart-pop.orbit-heart-core';
}

class NeonOrbitParticle extends Box {
  static kind = 'unit.neon-heart-pop.orbit-particle';

  constructor(offset, index) {
    super(undefined, {
      effects: {
        boxShadows: [{ x: 0, y: 0, blur: 6, spread: 0, color: 'rgba(255,255,255,0.8)' }],
      },
      frame: { x: 0, y: 0, width: 8, height: 8 },
      name: `neon-orbit-particle-${index + 1}`,
      paint: { fill: 'white', radius: 4 },
      pose: { operations: [{ kind: 'translate-2d', x: '-50%', y: '-50%' }] },
    });
    Object.defineProperties(this, {
      orbitIndex: { enumerable: true, value: index, writable: false },
      orbitOffset: { enumerable: true, value: offset, writable: false },
    });
  }
}

class NeonOrbitCaption extends Layout {
  static kind = 'unit.neon-heart-pop.orbit-caption';
}

function requireText(unit, name) {
  requireUnit(unit, name);
  requireDetachedUnit(unit, name);
  if (unit.constructor.kind !== 'unit.text') throw new TypeError(`${name} must be a Text Unit`);
}

function stylePrimary(unit) {
  unit.frame = { x: 0, y: 0, width: 'auto', height: 'auto', position: 'static' };
  unit.paint = { ...unit.paint, color: 'white' };
  unit.typography = {
    ...unit.typography,
    family: 'Bebas Neue',
    letterSpacing: 2,
    lineHeight: 'normal',
    shadows: [{ x: 0, y: 0, blur: 20, color: 'rgba(0,0,0,0.8)' }],
    size: 72,
    wrap: { ...unit.typography.wrap, whiteSpace: 'nowrap' },
  };
}

function styleAccent(unit) {
  unit.frame = { x: 0, y: 0, width: 'auto', height: 'auto', position: 'static' };
  unit.paint = { ...unit.paint, color: '#ff1493' };
  unit.pose = { ...unit.pose, operations: [{ kind: 'rotate-z', degrees: -3 }] };
  unit.typography = {
    ...unit.typography,
    family: 'Caveat',
    lineHeight: 'normal',
    shadows: [{ x: 0, y: 0, blur: 20, color: 'rgba(0,0,0,0.8)' }],
    size: 58,
    weight: 700,
    wrap: { ...unit.typography.wrap, whiteSpace: 'nowrap' },
  };
}
