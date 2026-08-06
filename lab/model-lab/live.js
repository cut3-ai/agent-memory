import crypto from 'node:crypto';

import {
  createProviderFromFile,
} from '../../src/providers/index.js';
import {
  createCandidateChoiceSchema,
  DEFAULT_REVIEW_CHECKPOINTS,
  MAX_MODEL_LAB_ROUNDS,
  normalizeAggregateMetrics,
  normalizeCandidateCatalog,
  normalizeReviewCheckpoints,
  normalizeRounds,
} from './contracts.js';
import { validateModelLabCheckpoint } from './checkpoint.js';
import {
  REVIEW_SYSTEM,
  REVIEW_TOOL_NAME,
  runModelAdvisoryLab,
  SELECT_SYSTEM,
  SELECT_TOOL_NAME,
} from './loop.js';

export const LIVE_MODEL_LAB_CONFIRMATION = 'RUN_20_KIMI_AND_4_ANTHROPIC_CALLS';
export const LIVE_MODEL_LAB_CALLS = Object.freeze({
  kimi: 20,
  anthropic: 4,
  total: 24,
});
const OPAQUE_CANDIDATE_ID = /^(?:[a-z][a-z0-9]{0,7}_)?[a-f0-9]{8,64}$/;

/**
 * Validate a run and produce a public, no-network execution plan. The plan
 * contains only opaque ids, counts, and hashes of aggregate numeric data.
 */
export function prepareModelLabRun(options = {}) {
  const rounds = normalizeRounds(options.rounds ?? MAX_MODEL_LAB_ROUNDS);
  const reviewCheckpoints = normalizeReviewCheckpoints(options.reviewCheckpoints, rounds);
  const candidates = normalizeCandidateCatalog(options.candidates, rounds);
  const initialMetrics = normalizeAggregateMetrics(options.initialMetrics, 'initialMetrics');
  const candidateIds = Object.freeze(candidates.map(({ id }) => id));
  const providerCalls = {
    kimi: rounds,
    anthropic: reviewCheckpoints.length,
    total: rounds + reviewCheckpoints.length,
  };
  const planBody = {
    schemaVersion: 1,
    mode: 'dry-run',
    rounds,
    reviewCheckpoints,
    calls: providerCalls,
    providerResponseCheckpoints: providerCalls.total,
    phaseCheckpoints: (rounds * 2) + reviewCheckpoints.length,
    candidateIds,
    searchSpaceSize: candidateIds.length,
    candidateCatalogSha256: sha256(stableJson(candidates)),
    initialMetricsSha256: sha256(stableJson(initialMetrics)),
    requiredEnvironmentKeys: ['MOONSHOT_API_KEY', 'ANTHROPIC_API_KEY'],
    credentialFile: '.env',
    sendsOnlyOpaqueIdsAndAggregateMetrics: true,
    sequentialRevealRequired: true,
    sequentialRevealConfigured: typeof options.revealCandidateIds === 'function',
    durablePhaseCheckpointsRequired: true,
    durablePhaseCheckpointsConfigured: typeof options.onPhaseCheckpoint === 'function',
    durableProviderIntentsRequired: true,
    durableProviderIntentsConfigured: typeof options.onProviderIntent === 'function'
      && typeof options.onProviderCheckpointed === 'function',
    modelAcceptanceAuthority: false,
    modelSearchOrderAuthority: true,
    paidCallsAuthorized: false,
  };
  return deepFreeze({
    ...planBody,
    planSha256: sha256(stableJson(planBody)),
  });
}

/**
 * Explicit live entry point. It is deliberately impossible to invoke by
 * accident: exactly twenty Kimi calls and four Anthropic reviews are required,
 * retries are disabled, and a literal cost acknowledgement is mandatory.
 */
export async function runLiveModelAdvisoryLab(options = {}) {
  const plan = prepareModelLabRun(options);
  assertProductionPlan(plan, options);
  if (options.resumeCheckpoint !== undefined) {
    validateModelLabCheckpoint(options.resumeCheckpoint, {
      bindingSha256: options.checkpointBindingSha256,
      candidateIds: plan.candidateIds,
      initialMetrics: options.initialMetrics,
    });
  }
  const providers = await createLiveAdvisoryProviders(options);
  return runModelAdvisoryLab({
    rounds: plan.rounds,
    reviewCheckpoints: plan.reviewCheckpoints,
    candidates: options.candidates,
    initialMetrics: options.initialMetrics,
    kimi: providers.kimi,
    anthropic: providers.anthropic,
    evaluateCandidate: options.evaluateCandidate,
    acceptCandidate: options.acceptCandidate,
    revealCandidateIds: options.revealCandidateIds,
    checkpointBindingSha256: options.checkpointBindingSha256,
    resumeCheckpoint: options.resumeCheckpoint,
    onPhaseCheckpoint: options.onPhaseCheckpoint,
    onProviderIntent: options.onProviderIntent,
    onProviderCheckpointed: options.onProviderCheckpointed,
    onRound: options.onRound,
  });
}

