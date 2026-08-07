export const MEMORY_ACTION = Object.freeze({
  DISCARD: 'discard',
  SAVE: 'save',
  WAIT: 'wait',
});

const NEGATIVE = new Set([
  'revision.corrected',
  'revision.deleted',
  'revision.manual-edited',
  'revision.regenerated',
  'revision.reverted',
  'render.failed',
  'compile.failed',
]);

const SUCCESS = new Set([
  'workspace.exported',
  'workspace.published',
  'workspace.reused',
  'workspace.next-task-unchanged',
]);

/** Exact workspace events decide save/discard. No score, model or silent timeout. */
export function decideOnlineMemory(events) {
  if (!Array.isArray(events)) throw new TypeError('events must be an array');
  const types = events.map((event) => String(event?.type ?? ''));
  const negative = types.find((type) => NEGATIVE.has(type));
  if (negative) return Object.freeze({ action: MEMORY_ACTION.DISCARD, reason: negative });

  const compiled = types.includes('compile.succeeded');
  const rendered = types.includes('render.succeeded');
  const success = [...SUCCESS].find((type) => types.includes(type));
  if (compiled && rendered && success) {
    return Object.freeze({ action: MEMORY_ACTION.SAVE, reason: success });
  }
  if (success && (!compiled || !rendered)) {
    return Object.freeze({ action: MEMORY_ACTION.WAIT, reason: 'awaiting-compile-and-render' });
  }
  return Object.freeze({ action: MEMORY_ACTION.WAIT, reason: 'no-success-signal' });
}
