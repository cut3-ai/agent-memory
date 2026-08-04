import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateFeedbackSignals,
  classifyDialogueFeedback,
  FEEDBACK_CLASSIFICATION_SCHEMA,
  hashDialogueEvent,
} from '../src/feedback/classify.js';
import { createCandidateChoiceSchema } from '../src/model-lab/contracts.js';
import { createAnthropicProvider } from '../src/providers/anthropic.js';
import {
  assertLocalProviderEnvFile,
  defaultCut3EnvFile,
  loadProviderCredential,
  parseEnv,
} from '../src/providers/env.js';
import {
  createProvider,
  ProviderRequestError,
} from '../src/providers/index.js';
import {
  createProposalProvider,
  RawCodeProposalDisabledError,
} from '../src/providers/proposal.js';

const STRUCTURED_REQUEST = Object.freeze({
  name: 'feedback_fixture',
  system: 'Return the fixture classification.',
  prompt: 'Classify fixture message u1.',
  schema: FEEDBACK_CLASSIFICATION_SCHEMA,
});

test('advisory candidate output is a strict minimal enum object for both providers', async () => {
  const schema = createCandidateChoiceSchema(['candidate-1', 'candidate-2']);
  const request = Object.freeze({
    name: 'select_candidate_v2',
    system: 'Return only candidateId.',
    prompt: 'Choose an opaque candidate.',
    schema,
  });
  assert.deepEqual(schema, {
    type: 'object',
    additionalProperties: false,
    required: ['candidateId'],
    properties: {
      candidateId: { type: 'string', enum: ['candidate-1', 'candidate-2'] },
    },
  });

  for (const providerName of ['kimi', 'anthropic']) {
    const exact = createAdvisoryFixtureProvider(providerName, {
      candidateId: 'candidate-2',
    });
    const result = await exact.generateStructured(request);
    assert.deepEqual(result.data, { candidateId: 'candidate-2' });

    const withRationale = createAdvisoryFixtureProvider(providerName, {
      candidateId: 'candidate-2',
      rationale: 'PRIVATE_EXTRA_FIELD',
    });
    await assert.rejects(
      () => withRationale.generateStructured(request),
      (error) => {
        assert.ok(error instanceof ProviderRequestError);
        assert.equal(
          error.code,
          providerName === 'kimi'
            ? 'unexpected-structured-field'
            : 'invalid-structured-content',
        );
        assert.equal(error.status, 200);
        assert.doesNotMatch(JSON.stringify(error), /PRIVATE_EXTRA_FIELD/u);
        return true;
      },
    );
  }
});

test('env parser accepts quoted keys and values while retaining only selected names', () => {
  const parsed = parseEnv([
    '"KIMI" = "fixture value # retained" # comment',
    "'Anthropic' = 'second fixture value'",
    'export KIMI_API_KEY=third-fixture-value # removed comment',
    'UNRELATED=not-retained',
  ].join('\n'), ['KIMI', 'Anthropic', 'KIMI_API_KEY']);

  assert.deepEqual({ ...parsed }, {
    KIMI: 'fixture value # retained',
    Anthropic: 'second fixture value',
    KIMI_API_KEY: 'third-fixture-value',
  });
  const credential = loadProviderCredential('kimi', {
    env: {},
    envText: '"KIMI"="selected-fixture-value"',
  });
  assert.equal(credential.sourceName, 'KIMI');
  assert.doesNotMatch(JSON.stringify(credential), /selected-fixture-value/);
});