export async function createLiveAdvisoryProviders(options = {}) {
  assertLiveConfirmation(options.confirmPaidCalls);
  if (options.maxRetries !== undefined && options.maxRetries !== 0) {
    throw new RangeError('Live model lab retries must remain disabled to preserve the 24-call budget');
  }
  for (const forbidden of ['apiKey', 'credential', 'envText', 'endpoint']) {
    if (options[forbidden] !== undefined) {
      throw new TypeError(`Live model lab does not accept ${forbidden}`);
    }
  }
  const common = {
    cwd: options.cwd,
    envFilePath: options.envFilePath,
    env: options.env,
    timeoutMs: options.timeoutMs ?? 60_000,
    maxRetries: 0,
    maxTokens: options.maxTokens ?? 512,
    fetchImpl: options.fetchImpl,
    sleepImpl: options.sleepImpl,
  };
  const [kimi, anthropic] = await Promise.all([
    createProviderFromFile({
      provider: 'kimi',
      model: options.kimiModel,
      ...common,
    }),
    createProviderFromFile({
      provider: 'anthropic',
      model: options.anthropicModel,
      ...common,
    }),
  ]);
  return Object.freeze({
    kimi: advisoryOnly(kimi, 'kimi'),
    anthropic: advisoryOnly(anthropic, 'anthropic'),
  });
}

export function assertSafeAdvisoryRequest(request, expectedProvider) {
  if (!['kimi', 'anthropic'].includes(expectedProvider)) {
    throw new RangeError('Unsupported advisory provider');
  }
  assertExactObjectKeys(request, ['name', 'prompt', 'schema', 'system'], 'advisory request');
  const expectedName = expectedProvider === 'kimi' ? SELECT_TOOL_NAME : REVIEW_TOOL_NAME;
  const expectedSystem = expectedProvider === 'kimi' ? SELECT_SYSTEM : REVIEW_SYSTEM;
  if (request.name !== expectedName || request.system !== expectedSystem) {
    throw new Error('Provider received an unsupported advisory request');
  }
  let payload;
  try {
    payload = JSON.parse(request.prompt);
  } catch {
    throw new Error('Advisory prompt must contain bounded JSON data');
  }
  const allowedPayloadKeys = ['candidates', 'currentMetrics', 'round', 'roundsTotal'];
  const requiredPayloadKeys = ['candidates', 'currentMetrics', 'round', 'roundsTotal'];
  assertAllowedObjectKeys(payload, allowedPayloadKeys, requiredPayloadKeys, 'advisory payload');
  if (!Number.isSafeInteger(payload.round)
      || payload.round < 1
      || payload.round > MAX_MODEL_LAB_ROUNDS
      || payload.roundsTotal !== MAX_MODEL_LAB_ROUNDS) {
    throw new Error('Advisory round metadata is invalid');
  }
  const candidates = normalizeCandidateCatalog(payload.candidates, 1);
  normalizeAggregateMetrics(payload.currentMetrics, 'currentMetrics');
  const ids = candidates.map(({ id }) => id);
  const expectedSchema = createCandidateChoiceSchema(ids);
  if (stableJson(request.schema) !== stableJson(expectedSchema)) {
    throw new Error('Advisory response schema does not match candidate ids');
  }
  return request;
}

function advisoryOnly(provider, expectedProvider) {
  return Object.freeze({
    provider: provider.provider,
    model: provider.model,
    async generateStructured(request) {
      assertSafeAdvisoryRequest(request, expectedProvider);
      return provider.generateStructured(request);
    },
  });
}

function assertProductionPlan(plan, options) {
  assertLiveConfirmation(options.confirmPaidCalls);
  if (plan.rounds !== MAX_MODEL_LAB_ROUNDS
      || plan.candidateIds.length <= MAX_MODEL_LAB_ROUNDS
      || stableJson(plan.reviewCheckpoints) !== stableJson(DEFAULT_REVIEW_CHECKPOINTS)
      || stableJson(plan.calls) !== stableJson(LIVE_MODEL_LAB_CALLS)) {
    throw new Error('Live model lab requires a search space larger than 20, 20 Kimi calls, and 4 reviews');
  }
  if (typeof options.revealCandidateIds !== 'function') {
    throw new Error('Live model lab requires bounded sequential candidate reveal');
  }
  if (!/^[a-f0-9]{64}$/u.test(options.checkpointBindingSha256 ?? '')
      || typeof options.onPhaseCheckpoint !== 'function') {
    throw new Error('Live model lab requires a bound durable phase checkpoint writer');
  }
  if (typeof options.onProviderIntent !== 'function'
      || typeof options.onProviderCheckpointed !== 'function') {
    throw new Error('Live model lab requires a durable provider inflight journal');
  }
  if (plan.candidateIds.some((id) => !OPAQUE_CANDIDATE_ID.test(id))) {
    throw new Error('Live model lab candidate ids must be opaque hashes');
  }
}

function assertLiveConfirmation(value) {
  if (value !== LIVE_MODEL_LAB_CONFIRMATION) {
    throw new Error('Paid model calls require explicit 20+4 confirmation');
  }
}

function assertExactObjectKeys(value, expected, label) {
  assertAllowedObjectKeys(value, expected, expected, label);
}

function assertAllowedObjectKeys(value, allowed, required, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const actual = Object.keys(value);
  if (actual.some((key) => !allowed.includes(key))
      || required.some((key) => !Object.hasOwn(value, key))) {
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
