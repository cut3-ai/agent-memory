import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as applications from '@cut3/agent-memory/compositions/FightZineEditorial';
import { fightZineRankRow } from '@cut3/agent-memory/compositions/FightZineRankRow';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { capturePublicState, matchesPublicState } from '@cut3/agent-memory/core/state';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { Audio } from '@cut3/agent-memory/units/base/Audio';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { Text } from '@cut3/agent-memory/units/base/Text';
import {
  FightZineChart,
  fightZineChartUnitRenderers,
} from '@cut3/agent-memory/units/fight-zine/FightZineChart';
import { fightZineRankRowUnitRenderers } from '@cut3/agent-memory/units/fight-zine/FightZineRankRow';
import {
  FightZineRankingTable,
  FightZineScoreBadge,
  FightZineScoreCounter,
  fightZineRankingTableUnitRenderers,
} from '@cut3/agent-memory/units/fight-zine/FightZineRankingTable';
import {
  FightZineMediaImage,
  MediaRankPlate,
  fightZineMediaUnitRenderers,
} from '@cut3/agent-memory/units/fight-zine/MediaRankPlate';
import {
  FightZineTitle,
  FightZineTitleWord,
  fightZineTitleUnitRenderers,
} from '@cut3/agent-memory/units/fight-zine/FightZineTitle';

const React = Object.freeze({
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
});

const FIGHT_ZINE_UNIT_RENDERERS = Object.freeze({
  ...fightZineChartUnitRenderers,
  ...fightZineMediaUnitRenderers,
  ...fightZineRankingTableUnitRenderers,
  ...fightZineRankRowUnitRenderers,
  ...fightZineTitleUnitRenderers,
});

const MEDIA_CASES = Object.freeze([
  ['lateral-push', applications.fightZineLateralPush, 262],
  ['foreground-drift', applications.fightZineForegroundDrift, 259],
  ['shutter-shake', applications.fightZineShutterShake, 259],
  ['paparazzi-burst', applications.fightZinePaparazziBurst, 323],
  ['gold-finale', applications.fightZineGoldFinale, 366],
]);

const BUILDERS = Object.freeze([
  applications.fightZineChart,
  applications.fightZineTitle,
  ...MEDIA_CASES.map((entry) => entry[1]),
  applications.fightZineRankingTable,
]);

test('bare F13 semantic Units own every authored node and hide zero Behaviours', () => {
  const units = [
    bareChart(),
    bareTitle(),
    ...MEDIA_CASES.map(([recipe]) => bareMedia(recipe)),
    bareTable(),
  ];
  for (const root of units) {
    assert.equal(countBehaviours(root), 0);
    const targets = root.animationTargets();
    assert.ok(Object.isFrozen(targets));
    for (const group of Object.values(targets)) {
      assert.ok(Object.isFrozen(group));
      assert.ok(group.every((binding) => Object.isFrozen(binding)));
      assert.ok(group.every((binding) => belongsTo(binding.owner, root)));
      assert.ok(group.every((binding) => binding.owner.behaviours.length === 0));
    }
  }
});

