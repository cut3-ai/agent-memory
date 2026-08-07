import assert from 'node:assert/strict';
import test from 'node:test';

import { ArchivalDossierComposition } from '@cut3/agent-memory/compositions/ArchivalDossierComposition';
import { RetroRitualRankingComposition } from '@cut3/agent-memory/compositions/RetroRitualRankingComposition';
import { SignalEditorialComposition } from '@cut3/agent-memory/compositions/SignalEditorialComposition';
import { Engine, visitUnits } from '@cut3/agent-memory/core/Engine';
import { memoryCatalog } from '@cut3/agent-memory/catalog';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { SignalHeadlineBand } from '@cut3/agent-memory/units/signal-editorial/SignalHeadlineBand';

const compositions = [
  ['signal-editorial', SignalEditorialComposition, 60],
  ['archival-dossier', ArchivalDossierComposition, 72],
  ['retro-ritual', RetroRitualRankingComposition, 70],
];

for (const [name, CompositionClass, transitionFrame] of compositions) {
  test(`${name} is a deep executable tree with authored Behaviours and a live transition`, () => {
    const composition = new CompositionClass();
    const units = [];
    let maxDepth = 0;
    visitUnits(composition, (unit, depth) => {
      units.push(unit);
      maxDepth = Math.max(maxDepth, depth);
    });
    const behaviours = units.flatMap((unit) => unit.behaviours);
    const transition = new Engine(composition).at({ frame: transitionFrame });

    assert.ok(units.length >= 30, `expected a substantial ${name} tree`);
    assert.ok(maxDepth >= 8, `expected nested ${name} ownership`);
    assert.ok(units.some((unit) => unit.children.length >= 2), 'tree must branch');
    assert.ok(behaviours.length >= 4, 'composition must reuse authored behaviours');
    assert.ok(transition.children[0].children.length >= 2, 'transition must overlap scene trees');
  });
}

test('ranking cardinality is data: two and twenty items use the same RitualOfferCard', () => {
  const two = new RetroRitualRankingComposition({ items: ['A', 'B'] });
  const twenty = new RetroRitualRankingComposition({
    items: Array.from({ length: 20 }, (_, index) => `ITEM ${index + 1}`),
  });
  const countCards = (composition) => {
    let count = 0;
    visitUnits(composition, (unit) => {
      if (unit.constructor.kind === 'unit.retro-ritual.offer-card') count += 1;
    });
    return count;
  };

  assert.equal(countCards(two), 3); // two ranking cards plus one winner scene
  assert.equal(countCards(twenty), 21);
  assert.doesNotThrow(() => new Engine(twenty).at({ frame: 150 }));

  const engine = new Engine(twenty);
  for (const frame of [30, 102, 174, 246, 318]) {
    const cards = findOutput(engine.at({ frame }), (node) => node.name === 'ritual-offer-card')
      .map((node) => node.frame.y)
      .sort((left, right) => left - right);
    assert.ok(cards.length >= 1 && cards.length <= 4);
    for (let index = 1; index < cards.length; index += 1) {
      assert.ok(cards[index] - cards[index - 1] >= 270, 'cards must remain legible');
    }
  }
});

test('catalog contains code locations and visual traits, never scores or confidence', () => {
  assert.equal(memoryCatalog.length, 24);
  assert.ok(memoryCatalog.every((entry) => entry.import.startsWith('@cut3/agent-memory/')));
  assert.ok(memoryCatalog.every((entry) => entry.preserves.length >= 2));
  assert.doesNotMatch(JSON.stringify(memoryCatalog), /confidence|score|probability/iu);
});

test('incoming scenes stay transparent until each transition covers the outgoing scene', () => {
  const cases = [
    [new SignalEditorialComposition(), 56, 70, 'signal-incoming-reveal'],
    [new ArchivalDossierComposition(), 66, 86, 'dossier-incoming-reveal'],
    [new RetroRitualRankingComposition(), 52, 73, 'portal-incoming-reveal'],
  ];
  for (const [composition, start, handoff, name] of cases) {
    const engine = new Engine(composition);
    const atStart = findOutput(engine.at({ frame: start }), (node) => node.name === name)[0];
    const afterCover = findOutput(engine.at({ frame: handoff }), (node) => node.name === name)[0];
    assert.equal(atStart.opacity, 0, `${name} must not hard-cut at transition start`);
    assert.ok(afterCover.opacity >= 0.75, `${name} must appear under the cover`);
  }
});

