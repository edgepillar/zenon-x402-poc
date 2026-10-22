// Selected V5 response-observation store component; TWO new private synthetic SQLite files only.
// Declared response DATA is not an authenticated receipt, delivery proof, retry grant or quarantine clear.
// No transport, SDK, key, signature, payment, forced kill or live pilot. Existing V4 controls are selected, not a suite.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ENTRY = "qualification/service-credit-response-observation-store-v5.behavior.draft.mjs";
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
const SPECS = [
  [
    "src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    76152,
    1904,
    "3b77ec2e17293f9cc0de75147c84c50aa34563e6bcfb1917da06a4ecb3f3b2c9"
  ],
  [
    "src/service-credit-original-request-custody-contract.js",
    14051,
    356,
    "fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"
  ],
  [
    "src/x402-wire.js",
    39886,
    934,
    "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"
  ],
  [
    "package.json",
    1413,
    40,
    "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
  ]
];
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0'); assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.P2_RESPONSE_OBSERVATION_V5_OPT_IN, 'synthetic-native-response-observation-v5-only');
const PINS = JSON.parse(process.env.P2_RESPONSE_OBSERVATION_V5_PINS), scratch = process.env.SPV_TASK_SCRATCH;
assert.equal(typeof scratch, 'string'); assert.equal(resolve(scratch), scratch);
const scratchStat = lstatSync(scratch, { bigint: true });
assert.ok(scratchStat.isDirectory() && !scratchStat.isSymbolicLink());
assert.equal(scratchStat.uid, BigInt(process.getuid())); assert.equal(scratchStat.mode & 0o777n, 0o700n);
const FILES = ['response-v5.sqlite', 'control-v4.sqlite'];
for (const name of FILES) assert.throws(() => lstatSync(join(scratch, name)), { code: 'ENOENT' });
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
const sha = b => createHash('sha256').update(b).digest('hex');
function sources() {
  assert.equal(PINS.length, 5); assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p[0]), ENTRY]);
  let total = 0;
  return PINS.map((p, index) => {
    const name = join(REPO, p.path), stat = lstatSync(name, { bigint: true });
    assert.ok(stat.isFile() && !stat.isSymbolicLink()); assert.equal(stat.uid, BigInt(process.getuid()));
    assert.equal(stat.nlink, 1n); assert.ok(stat.size > 0n && stat.size <= 131072n); assert.deepEqual(ids(stat), p.identity);
    const fd = openSync(name, constants.O_RDONLY | constants.O_NOFOLLOW), data = Buffer.alloc(Number(stat.size) + 1);
    let used = 0;
    try {
      assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
      while (used < data.length) { const n = readSync(fd, data, used, data.length - used, null); if (!n) break; used += n; }
      assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
    } finally { closeSync(fd); }
    assert.deepEqual(ids(lstatSync(name, { bigint: true })), p.identity); assert.equal(used, Number(stat.size));
    const raw = data.subarray(0, used); assert.equal(raw.includes(0), false); assert.equal(raw.some(c => c > 127), false);
    total += used; assert.ok(total <= 262144); assert.equal(sha(raw), p.sha256); assert.equal(raw.length, p.bytes);
    assert.equal(raw.filter(c => c === 10).length, p.LF);
    if (index < SPECS.length) assert.deepEqual([p.path, p.bytes, p.LF, p.sha256], SPECS[index]);
    return { path: p.path, bytes: p.bytes, sha256: p.sha256, identity: p.identity };
  });
}
const sourceBefore = sources();



const {
 createZenonFundingPayerRecoveryResponseObservationSqliteStoreV5: CREATE5,
 openZenonFundingPayerRecoveryResponseObservationSqliteStoreV5: OPEN5,
 createZenonFundingPayerRecoveryCustodyQuarantineSqliteStoreV4: CREATE4,
 openZenonFundingPayerRecoveryCustodyQuarantineSqliteStoreV4: OPEN4,
} = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const { DatabaseSync } = await import('node:sqlite');
const OPTIONS = { timeout: 5000, concurrency: false };
const FUNDING = 'https://response-observation.invalid/funding';
const SERVICE = 'https://response-observation.invalid/service-credit/v1/execute';
const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 4, serviceResourceUrl: SERVICE });
const ERROR = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_';
const A1 = Object.freeze({ grantId: 'grant-a', requestId: 'first' });
const A2 = Object.freeze({ grantId: 'grant-a', requestId: 'second' });
const A3 = Object.freeze({ grantId: 'grant-a', requestId: 'not-dispatched' });
const B1 = Object.freeze({ grantId: 'grant-b', requestId: 'foreign' });
const GA = Object.freeze({ grantId: A1.grantId }), GB = Object.freeze({ grantId: B1.grantId });
const HASH = 'a'.repeat(64), EMPTY = 'sha256:' + sha(Buffer.alloc(0));
const RESPONSE = '{"ok":true,"resultCode":"observed-one"}';
const f = { store: null, stage: 0, returnedCloses: 0, inputRefusals: 0, conflictRefusals: 0,
 missingIntentRefusals: 0, quarantineWriteRefusals: 0, disabledRefusals: 0, versionRefusals: 0,
 corruptOpenRefusals: 0, getterCalls: 0, corrupt: false, fundingText: null, originalTexts: [], intentTexts: [],
 observationText: null, foreignObservationText: null, quarantineText: null, last: null };
