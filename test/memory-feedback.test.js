import assert from 'node:assert/strict';
import test from 'node:test';

import { decideMemoryPromotion } from '../src/memory/feedback.js';
import {
  createFeedbackReceipt,
  createPromotionGateIssuer,
  createPromotionGateVerifier,
} from '../src/memory/promotion.js';

const H = Object.freeze({
  candidate: '0'.repeat(64),
  module: '1'.repeat(64),
  dependencyClosure: 'c'.repeat(64),
  evidence: '2'.repeat(64),
  event: '3'.repeat(64),
  generation: 'b'.repeat(64),
  request: '4'.repeat(64),
  response: '5'.repeat(64),
});

const candidate = Object.freeze({
  kind: 'behaviour.opacity.fade',
  candidateSha256: H.candidate,
  moduleSha256: H.module,
  dependencyClosureSha256: H.dependencyClosure,
  evidenceSha256: H.evidence,
});
const GATE_SECRET = 'test-only-gate-secret-that-is-at-least-32-bytes';
const gateIssuer = createPromotionGateIssuer({
  authorityId: 'test-gate-authority',
  secret: GATE_SECRET,
});
const gateReceiptVerifier = createPromotionGateVerifier({
  authorityId: 'test-gate-authority',
  secret: GATE_SECRET,
});

function receipt(signal, options = {}) {
  const state = options.state ?? (signal === 'negative' ? 'reject' : 'candidate');
  return createFeedbackReceipt({
    candidateSha256: H.candidate,
    generationEventSha256: H.generation,
    origin: options.origin ?? 'explicit-human',
    signal,
    state,
    counts: {
      negative: signal === 'negative' ? 1 : 0,
      positive: signal === 'positive' ? 1 : 0,
      neutral: signal === 'neutral' ? 1 : 0,
      ambiguous: signal === 'ambiguous' ? 1 : 0,
    },
    eventSha256s: [H.event],
    grace: { requiredMs: 30_000, remainingMs: state === 'pending' ? 1 : 0 },
    classifier: options.origin === 'human-dialogue-classified'
      ? {
        provider: 'kimi',
        model: 'kimi-k2.6',
        requestSha256: H.request,
        responseSha256: H.response,
      }
      : null,
  });
}

function signedGates(overrides = {}, authority = gateIssuer) {
  return Object.fromEntries([
    'compilerFidelity',
    'reconstruction',
    'atomicity',
    'privacy',
    'module',
  ].map((name) => [name, authority.issue({
    gateName: name,
    candidateSha256: H.candidate,
    moduleSha256: H.module,
    dependencyClosureSha256: H.dependencyClosure,
    resultSha256: H.evidence,
    passed: true,
    ...(overrides[name] ?? {}),
  })]));
}

function decide(feedbackReceipt, overrides = {}) {
  const gates = overrides.gates ?? signedGates();
  const verifier = Object.hasOwn(overrides, 'gateVerifier')
    ? overrides.gateVerifier
    : gateReceiptVerifier;
  const { gates: ignoredGates, gateVerifier: ignoredVerifier, ...inputOverrides } = overrides;
  return decideMemoryPromotion({
    candidate,
    feedbackReceipt,
    gates,
    ...inputOverrides,
  }, { gateVerifier: verifier });
}

test('negative user evidence always discards and cannot be overridden by gates', () => {
  const decision = decide(receipt('negative'), { gates: {} });
  assert.equal(decision.action, 'discard');
  assert.equal(decision.eligibleForPromotion, false);
  assert.deepEqual(decision.reasons, ['human-negative']);
});

test('positive or neutral promotes only after grace and all five bound gates', () => {
  for (const signal of ['positive', 'neutral']) {
    assert.equal(decide(receipt(signal)).action, 'promote');
    const pending = decide(receipt(signal, { state: 'pending' }));
    assert.equal(pending.action, 'quarantine');
    assert.deepEqual(pending.reasons, ['feedback-grace-incomplete']);
  }

  for (const gate of ['compilerFidelity', 'reconstruction', 'atomicity', 'privacy', 'module']) {
    const gates = signedGates({ [gate]: { passed: false } });
    const decision = decide(receipt('positive'), { gates });
    assert.equal(decision.action, 'quarantine', gate);
    assert.equal(decision.gates[gate].passed, false);
  }
});

