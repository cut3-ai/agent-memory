import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { sha256 } from '../src/lib.js';
import {
  createPromotionGateIssuer,
  createPromotionGateVerifier,
  PROMOTION_GATE_NAMES,
  verifyPromotionGateReceipt,
} from '../src/memory/gate-receipts.js';
import {
  createReconstructionEvidenceBundle,
  evaluateAndIssuePromotionGates,
  loadPromotionGateCapabilitiesFile,
} from '../src/memory/promotion-gates.js';

const run = promisify(execFile);
const REPOSITORY_ROOT = path.resolve('.');
const FINAL_SECRET = 'final-promotion-gate-test-secret-000000000000000000';
const EVIDENCE_SECRET = 'evidence-verifier-test-secret-000000000000000000';
const COMPOSITION_SOURCE = 'const GeneratedComposition = () => <div style={{opacity: 1}} />;';
const TRANSIENT_SOURCE = [
  "import { Unit } from '../core/Unit.js';",
  'export class Card extends Unit {',
  "  static kind = 'unit.card';",
  '  constructor(unit) { super(unit); }',
  '}',
  '',
].join('\n');

test('local integrated evaluator computes all five gates and binds one signed result bundle', async () => {
  const candidate = await integratedBoxCandidate();
  const { issuer, verifier } = finalCapabilities();
  const result = await evaluateAndIssuePromotionGates({
    candidate,
    evidence: { datasetText: dataset([1, 2]) },
  }, { repositoryRoot: REPOSITORY_ROOT, issuer });

  assert.deepEqual(Object.keys(result.gates), PROMOTION_GATE_NAMES);
  for (const gateName of PROMOTION_GATE_NAMES) {
    assert.equal(result.bundle.results[gateName].passed, true, gateName);
    assert.equal(result.gates[gateName].resultSha256, result.bundle.bundleSha256);
    assert.ok(verifyPromotionGateReceipt(verifier, result.gates[gateName], {
      gateName,
      candidateSha256: result.candidate.candidateSha256,
      moduleSha256: result.candidate.moduleSha256,
      dependencyClosureSha256: result.candidate.dependencyClosureSha256,
    }));
  }
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /GeneratedComposition|moduleSource|tracks/u);
  assert.equal(result.bundle.evidence.evidenceAuthorityId, null);
});

test('local evidence fails closed when the candidate is absent or workspaces are not independent', async () => {
  const candidate = await integratedBoxCandidate();
  const { issuer } = finalCapabilities();
  const absent = await evaluateAndIssuePromotionGates({
    candidate,
    evidence: {
      datasetText: dataset([1, 2], 'const GeneratedComposition = () => <div />;'),
    },
  }, { repositoryRoot: REPOSITORY_ROOT, issuer });
  assert.equal(absent.bundle.results.compilerFidelity.passed, false);
  assert.equal(absent.bundle.results.compilerFidelity.code, 'candidate-not-observed');
  assert.equal(absent.bundle.results.reconstruction.passed, false);

  const duplicate = JSON.stringify(workspace(1));
  const repeated = await evaluateAndIssuePromotionGates({
    candidate,
    evidence: { datasetText: `${duplicate}\n${duplicate}` },
  }, { repositoryRoot: REPOSITORY_ROOT, issuer });
  assert.equal(repeated.bundle.results.compilerFidelity.passed, true);
  assert.equal(repeated.bundle.results.reconstruction.passed, false);
  assert.equal(
    repeated.bundle.results.reconstruction.code,
    'insufficient-independent-workspaces',
  );
});

