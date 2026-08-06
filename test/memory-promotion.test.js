import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { sha256, stableStringify } from '../src/lib.js';
import {
  appendPromotionBundleDecision,
  appendPromotionDecision,
  buildDependencyClosure,
  buildPromotionBundleIdentity,
  bundleCandidateRevisionSha256,
  candidateRevisionSha256,
  createPromotionLedger,
  createReviewedCoreLedger,
  validatePromotionLedger,
} from '../src/library/promotion-ledger.js';
import { generateNavigationIndex } from '../src/library/index.js';
import { decideMemoryPromotion } from '../src/memory/feedback.js';
import {
  createPromotionGateAuthority,
  orchestrateMemoryPromotion,
} from '../src/memory/promotion.js';
import { materializePromotion } from '../src/memory/promotion/materialize.js';
import { PROMOTION_GATE_NAMES } from '../src/memory/gate-receipts.js';

const EVIDENCE = 'e'.repeat(64);
const GATE_SECRET = 'test-only-promotion-gate-secret-with-32-bytes';
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
const THIN_SNAP_SOURCE = SNAP_SOURCE
  .replace(
    "    const beat = Math.max(0, Math.min(1, (context.frame - 6) / 12));\n    const snap = beat < 0.72 ? Math.pow(beat / 0.72, 2) * 1.08 : 1.08 - ((beat - 0.72) / 0.28) * 0.08;\n    writeTransform(this.unit, 'scale', { x: snap, y: snap });",
    '    this.unit.opacity = context.frame / 30;',
  );
const gateAuthority = createPromotionGateAuthority({
  authorityId: 'test-promotion-gates',
  secret: GATE_SECRET,
});
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

test('negative user-authored feedback discards staged code without materializing it', async (t) => {
  const root = await repository(t);
  const candidate = stagedCandidate();
  const revision = revisionFor(candidate);
  const result = await orchestrateMemoryPromotion({
    candidate,
    outcomeEvents: validationOutcome(revision, 1_000),
    generatedMessageId: 'a1',
    dialogue: [
      { id: 'a1', role: 'assistant', atMs: 1_000, content: 'Generated result.' },
      { id: 'u1', role: 'user', atMs: 1_100, content: 'No, redo it.' },
    ],
    humanSignals: [{ source: 'human', signal: 'negative', messageId: 'u1' }],
    generatedAtMs: 1_000,
    nowMs: 1_100,
    gates: {},
  }, {
    repositoryRoot: root,
    ledger: createPromotionLedger([], { revision: 0 }),
    materialize: true,
  });

  assert.equal(result.decision.action, 'discard');
  assert.equal(result.ledgerChanged, false);
  assert.equal(await exists(path.join(root, 'units/card.js')), false);
  assert.doesNotMatch(JSON.stringify(result), /No, redo|moduleSource/u);
});

test('classified user dialogue can promote after grace and all revision-bound gates', async (t) => {
  const root = await repository(t);
  const candidate = stagedCandidate();
  const revision = revisionFor(candidate);
  let calls = 0;
  const provider = {
    provider: 'fixture',
    model: 'fixture-model',
    async generateStructured() {
      calls += 1;
      return {
        provider: 'fixture',
        model: 'fixture-model',
        data: { signal: 'positive', evidenceMessageIds: ['feedback-01'] },
        request: { attempts: 1, retries: 0, status: 200 },
      };
    },
  };
  const result = await orchestrateMemoryPromotion({
    candidate,
    outcomeEvents: validationOutcome(revision, 1_000),
    generatedMessageId: 'a1',
    dialogue: [
      { id: 'a1', role: 'assistant', atMs: 1_000, content: 'Here is the private generated result.' },
      { id: 'u1', role: 'user', atMs: 1_100, content: 'This is exactly right.' },
    ],
    generatedAtMs: 1_000,
    nowMs: 31_100,
    graceMs: 30_000,
    gates: passingGates(revision),
  }, {
    repositoryRoot: root,
    ledger: createPromotionLedger([], { revision: 0 }),
    provider,
    gateVerifier: gateAuthority,
  });

  assert.equal(calls, 1);
  assert.equal(result.feedbackReceipt.origin, 'human-dialogue-classified');
  assert.equal(result.decision.action, 'promote');
  assert.equal(result.nextLedger.entries[0].authority, 'human-feedback');
  assert.equal(result.nextLedger.entries[0].revisionSha256, revision.candidateSha256);
  assert.equal(result.materialized, false);
  assert.equal(await exists(path.join(root, 'units/card.js')), false, 'staging remains transient before materialize');
  assert.doesNotMatch(JSON.stringify(result), /exactly right|private generated|evidenceMessageIds/u);
  assert.throws(
    () => appendPromotionDecision(
      createPromotionLedger([], { revision: 0 }),
      discoveryFor(candidate),
      result.decision,
    ),
    /authenticated gate receipt/u,
    'even a genuine compact decision is not an authority at the ledger boundary',
  );
});

