import {
  assertAdvisoryProvider,
  createCandidateChoiceSchema,
  MAX_MODEL_LAB_ROUNDS,
  normalizeAggregateMetrics,
  normalizeCandidateCatalog,
  normalizeReviewCheckpoints,
  normalizeRounds,
} from './contracts.js';
import {
  createModelLabCheckpoint,
  validateModelLabCheckpoint,
} from './checkpoint.js';
import {
  advisoryRequestSha256,
  createProviderCallIntent,
} from './intent.js';
import { ProviderRequestError } from '../providers/index.js';
import { consumeStructuredChoice } from './receipt.js';

export const SELECT_SYSTEM = 'Choose exactly one opaque candidate identifier from the currently revealed search frontier. Base the choice only on supplied structural counters, boolean capability flags, and aggregate incumbent metrics. Use no information beyond this payload. Return only an object with the candidateId field.';
export const REVIEW_SYSTEM = 'Review the completed checkpoint block and choose exactly one opaque candidate identifier as the next search seed. Base the recommendation only on supplied aggregate evaluation counters. This is advisory and cannot accept a candidate. Return only an object with the candidateId field.';
export const SELECT_TOOL_NAME = 'select_candidate_v2';
export const REVIEW_TOOL_NAME = 'review_candidates_v2';

