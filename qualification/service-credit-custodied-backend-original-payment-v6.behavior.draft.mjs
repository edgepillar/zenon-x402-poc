// Two selected V6 backend cases on TWO new private synthetic SQLite files.
// Synthetic capability Ed25519 proofs stay in memory; no SDK/socket/payment signer.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { constants, lstatSync, openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = "qualification/service-credit-custodied-backend-original-payment-v6.behavior.draft.mjs";
const SPECS = [
  [
    "src/service-credit-custodied-backend-recovery-client.js",
    30113,
    609,
    "535071f8fe671c16eeb35ab25bf99f12c5d3aa1b9b0f07e0cbbcfb6345220e34"
  ],
  [
    "src/service-credit-sqlite-store.js",
    83516,
    2366,
    "eea4032830dc1f641c4832e0dab33066633ba487eaf19581e3295cf8810460f3"
  ],
  [
    "src/service-credit-durable-http-session.js",
    13978,
    425,
    "a0d6d1436cdb697f125fee2f4dc723a5ddcfd2ee7063b55d56fa006bb8ba69bf"
  ],
  [
    "package.json",
    1413,
    40,
    "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
  ],
  [
    "src/service-credit-custodied-http-client.js",
    12646,
    324,
    "35997f41c9a5162fe29ed56776181a1691c0a0a69c7dbdfe8b61785af3998145"
  ],
  [
    "src/service-credit-custodied-sqlite-http-client.js",
    22706,
    578,
    "a66cfeccbf4e4490d939d006525a400f7dd7eac56911080c54c38ccc8e3374cd"
  ],
  [
    "src/service-credit-pilot-original-payment-checkpoint.js",
    4003,
    89,
    "930905f31824a6cadc16dfb84572cd4dc38a81e2fce4569b73b6bef29dec97d1"
  ],
  [
    "src/service-credit-custodied-sqlite-recovery-reader.js",
    5907,
    139,
    "75c3331bde079c811debe066c629e8f61aea75d6973542b8d0648cf36045bf30"
  ],
  [
    "src/service-credit-backend-original-outcome-reader.js",
    7738,
    182,
    "dadd9cbfbdcc2ff4bb24252fed85a135d2ce17397e713b1917a109eb6b28938d"
  ],
  [
    "src/service-credit-custodied-sequential-runner-core.js",
    15983,
    492,
    "044477cb1300453f10bacf070037db175d08deec1d488549b34a5cb92e6328bd"
  ],
  [
    "src/service-credit-original-request-custody-contract.js",
    14051,
    356,
    "fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"
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
    "src/service-credit-durable-execution-owner.js",
    40833,
    1301,
    "a63a795dda77489f7da0682d83a0683cf07240f83b803f449668cb687a956863"
  ],
  [
    "src/service-credit-http.js",
    32432,
    958,
    "c76a7f1864bdfcd0c26916bf28fba615c8aecf899d53e69467e3ebe7d3353d0d"
  ],
  [
    "src/service-credit-durable-session-close.js",
    2470,
    84,
    "5aae36a7da39ce5b7b9a8da8e9fbda88465cb1e4853dc791520a1df0ab87ede7"
  ],
  [
    "src/service-credit-custodied-request-owner.js",
    55155,
    1358,
    "2ba222760d4a922bf0466d95fd2671076b9d19b8c5fa4ea2cb3c66b1338562eb"
  ],
  [
    "src/service-credit-http-execute-dispatch.js",
    28104,
    790,
    "929881081b22b90b07d3d1c4dc8f873d4d81ee5ae84542d24b7534674f4eb9c0"
  ],
  [
    "src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    83681,
    2042,
    "bea9e00aa6208f776561c975d54640dfb676168dd4d0b44d125c9dc684912c4a"
  ],
  [
    "src/service-credit-custodied-sqlite-sequential-runner.js",
    23370,
    542,
    "6a13fa59532928f707167431c4c769a110d1bba61df5b218db86354934110e6a"
  ],
  [
    "src/service-credit-capability.js",
    8284,
    256,
    "cb2b96d9a2e56c132dd1b4aca8f1c065b244ecd0e7e92f41ea3f4a8c969d17c3"
  ],
  [
    "src/x402-wire.js",
    39886,
    934,
    "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"
  ],
  [
    "src/service-credit-pilot-client-plan.js",
    7483,
    181,
    "73ee3d739de85150039e733234cd0761c228d68de040d1e126902e808a259ac6"
  ],
  [
    "src/service-credit-custodied-recovery-collection-core.js",
    13794,
    306,
    "51d06da70ecccd0cf8b38d650367d1ae903ea86010a5ebeadb682af98e4b890b"
  ],
  [
    "src/service-credit-custodied-recovery-observation-collection-core.js",
    8579,
    213,
    "36b7cece2d436cbfcac5f4299dd6bd30e5eede6ebb2ebe769ae7bf3a6f1a72b4"
  ],
  [
    "src/service-credit-pilot-status-view.js",
    3202,
    60,
    "cf3822d8b9ec4eb4772452ed1888b96d398fd87c1ead44cd155a5acc1a6b66ed"
  ]
];
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.P2_BACKEND_ORIGINAL_V6_OPT_IN, 'synthetic-backend-original-v6-only');
const PINS = JSON.parse(process.env.P2_BACKEND_ORIGINAL_V6_PINS);
const scratch = process.env.SPV_TASK_SCRATCH;
assert.equal(typeof scratch, 'string'); assert.equal(resolve(scratch), scratch);
const root = lstatSync(scratch, { bigint: true });
assert.ok(root.isDirectory() && !root.isSymbolicLink());
assert.equal(root.uid, BigInt(process.getuid())); assert.equal(root.mode & 0o777n, 0o700n);
const FILES = ['backend-original-v6.sqlite', 'payer-backend-original-v6.sqlite'];
for (const name of FILES) assert.throws(() => lstatSync(join(scratch, name)), { code: 'ENOENT' });
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
const sha = b => createHash('sha256').update(b).digest('hex');
function bytes(name, cap) {
  const stat = lstatSync(name, { bigint: true }), identity = ids(stat);
  assert.ok(stat.isFile() && !stat.isSymbolicLink()); assert.equal(stat.nlink, 1n);
  assert.equal(stat.uid, BigInt(process.getuid())); assert.ok(stat.size <= BigInt(cap));
  const fd = openSync(name, constants.O_RDONLY | constants.O_NOFOLLOW);
  const data = Buffer.alloc(Number(stat.size) + 1); let used = 0;
  try {
    assert.deepEqual(ids(fstatSync(fd, { bigint: true })), identity);
    while (used < data.length) {
      const n = readSync(fd, data, used, data.length - used, null); if (!n) break; used += n;
    }
    assert.deepEqual(ids(fstatSync(fd, { bigint: true })), identity);
  } finally { closeSync(fd); }
  assert.equal(used, Number(stat.size)); assert.deepEqual(ids(lstatSync(name, { bigint: true })), identity);
  return { data: data.subarray(0, used), identity };
}
function sources() {
  assert.equal(PINS.length, SPECS.length + 1);
  assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p[0]), ENTRY]);
  let total = 0;
  return PINS.map((pin, index) => {
    const raw = bytes(join(REPO, pin.path), 131072);
    assert.deepEqual(raw.identity, pin.identity); assert.equal(raw.data.length, pin.bytes);
    assert.equal(sha(raw.data), pin.sha256);
    assert.equal(raw.data.filter(c => c === 10).length, pin.LF);
    assert.equal(raw.data.includes(0), false); assert.equal(raw.data.some(c => c > 127), false);
    total += raw.data.length; assert.ok(total <= 786432);
    if (index < SPECS.length) assert.deepEqual([pin.path, pin.bytes, pin.LF, pin.sha256], SPECS[index]);
    return { path: pin.path, identity: pin.identity, bytes: pin.bytes, sha256: pin.sha256 };
  });
}
const sourceBefore = sources();

