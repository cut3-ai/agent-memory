import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib.js';
import {
  appendPromotionDecision,
  buildDependencyClosure,
  candidateRevisionSha256,
  createPromotionLedger,
} from '../src/library/promotion-ledger.js';
import { generateNavigationIndex } from '../src/library/index.js';
import {
  createPromotionGateAuthority,
  orchestrateMemoryPromotion,
} from '../src/memory/promotion.js';

const EVIDENCE = 'e'.repeat(64);
const GATE_SECRET = 'test-only-promotion-gate-secret-with-32-bytes';
const CORE_UNIT_SOURCE = 'export class Unit {}\n';
const gateAuthority = createPromotionGateAuthority({
  authorityId: 'test-promotion-gates',
  secret: GATE_SECRET,
});
const MODULE_SOURCE = [
  "import { Unit } from '../core/Unit.js';",
  'export class Card extends Unit {',
  "  static kind = 'unit.card';",
  '  constructor(unit) { super(unit); }',
  '}',
  '',
].join('\n');

test('negative user-authored feedback discards staged code without materializing it', async (t) => {
  const root = await repository(t);
  const candidate = stagedCandidate();
  const result = await orchestrateMemoryPromotion({
    candidate,
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

test('assistant-only or invented classifier evidence quarantines and cannot alter ledger', async (t) => {
  const root = await repository(t);
  const candidate = stagedCandidate();
  const revision = revisionFor(candidate);
  const result = await orchestrateMemoryPromotion({
    candidate,
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
  assert.ok(result.decision.reasons.includes('feedback-grace-incomplete'));
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
  const common = {
    candidate,
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
    moduleSource: MODULE_SOURCE.replace('constructor(unit)', '/* reviewed revision */\n  constructor(unit)'),
  };
  const revisedRevision = revisionFor(revisedCandidate);
  const revised = await orchestrateMemoryPromotion({
    candidate: revisedCandidate,
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
  assert.match(await fs.readFile(path.join(root, 'units/card.js'), 'utf8'), /reviewed revision/u);
  assert.equal((await generateNavigationIndex({ rootDir: root })).promotion.ok, true);
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

function revisionFor(candidate) {
  const moduleSha256 = sha256(candidate.moduleSource);
  const dependencyClosureSha256 = buildDependencyClosure(
    discoveryFor(candidate),
    candidate.source,
  ).closureSha256;
  return {
    candidateSha256: candidateRevisionSha256({
      ...candidate,
      moduleSha256,
      dependencyClosureSha256,
    }),
    moduleSha256,
    dependencyClosureSha256,
    evidenceSha256: candidate.evidenceSha256,
  };
}

function discoveryFor(candidate) {
  const candidateModule = {
    file: candidate.source,
    source: candidate.moduleSource,
    imports: [{ value: '../core/Unit.js' }],
  };
  const coreModule = {
    file: 'core/Unit.js',
    source: CORE_UNIT_SOURCE,
    imports: [],
  };
  return {
    entries: [{
      kind: candidate.kind,
      type: candidate.type,
      source: candidate.source,
      export: candidate.export,
    }],
    modules: [candidateModule],
    dependencyModules: [coreModule, candidateModule],
  };
}

function passingGates(revision, authority = gateAuthority) {
  return Object.fromEntries([
    'compilerFidelity',
    'reconstruction',
    'atomicity',
    'privacy',
    'module',
  ].map((name) => [name, authority.issue({
    gateName: name,
    candidateSha256: revision.candidateSha256,
    moduleSha256: revision.moduleSha256,
    dependencyClosureSha256: revision.dependencyClosureSha256,
    resultSha256: revision.evidenceSha256,
    passed: true,
  })]));
}

async function repository(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-promotion-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'core'), { recursive: true });
  await fs.writeFile(path.join(root, 'core/Unit.js'), CORE_UNIT_SOURCE, 'utf8');
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
