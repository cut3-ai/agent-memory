import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { stableStringify } from '../../src/lib.js';

/** Write JSON through a synced same-directory temp file and atomic rename. */
export async function writeJsonAtomically(filePath, value, immutable = true, options = {}) {
  const target = path.resolve(filePath);
  const directory = path.dirname(target);
  const bytes = `${stableStringify(value, 2)}\n`;
  const rejectExisting = options.rejectExisting === true;
  await ensureDirectoryDurably(directory);

  if (immutable) {
    const existing = await readExisting(target);
    if (existing !== null) {
      if (rejectExisting) throw durableTargetExists();
      if (existing !== bytes) throw new Error('immutable-experiment-artifact-collision');
      await syncDirectory(directory);
      return;
    }
  }

  const temporary = path.join(
    directory,
    `.${path.basename(target)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await fs.open(temporary, 'wx');
    await handle.writeFile(bytes, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    if (immutable) {
      try {
        // Hard-link publication is the no-replace equivalent of rename: the
        // fully synced temp inode becomes visible atomically, while a second
        // writer cannot overwrite an existing checkpoint or intent.
        await fs.link(temporary, target);
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        if (rejectExisting) throw durableTargetExists();
        const existing = await readExisting(target);
        if (existing !== bytes) throw new Error('immutable-experiment-artifact-collision');
      }
    } else {
      await fs.rename(temporary, target);
    }
    await syncDirectory(directory);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporary).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}

async function ensureDirectoryDurably(directory) {
  try {
    const stat = await fs.stat(directory);
    if (!stat.isDirectory()) throw new Error('Durable storage parent is not a directory');
    return;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const parent = path.dirname(directory);
  if (parent === directory) throw new Error('Unable to create durable storage directory');
  await ensureDirectoryDurably(parent);
  try {
    await fs.mkdir(directory);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  await syncDirectory(parent);
  await syncDirectory(directory);
}

function durableTargetExists() {
  const error = new Error('durable-target-already-exists');
  error.code = 'DURABLE_TARGET_EXISTS';
  return error;
}

/** Remove a journal entry and sync the containing directory when supported. */
export async function removeFileDurably(filePath) {
  const target = path.resolve(filePath);
  try {
    await fs.unlink(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  await syncDirectory(path.dirname(target));
  return true;
}

async function readExisting(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function syncDirectory(directory) {
  let handle;
  try {
    handle = await fs.open(directory, 'r');
    await handle.sync();
  } catch (error) {
    // Windows and some filesystems do not expose directory fsync. File fsync
    // plus same-directory rename still applies; unsupported directory sync is
    // the only intentionally best-effort part of the protocol.
    if (!['EACCES', 'EBADF', 'EINVAL', 'EISDIR', 'ENOTSUP', 'EPERM'].includes(error?.code)) {
      throw error;
    }
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}
