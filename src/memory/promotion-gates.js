import fs from 'node:fs/promises';
import path from 'node:path';

import traverseModule from '@babel/traverse';

import { compileCompositionV2 } from '../cba-v2/compiler.js';
import { CBA_V2_FEATURE_DEFAULTS } from '../cba-v2/features.js';
import { verifyCompositionV2 } from '../cba-v2/verifier.js';
import { evaluateCbaProfile } from '../experiment/profile-evaluator.js';
import { parseWorkspaceDataset } from '../experiment/split.js';
import { sha256, stableStringify } from '../lib.js';
import {
  collectStaticSpecifiers,
  discoverLibrary,
  findExportedClasses,
  parseModule,
  propertyName,
  readOwnStaticKind,
  walkAst,
} from '../library/discover.js';
import { buildNavigationIndex, validateNavigationIndex } from '../library/index.js';
import {
  buildDependencyClosure,
  candidateRevisionSha256,
} from '../library/promotion-ledger.js';
import { traceStaticImports, verifyDiscovery } from '../library/verify.js';
import {
  createPromotionGateIssuer,
  createPromotionGateVerifier,
  isPromotionGateIssuer,
  isPromotionGateVerifier,
  PROMOTION_GATE_NAMES,
  verifyPromotionGateReceipt,
} from './gate-receipts.js';
import { buildCorpusCensus, ingestCompositionTracks } from './corpus.js';
import { assertPublicArtifact, inspectPublicArtifact } from './privacy.js';
import { evaluateReconstructionReceipts } from './reconstruction.js';
import {
  assertLocalProviderEnvFile,
  defaultCut3EnvFile,
  parseEnv,
} from '../providers/env.js';

const traverse = traverseModule.default ?? traverseModule;

export const PROMOTION_GATE_EVALUATOR_VERSION = 'promotion-gates-v2-authentic-tree';
export const RECONSTRUCTION_EVIDENCE_VERSION = 1;

const HASH = /^[a-f0-9]{64}$/u;
const KIND = /^(?:unit|behaviour)\.[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u;
const SAFE_EXPORT = /^(?:default|[$A-Z_a-z][$\w]*)$/u;
const SECRET = /(?:\b(?:sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}|AIza[0-9A-Za-z_-]{20,}|glpat-[0-9A-Za-z_-]{20,}|xox[baprs]-[0-9A-Za-z-]{10,})\b|-----BEGIN [A-Z ]*PRIVATE KEY-----)/u;
const NETWORK_SCHEME = /\b[A-Za-z][A-Za-z0-9+.-]{0,31}:\/\/[^\s<>()]+/u;
const OPAQUE_NETWORK_SCHEME = /\b(?:mailto|data|tel|urn):[^\s<>()]+/iu;
const EMAIL = /[^\s<>()@]+@[^\s<>()@]+/u;
const DOMAIN = /(?:^|[^\p{L}\p{N}_@-])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+(?:[\p{L}]{2,63}|xn--[a-z0-9-]{2,59})(?::\d{1,5})?(?:\/[^\s<>()]*)?/iu;
const ALLOWED_DETERMINISTIC_GLOBALS = new Set([
  'AggregateError',
  'Array',
  'ArrayBuffer',
  'BigInt',
  'BigInt64Array',
  'BigUint64Array',
  'Boolean',
  'DataView',
  'decodeURI',
  'decodeURIComponent',
  'encodeURI',
  'encodeURIComponent',
  'Error',
  'EvalError',
  'Float32Array',
  'Float64Array',
  'Infinity',
  'Int8Array',
  'Int16Array',
  'Int32Array',
  'isFinite',
  'isNaN',
  'JSON',
  'Map',
  'Math',
  'NaN',
  'Number',
  'Object',
  'parseFloat',
  'parseInt',
  'RangeError',
  'ReferenceError',
  'RegExp',
  'Set',
  'String',
  'SyntaxError',
  'TypeError',
  'Uint8Array',
  'Uint8ClampedArray',
  'Uint16Array',
  'Uint32Array',
  'undefined',
  'URIError',
  'WeakMap',
  'WeakSet',
]);
const SENSITIVE_FIELD_NAMES = new Set([
  'dialogue',
  'messages',
  'prompt',
  'prompts',
  'rawSource',
  'transcript',
  'userContent',
]);
const ALLOWED_BEHAVIOUR_CHANNELS = /^(?:backgroundColor|boxShadow|color|filter\.[a-z][a-z0-9-]*|opacity|text|textShadow|transform\.[a-z][a-z0-9-]*|visible)$/u;
const SENSITIVE_LITERAL_FIELDS = /^(?:alt|author|caption|content|copy|description|dialogue|email|label|name|phone|prompt|src|subtitle|text|title|transcript|url|userContent|username|value)$/iu;
const CANONICAL_INSTANCE_HELPERS = Object.freeze({
  addLeafBehaviours: 'units/shared.js',
  immutableConfig: 'behaviours/shared.js',
});
const CANONICAL_WRITERS = Object.freeze({
  writeFilter: 'behaviours/shared.js',
  writeTransform: 'behaviours/shared.js',
});
const CANONICAL_LABEL_HELPERS = Object.freeze({
  animationValue: 'behaviours/shared.js',
  finite: 'units/shared.js',
  number: 'behaviours/shared.js',
  plain: 'units/shared.js',
  plainOptions: 'behaviours/shared.js',
  positiveInteger: 'units/shared.js',
});
const CANONICAL_LABEL_ARGUMENTS = Object.freeze({
  animationValue: 1,
  finite: 1,
  number: 1,
  plain: 1,
  plainOptions: 2,
  positiveInteger: 1,
});
const OPEN_STYLE_INPUT = /^(?:appearance|backend|channel|className|component|css|factory|factoryId|path|property|props|read|render|renderer|signal|style|value)$/u;
const RENDER_STATE_FIELD = /^(?:appearance|backend|component|css|factory|factoryId|props|render|renderer|style)$/u;
const THIN_BEHAVIOUR_HELPERS = new Set([
  'animationValue',
  'sample',
  'sampled',
]);
const FINAL_SECRET_NAMES = Object.freeze([
  'CUT3_MEMORY_GATE_HMAC_KEY',
  'CUT3_GATE_HMAC_KEY',
  'Memory Gate HMAC Key',
]);
const FINAL_AUTHORITY_NAMES = Object.freeze([
  'CUT3_MEMORY_GATE_AUTHORITY_ID',
  'CUT3_GATE_AUTHORITY_ID',
  'Memory Gate Authority ID',
]);
const EVIDENCE_SECRET_NAMES = Object.freeze([
  'CUT3_MEMORY_EVIDENCE_HMAC_KEY',
  'CUT3_EVIDENCE_HMAC_KEY',
  'Memory Evidence HMAC Key',
]);
const EVIDENCE_AUTHORITY_NAMES = Object.freeze([
  'CUT3_MEMORY_EVIDENCE_AUTHORITY_ID',
  'CUT3_EVIDENCE_AUTHORITY_ID',
  'Memory Evidence Authority ID',
]);

/**
 * Evaluate one exact staged revision and issue all authenticated receipts.
 *
 * Local mode receives raw dataset text transiently and builds reconstruction
 * evidence with the real compiler and frame verifier. A transient class that
 * is not integrated into that verifier must instead supply a hash-only bundle
 * signed by a distinct evidence authority. No raw module or dataset bytes are
 * returned or included in a signed result.
 */
export async function evaluateAndIssuePromotionGates(input = {}, options = {}) {
  const issuer = requireIssuer(options.issuer);
  const repositoryRoot = path.resolve(options.repositoryRoot ?? input.repositoryRoot ?? process.cwd());
  const prepared = await prepareStagedCandidate(input.candidate, repositoryRoot, options);
  const staticEvaluation = await evaluateStaticGates(prepared, repositoryRoot, {
    datasetText: input.evidence?.datasetText,
  });

  let evidence;
  if (typeof input.evidence?.datasetText === 'string') {
    evidence = await evaluateLocalEvidence(
      input.evidence.datasetText,
      prepared,
      staticEvaluation,
      repositoryRoot,
    );
  } else {
    evidence = evaluateAttestedEvidence(
      input.evidence?.reconstructionBundle,
      input.evidence?.attestations,
      prepared,
      issuer,
      options.evidenceVerifier,
    );
  }

  const results = deepFreeze({
    compilerFidelity: evidence.compilerFidelity,
    reconstruction: evidence.reconstruction,
    atomicity: staticEvaluation.atomicity,
    authenticity: staticEvaluation.authenticity,
    privacy: staticEvaluation.privacy,
    module: staticEvaluation.module,
  });
  const bundleBody = {
    schemaVersion: 1,
    evaluatorVersion: PROMOTION_GATE_EVALUATOR_VERSION,
    candidate: publicCandidateIdentity(prepared),
    evidence: {
      mode: evidence.mode,
      datasetSha256: evidence.bundle.datasetSha256,
      corpusSha256: evidence.bundle.corpusSha256,
      reconstructionBundleSha256: evidence.bundle.bundleSha256,
      evidenceAuthorityId: evidence.evidenceAuthorityId,
      attestationSetSha256: evidence.attestationSetSha256,
    },
    results,
  };
  assertPublicArtifact(bundleBody);
  const bundle = deepFreeze({
    ...bundleBody,
    bundleSha256: sha256(stableStringify(bundleBody)),
  });
  if (input.candidate?.evidenceSha256 !== undefined
      && input.candidate.evidenceSha256 !== bundle.bundleSha256) {
    throw new Error('candidate evidence hash does not match the canonical promotion bundle');
  }

  const gates = deepFreeze(Object.fromEntries(PROMOTION_GATE_NAMES.map((gateName) => [
    gateName,
    issuer.issue({
      gateName,
      candidateSha256: prepared.candidateSha256,
      moduleSha256: prepared.moduleSha256,
      dependencyClosureSha256: prepared.dependencyClosureSha256,
      resultSha256: bundle.bundleSha256,
      passed: results[gateName].passed,
    }),
  ])));
  const output = {
    schemaVersion: 1,
    evaluatorVersion: PROMOTION_GATE_EVALUATOR_VERSION,
    candidate: {
      kind: prepared.kind,
      candidateSha256: prepared.candidateSha256,
      moduleSha256: prepared.moduleSha256,
      dependencyClosureSha256: prepared.dependencyClosureSha256,
      evidenceSha256: bundle.bundleSha256,
    },
    bundle,
    gates,
  };
  assertPublicArtifact(output);
  return deepFreeze(output);
}