test('distinct evidence authority can attest a transient candidate without exposing raw evidence', async () => {
  const candidate = transientCandidate();
  const { issuer: finalIssuer, verifier: finalVerifier } = finalCapabilities();
  const evidenceIssuer = createPromotionGateIssuer({
    authorityId: 'evidence-ci',
    secret: EVIDENCE_SECRET,
  });
  const evidenceVerifier = createPromotionGateVerifier({
    authorityId: 'evidence-ci',
    secret: EVIDENCE_SECRET,
  });
  const identity = await stagedIdentity(candidate, finalIssuer);
  const bundle = evidenceBundle(identity, exactCases());
  const attestations = evidenceAttestations(identity, bundle, evidenceIssuer);
  const result = await evaluateAndIssuePromotionGates({
    candidate,
    evidence: { reconstructionBundle: bundle, attestations },
  }, {
    repositoryRoot: REPOSITORY_ROOT,
    issuer: finalIssuer,
    evidenceVerifier,
  });

  for (const gateName of PROMOTION_GATE_NAMES) {
    assert.equal(result.bundle.results[gateName].passed, true, gateName);
    assert.ok(verifyPromotionGateReceipt(finalVerifier, result.gates[gateName], {
      gateName,
      candidateSha256: identity.candidateSha256,
      moduleSha256: identity.moduleSha256,
      dependencyClosureSha256: identity.dependencyClosureSha256,
    }));
  }
  assert.equal(result.bundle.evidence.evidenceAuthorityId, 'evidence-ci');
  assert.doesNotMatch(JSON.stringify(result), /class Card|core\/Unit/u);
});

test('tampering, shared authority, residuals and missing evidence cannot produce passing reconstruction', async () => {
  const candidate = transientCandidate();
  const { issuer: finalIssuer, verifier: sameAuthorityVerifier } = finalCapabilities();
  const evidenceIssuer = createPromotionGateIssuer({
    authorityId: 'evidence-ci',
    secret: EVIDENCE_SECRET,
  });
  const evidenceVerifier = createPromotionGateVerifier({
    authorityId: 'evidence-ci',
    secret: EVIDENCE_SECRET,
  });
  const identity = await stagedIdentity(candidate, finalIssuer);
  const bundle = evidenceBundle(identity, exactCases());
  const attestations = evidenceAttestations(identity, bundle, evidenceIssuer);

  const tampered = { ...bundle, corpusSha256: sha256('tampered-corpus') };
  const tamperedResult = await evaluateAndIssuePromotionGates({
    candidate,
    evidence: { reconstructionBundle: tampered, attestations },
  }, { repositoryRoot: REPOSITORY_ROOT, issuer: finalIssuer, evidenceVerifier });
  assert.equal(tamperedResult.bundle.results.compilerFidelity.passed, false);
  assert.equal(tamperedResult.bundle.results.reconstruction.passed, false);
  assert.equal(tamperedResult.bundle.results.compilerFidelity.code, 'evidence-hash-mismatch');

  const sameAuthorityResult = await evaluateAndIssuePromotionGates({
    candidate,
    evidence: { reconstructionBundle: bundle, attestations },
  }, {
    repositoryRoot: REPOSITORY_ROOT,
    issuer: finalIssuer,
    evidenceVerifier: sameAuthorityVerifier,
  });
  assert.equal(sameAuthorityResult.bundle.results.compilerFidelity.passed, false);
  assert.equal(
    sameAuthorityResult.bundle.results.compilerFidelity.code,
    'evidence-authority-required',
  );

  const residualBundle = evidenceBundle(identity, exactCases().map((item) => ({
    ...item,
    residualVisualComputations: 1,
  })));
  const residualAttestations = evidenceAttestations(identity, residualBundle, evidenceIssuer);
  const residualResult = await evaluateAndIssuePromotionGates({
    candidate,
    evidence: { reconstructionBundle: residualBundle, attestations: residualAttestations },
  }, { repositoryRoot: REPOSITORY_ROOT, issuer: finalIssuer, evidenceVerifier });
  assert.equal(residualResult.bundle.results.compilerFidelity.passed, true);
  assert.equal(residualResult.bundle.results.reconstruction.passed, false);

  const missing = await evaluateAndIssuePromotionGates({ candidate }, {
    repositoryRoot: REPOSITORY_ROOT,
    issuer: finalIssuer,
  });
  assert.equal(missing.bundle.results.compilerFidelity.passed, false);
  assert.equal(missing.bundle.results.reconstruction.passed, false);
  assert.equal(missing.gates.compilerFidelity.passed, false);
  await assert.rejects(
    evaluateAndIssuePromotionGates({ candidate }, {
      repositoryRoot: REPOSITORY_ROOT,
      issuer: { issue() {} },
    }),
    /configured final promotion gate issuer/u,
  );
});

