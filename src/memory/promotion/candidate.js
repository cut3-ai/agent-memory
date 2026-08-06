import path from 'node:path';

import { sha256 } from '../../lib.js';
import {
  buildDependencyClosure,
  buildPromotionBundleIdentity,
  bundleCandidateRevisionSha256,
  candidateRevisionSha256,
} from '../../library/promotion-ledger.js';
import {
  collectStaticSpecifiers,
  findExportedClasses,
  parseModule,
  propertyName,
  readOwnStaticKind,
} from '../../library/discover.js';
import { assertValidLibrary, verifyDiscovery } from '../../library/verify.js';
import { assertPublicModuleSources } from '../privacy.js';
import { assertStyleMemory, inspectStyleModuleSource } from '../style-contract.js';

const HASH = /^[a-f0-9]{64}$/u;

/** Build a virtual, hash-bound candidate graph without writing any source. */
export function prepareCandidate(discovery, value = {}, bundleValue = []) {
  const evidenceSha256 = requireHash(value.evidenceSha256, 'candidate.evidenceSha256');
  const existing = discovery.entries.find((entry) => entry.kind === value.kind);
  const linkedCandidates = normalizeBundleCandidates(bundleValue, value);
  if (value.moduleSource === undefined) {
    if (linkedCandidates.length > 0) {
      throw new Error('A promotion bundle requires a staged primary Unit revision');
    }
    if (!existing) throw new Error('Candidate class is neither discovered nor supplied as staged source');
    const alreadyPublic = discovery.publicEntries?.some((entry) => (
      entry.kind === existing.kind
      && entry.source === existing.source
      && entry.export === existing.export
    ));
    if (!alreadyPublic) {
      throw new Error('Unpromoted classes must enter through transient staged source');
    }
    const module = discovery.modules.find((item) => item.file === existing.source);
    const identity = {
      kind: existing.kind,
      type: existing.type,
      source: existing.source,
      export: existing.export,
      moduleSha256: sha256(module.source),
    };
    const dependencyClosure = buildDependencyClosure(discovery, existing.source);
    assertCandidateSourcePrivacy(discovery, dependencyClosure, []);
    return {
      candidate: candidateMetadata(identity, evidenceSha256, dependencyClosure.closureSha256, 1),
      discovery,
      staged: null,
      stagedModules: [],
      bundleKinds: [existing.kind],
    };
  }

  const proposed = [value, ...linkedCandidates];
  const proposedDependencies = proposed.map((candidate) => ({
    file: safeTargetSource(candidate.source, candidate.type),
    source: requireModuleSource(candidate.moduleSource),
  }));
  const dependencyModules = replaceModules(
    discovery.dependencyModules ?? discovery.modules,
    proposedDependencies,
  );
  const stagedModules = proposed.map((candidate) => parseStagedCandidate(
    candidate,
    dependencyModules,
  ));
  for (const staged of stagedModules) {
    const currentEntry = discovery.entries.find((entry) => entry.kind === staged.entry.kind);
    if (currentEntry && (
      currentEntry.type !== staged.entry.type
      || currentEntry.source !== staged.entry.source
      || currentEntry.export !== staged.entry.export
    )) {
      throw new Error('Staged revision cannot change the public class identity');
    }
    if (discovery.entries.some((entry) => (
      entry.source === staged.entry.source && entry.kind !== staged.entry.kind
    ))) {
      throw new Error('Staged revision cannot replace a module owned by another class');
    }
    const currentModule = discovery.modules.find((item) => item.file === staged.entry.source);
    if (currentModule && !currentEntry) {
      throw new Error('Staged revision target is already occupied');
    }
    if (currentEntry && !currentModule) {
      throw new Error('Staged revision target is unavailable');
    }
    if (currentModule) staged.previousModuleSha256 = sha256(currentModule.source);
  }
  const stagedFiles = new Set(stagedModules.map((staged) => staged.module.file));
  const stagedKinds = new Set(stagedModules.map((staged) => staged.entry.kind));
  const virtualDiscovery = {
    ...discovery,
    modules: replaceModules(discovery.modules, stagedModules.map((staged) => staged.module)),
    dependencyModules: replaceModules(
      discovery.dependencyModules ?? discovery.modules,
      stagedModules.map((staged) => staged.module),
    ),
    entries: [
      ...discovery.entries.filter((entry) => !stagedKinds.has(entry.kind)),
      ...stagedModules.map((staged) => staged.entry),
    ],
  };
  assertValidLibrary(verifyDiscovery(virtualDiscovery));
  const staged = stagedModules[0];
  const identity = {
    kind: staged.entry.kind,
    type: staged.entry.type,
    source: staged.entry.source,
    export: staged.entry.export,
    moduleSha256: sha256(staged.module.source),
  };
  const dependencyClosure = buildDependencyClosure(virtualDiscovery, staged.entry.source);
  const closureFiles = new Set(dependencyClosure.files.map((file) => file.module));
  if (stagedModules.slice(1).some((linked) => !closureFiles.has(linked.entry.source))) {
    throw new Error('Every linked Behaviour must be reachable from the primary Unit');
  }
  assertCandidateSourcePrivacy(virtualDiscovery, dependencyClosure, stagedFiles);
  const bundleKinds = stagedModules.map((module) => module.entry.kind);
  return {
    candidate: candidateMetadata(
      identity,
      evidenceSha256,
      dependencyClosure.closureSha256,
      stagedModules.length,
      virtualDiscovery,
      bundleKinds,
    ),
    discovery: virtualDiscovery,
    staged,
    stagedModules,
    bundleKinds,
  };
}

