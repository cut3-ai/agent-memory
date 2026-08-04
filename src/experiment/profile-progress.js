import fs from 'node:fs/promises';
import path from 'node:path';

import { assertPublicArtifact } from '../memory/privacy.js';
import {
  providerIntentCoveredByCheckpoint,
  validateProviderCallIntent,
} from '../model-lab/intent.js';
import {
  removeFileDurably,
  writeJsonAtomically,
} from './durable-storage.js';

export const PROVIDER_INFLIGHT_FILE = 'provider-inflight.json';

export class AmbiguousProviderCallError extends Error {
  constructor(intent, code = 'provider-call-outcome-ambiguous') {
    super('A provider call may have been sent without a durable response checkpoint; manual reconciliation is required and automatic replay is disabled');
    this.name = 'AmbiguousProviderCallError';
    this.code = code;
    this.provider = intent?.provider ?? null;
    this.round = intent?.round ?? null;
    this.expectedPhase = intent?.expectedPhase ?? null;
    this.intentSha256 = intent?.intentSha256 ?? null;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      provider: this.provider,
      round: this.round,
      expectedPhase: this.expectedPhase,
      intentSha256: this.intentSha256,
    };
  }
}

export async function persistProviderCallIntent(directory, value) {
  const intent = validateProviderCallIntent(value);
  assertPublicArtifact(intent);
  let existing;
  try {
    existing = await readIntentFile(directory, intent.bindingSha256);
  } catch {
    throw new AmbiguousProviderCallError(null, 'provider-intent-invalid');
  }
  if (existing !== null) {
    throw new AmbiguousProviderCallError(existing, 'provider-intent-already-present');
  }
  try {
    await writeJsonAtomically(
      path.join(directory, PROVIDER_INFLIGHT_FILE),
      intent,
      true,
      { rejectExisting: true },
    );
  } catch (error) {
    if (error?.code !== 'DURABLE_TARGET_EXISTS') throw error;
    let racedIntent = null;
    try {
      racedIntent = await readIntentFile(directory, intent.bindingSha256);
    } catch {
      // The existence of an unreadable competing journal is itself ambiguous.
    }
    throw new AmbiguousProviderCallError(racedIntent, 'provider-intent-already-present');
  }
  return intent;
}

export async function settleProviderCallIntent(directory, intentValue, checkpoint) {
  const intent = validateProviderCallIntent(intentValue);
  if (!providerIntentCoveredByCheckpoint(intent, checkpoint)) {
    throw new Error('Provider call intent is not covered by its durable checkpoint');
  }
  const current = await readIntentFile(directory, intent.bindingSha256);
  if (current === null) return false;
  if (current.intentSha256 !== intent.intentSha256) {
    throw new AmbiguousProviderCallError(current, 'provider-intent-replaced');
  }
  return removeFileDurably(path.join(directory, PROVIDER_INFLIGHT_FILE));
}

/**
 * Recover only the unambiguous case where the matching phase checkpoint is
 * already durable. Any intent without that proof blocks before provider setup.
 */
export async function reconcileProviderCallIntent(directory, options) {
  let intent;
  try {
    intent = await readIntentFile(directory, options.bindingSha256);
  } catch {
    throw new AmbiguousProviderCallError(null, 'provider-intent-invalid');
  }
  if (intent === null) return { status: 'clear', intent: null };
  const checkpoint = options.checkpoints.find(({ sequence }) => (
    sequence === intent.expectedCheckpointSequence
  ));
  if (!checkpoint || !providerIntentCoveredByCheckpoint(intent, checkpoint)) {
    throw new AmbiguousProviderCallError(intent);
  }
  await settleProviderCallIntent(directory, intent, checkpoint);
  return { status: 'settled-checkpoint-recovered', intent };
}

async function readIntentFile(directory, bindingSha256) {
  const filePath = path.join(directory, PROVIDER_INFLIGHT_FILE);
  let bytes;
  try {
    bytes = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (Buffer.byteLength(bytes, 'utf8') > 64_000) {
    throw new Error('Provider call intent is too large');
  }
  let value;
  try {
    value = JSON.parse(bytes);
  } catch {
    throw new Error('Provider call intent is invalid JSON');
  }
  assertPublicArtifact(value);
  return validateProviderCallIntent(value, { bindingSha256 });
}
