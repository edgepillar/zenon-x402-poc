/* Actual Node Readable + actual flow entry + actual bounded response custody.
 * TLS/header/request/socket observations are declared DATA, NOT native HTTPS.
 * No socket, SDK, SQLite, signer, certificate or native funding owner import.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';
import { setImmediate } from 'node:timers';
import { startFundingPostReadableFlow as START } from '../src/service-credit-funding-post-readable-flow.js';
import { createFundingPostNativeResponseCustody as CUSTODY } from '../src/service-credit-funding-post-native-response.js';

assert.equal(process.argv.length, 2); assert.equal(process.version, 'v24.19.0');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
assert.equal(process.env.X402_FUNDING_READABLE_SELECTION, 'eight-stream-components-only');
assert.ok(process.permission && !process.permission.has('child') && !process.permission.has('worker')
  && !process.permission.has('fs.write'));
const APPLY = Reflect.apply, ON = EventEmitter.prototype.on, ONCE = EventEmitter.prototype.once;
const OPTIONS = { concurrency: false, timeout: 3000 };
const totals = { casesEntered: 0, casesCompleted: 0, actualReadables: 0, actualReadableCloses: 0,
  successfulFlowEntries: 0, ownResumeGetterEntries: 0, inputProxyTraps: 0, declaredTlsObservations: 0 };
const turn = () => new Promise(resolve => setImmediate(resolve));
async function selected(name, callback) {
  let completed = false;
  await test(name, OPTIONS, async () => { totals.casesEntered++; await callback(); totals.casesCompleted++; completed = true; });
  if (!completed) throw new Error('FUNDING_READABLE_CASE_FAILED_STOP');
}
function stream(chunks, readFailure = false) {
  let reads = 0, sent = false, closeResolve;
  const value = new Readable({ read() {
    reads++;
    if (sent) return; sent = true;
    if (readFailure) throw new Error('SYNTHETIC_UNPUBLISHED_READ_FAILURE');
    for (const chunk of chunks) this.push(chunk);
    this.push(null);
  } });
  totals.actualReadables++;
  const closed = new Promise(resolve => { closeResolve = resolve; });
  APPLY(ONCE, value, ['close', () => { totals.actualReadableCloses++; closeResolve(); }]);
  return { value, closed, reads: () => reads };
}
function start(value) { assert.equal(START(value), undefined); totals.successfulFlowEntries++; }
function harness(chunks, length, readFailure = false) {
  const source = stream(chunks, readFailure), custody = CUSTODY();
  custody.acceptTls(); totals.declaredTlsObservations++;
  custody.acceptHeaders({ statusCode: 202, rawHeaders: ['Content-Length', String(length)] });
  const observe = operation => { try { operation(); } catch { custody.fail(); source.value.destroy(); } };
  APPLY(ON, source.value, ['error', () => custody.fail()]);
  APPLY(ON, source.value, ['data', chunk => observe(() => custody.acceptChunk(chunk))]);
  APPLY(ONCE, source.value, ['end', () => observe(() => custody.acceptEnd())]);
  return { ...source, custody };
}
const unavailable = problem => Object.isFrozen(problem)
  && problem.code === 'FUNDING_POST_READABLE_FLOW_UNAVAILABLE'
  && problem.stack === 'TypeError: FUNDING_POST_READABLE_FLOW_UNAVAILABLE'
  && !Object.hasOwn(problem, 'cause');
const responseUnavailable = { code: 'FUNDING_POST_NATIVE_RESPONSE_UNAVAILABLE' };

await selected('direct EventEmitter data registration alone leaves a real Readable idle until the actual flow entry', async () => {
  const s = stream([Buffer.from('BOUND')]), chunks = [];
  APPLY(ON, s.value, ['data', chunk => chunks.push(chunk)]);
  APPLY(ON, s.value, ['error', () => assert.fail('UNEXPECTED_STREAM_ERROR')]);
  await turn(); assert.equal(s.value.readableFlowing, null); assert.equal(s.reads(), 0); assert.equal(chunks.length, 0);
  start(s.value); await s.closed;
  assert.equal(Buffer.concat(chunks).toString(), 'BOUND'); assert.ok(s.reads() >= 1);
});
await selected('real body flow reaches exact custody end but still waits for both declared HTTP-close observations', async () => {
  const h = harness([Buffer.from('BO'), Buffer.from('UND')], 5);
  start(h.value); await h.closed;
  assert.equal(h.custody.snapshot().ended, true); assert.equal(h.custody.snapshot().phase, 'WAITING');
  h.custody.acceptRequestClose(); assert.equal(h.custody.snapshot().phase, 'WAITING');
  h.custody.acceptSocketClose({ hadError: false });
  const result = h.custody.takeResponse(); assert.equal(result.body.toString(), 'BOUND');
  assert.equal(h.custody.snapshot().phase, 'TAKEN'); assert.equal(h.custody.snapshot().authority, 'NONE');
});
await selected('a real short stream ends as permanent UNKNOWN rather than a partial BOUND handoff', async () => {
  const h = harness([Buffer.from('BO')], 5); start(h.value); await h.closed;
  assert.equal(h.custody.snapshot().phase, 'UNKNOWN'); assert.equal(h.custody.snapshot().receivedBytes, 2);
  assert.throws(() => h.custody.acceptRequestClose(), responseUnavailable);
  assert.throws(() => h.custody.takeResponse(), responseUnavailable);
});
await selected('a real sixty-five-byte overflow cannot exceed the actual sixty-four-byte custody bound', async () => {
  const h = harness([Buffer.alloc(65, 1)], 64); start(h.value); await h.closed;
  assert.equal(h.custody.snapshot().phase, 'UNKNOWN'); assert.equal(h.custody.snapshot().receivedBytes, 0);
  assert.equal(h.custody.snapshot().maxResponseBodyBytes, 64);
  assert.throws(() => h.custody.takeResponse(), responseUnavailable);
});
await selected('the actual flow entry uses captured Readable.resume without reading an own resume getter', async () => {
  const s = stream([Buffer.from('BOUND')]), chunks = [];
  Object.defineProperty(s.value, 'resume', { get() { totals.ownResumeGetterEntries++; throw new Error('RESUME_GETTER'); } });
  APPLY(ON, s.value, ['data', chunk => chunks.push(chunk)]);
  APPLY(ON, s.value, ['error', () => assert.fail('UNEXPECTED_STREAM_ERROR')]);
  start(s.value); await s.closed;
  assert.equal(Buffer.concat(chunks).toString(), 'BOUND'); assert.equal(totals.ownResumeGetterEntries, 0);
});
await selected('a genuinely paused Readable starts only after all listeners and the actual explicit flow entry', async () => {
  const s = stream([Buffer.from('BOUND')]), chunks = []; s.value.pause();
  APPLY(ON, s.value, ['data', chunk => chunks.push(chunk)]);
  APPLY(ON, s.value, ['error', () => assert.fail('UNEXPECTED_STREAM_ERROR')]);
  await turn(); assert.equal(s.value.readableFlowing, false); assert.equal(chunks.length, 0);
  start(s.value); await s.closed; assert.equal(Buffer.concat(chunks).toString(), 'BOUND');
});
await selected('invalid arity and proxy-bearing prototype chains refuse without invoking proxy traps or leaking a cause', () => {
  const trap = () => { totals.inputProxyTraps++; throw new Error('PROXY_HOOK'); };
  const proxy = new Proxy({}, { get: trap, getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap });
  for (const value of [null, undefined, {}, [], proxy, Object.create(proxy), Object.create(Readable.prototype)])
    assert.throws(() => START(value), unavailable);
  assert.throws(() => START(), unavailable); assert.throws(() => START({}, true), unavailable);
  assert.equal(totals.inputProxyTraps, 0);
});
await selected('an actual asynchronous Readable failure leaves genuine response custody UNKNOWN', async () => {
  const h = harness([], 5, true); start(h.value); await h.closed;
  assert.equal(h.custody.snapshot().phase, 'UNKNOWN'); assert.equal(h.custody.snapshot().ended, false);
  assert.throws(() => h.custody.takeResponse(), responseUnavailable);
});
assert.deepEqual(totals, { casesEntered: 8, casesCompleted: 8, actualReadables: 7, actualReadableCloses: 7,
  successfulFlowEntries: 7, ownResumeGetterEntries: 0, inputProxyTraps: 0, declaredTlsObservations: 4 });
console.log('# funding-readable-flow-components ' + JSON.stringify({ ...totals, nativeFundingOwnerImported: false,
  sockets: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, nonceEvaluations: 0,
  historicalTlsFailureRootCauseEstablished: false, nativeTlsQualification: false, authority: 'NONE' }));
