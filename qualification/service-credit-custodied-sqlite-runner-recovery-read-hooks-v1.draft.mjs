/*
 * CURRENT-BACKEND REQUALIFICATION SOURCE DRAFT / NOT_RUN.
 * Derived from retained recovery-read qualification SHA-256:
 * 63b81213158cc42e774fa212439a15d94491d0352868597abe0b91562ba1dee1.
 * That ce94-bound source and its earlier execution results remain historical.
 * This separate candidate pins the hook-preflight backend:
 * Git blob f7db3c5b5726067b2f994c6281ca82384cda16bd; SHA-256
 * bd55ed39fb465eab75b71819b30693290b6e12aded503d57fe206cab1fe506b6.
 * Scenario bodies, names and all resource/ownership/close boundaries are unchanged.
 * The dependency change requires its own execution evidence; prior PASS is not
 * current-graph qualification. One explicit selector 1 or 2; no discovery.
 * Requires a later reviewed manager launch, exact source/runtime pins, lease,
 * mount UUID, reservations and 10 GiB free floor plus allocations/reservations.
 * SPV_TASK_SCRATCH and its registered empty direct child
 * sqlite-recovery-read-fixtures (SPV_SQLITE_FIXTURE_ROOT) must already exist.
 * Independent APFS source clones only; no fallback, adoption, unlink or cleanup.
 * One NEW fixture/root/DB per selector, two total if each runs once.
 * Native slot cap 1; custody rows <=3; 2 MiB/file checks, not an OS quota.
 * Reserve before acquisition; uncertainty retains slot/reference and blocks raw
 * SQLite/reacquisition. Native close attempted once; root repeats observe cache.
 * Generated files/failures remain HOLD. No old DBs, SDK, real transport, keys,
 * signing, chain PREPARE/payment, replay, migration, restart or native faults.
 * Dummy Authorization is transport metadata only and never enters custody.
 * Same-process reopen and interface drain prove no durability/current authority.
 * Permission Model OFF preserves backend fchmod/fsync; flags/timeouts are not
 * an OS/network/lifetime guarantee. Cleanup never substitutes for body assertions.
 */
import test from 'node:test';
import { equal as q, deepEqual as same, ok, throws, notEqual as ne } from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
 chmodSync, closeSync, constants as FS, fstatSync, lstatSync, mkdtempSync,
 openSync, readSync, readdirSync, realpathSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';
import { setTimeout as delay, clearTimeout as cancelDelay } from 'node:timers';