function freeze(x) {
 if (x !== null && typeof x === 'object') { for (const v of Object.values(x)) freeze(v); Object.freeze(x); }
 return x;
}
function frozen(x) {
 if (x !== null && typeof x === 'object') { assert.ok(Object.isFrozen(x)); for (const v of Object.values(x)) frozen(v); }
}
function canonical(x) {
 if (x === null || typeof x !== 'object') return JSON.stringify(x);
 if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
 return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
}
const config = file => ({ databasePath: join(scratch, file), allowedRoot: scratch, resourceUrl: FUNDING, custodyPolicy: POLICY });
function request(key) {
 return { modelVersion: 1, ...key, method: 'POST', routeId: 'service-credit.execute.v1',
 canonicalBodyDigest: EMPTY, selectedContentType: 'application/json', maxCostUnits: 1 };
}
function retain(key) {
 return { ...key, originalRequestJson: JSON.stringify(request(key)), originalBodyBase64: '', serviceResourceUrl: SERVICE };
}
function pairInput() {
 const requirement = { scheme: 'exact', network: 'zenon:testnet', asset: 'synthetic-asset',
 amount: '1', payTo: 'synthetic-payee', maxTimeoutSeconds: 30,
 extra: { poc: true, settlement: 'account-block', paymentFlow: 'upfront', minimumMomentumConfirmations: 2,
 zenonChain: { version: 1, chainIdentifier: '42', genesisMomentumHash: '1'.repeat(64) } } };
 const required = { x402Version: 2, resource: { url: FUNDING }, accepts: [requirement] };
 const payload = { x402Version: 2, resource: { url: FUNDING }, accepted: requirement,
 payload: { transaction: { hash: HASH }, intentDigest: '2'.repeat(64) } };
 return freeze({ challenge: { status: 'PAYMENT_REQUIRED', resourceUrl: FUNDING,
 paymentRequiredHeader: Buffer.from(JSON.stringify(required)).toString('base64'), paymentRequired: required },
 paymentSignatureHeader: Buffer.from(JSON.stringify(payload)).toString('base64') });
}
const PAIR = pairInput();
function prepare(store) {
 store.prepare(PAIR); store.fenceAttempt('PREPARED'); assert.equal(store.finishAttempt('BOUND').revision, 3);
}
function closeStore() {
 assert.notEqual(f.store, null); const owned = f.store;
 assert.equal(owned.close(), undefined); f.returnedCloses++; assert.equal(owned.close(), undefined); f.store = null;
}
function fails(fn, suffix) { assert.throws(fn, { code: ERROR + suffix }); }
function observation(key, responseJson = RESPONSE) { return { ...key, responseJson }; }
function checkRecord(record, key, resultCode = 'observed-one') {
 frozen(record); assert.equal(record.responseObservationVersion, 1);
 assert.equal(record.scope, 'LOCAL_DECLARED_HTTP_SUCCESS_RESPONSE');
 assert.equal(record.grantId, key.grantId); assert.equal(record.requestId, key.requestId);
 assert.equal(record.paymentHash, HASH); assert.equal(record.network, 'zenon:testnet');
 assert.equal(record.fundingResourceUrl, FUNDING); assert.equal(record.fundingRevision, 3);
 assert.deepEqual(record.custodyPolicy, POLICY); assert.equal(record.responseJson, JSON.stringify({ ok: true, resultCode }));
 assert.equal(record.resultCode, resultCode); assert.equal(record.status, 'DECLARED_SUCCESS_RESPONSE_OBSERVED');
 assert.equal(record.authority, 'NONE'); assert.equal(record.serviceDelivery, 'NOT_ESTABLISHED');
 for (const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed']) assert.equal(record[k], false);
 for (const k of ['originalDigest','dispatchIntentDigest','challengeDigest','paymentDigest','checksum']) assert.match(record[k], /^sha256:[0-9a-f]{64}$/);
 const { checksum, ...core } = record;
 const expected = 'sha256:' + createHash('sha256').update('zenon-x402:original-response-observation-v1').update('\0').update(canonical(core)).digest('hex');
 assert.equal(checksum, expected);
 for (const k of ['authorizationHeader','privateKey','clear','reset','resend']) assert.equal(Object.hasOwn(record, k), false);
}
function immutableBindings(store) {
 assert.equal(canonical(store.load()), f.fundingText);
 for (let i = 0; i < 4; i++) assert.equal(canonical(store.getOriginalRequest([A1,A2,A3,B1][i])), f.originalTexts[i]);
 for (let i = 0; i < 3; i++) assert.equal(canonical(store.getOriginalDispatchIntent([A1,A2,B1][i])), f.intentTexts[i]);
}
function stamp(file) {
 assert.equal(f.store, null); assert.ok(FILES.includes(file));
 const path = join(scratch, file), st = lstatSync(path, { bigint: true });
 assert.ok(st.isFile() && !st.isSymbolicLink()); assert.equal(st.uid, BigInt(process.getuid()));
 assert.equal(st.dev, scratchStat.dev); assert.equal(st.nlink, 1n); assert.equal(st.mode & 0o777n, 0o600n);
 const db = new DatabaseSync(path, { readOnly: true, allowExtension: false,
 enableDoubleQuotedStringLiterals: false, enableForeignKeyConstraints: true, timeout: 0 });
 try {
 const version = db.prepare('PRAGMA user_version').get().user_version;
 return {
 epoch: db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch,
 meta: db.prepare('SELECT singleton,resource_url FROM payer_recovery_meta ORDER BY singleton').all(),
 state: db.prepare('SELECT * FROM payer_recovery_state ORDER BY singleton').all(),
 policy: db.prepare('SELECT * FROM original_request_custody_policy ORDER BY singleton').all(),
 originals: db.prepare('SELECT * FROM original_service_requests ORDER BY grant_id,request_id').all(),
 intents: db.prepare('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id').all(),
 quarantines: db.prepare('SELECT * FROM original_custody_quarantines ORDER BY grant_id').all(),
 observations: version === 5 ? db.prepare('SELECT * FROM original_response_observations ORDER BY grant_id,request_id').all() : [],
 schema: db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
 userVersion: version, applicationId: db.prepare('PRAGMA application_id').get().application_id,
 };
 } finally { db.close(); }
}
function filePin(file) {
 const path = join(scratch, file), st = lstatSync(path, { bigint: true });
 assert.ok(st.isFile() && !st.isSymbolicLink()); assert.equal(st.uid, BigInt(process.getuid()));
 assert.equal(st.nlink, 1n); assert.ok(st.size > 0n && st.size <= 131072n);
 const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW), b = Buffer.alloc(Number(st.size) + 1); let used = 0;
 try {
 assert.deepEqual(ids(fstatSync(fd, { bigint: true })), ids(st));
 while (used < b.length) { const n = readSync(fd, b, used, b.length - used, null); if (!n) break; used += n; }
 assert.deepEqual(ids(fstatSync(fd, { bigint: true })), ids(st));
 } finally { closeSync(fd); }
 assert.equal(used, Number(st.size)); assert.deepEqual(ids(lstatSync(path, { bigint: true })), ids(st));
 return { file, bytes: used, sha256: sha(b.subarray(0, used)), identity: ids(st) };
}
function diagnostic(t, scenario) {
 assert.equal(f.store, null); assert.equal(f.getterCalls, 0);
 t.diagnostic(JSON.stringify({ kind: 'P2_RESPONSE_OBSERVATION_V5', version: 1, scenario,
 nativeSqliteFiles: f.stage >= 3 ? 2 : 1, returnedStoreCloses: f.returnedCloses,
 inputRefusals: f.inputRefusals, conflictRefusals: f.conflictRefusals, missingIntentRefusals: f.missingIntentRefusals,
 quarantineWriteRefusals: f.quarantineWriteRefusals, disabledProfileRefusals: f.disabledRefusals,
 versionRefusals: f.versionRefusals, corruptOpenRefusals: f.corruptOpenRefusals, corruptionInjected: f.corrupt,
 authority: 'NONE', networkCalls: 0, syntheticSignatureOperations: 0, realPaymentSigner: 'DISABLED',
 serviceDelivery: 'NOT_ESTABLISHED', httpOwnerV5Adopted: false }));
}
after(() => {
 try { if (f.store !== null) closeStore(); }
 finally { assert.deepEqual(sources(), sourceBefore); }
 assert.equal(f.stage, 4);
});

