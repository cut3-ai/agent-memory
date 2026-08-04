import crypto from 'node:crypto';

import { createAnthropicProvider } from './anthropic.js';
import {
  loadProviderCredential,
  loadProviderCredentialFile,
} from './env.js';
import { createKimiProvider } from './kimi.js';

const MAX_RESPONSE_BYTES = 2_000_000;
const RETRYABLE_STATUS = new Set([408, 425, 429]);
const TIMEOUT = Symbol('provider-timeout');
const PROVIDER_ENDPOINTS = Object.freeze({
  anthropic: 'https://api.anthropic.com/v1/messages',
  kimi: 'https://api.moonshot.ai/v1/chat/completions',
});

export class ProviderRequestError extends Error {
  constructor(provider, code, options = {}) {
    super(`Provider ${provider} request failed with ${code}`);
    this.name = 'ProviderRequestError';
    this.provider = provider;
    this.code = safeCode(code) ?? 'request-error';
    this.status = safeStatus(options.status);
    this.attempts = safeAttempts(options.attempts);
    this.retryable = Boolean(options.retryable);
    this.retryAfterMs = safeMilliseconds(options.retryAfterMs);
  }

  toJSON() {
    return {
      name: this.name,
      provider: this.provider,
      code: this.code,
      status: this.status,
      attempts: this.attempts,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
    };
  }
}

export function createProvider(options = {}) {
  const provider = options.provider;
  const credential = loadProviderCredential(provider, options);
  const providerOptions = {
    credential,
    model: options.model,
    endpoint: options.endpoint,
    maxTokens: options.maxTokens,
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries,
    retryBaseDelayMs: options.retryBaseDelayMs,
    fetchImpl: options.fetchImpl,
    sleepImpl: options.sleepImpl,
  };
  if (provider === 'anthropic') return createAnthropicProvider(providerOptions);
  if (provider === 'kimi') return createKimiProvider(providerOptions);
  throw new RangeError(`Unsupported provider: ${provider}`);
}

export const createStructuredProvider = createProvider;

export async function createProviderFromFile(options = {}) {
  const credential = await loadProviderCredentialFile(
    options.provider,
    options.envFilePath,
    options,
  );
  return createProvider({ ...options, credential });
}

export async function postJsonWithRetry(options) {
  const provider = assertProviderName(options?.provider);
  const endpoint = assertProviderEndpoint(provider, options?.endpoint);
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
  const timeoutMs = boundedInteger(options?.timeoutMs ?? 45_000, 'timeoutMs', 1, 300_000);
  // Model POSTs may already have been billed when a connection fails. Retry is
  // opt-in so callers must consciously accept duplicate-work/cost risk.
  const maxRetries = boundedInteger(options?.maxRetries ?? 0, 'maxRetries', 0, 5);
  const retryBaseDelayMs = boundedInteger(
    options?.retryBaseDelayMs ?? 250,
    'retryBaseDelayMs',
    0,
    30_000,
  );
  const sleepImpl = options?.sleepImpl ?? defaultSleep;
  if (typeof sleepImpl !== 'function') throw new TypeError('sleepImpl must be a function');
  const headers = assertHeaders(options?.headers);
  const serializedBody = JSON.stringify(options?.body ?? null);
  const requestSha256 = sha256(serializedBody);
  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      const { response, parsed, responseText } = await fetchAndReadWithTimeout(
        fetchImpl,
        endpoint,
        {
          method: 'POST',
          headers,
          body: serializedBody,
          cache: 'no-store',
          redirect: 'error',
        },
        timeoutMs,
        provider,
        attempt,
      );
      const retryable = isRetryableStatus(response.status);
      const retryAfterMs = parseRetryAfter(response.headers?.get?.('retry-after'));
      if (!response.ok) {
        const providerCode = safeCode(parsed?.error?.code ?? parsed?.error?.type);
        const error = new ProviderRequestError(provider, providerCode ?? `http-${response.status}`, {
          status: response.status,
          attempts: attempt,
          retryable,
          retryAfterMs,
        });
        if (!retryable || attempt > maxRetries) throw error;
        lastError = error;
        await sleepBeforeRetry(sleepImpl, retryDelay(retryBaseDelayMs, attempt, retryAfterMs));
        continue;
      }

      const result = {
        request: Object.freeze({ attempts: attempt, retries: attempt - 1, status: response.status }),
        requestSha256,
        responseSha256: sha256(responseText),
      };
      Object.defineProperty(result, 'data', { value: parsed, enumerable: false });
      return Object.freeze(result);
    } catch (error) {
      const normalized = normalizeRequestFailure(provider, error, attempt);
      if (!normalized.retryable || attempt > maxRetries) throw normalized;
      lastError = normalized;
      await sleepBeforeRetry(sleepImpl, retryDelay(retryBaseDelayMs, attempt));
    }
  }
  throw lastError ?? new ProviderRequestError(provider, 'request-error');
}

