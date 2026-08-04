import fs from 'node:fs/promises';
import path from 'node:path';

const PROVIDER_ENVIRONMENT_KEYS = Object.freeze({
  anthropic: Object.freeze([
    'ANTHROPIC_API_KEY',
    'Anthropic',
    'ANTHROPIC',
    'Anthropic API Key',
    'Claude API Key',
  ]),
  kimi: Object.freeze([
    'MOONSHOT_API_KEY',
    'KIMI_API_KEY',
    'KIMI',
    'Kimi API Key',
    'Moonshot API Key',
  ]),
});

export class ProviderCredentialError extends Error {
  constructor(provider, environmentKeys, code = 'credential-missing') {
    super(`Provider credential unavailable (${code})`);
    this.name = 'ProviderCredentialError';
    this.provider = provider;
    this.code = code;
    this.environmentKeys = Object.freeze([...environmentKeys]);
  }

  toJSON() {
    return {
      name: this.name,
      provider: this.provider,
      code: this.code,
      environmentKeys: [...this.environmentKeys],
    };
  }
}

export const ProviderConfigurationError = ProviderCredentialError;

export function defaultCut3EnvFile(cwd = process.cwd()) {
  return path.resolve(assertLocalDirectory(cwd), '.env');
}

/**
 * Provider credentials may be read only from a local file named exactly
 * `.env`. The path itself is never included in provider requests or receipts.
 */
export function assertLocalProviderEnvFile(filePath, cwd = process.cwd()) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new TypeError('A local .env file path is required');
  }
  const resolved = path.resolve(assertLocalDirectory(cwd), filePath);
  if (path.basename(resolved) !== '.env' || resolved.startsWith('\\\\')) {
    throw new TypeError('Provider credentials may be loaded only from a local .env file');
  }
  return resolved;
}

export function providerEnvironmentKeys(provider) {
  const keys = PROVIDER_ENVIRONMENT_KEYS[provider];
  if (!keys) throw new RangeError(`Unsupported provider: ${provider}`);
  return [...keys];
}

export const providerEnvironmentNames = providerEnvironmentKeys;

/**
 * Parse selected dotenv assignments without interpolation or execution.
 * Quoted labels are supported because existing Cut3 files use `"KIMI"=...`
 * and `'Anthropic'=...`. When aliases normalize to the same label, the first
 * selected name is the stable output key.
 */
export function parseEnv(text, selectedNames) {
  const selected = selectedNames === undefined ? null : normalizedSelection(selectedNames);
  const parsed = Object.create(null);
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?(.+?)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const rawName = unquoteLabel(match[1]);
    const outputName = selected?.get(normalizeLabel(rawName)) ?? (selected ? null : rawName);
    if (!outputName) continue;
    const value = parseEnvValue(match[2]);
    if (value !== null) parsed[outputName] = value;
  }
  return parsed;
}

export const parseEnvText = parseEnv;
export const parseSelectedEnv = parseEnv;

export function createProviderCredential(provider, sourceName, value) {
  const secret = nonEmpty(value);
  if (!secret) throw new ProviderCredentialError(provider, providerEnvironmentKeys(provider));
  const metadata = Object.freeze({ provider, sourceName, configured: true });
  return Object.freeze({
    ...metadata,
    apply(headers) {
      if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
        throw new TypeError('Provider headers must be an object');
      }
      if (provider === 'anthropic') headers['x-api-key'] = secret;
      else headers.authorization = `Bearer ${secret}`;
      return headers;
    },
    toJSON() {
      return metadata;
    },
  });
}

export function loadProviderCredential(provider, options = {}) {
  const keys = providerEnvironmentKeys(provider);
  const explicit = nonEmpty(options.apiKey);
  if (explicit) return createProviderCredential(provider, 'explicit', explicit);
  if (options.credential) return assertCredential(provider, options.credential);

  const environment = options.env ?? process.env;
  for (const key of keys) {
    const value = nonEmpty(environment?.[key]);
    if (value) return createProviderCredential(provider, key, value);
  }
  if (options.envText !== undefined) {
    const parsed = parseEnv(options.envText, keys);
    for (const key of keys) {
      const value = nonEmpty(parsed[key]);
      if (value) return createProviderCredential(provider, key, value);
    }
  }
  throw new ProviderCredentialError(provider, keys);
}

export async function loadProviderCredentialFile(
  provider,
  filePath,
  options = {},
) {
  try {
    return loadProviderCredential(provider, { ...options, envText: undefined });
  } catch (error) {
    if (!(error instanceof ProviderCredentialError)) throw error;
  }
  const localEnvFile = assertLocalProviderEnvFile(
    filePath ?? defaultCut3EnvFile(options.cwd),
    options.cwd,
  );
  let envText;
  try {
    envText = await fs.readFile(localEnvFile, 'utf8');
  } catch (error) {
    const code = error?.code === 'ENOENT' ? 'credential-missing' : 'credential-file-unreadable';
    throw new ProviderCredentialError(provider, providerEnvironmentKeys(provider), code);
  }
  return loadProviderCredential(provider, { ...options, envText });
}

function assertCredential(provider, credential) {
  if (credential?.provider !== provider || typeof credential.apply !== 'function') {
    throw new TypeError(`A ${provider} credential is required`);
  }
  return credential;
}

function normalizedSelection(names) {
  const selected = new Map();
  for (const name of names) {
    const normalized = normalizeLabel(name);
    if (normalized && !selected.has(normalized)) selected.set(normalized, name);
  }
  return selected;
}

function normalizeLabel(value) {
  return unquoteLabel(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function unquoteLabel(value) {
  const label = String(value ?? '').trim();
  if ((label.startsWith('"') && label.endsWith('"'))
      || (label.startsWith("'") && label.endsWith("'"))) {
    return label.slice(1, -1).trim();
  }
  return label;
}

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  if (!value) return '';
  if (value.startsWith('"')) {
    const match = /^"((?:\\.|[^"\\])*)"(?:\s+#.*)?$/.exec(value);
    if (!match) return null;
    return match[1].replace(/\\(n|r|t|"|\\)/g, (_, escape) => ({
      n: '\n',
      r: '\r',
      t: '\t',
      '"': '"',
      '\\': '\\',
    })[escape]);
  }
  if (value.startsWith("'")) {
    const match = /^'([^']*)'(?:\s+#.*)?$/.exec(value);
    return match?.[1] ?? null;
  }
  return value.replace(/\s+#.*$/, '').trim();
}

function nonEmpty(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function assertLocalDirectory(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError('A valid local working directory is required');
  }
  return value;
}
