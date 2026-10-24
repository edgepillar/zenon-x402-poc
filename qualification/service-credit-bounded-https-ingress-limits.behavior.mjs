import test from 'node:test';
import assert from 'node:assert/strict';
import { captureServiceCreditBoundedHttpsIngressLimits as capture,
  SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_LIMIT_FIELDS as fields } from '../src/service-credit-bounded-https-ingress-limits.js';

const valid = () => ({ maxHeaderBytes: 16384, maxHeaderCount: 16, maxConcurrentSockets: 2,
  maxConnectionStarts: 8, maxConcurrentRequests: 1, maxRequestStarts: 8,
  tlsHandshakeDeadlineMs: 1000, headerDeadlineMs: 2000, requestResponseDeadlineMs: 5000,
  idleSocketDeadlineMs: 2000, startDeadlineMs: 1000, closeGraceMs: 5000, metricsCounterLimit: 10000 });
const options = { concurrency: false, timeout: 1000 };

await test('limits return a detached frozen exact snapshot without freezing caller data', options, () => {
  const input = valid(), output = capture(input);
  assert.deepEqual(output, input); assert.notEqual(output, input); assert.ok(Object.isFrozen(output));
  assert.equal(Object.isFrozen(input), false); assert.deepEqual(Object.keys(output), fields);
  input.closeGraceMs = 1; assert.equal(output.closeGraceMs, 5000);
});
await test('the real five-second response and one-second close mismatch is rejected', options, () => {
  assert.equal(capture({ ...valid(), closeGraceMs: 1000 }), null);
  assert.notEqual(capture(valid()), null);
});
await test('deadline ordering preserves equality and refuses each inverted relationship', options, () => {
  assert.notEqual(capture({ ...valid(), headerDeadlineMs: 5000, tlsHandshakeDeadlineMs: 2000 }), null);
  for (const edit of [{ headerDeadlineMs: 5001 }, { closeGraceMs: 4999 }, { tlsHandshakeDeadlineMs: 2001 }])
    assert.equal(capture({ ...valid(), ...edit }), null);
});
await test('connection and request capacity relationships retain the original contract', options, () => {
  for (const edit of [{ maxConcurrentRequests: 3 }, { maxConnectionStarts: 1 },
    { maxConcurrentRequests: 2, maxRequestStarts: 1 }, { maxRequestStarts: 9 }])
    assert.equal(capture({ ...valid(), ...edit }), null);
});
await test('metrics reserve is the original connection plus request starts plus thirty-two', options, () => {
  assert.notEqual(capture({ ...valid(), metricsCounterLimit: 48 }), null);
  assert.equal(capture({ ...valid(), metricsCounterLimit: 47 }), null);
});
await test('all thirteen per-field lower and upper bounds are exact data checks', options, () => {
  const bounds = [[512, 65536], [1, 256], [1, 10000], [1, 1000000], [1, 10000], [1, 1000000],
    [1, 60000], [1, 60000], [1, 60000], [1, 60000], [1, 60000], [1, 60000], [1, Number.MAX_SAFE_INTEGER]];
  for (let i = 0; i < fields.length; i++) {
    assert.equal(capture({ ...valid(), [fields[i]]: bounds[i][0] - 1 }), null);
    assert.equal(capture({ ...valid(), [fields[i]]: bounds[i][1] + 1 }), null);
  }
  assert.notEqual(capture({ ...valid(), maxHeaderBytes: 65536, maxHeaderCount: 256,
    maxConcurrentSockets: 10000, maxConcurrentRequests: 10000, maxConnectionStarts: 1000000,
    maxRequestStarts: 1000000, tlsHandshakeDeadlineMs: 60000, idleSocketDeadlineMs: 60000,
    headerDeadlineMs: 60000, requestResponseDeadlineMs: 60000, closeGraceMs: 60000,
    startDeadlineMs: 60000, metricsCounterLimit: Number.MAX_SAFE_INTEGER }), null);
});
await test('numeric inputs are never coerced and non-safe values are rejected', options, () => {
  for (const key of fields) for (const value of [NaN, Infinity, -Infinity, 1.5, -0, '1000', 1000n])
    assert.equal(capture({ ...valid(), [key]: value }), null);
});
await test('accessor limits are rejected without invoking the getter', options, () => {
  let calls = 0; const input = valid();
  Object.defineProperty(input, 'closeGraceMs', { enumerable: true, get() { calls++; return 5000; } });
  assert.equal(capture(input), null); assert.equal(calls, 0);
});
await test('proxy and revoked proxy limits are rejected without traps', options, () => {
  let calls = 0;
  const input = new Proxy(valid(), { ownKeys() { calls++; throw Error('trap'); },
    getPrototypeOf() { calls++; throw Error('trap'); }, getOwnPropertyDescriptor() { calls++; throw Error('trap'); } });
  assert.equal(capture(input), null); assert.equal(calls, 0);
  const revoked = Proxy.revocable(valid(), {}); revoked.revoke(); assert.equal(capture(revoked.proxy), null);
});
await test('unknown fields and symbols cannot replace a required own data field', options, () => {
  const missing = valid(); delete missing.startDeadlineMs;
  assert.equal(capture(missing), null); assert.equal(capture({ ...valid(), extra: 1 }), null);
  const symbol = valid(); delete symbol.startDeadlineMs; symbol[Symbol('startDeadlineMs')] = 1000;
  assert.equal(capture(symbol), null);
  const hidden = valid(); Object.defineProperty(hidden, 'startDeadlineMs', { value: 1000, enumerable: false });
  assert.equal(capture(hidden), null);
});
await test('wrong prototypes arrays primitives and argument counts remain invalid', options, () => {
  for (const value of [null, undefined, false, 5, 'limits', [], Object.assign(Object.create(null), valid()),
    Object.create(valid())]) assert.equal(capture(value), null);
  assert.equal(capture(), null); assert.equal(capture(valid(), valid()), null);
});
await test('snapshot immutability and source field order are stable for frozen input', options, () => {
  const input = Object.freeze(valid()), before = Object.getOwnPropertyDescriptors(input), output = capture(input);
  assert.ok(Object.isFrozen(fields)); assert.equal(fields.length, 13); assert.ok(Object.isFrozen(output));
  assert.throws(() => { output.closeGraceMs = 1; }, TypeError);
  assert.deepEqual(Object.getOwnPropertyDescriptors(input), before);
  assert.equal(capture(Object.assign({}, input)).closeGraceMs, 5000);
});
