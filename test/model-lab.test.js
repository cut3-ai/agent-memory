import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  assertPublicReceipt,
  createModelLabHook,
  LIVE_MODEL_LAB_CONFIRMATION,
  prepareModelLabRun,
  runModelAdvisoryLab,
  runLiveModelAdvisoryLab,
  runModelLabCli,
  runModelLabDryRunCli,
} from '../src/model-lab/index.js';
import { ProviderRequestError } from '../src/providers/index.js';

test('default lab completes twenty unique adaptive rounds with reviews at 5/10/15/20', async () => {
  const kimiCalls = [];
  const anthropicCalls = [];
  const kimi = fakeProvider('kimi', kimiCalls, (request) => {
    const payload = JSON.parse(request.prompt);
    assert.deepEqual(request.schema.properties.candidateId.enum, payload.candidates.map(({ id }) => id));
    return {
      candidateId: payload.candidates[0].id,
    };
  });
  const anthropic = fakeProvider('anthropic', anthropicCalls, (request) => {
    const payload = JSON.parse(request.prompt);
    return {
      candidateId: payload.candidates.at(-1).id,
    };
  });
  const candidates = Array.from({ length: 20 }, (_, index) => ({
    id: `candidate-${String(index + 1).padStart(2, '0')}`,
    metrics: {
      errors: 20 - index,
      quality: index + 1,
      gates: { deterministic: true },
    },
  }));
  const evaluated = [];
  const accepted = [];

  const result = await runModelAdvisoryLab({
    candidates,
    initialMetrics: { errors: 21, quality: 0, gates: { deterministic: true } },
    kimi,
    anthropic,
    async evaluateCandidate(candidate, context) {
      evaluated.push({ candidate, context });
      return candidate.metrics;
    },
    acceptCandidate(decision) {
      accepted.push(decision);
      return decision.candidateMetrics.quality > decision.baselineMetrics.quality;
    },
  });

  assert.equal(result.roundsRequested, 20);
  assert.equal(result.roundsCompleted, 20);
  assert.deepEqual(result.reviewCheckpoints, [5, 10, 15, 20]);
  assert.equal(kimiCalls.length, 20);
  assert.equal(anthropicCalls.length, 4);
  assert.equal(evaluated.length, 20);
  assert.equal(accepted.length, 20);
  assert.equal(new Set(result.history.map(({ candidateId }) => candidateId)).size, 20);
  assert.deepEqual(result.finalMetrics, candidates.at(-1).metrics);
  assert.ok(result.history.every(({ accepted: value }) => value));

  for (const entry of result.history) {
    assert.deepEqual(Object.keys(entry.selection).sort(), receiptKeys());
    assert.equal(entry.selection.candidateId, entry.candidateId);
    if (entry.review) assert.deepEqual(Object.keys(entry.review).sort(), receiptKeys());
    assert.equal(assertPublicReceipt(entry.selection), entry.selection);
    if (entry.review) assert.equal(assertPublicReceipt(entry.review), entry.review);
  }

  const publicArtifact = JSON.stringify(result);
  assert.doesNotMatch(publicArtifact, /rationale|hidden|SECRET|https:\/\/|transcript|source/i);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.history[0].selection.usage), true);

  for (const request of [...kimiCalls, ...anthropicCalls]) {
    assert.deepEqual(Object.keys(request).sort(), ['name', 'prompt', 'schema', 'system']);
    const payload = JSON.parse(request.prompt);
    assert.ok(payload.candidates.every((candidate) => (
      Object.keys(candidate).sort().join(',') === 'id,metrics'
    )));
    assert.doesNotMatch(`${request.system}\n${request.prompt}`, /https?:|transcript|corpus|source|patch|workspace/i);
  }
  assert.equal(Object.hasOwn(JSON.parse(kimiCalls[5].prompt), 'advisoryCandidateId'), false);
  assert.deepEqual(
    JSON.parse(anthropicCalls[0].prompt).candidates.map(({ id }) => id),
    candidates.slice(0, 5).map(({ id }) => id),
  );

  const tampered = JSON.parse(JSON.stringify(result.history[0].selection));
  tampered.candidateId = 'candidate-tampered';
  assert.throws(() => assertPublicReceipt(tampered), /hash mismatch/);
});

