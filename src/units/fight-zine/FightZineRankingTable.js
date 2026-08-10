import { Unit, requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { layoutItem, visual } from '@cut3/agent-memory/units/base/visual';

const INK = '#141414';
const PAPER = '#f4f1ea';
const ROW_COUNT = 5;
const TABLE_TARGET_BINDINGS = new WeakMap();

/** Five-row marker ranking board with runtime names, scores and gains. */
export class FightZineRankingTable extends Layer {
  static kind = 'unit.fight-zine.ranking-table';

  #animationTargets;

  constructor(title, subtitle, rows) {
    requireBaseText(title, 'FightZineRankingTable title');
    requireBaseText(subtitle, 'FightZineRankingTable subtitle');
    if (!Array.isArray(rows) || rows.length !== ROW_COUNT) {
      throw new TypeError('FightZineRankingTable requires five runtime rows');
    }
    rows.forEach((row, index) => requireRow(row, index));

    styleTitle(title);
    styleSubtitle(subtitle);
    const grid = tableGrid();
    const rules = rows.map((_row, index) => tableRule(index));
    const ruleScene = new FightZineTableRuleScene(rules[0], {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      name: 'fight-zine-table-rules',
      opacity: 0,
    });
    rules.slice(1).forEach((rule) => ruleScene.addUnit(rule));

    const rowStages = rows.map((row, index) => tableRow(row, index));
    const rowsStage = new FightZineTableRowsStage(rowStages[0], {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      name: 'fight-zine-table-rows-stage',
    });
    rowStages.slice(1).forEach((row) => rowsStage.addUnit(row));

    super(grid, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      name: 'fight-zine-ranking-table',
      overflow: 'hidden',
      paint: { fill: PAPER },
    });
    this.addUnit(ruleScene);
    this.addUnit(title);
    this.addUnit(subtitle);
    this.addUnit(rowsStage);

    bind(this, 'stage');
    bind(grid, 'grid');
    bind(ruleScene, 'rule-stage');
    bind(rowsStage, 'rows-stage');
    bind(title, 'title');
    bind(subtitle, 'subtitle');
    rules.forEach((rule, index) => bind(rule, 'rule', index));
    const cadence = [
      target(this, 'stage'),
      target(grid, 'grid'),
      target(ruleScene, 'rule-stage'),
      target(rowsStage, 'rows-stage'),
      target(title, 'title'),
      target(subtitle, 'subtitle'),
    ];
    rowStages.forEach((rowStage, index) => {
      const runtime = rows[index];
      bind(rowStage, 'row', index);
      bind(runtime.rank, 'row-rank', index);
      bind(runtime.score, 'score', index);
      bind(runtime.badge, 'badge', index);
      cadence.push(target(rowStage, 'row', index));
      cadence.push(target(runtime.rank, 'row-rank', index));
      cadence.push(target(runtime.score, 'score', index));
      cadence.push(target(runtime.badge, 'badge', index));
    });
    this.#animationTargets = Object.freeze({
      cadence: Object.freeze(cadence),
      traces: Object.freeze(rules.map((owner, index) => target(owner, 'rule', index))),
    });
  }

  animationTargets() {
    return this.#animationTargets;
  }
}

export class FightZineScoreCounter extends Text {
  static kind = 'unit.fight-zine.score-counter';

  constructor(content, baseScore, gain, rowIndex) {
    super(content);
    this.baseScore = Number(baseScore);
    this.gain = Number(gain);
    this.rowIndex = Number(rowIndex);
  }
}

export class FightZineScoreBadge extends Layout {
  static kind = 'unit.fight-zine.score-badge';

  #copy;

  constructor(copy, rowIndex) {
    requireBaseText(copy, 'FightZineScoreBadge copy');
    super(copy, {
      frame: { position: 'static', width: 'auto', height: 'auto' },
      layout: {
        align: 'center',
        justify: 'center',
        padding: { top: 2, right: 14, bottom: 2, left: 14 },
      },
      name: 'fight-zine-score-badge',
      opacity: 0,
      paint: {
        color: INK,
        fill: PAPER,
        radius: 14,
        stroke: INK,
        strokeWidth: 4,
      },
    });
    this.#copy = copy;
    this.rowIndex = Number(rowIndex);
  }

  badgeCopy() {
    return this.#copy;
  }
}

