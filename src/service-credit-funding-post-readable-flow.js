import { Readable } from 'node:stream';
import { types as utilTypes } from 'node:util';

const RESUME = Readable.prototype.resume, READABLE = Readable.prototype;
const APPLY = Reflect.apply, PROTO = Object.getPrototypeOf, IS_PROXY = utilTypes.isProxy;
const FREEZE = Object.freeze;

/**
 * Internal body-flow entry for an exclusively source-owned actual Readable.
 * Call only after every error/data/end/close guard has been installed. Direct
 * EventEmitter registration does not run Readable.on's flow-start behavior.
 * Capture the actual resume method, not a response-owned property. No factory,
 * callback, listener, handle, body copy, timer or retry capability is retained.
 * Prototype admission is cooperative shape checking, NOT a native brand or
 * authorization to accept TLS, framing, close, payment or store state.
 */
export function startFundingPostReadableFlow(response) {
  try {
    if (arguments.length !== 1 || typeof response !== 'object' || response === null) refuse();
    let current = response, depth = 0;
    while (current !== READABLE) {
      if (current === null || IS_PROXY(current) || depth++ >= 8) refuse();
      current = PROTO(current);
    }
    if (APPLY(RESUME, response, []) !== response) refuse();
    return undefined;
  } catch { refuse(); }
}
function refuse() {
  const code = 'FUNDING_POST_READABLE_FLOW_UNAVAILABLE', error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw FREEZE(error);
}