/** Create the exact hash-only bundle expected from a trusted reconstruction runner. */
export function createReconstructionEvidenceBundle(value = {}) {
  const candidate = normalizeEvidenceCandidate(value);
  const cases = normalizeEvidenceCases(value.cases);
  const body = {
    schemaVersion: RECONSTRUCTION_EVIDENCE_VERSION,
    evaluatorVersion: PROMOTION_GATE_EVALUATOR_VERSION,
    candidateSha256: candidate.candidateSha256,
    moduleSha256: candidate.moduleSha256,
    dependencyClosureSha256: candidate.dependencyClosureSha256,
    candidateKind: candidate.candidateKind,
    datasetSha256: requireHash(value.datasetSha256, 'datasetSha256'),
    corpusSha256: requireHash(value.corpusSha256, 'corpusSha256'),
    cases,
    caseSetSha256: sha256(stableStringify(cases)),
  };
  assertPublicArtifact(body);
  return deepFreeze({ ...body, bundleSha256: sha256(stableStringify(body)) });
}

/**
 * Load a final issuer and, when configured, a separate evidence verifier from
 * the repository-local `.env`. Provider API keys are never considered.
 */
export async function loadPromotionGateCapabilitiesFile(filePath, options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const filename = assertLocalProviderEnvFile(filePath ?? defaultCut3EnvFile(cwd), cwd);
  const text = await fs.readFile(filename, 'utf8');
  const parsed = parseEnv(text, [
    ...FINAL_SECRET_NAMES,
    ...FINAL_AUTHORITY_NAMES,
    ...EVIDENCE_SECRET_NAMES,
    ...EVIDENCE_AUTHORITY_NAMES,
  ]);
  const finalSecret = firstConfigured(parsed, FINAL_SECRET_NAMES);
  const finalAuthorityId = firstConfigured(parsed, FINAL_AUTHORITY_NAMES);
  if (!finalSecret || !finalAuthorityId) throw new Error('final promotion gate issuer is not configured');
  const issuer = createPromotionGateIssuer({ authorityId: finalAuthorityId, secret: finalSecret });

  const evidenceSecret = firstConfigured(parsed, EVIDENCE_SECRET_NAMES);
  const evidenceAuthorityId = firstConfigured(parsed, EVIDENCE_AUTHORITY_NAMES);
  if (Boolean(evidenceSecret) !== Boolean(evidenceAuthorityId)) {
    throw new Error('evidence verifier configuration is incomplete');
  }
  if (evidenceSecret && evidenceSecret === finalSecret) {
    throw new Error('evidence verifier HMAC secret must differ from the final gate issuer');
  }
  const evidenceVerifier = evidenceSecret
    ? createPromotionGateVerifier({ authorityId: evidenceAuthorityId, secret: evidenceSecret })
    : null;
  if (evidenceVerifier?.authorityId === issuer.authorityId) {
    throw new Error('evidence authority must be distinct from the final gate issuer');
  }
  return Object.freeze({ issuer, evidenceVerifier });
}

async function prepareStagedCandidate(value, repositoryRoot, options) {
  const normalized = normalizeCandidate(value);
  let ast = null;
  let parseCode = null;
  try {
    ast = parseModule(normalized.moduleSource, normalized.source);
  } catch {
    parseCode = 'parse-error';
  }
  const moduleSha256 = sha256(normalized.moduleSource);
  const baseIdentity = {
    kind: normalized.kind,
    type: normalized.type,
    source: normalized.source,
    export: normalized.export,
    role: 'memory',
    moduleSha256,
  };
  const discovery = options.discovery ?? await discoverLibrary({
    rootDir: repositoryRoot,
    promotionLedger: options.promotionLedger,
    promotionLedgerFile: options.promotionLedgerFile,
  });
  const exported = ast ? findExportedClasses(ast) : [];
  const matching = exported.filter((entry) => (
    entry.exportName === normalized.export
      && readOwnStaticKind(entry.node) === normalized.kind
  ));
  const stagedEntries = exported.map((entry) => ({
    type: normalized.type,
    kind: readOwnStaticKind(entry.node),
    export: entry.exportName,
    className: entry.className,
    hasSuperClass: Boolean(entry.node.superClass),
    superClass: propertyName(entry.node.superClass),
    source: normalized.source,
    loc: entry.node.loc?.start ?? null,
  }));
  const stagedModule = {
    file: normalized.source,
    filename: normalized.source,
    source: normalized.moduleSource,
    ast,
    type: normalized.type,
    imports: ast ? collectStaticSpecifiers(ast) : [],
  };
  const virtualDiscovery = {
    ...discovery,
    modules: [
      ...discovery.modules.filter((module) => module.file !== normalized.source),
      stagedModule,
    ],
    dependencyModules: [
      ...(discovery.dependencyModules ?? discovery.modules)
        .filter((module) => module.file !== normalized.source),
      stagedModule,
    ],
    entries: [
      ...discovery.entries.filter((entry) => entry.source !== normalized.source),
      ...stagedEntries,
    ],
  };
  let dependencyClosureSha256;
  let dependencyClosureCode = null;
  try {
    dependencyClosureSha256 = buildDependencyClosure(
      virtualDiscovery,
      normalized.source,
    ).closureSha256;
  } catch {
    dependencyClosureCode = 'dependency-closure-unavailable';
    dependencyClosureSha256 = sha256(stableStringify({
      version: 0,
      moduleSha256,
      importSetSha256: sha256(stableStringify(
        stagedModule.imports.map((entry) => entry.value).sort(),
      )),
    }));
  }
  if (normalized.expectedDependencyClosureSha256
      && normalized.expectedDependencyClosureSha256 !== dependencyClosureSha256) {
    dependencyClosureCode = 'dependency-closure-mismatch';
  }
  const identity = {
    ...baseIdentity,
    dependencyClosureSha256,
  };
  const candidateSha256 = candidateRevisionSha256(identity);
  const currentModule = discovery.modules.find((module) => module.file === normalized.source);
  const currentEntry = discovery.entries.find((entry) => (
    entry.kind === normalized.kind
      && entry.type === normalized.type
      && entry.source === normalized.source
      && entry.export === normalized.export
  ));
  return {
    ...normalized,
    ast,
    parseCode,
    candidateClass: matching.length === 1 ? matching[0].node : null,
    matchingClasses: matching.length,
    moduleSha256,
    dependencyClosureSha256,
    dependencyClosureCode,
    candidateSha256,
    discovery,
    virtualDiscovery,
    currentModuleMatches: Boolean(
      currentEntry
        && currentModule
        && sha256(currentModule.source) === moduleSha256
    ),
  };
}

async function evaluateStaticGates(prepared, repositoryRoot, evidence = {}) {
  const module = await evaluateModuleGate(prepared, repositoryRoot);
  const atomicity = evaluateAtomicityGate(prepared);
  const authenticity = evaluateAuthenticityGate(prepared);
  const privacy = evaluatePrivacyGate(prepared, evidence.datasetText);
  return deepFreeze({ module, atomicity, authenticity, privacy });
}

async function evaluateModuleGate(prepared, repositoryRoot) {
  const violations = [];
  let evaluatedModules = 0;
  if (prepared.parseCode) violations.push(prepared.parseCode);
  if (prepared.dependencyClosureCode) violations.push(prepared.dependencyClosureCode);
  if (prepared.matchingClasses !== 1) violations.push('candidate-export-mismatch');
  if (prepared.ast) {
    const classNodes = [];
    walkAst(prepared.ast.program, (node) => {
      if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') classNodes.push(node);
    });
    if (classNodes.length !== 1) violations.push('candidate-module-must-contain-one-class');
    const report = verifyDiscovery(prepared.virtualDiscovery);
    report.errors.forEach((error) => violations.push(error.code));
    if (prepared.discovery.promotion?.ok !== true) violations.push('promotion-ledger-invalid');
    inspectTopLevelPurity(prepared.ast, violations);
    inspectForbiddenRuntime(prepared.ast, violations);
    inspectConstructorContract(prepared, violations);
    evaluatedModules = await inspectStaticDependencies(prepared, repositoryRoot, violations);
  }
  const normalized = [...new Set(violations)].sort();
  return gateResult(normalized.length === 0, normalized.length === 0 ? 'ok' : normalized[0], {
    violations: normalized.length,
    violationSetSha256: sha256(stableStringify(normalized)),
    currentModuleMatches: prepared.currentModuleMatches,
    evaluatedModules,
  });
}

function evaluateAtomicityGate(prepared) {
  if (!prepared.candidateClass) {
    return gateResult(false, 'candidate-class-unavailable', atomicityDetails([], ['candidate-class-unavailable']));
  }
  const writes = [];
  const violations = [];
  walkAst(prepared.candidateClass, (node) => {
    if (node.type === 'VariableDeclarator' && isThisUnit(node.init)) {
      violations.push('unit-alias');
    }
    if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') {
      const target = node.type === 'AssignmentExpression' ? node.left : node.argument;
      const channel = unitMemberChannel(target);
      if (channel) writes.push(channel);
      else if (containsThisUnit(target)) violations.push('dynamic-unit-channel');
      if (node.type === 'AssignmentExpression'
          && isThisUnit(node.right)
          && !containsThisUnit(target)) {
        violations.push('unit-alias');
      }
    }
    if (node.type === 'UnaryExpression' && node.operator === 'delete') {
      const channel = unitMemberChannel(node.argument);
      if (channel) {
        writes.push(channel);
        violations.push('delete-unit-channel');
      }
    }
    if (node.type !== 'CallExpression') return;
    const receivesUnit = (node.arguments ?? []).some(isThisUnit);
    const mutatesUnitMember = unitMemberChannel(node.callee?.object) !== null;
    if (!receivesUnit && !mutatesUnitMember) return;
    const helper = node.callee?.type === 'Identifier' ? node.callee.name : null;
    if (Object.hasOwn(CANONICAL_WRITERS, helper)
        && canonicalWriterImport(prepared, helper)) {
      const name = literalString(node.arguments[1]);
      if (!name) violations.push('dynamic-unit-channel');
      else writes.push(`${helper === 'writeTransform' ? 'transform' : 'filter'}.${name}`);
      return;
    }
    violations.push('unknown-unit-mutation');
  });
  inspectUnitAndInstanceAccesses(prepared, violations);

  const channels = [...new Set(writes)].sort();
  if (prepared.type === 'unit') {
    if (writes.length > 0 || violations.length > 0) violations.push('unit-contains-behaviour-write');
  } else {
    if (channels.length === 0) violations.push('behaviour-has-no-visual-write');
    if (channels.length > 1) violations.push('combined-behaviour-write');
    if (channels.some((channel) => !ALLOWED_BEHAVIOUR_CHANNELS.test(channel))) {
      violations.push('non-atomic-visual-channel');
    }
  }
  const normalized = [...new Set(violations)].sort();
  return gateResult(normalized.length === 0, normalized.length === 0 ? 'ok' : normalized[0],
    atomicityDetails(channels, normalized));
}

