import fs from 'node:fs/promises';
import path from 'node:path';

import { sha256 } from '../../lib.js';
import {
  loadPromotionLedger,
  writePromotionLedger,
} from '../../library/promotion-ledger.js';
import { assertPublicModuleSources } from '../privacy.js';

const HASH = /^[a-f0-9]{64}$/u;
const LOCK_SUFFIX = '.promotion.lock';
const LOCKED_ERROR = 'Promotion materialization lock exists; manual recovery is required';
const STALE_LEDGER_ERROR = 'Promotion ledger changed before materialization';
const LOCK_CLEANUP_ERROR = 'Promotion materialization lock cleanup failed; manual recovery is required';

/** Materialize every staged module and its ledger as one rollback unit. */
export async function materializePromotion(options) {
  const ledgerFile = path.resolve(
    options.repositoryRoot,
    options.ledgerFile ?? 'promotion-ledger.json',
  );
  return withMaterializationLock(ledgerFile, async () => {
    await assertExactCurrentLedger(options.currentLedger, ledgerFile);
    return materializeUnderLock(options, ledgerFile);
  });
}

async function materializeUnderLock(options, ledgerFile) {
  if (!Array.isArray(options.stagedModules) || options.stagedModules.length === 0) {
    await writePromotionLedger(options.nextLedger, ledgerFile);
    return;
  }
  await verifyMaterializationClosure(options);
  const transactionId = options.nextLedger.ledgerSha256.slice(0, 16);
  const transactionDirectory = path.join(
    options.repositoryRoot,
    'staging',
    'promotion-transactions',
  );
  const targetFiles = new Set();
  const records = [];
  for (const [index, staged] of options.stagedModules.entries()) {
    const moduleFile = path.resolve(options.repositoryRoot, staged.entry.source);
    if (!isInside(options.repositoryRoot, moduleFile)) {
      throw new Error('Staged module escapes repository root');
    }
    if (targetFiles.has(moduleFile)) throw new Error('Promotion transaction has duplicate targets');
    targetFiles.add(moduleFile);
    let previousBytes = null;
    try {
      previousBytes = await fs.readFile(moduleFile, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (previousBytes !== null) {
      if (!isHash(staged.previousModuleSha256)
          || sha256(previousBytes) !== staged.previousModuleSha256) {
        throw new Error('Promotion target changed after staging');
      }
    } else if (staged.previousModuleSha256 !== undefined) {
      throw new Error('Promotion revision target disappeared after staging');
    }
    records.push({
      staged,
      moduleFile,
      previousBytes,
      temporaryFile: path.join(transactionDirectory, `${transactionId}-${index}.module.tmp`),
      backupFile: `${moduleFile}.promotion-${transactionId}.bak`,
      installed: false,
      backupCreated: false,
    });
  }

  await fs.mkdir(transactionDirectory, { recursive: true });
  for (const record of records) await fs.mkdir(path.dirname(record.moduleFile), { recursive: true });
  try {
    for (const record of records) {
      await fs.writeFile(record.temporaryFile, record.staged.moduleSource, {
        encoding: 'utf8',
        flag: 'wx',
      });
    }
    // Ledger-first is fail-closed: until every rename succeeds, discovery sees
    // an incomplete sealed bundle and refuses to generate a public index.
    await writePromotionLedger(options.nextLedger, ledgerFile);
    for (const record of records) {
      if (record.previousBytes !== null) {
        await fs.rename(record.moduleFile, record.backupFile);
        record.backupCreated = true;
      }
      await fs.rename(record.temporaryFile, record.moduleFile);
      record.installed = true;
    }
    for (const record of records.filter((item) => item.backupCreated)) {
      await fs.rm(record.backupFile);
      record.backupCreated = false;
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const record of [...records].reverse()) {
      try {
        if (record.previousBytes !== null && (record.installed || record.backupCreated)) {
          if (await fileExists(record.moduleFile)) await fs.rm(record.moduleFile);
          if (await fileExists(record.backupFile)) {
            await fs.rename(record.backupFile, record.moduleFile);
          } else {
            await fs.writeFile(record.moduleFile, record.previousBytes, {
              encoding: 'utf8',
              flag: 'wx',
            });
          }
        } else if (record.installed && record.previousBytes === null
            && await fileExists(record.moduleFile)) {
          await fs.rm(record.moduleFile);
        }
        if (await fileExists(record.temporaryFile)) await fs.rm(record.temporaryFile);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    try {
      await writePromotionLedger(options.currentLedger, ledgerFile);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], 'Promotion bundle rollback failed');
    }
    throw error;
  }
}

async function assertExactCurrentLedger(expectedLedger, ledgerFile) {
  const expected = await loadPromotionLedger({ ledger: expectedLedger });
  if (!expected.ok) throw new Error('Promotion transaction current ledger is invalid');
  const current = await loadPromotionLedger({
    rootDir: path.dirname(ledgerFile),
    ledgerFile,
  });
  if (!current.ok) throw new Error('Promotion transaction disk ledger is invalid');
  if (current.ledger.ledgerSha256 !== expected.ledger.ledgerSha256) {
    throw new Error(STALE_LEDGER_ERROR);
  }
}

async function withMaterializationLock(ledgerFile, operation) {
  const lockFile = `${ledgerFile}${LOCK_SUFFIX}`;
  await fs.mkdir(path.dirname(lockFile), { recursive: true });
  let handle;
  try {
    handle = await fs.open(lockFile, 'wx');
    await handle.writeFile('cut3-promotion-materialization-lock-v1\n', 'utf8');
    await handle.sync();
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(LOCKED_ERROR);
    if (handle === undefined) throw error;
    const cleanupErrors = await cleanupLock(handle, lockFile);
    if (cleanupErrors.length > 0) {
      throw new AggregateError([error, ...cleanupErrors], LOCK_CLEANUP_ERROR);
    }
    throw error;
  }

  let result;
  let operationError = null;
  try {
    result = await operation();
  } catch (error) {
    operationError = error;
  }
  const cleanupErrors = await cleanupLock(handle, lockFile);
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      operationError === null ? cleanupErrors : [operationError, ...cleanupErrors],
      LOCK_CLEANUP_ERROR,
    );
  }
  if (operationError !== null) throw operationError;
  return result;
}

