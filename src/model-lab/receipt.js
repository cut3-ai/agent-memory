import crypto from 'node:crypto';

import {
  normalizeCandidateId,
  validateCandidateChoice,
} from './contracts.js';

const SHA256 = /^[a-f0-9]{64}$/;

export function consumeStructuredChoice(result, expectedProvider, remainingIds) {
  if (!result || typeof result !== 'object') throw new TypeError('Provider result is invalid');
  if (result.provider !== expectedProvider) throw new Error('Provider result identity mismatch');
  if (typeof result.model !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(result.model)) {
    throw new Error('Provider result model is invalid');
  }
  if (!SHA256.test(result.requestSha256) || !SHA256.test(result.responseSha256)) {
    throw new Error('Provider result hashes are invalid');
  }
  const choice = validateCandidateChoice(result.data, remainingIds);
  const body = {
    candidateId: choice.candidateId,
    provider: expectedProvider,
    model: result.model,
    usage: normalizeUsage(result.usage),
    requestSha256: result.requestSha256,
    responseSha256: result.responseSha256,
    rationaleSha256: sha256(choice.rationale),
  };
  const receipt = Object.freeze({
    ...body,
    receiptSha256: sha256(stableJson(body)),
  });
  return Object.freeze({ choice, receipt });
}

export function assertPublicReceipt(value) {
  if (!isPlainDataObject(value)) throw new TypeError('Receipt must be a plain data object');
  const keys = Object.keys(value).sort();
  const expected = [
    'candidateId',
    'model',
    'provider',
    'rationaleSha256',
    'requestSha256',
    'receiptSha256',
    'responseSha256',
    'usage',
  ].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error('Receipt contains unsupported fields');
  }
  normalizeCandidateId(value.candidateId);
  if (!['kimi', 'anthropic'].includes(value.provider)) throw new Error('Receipt provider is invalid');
  if (typeof value.model !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(value.model)) {
    throw new Error('Receipt model is invalid');
  }
  for (const field of ['rationaleSha256', 'requestSha256', 'responseSha256', 'receiptSha256']) {
    if (!SHA256.test(value[field])) throw new Error('Receipt hash is invalid');
  }
  assertExactUsage(value.usage);
  const { receiptSha256, ...body } = value;
  if (sha256(stableJson(body)) !== receiptSha256) throw new Error('Receipt hash mismatch');
  return value;
}

function normalizeUsage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Provider usage is invalid');
  }
  const inputTokens = safeTokenCount(value.inputTokens);
  const outputTokens = safeTokenCount(value.outputTokens);
  const cachedTokens = safeTokenCount(value.cachedTokens);
  const cacheCreationTokens = safeTokenCount(value.cacheCreationTokens);
  const totalTokens = safeTokenCount(value.totalTokens);
  if (totalTokens !== inputTokens + outputTokens) {
    throw new Error('Provider usage total is inconsistent');
  }
  return Object.freeze({
    inputTokens,
    outputTokens,
    cachedTokens,
    cacheCreationTokens,
    totalTokens,
  });
}

function safeTokenCount(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Provider usage is invalid');
  return value;
}

function assertExactUsage(value) {
  if (!isPlainDataObject(value)) throw new TypeError('Receipt usage is invalid');
  const expected = [
    'cacheCreationTokens',
    'cachedTokens',
    'inputTokens',
    'outputTokens',
    'totalTokens',
  ];
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('Receipt usage contains unsupported fields');
  }
  normalizeUsage(value);
}

function isPlainDataObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}