test('local strict validation rejects a rationale field before evaluation and sanitizes the failure', async () => {
  let evaluations = 0;
  const calls = [];
  const kimi = fakeProvider('kimi', calls, () => ({
    candidateId: 'candidate-1',
    rationale: 'private rationale SECRET',
  }));

  await assert.rejects(
    runModelAdvisoryLab({
      rounds: 1,
      reviewCheckpoints: [],
      candidates: [{ id: 'candidate-1', metrics: { quality: 1 } }],
      initialMetrics: { quality: 0 },
      kimi,
      evaluateCandidate() {
        evaluations += 1;
        return { quality: 1 };
      },
      acceptCandidate: () => true,
    }),
    (error) => {
      assert.equal(error.name, 'ModelAdvisoryLabError');
      assert.equal(error.round, 1);
      assert.equal(error.stage, 'kimi-selection');
      assert.equal(error.code, 'kimi-selection-failed');
      assert.doesNotMatch(JSON.stringify(error), /SECRET|private/i);
      return true;
    },
  );
  assert.equal(evaluations, 0);
  assert.equal(calls.length, 1);
});

test('round failure preserves and prints only safe provider diagnostics', async () => {
  const privatePayload = 'PRIVATE_ANTHROPIC_RESPONSE_PAYLOAD';
  const providerFailure = new ProviderRequestError(
    'anthropic',
    'max-tokens-before-tool-use',
    { status: 200, attempts: 1, retryable: false },
  );
  providerFailure.responsePayload = privatePayload;

  await assert.rejects(
    runModelAdvisoryLab({
      rounds: 1,
      reviewCheckpoints: [1],
      candidates: [{ id: 'candidate-1', metrics: { quality: 1 } }],
      initialMetrics: { quality: 0 },
      kimi: fakeProvider('kimi', [], () => ({
        candidateId: 'candidate-1',
      })),
      anthropic: {
        provider: 'anthropic',
        model: 'fixture-model',
        async generateStructured() { throw providerFailure; },
      },
      evaluateCandidate: (candidate) => candidate.metrics,
      acceptCandidate: () => false,
    }),
    (error) => {
      assert.equal(error.name, 'ModelAdvisoryLabError');
      assert.equal(error.stage, 'anthropic-review');
      assert.equal(error.providerCode, 'max-tokens-before-tool-use');
      assert.equal(error.providerStatus, 200);
      assert.equal(error.providerRetryable, false);
      assert.match(
        error.message,
        /provider code=max-tokens-before-tool-use status=200 retryable=false/u,
      );
      assert.deepEqual(Object.keys(error).sort(), [
        'code',
        'name',
        'providerCode',
        'providerRetryable',
        'providerStatus',
        'round',
        'stage',
      ]);
      assert.doesNotMatch(JSON.stringify(error), new RegExp(privatePayload, 'u'));
      assert.equal(Object.hasOwn(error, 'responsePayload'), false);
      return true;
    },
  );
});

test('model advice never reaches deterministic evaluation or acceptance authority', async () => {
  const acceptInputs = [];
  const evaluationContexts = [];
  const kimi = fakeProvider('kimi', [], (request) => ({
    candidateId: JSON.parse(request.prompt).candidates[0].id,
  }));
  const anthropic = fakeProvider('anthropic', [], (request) => ({
    candidateId: JSON.parse(request.prompt).candidates.at(-1).id,
  }));

  const result = await runModelAdvisoryLab({
    rounds: 2,
    reviewCheckpoints: [1, 2],
    candidates: [
      { id: 'candidate-a', metrics: { quality: 100 } },
      { id: 'candidate-b', metrics: { quality: 200 } },
    ],
    initialMetrics: { quality: 1 },
    kimi,
    anthropic,
    evaluateCandidate(candidate, context) {
      evaluationContexts.push(context);
      return candidate.metrics;
    },
    acceptCandidate(input) {
      acceptInputs.push(input);
      return false;
    },
  });

  assert.deepEqual(result.history.map(({ accepted }) => accepted), [false, false]);
  assert.deepEqual(result.finalMetrics, { quality: 1 });
  assert.deepEqual(evaluationContexts.map((value) => Object.keys(value).sort()), [
    ['currentMetrics', 'round'],
    ['currentMetrics', 'round'],
  ]);
  assert.deepEqual(acceptInputs.map((value) => Object.keys(value).sort()), [
    ['baselineMetrics', 'candidateId', 'candidateMetrics', 'round'],
    ['baselineMetrics', 'candidateId', 'candidateMetrics', 'round'],
  ]);
  assert.doesNotMatch(JSON.stringify({ evaluationContexts, acceptInputs }), /rationale|review|provider|model/i);
});

