import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';
import fs from 'node:fs/promises';

import { sha256, stableStringify } from '../lib.js';
import {
  assertLocalProviderEnvFile,
  defaultCut3EnvFile,
  parseEnv,
} from '../providers/env.js';

export const PROMOTION_GATE_RECEIPT_VERSION = 2;
export const PROMOTION_GATE_NAMES = Object.freeze([
  'compilerFidelity',
  'reconstruction',
  'atomicity',
  'privacy',
  'module',
]);
export const PROMOTION_GATE_RECEIPT_SCHEMA = deepFreeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { const: PROMOTION_GATE_RECEIPT_VERSION },
    gateName: { enum: PROMOTION_GATE_NAMES },
    candidateSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    moduleSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    dependencyClosureSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    resultSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    authorityId: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,100}$' },
    passed: { type: 'boolean' },
    signature: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  },
  required: [
    'schemaVersion',
    'gateName',
    'candidateSha256',
    'moduleSha256',
    'dependencyClosureSha256',
    'resultSha256',
    'authorityId',
    'passed',
    'signature',
  ],
});

const GATE_NAMES = new Set(PROMOTION_GATE_NAMES);
const HASH = /^[a-f0-9]{64}$/u;
const SAFE_AUTHORITY = /^[A-Za-z0-9._-]{1,100}$/u;
const RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'gateName',
  'candidateSha256',
  'moduleSha256',
  'dependencyClosureSha256',
  'resultSha256',
  'authorityId',
  'passed',
  'signature',
]);
const ISSUERS = new WeakSet();
const VERIFIERS = new WeakSet();
const SECRET_ENV_NAMES = Object.freeze([
  'CUT3_MEMORY_GATE_HMAC_KEY',
  'CUT3_GATE_HMAC_KEY',
  'Memory Gate HMAC Key',
]);
const AUTHORITY_ENV_NAMES = Object.freeze([
  'CUT3_MEMORY_GATE_AUTHORITY_ID',
  'CUT3_GATE_AUTHORITY_ID',
  'Memory Gate Authority ID',
]);

export class PromotionGateConfigurationError extends Error {
  constructor(code = 'gate-authority-unavailable') {
    super(`Promotion gate authority unavailable (${code})`);
    this.name = 'PromotionGateConfigurationError';
    this.code = code;
  }

  toJSON() {
    return { name: this.name, code: this.code };
  }
}

/**
 * Create a local gate issuer/verifier capability. Production services may use
 * the narrower issuer and verifier factories below to preserve least privilege.
 *
 * The HMAC key exists only in this closure. It is never an object property,
 * receipt field, error detail, or JSON value. Production code should create
 * this capability from a process-local secret store or a local `.env` file.
 */
export function createPromotionGateAuthority(options = {}) {
  return createGateCapability(options, { issue: true, verify: true, role: 'authority' });
}

export function createPromotionGateIssuer(options = {}) {
  return createGateCapability(options, { issue: true, verify: false, role: 'issuer' });
}

export function createPromotionGateVerifier(options = {}) {
  return createGateCapability(options, { issue: false, verify: true, role: 'verifier' });
}

function createGateCapability(options, permissions) {
  const authorityId = requireAuthorityId(options.authorityId);
  const key = secretBytes(options.secret);
  const metadata = Object.freeze({
    authorityId,
    algorithm: 'hmac-sha256',
    configured: true,
    role: permissions.role,
  });

  const capability = Object.freeze({
    ...metadata,
    ...(permissions.issue ? { issue(value = {}) {
      const body = normalizeUnsignedReceipt({
        ...value,
        authorityId,
      });
      return deepFreeze({
        ...body,
        signature: sign(key, body),
      });
    } } : {}),
    ...(permissions.verify ? { verify(receipt, expected = {}) {
      const normalized = normalizeSignedReceipt(receipt);
      if (!normalized || normalized.authorityId !== authorityId) return null;
      if (!matchesExpected(normalized, expected)) return null;

      const { signature, ...body } = normalized;
      const expectedSignature = Buffer.from(sign(key, body), 'hex');
      const suppliedSignature = Buffer.from(signature, 'hex');
      if (!timingSafeEqual(expectedSignature, suppliedSignature)) return null;

      return Object.freeze({
        passed: normalized.passed,
        authorityId,
        receiptSha256: sha256(stableStringify(normalized)),
        signatureSha256: sha256(signature),
      });
    } } : {}),
    toJSON() {
      return metadata;
    },
  });
  if (permissions.issue) ISSUERS.add(capability);
  if (permissions.verify) VERIFIERS.add(capability);
  return capability;
}

/**
 * Load the gate capability only from a local file named exactly `.env`.
 * Provider API keys are deliberately not aliases for this independent key.
 */
