// Selected SDK/SQL/socket-free deadline ownership cases. No actual native transport,
// TLS, SQLite, SDK, wallet/capability key, signer, nonce or application timer.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = 'qualification/service-credit-application-deadline-owner-core.behavior.draft.mjs';
const SPECS = [
  { path: 'package.json', bytes: 2677, LF: 40,
    sha256: 'cb4364b57d7918682d68dd00b10a5c35c26ec6af2118a0d70353df2f3324c65f' },
  { path: 'src/service-credit-application-deadline-owner-core.js', bytes: 9917, LF: 192,
    sha256: '27de310ebb7452e9be011e46d86e38b04614c259142bb47400ddbb9dedf00149' },
];
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0'); assert.equal(process.platform, 'darwin');
assert.equal(process.arch, 'arm64'); assert.equal(process.env.X402_DEADLINE_CORE_OPT_IN, 'sdk-sql-socket-free-deadline-owner-core-only');
const PINS = JSON.parse(process.env.X402_DEADLINE_CORE_PINS);
const sha = b => createHash('sha256').update(b).digest('hex');
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
function sources() {
  assert.equal(PINS.length, 3);
  assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p.path), ENTRY]);
  return PINS.map((p, index) => {
    const path = join(REPO, p.path), before = lstatSync(path, { bigint: true });
    assert.ok(before.isFile() && !before.isSymbolicLink()); assert.equal(before.nlink, 1n);
    assert.equal(before.uid, BigInt(process.getuid())); assert.deepEqual(ids(before), p.identity);
    const raw = readFileSync(path); assert.equal(raw.length, p.bytes); assert.equal(sha(raw), p.sha256);
    assert.equal(raw.filter(c => c === 10).length, p.LF);
    assert.deepEqual(ids(lstatSync(path, { bigint: true })), p.identity);
    if (index < SPECS.length) for (const k of ['path','bytes','LF','sha256']) assert.equal(p[k], SPECS[index][k]);
    return [p.path, p.bytes, p.sha256, p.identity];
  });
}
const before = sources();
const { createServiceCreditApplicationDeadlineOwnerCore: CREATE } = await import('../src/service-credit-application-deadline-owner-core.js');
const freeze = Object.freeze, PREFIX = 'SERVICE_CREDIT_APPLICATION_DEADLINE_CORE_';
const throws = (fn, kind) => assert.throws(fn, { code: PREFIX + kind });
const unknown = promise => assert.rejects(promise, { code: PREFIX + 'CLOSE_UNKNOWN' });
let constructed = 0;
function fixture(limits = {}) {
  const f = { records: [], arms: 0, cancels: 0, reads: 0, now: 100n,
    armOverride: null, cancelOverride: null, nowOverride: null, owner: null };
  f.config = { maxScheduleStarts: 8, maxConcurrentTimers: 4, maxDelayMs: 100, ...limits,
    armTimer(wake, delay) {
      f.arms++; const row = { wake, delay, handle: freeze({ index: f.records.length }) };
      f.records.push(row); return f.armOverride === null ? row.handle : f.armOverride(row);
    },
    cancelTimer(handle) { f.cancels++; if (f.cancelOverride !== null) return f.cancelOverride(handle); },
    readMonotonicTime() { f.reads++; return f.nowOverride === null ? f.now : f.nowOverride(); },
  };
  f.owner = CREATE(f.config); constructed++; return f;
}
const ingress = f => f.owner.ingressRuntime, service = f => f.owner.serviceRuntime;
const view = f => f.owner.snapshot(), fire = (f, index = 0) => f.records[index].wake();
function assertUnknown(f, active = 0) {
  assert.equal(view(f).phase, 'CLOSE_UNKNOWN'); assert.equal(view(f).unknown, true);
  assert.equal(view(f).activeTimers, active); assert.equal(view(f).closePromiseOutcome, 'CLOSE_UNKNOWN');
}
test('construction is inert and exposes frozen separated contracts', () => {
  const f = fixture(); assert.deepEqual([f.arms,f.cancels,f.reads], [0,0,0]);
  assert.equal(view(f).phase, 'OPEN'); assert.equal(view(f).nativeIoPerformed, false);
  for (const object of [f.owner, ingress(f), service(f), view(f)]) assert.ok(Object.isFrozen(object));
  assert.deepEqual([view(f).ingressCancelContract,view(f).serviceCancelContract], ['BOOLEAN','UNDEFINED']);
  assert.equal(view(f).authority, 'NONE'); assert.equal(view(f).physicalTimerDrain, 'NOT_ESTABLISHED');
});
test('empty close is cached, void and revokes new timers and clock reads', async () => {
  const f = fixture(), p = f.owner.close(); assert.equal(f.owner.close(), p);
  assert.equal(await p, undefined); assert.equal(view(f).phase, 'CLOSED');
  throws(() => ingress(f).schedule(() => {}, 1), 'UNAVAILABLE');
  throws(() => service(f).monotonicNowNs(), 'UNAVAILABLE'); assert.equal(f.arms, 0);
});
test('opaque tickets never reveal the actuator handle and duplicate wakes are inert', async () => {
  const f = fixture(); let calls = 0;
  const token = ingress(f).schedule(() => { calls++; }, 17);
  assert.ok(Object.isFrozen(token)); assert.deepEqual(Reflect.ownKeys(token), []);
  assert.notEqual(token, f.records[0].handle); assert.equal(f.records[0].delay, 17);
  fire(f); fire(f); assert.equal(calls, 1); assert.equal(view(f).activeTimers, 0);
  assert.equal(view(f).deliveredCallbacks, 1); await f.owner.close();
});
test('ingress cancel is idempotent boolean while service cancel is idempotent void', async () => {
  const f = fixture(), a = ingress(f).schedule(() => {}, 1), b = service(f).schedule(() => {}, 2);
  assert.equal(ingress(f).cancel(a), true); assert.equal(ingress(f).cancel(a), true);
  assert.equal(service(f).cancel(b), undefined); assert.equal(service(f).cancel(b), undefined);
  assert.equal(f.cancels, 2); assert.equal(view(f).cancelledTimers, 2); await f.owner.close();
});
test('cancel of fired tickets preserves each return contract without a second actuator call', async () => {
  const f = fixture(), a = ingress(f).schedule(() => {}, 1), b = service(f).schedule(() => {}, 1);
  fire(f, 0); fire(f, 1); assert.equal(ingress(f).cancel(a), true);
  assert.equal(service(f).cancel(b), undefined); assert.equal(f.cancels, 0); await f.owner.close();
});
test('kind mismatch and foreign-owner tickets never enter cancellation', async () => {
  const f = fixture(), g = fixture(), a = ingress(f).schedule(() => {}, 1);
  throws(() => service(f).cancel(a), 'INPUT_REJECTED'); throws(() => ingress(g).cancel(a), 'INPUT_REJECTED');
  assert.equal(f.cancels + g.cancels, 0); await f.owner.close(); await g.owner.close();
});
test('proxy and forged ticket rejection invokes no user trap', async () => {
  const f = fixture(); let traps = 0; const token = new Proxy({}, { get() { traps++; } });
  for (const bad of [token, {}, null, 1]) throws(() => ingress(f).cancel(bad), 'INPUT_REJECTED');
  assert.equal(traps, 0); assert.equal(f.cancels, 0); await f.owner.close();
});
test('concurrency refusal is inert and a completed slot can be reused', async () => {
  const f = fixture({ maxScheduleStarts: 3, maxConcurrentTimers: 1 });
  ingress(f).schedule(() => {}, 1);
  throws(() => service(f).schedule(() => {}, 1), 'UNAVAILABLE'); assert.equal(f.arms, 1);
  fire(f); service(f).schedule(() => {}, 1); assert.equal(f.arms, 2); await f.owner.close();
});
test('total arm budget cannot be reset by a completion or close', async () => {
  const f = fixture({ maxScheduleStarts: 1, maxConcurrentTimers: 1 });
  ingress(f).schedule(() => {}, 1); fire(f);
  throws(() => ingress(f).schedule(() => {}, 1), 'UNAVAILABLE');
  assert.equal(f.arms, 1); await f.owner.close(); assert.equal(f.arms, 1);
});
test('invalid delays and callback proxies do not consume the arm budget', async () => {
  const f = fixture(); let traps = 0; const fn = new Proxy(() => {}, { apply() { traps++; } });
  for (const delay of [0,-1,-0,0.5,NaN,Infinity,101,'1',1n])
    throws(() => ingress(f).schedule(() => {}, delay), 'INPUT_REJECTED');
  throws(() => ingress(f).schedule(fn, 1), 'INPUT_REJECTED');
  assert.equal(f.arms, 0); assert.equal(traps, 0); await f.owner.close();
});
test('monotonic reads accept equal bigint time without arming a timer', async () => {
  const f = fixture(); assert.equal(service(f).monotonicNowNs(), 100n);
  assert.equal(service(f).monotonicNowNs(), 100n); f.now = 101n;
  assert.equal(service(f).monotonicNowNs(), 101n); assert.equal(view(f).clockReads, 3);
  assert.equal(f.arms, 0); await f.owner.close();
});
test('a decreasing or invalid monotonic result latches UNKNOWN without coercion', async () => {
  for (const bad of [99n,-1n,0,NaN,'100',null,{}]) {
    const f = fixture(); service(f).monotonicNowNs(); f.now = bad;
    throws(() => service(f).monotonicNowNs(), 'CLOCK_UNKNOWN');
    throws(() => ingress(f).schedule(() => {}, 1), 'UNAVAILABLE');
    const p = f.owner.close(); await unknown(p); assertUnknown(f); assert.equal(f.arms, 0);
  }
});
test('a thrown clock read is not retried and close remains UNKNOWN', async () => {
  const f = fixture(); f.nowOverride = () => { throw Error('DECLARED_CLOCK_FAILURE'); };
  throws(() => service(f).monotonicNowNs(), 'CLOCK_UNKNOWN');
  throws(() => service(f).monotonicNowNs(), 'UNAVAILABLE'); assert.equal(f.reads, 1);
  await unknown(f.owner.close()); assertUnknown(f);
});
test('close from inside a clock read cannot be promoted by the returning value', async () => {
  const f = fixture(); let p;
  f.nowOverride = () => { p = f.owner.close(); return 100n; };
  throws(() => service(f).monotonicNowNs(), 'CLOCK_UNKNOWN');
  await p; assert.equal(view(f).phase, 'CLOSE_UNKNOWN'); assert.equal(view(f).unknown, true);
  assert.equal(view(f).closePromiseOutcome, 'CLOSED'); assert.equal(f.owner.close(), p);
});
test('close waits for an already delivering callback and never cancels its fired handle', async () => {
  const f = fixture(); let p, inside;
  ingress(f).schedule(() => {
    p = f.owner.close(); inside = view(f);
    assert.equal(inside.phase, 'CLOSING'); assert.equal(inside.deliveringCallbacks, 1);
    assert.equal(inside.closePromiseOutcome, 'PENDING');
  }, 1);
  fire(f); await p; assert.equal(view(f).phase, 'CLOSED'); assert.equal(f.cancels, 0);
});
test('close cancels every armed kind once and suppresses late cancelled wakes', async () => {
  const f = fixture(); let callbacks = 0;
  ingress(f).schedule(() => { callbacks++; }, 1); service(f).schedule(() => { callbacks++; }, 2);
  await f.owner.close(); fire(f, 0); fire(f, 1);
  assert.equal(callbacks, 0); assert.equal(f.cancels, 2); assert.equal(view(f).phase, 'CLOSED');
});
test('throwing delivered work keeps UNKNOWN and prevents later armed work', async () => {
  const f = fixture(); let second = 0;
  ingress(f).schedule(() => { throw Error('DECLARED_WORK_FAILURE'); }, 1);
  service(f).schedule(() => { second++; }, 1); fire(f, 0); fire(f, 1);
  assert.equal(second, 0); assert.equal(view(f).suppressedWakes, 1);
  await unknown(f.owner.close()); assertUnknown(f);
});
test('non-void callbacks are rejected without assimilating returned thenables', async () => {
  let gets = 0; const thenable = {};
  Object.defineProperty(thenable, 'then', { get() { gets++; throw Error('TRAP'); } });
  for (const result of [true,0,null,{},thenable]) {
    const f = fixture(); ingress(f).schedule(() => result, 1); fire(f);
    await unknown(f.owner.close()); assertUnknown(f);
  }
  assert.equal(gets, 0);
});
test('failed cancellation is not retried by repeated cancel or close', async () => {
  const f = fixture(); f.cancelOverride = () => { throw Error('DECLARED_CANCEL_FAILURE'); };
  const token = ingress(f).schedule(() => {}, 1);
  throws(() => ingress(f).cancel(token), 'CANCEL_UNKNOWN');
  throws(() => ingress(f).cancel(token), 'CANCEL_UNKNOWN');
  const p = f.owner.close(); await unknown(p); assert.equal(f.owner.close(), p);
  assert.equal(f.cancels, 1); assertUnknown(f, 1);
});
test('late wake after failed cancellation releases a held row but not the verdict', async () => {
  const f = fixture(); let work = 0; f.cancelOverride = () => { throw Error('DECLARED_CANCEL_FAILURE'); };
  ingress(f).schedule(() => { work++; }, 1);
  const p = f.owner.close(); await unknown(p); assertUnknown(f, 1);
  fire(f); assertUnknown(f); assert.equal(work, 0); assert.equal(f.cancels, 1); await unknown(p);
});
test('a non-void cancellation result is UNKNOWN and is never retried', async () => {
  const f = fixture(); f.cancelOverride = () => false; ingress(f).schedule(() => {}, 1);
  const p = f.owner.close(); await unknown(p); assertUnknown(f, 1);
  fire(f); assertUnknown(f); assert.equal(f.cancels, 1);
});
test('arm failure retains unknown ownership and a late wake cannot run work', async () => {
  const f = fixture(); let calls = 0; f.armOverride = () => { throw Error('DECLARED_ARM_FAILURE'); };
  throws(() => ingress(f).schedule(() => { calls++; }, 1), 'SCHEDULE_UNKNOWN');
  const p = f.owner.close(); await unknown(p); assertUnknown(f, 1); assert.equal(f.cancels, 0);
  fire(f); assertUnknown(f); assert.equal(calls, 0); assert.equal(f.arms, 1);
});
test('invalid actuator handles are not sent to cancellation or interpreted as success', async () => {
  for (const handle of [null,undefined,false,1,'handle',new Proxy({}, {})]) {
    const f = fixture(); f.armOverride = () => handle;
    throws(() => service(f).schedule(() => {}, 1), 'SCHEDULE_UNKNOWN');
    await unknown(f.owner.close()); assertUnknown(f, 1); assert.equal(f.cancels, 0);
    fire(f); assertUnknown(f);
  }
});
test('a synchronous premature wake is suppressed and the returned handle cleaned once', async () => {
  const f = fixture(); let work = 0; f.armOverride = row => { row.wake(); return row.handle; };
  throws(() => ingress(f).schedule(() => { work++; }, 1), 'SCHEDULE_UNKNOWN');
  assert.equal(work, 0); assert.equal(f.cancels, 1); assert.equal(view(f).prematureWakes, 1);
  await unknown(f.owner.close()); assertUnknown(f);
});
test('reentrant close during arm keeps UNKNOWN and cancels a subsequently known handle once', async () => {
  const f = fixture(); let p;
  f.armOverride = row => { p = f.owner.close(); return row.handle; };
  throws(() => ingress(f).schedule(() => {}, 1), 'SCHEDULE_UNKNOWN');
  await unknown(p); assertUnknown(f); assert.equal(f.cancels, 1); assert.equal(f.owner.close(), p);
});
test('close during cancellation waits without entering the actuator twice', async () => {
  const f = fixture(); let p, inside;
  f.cancelOverride = () => { p = f.owner.close(); inside = view(f); };
  const token = ingress(f).schedule(() => {}, 1);
  assert.equal(ingress(f).cancel(token), true); assert.equal(inside.phase, 'CLOSING');
  assert.equal(inside.closePromiseOutcome, 'PENDING'); await p;
  assert.equal(view(f).phase, 'CLOSED'); assert.equal(f.cancels, 1);
});
test('recursive cancel does not reenter the actuator or repair UNKNOWN', async () => {
  const f = fixture(); let token;
  f.cancelOverride = () => { ingress(f).cancel(token); };
  token = ingress(f).schedule(() => {}, 1);
  throws(() => ingress(f).cancel(token), 'CANCEL_UNKNOWN'); assert.equal(f.cancels, 1);
  await unknown(f.owner.close()); assertUnknown(f, 1); fire(f); assertUnknown(f);
});
test('mutating original configuration cannot replace captured callbacks or limits', async () => {
  const f = fixture(); f.config.maxScheduleStarts = 0;
  f.config.armTimer = () => { throw Error('REPLACED_ARM'); };
  f.config.cancelTimer = () => { throw Error('REPLACED_CANCEL'); };
  f.config.readMonotonicTime = () => { throw Error('REPLACED_CLOCK'); };
  ingress(f).schedule(() => {}, 1); assert.equal(service(f).monotonicNowNs(), 100n);
  await f.owner.close(); assert.deepEqual([f.arms,f.cancels,f.reads], [1,1,1]);
});
test('invalid public arities are rejected without capability calls', async () => {
  const f = fixture();
  for (const method of [f.owner.close,f.owner.snapshot,service(f).monotonicNowNs])
    throws(() => method(1), 'INPUT_REJECTED');
  for (const runtime of [ingress(f),service(f)]) {
    throws(() => runtime.schedule(() => {}), 'INPUT_REJECTED');
    throws(() => runtime.cancel(), 'INPUT_REJECTED');
  }
  assert.deepEqual([f.arms,f.cancels,f.reads], [0,0,0]); await f.owner.close();
});
test('configuration proxies, getters and callback proxies are rejected before invocation', async () => {
  const f = fixture(); let traps = 0;
  const proxy = new Proxy({}, { ownKeys() { traps++; }, getPrototypeOf() { traps++; } });
  throws(() => CREATE(proxy), 'INPUT_REJECTED');
  const getter = { ...f.config };
  Object.defineProperty(getter, 'armTimer', { enumerable: true, get() { traps++; } });
  throws(() => CREATE(getter), 'INPUT_REJECTED');
  const fn = new Proxy(() => {}, { apply() { traps++; } });
  throws(() => CREATE({ ...f.config, armTimer: fn }), 'INPUT_REJECTED');
  assert.equal(traps, 0); await f.owner.close();
});
test('invalid limit numbers and excess fields are rejected before any capability call', async () => {
  const f = fixture();
  for (const [key,value] of [['maxScheduleStarts',0],['maxScheduleStarts',65537],
    ['maxConcurrentTimers',0],['maxConcurrentTimers',1025],['maxConcurrentTimers',9],
    ['maxDelayMs',0],['maxDelayMs',2147483647],['maxDelayMs',-0],['maxDelayMs',1.5]]) {
    throws(() => CREATE({ ...f.config, [key]: value }), 'INPUT_REJECTED');
  }
  throws(() => CREATE({ ...f.config, extra: true }), 'INPUT_REJECTED');
  assert.deepEqual([f.arms,f.cancels,f.reads], [0,0,0]); await f.owner.close();
});
test('snapshots contain no actuator handles, callbacks or opaque ticket contents', async () => {
  const f = fixture(), secret = 'DECLARED_PRIVATE_HANDLE_TAG';
  f.armOverride = row => ({ ...row.handle, secret }); ingress(f).schedule(() => {}, 1);
  assert.equal(JSON.stringify(view(f)).includes(secret), false); assert.ok(Object.isFrozen(view(f)));
  assert.equal(view(f).nativeBinding, false); assert.equal(view(f).nativeIoPerformed, false);
  assert.equal(view(f).runtimeQualified, false); await f.owner.close();
});
after(() => {
  assert.deepEqual(sources(), before);
  console.log('# application-deadline-core-scope ' + JSON.stringify({
    kind: 'SDK_SQL_SOCKET_TIMER_FREE_APPLICATION_DEADLINE_OWNER_CORE',
    sourceInputs: before.length, constructedOwners: constructed, actualNativeBindingImports: 0,
    actualApplicationTimers: 0, sockets: 0, SQLiteConnections: 0, SDK: 0,
    keyGeneration: 0, signing: 0, nonceSearch: 0, newScratch: 0, NodeChildren: 0,
    realMonotonicClockReads: 0, trustedCallbacksInThisFixture: 'DECLARED_SYNTHETIC',
    fullP1: 'NOT_ESTABLISHED', nativeHostQualification: 'NOT_ESTABLISHED' }));
});

