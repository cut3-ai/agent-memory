import { DEFAULT_OUTCOME_WINDOW_MS } from '../outcome.js';

export const ONLINE_MEMORY_OBSERVER_SCHEMA_VERSION = 2;
export const ONLINE_MEMORY_CALLBACK_SCHEMA_VERSION = 2;
export const ONLINE_MEMORY_CANDIDATE_BINDING_SCHEMA_VERSION = 1;
export const DEFAULT_PUBLICATION_HOLD_MS = DEFAULT_OUTCOME_WINDOW_MS;
export const DEFAULT_OBSERVER_OPERATION_LEASE_MS = 30_000;
export const DEFAULT_OBSERVER_RETRY_MS = 5_000;
export const MAXIMUM_OBSERVER_TRANSITIONS = 32;
export const MAXIMUM_OBSERVER_INPUT_EVENTS = 2_000;

export const ONLINE_MEMORY_LIFECYCLE_STATES = Object.freeze([
  'observing',
  'discarded',
  'quarantined',
  'cancelled',
  'committed',
  'revoked',
]);

export const OPERATION_KINDS = Object.freeze(['quarantine', 'commit', 'cancel', 'revoke']);
export const OPERATION_STATUSES = Object.freeze(['pending', 'running']);
export const HASH = /^[a-f0-9]{64}$/u;