test('module, atomicity and privacy gates reject adversarial staged source', async () => {
  const { issuer } = finalCapabilities();
  const fakeBase = await evaluateAndIssuePromotionGates({ candidate: {
    ...transientCandidate(),
    moduleSource: [
      'class Unit {}',
      'export class Card extends Unit {',
      "  static kind = 'unit.card';",
      '  constructor(unit) { super(unit); }',
      '}',
    ].join('\n'),
  } }, { repositoryRoot: REPOSITORY_ROOT, issuer });
  assert.equal(fakeBase.bundle.results.module.passed, false);

  const combined = await evaluateAndIssuePromotionGates({ candidate: {
    kind: 'behaviour.combined',
    type: 'behaviour',
    source: 'behaviours/combined.js',
    export: 'Combined',
    moduleSource: [
      "import { Behaviour } from '../core/Behaviour.js';",
      'export class Combined extends Behaviour {',
      "  static kind = 'behaviour.combined';",
      '  constructor(unit) { super(unit); }',
      '  onFrame() { this.unit.opacity = 1; this.unit.visible = true; }',
      '}',
    ].join('\n'),
  } }, { repositoryRoot: REPOSITORY_ROOT, issuer });
  assert.equal(combined.bundle.results.atomicity.passed, false);
  assert.equal(combined.bundle.results.atomicity.code, 'combined-behaviour-write');

  const computedWrite = await evaluateAndIssuePromotionGates({ candidate: {
    kind: 'behaviour.computed-write',
    type: 'behaviour',
    source: 'behaviours/computed-write.js',
    export: 'ComputedWrite',
    moduleSource: [
      "import { Behaviour } from '../core/Behaviour.js';",
      'export class ComputedWrite extends Behaviour {',
      "  static kind = 'behaviour.computed-write';",
      '  constructor(unit) { super(unit); }',
      "  onFrame() { this.unit.opacity = 1; this.unit['visible'] = true; }",
      '}',
    ].join('\n'),
  } }, { repositoryRoot: REPOSITORY_ROOT, issuer });
  assert.equal(computedWrite.bundle.results.atomicity.passed, false);
  assert.equal(computedWrite.bundle.results.atomicity.code, 'dynamic-unit-channel');

  const rawNetwork = await evaluateAndIssuePromotionGates({ candidate: {
    ...transientCandidate(),
    moduleSource: `${TRANSIENT_SOURCE}\n// source: https://private.example/user/video\n`,
  } }, { repositoryRoot: REPOSITORY_ROOT, issuer });
  assert.equal(rawNetwork.bundle.results.privacy.passed, false);
  assert.equal(rawNetwork.bundle.results.privacy.code, 'raw-network-identifier');

  const shortUserCopy = await evaluateAndIssuePromotionGates({ candidate: {
    ...transientCandidate(),
    moduleSource: TRANSIENT_SOURCE.replace(
      'constructor(unit) { super(unit); }',
      "constructor(unit) { super(unit); this.text = 'Alice'; }",
    ),
  } }, { repositoryRoot: REPOSITORY_ROOT, issuer });
  assert.equal(shortUserCopy.bundle.results.privacy.passed, false);
  assert.equal(shortUserCopy.bundle.results.privacy.code, 'free-text-literal');

  const credentialCopy = await evaluateAndIssuePromotionGates({ candidate: {
    ...transientCandidate(),
    moduleSource: TRANSIENT_SOURCE.replace(
      'constructor(unit) { super(unit); }',
      "constructor(unit) { super(unit); this.name = 'AKIA1234567890ABCDEF'; }",
    ),
  } }, { repositoryRoot: REPOSITORY_ROOT, issuer });
  assert.equal(credentialCopy.bundle.results.privacy.passed, false);
  assert.equal(credentialCopy.bundle.results.privacy.code, 'secret-like-token');

  const ambientCases = new Map([
    ['console', 'console.log(this.unit.props);'],
    ['timer', 'setTimeout(() => console.log(this.unit.props), 0);'],
    ['date', 'Date.now();'],
    ['location', 'void location.href;'],
    ['math-random', 'Math.random();'],
    ['function-constructor', "Function('return 1')();"],
    ['prototype-constructor', "({}).constructor.constructor('return 1')();"],
    ['promise', 'Promise.resolve(1);'],
    ['symbol', "Symbol('escape');"],
    ['crypto', 'void crypto.randomUUID();'],
    ['import-meta', 'void import.meta.url;'],
    ['dynamic-import', "void import('../core/Unit.js');"],
  ]);
  for (const [label, statement] of ambientCases) {
    const result = await evaluateAndIssuePromotionGates({ candidate: {
      kind: `behaviour.audit-${label}`,
      type: 'behaviour',
      source: `behaviours/audit-${label}.js`,
      export: 'AuditAmbient',
      moduleSource: [
        "import { Behaviour } from '../core/Behaviour.js';",
        'export class AuditAmbient extends Behaviour {',
        `  static kind = 'behaviour.audit-${label}';`,
        '  constructor(unit) { super(unit); }',
        `  onFrame() { ${statement} this.unit.opacity = 1; }`,
        '}',
      ].join('\n'),
    } }, { repositoryRoot: REPOSITORY_ROOT, issuer });
    assert.equal(result.bundle.results.module.passed, false, label);
  }

  const unitRead = await evaluateAndIssuePromotionGates({ candidate: {
    kind: 'behaviour.unit-read',
    type: 'behaviour',
    source: 'behaviours/unit-read.js',
    export: 'UnitRead',
    moduleSource: [
      "import { Behaviour } from '../core/Behaviour.js';",
      'export class UnitRead extends Behaviour {',
      "  static kind = 'behaviour.unit-read';",
      '  constructor(unit) { super(unit); }',
      '  onFrame() { void this.unit.props; this.unit.opacity = 1; }',
      '}',
    ].join('\n'),
  } }, { repositoryRoot: REPOSITORY_ROOT, issuer });
  assert.equal(unitRead.bundle.results.module.passed, true);
  assert.equal(unitRead.bundle.results.atomicity.passed, false);
  assert.equal(unitRead.bundle.results.atomicity.code, 'unit-read-or-escape');

  const readModifyWrite = await evaluateAndIssuePromotionGates({ candidate: {
    kind: 'behaviour.read-modify-write',
    type: 'behaviour',
    source: 'behaviours/read-modify-write.js',
    export: 'ReadModifyWrite',
    moduleSource: [
      "import { Behaviour } from '../core/Behaviour.js';",
      'export class ReadModifyWrite extends Behaviour {',
      "  static kind = 'behaviour.read-modify-write';",
      '  constructor(unit) { super(unit); }',
      '  onFrame() { this.unit.opacity += 1; }',
      '}',
    ].join('\n'),
  } }, { repositoryRoot: REPOSITORY_ROOT, issuer });
  assert.equal(readModifyWrite.bundle.results.atomicity.passed, false);
  assert.equal(readModifyWrite.bundle.results.atomicity.code, 'unit-read-or-escape');

  const canonicalWriter = await evaluateAndIssuePromotionGates({ candidate: {
    kind: 'behaviour.canonical-writer',
    type: 'behaviour',
    source: 'behaviours/canonical-writer.js',
    export: 'CanonicalWriter',
    moduleSource: [
      "import { Behaviour } from '../core/Behaviour.js';",
      "import { writeTransform } from './shared.js';",
      'export class CanonicalWriter extends Behaviour {',
      "  static kind = 'behaviour.canonical-writer';",
      '  constructor(unit) { super(unit); }',
      "  onFrame() { writeTransform(this.unit, 'translate', { x: 1 }); }",
      '}',
    ].join('\n'),
  } }, { repositoryRoot: REPOSITORY_ROOT, issuer });
  assert.equal(canonicalWriter.bundle.results.module.passed, true);
  assert.equal(canonicalWriter.bundle.results.atomicity.passed, true);
  assert.equal(canonicalWriter.bundle.results.privacy.passed, true);

  const shadowedWriter = await evaluateAndIssuePromotionGates({ candidate: {
    kind: 'behaviour.shadowed-writer',
    type: 'behaviour',
    source: 'behaviours/shadowed-writer.js',
    export: 'ShadowedWriter',
    moduleSource: [
      "import { Behaviour } from '../core/Behaviour.js';",
      "import { writeTransform } from './shared.js';",
      'export class ShadowedWriter extends Behaviour {',
      "  static kind = 'behaviour.shadowed-writer';",
      '  constructor(unit) { super(unit); }',
      "  onFrame(writeTransform) { writeTransform(this.unit, 'translate', { x: 1 }); }",
      '}',
    ].join('\n'),
  } }, { repositoryRoot: REPOSITORY_ROOT, issuer });
  assert.equal(shadowedWriter.bundle.results.atomicity.passed, false);
  assert.equal(shadowedWriter.bundle.results.atomicity.code, 'unit-read-or-escape');

  const storedCallback = await evaluateAndIssuePromotionGates({ candidate: {
    kind: 'behaviour.stored-callback',
    type: 'behaviour',
    source: 'behaviours/stored-callback.js',
    export: 'StoredCallback',
    moduleSource: [
      "import { Behaviour } from '../core/Behaviour.js';",
      'export class StoredCallback extends Behaviour {',
      "  static kind = 'behaviour.stored-callback';",
      '  constructor(unit, callback) { super(unit); this.callback = callback; }',
      '  onFrame() { this.callback(); this.unit.opacity = 1; }',
      '}',
    ].join('\n'),
  } }, { repositoryRoot: REPOSITORY_ROOT, issuer });
  assert.equal(storedCallback.bundle.results.module.passed, false);
  assert.equal(
    storedCallback.bundle.results.module.code,
    'parameter-or-instance-callback',
  );

  const directCallback = await evaluateAndIssuePromotionGates({ candidate: {
    kind: 'behaviour.direct-callback',
    type: 'behaviour',
    source: 'behaviours/direct-callback.js',
    export: 'DirectCallback',
    moduleSource: [
      "import { Behaviour } from '../core/Behaviour.js';",
      'export class DirectCallback extends Behaviour {',
      "  static kind = 'behaviour.direct-callback';",
      '  constructor(unit) { super(unit); }',
      '  onFrame(callback) { callback(); this.unit.opacity = 1; }',
      '}',
    ].join('\n'),
  } }, { repositoryRoot: REPOSITORY_ROOT, issuer });
  assert.equal(directCallback.bundle.results.module.passed, false);
  assert.equal(
    directCallback.bundle.results.module.code,
    'parameter-or-instance-callback',
  );

  const aliasedCallback = await evaluateAndIssuePromotionGates({ candidate: {
    kind: 'behaviour.aliased-callback',
    type: 'behaviour',
    source: 'behaviours/aliased-callback.js',
    export: 'AliasedCallback',
    moduleSource: [
      "import { Behaviour } from '../core/Behaviour.js';",
      'export class AliasedCallback extends Behaviour {',
      "  static kind = 'behaviour.aliased-callback';",
      '  constructor(unit) { super(unit); }',
      '  onFrame(callback) { const alias = callback; alias(); this.unit.opacity = 1; }',
      '}',
    ].join('\n'),
  } }, { repositoryRoot: REPOSITORY_ROOT, issuer });
  assert.equal(aliasedCallback.bundle.results.module.passed, false);
  assert.equal(
    aliasedCallback.bundle.results.module.code,
    'parameter-or-instance-callback',
  );

  const ownerlessBehaviour = await evaluateAndIssuePromotionGates({ candidate: {
    kind: 'behaviour.ownerless',
    type: 'behaviour',
    source: 'behaviours/ownerless.js',
    export: 'Ownerless',
    moduleSource: [
      "import { Behaviour } from '../core/Behaviour.js';",
      'export class Ownerless extends Behaviour {',
      "  static kind = 'behaviour.ownerless';",
      '  constructor() { super(); }',
      '  onFrame() { this.unit.opacity = 1; }',
      '}',
    ].join('\n'),
  } }, { repositoryRoot: REPOSITORY_ROOT, issuer });
  assert.equal(ownerlessBehaviour.bundle.results.module.passed, false);
  assert.ok(ownerlessBehaviour.bundle.results.module.violations > 0);
});