test('Kimi provider retries transient responses and returns safe usage/request metadata', async () => {
  let calls = 0;
  let successfulRequest;
  const provider = createProvider({
    provider: 'kimi',
    apiKey: 'fixture-provider-value',
    maxRetries: 1,
    retryBaseDelayMs: 0,
    fetchImpl: async (url, init) => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({ error: { code: 'rate_limited', detail: 'private response detail' } }, {
          status: 429,
          headers: { 'retry-after': '0' },
        });
      }
      successfulRequest = { url, init };
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({
          signal: 'positive',
          evidenceMessageIds: ['u1'],
        }) } }],
        usage: { prompt_tokens: 12, completion_tokens: 4, cached_tokens: 3 },
      });
    },
  });

  const result = await provider.generateStructured(STRUCTURED_REQUEST);
  const body = JSON.parse(successfulRequest.init.body);
  assert.equal(calls, 2);
  assert.equal(successfulRequest.url, 'https://api.moonshot.ai/v1/chat/completions');
  assert.equal(successfulRequest.init.headers.authorization, 'Bearer fixture-provider-value');
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.model, 'kimi-k2.6');
  assert.equal(body.max_completion_tokens, 2_000);
  assert.equal(Object.hasOwn(body, 'max_tokens'), false);
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.deepEqual(result.request, { attempts: 2, retries: 1, status: 200 });
  assert.deepEqual(result.usage, {
    inputTokens: 12,
    outputTokens: 4,
    cachedTokens: 3,
    cacheCreationTokens: 0,
    totalTokens: 16,
  });
  assert.doesNotMatch(JSON.stringify({ provider, result }), /fixture-provider-value|private response detail/);
});

test('Anthropic provider forces one structured tool and normalizes cache usage', async () => {
  let request;
  const provider = createAnthropicProvider({
    apiKey: 'fixture-anthropic-value',
    fetchImpl: async (url, init) => {
      request = { url, init };
      return jsonResponse({
        stop_reason: 'tool_use',
        content: [{
          type: 'tool_use',
          name: 'feedback_fixture',
          input: { signal: 'neutral', evidenceMessageIds: ['u2'] },
        }],
        usage: {
          input_tokens: 20,
          output_tokens: 5,
          cache_read_input_tokens: 7,
          cache_creation_input_tokens: 2,
        },
      });
    },
  });

  const result = await provider.generateStructured(STRUCTURED_REQUEST);
  const body = JSON.parse(request.init.body);
  assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(request.init.headers['x-api-key'], 'fixture-anthropic-value');
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(body.tools[0].strict, true);
  assert.deepEqual(body.tool_choice, {
    type: 'tool',
    name: 'feedback_fixture',
    disable_parallel_tool_use: true,
  });
  assert.deepEqual(result.usage, {
    inputTokens: 20,
    outputTokens: 5,
    cachedTokens: 7,
    cacheCreationTokens: 2,
    totalTokens: 25,
  });
  assert.doesNotMatch(JSON.stringify({ provider, result }), /fixture-anthropic-value/);
});

test('Anthropic provider fails closed on every non-tool stop reason without leaking content', async () => {
  const cases = [
    ['end_turn', 'non-tool-use-stop-reason'],
    ['max_tokens', 'max-tokens-before-tool-use'],
    ['refusal', 'structured-output-refusal'],
  ];

  for (const [stopReason, expectedCode] of cases) {
    const provider = createAnthropicProvider({
      apiKey: 'fixture-anthropic-stop-value',
      maxRetries: 0,
      fetchImpl: async () => jsonResponse({
        stop_reason: stopReason,
        content: [{ type: 'text', text: 'PRIVATE_PROVIDER_RESPONSE' }],
      }),
    });

    await assert.rejects(
      () => provider.generateStructured(STRUCTURED_REQUEST),
      (error) => {
        assert.ok(error instanceof ProviderRequestError);
        assert.equal(error.code, expectedCode);
        assert.equal(error.status, 200);
        assert.equal(error.attempts, 1);
        assert.equal(error.retryable, false);
        assert.doesNotMatch(
          JSON.stringify(error),
          /PRIVATE_PROVIDER_RESPONSE|fixture-anthropic-stop-value/u,
        );
        return true;
      },
    );
  }
});

