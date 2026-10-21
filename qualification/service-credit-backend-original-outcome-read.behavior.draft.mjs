// Explicit, bounded qualification on ONE new private synthetic SQLite file.
// Capability Ed25519 keys/signatures stay in memory. No payment signer, wallet,
// network, SDK, application callback, real process restart or delivery is used.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = 'qualification/service-credit-backend-original-outcome-read.behavior.draft.mjs';
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
const SPECS = [
  ['src/service-credit-sqlite-store.js', 83516, 2366, 'eea4032830dc1f641c4832e0dab33066633ba487eaf19581e3295cf8810460f3'],
  ['src/service-credit-model.js', 55461, 1580, '7ff7e3d88ab8c3b38a0073541533fbdb7a0d9f2be42f337ac35f6a3b05615c3a'],
  ['src/service-credit-execution-contract.js', 30258, 956, '298f8e74885e1c507953c0fcf7874832f815296746e6bacbdac97a425f1a6c73'],
  ['src/service-credit-http.js', 32432, 958, 'c76a7f1864bdfcd0c26916bf28fba615c8aecf899d53e69467e3ebe7d3353d0d'],
  ['src/service-credit-capability.js', 8284, 256, 'cb2b96d9a2e56c132dd1b4aca8f1c065b244ecd0e7e92f41ea3f4a8c969d17c3'],
  ['package.json', 1413, 40, '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5'],
  ['src/service-credit-backend-original-outcome-reader.js', 6511, 153, 'd3776771fe7aae1e6b51f744f7c2e72258b3ba71be65052e116931b4549d5bbb'],
];
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.env.SERVICE_CREDIT_BACKEND_READ_OPT_IN, 'private-synthetic-sqlite-and-capability-only');
const PINS = JSON.parse(process.env.SERVICE_CREDIT_BACKEND_READ_PINS);
const scratch = process.env.SPV_TASK_SCRATCH;
assert.equal(typeof scratch, 'string'); assert.equal(resolve(scratch), scratch);
const scratchStat = lstatSync(scratch, { bigint: true });
assert.ok(scratchStat.isDirectory() && !scratchStat.isSymbolicLink());
assert.equal(scratchStat.uid, BigInt(process.getuid())); assert.equal(scratchStat.mode & 0o777n, 0o700n);
const databasePath = join(scratch, 'original-outcome.sqlite');
assert.throws(() => lstatSync(databasePath), { code: 'ENOENT' });
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
const sha = b => createHash('sha256').update(b).digest('hex');
function sources() {
  assert.equal(PINS.length, 8); assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p[0]), ENTRY]);
  let total = 0;
  return PINS.map((p, index) => {
    const filename = join(REPO, p.path), s = lstatSync(filename, { bigint: true });
    assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.uid, BigInt(process.getuid()));
    assert.equal(s.nlink, 1n); assert.ok(s.size > 0n && s.size <= 131072n); assert.deepEqual(ids(s), p.identity);
    const fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW), b = Buffer.alloc(Number(s.size) + 1);
    let used = 0;
    try {
      assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
      while (used < b.length) { const n = readSync(fd, b, used, b.length - used, null); if (!n) break; used += n; }
      assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
    } finally { closeSync(fd); }
    assert.deepEqual(ids(lstatSync(filename, { bigint: true })), p.identity); assert.equal(used, Number(s.size));
    const raw = b.subarray(0, used); assert.equal(raw.includes(0), false); assert.equal(raw.some(c => c > 127), false);
    total += used; assert.ok(total <= 524288); assert.equal(sha(raw), p.sha256); assert.equal(raw.length, p.bytes);
    assert.equal(raw.filter(c => c === 10).length, p.LF);
    if (index < SPECS.length) assert.deepEqual([p.path, p.bytes, p.LF, p.sha256], SPECS[index]);
    return { path: p.path, bytes: p.bytes, sha256: p.sha256, identity: p.identity };
  });
}
const sourceBefore = sources();
const { ServiceCreditSqliteStore: Store } = await import('../src/service-credit-sqlite-store.js');
const { createServiceCreditBackendOriginalOutcomeReader: CREATE }
  = await import('../src/service-credit-backend-original-outcome-reader.js');
const { deriveServiceCreditCapabilityCommitment, createServiceCreditCapabilitySigningBytes }
  = await import('../src/service-credit-capability.js');
const { DatabaseSync } = await import('node:sqlite');
const OPTIONS = { timeout: 5000, concurrency: false };
const f = { store: null, reader: null, now: 1000, clock: 0, cost: 0, reads: 0,
  readChanges: 0, signedProofs: 0, hook: null, rawOpens: 0, rawCloses: 0 };
