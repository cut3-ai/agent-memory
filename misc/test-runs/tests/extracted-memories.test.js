import assert from 'node:assert/strict';
import test from 'node:test';

import { TerminalMessageCadence } from '@cut3/agent-memory/behaviours/blue-terminal/TerminalMessageCadence';
import { TerminalPanelBoot } from '@cut3/agent-memory/behaviours/blue-terminal/TerminalPanelBoot';
import { BoilingInk } from '@cut3/agent-memory/behaviours/fight-zine/BoilingInk';
import { ZineRowStagger } from '@cut3/agent-memory/behaviours/fight-zine/ZineRowStagger';
import { ChromaPopSettle } from '@cut3/agent-memory/behaviours/neon-heart-pop/ChromaPopSettle';
import { memoryCatalog } from '@cut3/agent-memory/catalog';
import { blueTerminalMessage } from '@cut3/agent-memory/compositions/BlueTerminalMessage';
import { fightZineRankRow } from '@cut3/agent-memory/compositions/FightZineRankRow';
import { neonHeartNameplate } from '@cut3/agent-memory/compositions/NeonHeartNameplate';
import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { BlueTerminalMessagePanel } from '@cut3/agent-memory/units/blue-terminal/BlueTerminalMessagePanel';
import { FightZineRankRow } from '@cut3/agent-memory/units/fight-zine/FightZineRankRow';
import { NeonChromaNameplate } from '@cut3/agent-memory/units/neon-heart-pop/NeonChromaNameplate';

const runtimeContentSets = Object.freeze([
  Object.freeze({
    blue: 'SYNTHETIC TERMINAL ALPHA',
    fight: Object.freeze(['01', 'SYNTHETIC FIGHTER ALPHA', '875', '+14']),
    neon: Object.freeze(['SYNTHETIC NEON ALPHA', 'synthetic accent alpha']),
  }),
  Object.freeze({
    blue: 'SYNTHETIC TERMINAL BETA',
    fight: Object.freeze(['02', 'SYNTHETIC FIGHTER BETA', '642', '+09']),
    neon: Object.freeze(['SYNTHETIC NEON BETA', 'synthetic accent beta']),
  }),
]);

test('catalog exposes exactly eight reconstructed Units and Behaviours, never builders', () => {
  const styles = new Set(['blue-terminal', 'neon-heart-pop', 'fight-zine']);
  const entries = memoryCatalog.filter((entry) => styles.has(entry.style));

  assert.equal(entries.length, 8);
  assert.deepEqual(
    Object.fromEntries([...styles].map((style) => [
      style,
      entries.filter((entry) => entry.style === style).length,
    ])),
    { 'blue-terminal': 3, 'neon-heart-pop': 2, 'fight-zine': 3 },
  );
  assert.ok(entries.every((entry) => !entry.import.includes('/compositions/')));
});

test('bare reconstructed Units contain zero hidden Behaviours in their complete trees', () => {
  const units = [
    bareBlue('SYNTHETIC BARE TERMINAL'),
    bareNeon('SYNTHETIC BARE NEON', 'synthetic bare accent'),
    bareFight('03', 'SYNTHETIC BARE FIGHTER', '510', '+07'),
  ];

  for (const root of units) {
    const hiddenKinds = [];
    visitUnits(root, (unit) => {
      hiddenKinds.push(...unit.behaviours.map((behaviour) => behaviour.constructor.kind));
    });
    assert.deepEqual(hiddenKinds, [], `${root.constructor.kind} must remain a static tree`);
  }

  const shared = new Text('SHARED');
  assert.throws(
    () => new FightZineRankRow(shared, new Text('NAME'), shared, new Text('GAIN')),
    /four distinct Text Units/u,
  );
});

