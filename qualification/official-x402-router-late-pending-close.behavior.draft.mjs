// Versioned declared-callback regressions for the actual HTTPS router.
// Preload this file before the unchanged ten-case router entry. No argv/source
// replacement, test discovery, SDK, SQLite, TLS/socket, key or signature is used.
// These are component results, not native pending-owner or resource-release proof.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createOfficialUpfrontServiceCreditHttpsRouter as ROUTER }
  from '../src/x402-official-upfront-https-router.js';

assert.equal(process.versions.node, '24.19.0');
assert.equal(process.argv.length, 2);
assert.equal(process.argv[1], fileURLToPath(
  new URL('./official-x402-upfront-https-router.behavior.draft.mjs', import.meta.url)));
assert.equal(process.env.X402_ROUTER_LATE_PENDING_CONTRACT_OPT_IN,
  'declared-callable-no-native-no-sdk');

const freeze = Object.freeze, OPTIONS = { timeout: 5000, concurrency: false };
const ORIGIN = 'https://router-late-close.invalid:8443';
const ORIGINAL = 'b3JpZ2luYWwtdGVzdC1kYXRh';
const fixtures = [];
let completed = 0;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function completion() {
  const d = deferred(), counts = { success: 0, failure: 0 };
  return { promise: d.promise, counts, value: freeze({
    success: freeze(() => { counts.success++; d.resolve(true); }),
    failure: freeze(() => { counts.failure++; d.resolve(false); }),
  }) };
}
function request(header = ORIGINAL) {
  return { method: 'GET', url: '/paid', httpVersion: '1.1',
    socket: { encrypted: true },
    rawHeaders: ['Host', 'router-late-close.invalid:8443',
      ...(header === null ? [] : ['Payment-Signature', header])] };
}
function response() {
  return { destroyed: false, writableEnded: false, statusCode: 200, writes: 0,
    headers: Object.create(null),
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body) { this.writes++; this.body = body; this.writableEnded = true; } };
}
function paymentError(pending, { body = {}, headers = {} } = {}) {
  return { type: 'payment-error', response: { status: 402, headers, body }, pending };
}
function fixture() {
  const f = { calls: 0, resumes: 0, pendingCloses: 0, serviceCloses: 0,
    serviceCalls: 0, thenReads: 0, hook: null, closeHook: null,
    closeEntered: deferred(), closed: false, router: null, pending: null };
  f.pending = freeze({
    close: freeze(() => {
      f.pendingCloses++; f.closeEntered.resolve();
      return f.closeHook === null ? Promise.resolve() : f.closeHook();
    }),
    resume: freeze(async () => { f.resumes++; throw Error('NO_RESUME_AUTHORITY'); }),
    getSnapshot: freeze(() => freeze({ phase: 'PENDING' })),
  });
  const official = freeze({
    processRequest: freeze(() => { throw Error('NO_SCALAR_ENTRY'); }),
    processHttpRequest: freeze(async req => {
      f.calls++;
      return f.hook === null ? paymentError(f.pending) : f.hook(req);
    }),
    getSnapshot: freeze(() => freeze({ declaredCallbackOnly: true })),
  });
  const service = freeze({
    handle: freeze(async () => { f.serviceCalls++; throw Error('NO_SERVICE_AUTHORITY'); }),
    close: freeze(async () => { f.serviceCloses++; }),
  });
  f.router = ROUTER({ resourceUrl: ORIGIN + '/paid', officialServer: official,
    serviceSession: service, maxFundingPayments: 4 });
  fixtures.push(f);
  return f;
}
function dispatch(f, req = request()) {
  const done = completion(), res = response();
  assert.equal(f.router.handle(req, res, freeze({ declaredCallbackOnly: true }), done.value), undefined);
  return { done, res };
}
function beginClose(f) {
  const done = completion();
  assert.equal(f.router.close(done.value), undefined);
  return done;
}
async function closed(f, done, clean = false) {
  assert.equal(await done.promise, clean);
  f.closed = true;
  assert.deepEqual(done.counts, { success: Number(clean), failure: Number(!clean) });
  const s = f.router.snapshot();
  assert.equal(s.phase, clean ? 'CLOSED' : 'CLOSE_UNCERTAIN');
  assert.equal(s.activeOperations, 0); assert.equal(s.pendingCloses, 0);
  assert.equal(s.retainedPayments, 0); assert.equal(s.serviceSessionClosed, true);
  assert.equal(f.serviceCloses, 1); assert.equal(f.calls, 1);
  assert.equal(f.resumes, 0); assert.equal(f.serviceCalls, 0);
  return s;
}
async function lateReply(f, value, { header = ORIGINAL } = {}) {
  const gate = deferred();
  f.hook = () => gate.promise;
  const handled = dispatch(f, request(header)), closing = beginClose(f);
  assert.equal(await handled.done.promise, false);
  assert.equal(f.router.snapshot().phase, 'CLOSING');
  assert.equal(f.pendingCloses, 0);
  gate.resolve(value);
  return { handled, closing };
}
function scenario(name, run) {
  test(name, OPTIONS, async () => { await run(); completed++; });
}

scenario('closing before malformed body drains the late pending owner exactly once', async () => {
  const f = fixture();
  const { handled, closing } = await lateReply(f,
    paymentError(f.pending, { body: { unsupported: () => {} } }));
  await closed(f, closing);
  assert.equal(f.pendingCloses, 1); assert.equal(handled.res.writes, 0);
  assert.deepEqual(handled.done.counts, { success: 0, failure: 1 });
  await closed(f, beginClose(f)); assert.equal(f.pendingCloses, 1);
});