test('qualified workspace export promotes without dialogue or a model', async (t) => {
  const root = await repository(t);
  const candidate = stagedCandidate();
  const revision = revisionFor(candidate);
  const outcomeEvents = [
    ...validationOutcome(revision, 1_000),
    {
      schemaVersion: 1,
      type: 'workspace-action',
      revisionSha256: revision.moduleSha256,
      atMs: 1_100,
      action: 'exported',
    },
  ];
  const result = await orchestrateMemoryPromotion({
    candidate,
    outcomeEvents,
    revisionSha256: revision.moduleSha256,
    nowMs: 31_100,
    graceMs: 30_000,
    gates: passingGates(revision),
  }, {
    repositoryRoot: root,
    ledger: createPromotionLedger([], { revision: 0 }),
    gateVerifier: gateAuthority,
  });

  assert.equal(result.classifierStatus, 'bypassed-structured-workspace-outcome');
  assert.equal(result.feedbackReceipt.origin, 'workspace-outcome');
  assert.equal(result.decision.action, 'promote');
  assert.equal(result.decision.outcome.signal, 'neutral');
  assert.equal(result.nextLedger.entries[0].authority, 'workspace-outcome');

  const { decisionSha256: ignored, ...decisionBody } = result.decision;
  const reboundBody = {
    ...decisionBody,
    outcome: { ...decisionBody.outcome, revisionSha256: 'f'.repeat(64) },
  };
  const rebound = {
    ...reboundBody,
    decisionSha256: sha256(stableStringify(reboundBody)),
  };
  assert.throws(() => appendPromotionDecision(
    createPromotionLedger([], { revision: 0 }),
    discoveryFor(candidate),
    rebound,
  ), /exact candidate module revision/u);
});

test('explicit negative overrides a qualified workspace outcome', async (t) => {
  const root = await repository(t);
  const candidate = stagedCandidate();
  const revision = revisionFor(candidate);
  const outcomeEvents = [
    ...validationOutcome(revision, 1_000),
    {
      schemaVersion: 1,
      type: 'workspace-action',
      revisionSha256: revision.moduleSha256,
      atMs: 1_100,
      action: 'exported',
    },
  ];
  const result = await orchestrateMemoryPromotion({
    candidate,
    outcomeEvents,
    revisionSha256: revision.moduleSha256,
    generatedMessageId: 'a1',
    generatedAtMs: 1_000,
    nowMs: 31_200,
    dialogue: [
      { id: 'a1', role: 'assistant', atMs: 1_000, content: 'Generated result.' },
      { id: 'u1', role: 'user', atMs: 1_200, content: 'No, this needs correction.' },
    ],
    humanSignals: [{ source: 'human', signal: 'negative', messageId: 'u1' }],
    gates: passingGates(revision),
  }, {
    repositoryRoot: root,
    ledger: createPromotionLedger([], { revision: 0 }),
    gateVerifier: gateAuthority,
  });

  assert.equal(result.classifierStatus, 'combined-workspace-and-explicit-outcomes');
  assert.equal(result.feedbackReceipt.signal, 'negative');
  assert.equal(result.feedbackReceipt.counts.neutral, 1);
  assert.equal(result.feedbackReceipt.counts.negative, 1);
  assert.equal(result.decision.action, 'discard');
  assert.equal(result.ledgerChanged, false);
});

test('orchestrator rejects caller-built feedback receipts', async (t) => {
  const root = await repository(t);
  await assert.rejects(orchestrateMemoryPromotion({
    candidate: stagedCandidate(),
    feedbackReceipt: {},
  }, {
    repositoryRoot: root,
    ledger: createPromotionLedger([], { revision: 0 }),
  }), /prebuilt feedback receipts are not accepted/u);
});

test('assistant-only or invented classifier evidence quarantines and cannot alter ledger', async (t) => {
  const root = await repository(t);
  const candidate = stagedCandidate();
  const revision = revisionFor(candidate);
  const result = await orchestrateMemoryPromotion({
    candidate,
    outcomeEvents: validationOutcome(revision, 1_000),
    generatedMessageId: 'a1',
    dialogue: [
      { id: 'a1', role: 'assistant', atMs: 1_000, content: 'Looks good to me.' },
      { id: 'u1', role: 'user', atMs: 1_100, content: 'Continue.' },
    ],
    generatedAtMs: 1_000,
    nowMs: 40_000,
    gates: passingGates(revision),
  }, {
    repositoryRoot: root,
    ledger: createPromotionLedger([], { revision: 0 }),
    gateVerifier: gateAuthority,
    provider: {
      provider: 'fixture',
      model: 'fixture-model',
      async generateStructured() {
        return { data: { signal: 'positive', evidenceMessageIds: ['a1'] } };
      },
    },
  });
  assert.equal(result.classifierStatus, 'quarantined');
  assert.equal(result.feedbackReceipt, null);
  assert.equal(result.decision.action, 'quarantine');
  assert.equal(result.ledgerChanged, false);
});