test('builders contain no runtime checks or branches and preserve explicit Behaviour ownership', () => {
  const forbidden = /\b(?:if|else|switch|case|throw|try|catch|finally|typeof|instanceof|for|while|do)\b|\?|&&|\|\|/u;
  for (const builder of [blueTerminalMessage, neonHeartNameplate, fightZineRankRow]) {
    assert.doesNotMatch(builder.toString(), forbidden, `${builder.name} must stay branch-free`);
  }

  const blue = blueTerminalMessage('SYNTHETIC OWNER TERMINAL');
  const blueCadenceOwner = findBehaviourOwner(
    blue,
    'behaviour.blue-terminal.message-cadence',
  );
  assert.deepEqual(behaviourKinds(blue), ['behaviour.blue-terminal.panel-boot']);
  assert.deepEqual(treeBehaviourKinds(blue), [
    'behaviour.blue-terminal.panel-boot',
    'behaviour.blue-terminal.message-cadence',
  ]);
  assert.ok(blue.behaviours[0] instanceof TerminalPanelBoot);
  assert.equal(blue.behaviours[0].unit, blue);
  assert.equal(blueCadenceOwner.constructor.kind, 'unit.text');
  assert.ok(blueCadenceOwner.behaviours[0] instanceof TerminalMessageCadence);
  assert.equal(blueCadenceOwner.behaviours[0].unit, blueCadenceOwner);

  const neon = neonHeartNameplate('SYNTHETIC OWNER NEON', 'synthetic owner accent');
  assert.deepEqual(behaviourKinds(neon), ['behaviour.neon-heart-pop.chroma-pop-settle']);
  assert.ok(neon.behaviours[0] instanceof ChromaPopSettle);
  assert.equal(neon.behaviours[0].unit, neon);

  const fight = fightZineRankRow('04', 'SYNTHETIC OWNER FIGHTER', '720', '+11');
  assert.deepEqual(behaviourKinds(fight), [
    'behaviour.fight-zine.row-stagger',
    'behaviour.fight-zine.boiling-ink',
  ]);
  assert.ok(fight.behaviours.every((behaviour) => behaviour.unit === fight));
});

test('all three builders pass through two independent synthetic runtime content sets', () => {
  for (const content of runtimeContentSets) {
    const blueTexts = textValues(blueTerminalMessage(content.blue));
    const neonTexts = textValues(neonHeartNameplate(...content.neon));
    const fightTexts = textValues(fightZineRankRow(...content.fight));

    assert.ok(blueTexts.includes(content.blue));
    assert.ok(content.neon.every((value) => neonTexts.includes(value)));
    assert.ok(content.fight.every((value) => fightTexts.includes(value)));
  }
});

test('blue terminal boot and cadence preserve their authored frame mechanics', () => {
  const source = 'SYNTHETIC CADENCE MESSAGE';
  const unit = blueTerminalMessage(source);
  const content = findBehaviourOwner(unit, 'behaviour.blue-terminal.message-cadence');
  const composition = wrap(unit);

  const bootStart = stateAt(composition, unit, 0);
  const bootEnd = stateAt(composition, unit, 18);
  assert.equal(bootStart.pose.scaleX, 0.78);
  assert.equal(bootStart.pose.scaleY, 0.56);
  assert.equal(bootStart.pose.x, -24);
  assert.equal(bootStart.pose.y, 86);
  assert.equal(bootStart.opacity, 0);
  assert.equal(bootEnd.pose.scaleX, 1);
  assert.equal(bootEnd.pose.scaleY, 1);
  assert.equal(bootEnd.pose.x, 0);
  assert.equal(bootEnd.pose.y, 0);

  assert.equal(stateAt(composition, content, 9).text, '');
  assert.equal(stateAt(composition, content, 10).text, `${source.slice(0, 2)}▌`);
  assert.equal(stateAt(composition, content, 11).text, `${source.slice(0, 3)}▌`);
});

test('neon pop follows the exact zero, overshoot, settle scale sequence', () => {
  const unit = neonHeartNameplate('SYNTHETIC POP', 'synthetic glow');
  const composition = wrap(unit);
  const scale = [0, 10, 18].map((frame) => stateAt(composition, unit, frame).pose.scaleX);

  assert.deepEqual(scale, [0, 1.08, 1]);
  assert.equal(stateAt(composition, unit, 0).opacity, 0);
  assert.notDeepEqual(
    stateAt(composition, unit, 20).pose,
    stateAt(composition, unit, 22).pose,
    'landed neon keeps its deterministic held-frame jitter and pulse',
  );
});