const commitment = n => `sha256:${String(n).repeat(64)}`;
function canonical(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return `[${x.map(canonical).join(',')}]`;
  return `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`;
}
function deeplyFrozen(x) {
  if (x === null || typeof x !== 'object') return;
  assert.ok(Object.isFrozen(x)); for (const value of Object.values(x)) deeplyFrozen(value);
}
function requestFor(grantId, requestId, maxCostUnits = 1) {
  return { modelVersion: 1, grantId, requestId, method: 'POST', routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: `sha256:${sha(Buffer.alloc(0))}`, selectedContentType: 'application/json', maxCostUnits };
}
function envelope(key, request) {
  const proof = { proofVersion: 1, grantId: request.grantId, requestId: request.requestId,
    publicKey: key.publicKey.export({ format: 'jwk' }).x, maxCostUnits: request.maxCostUnits,
    signature: sign(null, createServiceCreditCapabilitySigningBytes(request), key.privateKey).toString('base64url') };
  f.signedProofs += 1;
  return { url: '/service-credit/v1/execute', method: 'POST', rawHeaders: [
    'Authorization', `ServiceCredit ${Buffer.from(canonical(proof)).toString('base64url')}`,
  ] };
}
function configure() {
  return { databasePath, allowedRoot: scratch, deriveCost() { f.cost += 1; return 1; },
    now() { f.clock += 1; return f.now; }, busyTimeoutMs: 50,
    maxStateBytes: 65536, maxOffers: 2, maxGrants: 2, maxRequests: 8,
    testHooks: {
      beforeBegin({ operation }) {
        if (operation === 'getOriginalRequestExecutionSnapshot') {
          f.reads += 1; if (f.hook) f.hook();
        }
      },
      beforeCommit({ operation, changed }) {
        if (operation === 'getOriginalRequestExecutionSnapshot' && changed) f.readChanges += 1;
      },
    } };
}
function reader() { return CREATE({ store: f.store, admittedGrantId: f.grant.grantId }); }
function stableRead(input, status, expectedReads = 1) {
  const before = f.store.load(), clock = f.clock, cost = f.cost, reads = f.reads;
  const value = f.reader.read(input);
  assert.equal(value.status, status); deeplyFrozen(value);
  for (const key of ['executionAuthorized', 'paymentAuthorized', 'signingAuthorized']) assert.equal(value[key], false);
  assert.equal(value.deliveryStatus, 'NOT_ESTABLISHED');
  assert.equal(f.reads - reads, expectedReads); assert.equal(f.readChanges, 0);
  assert.equal(f.clock, clock); assert.equal(f.cost, cost); assert.deepEqual(f.store.load(), before);
  return value;
}
function revision() { return f.store.load().revision; }
function prepare(request, selectedDurationMs = 1000) {
  const value = f.store.prepareDurableExecution({ expectedRevision: revision(), request, selectedDurationMs });
  assert.equal(value.disposition, 'APPLIED'); return value;
}
function diagnostic(t, scenario, extra = {}) {
  t.diagnostic(JSON.stringify({ kind: 'BACKEND_ORIGINAL_OUTCOME_READ', version: 1, scenario,
    atomicReadCalls: f.reads, syntheticProofs: f.signedProofs, clockCalls: f.clock, pricingCalls: f.cost,
    readRevisionChanges: f.readChanges, rawOpens: f.rawOpens, rawCloses: f.rawCloses,
    sqliteFiles: 1, sameProcessOnly: true, realPaymentSigner: 'DISABLED', executionCallbacks: 0,
    networkCalls: 0, zenonSdkImported: false, serviceDelivery: 'NOT_ESTABLISHED', ...extra }));
}
before(() => {
  f.key = generateKeyPairSync('ed25519'); f.foreignKey = generateKeyPairSync('ed25519');
  f.store = Store.create(configure());
  const offer = { modelVersion: 1, providerId: 'synthetic-provider', serviceId: 'synthetic-service',
    resourceId: 'synthetic-resource', resourceBinding: commitment(1), offerId: 'synthetic-offer', offerVersion: 1,
    costPolicyId: 'synthetic-unit', fundingPolicyId: 'synthetic-funding', fundingPolicyVersion: 1 };
  f.store.registerOffer(offer);
  function activate(key, index) {
    return f.store.activateGrantFromTrustedRecord({ activationVersion: 1, authorityProfileId: 'synthetic-authority',
      authorityProfileVersion: 1, verifierVersion: 1, authorityRecordDigest: commitment(2),
      fundingPolicyId: offer.fundingPolicyId, fundingPolicyVersion: 1, sourceSettlementId: `synthetic-settlement-${index}`,
      transactionId: `mocktx:${String(index).repeat(64)}`, providerId: offer.providerId, serviceId: offer.serviceId,
      resourceId: offer.resourceId, resourceBinding: offer.resourceBinding, offerId: offer.offerId, offerVersion: 1,
      holderId: 'synthetic-holder', capabilityCommitment: deriveServiceCreditCapabilityCommitment({
        publicKey: key.publicKey.export({ format: 'jwk' }).x }), totalUnits: 10, expiresAt: 100000,
      scheme: 'exact', paymentFlow: 'upfront', network: 'zenon:mock', chainProfile: { version: 1,
        chainIdentifier: String(Number.MAX_SAFE_INTEGER), genesisMomentumHash: '0'.repeat(64) },
      asset: 'synthetic-asset', amount: '1', payee: 'synthetic-payee', payer: 'synthetic-holder',
      paymentResourceDigest: commitment(3), paymentRequirementDigest: commitment(4), paymentIntentDigest: commitment(5),
      grantFundingCommitment: commitment(6), evidenceState: 'MOMENTUM_INCLUDED',
      confirmationPolicy: { policyId: 'mock.momentum-included', policyVersion: 1, minimumConfirmations: 1 } });
  }
  f.grant = activate(f.key, 1); f.foreignGrant = activate(f.foreignKey, 2);
  f.original = requestFor(f.grant.grantId, 'original-request'); f.proof = envelope(f.key, f.original);
  f.reader = reader();
});
after(() => {
  f.hook = null;
  try { f.reader?.close(); } finally { f.store?.close(); }
  f.key = null; f.foreignKey = null;
  assert.deepEqual(sources(), sourceBefore);
});