const { ServiceCreditSqliteStore: Backend } = await import('../src/service-credit-sqlite-store.js');
const {
  openServiceCreditCustodiedSqliteBackendRecoveryClientV6: OPEN_READER,
  openServiceCreditCustodiedSqliteBackendClientV6: OPEN_CLIENT,
  openServiceCreditCustodiedSqliteBackendSequentialRunnerV6: OPEN_RUNNER,
} = await import('../src/service-credit-custodied-backend-recovery-client.js');
const { createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6: CREATE_PAYER }
  = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const { createDurableServiceCreditHttpSession: SESSION } = await import('../src/service-credit-durable-http-session.js');
const { deriveServiceCreditCapabilityCommitment: COMMIT, createServiceCreditCapabilitySigningBytes: SIGNING_BYTES }
  = await import('../src/service-credit-capability.js');
const { captureOriginalPaymentCheckpoint: CAPTURE, encodeOriginalPaymentCheckpoint: ENCODE }
  = await import('../src/service-credit-pilot-original-payment-checkpoint.js');
const { DatabaseSync } = await import('node:sqlite');
const FUNDING = 'https://backend-original-v6.invalid/funding';
const SERVICE = 'https://backend-original-v6.invalid/service-credit/v1/execute';
const HASH = 'a'.repeat(64), EMPTY = 'sha256:' + sha(Buffer.alloc(0));
const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 8, serviceResourceUrl: SERVICE });
const RP = 'SERVICE_CREDIT_CUSTODIED_BACKEND_RECOVERY_';
const XP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const SP = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_';
const OPTIONS = { timeout: 5000, concurrency: false };
const clone = x => JSON.parse(JSON.stringify(x)), b64 = x => Buffer.from(x).toString('base64');
function freeze(x) {
  if (x !== null && typeof x === 'object') { for (const v of Object.values(x)) freeze(v); Object.freeze(x); }
  return x;
}
function canonical(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
}
const f = { backend: null, session: null, key: null, grant: null, requests: [], headers: [], inputs: [],
  active: null, handlers: [], transportCalls: 0, unitCalls: 0, queries: 0, queryChanges: 0,
  onQuery: null, timerScheduled: 0, timerCancelled: 0, tokens: new Set(), order: [],
  strictReplies: 0, responseLosses: 0, proofSignatures: 0, rootOpens: 0, normalCloses: 0,
  unknownCloses: 0, stage: 0 };
