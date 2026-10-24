const FREEZE = Object.freeze, DEFINE = Object.defineProperty, ErrorType = TypeError;

/**
 * Source-owned tombstone for already-retired native read handles.
 * Retains one boolean, never the owner/generation/handle, an Error or its data.
 * Native EventEmitter arguments are deliberately ignored, even hostile DATA.
 * No reset, timer, Promise, I/O, dispatch or native-authentication authority.
 */
export function createNativeReadRetiredErrorLatch() {
  if (arguments.length !== 0) fail();
  let latched = false;
  const onError = FREEZE(function onError() { latched = true; });
  const isLatched = FREEZE(function isLatched() {
    if (arguments.length !== 0) fail();
    return latched;
  });
  return FREEZE({ onError, isLatched });
}
function fail() {
  const code = 'NATIVE_READ_RETIRED_ERROR_LATCH_INVALID_INPUT', error = new ErrorType(code);
  DEFINE(error, 'code', { value: code, enumerable: true });
  DEFINE(error, 'stack', { value: 'TypeError: ' + code });
  throw FREEZE(error);
}
