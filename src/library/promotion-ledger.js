import fs from 'node:fs/promises';
import path from 'node:path';

import { sha256, stableStringify } from '../lib.js';
import {
  PROMOTION_GATE_NAMES,
  verifyPromotionGateReceipt,
} from '../memory/gate-receipts.js';

export const PROMOTION_LEDGER_FORMAT = 'cut3-promotion-ledger';
export const PROMOTION_LEDGER_VERSION = 3;
export const DEFAULT_PROMOTION_LEDGER_FILE = 'promotion-ledger.json';
export const DEPENDENCY_CLOSURE_VERSION = 1;

const HASH = /^[a-f0-9]{64}$/u;
const SAFE_EXPORT = /^(?:default|[$A-Z_a-z][$\w]*)$/u;
const SAFE_KIND = /^(?:unit|behaviour)\.[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u;
const SAFE_GATE_AUTHORITY = /^[A-Za-z0-9._-]{1,100}$/u;
const AUTHORITIES = new Set(['reviewed-core', 'human-feedback']);
const ROLES = new Set(['infrastructure', 'memory']);

/**
 * Load the public allowlist as JSON. Missing ledger means an empty public
 * library, never an implicit approval of every discovered class.
 */
export async function loadPromotionLedger(options = {}) {
  if (options.ledger) return validatePromotionLedger(options.ledger);
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const ledgerFile = path.resolve(
    rootDir,
    options.ledgerFile ?? DEFAULT_PROMOTION_LEDGER_FILE,
  );
  try {
    const bytes = await fs.readFile(ledgerFile, 'utf8');
    return validatePromotionLedger(JSON.parse(bytes));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return validatePromotionLedger(createPromotionLedger([], { revision: 0 }));
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Promotion ledger is not valid JSON: ${ledgerFile}`);
    }
    throw error;
  }
}

/** Build a hash-sealed ledger. Callers must supply already-reviewed entries. */
export function createPromotionLedger(entries, options = {}) {
  const revision = options.revision ?? 1;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new TypeError('ledger revision must be a non-negative integer');
  }
  const normalized = entries.map(normalizeLedgerEntry).sort(compareLedgerEntries);
  const body = {
    format: PROMOTION_LEDGER_FORMAT,
    version: PROMOTION_LEDGER_VERSION,
    revision,
    entries: normalized,
  };
  return deepFreeze({
    ...body,
    ledgerSha256: sha256(stableStringify(body)),
  });
}

/**
 * Explicit bootstrap helper for a reviewed trust root. It never runs during
 * discovery and therefore cannot turn mere filesystem presence into approval.
 */
export function createReviewedCoreLedger(discovery, reviewedKinds, options = {}) {
  if (!Array.isArray(reviewedKinds)) throw new TypeError('reviewedKinds must be an array');
  const requested = new Set(reviewedKinds);
  if (requested.size !== reviewedKinds.length) throw new Error('reviewedKinds must be unique');
  const modules = moduleHashes(discovery.modules);
  const byKind = uniqueDiscoveredKinds(discovery.entries);
  const entries = [...requested].map((kind) => {
    const discovered = byKind.get(kind);
    if (!discovered) throw new Error(`Reviewed class is not discovered: ${kind}`);
    const moduleSha256 = modules.get(discovered.source);
    const identity = publicIdentity(discovered, moduleSha256, 'infrastructure');
    const dependencyClosure = buildDependencyClosure(discovery, discovered.source);
    return {
      ...identity,
      dependencyClosure,
      revisionSha256: candidateRevisionSha256({
        ...identity,
        dependencyClosureSha256: dependencyClosure.closureSha256,
      }),
      authority: 'reviewed-core',
      decisionSha256: null,
    };
  });
  return createPromotionLedger(entries, options);
}

/** Validate shape, sort order, hashes, revision bindings and trust metadata. */
export function validatePromotionLedger(value) {
  const errors = [];
  if (!isRecord(value)) {
    return deepFreeze({ ok: false, ledger: null, errors: [{ code: 'invalid-ledger-root', location: '<root>' }] });
  }
  exactKeys(value, ['format', 'version', 'revision', 'entries', 'ledgerSha256'], '<root>', errors);
  if (value.format !== PROMOTION_LEDGER_FORMAT) issue(errors, 'invalid-ledger-format', 'format');
  if (value.version !== PROMOTION_LEDGER_VERSION) issue(errors, 'invalid-ledger-version', 'version');
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) {
    issue(errors, 'invalid-ledger-revision', 'revision');
  }
  if (!Array.isArray(value.entries)) {
    issue(errors, 'invalid-ledger-entries', 'entries');
  }

  const kinds = new Set();
  let previous = null;
  for (const [index, entry] of (Array.isArray(value.entries) ? value.entries : []).entries()) {
    const location = `entries.${index}`;
    if (!isRecord(entry)) {
      issue(errors, 'invalid-ledger-entry', location);
      continue;
    }
    exactKeys(entry, [
      'kind',
      'type',
      'source',
      'export',
      'role',
      'moduleSha256',
      'dependencyClosure',
      'revisionSha256',
      'authority',
      'decisionSha256',
    ], location, errors);
    if (!['unit', 'behaviour'].includes(entry.type)) issue(errors, 'invalid-entry-type', `${location}.type`);
    if (typeof entry.kind !== 'string'
        || !SAFE_KIND.test(entry.kind)
        || !entry.kind.startsWith(`${entry.type}.`)) {
      issue(errors, 'invalid-entry-kind', `${location}.kind`);
    } else if (kinds.has(entry.kind)) {
      issue(errors, 'duplicate-entry-kind', `${location}.kind`);
    } else {
      kinds.add(entry.kind);
    }
    if (!isSafeSource(entry.source, entry.type)) issue(errors, 'invalid-entry-source', `${location}.source`);
    if (typeof entry.export !== 'string' || !SAFE_EXPORT.test(entry.export)) {
      issue(errors, 'invalid-entry-export', `${location}.export`);
    }
    if (!ROLES.has(entry.role)) issue(errors, 'invalid-entry-role', `${location}.role`);
    if (!isHash(entry.moduleSha256)) issue(errors, 'invalid-module-sha256', `${location}.moduleSha256`);
    validateDependencyClosure(entry.dependencyClosure, entry, `${location}.dependencyClosure`, errors);
    if (!isHash(entry.revisionSha256)) {
      issue(errors, 'invalid-revision-sha256', `${location}.revisionSha256`);
    } else if (hasValidRevisionIdentity(entry)
        && candidateRevisionSha256({
          ...entry,
          dependencyClosureSha256: entry.dependencyClosure.closureSha256,
        }) !== entry.revisionSha256) {
      issue(errors, 'revision-sha256-mismatch', `${location}.revisionSha256`);
    }
    if (!AUTHORITIES.has(entry.authority)) issue(errors, 'invalid-entry-authority', `${location}.authority`);
    if ((entry.authority === 'reviewed-core' && entry.role !== 'infrastructure')
        || (entry.authority === 'human-feedback' && entry.role !== 'memory')) {
      issue(errors, 'entry-role-authority-mismatch', `${location}.role`);
    }
    if (entry.authority === 'reviewed-core' && entry.decisionSha256 !== null) {
      issue(errors, 'unexpected-seed-decision', `${location}.decisionSha256`);
    }
    if (entry.authority === 'human-feedback' && !isHash(entry.decisionSha256)) {
      issue(errors, 'missing-promotion-decision', `${location}.decisionSha256`);
    }
    if (previous && compareLedgerEntries(previous, entry) > 0) {
      issue(errors, 'unsorted-ledger-entries', location);
    }
    previous = entry;
  }

  if (!isHash(value.ledgerSha256)) {
    issue(errors, 'invalid-ledger-sha256', 'ledgerSha256');
  } else {
    const body = {
      format: value.format,
      version: value.version,
      revision: value.revision,
      entries: value.entries,
    };
    if (sha256(stableStringify(body)) !== value.ledgerSha256) {
      issue(errors, 'ledger-sha256-mismatch', 'ledgerSha256');
    }
  }

  errors.sort(compareIssues);
  return deepFreeze({ ok: errors.length === 0, ledger: errors.length === 0 ? value : null, errors });
}

/**
 * Resolve the trust ledger against current source bytes. Stale revisions fail
 * closed; unlisted candidates are reported but are never public entries.
 */
export function resolvePromotedEntries(discovery, ledgerValidation) {
  const errors = [...(ledgerValidation?.errors ?? [])];
  const ledger = ledgerValidation?.ledger;
  const modules = moduleHashes(discovery.modules);
  const byKind = uniqueDiscoveredKinds(discovery.entries);
  const promotedEntries = [];
  const promotedKinds = new Set();

  if (ledger) {
    for (const ledgerEntry of ledger.entries) {
      const discovered = byKind.get(ledgerEntry.kind);
      if (!discovered) {
        issue(errors, 'promoted-class-not-discovered', ledgerEntry.kind);
        continue;
      }
      if (discovered.type !== ledgerEntry.type
          || discovered.source !== ledgerEntry.source
          || discovered.export !== ledgerEntry.export) {
        issue(errors, 'promoted-identity-mismatch', ledgerEntry.kind);
        continue;
      }
      if (modules.get(discovered.source) !== ledgerEntry.moduleSha256) {
        issue(errors, 'promoted-module-revision-mismatch', ledgerEntry.kind);
        continue;
      }
      let currentClosure;
      try {
        currentClosure = buildDependencyClosure(discovery, discovered.source);
      } catch {
        issue(errors, 'promoted-dependency-closure-unavailable', ledgerEntry.kind);
        continue;
      }
      if (currentClosure.closureSha256 !== ledgerEntry.dependencyClosure.closureSha256) {
        issue(errors, 'promoted-dependency-revision-mismatch', ledgerEntry.kind);
        continue;
      }
      promotedEntries.push({ ...discovered, role: ledgerEntry.role });
      promotedKinds.add(discovered.kind);
    }
  }

  const excludedEntries = discovery.entries
    .filter((entry) => !promotedKinds.has(entry.kind))
    .map((entry) => ({
      kind: entry.kind,
      type: entry.type,
      source: entry.source,
      export: entry.export,
      reason: 'not-in-promotion-ledger',
    }))
    .sort(compareLedgerEntries);
  errors.sort(compareIssues);
  return deepFreeze({
    ok: errors.length === 0,
    ledgerSha256: ledger?.ledgerSha256 ?? null,
    ledgerRevision: ledger?.revision ?? null,
    promotedEntries: [...promotedEntries].sort(compareLedgerEntries),
    excludedEntries,
    evaluatedModules: 0,
    errors,
  });
}

/**
 * Add one gate-approved revision. The compact hashes copied into a decision are
 * audit metadata, not authority: the ledger boundary verifies the original
 * signed receipts again before accepting a write.
 */
export function appendPromotionDecision(ledger, discovery, decision, authorization = {}) {
  const validation = validatePromotionLedger(ledger);
  if (!validation.ok) throw new Error('Cannot append to an invalid promotion ledger');
  assertPromotionDecision(decision);
  const discovered = uniqueDiscoveredKinds(discovery.entries).get(decision.candidate?.kind);
  if (!discovered) throw new Error('Promotion candidate is not a discovered class');
  const moduleSha256 = moduleHashes(discovery.modules).get(discovered.source);
  const identity = publicIdentity(discovered, moduleSha256, 'memory');
  const dependencyClosure = buildDependencyClosure(discovery, discovered.source);
  const dependencyClosureSha256 = dependencyClosure.closureSha256;
  const revisionSha256 = candidateRevisionSha256({
    ...identity,
    dependencyClosureSha256,
  });
  if (decision.candidate.moduleSha256 !== moduleSha256
      || decision.candidate.dependencyClosureSha256 !== dependencyClosureSha256
      || decision.candidate.candidateSha256 !== revisionSha256) {
    throw new Error('Promotion decision targets a stale candidate revision or dependency closure');
  }
  assertSignedGateAuthorization(decision, authorization, {
    candidateSha256: revisionSha256,
    moduleSha256,
    dependencyClosureSha256,
    resultSha256: decision.candidate.evidenceSha256,
  });
  const nextEntry = {
    ...identity,
    dependencyClosure,
    revisionSha256,
    authority: 'human-feedback',
    decisionSha256: decision.decisionSha256,
  };
  const entries = validation.ledger.entries.filter((entry) => entry.kind !== nextEntry.kind);
  entries.push(nextEntry);
  return createPromotionLedger(entries, { revision: validation.ledger.revision + 1 });
}

function assertSignedGateAuthorization(decision, authorization, expected) {
  for (const gateName of PROMOTION_GATE_NAMES) {
    const verified = verifyPromotionGateReceipt(
      authorization.gateVerifier,
      authorization.gates?.[gateName],
      { gateName, ...expected },
    );
    const recorded = decision.gates?.[gateName];
    if (verified?.passed !== true
        || recorded?.passed !== true
        || verified.authorityId !== recorded.authorityId
        || verified.receiptSha256 !== recorded.receiptSha256
        || verified.signatureSha256 !== recorded.signatureSha256) {
      throw new Error(`Promotion ledger requires an authenticated gate receipt: ${gateName}`);
    }
  }
}

function assertPromotionDecision(decision) {
  if (decision?.action !== 'promote'
      || decision?.eligibleForPromotion !== true
      || decision?.policyVersion !== 'human-feedback-v6-authenticity-bound'
      || !Array.isArray(decision.reasons)
      || decision.reasons.length !== 0) {
    throw new Error('Only an eligible promote decision can update the ledger');
  }
  if (!isHash(decision.decisionSha256)) throw new Error('Promotion decision must be hash-sealed');
  const { decisionSha256, ...body } = decision;
  if (sha256(stableStringify(body)) !== decisionSha256) {
    throw new Error('Promotion decision hash does not match its body');
  }
  if (!['positive', 'neutral'].includes(decision.humanFeedback?.signal)
      || !['explicit-human', 'human-dialogue-classified'].includes(decision.humanFeedback?.origin)
      || !isHash(decision.humanFeedback?.generationEventSha256)
      || decision.humanFeedback?.grace?.remainingMs !== 0) {
    throw new Error('Promotion decision lacks eligible human feedback');
  }
  if (!isHash(decision.candidate?.dependencyClosureSha256)
      || !isHash(decision.candidate?.evidenceSha256)) {
    throw new Error('Promotion decision lacks dependency or evidence revision binding');
  }
  for (const gate of PROMOTION_GATE_NAMES) {
    const receipt = decision.gates?.[gate];
    if (receipt?.passed !== true
        || typeof receipt.authorityId !== 'string'
        || !SAFE_GATE_AUTHORITY.test(receipt.authorityId)
        || !isHash(receipt.receiptSha256)
        || !isHash(receipt.signatureSha256)
        || Object.keys(receipt).length !== 4) {
      throw new Error(`Promotion decision is missing gate: ${gate}`);
    }
  }
  if (decision.stability?.enabled === true && decision.stability.complete !== true) {
    throw new Error('Promotion decision stability window is incomplete');
  }
}

export function candidateRevisionSha256(value) {
  if (!ROLES.has(value?.role)) throw new TypeError('candidate role must be infrastructure or memory');
  if (!isHash(value?.dependencyClosureSha256)) {
    throw new TypeError('dependencyClosureSha256 must be a lowercase SHA-256');
  }
  return sha256(stableStringify({
    kind: value.kind,
    type: value.type,
    source: value.source,
    export: value.export,
    role: value.role,
    moduleSha256: value.moduleSha256,
    dependencyClosureSha256: value.dependencyClosureSha256,
  }));
}

/**
 * Seal the exact relative ESM dependency graph for one public class module.
 * Relative modules are content-addressed; bare imports are recorded as
 * importer/specifier pairs and are intentionally not fetched or evaluated.
 */
export function buildDependencyClosure(discovery, source) {
  if (typeof source !== 'string' || source.length === 0) {
    throw new TypeError('dependency closure source is required');
  }
  const modules = new Map();
  for (const module of discovery?.dependencyModules ?? []) modules.set(module.file, module);
  // Virtual staged candidates replace the on-disk root module here while all
  // of their already-present dependencies continue to come from the graph.
  for (const module of discovery?.modules ?? []) modules.set(module.file, module);
  if (!modules.has(source)) throw new Error(`Dependency closure root is unavailable: ${source}`);

  const visited = new Set();
  const files = [];
  const external = new Map();
  const visit = (file) => {
    if (visited.has(file)) return;
    const module = modules.get(file);
    if (!module || typeof module.source !== 'string') {
      throw new Error(`Static dependency is unavailable: ${file}`);
    }
    visited.add(file);
    files.push({ module: file, sha256: sha256(module.source) });
    for (const imported of module.imports ?? []) {
      const specifier = imported?.value;
      if (typeof specifier !== 'string' || specifier.length === 0) {
        throw new Error(`Static dependency has an invalid specifier: ${file}`);
      }
      if (isRelativeSpecifier(specifier)) {
        visit(resolveDependencySource(file, specifier));
      } else {
        const key = `${file}\u0000${specifier}`;
        external.set(key, { importer: file, specifier });
      }
    }
  };
  visit(source);

  files.sort(compareDependencyFiles);
  const externalImports = [...external.values()].sort(compareExternalImports);
  const body = {
    version: DEPENDENCY_CLOSURE_VERSION,
    files,
    externalImports,
  };
  return deepFreeze({
    ...body,
    closureSha256: sha256(stableStringify(body)),
  });
}

export async function writePromotionLedger(ledger, filename) {
  const validation = validatePromotionLedger(ledger);
  if (!validation.ok) throw new Error('Cannot write an invalid promotion ledger');
  const target = path.resolve(filename);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  return target;
}

function moduleHashes(modules) {
  return new Map(modules.map((module) => [module.file, sha256(module.source)]));
}

function uniqueDiscoveredKinds(entries) {
  const byKind = new Map();
  for (const entry of entries) {
    if (typeof entry.kind === 'string' && !byKind.has(entry.kind)) byKind.set(entry.kind, entry);
  }
  return byKind;
}

function publicIdentity(entry, moduleSha256, role) {
  return {
    kind: entry.kind,
    type: entry.type,
    source: entry.source,
    export: entry.export,
    role,
    moduleSha256,
  };
}

function normalizeLedgerEntry(entry) {
  if (!isRecord(entry)) throw new TypeError('ledger entry must be an object');
  return {
    kind: entry.kind,
    type: entry.type,
    source: entry.source,
    export: entry.export,
    role: entry.role,
    moduleSha256: entry.moduleSha256,
    dependencyClosure: normalizeDependencyClosure(entry.dependencyClosure),
    revisionSha256: entry.revisionSha256,
    authority: entry.authority,
    decisionSha256: entry.decisionSha256 ?? null,
  };
}

function normalizeDependencyClosure(value) {
  if (!isRecord(value)) throw new TypeError('dependency closure must be an object');
  return {
    version: value.version,
    files: Array.isArray(value.files)
      ? value.files.map((file) => ({ module: file?.module, sha256: file?.sha256 }))
      : value.files,
    externalImports: Array.isArray(value.externalImports)
      ? value.externalImports.map((item) => ({
        importer: item?.importer,
        specifier: item?.specifier,
      }))
      : value.externalImports,
    closureSha256: value.closureSha256,
  };
}

function validateDependencyClosure(value, entry, location, errors) {
  if (!isRecord(value)) {
    issue(errors, 'invalid-dependency-closure', location);
    return;
  }
  exactKeys(value, ['version', 'files', 'externalImports', 'closureSha256'], location, errors);
  if (value.version !== DEPENDENCY_CLOSURE_VERSION) {
    issue(errors, 'invalid-dependency-closure-version', `${location}.version`);
  }
  if (!Array.isArray(value.files) || value.files.length === 0) {
    issue(errors, 'invalid-dependency-files', `${location}.files`);
  }
  const files = new Set();
  let previousFile = null;
  for (const [index, file] of (Array.isArray(value.files) ? value.files : []).entries()) {
    const fileLocation = `${location}.files.${index}`;
    if (!isRecord(file)) {
      issue(errors, 'invalid-dependency-file', fileLocation);
      continue;
    }
    exactKeys(file, ['module', 'sha256'], fileLocation, errors);
    if (!isSafeDependencySource(file.module)) {
      issue(errors, 'invalid-dependency-module', `${fileLocation}.module`);
    } else if (files.has(file.module)) {
      issue(errors, 'duplicate-dependency-module', `${fileLocation}.module`);
    } else {
      files.add(file.module);
    }
    if (!isHash(file.sha256)) issue(errors, 'invalid-dependency-sha256', `${fileLocation}.sha256`);
    if (previousFile && compareDependencyFiles(previousFile, file) > 0) {
      issue(errors, 'unsorted-dependency-files', fileLocation);
    }
    previousFile = file;
  }
  const root = Array.isArray(value.files)
    ? value.files.find((file) => file?.module === entry.source)
    : null;
  if (!root || root.sha256 !== entry.moduleSha256) {
    issue(errors, 'dependency-root-mismatch', `${location}.files`);
  }

  if (!Array.isArray(value.externalImports)) {
    issue(errors, 'invalid-external-imports', `${location}.externalImports`);
  }
  const external = new Set();
  let previousExternal = null;
  for (const [index, imported] of (Array.isArray(value.externalImports)
    ? value.externalImports : []).entries()) {
    const importLocation = `${location}.externalImports.${index}`;
    if (!isRecord(imported)) {
      issue(errors, 'invalid-external-import', importLocation);
      continue;
    }
    exactKeys(imported, ['importer', 'specifier'], importLocation, errors);
    if (!isSafeDependencySource(imported.importer) || !files.has(imported.importer)) {
      issue(errors, 'invalid-external-importer', `${importLocation}.importer`);
    }
    if (typeof imported.specifier !== 'string'
        || imported.specifier.length === 0
        || imported.specifier.length > 500
        || /[\u0000\r\n]/u.test(imported.specifier)
        || isRelativeSpecifier(imported.specifier)) {
      issue(errors, 'invalid-external-specifier', `${importLocation}.specifier`);
    }
    const key = `${imported.importer}\u0000${imported.specifier}`;
    if (external.has(key)) issue(errors, 'duplicate-external-import', importLocation);
    else external.add(key);
    if (previousExternal && compareExternalImports(previousExternal, imported) > 0) {
      issue(errors, 'unsorted-external-imports', importLocation);
    }
    previousExternal = imported;
  }

  if (!isHash(value.closureSha256)) {
    issue(errors, 'invalid-dependency-closure-sha256', `${location}.closureSha256`);
  } else {
    const body = {
      version: value.version,
      files: value.files,
      externalImports: value.externalImports,
    };
    if (sha256(stableStringify(body)) !== value.closureSha256) {
      issue(errors, 'dependency-closure-sha256-mismatch', `${location}.closureSha256`);
    }
  }
}

function hasValidRevisionIdentity(entry) {
  return typeof entry.kind === 'string'
    && typeof entry.type === 'string'
    && typeof entry.source === 'string'
    && typeof entry.export === 'string'
    && ROLES.has(entry.role)
    && isHash(entry.moduleSha256)
    && isHash(entry.dependencyClosure?.closureSha256);
}

function exactKeys(value, expected, location, errors) {
  const actual = Object.keys(value);
  if (actual.length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
    issue(errors, 'unexpected-ledger-fields', location);
  }
}

function isSafeSource(value, type) {
  if (typeof value !== 'string' || value.includes('\\') || path.posix.isAbsolute(value)) return false;
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return false;
  if (segments[0] !== (type === 'unit' ? 'units' : 'behaviours')) return false;
  return /\.(?:js|mjs|jsx)$/u.test(value);
}

function isSafeDependencySource(value) {
  if (typeof value !== 'string' || value.includes('\\') || path.posix.isAbsolute(value)) return false;
  const segments = value.split('/');
  return segments.length > 0
    && segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function isRelativeSpecifier(value) {
  return value.startsWith('./') || value.startsWith('../');
}

function resolveDependencySource(importer, specifier) {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  if (!isSafeDependencySource(resolved)) {
    throw new Error(`Static dependency escapes repository root: ${specifier}`);
  }
  return resolved.replace(/^\.\//u, '');
}

function isHash(value) {
  return typeof value === 'string' && HASH.test(value);
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function issue(errors, code, location) {
  errors.push({ code, location });
}

function compareLedgerEntries(left, right) {
  return String(left.kind).localeCompare(String(right.kind))
    || String(left.source).localeCompare(String(right.source))
    || String(left.export).localeCompare(String(right.export));
}

function compareDependencyFiles(left, right) {
  return compareText(left.module, right.module);
}

function compareExternalImports(left, right) {
  return compareText(left.importer, right.importer)
    || compareText(left.specifier, right.specifier);
}

function compareText(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareIssues(left, right) {
  return left.location.localeCompare(right.location) || left.code.localeCompare(right.code);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
