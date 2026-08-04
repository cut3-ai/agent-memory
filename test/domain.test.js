import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { Behaviour } from '../core/Behaviour.js';
import { Engine } from '../core/Engine.js';
import { projectUnit } from '../core/frame.js';
import { Keyframes, Oscillation, Spring, Tween } from '../core/signals.js';
import { Unit } from '../core/Unit.js';
import { createReactDriver } from '../core/drivers/react.js';
import { createRemotionComponent } from '../core/drivers/remotion.js';
import { renderGroup } from '../core/drivers/react/adapters/group.js';
import { renderSequence } from '../core/drivers/react/adapters/sequence.js';
import { renderText } from '../core/drivers/react/adapters/text.js';
import { Blur } from '../behaviours/blur.js';
import { Opacity } from '../behaviours/opacity.js';
import { Rotate } from '../behaviours/rotate.js';
import { Scale } from '../behaviours/scale.js';
import { TextReveal } from '../behaviours/text-reveal.js';
import { Translate } from '../behaviours/translate.js';
import { VisibleDuring } from '../behaviours/visible-during.js';
import { Audio } from '../units/audio.js';
import { Canvas } from '../units/canvas.js';
import { DialogueCard } from '../units/dialogue-card.js';
import { Group } from '../units/group.js';
import { Image } from '../units/image.js';
import { Layer } from '../units/layer.js';
import { RankingCard } from '../units/ranking-card.js';
import { Repeat } from '../units/repeat.js';
import { ScatterText } from '../units/scatter-text.js';
import { Sequence } from '../units/sequence.js';
import { SolidFill } from '../units/solid-fill.js';
import { Sprite } from '../units/sprite.js';
import { Surface } from '../units/surface.js';
import { Svg } from '../units/svg.js';
import { Switch } from '../units/switch.js';
import { Text } from '../units/text.js';
import { ThreeScene } from '../units/three/scene.js';
import { Video } from '../units/video.js';
import { Vignette } from '../units/vignette.js';

const UNIT_CLASSES = [
  Audio, Canvas, DialogueCard, Group, Image, Layer, RankingCard, Repeat,
  ScatterText, Sequence, SolidFill, Sprite, Surface, Svg, Switch, Text,
  ThreeScene, Video, Vignette,
];
const BEHAVIOUR_CLASSES = [Blur, Opacity, Rotate, Scale, TextReveal, Translate, VisibleDuring];
const React = {
  Fragment: Symbol('fragment'),
  createElement(type, props, ...children) { return { type, props: props ?? {}, children }; },
};

function renderDriverUnit(context) {
  const group = renderGroup(context);
  if (group !== context.unhandled) return group;
  const sequence = renderSequence(context);
  if (sequence !== context.unhandled) return sequence;
  return renderText(context);
}

test('domain identity is static on direct class subclasses and contains no engine metadata', () => {
  for (const Concrete of UNIT_CLASSES) {
    assert.equal(Object.hasOwn(Concrete, 'kind'), true, Concrete.name);
    assert.equal(Object.getPrototypeOf(Concrete), Unit, Concrete.name);
  }
  for (const Concrete of BEHAVIOUR_CLASSES) {
    assert.equal(Object.hasOwn(Concrete, 'kind'), true, Concrete.name);
    assert.equal(Object.getPrototypeOf(Concrete), Behaviour, Concrete.name);
    assert.equal(Object.hasOwn(Concrete, 'writes'), false, Concrete.name);
  }
  const unit = new Text('hello');
  const behaviour = new Opacity(unit, 0.5);
  for (const field of ['kind', 'factory', 'factoryId', 'backend', 'runtime', 'componentKind']) {
    assert.equal(Object.hasOwn(unit, field), false, field);
    assert.equal(Object.hasOwn(behaviour, field), false, field);
  }
  assert.equal('attach' in behaviour, false);
});

test('Behaviour gets one permanent constructor Unit and lifecycle belongs to that Unit', () => {
  const events = [];
  class Probe extends Behaviour {
    static kind = 'behaviour.probe';
    onAdded() { events.push(['added', this.unit.behaviours.includes(this)]); }
    onRemoved() { events.push(['removed', this.unit.behaviours.includes(this)]); }
    onFrame() { this.unit.opacity = 1; }
  }
  const left = new Group();
  const right = new Group();
  assert.throws(() => new Behaviour(), /requires a Unit/);
  const probe = new Probe(left);
  left.add(probe);
  assert.throws(() => { probe.unit = right; }, TypeError);
  assert.throws(() => right.add(probe), /constructor Unit/);
  assert.throws(() => left.add(new Probe(left)), /already has Behaviour/);
  left.remove(probe);
  assert.equal(probe.unit, left);
  assert.deepEqual(events, [['added', true], ['removed', false]]);
});