export async function runModelAdvisoryLab(options = {}) {
  const rounds = normalizeRounds(options.rounds ?? MAX_MODEL_LAB_ROUNDS);
  const checkpoints = normalizeReviewCheckpoints(options.reviewCheckpoints, rounds);
  const catalog = normalizeCandidateCatalog(options.candidates, rounds);
  const kimi = assertAdvisoryProvider(options.kimi, 'kimi');
  const anthropic = checkpoints.length > 0
    ? assertAdvisoryProvider(options.anthropic, 'anthropic')
    : null;
  if (typeof options.evaluateCandidate !== 'function') {
    throw new TypeError('evaluateCandidate callback is required');
  }
  if (typeof options.acceptCandidate !== 'function') {
    throw new TypeError('acceptCandidate callback is required');
  }
  const hasIntentWriter = typeof options.onProviderIntent === 'function';
  const hasIntentSettler = typeof options.onProviderCheckpointed === 'function';
  if (hasIntentWriter !== hasIntentSettler) {
    throw new TypeError('Provider intent persistence and settlement callbacks must be supplied together');
  }

  let currentMetrics = normalizeAggregateMetrics(options.initialMetrics, 'initialMetrics');
  const remaining = new Map(catalog.map((candidate) => [candidate.id, candidate]));
  const checkpointSet = new Set(checkpoints);
  const history = [];
  const evaluatedRecords = new Map();
  const evaluations = [];
  const evaluatedCandidateIds = [];
  const acceptedCandidateIds = [];
  let checkpointStart = 0;
  let advisorySeedId = null;
  let previousCheckpointSha256 = null;
  let checkpointSequence = 0;
  let startRound = 1;
  let pending = null;

  if (options.resumeCheckpoint !== undefined) {
    const resumed = validateModelLabCheckpoint(options.resumeCheckpoint, {
      bindingSha256: options.checkpointBindingSha256,
      candidateIds: catalog.map(({ id }) => id),
      initialMetrics: options.initialMetrics,
    });
    if (resumed.roundsRequested !== rounds
        || JSON.stringify(resumed.reviewCheckpoints) !== JSON.stringify(checkpoints)) {
      throw new Error('Model lab checkpoint plan mismatch');
    }
    for (const evaluation of resumed.evaluations) {
      restoreCompletedEvaluation(evaluation, {
        remaining,
        history,
        evaluations,
        evaluatedRecords,
        evaluatedCandidateIds,
        acceptedCandidateIds,
      });
    }
    currentMetrics = resumed.currentMetrics;
    advisorySeedId = resumed.advisorySeedId;
    previousCheckpointSha256 = resumed.checkpointSha256;
    checkpointSequence = resumed.sequence;
    startRound = resumed.round;
    const candidate = remaining.get(resumed.active.candidateId);
    if (!candidate || !remaining.delete(resumed.active.candidateId)) {
      throw new Error('Model lab checkpoint active candidate is unavailable');
    }
    pending = {
      round: resumed.round,
      phase: resumed.phase,
      candidate,
      selectionReceipt: resumed.active.selection,
      candidateMetrics: resumed.active.candidateMetrics,
      accepted: resumed.active.accepted,
      reviewReceipt: resumed.active.review,
    };
    checkpointStart = lastReviewedEvaluationIndex(evaluations);
    if (resumed.phase !== 'kimi-selected') {
      evaluatedCandidateIds.push(candidate.id);
      evaluatedRecords.set(candidate.id, resumed.active.candidateMetrics);
      if (resumed.active.accepted) acceptedCandidateIds.push(candidate.id);
    }
    if (resumed.phase === 'anthropic-reviewed') {
      checkpointStart = evaluatedCandidateIds.length;
    }
  }

  const persistPhase = async ({
    round,
    phase,
    candidate,
    selectionReceipt,
    candidateMetrics = null,
    accepted = null,
    reviewReceipt = null,
  }) => {
    if (typeof options.onPhaseCheckpoint !== 'function') return null;
    const checkpoint = createModelLabCheckpoint({
      schemaVersion: 2,
      bindingSha256: options.checkpointBindingSha256,
      previousCheckpointSha256,
      sequence: checkpointSequence + 1,
      roundsRequested: rounds,
      reviewCheckpoints: checkpoints,
      round,
      phase,
      completedRounds: evaluations.length,
      currentMetrics,
      advisorySeedId,
      evaluations,
      active: {
        candidateId: candidate.id,
        selection: selectionReceipt,
        candidateMetrics,
        accepted,
        review: reviewReceipt,
      },
    });
    await options.onPhaseCheckpoint(checkpoint);
    previousCheckpointSha256 = checkpoint.checkpointSha256;
    checkpointSequence = checkpoint.sequence;
    return checkpoint;
  };

  const persistProviderIntent = async ({
    round,
    provider,
    expectedPhase,
    request,
  }) => {
    if (!hasIntentWriter) return null;
    const intent = createProviderCallIntent({
      schemaVersion: 1,
      bindingSha256: options.checkpointBindingSha256,
      previousCheckpointSha256,
      expectedCheckpointSequence: checkpointSequence + 1,
      round,
      provider,
      expectedPhase,
      advisoryRequestSha256: advisoryRequestSha256(request),
    });
    await options.onProviderIntent(intent);
    return intent;
  };

  const settleProviderIntent = async (intent, checkpoint) => {
    if (intent === null) return;
    if (checkpoint === null) {
      throw new Error('Provider intent cannot settle without a durable phase checkpoint');
    }
    await options.onProviderCheckpointed(intent, checkpoint);
  };

  for (let round = startRound; round <= rounds; round += 1) {
    let candidate;
    let selectionReceipt;
    let candidateMetrics;
    let accepted;
    let reviewReceipt = null;
    let selectionIntent = null;
    let reviewIntent = null;
    let phase = null;

    if (pending !== null) {
      if (pending.round !== round) throw new Error('Model lab pending round mismatch');
      ({
        phase,
        candidate,
        selectionReceipt,
        candidateMetrics,
        accepted,
        reviewReceipt,
      } = pending);
      pending = null;
    }

    if (phase === null) {
      let available;
      try {
        available = resolveFrontier(options.revealCandidateIds, remaining, {
          round,
          currentMetrics,
          evaluatedCandidateIds,
          acceptedCandidateIds,
          advisorySeedId,
        });
      } catch (error) {
        throw sanitizeRoundError(round, 'frontier', error);
      }
      const availableIds = available.map((entry) => entry.id);
      try {
        const selectionRequest = createProviderRequest({
          system: SELECT_SYSTEM,
          name: SELECT_TOOL_NAME,
          round,
          rounds,
          currentMetrics,
          candidates: available,
        });
        selectionIntent = await persistProviderIntent({
          round,
          provider: 'kimi',
          expectedPhase: 'kimi-selected',
          request: selectionRequest,
        });
        const selectionResult = await kimi.generateStructured(selectionRequest);
        const selection = consumeStructuredChoice(selectionResult, 'kimi', availableIds);
        candidate = remaining.get(selection.choice.candidateId);
        remaining.delete(selection.choice.candidateId);
        selectionReceipt = selection.receipt;
      } catch (error) {
        throw sanitizeRoundError(round, 'kimi-selection', error);
      }
      let selectionCheckpoint;
      try {
        selectionCheckpoint = await persistPhase({
          round,
          phase: 'kimi-selected',
          candidate,
          selectionReceipt,
        });
      } catch (error) {
        throw sanitizeRoundError(round, 'kimi-checkpoint', error);
      }
      try {
        await settleProviderIntent(selectionIntent, selectionCheckpoint);
      } catch (error) {
        throw sanitizeRoundError(round, 'kimi-intent-settlement', error);
      }
      phase = 'kimi-selected';
    }

    if (phase === 'kimi-selected') {
      const baselineMetrics = currentMetrics;
      try {
        const evaluated = await options.evaluateCandidate(candidate, Object.freeze({
          round,
          currentMetrics: baselineMetrics,
        }));
        candidateMetrics = normalizeAggregateMetrics(evaluated, 'candidateMetrics');
      } catch (error) {
        throw sanitizeRoundError(round, 'evaluation', error);
      }
      try {
        accepted = await options.acceptCandidate(Object.freeze({
          round,
          candidateId: candidate.id,
          baselineMetrics,
          candidateMetrics,
        }));
        if (typeof accepted !== 'boolean') {
          throw new TypeError('acceptCandidate must return a boolean');
        }
      } catch (error) {
        throw sanitizeRoundError(round, 'acceptance', error);
      }
      evaluatedCandidateIds.push(candidate.id);
      evaluatedRecords.set(candidate.id, candidateMetrics);
      if (accepted) {
        currentMetrics = candidateMetrics;
        acceptedCandidateIds.push(candidate.id);
      }
      try {
        await persistPhase({
          round,
          phase: 'evaluated',
          candidate,
          selectionReceipt,
          candidateMetrics,
          accepted,
        });
      } catch (error) {
        throw sanitizeRoundError(round, 'evaluation-checkpoint', error);
      }
      phase = 'evaluated';
    }

    if (checkpointSet.has(round) && phase === 'evaluated') {
      try {
        const reviewCandidates = Object.freeze(evaluatedCandidateIds
          .slice(checkpointStart)
          .map((id) => Object.freeze({ id, metrics: evaluatedRecords.get(id) })));
        const reviewIds = reviewCandidates.map(({ id }) => id);
        const reviewRequest = createProviderRequest({
          system: REVIEW_SYSTEM,
          name: REVIEW_TOOL_NAME,
          round,
          rounds,
          currentMetrics,
          candidates: reviewCandidates,
        });
        reviewIntent = await persistProviderIntent({
          round,
          provider: 'anthropic',
          expectedPhase: 'anthropic-reviewed',
          request: reviewRequest,
        });
        const reviewResult = await anthropic.generateStructured(reviewRequest);
        const reviewed = consumeStructuredChoice(reviewResult, 'anthropic', reviewIds);
        reviewReceipt = reviewed.receipt;
        advisorySeedId = reviewed.choice.candidateId;
        checkpointStart = evaluatedCandidateIds.length;
      } catch (error) {
        throw sanitizeRoundError(round, 'anthropic-review', error);
      }
      let reviewCheckpoint;
      try {
        reviewCheckpoint = await persistPhase({
          round,
          phase: 'anthropic-reviewed',
          candidate,
          selectionReceipt,
          candidateMetrics,
          accepted,
          reviewReceipt,
        });
      } catch (error) {
        throw sanitizeRoundError(round, 'anthropic-checkpoint', error);
      }
      try {
        await settleProviderIntent(reviewIntent, reviewCheckpoint);
      } catch (error) {
        throw sanitizeRoundError(round, 'anthropic-intent-settlement', error);
      }
      phase = 'anthropic-reviewed';
    }

    if ((checkpointSet.has(round) && phase !== 'anthropic-reviewed')
        || (!checkpointSet.has(round) && phase !== 'evaluated')) {
      throw new Error('Model lab reached an incomplete provider phase');
    }

    const roundResult = deepFreeze({
      round,
      candidateId: candidate.id,
      accepted,
      selection: selectionReceipt,
      review: reviewReceipt,
    });
    const evaluationRecord = deepFreeze({
      round,
      candidateId: candidate.id,
      accepted,
      candidateMetrics,
      selection: selectionReceipt,
      review: reviewReceipt,
    });
    history.push(roundResult);
    evaluations.push(evaluationRecord);
    if (typeof options.onRound === 'function') {
      try {
        await options.onRound(roundResult);
      } catch (error) {
        throw sanitizeRoundError(round, 'round-hook', error);
      }
    }
  }

  return deepFreeze({
    schemaVersion: 3,
    roundsRequested: rounds,
    roundsCompleted: history.length,
    reviewCheckpoints: checkpoints,
    history,
    evaluations: evaluations.map(({ round, candidateId, accepted, candidateMetrics }) => ({
      round,
      candidateId,
      accepted,
      metrics: candidateMetrics,
    })),
    finalMetrics: currentMetrics,
    finalAdvisorySeedId: advisorySeedId,
    phaseCheckpointsCompleted: checkpointSequence,
    lastCheckpointSha256: previousCheckpointSha256,
  });
}