export function normalizeUsage(value = {}) {
  const inputTokens = tokenCount(value.inputTokens);
  const outputTokens = tokenCount(value.outputTokens);
  const cachedTokens = tokenCount(value.cachedTokens);
  const cacheCreationTokens = tokenCount(value.cacheCreationTokens);
  return Object.freeze({
    inputTokens,
    outputTokens,
    cachedTokens,
    cacheCreationTokens,
    totalTokens: inputTokens + outputTokens,
  });
}

export function assertStructuredRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Structured generation request must be an object');
  }
  const system = boundedString(value.system, 'system', 1, 40_000);
  const prompt = boundedString(value.prompt, 'prompt', 1, 300_000);
  const name = value.name === undefined ? 'structured_response' : boundedName(value.name);
  if (!value.schema || typeof value.schema !== 'object' || Array.isArray(value.schema)) {
    throw new TypeError('Structured generation schema must be an object');
  }
  let serialized;
  try {
    serialized = JSON.stringify(value.schema);
  } catch {
    throw new TypeError('Structured generation schema must be JSON serializable');
  }
  if (!serialized || serialized.length > 100_000) {
    throw new RangeError('Structured generation schema is too large');
  }
  return { system, prompt, name, schema: value.schema };
}

export function assertMatchesSchema(value, schema) {
  validateSchemaNode(value, schema);
  return value;
}

export function sanitizeProviderError(provider, error) {
  if (error instanceof ProviderRequestError) return error;
  return new ProviderRequestError(provider, 'structured-output-error');
}

function normalizeRequestFailure(provider, error, attempts) {
  if (error instanceof ProviderRequestError) return error;
  if (error === TIMEOUT || error?.name === 'AbortError') {
    return new ProviderRequestError(provider, 'timeout', { attempts, retryable: true });
  }
  return new ProviderRequestError(provider, 'network-error', { attempts, retryable: true });
}

async function fetchAndReadWithTimeout(fetchImpl, endpoint, init, timeoutMs, provider, attempts) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(TIMEOUT);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(async () => {
        const response = await fetchImpl(endpoint, { ...init, signal: controller.signal });
        const { parsed, text } = await readResponseJson(response, provider, attempts);
        return { response, parsed, responseText: text };
      }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseJson(response, provider, attempts) {
  const status = safeStatus(response?.status);
  if (!response || typeof response.text !== 'function' || status === null) {
    throw new ProviderRequestError(provider, 'invalid-response', { attempts });
  }
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new ProviderRequestError(provider, 'response-too-large', { status, attempts });
  }
  let text;
  try {
    text = await response.text();
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ProviderRequestError(provider, 'response-read-error', { status, attempts });
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new ProviderRequestError(provider, 'response-too-large', { status, attempts });
  }
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (response.ok && !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new ProviderRequestError(provider, 'invalid-content-type', { status, attempts });
  }
  try {
    const parsed = text ? JSON.parse(text) : null;
    if (response.ok && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
      throw new ProviderRequestError(provider, 'invalid-json-object', { status, attempts });
    }
    return { parsed, text };
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (!response.ok) return { parsed: null, text };
    throw new ProviderRequestError(provider, 'invalid-json', { status, attempts });
  }
}