test('current atomic Box, Opacity and Scale modules pass all static gates', async () => {
  const { issuer } = finalCapabilities();
  const candidates = [
    ['unit.box', 'unit', 'units/box.js', 'Box'],
    ['behaviour.opacity', 'behaviour', 'behaviours/opacity.js', 'Opacity'],
    ['behaviour.scale', 'behaviour', 'behaviours/scale.js', 'Scale'],
  ];
  for (const [kind, type, source, exportName] of candidates) {
    const result = await evaluateAndIssuePromotionGates({ candidate: {
      kind,
      type,
      source,
      export: exportName,
      moduleSource: await fs.readFile(path.join(REPOSITORY_ROOT, source), 'utf8'),
    } }, { repositoryRoot: REPOSITORY_ROOT, issuer });
    assert.equal(result.bundle.results.module.passed, true, `${kind}: module`);
    assert.equal(result.bundle.results.atomicity.passed, true, `${kind}: atomicity`);
    assert.equal(result.bundle.results.privacy.passed, true, `${kind}: privacy`);
  }
});

test('gate capability loader rejects one HMAC secret under distinct authority ids', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-gate-key-separation-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const envFile = path.join(directory, '.env');
  await fs.writeFile(envFile, [
    `CUT3_MEMORY_GATE_HMAC_KEY=${FINAL_SECRET}`,
    'CUT3_MEMORY_GATE_AUTHORITY_ID=final-ci',
    `CUT3_MEMORY_EVIDENCE_HMAC_KEY=${FINAL_SECRET}`,
    'CUT3_MEMORY_EVIDENCE_AUTHORITY_ID=evidence-ci',
  ].join('\n'), 'utf8');
  await assert.rejects(
    loadPromotionGateCapabilitiesFile(envFile, { cwd: directory }),
    /HMAC secret must differ/u,
  );
});