function restoreCompletedEvaluation(evaluation, state) {
  if (!state.remaining.delete(evaluation.candidateId)) {
    throw new Error('Model lab checkpoint repeats a candidate');
  }
  state.evaluations.push(evaluation);
  state.evaluatedCandidateIds.push(evaluation.candidateId);
  state.evaluatedRecords.set(evaluation.candidateId, evaluation.candidateMetrics);
  if (evaluation.accepted) state.acceptedCandidateIds.push(evaluation.candidateId);
  state.history.push(deepFreeze({
    round: evaluation.round,
    candidateId: evaluation.candidateId,
    accepted: evaluation.accepted,
    selection: evaluation.selection,
    review: evaluation.review,
  }));
}

function lastReviewedEvaluationIndex(evaluations) {
  for (let index = evaluations.length - 1; index >= 0; index -= 1) {
    if (evaluations[index].review !== null) return index + 1;
  }
  return 0;
}

function createProviderRequest({ system, name, round, rounds, currentMetrics, candidates }) {
  const ids = candidates.map((candidate) => candidate.id);
  return Object.freeze({
    system,
    name,
    schema: createCandidateChoiceSchema(ids),
    prompt: JSON.stringify({
      round,
      roundsTotal: rounds,
      currentMetrics,
      candidates,
    }),
  });
}