q(process.argv.length, 3);
ok(/^[12]$/.test(process.argv[2]), 'EXACT_SELECTOR_REQUIRED');
q(process.versions.node, '24.19.0');
ok(process.execArgv.includes('--no-addons'));
ok(process.execArgv.includes('--disallow-code-generation-from-strings'));
q(process.execArgv.some(v => /^--(?:experimental-permission|permission|allow-fs)(?:=|-|$)/.test(v)), false);
const selector = Number(process.argv[2]), uid = BigInt(process.getuid());
const specs = [["../src/service-credit-custodied-http-client.js",9815,274,"757c7d472410676b61baf2a3cda73e493a26ca6343d4e4c0a2c3af1a9e6abb9c"],["../src/service-credit-custodied-request-owner.js",22965,635,"4dabb9c49179e9d6533f5c3066faf730fa6d7deb3c4407d132841c1de4183f85"],["../src/service-credit-http-execute-dispatch.js",27034,770,"254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b"],["../src/service-credit-custodied-sequential-runner-core.js",15208,478,"07b73745c1a85e049ea374f1fd054b75dba9c0cd46d64adf4cfe4d266c4bc5f1"],["../src/service-credit-original-request-custody-contract.js",9810,272,"8f4d40d017a89e9a064c411c8e076cb21a45b9fb787fda7a664246b7bd744083"],["../src/x402-wire.js",39886,934,"5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"],["../package.json",1413,40,"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"],["../src/service-credit-custodied-sqlite-http-client.js",17045,484,"1bf7e3d738b4f3f9e880e1ff5f99ee7eaf3df02c2e98f5993dd075eb0bbf4c7b"],["../src/service-credit-custodied-sqlite-sequential-runner.js",8658,225,"217f3cad1f74cf12cf34715618768ecaf59da716fa1cfeba4660ef738de0b184"],["../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",48095,1340,"bd55ed39fb465eab75b71819b30693290b6e12aded503d57fe206cab1fe506b6"]];
const guarded = new Map();
const stamp = s => [s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs];
for (const [relative, length, LF, hash] of specs) {
 const url = new URL(relative, import.meta.url), path = fileURLToPath(url);
 const pre = lstatSync(path, { bigint: true });
 ok(pre.isFile()); q(pre.isSymbolicLink(), false); q(pre.uid, uid);
 q(pre.nlink, 1n); q(pre.size, BigInt(length)); ok(length <= 65536);
 q(realpathSync(path), path); ok(FS.O_NOFOLLOW);
 const fd = openSync(path, FS.O_RDONLY | FS.O_NOFOLLOW);
 let bytes;
 try {
  same(stamp(fstatSync(fd, { bigint: true })), stamp(pre));
  bytes = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
   const count = readSync(fd, bytes, offset, length - offset, offset);
   ok(count > 0); offset += count;
  }
  q(readSync(fd, Buffer.alloc(1), 0, 1, length), 0);
  same(stamp(fstatSync(fd, { bigint: true })), stamp(pre));
 } finally { closeSync(fd); }
 same(stamp(lstatSync(path, { bigint: true })), stamp(pre));
 q(createHash('sha256').update(bytes).digest('hex'), hash);
 const text = bytes.toString('utf8');
 q(/[^\x00-\x7f]/.test(text), false); ok(text.endsWith('\n'));
 q(text.split('\n').length - 1, LF);
 guarded.set(relative.slice(3), { url: url.href, text });
}
q(specs.length, 10);
q(JSON.parse(guarded.get('package.json').text).type, 'module');
q(JSON.parse(guarded.get('package.json').text).engines.node, '>=24');
function directory(path) {
 q(typeof path, 'string');
 ok(path.length > 0 && path.length < 3800 && !path.includes('\0'));
 ok(isAbsolute(path)); q(resolve(path), path); q(realpathSync(path), path);
 const s = lstatSync(path, { bigint: true });
 ok(s.isDirectory()); q(s.isSymbolicLink(), false);
 q(s.uid, uid); q(s.mode & 0o7777n, 0o700n);
 return s;
}
const scratch = process.env.SPV_TASK_SCRATCH, scratchId = directory(scratch);
const fixtureRoot = process.env.SPV_SQLITE_FIXTURE_ROOT;
q(fixtureRoot, join(scratch, 'sqlite-recovery-read-fixtures'));
const fixtureId = directory(fixtureRoot);
q(fixtureId.dev, scratchId.dev); same(readdirSync(fixtureRoot), []);

