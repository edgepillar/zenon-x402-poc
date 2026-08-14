/**
 * Process-wide ownership for the znn-typescript-sdk singleton.
 *
 * The SDK keeps its connection and chain configuration in shared mutable
 * process state. Every live caller must therefore use the exported singleton
 * below for the complete configure/connect/RPC/cleanup lifecycle. A timed-out
 * SDK request cannot be cancelled reliably, so a timeout permanently poisons
 * this runtime rather than allowing a late continuation to overlap a new
 * owner.
 */

export const LIVE_RUNTIME_ERROR_CODES = Object.freeze({
  POISONED: 'live_runtime_poisoned_restart_required',
  READ_TIMEOUT: 'live_rpc_read_timeout',
  PUBLICATION_TIMEOUT: 'live_rpc_publication_timeout',
});

export const LIVE_RPC_OUTCOMES = Object.freeze({
  READ_UNAVAILABLE: 'OPERATION_UNAVAILABLE',
  SUBMISSION_OUTCOME_UNKNOWN: 'SUBMISSION_OUTCOME_UNKNOWN',
});

const MAX_TIMER_MS = 2_147_483_647;

export class LiveRuntimeError extends Error {
  constructor(message, { code, outcome, operation, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'LiveRuntimeError';
    this.code = code;
    if (outcome !== undefined) this.outcome = outcome;
    if (operation !== undefined) this.operation = operation;
  }
}

function poisonedError(cause) {
  return new LiveRuntimeError(LIVE_RUNTIME_ERROR_CODES.POISONED, {
    code: LIVE_RUNTIME_ERROR_CODES.POISONED,
    cause,
  });
}

function assertOwnerName(owner) {
  if (typeof owner !== 'string' || owner.length === 0 || owner.length > 128) {
    throw new TypeError('live SDK owner must be a non-empty string of at most 128 characters');
  }
}

function assertTimeoutOptions({ category, operation, timeoutMs, execute, teardown }) {
  if (category !== 'read' && category !== 'publication') {
    throw new TypeError('RPC deadline category must be read or publication');
  }
  if (typeof operation !== 'string' || operation.length === 0 || operation.length > 128) {
    throw new TypeError('RPC operation must be a non-empty string of at most 128 characters');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMER_MS) {
    throw new TypeError('RPC timeoutMs must be a positive timer-safe integer');
  }
  if (typeof execute !== 'function') throw new TypeError('RPC execute must be a function');
  if (teardown !== undefined && typeof teardown !== 'function') {
    throw new TypeError('RPC teardown must be a function when provided');
  }
}

function timeoutError(category, operation) {
  if (category === 'publication') {
    return new LiveRuntimeError('Zenon transaction submission outcome is unknown', {
      code: LIVE_RUNTIME_ERROR_CODES.PUBLICATION_TIMEOUT,
      outcome: LIVE_RPC_OUTCOMES.SUBMISSION_OUTCOME_UNKNOWN,
      operation,
    });
  }

  return new LiveRuntimeError('Zenon RPC observation is unavailable', {
    code: LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT,
    outcome: LIVE_RPC_OUTCOMES.READ_UNAVAILABLE,
    operation,
  });
}

/**
 * Exclusive, FIFO owner of one unsafe live SDK runtime.
 *
 * Constructing this class is intended for isolated tests or separately
 * isolated processes. Application code must use `liveSdkRuntime`, not create
 * competing instances around the same SDK singleton.
 */
export class LiveSdkRuntime {
  #activeToken;
  #queue = [];
  #poisonCause;

  get poisoned() {
    return this.#poisonCause !== undefined;
  }

  /**
   * Own the SDK singleton until `work` and its outer cleanup have completed.
   * Queued callers are served FIFO. Ordinary failures release ownership.
   */
  async withOwner(owner, work) {
    assertOwnerName(owner);
    if (typeof work !== 'function') throw new TypeError('live SDK owner work must be a function');

    const token = await this.#acquire(owner);
    const scope = Object.freeze({
      owner,
      runRpcWithDeadline: (options) => this.#runRpcWithDeadline(token, options),
      poison: (cause) => this.#poisonFromOwner(token, cause),
    });

    try {
      return await work(scope);
    } finally {
      this.#release(token);
    }
  }

