/**
 * Internal boolean policy shared with the actual retained native read owner.
 * These flags are declared observations, never native handles or OS proof.
 * The caller still owns body/TLS validation, grace/deadline accounting and
 * sticky uncertainty. In particular, a request with no assigned socket must
 * retain its late-socket guard until its existing grace period expires.
 * No input object, timer, Promise, resource, cleanup or authority is retained.
 */
export function nativeReadGenerationHandlesClosed(requestStarted, requestClosed,
  socketAssigned, socketClosed, responseAssigned, responseClosed) {
  if (arguments.length !== 6 || typeof requestStarted !== 'boolean'
      || typeof requestClosed !== 'boolean' || typeof socketAssigned !== 'boolean'
      || typeof socketClosed !== 'boolean' || typeof responseAssigned !== 'boolean'
      || typeof responseClosed !== 'boolean') return false;
  if (!requestStarted) return !requestClosed && !socketAssigned && !socketClosed
    && !responseAssigned && !responseClosed;
  return requestClosed && (socketAssigned ? socketClosed : !socketClosed)
    && (responseAssigned ? socketAssigned && responseClosed : !responseClosed);
}