test('V5 observations bind exact originals and intents without consuming or authorizing them', OPTIONS, t => {
 assert.equal(f.stage, 0); f.store = CREATE5(config(FILES[0])); prepare(f.store);
 for (const k of [A1,A2,A3,B1]) f.store.retainOriginalRequest(retain(k));
 for (const k of [A1,A2,B1]) f.store.fenceOriginalDispatchIntent(k);
 f.fundingText = canonical(f.store.load());
 f.originalTexts = [A1,A2,A3,B1].map(k => canonical(f.store.getOriginalRequest(k)));
 f.intentTexts = [A1,A2,B1].map(k => canonical(f.store.getOriginalDispatchIntent(k)));
 assert.equal(f.store.getOriginalResponseObservation(A1), null);
 assert.deepEqual(f.store.listUnobservedOriginalDispatchKeys(GA), [A1,A2]);
 assert.deepEqual(f.store.listUnobservedOriginalDispatchKeys(GB), [B1]);
 const first = f.store.recordOriginalResponseObservation(observation(A1)); checkRecord(first, A1);
 f.observationText = canonical(first);
 assert.equal(canonical(f.store.recordOriginalResponseObservation(observation(A1))), f.observationText);
 assert.deepEqual(f.store.listUnobservedOriginalDispatchKeys(GA), [A2]);
 const foreign = f.store.recordOriginalResponseObservation(observation(B1)); checkRecord(foreign, B1);
 f.foreignObservationText = canonical(foreign);
 assert.deepEqual(f.store.listUnobservedOriginalDispatchKeys(GB), []);
 const getter = observation(A2);
 Object.defineProperty(getter, 'responseJson', { enumerable: true, get() { f.getterCalls++; throw Error('forbidden getter'); } });
 const proxy = new Proxy(observation(A2), { ownKeys() { f.getterCalls++; throw Error('forbidden proxy'); } });
 for (const v of [getter,proxy,{ ...observation(A2), extra: true },
  observation(A2, '{"ok":true,"ok":true,"resultCode":"observed-one"}'),
  observation(A2, '{"ok":false,"resultCode":"observed-one"}')]) {
 fails(() => f.store.recordOriginalResponseObservation(v), 'INVALID_INPUT'); f.inputRefusals++;
 }
 fails(() => f.store.recordOriginalResponseObservation(observation(A1, '{"ok":true,"resultCode":"changed"}')), 'RESPONSE_OBSERVATION_CONFLICT'); f.conflictRefusals++;
 fails(() => f.store.recordOriginalResponseObservation(observation(A3)), 'INVALID_TRANSITION'); f.missingIntentRefusals++;
 immutableBindings(f.store); assert.equal(canonical(f.store.getOriginalResponseObservation(A1)), f.observationText);
 closeStore(); const s = stamp(FILES[0]);
 assert.equal(s.userVersion, 5); assert.equal(s.applicationId, 0x5a505252); assert.equal(s.epoch, 1);
 assert.equal(s.observations.length, 2); assert.equal(s.originals.length, 4); assert.equal(s.intents.length, 3);
 assert.equal(s.quarantines.length, 0); f.last = s; f.stage = 1;
 diagnostic(t, 'EXACT_INSERT_ONLY_DECLARED_RESPONSE_OBSERVATIONS');
});

