import { createAnthropicProvider } from './anthropic.js';
import {
  loadProviderCredential,
  loadProviderCredentialFile,
} from './env.js';
import { createKimiProvider } from './kimi.js';

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

export * from './anthropic.js';
export * from './env.js';
export * from './kimi.js';
export * from './proposal-contract.js';
export * from './proposal.js';
export * from './transport.js';