test('explicit human signal bypasses model and incomplete grace or stale gates fail closed', async (t) => {
  const root = await repository(t);
  const candidate = stagedCandidate();
  const revision = revisionFor(candidate);
  let calls = 0;
  const provider = {
    async generateStructured() { calls += 1; throw new Error('must not run'); },
  };
  const result = await orchestrateMemoryPromotion({
    candidate,
    outcomeEvents: validationOutcome(revision, 1_000),
    generatedMessageId: 'a1',
    dialogue: [
      { id: 'a1', role: 'assistant', atMs: 1_000, content: 'Generated result.' },
      { id: 'u1', role: 'user', atMs: 1_100, content: 'Good.' },
    ],
    humanSignals: [{ source: 'human', signal: 'positive', messageId: 'u1' }],
    generatedAtMs: 1_000,
    nowMs: 1_101,
    graceMs: 30_000,
    gates: passingGates({ ...revision, moduleSha256: 'f'.repeat(64) }),
  }, {
    repositoryRoot: root,
    ledger: createPromotionLedger([], { revision: 0 }),
    provider,
    gateVerifier: gateAuthority,
  });
  assert.equal(calls, 0);
  assert.equal(result.classifierStatus, 'bypassed-explicit-human');
  assert.equal(result.decision.action, 'quarantine');
  assert.ok(result.decision.reasons.includes('outcome-grace-incomplete'));
});

test('a shared dependency changed during async feedback cannot pass append with old gates', async (t) => {
  const root = await repository(t);
  const candidate = stagedCandidate();
  const revision = revisionFor(candidate);
  const provider = {
    provider: 'fixture',
    model: 'fixture-model',
    async generateStructured() {
      await fs.writeFile(
        path.join(root, 'core/Unit.js'),
        `${CORE_UNIT_SOURCE}// changed after signed gates\n`,
        'utf8',
      );
      return {
        provider: 'fixture',
        model: 'fixture-model',
        data: { signal: 'positive', evidenceMessageIds: ['feedback-01'] },
        request: { attempts: 1, retries: 0, status: 200 },
      };
    },
  };

  await assert.rejects(
    orchestrateMemoryPromotion({
      candidate,
      outcomeEvents: validationOutcome(revision, 1_000),
      generatedMessageId: 'a1',
      dialogue: [
        { id: 'a1', role: 'assistant', atMs: 1_000, content: 'Generated result.' },
        { id: 'u1', role: 'user', atMs: 1_100, content: 'Approved.' },
      ],
      generatedAtMs: 1_000,
      nowMs: 31_100,
      graceMs: 30_000,
      gates: passingGates(revision),
    }, {
      repositoryRoot: root,
      ledger: createPromotionLedger([], { revision: 0 }),
      provider,
      gateVerifier: gateAuthority,
    }),
    /stale candidate revision or dependency closure/u,
  );
  assert.equal(await exists(path.join(root, 'units/card.js')), false);
});

test('explicit feedback cannot be rebound to another or later generated result', async (t) => {
  const root = await repository(t);
  const candidate = stagedCandidate();
  const revision = revisionFor(candidate);
  const common = {
    candidate,
    outcomeEvents: validationOutcome(revision, 2_000),
    dialogue: [
      { id: 'a1', role: 'assistant', atMs: 1_000, content: 'First result.' },
      { id: 'u1', role: 'user', atMs: 1_100, content: 'Approved first result.' },
      { id: 'a2', role: 'assistant', atMs: 2_000, content: 'Second result.' },
    ],
    humanSignals: [{ source: 'human', signal: 'positive', messageId: 'u1' }],
    generatedMessageId: 'a2',
    generatedAtMs: 2_000,
    nowMs: 40_000,
  };

  await assert.rejects(
    orchestrateMemoryPromotion(common, {
      repositoryRoot: root,
      ledger: createPromotionLedger([], { revision: 0 }),
    }),
    /must follow the generated assistant event/u,
  );
});

test('legacy passing-gate JSON and duck-typed verifiers cannot promote or materialize', async (t) => {
  const root = await repository(t);
  const candidate = stagedCandidate();
  const revision = revisionFor(candidate);
  const legacyGates = Object.fromEntries([
    'compilerFidelity',
    'reconstruction',
    'atomicity',
    'privacy',
    'module',
  ].map((name) => [name, {
    passed: true,
    receiptSha256: 'a'.repeat(64),
    candidateSha256: revision.candidateSha256,
    moduleSha256: revision.moduleSha256,
  }]));
  const common = {
    candidate,
    outcomeEvents: validationOutcome(revision, 1_000),
    generatedMessageId: 'a1',
    dialogue: [
      { id: 'a1', role: 'assistant', atMs: 1_000, content: 'Generated result.' },
      { id: 'u1', role: 'user', atMs: 1_100, content: 'Approved.' },
    ],
    humanSignals: [{ source: 'human', signal: 'positive', messageId: 'u1' }],
    generatedAtMs: 1_000,
    nowMs: 31_100,
    graceMs: 30_000,
    gates: legacyGates,
  };
  for (const gateVerifier of [undefined, { verify: () => ({ passed: true }) }]) {
    const result = await orchestrateMemoryPromotion(common, {
      repositoryRoot: root,
      ledger: createPromotionLedger([], { revision: 0 }),
      materialize: true,
      gateVerifier,
    });
    assert.equal(result.decision.action, 'quarantine');
    assert.equal(result.materialized, false);
    assert.equal(result.ledgerChanged, false);
  }
  assert.equal(await exists(path.join(root, 'units/card.js')), false);
});

