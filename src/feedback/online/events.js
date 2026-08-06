import {
  canonicalRevisionOutcomeEvent,
  MAXIMUM_OUTCOME_EVENTS,
  REVISION_OUTCOME_ACTIONS,
} from '../outcome.js';
import { sha256, stableStringify } from '../../lib.js';
import { MAXIMUM_OBSERVER_INPUT_EVENTS } from './constants.js';

export function normalizeEventBatch(value) {
  const input = Array.isArray(value) ? value : [value];
  if (input.length < 1 || input.length > MAXIMUM_OBSERVER_INPUT_EVENTS) {
    throw new TypeError(
      `events must contain between 1 and ${MAXIMUM_OBSERVER_INPUT_EVENTS} entries`,
    );
  }
  const canonical = input.map(canonicalRevisionOutcomeEvent);
  oneRevision(canonical);
  return compactEvents(canonical);
}

export function mergeEvents(left, right) {
  const byHash = new Map();
  for (const event of [...left, ...right]) {
    const canonical = canonicalRevisionOutcomeEvent(event);
    const eventSha256 = sha256(stableStringify(canonical));
    byHash.set(eventSha256, canonical);
  }
  const entries = [...byHash.entries()]
    .sort(([leftHash, leftEvent], [rightHash, rightEvent]) => (
      leftEvent.atMs - rightEvent.atMs
        || leftEvent.type.localeCompare(rightEvent.type)
        || leftHash.localeCompare(rightHash)
    ));
  oneRevision(entries.map(([, event]) => event));
  return compactEntries(entries);
}

export function oneRevision(events) {
  const revisions = [...new Set(events.map(({ revisionSha256 }) => revisionSha256))];
  if (revisions.length !== 1) throw new TypeError('event batch must target exactly one revision');
  return revisions[0];
}

/**
 * Keep the reducer's semantic authority, not an unbounded click transcript.
 *
 * The projection retains generation conflicts, each stage's effective latest
 * validation, the earliest non-generation event (ordering guard), the latest
 * event for every qualified signal (including terminal negative), and one
 * ignored observation. Therefore preview/autosave traffic can never crowd a
 * later correction out of the durable record.
 */
function compactEvents(events) {
  const byHash = new Map();
  for (const event of events) {
    const eventSha256 = sha256(stableStringify(event));
    byHash.set(eventSha256, event);
  }
  return compactEntries([...byHash.entries()].sort(compareEntry));
}

function compactEntries(entries) {
  const keep = new Map();
  const generations = entries.filter(([, event]) => event.type === 'generation');
  for (const entry of generations.slice(0, 2)) keep.set(entry[0], entry[1]);

  const nonGeneration = entries.filter(([, event]) => event.type !== 'generation');
  if (nonGeneration.length > 0) keep.set(nonGeneration[0][0], nonGeneration[0][1]);

  for (const stage of ['compile', 'render']) {
    const attempts = entries.filter(([, event]) => (
      event.type === 'validation' && event.stage === stage
    ));
    if (attempts.length === 0) continue;
    const latestAtMs = Math.max(...attempts.map(([, event]) => event.atMs));
    const latest = attempts.filter(([, event]) => event.atMs === latestAtMs);
    const selected = latest.find(([, event]) => event.status === 'failed') ?? latest[0];
    keep.set(selected[0], selected[1]);
  }

  const workspace = entries.filter(([, event]) => event.type === 'workspace-action');
  for (const signal of ['negative', 'ambiguous', 'positive', 'neutral']) {
    const matching = workspace.filter(([, event]) => REVISION_OUTCOME_ACTIONS[event.action] === signal);
    const selected = matching.at(-1);
    if (selected) keep.set(selected[0], selected[1]);
  }
  const ignored = workspace.filter(([, event]) => REVISION_OUTCOME_ACTIONS[event.action] === null).at(-1);
  if (ignored) keep.set(ignored[0], ignored[1]);

  const compacted = [...keep.entries()].sort(compareEntry).map(([, event]) => event);
  if (compacted.length > MAXIMUM_OUTCOME_EVENTS) {
    throw new TypeError(`compacted events cannot exceed ${MAXIMUM_OUTCOME_EVENTS} entries`);
  }
  return Object.freeze(compacted);
}

function compareEntry([leftHash, leftEvent], [rightHash, rightEvent]) {
  return leftEvent.atMs - rightEvent.atMs
    || leftEvent.type.localeCompare(rightEvent.type)
    || leftHash.localeCompare(rightHash);
}