test('every authored frame emits finite values inside renderer domains', () => {
  for (const CompositionClass of [
    SignalEditorialComposition,
    ArchivalDossierComposition,
    RetroRitualRankingComposition,
  ]) {
    const composition = new CompositionClass();
    const engine = new Engine(composition);
    for (let frame = 0; frame < composition.duration; frame += 1) {
      validateRenderState(engine.at({ frame }), `${CompositionClass.name} frame ${frame}`);
    }
  }
});

test('every CompositionPivot is rooted in an unshifted full-composition containing block', () => {
  for (const CompositionClass of [
    SignalEditorialComposition,
    ArchivalDossierComposition,
    RetroRitualRankingComposition,
  ]) {
    visitUnits(new CompositionClass(), (unit) => {
      if (unit.constructor.kind !== 'unit.composition-pivot') return;
      for (let ancestor = unit.parent; ancestor; ancestor = ancestor.parent) {
        if (!(ancestor instanceof Box || ancestor instanceof Layer)) continue;
        assert.equal(ancestor.frame.x, 0);
        assert.equal(ancestor.frame.y, 0);
        assert.ok(ancestor.frame.width === '100%' || ancestor.frame.width === 1080);
        assert.ok(ancestor.frame.height === '100%' || ancestor.frame.height === 1920);
      }
    });
  }
});

test('styled wrappers reject already-owned content without mutating it', () => {
  const text = new Text('UNCHANGED');
  const owner = new Layer(text);
  const before = structuredClone({
    behaviours: text.behaviours.length,
    frame: text.frame,
    paint: text.paint,
    typography: text.typography,
  });
  assert.throws(() => new SignalHeadlineBand(text), /must not already have a parent/u);
  assert.equal(text.parent, owner);
  assert.deepEqual({
    behaviours: text.behaviours.length,
    frame: text.frame,
    paint: text.paint,
    typography: text.typography,
  }, before);
});

test('every catalog entry resolves to a class whose static kind equals its id', async () => {
  for (const entry of memoryCatalog) {
    const module = await import(entry.import);
    const exportedClass = Object.values(module).find((value) => (
      typeof value === 'function' && value.kind === entry.id
    ));
    assert.ok(exportedClass, `${entry.import} must export ${entry.id}`);
  }
});

function findOutput(node, predicate, results = []) {
  if (!node) return results;
  if (predicate(node)) results.push(node);
  node.children.forEach((child) => findOutput(child, predicate, results));
  return results;
}

function validateRenderState(node, location) {
  if (!node) return;
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'children') validateFiniteData(value, `${location}.${key}`);
  }
  if (Object.hasOwn(node, 'opacity')) {
    assert.ok(node.opacity >= 0 && node.opacity <= 1, `${location}.opacity must be in [0, 1]`);
  }
  if (node.effects) {
    for (const key of ['blur', 'brightness', 'contrast', 'saturate']) {
      if (Object.hasOwn(node.effects, key)) {
        assert.ok(node.effects[key] >= 0, `${location}.effects.${key} must be non-negative`);
      }
    }
  }
  if (node.pose) {
    assert.ok(node.pose.scaleX > 0, `${location}.pose.scaleX must be positive`);
    assert.ok(node.pose.scaleY > 0, `${location}.pose.scaleY must be positive`);
  }
  node.children.forEach((child, index) => validateRenderState(child, `${location}.children[${index}]`));
}

function validateFiniteData(value, location) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${location} must be finite`);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => validateFiniteData(item, `${location}[${index}]`));
  } else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      validateFiniteData(nested, `${location}.${key}`);
    }
  }
}
