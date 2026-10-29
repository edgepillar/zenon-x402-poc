import { Buffer } from 'node:buffer';
import { OutgoingMessage, ServerResponse } from 'node:http';
import { types } from 'node:util';
import { createServiceCreditOriginalFundingGrantNativeReader } from './service-credit-original-funding-grant-native-reader.js';
import { createOriginalFundingGrantHttpReaderCore } from './service-credit-original-grant-http-reader-core.js';
import { createOriginalFundingGrantHttpDownstreamCore } from './service-credit-original-grant-http-downstream-core.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, A = Reflect.apply;
const SET_HEADER = OutgoingMessage.prototype.setHeader, END = OutgoingMessage.prototype.end;
function fail() { throw new TypeError('ORIGINAL_GRANT_NATIVE_HTTP_DOWNSTREAM_REJECTED'); }
/** SOURCE ONLY. Mount only in the dedicated original-funding GET ingress
 * profile. Store is borrowed; neither HTTP close nor a 200 closes the store,
 * reactivates a grant, clears a wallet reservation or proves remote delivery. */
export function createOriginalFundingGrantNativeHttpDownstream(store, route) {
  if (arguments.length !== 2) fail();
  const reader = createOriginalFundingGrantHttpReaderCore(route, createServiceCreditOriginalFundingGrantNativeReader(store));
  // The actual ingress calls (request, response, transportContext, completion).
  // The DATA-tested bridge claims completion before any reader or writer entry.
  return createOriginalFundingGrantHttpDownstreamCore(reader, F(function writeResponse(response, frame) {
    try {
      if (arguments.length !== 2 || response === null || typeof response !== 'object' || types.isProxy(response)
          || Object.getPrototypeOf(response) !== ServerResponse.prototype || response.destroyed || response.writableEnded
          || frame === null || types.isProxy(frame) || !Object.isFrozen(frame) || frame.contentType !== 'application/json'
          || ![200,400,401,503].includes(frame.statusCode) || typeof frame.body !== 'string' || Buffer.byteLength(frame.body) > 8192) fail();
      const headers = frame.headers;
      if (headers === null || types.isProxy(headers) || Object.getPrototypeOf(headers) !== Object.prototype || !Object.isFrozen(headers)
          || headers['Cache-Control'] !== 'private, no-store, max-age=0' || headers['X-Content-Type-Options'] !== 'nosniff'
          || headers.Vary !== 'Authorization, Original-Funding-Query' || headers.Connection !== 'close'
          || Reflect.ownKeys(headers).some(k => !['Cache-Control','X-Content-Type-Options','Vary','Connection','Content-Length'].includes(k))
          || Object.hasOwn(headers,'Content-Length') && headers['Content-Length'] !== String(Buffer.byteLength(frame.body))) fail();
      A(SET_HEADER, response, ['Content-Type', frame.contentType]);
      for (const key of Object.keys(headers)) A(SET_HEADER, response, [key, headers[key]]);
      A(SET_HEADER, response, ['Content-Length', String(Buffer.byteLength(frame.body, 'utf8'))]);
      response.statusCode = frame.statusCode; A(END, response, [frame.body]); return true;
    } catch { return false; }
  }));
}
