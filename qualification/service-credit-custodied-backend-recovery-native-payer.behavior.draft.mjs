// Selected native component qualification on THREE new private synthetic SQLite files.
// Existing backend plus actual V3 payer custody/intent store and owned HTTP client.
// Funding/activation are declared synthetic records, NOT authenticated chain evidence.
// Ed25519 capability keys/proofs remain only in memory; no wallet, SDK or payment signer.
// Same-process normal close/reopen only, not restart, crash, power loss or live assurance.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ENTRY = 'qualification/service-credit-custodied-backend-recovery-native-payer.behavior.draft.mjs';
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
const SPECS = [
  [
    "src/service-credit-sqlite-store.js",
    83516,
    2366,
    "eea4032830dc1f641c4832e0dab33066633ba487eaf19581e3295cf8810460f3"
  ],
  [
    "src/service-credit-model.js",
    55461,
    1580,
    "7ff7e3d88ab8c3b38a0073541533fbdb7a0d9f2be42f337ac35f6a3b05615c3a"
  ],
  [
    "src/service-credit-execution-contract.js",
    30258,
    956,
    "298f8e74885e1c507953c0fcf7874832f815296746e6bacbdac97a425f1a6c73"
  ],
  [
    "src/service-credit-http.js",
    32432,
    958,
    "c76a7f1864bdfcd0c26916bf28fba615c8aecf899d53e69467e3ebe7d3353d0d"
  ],
  [
    "src/service-credit-capability.js",
    8284,
    256,
    "cb2b96d9a2e56c132dd1b4aca8f1c065b244ecd0e7e92f41ea3f4a8c969d17c3"
  ],
  [
    "package.json",
    1413,
    40,
    "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
  ],
  [
    "src/service-credit-backend-original-outcome-reader.js",
    7738,
    182,
    "dadd9cbfbdcc2ff4bb24252fed85a135d2ce17397e713b1917a109eb6b28938d"
  ],
  [
    "src/service-credit-custodied-http-client.js",
    10755,
    292,
    "ddbc54faf4a14d95e6274bc9df27b7b49db251bab67c11b871cfb2f9e78b4f15"
  ],
  [
    "src/service-credit-custodied-request-owner.js",
    35073,
    938,
    "6e7493a4859d48530820e68a4a19a513aad014ffc1048b42965a3ad36ae7c5f7"
  ],
  [
    "src/service-credit-original-request-custody-contract.js",
    14051,
    356,
    "fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"
  ],
  [
    "src/service-credit-http-execute-dispatch.js",
    27034,
    770,
    "254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b"
  ],
  [
    "src/service-credit-custodied-backend-recovery-client.js",
    12111,
    274,
    "c5085431c61fc12d13ff931f0f36d697bbbe17631b074f1ed6c4c73bbdf2d1ef"
  ],
  [
    "src/service-credit-custodied-sqlite-http-client.js",
    18540,
    511,
    "ea16d6ac5ce72d6434c06e98c52c324daf918dd570f15997cdc21e501f677f4e"
  ],
  [
    "src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    57471,
    1536,
    "974f5e28f851b8504efb71cb800e71881f8d37965bad927be2d18c5f7324b224"
  ],
  [
    "src/x402-wire.js",
    39886,
    934,
    "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"
  ]
];
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.env.NATIVE_PAYER_BACKEND_OPT_IN, 'synthetic-native-payer-backend-only');
const PINS = JSON.parse(process.env.NATIVE_PAYER_BACKEND_PINS), scratch = process.env.SPV_TASK_SCRATCH;
assert.equal(typeof scratch, 'string'); assert.equal(resolve(scratch), scratch);
const scratchStat = lstatSync(scratch, { bigint: true });
assert.ok(scratchStat.isDirectory() && !scratchStat.isSymbolicLink());
assert.equal(scratchStat.uid, BigInt(process.getuid())); assert.equal(scratchStat.mode & 0o777n, 0o700n);
const FILES = ['backend.sqlite', 'payer-clean.sqlite', 'payer-ambiguous.sqlite'];
for (const name of FILES) assert.throws(() => lstatSync(join(scratch, name)), { code: 'ENOENT' });
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
const sha = b => createHash('sha256').update(b).digest('hex');
function sources() {
  assert.equal(PINS.length, 16); assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p[0]), ENTRY]);
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
    total += used; assert.ok(total <= 655360); assert.equal(sha(raw), p.sha256); assert.equal(raw.length, p.bytes);
    assert.equal(raw.filter(c => c === 10).length, p.LF);
    if (index < SPECS.length) assert.deepEqual([p.path, p.bytes, p.LF, p.sha256], SPECS[index]);
    return { path: p.path, bytes: p.bytes, sha256: p.sha256, identity: p.identity };
  });
}
const sourceBefore = sources();

