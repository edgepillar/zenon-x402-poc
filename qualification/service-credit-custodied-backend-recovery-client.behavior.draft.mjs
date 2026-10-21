// Explicit local qualification: ONE new private synthetic backend SQLite file.
// Actual V3 custodied client state machine; payer store is DECLARED synchronous DATA,
// NOT payer SQLite durability. Ed25519 keys/proofs remain only in memory.
// No SDK, transport, wallet, payment signer, process restart, real READY or delivery.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ENTRY = 'qualification/service-credit-custodied-backend-recovery-client.behavior.draft.mjs';
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
    9201,
    212,
    "524dccf0d4b77aefb3a84267c2d02e769dea3b95cbb11af280152e0d4779ee28"
  ]
];
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.env.CUSTODIED_BACKEND_RECOVERY_OPT_IN, 'synthetic-backend-and-declared-client-only');
const PINS = JSON.parse(process.env.CUSTODIED_BACKEND_RECOVERY_PINS), scratch = process.env.SPV_TASK_SCRATCH;
assert.equal(typeof scratch, 'string'); assert.equal(resolve(scratch), scratch);
const scratchStat = lstatSync(scratch, { bigint: true });
assert.ok(scratchStat.isDirectory() && !scratchStat.isSymbolicLink());
assert.equal(scratchStat.uid, BigInt(process.getuid())); assert.equal(scratchStat.mode & 0o777n, 0o700n);
const databasePath = join(scratch, 'client-recovery.sqlite');
assert.throws(() => lstatSync(databasePath), { code: 'ENOENT' });
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
const sha = b => createHash('sha256').update(b).digest('hex');
function sources() {
  assert.equal(PINS.length, 13); assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p[0]), ENTRY]);
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
    total += used; assert.ok(total <= 524288); assert.equal(sha(raw), p.sha256); assert.equal(raw.length, p.bytes);
    assert.equal(raw.filter(c => c === 10).length, p.LF);
    if (index < SPECS.length) assert.deepEqual([p.path, p.bytes, p.LF, p.sha256], SPECS[index]);
    return { path: p.path, bytes: p.bytes, sha256: p.sha256, identity: p.identity };
  });
}
const sourceBefore = sources();
const { ServiceCreditSqliteStore: Store } = await import('../src/service-credit-sqlite-store.js');
const { createServiceCreditBackendOriginalOutcomeReader: CREATE_READER }
  = await import('../src/service-credit-backend-original-outcome-reader.js');
const { createServiceCreditCustodiedBackendRecoveryClientV3: CREATE }
  = await import('../src/service-credit-custodied-backend-recovery-client.js');
const { captureOriginalServiceRequestCustody: CAPTURE, captureOriginalServiceDispatchIntent: INTENT }
  = await import('../src/service-credit-original-request-custody-contract.js');
const { deriveServiceCreditCapabilityCommitment: COMMIT, createServiceCreditCapabilitySigningBytes: SIGNING_BYTES }
  = await import('../src/service-credit-capability.js');
const OPTIONS = { timeout: 5000, concurrency: false };
const FUNDING = 'https://client-recovery.invalid/funding', SERVICE = 'https://client-recovery.invalid/service-credit/v1/execute';
const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 8, serviceResourceUrl: SERVICE });
const HASH = 'a'.repeat(64), digest = n => `sha256:${String(n).repeat(64)}`;
const f = { backend: null, hook: null, now: 1000, clock: 0, pricing: 0, queries: 0,
  queryChanges: 0, proofs: 0, contexts: [], retained: 0, intentWrites: 0, borrowedCloses: 0,
  storeLoads: 0, recordReads: 0, intentReads: 0, backendClosedByFixture: false };