test('backend original read rejects foreign admission and never reserves a missing original', OPTIONS, t => {
  assert.deepEqual(Object.keys(f.reader), ['read', 'close']); deeplyFrozen(f.reader);
  const absent = stableRead(f.proof, 'NOT_RECORDED');
  assert.equal(absent.originalRequest, null); assert.equal(absent.execution, null); assert.equal(absent.cachedResult, null);
  const foreign = envelope(f.foreignKey, requestFor(f.foreignGrant.grantId, 'foreign-request'));
  assert.equal(stableRead(foreign, 'UNAUTHORIZED', 0).revision, null);
  assert.equal(stableRead({ ...f.proof, rawHeaders: [] }, 'UNAUTHORIZED', 0).originalRequest, null);
  assert.equal(stableRead({ ...f.proof, method: 'GET' }, 'METHOD_NOT_ALLOWED', 0).execution, null);
  assert.equal(f.reader.read().status, 'UNAVAILABLE'); assert.equal(f.reader.close('extra').status, 'UNAVAILABLE');
  assert.throws(() => f.store.getOriginalRequestExecutionSnapshot(), { code: 'SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT' });
  assert.throws(() => f.store.getOriginalRequestExecutionSnapshot(f.original, {}), { code: 'SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT' });
  assert.throws(() => CREATE({ store: Object.create(Store.prototype), admittedGrantId: f.grant.grantId }),
    { message: 'SERVICE_CREDIT_BACKEND_READER_INVALID_CONFIGURATION' });
  let getters = 0;
  Object.defineProperty(f.store, 'load', { configurable: true, get() { getters += 1; throw Error('unexpected getter'); } });
  try { assert.throws(() => reader(), { message: 'SERVICE_CREDIT_BACKEND_READER_INVALID_CONFIGURATION' }); }
  finally { delete f.store.load; }
  assert.equal(getters, 0);
  const initialized = f.store.initializeDurableExecution({ expectedRevision: revision(), ledgerId: 'synthetic-ledger',
    policy: { policyId: 'synthetic-deadline', policyVersion: 1, maxDurationMs: 1000 }, capacity: 8 });
  assert.equal(initialized.disposition, 'APPLIED');
  diagnostic(t, 'ADMISSION_AND_ABSENCE');
});

test('backend original read preserves NOT_INVOKED and PREPARED without advancing either', OPTIONS, t => {
  const expiredRequest = requestFor(f.grant.grantId, 'expired-before-invocation');
  const prepared = prepare(expiredRequest, 10); f.now += 10;
  const expired = f.store.persistDurableExecutionFence({ expectedRevision: revision(), executionId: prepared.execution.executionId });
  assert.equal(expired.execution.terminalClassification, 'NOT_INVOKED');
  const value = stableRead(envelope(f.key, expiredRequest), 'NOT_INVOKED');
  assert.equal(value.originalRequest.state, 'FAILED_RELEASED'); assert.equal(value.cachedResult, null);
  f.prepared = prepare(f.original);
  const pending = stableRead(f.proof, 'RECONCILIATION_REQUIRED');
  assert.equal(pending.execution.fencePhase, 'PREPARED'); assert.equal(pending.execution.terminalClassification, 'NONE');
  assert.equal(pending.originalRequest.state, 'EXECUTING'); assert.equal(pending.cachedResult, null);
  assert.notEqual(pending.originalRequest, f.prepared.request);
  diagnostic(t, 'NONTERMINAL_AND_NOT_INVOKED');
});

