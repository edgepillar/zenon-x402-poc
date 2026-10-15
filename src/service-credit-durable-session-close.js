export function createServiceCreditDurableSessionClose({
  ownerClose,
  REFLECT_APPLY,
  PROMISE_THEN,
  nativePromiseCapability,
  nativeRejected,
  failure,
  INVALID_INPUT,
  CLOSE_FAILED,
  closeAdmission,
}) {
  let pendingCloses = null;
  let completedClose = null;
  let completedOwnerClose = null;

  function findPendingClose(ownerCloseResult) {
    let current = pendingCloses;
    while (current !== null) {
      if (current.ownerCloseResult === ownerCloseResult) return current;
      current = current.next;
    }
    return null;
  }

  function removePendingClose(record) {
    if (pendingCloses === record) {
      pendingCloses = record.next;
      return;
    }
    let current = pendingCloses;
    while (current !== null && current.next !== record) current = current.next;
    if (current !== null) current.next = record.next;
  }

  return (...args) => {
    if (args.length !== 0) return nativeRejected(failure(INVALID_INPUT));
    let ownerCloseResult;
    try {
      ownerCloseResult = REFLECT_APPLY(ownerClose, undefined, []);
    } catch {
      return nativeRejected(failure(CLOSE_FAILED));
    }
    if (completedClose !== null && ownerCloseResult === completedOwnerClose) {
      return completedClose;
    }
    const existing = findPendingClose(ownerCloseResult);
    if (existing !== null) return existing.capability.promise;

    const capability = nativePromiseCapability();
    const record = { ownerCloseResult, capability, next: pendingCloses };
    pendingCloses = record;
    try {
      REFLECT_APPLY(PROMISE_THEN, ownerCloseResult, [
        () => {
          closeAdmission();
          completedOwnerClose = ownerCloseResult;
          completedClose = capability.promise;
          removePendingClose(record);
          capability.resolve(undefined);
        },
        () => {
          removePendingClose(record);
          capability.reject(failure(CLOSE_FAILED));
        },
      ]);
    } catch {
      removePendingClose(record);
      capability.reject(failure(CLOSE_FAILED));
    }
    return capability.promise;
  };
}
