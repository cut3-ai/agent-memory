import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildClassIndex,
  verifyClassIndex,
} from '../census/class-index.js';
import { discoverLibrary } from '../../src/library/discover.js';
import { createReviewedCoreLedger } from '../../src/library/promotion-ledger.js';

test('memory index delegates to AST-only library discovery', async (context) => {
  const root = await fixture(context, {
    'core/Unit.js': 'export class Unit {}\n',
    'core/Behaviour.js': 'export class Behaviour {}\n',
    'units/Text.js': [
      "import { Unit } from '../core/Unit.js';",
      "throw new Error('must never be evaluated');",
      'export class Text extends Unit {',
      "  static kind = 'unit.text';",
      '}',
      '',
    ].join('\n'),
    'behaviours/Opacity.js': [
      "import { Behaviour } from '../core/Behaviour.js';",
      'export class Opacity extends Behaviour {',
      "  static kind = 'behaviour.opacity';",
      '}',
      '',
    ].join('\n'),
  });

  const promotionLedger = await reviewedLedger(root, ['behaviour.opacity', 'unit.text']);
  const { index, validation } = await buildClassIndex(root, { promotionLedger });
  assert.equal(validation.valid, true);
  assert.equal(validation.evaluatedModules, 0);
  assert.deepEqual(Object.keys(index), [
    'format',
    'version',
    'indexSha256',
    'entries',
  ]);
  assert.deepEqual(index.entries.map((entry) => entry.kind), [
    'behaviour.opacity',
    'unit.text',
  ]);
  index.entries.forEach((entry) => {
    assert.deepEqual(Object.keys(entry), ['kind', 'type', 'role', 'source', 'export']);
    assert.equal(entry.role, 'infrastructure');
  });

  const report = await verifyClassIndex(root, index, { promotionLedger });
  assert.equal(report.valid, true);
  assert.equal(report.evaluatedModules, 0);
});

test('memory index rejects non-static loading and inherited identity', async (context) => {
  const dynamicRoot = await fixture(context, {
    'units/Legacy.js': [
      "import { Unit } from '../core/Unit.js';",
      'export class Legacy extends Unit {',
      "  static kind = 'unit.legacy';",
      '  async load() { return import("./heavy.js"); }',
      '}',
      '',
    ].join('\n'),
  });
  await assert.rejects(
    () => buildClassIndex(dynamicRoot),
    /Static library verification failed/u,
  );

  const inheritedRoot = await fixture(context, {
    'units/Indirect.js': [
      "import { Unit } from '../core/Unit.js';",
      "const kind = 'unit.indirect';",
      'export class Indirect extends Unit { static kind = kind; }',
      '',
    ].join('\n'),
  });
  await assert.rejects(
    () => buildClassIndex(inheritedRoot),
    /missing-own-static-kind/u,
  );
});

test('AST verification detects a stale or tampered navigation index', async (context) => {
  const root = await fixture(context, {
    'core/Unit.js': 'export class Unit {}\n',
    'units/Text.js': [
      "import { Unit } from '../core/Unit.js';",
      "export class Text extends Unit { static kind = 'unit.text'; }",
      '',
    ].join('\n'),
  });
  const promotionLedger = await reviewedLedger(root, ['unit.text']);
  const { index } = await buildClassIndex(root, { promotionLedger });
  const tampered = structuredClone(index);
  tampered.entries[0].kind = 'unit.other';

  const report = await verifyClassIndex(root, tampered, { promotionLedger });
  assert.equal(report.valid, false);
  assert.ok(report.violations.some((entry) => entry.code === 'index-sha256-mismatch'));
});

async function fixture(context, files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-memory-index-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await Promise.all(Object.entries(files).map(async ([relative, source]) => {
    const filename = path.join(root, relative);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, source, 'utf8');
  }));
  return root;
}

async function reviewedLedger(rootDir, kinds) {
  const discovery = await discoverLibrary({ rootDir: rootDir });
  return createReviewedCoreLedger(discovery, kinds);
}
