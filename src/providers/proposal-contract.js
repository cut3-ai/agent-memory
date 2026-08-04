export const PROPOSAL_SCHEMA_VERSION = 1;
export const PROPOSAL_TOOL_NAME = 'raw_code_proposals_disabled';
export const MAX_PROPOSAL_PATCHES = 0;
export const MAX_PATCH_CHARACTERS = 0;
export const MAX_CONTEXT_CHARACTERS = 0;

// Kept only so stale imports remain loadable. No provider receives this schema:
// every raw proposal entry point rejects before credential loading or I/O.
export const PROPOSAL_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {},
});

export class RawCodeProposalDisabledError extends Error {
  constructor(provider = 'unknown') {
    super('Raw-code model proposals are disabled; use opaque candidate selection');
    this.name = 'RawCodeProposalDisabledError';
    this.provider = normalizeProvider(provider);
    this.code = 'raw-code-proposals-disabled';
  }

  toJSON() {
    return {
      name: this.name,
      provider: this.provider,
      code: this.code,
    };
  }
}

export function rejectRawCodeProposal(provider) {
  throw new RawCodeProposalDisabledError(provider);
}

export function validateProposalBrief() {
  rejectRawCodeProposal();
}

export function normalizeProposal() {
  rejectRawCodeProposal();
}

export function proposalReceipt() {
  rejectRawCodeProposal();
}

export function proposalSystemInstruction() {
  return 'Raw-code model proposals are disabled. Select only opaque candidate identifiers from aggregate metrics.';
}

export function proposalUserMessage() {
  rejectRawCodeProposal();
}

// Retained as a small path guard for callers migrating away from this module.
export function assertSafeRelativePath(value) {
  if (typeof value !== 'string'
      || value.length < 1
      || value.length > 240
      || value.includes('\\')
      || value.startsWith('/')
      || /^[A-Za-z]:/.test(value)
      || value.split('/').some((part) => part === '..' || part === '.' || part === '')
      || value === '.env'
      || value.startsWith('.env.')
      || value.includes('/.env')) {
    throw new Error('Unsafe relative path');
  }
  return value;
}

function normalizeProvider(value) {
  return ['kimi', 'anthropic'].includes(value) ? value : 'unknown';
}
