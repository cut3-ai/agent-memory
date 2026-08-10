import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';

/** Two-layer hot-pink/white title staged in an authored 500px perspective field. */
export class NeonFlipTitle extends Layout {
  static kind = 'unit.neon-heart-pop.flip-title';

  #animationTargets;

  constructor(ghost, title) {
    requireText(ghost, 'NeonFlipTitle ghost');
    requireText(title, 'NeonFlipTitle title');
    if (ghost === title) throw new TypeError('NeonFlipTitle requires distinct Text Units');

    styleGhost(ghost);
    styleTitle(title);
    const stage = new NeonFlipTitleStage(ghost, {
      frame: {
        x: 0,
        y: 0,
        width: 'auto',
        height: 'auto',
        position: 'relative',
        z: 'auto',
      },
      name: 'neon-flip-title-stage',
      pose: { transformStyle: 'preserve-3d' },
    });
    stage.addUnit(title);
    super(stage, {
      frame: {
        x: 0,
        y: 0,
        width: '100%',
        height: '100%',
        position: 'static',
        z: 'auto',
      },
      layout: { align: 'center', justify: 'center' },
      name: 'neon-flip-title',
      pose: { perspective: 500 },
    });
    this.#animationTargets = Object.freeze({ flip: stage });
  }

  /** Frozen semantic owner for the complete 3D flip-and-wobble law. */
  animationTargets() {
    return this.#animationTargets;
  }
}

class NeonFlipTitleStage extends Layer {
  static kind = 'unit.neon-heart-pop.flip-title-stage';
}

function requireText(unit, name) {
  requireUnit(unit, name);
  requireDetachedUnit(unit, name);
  if (unit.constructor.kind !== 'unit.text') throw new TypeError(`${name} must be a Text Unit`);
}

function styleGhost(unit) {
  unit.effects = {
    ...unit.effects,
    filters: [{ kind: 'blur', amount: 8 }],
  };
  unit.frame = {
    x: 0,
    y: 0,
    width: 'auto',
    height: 'auto',
    position: 'absolute',
    z: 'auto',
  };
  unit.opacity = 0.5;
  unit.paint = { ...unit.paint, color: '#ff1493' };
  unit.typography = titleTypography();
}

function styleTitle(unit) {
  unit.frame = {
    x: 0,
    y: 0,
    width: 'auto',
    height: 'auto',
    position: 'static',
    z: 'auto',
  };
  unit.typography = {
    ...titleTypography(),
    fill: {
      kind: 'linear-gradient',
      angle: 180,
      stops: [
        { offset: 0, color: '#ffffff' },
        { offset: 1, color: '#ff69b4' },
      ],
    },
  };
}

function titleTypography() {
  return {
    align: 'left',
    family: 'Bebas Neue',
    fill: null,
    letterSpacing: 8,
    lineHeight: 'normal',
    paintOrder: [],
    shadows: [],
    size: 170,
    stroke: null,
    style: 'normal',
    transform: 'none',
    weight: 700,
    wrap: {
      maxLines: null,
      overflowWrap: 'normal',
      textOverflow: 'clip',
      whiteSpace: 'nowrap',
      wordBreak: 'normal',
    },
  };
}
