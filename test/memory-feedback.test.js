import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decideMemoryPromotion,
} from '../src/memory/feedback.js';

const OPTIONAL_STABILITY_WINDOW_MS = 24 * 60 * 60 * 1000;

const hashes = Object.freeze({
  candidate: '0'.repeat(64),
  module: '1'.repeat(64),
  evidence: '2'.repeat(64),
  positive: '3'.repeat(64),
  neutral: '4'.repeat(64),
  negative: '5'.repeat(64),
  compiler: '6'.repeat(64),
  atomicity: '7'.repeat(64),
  privacy: '8'.repeat(64),
  moduleGate: '9'.repeat(64),
  observedFirst: 'a'.repeat(64),
  observedLast: 'b'.repeat(64),
  otherCandidate: 'c'.repeat(64),
});

function feedback(signal, receiptSha256 = hashes[signal]) {
  return {
    source: 'human',
    signal,
    candidateSha256: hashes.candidate,
    receiptSha256,
  };
}

function passingGates() {
  return {
    compilerFidelity: { passed: true, receiptSha256: hashes.compiler },
    atomicity: { passed: true, receiptSha256: hashes.atomicity },
    privacy: { passed: true, receiptSha256: hashes.privacy },
    module: { passed: true, receiptSha256: hashes.moduleGate },
  };
}

function stableObservations(candidateSha256 = hashes.candidate) {
  return [
    {
      candidateSha256,
      observedAtMs: 1_000,
      receiptSha256: hashes.observedFirst,
    },
    {
      candidateSha256,
      observedAtMs: 1_000 + OPTIONAL_STABILITY_WINDOW_MS,
      receiptSha256: hashes.observedLast,
    },
  ];
}

function input(overrides = {}) {
  return {
    candidate: {
      kind: 'behaviour.opacity.fade',
      candidateSha256: hashes.candidate,
      moduleSha256: hashes.module,
      evidenceSha256: hashes.evidence,
    },
    feedback: [feedback('positive')],
    gates: passingGates(),
    stability: { observations: stableObservations() },
    ...overrides,
  };
}

test('any negative human signal discards the current revision', () => {
  const decision = decideMemoryPromotion(input({
    feedback: [feedback('positive'), feedback('negative')],
  }));

  assert.equal(decision.humanFeedback.signal, 'negative');
  assert.equal(decision.action, 'discard');
  assert.equal(decision.eligibleForPromotion, false);
  assert.deepEqual(decision.reasons, ['human-negative']);
});

test('positive and neutral promote with every gate; stability is disabled by default', () => {
  for (const signal of ['positive', 'neutral']) {
    const decision = decideMemoryPromotion(input({
      feedback: [feedback(signal)],
      stability: undefined,
    }));
    assert.equal(decision.humanFeedback.signal, signal);
    assert.equal(decision.action, 'promote');
    assert.equal(decision.eligibleForPromotion, true);
    assert.equal(decision.stability.enabled, false);
    assert.deepEqual(decision.reasons, []);
  }
});

test('each required gate fails closed, including a passed gate without a receipt', () => {
  for (const gateName of ['compilerFidelity', 'atomicity', 'privacy', 'module']) {
    const gates = passingGates();
    gates[gateName] = { passed: false };
    const decision = decideMemoryPromotion(input({ gates }));
    assert.equal(decision.action, 'quarantine');
    assert.equal(decision.gates[gateName].passed, false);
    assert.equal(decision.reasons.some((reason) => reason.includes('gate-failed')), true);
  }

  const gates = passingGates();
  gates.compilerFidelity = { passed: true, receiptSha256: 'not-a-hash' };
  const decision = decideMemoryPromotion(input({ gates }));
  assert.equal(decision.action, 'quarantine');
  assert.equal(decision.gates.compilerFidelity.passed, false);
});