test('promotion gate CLI reads local evidence, ignores provider keys and emits no private bytes', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-gates-cli-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const candidate = await integratedBoxCandidate();
  const candidateFile = path.join(directory, 'candidate.json');
  const datasetFile = path.join(directory, 'dataset.jsonl');
  const outputFile = path.join(directory, 'gate-result.json');
  const envFile = path.join(directory, '.env');
  await fs.writeFile(candidateFile, JSON.stringify({ candidate }), 'utf8');
  await fs.writeFile(datasetFile, dataset([1, 2]), 'utf8');
  await fs.writeFile(envFile, [
    'KIMI=provider-secret-must-be-ignored',
    'Anthropic=other-provider-secret-must-be-ignored',
    `CUT3_MEMORY_GATE_HMAC_KEY=${FINAL_SECRET}`,
    'CUT3_MEMORY_GATE_AUTHORITY_ID=final-ci',
  ].join('\n'), 'utf8');
  const cli = path.resolve('src/memory/promotion-gates-cli.js');
  const execution = await run(process.execPath, [
    cli,
    '--input', candidateFile,
    '--repo', REPOSITORY_ROOT,
    '--env', envFile,
    '--dataset', datasetFile,
    '--out', outputFile,
  ]);
  const stdout = JSON.parse(execution.stdout);
  const written = JSON.parse(await fs.readFile(outputFile, 'utf8'));
  assert.deepEqual(stdout, written);
  assert.equal(stdout.bundle.results.reconstruction.passed, true);
  const combinedOutput = execution.stdout + execution.stderr + JSON.stringify(written);
  assert.doesNotMatch(combinedOutput, /provider-secret|GeneratedComposition|moduleSource/u);
});