function atomicityDetails(channels, violations) {
  return {
    channels: channels.length,
    channelSetSha256: sha256(stableStringify(channels)),
    violations: violations.length,
    violationSetSha256: sha256(stableStringify(violations)),
  };
}

/**
 * Reject classes which merely expose a renderer/mechanism as a different
 * class name.  This gate deliberately proves only architectural non-thinness;
 * reconstruction evidence and human feedback remain the authorities for the
 * usefulness and taste of the visual motif.
 */
function evaluateAuthenticityGate(prepared) {
  const violations = [];
  const facts = {
    authoredVisualDecisions: 0,
    authoredTemporalLaw: false,
    frameDriven: false,
    internalUnitNodes: 0,
    temporalOperations: 0,
    treeDepth: 0,
  };
  if (!prepared.candidateClass) {
    violations.push('candidate-class-unavailable');
  } else {
    if (candidateLibraryRole(prepared) === 'infrastructure') {
      violations.push('foundation-kind-not-memory');
    }
    inspectOpenStyleInputs(prepared.candidateClass, violations);
    inspectRendererState(prepared.candidateClass, violations);
    if (prepared.type === 'unit') inspectAuthenticUnit(prepared, facts, violations);
    else inspectAuthenticBehaviour(prepared, facts, violations);
  }

  const normalized = [...new Set(violations)].sort();
  const priorities = [
    'candidate-class-unavailable',
    'foundation-kind-not-memory',
    'open-style-input',
    'renderer-state-in-memory-class',
    'generic-channel-adapter',
    'signal-forwarder',
    'behaviour-not-frame-driven',
    'temporal-law-not-authored',
    'temporal-signature-too-thin',
    'unit-tree-unprovable',
    'unit-tree-too-small',
    'unit-tree-too-shallow',
    'orphan-unit-node',
    'multi-parent-unit-node',
    'behaviour-owner-mismatch',
    'insufficient-authored-visual-decisions',
  ];
  const primary = priorities.find((code) => normalized.includes(code)) ?? normalized[0] ?? 'ok';
  return gateResult(normalized.length === 0, primary, {
    authoredVisualDecisions: facts.authoredVisualDecisions,
    authoredTemporalLaw: facts.authoredTemporalLaw,
    frameDriven: facts.frameDriven,
    internalUnitNodes: facts.internalUnitNodes,
    temporalOperations: facts.temporalOperations,
    treeDepth: facts.treeDepth,
    violations: normalized.length,
    violationSetSha256: sha256(stableStringify(normalized)),
  });
}

function candidateLibraryRole(prepared) {
  const entry = prepared.discovery?.publicEntries?.find((candidate) => (
    candidate.kind === prepared.kind
      && candidate.type === prepared.type
      && candidate.source === prepared.source
      && candidate.export === prepared.export
  ));
  return entry?.role ?? null;
}

function inspectOpenStyleInputs(classNode, violations) {
  const constructor = classNode.body.body.find((member) => (
    member.type === 'ClassMethod' && member.kind === 'constructor'
  ));
  if (!constructor) return;
  const names = [];
  constructor.params.forEach((parameter) => collectPatternNames(parameter, names));
  if (names.some((name) => OPEN_STYLE_INPUT.test(name))) violations.push('open-style-input');
}

function collectPatternNames(node, names) {
  if (!node) return;
  if (node.type === 'Identifier') {
    names.push(node.name);
    return;
  }
  if (node.type === 'AssignmentPattern') {
    collectPatternNames(node.left, names);
    return;
  }
  if (node.type === 'RestElement') {
    collectPatternNames(node.argument, names);
    return;
  }
  if (node.type === 'ObjectPattern') {
    for (const property of node.properties) {
      if (property.type === 'RestElement') collectPatternNames(property.argument, names);
      else {
        const key = propertyName(property.key);
        if (key) names.push(key);
        collectPatternNames(property.value, names);
      }
    }
    return;
  }
  if (node.type === 'ArrayPattern') node.elements.forEach((entry) => collectPatternNames(entry, names));
}

function inspectRendererState(classNode, violations) {
  walkAst(classNode, (node) => {
    if ((node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression')
        && node.object?.type === 'ThisExpression'
        && RENDER_STATE_FIELD.test(propertyName(node.property) ?? '')) {
      violations.push('renderer-state-in-memory-class');
    }
  });
}

function inspectAuthenticUnit(prepared, facts, violations) {
  const constructor = prepared.candidateClass.body.body.find((member) => (
    member.type === 'ClassMethod' && member.kind === 'constructor'
  ));
  if (!constructor) {
    violations.push('unit-tree-unprovable');
    return;
  }
  const child = constructor.params[0];
  const childName = child?.type === 'Identifier' ? child.name : null;
  if (!childName) violations.push('unit-tree-unprovable');
  const imports = importedClassBindings(prepared);
  const nodes = new Map();
  const variables = new Map();
  walkAst(constructor.body, (node) => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier'
        && node.init?.type === 'NewExpression' && isImportedUnit(node.init, imports)) {
      variables.set(node.id.name, node.init);
    }
    if (node.type === 'NewExpression' && isImportedUnit(node, imports)) {
      nodes.set(astNodeId(node), node);
    }
  });

  const superCall = findSuperCall(constructor);
  const root = resolveUnitExpression(superCall?.arguments?.[0], variables, imports, childName);
  if (!root || root.external) {
    violations.push('unit-tree-unprovable');
    return;
  }

  const graph = new Map();
  for (const [id, node] of nodes) {
    const children = [];
    for (const argument of node.arguments ?? []) {
      collectUnitExpressions(argument, variables, imports, childName, children);
    }
    graph.set(id, uniqueUnitReferences(children));
  }
  const parentCounts = new Map();
  for (const children of graph.values()) {
    for (const childReference of children) {
      parentCounts.set(
        childReference.id,
        (parentCounts.get(childReference.id) ?? 0) + 1,
      );
    }
  }
  if ([...parentCounts.values()].some((count) => count > 1)) {
    violations.push('multi-parent-unit-node');
  }
  const reachable = new Set();
  const active = new Set();
  const traversal = { cycle: false, externalChild: false };
  const depth = visitStaticUnitGraph(root, graph, reachable, active, traversal);
  facts.internalUnitNodes = reachable.size;
  facts.treeDepth = depth;
  facts.authoredVisualDecisions = countAuthoredVisualDecisions(reachable, nodes);
  if (traversal.cycle || !traversal.externalChild) violations.push('unit-tree-unprovable');
  if (reachable.size < 2) violations.push('unit-tree-too-small');
  if (depth < 2) violations.push('unit-tree-too-shallow');
  if ([...nodes.keys()].some((id) => !reachable.has(id))) violations.push('orphan-unit-node');
  if (facts.authoredVisualDecisions < 2) {
    violations.push('insufficient-authored-visual-decisions');
  }
  inspectBehaviourOwners(constructor, imports, violations);
}

function importedClassBindings(prepared) {
  const bindings = new Map();
  for (const statement of prepared.ast?.program?.body ?? []) {
    if (statement.type !== 'ImportDeclaration') continue;
    const resolved = path.posix.normalize(path.posix.join(
      path.posix.dirname(prepared.source), statement.source.value,
    ));
    for (const specifier of statement.specifiers ?? []) {
      if (specifier.local?.name) bindings.set(specifier.local.name, resolved);
    }
  }
  return bindings;
}

function isImportedUnit(node, imports) {
  return node?.callee?.type === 'Identifier'
    && /^units\//u.test(imports.get(node.callee.name) ?? '');
}

function isImportedBehaviour(node, imports) {
  return node?.callee?.type === 'Identifier'
    && /^behaviours\//u.test(imports.get(node.callee.name) ?? '');
}

function astNodeId(node) {
  return `${node.start ?? 'x'}:${node.end ?? 'x'}`;
}

function findSuperCall(constructor) {
  let found = null;
  walkAst(constructor.body, (node) => {
    if (!found && node.type === 'CallExpression' && node.callee?.type === 'Super') found = node;
  });
  return found;
}

function resolveUnitExpression(node, variables, imports, childName) {
  if (!node) return null;
  if (node.type === 'NewExpression' && isImportedUnit(node, imports)) {
    return { id: astNodeId(node), external: false };
  }
  if (node.type === 'Identifier' && variables.has(node.name)) {
    return { id: astNodeId(variables.get(node.name)), external: false };
  }
  if (node.type === 'Identifier' && childName && node.name === childName) {
    return { id: `parameter:${node.name}`, external: true };
  }
  return null;
}

