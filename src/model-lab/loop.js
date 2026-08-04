import {
  assertAdvisoryProvider,
  createCandidateChoiceSchema,
  MAX_MODEL_LAB_ROUNDS,
  normalizeAggregateMetrics,
  normalizeCandidateCatalog,
  normalizeReviewCheckpoints,
  normalizeRounds,
} from './contracts.js';
import { consumeStructuredChoice } from './receipt.js';

export const SELECT_SYSTEM = 'Choose exactly one opaque candidate identifier from the supplied finite catalog. Base the choice only on the supplied aggregate metrics. Use no information beyond the fields in this payload. Return only the required structured object.';
export const REVIEW_SYSTEM = 'Review the supplied finite catalog and recommend exactly one opaque candidate identifier from the supplied finite catalog. Base the recommendation only on the supplied aggregate metrics. Use no information beyond the fields in this payload. Return only the required structured object.';

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

  let currentMetrics = normalizeAggregateMetrics(options.initialMetrics, 'initialMetrics');
  const remaining = new Map(catalog.map((candidate) => [candidate.id, candidate]));
  const checkpointSet = new Set(checkpoints);
  const history = [];
  let recommendation = null;

  for (let round = 1; round <= rounds; round += 1) {
    const available = Object.freeze([...remaining.values()]);
    const availableIds = available.map((candidate) => candidate.id);
    let reviewReceipt = null;

    let selection;
    try {
      const selectionRequest = createProviderRequest({
        system: SELECT_SYSTEM,
        name: 'select_candidate',
        round,
        rounds,
        currentMetrics,
        candidates: available,
        recommendation,
      });
      const selectionResult = await kimi.generateStructured(selectionRequest);
      selection = consumeStructuredChoice(selectionResult, 'kimi', availableIds);
    } catch (error) {
      throw sanitizeRoundError(round, 'kimi-selection', error);
    }

    const candidate = remaining.get(selection.choice.candidateId);
    remaining.delete(selection.choice.candidateId);
    if (recommendation === candidate.id) recommendation = null;
    const baselineMetrics = currentMetrics;
    let candidateMetrics;
    try {
      const evaluated = await options.evaluateCandidate(candidate, Object.freeze({
        round,
        currentMetrics: baselineMetrics,
      }));
      candidateMetrics = normalizeAggregateMetrics(evaluated, 'candidateMetrics');
    } catch (error) {
      throw sanitizeRoundError(round, 'evaluation', error);
    }

    let accepted;
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
    if (accepted) currentMetrics = candidateMetrics;

    if (checkpointSet.has(round)) {
      try {
        const reviewCandidates = remaining.size > 0
          ? Object.freeze([...remaining.values()])
          : Object.freeze([candidate]);
        const reviewIds = reviewCandidates.map((entry) => entry.id);
        const reviewRequest = createProviderRequest({
          system: REVIEW_SYSTEM,
          name: 'review_candidates',
          round,
          rounds,
          currentMetrics,
          candidates: reviewCandidates,
        });
        const reviewResult = await anthropic.generateStructured(reviewRequest);
        const reviewed = consumeStructuredChoice(reviewResult, 'anthropic', reviewIds);
        reviewReceipt = reviewed.receipt;
        recommendation = remaining.has(reviewed.choice.candidateId)
          ? reviewed.choice.candidateId
          : null;
      } catch (error) {
        throw sanitizeRoundError(round, 'anthropic-review', error);
      }
    }

    const roundResult = deepFreeze({
      round,
      candidateId: candidate.id,
      accepted,
      selection: selection.receipt,
      review: reviewReceipt,
    });
    history.push(roundResult);
    if (typeof options.onRound === 'function') {
      try {
        await options.onRound(roundResult);
      } catch (error) {
        throw sanitizeRoundError(round, 'round-hook', error);
      }
    }
  }

  return deepFreeze({
    schemaVersion: 1,
    roundsRequested: rounds,
    roundsCompleted: history.length,
    reviewCheckpoints: checkpoints,
    history,
    finalMetrics: currentMetrics,
  });
}

function createProviderRequest({
  system,
  name,
  round,
  rounds,
  currentMetrics,
  candidates,
  recommendation = null,
}) {
  const ids = candidates.map((candidate) => candidate.id);
  const payload = {
    round,
    roundsTotal: rounds,
    currentMetrics,
    candidates,
  };
  if (recommendation !== null) payload.advisoryCandidateId = recommendation;
  return Object.freeze({
    system,
    name,
    schema: createCandidateChoiceSchema(ids),
    prompt: JSON.stringify(payload),
  });
}

function sanitizeRoundError(round, stage) {
  const error = new Error(`Model advisory round ${round} failed at ${stage}`);
  error.name = 'ModelAdvisoryLabError';
  error.round = round;
  error.stage = stage;
  error.code = `${stage}-failed`;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
