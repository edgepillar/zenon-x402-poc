// Actual stream/session/lifecycle owners; native/key callbacks are declared.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { hrtime } from 'node:process';
import { setTimeout } from 'node:timers';
import { openBuyerFundingOwnedStreamSession as OPEN } from '../src/buyer-funding-owned-stream-session.js';
import { runBuyerOriginalCommandHost as HOST } from '../src/buyer-original-command-host.js';
import { encodeBuyerOriginalFundingCommand as ENCODE } from '../src/buyer-original-funding-command.js';
import { sdk105FundingServiceFixture as fixture } from './sdk105-funding-service-lifecycle.fixture.mjs';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_FUNDING_OWNED_STREAM_CONTROL, 'builtin-opening-budget');
const F = Object.freeze, tick = () => new Promise(resolve => setImmediate(resolve));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function gate() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(open) {
  const f = fixture(), input = new PassThrough();
  let opens = 0, stops = 0, writes = 0;
  const output = new Writable({ write(chunk, encoding, done) { writes++; done(); },
    destroy(error, done) { stops++; done(error); } });
  const opener = F(current => { opens++; return open ? open(f, current) : Promise.resolve(f.owner); });
  return { f, input, output, get opens() { return opens; }, get stops() { return stops; }, get writes() { return writes; },
    open(openWaitMs = 15) { return OPEN({ input, output, limits: { closeWaitMs: 40 }, openWaitMs, openClient: opener }); } };
}
async function refused(h, promise) {
  await assert.rejects(promise, /buyer_funding_owned_stream_open_refused/);
  assert.equal(h.input.closed, true); assert.equal(h.output.closed, true);
  assert.equal(h.stops, 1); assert.equal(h.writes, 0); assert.equal(h.opens, 1);
}
function noWork(f) {
  assert.equal(f.prepares + f.signs + f.commits + f.submits + f.handoffs + f.services, 0);
}
function block(ms) {
  const end = hrtime.bigint() + BigInt(ms) * 1000000n;
  while (hrtime.bigint() < end) {} // Deliberately demonstrates cooperative timing.
}
function timers() { return process.getActiveResourcesInfo().filter(x => x === 'Timeout').length; }

test('pending funding OPEN expires and stops its later returned client once without transfer', async () => {
  const g = gate(), h = harness(f => g.promise.then(() => f.owner)), opening = h.open();
  await refused(h, opening); noWork(h.f); assert.equal(h.f.clears + h.f.closes, 0);
  g.resolve(); await tick(); await tick();
  assert.equal(h.f.clears, 1); assert.equal(h.f.closes, 1); noWork(h.f);
  await assert.rejects(opening); assert.equal(h.stops, 1); assert.equal(h.writes, 0);
});

test('late client close rejection cannot change expired opening or repeat either stop', async () => {
  const g = gate(), h = harness(f => { f.onClose = () => Promise.reject(Error('PRIVATE_LATE_CLOSE'));
    return g.promise.then(() => f.owner); }), opening = h.open();
  await refused(h, opening); g.resolve(); await tick(); await tick();
  assert.equal(h.f.clears, 1); assert.equal(h.f.closes, 1); assert.equal(h.f.owner.inspect().held, true);
  await assert.rejects(opening); assert.equal(h.stops, 1); noWork(h.f);
});

test('late pending client stop remains retained after the owned channel has closed', async () => {
  const g = gate(), closing = gate(), h = harness(f => { f.onClose = () => closing.promise;
    return g.promise.then(() => f.owner); }), opening = h.open();
  await refused(h, opening); g.resolve(); await tick();
  assert.equal(h.f.clears, 1); assert.equal(h.f.closes, 1); assert.equal(h.f.owner.inspect().clientClose, 'PENDING');
  h.f.childLifecycle = 'CLOSED'; closing.resolve(undefined); await tick(); await tick();
  await assert.rejects(opening); assert.equal(h.f.closes, 1); assert.equal(h.stops, 1); noWork(h.f);
});

test('opening rejection after timeout is consumed without claiming an unreturned key stop', async () => {
  const g = gate(), h = harness(() => g.promise), opening = h.open();
  await refused(h, opening); g.reject(Error('PRIVATE_LATE_OPEN_REJECT')); await tick(); await tick();
  assert.equal(h.f.clears + h.f.closes, 0); noWork(h.f); await assert.rejects(opening);
  await h.f.owner.close();
});

test('synchronous native entry beyond deadline cannot transfer through the earlier Promise microtask', async () => {
  const h = harness(f => { block(70); return Promise.resolve(f.owner); });
  await refused(h, h.open(10)); await tick();
  assert.equal(h.f.clears, 1); assert.equal(h.f.closes, 1); noWork(h.f);
});

