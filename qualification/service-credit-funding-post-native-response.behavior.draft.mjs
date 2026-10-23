import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createFundingPostNativeResponseCustody as CREATE } from '../src/service-credit-funding-post-native-response.js';

const OPTIONS = { concurrency: false, timeout: 1000 };
const invalid = error => error instanceof TypeError && Object.isFrozen(error)
  && error.code === 'FUNDING_POST_NATIVE_RESPONSE_UNAVAILABLE'
  && error.stack === 'TypeError: FUNDING_POST_NATIVE_RESPONSE_UNAVAILABLE';
const headers = (length = '5', extra = []) => ({ statusCode: 202,
  rawHeaders: ['Content-Length', length, 'Content-Type', 'text/plain; charset=utf-8', ...extra] });
function bodyReady() {
  const c = CREATE(); c.acceptTls(); c.acceptHeaders(headers());
  c.acceptChunk(Buffer.from('BOUND')); c.acceptEnd(); return c;
}
function finish(c, socketFirst = false) {
  if (socketFirst) { c.acceptSocketClose({ hadError: false }); c.acceptRequestClose(); }
  else { c.acceptRequestClose(); c.acceptSocketClose({ hadError: false }); }
}
function held(c, operation) {
  assert.throws(operation, invalid); assert.equal(c.snapshot().phase, 'UNKNOWN');
  assert.throws(() => c.takeResponse(), invalid);
}

