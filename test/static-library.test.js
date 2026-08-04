import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createPromotionLedger,
  createReviewedCoreLedger,
  discoverLibrary,
  generateNavigationIndex,
  validateNavigationIndex,
  validatePromotionLedger,
  verifyDomTreeShaking,
  verifyLibrary,
} from '../src/library/index.js';
import { sha256, stableStringify } from '../src/lib.js';

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

  const promotionLedger = await reviewedLedger(rootDir, ['behaviour.fade', 'unit.card']);

  const first = await generateNavigationIndex({ rootDir, promotionLedger });
  const firstBytes = await fs.readFile(path.join(rootDir, 'index.generated.json'), 'utf8');
  const second = await generateNavigationIndex({ rootDir, promotionLedger });
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
    version: 2,
    indexSha256: first.index.indexSha256,
    entries: [
      {
        kind: 'behaviour.fade',
        type: 'behaviour',
        role: 'infrastructure',
        source: 'behaviours/Fade.js',
        export: 'default',
      },
      {
        kind: 'unit.card',
        type: 'unit',
        role: 'infrastructure',
        source: 'units/Card.js',
        export: 'VisualCard',
      },
    ],
  });
  assert.deepEqual(Object.keys(first.index.entries[0]), [
    'kind', 'type', 'role', 'source', 'export',
  ]);
  assert.doesNotMatch(firstBytes, /backend|factory|dependency|confidence|runtime/iu);
});

