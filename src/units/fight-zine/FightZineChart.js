import { Unit, requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { visual } from '@cut3/agent-memory/units/base/visual';

const INK = '#111111';
const PAPER = '#f4f1ea';
const PLOT = Object.freeze({ x: 150, y: 560, width: 780, height: 980 });
const RISING = Object.freeze([0, 0.12, 0.28, 0.22, 0.45, 0.62, 0.78, 0.92]);
const FALLING = Object.freeze([0.78, 0.7, 0.62, 0.68, 0.5, 0.36, 0.24, 0.1]);

/** Marker-drawn fight chart with runtime headings and endpoint callouts. */
export class FightZineChart extends Layer {
  static kind = 'unit.fight-zine.chart';

  #animationTargets;

  constructor(title, subtitle, risingValue, risingLabel, fallingValue, fallingLabel) {
    const texts = [title, subtitle, risingValue, risingLabel, fallingValue, fallingLabel];
    texts.forEach((unit, index) => requireText(unit, `FightZineChart text ${index + 1}`));
    if (new Set(texts).size !== texts.length) {
      throw new TypeError('FightZineChart requires six distinct Text Units');
    }

    const grid = chartGrid();
    const axis = chartStroke('axis', 1);
    const fallingPrimary = chartStroke('falling-primary', 0.85);
    const fallingEcho = chartStroke('falling-echo', 0.4);
    const risingPrimary = chartStroke('rising-primary', 1);
    const risingEcho = chartStroke('rising-echo', 0.45);
    const risingEnd = pointAt(RISING, RISING.length - 1, 1);
    const fallingEnd = pointAt(FALLING, FALLING.length - 1, 50);
    const risingDot = new FightZineChartEndpoint(
      'rising',
    );
    const fallingDot = new FightZineChartEndpoint(
      'falling',
    );
    const plotStage = new FightZineChartPlotStage(axis, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      name: 'fight-zine-chart-plot-stage',
      opacity: 0,
    });
    plotStage.addUnit(fallingPrimary);
    plotStage.addUnit(fallingEcho);
    plotStage.addUnit(risingPrimary);
    plotStage.addUnit(risingEcho);
    plotStage.addUnit(risingDot);
    plotStage.addUnit(fallingDot);

    styleText(title, 96, 'center');
    title.frame = { x: 0, y: 150, width: '100%', height: 'auto' };
    const titleStage = new FightZineChartTitleStage(title, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      name: 'fight-zine-chart-title-stage',
      opacity: 0,
    });
    styleText(subtitle, 44, 'center');
    subtitle.frame = { x: 0, y: 270, width: '100%', height: 'auto' };
    const subtitleStage = new FightZineChartSubtitleStage(subtitle, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      name: 'fight-zine-chart-subtitle-stage',
      opacity: 0,
    });

    const risingCallout = chartCallout(
      risingValue,
      risingLabel,
      risingEnd.x - 250,
      risingEnd.y - 150,
      120,
      58,
      'rising',
    );
    const fallingCallout = chartCallout(
      fallingValue,
      fallingLabel,
      fallingEnd.x - 60,
      fallingEnd.y + 30,
      96,
      50,
      'falling',
    );
    const doodle = chartDoodle();

    super(grid, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      name: 'fight-zine-chart',
      overflow: 'hidden',
      paint: { fill: PAPER },
    });
    this.addUnit(titleStage);
    this.addUnit(subtitleStage);
    this.addUnit(plotStage);
    this.addUnit(risingCallout);
    this.addUnit(fallingCallout);
    this.addUnit(doodle);

    this.#animationTargets = Object.freeze({
      cadence: Object.freeze([
        target(this, 'stage'),
        target(grid, 'grid'),
        target(plotStage, 'plot'),
        target(titleStage, 'title'),
        target(subtitleStage, 'subtitle'),
        target(risingCallout, 'rising-callout'),
        target(fallingCallout, 'falling-callout'),
        target(risingDot, 'rising-endpoint'),
        target(fallingDot, 'falling-endpoint'),
        target(doodle, 'doodle'),
      ]),
      traces: Object.freeze([
        traceTarget(axis, 'axis'),
        traceTarget(risingPrimary, 'rising-primary'),
        traceTarget(risingEcho, 'rising-echo'),
        traceTarget(fallingPrimary, 'falling-primary'),
        traceTarget(fallingEcho, 'falling-echo'),
      ]),
    });
  }

  animationTargets() {
    return this.#animationTargets;
  }
}