await test('funding response waits for end and both actual-close observations', OPTIONS, () => {
  const c = CREATE(); assert.equal(c.snapshot().phase, 'WAITING');
  c.acceptTls(); c.acceptHeaders(headers()); c.acceptChunk(Buffer.from('BOUND'));
  assert.equal(c.snapshot().phase, 'WAITING'); c.acceptEnd(); assert.equal(c.snapshot().phase, 'WAITING');
  c.acceptRequestClose(); assert.equal(c.snapshot().phase, 'WAITING');
  c.acceptSocketClose({ hadError: false }); assert.equal(c.snapshot().phase, 'READY');
  const value = c.takeResponse(); assert.equal(value.body.toString(), 'BOUND');
  assert.equal(c.snapshot().phase, 'TAKEN'); assert.equal(c.snapshot().authority, 'NONE');
});
await test('funding response accepts socket close before request close only after end', OPTIONS, () => {
  const c = bodyReady(); finish(c, true); assert.equal(c.takeResponse().body.toString(), 'BOUND');
});
await test('funding response detaches raw headers without inventing acknowledgement', OPTIONS, () => {
  const c = CREATE(), input = headers(); c.acceptTls(); c.acceptHeaders(input);
  input.statusCode = 400; input.rawHeaders[1] = '64';
  c.acceptChunk(Buffer.from('BOUND')); c.acceptEnd(); finish(c);
  const result = c.takeResponse(); assert.equal(result.statusCode, 202);
  assert.deepEqual(result.headerPairs[0], ['content-length', '5']);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.headerPairs) && Object.isFrozen(result.headerPairs[0]));
  assert.equal(result.authority, undefined);
});
await test('funding response copies body chunks before source mutation', OPTIONS, () => {
  const c = CREATE(), input = Buffer.from('BOUND'); c.acceptTls(); c.acceptHeaders(headers()); c.acceptChunk(input);
  input.fill(0); c.acceptEnd(); finish(c); assert.equal(c.takeResponse().body.toString(), 'BOUND');
});
await test('funding response permits exactly sixty-four detached body bytes', OPTIONS, () => {
  const c = CREATE(); c.acceptTls(); c.acceptHeaders(headers('64'));
  c.acceptChunk(Buffer.alloc(32, 1)); c.acceptChunk(Buffer.alloc(32, 2)); c.acceptEnd(); finish(c);
  const value = c.takeResponse(); assert.equal(value.body.length, 64);
  assert.equal(value.body[0], 1); assert.equal(value.body[63], 2);
});
await test('funding response handles an exact zero-length response without implying success', OPTIONS, () => {
  const c = CREATE(); c.acceptTls(); c.acceptHeaders({ statusCode: 400, rawHeaders: ['Content-Length', '0'] });
  c.acceptEnd(); finish(c); const value = c.takeResponse();
  assert.equal(value.statusCode, 400); assert.equal(value.body.length, 0);
});
await test('funding response early take permanently vetoes later completion', OPTIONS, () => {
  const c = bodyReady(); held(c, () => c.takeResponse());
  assert.throws(() => c.acceptRequestClose(), invalid); assert.equal(c.snapshot().phase, 'UNKNOWN');
});
await test('funding response refuses headers before TLS without later promotion', OPTIONS, () => {
  const c = CREATE(); held(c, () => c.acceptHeaders(headers()));
  assert.throws(() => c.acceptTls(), invalid);
});
await test('funding response duplicate TLS or header observations are terminal', OPTIONS, () => {
  const first = CREATE(); first.acceptTls(); held(first, () => first.acceptTls());
  const second = CREATE(); second.acceptTls(); second.acceptHeaders(headers());
  held(second, () => second.acceptHeaders(headers()));
});
await test('funding response request close before end is not a completed response', OPTIONS, () => {
  const c = CREATE(); c.acceptTls(); c.acceptHeaders(headers()); c.acceptChunk(Buffer.from('BOUND'));
  held(c, () => c.acceptRequestClose());
});
await test('funding response errored or premature socket close permanently holds', OPTIONS, () => {
  const first = bodyReady(); held(first, () => first.acceptSocketClose({ hadError: true }));
  const second = CREATE(); second.acceptTls(); held(second, () => second.acceptSocketClose({ hadError: false }));
});
await test('funding response short body or duplicate end cannot be accepted', OPTIONS, () => {
  const first = CREATE(); first.acceptTls(); first.acceptHeaders(headers()); first.acceptChunk(Buffer.from('BO'));
  held(first, () => first.acceptEnd());
  const second = bodyReady(); held(second, () => second.acceptEnd());
});
await test('funding response rejects overflow before retaining unbounded body data', OPTIONS, () => {
  const c = CREATE(); c.acceptTls(); c.acceptHeaders(headers());
  held(c, () => c.acceptChunk(Buffer.alloc(65536, 9)));
  assert.equal(c.snapshot().receivedBytes, 0); assert.equal(c.snapshot().maxResponseBodyBytes, 64);
});
await test('funding response requires a canonical bounded Content-Length', OPTIONS, () => {
  for (const length of ['01', '+1', '-1', '1.0', '1e0', '65', '9007199254740992', '']) {
    const c = CREATE(); c.acceptTls(); held(c, () => c.acceptHeaders(headers(length)));
  }
  const c = CREATE(); c.acceptTls(); held(c, () => c.acceptHeaders({ statusCode: 202, rawHeaders: [] }));
});
await test('funding response rejects encoded trailer and duplicate header ambiguity', OPTIONS, () => {
  for (const extra of [['Transfer-Encoding', 'chunked'], ['Content-Encoding', 'gzip'],
    ['Trailer', 'x-end'], ['content-LENGTH', '5'], ['X-A', '1', 'x-a', '2'], ['X-A', ' leading']]) {
    const c = CREATE(); c.acceptTls(); held(c, () => c.acceptHeaders(headers('5', extra)));
  }
});
await test('funding response independently bounds header pairs and aggregate bytes', OPTIONS, () => {
  const extra = Array.from({ length: 62 }, (_, i) => ['X-' + i, 'ok']).flat();
  const accepted = CREATE(); accepted.acceptTls(); accepted.acceptHeaders(headers('5', extra));
  assert.equal(accepted.snapshot().headersAccepted, true);
  const count = CREATE(); count.acceptTls(); held(count, () => count.acceptHeaders(headers('5', [...extra, 'X-63', 'ok'])));
  const size = CREATE(); size.acceptTls(); held(size, () => size.acceptHeaders(headers('5', ['X-A', 'x'.repeat(16384)])));
});
await test('funding response rejects proxies accessors and sparse arrays without hooks', OPTIONS, () => {
  let hooks = 0;
  const c = CREATE(); c.acceptTls();
  held(c, () => c.acceptHeaders(new Proxy(headers(), { ownKeys() { hooks++; return []; } })));
  const d = CREATE(); d.acceptTls();
  const value = { statusCode: 202 }; Object.defineProperty(value, 'rawHeaders', { enumerable: true, get() { hooks++; return []; } });
  held(d, () => d.acceptHeaders(value));
  const e = CREATE(); e.acceptTls(); const raw = ['Content-Length', '5']; delete raw[1];
  held(e, () => e.acceptHeaders({ statusCode: 202, rawHeaders: raw }));
  assert.equal(hooks, 0);
});
await test('funding response rejects shared substituted and hooked body buffers', OPTIONS, () => {
  let hooks = 0;
  const wrong = [new Uint8Array(5), Buffer.from(new SharedArrayBuffer(5)),
    new Proxy(Buffer.from('BOUND'), { ownKeys() { hooks++; return []; } })];
  const custom = Buffer.from('BOUND'); Object.defineProperty(custom, 'extra', { get() { hooks++; return 1; } }); wrong.push(custom);
  for (const input of wrong) {
    const c = CREATE(); c.acceptTls(); c.acceptHeaders(headers()); held(c, () => c.acceptChunk(input));
  }
  assert.equal(hooks, 0);
});
await test('funding response late errors revoke current state but cannot recall a taken copy', OPTIONS, () => {
  const first = bodyReady(); finish(first); first.fail();
  assert.equal(first.snapshot().phase, 'UNKNOWN'); assert.throws(() => first.takeResponse(), invalid);
  const second = bodyReady(); finish(second); const result = second.takeResponse(); second.fail();
  assert.equal(second.snapshot().phase, 'UNKNOWN'); assert.equal(result.body.toString(), 'BOUND');
  assert.equal(second.snapshot().nativeEventsAuthenticatedByThisComponent, false);
});
await test('funding response wrong arity and second take never renew custody', OPTIONS, () => {
  assert.throws(() => CREATE({}), invalid);
  const first = CREATE(); held(first, () => first.acceptTls(true));
  const second = bodyReady(); finish(second); second.takeResponse(); held(second, () => second.takeResponse());
  const third = bodyReady(); finish(third); held(third, () => third.acceptChunk(Buffer.alloc(0)));
});
console.log('# funding-post-response-custody-component ' + JSON.stringify({
  expectedCases: 20, nativeTransportImported: false, sockets: 0, productTimers: 0,
  SDK: false, SQLite: false, keys: 0, signatures: 0, nonceSearch: false,
  nativeEventsAuthenticated: false, realFunding: false, fullP1: false,
}));