function resolveFrontier(revealCandidateIds, remaining, context) {
  if (typeof revealCandidateIds !== 'function') {
    return Object.freeze([...remaining.values()]);
  }
  const candidateIds = revealCandidateIds(deepFreeze({
    round: context.round,
    currentMetrics: context.currentMetrics,
    remainingCandidateIds: [...remaining.keys()],
    evaluatedCandidateIds: [...context.evaluatedCandidateIds],
    acceptedCandidateIds: [...context.acceptedCandidateIds],
    advisorySeedId: context.advisorySeedId,
  }));
  if (!Array.isArray(candidateIds) || candidateIds.length < 1 || candidateIds.length > 12) {
    throw new RangeError('revealCandidateIds must return from 1 through 12 candidate ids');
  }
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new Error('revealed candidate ids must be unique');
  }
  return Object.freeze(candidateIds.map((id) => {
    if (typeof id !== 'string' || !remaining.has(id)) {
      throw new Error('revealed candidate must be an unevaluated catalog id');
    }
    return remaining.get(id);
  }));
}

function sanitizeRoundError(round, stage, failure) {
  const providerFailure = failure instanceof ProviderRequestError
    ? Object.freeze({
      code: failure.code,
      status: failure.status,
      retryable: failure.retryable,
    })
    : null;
  const providerSummary = providerFailure === null
    ? ''
    : ` (provider code=${providerFailure.code} status=${providerFailure.status ?? 'none'} retryable=${providerFailure.retryable})`;
  const error = new Error(`Model advisory round ${round} failed at ${stage}${providerSummary}`);
  error.name = 'ModelAdvisoryLabError';
  error.round = round;
  error.stage = stage;
  error.code = `${stage}-failed`;
  if (providerFailure !== null) {
    error.providerCode = providerFailure.code;
    error.providerStatus = providerFailure.status;
    error.providerRetryable = providerFailure.retryable;
  }
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
