import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reduceRevisionOutcome,
  verifyRevisionOutcomeReceipt,
} from '../src/feedback/outcome.js';

const REVISION = 'a'.repeat(64);
const OTHER_REVISION = 'b'.repeat(64);
const COMPILE = 'c'.repeat(64);
const RENDER = 'd'.repeat(64);

function generation(atMs = 1_000, revisionSha256 = REVISION) {
  return { schemaVersion: 1, type: 'generation', revisionSha256, atMs };
}

function validation(stage, atMs, status = 'passed', revisionSha256 = REVISION) {
  return {
    schemaVersion: 1,
    type: 'validation',
    revisionSha256,
    atMs,
    stage,
    status,
    resultSha256: stage === 'compile' ? COMPILE : RENDER,
  };
}

function action(actionName, atMs, revisionSha256 = REVISION) {
  return {
    schemaVersion: 1,
    type: 'workspace-action',
    revisionSha256,
    atMs,
    action: actionName,
  };
}

function validated(events = []) {
  return [generation(), validation('compile', 1_100), validation('render', 1_200), ...events];
}

test('silence and topic changes never become neutral outcomes', () => {
  const waiting = reduceRevisionOutcome({
    events: validated(),
    nowMs: 5_000,
  });
  const topicChange = reduceRevisionOutcome({
    events: validated([action('topic-changed', 2_000)]),
    nowMs: 601_000,
  });

  assert.equal(waiting.state, 'pending');
  assert.equal(waiting.feedback.signal, 'unknown');
  assert.equal(waiting.reason, 'outcome-window');
  assert.equal(topicChange.state, 'quarantine');
  assert.equal(topicChange.feedback.signal, 'unknown');
  assert.equal(topicChange.reason, 'no-qualified-outcome');
  assert.equal(topicChange.eligibleForPromotion, false);
});

test('accepted outcome requires both compile and render plus the full grace period', () => {
  const events = validated([action('accepted', 1_300)]);
  const before = reduceRevisionOutcome({ events, nowMs: 31_299 });
  const after = reduceRevisionOutcome({ events, nowMs: 31_300 });
  const noRender = reduceRevisionOutcome({
    events: [generation(), validation('compile', 1_100), action('accepted', 1_300)],
    nowMs: 31_300,
  });

  assert.equal(before.state, 'pending');
  assert.equal(before.grace.remainingMs, 1);
  assert.equal(after.state, 'candidate');
  assert.equal(after.feedback.signal, 'positive');
  assert.equal(after.validation.complete, true);
  assert.match(after.validation.receiptSha256, /^[a-f0-9]{64}$/u);
  assert.equal(noRender.state, 'pending');
  assert.equal(noRender.reason, 'compile-render-validation-pending');
  assert.equal(noRender.eligibleForPromotion, false);
});

test('export is neutral while accepted and reuse are positive qualified outcomes', () => {
  for (const [actionName, expected] of [
    ['exported', 'neutral'],
    ['continued-unchanged', 'neutral'],
    ['accepted', 'positive'],
    ['reused', 'positive'],
  ]) {
    const outcome = reduceRevisionOutcome({
      events: validated([action(actionName, 1_300)]),
      nowMs: 31_300,
    });
    assert.equal(outcome.state, 'candidate', actionName);
    assert.equal(outcome.feedback.signal, expected, actionName);
  }
});

test('negative has absolute precedence and reduction is input-order invariant', () => {
  const events = validated([
    action('accepted', 1_300),
    action('corrected', 1_400),
    action('exported', 1_500),
  ]);
  const forward = reduceRevisionOutcome({ events, nowMs: 40_000 });
  const reverse = reduceRevisionOutcome({ events: [...events].reverse(), nowMs: 40_000 });

  assert.deepEqual(forward, reverse);
  assert.equal(forward.state, 'discard');
  assert.equal(forward.feedback.signal, 'negative');
  assert.equal(forward.reason, 'negative-outcome');
});

test('a later successful validation retry can qualify the exact immutable revision', () => {
  const events = validated([
    validation('render', 1_250, 'failed'),
    validation('render', 1_300, 'passed'),
    action('reused', 1_400),
  ]);
  const outcome = reduceRevisionOutcome({ events, nowMs: 31_400 });
  assert.equal(outcome.state, 'candidate');
  assert.equal(outcome.validation.render.status, 'passed');
});

test('scope mismatch quarantines and duplicate event delivery is idempotent', () => {
  const events = validated([action('accepted', 1_300)]);
  const mismatch = reduceRevisionOutcome({
    events: [...events, action('accepted', 1_400, OTHER_REVISION)],
    revisionSha256: REVISION,
    nowMs: 40_000,
  });
  const once = reduceRevisionOutcome({ events, nowMs: 40_000 });
  const duplicated = reduceRevisionOutcome({ events: [...events, ...events], nowMs: 40_000 });

  assert.equal(mismatch.state, 'quarantine');
  assert.equal(mismatch.reason, 'revision-scope-mismatch');
  assert.deepEqual(once, duplicated);
});

test('workspace outcome is hash-only, revision-bound, and cannot qualify before validation', () => {
  const accepted = reduceRevisionOutcome({
    events: validated([action('accepted', 1_300)]),
    nowMs: 31_300,
  });
  const incomplete = reduceRevisionOutcome({
    events: [generation(), action('accepted', 1_300)],
    nowMs: 31_300,
  });

  assert.equal(verifyRevisionOutcomeReceipt(accepted), true);
  assert.equal(accepted.revisionSha256, REVISION);
  assert.equal(accepted.state, 'candidate');
  assert.match(accepted.validation.receiptSha256, /^[a-f0-9]{64}$/u);
  assert.equal(incomplete.state, 'pending');
  assert.equal(incomplete.validation.receiptSha256, null);
  assert.equal(incomplete.eligibleForPromotion, false);
  assert.doesNotMatch(
    JSON.stringify({ accepted, incomplete }),
    /prompt|dialogue|content|source|workspaceId|jobId|https?:\/\//iu,
  );
});