const keyOf = r => ({ grantId: r.grantId, requestId: r.requestId });
function request(id) {
  return { modelVersion: 1, grantId: f.grant.grantId, requestId: id, method: 'POST',
    routeId: 'service-credit.execute.v1', canonicalBodyDigest: EMPTY, selectedContentType: 'application/json', maxCostUnits: 1 };
}
function proof(r) {
  f.proofSignatures++;
  const value = { proofVersion: 1, grantId: r.grantId, requestId: r.requestId,
    publicKey: f.key.publicKey.export({ format: 'jwk' }).x, maxCostUnits: 1,
    signature: sign(null, SIGNING_BYTES(r), f.key.privateKey).toString('base64url') };
  return 'ServiceCredit ' + Buffer.from(canonical(value)).toString('base64url');
}
function pairInput() {
  const accepted = { scheme: 'exact', network: 'zenon:testnet', asset: 'synthetic-asset', amount: '1',
    payTo: 'synthetic-payee', maxTimeoutSeconds: 30, extra: { poc: true, settlement: 'account-block',
      paymentFlow: 'upfront', minimumMomentumConfirmations: 2,
      zenonChain: { version: 1, chainIdentifier: '42', genesisMomentumHash: '1'.repeat(64) } } };
  const required = { x402Version: 2, resource: { url: FUNDING }, accepts: [accepted] };
  const payload = { x402Version: 2, resource: { url: FUNDING }, accepted,
    payload: { transaction: { hash: HASH }, intentDigest: '2'.repeat(64) } };
  return freeze({ challenge: { status: 'PAYMENT_REQUIRED', resourceUrl: FUNDING,
    paymentRequiredHeader: b64(JSON.stringify(required)), paymentRequired: required },
    paymentSignatureHeader: b64(JSON.stringify(payload)) });
}
const PAIR = pairInput();
const ORIGINAL = freeze({ binding: { requestId: 'original-funding', paymentHash: HASH,
  origin: new URL(FUNDING).origin, contextId: 'original-context' }, originalBytes: {
    requestBody: '', paymentPayload: PAIR.paymentSignatureHeader,
    paymentRequirements: PAIR.challenge.paymentRequiredHeader,
    context: b64(' { "original": true, "spaces": "retained" }\n'),
  } });