test('V5 normal reopen retains observations while quarantine still refuses late success writes', OPTIONS, t => {
 assert.equal(f.stage, 1); const before = f.last;
 f.store = OPEN5(config(FILES[0])); immutableBindings(f.store);
 assert.equal(canonical(f.store.getOriginalResponseObservation(A1)), f.observationText);
 assert.equal(canonical(f.store.getOriginalResponseObservation(B1)), f.foreignObservationText);
 assert.deepEqual(f.store.listUnobservedOriginalDispatchKeys(GA), [A2]);
 const second = f.store.recordOriginalResponseObservation(observation(A2)); checkRecord(second, A2);
 assert.deepEqual(f.store.listUnobservedOriginalDispatchKeys(GA), []);
 fails(() => f.store.fenceOriginalDispatchIntent(A1), 'DISPATCH_INTENT_EXISTS');
 f.quarantineText = canonical(f.store.latchOriginalRequestCustodyQuarantine(GA));
 fails(() => f.store.recordOriginalResponseObservation(observation(A1)), 'CUSTODY_OUTCOME_UNKNOWN'); f.quarantineWriteRefusals++;
 assert.equal(canonical(f.store.getOriginalRequestCustodyQuarantine(GA)), f.quarantineText);
 assert.equal(canonical(f.store.getOriginalResponseObservation(A1)), f.observationText);
 assert.deepEqual(f.store.listUnobservedOriginalDispatchKeys(GA), []); // DATA only: quarantine still exists.
 immutableBindings(f.store); closeStore(); const s = stamp(FILES[0]);
 assert.equal(s.epoch, before.epoch + 1);
 for (const k of ['meta','state','policy','originals','intents','schema','userVersion','applicationId']) assert.deepEqual(s[k], before[k]);
 assert.equal(s.observations.length, 3); assert.equal(s.quarantines.length, 1);
 f.last = s; f.stage = 2; diagnostic(t, 'REOPEN_WITHOUT_INTENT_RESET_OR_QUARANTINE_CLEAR');
});