test('Unit composition accepts existing objects, preserves one parent, and rejects invalid input', () => {
  class Card extends Unit {
    static kind = 'unit.card';
    constructor(unit) { super(unit); }
  }
  const text = new Text('card');
  const card = new Card(text);
  assert.deepEqual(card.children, [text]);
  assert.equal(text.parent, card);
  assert.throws(() => new Group(text), /one parent/);
  assert.throws(() => text.add(new Text('nested')), /primitive Unit/);
  assert.throws(() => card.add(() => new Text('late')), /existing Unit or Behaviour/);
  card.remove(text);
  assert.equal(text.parent, null);
  const parent = new Group(text);
  parent.remove(text);
  text.add(new Opacity(text, 1));
  assert.throws(() => text.add(parent), /primitive Unit/);
});

test('template Units receive an already-created Unit and never manufacture hidden children', () => {
  const dialogueContent = new Group(new Text('speaker'), new Text('line'));
  const dialogue = new DialogueCard(dialogueContent, { background: 'black' });
  assert.deepEqual(dialogue.children, [dialogueContent]);

  const rankingContent = new Group(new Text('1'), new Text('title'));
  const ranking = new RankingCard(rankingContent);
  assert.deepEqual(ranking.children, [rankingContent]);

  const scatteredText = new Text('word');
  const scatter = new ScatterText(scatteredText, { x: 10, y: 20 });
  assert.deepEqual(scatter.children, [scatteredText]);
  assert.deepEqual(scatter.appearance, {
    position: 'absolute', left: 10, top: 20,
  });
  assert.throws(() => new DialogueCard({ text: 'raw' }), /requires a Unit/);
  assert.throws(() => new RankingCard({ title: 'raw' }), /requires a Unit/);
  assert.throws(() => new ScatterText({ text: 'raw' }), /requires a Unit/);
});

test('absolute-frame Engine evaluates independent visual channels transactionally', () => {
  const text = new Text('CUT3', { color: 'white' });
  text.add(
    new Opacity(text, new Tween({ from: 0, to: 1, start: 0, end: 10 })),
    new Scale(text, new Spring({ from: 1, to: 2, damping: 10, frequency: 0.2 })),
    new Translate(text, new Keyframes([
      { frame: 0, value: { x: 0, y: 0 } },
      { frame: 10, value: { x: 100, y: -20 } },
    ])),
    new Rotate(text, new Oscillation({ center: 0, amplitude: 10, period: 20 })),
    new Blur(text, new Tween({ from: 8, to: 0, start: 0, end: 10 })),
    new VisibleDuring(text, { from: 2, to: 8 }),
    new TextReveal(text, { from: 0, to: 10 }),
  );
  const engine = new Engine(new Group(text));
  const frame5 = engine.at(5);
  engine.at(9);
  assert.deepEqual(engine.at(5), frame5);
  assert.equal(frame5.children[0].text, 'CU');
  assert.equal(frame5.children[0].opacity, 0.5);
  assert.deepEqual(frame5.children[0].transform.translate, { x: 50, y: -10, unit: 'px' });
  assert.equal(frame5.children[0].filter.blur, 4);
  assert.equal(frame5.children[0].visible, true);
  assert.equal(Object.hasOwn(text, 'opacity'), false, 'projection restores owner state');
});

test('Behaviour and control configs are copied, immutable, and callback-free', () => {
  const vector = { x: 10, y: 20 };
  const unit = new Group();
  const translate = new Translate(unit, vector);
  vector.x = 999;
  unit.add(translate);
  assert.deepEqual(projectUnit(unit, 0).transform.translate, { x: 10, y: 20, unit: 'px' });
  assert.equal(Object.isFrozen(translate.config), true);
  assert.equal(Object.isFrozen(translate.config.value), true);
  assert.throws(() => { translate.config.value.x = 5; }, TypeError);
  assert.throws(() => new Opacity(new Group(), () => 1), /plain data or a built-in Signal/);
  assert.throws(
    () => new Switch(() => 'a', { a: new Group() }),
    /plain data or a built-in Signal/,
  );
});

