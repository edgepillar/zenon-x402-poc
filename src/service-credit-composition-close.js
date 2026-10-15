// Internal close coordination for the durable composition.
// The private owner supplies state, captured primitives and trusted thunks.
// No store, Promise, Reflect or AsyncLocalStorage intrinsics are captured here.
export function createServiceCreditCompositionClose(dependencies) {
  const {
    state,
    PHASE,
    CODE,
    failure,
    terminalPhase,
    nativePromiseCapability,
    nativeRejected,
    nativeResolved,
    isNativePromise,
    REFLECT_APPLY,
    PROMISE_THEN,
    originActive,
    assertBoundStores,
    observerClose,
    serviceClose,
    scopeDisable,
  } = dependencies;
  let scopeDisableAttempted = false;
  let scopeDisableReturned = false;

  function closeStores() {
    try {
      assertBoundStores(CODE.closeFailed);
      let storeCloseFailed = false;
      try {
        observerClose();
      } catch {
        storeCloseFailed = true;
      }
      try {
        serviceClose();
      } catch {
        storeCloseFailed = true;
      }
      if (storeCloseFailed) throw failure(CODE.closeFailed);
      if (!scopeDisableAttempted) {
        scopeDisableAttempted = true;
        scopeDisable();
        scopeDisableReturned = true;
      }
      if (!scopeDisableReturned) throw failure(CODE.closeFailed);
      const capability = state.closeCapability;
      state.closeCapability = null;
      if (
        state.terminalCode === CODE.recoveryRequired
        || state.terminalCode === CODE.activatedUnavailable
      ) {
        state.phase = terminalPhase(state.terminalCode);
        capability.reject(failure(state.terminalCode));
      } else {
        state.phase = PHASE.CLOSED;
        capability.resolve(undefined);
      }
    } catch {
      if (state.terminalCode === null) {
        state.terminalCode = state.activationCompleted
          ? CODE.activatedUnavailable
          : CODE.preActivationUnavailable;
      }
      state.phase = terminalPhase(state.terminalCode);
      const capability = state.closeCapability;
      state.closeCapability = null;
      state.closePromise = null;
      capability.reject(failure(CODE.closeFailed));
    }
  }

  function finishClose() {
    if (state.closeCapability === null || state.startupPending) return;
    if (state.session === null) {
      closeStores();
      return;
    }
    let sessionClose;
    try {
      sessionClose = REFLECT_APPLY(state.session.close, undefined, []);
      if (!isNativePromise(sessionClose)) throw failure(CODE.closeFailed);
    } catch {
      const capability = state.closeCapability;
      state.closeCapability = null;
      state.closePromise = null;
      state.phase = state.terminalCode === null
        ? PHASE.ACTIVATED_UNAVAILABLE
        : terminalPhase(state.terminalCode);
      capability.reject(failure(CODE.closeFailed));
      return;
    }
    try {
      REFLECT_APPLY(PROMISE_THEN, sessionClose, [
        () => closeStores(),
        () => {
          const capability = state.closeCapability;
          state.closeCapability = null;
          state.closePromise = null;
          if (state.terminalCode === null) {
            state.terminalCode = state.activationCompleted
              ? CODE.activatedUnavailable
              : CODE.preActivationUnavailable;
          }
          state.phase = terminalPhase(state.terminalCode);
          capability.reject(failure(CODE.closeFailed));
        },
      ]);
    } catch {
      const capability = state.closeCapability;
      state.closeCapability = null;
      state.closePromise = null;
      if (state.terminalCode === null) {
        state.terminalCode = state.activationCompleted
          ? CODE.activatedUnavailable
          : CODE.preActivationUnavailable;
      }
      state.phase = terminalPhase(state.terminalCode);
      capability.reject(failure(CODE.closeFailed));
    }
  }

  function close(...args) {
    if (args.length !== 0) return nativeRejected(failure(CODE.invalidInput));
    if (state.callbackActive || originActive()) {
      state.phase = PHASE.CLOSING;
      state.activeGrantBinding = null;
      return nativeRejected(failure(CODE.closeFailed));
    }
    if (state.phase === PHASE.CLOSED) return state.closePromise ?? nativeResolved(undefined);
    if (state.closePromise !== null) return state.closePromise;
    if (
      state.phase === PHASE.RECOVERY_REQUIRED
      || state.phase === PHASE.ACTIVATED_UNAVAILABLE
    ) {
      state.terminalCode = state.phase === PHASE.RECOVERY_REQUIRED
        ? CODE.recoveryRequired
        : CODE.activatedUnavailable;
    }
    const capability = nativePromiseCapability();
    state.closeCapability = capability;
    state.closePromise = capability.promise;
    state.phase = PHASE.CLOSING;
    state.activeGrantBinding = null;
    finishClose();
    return capability.promise;
  }

  return { close, finishClose };
}
