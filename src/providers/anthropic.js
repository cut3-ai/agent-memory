import { loadProviderCredential } from './env.js';
import {
  assertMatchesSchema,
  assertStructuredRequest,
  normalizeUsage,
  postJsonWithRetry,
  ProviderRequestError,
} from './transport.js';

export const ANTHROPIC_MESSAGES_ENDPOINT = 'https://api.anthropic.com/v1/messages';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';

export function createAnthropicProvider(options = {}) {
  const credential = loadProviderCredential('anthropic', options);
  const model = modelId(options.model ?? DEFAULT_ANTHROPIC_MODEL);
  const maxTokens = boundedMaxTokens(options.maxTokens ?? 2_000);

  return Object.freeze({
    provider: 'anthropic',
    model,
    async generateStructured(request) {
      const structured = assertStructuredRequest(request);
      const body = {
        model,
        max_tokens: maxTokens,
        system: structured.system,
        messages: [{ role: 'user', content: structured.prompt }],
        tools: [{
          name: structured.name,
          description: 'Return exactly one object matching the required JSON schema.',
          input_schema: structured.schema,
          strict: true,
        }],
        tool_choice: {
          type: 'tool',
          name: structured.name,
          disable_parallel_tool_use: true,
        },
      };
      if (model === DEFAULT_ANTHROPIC_MODEL) body.thinking = { type: 'disabled' };
      const response = await postJsonWithRetry({
        provider: 'anthropic',
        endpoint: options.endpoint ?? ANTHROPIC_MESSAGES_ENDPOINT,
        headers: credential.apply({
          accept: 'application/json',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        }),
        body,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
        maxRetries: options.maxRetries,
        retryBaseDelayMs: options.retryBaseDelayMs,
        sleepImpl: options.sleepImpl,
      });
      const failureOptions = {
        status: response.request.status,
        attempts: response.request.attempts,
        retryable: false,
      };
      const stopReason = response.data?.stop_reason;
      if (stopReason !== 'tool_use') {
        const code = stopReason === 'max_tokens'
          ? 'max-tokens-before-tool-use'
          : stopReason === 'refusal'
            ? 'structured-output-refusal'
            : 'non-tool-use-stop-reason';
        throw new ProviderRequestError('anthropic', code, failureOptions);
      }
      const calls = Array.isArray(response.data?.content)
        ? response.data.content.filter((entry) => entry?.type === 'tool_use')
        : [];
      if (calls.length !== 1
          || calls[0]?.name !== structured.name
          || !calls[0].input
          || typeof calls[0].input !== 'object'
          || Array.isArray(calls[0].input)) {
        throw new ProviderRequestError(
          'anthropic',
          'missing-structured-tool-call',
          failureOptions,
        );
      }
      try {
        assertMatchesSchema(calls[0].input, structured.schema);
      } catch {
        throw new ProviderRequestError(
          'anthropic',
          'invalid-structured-content',
          failureOptions,
        );
      }
      return structuredResult({
        data: calls[0].input,
        model,
        response,
        usage: normalizeUsage({
          inputTokens: response.data?.usage?.input_tokens,
          outputTokens: response.data?.usage?.output_tokens,
          cachedTokens: response.data?.usage?.cache_read_input_tokens,
          cacheCreationTokens: response.data?.usage?.cache_creation_input_tokens,
        }),
      });
    },
  });
}

function structuredResult({ data, model, response, usage }) {
  const result = {
    provider: 'anthropic',
    model,
    usage,
    request: response.request,
    requestSha256: response.requestSha256,
    responseSha256: response.responseSha256,
  };
  Object.defineProperty(result, 'data', { value: data, enumerable: false });
  return Object.freeze(result);
}

function modelId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(value)) {
    throw new TypeError('Anthropic model id is invalid');
  }
  return value;
}

function boundedMaxTokens(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 128_000) {
    throw new RangeError('Anthropic maxTokens must be from 1 through 128000');
  }
  return value;
}
