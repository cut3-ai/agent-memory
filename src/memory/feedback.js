import { sha256, stableStringify } from '../lib.js';
import { assertPublicArtifact } from './privacy/artifact.js';
import {
  PROMOTION_GATE_NAMES,
  verifyPromotionGateReceipt,
} from './gate-receipts.js';

export const OUTCOME_POLICY_VERSION = 'revision-outcome-v2-authenticity-bound';
/** @deprecated Use OUTCOME_POLICY_VERSION. */
export const FEEDBACK_POLICY_VERSION = OUTCOME_POLICY_VERSION;
export const MINIMUM_STABILITY_WINDOW_MS = 0;
export const MINIMUM_FEEDBACK_GRACE_MS = 30_000;

const HASH = /^[a-f0-9]{64}$/;
const KIND = /^(?:unit|behaviour)\.[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const OUTCOME_SIGNALS = new Set(['negative', 'neutral', 'positive', 'ambiguous']);
const OUTCOME_ORIGINS = new Set([
  'workspace-outcome',
  'explicit-human',
  'human-dialogue-classified',
]);
const GATE_FAILURE_REASONS = Object.freeze({
  compilerFidelity: 'compiler-fidelity-gate-failed',
  reconstruction: 'reconstruction-gate-failed',
  atomicity: 'atomicity-gate-failed',
  authenticity: 'authenticity-gate-failed',
  privacy: 'privacy-gate-failed',
  module: 'module-gate-failed',
});
const REQUIRED_GATES = Object.freeze(PROMOTION_GATE_NAMES.map(
  (name) => Object.freeze([name, GATE_FAILURE_REASONS[name]]),
));

/**
 * Resolve a candidate revision using revision-scoped workspace outcomes and
 * machine gates. Explicit human feedback is one optional outcome source.
 *
 * The function is deliberately closed over no clock, model, runtime, or
 * registry. Every decision is a deterministic projection of hashed evidence.
 */
export function decideMemoryPromotion(input = {}, options = {}) {
  const candidate = normalizeCandidate(input.candidate);
  const feedbackReceipt = normalizeFeedbackReceipt(
    input.feedbackReceipt,
    candidate.candidateSha256,
    candidate.outcomeRevisionSha256,
  );
  const outcomeSignal = feedbackReceipt?.signal ?? 'unknown';
  const gates = normalizeGates(input.gates, candidate, options.gateVerifier);
  const requiredStabilityWindowMs = normalizeRequiredWindow(
    input.policy?.minimumStabilityWindowMs,
  );
  const stability = normalizeStability(
    input.stability?.observations,
    candidate.candidateSha256,
    requiredStabilityWindowMs,
  );

  let action = 'quarantine';
  let reasons;
  if (outcomeSignal === 'negative') {
    action = 'discard';
    reasons = ['negative-outcome'];
  } else if (outcomeSignal === 'unknown') {
    reasons = ['qualified-outcome-required'];
  } else if (outcomeSignal === 'ambiguous') {
    reasons = ['outcome-ambiguous'];
  } else if (feedbackReceipt.state !== 'candidate'
      || feedbackReceipt.grace.remainingMs !== 0) {
    reasons = ['outcome-grace-incomplete'];
  } else {
    reasons = REQUIRED_GATES
      .filter(([name]) => !gates[name].passed)
      .map(([, reason]) => reason);
    if (stability.enabled && !stability.complete) {
      reasons.push('stability-window-incomplete');
    }
    if (reasons.length === 0) action = 'promote';
  }

  const body = {
    schemaVersion: 2,
    policyVersion: OUTCOME_POLICY_VERSION,
    candidate,
    outcome: {
      signal: outcomeSignal,
      origin: feedbackReceipt?.origin ?? null,
      receiptSha256: feedbackReceipt?.receiptSha256 ?? null,
      revisionSha256: feedbackReceipt?.revisionSha256 ?? null,
      generationEventSha256: feedbackReceipt?.generationEventSha256 ?? null,
      validationReceiptSha256: feedbackReceipt?.validationReceiptSha256 ?? null,
      evidenceEvents: feedbackReceipt?.eventSha256s.length ?? 0,
      eventSetSha256: sha256(stableStringify(feedbackReceipt?.eventSha256s ?? [])),
      grace: feedbackReceipt?.grace ?? null,
    },
    gates,
    stability,
    action,
    eligibleForPromotion: action === 'promote',
    reasons,
  };
  assertPublicArtifact(body);
  return deepFreeze({
    ...body,
    decisionSha256: sha256(stableStringify(body)),
  });
}

function normalizeCandidate(value) {
  if (!value || typeof value !== 'object') {
    throw new TypeError('candidate metadata is required');
  }
  if (typeof value.kind !== 'string' || !KIND.test(value.kind)) {
    throw new TypeError('candidate.kind must be a safe Unit or Behaviour kind');
  }
  const moduleSha256 = requireHash(value.moduleSha256, 'candidate.moduleSha256');
  return {
    kind: value.kind,
    candidateSha256: requireHash(value.candidateSha256, 'candidate.candidateSha256'),
    moduleSha256,
    dependencyClosureSha256: requireHash(
      value.dependencyClosureSha256,
      'candidate.dependencyClosureSha256',
    ),
    bundleSha256: value.bundleSha256 === undefined || value.bundleSha256 === null
      ? null
      : requireHash(value.bundleSha256, 'candidate.bundleSha256'),
    outcomeRevisionSha256: value.outcomeRevisionSha256 === undefined
      ? moduleSha256
      : requireHash(
        value.outcomeRevisionSha256,
        'candidate.outcomeRevisionSha256',
      ),
    evidenceSha256: requireHash(value.evidenceSha256, 'candidate.evidenceSha256'),
  };
}

function normalizeFeedbackReceipt(value, candidateSha256, outcomeRevisionSha256) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('feedbackReceipt must be an object');
  }
  const expectedKeys = [
    'schemaVersion',
    'candidateSha256',
    'revisionSha256',
    'generationEventSha256',
    'validationReceiptSha256',
    'origin',
    'signal',
    'state',
    'counts',
    'eventSha256s',
    'grace',
    'classifier',
    'receiptSha256',
  ];
  if (Object.keys(value).length !== expectedKeys.length
      || expectedKeys.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError('feedbackReceipt has unexpected fields');
  }
  if (value.schemaVersion !== 3) throw new TypeError('feedbackReceipt schema version is unsupported');
  if (value.candidateSha256 !== candidateSha256) {
    throw new TypeError('outcome evidence must target the current candidate revision');
  }
  if (value.revisionSha256 !== outcomeRevisionSha256) {
    throw new TypeError('outcome evidence must target the exact candidate module revision');
  }
  if (!OUTCOME_ORIGINS.has(value.origin)) throw new TypeError('feedbackReceipt origin is unsupported');
  if (!OUTCOME_SIGNALS.has(value.signal)) throw new TypeError('feedbackReceipt signal is invalid');
  if (!['reject', 'pending', 'candidate', 'quarantine'].includes(value.state)) {
    throw new TypeError('feedbackReceipt state is invalid');
  }
  const eventSha256s = normalizeHashSet(value.eventSha256s, 'feedbackReceipt.eventSha256s');
  if (eventSha256s.length === 0) throw new TypeError('feedbackReceipt requires qualified outcome evidence');
  const counts = normalizeCounts(value.counts);
  const resolvedSignal = resolveOutcomeCounts(counts);
  if (value.signal !== resolvedSignal) {
    throw new TypeError('feedbackReceipt signal violates negative-first outcome precedence');
  }
  if ((resolvedSignal === 'negative' && value.state !== 'reject')
      || (resolvedSignal === 'ambiguous' && value.state !== 'quarantine')
      || (['positive', 'neutral'].includes(resolvedSignal) && value.state === 'reject')) {
    throw new TypeError('feedbackReceipt state is inconsistent with its resolved outcome');
  }
  const grace = normalizeGrace(value.grace);
  const classifier = normalizeClassifier(value.classifier, value.origin);
  const validationReceiptSha256 = value.validationReceiptSha256 === null
    ? null
    : requireHash(value.validationReceiptSha256, 'feedbackReceipt.validationReceiptSha256');
  const receiptSha256 = requireHash(value.receiptSha256, 'feedbackReceipt.receiptSha256');
  const body = {
    schemaVersion: value.schemaVersion,
    candidateSha256: value.candidateSha256,
    revisionSha256: requireHash(value.revisionSha256, 'feedbackReceipt.revisionSha256'),
    generationEventSha256: requireHash(
      value.generationEventSha256,
      'feedbackReceipt.generationEventSha256',
    ),
    validationReceiptSha256,
    origin: value.origin,
    signal: value.signal,
    state: value.state,
    counts,
    eventSha256s,
    grace,
    classifier,
  };
  if (sha256(stableStringify(body)) !== receiptSha256) {
    throw new TypeError('feedbackReceipt hash does not match its body');
  }
  if (value.signal === 'negative' && value.state !== 'reject') {
    throw new TypeError('negative feedback receipt must reject');
  }
  if (['positive', 'neutral'].includes(value.signal)
      && grace.requiredMs < MINIMUM_FEEDBACK_GRACE_MS) {
    throw new TypeError('positive or neutral feedback receipt has an insufficient grace period');
  }
  if (['positive', 'neutral'].includes(value.signal)
      && value.state === 'candidate'
      && grace.remainingMs !== 0) {
    throw new TypeError('candidate feedback receipt cannot precede grace completion');
  }
  if (value.state === 'candidate'
      && (!['positive', 'neutral'].includes(value.signal) || validationReceiptSha256 === null)) {
    throw new TypeError('candidate feedback receipt requires passed compile and render validation');
  }
  return { ...body, receiptSha256 };
}