test('atomic write contract rejects combined and conflicting Behaviours', () => {
  class Combined extends Behaviour {
    static kind = 'behaviour.combined';
    onFrame() { this.unit.opacity = 1; this.unit.transform = { scale: 2 }; }
  }
  const combined = new Group();
  combined.add(new Combined(combined));
  assert.throws(() => projectUnit(combined, 0), /more than one visual concern/);

  class AlternateOpacity extends Behaviour {
    static kind = 'behaviour.alternate-opacity';
    onFrame() { this.unit.opacity = 0.25; }
  }
  const conflict = new Group();
  conflict.add(new Opacity(conflict, 0.5), new AlternateOpacity(conflict));
  assert.throws(() => projectUnit(conflict, 0), /More than one Behaviour changes opacity/);

  class SameOpacity extends Behaviour {
    static kind = 'behaviour.same-opacity';
    onFrame() { this.unit.opacity = 0.5; }
  }
  const equalConflict = new Group();
  equalConflict.add(new Opacity(equalConflict, 0.5), new SameOpacity(equalConflict));
  assert.throws(
    () => projectUnit(equalConflict, 0),
    /More than one Behaviour changes opacity/,
  );

  class CombinedAppearance extends Behaviour {
    static kind = 'behaviour.combined-appearance';
    onFrame() { this.unit.appearance = { color: 'red', opacity: 0.5 }; }
  }
  const appearance = new Group();
  appearance.add(new CombinedAppearance(appearance));
  assert.throws(() => projectUnit(appearance, 0), /more than one visual concern/);

  class Throwing extends Behaviour {
    static kind = 'behaviour.throwing';
    onFrame() { this.unit.opacity = 1; throw new Error('frame failed'); }
  }
  const rollback = new Layer(new Text('rollback'), {
    color: 'white',
    nested: { value: 1 },
  });
  rollback.add(new Throwing(rollback));
  assert.equal(Object.isFrozen(rollback.appearance), true);
  assert.equal(Object.isFrozen(rollback.appearance.nested), true);
  assert.throws(() => projectUnit(rollback, 0), /frame failed/);
  assert.equal(Object.hasOwn(rollback, 'opacity'), false);
  assert.deepEqual(rollback.appearance, { color: 'white', nested: { value: 1 } });
  assert.equal(Object.isFrozen(rollback.appearance), true);
  assert.equal(Object.isFrozen(rollback.appearance.nested), true);
});

test('React and Remotion drivers render one graph while hooks stay outside domain', () => {
  const text = new Text('now');
  text.add(new Opacity(text, new Keyframes([
    { frame: 0, value: 0 },
    { frame: 100, value: 1 },
  ])));
  const root = new Group(new Sequence(text, { from: 10, duration: 5 }));
  const driver = createReactDriver(React, renderDriverUnit);
  assert.equal(driver.render(root, { frame: 9 }).children[0], undefined);
  assert.equal(driver.render(root, { frame: 12 }).children[0].children[0].props.style.opacity, 0.02);

  let frameHooks = 0;
  let configHooks = 0;
  const remotion = {
    Sequence: 'sequence',
    useCurrentFrame() { frameHooks += 1; return 12; },
    useVideoConfig() { configHooks += 1; return { fps: 30, width: 100, height: 100, durationInFrames: 50 }; },
  };
  const Component = createRemotionComponent(React, remotion, renderDriverUnit, () => root);
  assert.equal(Component({}).children[0].type, 'sequence');
  assert.equal(frameHooks, 1);
  assert.equal(configHooks, 1);
});

test('public domain is static ESM and DOM path has no heavy Three dependency', async () => {
  for (const root of ['core', 'units', 'behaviours']) {
    for (const file of await collectJavaScript(path.resolve(root))) {
      const source = await fs.readFile(file, 'utf8');
      assert.doesNotMatch(source, /\bloadFactory\b|\bthis\.factoryId\b|\bthis\.backend\b|\bimport\s*\(/u, file);
      if (!file.includes(`${path.sep}three${path.sep}`)) {
        assert.doesNotMatch(source, /(?:from\s+['"]three['"]|@react-three|remotion-three)/iu, file);
      }
    }
  }
});

async function collectJavaScript(directory) {
  const output = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await collectJavaScript(target));
    else if (entry.name.endsWith('.js')) output.push(target);
  }
  return output;
}