class FightZineTableGrid extends Unit {
  static kind = 'unit.fight-zine.table-grid';

  constructor() {
    super();
    Object.assign(this, visual({
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      opacity: 0,
    }));
    this.name = 'fight-zine-table-grid';
    this.pattern = 'square-paper';
  }
}

class FightZineTableRuleScene extends Layer {
  static kind = 'unit.fight-zine.table-rule-scene';
}

class FightZineTableRowsStage extends Layer {
  static kind = 'unit.fight-zine.table-rows-stage';
}

class FightZineTableRow extends Layout {
  static kind = 'unit.fight-zine.table-row';
}

class FightZineTableScoreGroup extends Layout {
  static kind = 'unit.fight-zine.table-score-group';
}

class FightZineTableRule extends Unit {
  static kind = 'unit.fight-zine.table-rule';

  constructor(index) {
    super();
    Object.assign(this, visual());
    this.boilBucket = 0;
    this.ruleIndex = index;
    this.traceProgress = 0;
  }
}

/** Host-native SVG adapters for the ranking grid and marker rules. */
export const fightZineRankingTableUnitRenderers = Object.freeze({
  [FightZineTableGrid.kind]: renderTableGrid,
  [FightZineTableRule.kind]: renderTableRule,
});

function tableGrid() {
  return new FightZineTableGrid();
}

function tableRule(index) {
  return new FightZineTableRule(index);
}

function tableRow(runtime, index) {
  styleRank(runtime.rank);
  styleName(runtime.name);
  styleScore(runtime.score);
  styleBadge(runtime.badge);
  const scoreGroup = new FightZineTableScoreGroup(runtime.score, {
    frame: { position: 'static', width: 'auto', height: 'auto' },
    layout: { align: 'center', gap: 18 },
    name: `fight-zine-table-score-group-${index + 1}`,
  });
  scoreGroup.addUnit(runtime.badge);
  const row = new FightZineTableRow(runtime.rank, {
    frame: { x: 0, y: 470 + (index * 250), width: '100%', height: 200 },
    layout: {
      align: 'center',
      padding: { top: 0, right: 110, bottom: 0, left: 110 },
    },
    name: `fight-zine-table-row-${index + 1}`,
    opacity: 0,
  });
  row.addUnit(runtime.name);
  row.addUnit(scoreGroup);
  return row;
}

function styleTitle(unit) {
  unit.frame = { x: 0, y: 150, width: '100%', height: 'auto' };
  unit.opacity = 0;
  unit.paint = { ...unit.paint, color: INK };
  unit.typography = {
    ...unit.typography,
    align: 'center',
    family: 'Anton, system-ui',
    letterSpacing: 3,
    lineHeight: 'normal',
    paintOrder: ['stroke', 'fill'],
    size: 110,
    stroke: { color: INK, width: 2 },
    style: 'normal',
    transform: 'none',
    weight: 400,
    wrap: { ...unit.typography.wrap, whiteSpace: 'nowrap' },
  };
}

function styleSubtitle(unit) {
  unit.frame = { x: 0, y: 300, width: '100%', height: 'auto' };
  unit.opacity = 0;
  unit.paint = { ...unit.paint, color: INK };
  unit.typography = markerTypography(unit, 42, 'center');
}

function styleRank(unit) {
  unit.frame = { position: 'static', width: 80, height: 'auto' };
  unit.paint = { ...unit.paint, color: INK };
  unit.typography = markerTypography(unit, 64, 'left');
}

function styleName(unit) {
  unit.frame = { position: 'static', width: 'auto', height: 'auto' };
  unit.layoutItem = layoutItem({ grow: 1 });
  unit.paint = { ...unit.paint, color: INK };
  unit.typography = markerTypography(unit, 66, 'left');
}

function styleScore(unit) {
  unit.frame = { position: 'static', minWidth: 200, width: 200, height: 'auto' };
  unit.paint = { ...unit.paint, color: INK };
  unit.typography = {
    ...unit.typography,
    align: 'right',
    family: 'Anton, system-ui',
    letterSpacing: 0,
    lineHeight: 'normal',
    paintOrder: ['stroke', 'fill'],
    size: 84,
    stroke: { color: INK, width: 1.5 },
    style: 'normal',
    transform: 'none',
    weight: 400,
    wrap: { ...unit.typography.wrap, whiteSpace: 'nowrap' },
  };
}

