import crypto from 'node:crypto';

import {
  normalizeAggregateMetrics,
  normalizeCandidateId,
  normalizeReviewCheckpoints,
  normalizeRounds,
} from './contracts.js';
import { assertPublicReceipt } from './receipt.js';

const SHA256 = /^[a-f0-9]{64}$/u;
export const MODEL_LAB_PHASES = Object.freeze([
  'kimi-selected',
  'evaluated',
  'anthropic-reviewed',
]);

/** Hash-seal one cumulative, privacy-safe phase snapshot. */
export function createModelLabCheckpoint(value) {
  const body = normalizeCheckpointBody(value);
  return deepFreeze({
    ...body,
    checkpointSha256: sha256(stableJson(body)),
  });
}

export function validateModelLabCheckpoint(value, expected = {}) {
  assertExactKeys(value, [
    'schemaVersion',
    'bindingSha256',
    'previousCheckpointSha256',
    'sequence',
    'roundsRequested',
    'reviewCheckpoints',
    'round',
    'phase',
    'completedRounds',
    'currentMetrics',
    'advisorySeedId',
    'evaluations',
    'active',
    'checkpointSha256',
  ], 'checkpoint');
  const { checkpointSha256, ...inputBody } = value;
  const body = normalizeCheckpointBody(inputBody);
  if (!SHA256.test(checkpointSha256) || sha256(stableJson(body)) !== checkpointSha256) {
    throw new Error('Model lab checkpoint hash mismatch');
  }
  if (expected.bindingSha256 !== undefined && body.bindingSha256 !== expected.bindingSha256) {
    throw new Error('Model lab checkpoint binding mismatch');
  }
  if (expected.previousCheckpointSha256 !== undefined
      && body.previousCheckpointSha256 !== expected.previousCheckpointSha256) {
    throw new Error('Model lab checkpoint chain mismatch');
  }
  if (expected.candidateIds !== undefined) {
    const catalog = new Set(expected.candidateIds.map(normalizeCandidateId));
    if (!catalog.has(body.active.candidateId)
        || body.evaluations.some(({ candidateId }) => !catalog.has(candidateId))) {
      throw new Error('Model lab checkpoint candidate is not in the bound catalog');
    }
  }
  if (expected.initialMetrics !== undefined) {
    const initialMetrics = normalizeAggregateMetrics(expected.initialMetrics, 'initialMetrics');
    const reconstructed = reconstructIncumbent(initialMetrics, body.evaluations, body.active);
    if (stableJson(reconstructed) !== stableJson(body.currentMetrics)) {
      throw new Error('Model lab checkpoint current metrics are inconsistent');
    }
  }
  return deepFreeze({ ...body, checkpointSha256 });
}

function normalizeCheckpointBody(value) {
  assertExactKeys(value, [
    'schemaVersion',
    'bindingSha256',
    'previousCheckpointSha256',
    'sequence',
    'roundsRequested',
    'reviewCheckpoints',
    'round',
    'phase',
    'completedRounds',
    'currentMetrics',
    'advisorySeedId',
    'evaluations',
    'active',
  ], 'checkpoint body');
  if (value.schemaVersion !== 2) throw new Error('Unsupported model lab checkpoint version');
  if (!SHA256.test(value.bindingSha256)) throw new Error('Checkpoint binding hash is invalid');
  if (value.previousCheckpointSha256 !== null && !SHA256.test(value.previousCheckpointSha256)) {
    throw new Error('Previous checkpoint hash is invalid');
  }
  const rounds = normalizeRounds(value.roundsRequested);
  const checkpoints = normalizeReviewCheckpoints(value.reviewCheckpoints, rounds);
  if (!Number.isSafeInteger(value.round) || value.round < 1 || value.round > rounds) {
    throw new Error('Checkpoint round is invalid');
  }
  if (!MODEL_LAB_PHASES.includes(value.phase)) throw new Error('Checkpoint phase is invalid');
  if (value.phase === 'anthropic-reviewed' && !checkpoints.includes(value.round)) {
    throw new Error('Anthropic phase is only valid at a configured review checkpoint');
  }
  const expectedSequence = phaseSequence(value.round, value.phase, checkpoints);
  if (value.sequence !== expectedSequence) throw new Error('Checkpoint phase sequence is invalid');
  if (value.completedRounds !== value.round - 1) {
    throw new Error('Checkpoint completed-round count is invalid');
  }
  if (!Array.isArray(value.evaluations)
      || value.evaluations.length !== value.completedRounds) {
    throw new Error('Checkpoint evaluations must contain completed rounds only');
  }

  const normalizedEvaluations = normalizeCompletedEvaluations(value.evaluations, checkpoints);
  const active = normalizeActive(value.active, value.phase, value.round, checkpoints, normalizedEvaluations);
  const lastCompletedReview = [...normalizedEvaluations].reverse()
    .find(({ review }) => review !== null)?.review.candidateId ?? null;
  const expectedAdvisorySeedId = value.phase === 'anthropic-reviewed'
    ? active.review.candidateId
    : lastCompletedReview;
  const advisorySeedId = value.advisorySeedId === null
    ? null
    : normalizeCandidateId(value.advisorySeedId);
  if (advisorySeedId !== expectedAdvisorySeedId) {
    throw new Error('Checkpoint advisory seed does not match its latest review');
  }

  return {
    schemaVersion: 2,
    bindingSha256: value.bindingSha256,
    previousCheckpointSha256: value.previousCheckpointSha256,
    sequence: value.sequence,
    roundsRequested: rounds,
    reviewCheckpoints: checkpoints,
    round: value.round,
    phase: value.phase,
    completedRounds: value.completedRounds,
    currentMetrics: normalizeAggregateMetrics(value.currentMetrics, 'checkpoint currentMetrics'),
    advisorySeedId,
    evaluations: normalizedEvaluations,
    active,
  };
}

