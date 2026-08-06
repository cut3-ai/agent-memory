import crypto from 'node:crypto';

import { MODEL_LAB_PHASES } from './checkpoint.js';

const HASH = /^[a-f0-9]{64}$/u;
const PROVIDER_PHASE = Object.freeze({
  kimi: 'kimi-selected',
  anthropic: 'anthropic-reviewed',
});

/** Seal the request boundary before any provider network call begins. */
export function createProviderCallIntent(value) {
  const body = normalizeIntentBody(value);
  return deepFreeze({
    ...body,
    intentSha256: sha256(stableJson(body)),
  });
}

export function validateProviderCallIntent(value, expected = {}) {
  assertExactKeys(value, [
    'schemaVersion',
    'bindingSha256',
    'previousCheckpointSha256',
    'expectedCheckpointSequence',
    'round',
    'provider',
    'expectedPhase',
    'advisoryRequestSha256',
    'intentSha256',
  ], 'provider call intent');
  const { intentSha256, ...inputBody } = value;
  const body = normalizeIntentBody(inputBody);
  if (!HASH.test(intentSha256) || sha256(stableJson(body)) !== intentSha256) {
    throw new Error('Provider call intent hash mismatch');
  }
  if (expected.bindingSha256 !== undefined && body.bindingSha256 !== expected.bindingSha256) {
    throw new Error('Provider call intent binding mismatch');
  }
  return deepFreeze({ ...body, intentSha256 });
}

export function providerIntentCoveredByCheckpoint(intentValue, checkpoint) {
  const intent = validateProviderCallIntent(intentValue);
  if (!checkpoint || typeof checkpoint !== 'object') return false;
  if (checkpoint.bindingSha256 !== intent.bindingSha256
      || checkpoint.previousCheckpointSha256 !== intent.previousCheckpointSha256
      || checkpoint.sequence !== intent.expectedCheckpointSequence
      || checkpoint.round !== intent.round
      || checkpoint.phase !== intent.expectedPhase) {
    return false;
  }
  if (intent.provider === 'kimi') {
    return checkpoint.active?.selection?.provider === 'kimi';
  }
  return checkpoint.active?.review?.provider === 'anthropic';
}

export function advisoryRequestSha256(request) {
  return sha256(stableJson(request));
}

function normalizeIntentBody(value) {
  assertExactKeys(value, [
    'schemaVersion',
    'bindingSha256',
    'previousCheckpointSha256',
    'expectedCheckpointSequence',
    'round',
    'provider',
    'expectedPhase',
    'advisoryRequestSha256',
  ], 'provider call intent body');
  if (value.schemaVersion !== 1) throw new Error('Unsupported provider call intent version');
  if (!HASH.test(value.bindingSha256)) throw new Error('Provider call intent binding is invalid');
  if (value.previousCheckpointSha256 !== null
      && !HASH.test(value.previousCheckpointSha256)) {
    throw new Error('Provider call intent previous checkpoint is invalid');
  }
  if (!Number.isSafeInteger(value.expectedCheckpointSequence)
      || value.expectedCheckpointSequence < 1) {
    throw new Error('Provider call intent checkpoint sequence is invalid');
  }
  if (!Number.isSafeInteger(value.round) || value.round < 1 || value.round > 20) {
    throw new Error('Provider call intent round is invalid');
  }
  if (!Object.hasOwn(PROVIDER_PHASE, value.provider)) {
    throw new Error('Provider call intent provider is invalid');
  }
  if (!MODEL_LAB_PHASES.includes(value.expectedPhase)
      || value.expectedPhase !== PROVIDER_PHASE[value.provider]) {
    throw new Error('Provider call intent phase is invalid');
  }
  if (!HASH.test(value.advisoryRequestSha256)) {
    throw new Error('Provider call intent request hash is invalid');
  }
  return {
    schemaVersion: 1,
    bindingSha256: value.bindingSha256,
    previousCheckpointSha256: value.previousCheckpointSha256,
    expectedCheckpointSequence: value.expectedCheckpointSequence,
    round: value.round,
    provider: value.provider,
    expectedPhase: value.expectedPhase,
    advisoryRequestSha256: value.advisoryRequestSha256,
  };
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} contains unsupported fields`);
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