function normalizeGates(value, candidate, verifier) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(REQUIRED_GATES.map(([name]) => {
    const verified = verifyPromotionGateReceipt(verifier, source[name], {
      gateName: name,
      candidateSha256: candidate.candidateSha256,
      moduleSha256: candidate.moduleSha256,
      dependencyClosureSha256: candidate.dependencyClosureSha256,
      resultSha256: candidate.evidenceSha256,
    });
    const passed = verified?.passed === true;
    return [name, {
      passed,
      authorityId: verified?.authorityId ?? null,
      receiptSha256: verified?.receiptSha256 ?? null,
      signatureSha256: verified?.signatureSha256 ?? null,
    }];
  }));
}

function normalizeHashSet(value, name) {
  if (!Array.isArray(value) || value.length > 20) throw new TypeError(`${name} must be an array`);
  const hashes = [...new Set(value.map((entry) => requireHash(entry, name)))].sort();
  if (hashes.length !== value.length) throw new TypeError(`${name} must be unique`);
  return hashes;
}

function normalizeCounts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('feedbackReceipt.counts must be an object');
  }
  const counts = {};
  for (const signal of ['negative', 'positive', 'neutral', 'ambiguous']) {
    if (!Number.isSafeInteger(value[signal]) || value[signal] < 0) {
      throw new TypeError(`feedbackReceipt.counts.${signal} must be non-negative`);
    }
    counts[signal] = value[signal];
  }
  return counts;
}