test('Anthropic post-200 structured failures retain only safe HTTP metadata', async () => {
  const cases = [
    {
      expectedCode: 'missing-structured-tool-call',
      content: [{ type: 'text', text: 'PRIVATE_MISSING_TOOL_RESPONSE' }],
    },
    {
      expectedCode: 'invalid-structured-content',
      content: [{
        type: 'tool_use',
        name: 'feedback_fixture',
        input: {
          signal: 'positive',
          evidenceMessageIds: ['u1'],
          privateUnexpectedField: 'PRIVATE_INVALID_TOOL_RESPONSE',
        },
      }],
    },
  ];

  for (const fixture of cases) {
    const provider = createAnthropicProvider({
      apiKey: 'fixture-anthropic-structured-value',
      maxRetries: 0,
      fetchImpl: async () => jsonResponse({
        stop_reason: 'tool_use',
        content: fixture.content,
      }),
    });

    await assert.rejects(
      () => provider.generateStructured(STRUCTURED_REQUEST),
      (error) => {
        assert.ok(error instanceof ProviderRequestError);
        assert.equal(error.code, fixture.expectedCode);
        assert.equal(error.status, 200);
        assert.equal(error.attempts, 1);
        assert.equal(error.retryable, false);
        assert.doesNotMatch(
          JSON.stringify(error),
          /PRIVATE_|privateUnexpectedField|fixture-anthropic-structured-value/u,
        );
        return true;
      },
    );
  }
});

test('provider rejects JSON that violates the requested schema without leaking it', async () => {
  const provider = createProvider({
    provider: 'kimi',
    apiKey: 'fixture-schema-value',
    maxRetries: 0,
    fetchImpl: async () => jsonResponse({
      choices: [{ message: { content: JSON.stringify({
        signal: 'positive',
        evidenceMessageIds: ['u1'],
        privateUnexpectedField: 'PRIVATE_SCHEMA_OUTPUT',
      }) } }],
      usage: {},
    }),
  });

  await assert.rejects(
    () => provider.generateStructured(STRUCTURED_REQUEST),
    (error) => {
      assert.ok(error instanceof ProviderRequestError);
      assert.equal(error.code, 'unexpected-structured-field');
      assert.equal(error.status, 200);
      assert.doesNotMatch(JSON.stringify(error), /PRIVATE_SCHEMA_OUTPUT|privateUnexpectedField/);
      return true;
    },
  );
});

test('provider timeout is bounded and exposes no request payload', async () => {
  const provider = createProvider({
    provider: 'kimi',
    apiKey: 'fixture-timeout-value',
    timeoutMs: 5,
    maxRetries: 0,
    fetchImpl: async () => new Promise(() => {}),
  });

  await assert.rejects(
    () => provider.generateStructured(STRUCTURED_REQUEST),
    (error) => {
      assert.ok(error instanceof ProviderRequestError);
      assert.equal(error.code, 'timeout');
      assert.equal(error.attempts, 1);
      assert.doesNotMatch(JSON.stringify(error), /fixture-timeout-value|fixture message/);
      return true;
    },
  );
});

test('provider timeout also covers a stalled response body', async () => {
  const provider = createProvider({
    provider: 'kimi',
    apiKey: 'fixture-body-timeout-value',
    timeoutMs: 5,
    maxRetries: 0,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => new Promise(() => {}),
    }),
  });

  await assert.rejects(
    () => provider.generateStructured(STRUCTURED_REQUEST),
    (error) => error instanceof ProviderRequestError && error.code === 'timeout',
  );
});

test('credential file defaults locally and arbitrary endpoints cannot receive provider secrets', async () => {
  const fixtureRoot = process.cwd();
  assert.equal(defaultCut3EnvFile(fixtureRoot), `${fixtureRoot}\\.env`);
  assert.equal(assertLocalProviderEnvFile('.env', fixtureRoot), `${fixtureRoot}\\.env`);
  assert.throws(() => assertLocalProviderEnvFile('provider-secrets.txt', fixtureRoot), /only from a local \.env/);

  let calls = 0;
  const provider = createProvider({
    provider: 'kimi',
    apiKey: 'fixture-endpoint-secret',
    endpoint: 'https://attacker.invalid/v1/chat/completions',
    fetchImpl: async () => {
      calls += 1;
      throw new Error('must not run');
    },
  });
  await assert.rejects(
    provider.generateStructured(STRUCTURED_REQUEST),
    /endpoint is not allowed/,
  );
  assert.equal(calls, 0);
});

