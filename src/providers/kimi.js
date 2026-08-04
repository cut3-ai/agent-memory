import { loadProviderCredential } from './env.js';
import {
  assertMatchesSchema,
  assertStructuredRequest,
  normalizeUsage,
  postJsonWithRetry,
  ProviderRequestError,
} from './index.js';

export const KIMI_CHAT_ENDPOINT = 'https://api.moonshot.ai/v1/chat/completions';
export const DEFAULT_KIMI_MODEL = 'kimi-k2.6';

export function createKimiProvider(options = {}) {
  const credential = loadProviderCredential('kimi', options);
  const model = modelId(options.model ?? DEFAULT_KIMI_MODEL);
  const maxTokens = boundedMaxTokens(options.maxTokens ?? 2_000);

  return Object.freeze({
    provider: 'kimi',
    model,
    async generateStructured(request) {
      const structured = assertStructuredRequest(request);
      const body = {
        model,
        max_completion_tokens: maxTokens,
        n: 1,
        stream: false,
        messages: [
          { role: 'system', content: structured.system },
          { role: 'user', content: structured.prompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: structured.name,
            strict: true,
            schema: structured.schema,
          },
        },
      };
      if (model === 'kimi-k2.6') body.thinking = { type: 'disabled' };
      const response = await postJsonWithRetry({
        provider: 'kimi',
        endpoint: options.endpoint ?? KIMI_CHAT_ENDPOINT,
        headers: credential.apply({
          accept: 'application/json',
          'content-type': 'application/json',
        }),
        body,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
        maxRetries: options.maxRetries,
        retryBaseDelayMs: options.retryBaseDelayMs,
        sleepImpl: options.sleepImpl,
      });
      const choices = response.data?.choices;
      if (!Array.isArray(choices) || choices.length !== 1) {
        throw new ProviderRequestError('kimi', 'invalid-choice-count', {
          attempts: response.request.attempts,
        });
      }
      const finishReason = choices[0]?.finish_reason;
      if (finishReason !== undefined && finishReason !== 'stop') {
        throw new ProviderRequestError('kimi', 'incomplete-structured-content', {
          attempts: response.request.attempts,
        });
      }
      const content = choices[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new ProviderRequestError('kimi', 'missing-structured-content', {
          attempts: response.request.attempts,
        });
      }
      let data;
      try {
        data = JSON.parse(content);
      } catch {
        throw new ProviderRequestError('kimi', 'invalid-structured-json', {
          status: response.request.status,
          attempts: response.request.attempts,
          retryable: false,
        });
      }
      try {
        assertMatchesSchema(data, structured.schema);
      } catch {
        throw new ProviderRequestError('kimi', structuredViolationCode(data, structured.schema), {
          status: response.request.status,
          attempts: response.request.attempts,
          retryable: false,
        });
      }
      return structuredResult({
        data,
        model,
        response,
        usage: normalizeUsage({
          inputTokens: response.data?.usage?.prompt_tokens,
          outputTokens: response.data?.usage?.completion_tokens,
          cachedTokens: response.data?.usage?.prompt_tokens_details?.cached_tokens
            ?? response.data?.usage?.cached_tokens,
        }),
      });
    },
  });
}

/** Return only a bounded structural reason; never copy provider output. */
function structuredViolationCode(value, schema) {
  if (schema?.type !== 'object') return 'invalid-structured-content';
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'invalid-structured-object';
  }
  const keys = Object.keys(value);
  const required = Array.isArray(schema.required) ? schema.required : [];
  if (required.some((key) => !Object.hasOwn(value, key))) {
    return 'missing-structured-field';
  }
  const properties = schema.properties ?? {};
  if (schema.additionalProperties === false
      && keys.some((key) => !Object.hasOwn(properties, key))) {
    return 'unexpected-structured-field';
  }
  for (const [key, property] of Object.entries(properties)) {
    if (Object.hasOwn(value, key)
        && Array.isArray(property?.enum)
        && !property.enum.some((entry) => Object.is(entry, value[key]))) {
      return 'invalid-structured-enum';
    }
  }
  return 'invalid-structured-content';
}

function structuredResult({ data, model, response, usage }) {
  const result = {
    provider: 'kimi',
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
    throw new TypeError('Kimi model id is invalid');
  }
  return value;
}

function boundedMaxTokens(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 128_000) {
    throw new RangeError('Kimi maxTokens must be from 1 through 128000');
  }
  return value;
}