const keyOf = r => ({ grantId: r.grantId, requestId: r.requestId });
const recordKey = r => `${r.grantId}\0${r.requestId}`;
function freeze(x) {
  if (x !== null && typeof x === 'object') { for (const v of Object.values(x)) freeze(v); Object.freeze(x); }
  return x;
}
function frozen(x) {
  if (x !== null && typeof x === 'object') { assert.ok(Object.isFrozen(x)); for (const v of Object.values(x)) frozen(v); }
}
function canonical(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return `[${x.map(canonical).join(',')}]`;
  return `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`;
}
function original(grantId, requestId, maxCostUnits = 1) {
  return { modelVersion: 1, grantId, requestId, method: 'POST', routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: `sha256:${sha(Buffer.alloc(0))}`, selectedContentType: 'application/json', maxCostUnits };
}
function proof(key, request) {
  const raw = { proofVersion: 1, grantId: request.grantId, requestId: request.requestId,
    publicKey: key.publicKey.export({ format: 'jwk' }).x, maxCostUnits: request.maxCostUnits,
    signature: sign(null, SIGNING_BYTES(request), key.privateKey).toString('base64url') };
  f.proofs += 1; return `ServiceCredit ${Buffer.from(canonical(raw)).toString('base64url')}`;
}
function envelope(header) {
  return { url: '/service-credit/v1/execute', method: 'POST', rawHeaders: ['Authorization', header] };
}
function custody(request) {
  return CAPTURE({ originalRequestJson: JSON.stringify(request), originalBodyBase64: '', serviceResourceUrl: SERVICE },
    { fundingResourceUrl: FUNDING, paymentHash: HASH, network: 'zenon:mock' });
}
function clientFixture(request = f.original, missing = false) {
  const p = { revision: 1, status: 'BOUND', ambiguity: false, records: new Map(), intent: null,
    failLoad: false, expectCloseFailure: false };
  p.original = custody(request); if (!missing) p.records.set(recordKey(request), p.original);
  p.store = {
    load() {
      f.storeLoads += 1; if (p.failLoad) throw Error('synthetic read fault');
      return freeze({ revision: p.revision, status: p.status, ambiguityLatched: p.ambiguity, resourceUrl: FUNDING,
        challengeHeader: 'synthetic-unused-header', paymentHeader: 'synthetic-unused-header',
        paymentRequired: { declared: true }, paymentPayload: {
          x402Version: 2, resource: { url: FUNDING }, accepted: {},
          payload: { transaction: { hash: HASH }, intentDigest: 'synthetic-unused-intent' },
        }, requirement: { scheme: 'exact', network: 'zenon:mock', asset: 'synthetic-asset',
          amount: '1', payTo: 'synthetic-payee', maxTimeoutSeconds: 60, extra: {} } });
    },
    getOriginalRequest(key) { f.recordReads += 1; return p.records.get(recordKey(key)) ?? null; },
    retainOriginalRequest() { f.retained += 1; throw Error('retention forbidden'); },
    fenceOriginalDispatchIntent() { f.intentWrites += 1; throw Error('intent write forbidden'); },
    getOriginalDispatchIntent() { f.intentReads += 1; return p.intent; },
    listOriginalRequestKeys() {
      return Object.freeze([...p.records.values()].map(r => Object.freeze(keyOf(r))).sort((a, b) =>
        a.grantId.localeCompare(b.grantId) || a.requestId.localeCompare(b.requestId)));
    },
    close() { f.borrowedCloses += 1; throw Error('borrowed close forbidden'); },
  };
  p.client = CREATE({ store: p.store, backendStore: f.backend, fundingResourceUrl: FUNDING,
    custodyPolicy: POLICY, selectedGrantId: f.grant.grantId, deadlineMs: 100 });
  f.contexts.push(p); return p;
}
function checkView(v, status) {
  assert.equal(v.status, status); frozen(v); assert.equal(v.authority, 'NONE');
  for (const k of ['mayStartPayment', 'maySignPayment', 'mayDispatchService', 'deliveryConfirmed']) assert.equal(v[k], false);
  assert.equal(v.serviceDelivery, 'NOT_ESTABLISHED'); assert.equal(v.currentAuthority, 'NOT_ESTABLISHED');
  assert.equal(v.nextStep, 'RECONCILIATION_REQUIRED');
}
function read(p, request, header, expectedStatus, queryCount) {
  const ledger = f.backend.load(), clock = f.clock, pricing = f.pricing, queries = f.queries;
  const v = p.client.readOriginalBackendRecoveryState(keyOf(request), header);
  checkView(v, expectedStatus); assert.equal(f.queries - queries, queryCount); assert.equal(f.queryChanges, 0);
  assert.equal(f.clock, clock); assert.equal(f.pricing, pricing); assert.deepEqual(f.backend.load(), ledger);
  assert.equal(JSON.stringify(v).includes(header), false); return v;
}
function prepare(request, selectedDurationMs = 1000) {
  const v = f.backend.prepareDurableExecution({ expectedRevision: f.backend.load().revision, request, selectedDurationMs });
  assert.equal(v.disposition, 'APPLIED'); return v;
}
function fence(execution) {
  return f.backend.persistDurableExecutionFence({ expectedRevision: f.backend.load().revision, executionId: execution.executionId });
}
function untouched() {
  assert.equal(f.retained, 0); assert.equal(f.intentWrites, 0); assert.equal(f.borrowedCloses, 0);
  for (const p of f.contexts) {
    const snapshot = p.client.snapshot(); assert.equal(snapshot.client.lastTransport, null);
    for (const name of ['retainCalls', 'dispatchCalls', 'intentWrites']) assert.equal(snapshot.client.owner.counts[name], 0);
  }
}
function diagnostic(t, scenario) {
  untouched();
  t.diagnostic(JSON.stringify({ kind: 'CUSTODIED_BACKEND_RECOVERY', version: 1, scenario,
    backendQueries: f.queries, syntheticProofs: f.proofs, clientStoreLoads: f.storeLoads,
    clientRecordReads: f.recordReads, clientIntentReads: f.intentReads, clientRetainCalls: f.retained,
    clientIntentWrites: f.intentWrites, borrowedStoreCloses: f.borrowedCloses, queryRevisionChanges: f.queryChanges,
    nativeClockCalls: f.clock, nativePricingCalls: f.pricing, clientContexts: f.contexts.length,
    expectedClientCloseFailures: f.contexts.filter(p => p.expectCloseFailure).length,
    backendClosedByFixture: f.backendClosedByFixture, nativeSqliteFiles: 1,
    clientStore: 'DECLARED_SYNC_INTERFACE', sameProcessOnly: true, realPaymentSigner: 'DISABLED',
    clientDurability: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED', networkCalls: 0 }));
}
before(() => {
  f.key = generateKeyPairSync('ed25519'); f.foreignKey = generateKeyPairSync('ed25519');
  f.backend = Store.create({ databasePath, allowedRoot: scratch, deriveCost() { f.pricing += 1; return 1; },
    now() { f.clock += 1; return f.now; }, busyTimeoutMs: 50, maxStateBytes: 65536,
    maxOffers: 2, maxGrants: 2, maxRequests: 8, testHooks: {
      beforeBegin({ operation }) { if (operation === 'getOriginalRequestExecutionSnapshot') { f.queries += 1; if (f.hook) f.hook(); } },
      beforeCommit({ operation, changed }) { if (operation === 'getOriginalRequestExecutionSnapshot' && changed) f.queryChanges += 1; },
    } });
  const offer = { modelVersion: 1, providerId: 'synthetic-provider', serviceId: 'synthetic-service',
    resourceId: 'synthetic-resource', resourceBinding: digest(1), offerId: 'synthetic-offer', offerVersion: 1,
    costPolicyId: 'synthetic-unit', fundingPolicyId: 'synthetic-funding', fundingPolicyVersion: 1 };
  f.backend.registerOffer(offer);
  function activate(key, index) {
    return f.backend.activateGrantFromTrustedRecord({ activationVersion: 1, authorityProfileId: 'synthetic-authority',
      authorityProfileVersion: 1, verifierVersion: 1, authorityRecordDigest: digest(2),
      fundingPolicyId: offer.fundingPolicyId, fundingPolicyVersion: 1, sourceSettlementId: `synthetic-settlement-${index}`,
      transactionId: `mocktx:${String(index).repeat(64)}`, providerId: offer.providerId, serviceId: offer.serviceId,
      resourceId: offer.resourceId, resourceBinding: offer.resourceBinding, offerId: offer.offerId, offerVersion: 1,
      holderId: 'synthetic-holder', capabilityCommitment: COMMIT({ publicKey: key.publicKey.export({ format: 'jwk' }).x }),
      totalUnits: 10, expiresAt: 100000, scheme: 'exact', paymentFlow: 'upfront', network: 'zenon:mock',
      chainProfile: { version: 1, chainIdentifier: String(Number.MAX_SAFE_INTEGER), genesisMomentumHash: '0'.repeat(64) },
      asset: 'synthetic-asset', amount: '1', payee: 'synthetic-payee', payer: 'synthetic-holder',
      paymentResourceDigest: digest(3), paymentRequirementDigest: digest(4), paymentIntentDigest: digest(5),
      grantFundingCommitment: digest(6), evidenceState: 'MOMENTUM_INCLUDED',
      confirmationPolicy: { policyId: 'mock.momentum-included', policyVersion: 1, minimumConfirmations: 1 } });
  }
  f.grant = activate(f.key, 1); f.foreignGrant = activate(f.foreignKey, 2);
  f.backend.initializeDurableExecution({ expectedRevision: f.backend.load().revision, ledgerId: 'synthetic-client-ledger',
    policy: { policyId: 'synthetic-deadline', policyVersion: 1, maxDurationMs: 1000 }, capacity: 8 });
  f.original = original(f.grant.grantId, 'cached-original'); f.header = proof(f.key, f.original);
  const prepared = prepare(f.original); fence(prepared.execution);
  const completed = f.backend.completeDurableExecution({ expectedRevision: f.backend.load().revision,
    executionId: prepared.execution.executionId, cachedResult: {
      statusCode: 200, contentType: 'application/json', resultCode: 'linked-client-result' } });
  assert.equal(completed.winner, 'SUCCEEDED');
});
after(async () => {
  f.hook = null;
  const settled = await Promise.allSettled(f.contexts.map(p => p.client.close()));
  for (let i = 0; i < settled.length; i++) {
    assert.equal(settled[i].status, f.contexts[i].expectCloseFailure ? 'rejected' : 'fulfilled');
    if (settled[i].status === 'rejected') assert.equal(settled[i].reason.code, 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_CLOSE_FAILED');
  }
  if (f.backend !== null) f.backend.close();
  f.backend = null; f.key = null; f.foreignKey = null;
  untouched(); assert.deepEqual(sources(), sourceBefore);
});

test('custodied backend recovery links the exact retained original to recorded success without dispatch', OPTIONS, t => {
  const legacy = CREATE_READER({ store: f.backend, admittedGrantId: f.grant.grantId });
  try { assert.equal(legacy.read(envelope(f.header)).status, 'CACHED_SUCCESS'); }
  finally { legacy.close(); }
  const p = clientFixture(), v = read(p, f.original, f.header, 'CACHED_SUCCESS', 1);
  assert.deepEqual(Object.keys(p.client), ['readOriginal', 'readOriginalRecoveryState', 'readOriginalRecoveryKeys',
    'readOriginalBackendRecoveryState', 'snapshot', 'close']);
  assert.equal(Object.hasOwn(p.client, 'submitOriginal'), false);
  assert.equal(v.local.original.originalRequestJson, JSON.stringify(f.original));
  for (const [name, value] of Object.entries(f.original)) assert.equal(v.backend.originalRequest[name], value);
  assert.equal(v.backend.cachedResult.resultCode, 'linked-client-result');
  assert.equal(v.backend.execution.terminalClassification, 'SUCCEEDED');
  assert.equal(v.local.dispatchIntent, null); assert.equal(v.local.dispatchStatus, 'NO_INTENT_RECORDED');
  diagnostic(t, 'LINKED_CACHED_ORIGINAL');
});

test('custodied backend recovery rejects differently bound valid proofs before backend lookup', OPTIONS, t => {
  const p = clientFixture(), q = original(f.grant.grantId, 'another-request');
  read(p, f.original, proof(f.key, q), 'ORIGINAL_BINDING_MISMATCH', 0);
  read(p, f.original, proof(f.key, { ...f.original, maxCostUnits: 2 }), 'ORIGINAL_BINDING_MISMATCH', 0);
  read(p, f.original, proof(f.foreignKey, original(f.foreignGrant.grantId, 'cached-original')), 'UNAUTHORIZED', 0);
  const queries = f.queries, loads = f.storeLoads;
  assert.throws(() => p.client.readOriginalBackendRecoveryState(
    { grantId: f.foreignGrant.grantId, requestId: 'cached-original' }, f.header),
    { code: 'SERVICE_CREDIT_CUSTODIED_BACKEND_RECOVERY_FOREIGN_GRANT' });
  assert.equal(f.storeLoads, loads);
  const direct = CREATE_READER({ store: f.backend, admittedGrantId: f.grant.grantId });
  try {
    const changes = { modelVersion: 2, grantId: f.foreignGrant.grantId, requestId: 'another-request', method: 'GET',
      routeId: 'another-route', canonicalBodyDigest: digest(8), selectedContentType: 'text/plain', maxCostUnits: 2 };
    for (const [name, value] of Object.entries(changes)) {
      const v = direct.readExactOriginal(envelope(f.header), { ...f.original, [name]: value });
      assert.equal(v.status, 'ORIGINAL_BINDING_MISMATCH'); assert.equal(v.originalRequest, null); assert.equal(v.revision, null);
    }
    let getters = 0;
    const accessor = { ...f.original };
    Object.defineProperty(accessor, 'requestId', { enumerable: true, get() { getters += 1; throw Error('unexpected getter'); } });
    assert.equal(direct.readExactOriginal(envelope(f.header), accessor).status, 'ORIGINAL_BINDING_MISMATCH');
    const proxy = new Proxy(f.original, { getOwnPropertyDescriptor() { getters += 1; throw Error('unexpected proxy'); } });
    assert.equal(direct.readExactOriginal(envelope(f.header), proxy).status, 'ORIGINAL_BINDING_MISMATCH');
    assert.equal(getters, 0); assert.equal(direct.readExactOriginal(envelope(f.header)).status, 'UNAVAILABLE');
  } finally { direct.close(); }
  assert.equal(f.queries, queries); diagnostic(t, 'EXACT_PROOF_BEFORE_LOOKUP');
});

test('custodied backend recovery preserves absence noninvocation and independent client uncertainty', OPTIONS, t => {
  const missing = clientFixture(f.original, true);
  const absentLocal = read(missing, f.original, f.header, 'CLIENT_ORIGINAL_NOT_RECORDED', 0);
  assert.equal(absentLocal.backend, null);
  const absent = original(f.grant.grantId, 'absent-backend'), ap = clientFixture(absent);
  const absentBackend = read(ap, absent, proof(f.key, absent), 'NOT_RECORDED', 1);
  assert.equal(absentBackend.backend.originalRequest, null);
  const expired = original(f.grant.grantId, 'not-invoked'), preparedExpired = prepare(expired, 10);
  f.now += 10; const notInvoked = fence(preparedExpired.execution);
  assert.equal(notInvoked.execution.terminalClassification, 'NOT_INVOKED');
  read(clientFixture(expired), expired, proof(f.key, expired), 'NOT_INVOKED', 1);
  const pending = original(f.grant.grantId, 'uncertain-backend'), prepared = prepare(pending);
  const pp = clientFixture(pending), pendingHeader = proof(f.key, pending);
  assert.equal(read(pp, pending, pendingHeader, 'RECONCILIATION_REQUIRED', 1).backend.execution.fencePhase, 'PREPARED');
  fence(prepared.execution);
  assert.equal(read(pp, pending, pendingHeader, 'RECONCILIATION_REQUIRED', 1).backend.execution.fencePhase, 'MAY_HAVE_STARTED');
  f.backend.markDurableExecutionUnknown({ expectedRevision: f.backend.load().revision,
    executionId: prepared.execution.executionId, reason: 'DISCONNECTED' });
  assert.equal(read(pp, pending, pendingHeader, 'OUTCOME_UNKNOWN', 1).backend.cachedResult, null);
  const uncertain = clientFixture(); uncertain.status = 'OUTCOME_UNKNOWN'; uncertain.ambiguity = true;
  const v = read(uncertain, f.original, f.header, 'CLIENT_RECONCILIATION_REQUIRED', 1);
  assert.equal(v.backend.status, 'CACHED_SUCCESS'); assert.equal(v.local.funding.status, 'OUTCOME_UNKNOWN');
  uncertain.status = 'BOUND'; uncertain.ambiguity = false; uncertain.revision += 1;
  const later = read(uncertain, f.original, f.header, 'CLIENT_RECONCILIATION_REQUIRED', 1);
  assert.equal(later.local.uncertainty.declaredFundingAmbiguitySeen, true);
  diagnostic(t, 'INDEPENDENT_UNCERTAINTY');
});

test('custodied backend recovery quarantines changed funding custody intent and failed client reads', OPTIONS, async t => {
  const checks = [
    p => { p.revision += 1; },
    p => { p.records.set(recordKey(f.original), custody({ ...f.original, maxCostUnits: 2 })); },
    p => { p.intent = INTENT(p.original, { fundingRevision: p.revision,
      challengeDigest: digest(2), paymentDigest: digest(3), custodyPolicy: POLICY }); },
  ];
  for (const change of checks) {
    const p = clientFixture(), before = f.queries;
    f.hook = () => change(p);
    try { assert.throws(() => p.client.readOriginalBackendRecoveryState(keyOf(f.original), f.header),
      { code: 'SERVICE_CREDIT_CUSTODIED_BACKEND_RECOVERY_CLIENT_BINDING_CHANGED' }); }
    finally { f.hook = null; }
    assert.equal(f.queries, before + 1); const loads = f.storeLoads;
    assert.throws(() => p.client.readOriginalBackendRecoveryState(keyOf(f.original), f.header),
      { code: 'SERVICE_CREDIT_CUSTODIED_BACKEND_RECOVERY_UNAVAILABLE' });
    assert.equal(f.queries, before + 1); assert.equal(f.storeLoads, loads); assert.equal(p.client.snapshot().unavailable, true);
  }
  const failed = clientFixture(); f.hook = () => { failed.failLoad = true; };
  try { assert.throws(() => failed.client.readOriginalBackendRecoveryState(keyOf(f.original), f.header),
    { code: 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_CUSTODY_OUTCOME_UNKNOWN' }); }
  finally { f.hook = null; }
  failed.expectCloseFailure = true;
  const same = failed.client.close(); assert.equal(failed.client.close(), same);
  await assert.rejects(same, { code: 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_CLOSE_FAILED' });
  const queries = f.queries, loads = f.storeLoads;
  assert.throws(() => failed.client.readOriginalBackendRecoveryState(keyOf(f.original), f.header),
    { code: 'SERVICE_CREDIT_CUSTODIED_BACKEND_RECOVERY_CLOSED' });
  assert.equal(f.queries, queries); assert.equal(f.storeLoads, loads); diagnostic(t, 'CLIENT_BINDING_FAILURES');
});

test('custodied backend recovery fences reentrant close and latches backend failure without replay', OPTIONS, async t => {
  const p = clientFixture(), ledger = f.backend.load(); let closePromise, nested;
  f.hook = () => {
    try { p.client.readOriginalBackendRecoveryState(keyOf(f.original), f.header); } catch (error) { nested = error.code; }
    closePromise = p.client.close();
  };
  try { assert.throws(() => p.client.readOriginalBackendRecoveryState(keyOf(f.original), f.header),
    { code: 'SERVICE_CREDIT_CUSTODIED_BACKEND_RECOVERY_CLOSED' }); }
  finally { f.hook = null; }
  assert.equal(nested, 'SERVICE_CREDIT_CUSTODIED_BACKEND_RECOVERY_BUSY');
  assert.equal(p.client.close(), closePromise); await closePromise;
  assert.deepEqual(f.backend.load(), ledger);
  const q = clientFixture(); f.backend.close(); f.backendClosedByFixture = true;
  const first = q.client.readOriginalBackendRecoveryState(keyOf(f.original), f.header);
  checkView(first, 'UNAVAILABLE'); assert.equal(q.client.snapshot().unavailable, true);
  const queries = f.queries, loads = f.storeLoads;
  assert.throws(() => q.client.readOriginalBackendRecoveryState(keyOf(f.original), f.header),
    { code: 'SERVICE_CREDIT_CUSTODIED_BACKEND_RECOVERY_UNAVAILABLE' });
  assert.equal(f.queries, queries); assert.equal(f.storeLoads, loads); f.backend = null;
  diagnostic(t, 'CLOSE_AND_BACKEND_FAILURE');
});
