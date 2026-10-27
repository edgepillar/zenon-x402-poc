/* Actual pure writer with declared response capabilities. No SDK/client import,
 * HTTP server, SQLite, key, signature, nonce or native application execution. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { writeIssuedApplicationResponse as write } from '../src/x402-issued-application-response-writer.js';

const F = Object.freeze, cases = [];
function check(name, body) { body(); cases.push(name); }
function frame(statusCode = 202, body = 'BOUND', headers = F({})) {
  return F({ statusCode, contentType: 'text/plain; charset=utf-8', body, headers });
}
function response(overrides = {}) {
  const headers = new Map(), bodies = [];
  return { headers, bodies, statusCode: 0, destroyed: false, writableEnded: false,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    end(body) { bodies.push(body); this.writableEnded = true; }, ...overrides };
}
const consumer = readFileSync(new URL('../src/service-credit-zenon-funding-post-v1-client.js', import.meta.url), 'ascii');
assert.ok(consumer.includes("readHeader(response.headers, 'vary') === 'PAYMENT-SIGNATURE'"));
check('funding BOUND frame meets the source-pinned client metadata contract', () => {
  const r = response(); assert.equal(write(r, frame(), '/funding'), true);
  assert.equal(r.statusCode, 202); assert.deepEqual(r.bodies, ['BOUND']);
  assert.equal(r.headers.get('vary'), 'PAYMENT-SIGNATURE');
  assert.equal(r.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(r.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('content-length'), '5');
  for (const h of ['payment-required', 'payment-response', 'payment-signature']) assert.equal(r.headers.has(h), false);
});
check('previous combined Vary would fail the exact funding contract', () => {
  assert.notEqual('PAYMENT-SIGNATURE, Authorization', 'PAYMENT-SIGNATURE');
  const r = response(); assert.equal(write(r, frame(), '/funding'), true);
  assert.notEqual(r.headers.get('vary'), 'PAYMENT-SIGNATURE, Authorization');
});
check('issued challenge retains its original header and body', () => {
  const r = response(), header = 'ZGVjbGFyZWQtY2hhbGxlbmdl';
  assert.equal(write(r, frame(402, 'Payment Required', F({ 'PAYMENT-REQUIRED': header })), '/funding'), true);
  assert.equal(r.headers.get('payment-required'), header); assert.equal(r.headers.get('vary'), 'PAYMENT-SIGNATURE');
  assert.deepEqual(r.bodies, ['Payment Required']); assert.equal(r.headers.get('content-length'), '16');
});
for (const [status, body] of [[400, 'Bad Request'], [409, 'Conflict'], [503, 'Service Unavailable']]) {
  check('funding refusal preserves status and exact Vary: ' + status, () => {
    const r = response(); assert.equal(write(r, frame(status, body), '/funding'), true);
    assert.equal(r.statusCode, status); assert.deepEqual(r.bodies, [body]); assert.equal(r.headers.get('vary'), 'PAYMENT-SIGNATURE');
  });
}
for (const route of ['/service-credit/v1/execute', null]) {
  check('service or unclassified response preserves its old combined selector: ' + route, () => {
    const r = response(); assert.equal(write(r, frame(503, 'Service Unavailable'), route), true);
    assert.equal(r.headers.get('vary'), 'PAYMENT-SIGNATURE, Authorization');
  });
}
for (const route of [undefined, '/funding?x=1', '/funding/', '/other', 'https://example.invalid/funding', {}, 0]) {
  check('unclassified caller route cannot acquire funding writer policy: ' + String(route), () => {
    const r = response(); assert.equal(write(r, frame(), route), false); assert.equal(r.headers.size, 0); assert.equal(r.bodies.length, 0);
  });
}
for (const state of [{ destroyed: true }, { writableEnded: true }, null]) {
  check('already unavailable response cannot report an end entry: ' + JSON.stringify(state), () => {
    const r = state === null ? null : response(state); assert.equal(write(r, frame(), '/funding'), false);
    if (r) { assert.equal(r.bodies.length, 0); assert.equal(r.headers.size, 0); }
  });
}
for (const name of ['Vary', 'vArY', 'Cache-Control', 'Content-Length', 'Content-Type', 'Connection', 'X-Content-Type-Options']) {
  check('optional frame headers cannot override protected metadata: ' + name, () => {
    const r = response(); assert.equal(write(r, frame(202, 'BOUND', F({ [name]: 'unsafe' })), '/funding'), false);
    assert.equal(r.headers.size, 0); assert.equal(r.bodies.length, 0);
  });
}
check('accessor frame is rejected without invoking it or writing', () => {
  let gets = 0; const r = response(), value = { statusCode: 202, contentType: 'text/plain; charset=utf-8', headers: F({}) };
  Object.defineProperty(value, 'body', { enumerable: true, get() { gets++; return 'BOUND'; } }); F(value);
  assert.equal(write(r, value, '/funding'), false); assert.equal(gets, 0); assert.equal(r.headers.size, 0);
});
check('proxy frame is refused without entering its traps', () => {
  let gets = 0; const r = response(), value = new Proxy(frame(), { get() { gets++; throw new Error('trap'); } });
  assert.equal(write(r, value, '/funding'), false); assert.equal(gets, 0); assert.equal(r.headers.size, 0);
});
check('proxy header record is refused without entering its ownKeys trap', () => {
  let traps = 0; const r = response(), headers = new Proxy(F({}), { ownKeys() { traps++; throw new Error('trap'); } });
  assert.equal(write(r, frame(202, 'BOUND', headers), '/funding'), false);
  assert.equal(traps, 0); assert.equal(r.headers.size, 0);
});
check('mutable frame cannot be captured across a write entry', () => {
  const r = response(), value = { ...frame() };
  assert.equal(write(r, value, '/funding'), false); assert.equal(r.headers.size, 0);
});
check('native-shaped write exception remains a false completion', () => {
  const r = response({ end() { throw new Error('declared write refusal'); } });
  assert.equal(write(r, frame(), '/funding'), false); assert.equal(r.bodies.length, 0);
});
check('actual UTF-8 length is retained independently from string length', () => {
  const r = response(), body = '\u20ac'; assert.equal(write(r, frame(503, body), null), true);
  assert.equal(r.headers.get('content-length'), String(Buffer.byteLength(body))); assert.equal(r.headers.get('content-length'), '3');
});
check('missing route argument refuses before response mutation', () => {
  const r = response(); assert.equal(write(r, frame()), false); assert.equal(r.headers.size, 0);
});
console.log(JSON.stringify({ event: 'ISSUED_APPLICATION_RESPONSE_WRITER_DATA_CONTROLS', passed: true,
  cases: cases.length, names: cases, declaredResponseCapabilities: true, actualWriterExecuted: true,
  SDK: 0, SQLite: 0, sockets: 0, keys: 0, signatures: 0, nonceSearches: 0, applicationNativeTrials: 0,
  actualFundingClientImported: false, nativeHttpDeliveryProven: false, authority: 'NONE' }));