const { ServiceCreditSqliteStore: Backend } = await import('../src/service-credit-sqlite-store.js');
const { createServiceCreditCustodiedBackendRecoveryClientV3: BORROW,
  openServiceCreditCustodiedSqliteBackendRecoveryClientV3: OPEN }
  = await import('../src/service-credit-custodied-backend-recovery-client.js');
const { createZenonFundingPayerRecoveryDispatchIntentSqliteStoreV3: CREATE_PAYER,
  openZenonFundingPayerRecoveryDispatchIntentSqliteStoreV3: OPEN_PAYER }
  = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const { deriveServiceCreditCapabilityCommitment: COMMIT, createServiceCreditCapabilitySigningBytes: SIGNING_BYTES }
  = await import('../src/service-credit-capability.js');
const { serializeOriginalServiceRequestCustody: SERIALIZE,
  serializeOriginalServiceDispatchIntent: SERIALIZE_INTENT }
  = await import('../src/service-credit-original-request-custody-contract.js');
const { DatabaseSync } = await import('node:sqlite');
const OPTIONS = { timeout: 5000, concurrency: false };
const FUNDING = 'https://native-recovery.invalid/funding';
const SERVICE = 'https://native-recovery.invalid/service-credit/v1/execute';
const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 4, serviceResourceUrl: SERVICE });
const HASH = 'a'.repeat(64), EMPTY = 'sha256:' + sha(Buffer.alloc(0));
const XP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const RP = 'SERVICE_CREDIT_CUSTODIED_BACKEND_RECOVERY_';
const keyOf = r => ({ grantId: r.grantId, requestId: r.requestId });
const f = { backend: null, key: null, original: null, localOnly: null, header: null, absentHeader: null,
  alteredHeader: null, active: null, borrowedActive: null, clients: [], baseline: {},
  queries: 0, queryChanges: 0, clock: 0, pricing: 0, proofs: 0,
  ownedOpens: 0, ownedCloses: 0, borrowedOpens: 0, borrowedCloses: 0, rawOpens: 0,
  closeFailures: 0, backendClosedByFixture: false, expectedAcquisitionRefusals: 0 };
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
function request(requestId, maxCostUnits = 1) {
  return { modelVersion: 1, grantId: f.grant.grantId, requestId, method: 'POST',
    routeId: 'service-credit.execute.v1', canonicalBodyDigest: EMPTY, selectedContentType: 'application/json', maxCostUnits };
}
function proof(r) {
  f.proofs++;
  const raw = { proofVersion: 1, grantId: r.grantId, requestId: r.requestId,
    publicKey: f.key.publicKey.export({ format: 'jwk' }).x, maxCostUnits: r.maxCostUnits,
    signature: sign(null, SIGNING_BYTES(r), f.key.privateKey).toString('base64url') };
  return 'ServiceCredit ' + Buffer.from(canonical(raw)).toString('base64url');
}
function pairInput() {
  const requirement = { scheme: 'exact', network: 'zenon:testnet', asset: 'synthetic-asset',
    amount: '1', payTo: 'synthetic-payee', maxTimeoutSeconds: 30,
    extra: { poc: true, settlement: 'account-block', paymentFlow: 'upfront',
      minimumMomentumConfirmations: 2,
      zenonChain: { version: 1, chainIdentifier: '42', genesisMomentumHash: '1'.repeat(64) } } };
  const required = { x402Version: 2, resource: { url: FUNDING }, accepts: [requirement] };
  const payload = { x402Version: 2, resource: { url: FUNDING }, accepted: requirement,
    payload: { transaction: { hash: HASH }, intentDigest: '2'.repeat(64) } };
  return freeze({ challenge: { status: 'PAYMENT_REQUIRED', resourceUrl: FUNDING,
    paymentRequiredHeader: Buffer.from(JSON.stringify(required)).toString('base64'), paymentRequired: required },
    paymentSignatureHeader: Buffer.from(JSON.stringify(payload)).toString('base64') });
}
const PAIR = pairInput();
function inputFor(r) {
  return { grantId: r.grantId, requestId: r.requestId, originalRequestJson: JSON.stringify(r),
    originalBodyBase64: '', serviceResourceUrl: SERVICE };
}
function payerOptions(name) {
  return { databasePath: join(scratch, name), allowedRoot: scratch, resourceUrl: FUNDING, custodyPolicy: POLICY };
}
function configuration(name, extra = {}) {
  return { databasePath: join(scratch, name), allowedRoot: scratch, backendStore: f.backend,
    fundingResourceUrl: FUNDING, custodyPolicy: POLICY, selectedGrantId: f.grant.grantId,
    deadlineMs: 100, ...extra };
}
function raw(name, writable, fn) {
  assert.equal(f.active, null); assert.equal(f.borrowedActive, null);
  assert.ok(FILES.slice(1).includes(name));
  const path = join(scratch, name), st = lstatSync(path, { bigint: true });
  assert.ok(st.isFile() && !st.isSymbolicLink()); assert.equal(st.uid, BigInt(process.getuid()));
  assert.equal(st.dev, scratchStat.dev); assert.equal(st.nlink, 1n); assert.equal(st.mode & 0o777n, 0o600n);
  const db = new DatabaseSync(path, { readOnly: !writable, allowExtension: false,
    enableDoubleQuotedStringLiterals: false, enableForeignKeyConstraints: true, timeout: 0 });
  f.rawOpens++;
  try { return fn(db); } finally { db.close(); }
}
function dbStamp(name) {
  return raw(name, false, db => ({
    epoch: db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch,
    meta: db.prepare('SELECT singleton,resource_url FROM payer_recovery_meta ORDER BY singleton').all(),
    state: db.prepare('SELECT * FROM payer_recovery_state ORDER BY singleton').all(),
    originals: db.prepare('SELECT * FROM original_service_requests ORDER BY grant_id,request_id').all(),
    intents: db.prepare('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id').all(),
    policy: db.prepare('SELECT * FROM original_request_custody_policy ORDER BY singleton').all(),
    schema: db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
    applicationId: db.prepare('PRAGMA application_id').get().application_id,
    userVersion: db.prepare('PRAGMA user_version').get().user_version,
  }));
}
function sameRows(before, after, epochDelta) {
  assert.equal(after.epoch, before.epoch + epochDelta);
  assert.deepEqual({ ...after, epoch: 0 }, { ...before, epoch: 0 });
  assert.equal(after.userVersion, 3); assert.equal(after.applicationId, 0x5a505252);
}
function noActions(c) {
  const snap = c.snapshot();
  const actual = snap.storeOwnership === 'BOTH_BORROWED' ? snap.client : snap.client.client;
  assert.equal(actual.lastTransport, null);
  for (const name of ['retainCalls', 'dispatchCalls', 'intentWrites']) assert.equal(actual.owner.counts[name], 0);
  for (const name of ['submitOriginal', 'submitBatch', 'requestImpl', 'store', 'backendStore']) assert.equal(Object.hasOwn(c, name), false);
  assert.deepEqual(Object.keys(c), ['readOriginal','readOriginalRecoveryState','readOriginalRecoveryKeys',
    'readOriginalBackendRecoveryState','snapshot','close']);
  frozen(c); assert.equal(snap.authority, 'NONE');
}
async function owned(name, fn) {
  assert.equal(f.active, null); assert.equal(f.borrowedActive, null);
  const c = await OPEN(configuration(name));
  const rec = { c, owned: true, started: false, finished: false };
  f.clients.push(rec); f.active = rec; f.ownedOpens++;
  try { return await fn(c); } finally { await closeClient(rec); }
}
async function closeClient(rec) {
  if (rec.started) { assert.equal(rec.finished, true); return; }
  rec.started = true;
  const promise = rec.c.close(); assert.equal(promise, rec.c.close()); assert.ok(promise instanceof Promise);
  assert.throws(() => rec.c.readOriginalBackendRecoveryState(keyOf(f.original), f.header), { code: RP + 'CLOSED' });
  try { assert.equal(await promise, undefined); } catch (error) { f.closeFailures++; throw error; }
  assert.equal(promise, rec.c.close()); rec.finished = true;
  const snap = rec.c.snapshot();
  assert.equal(snap.closed, true); noActions(rec.c);
  if (rec.owned) {
    assert.equal(snap.storeOwnership, 'PAYER_OWNED_BACKEND_BORROWED');
    assert.equal(snap.client.resource.phase, 'RELEASED'); assert.equal(snap.client.resource.slotHeld, false);
    assert.equal(snap.client.resource.storeCloseAttempts, 1); assert.equal(snap.client.resource.storeCloseOutcome, 'RETURNED');
    assert.equal(snap.client.close.outcome, 'DRAINED'); f.ownedCloses++; f.active = null;
  }
}
function read(c, r, header, status, expectedQueries) {
  const ledger = f.backend.load(), queries = f.queries, clock = f.clock, pricing = f.pricing;
  const v = c.readOriginalBackendRecoveryState(keyOf(r), header);
  assert.equal(v.status, status); frozen(v); assert.equal(v.authority, 'NONE');
  for (const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed']) assert.equal(v[k], false);
  assert.equal(v.serviceDelivery, 'NOT_ESTABLISHED'); assert.equal(v.currentAuthority, 'NOT_ESTABLISHED');
  assert.equal(v.nextStep, 'RECONCILIATION_REQUIRED'); assert.equal(f.queries - queries, expectedQueries);
  assert.equal(f.queryChanges, 0); assert.deepEqual(f.backend.load(), ledger);
  assert.equal(f.clock, clock); assert.equal(f.pricing, pricing);
  assert.equal(JSON.stringify(v).includes(header), false);
  assert.equal(JSON.stringify(v).includes(PAIR.paymentSignatureHeader), false);
  noActions(c); return v;
}
function diagnostic(t, scenario) {
  assert.equal(f.active, null); assert.equal(f.borrowedActive, null);
  assert.equal(f.queryChanges, 0); assert.equal(f.closeFailures, 0);
  for (const rec of f.clients) { assert.equal(rec.finished, true); noActions(rec.c); }
  t.diagnostic(JSON.stringify({ kind: 'NATIVE_PAYER_BACKEND_RECOVERY', version: 1, scenario,
    backendQueries: f.queries, syntheticProofs: f.proofs, ownedOpens: f.ownedOpens,
    ownedCloses: f.ownedCloses, borrowedOpens: f.borrowedOpens, borrowedCloses: f.borrowedCloses,
    expectedAcquisitionRefusals: f.expectedAcquisitionRefusals, closeFailures: f.closeFailures,
    queryRevisionChanges: f.queryChanges, nativeSqliteFiles: 3, syntheticFundingPairs: 2,
    nativePayerStore: true, sameProcessOnly: true, realPaymentSigner: 'DISABLED',
    networkCalls: 0, serviceDelivery: 'NOT_ESTABLISHED' }));
}
before(() => {
  f.key = generateKeyPairSync('ed25519');
  const digest = n => 'sha256:' + String(n).repeat(64);
  f.backend = Backend.create({ databasePath: join(scratch, 'backend.sqlite'), allowedRoot: scratch,
    deriveCost() { f.pricing++; return 1; }, now() { f.clock++; return 1000; },
    busyTimeoutMs: 50, maxStateBytes: 65536, maxOffers: 2, maxGrants: 2, maxRequests: 8,
    testHooks: {
      beforeBegin({ operation }) { if (operation === 'getOriginalRequestExecutionSnapshot') f.queries++; },
      beforeCommit({ operation, changed }) {
        if (operation === 'getOriginalRequestExecutionSnapshot' && changed) f.queryChanges++;
      },
    } });
  const offer = { modelVersion: 1, providerId: 'synthetic-provider', serviceId: 'synthetic-service',
    resourceId: 'synthetic-resource', resourceBinding: digest(1), offerId: 'native-recovery-offer', offerVersion: 1,
    costPolicyId: 'synthetic-unit', fundingPolicyId: 'synthetic-funding', fundingPolicyVersion: 1 };
  f.backend.registerOffer(offer);
  // Privileged fixture seeding only. These declarations authenticate no real funding or chain.
  f.grant = f.backend.activateGrantFromTrustedRecord({
    activationVersion: 2, evidenceVersion: 1, inclusionAuthorizationDigest: digest(7),
    authorityProfileId: 'synthetic-authority', authorityProfileVersion: 1, verifierVersion: 1,
    authorityRecordDigest: digest(2), fundingPolicyId: offer.fundingPolicyId, fundingPolicyVersion: 1,
    sourceSettlementId: 'synthetic-native-settlement', transactionId: 'zenontx:' + HASH,
    providerId: offer.providerId, serviceId: offer.serviceId, resourceId: offer.resourceId,
    resourceBinding: offer.resourceBinding, offerId: offer.offerId, offerVersion: 1,
    holderId: 'synthetic-holder', capabilityCommitment: COMMIT({ publicKey: f.key.publicKey.export({ format: 'jwk' }).x }),
    totalUnits: 10, expiresAt: 100000, scheme: 'exact', paymentFlow: 'upfront', network: 'zenon:testnet',
    chainProfile: { version: 1, chainIdentifier: '42', genesisMomentumHash: '1'.repeat(64) },
    asset: 'synthetic-asset', amount: '1', payee: 'synthetic-payee', payer: 'synthetic-holder',
    paymentResourceDigest: digest(3), paymentRequirementDigest: digest(4), paymentIntentDigest: digest(5),
    grantFundingCommitment: digest(6), evidenceState: 'MOMENTUM_INCLUDED',
    confirmationPolicy: { policyId: 'zenon.authenticated-momentum-inclusion', policyVersion: 1, minimumConfirmations: 2 },
  });
  f.backend.initializeDurableExecution({ expectedRevision: f.backend.load().revision, ledgerId: 'synthetic-native-client-ledger',
    policy: { policyId: 'synthetic-deadline', policyVersion: 1, maxDurationMs: 1000 }, capacity: 8 });
  f.original = request('cached-native-original'); f.localOnly = request('retained-no-backend');
  f.header = proof(f.original); f.absentHeader = proof(f.localOnly);
  f.alteredHeader = proof({ ...f.original, maxCostUnits: 2 });
  const prepared = f.backend.prepareDurableExecution({ expectedRevision: f.backend.load().revision,
    request: f.original, selectedDurationMs: 1000 });
  assert.equal(prepared.disposition, 'APPLIED');
  f.backend.persistDurableExecutionFence({ expectedRevision: f.backend.load().revision, executionId: prepared.execution.executionId });
  const completed = f.backend.completeDurableExecution({ expectedRevision: f.backend.load().revision,
    executionId: prepared.execution.executionId, cachedResult: {
      statusCode: 200, contentType: 'application/json', resultCode: 'synthetic-native-cached-result' } });
  assert.equal(completed.winner, 'SUCCEEDED');
  for (const [name, ambiguous] of [['payer-clean.sqlite', false], ['payer-ambiguous.sqlite', true]]) {
    const p = CREATE_PAYER(payerOptions(name));
    try {
      assert.equal(p.prepare(PAIR).revision, 1);
      p.fenceAttempt('PREPARED');
      if (ambiguous) { p.finishAttempt('OUTCOME_UNKNOWN'); p.fenceAttempt('OUTCOME_UNKNOWN'); }
      const funded = p.finishAttempt('BOUND');
      assert.equal(funded.revision, ambiguous ? 5 : 3); assert.equal(funded.ambiguityLatched, ambiguous);
      p.retainOriginalRequest(inputFor(f.original)); p.retainOriginalRequest(inputFor(f.localOnly));
      p.fenceOriginalDispatchIntent(keyOf(f.original));
    } finally { p.close(); }
    f.baseline[name] = dbStamp(name);
    assert.equal(f.baseline[name].epoch, 1);
  }
});
after(async () => {
  for (const rec of f.clients) if (!rec.started) await closeClient(rec);
  assert.equal(f.active, null); assert.equal(f.borrowedActive, null);
  for (const rec of f.clients) { assert.equal(rec.finished, true); noActions(rec.c); }
  if (f.backend !== null) { f.backend.close(); f.backendClosedByFixture = true; }
  f.backend = null; f.key = null;
  assert.deepEqual(sources(), sourceBefore);
});

test('native payer backend recovery joins persistent original and releases only its owned store', OPTIONS, async t => {
  const before = dbStamp('payer-clean.sqlite'), ledger = f.backend.load();
  await owned('payer-clean.sqlite', async c => {
    assert.equal(c.snapshot().storeOwnership, 'PAYER_OWNED_BACKEND_BORROWED');
    assert.equal(c.snapshot().client.resource.ownership, 'OWNED_EXISTING_V3_DISPATCH_INTENT');
    const v = read(c, f.original, f.header, 'CACHED_SUCCESS', 1);
    assert.equal(v.local.funding.revision, 3); assert.equal(v.local.funding.paymentHash, HASH);
    assert.equal(v.local.funding.network, 'zenon:testnet'); assert.equal(v.local.dispatchIntent.fundingRevision, 3);
    assert.equal(v.backend.execution.terminalClassification, 'SUCCEEDED');
    assert.equal(v.backend.cachedResult.resultCode, 'synthetic-native-cached-result');
    assert.equal(c.readOriginal(keyOf(f.original)).originalRequestJson, JSON.stringify(f.original));
    assert.deepEqual(c.readOriginalRecoveryKeys().keys, [keyOf(f.original), keyOf(f.localOnly)]);
    await assert.rejects(OPEN(configuration('payer-clean.sqlite')), { code: XP + 'RESOURCE_BUSY' });
    f.expectedAcquisitionRefusals++;
    await assert.rejects(c.close('extra'), { code: XP + 'INVALID_INPUT' });
    assert.equal(c.snapshot().closed, false);
  });
  sameRows(before, dbStamp('payer-clean.sqlite'), 1); assert.deepEqual(f.backend.load(), ledger);
  diagnostic(t, 'OWNED_NATIVE_JOIN');
});
test('native payer backend recovery reopens the same original funding and insert-only intent', OPTIONS, async t => {
  const before = dbStamp('payer-clean.sqlite');
  await owned('payer-clean.sqlite', async c => {
    const v = read(c, f.original, f.header, 'CACHED_SUCCESS', 1);
    assert.equal(SERIALIZE(v.local.original), before.originals[0].envelope);
    assert.equal(SERIALIZE_INTENT(v.local.dispatchIntent), before.intents[0].envelope);
    assert.equal(v.local.uncertainty.custody, false); assert.equal(v.local.uncertainty.submission, false);
    assert.equal(v.local.uncertainty.undrained, false);
  });
  const after = dbStamp('payer-clean.sqlite'); sameRows(before, after, 1);
  assert.equal(after.state[0].envelope, f.baseline['payer-clean.sqlite'].state[0].envelope);
  diagnostic(t, 'SAME_FILE_NORMAL_REOPEN');
});
test('native payer backend recovery preserves ambiguous declared funding despite cached backend success', OPTIONS, async t => {
  const before = dbStamp('payer-ambiguous.sqlite');
  await owned('payer-ambiguous.sqlite', async c => {
    const v = read(c, f.original, f.header, 'CLIENT_RECONCILIATION_REQUIRED', 1);
    assert.equal(v.backend.status, 'CACHED_SUCCESS');
    assert.equal(v.local.funding.status, 'BOUND'); assert.equal(v.local.funding.revision, 5);
    assert.equal(v.local.funding.ambiguityLatched, true);
    assert.equal(v.local.uncertainty.declaredFundingAmbiguitySeen, true);
    assert.equal(v.local.dispatchIntent.fundingRevision, 5);
  });
  sameRows(before, dbStamp('payer-ambiguous.sqlite'), 1);
  diagnostic(t, 'NATIVE_FUNDING_AMBIGUITY');
});
test('native payer backend recovery checks proof scope and local absence before backend lookup', OPTIONS, async t => {
  const before = dbStamp('payer-clean.sqlite');
  await owned('payer-clean.sqlite', async c => {
    const bad = read(c, f.original, f.alteredHeader, 'ORIGINAL_BINDING_MISMATCH', 0);
    assert.equal(bad.backend.originalRequest, null); assert.equal(bad.backend.execution, null);
    const queries = f.queries;
    assert.throws(() => c.readOriginalBackendRecoveryState({ grantId: 'foreign-grant', requestId: 'missing' }, f.header),
      { code: RP + 'FOREIGN_GRANT' }); assert.equal(f.queries, queries);
    read(c, request('not-retained'), f.header, 'CLIENT_ORIGINAL_NOT_RECORDED', 0);
    read(c, f.localOnly, f.absentHeader, 'NOT_RECORDED', 1);
    read(c, f.original, f.header, 'CACHED_SUCCESS', 1);
  });
  sameRows(before, dbStamp('payer-clean.sqlite'), 1);
  diagnostic(t, 'NATIVE_PROOF_SCOPE_ABSENCE');
});
test('native payer backend recovery keeps the borrowed factory and both native stores borrowed', OPTIONS, async t => {
  const before = dbStamp('payer-ambiguous.sqlite'), p = OPEN_PAYER(payerOptions('payer-ambiguous.sqlite'));
  f.borrowedActive = p; f.borrowedOpens++;
  let rec;
  try {
    const c = BORROW({ store: p, backendStore: f.backend, fundingResourceUrl: FUNDING,
      custodyPolicy: POLICY, selectedGrantId: f.grant.grantId, deadlineMs: 100 });
    rec = { c, owned: false, started: false, finished: false }; f.clients.push(rec);
    assert.equal(c.snapshot().storeOwnership, 'BOTH_BORROWED');
    read(c, f.original, f.header, 'CLIENT_RECONCILIATION_REQUIRED', 1);
    await closeClient(rec); assert.equal(p.load().revision, 5);
    assert.equal(p.getOriginalRequest(keyOf(f.original)).originalRequestJson, JSON.stringify(f.original));
    assert.ok(f.backend.load());
  } finally {
    if (rec && !rec.started) await closeClient(rec);
    p.close(); f.borrowedCloses++; f.borrowedActive = null;
  }
  sameRows(before, dbStamp('payer-ambiguous.sqlite'), 1);
  diagnostic(t, 'BORROWED_NATIVE_COMPATIBILITY');
});
test('native payer backend recovery refuses missing policy and corrupt custody without fallback or repair', OPTIONS, async t => {
  const before = dbStamp('payer-clean.sqlite'), queries = f.queries;
  let getterCalls = 0;
  const malformed = configuration('payer-clean.sqlite');
  Object.defineProperty(malformed, 'databasePath', { enumerable: true, get() { getterCalls++; throw Error('getter forbidden'); } });
  await assert.rejects(OPEN(malformed), { code: RP + 'INVALID_CONFIGURATION' }); f.expectedAcquisitionRefusals++;
  assert.equal(getterCalls, 0);
  await assert.rejects(OPEN(configuration('missing.sqlite')), { code: XP + 'ACQUISITION_FAILED' });
  f.expectedAcquisitionRefusals++; assert.throws(() => lstatSync(join(scratch, 'missing.sqlite')), { code: 'ENOENT' });
  await assert.rejects(OPEN(configuration('payer-clean.sqlite',
    { custodyPolicy: { ...POLICY, maxRequests: 3 } })), { code: XP + 'ACQUISITION_FAILED' });
  f.expectedAcquisitionRefusals++; sameRows(before, dbStamp('payer-clean.sqlite'), 0);
  raw('payer-clean.sqlite', true, db => {
    assert.equal(db.prepare('UPDATE original_service_requests SET envelope=? WHERE grant_id=? AND request_id=?')
      .run('{}', f.original.grantId, f.original.requestId).changes, 1);
  });
  const corrupted = dbStamp('payer-clean.sqlite');
  await assert.rejects(OPEN(configuration('payer-clean.sqlite')), { code: XP + 'ACQUISITION_FAILED' });
  f.expectedAcquisitionRefusals++; assert.deepEqual(dbStamp('payer-clean.sqlite'), corrupted);
  assert.equal(f.queries, queries);
  const usable = dbStamp('payer-ambiguous.sqlite');
  await owned('payer-ambiguous.sqlite', async c => {
    read(c, f.original, f.header, 'CLIENT_RECONCILIATION_REQUIRED', 1);
  });
  sameRows(usable, dbStamp('payer-ambiguous.sqlite'), 1);
  assert.equal(f.ownedOpens, 5); assert.equal(f.ownedCloses, 5);
  assert.equal(f.borrowedOpens, 1); assert.equal(f.borrowedCloses, 1);
  assert.equal(f.queries, 7); assert.equal(f.proofs, 3); assert.equal(f.expectedAcquisitionRefusals, 5);
  assert.equal(dbStamp('payer-clean.sqlite').epoch, 4); assert.equal(dbStamp('payer-ambiguous.sqlite').epoch, 4);
  diagnostic(t, 'ACQUISITION_AND_CORRUPTION_REFUSALS');
});