function normalizeBundleCandidates(value, primary) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 8) {
    throw new TypeError('bundle must be an array of at most eight linked candidates');
  }
  if (value.length === 0) return [];
  if (primary.type !== 'unit') {
    throw new TypeError('only a Unit may anchor a linked style bundle');
  }
  const kinds = new Set([primary.kind]);
  const sources = new Set([safeTargetSource(primary.source, primary.type)]);
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new TypeError(`bundle[${index}] must be a staged Behaviour candidate`);
    }
    if (candidate.type !== 'behaviour') {
      throw new TypeError(`bundle[${index}] must be an authored Behaviour`);
    }
    requireModuleSource(candidate.moduleSource);
    const source = safeTargetSource(candidate.source, candidate.type);
    if (kinds.has(candidate.kind) || sources.has(source)) {
      throw new Error('Promotion bundle kinds and sources must be unique');
    }
    kinds.add(candidate.kind);
    sources.add(source);
    return candidate;
  });
}

function replaceModules(current, replacements) {
  const files = new Set(replacements.map((module) => module.file));
  return [
    ...current.filter((module) => !files.has(module.file)),
    ...replacements,
  ];
}

function requireModuleSource(value) {
  if (typeof value !== 'string' || value.length < 1) {
    throw new TypeError('candidate.moduleSource must contain ESM source');
  }
  return value;
}

function assertCandidateSourcePrivacy(discovery, closure, strictFiles) {
  const modules = new Map();
  for (const module of discovery.dependencyModules ?? []) modules.set(module.file, module);
  for (const module of discovery.modules ?? []) modules.set(module.file, module);
  const records = closure.files.map(({ module: file }) => {
    const record = modules.get(file);
    if (!record) throw new Error(`Privacy dependency source is unavailable: ${file}`);
    return { file, source: record.source };
  });
  assertPublicModuleSources(records, { strictFiles });
}

function parseStagedCandidate(value, dependencyModules) {
  const source = safeTargetSource(value.source, value.type);
  requireModuleSource(value.moduleSource);
  const styleContract = assertStyleMemory(inspectStyleModuleSource({
    moduleSource: value.moduleSource,
    sourceFile: source,
    type: value.type,
    kind: value.kind,
    exportName: value.export,
    dependencyModules,
  }));
  const ast = parseModule(value.moduleSource, source);
  const classes = findExportedClasses(ast).filter(
    (entry) => readOwnStaticKind(entry.node) === value.kind,
  );
  if (classes.length !== 1) throw new Error('Staged module must export exactly one matching concrete class');
  const exported = classes[0];
  if (exported.exportName !== value.export) throw new Error('Staged export does not match candidate.export');
  const entry = {
    type: value.type,
    kind: value.kind,
    export: exported.exportName,
    className: exported.className,
    hasSuperClass: Boolean(exported.node.superClass),
    superClass: propertyName(exported.node.superClass),
    source,
    scent: styleContract.scent,
    loc: exported.node.loc?.start ?? null,
  };
  const module = {
    file: source,
    filename: source,
    source: value.moduleSource,
    ast,
    type: value.type,
    imports: collectStaticSpecifiers(ast),
  };
  return { entry, module, moduleSource: value.moduleSource };
}

function candidateMetadata(
  identity,
  evidenceSha256,
  dependencyClosureSha256,
  bundleSize,
  discovery = null,
  bundleKinds = null,
) {
  const primaryRevisionSha256 = candidateRevisionSha256({
    ...identity,
    role: 'memory',
    dependencyClosureSha256,
  });
  const bundle = bundleSize > 1
    ? buildPromotionBundleIdentity(discovery, bundleKinds)
    : null;
  const candidateSha256 = bundle
    ? bundleCandidateRevisionSha256({
      primaryRevisionSha256,
      bundleSha256: bundle.bundleSha256,
    })
    : primaryRevisionSha256;
  return {
    kind: identity.kind,
    candidateSha256,
    moduleSha256: identity.moduleSha256,
    dependencyClosureSha256,
    bundleSha256: bundle?.bundleSha256 ?? null,
    outcomeRevisionSha256: bundleSize > 1 ? candidateSha256 : identity.moduleSha256,
    evidenceSha256,
  };
}

function safeTargetSource(value, type) {
  if (typeof value !== 'string' || value.includes('\\') || path.posix.isAbsolute(value)) {
    throw new TypeError('candidate.source must be a safe relative module path');
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new TypeError('candidate.source contains unsafe traversal');
  }
  if (segments[0] !== (type === 'unit' ? 'units' : 'behaviours') || !value.endsWith('.js')) {
    throw new TypeError('candidate.source does not match candidate.type');
  }
  return value;
}

function requireHash(value, name) {
  if (typeof value !== 'string' || !HASH.test(value)) {
    throw new TypeError(`${name} must be a lowercase SHA-256`);
  }
  return value;
}