function normalizeCompletedEvaluations(values, checkpoints) {
  const ids = new Set();
  let blockStart = 0;
  return values.map((evaluation, index) => {
    const round = index + 1;
    const normalized = normalizeEvaluation(evaluation, round);
    if (ids.has(normalized.candidateId)) throw new Error('Checkpoint candidate ids must be unique');
    ids.add(normalized.candidateId);
    if (checkpoints.includes(round)) {
      if (normalized.review === null || normalized.review.provider !== 'anthropic') {
        throw new Error('Checkpoint is missing a configured Anthropic review');
      }
      const blockIds = [...values.slice(blockStart, round - 1).map(({ candidateId }) => candidateId), normalized.candidateId];
      if (!blockIds.includes(normalized.review.candidateId)) {
        throw new Error('Checkpoint review receipt does not match its completed block');
      }
      blockStart = round;
    } else if (normalized.review !== null) {
      throw new Error('Checkpoint contains a review outside configured checkpoints');
    }
    return normalized;
  });
}

function normalizeEvaluation(value, round) {
  assertExactKeys(value, [
    'round', 'candidateId', 'accepted', 'candidateMetrics', 'selection', 'review',
  ], `checkpoint evaluation ${round}`);
  if (value.round !== round) throw new Error('Checkpoint rounds must be contiguous');
  const candidateId = normalizeCandidateId(value.candidateId);
  if (typeof value.accepted !== 'boolean') throw new Error('Checkpoint acceptance is invalid');
  const selection = assertPublicReceipt(value.selection);
  if (selection.provider !== 'kimi' || selection.candidateId !== candidateId) {
    throw new Error('Checkpoint selection receipt does not match its evaluation');
  }
  const review = value.review === null ? null : assertPublicReceipt(value.review);
  return {
    round,
    candidateId,
    accepted: value.accepted,
    candidateMetrics: normalizeAggregateMetrics(
      value.candidateMetrics,
      `checkpoint candidate ${candidateId} metrics`,
    ),
    selection,
    review,
  };
}

function normalizeActive(value, phase, round, checkpoints, completed) {
  assertExactKeys(value, [
    'candidateId', 'selection', 'candidateMetrics', 'accepted', 'review',
  ], 'checkpoint active phase');
  const candidateId = normalizeCandidateId(value.candidateId);
  if (completed.some((entry) => entry.candidateId === candidateId)) {
    throw new Error('Active checkpoint candidate was already completed');
  }
  const selection = assertPublicReceipt(value.selection);
  if (selection.provider !== 'kimi' || selection.candidateId !== candidateId) {
    throw new Error('Active selection receipt does not match its candidate');
  }
  if (phase === 'kimi-selected') {
    if (value.candidateMetrics !== null || value.accepted !== null || value.review !== null) {
      throw new Error('Kimi selection checkpoint contains later-phase state');
    }
    return { candidateId, selection, candidateMetrics: null, accepted: null, review: null };
  }
  const candidateMetrics = normalizeAggregateMetrics(
    value.candidateMetrics,
    `checkpoint candidate ${candidateId} metrics`,
  );
  if (typeof value.accepted !== 'boolean') throw new Error('Active acceptance is invalid');
  if (phase === 'evaluated') {
    if (value.review !== null) throw new Error('Evaluated checkpoint contains a review');
    return { candidateId, selection, candidateMetrics, accepted: value.accepted, review: null };
  }
  if (!checkpoints.includes(round)) throw new Error('Unexpected active Anthropic review');
  const review = assertPublicReceipt(value.review);
  const lastReviewRound = [...completed].reverse().find(({ review: receipt }) => receipt !== null)?.round ?? 0;
  const blockIds = [
    ...completed.slice(lastReviewRound).map((entry) => entry.candidateId),
    candidateId,
  ];
  if (review.provider !== 'anthropic' || !blockIds.includes(review.candidateId)) {
    throw new Error('Active review receipt does not match its checkpoint block');
  }
  return { candidateId, selection, candidateMetrics, accepted: value.accepted, review };
}

function reconstructIncumbent(initialMetrics, completed, active) {
  let current = initialMetrics;
  for (const evaluation of completed) {
    if (evaluation.accepted) current = evaluation.candidateMetrics;
  }
  if (active.accepted === true) current = active.candidateMetrics;
  return current;
}

function phaseSequence(round, phase, checkpoints) {
  const priorReviews = checkpoints.filter((checkpoint) => checkpoint < round).length;
  const ordinal = phase === 'kimi-selected' ? 1 : phase === 'evaluated' ? 2 : 3;
  return (round - 1) * 2 + priorReviews + ordinal;
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