async function cleanupLock(handle, lockFile) {
  const errors = [];
  try {
    await handle.close();
  } catch (error) {
    errors.push(error);
  }
  try {
    await fs.rm(lockFile);
  } catch (error) {
    errors.push(error);
  }
  return errors;
}

async function verifyMaterializationClosure(options) {
  const primary = options.nextLedger.entries.find((entry) => entry.kind === options.primaryKind);
  if (!primary || primary.role !== 'memory') {
    throw new Error('Promotion transaction primary ledger entry is unavailable');
  }
  const stagedByFile = new Map(options.stagedModules.map((staged) => [
    staged.entry.source,
    staged.moduleSource,
  ]));
  const expectedByFile = new Map();
  for (const entry of options.nextLedger.entries) {
    for (const expected of entry.dependencyClosure.files) {
      const existing = expectedByFile.get(expected.module);
      if (existing && existing.sha256 !== expected.sha256) {
        throw new Error('Promotion would stale an existing public dependency closure');
      }
      expectedByFile.set(expected.module, expected);
    }
  }
  for (const file of stagedByFile.keys()) {
    if (!expectedByFile.has(file)) {
      throw new Error('Staged module is outside the sealed public dependency graph');
    }
  }
  const records = [];
  for (const expected of expectedByFile.values()) {
    const filename = path.resolve(options.repositoryRoot, expected.module);
    if (!isInside(options.repositoryRoot, filename)) {
      throw new Error('Promotion dependency escapes repository root');
    }
    const source = stagedByFile.has(expected.module)
      ? stagedByFile.get(expected.module)
      : await fs.readFile(filename, 'utf8');
    if (sha256(source) !== expected.sha256) {
      throw new Error('Promotion dependency changed before materialization');
    }
    records.push({ file: expected.module, source });
  }
  assertPublicModuleSources(records, { strictFiles: stagedByFile.keys() });
}

function isInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function fileExists(filename) {
  try {
    await fs.access(filename);
    return true;
  } catch {
    return false;
  }
}

function isHash(value) {
  return typeof value === 'string' && HASH.test(value);
}