class FightZineGridScene extends Unit {
  static kind = 'unit.fight-zine.grid-scene';

  constructor() {
    super();
    Object.assign(this, visual({
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      opacity: 0,
    }));
    this.name = 'fight-zine-chart-grid';
    this.pattern = 'square-paper';
  }
}

class FightZineChartPlotStage extends Layer {
  static kind = 'unit.fight-zine.chart-plot-stage';
}

class FightZineChartTitleStage extends Layer {
  static kind = 'unit.fight-zine.chart-title-stage';
}

class FightZineChartSubtitleStage extends Layer {
  static kind = 'unit.fight-zine.chart-subtitle-stage';
}

class FightZineChartCallout extends Layer {
  static kind = 'unit.fight-zine.chart-callout';
}

class FightZineChartDoodle extends Unit {
  static kind = 'unit.fight-zine.chart-doodle';

  constructor() {
    super();
    Object.assign(this, visual({
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      opacity: 0,
      overflow: 'visible',
    }));
    this.name = 'fight-zine-chart-doodle';
    this.mark = 'rising-arrow';
  }
}

class FightZineChartEndpoint extends Unit {
  static kind = 'unit.fight-zine.chart-endpoint';

  constructor(series) {
    super();
    Object.assign(this, visual({ opacity: 0 }));
    this.series = String(series);
  }
}

class FightZineChartStroke extends Unit {
  static kind = 'unit.fight-zine.chart-stroke';

  constructor(role, opacity) {
    super();
    Object.assign(this, visual({ opacity }));
    this.traceProgress = 0;
    this.traceRole = String(role);
  }
}

/** Host-native SVG adapters for the semantic chart marks. */
export const fightZineChartUnitRenderers = Object.freeze({
  [FightZineGridScene.kind]: renderChartGrid,
  [FightZineChartDoodle.kind]: renderChartDoodle,
  [FightZineChartEndpoint.kind]: renderChartEndpoint,
  [FightZineChartStroke.kind]: renderChartStroke,
});

function chartGrid() {
  return new FightZineGridScene();
}

function chartStroke(role, opacity) {
  return new FightZineChartStroke(role, opacity);
}

function pointAt(values, index, seed) {
  return {
    x: PLOT.x + ((index / (values.length - 1)) * PLOT.width) + jitter(seed + (index * 3.1), 5),
    y: PLOT.y + ((1 - values[index]) * PLOT.height) + jitter(seed + (index * 7.7), 5),
  };
}

function chartCallout(value, label, x, y, valueSize, labelSize, series) {
  styleText(value, valueSize, 'center');
  value.frame = { x: 0, y: 0, width: 'auto', height: 'auto', position: 'relative' };
  value.typography = { ...value.typography, lineHeight: 0.9 };
  styleText(label, labelSize, 'center');
  label.frame = { x: 0, y: 0, width: 'auto', height: 'auto', position: 'relative' };
  const stage = new FightZineChartCallout(value, {
    frame: { x, y, width: 'auto', height: 'auto' },
    name: `fight-zine-${series}-callout`,
    opacity: 0,
  });
  stage.series = series;
  stage.addUnit(label);
  return stage;
}

function chartDoodle() {
  return new FightZineChartDoodle();
}

function renderChartGrid({ React, state }) {
  const vertical = Array.from({ length: 12 }, (_, index) => (
    React.createElement('line', {
      key: `v-${index}`,
      stroke: INK,
      strokeWidth: 1,
      x1: index * 90,
      x2: index * 90,
      y1: 0,
      y2: 1920,
    })
  ));
  const horizontal = Array.from({ length: 22 }, (_, index) => (
    React.createElement('line', {
      key: `h-${index}`,
      stroke: INK,
      strokeWidth: 1,
      x1: 0,
      x2: 1080,
      y1: index * 90,
      y2: index * 90,
    })
  ));
  return svg(React, state, [...vertical, ...horizontal]);
}

