import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

import { createReactDriver } from '../core/drivers/react.js';
import { createRemotionComponent } from '../core/drivers/remotion.js';
import { renderGroup } from '../core/drivers/react/adapters/group.js';
import { renderSequence } from '../core/drivers/react/adapters/sequence.js';
import { renderText } from '../core/drivers/react/adapters/text.js';
import { Unit } from '../core/Unit.js';
import { Group } from '../units/group.js';
import { Sequence } from '../units/sequence.js';
import { Text } from '../units/text.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapterDirectory = path.join(root, 'core/drivers/react/adapters');
const React = Object.freeze({
  Fragment: Symbol('fragment'),
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
});

test('text-only ESM bundle contains exactly its explicitly imported Unit adapter', async () => {
  const result = await bundle([
    "import {Text} from './units/text.js';",
    "import {Opacity} from './behaviours/opacity.js';",
    "import {Tween} from './core/signals.js';",
    "import {createReactDriver} from './core/drivers/react.js';",
    "import {renderText} from './core/drivers/react/adapters/text.js';",
    "const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props,children})};",
    "const title=new Text('CUT3');",
    'title.add(new Opacity(title,new Tween({from:0,to:1,start:0,end:10})));',
    'export const frame=createReactDriver(React,renderText).render(title,{frame:5});',
  ].join('\n'));
  const inputs = inputFiles(result);

  assert.ok(inputs.some((file) => file.endsWith('core/drivers/react/adapters/text.js')));
  assert.ok(inputs.some((file) => file.endsWith('units/text.js')));
  assert.ok(inputs.some((file) => file.endsWith('behaviours/opacity.js')));
  for (const excluded of [
    'adapters/canvas.js',
    'adapters/group.js',
    'adapters/sequence.js',
    'adapters/three-scene.js',
    'units/canvas.js',
    'units/three/scene.js',
    'behaviours/rotate.js',
  ]) {
    assert.equal(inputs.some((file) => file.endsWith(excluded)), false, excluded);
  }
});

test('absolute composition pivot enters a bundle only through direct ESM imports', async () => {
  const result = await bundle([
    "import {CompositionPivot} from './units/composition-pivot.js';",
    "import {renderCompositionPivot} from './core/drivers/react/adapters/composition-pivot.js';",
    'export {CompositionPivot,renderCompositionPivot};',
  ].join('\n'));
  const inputs = inputFiles(result);

  assert.ok(inputs.some((file) => file.endsWith('units/composition-pivot.js')));
  assert.ok(inputs.some((file) => file.endsWith('adapters/composition-pivot.js')));
  for (const excluded of [
    'adapters/box.js',
    'adapters/canvas.js',
    'adapters/three-scene.js',
    'units/box.js',
    'units/canvas.js',
    'units/three/scene.js',
  ]) {
    assert.equal(inputs.some((file) => file.endsWith(excluded)), false, excluded);
  }
});

test('VectorPath and its direct adapter tree-shake every unrelated renderer path', async () => {
  const result = await bundle([
    "import {VectorPath} from './units/vector-path.js';",
    "import {renderVectorPath} from './core/drivers/react/adapters/vector-path.js';",
    'export {VectorPath,renderVectorPath};',
  ].join('\n'));
  const inputs = inputFiles(result);

  assert.ok(inputs.some((file) => file.endsWith('units/vector-path.js')));
  assert.ok(inputs.some((file) => file.endsWith('core/vector-path.js')));
  assert.ok(inputs.some((file) => file.endsWith('adapters/vector-path.js')));
  for (const excluded of [
    'adapters/canvas.js',
    'adapters/svg.js',
    'adapters/three-scene.js',
    'units/canvas.js',
    'units/svg.js',
    'units/three/scene.js',
  ]) {
    assert.equal(inputs.some((file) => file.endsWith(excluded)), false, excluded);
  }
});

test('style retrieval stays lightweight and does not pull AST or rendering code', async () => {
  const result = await bundle([
    "import {retrieveStyleMemories} from './src/memory/retrieval.js';",
    "export const found=retrieveStyleMemories([],{motion:['two-beat-snap']});",
  ].join('\n'));
  const inputs = inputFiles(result);

  assert.ok(inputs.some((file) => file.endsWith('src/memory/retrieval.js')));
  for (const excluded of [
    '@babel/parser',
    '/src/memory/style/',
    '/core/',
    '/units/',
    '/behaviours/',
  ]) {
    assert.equal(inputs.some((file) => file.includes(excluded)), false, excluded);
  }
});

test('promotion decision metadata validation does not pull the AST privacy scanner', async () => {
  const result = await bundle([
    "export {decideMemoryPromotion} from './src/memory/feedback.js';",
  ].join('\n'), { platform: 'node' });
  const inputs = inputFiles(result);

  assert.ok(inputs.some((file) => file.endsWith('src/memory/feedback.js')));
  assert.ok(inputs.some((file) => file.endsWith('src/memory/privacy/artifact.js')));
  for (const excluded of [
    '@babel/parser',
    '/src/memory/privacy/font-family-catalog.js',
    '/src/memory/privacy.js',
    '/src/memory/style/',
  ]) {
    assert.equal(inputs.some((file) => file.includes(excluded)), false, excluded);
  }
});