export async function loadPromotionGateVerifierFile(filePath, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const filename = assertLocalProviderEnvFile(filePath ?? defaultCut3EnvFile(cwd), cwd);
  let envText;
  try {
    envText = await fs.readFile(filename, 'utf8');
  } catch {
    throw new PromotionGateConfigurationError('gate-env-unreadable');
  }
  const parsed = parseEnv(envText, [...SECRET_ENV_NAMES, ...AUTHORITY_ENV_NAMES]);
  const secret = firstConfigured(parsed, SECRET_ENV_NAMES);
  const authorityId = firstConfigured(parsed, AUTHORITY_ENV_NAMES);
  if (!secret || !authorityId) {
    throw new PromotionGateConfigurationError('gate-authority-unconfigured');
  }
  try {
    return createPromotionGateVerifier({ authorityId, secret });
  } catch {
    throw new PromotionGateConfigurationError('gate-authority-invalid');
  }
}

/** @deprecated Prefer the role-explicit verifier loader. */
export const loadPromotionGateAuthorityFile = loadPromotionGateVerifierFile;

/** Verify one receipt without accepting an arbitrary duck-typed verifier. */
export function verifyPromotionGateReceipt(verifier, receipt, expected = {}) {
  if (!VERIFIERS.has(verifier)) return null;
  return verifier.verify(receipt, expected);
}

export function isPromotionGateVerifier(value) {
  return VERIFIERS.has(value);
}

export function isPromotionGateIssuer(value) {
  return ISSUERS.has(value);
}

function normalizeUnsignedReceipt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('gate receipt body must be an object');
  }
  const gateName = requireGateName(value.gateName);
  return {
    schemaVersion: PROMOTION_GATE_RECEIPT_VERSION,
    gateName,
    candidateSha256: requireHash(value.candidateSha256, 'candidateSha256'),
    moduleSha256: requireHash(value.moduleSha256, 'moduleSha256'),
    dependencyClosureSha256: requireHash(
      value.dependencyClosureSha256,
      'dependencyClosureSha256',
    ),
    resultSha256: requireHash(value.resultSha256, 'resultSha256'),
    authorityId: requireAuthorityId(value.authorityId),
    passed: requireBoolean(value.passed, 'passed'),
  };
}

function normalizeSignedReceipt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!exactKeys(value, RECEIPT_KEYS)) return null;
  if (value.schemaVersion !== PROMOTION_GATE_RECEIPT_VERSION) return null;
  if (!GATE_NAMES.has(value.gateName)
      || !isHash(value.candidateSha256)
      || !isHash(value.moduleSha256)
      || !isHash(value.dependencyClosureSha256)
      || !isHash(value.resultSha256)
      || !SAFE_AUTHORITY.test(value.authorityId)
      || typeof value.passed !== 'boolean'
      || !isHash(value.signature)) {
    return null;
  }
  return {
    schemaVersion: value.schemaVersion,
    gateName: value.gateName,
    candidateSha256: value.candidateSha256,
    moduleSha256: value.moduleSha256,
    dependencyClosureSha256: value.dependencyClosureSha256,
    resultSha256: value.resultSha256,
    authorityId: value.authorityId,
    passed: value.passed,
    signature: value.signature,
  };
}

function matchesExpected(receipt, expected) {
  return (!Object.hasOwn(expected, 'gateName') || receipt.gateName === expected.gateName)
    && (!Object.hasOwn(expected, 'candidateSha256')
      || receipt.candidateSha256 === expected.candidateSha256)
    && (!Object.hasOwn(expected, 'moduleSha256')
      || receipt.moduleSha256 === expected.moduleSha256)
    && (!Object.hasOwn(expected, 'dependencyClosureSha256')
      || receipt.dependencyClosureSha256 === expected.dependencyClosureSha256)
    && (!Object.hasOwn(expected, 'resultSha256')
      || receipt.resultSha256 === expected.resultSha256);
}

function sign(key, body) {
  return createHmac('sha256', key).update(stableStringify(body)).digest('hex');
}

function secretBytes(value) {
  const bytes = Buffer.isBuffer(value)
    ? Buffer.from(value)
    : Buffer.from(typeof value === 'string' ? value : '', 'utf8');
  if (bytes.length < 32) {
    throw new TypeError('promotion gate HMAC secret must contain at least 32 bytes');
  }
  return bytes;
}

function requireGateName(value) {
  if (!GATE_NAMES.has(value)) throw new RangeError('unknown promotion gate name');
  return value;
}

function requireAuthorityId(value) {
  if (typeof value !== 'string' || !SAFE_AUTHORITY.test(value)) {
    throw new TypeError('gate authority id must be a safe identifier');
  }
  return value;
}

function requireHash(value, name) {
  if (!isHash(value)) throw new TypeError(`${name} must be a lowercase SHA-256`);
  return value;
}

function requireBoolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`);
  return value;
}

function isHash(value) {
  return typeof value === 'string' && HASH.test(value);
}

function exactKeys(value, expected) {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function firstConfigured(values, names) {
  for (const name of names) {
    if (typeof values[name] === 'string' && values[name].trim()) return values[name].trim();
  }
  return null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