function collectUnitExpressions(node, variables, imports, childName, output) {
  const direct = resolveUnitExpression(node, variables, imports, childName);
  if (direct) {
    output.push(direct);
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (node.type === 'ObjectExpression') return;
  if (Array.isArray(node)) {
    node.forEach((entry) => collectUnitExpressions(entry, variables, imports, childName, output));
    return;
  }
  if (node.type === 'ArrayExpression') {
    node.elements.forEach((entry) => collectUnitExpressions(entry, variables, imports, childName, output));
  }
}

function uniqueUnitReferences(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

function visitStaticUnitGraph(reference, graph, reachable, active, traversal) {
  if (reference.external) {
    traversal.externalChild = true;
    return 1;
  }
  if (active.has(reference.id)) {
    traversal.cycle = true;
    return 0;
  }
  if (reachable.has(reference.id)) return 1;
  reachable.add(reference.id);
  active.add(reference.id);
  const children = graph.get(reference.id) ?? [];
  const childDepth = children.length === 0
    ? 0
    : Math.max(...children.map((child) => (
      visitStaticUnitGraph(child, graph, reachable, active, traversal)
    )));
  active.delete(reference.id);
  return 1 + childDepth;
}

function countAuthoredVisualDecisions(reachable, nodes) {
  const decisions = new Set();
  const visualKey = /(?:accent|align|background|blur|border|color|fill|fit|font|gap|gradient|height|inset|layout|opacity|padding|radius|shadow|size|spacing|stroke|tone|transform|weight|width)/iu;
  for (const id of reachable) {
    const node = nodes.get(id);
    walkAst(node, (nested) => {
      if (nested.type !== 'ObjectProperty') return;
      const key = propertyName(nested.key);
      if (!key || !visualKey.test(key) || !isAuthoredValue(nested.value)) return;
      decisions.add(`${nested.start ?? 'x'}:${nested.end ?? 'x'}:${key}`);
    });
  }
  return decisions.size;
}

function isAuthoredValue(node) {
  if (!node) return false;
  if (['BooleanLiteral', 'NumericLiteral', 'StringLiteral'].includes(node.type)) return true;
  if (node.type === 'UnaryExpression' && node.argument?.type === 'NumericLiteral') return true;
  if (node.type === 'ArrayExpression') return node.elements.some(isAuthoredValue);
  if (node.type === 'ObjectExpression') return node.properties.some((property) => (
    property.type === 'ObjectProperty' && isAuthoredValue(property.value)
  ));
  return false;
}

function inspectBehaviourOwners(constructor, imports, violations) {
  walkAst(constructor.body, (node) => {
    if (node.type !== 'CallExpression' || node.callee?.type !== 'MemberExpression') return;
    const method = propertyName(node.callee.property);
    if (!['add', 'addBehaviour'].includes(method)) return;
    const owner = node.callee.object?.type === 'Identifier' ? node.callee.object.name : null;
    for (const argument of node.arguments ?? []) {
      if (argument?.type !== 'NewExpression' || !isImportedBehaviour(argument, imports)) continue;
      const bound = argument.arguments?.[0]?.type === 'Identifier'
        ? argument.arguments[0].name : null;
      if (!owner || bound !== owner) violations.push('behaviour-owner-mismatch');
    }
  });
}

function inspectAuthenticBehaviour(prepared, facts, violations) {
  const onFrame = prepared.candidateClass.body.body.find((member) => (
    member.type === 'ClassMethod' && propertyName(member.key) === 'onFrame'
  ));
  if (!onFrame) {
    violations.push('behaviour-not-frame-driven');
    return;
  }
  const constants = new Set();
  let branches = 0;
  let helperForwarders = 0;
  let operations = 0;
  walkAst(onFrame.body, (node) => {
    if (['BinaryExpression', 'LogicalExpression', 'UnaryExpression', 'UpdateExpression'].includes(node.type)) {
      operations += 1;
    }
    if (node.type === 'ConditionalExpression' || node.type === 'IfStatement'
        || node.type === 'SwitchStatement') branches += 1;
    if (node.type === 'NumericLiteral') constants.add(node.value);
    if (node.type === 'CallExpression') {
      const name = propertyName(node.callee) ?? propertyName(node.callee?.property);
      if (THIN_BEHAVIOUR_HELPERS.has(name)) helperForwarders += 1;
      if (node.callee?.type === 'MemberExpression'
          && node.callee.object?.type === 'Identifier'
          && node.callee.object.name === 'Math') operations += 1;
    }
  });
  const frameProfile = behaviourFrameProfile(onFrame, prepared);
  facts.frameDriven = frameProfile.frameDriven;
  facts.authoredTemporalLaw = frameProfile.authoredTemporalLaw;
  facts.temporalOperations = operations + branches;
  if (helperForwarders > 0) violations.push('signal-forwarder');
  if (!facts.frameDriven) violations.push('behaviour-not-frame-driven');
  if (facts.frameDriven && !facts.authoredTemporalLaw) {
    violations.push('temporal-law-not-authored');
  }
  if (facts.temporalOperations < 3 || constants.size < 2) {
    violations.push('temporal-signature-too-thin');
  }
  const constructor = prepared.candidateClass.body.body.find((member) => (
    member.type === 'ClassMethod' && member.kind === 'constructor'
  ));
  if (constructor) {
    const names = [];
    constructor.params.slice(1).forEach((parameter) => collectPatternNames(parameter, names));
    if (names.some((name) => OPEN_STYLE_INPUT.test(name))) {
      violations.push('generic-channel-adapter');
    }
  }
}

function behaviourFrameProfile(onFrame, prepared) {
  const contextName = onFrame.params?.[0]?.type === 'Identifier'
    ? onFrame.params[0].name : null;
  if (!contextName) return { authoredTemporalLaw: false, frameDriven: false };
  const derived = new Set();
  const bindings = new Map();
  walkAst(onFrame.body, (node) => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.init) {
      bindings.set(node.id.name, node.init);
    }
  });
  let changed = true;
  while (changed) {
    changed = false;
    walkAst(onFrame.body, (node) => {
      if (node.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier'
          || derived.has(node.id.name)) return;
      if (expressionDependsOnFrame(node.init, derived, prepared, contextName)) {
        derived.add(node.id.name);
        changed = true;
      }
    });
  }

  const writes = [];
  walkAst(onFrame.body, (node) => {
    if (node.type === 'AssignmentExpression' && unitMemberChannel(node.left)) {
      writes.push(node.right);
      return;
    }
    if (node.type !== 'CallExpression') return;
    const helper = node.callee?.type === 'Identifier' ? node.callee.name : null;
    if (!Object.hasOwn(CANONICAL_WRITERS, helper) || !canonicalWriterImport(prepared, helper)) return;
    writes.push(node.arguments.at(-1));
  });
  const frameDriven = writes.some((expression) => (
    expressionDependsOnFrame(expression, derived, prepared, contextName)
  ));
  const authoredTemporalLaw = writes.some((expression) => expressionHasAuthoredTemporalLaw(
    expression,
    bindings,
    derived,
    prepared,
    contextName,
    new Set(),
  ));
  return { authoredTemporalLaw, frameDriven };
}

function expressionHasAuthoredTemporalLaw(
  node,
  bindings,
  derived,
  prepared,
  contextName,
  visiting,
) {
  if (!node) return false;
  if (node.type === 'Identifier' && bindings.has(node.name)) {
    if (visiting.has(node.name)) return false;
    visiting.add(node.name);
    const result = expressionHasAuthoredTemporalLaw(
      bindings.get(node.name), bindings, derived, prepared, contextName, visiting,
    );
    visiting.delete(node.name);
    return result;
  }
  if (node.type === 'BinaryExpression') {
    const leftDerived = expressionDependsOnFrame(node.left, derived, prepared, contextName);
    const rightDerived = expressionDependsOnFrame(node.right, derived, prepared, contextName);
    if ((node.operator === '*' && leftDerived && rightDerived)
        || (['**', '%'].includes(node.operator) && (leftDerived || rightDerived))) {
      return true;
    }
  }
  if ((node.type === 'ConditionalExpression' || node.type === 'IfStatement')
      && expressionDependsOnFrame(node.test, derived, prepared, contextName)) {
    return true;
  }
  if (node.type === 'CallExpression'
      && node.callee?.type === 'MemberExpression'
      && node.callee.object?.type === 'Identifier'
      && node.callee.object.name === 'Math'
      && /^(?:abs|acos|asin|atan|atan2|ceil|cos|exp|floor|log|pow|round|sign|sin|sqrt|tan|trunc)$/u
        .test(propertyName(node.callee.property) ?? '')
      && node.arguments.some((argument) => (
        expressionDependsOnFrame(argument, derived, prepared, contextName)
      ))) {
    return true;
  }
  let authored = false;
  for (const [key, value] of Object.entries(node)) {
    if (authored || ['loc', 'start', 'end', 'extra'].includes(key)) continue;
    if (Array.isArray(value)) {
      authored = value.some((entry) => entry && typeof entry === 'object'
        && expressionHasAuthoredTemporalLaw(
          entry, bindings, derived, prepared, contextName, visiting,
        ));
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      authored = expressionHasAuthoredTemporalLaw(
        value, bindings, derived, prepared, contextName, visiting,
      );
    }
  }
  return authored;
}

function expressionDependsOnFrame(node, derived, prepared, contextName) {
  let depends = false;
  walkAst(node, (nested) => {
    if (depends) return;
    if (nested.type === 'Identifier' && derived.has(nested.name)) {
      depends = true;
      return;
    }
    if (nested.type !== 'CallExpression'
        || nested.callee?.type !== 'Identifier'
        || nested.callee.name !== 'absoluteFrame'
        || nested.arguments?.[0]?.type !== 'Identifier'
        || nested.arguments[0].name !== contextName) return;
    depends = hasCanonicalImport(prepared, 'absoluteFrame', 'core/signals.js');
  });
  return depends;
}

function hasCanonicalImport(prepared, importedName, expectedSource) {
  return prepared.ast?.program?.body?.some((statement) => (
    statement.type === 'ImportDeclaration'
      && path.posix.normalize(path.posix.join(
        path.posix.dirname(prepared.source), statement.source.value,
      )) === expectedSource
      && statement.specifiers.some((specifier) => (
        specifier.type === 'ImportSpecifier'
          && propertyName(specifier.imported) === importedName
          && specifier.local?.name === importedName
      ))
  )) === true;
}