function validateSchemaNode(value, schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new TypeError('Structured output schema is invalid');
  }
  if (Object.hasOwn(schema, 'const') && value !== schema.const) throw new Error('Schema mismatch');
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => Object.is(entry, value))) {
    throw new Error('Schema mismatch');
  }
  if (Array.isArray(schema.type)) {
    if (!schema.type.some((type) => matchesSchema(value, { ...schema, type }))) {
      throw new Error('Schema mismatch');
    }
    return;
  }
  if (Array.isArray(schema.anyOf)) {
    if (!schema.anyOf.some((branch) => matchesSchema(value, branch))) throw new Error('Schema mismatch');
    return;
  }
  if (Array.isArray(schema.oneOf)) {
    if (schema.oneOf.filter((branch) => matchesSchema(value, branch)).length !== 1) {
      throw new Error('Schema mismatch');
    }
    return;
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Schema mismatch');
    const properties = schema.properties ?? {};
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) throw new Error('Schema mismatch');
    }
    if (schema.additionalProperties === false
        && Object.keys(value).some((key) => !Object.hasOwn(properties, key))) {
      throw new Error('Schema mismatch');
    }
    for (const [key, nested] of Object.entries(value)) {
      if (properties[key]) validateSchemaNode(nested, properties[key]);
    }
    return;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new Error('Schema mismatch');
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) throw new Error('Schema mismatch');
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) throw new Error('Schema mismatch');
    if (schema.uniqueItems && new Set(value.map(stableJson)).size !== value.length) {
      throw new Error('Schema mismatch');
    }
    if (schema.items) value.forEach((entry) => validateSchemaNode(entry, schema.items));
    return;
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') throw new Error('Schema mismatch');
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) throw new Error('Schema mismatch');
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) throw new Error('Schema mismatch');
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(value)) {
      throw new Error('Schema mismatch');
    }
    return;
  }
  if (schema.type === 'integer' && !Number.isInteger(value)) throw new Error('Schema mismatch');
  if (schema.type === 'number' && !Number.isFinite(value)) throw new Error('Schema mismatch');
  if (schema.type === 'boolean' && typeof value !== 'boolean') throw new Error('Schema mismatch');
  if (schema.type === 'null' && value !== null) throw new Error('Schema mismatch');
  if ((schema.type === 'integer' || schema.type === 'number') && Number.isFinite(value)) {
    if (Number.isFinite(schema.minimum) && value < schema.minimum) throw new Error('Schema mismatch');
    if (Number.isFinite(schema.maximum) && value > schema.maximum) throw new Error('Schema mismatch');
  }
}

function matchesSchema(value, schema) {
  try {
    validateSchemaNode(value, schema);
    return true;
  } catch {
    return false;
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function retryDelay(base, attempt, retryAfterMs = null) {
  if (retryAfterMs !== null) return Math.min(retryAfterMs, 30_000);
  return Math.min(base * (2 ** (attempt - 1)), 30_000);
}

async function sleepBeforeRetry(sleepImpl, milliseconds) {
  if (milliseconds > 0) await sleepImpl(milliseconds);
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryableStatus(status) {
  return RETRYABLE_STATUS.has(status) || (status >= 500 && status <= 599);
}

function parseRetryAfter(value) {
  if (value === null || value === undefined) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function assertHeaders(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Provider headers must be an object');
  }
  return { ...value };
}

export function assertProviderEndpoint(providerName, value) {
  const provider = assertProviderName(providerName);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError('Provider endpoint must be an HTTPS URL');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new TypeError('Provider endpoint must be an HTTPS URL without credentials');
  }
  const normalized = parsed.toString();
  if (normalized !== PROVIDER_ENDPOINTS[provider]) {
    throw new TypeError(`Provider endpoint is not allowed for ${provider}`);
  }
  return normalized;
}

function assertProviderName(value) {
  if (!['anthropic', 'kimi'].includes(value)) throw new RangeError(`Unsupported provider: ${value}`);
  return value;
}

function boundedName(value) {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value)) {
    throw new TypeError('Structured output name is invalid');
  }
  return value;
}

function boundedString(value, label, minimum, maximum) {
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum) {
    throw new RangeError(`${label} must contain ${minimum} through ${maximum} characters`);
  }
  return value;
}

function boundedInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be from ${minimum} through ${maximum}`);
  }
  return value;
}

function tokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeCode(value) {
  const code = String(value ?? '').toLowerCase();
  return /^[a-z0-9][a-z0-9_.-]{0,79}$/.test(code) ? code : null;
}

function safeStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

function safeAttempts(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function safeMilliseconds(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export * from './anthropic.js';
export * from './env.js';
export * from './kimi.js';
export * from './proposal-contract.js';
export * from './proposal.js';