function renderChartStroke({ React, state }) {
  const recipe = chartTraceRecipe(state.traceRole);
  return svg(React, state, [React.createElement('polyline', {
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
  })]);
}

function renderChartEndpoint({ React, state }) {
  const recipe = endpointRecipe(state.series);
  return svg(React, state, [React.createElement('circle', {
    cx: recipe.point.x,
    cy: recipe.point.y,
    fill: INK,
    key: state.series,
    r: recipe.radius,
  })]);
}

function renderChartDoodle({ React, state }) {
  const tip = pointAt(RISING, RISING.length - 1, 1);
  const props = {
    fill: 'none', stroke: INK, strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 8,
  };
  return svg(React, state, [
    React.createElement('polyline', {
      ...props,
      key: 'stem',
      points: pointString([{ x: tip.x - 40, y: tip.y + 80 }, tip]),
    }),
    React.createElement('polyline', {
      ...props,
      key: 'head-a',
      points: pointString([tip, { x: tip.x - 22, y: tip.y + 18 }]),
    }),
    React.createElement('polyline', {
      ...props,
      key: 'head-b',
      points: pointString([tip, { x: tip.x - 30, y: tip.y - 8 }]),
    }),
  ]);
}

function svg(React, state, children) {
  return React.createElement('svg', {
    'data-fight-zine': state.name ?? state.traceRole ?? state.series,
    preserveAspectRatio: 'none',
    style: svgStyle(state),
    viewBox: '0 0 1080 1920',
  }, ...children);
}

function svgStyle(state) {
  return {
    height: dimension(state.frame?.height ?? '100%'),
    left: dimension(state.frame?.x ?? 0),
    opacity: state.opacity,
    overflow: state.overflow,
    position: 'absolute',
    top: dimension(state.frame?.y ?? 0),
    transform: `translate(${state.pose?.x ?? 0}px, ${state.pose?.y ?? 0}px)`,
    width: dimension(state.frame?.width ?? '100%'),
  };
}

function pointString(points) {
  return points.map(({ x, y }) => `${x},${y}`).join(' ');
}

function chartTraceRecipe(role) {
  if (role === 'axis') {
    return {
      points: [
        { x: PLOT.x, y: PLOT.y },
        { x: PLOT.x, y: PLOT.y + PLOT.height },
        { x: PLOT.x + PLOT.width, y: PLOT.y + PLOT.height },
      ],
      width: 6,
    };
  }
  const rising = role.startsWith('rising');
  const primary = role.endsWith('primary');
  const values = rising ? RISING : FALLING;
  const seed = rising ? (primary ? 1 : 2.3) : (primary ? 50 : 51.4);
  return {
    points: values.map((_value, index) => pointAt(values, index, seed)),
    width: rising ? (primary ? 13 : 5) : (primary ? 9 : 4),
  };
}

function endpointRecipe(series) {
  const rising = series === 'rising';
  const values = rising ? RISING : FALLING;
  return {
    point: pointAt(values, values.length - 1, rising ? 1 : 50),
    radius: rising ? 16 : 11,
  };
}

function dimension(value) {
  return typeof value === 'number' ? `${value}px` : value;
}

function styleText(unit, size, align) {
  unit.paint = { ...unit.paint, color: INK };
  unit.typography = {
    ...unit.typography,
    align,
    family: 'Permanent Marker, system-ui',
    letterSpacing: 0,
    lineHeight: 'normal',
    size,
    style: 'normal',
    transform: 'none',
    weight: 400,
    wrap: { ...unit.typography.wrap, whiteSpace: 'nowrap' },
  };
}

function requireText(unit, name) {
  requireUnit(unit, name);
  requireDetachedUnit(unit, name);
  if (!(unit instanceof Text)) throw new TypeError(`${name} must be a Text Unit`);
}

function target(owner, role) {
  return Object.freeze({ index: 0, owner, role });
}

function traceTarget(owner, role) {
  return Object.freeze({ index: 0, owner, role });
}

function jitter(seed, amplitude) {
  const sample = Math.sin(seed * 12.9898) * 43_758.5453;
  return (sample - Math.floor(sample) - 0.5) * 2 * amplitude;
}