test('gate receipts bind candidate, module, dependency closure and one evidence bundle', () => {
  const staleCandidate = signedGates({ module: { candidateSha256: 'f'.repeat(64) } });
  const staleModule = signedGates({ reconstruction: { moduleSha256: 'e'.repeat(64) } });
  const staleClosure = signedGates({ atomicity: { dependencyClosureSha256: 'd'.repeat(64) } });
  const mixedEvidence = signedGates({ privacy: { resultSha256: 'd'.repeat(64) } });
  assert.equal(decide(receipt('positive'), { gates: staleCandidate }).action, 'quarantine');
  assert.equal(decide(receipt('positive'), { gates: staleModule }).action, 'quarantine');
  assert.equal(decide(receipt('positive'), { gates: staleClosure }).action, 'quarantine');
  assert.equal(decide(receipt('positive'), { gates: mixedEvidence }).action, 'quarantine');
});

test('legacy hash-only gates, missing verifier, tampering, and wrong gate names fail closed', () => {
  const legacy = Object.fromEntries(['compilerFidelity', 'reconstruction', 'atomicity', 'privacy', 'module']
    .map((name) => [name, {
      passed: true,
      receiptSha256: 'a'.repeat(64),
      candidateSha256: H.candidate,
      moduleSha256: H.module,
    }]));
  assert.equal(decide(receipt('positive'), { gates: legacy }).action, 'quarantine');
  assert.equal(decide(receipt('positive'), { gateVerifier: null }).action, 'quarantine');

  const tampered = signedGates();
  tampered.privacy = { ...tampered.privacy, resultSha256: 'f'.repeat(64) };
  assert.equal(decide(receipt('positive'), { gates: tampered }).action, 'quarantine');

  const wrongGate = signedGates();
  wrongGate.atomicity = gateIssuer.issue({
    gateName: 'privacy',
    candidateSha256: H.candidate,
    moduleSha256: H.module,
    dependencyClosureSha256: H.dependencyClosure,
    resultSha256: H.evidence,
    passed: true,
  });
  assert.equal(decide(receipt('positive'), { gates: wrongGate }).action, 'quarantine');
  assert.equal(typeof gateIssuer.verify, 'undefined');
  assert.equal(typeof gateReceiptVerifier.issue, 'undefined');
  assert.doesNotMatch(
    JSON.stringify({ gateIssuer, gateReceiptVerifier, decision: decide(receipt('positive')) }),
    /test-only-gate-secret/u,
  );
});

test('classified user dialogue is valid authority only with request and response hashes', () => {
  const classified = receipt('positive', { origin: 'human-dialogue-classified' });
  const decision = decide(classified);
  assert.equal(decision.action, 'promote');
  assert.equal(decision.humanFeedback.origin, 'human-dialogue-classified');

  assert.throws(() => createFeedbackReceipt({
    ...classified,
    classifier: null,
  }), /classifier/u);
});

test('missing receipt or legacy model-authored event never approves', () => {
  const missing = decideMemoryPromotion({
    candidate,
    feedback: [{ source: 'llm', signal: 'positive' }],
    gates: signedGates(),
  }, { gateVerifier: gateReceiptVerifier });
  assert.equal(missing.action, 'quarantine');
  assert.deepEqual(missing.reasons, ['human-feedback-required']);
});

test('feedback receipt is revision-scoped, hash-sealed and contains no raw dialogue', () => {
  const feedbackReceipt = receipt('neutral');
  assert.throws(() => decideMemoryPromotion({
    candidate: { ...candidate, candidateSha256: 'f'.repeat(64) },
    feedbackReceipt,
    gates: signedGates(),
  }, { gateVerifier: gateReceiptVerifier }), /current candidate revision/u);

  const tampered = { ...feedbackReceipt, signal: 'positive' };
  assert.throws(() => decideMemoryPromotion({ candidate, feedbackReceipt: tampered, gates: signedGates() }, {
    gateVerifier: gateReceiptVerifier,
  }), /hash/u);
  assert.doesNotMatch(JSON.stringify(decide(feedbackReceipt)), /dialogue|messageId|content|prompt|https?:\/\//iu);
});
