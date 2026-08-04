import { sha256, stableStringify } from '../lib.js';
import { assertPublicArtifact } from './privacy.js';

export const FEEDBACK_POLICY_VERSION = 'human-feedback-v2';
export const MINIMUM_STABILITY_WINDOW_MS = 0;

const HASH = /^[a-f0-9]{64}$/;
const KIND = /^(?:unit|behaviour)\.[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const HUMAN_SIGNALS = new Set(['negative', 'neutral', 'positive']);
const REQUIRED_GATES = Object.freeze([
  ['compilerFidelity', 'compiler-fidelity-gate-failed'],
  ['atomicity', 'atomicity-gate-failed'],
  ['privacy', 'privacy-gate-failed'],
  ['module', 'module-gate-failed'],
]);

/**
 * Resolve a candidate revision using explicit human feedback and machine gates.
 *
 * The function is deliberately closed over no clock, model, runtime, or
 * registry. Every decision is a deterministic projection of hashed evidence.
 */
export function decideMemoryPromotion(input = {}) {
  const candidate = normalizeCandidate(input.candidate);
  const feedbackEvents = normalizeFeedback(
    input.feedback,
    candidate.candidateSha256,
  );
  const humanSignal = resolveHumanSignal(feedbackEvents);
  const gates = normalizeGates(input.gates);
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
  if (humanSignal === 'negative') {
    action = 'discard';
    reasons = ['human-negative'];
  } else if (humanSignal === 'unknown') {
    reasons = ['human-feedback-required'];
  } else {
    reasons = REQUIRED_GATES
      .filter(([name]) => !gates[name].passed)
      .map(([, reason]) => reason);
    if (stability.enabled && !stability.complete) {
      reasons.push('stability-window-incomplete');
    }
    if (reasons.length === 0) action = 'promote';
  }

  const feedbackReceiptSet = feedbackEvents.map(({ receiptSha256, signal }) => ({
    receiptSha256,
    signal,
  }));
  const body = {
    schemaVersion: 1,
    policyVersion: FEEDBACK_POLICY_VERSION,
    candidate,
    humanFeedback: {
      signal: humanSignal,
      receipts: feedbackEvents.length,
      receiptSetSha256: sha256(stableStringify(feedbackReceiptSet)),
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
  return {
    kind: value.kind,
    candidateSha256: requireHash(value.candidateSha256, 'candidate.candidateSha256'),
    moduleSha256: requireHash(value.moduleSha256, 'candidate.moduleSha256'),
    evidenceSha256: requireHash(value.evidenceSha256, 'candidate.evidenceSha256'),
  };
}

function normalizeFeedback(value, candidateSha256) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError('feedback must be an array');
  const byReceipt = new Map();
  for (const event of value) {
    if (!event || typeof event !== 'object' || event.source !== 'human') {
      throw new TypeError('only explicit human feedback can decide promotion');
    }
    if (!HUMAN_SIGNALS.has(event.signal)) {
      throw new TypeError('human feedback signal must be negative, neutral, or positive');
    }
    if (event.candidateSha256 !== candidateSha256) {
      throw new TypeError('human feedback must target the current candidate revision');
    }
    const receiptSha256 = requireHash(
      event.receiptSha256,
      'feedback.receiptSha256',
    );
    const previous = byReceipt.get(receiptSha256);
    if (previous && previous.signal !== event.signal) {
      throw new TypeError('one human receipt cannot attest conflicting signals');
    }
    byReceipt.set(receiptSha256, {
      signal: event.signal,
      receiptSha256,
    });
  }
  return [...byReceipt.values()].sort((left, right) => (
    left.receiptSha256.localeCompare(right.receiptSha256)
      || left.signal.localeCompare(right.signal)
  ));
}

function resolveHumanSignal(events) {
  const signals = new Set(events.map((event) => event.signal));
  if (signals.has('negative')) return 'negative';
  if (signals.has('positive')) return 'positive';
  if (signals.has('neutral')) return 'neutral';
  return 'unknown';
}

function normalizeGates(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(REQUIRED_GATES.map(([name]) => {
    const gate = source[name];
    const passed = gate?.passed === true && isHash(gate.receiptSha256);
    return [name, {
      passed,
      receiptSha256: passed ? gate.receiptSha256 : null,
    }];
  }));
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
