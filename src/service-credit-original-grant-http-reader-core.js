import { types } from 'node:util';
import { captureOriginalFundingGrantSelectedRoute, captureOriginalFundingGrantHttpsRequest, createOriginalFundingGrantHttpFrame } from './service-credit-original-grant-http-binding.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, A = Reflect.apply;
function fail() { throw new TypeError('ORIGINAL_FUNDING_GRANT_HTTP_READER_REJECTED'); }
function method(object, key) {
  if (!object || types.isProxy(object) || Object.getPrototypeOf(object) !== Object.prototype || !Object.isFrozen(object)) fail();
  const d = D(object, key); if (!d || !Object.hasOwn(d, 'value') || !d.enumerable
      || typeof d.value !== 'function' || types.isProxy(d.value) || !Object.isFrozen(d.value)) fail(); return d.value;
}
function errorFrame(statusCode) {
  return F({ statusCode, contentType: 'application/json', body: '{"error":"original_funding_query_unavailable"}',
    headers: F({ 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff',
      Vary: 'Authorization, Original-Funding-Query', Connection: 'close' }) });
}
/** Reader is an explicit borrowed, synchronous capability. No store opener,
 * issuer, pricing, dispatch, payment or key capability is accepted here. */
export function createOriginalFundingGrantHttpReaderCore(routeInput, reader) {
  if (arguments.length !== 2) fail();
  const route = captureOriginalFundingGrantSelectedRoute(routeInput), READ = method(reader, 'read');
  const INSPECT = method(reader, 'inspect'), CLOSE = method(reader, 'close');
  if (Reflect.ownKeys(reader).length !== 3) fail();
  let closed = false, held = false, busy = false, accepted = 0;
  const handle = F(function handle(request) {
    if (arguments.length !== 1 || closed || held || busy) { if (busy) held = true; return errorFrame(503); }
    let captured; try { captured = captureOriginalFundingGrantHttpsRequest(request, route); } catch { return errorFrame(400); }
    busy = true;
    try {
      const value = A(READ, undefined, [captured.query, captured.proof]);
      if (closed || held) fail();
      const frame = createOriginalFundingGrantHttpFrame(value, captured.query.originalFunding); accepted++; return frame;
    } catch {
      try { const state = A(INSPECT, undefined, []); if (state.lifecycle !== 'OPEN' || state.held !== false || state.busy !== false) held = true; }
      catch { held = true; }
      return errorFrame(held || closed ? 503 : 401);
    } finally { busy = false; }
  });
  const close = F(function close() {
    if (arguments.length !== 0) fail(); if (closed) return; closed = true; if (busy) held = true;
    try { if (A(CLOSE, undefined, []) !== undefined) held = true; } catch { held = true; }
  });
  const inspect = F(function inspect() {
    if (arguments.length !== 0) fail(); return F({ phase: held ? 'HELD' : closed ? 'CLOSED' : 'OPEN', held, busy, accepted,
      readerOwnership: 'BORROWED_LOGICAL_RETIRE_ONLY', storeOwnership: 'BORROWED_NEVER_CLOSED', authority: 'NONE' });
  });
  return F({ handle, close, inspect });
}
