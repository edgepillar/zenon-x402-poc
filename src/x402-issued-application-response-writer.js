import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';

const IS_PROXY = utilTypes.isProxy, PROTO = Object.getPrototypeOf;
const DESC = Object.getOwnPropertyDescriptor, KEYS = Reflect.ownKeys, OWN = Object.hasOwn;
const BYTE_LENGTH = Buffer.byteLength;
const FRAME = ['statusCode', 'contentType', 'body', 'headers'];
const RESERVED = new Set(['cache-control', 'content-type', 'content-length', 'vary',
  'connection', 'x-content-type-options']);

/** Route-scoped response DATA writer. Construction/import opens no resource.
 * The owner supplies an already validated fixed route or null for an unclassified
 * refusal. Funding retains the POST-v1 exact Vary contract; service/unclassified
 * responses preserve the combined application's existing cache selector.
 * A true result observes only local response.end entry, never delivery, funding,
 * settlement, grant activation, persistence, native close or retry authority.
 */
export function writeIssuedApplicationResponse(response, frame, route) {
  if (arguments.length !== 3 || (route !== null && route !== '/funding'
      && route !== '/service-credit/v1/execute')) return false;
  let value, headers;
  try {
    value = data(frame, FRAME);
    if (value.headers === null || typeof value.headers !== 'object' || IS_PROXY(value.headers)) return false;
    headers = data(value.headers, KEYS(value.headers));
    if (!Number.isSafeInteger(value.statusCode) || value.statusCode < 200 || value.statusCode > 599
        || typeof value.contentType !== 'string' || typeof value.body !== 'string') return false;
    for (const name of KEYS(headers)) {
      if (typeof name !== 'string' || RESERVED.has(name.toLowerCase())
          || typeof headers[name] !== 'string') return false;
    }
    if (response === null || typeof response !== 'object' || IS_PROXY(response)
        || response.destroyed || response.writableEnded) return false;
    response.statusCode = value.statusCode;
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('Content-Type', value.contentType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Vary', route === '/funding' ? 'PAYMENT-SIGNATURE' : 'PAYMENT-SIGNATURE, Authorization');
    response.setHeader('Connection', 'close');
    for (const name of KEYS(headers)) response.setHeader(name, headers[name]);
    response.setHeader('Content-Length', String(BYTE_LENGTH(value.body)));
    response.end(value.body);
    return true;
  } catch { return false; }
}

function data(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value) !== Object.prototype || !Object.isFrozen(value)
      || KEYS(value).length !== fields.length) throw new TypeError('issued_response_data_rejected');
  const out = Object.create(null);
  for (const name of fields) {
    const field = DESC(value, name);
    if (!field || !OWN(field, 'value') || !field.enumerable) throw new TypeError('issued_response_data_rejected');
    Object.defineProperty(out, name, { value: field.value, enumerable: true });
  }
  return out;
}