function evaluatePrivacyGate(prepared, datasetText) {
  const findings = [];
  const artifactFindings = inspectPublicArtifact(publicCandidateIdentity(prepared));
  artifactFindings.forEach((finding) => findings.push(finding.code));
  if (prepared.ast) inspectModuleLiterals(prepared.ast, prepared, findings);
  if (SECRET.test(prepared.moduleSource)) findings.push('secret-like-token');
  if (typeof datasetText === 'string') {
    const corpusLiterals = sensitiveCorpusLiterals(datasetText);
    const stagedLiterals = moduleRuntimeLiterals(prepared.ast);
    if (stagedLiterals.some((literal) => corpusLiterals.has(literal))) {
      findings.push('dataset-literal-copy');
    }
  }
  const normalized = [...new Set(findings)].sort();
  const primary = [
    'secret-like-token',
    'raw-network-identifier',
    'dataset-literal-copy',
    'free-text-literal',
  ].find((code) => normalized.includes(code)) ?? normalized[0];
  return gateResult(normalized.length === 0, normalized.length === 0 ? 'ok' : primary, {
    findings: normalized.length,
    findingSetSha256: sha256(stableStringify(normalized)),
  });
}

async function evaluateLocalEvidence(datasetText, prepared, staticEvaluation, repositoryRoot) {
  let bundle;
  let profileMetrics = null;
  let failureCode = null;
  try {
    const corpus = buildCorpusCensus(datasetText);
    const ingested = ingestCompositionTracks(datasetText);
    const dataset = parseWorkspaceDataset(datasetText);
    const workspaceByLineIndex = new Map(
      dataset.workspaces.map((workspace) => [workspace.lineIndex, workspace]),
    );
    const assignmentByWorkspaceKey = new Map(
      dataset.workspaces.map((workspace) => [workspace.workspaceKey, 'heldout']),
    );
    const navigationIndex = buildNavigationIndex(prepared.discovery);
    const indexReport = validateNavigationIndex(navigationIndex);
    profileMetrics = evaluateCbaProfile(dataset, { assignmentByWorkspaceKey }, {
      features: CBA_V2_FEATURE_DEFAULTS,
    }, {
      splits: ['heldout'],
      libraryVerified: verifyDiscovery(prepared.discovery).ok,
      promotionVerified: prepared.discovery.promotion?.ok === true,
      indexVerified: indexReport.ok,
      indexedKinds: new Set(navigationIndex.entries.map(({ kind }) => kind)),
    });
    const cases = ingested.compositions.map((composition) => evaluateLocalCase(
      composition,
      prepared,
      workspaceByLineIndex,
    ));
    if (cases.length !== corpus.counts.compositions) throw new Error('census-case-count-mismatch');
    bundle = createReconstructionEvidenceBundle({
      candidateSha256: prepared.candidateSha256,
      moduleSha256: prepared.moduleSha256,
      dependencyClosureSha256: prepared.dependencyClosureSha256,
      candidateKind: prepared.kind,
      datasetSha256: sha256(datasetText),
      corpusSha256: corpus.censusSha256,
      cases,
    });
  } catch (error) {
    failureCode = safeEvaluationCode(error);
    bundle = emptyEvidenceBundle(prepared, sha256(String(datasetText)), failureCode);
  }

  const summaries = evidenceGateSummaries(bundle);
  const profileExact = Boolean(
    profileMetrics
      && profileMetrics.cases === bundle.cases.length
      && profileMetrics.treeExact
      && profileMetrics.compileFailures === 0
      && profileMetrics.renderErrorFrames === 0
      && profileMetrics.matchedFrames === profileMetrics.frames
  );
  const integrated = prepared.currentModuleMatches;
  const compilerPassed = !failureCode && integrated && profileExact && summaries.compiler.passed;
  let compilerCode = 'ok';
  if (!compilerPassed) {
    if (failureCode) compilerCode = failureCode;
    else if (!integrated) compilerCode = 'candidate-module-not-integrated';
    else if (!profileExact) compilerCode = 'profile-fidelity-failed';
    else compilerCode = summaries.compiler.code;
  }
  const reconstructionPassed = compilerPassed && summaries.reconstruction.passed;
  return {
    mode: 'local-integrated',
    bundle,
    evidenceAuthorityId: null,
    attestationSetSha256: sha256('local-integrated-evidence'),
    compilerFidelity: gateResult(compilerPassed, compilerCode, summaries.compiler.details),
    reconstruction: gateResult(
      reconstructionPassed,
      reconstructionPassed ? 'ok' : summaries.reconstruction.code,
      summaries.reconstruction.details,
    ),
  };
}

function evaluateAttestedEvidence(value, attestations, prepared, finalIssuer, verifier) {
  let bundle;
  let bundleCode = null;
  try {
    bundle = validateReconstructionEvidenceBundle(value, prepared);
  } catch (error) {
    bundleCode = safeEvidenceCode(error);
    bundle = emptyEvidenceBundle(prepared, '0'.repeat(64), bundleCode);
  }
  const summaries = evidenceGateSummaries(bundle);
  const attestationShapeValid = exactKeySet(attestations, [
    'compilerFidelity',
    'reconstruction',
  ]);
  const distinctAuthority = attestationShapeValid
    && isPromotionGateVerifier(verifier)
    && verifier.authorityId !== finalIssuer.authorityId;
  const compilerAttestation = distinctAuthority
    ? verifyEvidenceAttestation(verifier, attestations?.compilerFidelity, 'compilerFidelity', prepared, bundle)
    : null;
  const reconstructionAttestation = distinctAuthority
    ? verifyEvidenceAttestation(verifier, attestations?.reconstruction, 'reconstruction', prepared, bundle)
    : null;
  const compilerPassed = !bundleCode && summaries.compiler.passed
    && compilerAttestation?.passed === true;
  const reconstructionPassed = !bundleCode && summaries.reconstruction.passed
    && reconstructionAttestation?.passed === true;
  const evidenceAuthorityId = compilerAttestation?.authorityId === reconstructionAttestation?.authorityId
    ? compilerAttestation?.authorityId ?? null
    : null;
  const attestationSetSha256 = sha256(stableStringify([
    compilerAttestation?.receiptSha256 ?? null,
    reconstructionAttestation?.receiptSha256 ?? null,
  ]));
  let compilerCode = 'ok';
  if (!compilerPassed) {
    if (bundleCode) compilerCode = bundleCode;
    else if (!distinctAuthority) compilerCode = 'evidence-authority-required';
    else if (!compilerAttestation) compilerCode = 'compiler-attestation-invalid';
    else compilerCode = summaries.compiler.code;
  }
  let reconstructionCode = 'ok';
  if (!reconstructionPassed) {
    if (bundleCode) reconstructionCode = bundleCode;
    else if (!distinctAuthority) reconstructionCode = 'evidence-authority-required';
    else if (!reconstructionAttestation) reconstructionCode = 'reconstruction-attestation-invalid';
    else reconstructionCode = summaries.reconstruction.code;
  }
  return {
    mode: 'external-attested',
    bundle,
    evidenceAuthorityId,
    attestationSetSha256,
    compilerFidelity: gateResult(
      compilerPassed,
      compilerCode,
      summaries.compiler.details,
    ),
    reconstruction: gateResult(
      reconstructionPassed,
      reconstructionCode,
      summaries.reconstruction.details,
    ),
  };
}

function evidenceGateSummaries(bundle) {
  const cases = bundle.cases;
  const candidateCases = cases.filter((item) => item.candidateObserved);
  const frames = sum(cases, 'frames');
  const matchedFrames = sum(cases, 'matchedFrames');
  const compilerPassed = cases.length > 0
    && candidateCases.length > 0
    && cases.every((item) => item.compilerGenerated
      && item.compilerPublishable
      && item.matchedFrames === item.frames
      && item.baselineRenderErrors === 0
      && item.generatedRenderErrors === 0
      && item.invalidBehaviourOwners === 0
      && item.unsupportedEffects === 0);
  const compilerCode = cases.length === 0
    ? 'reconstruction-evidence-empty'
    : candidateCases.length === 0
      ? 'candidate-not-observed'
      : compilerPassed ? 'ok' : 'fidelity-not-exact';

  const witnesses = candidateCases.filter((item) => item.graphExact
    && item.candidateModuleImported
    && item.compilerGenerated
    && item.compilerPublishable
    && item.matchedFrames === item.frames
    && item.baselineRenderErrors === 0
    && item.generatedRenderErrors === 0
    && item.nativeUnits === 0
    && item.localBehaviours === 0
    && item.residualVisualComputations === 0
    && item.invalidBehaviourOwners === 0
    && item.unsupportedEffects === 0);
  const witnessWorkspaces = new Set(witnesses.map((item) => item.workspaceSha256));
  const reconstruction = reconstructionFromCases(witnesses);
  const reconstructionPassed = witnesses.length >= 2
    && witnessWorkspaces.size >= 2
    && reconstruction.semanticOneToOneVerified;
  const reconstructionCode = witnesses.length < 2
    ? 'insufficient-exact-witnesses'
    : witnessWorkspaces.size < 2
      ? 'insufficient-independent-workspaces'
      : reconstruction.semanticOneToOneVerified ? 'ok' : 'semantic-reconstruction-failed';
  return {
    compiler: {
      passed: compilerPassed,
      code: compilerCode,
      details: {
        cases: cases.length,
        candidateCases: candidateCases.length,
        frames,
        matchedFrames,
        caseSetSha256: bundle.caseSetSha256,
      },
    },
    reconstruction: {
      passed: reconstructionPassed,
      code: reconstructionCode,
      details: {
        witnessCases: witnesses.length,
        witnessWorkspaces: witnessWorkspaces.size,
        frames: sum(witnesses, 'frames'),
        matchedFrames: sum(witnesses, 'matchedFrames'),
        receiptSetSha256: reconstruction.receiptSetSha256,
        reconstructionSha256: reconstruction.reconstructionSha256,
      },
    },
  };
}

