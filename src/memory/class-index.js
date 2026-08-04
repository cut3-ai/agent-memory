import path from 'node:path';

import {
  buildNavigationIndex,
  createNavigationIndex,
  validateNavigationIndex,
} from '../library/index.js';
import { discoverLibrary } from '../library/discover.js';
import { verifyDiscovery } from '../library/verify.js';

/**
 * Compatibility entry point for memory callers. The index and all class checks
 * are owned by src/library and inspect source AST only.
 */
export async function buildClassIndex(repositoryRoot, options = {}) {
  const created = await createNavigationIndex({
    rootDir: path.resolve(repositoryRoot),
    promotionLedger: options.promotionLedger,
    promotionLedgerFile: options.promotionLedgerFile,
  });
  return {
    index: created.index,
    validation: libraryValidation(created),
  };
}

/**
 * Compare an index with a fresh AST discovery. No discovered module is loaded.
 */
export async function verifyClassIndex(repositoryRoot, index, options = {}) {
  const rootDir = path.resolve(repositoryRoot);
  const indexReport = validateNavigationIndex(index);
  const discovery = await discoverLibrary({
    rootDir,
    promotionLedger: options.promotionLedger,
    promotionLedgerFile: options.promotionLedgerFile,
  });
  const sourceReport = verifyDiscovery(discovery);
  const current = sourceReport.ok && discovery.promotion.ok
    ? buildNavigationIndex(discovery)
    : null;
  const currentIndex = Boolean(
    current
      && indexReport.ok
      && current.indexSha256 === index.indexSha256,
  );
  const violations = [
    ...sourceReport.errors.map((error) => ({
      code: error.code,
      module: error.file,
      line: error.line,
      column: error.column,
    })),
    ...indexReport.errors.map((error) => ({
      code: error.code,
      module: '<index>',
      location: error.location,
    })),
    ...discovery.promotion.errors.map((error) => ({
      code: error.code,
      module: '<promotion-ledger>',
      location: error.location,
    })),
  ];
  if (sourceReport.ok && indexReport.ok && !currentIndex) {
    violations.push({ code: 'index-not-current', module: '<index>' });
  }
  violations.sort(compareViolations);
  return Object.freeze({
    format: 'cut3-static-library-verification',
    version: 1,
    valid: sourceReport.ok && discovery.promotion.ok && indexReport.ok && currentIndex,
    checked: Array.isArray(index?.entries) ? index.entries.length : 0,
    evaluatedModules: 0,
    violations: Object.freeze(violations),
  });
}

function libraryValidation(created) {
  const entries = created.index.entries;
  return Object.freeze({
    format: 'cut3-static-library-validation',
    version: 1,
    valid: created.verification.ok && created.indexVerification.ok,
    modules: created.verification.modules,
    entries: entries.length,
    units: entries.filter((entry) => entry.type === 'unit').length,
    behaviours: entries.filter((entry) => entry.type === 'behaviour').length,
    infrastructureEntries: entries.filter((entry) => entry.role === 'infrastructure').length,
    memoryUnits: entries.filter((entry) => (
      entry.role === 'memory' && entry.type === 'unit'
    )).length,
    memoryBehaviours: entries.filter((entry) => (
      entry.role === 'memory' && entry.type === 'behaviour'
    )).length,
    discoveredEntries: created.verification.entries,
    excludedEntries: created.promotion.excludedEntries.length,
    evaluatedModules: 0,
    indexSha256: created.index.indexSha256,
    promotionLedgerSha256: created.promotion.ledgerSha256,
    promotionLedgerRevision: created.promotion.ledgerRevision,
    violations: Object.freeze([]),
  });
}

function compareViolations(left, right) {
  return left.module.localeCompare(right.module)
    || left.code.localeCompare(right.code)
    || String(left.location ?? '').localeCompare(String(right.location ?? ''));
}
