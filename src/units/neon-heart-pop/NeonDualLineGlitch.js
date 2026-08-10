import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layout } from '@cut3/agent-memory/units/base/Layout';

/** Two authored RGB-registered lines separated by a hot-pink luminous rule. */
export class NeonDualLineGlitch extends Layout {
  static kind = 'unit.neon-heart-pop.dual-line-glitch';

  #animationTargets;

  constructor(firstLayers, secondLayers) {
    validateLayers(firstLayers, 'first');
    validateLayers(secondLayers, 'second');
    if (new Set([...firstLayers, ...secondLayers]).size !== 6) {
      throw new TypeError('NeonDualLineGlitch requires distinct Units');
    }

    styleLayers(firstLayers, {
      family: 'Bebas Neue', size: 140, weight: 700, letterSpacing: 6,
      mainColor: '#ffffff', mainShadow: 'rgba(0,0,0,0.5)', rotate: 0,
    });
    styleLayers(secondLayers, {
      family: 'Caveat', size: 120, weight: 700, letterSpacing: 0,
      mainColor: '#ff1493', mainShadow: 'rgba(255,20,147,0.6)', rotate: -4,
    });

    const first = new NeonGlitchLine(firstLayers, 1, 'neon-dual-first-line');
    const second = new NeonGlitchLine(secondLayers, 2, 'neon-dual-second-line');
    const rule = new NeonGlitchRule(undefined, {
      effects: {
        boxShadows: [{ x: 0, y: 0, blur: 12, spread: 0, color: 'rgba(255,20,147,0.6)' }],
      },
      frame: { x: 0, y: 0, width: '70%', height: 3, position: 'relative' },
      name: 'neon-dual-line-rule',
      opacity: 0,
      paint: {
        backgrounds: [{
          kind: 'linear-gradient',
          angle: 90,
          stops: [
            { offset: 0, color: '#ff1493' },
            { offset: 0.5, color: '#ffffff' },
            { offset: 1, color: '#ff1493' },
          ],
        }],
      },
    });

    const stack = new Layout(first, {
      frame: { x: 0, y: 0, width: '90%', height: 'auto', position: 'relative' },
      layout: { align: 'center', direction: 'column', gap: 20, justify: 'start' },
      name: 'neon-dual-line-stack',
    });
    stack.addUnit(rule);
    stack.addUnit(second);
    super(stack, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      layout: {
        align: 'center',
        direction: 'column',
        justify: 'start',
        padding: { top: 288, right: 0, bottom: 0, left: 0 },
      },
      name: 'neon-dual-line-glitch',
    });
    this.#animationTargets = Object.freeze([
      target(first, 'first-line'),
      target(second, 'second-line'),
      target(rule, 'rule'),
    ]);
  }

  /** Frozen semantic owners in authored attachment order. */
  animationTargets() {
    return this.#animationTargets;
  }
}

class NeonGlitchLine extends Layout {
  static kind = 'unit.neon-heart-pop.glitch-line';

  constructor(layers, line, name) {
    super(layers[0], {
      frame: { x: 0, y: 0, width: '100%', height: 'auto', position: 'relative' },
      layout: { align: 'center', justify: 'center' },
      name,
    });
    this.line = line;
    this.addUnit(layers[1]);
    this.addUnit(layers[2]);
  }
}

class NeonGlitchRule extends Box {
  static kind = 'unit.neon-heart-pop.glitch-rule';
}

function validateLayers(layers, name) {
  if (!Array.isArray(layers) || layers.length !== 3) {
    throw new TypeError(`NeonDualLineGlitch ${name} line requires three Text Units`);
  }
  layers.forEach((unit) => {
    requireUnit(unit, `NeonDualLineGlitch ${name} line`);
    requireDetachedUnit(unit, `NeonDualLineGlitch ${name} line`);
    if (unit.constructor.kind !== 'unit.text') throw new TypeError('Glitch layers must be Text Units');
  });
}

function styleLayers(layers, options) {
  const colors = ['#ff0000', '#00ffff', options.mainColor];
  const offsets = [3, -3, 0];
  layers.forEach((unit, index) => {
    unit.frame = {
      ...(index < 2 ? { right: 'auto', bottom: 'auto' } : { x: 0, y: 0 }),
      x: offsets[index],
      y: 0,
      width: 'auto',
      height: 'auto',
      position: index < 2 ? 'absolute' : 'relative',
    };
    unit.opacity = index < 2 ? 0.35 : 1;
    unit.paint = { ...unit.paint, color: colors[index] };
    unit.typography = {
      ...unit.typography,
      align: 'center',
      family: options.family,
      letterSpacing: options.letterSpacing,
      lineHeight: 'normal',
      shadows: index === 2
        ? [{ x: 0, y: 4, blur: 20, color: options.mainShadow }]
        : [],
      size: options.size,
      style: 'normal',
      transform: 'none',
      weight: options.weight,
      wrap: { ...unit.typography.wrap, whiteSpace: 'nowrap' },
    };
  });
}

function target(owner, role) {
  return Object.freeze({ owner, role });
}