async function integratedBoxCandidate() {
  return {
    kind: 'unit.box',
    type: 'unit',
    source: 'units/box.js',
    export: 'Box',
    moduleSource: await fs.readFile(path.join(REPOSITORY_ROOT, 'units/box.js'), 'utf8'),
  };
}

function transientCandidate() {
  return {
    kind: 'unit.card',
    type: 'unit',
    source: 'units/card.js',
    export: 'Card',
    moduleSource: TRANSIENT_SOURCE,
  };
}

function finalCapabilities() {
  return {
    issuer: createPromotionGateIssuer({ authorityId: 'final-ci', secret: FINAL_SECRET }),
    verifier: createPromotionGateVerifier({ authorityId: 'final-ci', secret: FINAL_SECRET }),
  };
}

async function stagedIdentity(candidate, issuer) {
  const result = await evaluateAndIssuePromotionGates({ candidate }, {
    repositoryRoot: REPOSITORY_ROOT,
    issuer,
  });
  return result.candidate;
}

function evidenceBundle(identity, cases) {
  return createReconstructionEvidenceBundle({
    candidateSha256: identity.candidateSha256,
    moduleSha256: identity.moduleSha256,
    dependencyClosureSha256: identity.dependencyClosureSha256,
    candidateKind: identity.kind,
    datasetSha256: sha256('private-dataset'),
    corpusSha256: sha256('private-corpus'),
    cases,
  });
}