const { checkpoint: CHECKPOINT, pins: INDEPENDENT_PINS } = CAPTURE(ORIGINAL);
const SERIALIZED = ENCODE(CHECKPOINT);
function sameCheckpoint(value) {
  assert.deepEqual(value, CHECKPOINT); assert.equal(ENCODE(value), SERIALIZED);
  assert.equal(value.authorization, 'NONE'); assert.equal(value.originalBytes.requestBody, '');
}
function configuration(dispatch = false) {
  return { databasePath: join(scratch, FILES[1]), allowedRoot: scratch, backendStore: f.backend,
    fundingResourceUrl: FUNDING, custodyPolicy: POLICY, selectedGrantId: f.grant.grantId, deadlineMs: 2000,
    ...(dispatch ? { requestImpl } : {}) };
}
function rootView(c = f.active.c) {
  const snapshot = c.snapshot(); return snapshot.connection ? snapshot.connection.client : snapshot.client;
}
function ownerView() { return rootView().client.owner; }
async function openFrame(kind) {
  assert.equal(f.active, null);
  const factory = kind === 'RUNNER' ? OPEN_RUNNER : kind === 'CLIENT' ? OPEN_CLIENT : OPEN_READER;
  const c = await factory(configuration(kind !== 'READER'));
  f.active = { c, kind, calls: 0 }; f.rootOpens++;
  assert.ok(Object.isFrozen(c));
  assert.equal(rootView(c).resource.ownership, 'OWNED_EXISTING_V6_ORIGINAL_PAYMENT');
  assert.equal(rootView(c).resource.storeCloseAttempts, 0); return c;
}
async function closeFrame(unknown = false) {
  const c = f.active.c, promise = c.close(); assert.equal(c.close(), promise);
  assert.throws(() => c.readOriginalPaymentCheckpoint(INDEPENDENT_PINS), { code: RP + 'CLOSED' });
  assert.throws(() => c.readOriginalBackendRecoveryState(keyOf(f.requests[0]), f.headers[0], INDEPENDENT_PINS),
    { code: RP + 'CLOSED' });
  if (unknown) { await assert.rejects(promise, { code: XP + 'CHILD_OUTCOME_UNKNOWN' }); f.unknownCloses++; }
  else { await promise; f.normalCloses++; }
  const rootViewAfter = rootView(c);
  assert.equal(rootViewAfter.resource.storeCloseAttempts, 1);
  assert.equal(rootViewAfter.resource.storeCloseOutcome, 'RETURNED');
  assert.equal(rootViewAfter.resource.phase, 'RELEASED'); assert.equal(rootViewAfter.resource.slotHeld, false);
  assert.equal(rootViewAfter.close.outcome, unknown ? 'CHILD_UNKNOWN' : 'DRAINED');
  f.active = null;
}
function payerStamp() {
  assert.equal(f.active, null);
  const db = new DatabaseSync(join(scratch, FILES[1]), { readOnly: true, allowExtension: false });
  try { return {
    epoch: db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch,
    state: db.prepare('SELECT * FROM payer_recovery_state').all(),
    checkpoint: db.prepare('SELECT singleton,envelope FROM original_payment_checkpoint').all(),
    originals: db.prepare('SELECT * FROM original_service_requests ORDER BY grant_id,request_id').all(),
    intents: db.prepare('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id').all(),
    observations: db.prepare('SELECT * FROM original_response_observations ORDER BY grant_id,request_id').all(),
    quarantines: db.prepare('SELECT * FROM original_custody_quarantines').all(),
    version: db.prepare('PRAGMA user_version').get().user_version,
  }; } finally { db.close(); }
}
function sameFunding(before, after, opens) {
  assert.equal(after.epoch, before.epoch + opens); assert.equal(after.version, 6);
  assert.deepEqual(after.state, before.state); assert.deepEqual(after.checkpoint, before.checkpoint);
  assert.equal(after.checkpoint[0].envelope, SERIALIZED);
  const state = JSON.parse(after.state[0].envelope);
  assert.equal(state.status, 'BOUND'); assert.equal(state.revision, 3);
  assert.equal(state.paymentHeader, PAIR.paymentSignatureHeader);
  assert.equal(state.challengeHeader, PAIR.challenge.paymentRequiredHeader);
}
function noProofLeak(value) {
  const serialized = JSON.stringify(value);
  for (const header of f.headers) assert.equal(serialized.includes(header), false);
  for (const value of [SERIALIZED, PAIR.paymentSignatureHeader, ORIGINAL.originalBytes.context]) {
    assert.equal(serialized.includes(value), false);
  }
}
function backendRead(c, index, pins = INDEPENDENT_PINS) {
  const ledger = f.backend.load(), queries = f.queries, transports = f.transportCalls, units = f.unitCalls;
  const value = c.readOriginalBackendRecoveryState(keyOf(f.requests[index]), f.headers[index], pins);
  assert.equal(value.status, 'CLIENT_RECONCILIATION_REQUIRED');
  assert.equal(value.backend.status, 'CACHED_SUCCESS');
  assert.equal(value.backend.cachedResult.resultCode, 'synthetic-service-result');
  assert.equal(value.local.original.originalRequestJson, JSON.stringify(f.requests[index]));
  assert.equal(value.local.funding.paymentHash, HASH); assert.equal(value.local.funding.revision, 3);
  assert.notEqual(value.local.dispatchIntent, null);
  assert.equal(value.authority, 'NONE'); assert.equal(value.mayDispatchService, false);
  assert.equal(value.mayStartPayment, false); assert.equal(value.maySignPayment, false);
  assert.equal(value.deliveryConfirmed, false); assert.equal(value.serviceDelivery, 'NOT_ESTABLISHED');
  assert.equal(value.backend.paymentAuthorized, false); assert.equal(value.backend.executionAuthorized, false);
  assert.equal(f.queries, queries + 1); assert.equal(f.transportCalls, transports); assert.equal(f.unitCalls, units);
  assert.equal(f.queryChanges, 0); assert.deepEqual(f.backend.load(), ledger); noProofLeak(value);
  return value;
}
function emitter(request) {
  const listeners = new Map(); let closed = false, ended = false, endAction = null;
  const raw = {
    on(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); return raw; },
    destroy() { if (!closed) { closed = true; emit('close'); } },
    ...(request ? { end(...args) {
      assert.equal(args.length, 0); assert.equal(ended, false); ended = true;
      assert.equal(typeof endAction, 'function'); endAction();
    } } : {}),
  };
  function emit(name, ...args) { for (const fn of listeners.get(name) ?? []) fn(...args); }
  return { raw, emit, setEnd(fn) { endAction = fn; }, close() { raw.destroy(); } };
}
function requestImpl(url, options, onResponse) {
  f.transportCalls++;
  assert.equal(url, SERVICE); assert.equal(options.method, 'POST'); assert.equal(options.agent, false);
  assert.equal(options.rejectUnauthorized, true); assert.deepEqual(Object.keys(options.headers), ['Authorization']);
  const index = f.headers.indexOf(options.headers.Authorization); assert.ok(index >= 0);
  const counts = ownerView().counts, expected = ++f.active.calls;
  assert.equal(counts.retainCalls, expected); assert.equal(counts.readbackConfirmations, expected);
  assert.equal(counts.intentWrites, expected); assert.equal(counts.intentReadbackConfirmations, expected);
  assert.equal(counts.dispatchCalls, expected);
  f.order.push(index);
  const req = emitter(true), headers = new Map();
  const serverResponse = {
    destroyed: false, writableEnded: false, statusCode: 0,
    setHeader(name, value) { headers.set(name, String(value)); },
    end(data) {
      assert.equal(serverResponse.writableEnded, false); serverResponse.writableEnded = true;
      assert.equal(serverResponse.statusCode, 200); assert.ok(Buffer.isBuffer(data)); assert.ok(data.length <= 512);
      if (index === 2) { f.responseLosses++; req.emit('error', Error('synthetic committed reply loss')); return; }
      const res = emitter(false);
      res.raw.statusCode = serverResponse.statusCode;
      res.raw.rawHeaders = [...headers.entries()].flatMap(([k, v]) => [k, v]);
      res.raw.complete = false; onResponse(res.raw); res.emit('data', data);
      res.raw.complete = true; res.emit('end'); f.strictReplies++; res.close(); req.close();
    },
    destroy() { serverResponse.destroyed = true; req.emit('error', Error('synthetic handler failure')); },
  };
  req.setEnd(() => {
    const handled = f.session.handle({ url: '/service-credit/v1/execute', method: 'POST',
      rawHeaders: ['Authorization', options.headers.Authorization] }, serverResponse);
    f.handlers.push(handled);
    f.handlers.push(handled.then(() => { assert.equal(serverResponse.writableEnded, true); },
      () => req.emit('error', Error('synthetic handler rejected'))));
  });
  return req.raw;
}
before(() => {
  f.key = generateKeyPairSync('ed25519');
  const digest = n => 'sha256:' + String(n).repeat(64);
  f.backend = Backend.create({ databasePath: join(scratch, FILES[0]), allowedRoot: scratch,
    deriveCost() { return 1; }, now() { return 1000; }, busyTimeoutMs: 50, maxStateBytes: 65536,
    maxOffers: 2, maxGrants: 2, maxRequests: 8, testHooks: {
      beforeBegin({ operation }) {
        if (operation === 'getOriginalRequestExecutionSnapshot') {
          f.queries++; const action = f.onQuery; f.onQuery = null; if (action !== null) action();
        }
      },
      beforeCommit({ operation, changed }) {
        if (operation === 'getOriginalRequestExecutionSnapshot' && changed) f.queryChanges++;
      },
    } });
  const offer = { modelVersion: 1, providerId: 'synthetic-provider', serviceId: 'synthetic-service',
    resourceId: 'synthetic-resource', resourceBinding: digest(1), offerId: 'backend-original-v6-offer',
    offerVersion: 1, costPolicyId: 'synthetic-unit', fundingPolicyId: 'synthetic-funding', fundingPolicyVersion: 1 };
  f.backend.registerOffer(offer);
  // Privileged synthetic DATA setup, NOT live activation or verified funding.
  f.grant = f.backend.activateGrantFromTrustedRecord({
    activationVersion: 2, evidenceVersion: 1, inclusionAuthorizationDigest: digest(7),
    authorityProfileId: 'synthetic-authority', authorityProfileVersion: 1, verifierVersion: 1,
    authorityRecordDigest: digest(2), fundingPolicyId: offer.fundingPolicyId, fundingPolicyVersion: 1,
    sourceSettlementId: 'synthetic-settlement', transactionId: 'zenontx:' + HASH,
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
  f.backend.initializeDurableExecution({ expectedRevision: f.backend.load().revision,
    ledgerId: 'synthetic-backend-original-v6-ledger',
    policy: { policyId: 'synthetic-deadline', policyVersion: 1, maxDurationMs: 1000 }, capacity: 8 });
  f.requests = ['client-success','runner-success','runner-lost-reply','runner-unattempted-tail'].map(request);
  f.headers = f.requests.map(proof);
  f.inputs = f.requests.map((r, i) => freeze({ grantId: r.grantId, requestId: r.requestId,
    originalRequestJson: JSON.stringify(r), originalBodyBase64: '', serviceResourceUrl: SERVICE,
    authorizationHeader: f.headers[i] }));
  const payer = CREATE_PAYER({ databasePath: join(scratch, FILES[1]), allowedRoot: scratch,
    resourceUrl: FUNDING, custodyPolicy: POLICY });
  try {
    payer.prepareWithOriginalPaymentCheckpoint({ pair: PAIR, serializedCheckpoint: SERIALIZED, expectedPins: INDEPENDENT_PINS });
    payer.fenceAttempt('PREPARED'); assert.equal(payer.finishAttempt('BOUND').revision, 3);
  } finally { payer.close(); }
  f.session = SESSION({ store: f.backend, admittedGrantId: f.grant.grantId, selectedDurationMs: 1000,
    execute() { f.unitCalls++; return { resultCode: 'synthetic-service-result' }; },
    deadlineRuntime: {
      monotonicNowNs() { return 0n; },
      schedule(callback, delayMs) {
        assert.equal(typeof callback, 'function'); assert.ok(Number.isSafeInteger(delayMs) && delayMs > 0);
        const token = {}; f.tokens.add(token); f.timerScheduled++; return token;
      },
      cancel(token) { assert.equal(f.tokens.delete(token), true); f.timerCancelled++; },
    } });
});

test("V6 backend client binds independent original-payment pins around an actual backend result", OPTIONS, async t => {
  assert.equal(f.stage, 0);
  const before = payerStamp(), c = await openFrame('CLIENT');
  sameCheckpoint(c.readOriginalPaymentCheckpoint(INDEPENDENT_PINS));
  const queries = f.queries;
  assert.throws(() => c.readOriginalBackendRecoveryState(keyOf(f.requests[0]), f.headers[0]),
    { code: RP + 'INVALID_INPUT' });
  assert.equal(f.queries, queries); assert.equal(c.snapshot().unavailable, false);
  assert.equal(await c.submitOriginal(f.inputs[0]), undefined); await Promise.all(f.handlers);
  const mutablePins = clone(INDEPENDENT_PINS);
  f.onQuery = () => {
    mutablePins.binding.contextId = 'changed-by-trusted-query-hook';
    mutablePins.digests.context = '0'.repeat(64);
  };
  const outcome = backendRead(c, 0, mutablePins);
  assert.equal(mutablePins.binding.contextId, 'changed-by-trusted-query-hook');
  assert.equal(outcome.local.responseStatus, 'LOCAL_DECLARED_SUCCESS_RESPONSE_OBSERVED');
  sameCheckpoint(c.readOriginalPaymentCheckpoint(INDEPENDENT_PINS));
  const wrong = clone(INDEPENDENT_PINS); wrong.binding.contextId = 'wrong-original';
  const beforeWrong = f.queries;
  assert.throws(() => c.readOriginalBackendRecoveryState(keyOf(f.requests[0]), f.headers[0], wrong),
    { code: SP + 'ORIGINAL_PAYMENT_CHECKPOINT_MISMATCH' });
  assert.equal(f.queries, beforeWrong); assert.equal(c.snapshot().unavailable, true);
  await assert.rejects(c.submitOriginal(f.inputs[1]), { code: RP + 'UNAVAILABLE' });
  sameCheckpoint(c.readOriginalPaymentCheckpoint(INDEPENDENT_PINS));
  noProofLeak(c.snapshot());
  await closeFrame();
  const after = payerStamp(); sameFunding(before, after, 1);
  assert.equal(after.originals.length, 1); assert.equal(after.intents.length, 1);
  assert.equal(after.observations.length, 1); assert.equal(after.quarantines.length, 0);
  assert.equal(f.backend.getGrant(f.grant.grantId).consumedUnits, 1);
  assert.equal(f.transportCalls, 1); assert.equal(f.unitCalls, 1);
  t.diagnostic(JSON.stringify({ scenario: 'V6_BACKEND_PINNED_CLIENT', source: 'ACTUAL_LOCAL_BACKEND_AND_OWNER',
    checkpointMatched: true, pinnedWitnessSurvivedMutableCallerPins: true, missingPinsRefusedBeforeQuery: true,
    wrongPinsLatchedConnectionOnly: true, backendCachedSuccessIsDelivery: false,
    modelledTransportCalls: 1, modelledServiceExecutions: 1, backendQueryWrites: 0,
    originalFundingRevision: 3, normalOwnedClose: 1, paymentAuthority: 'NONE', realRestart: 'NOT_RUN' }));
  f.stage = 1;
});
test("V6 backend runner retains same-payment custody and UNKNOWN across normal no-dispatch reopen", OPTIONS, async t => {
  assert.equal(f.stage, 1);
  const before = payerStamp(), runner = await openFrame('RUNNER');
  sameCheckpoint(runner.readOriginalPaymentCheckpoint(INDEPENDENT_PINS));
  assert.equal('submitOriginal' in runner, false);
  assert.equal(runner.snapshot().runner.storeOwnership, 'OWNED_EXISTING_V6_ORIGINAL_PAYMENT');
  const batch = f.inputs.slice(1), run = runner.runOriginals(batch);
  assert.equal(runner.runOriginals(batch), run);
  await assert.rejects(run, { code: 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_RUN_FAILED' });
  await Promise.all(f.handlers);
  const sequence = runner.snapshot().runner;
  assert.equal(sequence.planned, 3); assert.equal(sequence.attempted, 2);
  assert.equal(sequence.completed, 1); assert.equal(sequence.notAttempted, 1);
  assert.equal(sequence.queuedReferences, 0); assert.equal(sequence.unknown, true);
  assert.equal(sequence.closeCalls, 1);
  await closeFrame(true);
  const uncertain = payerStamp(); sameFunding(before, uncertain, 1);
  assert.equal(uncertain.originals.length, 3); assert.equal(uncertain.intents.length, 3);
  assert.equal(uncertain.observations.length, 2); assert.equal(uncertain.quarantines.length, 1);
  assert.equal(uncertain.originals.some(r => r.request_id === f.requests[3].requestId), false);
  const ledger = f.backend.load(), grant = f.backend.getGrant(f.grant.grantId);
  assert.equal(grant.consumedUnits, 3); assert.equal(grant.availableUnits, 7); assert.equal(grant.heldUnits, 0);
  assert.equal(f.backend.getRequest(keyOf(f.requests[3])), null);
  const reader = await openFrame('READER');
  for (const name of ['submitOriginal','runOriginals','requestImpl','store','backendStore','sign','pay']) {
    assert.equal(name in reader, false);
  }
  sameCheckpoint(reader.readOriginalPaymentCheckpoint(INDEPENDENT_PINS));
  const recovered = backendRead(reader, 2);
  assert.equal(recovered.local.responseStatus, 'NOT_OBSERVED');
  assert.equal(recovered.local.uncertainty.custody, true);
  assert.equal(recovered.local.dispatchStatus, 'POSSIBLY_ATTEMPTED');
  assert.equal(f.transportCalls, 3); assert.equal(f.unitCalls, 3);
  assert.deepEqual(f.order, [0,1,2]); assert.equal(f.strictReplies, 2); assert.equal(f.responseLosses, 1);
  assert.deepEqual(f.backend.load(), ledger); noProofLeak(reader.snapshot());
  await closeFrame(true);
  const final = payerStamp(); sameFunding(uncertain, final, 1);
  for (const key of ['originals','intents','observations','quarantines']) assert.deepEqual(final[key], uncertain[key]);
  assert.equal(f.proofSignatures, 4); assert.equal(f.rootOpens, 3);
  assert.equal(f.normalCloses, 1); assert.equal(f.unknownCloses, 2);
  t.diagnostic(JSON.stringify({ scenario: 'V6_BACKEND_RUNNER_UNKNOWN_REOPEN', source: 'ACTUAL_LOCAL_BACKEND_AND_OWNER',
    checkpointMatched: true, queuedTailAttempted: false, runnerPlanned: 3, runnerAttempted: 2, runnerCompleted: 1,
    retainedOriginals: 3, retainedIntents: 3, retainedResponseObservations: 2, retainedQuarantines: 1,
    modelledTransportCalls: 3, modelledServiceExecutions: 3, backendQueryWrites: 0,
    originalFundingRevision: 3, originalCapabilityProofsRetained: true, capabilitySignaturesInMemory: 4,
    oneOwnerPerOpen: true, normalOwnedCloses: 1, unknownOwnedCloses: 2,
    noDispatchRecoveryReopen: true, realRestart: 'NOT_RUN', delivery: 'NOT_ESTABLISHED', paymentAuthority: 'NONE' }));
  f.stage = 2;
});
after(async () => {
  if (f.active !== null) {
    try { await f.active.c.close(); } catch {}
    f.active = null;
  }
  if (f.handlers.length) await Promise.all(f.handlers);
  if (f.session !== null) { await f.session.close(); f.session = null; }
  if (f.backend !== null) { f.backend.close(); f.backend = null; }
  f.key = null;
  assert.equal(f.stage, 2); assert.equal(f.tokens.size, 0);
  assert.equal(f.timerScheduled, f.timerCancelled); assert.equal(f.queryChanges, 0);
  assert.deepEqual(sources(), sourceBefore);
  for (const name of FILES) {
    const found = bytes(join(scratch, name), 1048576);
    assert.equal(BigInt(found.identity[4]) & 0o777n, 0o600n);
    for (const suffix of ['-journal','-wal','-shm']) {
      assert.throws(() => lstatSync(join(scratch, name + suffix)), { code: 'ENOENT' });
    }
  }
});
