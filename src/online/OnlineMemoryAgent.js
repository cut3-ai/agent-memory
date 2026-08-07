import {
  runBeforeDeadline,
  startLeaseMonitor,
} from '@cut3/agent-memory/online/LeaseMonitor';
import { buildMemoryAgentPrompt } from '@cut3/agent-memory/online/agent-prompt';
import { MEMORY_ACTION } from '@cut3/agent-memory/online/outcome';
import {
  RevisionCanceledError,
  authorityFailure,
  publicLease,
  reviewCandidate,
  validateCandidate,
  validateApplyReceipt,
  validateCommitResult,
  validateDecision,
  validateLease,
  validateReviewReceipt,
  validateSealed,
  validateSource,
} from '@cut3/agent-memory/online/protocol';

const SHA256 = /^[a-f0-9]{64}$/u;

/**
 * Coordinates one online-memory candidate without ever giving the coding agent
 * the writable memory repository.
 *
 * `revisionAuthority` is the durable, linearizable boundary. Its production
 * implementation persists source bindings, ordered feedback events, negative
 * tombstones, completion receipts and leases across restarts:
 *
 * - acquire({ revisionKey, revisionId, sourceSha256, leaseDurationMs })
 *   atomically evaluates durable events. An acquired result contains
 *   `{ key, decision: {action:'save'}, source, lease }`: source is an opaque
 *   immutable checkout bound to the sha256; lease has a token, monotonically
 *   increasing fencingToken and expiresAt. Expiry recovery must issue a new
 *   token with a larger fence.
 * - heartbeat/checkpoint only succeed for the current unexpired token + fence
 *   and re-evaluate the latest events/tombstone. release is conditional on the
 *   same pair and can never clear a newer worker's lease.
 * - commit({ ..., apply }) is the sole publication boundary. It serializes
 *   event ingestion for the revision and publication to the shared branch,
 *   rechecks tombstone/lease immediately before apply, persists an intent,
 *   invokes apply idempotently for the bound candidate digest/commit, and
 *   conditionally records completion. Crash recovery reconciles an intent and
 *   apply receipt before another fence may publish.
 * - a negative event recorded after completion must immediately tombstone the
 *   artifact so readers cannot reuse it, persist an idempotent revert/removal
 *   obligation for applyReceipt.persistedCommit, and retry that retraction
 *   across restarts. "Negative priority" therefore includes invalidation of an
 *   already-persisted memory; it is not a false promise to undo Git atomically.
 *
 * `candidateWorkspace` owns disposable isolated workspaces. open() creates one
 * from the authority's immutable source and never returns mounted main; seal()
 * freezes a snapshot and binds its opaque artifact to source sha256 + candidate
 * digest + Git commit, so later workspace writes cannot alter the artifact;
 * apply() is idempotent for revisionKey + candidate digest/commit and is called
 * only from authority.commit; dispose() is idempotent, with a production janitor
 * responsible for process-crash leftovers.
 *
 * All ports are injected. The protocol assumes no AST parser, model provider or
 * external API. Every port receives an AbortSignal; the coordinator also races
 * uncooperative ports against an overall deadline, bounds each heartbeat RPC,
 * and bounds cleanup. Long-running adapters must still honor cancellation so
 * their isolated subprocesses and worktrees can be reclaimed immediately.
 */
export class OnlineMemoryAgent {
  #candidateWorkspace;
  #cleanupTimeoutMs;
  #heartbeatIntervalMs;
  #heartbeatTimeoutMs;
  #leaseDurationMs;
  #operationTimeoutMs;
  #reviewResult;
  #revisionAuthority;
  #runAgent;