function evidenceAttestations(identity, bundle, issuer) {
  return Object.fromEntries(['compilerFidelity', 'reconstruction'].map((gateName) => [
    gateName,
    issuer.issue({
      gateName,
      candidateSha256: identity.candidateSha256,
      moduleSha256: identity.moduleSha256,
      dependencyClosureSha256: identity.dependencyClosureSha256,
      resultSha256: bundle.bundleSha256,
      passed: true,
    }),
  ]));
}

function exactCases() {
  return [1, 2].map((id) => ({
    caseSha256: sha256(`case:${id}`),
    workspaceSha256: sha256(`workspace:${id}`),
    compositionSha256: sha256(`composition:${id}`),
    videoSha256: sha256(`video:${id}`),
    frames: 3,
    matchedFrames: 3,
    candidateObserved: true,
    compilerGenerated: true,
    compilerPublishable: true,
    candidateModuleImported: true,
    graphExact: true,
    baselineRenderErrors: 0,
    generatedRenderErrors: 0,
    nativeUnits: 0,
    localBehaviours: 0,
    residualVisualComputations: 0,
    invalidBehaviourOwners: 0,
    unsupportedEffects: 0,
  }));
}

function dataset(ids, source = COMPOSITION_SOURCE) {
  return ids.map((id) => JSON.stringify(workspace(id, source))).join('\n');
}

function workspace(id, source = COMPOSITION_SOURCE) {
  return {
    id,
    width: 1080,
    height: 1920,
    fps: 2,
    tracks: [{ type: 'composition', length: 1_000, source }],
  };
}