test('an optional configured stability window can add a gate', () => {
  const tooShort = stableObservations();
  tooShort[1] = {
    ...tooShort[1],
    observedAtMs: tooShort[0].observedAtMs + OPTIONAL_STABILITY_WINDOW_MS - 1,
  };
  assert.equal(decideMemoryPromotion(input({
    policy: { minimumStabilityWindowMs: OPTIONAL_STABILITY_WINDOW_MS },
    stability: { observations: tooShort },
  })).action, 'quarantine');

  assert.equal(decideMemoryPromotion(input({
    policy: { minimumStabilityWindowMs: OPTIONAL_STABILITY_WINDOW_MS },
    stability: { observations: [stableObservations()[0]] },
  })).action, 'quarantine');

  assert.equal(decideMemoryPromotion(input({
    policy: { minimumStabilityWindowMs: OPTIONAL_STABILITY_WINDOW_MS },
    stability: { observations: stableObservations(hashes.otherCandidate) },
  })).action, 'quarantine');

  assert.equal(decideMemoryPromotion(input({
    policy: { minimumStabilityWindowMs: OPTIONAL_STABILITY_WINDOW_MS },
  })).action, 'promote');
});

test('missing feedback holds and model-authored feedback is rejected', () => {
  const missing = decideMemoryPromotion(input({
    feedback: [],
    llmSignal: 'positive',
  }));
  assert.equal(missing.humanFeedback.signal, 'unknown');
  assert.equal(missing.action, 'quarantine');
  assert.deepEqual(missing.reasons, ['human-feedback-required']);

  assert.throws(() => decideMemoryPromotion(input({
    feedback: [{
      ...feedback('positive'),
      source: 'llm',
    }],
  })), /only explicit human feedback/);
});

test('feedback is revision-scoped and one receipt cannot attest conflicting signals', () => {
  assert.throws(() => decideMemoryPromotion(input({
    feedback: [{
      ...feedback('positive'),
      candidateSha256: hashes.otherCandidate,
    }],
  })), /current candidate revision/);

  assert.throws(() => decideMemoryPromotion(input({
    feedback: [
      feedback('positive', hashes.positive),
      feedback('negative', hashes.positive),
    ],
  })), /conflicting signals/);
});

test('decision is order-independent, deeply frozen, and emits only allowlisted metadata', () => {
  const raw = {
    prompt: 'PRIVATE PROMPT',
    transcript: 'PRIVATE TRANSCRIPT',
    url: 'https://private.example/video.mp4',
  };
  const left = decideMemoryPromotion(input({
    candidate: { ...input().candidate, ...raw },
    feedback: [
      { ...feedback('neutral'), notes: raw },
      { ...feedback('positive'), notes: raw },
    ],
    gates: Object.fromEntries(Object.entries(passingGates()).map(([name, gate]) => [
      name,
      { ...gate, diagnostic: raw },
    ])),
    stability: {
      observations: stableObservations().map((observation) => ({
        ...observation,
        diagnostic: raw,
      })),
    },
  }));
  const right = decideMemoryPromotion(input({
    feedback: [feedback('positive'), feedback('neutral')],
    gates: Object.fromEntries(Object.entries(passingGates()).reverse()),
    stability: { observations: stableObservations().reverse() },
  }));

  assert.deepEqual(left, right);
  assert.equal(Object.isFrozen(left), true);
  assert.equal(Object.isFrozen(left.gates), true);
  assert.deepEqual(Object.keys(left).sort(), [
    'action',
    'candidate',
    'decisionSha256',
    'eligibleForPromotion',
    'gates',
    'humanFeedback',
    'policyVersion',
    'reasons',
    'schemaVersion',
    'stability',
  ]);
  const serialized = JSON.stringify(left);
  assert.equal(serialized.includes('PRIVATE'), false);
  assert.equal(serialized.includes('https://'), false);
  assert.equal(serialized.includes('prompt'), false);
  assert.equal(serialized.includes('transcript'), false);
  assert.equal(serialized.includes('factory'), false);
  assert.equal(serialized.includes('runtime'), false);
});