  constructor({
    candidateWorkspace,
    cleanupTimeoutMs = 10_000,
    heartbeatIntervalMs = 20_000,
    heartbeatTimeoutMs = 10_000,
    leaseDurationMs = 60_000,
    operationTimeoutMs = 300_000,
    reviewResult,
    revisionAuthority,
    runAgent,
  }) {
    if (typeof runAgent !== 'function') throw new TypeError('runAgent must be a function');
    if (typeof reviewResult !== 'function') throw new TypeError('reviewResult must be a function');
    for (const method of ['acquire', 'heartbeat', 'checkpoint', 'commit', 'release']) {
      if (typeof revisionAuthority?.[method] !== 'function') {
        throw new TypeError(`revisionAuthority.${method} must be a function`);
      }
    }
    for (const method of ['open', 'seal', 'apply', 'dispose']) {
      if (typeof candidateWorkspace?.[method] !== 'function') {
        throw new TypeError(`candidateWorkspace.${method} must be a function`);
      }
    }
    if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < 10) {
      throw new TypeError('leaseDurationMs must be an integer of at least 10ms');
    }
    if (
      !Number.isSafeInteger(heartbeatIntervalMs)
      || heartbeatIntervalMs < 1
      || heartbeatIntervalMs >= leaseDurationMs
    ) {
      throw new TypeError('heartbeatIntervalMs must be positive and shorter than the lease');
    }
    if (
      !Number.isSafeInteger(heartbeatTimeoutMs)
      || heartbeatTimeoutMs < 1
      || heartbeatIntervalMs + heartbeatTimeoutMs >= leaseDurationMs
    ) {
      throw new TypeError('heartbeat interval plus timeout must be shorter than the lease');
    }
    if (!Number.isSafeInteger(operationTimeoutMs) || operationTimeoutMs < 10) {
      throw new TypeError('operationTimeoutMs must be an integer of at least 10ms');
    }
    if (!Number.isSafeInteger(cleanupTimeoutMs) || cleanupTimeoutMs < 1) {
      throw new TypeError('cleanupTimeoutMs must be a positive integer');
    }
    this.#candidateWorkspace = candidateWorkspace;
    this.#cleanupTimeoutMs = cleanupTimeoutMs;
    this.#heartbeatIntervalMs = heartbeatIntervalMs;
    this.#heartbeatTimeoutMs = heartbeatTimeoutMs;
    this.#leaseDurationMs = leaseDurationMs;
    this.#operationTimeoutMs = operationTimeoutMs;
    this.#reviewResult = reviewResult;
    this.#revisionAuthority = revisionAuthority;
    this.#runAgent = runAgent;
  }

  async handleRevision(revision) {
    const deadlineAt = Date.now() + this.#operationTimeoutMs;
    const revisionId = String(revision?.revisionId ?? '');
    const sourceSha256 = String(revision?.sourceSha256 ?? '').toLowerCase();
    if (!/^[a-zA-Z0-9_-]{1,128}$/u.test(revisionId)) {
      throw new TypeError('revisionId must be a safe opaque identifier');
    }
    if (!SHA256.test(sourceSha256)) {
      throw new TypeError('sourceSha256 must bind the exact successful source');
    }

    const revisionKey = `${revisionId}:${sourceSha256}`;
    const acquisition = await runBeforeDeadline(
      deadlineAt,
      'revisionAuthority.acquire',
      (abortSignal) => this.#revisionAuthority.acquire(Object.freeze({
        abortSignal,
        leaseDurationMs: this.#leaseDurationMs,
        revisionId,
        revisionKey,
        sourceSha256,
      })),
    );
    const decision = validateDecision(acquisition?.decision);
    const status = String(acquisition?.status ?? '');
    if (status !== 'acquired') {
      if (!['busy', 'completed', 'discarded', 'waiting'].includes(status)) {
        throw new Error(`revisionAuthority.acquire returned unknown status: ${status || '<empty>'}`);
      }
      return Object.freeze({ decision, skipped: status });
    }
    if (decision.action !== MEMORY_ACTION.SAVE) {
      throw new Error('revisionAuthority acquired a lease for a non-save decision');
    }

    const source = validateSource(acquisition.source, sourceSha256);
    const lease = validateLease(acquisition.lease);
    if (String(acquisition.key ?? revisionKey) !== revisionKey) {
      throw new Error('revisionAuthority acquired the wrong revision key');
    }
    const leaseContext = Object.freeze({
      fencingToken: lease.fencingToken,
      leaseDurationMs: this.#leaseDurationMs,
      revisionKey,
      sourceSha256,
      token: lease.token,
    });
    const monitor = startLeaseMonitor({
      context: leaseContext,
      deadlineAt,
      heartbeatIntervalMs: this.#heartbeatIntervalMs,
      heartbeatTimeoutMs: this.#heartbeatTimeoutMs,
      revisionAuthority: this.#revisionAuthority,
    });

    let candidate;
    let committed = false;
    let failure;
    let response;
    try {
      candidate = validateCandidate(await monitor.run(
        'candidateWorkspace.open',
        (abortSignal) => this.#candidateWorkspace.open(Object.freeze({
          abortSignal,
          lease: publicLease(lease),
          revisionId,
          revisionKey,
          source,
        })),
      ), sourceSha256);
      monitor.assertActive();

      await monitor.run('runAgent', (abortSignal) => this.#runAgent(Object.freeze({
        abortSignal,
        candidateId: candidate.candidateId,
        prompt: buildMemoryAgentPrompt(),
        source: Object.freeze({
          checkoutId: source.checkoutId,
          immutable: true,
          sha256: sourceSha256,
        }),
        workspace: candidate.workspace,
      })));
      monitor.assertActive();
      await this.#checkpoint(leaseContext, monitor);

      const sealed = validateSealed(await monitor.run(
        'candidateWorkspace.seal',
        (abortSignal) => this.#candidateWorkspace.seal(Object.freeze({
          abortSignal,
          candidateId: candidate.candidateId,
          workspace: candidate.workspace,
        })),
      ), candidate, sourceSha256);
      monitor.assertActive();
      await this.#checkpoint(leaseContext, monitor);

      const review = await monitor.run('reviewResult', (abortSignal) => this.#reviewResult(Object.freeze({
        abortSignal,
        artifact: sealed.artifact,
        candidate: reviewCandidate(sealed),
        source: Object.freeze({ checkoutId: source.checkoutId, sha256: sourceSha256 }),
      })));
      monitor.assertActive();
      if (review?.accepted !== true) {
        throw new Error(`Memory candidate rejected: ${String(review?.reason ?? 'review-failed')}`);
      }
      const receipt = validateReviewReceipt(review, sealed, sourceSha256);

      // Early fail for useful feedback; commit repeats this under publication lock.
      await this.#checkpoint(leaseContext, monitor);
      monitor.assertActive();
      const commitResult = await monitor.run(
        'revisionAuthority.commit',
        (commitAbortSignal) => this.#revisionAuthority.commit(Object.freeze({
          abortSignal: commitAbortSignal,
          apply: async () => {
            monitor.assertActive();
            return validateApplyReceipt(await monitor.run(
              'candidateWorkspace.apply',
              (abortSignal) => this.#candidateWorkspace.apply(Object.freeze({
                abortSignal,
                artifact: sealed.artifact,
                candidateCommit: sealed.candidateCommit,
                candidateDigest: sealed.candidateDigest,
                candidateId: candidate.candidateId,
                fencingToken: lease.fencingToken,
                review: receipt,
                revisionKey,
                sourceSha256,
                token: lease.token,
              })),
            ), sealed);
          },
          candidateCommit: sealed.candidateCommit,
          candidateDigest: sealed.candidateDigest,
          fencingToken: lease.fencingToken,
          review: receipt,
          revisionKey,
          sourceSha256,
          token: lease.token,
        })),
      );
      const applyReceipt = validateCommitResult(commitResult, sealed);
      committed = true;
      response = Object.freeze({
        applyReceipt,
        candidate: reviewCandidate(sealed),
        decision,
        review: receipt,
      });
    } catch (error) {
      failure = error;
      monitor.abort(error);
    }

    await monitor.stop();
    if (candidate) {
      try {
        await runBeforeDeadline(
          Date.now() + this.#cleanupTimeoutMs,
          'candidateWorkspace.dispose',
          (abortSignal) => this.#candidateWorkspace.dispose(Object.freeze({
            abortSignal,
            candidateId: candidate.candidateId,
            committed,
            reason: committed ? 'committed' : failure?.message ?? 'abandoned',
            workspace: candidate.workspace,
          })),
        );
      } catch (cleanupError) {
        if (!committed && !failure) failure = cleanupError;
      }
    }
    if (!committed) {
      try {
        await runBeforeDeadline(
          Date.now() + this.#cleanupTimeoutMs,
          'revisionAuthority.release',
          (abortSignal) => this.#revisionAuthority.release(Object.freeze({
            abortSignal,
            fencingToken: lease.fencingToken,
            reason: failure?.message ?? 'abandoned',
            revisionKey,
            token: lease.token,
          })),
        );
      } catch (releaseError) {
        if (!failure) failure = releaseError;
      }
    }

    if (failure instanceof RevisionCanceledError) {
      return Object.freeze({ canceled: failure.reason, decision: failure.decision });
    }
    if (failure) throw failure;
    return response;
  }

  async #checkpoint(context, monitor) {
    const state = await monitor.run(
      'revisionAuthority.checkpoint',
      (abortSignal) => this.#revisionAuthority.checkpoint(Object.freeze({
        ...context,
        abortSignal,
      })),
    );
    if (state?.active !== true) throw authorityFailure(state, 'checkpoint-rejected');
    if (state.sourceSha256 != null && state.sourceSha256 !== context.sourceSha256) {
      throw new Error('revisionAuthority checkpoint changed the bound source digest');
    }
  }
}