test('legacy raw-code proposal path fails before credentials or network access', async () => {
  const proposer = await createProposalProvider({
    provider: 'kimi',
    apiKey: 'must-never-be-read',
    fetchImpl: async () => assert.fail('network must not be reached'),
  });
  await assert.rejects(
    proposer.propose({
      contextFiles: [{ path: 'src/compiler.js', content: 'private source' }],
      allowedFiles: ['src/compiler.js'],
    }),
    (error) => {
      assert.ok(error instanceof RawCodeProposalDisabledError);
      assert.equal(error.code, 'raw-code-proposals-disabled');
      assert.doesNotMatch(JSON.stringify(error), /must-never|private source|compiler\.js/);
      return true;
    },
  );
});

test('deterministic aggregation gives negative precedence and is input-order invariant', () => {
  const signals = [
    { kind: 'positive', atMs: 1_100, messageId: 'u1' },
    { kind: 'negative', atMs: 1_200, messageId: 'u2' },
    { kind: 'neutral', atMs: 1_300, messageId: 'u3' },
  ];
  const options = { generatedAtMs: 1_000, nowMs: 5_000, graceMs: 500 };
  const forward = aggregateFeedbackSignals(signals, options);
  const reverse = aggregateFeedbackSignals([...signals].reverse(), options);

  assert.deepEqual(forward, reverse);
  assert.equal(forward.state, 'reject');
  assert.equal(forward.signal, 'negative');
  assert.deepEqual(forward.counts, { negative: 1, positive: 1, neutral: 1, ambiguous: 0 });
});

test('positive and neutral signals become candidates only after the grace period', () => {
  const pending = aggregateFeedbackSignals({
    signals: [{ kind: 'positive', atMs: 1_100, messageId: 'u1' }],
    generatedAtMs: 1_000,
    nowMs: 1_499,
    graceMs: 400,
  });
  const positive = aggregateFeedbackSignals({
    signals: [{ kind: 'positive', atMs: 1_100, messageId: 'u1' }],
    generatedAtMs: 1_000,
    nowMs: 1_500,
    graceMs: 400,
  });
  const neutral = aggregateFeedbackSignals({
    signals: [{ kind: 'neutral', atMs: 2_000, messageId: 'u2' }],
    generatedAtMs: 1_000,
    nowMs: 2_400,
    graceMs: 400,
  });
  const ambiguous = aggregateFeedbackSignals({
    signals: [{ kind: 'ambiguous', atMs: 2_000, messageId: 'u3' }],
    generatedAtMs: 1_000,
    nowMs: 3_000,
    graceMs: 400,
  });

  assert.equal(pending.state, 'pending');
  assert.equal(pending.grace.remainingMs, 1);
  assert.equal(positive.state, 'candidate');
  assert.equal(neutral.state, 'candidate');
  assert.equal(ambiguous.state, 'quarantine');
});