  #acquire(owner) {
    if (this.poisoned) return Promise.reject(poisonedError(this.#poisonCause));

    return new Promise((resolve, reject) => {
      const waiter = { owner, resolve, reject, token: Symbol(owner) };
      if (this.#activeToken === undefined) {
        this.#activeToken = waiter.token;
        resolve(waiter.token);
      } else {
        this.#queue.push(waiter);
      }
    });
  }

  #release(token) {
    if (this.#activeToken !== token) {
      throw new LiveRuntimeError('live SDK ownership token mismatch', {
        code: 'live_runtime_owner_mismatch',
      });
    }

    this.#activeToken = undefined;
    if (this.poisoned) {
      this.#rejectQueuedOwners();
      return;
    }

    const next = this.#queue.shift();
    if (next !== undefined) {
      this.#activeToken = next.token;
      next.resolve(next.token);
    }
  }

  #poison(cause) {
    if (!this.poisoned) this.#poisonCause = cause;
    this.#rejectQueuedOwners();
  }

  #poisonFromOwner(token, cause) {
    if (this.#activeToken !== token) {
      throw new LiveRuntimeError('live SDK poison used outside its ownership scope', {
        code: 'live_runtime_owner_inactive',
      });
    }
    this.#poison(cause instanceof Error ? cause : new Error('live SDK runtime was poisoned'));
  }

  #rejectQueuedOwners() {
    if (!this.poisoned) return;
    const error = poisonedError(this.#poisonCause);
    for (const waiter of this.#queue.splice(0)) waiter.reject(error);
  }

  async #runRpcWithDeadline(token, options) {
    if (this.#activeToken !== token) {
      throw new LiveRuntimeError('RPC deadline used outside its live SDK ownership scope', {
        code: 'live_runtime_owner_inactive',
      });
    }
    if (this.poisoned) throw poisonedError(this.#poisonCause);
    assertTimeoutOptions(options);

    const { category, operation, timeoutMs, execute, teardown } = options;
    const timedOut = Symbol('timed-out');
    let timer;

    // Both fulfillment and rejection handlers remain attached after a timeout,
    // preventing an abandoned SDK rejection from becoming unhandled. This does
    // not cancel or otherwise stop the underlying operation.
    const operationResult = Promise.resolve()
      .then(execute)
      .then(
        (value) => ({ status: 'fulfilled', value }),
        (error) => ({ status: 'rejected', error }),
      );
    const deadlineResult = new Promise((resolve) => {
      timer = setTimeout(() => resolve(timedOut), timeoutMs);
    });

    const result = await Promise.race([operationResult, deadlineResult]);
    if (result !== timedOut) {
      clearTimeout(timer);
      if (result.status === 'rejected') throw result.error;
      return result.value;
    }

    const error = timeoutError(category, operation);

    // Poison first. Queued and future sessions must be rejected before teardown
    // starts because the late SDK continuation is still un-cancellable.
    this.#poison(error);
    if (teardown !== undefined) {
      const initialTeardown = Promise.resolve().then(() => teardown(error));

      // A late SDK continuation can mutate or retain the singleton after the
      // immediate teardown. Retry teardown once it eventually settles, without
      // awaiting that unbounded operation or permitting runtime reuse.
      void operationResult.then(async () => {
        await initialTeardown.catch(() => {});
        try {
          await teardown(error);
        } catch (lateTeardownError) {
          error.lateTeardownError = lateTeardownError;
        }
      });

      try {
        await initialTeardown;
      } catch (teardownError) {
        // Preserve the security-relevant timeout classification while retaining
        // teardown diagnostics for local callers without exposing them publicly.
        error.teardownError = teardownError;
      }
    }
    throw error;
  }
}

// The only runtime application code should use for the process-global SDK.
export const liveSdkRuntime = new LiveSdkRuntime();

export function withLiveSdkOwner(owner, work) {
  return liveSdkRuntime.withOwner(owner, work);
}