function evaluateLocalCase(composition, prepared, workspaceByLineIndex) {
  const video = {
    fps: composition.fps,
    width: composition.width,
    height: composition.height,
    lengthMs: composition.lengthMs,
  };
  const expectedFrames = Math.max(1, Math.ceil(video.lengthMs / 1000 * video.fps));
  const identity = {
    workspaceSha256: workspaceByLineIndex.get(composition.workspaceIndex)?.fingerprint
      ?? sha256(`workspace:${composition.workspaceIndex}`),
    compositionSha256: sha256(composition.source),
    videoSha256: sha256(stableStringify(video)),
  };
  const caseSha256 = sha256(stableStringify({
    ...identity,
    workspaceOccurrence: composition.workspaceIndex,
    trackIndex: composition.trackIndex,
    selectedIndex: composition.selectedIndex,
  }));
  try {
    const compiled = compileCompositionV2(composition.source, {
      features: CBA_V2_FEATURE_DEFAULTS,
    });
    const verification = verifyCompositionV2(compiled, video);
    const kinds = new Set([
      ...verification.publicUnitKinds,
      ...verification.publicBehaviourKinds,
    ]);
    const candidateObserved = kinds.has(prepared.kind);
    return normalizeEvidenceCase({
      caseSha256,
      ...identity,
      frames: verification.totalFrames,
      matchedFrames: verification.matchedFrames,
      candidateObserved,
      compilerGenerated: compiled.verification.generatedParse === true,
      compilerPublishable: compiled.verification.publishableEsm === true,
      candidateModuleImported: candidateObserved && prepared.currentModuleMatches,
      graphExact: candidateObserved
        && prepared.currentModuleMatches
        && verification.exact
        && compiled.verification.publishableEsm === true,
      baselineRenderErrors: verification.baselineRenderErrors,
      generatedRenderErrors: verification.generatedRenderErrors,
      nativeUnits: verification.maximumNativeUnits,
      localBehaviours: verification.maximumLocalBehaviours,
      residualVisualComputations: verification.sourceDependentVisualComputations,
      invalidBehaviourOwners: verification.invalidBehaviourOwners,
      unsupportedEffects: verification.unsupportedEffects.length,
    }, 0);
  } catch {
    return normalizeEvidenceCase({
      caseSha256,
      ...identity,
      frames: expectedFrames,
      matchedFrames: 0,
      candidateObserved: false,
      compilerGenerated: false,
      compilerPublishable: false,
      candidateModuleImported: false,
      graphExact: false,
      baselineRenderErrors: expectedFrames,
      generatedRenderErrors: expectedFrames,
      nativeUnits: 0,
      localBehaviours: 0,
      residualVisualComputations: 0,
      invalidBehaviourOwners: 0,
      unsupportedEffects: 0,
    }, 0);
  }
}

function reconstructionFromCases(cases) {
  const census = {
    compositions: cases.map((item) => ({
      compositionKey: item.caseSha256,
      frameCount: item.frames,
      unitWitnesses: 0,
      residualUnitWitnesses: 0,
      behaviourWitnesses: 0,
      residualBehaviourWitnesses: 0,
    })),
  };
  const receipts = cases.map((item) => {
    const receiptBody = {
      caseSha256: item.caseSha256,
      compositionSha256: item.compositionSha256,
      frames: item.frames,
      matchedFrames: item.matchedFrames,
      graphExact: item.graphExact,
    };
    return {
      compositionKey: item.caseSha256,
      receiptSha256: sha256(stableStringify(receiptBody)),
      moduleEmitted: item.compilerGenerated,
      moduleImported: item.candidateModuleImported,
      graphExact: item.graphExact,
      semanticFrames: { compared: item.frames, matched: item.matchedFrames },
      residuals: {
        unitWitnesses: 0,
        behaviourWitnesses: 0,
        sourceDependentVisualComputations: 0,
        functionValuedConfigs: 0,
        rawExecutableAstNodes: 0,
      },
    };
  });
  return evaluateReconstructionReceipts(census, receipts);
}

function validateReconstructionEvidenceBundle(value, prepared) {
  exactKeys(value, [
    'schemaVersion',
    'evaluatorVersion',
    'candidateSha256',
    'moduleSha256',
    'dependencyClosureSha256',
    'candidateKind',
    'datasetSha256',
    'corpusSha256',
    'cases',
    'caseSetSha256',
    'bundleSha256',
  ], 'reconstruction bundle');
  if (value.schemaVersion !== RECONSTRUCTION_EVIDENCE_VERSION
      || value.evaluatorVersion !== PROMOTION_GATE_EVALUATOR_VERSION) {
    throw new Error('unsupported reconstruction bundle');
  }
  if (value.candidateSha256 !== prepared.candidateSha256
      || value.moduleSha256 !== prepared.moduleSha256
      || value.dependencyClosureSha256 !== prepared.dependencyClosureSha256
      || value.candidateKind !== prepared.kind) {
    throw new Error('reconstruction bundle candidate binding mismatch');
  }
  const rebuilt = createReconstructionEvidenceBundle(value);
  if (rebuilt.caseSetSha256 !== value.caseSetSha256
      || rebuilt.bundleSha256 !== value.bundleSha256) {
    throw new Error('reconstruction bundle hash mismatch');
  }
  return rebuilt;
}

function verifyEvidenceAttestation(verifier, receipt, gateName, prepared, bundle) {
  if (receipt?.resultSha256 !== bundle.bundleSha256 || receipt?.passed !== true) return null;
  return verifyPromotionGateReceipt(verifier, receipt, {
    gateName,
    candidateSha256: prepared.candidateSha256,
    moduleSha256: prepared.moduleSha256,
    dependencyClosureSha256: prepared.dependencyClosureSha256,
  });
}

function emptyEvidenceBundle(prepared, datasetSha256, code) {
  return createReconstructionEvidenceBundle({
    candidateSha256: prepared.candidateSha256,
    moduleSha256: prepared.moduleSha256,
    dependencyClosureSha256: prepared.dependencyClosureSha256,
    candidateKind: prepared.kind,
    datasetSha256: isHash(datasetSha256) ? datasetSha256 : '0'.repeat(64),
    corpusSha256: sha256(code ?? 'evidence-unavailable'),
    cases: [],
  });
}

function normalizeCandidate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('candidate must be an object');
  }
  if (!['unit', 'behaviour'].includes(value.type)) throw new TypeError('candidate.type is invalid');
  if (typeof value.kind !== 'string' || !KIND.test(value.kind)
      || !value.kind.startsWith(`${value.type}.`)) {
    throw new TypeError('candidate.kind is invalid');
  }
  const source = safeModuleSource(value.source, value.type);
  if (typeof value.export !== 'string' || !SAFE_EXPORT.test(value.export)) {
    throw new TypeError('candidate.export is invalid');
  }
  if (typeof value.moduleSource !== 'string'
      || value.moduleSource.length < 1
      || Buffer.byteLength(value.moduleSource, 'utf8') > 1_000_000) {
    throw new TypeError('candidate.moduleSource is invalid');
  }
  if (value.evidenceSha256 !== undefined) requireHash(value.evidenceSha256, 'candidate.evidenceSha256');
  const expectedDependencyClosureSha256 = value.dependencyClosureSha256 === undefined
    ? null
    : requireHash(value.dependencyClosureSha256, 'candidate.dependencyClosureSha256');
  return {
    kind: value.kind,
    type: value.type,
    source,
    export: value.export,
    moduleSource: value.moduleSource,
    expectedDependencyClosureSha256,
  };
}

function normalizeEvidenceCandidate(value) {
  return {
    candidateSha256: requireHash(value.candidateSha256, 'candidateSha256'),
    moduleSha256: requireHash(value.moduleSha256, 'moduleSha256'),
    dependencyClosureSha256: requireHash(
      value.dependencyClosureSha256,
      'dependencyClosureSha256',
    ),
    candidateKind: requireKind(value.candidateKind),
  };
}

function normalizeEvidenceCases(value) {
  if (!Array.isArray(value) || value.length > 10_000) {
    throw new TypeError('reconstruction cases must be an array of at most 10000 items');
  }
  const seen = new Set();
  const cases = value.map(normalizeEvidenceCase).sort((left, right) => (
    left.caseSha256.localeCompare(right.caseSha256)
  ));
  for (const item of cases) {
    if (seen.has(item.caseSha256)) throw new Error('reconstruction case ids must be unique');
    seen.add(item.caseSha256);
  }
  return cases;
}

function normalizeEvidenceCase(value, index) {
  exactKeys(value, [
    'caseSha256',
    'workspaceSha256',
    'compositionSha256',
    'videoSha256',
    'frames',
    'matchedFrames',
    'candidateObserved',
    'compilerGenerated',
    'compilerPublishable',
    'candidateModuleImported',
    'graphExact',
    'baselineRenderErrors',
    'generatedRenderErrors',
    'nativeUnits',
    'localBehaviours',
    'residualVisualComputations',
    'invalidBehaviourOwners',
    'unsupportedEffects',
  ], `reconstruction case ${index}`);
  const frames = positiveInteger(value.frames, 'frames');
  const matchedFrames = boundedCount(value.matchedFrames, frames, 'matchedFrames');
  const normalized = {
    caseSha256: requireHash(value.caseSha256, 'caseSha256'),
    workspaceSha256: requireHash(value.workspaceSha256, 'workspaceSha256'),
    compositionSha256: requireHash(value.compositionSha256, 'compositionSha256'),
    videoSha256: requireHash(value.videoSha256, 'videoSha256'),
    frames,
    matchedFrames,
    candidateObserved: requireBoolean(value.candidateObserved, 'candidateObserved'),
    compilerGenerated: requireBoolean(value.compilerGenerated, 'compilerGenerated'),
    compilerPublishable: requireBoolean(value.compilerPublishable, 'compilerPublishable'),
    candidateModuleImported: requireBoolean(value.candidateModuleImported, 'candidateModuleImported'),
    graphExact: requireBoolean(value.graphExact, 'graphExact'),
    baselineRenderErrors: boundedCount(value.baselineRenderErrors, frames, 'baselineRenderErrors'),
    generatedRenderErrors: boundedCount(value.generatedRenderErrors, frames, 'generatedRenderErrors'),
    nativeUnits: nonNegativeInteger(value.nativeUnits, 'nativeUnits'),
    localBehaviours: nonNegativeInteger(value.localBehaviours, 'localBehaviours'),
    residualVisualComputations: nonNegativeInteger(
      value.residualVisualComputations,
      'residualVisualComputations',
    ),
    invalidBehaviourOwners: nonNegativeInteger(value.invalidBehaviourOwners, 'invalidBehaviourOwners'),
    unsupportedEffects: nonNegativeInteger(value.unsupportedEffects, 'unsupportedEffects'),
  };
  if (normalized.compilerPublishable && !normalized.compilerGenerated) {
    throw new Error('publishable compiler evidence requires generated output');
  }
  if (normalized.candidateModuleImported && !normalized.candidateObserved) {
    throw new Error('candidate import evidence requires an observed candidate');
  }
  if (normalized.graphExact && (!normalized.candidateModuleImported
      || !normalized.compilerPublishable
      || normalized.matchedFrames !== normalized.frames
      || normalized.baselineRenderErrors !== 0
      || normalized.generatedRenderErrors !== 0)) {
    throw new Error('graph exact evidence is internally inconsistent');
  }
  return deepFreeze(normalized);
}

