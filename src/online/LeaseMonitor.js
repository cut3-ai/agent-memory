import { authorityFailure } from '@cut3/agent-memory/online/protocol';

/**
 * Keeps a fenced lease alive. Both the whole operation and every heartbeat RPC
 * are bounded, so an uncooperative port cannot renew or block a job forever.
 */
export function startLeaseMonitor({
  context,
  deadlineAt,
  heartbeatIntervalMs,
  heartbeatTimeoutMs,
  revisionAuthority,
}) {
  const operation = new AbortController();
  const deadlineDelay = Math.max(0, deadlineAt - Date.now());
  let failure;
  let heartbeatController;
  let heartbeatTimer;
  let inFlight = Promise.resolve();
  let stopped = false;

  const fail = (error) => {
    if (stopped || failure) return;
    failure = error instanceof Error ? error : new Error(String(error));
    operation.abort(failure);
  };
  const deadlineTimer = setTimeout(() => {
    fail(new Error('Online memory operation deadline exceeded'));
  }, deadlineDelay);

  const schedule = () => {
    if (stopped || failure) return;
    heartbeatTimer = setTimeout(beat, heartbeatIntervalMs);
  };

  const beat = () => {
    if (stopped || failure) return;
    heartbeatController = new AbortController();
    const forwardAbort = () => heartbeatController.abort(operation.signal.reason);
    operation.signal.addEventListener('abort', forwardAbort, { once: true });
    const heartbeatDeadline = setTimeout(() => {
      heartbeatController.abort(new Error('Memory lease heartbeat timed out'));
    }, heartbeatTimeoutMs);

    inFlight = raceSignal(
      Promise.resolve().then(() => revisionAuthority.heartbeat(Object.freeze({
        ...context,
        abortSignal: heartbeatController.signal,
      }))),
      heartbeatController.signal,
      'Memory lease heartbeat timed out',
    ).then((state) => {
      if (state?.active !== true) throw authorityFailure(state, 'heartbeat-rejected');
    }).catch((error) => {
      if (!stopped) fail(error);
    }).finally(() => {
      clearTimeout(heartbeatDeadline);
      operation.signal.removeEventListener('abort', forwardAbort);
      heartbeatController = undefined;
    });
    inFlight.finally(schedule).catch(() => {});
  };
  schedule();

  return Object.freeze({
    abort(error) {
      fail(error);
    },
    assertActive() {
      if (failure) throw failure;
      if (Date.now() >= deadlineAt) {
        fail(new Error('Online memory operation deadline exceeded'));
        throw failure;
      }
    },
    run(label, operationFactory) {
      if (typeof operationFactory !== 'function') {
        throw new TypeError('operationFactory must be a function');
      }
      this.assertActive();
      const pending = Promise.resolve().then(() => operationFactory(operation.signal));
      return raceSignal(pending, operation.signal, `${label} canceled`);
    },
    signal: operation.signal,
    async stop() {
      stopped = true;
      clearTimeout(deadlineTimer);
      clearTimeout(heartbeatTimer);
      heartbeatController?.abort(new Error('Lease monitor stopped'));
      await inFlight.catch(() => {});
    },
  });
}

/** Run acquisition or cleanup against an absolute deadline. */
export async function runBeforeDeadline(deadlineAt, label, operationFactory) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new Error(`${label} deadline exceeded`);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`${label} deadline exceeded`));
  }, remaining);
  try {
    return await raceSignal(
      Promise.resolve().then(() => operationFactory(controller.signal)),
      controller.signal,
      `${label} deadline exceeded`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function raceSignal(promise, signal, fallback) {
  // A timed-out provider may ignore AbortSignal and settle later. Attach a
  // rejection handler so that abandoned work never becomes unhandled.
  promise.catch(() => {});
  if (signal.aborted) return Promise.reject(abortError(signal, fallback));
  let removeAbortListener = () => {};
  const aborted = new Promise((_, reject) => {
    const onAbort = () => reject(abortError(signal, fallback));
    signal.addEventListener('abort', onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener('abort', onAbort);
  });
  return Promise.race([promise, aborted]).finally(removeAbortListener);
}

function abortError(signal, fallback) {
  return signal.reason instanceof Error ? signal.reason : new Error(fallback);
}