function styleBadge(unit) {
  const copy = unit.badgeCopy();
  copy.frame = { position: 'static', width: 'auto', height: 'auto' };
  copy.paint = { ...copy.paint, color: INK };
  copy.typography = markerTypography(copy, 46, 'center');
}

function markerTypography(unit, size, align) {
  return {
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

function renderTableGrid({ React, state }) {
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
  return svg(React, state, lines);
}

function renderTableRule({ React, state }) {
  const points = tableRulePoints(state.ruleIndex, state.boilBucket);
  return svg(React, state, [React.createElement('polyline', {
    fill: 'none',
    key: state.ruleIndex,
    pathLength: 1,
    points: pointString(points),
    stroke: INK,
    strokeDasharray: 1,
    strokeDashoffset: 1 - state.traceProgress,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 5,
  })]);
}

function svg(React, state, children) {
  return React.createElement('svg', {
    'data-fight-zine': state.name ?? `table-rule-${state.ruleIndex}`,
    preserveAspectRatio: 'none',
    style: {
      height: dimension(state.frame?.height ?? '100%'),
      left: dimension(state.frame?.x ?? 0),
      opacity: state.opacity,
      position: 'absolute',
      top: dimension(state.frame?.y ?? 0),
      width: dimension(state.frame?.width ?? '100%'),
    },
    viewBox: '0 0 1080 1920',
  }, ...children);
}

function pointString(points) {
  return points.map(({ x, y }) => `${x},${y}`).join(' ');
}

function tableRulePoints(index, bucket) {
  return Array.from({ length: 17 }, (_, segment) => ({
    x: 110 + ((860 * segment) / 16),
    y: 680 + (index * 250)
      + boilBucket(40 + (index * 9) + (segment * 4.7), bucket, 6),
  }));
}

function boilBucket(seed, bucket, amplitude) {
  const sample = Math.sin((seed * 12.9898) + (bucket * 78.233)) * 43_758.5453;
  return (sample - Math.floor(sample) - 0.5) * 2 * amplitude;
}

function dimension(value) {
  return typeof value === 'number' ? `${value}px` : value;
}

function requireRow(row, index) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new TypeError(`FightZineRankingTable row ${index + 1} must be a runtime row`);
  }
  requireBaseText(row.rank, `FightZineRankingTable row ${index + 1} rank`);
  requireBaseText(row.name, `FightZineRankingTable row ${index + 1} name`);
  requireTextKind(row.score, FightZineScoreCounter.kind, `FightZineRankingTable row ${index + 1} score`);
  requireUnitKind(row.badge, FightZineScoreBadge.kind, `FightZineRankingTable row ${index + 1} badge`);
  if (row.score.rowIndex !== index || row.badge.rowIndex !== index) {
    throw new TypeError('FightZineRankingTable row identity does not match its authored slot');
  }
  if (!Number.isFinite(row.score.baseScore) || !Number.isFinite(row.score.gain)) {
    throw new TypeError('FightZineRankingTable scores must be finite runtime numbers');
  }
}

function requireTextKind(unit, kind, name) {
  requireUnit(unit, name);
  requireDetachedUnit(unit, name);
  if (!(unit instanceof Text) || unit.constructor.kind !== kind) {
    throw new TypeError(`${name} must be its authored semantic Text Unit`);
  }
}

function requireBaseText(unit, name) {
  requireUnit(unit, name);
  requireDetachedUnit(unit, name);
  if (unit.constructor !== Text) throw new TypeError(`${name} must be a base Text Unit`);
}

function requireUnitKind(unit, kind, name) {
  requireUnit(unit, name);
  requireDetachedUnit(unit, name);
  if (unit.constructor.kind !== kind) {
    throw new TypeError(`${name} must be its authored semantic Unit`);
  }
}

function bind(owner, role, index = 0) {
  TABLE_TARGET_BINDINGS.set(owner, Object.freeze({ index, role }));
}

function target(owner, role, index = 0) {
  return Object.freeze({ index, owner, role });
}

/** Closed semantic-owner validation shared by table cadence and marker trace laws. */
export function requireFightZineTableTarget(unit, role, index = 0) {
  const binding = TABLE_TARGET_BINDINGS.get(unit);
  if (!binding || binding.role !== String(role) || binding.index !== Number(index)) {
    throw new TypeError('Fight-zine table law requires a bound RankingTable target');
  }
  return unit;
}