test('application builders are guard-free, style-free and never inspect child positions', () => {
  const forbidden = /\b(?:if|else|switch|case|throw|try|catch|finally|typeof|instanceof)\b|\?|&&|\|\||\?\?/u;
  for (const builder of BUILDERS) {
    const source = Function.prototype.toString.call(builder);
    assert.doesNotMatch(source, forbidden, `${builder.name} must remain guard-free`);
    assert.doesNotMatch(source, /\b(?:style|css|frame|paint|pose|effects|typography)\s*:/u);
    assert.doesNotMatch(source, /\.units|\.children|\.at\(/u);
    assert.doesNotMatch(source, /https?:\/\/|[a-f0-9]{32,}/iu);
    assert.match(source, /addBehaviour/u);
  }
});

test('all Behaviours attach owner-first to semantic fight-zine owners in authored order', () => {
  const units = applicationCases().map((entry) => entry.unit);
  for (const root of units) {
    const namedOwners = new Set(Object.values(root.animationTargets()).flat().map((entry) => entry.owner));
    for (const owner of flatten(root)) {
      for (const behaviour of owner.behaviours) {
        assert.equal(behaviour.unit, owner);
        assert.ok(namedOwners.has(owner));
        assert.match(behaviour.constructor.kind, /^behaviour\.fight-zine\./u);
      }
    }
  }

  const shutter = applications.fightZineShutterShake(...mediaArgs('SHAKE'));
  const deck = binding(shutter, 'shutter', 'deck');
  assert.deepEqual(kinds(deck), ['behaviour.fight-zine.fight-night-shutter-hit']);
  const paparazzi = applications.fightZinePaparazziBurst(...mediaArgs('BURST'));
  const flashedImage = binding(paparazzi, 'shutter', 'image-flash', 0);
  assert.deepEqual(kinds(flashedImage), [
    'behaviour.fight-zine.media-rank-cadence',
    'behaviour.fight-zine.fight-night-shutter-hit',
  ]);
});

test('two synthetic runtime sets pass through every text, image and audio carrier', () => {
  for (const prefix of ['SYNTHETIC ALPHA', 'SYNTHETIC BETA']) {
    const chart = applications.fightZineChart(
      `${prefix} CHART`,
      `${prefix} SUBTITLE`,
      `${prefix} UP`,
      `${prefix} UP LABEL`,
      `${prefix} DOWN`,
      `${prefix} DOWN LABEL`,
    );
    assert.ok(textValues(chart).includes(`${prefix} CHART`));

    const title = applications.fightZineTitle(
      `${prefix} FIRST`,
      `${prefix} SECOND`,
      `${prefix} THIRD`,
    );
    assert.ok(textValues(title).includes(`${prefix} SECOND`));

    const media = applications.fightZineGoldFinale(...goldArgs(prefix));
    assert.deepEqual(imageSources(media), [
      `${prefix} IMAGE A`,
      `${prefix} IMAGE B`,
      `${prefix} IMAGE C`,
    ]);
    assert.deepEqual(audioSources(media), [`${prefix} AUDIO`, `${prefix} AUDIO`]);
    assert.equal(textValues(media).includes(`${prefix} CROWN`), false);
    const crown = binding(media, 'cadence', 'crown');
    assert.equal(crown.constructor.kind, 'unit.fight-zine.crown-mark');
    assert.equal(crown.units.length, 0);
    assert.equal(crown.mark, 'three-point-crown');

    const table = applications.fightZineRankingTable(
      `${prefix} TABLE`,
      `${prefix} TABLE SUBTITLE`,
      runtimeRows(prefix),
    );
    assert.ok(textValues(table).includes(`${prefix} NAME 3`));
    assert.ok(textValues(table).includes(`${prefix} GAIN 4`));
  }
});

test('chart and boiling title preserve authored marker windows and two-frame buckets', () => {
  const chart = applications.fightZineChart('TITLE', 'SUB', 'UP', 'UP LABEL', 'DOWN', 'DOWN LABEL');
  const chartComposition = wrap(chart, 283);
  const axis = binding(chart, 'traces', 'axis');
  const rising = binding(chart, 'traces', 'rising-primary');
  const endpoint = binding(chart, 'cadence', 'rising-endpoint');
  assert.equal(stateAt(chartComposition, axis, 0).traceProgress, 0);
  assert.equal(stateAt(chartComposition, axis, 16).traceProgress, 1);
  assert.equal(stateAt(chartComposition, rising, 12).traceProgress, 0);
  assert.equal(stateAt(chartComposition, rising, 70).traceProgress, 1);
  assert.equal(stateAt(chartComposition, endpoint, 12).opacity, 0);
  assert.equal(stateAt(chartComposition, endpoint, 70).opacity, 1);

  const title = applications.fightZineTitle('FIRST', 'SECOND', 'THIRD');
  const titleComposition = wrap(title, 270);
  const border = binding(title, 'traces', 'border-main');
  const word = binding(title, 'cadence', 'word', 1);
  assert.equal(stateAt(titleComposition, border, 0).boilBucket, 0);
  assert.equal(stateAt(titleComposition, border, 1).boilBucket, 0);
  assert.equal(stateAt(titleComposition, border, 2).boilBucket, 1);
  assert.equal(stateAt(titleComposition, word, 0).pose.rotate, stateAt(titleComposition, word, 1).pose.rotate);
  assert.deepEqual(
    stateAt(titleComposition, word, 0).typography.shadows,
    stateAt(titleComposition, word, 1).typography.shadows,
  );
  const borderStage = binding(title, 'cadence', 'border-stage');
  const content = binding(title, 'cadence', 'content');
  const borderState = stateAt(titleComposition, borderStage, 2);
  const contentState = stateAt(titleComposition, content, 2);
  assert.equal(contentState.pose.x, borderState.pose.x * 0.6);
  assert.equal(contentState.pose.y, borderState.pose.y * 0.6);
});

test('F13 static geometry and typography match the authored DOM and SVG topology', () => {
  const chart = applications.fightZineChart('TITLE', 'SUB', 'UP', 'UP LABEL', 'DOWN', 'DOWN LABEL');
  const chartUnits = flatten(chart);
  const doodle = chartUnits.find((unit) => unit.constructor.kind === 'unit.fight-zine.chart-doodle');
  assert.deepEqual(
    { height: doodle.frame.height, width: doodle.frame.width, x: doodle.frame.x, y: doodle.frame.y },
    { height: '100%', width: '100%', x: 0, y: 0 },
  );
  assert.equal(doodle.mark, 'rising-arrow');
  const chartTexts = new Map(chartUnits.filter((unit) => unit instanceof Text).map((unit) => [unit.text, unit]));
  assert.equal(chartTexts.get('TITLE').frame.height, 'auto');
  assert.equal(chartTexts.get('TITLE').typography.lineHeight, 'normal');
  assert.equal(chartTexts.get('UP').frame.width, 'auto');
  assert.equal(chartTexts.get('UP').typography.lineHeight, 0.9);

  const title = applications.fightZineTitle('FIRST', 'SECOND', 'THIRD');
  const titleUnits = flatten(title);
  assert.ok(titleUnits.filter((unit) => unit.constructor.kind === 'unit.fight-zine.title-word')
    .every((unit) => unit.frame.height === 'auto'));
  const underlineStage = titleUnits.find(
    (unit) => unit.constructor.kind === 'unit.fight-zine.title-underline-stage',
  );
  const underline = titleUnits.find((unit) => unit.name === 'fight-zine-title-underline');
  assert.equal(underlineStage.frame.height, 150);
  assert.equal(underline.frame.y, -10);
  assert.equal(underline.frame.height, 160);

  const lateral = applications.fightZineLateralPush(...mediaArgs('LATERAL'));
  const lateralRule = flatten(lateral).find(
    (unit) => unit.constructor.kind === 'unit.fight-zine.media-rule',
  );
  assert.equal(lateralRule.frame.width, 360);
  const lateralTexts = new Map(flatten(lateral)
    .filter((unit) => unit instanceof Text).map((unit) => [unit.text, unit]));
  assert.equal(lateralTexts.get('LATERAL LABEL').typography.lineHeight, 'normal');
  assert.equal(lateralTexts.get('LATERAL DESCRIPTOR').frame.height, 'auto');

  const gold = applications.fightZineGoldFinale(...goldArgs('GOLD'));
  const goldUnits = flatten(gold);
  const goldRule = goldUnits.find((unit) => unit.constructor.kind === 'unit.fight-zine.media-rule');
  const goldStage = goldUnits.find(
    (unit) => unit.constructor.kind === 'unit.fight-zine.gold-rank-stage',
  );
  const crown = goldUnits.find((unit) => unit.constructor.kind === 'unit.fight-zine.crown-mark');
  const rays = goldUnits.find((unit) => unit.constructor.kind === 'unit.fight-zine.gold-rays');
  assert.equal(goldRule.frame.width, 520);
  assert.deepEqual(
    { right: goldStage.frame.right, top: goldStage.frame.y },
    { right: 90, top: 150 },
  );
  assert.equal(crown.frame.x, '50%');
  assert.deepEqual(
    { height: rays.frame.height, width: rays.frame.width, x: rays.frame.x, y: rays.frame.y },
    { height: 2400, width: 2400, x: '50%', y: '36%' },
  );
  assert.equal(rays.rayCount, 20);
  assert.equal(rays.treatment, 'radial-gold-rays');
  assert.equal(rays.effects.blendMode, 'screen');

  const table = applications.fightZineRankingTable('TABLE', 'SUBTITLE', runtimeRows('TABLE'));
  const tableUnits = flatten(table);
  const rules = tableUnits.filter((unit) => unit.constructor.kind === 'unit.fight-zine.table-rule');
  assert.deepEqual(rules.map((unit) => unit.ruleIndex), [0, 1, 2, 3, 4]);
  assert.ok(rules.every((unit) => unit.traceProgress === 0 && unit.boilBucket === 0));
  assert.ok(tableUnits.filter((unit) => unit instanceof Text)
    .every((unit) => unit.frame.height === 'auto'));
});

test('generic driver emits no family SVG while injected host adapters restore native trees', () => {
  const cases = [
    [() => applications.fightZineChart('TITLE', 'SUB', 'UP', 'UP LABEL', 'DOWN', 'DOWN LABEL'), 283],
    [() => applications.fightZineTitle('FIRST', 'SECOND', 'THIRD'), 270],
    [() => applications.fightZineGoldFinale(...goldArgs('NATIVE')), 366],
    [() => applications.fightZineRankingTable('TABLE', 'SUBTITLE', runtimeRows('NATIVE')), 210],
    [() => fightZineRankRow('1', 'NAME', '100', '+4'), 90],
  ];
  const genericDriver = createReactDriver(React);
  for (const [factory, duration] of cases) {
    const tree = genericDriver.render(wrap(factory(), duration), { frame: 30 });
    assert.equal(nodesOfType(tree, 'svg').length, 0);
  }

  const nativeDriver = createReactDriver(React, { unitRenderers: FIGHT_ZINE_UNIT_RENDERERS });
  const chartTree = nativeDriver.render(wrap(cases[0][0](), 283), { frame: 40 });
  assert.equal(nodesOfType(chartTree, 'line').length, 34);
  assert.equal(nodesOfType(chartTree, 'polyline').length, 8);
  assert.equal(nodesOfType(chartTree, 'circle').length, 2);

  const titleTree = nativeDriver.render(wrap(cases[1][0](), 270), { frame: 40 });
  assert.equal(nodesOfType(titleTree, 'line').length, 35);
  assert.equal(nodesOfType(titleTree, 'polygon').length, 2);
  assert.equal(nodesOfType(titleTree, 'polyline').length, 2);

  const goldTree = nativeDriver.render(wrap(cases[2][0](), 366), { frame: 40 });
  assert.equal(nodesOfType(goldTree, 'path').length, 20);
  assert.equal(nodesOfType(goldTree, 'polygon').length, 5);
  assert.equal(nodesOfType(goldTree, 'radialGradient').length, 1);
  assert.equal(nodesOfType(goldTree, 'mask').length, 1);

  const tableTree = nativeDriver.render(wrap(cases[3][0](), 210), { frame: 40 });
  assert.equal(nodesOfType(tableTree, 'line').length, 35);
  const rules = nodesOfType(tableTree, 'polyline');
  assert.equal(rules.length, 5);
  assert.ok(rules.every((node) => node.props.strokeWidth === 5));

  const rowTree = nativeDriver.render(wrap(cases[4][0](), 90), { frame: 30 });
  assert.equal(nodesOfType(rowTree, 'path').length, 1);
  assert.equal(nodesOfType(rowTree, 'polyline').length, 1);
});

test('all five media variants preserve exact dissolve, grade and impact mechanics', () => {
  const lateral = applications.fightZineLateralPush(...mediaArgs('LATERAL'));
  const lateralComposition = wrap(lateral, 262);
  const first = binding(lateral, 'cadence', 'image', 0);
  const second = binding(lateral, 'cadence', 'image', 1);
  const firstAtZero = stateAt(lateralComposition, first, 0);
  assert.equal(firstAtZero.opacity, 1);
  assert.equal(firstAtZero.effects.saturate, 0.2);
  assert.deepEqual(firstAtZero.pose.operations.map((operation) => operation.kind), [
    'scale-2d',
    'translate-x',
  ]);
  assert.equal(stateAt(lateralComposition, second, 0).present, false);
  const cuts = flatten(lateral).filter((unit) => unit.constructor.kind === 'unit.shot');
  assert.deepEqual(cuts.map((shot) => shot.from), [87, 175]);

  const drift = applications.fightZineForegroundDrift(...mediaArgs('DRIFT'));
  const driftComposition = wrap(drift, 259);
  const foreground = binding(drift, 'cadence', 'foreground');
  assert.equal(stateAt(driftComposition, foreground, 0).pose.operations[0].value, '18px');
  assert.equal(stateAt(driftComposition, foreground, 259).pose.operations[0].value, '-18px');

  const shake = applications.fightZineShutterShake(...mediaArgs('SHAKE'));
  const shakeComposition = wrap(shake, 259);
  const deck = binding(shake, 'shutter', 'deck');
  const red = binding(shake, 'shutter', 'red-flash');
  assert.equal(stateAt(shakeComposition, deck, 0).pose.y, 18);
  assert.equal(stateAt(shakeComposition, deck, 12).pose.y, 0);
  assert.equal(stateAt(shakeComposition, red, 0).opacity, 0.5);
  assert.equal(stateAt(shakeComposition, red, 3).opacity, 0.18);
  assert.equal(stateAt(shakeComposition, red, 9).opacity, 0);

  const burst = applications.fightZinePaparazziBurst(...mediaArgs('BURST'));
  const burstComposition = wrap(burst, 323);
  const white = binding(burst, 'shutter', 'white-flash');
  const burstImage = binding(burst, 'shutter', 'image-flash', 0);
  assert.equal(stateAt(burstComposition, white, 2).opacity, 0.95);
  assert.equal(stateAt(burstComposition, burstImage, 2).effects.brightness, 1.2375);

  const gold = applications.fightZineGoldFinale(...goldArgs('GOLD'));
  const goldComposition = wrap(gold, 366);
  const rays = binding(gold, 'cadence', 'gold-rays');
  const particle = binding(gold, 'cadence', 'particle', 7);
  assert.equal(stateAt(goldComposition, rays, 30).rotation, 7.5);
  assert.ok(stateAt(goldComposition, rays, 30).opacity > 0);
  assert.ok(Number.isFinite(stateAt(goldComposition, particle, 365).frame.y));
});

test('all five media variants schedule the authored audio hit twice at rounded thirds', () => {
  for (const [recipe, builder, duration] of MEDIA_CASES) {
    const source = `SYNTHETIC ${recipe} AUDIO`;
    const args = recipe === 'gold-finale' ? goldArgs('AUDIO') : mediaArgs('AUDIO');
    args[3] = source;
    const unit = builder(...args);
    const shots = flatten(unit).filter((owner) => (
      owner.constructor.kind === 'unit.shot'
      && owner.units[0] instanceof Audio
    ));
    assert.deepEqual(shots.map((shot) => shot.from), [
      Math.round(duration / 3),
      Math.round((duration * 2) / 3),
    ]);
    assert.deepEqual(shots.map((shot) => shot.duration), shots.map((shot) => duration - shot.from));
    assert.deepEqual(shots.map((shot) => shot.units[0].source), [source, source]);
    assert.ok(shots.every((shot) => shot.units[0].startFrom === 0));
    assert.ok(shots.every((shot) => shot.units[0].volume === 1));
  }
});

test('ranking table preserves linear scrawls, score ticks and two-frame marker agitation', () => {
  const table = applications.fightZineRankingTable('TABLE', 'SUBTITLE', runtimeRows('TABLE'));
  const composition = wrap(table, 210);
  const firstRule = binding(table, 'traces', 'rule', 0);
  const thirdScore = binding(table, 'cadence', 'score', 2);
  const thirdBadge = binding(table, 'cadence', 'badge', 2);
  const firstRank = binding(table, 'cadence', 'row-rank', 0);
  assert.equal(stateAt(composition, firstRule, 4).traceProgress, 0);
  assert.equal(stateAt(composition, firstRule, 10).traceProgress, 0.5);
  assert.equal(stateAt(composition, firstRule, 16).traceProgress, 1);
  assert.equal(stateAt(composition, firstRule, 4).boilBucket, 2);
  assert.equal(stateAt(composition, firstRule, 5).boilBucket, 2);
  assert.equal(stateAt(composition, firstRule, 6).boilBucket, 3);
  assert.equal(stateAt(composition, firstRank, 0).pose.operations[0].degrees, stateAt(composition, firstRank, 1).pose.operations[0].degrees);
  assert.equal(stateAt(composition, thirdScore, 34).text, '102');
  assert.equal(stateAt(composition, thirdScore, 44).text, '108');
  assert.equal(stateAt(composition, thirdScore, 38).pose.operations[0].x, 1.22);
  assert.ok(stateAt(composition, thirdBadge, 35).opacity > 0);
});

test('all 2232 authored frames are finite, internally deterministic and roll back', () => {
  assert.equal(applicationCases().length, 8);
  let frames = 0;
  for (const { duration, unit } of applicationCases()) {
    const composition = wrap(unit, duration);
    const allUnits = flatten(composition);
    const baseline = new Map(allUnits.map((owner) => [owner, capturePublicState(owner)]));
    for (let frame = 0; frame < duration; frame += 1) {
      const projection = projectFrame(composition, context(frame, duration));
      for (const owner of allUnits) {
        if (projection.has(owner)) assertFinite(projection.stateOf(owner));
        assert.ok(matchesPublicState(owner, baseline.get(owner)));
      }
      frames += 1;
    }
  }
  assert.equal(frames, 2232);
});

test('family source contains no generic Vector DSL, source metadata or crown glyph dependency', async () => {
  const files = [
    '../../../src/units/fight-zine/FightZineChart.js',
    '../../../src/units/fight-zine/FightZineTitle.js',
    '../../../src/units/fight-zine/MediaRankPlate.js',
    '../../../src/units/fight-zine/FightZineRankingTable.js',
    '../../../src/units/fight-zine/FightZineRankRow.js',
    '../../../src/behaviours/fight-zine/FightZineChartCadence.js',
    '../../../src/behaviours/fight-zine/FightZineTitleCadence.js',
    '../../../src/behaviours/fight-zine/MarkerScrawlTrace.js',
    '../../../src/behaviours/fight-zine/MediaRankCadence.js',
    '../../../src/behaviours/fight-zine/FightNightShutterHit.js',
    '../../../src/behaviours/fight-zine/RankingTableCadence.js',
    '../../../src/compositions/FightZineEditorial.js',
  ];
  const sources = await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const source = sources.join('\n');
  assert.doesNotMatch(source, /https?:\/\//iu);
  assert.doesNotMatch(source, /\b(?:workspace|jsonl|prompt|customer|source[_ -]?id)\b/iu);
  assert.doesNotMatch(source, /[a-f0-9]{32,}/iu);
  assert.doesNotMatch(source, /new Text\(crown\)|styleCrown|family:\s*'system-ui'/u);
  assert.doesNotMatch(source, /\bVector(?:Scene|Path|Line|Circle|Rect|Polyline|Group)\b/u);
  assert.doesNotMatch(source, /\.(?:segments|definitions|appearance|draw)\b/u);
  assert.match(source, /React\.createElement\('svg'/u);
});

function applicationCases() {
  return [
    { duration: 283, unit: applications.fightZineChart('CHART', 'SUB', 'UP', 'UP LABEL', 'DOWN', 'DOWN LABEL') },
    { duration: 270, unit: applications.fightZineTitle('FIRST', 'SECOND', 'THIRD') },
    ...MEDIA_CASES.map(([recipe, builder, duration]) => ({
      duration,
      unit: recipe === 'gold-finale' ? builder(...goldArgs('RUN')) : builder(...mediaArgs('RUN')),
    })),
    { duration: 210, unit: applications.fightZineRankingTable('TABLE', 'SUB', runtimeRows('RUN')) },
  ];
}

function bareChart() {
  return new FightZineChart(
    new Text('TITLE'),
    new Text('SUBTITLE'),
    new Text('UP'),
    new Text('UP LABEL'),
    new Text('DOWN'),
    new Text('DOWN LABEL'),
  );
}

function bareTitle() {
  return new FightZineTitle([
    new FightZineTitleWord('FIRST', 0),
    new FightZineTitleWord('SECOND', 1),
    new FightZineTitleWord('THIRD', 2),
  ]);
}

function bareMedia(recipe) {
  return new MediaRankPlate(
    [0, 1, 2].map((index) => new FightZineMediaImage(`IMAGE ${index}`, recipe, index)),
    [new Audio('AUDIO'), new Audio('AUDIO')],
    new Text('1'),
    new Text('LABEL'),
    new Text('NAME'),
    new Text('DESCRIPTOR'),
    recipe,
  );
}

function bareTable() {
  return new FightZineRankingTable(
    new Text('TABLE'),
    new Text('SUBTITLE'),
    Array.from({ length: 5 }, (_, index) => ({
      rank: new Text(String(index + 1)),
      name: new Text(`NAME ${index + 1}`),
      score: new FightZineScoreCounter(String(100 + index), 100 + index, index + 1, index),
      badge: new FightZineScoreBadge(new Text(`GAIN ${index + 1}`), index),
    })),
  );
}

function mediaArgs(prefix) {
  return [
    `${prefix} IMAGE A`,
    `${prefix} IMAGE B`,
    `${prefix} IMAGE C`,
    `${prefix} AUDIO`,
    `${prefix} RANK`,
    `${prefix} LABEL`,
    `${prefix} NAME`,
    `${prefix} DESCRIPTOR`,
  ];
}

function goldArgs(prefix) {
  return [
    `${prefix} IMAGE A`,
    `${prefix} IMAGE B`,
    `${prefix} IMAGE C`,
    `${prefix} AUDIO`,
    `${prefix} RANK`,
    `${prefix} LABEL`,
    `${prefix} NAME`,
    `${prefix} DESCRIPTOR`,
  ];
}

function runtimeRows(prefix) {
  return Array.from({ length: 5 }, (_, index) => ({
    rank: String(index + 1),
    name: `${prefix} NAME ${index + 1}`,
    baseScore: 100 + index,
    gain: 4 + index,
    gainText: `${prefix} GAIN ${index + 1}`,
  }));
}

function binding(root, group, role, index = 0) {
  const found = root.animationTargets()[group].find(
    (entry) => entry.role === role && entry.index === index,
  );
  assert.ok(found, `missing ${group}:${role}:${index}`);
  return found.owner;
}

function wrap(unit, duration) {
  return new Composition(unit, {
    background: '#000000',
    duration,
    fps: 60,
    height: 1920,
    width: 1080,
  });
}

function stateAt(composition, unit, frame) {
  return projectFrame(composition, context(frame, composition.duration)).stateOf(unit);
}

function context(frame, duration) {
  return { frame, fps: 60, duration, width: 1080, height: 1920 };
}

function flatten(unit) {
  return [unit, ...unit.units.flatMap(flatten)];
}

function belongsTo(unit, root) {
  let current = unit;
  while (current) {
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

function countBehaviours(unit) {
  return flatten(unit).reduce((total, owner) => total + owner.behaviours.length, 0);
}

function kinds(unit) {
  return unit.behaviours.map((behaviour) => behaviour.constructor.kind);
}

function textValues(root) {
  return flatten(root).filter((unit) => unit instanceof Text).map((unit) => unit.text);
}

function imageSources(root) {
  return flatten(root)
    .filter((unit) => unit.constructor.kind === 'unit.fight-zine.media-image')
    .map((unit) => unit.source);
}

function audioSources(root) {
  return flatten(root).filter((unit) => unit instanceof Audio).map((unit) => unit.source);
}

function assertFinite(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  if (!value || typeof value !== 'object') return;
  for (const nested of Object.values(value)) assertFinite(nested);
}

function nodesOfType(root, type) {
  return reactNodes(root).filter((node) => node.type === type);
}

function reactNodes(value) {
  if (Array.isArray(value)) return value.flatMap(reactNodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...reactNodes(value.children)];
}