test('an exact style-memory import keeps unrelated foundations and heavy paths out', async () => {
  const result = await bundle([
    "import {SignalEditorialCard} from './test/fixtures/style-memory/signal-editorial-card.js';",
    "import {Text} from './units/text.js';",
    "export const card=new SignalEditorialCard(new Text('CUT3'));",
  ].join('\n'));
  const inputs = inputFiles(result);

  assert.ok(inputs.some((file) => file.endsWith('test/fixtures/style-memory/signal-editorial-card.js')));
  for (const excluded of [
    '/units/three/',
    '/units/canvas.js',
    '/core/drivers/',
    '/behaviours/blur.js',
    '/behaviours/opacity.js',
    '/behaviours/scale.js',
  ]) {
    assert.equal(inputs.some((file) => file.includes(excluded)), false, excluded);
  }
});

test('generic React and Remotion boundaries import zero concrete Units', async () => {
  const result = await bundle([
    "export {createReactDriver} from './core/drivers/react.js';",
    "export {createRemotionDriver} from './core/drivers/remotion.js';",
  ].join('\n'));
  const inputs = inputFiles(result);
  assert.equal(inputs.some((file) => file.includes('/units/')), false);
  assert.equal(inputs.some((file) => file.includes('/react/adapters/')), false);
});

test('adapters use direct class identity and reject a matching kind impostor', () => {
  class TextImpostor extends Unit {
    static kind = 'unit.text';

    constructor() {
      super();
      this.text = 'not a Text instance';
    }
  }

  const driver = createReactDriver(React, renderText);
  assert.throws(() => driver.render(new TextImpostor()), /No static React adapter for TextImpostor/);
  assert.equal(driver.render(new Text('real')).type, 'span');
});

test('a generated dispatcher is ordinary static code, not an adapter collection', () => {
  const driver = createReactDriver(React, renderCompositionUnit);
  const rootUnit = new Group(new Sequence(new Text('scene'), { from: 10, duration: 5 }));

  const before = driver.render(rootUnit, { frame: 9 });
  const active = driver.render(rootUnit, { frame: 12 });
  assert.deepEqual(before.children, []);
  assert.equal(active.children[0].children[0].type, 'span');
  assert.deepEqual(active.children[0].children[0].children, ['scene']);
});

test('Remotion hooks and components stay in the backend boundary', () => {
  const calls = [];
  const remotion = {
    Sequence: 'Remotion.Sequence',
    useCurrentFrame() { calls.push('frame'); return 12; },
    useVideoConfig() {
      calls.push('config');
      return { durationInFrames: 60, fps: 30, height: 1920, width: 1080 };
    },
  };
  const Composition = createRemotionComponent(
    React,
    remotion,
    renderCompositionUnit,
    () => new Group(new Sequence(new Text('scene'), { from: 10, duration: 5 })),
  );
  const rendered = Composition({});

  assert.deepEqual(calls, ['frame', 'config']);
  assert.equal(rendered.children[0].type, remotion.Sequence);
  assert.equal(rendered.children[0].children[0].type, 'span');
});

test('every adapter module imports one concrete Unit and there is no import-all barrel', async () => {
  const entries = (await fs.readdir(adapterDirectory)).filter((name) => name.endsWith('.js')).sort();
  assert.equal(entries.includes('index.js'), false);

  for (const name of entries) {
    const source = await fs.readFile(path.join(adapterDirectory, name), 'utf8');
    const unitImports = [...source.matchAll(/from\s+['"][^'"]*units\/[^'"]+['"]/gu)];
    assert.equal(unitImports.length, 1, name);
    assert.match(source, /context\.unit instanceof /u, name);
    assert.doesNotMatch(source, /constructor\.kind|\bimport\s*\(|loadFactory|adapterLoaders/u, name);
  }

  for (const name of ['react.js', 'remotion.js']) {
    const source = await fs.readFile(path.join(root, 'core/drivers', name), 'utf8');
    assert.doesNotMatch(source, /from\s+['"][^'"]*units\/|constructor\.kind|\bimport\s*\(/u, name);
  }
});

test('Three scene enters the graph only through its explicit adapter import', async () => {
  const result = await bundle([
    "import {createReactDriver} from './core/drivers/react.js';",
    "import {renderThreeScene} from './core/drivers/react/adapters/three-scene.js';",
    "import {ThreeScene} from './units/three/scene.js';",
    "const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props,children})};",
    "const driver=createReactDriver(React,renderThreeScene,{components:{threeScene:'ThreeCanvas'}});",
    'export const scene=driver.render(new ThreeScene());',
  ].join('\n'));
  const inputs = inputFiles(result);
  assert.ok(inputs.some((file) => file.endsWith('core/drivers/react/adapters/three-scene.js')));
  assert.ok(inputs.some((file) => file.endsWith('units/three/scene.js')));
});

function renderCompositionUnit(context) {
  const group = renderGroup(context);
  if (group !== context.unhandled) return group;
  const sequence = renderSequence(context);
  if (sequence !== context.unhandled) return sequence;
  return renderText(context);
}

async function bundle(contents, options = {}) {
  return build({
    absWorkingDir: root,
    bundle: true,
    format: 'esm',
    logLevel: 'silent',
    metafile: true,
    platform: options.platform ?? 'browser',
    stdin: { contents, resolveDir: root, sourcefile: 'tree-shake-entry.js' },
    treeShaking: true,
    write: false,
  });
}

function inputFiles(result) {
  return Object.keys(result.metafile.inputs).map((value) => value.replaceAll('\\', '/'));
}
