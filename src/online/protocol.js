import { MEMORY_ACTION } from '@cut3/agent-memory/online/outcome';

const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SAFE_ID = /^[a-zA-Z0-9._-]{1,160}$/u;
const REQUIRED_REVIEW_CHECKS = Object.freeze([
  'compile',
  'tests',
  'render',
  'privacy',
  'semantic',
]);

export class RevisionCanceledError extends Error {
  constructor(decision, reason) {
    super(`Memory save canceled: ${reason}`);
    this.decision = decision;
    this.reason = reason;
  }
}

export function authorityFailure(state, fallback) {
  const reason = String(state?.reason ?? fallback);
  if (state?.decision?.action === MEMORY_ACTION.DISCARD) {
    return new RevisionCanceledError(validateDecision(state.decision), reason);
  }
  return new Error(`Memory lease lost: ${reason}`);
}

export function validateDecision(decision) {
  const action = String(decision?.action ?? '');
  const reason = String(decision?.reason ?? '');
  if (!Object.values(MEMORY_ACTION).includes(action) || !reason) {
    throw new Error('revisionAuthority returned an invalid memory decision');
  }
  return Object.freeze({ action, reason });
}

export function validateSource(source, expectedSha256) {
  if (
    source?.immutable !== true
    || source.sha256 !== expectedSha256
    || !SAFE_ID.test(String(source.checkoutId ?? ''))
  ) {
    throw new Error('revisionAuthority must bind an opaque immutable checkout to sourceSha256');
  }
  return Object.freeze({
    checkoutId: String(source.checkoutId),
    immutable: true,
    sha256: expectedSha256,
  });
}

export function validateLease(lease) {
  const token = String(lease?.token ?? '');
  if (
    !SAFE_ID.test(token)
    || !Number.isSafeInteger(lease?.fencingToken)
    || lease.fencingToken < 1
    || !Number.isFinite(lease?.expiresAt)
  ) {
    throw new Error('revisionAuthority returned an invalid fenced lease');
  }
  return Object.freeze({
    expiresAt: lease.expiresAt,
    fencingToken: lease.fencingToken,
    token,
  });
}

export function publicLease(lease) {
  return Object.freeze({
    expiresAt: lease.expiresAt,
    fencingToken: lease.fencingToken,
    token: lease.token,
  });
}

export function validateCandidate(candidate, expectedSha256) {
  if (
    candidate?.isolation !== 'isolated-candidate'
    || candidate.baseSourceSha256 !== expectedSha256
    || !SAFE_ID.test(String(candidate.candidateId ?? ''))
    || candidate.workspace == null
  ) {
    throw new Error('candidateWorkspace.open must return an isolated candidate bound to the source');
  }
  return Object.freeze({
    baseSourceSha256: expectedSha256,
    candidateId: String(candidate.candidateId),
    isolation: 'isolated-candidate',
    workspace: candidate.workspace,
  });
}

export function validateSealed(sealed, candidate, sourceSha256) {
  const candidateDigest = String(sealed?.candidateDigest ?? '').toLowerCase();
  const candidateCommit = String(sealed?.candidateCommit ?? '').toLowerCase();
  if (
    sealed?.candidateId !== candidate.candidateId
    || sealed?.baseSourceSha256 !== sourceSha256
    || !SHA256.test(candidateDigest)
    || !GIT_COMMIT.test(candidateCommit)
    || sealed.artifact == null
  ) {
    throw new Error('candidateWorkspace.seal returned an unbound candidate artifact');
  }
  return Object.freeze({
    artifact: sealed.artifact,
    baseSourceSha256: sourceSha256,
    candidateCommit,
    candidateDigest,
    candidateId: candidate.candidateId,
  });
}

export function reviewCandidate(sealed) {
  return Object.freeze({
    baseSourceSha256: sealed.baseSourceSha256,
    candidateCommit: sealed.candidateCommit,
    candidateDigest: sealed.candidateDigest,
    candidateId: sealed.candidateId,
  });
}

export function validateReviewReceipt(review, sealed, sourceSha256) {
  if (
    !SAFE_ID.test(String(review.reviewId ?? ''))
    || review.sourceSha256 !== sourceSha256
    || review.candidateDigest !== sealed.candidateDigest
    || review.candidateCommit !== sealed.candidateCommit
  ) {
    throw new Error('review receipt is not bound to the exact source and candidate');
  }
  const checks = {};
  for (const name of REQUIRED_REVIEW_CHECKS) {
    const check = review.checks?.[name];
    const evidence = check?.evidence;
    if (
      check?.passed !== true
      || !SAFE_ID.test(String(evidence?.evidenceId ?? ''))
      || !String(evidence?.summary ?? '').trim()
      || evidence?.candidateDigest !== sealed.candidateDigest
      || evidence?.candidateCommit !== sealed.candidateCommit
    ) {
      throw new Error(`review receipt requires passing ${name} evidence`);
    }
    checks[name] = Object.freeze({
      evidence: Object.freeze({
        candidateCommit: sealed.candidateCommit,
        candidateDigest: sealed.candidateDigest,
        evidenceId: String(evidence.evidenceId),
        summary: String(evidence.summary),
      }),
      passed: true,
    });
  }
  return Object.freeze({
    accepted: true,
    candidateCommit: sealed.candidateCommit,
    candidateDigest: sealed.candidateDigest,
    checks: Object.freeze(checks),
    reviewId: String(review.reviewId),
    sourceSha256,
  });
}

export function validateApplyReceipt(receipt, sealed) {
  if (
    receipt?.applied !== true
    || receipt.candidateDigest !== sealed.candidateDigest
    || receipt.candidateCommit !== sealed.candidateCommit
    || !GIT_COMMIT.test(String(receipt.persistedCommit ?? '').toLowerCase())
  ) {
    throw new Error('candidate apply receipt does not match the reviewed artifact');
  }
  return Object.freeze({
    applied: true,
    candidateCommit: sealed.candidateCommit,
    candidateDigest: sealed.candidateDigest,
    persistedCommit: String(receipt.persistedCommit).toLowerCase(),
  });
}

export function validateCommitResult(result, sealed) {
  if (
    result?.committed !== true
    || result.candidateDigest !== sealed.candidateDigest
    || result.candidateCommit !== sealed.candidateCommit
  ) {
    throw authorityFailure(result, 'commit-rejected');
  }
  return validateApplyReceipt(result.applyReceipt, sealed);
}