test('optional structured dialogue classifier feeds deterministic aggregation', async () => {
  let calls = 0;
  let providerRequest;
  const provider = {
    provider: 'fixture',
    model: 'fixture-model',
    async generateStructured(request) {
      calls += 1;
      providerRequest = request;
      return {
        provider: 'kimi',
        model: 'fixture-model',
        data: { signal: 'positive', evidenceMessageIds: ['feedback-01'] },
        usage: { inputTokens: 8, outputTokens: 2, totalTokens: 10 },
        request: { attempts: 1, retries: 0, status: 200 },
      };
    },
  };
  const result = await classifyDialogueFeedback({
    signals: [],
    generatedMessageId: 'a1',
    generatedAtMs: 1_000,
    nowMs: 2_000,
    graceMs: 500,
    feedbackWindowMs: 5_000,
    dialogue: [
      { id: 'before', role: 'user', atMs: 900, content: 'Pre-generation private context.' },
      { id: 'a1', role: 'assistant', atMs: 1_000, content: 'Generated private assistant result.' },
      {
        id: 'u1',
        role: 'user',
        atMs: 1_200,
        content: [
          'Looks good.',
          'https://private.invalid/path',
          'ftp://files.private.invalid/archive',
          'mailto:owner@private.invalid',
          'owner@private.invalid',
          'github.com/private/repository',
          '127.0.0.1:4312/private',
          '[::1]:4312/private',
          'localhost:4312/private',
          '```const privateCode = true;```',
        ].join(' '),
      },
      { id: 'future', role: 'user', atMs: 2_100, content: 'Future private context.' },
    ],
  }, { provider });

  assert.equal(calls, 1);
  assert.equal(providerRequest.name, 'classify_feedback');
  assert.equal(providerRequest.schema.additionalProperties, false);
  const providerPrompt = JSON.parse(providerRequest.prompt);
  assert.deepEqual(Object.keys(providerPrompt), ['userMessages']);
  assert.deepEqual(providerPrompt.userMessages.map(({ id }) => id), ['feedback-01']);
  assert.match(providerPrompt.userMessages[0].content, /\[url-redacted\].*\[code-redacted\]/u);
  assert.doesNotMatch(
    providerRequest.prompt,
    /assistant result|Pre-generation|Future private|private\.invalid|privateCode|github\.com|127\.0\.0\.1|::1|localhost|owner@/u,
  );
  assert.equal(result.state, 'candidate');
  assert.equal(result.classification.source, 'llm');
  assert.equal(result.classification.provider, 'kimi');
  assert.equal(result.classification.externalProviderReceivedMinimizedContent, true);
  assert.deepEqual(result.classification.externalProviderInput, {
    policyVersion: 'feedback-provider-minimization-v1',
    generationBound: true,
    userMessagesOnly: true,
    strictlyAfterGeneratedAtOnly: true,
    boundedFeedbackWindow: true,
    feedbackWindowMs: 5_000,
    maximumMessages: 20,
    maximumCharacters: 8_000,
    messagesSent: 1,
    charactersSent: providerPrompt.userMessages[0].content.length,
    opaqueMessageIds: true,
    urlsRedacted: true,
    codeBlocksRedacted: true,
    sent: true,
  });
  assert.deepEqual(result.evidenceMessageIds, ['u1']);
  assert.deepEqual(result.classification.request, { attempts: 1, retries: 0, status: 200 });
});

