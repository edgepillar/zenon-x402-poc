import { Buffer } from 'node:buffer';
import { OutgoingMessage, ServerResponse } from 'node:http';
import { types } from 'node:util';
import { createServiceCreditOriginalFundingGrantNativeReader } from './service-credit-original-funding-grant-native-reader.js';
import { createOriginalFundingGrantHttpReaderCore } from './service-credit-original-grant-http-reader-core.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, A = Reflect.apply;
const SET_HEADER = OutgoingMessage.prototype.setHeader, END = OutgoingMessage.prototype.end;
function fail() { throw new TypeError('ORIGINAL_GRANT_NATIVE_HTTP_DOWNSTREAM_REJECTED'); }
function completion(value) {
  if (!value || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || !Object.isFrozen(value) || Reflect.ownKeys(value).length !== 2) fail();
  const out = {};
  for (const key of ['success', 'failure']) {
    const d = D(value, key); if (!d || !Object.hasOwn(d, 'value') || !d.enumerable || typeof d.value !== 'function'
        || types.isProxy(d.value) || !Object.isFrozen(d.value)) fail(); out[key] = d.value;
  }
  return out;
}
/** SOURCE ONLY. Mount only in the dedicated original-funding GET ingress
 * profile. Store is borrowed; neither HTTP close nor a 200 closes the store,
 * reactivates a grant, clears a wallet reservation or proves remote delivery. */
export function createOriginalFundingGrantNativeHttpDownstream(store, route) {
  if (arguments.length !== 2) fail();
  const reader = createOriginalFundingGrantHttpReaderCore(route, createServiceCreditOriginalFundingGrantNativeReader(store));
  const seen = new WeakSet(); let held = false;
  function finish(value, clean) {
    try {
      const done = completion(value); if (seen.has(value)) fail(); seen.add(value);
      if (A(clean ? done.success : done.failure, undefined, []) !== undefined) held = true;
    } catch { held = true; }
  }
  const handle = F(function handle(request, response, done) {
    let clean = false;
    try {
      if (arguments.length !== 3 || held || response === null || typeof response !== 'object' || types.isProxy(response)
          || Object.getPrototypeOf(response) !== ServerResponse.prototype || response.destroyed || response.writableEnded) fail();
      const frame = reader.handle(request);
      A(SET_HEADER, response, ['Content-Type', frame.contentType]);
      for (const key of Object.keys(frame.headers)) A(SET_HEADER, response, [key, frame.headers[key]]);
      A(SET_HEADER, response, ['Content-Length', String(Buffer.byteLength(frame.body, 'utf8'))]);
      response.statusCode = frame.statusCode; A(END, response, [frame.body]); clean = !reader.inspect().held;
    } catch { held = true; }
    finish(done, clean); return undefined;
  });
  const close = F(function close(done) {
    try { if (arguments.length !== 1) fail(); reader.close(); if (reader.inspect().held) held = true; }
    catch { held = true; }
    finish(done, !held); return undefined;
  });
  const inspect = F(function inspect() {
    if (arguments.length !== 0) fail(); return F({ held, reader: reader.inspect(), nativeRuntimeQualified: false, authority: 'NONE' });
  });
  return F({ downstream: F({ handle, close }), inspect });
}
