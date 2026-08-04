import fs from 'node:fs/promises';
import path from 'node:path';

import { sha256, stableStringify } from '../lib.js';
import { discoverLibrary } from './discover.js';
import { assertValidLibrary, verifyDiscovery } from './verify.js';

export const NAVIGATION_INDEX_FORMAT = 'cut3-static-library-index';
export const NAVIGATION_INDEX_VERSION = 1;

export function buildNavigationIndex(discovery) {
  const entries = (discovery.publicEntries ?? []).map((entry) => ({
    kind: entry.kind,
    type: entry.type,
    source: entry.source,
    export: entry.export,
  })).sort(compareIndexEntries);
  const hashBody = {
    format: NAVIGATION_INDEX_FORMAT,
    version: NAVIGATION_INDEX_VERSION,
    entries,
  };
  return {
    format: hashBody.format,
    version: hashBody.version,
    indexSha256: sha256(stableStringify(hashBody)),
    entries,
  };
}

export function renderNavigationIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

/** Validate navigation JSON without resolving, importing or evaluating modules. */
export function validateNavigationIndex(index) {
  const errors = [];
  if (!isRecord(index)) {
    return reportIndexErrors([indexIssue('invalid-index-root', '<root>')], 0);
  }
  assertExactKeys(
    index,
    ['format', 'version', 'indexSha256', 'entries'],
    '<root>',
    errors,
  );
  if (index.format !== NAVIGATION_INDEX_FORMAT) {
    errors.push(indexIssue('invalid-index-format', 'format'));
  }
  if (index.version !== NAVIGATION_INDEX_VERSION) {
    errors.push(indexIssue('invalid-index-version', 'version'));
  }
  if (!Array.isArray(index.entries)) {
    errors.push(indexIssue('invalid-index-entries', 'entries'));
    return reportIndexErrors(errors, 0);
  }

  const kinds = new Set();
  let previous = null;
  index.entries.forEach((entry, entryIndex) => {
    const location = `entries.${entryIndex}`;
    if (!isRecord(entry)) {
      errors.push(indexIssue('invalid-index-entry', location));
      return;
    }
    assertExactKeys(entry, ['kind', 'type', 'source', 'export'], location, errors);
    if (!['unit', 'behaviour'].includes(entry.type)) {
      errors.push(indexIssue('invalid-entry-type', `${location}.type`));
    }
    if (typeof entry.kind !== 'string' || !entry.kind.startsWith(`${entry.type}.`)) {
      errors.push(indexIssue('invalid-entry-kind', `${location}.kind`));
    } else if (kinds.has(entry.kind)) {
      errors.push(indexIssue('duplicate-entry-kind', `${location}.kind`));
    } else {
      kinds.add(entry.kind);
    }
    if (!isSafeSource(entry.source, entry.type)) {
      errors.push(indexIssue('invalid-entry-source', `${location}.source`));
    }
    if (typeof entry.export !== 'string'
        || !/^(?:default|[$A-Z_a-z][$\w]*)$/u.test(entry.export)) {
      errors.push(indexIssue('invalid-entry-export', `${location}.export`));
    }
    if (previous && compareIndexEntries(previous, entry) > 0) {
      errors.push(indexIssue('unsorted-index-entries', location));
    }
    previous = entry;
  });

  if (typeof index.indexSha256 !== 'string'
      || !/^[a-f0-9]{64}$/u.test(index.indexSha256)) {
    errors.push(indexIssue('invalid-index-sha256', 'indexSha256'));
  } else {
    const hashBody = {
      format: index.format,
      version: index.version,
      entries: index.entries,
    };
    if (sha256(stableStringify(hashBody)) !== index.indexSha256) {
      errors.push(indexIssue('index-sha256-mismatch', 'indexSha256'));
    }
  }
  return reportIndexErrors(errors, index.entries.length);
}

/** Discover and validate the library, returning an index without writing it. */
export async function createNavigationIndex(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const discovery = await discoverLibrary({ ...options, rootDir });
  const verification = verifyDiscovery(discovery, options);
  assertValidLibrary(verification);
  if (!discovery.promotion.ok) {
    const details = discovery.promotion.errors
      .map((error) => `${error.location} [${error.code}]`)
      .join('\n');
    throw new Error(`Promotion ledger verification failed:\n${details}`);
  }
  const index = buildNavigationIndex(discovery);
  const indexVerification = validateNavigationIndex(index);
  if (!indexVerification.ok) {
    throw new Error('Generated navigation index failed its own validation');
  }
  return {
    index,
    json: renderNavigationIndex(index),
    verification,
    promotion: discovery.promotion,
    indexVerification,
  };
}

/** Write an already-built index after validating its exact public shape. */
export async function writeNavigationIndex(index, outputFile) {
  const validation = validateNavigationIndex(index);
  if (!validation.ok) throw new Error('Cannot write an invalid navigation index');
  const resolvedOutput = path.resolve(outputFile);
  const json = renderNavigationIndex(index);
  await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
  await fs.writeFile(resolvedOutput, json, 'utf8');
  return { index, json, outputFile: resolvedOutput, validation };
}

/**
 * Generate a deterministic, navigation-only JSON index. Discovered ESM modules
 * are parsed as text and are never evaluated by this operation.
 */
export async function generateNavigationIndex(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const outputFile = path.resolve(rootDir, options.outputFile ?? 'index.generated.json');
  const created = await createNavigationIndex({ ...options, rootDir });
  await writeNavigationIndex(created.index, outputFile);
  return { ...created, outputFile };
}

function assertExactKeys(value, expected, location, errors) {
  const actual = Object.keys(value);
  if (actual.length !== expected.length
      || expected.some((key) => !Object.hasOwn(value, key))) {
    errors.push(indexIssue('unexpected-index-fields', location));
  }
}

function isSafeSource(value, type) {
  if (typeof value !== 'string' || value.includes('\\') || path.posix.isAbsolute(value)) {
    return false;
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return false;
  }
  if (segments[0] !== (type === 'unit' ? 'units' : 'behaviours')) return false;
  return /\.(?:js|mjs|jsx)$/u.test(value);
}

function compareIndexEntries(left, right) {
  return String(left.kind).localeCompare(String(right.kind))
    || String(left.source).localeCompare(String(right.source))
    || String(left.export).localeCompare(String(right.export));
}

function indexIssue(code, location) {
  return { code, location };
}

function reportIndexErrors(errors, entries) {
  errors.sort((left, right) => left.location.localeCompare(right.location)
    || left.code.localeCompare(right.code));
  return { ok: errors.length === 0, entries, errors };
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export {
  assertValidLibrary,
  traceStaticImports,
  verifyDiscovery,
  verifyDomTreeShaking,
  verifyLibrary,
} from './verify.js';

export { discoverLibrary } from './discover.js';

export {
  buildDependencyClosure,
  candidateRevisionSha256,
  createPromotionLedger,
  createReviewedCoreLedger,
  loadPromotionLedger,
  resolvePromotedEntries,
  validatePromotionLedger,
  writePromotionLedger,
} from './promotion-ledger.js';
