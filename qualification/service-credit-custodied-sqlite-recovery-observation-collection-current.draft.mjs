/*
 * SQLITE OBSERVATION COLLECTION SOURCE DRAFT / NOT_RUN.
 * Exactly one selector ("1" or "2") per fresh Node 24.19.0 process.
 * Requires a prepared empty private root and exact caller source bindings.
 * Only synthetic V3 SQLite metadata is seeded. No transport, signer, injected
 * factory/fault or prototype hook is used. Seed history is not real funding.
 * Uncertain acquisition/close stays HOLD, without retry, repair or deletion.
 * Timeouts do not cancel native work. Loader/engine, pristine intrinsics,
 * cleared environment and source-to-import race freedom remain premises.
 * No OS/network sandbox, crash, durability, delivery or pilot claim is made.
 */
import test from 'node:test';
import { equal as q, deepEqual as same, ok, throws } from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
 closeSync, constants as FS, fstatSync, lstatSync, mkdirSync, openSync,
 readSync, readdirSync, realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';
import { setTimeout as delay, clearTimeout as cancelDelay } from 'node:timers';

q(process.argv.length, 3);
const selection = process.argv[2];
ok(selection === '1' || selection === '2');
q(process.versions.node, '24.19.0'); q(process.platform, 'darwin'); q(process.arch, 'arm64');
ok(process.execArgv.includes('--no-addons'));
ok(process.execArgv.includes('--disallow-code-generation-from-strings'));
q(process.execArgv.some(v => /^--(?:experimental-permission|permission|allow-fs)(?:=|-|$)/.test(v)), false);
const uid = BigInt(process.getuid()), APPLY = Reflect.apply, THEN = Promise.prototype.then;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const stamp = s => [s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs];
function fields(value, expected) {
 for (const key of Object.keys(expected)) same(value[key], expected[key], key);
}
function physical(path) {
 ok(typeof path === 'string' && path.length > 0 && path.length < 3800);
 ok(isAbsolute(path) && !path.includes('\0')); q(resolve(path), path);
 let at = path, depth = 0;
 for (;;) {
  ok(++depth < 128); const s = lstatSync(at, { bigint: true });
  ok(s.isDirectory()); q(s.isSymbolicLink(), false); q(realpathSync(at), at);
  const parent = dirname(at); if (parent === at) break; at = parent;
 }
 return lstatSync(path, { bigint: true });
}
function directory(path, device) {
 const s = physical(path); q(s.uid, uid); q(s.mode & 0o7777n, 0o700n);
 if (device !== undefined) q(s.dev, device);
 return s;
}
const scratch = process.env.SPV_TASK_SCRATCH, scratchId = directory(scratch);
const fixtureRoot = process.env.SPV_SQLITE_FIXTURE_ROOT;
q(fixtureRoot, join(scratch, 'sqlite-recovery-observation-collection-fixtures'));
const fixtureId = directory(fixtureRoot, scratchId.dev);
same(readdirSync(fixtureRoot), []);
fields(process.env, { PATH: '/usr/bin:/bin', LC_ALL: 'C', TMPDIR: fixtureRoot,
 SQLITE_TMPDIR: fixtureRoot, NODE_TEST_WORKER_ID: '1',
 __CF_USER_TEXT_ENCODING: '0x' + Number(uid).toString(16).toUpperCase() + ':0:0' });
same(Object.keys(process.env).sort(), ['PATH','LC_ALL','SPV_TASK_SCRATCH',
 'SPV_SQLITE_FIXTURE_ROOT','TMPDIR','SQLITE_TMPDIR','NODE_TEST_WORKER_ID',
 '__CF_USER_TEXT_ENCODING','SPV_SQLITE_SOURCE_BINDINGS_JSON'].sort());
