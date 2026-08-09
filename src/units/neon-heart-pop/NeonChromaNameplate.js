import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { VectorPath } from '@cut3/agent-memory/units/base/VectorPath';

const HOT_PINK = '#ff2da6';
const CYAN_GHOST = '#31e7ff';
const RED_GHOST = '#ff304f';

/** Static two-line neon nameplate; the builder owns its pop-in motion. */
export class NeonChromaNameplate extends CompositionPivot {
  static kind = 'unit.neon-heart-pop.chroma-nameplate';

  constructor(primary, accent) {
    requireUnit(primary, 'NeonChromaNameplate primary');
    requireUnit(accent, 'NeonChromaNameplate accent');
    requireDetachedUnit(primary, 'NeonChromaNameplate primary');
    requireDetachedUnit(accent, 'NeonChromaNameplate accent');
    if (primary.constructor.kind !== 'unit.text' || accent.constructor.kind !== 'unit.text') {
      throw new TypeError('NeonChromaNameplate requires two Text Units');
    }
    if (primary === accent) {
      throw new TypeError('NeonChromaNameplate requires two distinct Text Units');
    }

    primary.frame = { x: 96, y: 760, width: 888, height: 182, z: 6 };
    primary.paint = { ...primary.paint, color: '#ffffff' };
    primary.effects = {
      ...primary.effects,
      shadow: '0 0 18px rgba(255,255,255,.7)',
    };
    primary.typography = {
      align: 'center',
      family: 'Bebas Neue, sans-serif',
      letterSpacing: 0.8,
      lineHeight: 0.88,
      size: 154,
      style: 'normal',
      transform: 'uppercase',
      weight: 400,
    };

    accent.frame = { x: 104, y: 980, width: 872, height: 72, z: 7 };
    accent.paint = { ...accent.paint, color: HOT_PINK };
    accent.pose = { ...accent.pose, rotate: -2.4 };
    accent.effects = {
      ...accent.effects,
      shadow: '0 0 20px rgba(255,45,166,.72)',
    };
    accent.typography = {
      align: 'center',
      family: 'Caveat, cursive',
      letterSpacing: 1.5,
      lineHeight: 1,
      size: 58,
      style: 'normal',
      transform: 'none',
      weight: 700,
    };

    const primaryCyan = ghost(primary, -3, CYAN_GHOST, 2);
    const primaryRed = ghost(primary, 3, RED_GHOST, 3);
    const accentCyan = ghost(accent, -3, CYAN_GHOST, 4);
    const accentRed = ghost(accent, 3, RED_GHOST, 5);

    const heart = new VectorPath([
      { command: 'move', x: 60, y: 104 },
      { command: 'cubic', x1: 48, y1: 92, x2: 10, y2: 66, x: 10, y: 36 },
      { command: 'cubic', x1: 10, y1: 12, x2: 39, y2: 4, x: 60, y: 28 },
      { command: 'cubic', x1: 81, y1: 4, x2: 110, y2: 12, x: 110, y: 36 },
      { command: 'cubic', x1: 110, y1: 66, x2: 72, y2: 92, x: 60, y: 104 },
      { command: 'close' },
    ], {
      frame: { x: 850, y: 638, width: 126, height: 116, z: 9 },
      paint: { fill: HOT_PINK, stroke: '#ffffff', strokeWidth: 4 },
      viewBox: [0, 0, 120, 112],
    });
    const heartGlow = new Layer(heart, {
      effects: { shadow: `0 0 22px ${HOT_PINK}` },
      name: 'neon-heart-glow',
    });

    const rule = new VectorPath([
      { command: 'move', x: 0, y: 14 },
      { command: 'line', x: 872, y: 14 },
    ], {
      frame: { x: 104, y: 1070, width: 872, height: 28, z: 8 },
      paint: { stroke: HOT_PINK, strokeWidth: 6 },
      viewBox: [0, 0, 872, 28],
    });
    const glowingRule = new Layer(rule, {
      effects: { shadow: `0 0 20px ${HOT_PINK}` },
      name: 'hot-pink-glowing-rule',
    });

    const stage = new Layer(primaryCyan, { name: 'neon-chroma-nameplate-stage' });
    stage.add(
      primaryRed,
      accentCyan,
      accentRed,
      primary,
      accent,
      heartGlow,
      glowingRule,
    );

    super(stage, {
      name: 'neon-chroma-nameplate-motion',
      x: 540,
      y: 920,
    });
  }
}

function ghost(source, offset, color, z) {
  return new Text(source.text, {
    effects: { shadow: `0 0 12px ${color}` },
    frame: {
      ...source.frame,
      x: source.frame.x + offset,
      z,
    },
    opacity: 0.78,
    paint: { ...source.paint, color },
    pose: { ...source.pose },
    typography: { ...source.typography },
  });
}
