import {
  RawCodeProposalDisabledError,
  rejectRawCodeProposal,
} from './proposal-contract.js';

/**
 * Compatibility surface for the retired raw-code proposer.
 *
 * Production optimization is selection-only: Kimi and Anthropic may rank
 * opaque candidate ids from aggregate metrics, but may never receive source
 * files or return an executable patch. Keeping this fail-closed adapter makes
 * stale callers fail before credentials are read or a network request starts.
 */
export function createKimiProposer() {
  return disabledProposalAdapter('kimi');
}

export function createAnthropicProposer() {
  return disabledProposalAdapter('anthropic');
}

export async function createProposalProvider(options = {}) {
  return disabledProposalAdapter(assertProvider(options.provider));
}

export async function createOptionalProposalProvider(options = {}) {
  assertProvider(options.provider);
  return null;
}

function disabledProposalAdapter(provider) {
  return Object.freeze({
    provider,
    model: 'disabled',
    async propose() {
      rejectRawCodeProposal(provider);
    },
  });
}

function assertProvider(value) {
  if (!['kimi', 'anthropic'].includes(value)) {
    throw new RangeError(`Unsupported proposal provider: ${value}`);
  }
  return value;
}

export { RawCodeProposalDisabledError };
