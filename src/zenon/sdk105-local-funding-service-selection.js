import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { captureSdk105FundingServiceConfiguration } from './sdk105-funding-service-lifecycle.js';
import { captureNativeFundingServiceLoopbackReadSelection } from './native-funding-service-loopback-read-selection.js';

const CAPTURE = captureSdk105FundingServiceConfiguration, LOCAL = captureNativeFundingServiceLoopbackReadSelection;
const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const PROTO = Object.getPrototypeOf, KEYS = Reflect.ownKeys, PROXY = utilTypes.isProxy;
const APPLY = Reflect.apply, FILL = Buffer.prototype.fill;

/** Inert local-qualification selection for the actual existing-key SDK entry.
 * Bind the RPC CA to BOTH funding and service before any key method or native
 * constructor. Snapshot the closed transports and the captured key/material
 * selection across deferred module loading. Borrowed CA bytes are never owned
 * or cleared. The caller owns one returned CA copy shared by these three
 * temporary configurations, and must keep it until its actual opener settles.
 * Other native validation, file ownership and execution authority remain with
 * the actual native entry. No key construction, parsing, SQL or network work.
 */
export function captureSdk105LocalFundingServiceSelection(configuration, localReadOptions) {
  let local = null, comparison = null, returned = false;
  try {
    if (arguments.length !== 2) fail();
    const c = CAPTURE(configuration);
    const funding = fields(c.fundingOptions.fundingTransportOptions,
      ['resourceUrl', 'ca', 'maxRequestStarts', 'requestDeadlineMs', 'handshakeDeadlineMs', 'closeGraceMs']);
    const service = fields(c.serviceOptions.transportOptions,
      ['origin', 'ca', 'maxRequestStarts', 'maxConcurrentRequests', 'requestDeadlineMs', 'handshakeDeadlineMs', 'closeGraceMs']);
    local = LOCAL(localReadOptions, funding.ca);
    comparison = LOCAL(local, service.ca);
    const bound = F({ storeOptions: c.storeOptions,
      fundingOptions: F({ ...c.fundingOptions, keyPair: c.walletOptions.keyPair,
        expectedAddress: c.walletOptions.expectedAddress, fundingTransportOptions: F({ ...funding, ca: local.ca }) }),
      serviceOptions: F({ ...c.serviceOptions, transportOptions: F({ ...service, ca: local.ca }) }) });
    const result = F({ configuration: bound, localReadOptions: local });
    returned = true;
    return result;
  } catch { fail(); }
  finally {
    if (comparison !== null) APPLY(FILL, comparison.ca, [0]);
    if (!returned && local !== null) APPLY(FILL, local.ca, [0]);
  }
}
function fields(value, names) {
  if (value === null || typeof value !== 'object' || PROXY(value)
      || PROTO(value) !== Object.prototype || KEYS(value).length !== names.length) fail();
  const out = {};
  for (const name of names) {
    const d = DESC(value, name);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail();
    Object.defineProperty(out, name, { value: d.value, enumerable: true });
  }
  return out;
}
function fail() {
  const code = 'sdk105_local_funding_service_selection_rejected', error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw F(error);
}