test('fight-zine ink holds deterministic two-frame buckets and adds after entrance', () => {
  const boilOnly = bareFight('05', 'SYNTHETIC BOIL', '430', '+05');
  boilOnly.addBehaviour(new BoilingInk(boilOnly));
  const boilComposition = wrap(boilOnly);
  const boil0 = stateAt(boilComposition, boilOnly, 0).pose;
  const boil1 = stateAt(boilComposition, boilOnly, 1).pose;
  const boil2 = stateAt(boilComposition, boilOnly, 2).pose;
  assert.deepEqual(boil0, boil1);
  assert.notDeepEqual(boil1, boil2);

  const entranceOnly = bareFight('06', 'SYNTHETIC ENTRANCE', '390', '+04');
  entranceOnly.addBehaviour(new ZineRowStagger(entranceOnly));
  const entranceComposition = wrap(entranceOnly);
  assertClose(stateAt(entranceComposition, entranceOnly, 0).pose.x, -120);
  assertClose(stateAt(entranceComposition, entranceOnly, 14).pose.x, 0);

  const full = fightZineRankRow('07', 'SYNTHETIC ADDITIVE', '810', '+18');
  const fullComposition = wrap(full);
  const frame = 6;
  const fullPose = stateAt(fullComposition, full, frame).pose;
  const entrancePose = stateAt(entranceComposition, entranceOnly, frame).pose;
  const boilPose = stateAt(boilComposition, boilOnly, frame).pose;
  assertClose(fullPose.x, entrancePose.x + boilPose.x);
  assertClose(fullPose.y, entrancePose.y + boilPose.y);
  assertClose(fullPose.rotate, entrancePose.rotate + boilPose.rotate);
});

test('both runtime sets produce finite frames through real Composition wrappers', () => {
  for (const content of runtimeContentSets) {
    const units = [
      blueTerminalMessage(content.blue),
      neonHeartNameplate(...content.neon),
      fightZineRankRow(...content.fight),
    ];
    for (const unit of units) {
      const composition = wrap(unit);
      for (const frame of [0, 1, 2, 9, 10, 14, 18, 36]) {
        const projection = frameAt(composition, frame);
        visitUnits(composition, (child) => {
          assert.ok(projection.has(child));
          assertFiniteData(projection.stateOf(child), `${unit.constructor.kind} frame ${frame}`);
        });
      }
    }
  }
});

function bareBlue(text) {
  return new BlueTerminalMessagePanel(new Text(text));
}

function bareNeon(primary, accent) {
  return new NeonChromaNameplate(new Text(primary), new Text(accent));
}

function bareFight(rank, name, value, gain) {
  return new FightZineRankRow(
    new Text(rank),
    new Text(name),
    new Text(value),
    new Text(gain),
  );
}

function behaviourKinds(unit) {
  return unit.behaviours.map((behaviour) => behaviour.constructor.kind);
}

function treeBehaviourKinds(root) {
  const kinds = [];
  visitUnits(root, (unit) => kinds.push(...behaviourKinds(unit)));
  return kinds;
}

function findBehaviourOwner(root, kind) {
  let owner;
  visitUnits(root, (unit) => {
    if (unit.behaviours.some((behaviour) => behaviour.constructor.kind === kind)) owner = unit;
  });
  assert.ok(owner, `expected owner for ${kind}`);
  return owner;
}

function textValues(root) {
  const values = [];
  visitUnits(root, (unit) => {
    if (unit.constructor.kind === 'unit.text') values.push(unit.text);
  });
  return values;
}

function wrap(unit) {
  return new Composition(unit, {
    background: '#000000',
    duration: 60,
    fps: 30,
    height: 1920,
    width: 1080,
  });
}

function frameAt(composition, frame) {
  return projectFrame(composition, {
    duration: composition.duration,
    fps: composition.fps,
    frame,
    height: composition.height,
    width: composition.width,
  });
}

function stateAt(composition, unit, frame) {
  return frameAt(composition, frame).stateOf(unit);
}

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} must equal ${expected}`);
}

function assertFiniteData(value, location) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${location} must contain only finite numbers`);
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFiniteData(entry, `${location}[${index}]`));
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      assertFiniteData(entry, `${location}.${key}`);
    }
  }
}