function boundedBytes(path, cap, mode, dev) {
 q(realpathSync(path), path); const a = lstatSync(path, { bigint: true });
 ok(a.isFile()); q(a.isSymbolicLink(), false); q(a.uid, uid); q(a.dev, dev);
 q(a.nlink, 1n); q(a.mode & 0o7777n, BigInt(mode)); ok(a.size >= 0n && a.size <= BigInt(cap));
 const fd = openSync(path, FS.O_RDONLY | FS.O_NOFOLLOW), chunks = [];
 let total = 0;
 try {
  same(stamp(fstatSync(fd, { bigint: true })), stamp(a));
  for (;;) {
   const part = Buffer.alloc(Math.min(65536, cap - total + 1));
   const n = readSync(fd, part, 0, part.length, null); if (n === 0) break;
   total += n; ok(total <= cap); chunks.push(part.subarray(0, n));
  }
  same(stamp(fstatSync(fd, { bigint: true })), stamp(a));
 } finally { closeSync(fd); }
 same(stamp(lstatSync(path, { bigint: true })), stamp(a)); q(realpathSync(path), path);
 q(BigInt(total), a.size); return Buffer.concat(chunks);
}
const selfPath = fileURLToPath(import.meta.url), sourceRoot = dirname(dirname(selfPath));
const sourceId = physical(sourceRoot); q(sourceId.uid, uid); q(sourceId.mode & 0o022n, 0n);
const selfRelative = 'qualification/service-credit-custodied-sqlite-recovery-observation-collection-current.draft.mjs';
q(selfPath, join(sourceRoot, selfRelative));
const bindingsText = process.env.SPV_SQLITE_SOURCE_BINDINGS_JSON;
ok(typeof bindingsText === 'string' && bindingsText.length > 0 && bindingsText.length <= 16384);
const sourceBindings = JSON.parse(bindingsText);
q(Object.getPrototypeOf(sourceBindings), Object.prototype);
function sourceBytes(relative, cap) {
 const path = join(sourceRoot, relative), expected = sourceBindings[relative];
 ok(Array.isArray(expected)); q(expected.length, 8);
 for (const item of expected) ok(typeof item === 'string' && /^[0-9]+$/.test(item));
 const bytes = boundedBytes(path, cap, 0o644, sourceId.dev);
 same(stamp(lstatSync(path, { bigint: true })).map(String), expected);
 ok(bytes.every(v => v < 128) && bytes[bytes.length - 1] === 10);
 return bytes;
}
const self = sourceBytes(selfRelative, 32768);
ok(self.toString('ascii').startsWith('/*\n * SQLITE OBSERVATION COLLECTION SOURCE DRAFT / NOT_RUN.\n'));
const specs = [["src/service-credit-custodied-sqlite-http-client.js",18540,511,"ea16d6ac5ce72d6434c06e98c52c324daf918dd570f15997cdc21e501f677f4e"],["src/service-credit-custodied-sqlite-sequential-runner.js",21467,510,"9378a09dfd23c6ad5e093971d16c5aad62c19b5f3cce353bb199f037df64d7e0"],["src/service-credit-custodied-recovery-observation-collection-core.js",8579,213,"36b7cece2d436cbfcac5f4299dd6bd30e5eede6ebb2ebe769ae7bf3a6f1a72b4"],["src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",57459,1536,"9c925f241effbfec0bf014ff284e834c4d5679c4ea7224f83a6354cde6cffdaf"],["src/service-credit-http-execute-dispatch.js",27034,770,"254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b"],["src/service-credit-original-request-custody-contract.js",14051,356,"fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"],["src/service-credit-custodied-request-owner.js",35073,938,"6e7493a4859d48530820e68a4a19a513aad014ffc1048b42965a3ad36ae7c5f7"],["src/service-credit-custodied-http-client.js",10755,292,"ddbc54faf4a14d95e6274bc9df27b7b49db251bab67c11b871cfb2f9e78b4f15"],["src/service-credit-custodied-sequential-runner-core.js",15288,479,"36c99342bf9e47559e39535aefcde78acbbdd7fb210d42a77dbbb93c2fd9f8ff"],["src/x402-wire.js",39886,934,"5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"],["src/service-credit-pilot-client-plan.js",7483,181,"73ee3d739de85150039e733234cd0761c228d68de040d1e126902e808a259ac6"],["src/service-credit-pilot-status-view.js",3202,60,"cf3822d8b9ec4eb4772452ed1888b96d398fd87c1ead44cd155a5acc1a6b66ed"],["src/service-credit-custodied-recovery-collection-core.js",13794,306,"51d06da70ecccd0cf8b38d650367d1ae903ea86010a5ebeadb682af98e4b890b"],["package.json",1413,40,"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"]];
const guarded = new Map();
for (const [relative, bytes, LF, hash] of specs) {
 const data = sourceBytes(relative, 65536), text = data.toString('ascii');
 q(data.length, bytes); q(sha(data), hash); q(text.split('\n').length - 1, LF);
 guarded.set(relative, { text, url: new URL('../' + relative, import.meta.url).href });
}
q(specs.length, 14); q(guarded.size, 14);
same(Object.keys(sourceBindings).sort(), [selfRelative, ...specs.map(v => v[0])].sort());
const metadata = JSON.parse(guarded.get('package.json').text);
fields(metadata, { type: 'module' }); q(metadata.engines.node, '>=24');
// These guards precede every repository and SQLite import.
const load = path => import(guarded.get(path).url);
const runnerModule = await load('src/service-credit-custodied-sqlite-sequential-runner.js');
const storeModule = await load('src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const custody = await load('src/service-credit-original-request-custody-contract.js');
const wire = await load('src/x402-wire.js');
const { DatabaseSync } = await import('node:sqlite');
const OPEN = runnerModule.openServiceCreditCustodiedSqliteSequentialRunnerV3;
const CREATE = storeModule.createZenonFundingPayerRecoveryDispatchIntentSqliteStoreV3;
const CAPTURE_PAIR = storeModule.captureZenonFundingPostV1PayerRecoveryPair;
const CAPTURE = custody.captureOriginalServiceRequestCustody;
const SERIALIZE = custody.serializeOriginalServiceRequestCustody;
const SERIALIZE_INTENT = custody.serializeOriginalServiceDispatchIntent;
const STORE_CLOSE = Object.getOwnPropertyDescriptor(
 storeModule.ZenonFundingPayerRecoverySqliteStore.prototype, 'close').value;
const RAW_CLOSE = Object.getOwnPropertyDescriptor(DatabaseSync.prototype, 'close').value;
const RP = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const XP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const FUNDING = 'https://observation.invalid/funding';
const SERVICE = 'https://observation.invalid/service-credit/v1/execute';
const GRANT = 'grant.sqlite.observation', HASH = 'a'.repeat(64);
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const KEYS = ['request.a','request.b'].map(requestId => ({ grantId: GRANT, requestId }));
const POLICY = { policyVersion: 1, maxRequests: 2, serviceResourceUrl: SERVICE };
const INPUTS = KEYS.map(key => ({
 originalRequestJson: JSON.stringify({ modelVersion: 1, ...key,
  method: 'POST', routeId: 'service-credit.execute.v1', canonicalBodyDigest: EMPTY,
  selectedContentType: 'application/json', maxCostUnits: 7 }),
 originalBodyBase64: '', serviceResourceUrl: SERVICE,
}));
function pairInput() {
 const requirement = { scheme: 'exact', network: 'zenon:testnet', asset: 'declared-test-asset',
  amount: '1', payTo: 'declared-test-payee', maxTimeoutSeconds: 30,
  extra: { poc: true, settlement: 'account-block', paymentFlow: 'upfront',
   zenonChain: { version: 1, chainIdentifier: '42', genesisMomentumHash: '1'.repeat(64) } } };
 const required = { x402Version: 2, resource: { url: FUNDING }, accepts: [requirement] };
 const payload = { x402Version: 2, resource: { url: FUNDING }, accepted: requirement,
  payload: { transaction: { hash: HASH }, intentDigest: '2'.repeat(64) } };
 return { challenge: { status: 'PAYMENT_REQUIRED', resourceUrl: FUNDING,
  paymentRequiredHeader: wire.encodeB64Json(required, { maxEncodedBytes: 8192 }),
  paymentRequired: required },
 paymentSignatureHeader: wire.encodeB64Json(payload, { maxEncodedBytes: 8192 }) };
}
const DECLARED = pairInput(), PAIR = CAPTURE_PAIR(DECLARED, FUNDING);
const ORIGINALS = INPUTS.map(input => CAPTURE(input, {
 fundingResourceUrl: FUNDING, paymentHash: HASH, network: 'zenon:testnet' }));
const ENVELOPES = ORIGINALS.map(original => SERIALIZE(original));
const digest = (domain, text) => 'sha256:' + createHash('sha256').update(domain)
 .update('\0').update(text, 'utf8').digest('hex');
const EXPECTED_INTENT = custody.captureOriginalServiceDispatchIntent(ORIGINALS[0], {
 fundingRevision: 5,
 challengeDigest: digest('zenon-x402:payer-recovery-challenge-v1', PAIR.challengeHeader),
 paymentDigest: digest('zenon-x402:payer-recovery-payment-v1', PAIR.paymentHeader),
 custodyPolicy: POLICY,
});
const INTENT_JSON = SERIALIZE_INTENT(EXPECTED_INTENT);
const FUNDING_VIEW = { revision: 5, status: 'BOUND', ambiguityLatched: true,
 fundingResourceUrl: FUNDING, paymentHash: HASH, network: 'zenon:testnet' };
const UNCERTAINTY = { custody: false, submission: false, undrained: false,
 declaredFundingAmbiguitySeen: true };
const observation = (index, fundingStatus, serviceStatus) => JSON.stringify({
 viewVersion: 1, paymentHash: HASH, requestId: KEYS[index].requestId, fundingStatus, serviceStatus });
const INITIAL = KEYS.map((key, index) => ({ ...key,
 observationJson: observation(index, 'UNKNOWN', 'OUTCOME_UNKNOWN') }));
const INITIAL_JSON = JSON.stringify(INITIAL);
const SUCCESS = observation(0, 'INCLUDED', 'SUCCEEDED');
const fixtures = [], entries = [], collections = [], observations = [], holds = [];
const timers = new Set();
let slot = null, requestCalls = 0, bodyPassed = false;
function requestImpl() { requestCalls++; throw new Error('REQUEST_IMPL_CALL_FORBIDDEN'); }
function errorCode(prefix, suffix) {
 return error => error instanceof TypeError && Object.isFrozen(error)
  && error.code === prefix + suffix && error.message === error.code
  && error.stack === 'TypeError: ' + error.code;
}
function clearSlot() { q(slot, null, 'NATIVE_SLOT_REMAINS_HOLD'); q(holds.length, 0, 'UNKNOWN_REMAINS_HOLD'); }
function reserve(kind, f) {
 clearSlot();
 const entry = { kind, f, state: 'ACQUIRING', handle: null,
  closeAttempted: false, closeReturned: false, closeView: null };
 entries.push(entry); slot = entry; return entry;
}
function hold(entry) {
 if (entry.state !== 'UNKNOWN') holds.push(entry);
 entry.state = 'UNKNOWN';
}
function observe(promise) {
 ok(types.isPromise(promise)); q(Object.getPrototypeOf(promise), Promise.prototype);
 const seen = APPLY(THEN, promise, [
  value => ({ ok: true, value }), error => ({ ok: false, error }),
 ]);
 observations.push(seen); return seen;
}
async function wait(promise) {
 let timer;
 const timeout = new Promise((yes, no) => {
  timer = delay(() => no(new Error('WAIT_TIMEOUT_OUTCOME_NOT_CANCELLED')), 2000);
  timers.add(timer);
 });
 try { return await Promise.race([promise, timeout]); }
 finally { cancelDelay(timer); timers.delete(timer); }
}
function fixture() {
 clearSlot(); q(fixtures.length, 0);
 const root = join(fixtureRoot, 'selected-case-' + selection);
 throws(() => lstatSync(root), error => error.code === 'ENOENT');
 mkdirSync(root, { mode: 0o700 }); const id = directory(root, fixtureId.dev);
 const f = { root, path: join(root, 'custody.sqlite'), rootId: [id.dev,id.ino],
  id: null, seed: null, final: null };
 fixtures.push(f); return f;
}
function files(f) {
 const d = directory(f.root, fixtureId.dev); same([d.dev,d.ino], f.rootId);
 const names = readdirSync(f.root).sort();
 ok(names.length >= 1 && names.length <= 2); ok(names.includes('custody.sqlite'));
 for (const name of names) {
  ok(name === 'custody.sqlite' || name === 'custody.sqlite-journal');
  const path = join(f.root, name), s = lstatSync(path, { bigint: true });
  ok(s.isFile()); q(s.isSymbolicLink(), false); q(s.uid, uid); q(s.dev, fixtureId.dev);
  q(s.nlink, 1n); q(s.mode & 0o7777n, 0o600n);
  ok(s.size <= 2097152n); q(realpathSync(path), path);
  if (name === 'custody.sqlite') {
   if (f.id === null) f.id = [s.dev,s.ino]; else same([s.dev,s.ino], f.id);
  }
 }
}
function native(f, kind, construct, body) {
 const e = reserve(kind, f);
 try { e.handle = construct(); e.state = 'OPEN'; }
 catch (error) { hold(e); throw error; }
 const errors = []; let result;
 try { result = body(e.handle); } catch (error) { errors.push(error); }
 finally {
  e.closeAttempted = true;
  try {
   q(APPLY(kind === 'seed' ? STORE_CLOSE : RAW_CLOSE, e.handle, []), undefined);
   if (kind !== 'seed') q(e.handle.isOpen, false);
   e.closeReturned = true; e.state = 'CLOSED'; e.handle = null; slot = null;
  } catch (error) { hold(e); errors.push(error); }
  if (e.state === 'CLOSED') {
   try { files(f); } catch (error) { errors.push(error); }
  }
 }
 if (errors.length) throw new AggregateError(errors, 'NATIVE_BODY_OR_CLOSE_FAILED');
 return result;
}
function persisted(f) {
 clearSlot(); files(f);
 const result = native(f, 'readonly', () => new DatabaseSync(f.path, {
  allowExtension: false, enableDoubleQuotedStringLiterals: false,
  enableForeignKeyConstraints: true, readOnly: true, timeout: 0,
 }), db => {
  const all = sql => db.prepare(sql).all().map(row => ({ ...row }));
  q(db.prepare('PRAGMA user_version').get().user_version, 3);
  q(db.prepare('PRAGMA application_id').get().application_id, 0x5a505252);
  const meta = all('SELECT * FROM payer_recovery_meta');
  const funding = all('SELECT * FROM payer_recovery_state');
  const policy = all('SELECT * FROM original_request_custody_policy');
  const originals = all('SELECT * FROM original_service_requests ORDER BY grant_id,request_id LIMIT 3');
  const intents = all('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id LIMIT 3');
  q(meta.length, 1); q(funding.length, 1); q(policy.length, 1);
  q(originals.length, 2); q(intents.length, 1);
  return { meta, funding, policy, originals, intents,
   schema: all("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name") };
 });
 same(readdirSync(f.root), ['custody.sqlite']);
 const bytes = boundedBytes(f.path, 2097152, 0o600, fixtureId.dev);
 result.databaseSHA256 = sha(bytes);
 return result;
}
function seed(f) {
 native(f, 'seed', () => CREATE({ databasePath: f.path, allowedRoot: f.root,
  resourceUrl: FUNDING, custodyPolicy: POLICY }), store => {
  const prepared = store.prepare(DECLARED);
  q(prepared.revision, 1); q(prepared.status, 'PREPARED'); q(prepared.ambiguityLatched, false);
  for (let i = 0; i < 2; i++) {
   q(SERIALIZE(store.retainOriginalRequest({ ...KEYS[i], ...INPUTS[i] })), ENVELOPES[i]);
  }
  q(store.fenceAttempt('PREPARED').revision, 2);
  const unknown = store.finishAttempt('OUTCOME_UNKNOWN');
  q(unknown.revision, 3); q(unknown.status, 'OUTCOME_UNKNOWN'); q(unknown.ambiguityLatched, true);
  q(store.fenceAttempt('OUTCOME_UNKNOWN').revision, 4);
  const bound = store.finishAttempt('BOUND');
  q(bound.revision, 5); q(bound.status, 'BOUND'); q(bound.ambiguityLatched, true);
  q(bound.challengeHeader, PAIR.challengeHeader); q(bound.paymentHeader, PAIR.paymentHeader);
  same(bound.paymentPayload, PAIR.paymentPayload);
  q(SERIALIZE_INTENT(store.fenceOriginalDispatchIntent(KEYS[0])), INTENT_JSON);
  q(store.getOriginalDispatchIntent(KEYS[1]), null);
  same(store.listOriginalRequestKeys(), KEYS);
 });
 f.seed = persisted(f); q(f.seed.meta[0].owner_epoch, 1);
 same(f.seed.originals.map(row => row.envelope), ENVELOPES);
 q(f.seed.intents[0].envelope, INTENT_JSON);
 q(f.seed.funding[0].revision, 5); q(f.seed.funding[0].status, 'BOUND');
 q(f.seed.funding[0].ambiguity_latched, 1);
}
function finalPersistence(f) {
 f.final = persisted(f);
 for (const field of ['schema','funding','policy','originals','intents']) same(f.final[field], f.seed[field]);
 same(f.final.meta, [{ ...f.seed.meta[0], owner_epoch: 2 }]);
}
async function openOwned(f) {
 const e = reserve('owned', f);
 try {
  const result = await wait(observe(OPEN({ databasePath: f.path, allowedRoot: f.root,
   fundingResourceUrl: FUNDING, custodyPolicy: POLICY, selectedGrantId: GRANT,
   requestImpl, deadlineMs: 2000 })));
  if (!result.ok) throw result.error;
  e.handle = result.value; e.state = 'OPEN';
 } catch (error) { hold(e); throw error; }
 ok(Object.isFrozen(e.handle));
 const factory = e.handle.createOriginalRecoveryObservationCollection;
 q(typeof factory, 'function'); ok(Object.isFrozen(factory)); q(factory.length, 1);
 for (const value of Object.values(reads(e))) q(value, 0);
 return e;
}
async function closeOwned(e) {
 q(slot, e); q(e.state, 'OPEN'); q(e.closeAttempted, false);
 e.closeAttempted = true;
 try {
  const result = await wait(observe(e.handle.close()));
  if (!result.ok) throw result.error;
  q(result.value, undefined);
  const v = e.handle.snapshot();
  q(v.close.outcome, 'DRAINED'); q(v.close.childOutcome, 'FULFILLED');
  q(v.close.childUncertainty, false); q(v.close.unknownUndrained, false);
  q(v.resource.phase, 'RELEASED'); q(v.resource.slotHeld, false);
  q(v.resource.admissionClosed, true); q(v.resource.storeCloseAttempts, 1);
  q(v.resource.storeCloseOutcome, 'RETURNED');
  q(v.runner.closeCalls, 1); q(v.runner.closeOutcome, 'FULFILLED');
  q(v.unknown, false); q(v.unknownUndrained, false);
  e.closeView = v; e.closeReturned = true; e.state = 'CLOSED'; slot = null;
  return v;
 } catch (error) { hold(e); throw error; }
}
const reads = e => e.handle.snapshot().runner.client.owner.counts;
function advanced(e, before, loadReads, recordReads, intentReads) {
 same(reads(e), { ...before, loadReads: before.loadReads + loadReads,
  recordReads: before.recordReads + recordReads, intentReads: before.intentReads + intentReads });
}
function measured(e, operation, loadReads, recordReads, intentReads) {
 const before = reads(e), result = operation();
 advanced(e, before, loadReads, recordReads, intentReads); return result;
}
function idle(e) {
 const v = e.handle.snapshot(), owner = v.runner.client.owner;
 q(requestCalls, 0);
 fields(v.runner, { runClaimed: false, planned: 0, attempted: 0, completed: 0, queuedReferences: 0 });
 fields(v.runner.client, { lastTransport: null, boundEstablishesAuthority: false });
 fields(owner, { active: false, trackedRequests: 0, recoveryAuthority: 'NONE' });
 for (const key of ['retainCalls','readbackConfirmations','dispatchCalls','callbackCompletions',
  'intentWrites','intentReadbackConfirmations']) q(owner.counts[key], 0);
 q(v.qualification, 'UNQUALIFIED');
 for (const key of ['backend','actualPersistence','restart','currentAuthority',
  'realReady','serviceDelivery','osCleanup','pilot']) q(v[key], 'NOT_ESTABLISHED');
}
function deepFrozen(value, depth = 0) {
 ok(depth < 16);
 if (value === null || typeof value !== 'object') return;
 q(types.isPromise(value), false); q(types.isProxy(value), false); ok(Object.isFrozen(value));
 for (const d of Object.values(Object.getOwnPropertyDescriptors(value))) {
  ok(Object.hasOwn(d, 'value')); q(d.writable, false); q(d.configurable, false);
  deepFrozen(d.value, depth + 1);
 }
}
function powerless(value, authorityField = 'authority') {
 q(value.qualification, 'UNQUALIFIED'); q(value[authorityField], 'NONE');
 for (const field of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])
  q(value[field], false);
}
function complete(v, successful) {
 deepFrozen(v); powerless(v);
 fields(v, { collectionVersion: 1, observationCollectionVersion: 1, grantId: GRANT,
  keys: KEYS, funding: FUNDING_VIEW, uncertainty: UNCERTAINTY,
  currentFundingUncertain: false, observedFundingUncertain: false, closed: false,
  unavailable: false, failureKind: 'NONE', snapshotKind: 'COMPLETE_OWNED_READ',
  observationFailureKind: 'NONE', underlyingUnavailable: false, underlyingFailureKind: 'NONE',
  observationCloseOutcome: 'NOT_REQUESTED', childCloseOutcome: 'NOT_REQUESTED',
  childCloseAttempts: 0, nextStep: 'RECONCILIATION_REQUIRED',
  evidence: 'OWNED_LOCAL_CATALOG_BOUND_RECOVERY_OBSERVATION_COLLECTION' });
 q(v.entries.length, 2);
 for (let i = 0; i < 2; i++) {
  const entry = v.entries[i], p = entry.recoveryPlan, s = p.recoveryState, d = p.declaredPlan;
  same(entry.key, KEYS[i]); q(SERIALIZE(s.original), ENVELOPES[i]);
  fields(s, { original: ORIGINALS[i], funding: FUNDING_VIEW, uncertainty: UNCERTAINTY,
   dispatchIntent: i === 0 ? EXPECTED_INTENT : null,
   dispatchStatus: i === 0 ? 'POSSIBLY_ATTEMPTED' : 'NO_INTENT_RECORDED',
   evidence: 'LOCAL_STORE_DECLARED_RECOVERY_STATE', qualification: 'UNQUALIFIED',
   authority: 'NONE', serviceOutcome: 'NOT_ESTABLISHED' });
  powerless(p);
  fields(p, { closed: false, currentFundingUncertain: false, observedFundingUncertain: false,
   nextStep: i === 0 ? 'RECONCILIATION_REQUIRED' : 'REVIEW_HISTORICAL_FUNDING_AMBIGUITY',
   evidence: 'OWNED_LOCAL_RECOVERY_BOUND_PLAN' });
  powerless(d, 'authorization');
  fields(d, { closed: false, paymentHash: HASH, requestId: KEYS[i].requestId,
   originalIdentityJson: JSON.stringify({ viewVersion: 1, paymentHash: HASH, requestId: KEYS[i].requestId }),
   observationJson: successful && i === 0 ? SUCCESS : INITIAL[i].observationJson,
   fundingUncertain: true, serviceUncertain: true,
   terminal: successful && i === 0 ? 'SUCCEEDED' : null,
   nextStep: 'RECONCILE_FUNDING_AND_REQUEST' });
  q(d.view.evidence, 'DECLARED_DATA_ONLY');
 }
 return v;
}
function wrongKeys(e, c) {
 const before = reads(e), root = e.handle.snapshot();
 for (const key of [
  { grantId: GRANT, requestId: 'request.absent' },
  { grantId: 'grant.foreign', requestId: KEYS[0].requestId },
 ]) throws(() => c.observeOriginal(key, SUCCESS),
  errorCode(RP, 'RECOVERY_OBSERVATION_COLLECTION_MEMBER_NOT_FOUND'));
 same(reads(e), before); same(e.handle.snapshot(), root);
}
function makeCollection(e) {
 const before = reads(e);
 const api = e.handle.createOriginalRecoveryObservationCollection(INITIAL_JSON);
 const record = { e, api, closeAttempted: false, historical: null }; collections.push(record);
 advanced(e, before, 20, 10, 6);
 ok(Object.isFrozen(api)); same(Object.keys(api), ['observeOriginal','getSnapshot','close']);
 for (const fn of Object.values(api)) { q(typeof fn, 'function'); ok(Object.isFrozen(fn)); }
 return record;
}
function detach(record, last, adverse) {
 const { e, api } = record, before = reads(e), root = e.handle.snapshot();
 q(record.closeAttempted, false); record.closeAttempted = true;
 const history = api.close(); record.historical = history;
 deepFrozen(history); powerless(history);
 for (const key of ['keys','entries','funding','uncertainty']) q(history[key], last[key]);
 fields(history, { closed: true, unavailable: adverse,
  failureKind: adverse ? 'LIVE_READ_FAILED' : 'NONE',
  observationFailureKind: adverse ? 'PRE_OBSERVE_REFRESH_FAILED' : 'NONE',
  underlyingUnavailable: adverse, underlyingFailureKind: adverse ? 'LIVE_READ_FAILED' : 'NONE',
  childCloseOutcome: 'RETURNED', childCloseAttempts: 2, observationCloseOutcome: 'RETURNED',
  snapshotKind: 'DETACHED_HISTORICAL', nextStep: 'LOCALLY_CLOSED' });
 q(api.close(), history); q(api.getSnapshot(), history);
 throws(() => api.observeOriginal(KEYS[0], SUCCESS),
  errorCode(RP, 'RECOVERY_OBSERVATION_COLLECTION_CLOSED'));
 wrongKeys(e, api); same(reads(e), before); same(e.handle.snapshot(), root);
 return history;
}
const cases = [
 ['actual SQLite observation collection updates one member and detaches without closing its owner', async () => {
  const f = fixture(); seed(f); const e = await openOwned(f);
  const record = makeCollection(e), c = record.api;
  const initial = complete(measured(e, () => c.getSnapshot(), 8, 4, 2), false);
  wrongKeys(e, c);
  const good = complete(measured(e, () => c.observeOriginal(KEYS[0], SUCCESS), 18, 9, 5), true);
  same(good.entries[1], initial.entries[1]);
  same(good.funding, initial.funding); same(good.uncertainty, initial.uncertainty);
  wrongKeys(e, c);
  const last = complete(measured(e, () => c.getSnapshot(), 8, 4, 2), true);
  same(last, good); idle(e);
  const history = detach(record, last, false);
  q(e.handle.snapshot().resource.storeCloseAttempts, 0); q(e.handle.snapshot().runner.closeCalls, 0);
  q(e.handle.snapshot().resource.admissionClosed, false);
  // This genuine owned read proves the borrowed runner/store remains usable.
  same(measured(e, () => e.handle.readOriginalRecoveryState(KEYS[0]), 2, 1, 1),
   good.entries[0].recoveryPlan.recoveryState);
  idle(e); const before = reads(e); await closeOwned(e);
  q(c.getSnapshot(), history); q(c.close(), history); same(reads(e), before);
  idle(e); finalPersistence(f);
 }],
 ['actual SQLite observation collection preserves complete history after its owner closes', async () => {
  const f = fixture(); seed(f); const e = await openOwned(f), record = makeCollection(e), c = record.api;
  const last = complete(measured(e, () => c.getSnapshot(), 8, 4, 2), false);
  idle(e); const before = reads(e);
  await closeOwned(e); const root = e.handle.snapshot();
  // First valid observation fails at the real root's closed catalog gate.
  throws(() => c.observeOriginal(KEYS[0], SUCCESS), errorCode(XP, 'CLOSED'));
  same(reads(e), before);
  throws(() => c.getSnapshot(), errorCode(RP, 'RECOVERY_OBSERVATION_COLLECTION_UNAVAILABLE'));
  throws(() => c.observeOriginal(KEYS[0], SUCCESS),
   errorCode(RP, 'RECOVERY_OBSERVATION_COLLECTION_UNAVAILABLE'));
  wrongKeys(e, c); same(reads(e), before); same(e.handle.snapshot(), root);
  const history = detach(record, last, true);
  // A real unavailable read is distinct from an unobserved/UNKNOWN native close.
  q(history.childCloseOutcome, 'RETURNED'); q(root.resource.storeCloseOutcome, 'RETURNED');
  q(root.close.outcome, 'DRAINED'); q(root.unknown, false);
  for (const entry of history.entries) {
   q(entry.recoveryPlan.declaredPlan.terminal, null);
   q(entry.recoveryPlan.declaredPlan.observationJson, INITIAL[
    entry.key.requestId === KEYS[0].requestId ? 0 : 1].observationJson);
  }
  same(reads(e), before); same(e.handle.snapshot(), root); idle(e); finalPersistence(f);
 }],
];
q(cases.length, 2);
async function cleanup() {
 const errors = [];
 for (const record of collections) {
  if (!record.closeAttempted) {
   record.closeAttempted = true;
   try { record.historical = record.api.close(); } catch (error) { errors.push(error); }
  }
  if (record.historical === null || record.historical.childCloseOutcome !== 'RETURNED')
   errors.push(new Error('DIAGNOSTIC_DETACH_REMAINS_HOLD'));
 }
 if (slot !== null && slot.kind === 'owned' && slot.state === 'OPEN' && !slot.closeAttempted) {
  try { await closeOwned(slot); } catch (error) { errors.push(error); }
 }
 try { clearSlot(); } catch (error) { errors.push(error); }
 if (slot === null && holds.length === 0) {
  try { await wait(Promise.all(observations)); } catch (error) { errors.push(error); }
  for (const f of fixtures) {
   try { files(f); same(readdirSync(f.root), ['custody.sqlite']); }
   catch (error) { errors.push(error); }
  }
 }
 for (const e of entries) {
  if (e.state !== 'CLOSED' || !e.closeReturned)
   errors.push(new Error('NATIVE_ENTRY_REMAINS_HOLD'));
 }
 for (const timer of timers) cancelDelay(timer);
 timers.clear();
 if (errors.length) throw new AggregateError(errors, 'QUALIFICATION_PRESERVED_NOT_DRAINED');
}
test(cases[Number(selection) - 1][0], { timeout: 12000 }, async t => {
 const errors = [];
 try { await cases[Number(selection) - 1][1](); bodyPassed = true; }
 catch (error) { errors.push(error); }
 finally { try { await cleanup(); } catch (error) { errors.push(error); } }
 if (errors.length) throw new AggregateError(errors, 'SELECTED_SQLITE_OBSERVATION_NOT_QUALIFIED');
 q(bodyPassed, true); clearSlot(); q(requestCalls, 0); q(timers.size, 0);
 q(fixtures.length, 1); q(entries.length, 4); q(collections.length, 1);
 q(entries.filter(e => e.kind === 'owned').length, 1);
 const owned = entries.find(e => e.kind === 'owned'), f = fixtures[0];
 idle(owned); q(owned.closeAttempted, true); q(owned.closeReturned, true);
 t.diagnostic(JSON.stringify({ selection, authoredAssertionsPassed: true, newRoots: 1, requestCalls,
  actualOwnedSQLite: true, collectionChildCloseAttempts: collections[0].historical.childCloseAttempts,
  ownedReads: reads(owned), rootCloseCalls: owned.closeView.runner.closeCalls,
  storeCloseAttempts: owned.closeView.resource.storeCloseAttempts,
  storeCloseOutcome: owned.closeView.resource.storeCloseOutcome,
  rootCloseOutcome: owned.closeView.close.outcome, nativeEntriesReturned: entries.length,
  persistedFundingOriginalsIntentsAndPolicyUnchanged: true,
  seedDatabaseSHA256: f.seed.databaseSHA256, finalDatabaseSHA256: f.final.databaseSHA256,
  evidence: 'OWNED_LOCAL_SQLITE_OBSERVATION_COLLECTION',
  qualification: 'UNQUALIFIED', authority: 'NONE', serviceOutcome: 'NOT_ESTABLISHED' }));
});