// All ten graph/package DATA guards precede repository and SQLite imports.
const load = path => import(guarded.get(path).url);
const runnerModule = await load('src/service-credit-custodied-sqlite-sequential-runner.js');
const storeModule = await load('src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const custody = await load('src/service-credit-original-request-custody-contract.js');
const wire = await load('src/x402-wire.js');
const { DatabaseSync } = await import('node:sqlite');
const OPEN = runnerModule.openServiceCreditCustodiedSqliteSequentialRunner;
const CREATE = storeModule.createZenonFundingPayerRecoveryCustodySqliteStoreV2;
const STORE_CLOSE = Object.getOwnPropertyDescriptor(
 storeModule.ZenonFundingPayerRecoverySqliteStore.prototype, 'close').value;
const RAW_CLOSE = Object.getOwnPropertyDescriptor(DatabaseSync.prototype, 'close').value;
const SERIALIZE = custody.serializeOriginalServiceRequestCustody;
const PARSE = custody.parseOriginalServiceRequestCustody;
const CAPTURE = custody.captureOriginalServiceRequestCustody;
const APPLY = Reflect.apply, THEN = Promise.prototype.then;
const XP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const OP = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const RP = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const FUNDING = 'https://recovery-read.example.test/funding';
const SERVICE = 'https://recovery-read.example.test/service-credit/v1/execute';
const GRANT = 'grant.selected', HASH = 'a'.repeat(64);
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const REPLY = Buffer.from('{"ok":true,"resultCode":"accepted"}');
const fixtures = [], entries = [], observations = [], holds = [], timers = new Set();
let slot = null, bodyPassed = false;
function observe(p) {
 ok(types.isPromise(p)); q(Object.getPrototypeOf(p), Promise.prototype);
 const seen = APPLY(THEN, p, [
  value => ({ ok: true, value }), error => ({ ok: false, error }),
 ]);
 observations.push(seen);
 return seen;
}
async function wait(p) {
 let timer;
 const timeout = new Promise((yes, no) => {
  timer = delay(() => no(new Error('WAIT_TIMEOUT_OUTCOME_NOT_CANCELLED')), 2000);
  timers.add(timer);
 });
 try { return await Promise.race([p, timeout]); }
 finally { cancelDelay(timer); timers.delete(timer); }
}
async function pending(p) {
 let settled = false;
 APPLY(THEN, p, [() => { settled = true; }, () => { settled = true; }]);
 await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
 q(settled, false);
}
function errorCode(prefix, suffix) {
 return e => e instanceof TypeError && Object.isFrozen(e)
  && e.code === prefix + suffix && e.message === e.code
  && e.stack === 'TypeError: ' + e.code;
}
function closed() {
 q(slot, null, 'NATIVE_SLOT_REMAINS_HOLD'); q(holds.length, 0, 'UNKNOWN_REMAINS_HOLD');
}
function reserve(kind, f) {
 closed();
 const e = { kind, f, state: 'PENDING', handle: null, close: null,
  closeSeen: null, closeAttempted: false, closeReturned: false, tracked: null };
 entries.push(e); slot = e;
 return e;
}
function hold(e, error) {
 e.state = 'UNKNOWN'; holds.push(error);
}
function file(f, path) {
 const s = lstatSync(path, { bigint: true });
 ok(s.isFile()); q(s.isSymbolicLink(), false); q(s.uid, uid);
 q(s.dev, fixtureId.dev); q(s.nlink, 1n); q(s.mode & 0o7777n, 0o600n);
 ok(s.size <= 2097152n); q(realpathSync(path), path);
 if (path === f.path) {
  if (f.id === null) f.id = [s.dev, s.ino];
  else same([s.dev, s.ino], f.id);
 }
 return s;
}
function files(f) {
 const d = directory(f.root); same([d.dev,d.ino], f.rootId);
 const names = readdirSync(f.root); ok(names.length <= 2);
 ok(names.includes('custody.sqlite'));
 for (const name of names) {
  ok(name === 'custody.sqlite' || name === 'custody.sqlite-journal');
  file(f, join(f.root, name));
 }
}
function closeNative(e) {
 q(slot, e); q(e.closeAttempted, false); e.closeAttempted = true;
 try {
  q(APPLY(e.kind === 'store' ? STORE_CLOSE : RAW_CLOSE, e.handle, []), undefined);
  e.closeReturned = true; e.state = 'CLOSED'; slot = null;
 } catch (error) { hold(e, error); throw error; }
}
function native(f, kind, construct, body) {
 const e = reserve(kind, f);
 try { e.handle = construct(); e.state = 'OPEN'; }
 catch (error) { hold(e, error); throw error; }
 const errors = []; let result;
 try { result = body(e.handle); } catch (error) { errors.push(error); }
 finally {
  try { closeNative(e); } catch (error) { errors.push(error); }
  try { files(f); } catch (error) { errors.push(error); }
 }
 if (errors.length) throw new AggregateError(errors, 'NATIVE_OPERATION_OR_CLOSE_FAILED');
 return result;
}
function raw(f, body) {
 closed(); files(f);
 return native(f, 'raw', () => new DatabaseSync(f.path, {
  allowExtension: false, enableDoubleQuotedStringLiterals: false,
  enableForeignKeyConstraints: true, readOnly: true, timeout: 0,
 }), body);
}
function view(f) {
 return raw(f, db => {
  const all = sql => db.prepare(sql).all().map(row => ({ ...row }));
  const meta = all('SELECT * FROM payer_recovery_meta');
  const funding = all('SELECT * FROM payer_recovery_state');
  const policy = all('SELECT * FROM original_request_custody_policy');
  const rows = all('SELECT * FROM original_service_requests ORDER BY grant_id,request_id LIMIT 4');
  q(meta.length, 1); q(funding.length, 1); q(policy.length, 1); ok(rows.length <= 3);
  q(db.prepare('PRAGMA user_version').get().user_version, 2);
  q(db.prepare('PRAGMA application_id').get().application_id, 0x5a505252);
  return { meta, funding, policy, rows, schema: all(
   "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name") };
 });
}
class Handle {
 #listeners = new Map();
 fixtureClosed = false;
 destroyCalls = 0;
 on(name, listener) {
  const list = this.#listeners.get(name) ?? [];
  ok(list.length < 8); list.push(listener); this.#listeners.set(name, list);
  return this;
 }
 emit(name, ...args) {
  for (const fn of (this.#listeners.get(name) ?? []).slice()) fn(...args);
 }
 destroy(...args) { q(args.length, 0); this.destroyCalls++; return this; }
 forceClose() {
  if (this.fixtureClosed) return;
  this.fixtureClosed = true; this.emit('close');
 }
}
class Request extends Handle {
 endCalls = 0;
 writeCalls = 0;
 end(...args) { q(args.length, 0); this.endCalls++; return this; }
 write() { this.writeCalls++; throw new Error('BODY_WRITE_FORBIDDEN'); }
}
class Response extends Handle {
 statusCode = 200;
 complete = false;
 rawHeaders = ['Cache-Control','private, no-store, max-age=0',
  'Content-Type','application/json','Vary','Authorization',
  'X-Content-Type-Options','nosniff','Content-Length',String(REPLY.length)];
}
const FORCE = Handle.prototype.forceClose, EMIT = Handle.prototype.emit;
function original(requestId = 'request.saved', cost = 7) {
 return { grantId: GRANT, requestId, originalRequestJson: JSON.stringify({
  modelVersion: 1, grantId: GRANT, requestId, method: 'POST',
  routeId: 'service-credit.execute.v1', canonicalBodyDigest: EMPTY,
  selectedContentType: 'application/json', maxCostUnits: cost,
 }), originalBodyBase64: '', serviceResourceUrl: SERVICE };
}
const key = value => ({ grantId: value.grantId, requestId: value.requestId });
function submission(id, cost) {
 const value = original(id, cost);
 const declared = { grantId: GRANT, maxCostUnits: cost, proofVersion: 1,
  publicKey: 'declared-public-key', requestId: id, signature: 'declared-signature-' + id };
 return { ...value, authorizationHeader: 'ServiceCredit '
  + Buffer.from(JSON.stringify(declared)).toString('base64url') };
}
function pair() {
 const req = { scheme: 'exact', network: 'zenon:testnet', asset: 'declared-test-asset',
  amount: '1', payTo: 'declared-test-payee', maxTimeoutSeconds: 30,
  extra: { poc: true, settlement: 'account-block', paymentFlow: 'upfront',
   zenonChain: { version: 1, chainIdentifier: '42', genesisMomentumHash: '1'.repeat(64) } } };
 const required = { x402Version: 2, resource: { url: FUNDING }, accepts: [req] };
 const payload = { x402Version: 2, resource: { url: FUNDING }, accepted: req,
  payload: { transaction: { hash: HASH }, intentDigest: '2'.repeat(64) } };
 return { challenge: { status: 'PAYMENT_REQUIRED', resourceUrl: FUNDING,
  paymentRequiredHeader: wire.encodeB64Json(required, { maxEncodedBytes: 8192 }),
  paymentRequired: required },
 paymentSignatureHeader: wire.encodeB64Json(payload, { maxEncodedBytes: 8192 }) };
}
function fixture() {
 closed(); q(fixtures.length, 0, 'ONE_ROOT_PER_SELECTOR');
 const root = mkdtempSync(join(fixtureRoot, 'recovery-read-' + selector + '-'));
 chmodSync(root, 0o700);
 const d = directory(root); q(d.dev, fixtureId.dev);
 const f = { root, path: join(root, 'custody.sqlite'), rootId: [d.dev,d.ino],
  id: null, calls: [], exchanges: [], prior: original(), saved: null, seed: null };
 fixtures.push(f);
 same(readdirSync(root), []);
 f.policy = { policyVersion: 1, maxRequests: 3, serviceResourceUrl: SERVICE };
 f.requestImpl = function (url, options, onResponse) {
  q(this, undefined); q(arguments.length, 3); q(f.calls.length, 0);
  f.calls.push({ url, options });
  const x = { request: new Request(), response: new Response(), onResponse };
  f.exchanges.push(x);
  return x.request;
 };
 return f;
}
function seed(f) {
 const declared = pair();
 native(f, 'store', () => CREATE({ databasePath: f.path, allowedRoot: f.root,
  resourceUrl: FUNDING, custodyPolicy: f.policy }), handle => {
  handle.prepare(declared);
  handle.fenceAttempt('PREPARED');
  const bound = handle.finishAttempt('BOUND');
  q(bound.revision, 3); q(bound.status, 'BOUND'); q(bound.ambiguityLatched, false);
  q(bound.challengeHeader, declared.challenge.paymentRequiredHeader);
  q(bound.paymentHeader, declared.paymentSignatureHeader);
  q(bound.paymentPayload.payload.transaction.hash, HASH);
  f.saved = handle.retainOriginalRequest(f.prior);
 });
 f.seed = view(f); q(f.seed.meta[0].owner_epoch, 1);
 q(f.seed.rows.length, 1); q(f.seed.rows[0].envelope, SERIALIZE(f.saved));
}
function assertRecord(record, value) {
 same(Object.keys(record), ['custodyVersion','profile','originalRequestJson',
  'originalBodyBase64','serviceResourceUrl','fundingResourceUrl','paymentHash',
  'network','grantId','requestId','checksum']);
 ok(Object.isFrozen(record)); q(types.isPromise(record), false);
 for (const d of Object.values(Object.getOwnPropertyDescriptors(record))) {
  ok(Object.hasOwn(d, 'value')); q(d.writable, false); q(d.configurable, false);
  q(d.enumerable, true);
 }
 q(record.originalRequestJson, value.originalRequestJson);
 q(record.originalBodyBase64, ''); q(record.serviceResourceUrl, SERVICE);
 q(record.fundingResourceUrl, FUNDING); q(record.paymentHash, HASH);
 q(record.network, 'zenon:testnet'); q(record.grantId, GRANT);
 q(record.requestId, value.requestId);
 const expected = CAPTURE({ originalRequestJson: value.originalRequestJson,
  originalBodyBase64: '', serviceResourceUrl: SERVICE },
 { fundingResourceUrl: FUNDING, paymentHash: HASH, network: 'zenon:testnet' });
 q(SERIALIZE(record), SERIALIZE(expected)); same(PARSE(SERIALIZE(record)), record);
}
function api(e) {
 same(Object.keys(e.handle), ['runOriginals','readOriginal','close','snapshot']);
 ok(Object.isFrozen(e.handle));
 for (const value of Object.values(e.handle)) { q(typeof value, 'function'); ok(Object.isFrozen(value)); }
 e.run = e.handle.runOriginals; e.read = e.handle.readOriginal; e.closeFn = e.handle.close;
}
async function open(f) {
 const e = reserve('root', f);
 try {
  const promise = OPEN({ databasePath: f.path, allowedRoot: f.root,
   fundingResourceUrl: FUNDING, custodyPolicy: f.policy, selectedGrantId: GRANT,
   requestImpl: f.requestImpl, deadlineMs: 2000 });
  e.tracked = APPLY(THEN, observe(promise), [r => {
   if (r.ok) { e.handle = r.value; e.state = 'OPEN'; }
   else hold(e, r.error);
   return r;
  }]);
  observe(e.tracked);
 } catch (error) { hold(e, error); throw error; }
 const result = await wait(e.tracked);
 if (!result.ok) throw result.error;
 api(e);
 return e;
}
function beginClose(e) {
 if (e.close === null) {
  e.closeAttempted = true;
  try { e.close = e.closeFn(); e.closeSeen = observe(e.close); }
  catch (error) { hold(e, error); throw error; }
 }
 q(e.handle.close(), e.close);
 return e.close;
}
async function endClose(e) {
 try {
  beginClose(e);
  const result = await wait(e.closeSeen);
  if (!result.ok) throw result.error;
  const v = e.handle.snapshot();
  q(result.value, undefined);
  q(v.resource.phase, 'RELEASED'); q(v.resource.slotHeld, false);
  q(v.resource.storeCloseAttempts, 1); q(v.resource.storeCloseOutcome, 'RETURNED');
  q(v.resource.admissionClosed, true); q(v.close.outcome, 'DRAINED');
  q(v.close.childOutcome, 'FULFILLED'); q(v.close.childUncertainty, false);
  q(v.close.unknownUndrained, false); q(v.runner.closeCalls, 1); q(slot, e);
  e.closeReturned = true; e.state = 'CLOSED'; slot = null;
  files(e.f);
  return v;
 } catch (error) { hold(e, error); throw error; }
}
function idle(e, f) {
 const v = e.handle.snapshot();
 q(v.runner.runClaimed, false); q(v.runner.planned, 0);
 q(v.runner.attempted, 0); q(v.runner.queuedReferences, 0);
 q(v.runner.client.lastTransport, null); q(f.calls.length, 0);
 q(v.runner.client.owner.active, false);
 q(v.runner.client.owner.trackedRequests, 0);
 q(v.runner.client.owner.counts.retainCalls, 0);
 q(v.runner.client.owner.counts.dispatchCalls, 0);
 q(v.runner.client.owner.recoveryAuthority, 'NONE');
 q(e.handle.runOriginals, e.run); q(e.handle.readOriginal, e.read);
 q(e.handle.close, e.closeFn);
}
function assertView(f, epoch, values) {
 const v = view(f);
 same(v.schema, f.seed.schema); same(v.funding, f.seed.funding);
 same(v.policy, f.seed.policy);
 same(v.meta, [{ ...f.seed.meta[0], owner_epoch: epoch }]);
 q(v.rows.length, values.length);
 for (const value of values) {
  const row = v.rows.find(r => r.grant_id === value.grantId && r.request_id === value.requestId);
  ok(row); q(row.funding_singleton, 1); q(row.payment_hash, HASH);
  q(row.network, 'zenon:testnet'); q(row.service_resource_url, SERVICE);
  assertRecord(PARSE(row.envelope), value);
  for (const text of ['ServiceCredit ', 'declared-public-key', 'declared-signature'])
   q(row.envelope.includes(text), false);
 }
 q(v.rows.find(r => r.request_id === f.prior.requestId).envelope, SERIALIZE(f.saved));
 return v;
}
const groups = [
 ['owned runner reads retained original across same-process reopen without dispatch', async () => {
  const f = fixture(); seed(f);
  for (const epoch of [2,3]) {
   const e = await open(f), record = e.read(key(f.prior));
   assertRecord(record, f.prior); same(record, f.saved);
   q(SERIALIZE(record), f.seed.rows[0].envelope);
   q(e.read({ grantId: GRANT, requestId: 'request.missing' }), null);
   idle(e, f);
   const before = e.handle.snapshot();
   for (const bad of [null, {}, { grantId: GRANT, requestId: '' },
    { grantId: GRANT, requestId: f.prior.requestId, extra: true }])
    throws(() => e.read(bad), errorCode(OP, 'INVALID_INPUT'));
   throws(() => e.read({ grantId: 'grant.foreign', requestId: f.prior.requestId }),
    errorCode(OP, 'FOREIGN_GRANT'));
   throws(() => e.read(), errorCode(XP, 'INVALID_INPUT'));
   throws(() => e.read(key(f.prior), undefined), errorCode(XP, 'INVALID_INPUT'));
   same(e.handle.snapshot(), before);
   same(before.runner.client.owner.counts, { loadReads: 3, recordReads: 2,
    retainCalls: 0, readbackConfirmations: 0, dispatchCalls: 0, callbackCompletions: 0 });
   const closing = beginClose(e);
   throws(() => e.read(key(f.prior)), errorCode(XP, 'CLOSED'));
   q(e.handle.close(), closing);
   const ended = await endClose(e);
   q(ended.runner.client.lastTransport, null); q(f.calls.length, 0);
   throws(() => e.read(key(f.prior)), errorCode(XP, 'CLOSED'));
   const after = assertView(f, epoch, [f.prior]);
   same(after.rows, f.seed.rows);
  }
 }],
 ['runner read fences busy callback and manual close without replaying queued work', async () => {
  const f = fixture(); seed(f);
  const e = await open(f);
  assertRecord(e.read(key(f.prior)), f.prior); idle(e, f);
  const batch = [submission('request.active', 8), submission('request.queued', 9)];
  const operation = e.run(batch), outcome = observe(operation);
  q(e.handle.runOriginals(batch), operation);
  q(f.calls.length, 1); q(f.exchanges.length, 1);
  const x = f.exchanges[0], active = e.handle.snapshot();
  q(active.runner.client.owner.active, true);
  q(active.runner.client.owner.phase, 'DISPATCH_PENDING');
  q(active.runner.runClaimed, true); q(active.runner.attempted, 1);
  q(active.runner.queuedReferences, 1);
  throws(() => e.read(key(f.prior)), errorCode(OP, 'BUSY'));
  same(e.handle.snapshot(), active); q(f.calls.length, 1);
  q(f.calls[0].url, SERVICE);
  same(f.calls[0].options, { method: 'POST',
   headers: { Authorization: batch[0].authorizationHeader }, agent: false,
   rejectUnauthorized: true, maxHeaderSize: 16384, insecureHTTPParser: false });
  ok(Object.isFrozen(f.calls[0].options)); ok(Object.isFrozen(f.calls[0].options.headers));
  q(x.request.endCalls, 1); q(x.request.writeCalls, 0);
  x.onResponse(x.response);
  const closing = beginClose(e), stopped = e.handle.snapshot();
  q(stopped.runner.closed, true); q(stopped.resource.admissionClosed, true);
  q(stopped.resource.phase, 'CLOSING'); q(stopped.resource.storeCloseAttempts, 0);
  q(stopped.runner.queuedReferences, 0); q(stopped.runner.closeCalls, 1);
  throws(() => e.read(key(f.prior)), errorCode(XP, 'CLOSED'));
  same(e.handle.snapshot(), stopped);
  q(e.handle.close(), closing); q(e.handle.runOriginals(batch), operation);
  x.response.complete = true;
  APPLY(EMIT, x.response, ['data', Buffer.from(REPLY)]);
  APPLY(EMIT, x.response, ['end']);
  APPLY(FORCE, x.request, []);
  await pending(closing); await pending(operation);
  q(e.handle.snapshot().resource.storeCloseAttempts, 0);
  APPLY(FORCE, x.response, []);
  const ended = await endClose(e), result = await wait(outcome);
  q(result.ok, false); ok(errorCode(RP, 'RUN_FAILED')(result.error));
  q(ended.runner.failure, 'CLOSE_REQUESTED'); q(ended.runner.completed, 1);
  q(ended.runner.notAttempted, 1); q(ended.runner.queuedReferences, 0);
  q(ended.unknown, false); q(ended.runner.client.owner.active, false);
  q(ended.runner.client.owner.counts.retainCalls, 1);
  q(ended.runner.client.owner.counts.dispatchCalls, 1);
  q(ended.runner.client.owner.counts.callbackCompletions, 1);
  q(ended.runner.client.lastTransport.timerArmed, false);
  q(f.calls.length, 1); q(x.request.writeCalls, 0);
  throws(() => e.read(key(f.prior)), errorCode(XP, 'CLOSED'));
  const after = assertView(f, 2, [f.prior, batch[0]]);
  q(after.rows.some(r => r.request_id === batch[1].requestId), false);
 }],
];
async function cleanup() {
 const errors = [];
 try {
  await wait(Promise.all(entries.filter(e => e.tracked).map(e => e.tracked)));
 } catch (error) { errors.push(error); }
 for (const e of entries) if (e.kind === 'root' && e.state === 'OPEN') {
  try { beginClose(e); } catch (error) { errors.push(error); }
 }
 for (const f of fixtures) for (const x of f.exchanges)
  for (const handle of [x.request,x.response]) {
   try { APPLY(FORCE, handle, []); } catch (error) { errors.push(error); }
  }
 for (const e of entries) if (e.kind === 'root' && e.state === 'OPEN') {
  try { await endClose(e); } catch (error) { errors.push(error); }
 }
 try { await wait(Promise.all(observations)); } catch (error) { errors.push(error); }
 for (const timer of timers) cancelDelay(timer);
 timers.clear();
 try {
  closed(); q(fixtures.length, 1); ok(bodyPassed, 'BODY_ASSERTIONS_NOT_COMPLETED');
  for (const e of entries) {
   q(e.state, 'CLOSED'); q(e.closeAttempted, true); q(e.closeReturned, true);
  }
  for (const f of fixtures) {
   files(f);
   for (const x of f.exchanges) {
    q(x.request.fixtureClosed, true); q(x.response.fixtureClosed, true);
   }
  }
  same(readdirSync(fixtureRoot), fixtures.map(f => f.root.slice(fixtureRoot.length + 1)));
  for (const [path,id] of [[scratch,scratchId],[fixtureRoot,fixtureId]]) {
   const now = directory(path); same([now.dev,now.ino], [id.dev,id.ino]);
  }
 } catch (error) { errors.push(error); }
 if (errors.length) throw new AggregateError(errors, 'CLEANUP_OR_UNKNOWN_HOLD');
}
q(groups.length, 2);
const [name, scenario] = groups[selector - 1];
test(name, { timeout: 10000 }, async t => {
 t.after(cleanup);
 await scenario();
 bodyPassed = true;
});
