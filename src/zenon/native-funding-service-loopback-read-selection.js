import { Buffer } from 'node:buffer';
import { captureNativeReadLoopbackQualificationRoute } from './native-read-loopback-qualification-configuration.js';

const F = Object.freeze, APPLY = Reflect.apply, FILL = Buffer.prototype.fill;
const ROUTE = F({ hostname: 'localhost', path: '/rpc/first', ipv4Address: '127.0.0.1' });
const CAPTURE = captureNativeReadLoopbackQualificationRoute;
const PROFILE = 'dynamic_plasma_retained_candidate';

/**
 * DATA only. Detach the explicit local read selection and bind its CA bytes
 * to the already detached funding/service CA. The existing closed local route
 * grammar, Buffer/descriptor checks and unprivileged port bounds are reused.
 * No certificate parsing, native owner, SDK, SQL or execution permission.
 * Caller owns the returned CA copy. Neither borrowed input is ever cleared.
 */
export function captureNativeFundingServiceLoopbackReadSelection(options, applicationCa) {
  let selected = null, expected = null, returned = false;
  try {
    if (arguments.length !== 2) refuse();
    selected = CAPTURE(ROUTE, options, PROFILE);
    expected = CAPTURE(ROUTE, F({ port: selected.port, ca: applicationCa }), PROFILE);
    let equal = selected.ca.length === expected.ca.length;
    for (let i = 0; i < selected.ca.length; i++) if (selected.ca[i] !== expected.ca[i]) equal = false;
    if (!equal) refuse();
    const result = F({ port: selected.port, ca: selected.ca });
    returned = true;
    return result;
  } catch {
    refuse();
  } finally {
    if (expected !== null) APPLY(FILL, expected.ca, [0]);
    if (!returned && selected !== null) APPLY(FILL, selected.ca, [0]);
  }
}
function refuse() {
  const code = 'native_funding_service_loopback_read_selection_rejected', error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw F(error);
}