test('V4 remains a distinct profile and cross-version opens preserve exact closed file bytes', OPTIONS, t => {
 assert.equal(f.stage, 2); f.store = CREATE4(config(FILES[1])); prepare(f.store);
 f.store.retainOriginalRequest(retain(A1)); f.store.fenceOriginalDispatchIntent(A1);
 const q = canonical(f.store.latchOriginalRequestCustodyQuarantine(GA));
 for (const fn of [
 () => f.store.recordOriginalResponseObservation(observation(A1)),
 () => f.store.getOriginalResponseObservation(A1),
 () => f.store.listUnobservedOriginalDispatchKeys(GA),
 ]) { fails(fn, 'RESPONSE_OBSERVATION_NOT_ENABLED'); f.disabledRefusals++; }
 closeStore(); const before = stamp(FILES[1]), v4Pin = filePin(FILES[1]), v5Pin = filePin(FILES[0]);
 assert.equal(before.userVersion, 4); assert.equal(before.observations.length, 0);
 assert.equal(before.schema.some(r => r.name === 'original_response_observations'), false);
 fails(() => OPEN5(config(FILES[1])), 'SCHEMA_UNSUPPORTED'); f.versionRefusals++;
 assert.deepEqual(filePin(FILES[1]), v4Pin);
 fails(() => OPEN4(config(FILES[0])), 'SCHEMA_UNSUPPORTED'); f.versionRefusals++;
 assert.deepEqual(filePin(FILES[0]), v5Pin);
 f.store = OPEN4(config(FILES[1])); assert.equal(f.store.load().status, 'BOUND');
 assert.equal(canonical(f.store.getOriginalRequestCustodyQuarantine(GA)), q); closeStore();
 const after = stamp(FILES[1]); assert.equal(after.epoch, before.epoch + 1);
 for (const k of Object.keys(before).filter(k => k !== 'epoch')) assert.deepEqual(after[k], before[k]);
 f.stage = 3; diagnostic(t, 'V4_UNCHANGED_PROFILE_NO_ADOPTION_OR_MIGRATION');
});

test('V5 foreign observation corruption is refused before owner epoch advancement', OPTIONS, t => {
 assert.equal(f.stage, 3); const before = stamp(FILES[0]), v4Pin = filePin(FILES[1]);
 const db = new DatabaseSync(join(scratch, FILES[0]), { allowExtension: false,
 enableDoubleQuotedStringLiterals: false, enableForeignKeyConstraints: true, timeout: 0 });
 try {
 db.exec('PRAGMA synchronous = FULL');
 const changed = db.prepare('UPDATE original_response_observations SET envelope=? WHERE grant_id=? AND request_id=?').run('{}', B1.grantId, B1.requestId);
 assert.equal(changed.changes, 1);
 } finally { db.close(); }
 f.corrupt = true; const corruptPin = filePin(FILES[0]);
 fails(() => OPEN5(config(FILES[0])), 'CORRUPT'); f.corruptOpenRefusals++;
 assert.deepEqual(filePin(FILES[0]), corruptPin); assert.deepEqual(filePin(FILES[1]), v4Pin);
 const after = stamp(FILES[0]); assert.equal(after.epoch, before.epoch);
 for (const k of ['meta','state','policy','originals','intents','quarantines','schema','userVersion','applicationId']) assert.deepEqual(after[k], before[k]);
 assert.equal(after.observations.find(r => r.grant_id === B1.grantId).envelope, '{}');
 assert.equal(f.returnedCloses, 4); assert.equal(f.getterCalls, 0);
 f.stage = 4; diagnostic(t, 'WHOLE_STORE_CORRUPTION_REFUSAL_NO_REPAIR_OR_EPOCH_ADVANCE');
});
