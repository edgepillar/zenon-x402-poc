import { types as utilTypes } from 'node:util';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, P = Object.getPrototypeOf;
const K = Reflect.ownKeys, O = Object.hasOwn, DEFINE = Object.defineProperty;
const PROXY = utilTypes.isProxy, INTEGER = Number.isSafeInteger, OBJECT = Object.prototype;
const MAX_INTEGER = Number.MAX_SAFE_INTEGER;

export const SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_LIMIT_FIELDS = F([
  'maxHeaderBytes', 'maxHeaderCount', 'maxConcurrentSockets', 'maxConnectionStarts',
  'maxConcurrentRequests', 'maxRequestStarts', 'tlsHandshakeDeadlineMs', 'headerDeadlineMs',
  'requestResponseDeadlineMs', 'idleSocketDeadlineMs', 'startDeadlineMs', 'closeGraceMs',
  'metricsCounterLimit',
]);
const FIELDS = SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_LIMIT_FIELDS;
const BOUNDS = F([
  F([512, 65536]), F([1, 256]), F([1, 10000]), F([1, 1000000]),
  F([1, 10000]), F([1, 1000000]), F([1, 60000]), F([1, 60000]),
  F([1, 60000]), F([1, 60000]), F([1, 60000]), F([1, 60000]), F([1, MAX_INTEGER]),
]);

/**
 * Shared DATA-only admission for the actual native ingress and its host.
 * Preserve the ingress's existing exact fields, numeric ceilings and budget
 * relationships. Return a detached frozen snapshot, or null without invoking
 * a getter, Proxy trap, coercion or callback. No SQL, SDK, timer or network.
 * A valid limit record is not native execution or resource/OS authority.
 */
export function captureServiceCreditBoundedHttpsIngressLimits(value) {
  if (arguments.length !== 1) return null;
  try {
    if (value === null || typeof value !== 'object' || PROXY(value)
        || P(value) !== OBJECT || K(value).length !== FIELDS.length) return null;
    const result = {};
    for (let i = 0; i < FIELDS.length; i++) {
      const key = FIELDS[i], d = D(value, key), bound = BOUNDS[i];
      if (!d || !O(d, 'value') || !d.enumerable || !INTEGER(d.value)
          || d.value < bound[0] || d.value > bound[1]) return null;
      DEFINE(result, key, { value: d.value, enumerable: true });
    }
    if (result.maxConcurrentRequests > result.maxConcurrentSockets
        || result.maxConnectionStarts < result.maxConcurrentSockets
        || result.maxRequestStarts < result.maxConcurrentRequests
        || result.maxRequestStarts > result.maxConnectionStarts
        || result.headerDeadlineMs > result.requestResponseDeadlineMs
        || result.requestResponseDeadlineMs > result.closeGraceMs
        || result.tlsHandshakeDeadlineMs > result.idleSocketDeadlineMs
        || result.metricsCounterLimit < result.maxConnectionStarts + result.maxRequestStarts + 32) return null;
    return F(result);
  } catch { return null; }
}