test('unsafe catalog material and non-aggregate metrics fail before any provider call', async () => {
  let calls = 0;
  const kimi = fakeProvider('kimi', [], () => {
    calls += 1;
    return { candidateId: 'candidate-1' };
  });
  const base = {
    rounds: 1,
    reviewCheckpoints: [],
    initialMetrics: { quality: 0 },
    kimi,
    evaluateCandidate: (candidate) => candidate.metrics,
    acceptCandidate: () => false,
  };
  const invalidCatalogs = [
    [{ id: '../candidate', metrics: { quality: 1 } }],
    [{ id: 'transcript-candidate', metrics: { quality: 1 } }],
    [{ id: 'candidate-1', metrics: { quality: 1 }, source: 'private' }],
    [{ id: 'candidate-1', metrics: { sourceURL: 1 } }],
    [{ id: 'candidate-1', metrics: { quality: 'https://private.invalid' } }],
    [{ id: 'candidate-1', metrics: { quality: [1, 2, 3] } }],
  ];
  for (const candidates of invalidCatalogs) {
    await assert.rejects(runModelAdvisoryLab({ ...base, candidates }));
  }
  await assert.rejects(runModelAdvisoryLab({
    ...base,
    rounds: 2,
    candidates: [{ id: 'candidate-1', metrics: { quality: 1 } }],
  }), /Candidate catalog must contain 2/);
  await assert.rejects(runModelAdvisoryLab({
    ...base,
    rounds: 21,
    candidates: [],
  }), /rounds must be from 1 through 20/);
  assert.equal(calls, 0);
});

