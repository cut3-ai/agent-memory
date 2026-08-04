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
export async function buildClassIndex(repositoryRoot) {
  const created = await createNavigationIndex({
    rootDir: path.resolve(repositoryRoot),
  });
  return {
    index: created.index,
    validation: libraryValidation(created),
  };
}

/**
 * Compare an index with a fresh AST discovery. No discovered module is loaded.
 */
export async function verifyClassIndex(repositoryRoot, index) {
  const rootDir = path.resolve(repositoryRoot);
  const indexReport = validateNavigationIndex(index);
  const discovery = await discoverLibrary({ rootDir });
  const sourceReport = verifyDiscovery(discovery);
  const current = sourceReport.ok ? buildNavigationIndex(discovery) : null;
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
  ];
  if (sourceReport.ok && indexReport.ok && !currentIndex) {
    violations.push({ code: 'index-not-current', module: '<index>' });
  }
  violations.sort(compareViolations);
  return Object.freeze({
    format: 'cut3-static-library-verification',
    version: 1,
    valid: sourceReport.ok && indexReport.ok && currentIndex,
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
    evaluatedModules: 0,
    indexSha256: created.index.indexSha256,
    violations: Object.freeze([]),
  });
}

function compareViolations(left, right) {
  return left.module.localeCompare(right.module)
    || left.code.localeCompare(right.code)
    || String(left.location ?? '').localeCompare(String(right.location ?? ''));
}