scenario('closing before invalid receipt header drains the late pending owner exactly once', async () => {
  const f = fixture();
  const { handled, closing } = await lateReply(f,
    paymentError(f.pending, { headers: { 'PAYMENT-RESPONSE': '\r\n' } }));
  await closed(f, closing);
  assert.equal(f.pendingCloses, 1); assert.equal(handled.res.writes, 0);
});

scenario('reentrant close before reply serialization retains the same pending cleanup', async () => {
  const f = fixture();
  let closing;
  f.hook = () => {
    closing = beginClose(f);
    return paymentError(f.pending, { body: { unsupported: () => {} } });
  };
  const handled = dispatch(f);
  assert.equal(await handled.done.promise, false);
  await closed(f, closing);
  assert.equal(f.pendingCloses, 1); assert.equal(handled.res.writes, 0);
});

scenario('late pending close rejection preserves uncertain terminal state', async () => {
  const f = fixture();
  f.closeHook = () => Promise.reject(Error('DECLARED_CLOSE_FAILURE'));
  const { closing } = await lateReply(f,
    paymentError(f.pending, { body: { unsupported: () => {} } }));
  const s = await closed(f, closing);
  assert.equal(s.uncertain, true); assert.equal(f.pendingCloses, 1);
  await closed(f, beginClose(f)); assert.equal(f.pendingCloses, 1);
});

scenario('late pending close waits for its actual completion without a replacement', async () => {
  const f = fixture(), drain = deferred();
  f.closeHook = () => drain.promise;
  const { handled, closing } = await lateReply(f,
    paymentError(f.pending, { body: { unsupported: () => {} } }));
  let returned = false;
  closing.promise.then(() => { returned = true; });
  await f.closeEntered.promise;
  await Promise.resolve();
  assert.equal(returned, false);
  assert.equal(f.router.snapshot().phase, 'CLOSING');
  assert.equal(f.router.snapshot().pendingCloses, 1);
  assert.equal(f.pendingCloses, 1); assert.equal(handled.res.writes, 0);
  drain.resolve();
  await closed(f, closing);
  assert.equal(f.pendingCloses, 1);
});

scenario('a close-return contract violation is uncertain and does not invoke a thenable', async () => {
  const f = fixture(), thenable = {};
  Object.defineProperty(thenable, 'then', { get() { f.thenReads++; throw Error('FORBIDDEN_THEN'); } });
  f.closeHook = () => thenable;
  const { closing } = await lateReply(f,
    paymentError(f.pending, { body: { unsupported: () => {} } }));
  const s = await closed(f, closing);
  assert.equal(s.uncertain, true); assert.equal(f.thenReads, 0);
  assert.equal(f.pendingCloses, 1);
});

scenario('malformed open reply retains original context without another funding call', async () => {
  const f = fixture();
  f.hook = () => paymentError(f.pending, { body: { unsupported: () => {} } });
  const first = dispatch(f);
  assert.equal(await first.done.promise, false);
  assert.equal(first.res.statusCode, 503); assert.equal(f.pendingCloses, 0);
  assert.equal(f.router.snapshot().phase, 'OPEN');
  const replay = dispatch(f);
  assert.equal(await replay.done.promise, true);
  assert.equal(replay.res.statusCode, 503); assert.equal(f.calls, 1);
  assert.equal(f.pendingCloses, 0); assert.equal(f.resumes, 0);
  await closed(f, beginClose(f)); assert.equal(f.pendingCloses, 1);
});

scenario('valid open pending reply stays owned until explicit close', async () => {
  const f = fixture(), handled = dispatch(f);
  assert.equal(await handled.done.promise, true);
  assert.equal(handled.res.statusCode, 402); assert.equal(f.pendingCloses, 0);
  assert.equal(f.router.snapshot().phase, 'OPEN');
  await closed(f, beginClose(f), true); assert.equal(f.pendingCloses, 1);
});

scenario('late valid pending reply remains unwritten and is drained once', async () => {
  const f = fixture();
  let closing;
  f.hook = () => { closing = beginClose(f); return paymentError(f.pending); };
  const handled = dispatch(f);
  assert.equal(await handled.done.promise, false);
  await closed(f, closing);
  assert.equal(handled.res.writes, 0); assert.equal(f.pendingCloses, 1);
});

scenario('an unbound late pending owner is closed without retaining a payment slot', async () => {
  const f = fixture();
  const { handled, closing } = await lateReply(f, paymentError(f.pending), { header: null });
  await closed(f, closing);
  assert.equal(f.pendingCloses, 1); assert.equal(handled.res.writes, 0);
});

after(() => {
  assert.equal(completed, 10); assert.equal(fixtures.length, 10);
  assert.ok(fixtures.every(f => f.closed && f.pendingCloses === 1));
  console.log('# router-late-pending-close ' + JSON.stringify({
    kind: 'ROUTER_LATE_PENDING_CLOSE_DECLARED_CALLBACKS', version: 1,
    completedCases: completed, actualRouter: true, declaredCallbackSeamsOnly: true,
    SDK: 0, SQL: 0, nativeHttps: 0, sockets: 0, keys: 0, signatures: 0,
    nonceSearch: 0, payments: 0, realPrepare: 0, physicalResourceRelease: false,
    fullP1: 'NOT_ESTABLISHED',
  }));
});