function resolveOutcomeCounts(counts) {
  if (counts.negative > 0) return 'negative';
  if (counts.ambiguous > 0) return 'ambiguous';
  if (counts.positive > 0) return 'positive';
  if (counts.neutral > 0) return 'neutral';
  throw new TypeError('feedbackReceipt counts require a qualified outcome');
}

function normalizeGrace(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('feedbackReceipt.grace must be an object');
  }
  for (const name of ['requiredMs', 'remainingMs']) {
    if (!Number.isSafeInteger(value[name]) || value[name] < 0) {
      throw new TypeError(`feedbackReceipt.grace.${name} must be non-negative`);
    }
  }
  return { requiredMs: value.requiredMs, remainingMs: value.remainingMs };
}

function normalizeClassifier(value, origin) {
  if (origin !== 'human-dialogue-classified') {
    if (value !== null) throw new TypeError('non-classified feedback cannot carry classifier authority');
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('classified human feedback requires classifier hashes');
  }
  return {
    provider: safeLabel(value.provider),
    model: safeLabel(value.model),
    requestSha256: requireHash(value.requestSha256, 'classifier.requestSha256'),
    responseSha256: requireHash(value.responseSha256, 'classifier.responseSha256'),
  };
}

function safeLabel(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/u.test(value)) {
    throw new TypeError('classifier labels must be safe identifiers');
  }
  return value;
}

function normalizeStability(value, candidateSha256, requiredWindowMs) {
  const source = Array.isArray(value) ? value : [];
  let valid = true;
  const byReceipt = new Map();
  for (const observation of source) {
    if (
      !observation
      || typeof observation !== 'object'
      || !isHash(observation.candidateSha256)
      || !isHash(observation.receiptSha256)
      || !Number.isSafeInteger(observation.observedAtMs)
      || observation.observedAtMs < 0
    ) {
      valid = false;
      continue;
    }
    const previous = byReceipt.get(observation.receiptSha256);
    if (
      previous
      && (
        previous.candidateSha256 !== observation.candidateSha256
        || previous.observedAtMs !== observation.observedAtMs
      )
    ) {
      valid = false;
      continue;
    }
    byReceipt.set(observation.receiptSha256, {
      candidateSha256: observation.candidateSha256,
      observedAtMs: observation.observedAtMs,
      receiptSha256: observation.receiptSha256,
    });
  }
  const observations = [...byReceipt.values()].sort((left, right) => (
    left.observedAtMs - right.observedAtMs
      || left.receiptSha256.localeCompare(right.receiptSha256)
  ));
  const sameRevision = observations.every(
    (observation) => observation.candidateSha256 === candidateSha256,
  );
  const stableForMs = valid && sameRevision && observations.length >= 2
    ? observations.at(-1).observedAtMs - observations[0].observedAtMs
    : 0;
  const enabled = requiredWindowMs > 0;
  const complete = !enabled || (valid
    && sameRevision
    && observations.length >= 2
    && stableForMs >= requiredWindowMs);
  const receiptSet = observations.map((observation) => ({
    candidateSha256: observation.candidateSha256,
    observedAtMs: observation.observedAtMs,
    receiptSha256: observation.receiptSha256,
  }));
  return {
    enabled,
    valid,
    observations: observations.length,
    requiredWindowMs,
    stableForMs,
    complete,
    receiptSetSha256: sha256(stableStringify(receiptSet)),
  };
}

function normalizeRequiredWindow(value) {
  if (value === undefined) return MINIMUM_STABILITY_WINDOW_MS;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('policy.minimumStabilityWindowMs must be a non-negative integer');
  }
  return value;
}

function isHash(value) {
  return typeof value === 'string' && HASH.test(value);
}

function requireHash(value, name) {
  if (!isHash(value)) throw new TypeError(`${name} must be a lowercase SHA-256`);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