test('navigation index hash and minimal JSON shape fail closed', async (t) => {
  const rootDir = await fixture(t, {
    'core/Unit.js': 'export class Unit {}\n',
    'units/Card.js': [
      "import { Unit } from '../core/Unit.js';",
      "export class Card extends Unit { static kind = 'unit.card'; }",
      '',
    ].join('\n'),
  });
  const promotionLedger = await reviewedLedger(rootDir, ['unit.card']);
  const { index } = await generateNavigationIndex({ rootDir, promotionLedger });

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

test('static verification rejects fake or non-canonical Unit and Behaviour bindings', async (t) => {
  const rootDir = await fixture(t, {
    'core/Unit.js': 'export class Unit {}\n',
    'core/Behaviour.js': 'export class Behaviour {}\n',
    'units/Fake.js': [
      'class Unit {}',
      "export class Fake extends Unit { static kind = 'unit.fake'; }",
      '',
    ].join('\n'),
    'behaviours/Wrong.js': [
      "import { Behaviour } from '../foreign/Behaviour.js';",
      "export class Wrong extends Behaviour { static kind = 'behaviour.wrong'; }",
      '',
    ].join('\n'),
  });

  const report = await verifyLibrary({ rootDir });
  const invalidBindings = report.errors.filter((error) => error.code === 'invalid-base-import');

  assert.equal(report.ok, false);
  assert.deepEqual(invalidBindings.map((error) => error.file), [
    'behaviours/Wrong.js',
    'units/Fake.js',
  ]);
  await assert.rejects(() => generateNavigationIndex({ rootDir }), /Static library verification failed/);
});

test('duplicate static kinds are rejected before index generation', async (t) => {
  const rootDir = await fixture(t, {
    'units/Left.js': [
      "import { Unit } from '../core/Unit.js';",
      "export class Left extends Unit { static kind = 'unit.same'; }",
      '',
    ].join('\n'),
    'units/Right.js': [
      "import { Unit } from '../core/Unit.js';",
      "export class Right extends Unit { static kind = 'unit.same'; }",
      '',
    ].join('\n'),
  });
  const report = await verifyLibrary({ rootDir });
  assert.equal(report.ok, false);
  assert.equal(report.errors.filter((error) => error.code === 'duplicate-kind').length, 1);
});

test('unlisted and stale modules cannot enter the public index', async (t) => {
  const rootDir = await fixture(t, {
    'core/Unit.js': 'export class Unit {}\n',
    'units/Reviewed.js': [
      "import { Unit } from '../core/Unit.js';",
      "export class Reviewed extends Unit { static kind = 'unit.reviewed'; }",
      '',
    ].join('\n'),
    'units/DetectorOnly.js': [
      "import { Unit } from '../core/Unit.js';",
      "export class DetectorOnly extends Unit { static kind = 'unit.detector-only'; }",
      '',
    ].join('\n'),
  });
  const promotionLedger = await reviewedLedger(rootDir, ['unit.reviewed']);
  const generated = await generateNavigationIndex({ rootDir, promotionLedger });
  assert.deepEqual(generated.index.entries.map((entry) => entry.kind), ['unit.reviewed']);
  assert.deepEqual(generated.promotion.excludedEntries.map((entry) => entry.kind), ['unit.detector-only']);

  await fs.appendFile(path.join(rootDir, 'units/Reviewed.js'), '// changed revision\n');
  await assert.rejects(
    () => generateNavigationIndex({ rootDir, promotionLedger }),
    /promoted-module-revision-mismatch/u,
  );
});

test('promotion ledger pins each relative dependency closure without staling unrelated classes', async (t) => {
  const rootDir = await fixture(t, {
    'core/unit-state.js': [
      "import 'state-runtime';",
      'export const stateVersion = 1;',
      '',
    ].join('\n'),
    'core/Unit.js': [
      "import { stateVersion } from './unit-state.js';",
      "import 'unit-runtime';",
      'export class Unit { static stateVersion = stateVersion; }',
      '',
    ].join('\n'),
    'core/Behaviour.js': [
      "import 'behaviour-runtime';",
      'export class Behaviour {}',
      '',
    ].join('\n'),
    'units/Reviewed.js': [
      "import { Unit } from '../core/Unit.js';",
      "export class Reviewed extends Unit { static kind = 'unit.reviewed'; }",
      '',
    ].join('\n'),
    'behaviours/Unrelated.js': [
      "import { Behaviour } from '../core/Behaviour.js';",
      "export class Unrelated extends Behaviour { static kind = 'behaviour.unrelated'; }",
      '',
    ].join('\n'),
  });
  const promotionLedger = await reviewedLedger(rootDir, [
    'behaviour.unrelated',
    'unit.reviewed',
  ]);
  const reviewed = promotionLedger.entries.find((entry) => entry.kind === 'unit.reviewed');
  assert.equal(promotionLedger.version, 3);
  assert.deepEqual(reviewed.dependencyClosure.files.map((file) => file.module), [
    'core/Unit.js',
    'core/unit-state.js',
    'units/Reviewed.js',
  ]);
  assert.deepEqual(reviewed.dependencyClosure.externalImports, [
    { importer: 'core/Unit.js', specifier: 'unit-runtime' },
    { importer: 'core/unit-state.js', specifier: 'state-runtime' },
  ]);
  const tamperedLedger = structuredClone(promotionLedger);
  tamperedLedger.entries.find((entry) => entry.kind === 'unit.reviewed')
    .dependencyClosure.files[0].sha256 = 'f'.repeat(64);
  const tamperedValidation = validatePromotionLedger(tamperedLedger);
  assert.equal(tamperedValidation.ok, false);
  assert.ok(tamperedValidation.errors.some(
    (error) => error.code === 'dependency-closure-sha256-mismatch',
  ));

  const reboundEntries = structuredClone(promotionLedger.entries);
  const rebound = reboundEntries.find((entry) => entry.kind === 'unit.reviewed');
  rebound.dependencyClosure.files.find((file) => file.module === 'core/unit-state.js')
    .sha256 = 'e'.repeat(64);
  const { closureSha256: ignoredClosureSha256, ...closureBody } = rebound.dependencyClosure;
  rebound.dependencyClosure.closureSha256 = sha256(stableStringify(closureBody));
  const reboundLedger = createPromotionLedger(reboundEntries, {
    revision: promotionLedger.revision,
  });
  const reboundValidation = validatePromotionLedger(reboundLedger);
  assert.ok(reboundValidation.errors.some(
    (error) => error.code === 'revision-sha256-mismatch',
  ));

  await fs.appendFile(path.join(rootDir, 'core/unit-state.js'), '// changed dependency\n');
  const discovery = await discoverLibrary({ rootDir, promotionLedger });
  assert.deepEqual(discovery.promotion.errors, [{
    code: 'promoted-dependency-revision-mismatch',
    location: 'unit.reviewed',
  }]);
  assert.deepEqual(discovery.publicEntries.map((entry) => entry.kind), ['behaviour.unrelated']);
  assert.deepEqual(discovery.promotion.excludedEntries.map((entry) => entry.kind), ['unit.reviewed']);
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

async function reviewedLedger(rootDir, kinds) {
  const discovery = await discoverLibrary({ rootDir });
  return createReviewedCoreLedger(discovery, kinds);
}
