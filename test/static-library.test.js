import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  generateNavigationIndex,
  validateNavigationIndex,
  verifyDomTreeShaking,
  verifyLibrary,
} from '../src/library/index.js';

test('static discovery writes a deterministic navigation-only index without evaluating modules', async (t) => {
  const rootDir = await fixture(t, {
    'core/Unit.js': 'export class Unit {}\n',
    'core/Behaviour.js': 'export class Behaviour {}\n',
    'units/Card.js': [
      "import { Unit } from '../core/Unit.js';",
      "throw new Error('discovery must not evaluate this module');",
      'class Card extends Unit {',
      "  static kind = 'unit.card';",
      '}',
      'export { Card as VisualCard };',
      '',
    ].join('\n'),
    'behaviours/Fade.js': [
      "import { Behaviour } from '../core/Behaviour.js';",
      'export default class Fade extends Behaviour {',
      "  static kind = 'behaviour.fade';",
      '}',
      '',
    ].join('\n'),
  });

  const first = await generateNavigationIndex({ rootDir });
  const firstBytes = await fs.readFile(path.join(rootDir, 'index.generated.json'), 'utf8');
  const second = await generateNavigationIndex({ rootDir });
  const secondBytes = await fs.readFile(path.join(rootDir, 'index.generated.json'), 'utf8');

  assert.equal(first.verification.ok, true);
  assert.equal(firstBytes, secondBytes);
  assert.equal(first.json, second.json);
  assert.deepEqual(Object.keys(first.index), [
    'format',
    'version',
    'indexSha256',
    'entries',
  ]);
  assert.match(first.index.indexSha256, /^[a-f0-9]{64}$/u);
  assert.equal(validateNavigationIndex(first.index).ok, true);
  assert.deepEqual(first.index, {
    format: 'cut3-static-library-index',
    version: 1,
    indexSha256: first.index.indexSha256,
    entries: [
      {
        kind: 'behaviour.fade',
        type: 'behaviour',
        source: 'behaviours/Fade.js',
        export: 'default',
      },
      {
        kind: 'unit.card',
        type: 'unit',
        source: 'units/Card.js',
        export: 'VisualCard',
      },
    ],
  });
  assert.deepEqual(Object.keys(first.index.entries[0]), ['kind', 'type', 'source', 'export']);
  assert.doesNotMatch(firstBytes, /backend|factory|dependency|confidence|runtime/iu);
});

test('navigation index hash and minimal JSON shape fail closed', async (t) => {
  const rootDir = await fixture(t, {
    'units/Card.js': "export class Card extends Object { static kind = 'unit.card'; }\n",
  });
  const { index } = await generateNavigationIndex({ rootDir });

  const tampered = structuredClone(index);
  tampered.entries[0].source = 'units/../private.js';
  const tamperedReport = validateNavigationIndex(tampered);
  assert.equal(tamperedReport.ok, false);
  assert.ok(tamperedReport.errors.some((error) => error.code === 'invalid-entry-source'));
  assert.ok(tamperedReport.errors.some((error) => error.code === 'index-sha256-mismatch'));

  const decorated = { ...index, dependencies: [] };
  assert.equal(validateNavigationIndex(decorated).ok, false);
});

test('static verification rejects inherited identity, dynamic loading and engine metadata', async (t) => {
  const rootDir = await fixture(t, {
    'units/Base.js': [
      'export class Base extends Object {',
      "  static kind = 'unit.base';",
      '}',
      '',
    ].join('\n'),
    'units/Card.js': [
      "import { Base } from './Base.js';",
      'export class Card extends Base {',
      "  constructor() { super(); this.backend = 'dom'; }",
      '  async load() { return import("./Base.js"); }',
      '}',
      '',
    ].join('\n'),
    'behaviours/Fade.js': [
      'export class Fade extends Object {',
      "  static kind = 'unit.fade';",
      "  static factoryId = 'legacy';",
      '  load() { return require("legacy"); }',
      '}',
      '',
    ].join('\n'),
  });

  const report = await verifyLibrary({ rootDir });
  const codes = report.errors.map((error) => error.code);

  assert.equal(report.ok, false);
  assert.ok(codes.includes('missing-own-static-kind'));
  assert.ok(codes.includes('invalid-kind-prefix'));
  assert.ok(codes.includes('dynamic-import'));
  assert.ok(codes.includes('commonjs-require'));
  assert.ok(codes.includes('forbidden-library-field'));
  await assert.rejects(() => generateNavigationIndex({ rootDir }), /Static library verification failed/);
});

test('duplicate static kinds are rejected before index generation', async (t) => {
  const rootDir = await fixture(t, {
    'units/Left.js': "export class Left extends Object { static kind = 'unit.same'; }\n",
    'units/Right.js': "export class Right extends Object { static kind = 'unit.same'; }\n",
  });
  const report = await verifyLibrary({ rootDir });
  assert.equal(report.ok, false);
  assert.equal(report.errors.filter((error) => error.code === 'duplicate-kind').length, 1);
});

test('DOM tree-shaking probe follows only reachable static ESM imports', async (t) => {
  const rootDir = await fixture(t, {
    'dom-entry.js': "export { Text } from './units/dom/text.js';\n",
    'all-entry.js': [
      "export { Text } from './units/dom/text.js';",
      "export { Scene } from './units/three/scene.js';",
      '',
    ].join('\n'),
    'core/Unit.js': 'export class Unit {}\n',
    'units/dom/text.js': [
      "import { Unit } from '../../core/Unit.js';",
      "export class Text extends Unit { static kind = 'unit.text'; }",
      '',
    ].join('\n'),
    'units/three/scene.js': [
      "import * as THREE from 'three';",
      "export class Scene { static kind = 'unit.three.scene'; static THREE = THREE; }",
      '',
    ].join('\n'),
  });

  const dom = await verifyDomTreeShaking({ rootDir, entries: ['dom-entry.js'] });
  assert.equal(dom.ok, true);
  assert.deepEqual(dom.files, ['core/Unit.js', 'dom-entry.js', 'units/dom/text.js']);

  const barrel = await verifyDomTreeShaking({ rootDir, entries: ['all-entry.js'] });
  assert.equal(barrel.ok, false);
  assert.ok(barrel.errors.some((error) => error.code === 'heavy-import-reachable-from-dom'));
  assert.ok(barrel.errors.some((error) => error.code === 'heavy-module-reachable-from-dom'));
});

async function fixture(t, files) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-static-library-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  await Promise.all(Object.entries(files).map(async ([relativeFile, source]) => {
    const filename = path.join(rootDir, relativeFile);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, source, 'utf8');
  }));
  return rootDir;
}
