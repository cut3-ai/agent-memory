import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { sha256 } from '../src/lib.js';
import {
  buildDependencyClosure,
  candidateRevisionSha256,
} from '../src/library/promotion-ledger.js';
import { createPromotionGateAuthority } from '../src/memory/gate-receipts.js';

const run = promisify(execFile);
const SECRET = 'cli-only-promotion-gate-secret-that-is-long-enough';
const AUTHORITY_ID = 'cli-test-authority';
const CORE_UNIT_SOURCE = 'export class Unit {}\n';
const MODULE_SOURCE = [
  "import { Unit } from '../core/Unit.js';",
  'export class Card extends Unit {',
  "  static kind = 'unit.card';",
  '  constructor(unit) { super(unit); }',
  '}',
  '',
].join('\n');

test('promotion CLI requires a local gate authority and rejects forged JSON receipts', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-promotion-cli-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'core'), { recursive: true });
  await fs.writeFile(path.join(root, 'core/Unit.js'), CORE_UNIT_SOURCE, 'utf8');

  const candidate = {
    kind: 'unit.card',
    type: 'unit',
    source: 'units/card.js',
    export: 'Card',
    moduleSource: MODULE_SOURCE,
    evidenceSha256: 'e'.repeat(64),
  };
  const moduleSha256 = sha256(MODULE_SOURCE);
  const dependencyClosureSha256 = buildDependencyClosure({
    modules: [{
      file: candidate.source,
      source: candidate.moduleSource,
      imports: [{ value: '../core/Unit.js' }],
    }],
    dependencyModules: [
      {
        file: candidate.source,
        source: candidate.moduleSource,
        imports: [{ value: '../core/Unit.js' }],
      },
      { file: 'core/Unit.js', source: CORE_UNIT_SOURCE, imports: [] },
    ],
  }, candidate.source).closureSha256;
  const revision = {
    candidateSha256: candidateRevisionSha256({
      ...candidate,
      moduleSha256,
      dependencyClosureSha256,
    }),
    moduleSha256,
    dependencyClosureSha256,
    evidenceSha256: candidate.evidenceSha256,
  };
  const inputFile = path.join(root, 'promotion-input.json');
  const baseInput = {
    candidate,
    generatedMessageId: 'a1',
    dialogue: [
      { id: 'a1', role: 'assistant', atMs: 1_000, content: 'Generated result.' },
      { id: 'u1', role: 'user', atMs: 1_100, content: 'Approved.' },
    ],
    humanSignals: [{ source: 'human', signal: 'positive', messageId: 'u1' }],
    generatedAtMs: 1_000,
    nowMs: 31_100,
    graceMs: 30_000,
  };
  const cli = path.resolve('src/memory/promotion-cli.js');

  await fs.writeFile(inputFile, JSON.stringify({
    ...baseInput,
    gates: legacyGates(revision),
  }), 'utf8');
  await assert.rejects(
    run(process.execPath, [cli, '--input', inputFile, '--repo', root, '--materialize', 'true']),
    (error) => {
      assert.match(error.stderr, /materialization-requires-gate-env/u);
      assert.doesNotMatch(error.stderr, /Approved|moduleSource/u);
      return true;
    },
  );
  assert.equal(await exists(path.join(root, 'units/card.js')), false);

  const envFile = path.join(root, '.env');
  await fs.writeFile(envFile, [
    `"CUT3_MEMORY_GATE_HMAC_KEY"="${SECRET}"`,
    `"CUT3_MEMORY_GATE_AUTHORITY_ID"="${AUTHORITY_ID}"`,
  ].join('\n'), 'utf8');
  const forged = await run(process.execPath, [
    cli,
    '--input', inputFile,
    '--repo', root,
    '--materialize', 'true',
    '--env', envFile,
  ]);
  const forgedResult = JSON.parse(forged.stdout);
  assert.equal(forgedResult.action, 'quarantine');
  assert.equal(forgedResult.materialized, false);
  assert.equal(forgedResult.gateAuthorityConfigured, true);
  assert.equal(await exists(path.join(root, 'units/card.js')), false);
  assert.doesNotMatch(forged.stdout + forged.stderr, new RegExp(SECRET, 'u'));

  const authority = createPromotionGateAuthority({ authorityId: AUTHORITY_ID, secret: SECRET });
  await fs.writeFile(inputFile, JSON.stringify({
    ...baseInput,
    gates: signedGates(revision, authority),
  }), 'utf8');
  const approved = await run(process.execPath, [
    cli,
    '--input', inputFile,
    '--repo', root,
    '--materialize', 'true',
    '--env', envFile,
  ]);
  const approvedResult = JSON.parse(approved.stdout);
  assert.equal(approvedResult.action, 'promote');
  assert.equal(approvedResult.materialized, true);
  assert.equal(await exists(path.join(root, 'units/card.js')), true);
  assert.doesNotMatch(approved.stdout + approved.stderr, new RegExp(SECRET, 'u'));
});

function legacyGates(revision) {
  return Object.fromEntries(gateNames().map((gateName) => [gateName, {
    passed: true,
    receiptSha256: 'a'.repeat(64),
    candidateSha256: revision.candidateSha256,
    moduleSha256: revision.moduleSha256,
    dependencyClosureSha256: revision.dependencyClosureSha256,
  }]));
}

function signedGates(revision, authority) {
  return Object.fromEntries(gateNames().map((gateName) => [gateName, authority.issue({
    gateName,
    candidateSha256: revision.candidateSha256,
    moduleSha256: revision.moduleSha256,
    dependencyClosureSha256: revision.dependencyClosureSha256,
    resultSha256: revision.evidenceSha256,
    passed: true,
  })]));
}

function gateNames() {
  return ['compilerFidelity', 'reconstruction', 'atomicity', 'privacy', 'module'];
}

async function exists(filename) {
  try {
    await fs.access(filename);
    return true;
  } catch {
    return false;
  }
}