test('backend original read returns only the linked cached success across same-process reopen', OPTIONS, t => {
  const fence = f.store.persistDurableExecutionFence({ expectedRevision: revision(), executionId: f.prepared.execution.executionId });
  assert.equal(fence.execution.fencePhase, 'MAY_HAVE_STARTED');
  stableRead(f.proof, 'RECONCILIATION_REQUIRED'); f.now += 1;
  const cachedResult = { statusCode: 200, contentType: 'application/json', resultCode: 'synthetic-result' };
  const completion = f.store.completeDurableExecution({ expectedRevision: revision(),
    executionId: f.prepared.execution.executionId, cachedResult });
  assert.equal(completion.winner, 'SUCCEEDED');
  const first = stableRead(f.proof, 'CACHED_SUCCESS'); assert.deepEqual(first.cachedResult, cachedResult);
  assert.equal(first.execution.executionId, f.prepared.execution.executionId);
  const conflict = envelope(f.key, { ...f.original, maxCostUnits: 2 });
  assert.equal(stableRead(conflict, 'REQUEST_ID_CONFLICT').revision, null);
  assert.throws(() => f.store.getOriginalRequestExecutionSnapshot({ ...f.original, routeId: 'changed-route' }),
    { code: 'REQUEST_ID_CONFLICT' });
  const beforeClose = f.store.load(); f.reader.close(); assert.equal(f.reader.read(f.proof).status, 'CLOSED');
  assert.deepEqual(f.store.load(), beforeClose); f.store.close(); f.store = Store.openExisting(configure());
  f.reader = reader(); const reopened = stableRead(f.proof, 'CACHED_SUCCESS');
  assert.deepEqual(reopened, first); assert.notEqual(reopened.originalRequest, first.originalRequest);
  diagnostic(t, 'CACHED_SUCCESS_AND_REOPEN');
});

test('backend original read retains uncertainty and close fencing and refuses corrupt schema', OPTIONS, t => {
  const unknownRequest = requestFor(f.grant.grantId, 'uncertain-original'), prepared = prepare(unknownRequest);
  f.store.persistDurableExecutionFence({ expectedRevision: revision(), executionId: prepared.execution.executionId });
  const unknown = f.store.markDurableExecutionUnknown({ expectedRevision: revision(), executionId: prepared.execution.executionId,
    reason: 'DISCONNECTED' });
  assert.equal(unknown.winner, 'OUTCOME_UNKNOWN');
  const proof = envelope(f.key, unknownRequest), value = stableRead(proof, 'OUTCOME_UNKNOWN');
  assert.equal(value.execution.uncertaintyReason, 'DISCONNECTED'); assert.equal(value.cachedResult, null);
  stableRead(envelope(f.key, requestFor(f.grant.grantId, 'still-not-recorded')), 'NOT_RECORDED');
  const beforeClose = f.store.load(); let nested;
  f.hook = () => { nested = f.reader.read(proof); assert.equal(f.reader.close().status, 'CLOSED'); };
  try { assert.equal(stableRead(proof, 'CLOSED').originalRequest, null); } finally { f.hook = null; }
  assert.equal(nested.status, 'UNAVAILABLE'); assert.deepEqual(f.store.load(), beforeClose);
  f.reader = reader(); stableRead(proof, 'OUTCOME_UNKNOWN');
  const raw = new DatabaseSync(databasePath, { allowExtension: false }); f.rawOpens += 1;
  try { raw.exec('CREATE TABLE synthetic_corruption (value TEXT)'); }
  finally { raw.close(); f.rawCloses += 1; }
  const refused = f.reader.read(proof); assert.equal(refused.status, 'UNAVAILABLE');
  assert.equal(refused.revision, null); assert.equal(refused.originalRequest, null); assert.equal(refused.cachedResult, null);
  assert.equal(f.reader.close().status, 'CLOSED'); assert.equal(f.reader.close().status, 'CLOSED');
  f.store.close(); f.store = null; f.reader = null;
  diagnostic(t, 'UNCERTAINTY_CLOSE_AND_CORRUPTION');
});