function inspectUnitAndInstanceAccesses(prepared, violations) {
  const inspectedUnitReferences = new WeakSet();
  traverse(prepared.ast, {
    MemberExpression(current) {
      inspectMemberPath(current, prepared, violations, inspectedUnitReferences);
    },
    OptionalMemberExpression(current) {
      inspectMemberPath(current, prepared, violations, inspectedUnitReferences);
    },
    ThisExpression(current) {
      if (insideStaticClassMember(current)) return;
      const parent = current.parentPath;
      if (isMemberPath(parent) && parent.node.object === current.node) {
        if (parent.node.computed && !isDirectUnitReference(parent.node)) {
          violations.push('dynamic-instance-access');
        }
        return;
      }
      if (parent?.isCallExpression()
          && parent.node.arguments[0] === current.node
          && isCanonicalImportedCall(parent, prepared, CANONICAL_INSTANCE_HELPERS)) {
        return;
      }
      violations.push('behaviour-instance-escape');
    },
  });
}

function inspectMemberPath(current, prepared, violations, inspectedUnitReferences) {
  const memberName = propertyName(current.node.property);
  if (['__proto__', 'constructor', 'prototype'].includes(memberName)) {
    violations.push('prototype-constructor-access');
  }
  if (current.node.object?.type === 'Identifier'
      && current.node.object.name === 'Math'
      && memberName === 'random'
      && !current.scope.getBinding('Math')) {
    violations.push('nondeterministic-global');
  }
  if (!isDirectUnitReference(current.node)
      || inspectedUnitReferences.has(current.node)
      || insideStaticClassMember(current)) {
    return;
  }
  inspectedUnitReferences.add(current.node);
  const top = topUnitAccessPath(current);
  const owner = top.parentPath;
  const channel = unitMemberChannel(top.node);
  if (owner?.isAssignmentExpression()
      && owner.node.left === top.node
      && owner.node.operator === '='
      && channel
      && ALLOWED_BEHAVIOUR_CHANNELS.test(channel)) {
    return;
  }
  if (top === current
      && owner?.isCallExpression()
      && owner.node.arguments[0] === current.node
      && isCanonicalImportedCall(owner, prepared, CANONICAL_WRITERS)) {
    return;
  }
  violations.push('unit-read-or-escape');
}

function topUnitAccessPath(start) {
  let current = start;
  while (isMemberPath(current.parentPath)
      && current.parentPath.node.object === current.node) {
    current = current.parentPath;
  }
  return current;
}

function isCanonicalImportedCall(callPath, prepared, allowed) {
  const callee = callPath.get('callee');
  if (!callee.isIdentifier() || !Object.hasOwn(allowed, callee.node.name)) return false;
  const binding = callPath.scope.getBinding(callee.node.name);
  if (!binding?.path?.isImportSpecifier()) return false;
  const declaration = binding.path.findParent((owner) => owner.isImportDeclaration());
  if (!declaration) return false;
  if (propertyName(binding.path.node.imported) !== callee.node.name
      || binding.path.node.local?.name !== callee.node.name) {
    return false;
  }
  const resolved = path.posix.normalize(path.posix.join(
    path.posix.dirname(prepared.source),
    declaration.node.source.value,
  ));
  return resolved === allowed[callee.node.name];
}

function isMemberPath(value) {
  return Boolean(value?.isMemberExpression?.() || value?.isOptionalMemberExpression?.());
}

function isDirectUnitReference(node) {
  return Boolean(
    (node?.type === 'MemberExpression' || node?.type === 'OptionalMemberExpression')
      && node.object?.type === 'ThisExpression'
      && propertyName(node.property) === 'unit'
  );
}

function insideStaticClassMember(current) {
  const member = current.findParent((owner) => (
    owner.isClassMethod?.()
      || owner.isClassPrivateMethod?.()
      || owner.isClassProperty?.()
      || owner.isClassPrivateProperty?.()
  ));
  return member?.node?.static === true;
}

function inspectTopLevelPurity(ast, violations) {
  for (const statement of ast.program.body) {
    if (statement.type === 'ImportDeclaration') continue;
    if (statement.type === 'ExportDefaultDeclaration'
        && statement.declaration?.type === 'ClassDeclaration') continue;
    if (statement.type === 'ExportNamedDeclaration'
        && !statement.source
        && (statement.declaration === null || statement.declaration?.type === 'ClassDeclaration')) continue;
    violations.push('top-level-side-effect');
  }
}

function inspectConstructorContract(prepared, violations) {
  if (!prepared.candidateClass) return;
  const constructor = prepared.candidateClass.body.body.find((member) => (
    member.type === 'ClassMethod' && member.kind === 'constructor'
  ));
  if (!constructor) {
    violations.push('explicit-constructor-required');
    return;
  }
  if (constructor.async || constructor.generator) violations.push('invalid-constructor');
  const superCalls = [];
  walkAst(constructor.body, (node) => {
    if (node.type === 'CallExpression' && node.callee?.type === 'Super') superCalls.push(node);
    if (node.type === 'ReturnStatement' && node.argument) violations.push('constructor-return-override');
  });
  if (superCalls.length !== 1) {
    violations.push('invalid-super-call-count');
    return;
  }
  const superArguments = superCalls[0].arguments ?? [];
  if (prepared.type === 'behaviour') {
    const owner = constructor.params[0];
    if (owner?.type !== 'Identifier'
        || superArguments.length !== 1
        || superArguments[0]?.type !== 'Identifier'
        || superArguments[0].name !== owner.name) {
      violations.push('behaviour-owner-constructor-invalid');
    }
    return;
  }
  if (superArguments.length > 1) {
    violations.push('unit-super-arity-invalid');
  } else if (superArguments.length === 1) {
    const child = constructor.params[0];
    const directChild = child?.type === 'Identifier'
      && superArguments[0]?.type === 'Identifier'
      && superArguments[0].name === child.name;
    const nestedTree = child?.type === 'Identifier'
      && superArguments[0]?.type === 'NewExpression';
    if (!directChild && !nestedTree) {
      violations.push('unit-child-constructor-invalid');
    }
  }
}

function inspectForbiddenRuntime(ast, violations) {
  traverse(ast, {
    ReferencedIdentifier(current) {
      if (!current.scope.getBinding(current.node.name)
          && !ALLOWED_DETERMINISTIC_GLOBALS.has(current.node.name)) {
        violations.push('ambient-global');
      }
    },
    Function(current) {
      if (current.node.async || current.node.generator) {
        violations.push('async-or-generator-runtime');
      }
    },
    CallExpression(current) {
      inspectCallableBoundary(current, violations);
    },
    OptionalCallExpression(current) {
      inspectCallableBoundary(current, violations);
    },
    MemberExpression(current) {
      inspectForbiddenMemberRuntime(current, violations);
    },
    OptionalMemberExpression(current) {
      inspectForbiddenMemberRuntime(current, violations);
    },
    ImportExpression() {
      violations.push('dynamic-import');
    },
    MetaProperty(current) {
      if (current.node.meta?.name === 'import') violations.push('import-meta');
    },
    JSXElement() {
      violations.push('renderer-syntax');
    },
    JSXFragment() {
      violations.push('renderer-syntax');
    },
    Identifier(current) {
      if (SENSITIVE_FIELD_NAMES.has(current.node.name)
          && ((current.parentPath?.isObjectProperty()
              && current.parentPath.node.key === current.node)
            || (current.parentPath?.isClassProperty()
              && current.parentPath.node.key === current.node))) {
        violations.push('sensitive-state-field');
      }
    },
  });
}

function inspectForbiddenMemberRuntime(current, violations) {
  const memberName = propertyName(current.node.property);
  if (['__proto__', 'constructor', 'prototype'].includes(memberName)) {
    violations.push('prototype-constructor-access');
  }
  if (current.node.object?.type === 'Identifier'
      && current.node.object.name === 'Math'
      && memberName === 'random'
      && !current.scope.getBinding('Math')) {
    violations.push('nondeterministic-global');
  }
}

function inspectCallableBoundary(current, violations) {
  const callee = current.get('callee');
  if (callee.isIdentifier()) {
    const binding = current.scope.getBinding(callee.node.name);
    if (binding && binding.kind !== 'module') {
      violations.push('parameter-or-instance-callback');
    }
    return;
  }
  if (!isMemberPath(callee)) return;
  let root = callee;
  while (isMemberPath(root)) root = root.get('object');
  if (root.isThisExpression()) {
    const directAdd = current.findParent((owner) => owner.isClass())
      && callee.node.object?.type === 'ThisExpression'
      && callee.node.computed !== true
      && propertyName(callee.node.property) === 'add';
    const classKind = directAdd
      ? readOwnStaticKind(current.findParent((owner) => owner.isClass()).node)
      : null;
    if (!directAdd || !classKind?.startsWith('unit.')) {
      violations.push('parameter-or-instance-callback');
    }
    return;
  }
  if (root.isIdentifier()
      && current.scope.getBinding(root.node.name)?.kind === 'param') {
    violations.push('parameter-or-instance-callback');
  }
}