test('feedback outside the bounded post-generation window never calls the provider', async () => {
  let calls = 0;
  const result = await classifyDialogueFeedback({
    signals: [],
    generatedMessageId: 'a1',
    generatedAtMs: 1_000,
    nowMs: 10_000,
    feedbackWindowMs: 500,
    dialogue: [
      { id: 'a1', role: 'assistant', atMs: 1_000, content: 'Assistant content.' },
      { id: 'u1', role: 'user', atMs: 1_501, content: 'Too late.' },
    ],
  }, {
    provider: {
      provider: 'fixture',
      model: 'fixture-model',
      async generateStructured() { calls += 1; },
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.reason, 'no-feedback-dialogue');
  assert.equal(result.classification.externalProviderReceivedMinimizedContent, false);
  assert.equal(result.classification.externalProviderInput.sent, false);
});

test('provider feedback minimization redacts secret-like tokens before the call', async () => {
  const rawContent = [
    'Approved, but rotate these credentials:',
    'sk-ant-api03-abcdefghijklmnopqrstuv',
    'sk-proj-abcdefghijklmnopqrstuvwxyz012345',
    `ghp_${'A'.repeat(36)}`,
    `github_pat_${'B'.repeat(32)}`,
    `ANTHROPIC_API_KEY=${'c'.repeat(40)}`,
    `apiKey="${'d'.repeat(40)}"`,
    'monkey=not-a-secret-label',
  ].join(' ');
  let sentContent;
  const provider = {
    provider: 'fixture',
    model: 'fixture-model',
    async generateStructured(request) {
      const body = JSON.parse(request.prompt);
      assert.deepEqual(body.userMessages.map(({ id }) => id), ['feedback-01']);
      sentContent = body.userMessages[0].content;
      return {
        data: { signal: 'positive', evidenceMessageIds: ['feedback-01'] },
      };
    },
  };

  const result = await classifyDialogueFeedback({
    signals: [],
    generatedMessageId: 'a1',
    generatedAtMs: 1_000,
    nowMs: 2_000,
    graceMs: 0,
    dialogue: [
      { id: 'a1', role: 'assistant', atMs: 1_000, content: 'Generated result.' },
      { id: 'u-secret', role: 'user', atMs: 1_100, content: rawContent },
    ],
  }, { provider });

  assert.match(sentContent, /\[secret-redacted\]/u);
  assert.doesNotMatch(sentContent, /sk-(?:ant-|proj-)|ghp_|github_pat_|c{20}|d{20}/iu);
  assert.match(sentContent, /monkey=not-a-secret-label/u);
  assert.deepEqual(result.evidenceMessageIds, ['u-secret']);
  assert.deepEqual(result.classification.evidenceEventSha256s, [hashDialogueEvent({
    id: 'u-secret',
    role: 'user',
    atMs: 1_100,
    content: rawContent,
  })]);
});

test('dialogue classification is bound to the exact generated assistant event', async () => {
  let calls = 0;
  const provider = {
    provider: 'fixture',
    model: 'fixture-model',
    async generateStructured() { calls += 1; return {}; },
  };
  const input = {
    signals: [],
    generatedAtMs: 1_000,
    nowMs: 2_000,
    dialogue: [
      { id: 'a1', role: 'assistant', atMs: 1_000, content: 'First result.' },
      { id: 'a2', role: 'assistant', atMs: 1_500, content: 'Second result.' },
      { id: 'u1', role: 'user', atMs: 1_600, content: 'Approved.' },
    ],
  };

  await assert.rejects(
    classifyDialogueFeedback({ ...input, generatedMessageId: 'missing' }, { provider }),
    /generatedMessageId must reference an assistant/u,
  );
  await assert.rejects(
    classifyDialogueFeedback({ ...input, generatedMessageId: 'a2' }, { provider }),
    /generatedAtMs must match/u,
  );
  assert.equal(calls, 0);
});

test('explicit negative bypasses the model; malformed or failed classification quarantines', async () => {
  let calls = 0;
  const provider = {
    provider: 'fixture',
    model: 'fixture-model',
    async generateStructured() {
      calls += 1;
      return { data: { signal: 'positive', evidenceMessageIds: ['missing'] } };
    },
  };
  const common = {
    generatedMessageId: 'a1',
    generatedAtMs: 1_000,
    nowMs: 2_000,
    graceMs: 100,
    dialogue: [
      { id: 'a1', role: 'assistant', atMs: 1_000, content: 'Generated result.' },
      { id: 'u1', role: 'user', atMs: 1_100, content: 'Fixture response.' },
    ],
  };
  const rejected = await classifyDialogueFeedback({
    ...common,
    signals: [{ kind: 'negative', atMs: 1_100, messageId: 'u1' }],
  }, { provider });
  const quarantined = await classifyDialogueFeedback({ ...common, signals: [] }, { provider });

  assert.equal(rejected.state, 'reject');
  assert.equal(calls, 1, 'only the signal-free dialogue should call the provider');
  assert.equal(quarantined.state, 'quarantine');
  assert.equal(quarantined.reason, 'invalid-classifier-output');

  const failed = await classifyDialogueFeedback({ ...common, signals: [] }, {
    provider: {
      ...provider,
      async generateStructured() { throw new Error('private provider response'); },
    },
  });
  assert.equal(failed.state, 'quarantine');
  assert.equal(failed.reason, 'classifier-error');
  assert.doesNotMatch(JSON.stringify(failed), /private provider response/);
});

function createAdvisoryFixtureProvider(provider, data) {
  return createProvider({
    provider,
    apiKey: `fixture-${provider}-advisory-value`,
    maxRetries: 0,
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      if (provider === 'kimi') {
        return jsonResponse({
          choices: [{
            finish_reason: 'stop',
            message: { content: JSON.stringify(data) },
          }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        });
      }
      return jsonResponse({
        stop_reason: 'tool_use',
        content: [{
          type: 'tool_use',
          name: body.tool_choice.name,
          input: data,
        }],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    },
  });
}

function jsonResponse(value, options = {}) {
  return new Response(JSON.stringify(value), {
    status: options.status ?? 200,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
}