test('approved staged source materializes with its ledger, and a revision replaces only after a new decision', async (t) => {
  const root = await repository(t);
  const firstCandidate = stagedCandidate();
  const firstRevision = revisionFor(firstCandidate);
  const common = {
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
  const first = await orchestrateMemoryPromotion({
    ...common,
    candidate: firstCandidate,
    outcomeEvents: validationOutcome(firstRevision, 1_000),
    gates: passingGates(firstRevision),
  }, {
    repositoryRoot: root,
    ledger: createPromotionLedger([], { revision: 0 }),
    materialize: true,
    gateVerifier: gateAuthority,
  });
  assert.equal(await exists(path.join(root, 'units/card.js')), true);
  assert.equal(first.materialized, true);
  assert.match(JSON.stringify(first), /signatureSha256/u);
  assert.doesNotMatch(JSON.stringify(first), /"signature":|test-only-promotion-gate-secret/u);
  assert.deepEqual(
    (await generateNavigationIndex({ rootDir: root })).index.entries.map((entry) => entry.kind),
    ['unit.card'],
  );

  const revisedCandidate = {
    ...firstCandidate,
    moduleSource: MODULE_SOURCE.replace('fontSize: 92', 'fontSize: 94'),
  };
  const revisedRevision = revisionFor(revisedCandidate);
  const revised = await orchestrateMemoryPromotion({
    candidate: revisedCandidate,
    outcomeEvents: validationOutcome(revisedRevision, 40_000),
    generatedMessageId: 'a2',
    dialogue: [
      { id: 'a2', role: 'assistant', atMs: 40_000, content: 'Generated revision.' },
      { id: 'u2', role: 'user', atMs: 40_100, content: 'Approved revision.' },
    ],
    humanSignals: [{ source: 'human', signal: 'positive', messageId: 'u2' }],
    generatedAtMs: 40_000,
    nowMs: 70_100,
    graceMs: 30_000,
    gates: passingGates(revisedRevision),
  }, {
    repositoryRoot: root,
    ledger: first.nextLedger,
    materialize: true,
    gateVerifier: gateAuthority,
  });
  assert.equal(revised.decision.action, 'promote');
  assert.equal(revised.nextLedger.entries[0].moduleSha256, revisedRevision.moduleSha256);
  assert.match(await fs.readFile(path.join(root, 'units/card.js'), 'utf8'), /fontSize: 94/u);
  assert.equal((await generateNavigationIndex({ rootDir: root })).promotion.ok, true);
});

test('one revision atomically promotes a new Unit and its new authored Behaviour', async (t) => {
  const root = await repository(t, { includeSnap: false });
  const candidate = stagedCandidate();
  const bundle = [stagedSnapCandidate()];
  const revision = revisionFor(candidate, { bundle: true, snapSource: bundle[0].moduleSource });
  const moduleOnlyOutcome = workspacePromotionInput(candidate, revision, bundle);
  moduleOnlyOutcome.outcomeEvents = moduleOnlyOutcome.outcomeEvents.map((event) => ({
    ...event,
    revisionSha256: revision.moduleSha256,
  }));
  moduleOnlyOutcome.revisionSha256 = revision.moduleSha256;
  await assert.rejects(orchestrateMemoryPromotion(moduleOnlyOutcome, {
    repositoryRoot: root,
    ledger: createPromotionLedger([], { revision: 0 }),
    gateVerifier: gateAuthority,
  }), /exact candidate module revision/u);

  const result = await orchestrateMemoryPromotion(
    workspacePromotionInput(candidate, revision, bundle),
    {
      repositoryRoot: root,
      ledger: createPromotionLedger([], { revision: 0 }),
      materialize: true,
      gateVerifier: gateAuthority,
    },
  );

  assert.equal(result.materialized, true);
  assert.equal(result.nextLedger.revision, 1);
  assert.deepEqual(result.nextLedger.entries.map(({ kind }) => kind), [
    'behaviour.editorial-snap',
    'unit.card',
  ]);
  assert.equal(new Set(result.nextLedger.entries.map(({ decisionSha256 }) => decisionSha256)).size, 1);
  assert.equal(await fs.readFile(path.join(root, 'units/card.js'), 'utf8'), MODULE_SOURCE);
  assert.equal(await fs.readFile(path.join(root, 'behaviours/editorial-snap.js'), 'utf8'), SNAP_SOURCE);
  const generated = await generateNavigationIndex({ rootDir: root });
  assert.equal(generated.promotion.ok, true);
  assert.deepEqual(generated.index.entries.map(({ kind }) => kind), [
    'behaviour.editorial-snap',
    'unit.card',
  ]);
});

test('ledger boundary cannot expand signed membership or admit a thin linked Behaviour', async (t) => {
  const root = await repository(t);
  const candidate = stagedCandidate();
  const singleRevision = revisionFor(candidate);
  const singleInput = workspacePromotionInput(candidate, singleRevision);
  const single = await orchestrateMemoryPromotion(singleInput, {
    repositoryRoot: root,
    ledger: createPromotionLedger([], { revision: 0 }),
    gateVerifier: gateAuthority,
  });
  assert.throws(() => appendPromotionBundleDecision(
    createPromotionLedger([], { revision: 0 }),
    discoveryFor(candidate, { bundle: true }),
    single.decision,
    {
      bundleKinds: ['unit.card', 'behaviour.editorial-snap'],
      gates: singleInput.gates,
      gateVerifier: gateAuthority,
    },
  ), /stale candidate revision or dependency closure/u);

  const thinDiscovery = discoveryFor(candidate, {
    bundle: true,
    snapSource: THIN_SNAP_SOURCE,
  });
  const thinRevision = revisionFor(candidate, {
    bundle: true,
    snapSource: THIN_SNAP_SOURCE,
  });
  const thinGates = passingGates(thinRevision);
  const thinDecision = decideMemoryPromotion({
    candidate: {
      kind: candidate.kind,
      candidateSha256: thinRevision.candidateSha256,
      moduleSha256: thinRevision.moduleSha256,
      dependencyClosureSha256: thinRevision.dependencyClosureSha256,
      bundleSha256: thinRevision.bundleSha256,
      outcomeRevisionSha256: thinRevision.outcomeRevisionSha256,
      evidenceSha256: thinRevision.evidenceSha256,
    },
    feedbackReceipt: workspaceFeedbackReceipt(thinRevision),
    gates: thinGates,
  }, { gateVerifier: gateAuthority });
  assert.equal(thinDecision.eligibleForPromotion, true);
  assert.throws(() => appendPromotionBundleDecision(
    createPromotionLedger([], { revision: 0 }),
    thinDiscovery,
    thinDecision,
    {
      bundleKinds: ['unit.card', 'behaviour.editorial-snap'],
      gates: thinGates,
      gateVerifier: gateAuthority,
    },
  ), /not standalone style memory/u);
});

test('revising a shared Behaviour cannot stale an already-promoted Unit closure', () => {
  const candidate = stagedCandidate();
  const initialDiscovery = discoveryFor(candidate, { bundle: true });
  const currentLedger = createReviewedCoreLedger(initialDiscovery, ['unit.card'], { revision: 1 });
  const revisedSnap = SNAP_SOURCE.replace('context.frame - 6', 'context.frame - 7');
  const revisedDiscovery = discoveryFor(candidate, {
    bundle: true,
    snapSource: revisedSnap,
  });
  const dependencyClosureSha256 = buildDependencyClosure(
    revisedDiscovery,
    'behaviours/editorial-snap.js',
  ).closureSha256;
  const moduleSha256 = sha256(revisedSnap);
  const candidateSha256 = candidateRevisionSha256({
    kind: 'behaviour.editorial-snap',
    type: 'behaviour',
    source: 'behaviours/editorial-snap.js',
    export: 'EditorialSnap',
    role: 'memory',
    moduleSha256,
    dependencyClosureSha256,
  });
  const revision = {
    candidateSha256,
    moduleSha256,
    dependencyClosureSha256,
    bundleSha256: null,
    outcomeRevisionSha256: moduleSha256,
    evidenceSha256: EVIDENCE,
  };
  const gates = passingGates(revision);
  const decision = decideMemoryPromotion({
    candidate: {
      kind: 'behaviour.editorial-snap',
      ...revision,
    },
    feedbackReceipt: workspaceFeedbackReceipt(revision),
    gates,
  }, { gateVerifier: gateAuthority });
  assert.equal(decision.eligibleForPromotion, true);

  assert.throws(() => appendPromotionDecision(
    currentLedger,
    revisedDiscovery,
    decision,
    { gates, gateVerifier: gateAuthority },
  ), /invalidate the public dependency graph: promoted-dependency-revision-mismatch/u);
});

test('built-in source privacy cannot be bypassed by signed privacy gates', async (t) => {
  const primaryRoot = await repository(t);
  const privateCandidate = {
    ...stagedCandidate(),
    moduleSource: `${MODULE_SOURCE}// private workspace note\n`,
  };
  const privateRevision = revisionFor(privateCandidate);
  await assert.rejects(orchestrateMemoryPromotion(
    workspacePromotionInput(privateCandidate, privateRevision),
    {
      repositoryRoot: primaryRoot,
      ledger: createPromotionLedger([], { revision: 0 }),
      materialize: true,
      gateVerifier: gateAuthority,
    },
  ), /Built-in module privacy validation failed: embedded-comment-content/u);
  assert.equal(await exists(path.join(primaryRoot, 'units/card.js')), false);
  assert.equal(await exists(path.join(primaryRoot, 'promotion-ledger.json')), false);

  const propertyRoot = await repository(t);
  const propertyLeakCandidate = {
    ...stagedCandidate(),
    moduleSource: MODULE_SOURCE.replace(
      '  constructor(unit) {',
      "  constructor(unit) {\n    const ignored = {'private transcript words from user': 1};",
    ),
  };
  const propertyLeakRevision = revisionFor(propertyLeakCandidate);
  await assert.rejects(orchestrateMemoryPromotion(
    workspacePromotionInput(propertyLeakCandidate, propertyLeakRevision),
    {
      repositoryRoot: propertyRoot,
      ledger: createPromotionLedger([], { revision: 0 }),
      materialize: true,
      gateVerifier: gateAuthority,
    },
  ), /Built-in module privacy validation failed: embedded-semantic-content/u);
  assert.equal(await exists(path.join(propertyRoot, 'units/card.js')), false);
  assert.equal(await exists(path.join(propertyRoot, 'promotion-ledger.json')), false);

  const dependencyRoot = await repository(t, { includeSnap: false });
  const leakedSnap = `${SNAP_SOURCE}// private transcript note\n`;
  const candidate = stagedCandidate();
  const bundle = [stagedSnapCandidate(leakedSnap)];
  const revision = revisionFor(candidate, { bundle: true, snapSource: leakedSnap });
  await assert.rejects(orchestrateMemoryPromotion(
    workspacePromotionInput(candidate, revision, bundle),
    {
      repositoryRoot: dependencyRoot,
      ledger: createPromotionLedger([], { revision: 0 }),
      materialize: true,
      gateVerifier: gateAuthority,
    },
  ), /Built-in module privacy validation failed: embedded-comment-content/u);
  assert.equal(await exists(path.join(dependencyRoot, 'units/card.js')), false);
  assert.equal(await exists(path.join(dependencyRoot, 'behaviours/editorial-snap.js')), false);
});

test('bundle transaction rolls back every module and the ledger after a mid-commit failure', async (t) => {
  const root = await repository(t);
  const candidate = stagedCandidate();
  const revisedSnap = SNAP_SOURCE.replace(
    'context.frame - 6',
    'context.frame - 7',
  );
  const bundle = [stagedSnapCandidate(revisedSnap)];
  const revision = revisionFor(candidate, { bundle: true, snapSource: revisedSnap });
  const input = workspacePromotionInput(candidate, revision, bundle);
  const currentLedger = createPromotionLedger([], { revision: 0 });
  const dryRun = await orchestrateMemoryPromotion(input, {
    repositoryRoot: root,
    ledger: currentLedger,
    gateVerifier: gateAuthority,
  });
  const transactionId = dryRun.nextLedger.ledgerSha256.slice(0, 16);
  await fs.mkdir(path.join(
    root,
    `behaviours/editorial-snap.js.promotion-${transactionId}.bak`,
  ));

  await assert.rejects(orchestrateMemoryPromotion(input, {
    repositoryRoot: root,
    ledger: currentLedger,
    materialize: true,
    gateVerifier: gateAuthority,
  }));

  assert.equal(await exists(path.join(root, 'units/card.js')), false);
  assert.equal(await fs.readFile(path.join(root, 'behaviours/editorial-snap.js'), 'utf8'), SNAP_SOURCE);
  const persistedLedger = JSON.parse(await fs.readFile(path.join(root, 'promotion-ledger.json'), 'utf8'));
  assert.equal(validatePromotionLedger(persistedLedger).ok, true);
  assert.equal(persistedLedger.revision, 0);
  assert.deepEqual(persistedLedger.entries, []);
  assert.deepEqual(
    await fs.readdir(path.join(root, 'staging/promotion-transactions')),
    [],
  );
});

test('concurrent promotions from one ledger cannot mix modules or overwrite the winner', async (t) => {
  const root = await repository(t);
  const currentLedger = createPromotionLedger([], { revision: 0 });
  const card = stagedCandidate();
  const poster = {
    ...stagedCandidate(),
    kind: 'unit.poster',
    source: 'units/poster.js',
    export: 'Poster',
    moduleSource: MODULE_SOURCE
      .replace('export class Card', 'export class Poster')
      .replace("static kind = 'unit.card'", "static kind = 'unit.poster'"),
  };
  const cardRevision = revisionFor(card);
  const posterRevision = revisionFor(poster);

  const results = await Promise.allSettled([
    orchestrateMemoryPromotion(workspacePromotionInput(card, cardRevision), {
      repositoryRoot: root,
      ledger: currentLedger,
      materialize: true,
      gateVerifier: gateAuthority,
    }),
    orchestrateMemoryPromotion(workspacePromotionInput(poster, posterRevision), {
      repositoryRoot: root,
      ledger: currentLedger,
      materialize: true,
      gateVerifier: gateAuthority,
    }),
  ]);

  const fulfilled = results.filter(({ status }) => status === 'fulfilled');
  const rejected = results.filter(({ status }) => status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(
    rejected[0].reason.message,
    /Promotion (?:materialization lock exists; manual recovery is required|ledger changed before materialization)/u,
  );

  const winner = fulfilled[0].value.candidate;
  const winnerCandidate = winner.kind === card.kind ? card : poster;
  const loser = winner.kind === card.kind ? poster : card;
  const persistedLedger = JSON.parse(await fs.readFile(path.join(root, 'promotion-ledger.json'), 'utf8'));
  assert.equal(validatePromotionLedger(persistedLedger).ok, true);
  assert.deepEqual(persistedLedger.entries.map(({ kind }) => kind), [winner.kind]);
  assert.equal(
    await fs.readFile(path.join(root, winnerCandidate.source), 'utf8'),
    winnerCandidate.moduleSource,
  );
  assert.equal(await exists(path.join(root, loser.source)), false);
  assert.equal(await exists(path.join(root, 'promotion-ledger.json.promotion.lock')), false);
});

test('a crash lock fails closed and is never taken over automatically', async (t) => {
  const root = await repository(t);
  const currentLedger = createPromotionLedger([], { revision: 0 });
  const candidate = stagedCandidate();
  const revision = revisionFor(candidate);
  const dryRun = await orchestrateMemoryPromotion(
    workspacePromotionInput(candidate, revision),
    { repositoryRoot: root, ledger: currentLedger, gateVerifier: gateAuthority },
  );
  const lockFile = path.join(root, 'promotion-ledger.json.promotion.lock');
  const lockBytes = 'crashed-owner-requires-manual-recovery\n';
  await fs.writeFile(lockFile, lockBytes, { encoding: 'utf8', flag: 'wx' });

  await assert.rejects(materializePromotion({
    repositoryRoot: root,
    currentLedger,
    nextLedger: dryRun.nextLedger,
    stagedModules: [{
      entry: { source: candidate.source },
      moduleSource: candidate.moduleSource,
    }],
    primaryKind: candidate.kind,
  }), /Promotion materialization lock exists; manual recovery is required/u);

  assert.equal(await fs.readFile(lockFile, 'utf8'), lockBytes);
  assert.equal(await exists(path.join(root, candidate.source)), false);
  assert.equal(await exists(path.join(root, 'promotion-ledger.json')), false);
});

function stagedCandidate() {
  return {
    kind: 'unit.card',
    type: 'unit',
    source: 'units/card.js',
    export: 'Card',
    moduleSource: MODULE_SOURCE,
    evidenceSha256: EVIDENCE,
  };
}

function revisionFor(candidate, options = {}) {
  const moduleSha256 = sha256(candidate.moduleSource);
  const discovery = discoveryFor(candidate, options);
  const dependencyClosureSha256 = buildDependencyClosure(
    discovery,
    candidate.source,
  ).closureSha256;
  const primaryRevisionSha256 = candidateRevisionSha256({
    ...candidate,
    role: 'memory',
    moduleSha256,
    dependencyClosureSha256,
  });
  const bundle = options.bundle === true
    ? buildPromotionBundleIdentity(discovery, [candidate.kind, 'behaviour.editorial-snap'])
    : null;
  const candidateSha256 = bundle
    ? bundleCandidateRevisionSha256({
      primaryRevisionSha256,
      bundleSha256: bundle.bundleSha256,
    })
    : primaryRevisionSha256;
  return {
    candidateSha256,
    moduleSha256,
    dependencyClosureSha256,
    bundleSha256: bundle?.bundleSha256 ?? null,
    outcomeRevisionSha256: options.bundle === true ? candidateSha256 : moduleSha256,
    evidenceSha256: candidate.evidenceSha256,
  };
}

function validationOutcome(revision, generatedAtMs) {
  return [
    {
      schemaVersion: 1,
      type: 'generation',
      revisionSha256: revision.outcomeRevisionSha256 ?? revision.moduleSha256,
      atMs: generatedAtMs,
    },
    {
      schemaVersion: 1,
      type: 'validation',
      revisionSha256: revision.outcomeRevisionSha256 ?? revision.moduleSha256,
      atMs: generatedAtMs + 1,
      stage: 'compile',
      status: 'passed',
      resultSha256: '8'.repeat(64),
    },
    {
      schemaVersion: 1,
      type: 'validation',
      revisionSha256: revision.outcomeRevisionSha256 ?? revision.moduleSha256,
      atMs: generatedAtMs + 2,
      stage: 'render',
      status: 'passed',
      resultSha256: '9'.repeat(64),
    },
  ];
}

function discoveryFor(candidate, options = {}) {
  const candidateModule = {
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
  };
  const coreModule = {
    file: 'core/Unit.js',
    source: CORE_UNIT_SOURCE,
    imports: [],
  };
  const coreBehaviourModule = {
    file: 'core/Behaviour.js',
    source: CORE_BEHAVIOUR_SOURCE,
    imports: [],
  };
  const boxModule = {
    file: 'units/box.js',
    source: BOX_SOURCE,
    imports: [{ value: '../core/Unit.js' }],
  };
  const groupModule = {
    file: 'units/group.js',
    source: GROUP_SOURCE,
    imports: [{ value: '../core/Unit.js' }],
  };
  const solidFillModule = {
    file: 'units/solid-fill.js',
    source: SOLID_FILL_SOURCE,
    imports: [{ value: '../core/Unit.js' }],
  };
  const compositionPivotModule = {
    file: 'units/composition-pivot.js',
    source: COMPOSITION_PIVOT_SOURCE,
    imports: [{ value: '../core/Unit.js' }],
  };
  const snapModule = {
    file: 'behaviours/editorial-snap.js',
    source: options.snapSource ?? SNAP_SOURCE,
    imports: [
      { value: '../core/Behaviour.js' },
      { value: './shared.js' },
    ],
  };
  const behaviourSharedModule = {
    file: 'behaviours/shared.js',
    source: BEHAVIOUR_SHARED_SOURCE,
    imports: [],
  };
  return {
    entries: [
      {
        kind: candidate.kind,
        type: candidate.type,
        source: candidate.source,
        export: candidate.export,
      },
      ...(options.bundle === true ? [{
        kind: 'behaviour.editorial-snap',
        type: 'behaviour',
        source: 'behaviours/editorial-snap.js',
        export: 'EditorialSnap',
      }] : []),
    ],
    modules: [
      candidateModule,
      ...(options.bundle === true ? [snapModule] : []),
    ],
    dependencyModules: [
      coreModule,
      coreBehaviourModule,
      boxModule,
      groupModule,
      solidFillModule,
      compositionPivotModule,
      snapModule,
      behaviourSharedModule,
      candidateModule,
    ],
  };
}

function stagedSnapCandidate(moduleSource = SNAP_SOURCE) {
  return {
    kind: 'behaviour.editorial-snap',
    type: 'behaviour',
    source: 'behaviours/editorial-snap.js',
    export: 'EditorialSnap',
    moduleSource,
  };
}

function workspacePromotionInput(candidate, revision, bundle = undefined) {
  return {
    candidate,
    ...(bundle === undefined ? {} : { bundle }),
    outcomeEvents: [
      ...validationOutcome(revision, 1_000),
      {
        schemaVersion: 1,
        type: 'workspace-action',
        revisionSha256: revision.outcomeRevisionSha256 ?? revision.moduleSha256,
        atMs: 1_100,
        action: 'exported',
      },
    ],
    revisionSha256: revision.outcomeRevisionSha256 ?? revision.moduleSha256,
    nowMs: 31_100,
    graceMs: 30_000,
    gates: passingGates(revision),
  };
}

function workspaceFeedbackReceipt(revision) {
  const body = {
    schemaVersion: 3,
    candidateSha256: revision.candidateSha256,
    revisionSha256: revision.outcomeRevisionSha256,
    generationEventSha256: '1'.repeat(64),
    validationReceiptSha256: '2'.repeat(64),
    origin: 'workspace-outcome',
    signal: 'neutral',
    state: 'candidate',
    counts: { negative: 0, positive: 0, neutral: 1, ambiguous: 0 },
    eventSha256s: ['3'.repeat(64)],
    grace: { requiredMs: 30_000, remainingMs: 0 },
    classifier: null,
  };
  return { ...body, receiptSha256: sha256(stableStringify(body)) };
}

function passingGates(revision, authority = gateAuthority) {
  return Object.fromEntries(PROMOTION_GATE_NAMES.map((name) => [name, authority.issue({
    gateName: name,
    candidateSha256: revision.candidateSha256,
    moduleSha256: revision.moduleSha256,
    dependencyClosureSha256: revision.dependencyClosureSha256,
    resultSha256: revision.evidenceSha256,
    passed: true,
  })]));
}

async function repository(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-promotion-'));
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
  if (options.includeSnap !== false) {
    await fs.writeFile(path.join(root, 'behaviours/editorial-snap.js'), SNAP_SOURCE, 'utf8');
  }
  await fs.writeFile(path.join(root, 'behaviours/shared.js'), BEHAVIOUR_SHARED_SOURCE, 'utf8');
  return root;
}

async function exists(filename) {
  try {
    await fs.access(filename);
    return true;
  } catch {
    return false;
  }
}