test('configurable hook and CLI writer expose only the public JSON receipt', async () => {
  const dependencies = createDependencies();
  const hook = createModelLabHook(dependencies);
  const input = {
    rounds: 3,
    reviewCheckpoints: [2],
    candidates: [
      { id: 'plan-a', metrics: { exactCompositions: 1, failures: 2 } },
      { id: 'plan-b', metrics: { exactCompositions: 2, failures: 1 } },
      { id: 'plan-c', metrics: { exactCompositions: 3, failures: 0 } },
    ],
    initialMetrics: { exactCompositions: 0, failures: 3 },
  };
  const result = await hook.run(input);
  assert.equal(result.roundsCompleted, 3);
  assert.deepEqual(result.reviewCheckpoints, [2]);

  const output = [];
  const cliResult = await runModelLabCli({ ...input, ...createDependencies() }, {
    stdout: { write: (value) => output.push(value) },
  });
  assert.equal(output.length, 1);
  assert.deepEqual(JSON.parse(output[0]), cliResult);
  assert.doesNotMatch(output[0], /rationale text|private|https?:\/\//i);
});

test('dry-run plan declares the exact 20 Kimi plus 4 Anthropic budget without credentials or calls', async () => {
  const input = liveInput();
  const plan = prepareModelLabRun(input);
  assert.deepEqual(plan.calls, { kimi: 20, anthropic: 4, total: 24 });
  assert.equal(plan.providerResponseCheckpoints, 24);
  assert.equal(plan.phaseCheckpoints, 44);
  assert.deepEqual(plan.reviewCheckpoints, [5, 10, 15, 20]);
  assert.deepEqual(plan.requiredEnvironmentKeys, ['MOONSHOT_API_KEY', 'ANTHROPIC_API_KEY']);
  assert.equal(plan.credentialFile, '.env');
  assert.equal(plan.modelAcceptanceAuthority, false);
  assert.equal(plan.modelSearchOrderAuthority, true);
  assert.equal(plan.sequentialRevealRequired, true);
  assert.equal(plan.sequentialRevealConfigured, true);
  assert.equal(plan.durablePhaseCheckpointsRequired, true);
  assert.equal(plan.durablePhaseCheckpointsConfigured, true);
  assert.equal(plan.durableProviderIntentsRequired, true);
  assert.equal(plan.durableProviderIntentsConfigured, true);
  assert.equal(plan.searchSpaceSize, 24);
  assert.equal(plan.paidCallsAuthorized, false);
  assert.match(plan.planSha256, /^[a-f0-9]{64}$/);

  const output = [];
  const cliPlan = await runModelLabDryRunCli(input, {
    stdout: { write: (value) => output.push(value) },
  });
  assert.deepEqual(JSON.parse(output[0]), cliPlan);
  assert.doesNotMatch(output[0], /api[-_]?key.*fixture|prompt|transcript|source|https?:/iu);

  await assert.rejects(
    runLiveModelAdvisoryLab(input),
    /explicit 20\+4 confirmation/,
  );

  let unsafeCalls = 0;
  await assert.rejects(runLiveModelAdvisoryLab({
    ...input,
    candidates: input.candidates.map((candidate, index) => (
      index === 0 ? { ...candidate, id: 'readable-candidate-01' } : candidate
    )),
    confirmPaidCalls: LIVE_MODEL_LAB_CONFIRMATION,
    fetchImpl: async () => {
      unsafeCalls += 1;
      throw new Error('must not run');
    },
  }), /opaque hashes/);
  assert.equal(unsafeCalls, 0);
});

test('confirmed live API makes exactly 20 plus 4 mocked calls and keeps model advice non-authoritative', async () => {
  const calls = [];
  const input = liveInput();
  const result = await runLiveModelAdvisoryLab({
    ...input,
    confirmPaidCalls: LIVE_MODEL_LAB_CONFIRMATION,
    env: {
      MOONSHOT_API_KEY: 'fixture-kimi-local-key',
      ANTHROPIC_API_KEY: 'fixture-anthropic-local-key',
    },
    async fetchImpl(url, init) {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      if (url.includes('moonshot')) {
        const payload = JSON.parse(body.messages[1].content);
        return jsonResponse({
          choices: [{
            finish_reason: 'stop',
            message: { content: JSON.stringify({
              candidateId: payload.candidates[0].id,
            }) },
          }],
          usage: { prompt_tokens: 4, completion_tokens: 2 },
        });
      }
      const payload = JSON.parse(body.messages[0].content);
      return jsonResponse({
        stop_reason: 'tool_use',
        content: [{
          type: 'tool_use',
          name: body.tool_choice.name,
          input: {
            candidateId: payload.candidates[0].id,
          },
        }],
        usage: { input_tokens: 4, output_tokens: 2 },
      });
    },
  });

  const kimiCalls = calls.filter(({ url }) => url.includes('moonshot'));
  const anthropicCalls = calls.filter(({ url }) => url.includes('anthropic'));
  assert.equal(kimiCalls.length, 20);
  assert.equal(anthropicCalls.length, 4);
  assert.equal(kimiCalls[0].body.model, 'kimi-k2.6');
  assert.equal(kimiCalls[0].body.max_completion_tokens, 512);
  assert.equal(Object.hasOwn(kimiCalls[0].body, 'max_tokens'), false);
  assert.deepEqual(kimiCalls[0].body.thinking, { type: 'disabled' });
  assert.deepEqual(anthropicCalls[0].body.thinking, { type: 'disabled' });
  assert.equal(result.roundsCompleted, 20);
  assert.ok(result.history.every(({ accepted }) => accepted === false));
  assert.doesNotMatch(JSON.stringify(result), /private|local-key|rationale text/iu);
});

function createDependencies() {
  return {
    kimi: fakeProvider('kimi', [], (request) => ({
      candidateId: JSON.parse(request.prompt).candidates[0].id,
    })),
    anthropic: fakeProvider('anthropic', [], (request) => ({
      candidateId: JSON.parse(request.prompt).candidates[0].id,
    })),
    evaluateCandidate: (candidate) => candidate.metrics,
    acceptCandidate: ({ candidateMetrics, baselineMetrics }) => (
      candidateMetrics.exactCompositions > baselineMetrics.exactCompositions
    ),
  };
}

function fakeProvider(provider, calls, choose) {
  const model = `${provider}-test`;
  return Object.freeze({
    provider,
    model,
    async generateStructured(request) {
      calls.push(request);
      const data = await choose(request, calls.length);
      const result = {
        provider,
        model,
        usage: {
          inputTokens: 3,
          outputTokens: 2,
          cachedTokens: 0,
          cacheCreationTokens: 0,
          totalTokens: 5,
        },
        requestSha256: sha256(JSON.stringify(request)),
        responseSha256: sha256(JSON.stringify(data)),
      };
      Object.defineProperty(result, 'data', { value: data, enumerable: false });
      return Object.freeze(result);
    },
  });
}

function receiptKeys() {
  return [
    'candidateId',
    'model',
    'provider',
    'receiptSha256',
    'requestSha256',
    'responseSha256',
    'usage',
  ].sort();
}

function liveInput() {
  return {
    candidates: Array.from({ length: 24 }, (_, index) => ({
      id: `p_${(index + 1).toString(16).padStart(8, '0')}`,
      metrics: { failures: 20 - index, quality: index + 1 },
    })),
    initialMetrics: { failures: 21, quality: 0 },
    checkpointBindingSha256: 'b'.repeat(64),
    onPhaseCheckpoint() {},
    onProviderIntent() {},
    onProviderCheckpointed() {},
    revealCandidateIds({ remainingCandidateIds }) {
      return remainingCandidateIds.slice(0, 6);
    },
    evaluateCandidate: (candidate) => candidate.metrics,
    acceptCandidate: () => false,
  };
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
