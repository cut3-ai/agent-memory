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
import { PROMOTION_GATE_NAMES } from '../src/memory/gate-receipts.js';

const run = promisify(execFile);
const SECRET = 'cli-only-promotion-gate-secret-that-is-long-enough';
const AUTHORITY_ID = 'cli-test-authority';
const CORE_UNIT_SOURCE = 'export class Unit {}\n';
const CORE_BEHAVIOUR_SOURCE = 'export class Behaviour {}\n';
const BOX_SOURCE = [
  "import { Unit } from '../core/Unit.js';",
  "export class Box extends Unit { static kind = 'unit.box'; }",
  '',
].join('\n');
const GROUP_SOURCE = [
  "import { Unit } from '../core/Unit.js';",
  "export class Group extends Unit { static kind = 'unit.group'; }",
  '',
].join('\n');
const SOLID_FILL_SOURCE = [
  "import { Unit } from '../core/Unit.js';",
  "export class SolidFill extends Unit { static kind = 'unit.solid-fill'; }",
  '',
].join('\n');
const COMPOSITION_PIVOT_SOURCE = [
  "import { Unit } from '../core/Unit.js';",
  "export class CompositionPivot extends Unit { static kind = 'unit.composition-pivot'; }",
  '',
].join('\n');
const BEHAVIOUR_SHARED_SOURCE = [
  'export function writeTransform(unit, name, value) {',
  '  unit.transform = { ...(unit.transform ?? {}), [name]: value };',
  '}',
  '',
].join('\n');
const SNAP_SOURCE = [
  "import { Behaviour } from '../core/Behaviour.js';",
  "import { writeTransform } from './shared.js';",
  'export class EditorialSnap extends Behaviour {',
  "  static kind = 'behaviour.editorial-snap';",
  '  static scent = Object.freeze({',
  "    family: 'signal-editorial',",
  '    composition: [],',
  '    typography: [],',
  '    palette: [],',
  '    rendering: [],',
  "    motion: ['two-beat-snap'],",
  '  });',
  '  constructor(unit) { super(unit); }',
  '  onFrame(context) {',
  '    const beat = Math.max(0, Math.min(1, (context.frame - 6) / 12));',
  '    const snap = beat < 0.72 ? Math.pow(beat / 0.72, 2) * 1.08 : 1.08 - ((beat - 0.72) / 0.28) * 0.08;',
  "    writeTransform(this.unit, 'scale', { x: snap, y: snap });",
  '  }',
  '}',
  '',
].join('\n');
const MODULE_SOURCE = [
  "import { Unit } from '../core/Unit.js';",
  "import { EditorialSnap } from '../behaviours/editorial-snap.js';",
  "import { Box } from './box.js';",
  "import { CompositionPivot } from './composition-pivot.js';",
  "import { Group } from './group.js';",
  "import { SolidFill } from './solid-fill.js';",
  'export class Card extends Unit {',
  "  static kind = 'unit.card';",
  '  static scent = Object.freeze({',
  "    family: 'signal-editorial',",
  "    composition: ['asymmetric-stack'],",
  "    typography: ['condensed-uppercase'],",
  "    palette: ['ink-black', 'paper-white', 'signal-red'],",
  "    rendering: ['hard-shadow'],",
  "    motion: ['two-beat-snap'],",
  '  });',
  '  constructor(unit) {',
  "    const copy = new Box(unit, { fontFamily: 'Barlow Condensed', fontSize: 92, fontWeight: 800, lineHeight: 0.9, letterSpacing: -2, textTransform: 'uppercase', color: '#f5f1e8' });",
  "    const marker = new SolidFill({ color: '#ff3b30' });",
  '    const row = new Group(marker, copy);',
  "    const outline = new Box(row, { border: '6px solid #f5f1e8', boxShadow: '14px 14px 0 #ff3b30' });",
  "    const panel = new Box(outline, { display: 'flex', gap: 24, padding: 48, width: 820, backgroundColor: '#111111' });",
  "    const stage = new Box(panel, { position: 'absolute', left: 96, top: 144, overflow: 'hidden' });",
  '    const pivot = new CompositionPivot(stage, { x: 144, y: 240 });',
  '    pivot.add(new EditorialSnap(pivot));',
  '    super(pivot);',
  '  }',
  '}',
  '',
].join('\n');