async function inspectStaticDependencies(prepared, repositoryRoot, violations) {
  const evaluated = new Set([prepared.source]);
  for (const imported of collectStaticSpecifiers(prepared.ast)) {
    if (!imported.value.startsWith('./') && !imported.value.startsWith('../')) {
      violations.push('external-library-import');
      continue;
    }
    const resolved = path.posix.normalize(path.posix.join(
      path.posix.dirname(prepared.source),
      imported.value,
    ));
    if (resolved === '..' || resolved.startsWith('../') || path.posix.isAbsolute(resolved)) {
      violations.push('import-escapes-repository');
      continue;
    }
    if (resolved.includes('/drivers/') || resolved.startsWith('src/')) {
      violations.push('renderer-or-runtime-import');
      continue;
    }
    const trace = await traceStaticImports({ rootDir: repositoryRoot, entries: [resolved] });
    trace.files.forEach((file) => evaluated.add(file));
    trace.errors.forEach((error) => violations.push(error.code));
    if (trace.externalImports.length > 0) violations.push('external-dependency-graph');
    if (trace.files.some((file) => file.includes('/drivers/') || file.startsWith('src/'))) {
      violations.push('renderer-or-runtime-dependency');
    }
  }
  return evaluated.size;
}

function inspectModuleLiterals(ast, prepared, findings) {
  for (const comment of ast.comments ?? []) {
    inspectUnboundLiteral(comment.value, findings);
  }
  traverse(ast, {
    StringLiteral(current) {
      if (isRelativeImportLiteral(current) || isStaticKindLiteral(current)) return;
      inspectLiteral(current.node.value, current, prepared, findings);
    },
    TemplateElement(current) {
      inspectLiteral(current.node.value.cooked ?? current.node.value.raw, current, prepared, findings);
    },
    JSXText(current) {
      if (current.node.value.trim()) findings.push('hardcoded-visual-copy');
    },
  });
}

function inspectLiteral(value, current, prepared, findings) {
  if (!value) return;
  if (SECRET.test(value)) findings.push('secret-like-token');
  if (NETWORK_SCHEME.test(value) || OPAQUE_NETWORK_SCHEME.test(value)
      || EMAIL.test(value) || DOMAIN.test(value)) findings.push('raw-network-identifier');
  if (!isDiagnosticLiteral(current)
      && !isCanonicalLabelLiteral(current, prepared)
      && (value.length > 256
        || /\s/u.test(value)
        || isSensitiveRuntimeLiteral(current))) {
    findings.push('free-text-literal');
  }
}

function isCanonicalLabelLiteral(current, prepared) {
  const call = current.parentPath;
  if (!call?.isCallExpression()) return false;
  const callee = call.get('callee');
  if (!callee.isIdentifier()) return false;
  const argumentIndex = CANONICAL_LABEL_ARGUMENTS[callee.node.name];
  return argumentIndex !== undefined
    && call.node.arguments[argumentIndex] === current.node
    && isCanonicalImportedCall(call, prepared, CANONICAL_LABEL_HELPERS);
}

function isSensitiveRuntimeLiteral(current) {
  for (let owner = current.parentPath; owner; owner = owner.parentPath) {
    if (owner.isFunction() && !owner.isClassMethod()) break;
    if ((owner.isObjectProperty() || owner.isClassProperty() || owner.isClassMethod())
        && SENSITIVE_LITERAL_FIELDS.test(propertyName(owner.node.key) ?? '')) return true;
    if (owner.isAssignmentExpression()) {
      const target = owner.node.left;
      if (target?.type === 'MemberExpression'
          && SENSITIVE_LITERAL_FIELDS.test(propertyName(target.property) ?? '')) return true;
    }
    if (owner.isAssignmentPattern()
        && SENSITIVE_LITERAL_FIELDS.test(propertyName(owner.node.left) ?? '')) {
      return true;
    }
    if (owner.isJSXAttribute()
        && SENSITIVE_LITERAL_FIELDS.test(owner.node.name?.name ?? '')) return true;
    if (owner.isNewExpression()
        && /^(?:Audio|Image|Sprite|Text|TextNode|Video)$/u.test(propertyName(owner.node.callee) ?? '')) {
      return true;
    }
  }
  return false;
}

function inspectUnboundLiteral(value, findings) {
  if (!value) return;
  if (SECRET.test(value)) findings.push('secret-like-token');
  if (NETWORK_SCHEME.test(value) || OPAQUE_NETWORK_SCHEME.test(value)
      || EMAIL.test(value) || DOMAIN.test(value)) findings.push('raw-network-identifier');
}

function sensitiveCorpusLiterals(datasetText) {
  const output = new Set();
  const ingested = ingestCompositionTracks(datasetText);
  for (const composition of ingested.compositions) {
    let ast;
    try { ast = parseModule(composition.source, '<composition>'); } catch { continue; }
    traverse(ast, {
      StringLiteral(current) {
        const value = current.node.value;
        if (!isRelativeImportLiteral(current)
            && (value.length > 20 || /\s/u.test(value) || isSensitiveRuntimeLiteral(current)
              || NETWORK_SCHEME.test(value) || EMAIL.test(value) || DOMAIN.test(value))) {
          output.add(value);
        }
      },
      JSXText(current) {
        const value = current.node.value.trim();
        if (value) output.add(value);
      },
    });
  }
  return output;
}

function moduleRuntimeLiterals(ast) {
  if (!ast) return [];
  const output = [];
  traverse(ast, {
    StringLiteral(current) {
      if (!isRelativeImportLiteral(current)
          && !isDiagnosticLiteral(current)
          && !isStaticKindLiteral(current)) output.push(current.node.value);
    },
    JSXText(current) {
      const value = current.node.value.trim();
      if (value) output.push(value);
    },
  });
  return output;
}

function canonicalWriterImport(prepared, name) {
  return prepared.ast.program.body.some((statement) => (
    statement.type === 'ImportDeclaration'
      && path.posix.normalize(path.posix.join(path.posix.dirname(prepared.source), statement.source.value))
        === 'behaviours/shared.js'
      && statement.specifiers.some((specifier) => (
        specifier.type === 'ImportSpecifier'
          && propertyName(specifier.imported) === name
          && specifier.local?.name === name
      ))
  ));
}

function unitMemberChannel(node) {
  if (!node || node.type !== 'MemberExpression' || node.computed) return null;
  const parts = [];
  let current = node;
  while (current?.type === 'MemberExpression' && !current.computed) {
    const name = propertyName(current.property);
    if (!name) return null;
    parts.unshift(name);
    current = current.object;
  }
  if (current?.type !== 'ThisExpression' || parts.shift() !== 'unit') return null;
  return parts.length > 0 ? parts.join('.') : 'unit';
}

function containsThisUnit(node) {
  let found = false;
  walkAst(node, (nested) => {
    if (unitMemberChannel(nested) === 'unit') found = true;
  });
  return found;
}

function isThisUnit(node) {
  return unitMemberChannel(node) === 'unit';
}

function literalString(value) {
  return value?.type === 'StringLiteral' ? value.value : null;
}

function isRelativeImportLiteral(current) {
  return (current.parentPath?.isImportDeclaration()
      || current.parentPath?.isExportNamedDeclaration()
      || current.parentPath?.isExportAllDeclaration())
    && (current.node.value.startsWith('./') || current.node.value.startsWith('../'));
}

function isDiagnosticLiteral(current) {
  const throwing = current.findParent((owner) => owner.isThrowStatement());
  if (!throwing) return false;
  const error = current.findParent((owner) => owner.isNewExpression()
    && owner.get('callee').isIdentifier()
    && /^(?:Error|RangeError|TypeError)$/u.test(owner.node.callee.name));
  return Boolean(error);
}

function isStaticKindLiteral(current) {
  const member = current.parentPath;
  return Boolean(
    (member?.isClassProperty() || member?.isClassMethod())
      && member.node.static
      && propertyName(member.node.key) === 'kind'
  );
}

function publicCandidateIdentity(prepared) {
  return {
    kind: prepared.kind,
    type: prepared.type,
    source: prepared.source,
    export: prepared.export,
    role: 'memory',
    candidateSha256: prepared.candidateSha256,
    moduleSha256: prepared.moduleSha256,
    dependencyClosureSha256: prepared.dependencyClosureSha256,
  };
}

function gateResult(passed, code, details = {}) {
  return deepFreeze({ passed: passed === true, code, ...details });
}

function safeModuleSource(value, type) {
  if (typeof value !== 'string' || value.includes('\\') || path.posix.isAbsolute(value)) {
    throw new TypeError('candidate.source is invalid');
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')
      || segments[0] !== (type === 'unit' ? 'units' : 'behaviours')
      || !value.endsWith('.js')) {
    throw new TypeError('candidate.source is invalid');
  }
  return value;
}

function safeEvaluationCode(error) {
  const code = String(error?.message ?? 'evaluation-failed');
  return /^[a-z0-9-]{1,100}$/u.test(code) ? code : 'evaluation-failed';
}

function safeEvidenceCode(error) {
  const value = String(error?.message ?? 'evidence-invalid');
  if (/hash mismatch/u.test(value)) return 'evidence-hash-mismatch';
  if (/binding mismatch/u.test(value)) return 'evidence-binding-mismatch';
  if (/unsupported/u.test(value)) return 'evidence-version-invalid';
  return 'evidence-invalid';
}

function requireIssuer(value) {
  if (!isPromotionGateIssuer(value)) throw new TypeError('a configured final promotion gate issuer is required');
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} contains unsupported fields`);
  }
}

function exactKeySet(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function requireHash(value, label) {
  if (!isHash(value)) throw new TypeError(`${label} must be a lowercase SHA-256`);
  return value;
}

function requireKind(value) {
  if (typeof value !== 'string' || !KIND.test(value)) throw new TypeError('candidateKind is invalid');
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be positive`);
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be non-negative`);
  return value;
}

function boundedCount(value, maximum, label) {
  const count = nonNegativeInteger(value, label);
  if (count > maximum) throw new TypeError(`${label} exceeds frame count`);
  return count;
}

function isHash(value) {
  return typeof value === 'string' && HASH.test(value);
}

function firstConfigured(values, names) {
  for (const name of names) {
    if (typeof values[name] === 'string' && values[name].trim()) return values[name].trim();
  }
  return null;
}

function sum(values, key) {
  return values.reduce((total, value) => total + Number(value[key] ?? 0), 0);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