test('returned client inspection beyond the whole opening budget refuses before session transfer', async () => {
  const h = harness(f => {
    let first = true;
    return Promise.resolve(F({ ...f.owner, inspect: F(() => {
      if (first) { first = false; block(70); }
      return f.owner.inspect();
    }) }));
  });
  await refused(h, h.open(10));
  assert.equal(h.f.clears, 1); assert.equal(h.f.closes, 1); noWork(h.f);
});

test('successful transfer cancels the actual opening timer and retains ordinary session close', async () => {
  const h = harness(), before = timers(), session = await h.open(60000);
  assert.equal(timers(), before);
  h.input.end(ENCODE({ version: 1, id: 'close', operation: 'close', input: {} }));
  assert.equal((await HOST(session)).status, 'CLOSED');
  await tick(); assert.equal(timers(), before); assert.equal(h.f.closes, 1); assert.equal(h.f.clears, 1);
});

test('early OPEN rejection cancels its long acquisition timer before channel cleanup completes', async () => {
  const h = harness(() => Promise.reject(Error('PRIVATE_EARLY_OPEN'))), before = timers();
  await refused(h, h.open(60000)); await tick(); assert.equal(timers(), before);
  assert.equal(h.f.clears + h.f.closes, 0); await h.f.owner.close();
});

test('opening budget accessor is refused inertly before ownership or native entry', async () => {
  const h = harness(); let calls = 0;
  await assert.rejects(OPEN({ input: h.input, output: h.output, limits: {},
    openClient: F(() => { calls++; return Promise.resolve(h.f.owner); }),
    get openWaitMs() { calls++; throw Error('PRIVATE_BUDGET_GETTER'); } }));
  assert.equal(calls, 0); assert.equal(h.input.destroyed || h.output.destroyed, false);
  h.input.destroy(); h.output.destroy(); await h.f.owner.close();
});

test('noninteger out of range and negative-zero opening budgets leave all resources caller owned', async () => {
  const h = harness();
  for (const budget of [-0, 0, 60001, NaN, Infinity, 1.5, '20', null]) await assert.rejects(h.open(budget));
  assert.equal(h.opens, 0); assert.equal(h.input.destroyed || h.output.destroyed, false);
  assert.equal(h.f.clears + h.f.closes, 0); h.input.destroy(); h.output.destroy(); await h.f.owner.close();
});

test('throwing late returned-client stop cannot suppress channel closure or authorize a retry', async () => {
  const g = gate(); let stops = 0;
  const h = harness(f => g.promise.then(() => F({ ...f.owner,
    close: F(() => { stops++; throw Error('PRIVATE_LATE_THROW'); }) }))), opening = h.open();
  await refused(h, opening); g.resolve(); await tick(); await tick();
  assert.equal(stops, 1); assert.equal(h.f.clears + h.f.closes, 0); assert.equal(h.stops, 1);
  await assert.rejects(opening); noWork(h.f); await h.f.owner.close();
});

test('queued original commands cannot run or emit a result when native opening expires', async () => {
  const g = gate(), h = harness(f => g.promise.then(() => f.owner)), opening = h.open();
  h.input.end(ENCODE({ version: 1, id: 'prepare', operation: 'prepare', input: h.f.base.input }));
  await refused(h, opening); g.resolve(); await delay(5); await tick();
  noWork(h.f); assert.equal(h.writes, 0); assert.equal(h.f.clears, 1); assert.equal(h.f.closes, 1);
});

test('the fixed binding guard prevents fresh native acquisition after deferred module loading exceeds deadline', async () => {
  const g = gate(); let acquired = 0;
  const h = harness(async (f, current) => {
    assert.equal(Object.isFrozen(current), true); current();
    await g.promise; current(); acquired++; return f.owner;
  }), opening = h.open();
  await refused(h, opening); g.resolve(); await tick(); await tick();
  assert.equal(acquired, 0); assert.equal(h.f.clears + h.f.closes, 0); noWork(h.f);
  await h.f.owner.close();
});

test('deferred binding rechecks actual channel ownership before entering native acquisition', async () => {
  const g = gate(); let acquired = 0;
  const h = harness(async (f, current) => {
    current(); await g.promise; current(); acquired++; return f.owner;
  }), opening = h.open(1000);
  h.input.destroy(); await tick(); g.resolve();
  await refused(h, opening); assert.equal(acquired, 0); assert.equal(h.f.clears + h.f.closes, 0);
  noWork(h.f); await h.f.owner.close();
});
