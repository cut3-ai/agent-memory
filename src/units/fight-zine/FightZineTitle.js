import { Unit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { visual } from '@cut3/agent-memory/units/base/visual';

const INK = '#141414';
const PAPER = '#f4f1ea';
const WORD_RECIPES = Object.freeze([
  Object.freeze({ delay: 4, rotate: -2, size: 230 }),
  Object.freeze({ delay: 12, rotate: 1.5, size: 118 }),
  Object.freeze({ delay: 22, rotate: -1, size: 300 }),
]);

/** Three-line boiling fight title with a hand-traced border and underline. */
export class FightZineTitle extends Layer {
  static kind = 'unit.fight-zine.title';

  #animationTargets;

  constructor(words) {
    if (!Array.isArray(words) || words.length !== WORD_RECIPES.length) {
      throw new TypeError('FightZineTitle requires three Text Units');
    }
    words.forEach((unit, index) => requireTitleWord(unit, index));
    if (new Set(words).size !== words.length) {
      throw new TypeError('FightZineTitle requires distinct Text Units');
    }

    const grid = titleGrid();
    const borderMain = titleStroke('border-main', 1);
    const borderEcho = titleStroke('border-echo', 0.4);
    const border = new FightZineTitleBorderScene(borderMain, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      name: 'fight-zine-title-border',
      opacity: 0,
    });
    border.addUnit(borderEcho);

    words.forEach((word, index) => {
      const recipe = WORD_RECIPES[index];
      word.frame = {
        x: 0,
        y: 0,
        width: 'auto',
        height: 'auto',
        position: 'relative',
      };
      word.paint = { ...word.paint, color: INK };
      word.typography = {
        ...word.typography,
        align: 'center',
        family: 'Anton, system-ui',
        letterSpacing: 4,
        lineHeight: 0.92,
        shadows: [],
        size: recipe.size,
        stroke: { color: INK, width: 2 },
        style: 'normal',
        transform: 'none',
        weight: 400,
        wrap: { ...word.typography.wrap, whiteSpace: 'nowrap' },
      };
      word.opacity = 0;
    });

    const underlineMain = titleStroke(
      'underline-main',
      1,
    );
    const underlineEcho = titleStroke(
      'underline-echo',
      0.4,
    );
    const underline = new Layer(underlineMain, {
      frame: { x: 0, y: -10, width: 1080, height: 160 },
      name: 'fight-zine-title-underline',
    });
    underline.addUnit(underlineEcho);
    const underlineStage = new FightZineTitleUnderlineStage(underline, {
      frame: { x: 0, y: 0, width: 1080, height: 150, position: 'relative' },
      name: 'fight-zine-title-underline-stage',
      overflow: 'visible',
    });

    const content = new FightZineTitleContent(words[0], {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      layout: { align: 'center', direction: 'column', gap: 24, justify: 'center' },
      name: 'fight-zine-title-content',
    });
    content.addUnit(words[1]);
    content.addUnit(words[2]);
    content.addUnit(underlineStage);

    super(grid, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      name: 'fight-zine-title',
      overflow: 'hidden',
      paint: { fill: PAPER },
    });
    this.addUnit(border);
    this.addUnit(content);
    this.#animationTargets = Object.freeze({
      cadence: Object.freeze([
        target(this, 'stage', 0),
        target(grid, 'grid', 0),
        target(border, 'border-stage', 0),
        target(content, 'content', 0),
        ...words.map((owner, index) => target(owner, 'word', index)),
      ]),
      traces: Object.freeze([
        target(borderMain, 'border-main', 0),
        target(borderEcho, 'border-echo', 0),
        target(underlineMain, 'underline-main', 0),
        target(underlineEcho, 'underline-echo', 0),
      ]),
    });
  }

  animationTargets() {
    return this.#animationTargets;
  }
}

export const fightZineTitleWordRecipes = WORD_RECIPES;

/** Runtime title copy carrying fight-zine word identity for its complete cadence. */
export class FightZineTitleWord extends Text {
  static kind = 'unit.fight-zine.title-word';

  constructor(content, wordIndex) {
    super(content);
    this.wordIndex = Number(wordIndex);
  }
}

class FightZineTitleGrid extends Unit {
  static kind = 'unit.fight-zine.title-grid';

  constructor() {
    super();
    Object.assign(this, visual({
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      opacity: 0,
    }));
    this.name = 'fight-zine-title-grid';
    this.pattern = 'square-paper';
  }
}

class FightZineTitleBorderScene extends Layer {
  static kind = 'unit.fight-zine.title-border-scene';
}