test('promotion CLI requires a local gate authority and rejects forged JSON receipts', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-promotion-cli-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'core'), { recursive: true });
  await fs.mkdir(path.join(root, 'units'), { recursive: true });
  await fs.mkdir(path.join(root, 'behaviours'), { recursive: true });
  await fs.writeFile(path.join(root, 'core/Unit.js'), CORE_UNIT_SOURCE, 'utf8');
  await fs.writeFile(path.join(root, 'core/Behaviour.js'), CORE_BEHAVIOUR_SOURCE, 'utf8');
  await fs.writeFile(path.join(root, 'units/box.js'), BOX_SOURCE, 'utf8');
  await fs.writeFile(path.join(root, 'units/group.js'), GROUP_SOURCE, 'utf8');
  await fs.writeFile(path.join(root, 'units/solid-fill.js'), SOLID_FILL_SOURCE, 'utf8');
  await fs.writeFile(path.join(root, 'units/composition-pivot.js'), COMPOSITION_PIVOT_SOURCE, 'utf8');
  await fs.writeFile(path.join(root, 'behaviours/editorial-snap.js'), SNAP_SOURCE, 'utf8');
  await fs.writeFile(path.join(root, 'behaviours/shared.js'), BEHAVIOUR_SHARED_SOURCE, 'utf8');

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
      imports: [
        { value: '../core/Unit.js' },
        { value: '../behaviours/editorial-snap.js' },
        { value: './box.js' },
        { value: './composition-pivot.js' },
        { value: './group.js' },
        { value: './solid-fill.js' },
      ],
    }],
    dependencyModules: [
      {
        file: candidate.source,
        source: candidate.moduleSource,
        imports: [
          { value: '../core/Unit.js' },
          { value: '../behaviours/editorial-snap.js' },
          { value: './box.js' },
          { value: './composition-pivot.js' },
          { value: './group.js' },
          { value: './solid-fill.js' },
        ],
      },
      { file: 'core/Unit.js', source: CORE_UNIT_SOURCE, imports: [] },
      { file: 'core/Behaviour.js', source: CORE_BEHAVIOUR_SOURCE, imports: [] },
      { file: 'units/box.js', source: BOX_SOURCE, imports: [{ value: '../core/Unit.js' }] },
      { file: 'units/group.js', source: GROUP_SOURCE, imports: [{ value: '../core/Unit.js' }] },
      { file: 'units/solid-fill.js', source: SOLID_FILL_SOURCE, imports: [{ value: '../core/Unit.js' }] },
      { file: 'units/composition-pivot.js', source: COMPOSITION_PIVOT_SOURCE, imports: [{ value: '../core/Unit.js' }] },
      {
        file: 'behaviours/editorial-snap.js',
        source: SNAP_SOURCE,
        imports: [{ value: '../core/Behaviour.js' }, { value: './shared.js' }],
      },
      { file: 'behaviours/shared.js', source: BEHAVIOUR_SHARED_SOURCE, imports: [] },
    ],
  }, candidate.source).closureSha256;
  const revision = {
    candidateSha256: candidateRevisionSha256({
      ...candidate,
      role: 'memory',
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
    outcomeEvents: [
      { schemaVersion: 1, type: 'generation', revisionSha256: moduleSha256, atMs: 1_000 },
      { schemaVersion: 1, type: 'validation', revisionSha256: moduleSha256, atMs: 1_001, stage: 'compile', status: 'passed', resultSha256: '8'.repeat(64) },
      { schemaVersion: 1, type: 'validation', revisionSha256: moduleSha256, atMs: 1_002, stage: 'render', status: 'passed', resultSha256: '9'.repeat(64) },
    ],
    revisionSha256: moduleSha256,
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
  return PROMOTION_GATE_NAMES;
}

async function exists(filename) {
  try {
    await fs.access(filename);
    return true;
  } catch {
    return false;
  }
}
