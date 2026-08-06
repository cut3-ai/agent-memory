import {
  cloneJson,
  requireFunction,
  requireHash,
  timestamp,
} from './shared.js';

/**
 * Reference CAS store for tests and one-process tools. Production should inject
 * a durable database implementation with the same three methods.
 */
export function createInMemoryOnlineMemoryStore(initialRecords = []) {
  if (!Array.isArray(initialRecords)) throw new TypeError('initialRecords must be an array');
  const records = new Map();
  for (const record of initialRecords) {
    const revisionSha256 = requireHash(record?.revisionSha256, 'initial record revisionSha256');
    if (records.has(revisionSha256)) throw new TypeError('initialRecords contain a duplicate revision');
    records.set(revisionSha256, cloneJson(record));
  }
  return Object.freeze({
    async load(revisionSha256) {
      const value = records.get(requireHash(revisionSha256, 'revisionSha256'));
      return value === undefined ? null : cloneJson(value);
    },
    async compareAndSet(revisionSha256, expectedVersion, next) {
      const revision = requireHash(revisionSha256, 'revisionSha256');
      const current = records.get(revision);
      const version = current?.version ?? null;
      if (version !== expectedVersion) return false;
      if (next?.revisionSha256 !== revision) throw new TypeError('stored revision key mismatch');
      records.set(revision, cloneJson(next));
      return true;
    },
    async list() {
      return [...records.values()]
        .sort((left, right) => left.revisionSha256.localeCompare(right.revisionSha256))
        .map(cloneJson);
    },
  });
}

/** Process-local scheduler. `resume()` restores it from the durable store. */
export function createOnlineMemoryTimeoutScheduler(options = {}) {
  const now = options.clock ?? Date.now;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  requireFunction(now, 'scheduler clock');
  requireFunction(setTimer, 'setTimer');
  requireFunction(clearTimer, 'clearTimer');
  const timers = new Map();
  const cancel = async (key) => {
    if (typeof key !== 'string' || key.length === 0) throw new TypeError('schedule key is required');
    const timer = timers.get(key);
    if (timer !== undefined) clearTimer(timer);
    timers.delete(key);
  };
  return Object.freeze({
    cancel,
    async schedule(key, atMs, task) {
      await cancel(key);
      timestamp(atMs, 'schedule atMs');
      requireFunction(task, 'scheduled task');
      const delay = Math.min(
        2_147_483_647,
        Math.max(0, atMs - timestamp(now(), 'scheduler clock()')),
      );
      const timer = setTimer(() => {
        timers.delete(key);
        task();
      }, delay);
      if (typeof timer?.unref === 'function') timer.unref();
      timers.set(key, timer);
    },
  });
}