class FightZineTitleContent extends Layout {
  static kind = 'unit.fight-zine.title-content';
}

class FightZineTitleUnderlineStage extends Layer {
  static kind = 'unit.fight-zine.title-underline-stage';
}

class FightZineTitleStroke extends Unit {
  static kind = 'unit.fight-zine.title-stroke';

  constructor(role, opacity) {
    super();
    Object.assign(this, visual({ opacity }));
    this.boilBucket = 0;
    this.traceProgress = 0;
    this.traceRole = String(role);
  }
}

/** Host-native SVG adapters for the title grid and hand-drawn strokes. */
export const fightZineTitleUnitRenderers = Object.freeze({
  [FightZineTitleGrid.kind]: renderTitleGrid,
  [FightZineTitleStroke.kind]: renderTitleStroke,
});

function titleGrid() {
  return new FightZineTitleGrid();
}

function titleStroke(role, opacity) {
  return new FightZineTitleStroke(role, opacity);
}

function renderTitleGrid({ React, state }) {
  const lines = [];
  for (let index = 0; index < 13; index += 1) {
    lines.push(React.createElement('line', {
      key: `v-${index}`, stroke: INK, strokeWidth: 1,
      x1: index * 90, x2: index * 90, y1: 0, y2: 1920,
    }));
  }
  for (let index = 0; index < 22; index += 1) {
    lines.push(React.createElement('line', {
      key: `h-${index}`, stroke: INK, strokeWidth: 1,
      x1: 0, x2: 1080, y1: index * 90, y2: index * 90,
    }));
  }
  return svg(React, state, lines, '0 0 1080 1920');
}

function renderTitleStroke({ React, state }) {
  const recipe = titleTraceRecipe(state.traceRole, state.boilBucket);
  const type = recipe.closed ? 'polygon' : 'polyline';
  return svg(React, state, [React.createElement(type, {
    fill: 'none',
    key: state.traceRole,
    pathLength: 1,
    points: pointString(recipe.points),
    stroke: INK,
    strokeDasharray: 1,
    strokeDashoffset: 1 - state.traceProgress,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: recipe.width,
  })], recipe.viewBox.join(' '));
}

function svg(React, state, children, viewBox) {
  return React.createElement('svg', {
    'data-fight-zine': state.name ?? state.traceRole,
    preserveAspectRatio: 'none',
    style: {
      height: dimension(state.frame?.height ?? '100%'),
      left: dimension(state.frame?.x ?? 0),
      opacity: state.opacity,
      position: 'absolute',
      top: dimension(state.frame?.y ?? 0),
      width: dimension(state.frame?.width ?? '100%'),
    },
    viewBox,
  }, ...children);
}

function pointString(points) {
  return points.map(({ x, y }) => `${x},${y}`).join(' ');
}

function titleTraceRecipe(role, bucket) {
  if (role.startsWith('border')) {
    const amplitude = 5;
    const points = [
      [90, 120, 10, 11],
      [990, 120, 12, 13],
      [990, 1800, 14, 15],
      [90, 1800, 16, 17],
    ].map(([x, y, xSeed, ySeed]) => ({
      x: x + boilBucket(xSeed, bucket, amplitude),
      y: y + boilBucket(ySeed, bucket, amplitude),
    }));
    return {
      closed: true,
      points,
      viewBox: [0, 0, 1080, 1920],
      width: role === 'border-main' ? 7 : 3,
    };
  }
  const echo = role === 'underline-echo';
  const y = echo ? 62 : 50;
  const seed = echo ? 41 : 40;
  return {
    closed: false,
    points: Array.from({ length: 15 }, (_, index) => ({
      x: 330 + ((420 * index) / 14),
      y: y + boilBucket(seed + (index * 4.7), bucket, 7),
    })),
    viewBox: [0, 0, 1080, 160],
    width: echo ? 4 : 10,
  };
}

function boilBucket(seed, bucket, amplitude) {
  const sample = Math.sin((seed * 12.9898) + (bucket * 78.233)) * 43_758.5453;
  return (sample - Math.floor(sample) - 0.5) * 2 * amplitude;
}

function dimension(value) {
  return typeof value === 'number' ? `${value}px` : value;
}

function requireTitleWord(unit, index) {
  const name = `FightZineTitle word ${index + 1}`;
  requireDetachedUnit(unit, name);
  if (!(unit instanceof FightZineTitleWord) || unit.wordIndex !== index) {
    throw new TypeError(`${name} must be its authored FightZineTitleWord`);
  }
}

function target(owner, role, index) {
  return Object.freeze({ index, owner, role });
}
