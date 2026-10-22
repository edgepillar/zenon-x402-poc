// Two selected cases, TWO new private synthetic SQLite files. No real payment,
// signer, SDK, network, crash, OS restart, migration or default-path cutover.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants, lstatSync, openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = "qualification/service-credit-original-payment-sqlite-v6.behavior.draft.mjs";
const SPECS = [
  [
    "src/service-credit-custodied-sqlite-http-client.js",
    22706,
    578,
    "a66cfeccbf4e4490d939d006525a400f7dd7eac56911080c54c38ccc8e3374cd"
  ],
  [
    "package.json",
    1413,
    40,
    "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
  ],
  [
    "src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    83681,
    2042,
    "bea9e00aa6208f776561c975d54640dfb676168dd4d0b44d125c9dc684912c4a"
  ],
  [
    "src/service-credit-custodied-http-client.js",
    12646,
    324,
    "35997f41c9a5162fe29ed56776181a1691c0a0a69c7dbdfe8b61785af3998145"
  ],
  [
    "src/service-credit-original-request-custody-contract.js",
    14051,
    356,
    "fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"
  ],
  [
    "src/service-credit-pilot-original-payment-checkpoint.js",
    4003,
    89,
    "930905f31824a6cadc16dfb84572cd4dc38a81e2fce4569b73b6bef29dec97d1"
  ],
  [
    "src/x402-wire.js",
    39886,
    934,
    "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"
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
  ]
];
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.P2_ORIGINAL_PAYMENT_V6_OPT_IN, 'synthetic-original-payment-v6-only');
const PINS = JSON.parse(process.env.P2_ORIGINAL_PAYMENT_V6_PINS);
const scratch = process.env.SPV_TASK_SCRATCH;
assert.equal(typeof scratch, 'string'); assert.equal(resolve(scratch), scratch);
const root = lstatSync(scratch, { bigint: true });
assert.ok(root.isDirectory() && !root.isSymbolicLink());
assert.equal(root.uid, BigInt(process.getuid())); assert.equal(root.mode & 0o777n, 0o700n);
const FILES = ['original-payment-v6.sqlite', 'legacy-payment-v5.sqlite'];
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
    total += raw.data.length; assert.ok(total <= 393216);
    if (index < SPECS.length) assert.deepEqual([pin.path, pin.bytes, pin.LF, pin.sha256], SPECS[index]);
    return { path: pin.path, identity: pin.identity, bytes: pin.bytes, sha256: pin.sha256 };
  });
}
const sourceBefore = sources();
const {
  createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6: CREATE6,
  openZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6: OPEN6,
  createZenonFundingPayerRecoveryResponseObservationSqliteStoreV5: CREATE5,
  openZenonFundingPayerRecoveryResponseObservationSqliteStoreV5: OPEN5,
} = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const {
  openServiceCreditCustodiedSqliteHttpClientV6: CLIENT6,
  openServiceCreditCustodiedSqliteHttpClientV5: CLIENT5,
} = await import('../src/service-credit-custodied-sqlite-http-client.js');
const { captureOriginalPaymentCheckpoint: CAPTURE, encodeOriginalPaymentCheckpoint: ENCODE }
  = await import('../src/service-credit-pilot-original-payment-checkpoint.js');
const { DatabaseSync } = await import('node:sqlite');
const FUNDING = 'https://original-payment-v6.invalid/funding';
const SERVICE = 'https://original-payment-v6.invalid/service-credit/v1/execute';
const HASH = 'a'.repeat(64);
const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 2, serviceResourceUrl: SERVICE });
const PREFIX = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_';
const XP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const OPTIONS = { timeout: 5000, concurrency: false };
const b64 = x => Buffer.from(x).toString('base64'), clone = x => JSON.parse(JSON.stringify(x));
function pair() {
  const accepted = { scheme: 'exact', network: 'zenon:testnet', asset: 'synthetic-asset',
    amount: '1', payTo: 'synthetic-payee', maxTimeoutSeconds: 30,
    extra: { poc: true, settlement: 'account-block', paymentFlow: 'upfront', minimumMomentumConfirmations: 2,
      zenonChain: { version: 1, chainIdentifier: '42', genesisMomentumHash: '1'.repeat(64) } } };
  const required = { x402Version: 2, resource: { url: FUNDING }, accepts: [accepted] };
  const payload = { x402Version: 2, resource: { url: FUNDING }, accepted,
    payload: { transaction: { hash: HASH }, intentDigest: '2'.repeat(64) } };
  return { challenge: { status: 'PAYMENT_REQUIRED', resourceUrl: FUNDING,
    paymentRequiredHeader: b64(JSON.stringify(required)), paymentRequired: required },
    paymentSignatureHeader: b64(JSON.stringify(payload)) };
}
const PAIR = pair();
const ORIGINAL = {
  binding: { requestId: 'original-funding-request', paymentHash: HASH,
    origin: new URL(FUNDING).origin, contextId: 'original-settlement-context' },
  originalBytes: { requestBody: '', paymentPayload: PAIR.paymentSignatureHeader,
    paymentRequirements: PAIR.challenge.paymentRequiredHeader,
    context: b64(' { "declared": true, "keep": "spacing" }\n') },
};
const { checkpoint: CHECKPOINT, pins: INDEPENDENT_PINS } = CAPTURE(ORIGINAL);
const SERIALIZED = ENCODE(CHECKPOINT);
function storeOptions(name, extra = {}) {
  return { databasePath: join(scratch, name), allowedRoot: scratch,
    resourceUrl: FUNDING, custodyPolicy: POLICY, ...extra };
}
let transportCalls = 0, owned = null, raw = null, rawDb = null, closes = 0;
function requestImpl() { transportCalls++; throw Error('UNEXPECTED_TRANSPORT'); }
function clientOptions(name) {
  return { databasePath: join(scratch, name), allowedRoot: scratch,
    fundingResourceUrl: FUNDING, custodyPolicy: POLICY, selectedGrantId: 'synthetic-grant',
    deadlineMs: 1000, requestImpl };
}
function prepareInput(serialized = SERIALIZED, pins = INDEPENDENT_PINS) {
  return { pair: PAIR, serializedCheckpoint: serialized, expectedPins: pins };
}
function refuses(fn, suffix) { assert.throws(fn, { code: PREFIX + suffix }); }
function sameOriginal(actual) {
  assert.deepEqual(actual, CHECKPOINT); assert.equal(ENCODE(actual), SERIALIZED);
  assert.equal(actual.authorization, 'NONE');
  assert.equal(actual.originalBytes.requestBody, '');
  for (const field of Object.keys(ORIGINAL.originalBytes)) {
    assert.equal(actual.originalBytes[field], ORIGINAL.originalBytes[field]);
    assert.equal(actual.digests[field], sha(Buffer.from(ORIGINAL.originalBytes[field], 'base64')));
  }
  for (const value of [actual, actual.binding, actual.originalBytes, actual.digests]) {
    assert.ok(Object.isFrozen(value));
  }
}
function fileSha(name) { return sha(bytes(join(scratch, name), 1048576).data); }
function withDb(name, operation) {
  rawDb = new DatabaseSync(join(scratch, name), { allowExtension: false });
  try { return operation(rawDb); } finally { rawDb.close(); rawDb = null; }
}
function unchangedRefusal(name, fn, suffix) {
  const before = fileSha(name); refuses(fn, suffix); assert.equal(fileSha(name), before);
}
function stamp(name) {
  return withDb(name, db => ({
    epoch: db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch,
    version: db.prepare('PRAGMA user_version').get().user_version,
    state: db.prepare('SELECT * FROM payer_recovery_state').all(),
    definitions: db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
  }));
}
async function closeOwned() {
  const owner = owned, promise = owner.close();
  assert.equal(owner.close(), promise);
  assert.throws(() => owner.readOriginalPaymentCheckpoint(INDEPENDENT_PINS), { code: XP + 'CLOSED' });
  await promise;
  const view = owner.snapshot();
  assert.equal(view.resource.storeCloseAttempts, 1); assert.equal(view.resource.storeCloseOutcome, 'RETURNED');
  assert.equal(view.resource.phase, 'RELEASED'); assert.equal(view.close.outcome, 'DRAINED');
  assert.equal(view.currentAuthority, 'NOT_ESTABLISHED'); closes++; owned = null;
}
test("V6 atomically retains original payment and exposes pinned no-send reads across normal reopen", OPTIONS, async t => {
  const name = FILES[0]; let rollbackOnce = true;
  raw = CREATE6(storeOptions(name, { testHooks: {
    beforeCommit(method) {
      if (method === 'prepareWithOriginalPaymentCheckpoint' && rollbackOnce) {
        rollbackOnce = false; throw Error('SYNTHETIC_BEFORE_COMMIT');
      }
    },
  } }));
  assert.equal(raw.load(), null); assert.equal(raw.getOriginalPaymentCheckpoint(INDEPENDENT_PINS), null);
  refuses(() => raw.prepare(PAIR), 'ORIGINAL_PAYMENT_CHECKPOINT_REQUIRED');
  refuses(() => raw.getOriginalPaymentCheckpoint({}), 'INVALID_INPUT');
  let proxyTraps = 0;
  const proxy = new Proxy(INDEPENDENT_PINS, { getPrototypeOf() { proxyTraps++; throw Error('trap'); } });
  refuses(() => raw.getOriginalPaymentCheckpoint(proxy), 'INVALID_INPUT'); assert.equal(proxyTraps, 0);
  for (const [group, field, value] of [
    ['binding','paymentHash','b'.repeat(64)], ['binding','origin','https://other.invalid'],
    ['originalBytes','paymentPayload',b64('{}')], ['originalBytes','paymentRequirements',b64('{}')],
  ]) {
    const input = clone(ORIGINAL); input[group][field] = value;
    const changed = CAPTURE(input);
    refuses(() => raw.prepareWithOriginalPaymentCheckpoint(prepareInput(ENCODE(changed.checkpoint), changed.pins)), 'INVALID_INPUT');
    assert.equal(raw.load(), null);
  }
  refuses(() => raw.prepareWithOriginalPaymentCheckpoint(prepareInput(SERIALIZED + '\n')), 'INVALID_INPUT');
  refuses(() => raw.prepareWithOriginalPaymentCheckpoint(prepareInput()), 'TRANSACTION_FAILED');
  assert.equal(raw.load(), null); assert.equal(raw.getOriginalPaymentCheckpoint(INDEPENDENT_PINS), null);
  const first = raw.prepareWithOriginalPaymentCheckpoint(prepareInput());
  assert.equal(first.status, 'PREPARED'); assert.equal(first.revision, 1); assert.equal(first.ambiguityLatched, false);
  sameOriginal(raw.getOriginalPaymentCheckpoint(INDEPENDENT_PINS));
  const changedInput = clone(ORIGINAL); changedInput.originalBytes.context = b64('changed original context\n');
  const changed = CAPTURE(changedInput), changedText = ENCODE(changed.checkpoint);
  refuses(() => raw.prepareWithOriginalPaymentCheckpoint(prepareInput(changedText, changed.pins)), 'CONFLICT');
  refuses(() => raw.getOriginalPaymentCheckpoint(changed.pins), 'ORIGINAL_PAYMENT_CHECKPOINT_MISMATCH');
  sameOriginal(raw.getOriginalPaymentCheckpoint(INDEPENDENT_PINS));
  assert.deepEqual(raw.prepareWithOriginalPaymentCheckpoint(prepareInput()), first);
  assert.equal(raw.fenceAttempt('PREPARED').revision, 2);
  const unknown = raw.finishAttempt('OUTCOME_UNKNOWN');
  assert.equal(unknown.revision, 3); assert.equal(unknown.ambiguityLatched, true);
  raw.close(); raw = null;
  unchangedRefusal(name, () => OPEN5(storeOptions(name)), 'SCHEMA_UNSUPPORTED');
  const beforeOwner = stamp(name);
  owned = CLIENT6(clientOptions(name));
  assert.equal(owned.snapshot().resource.ownership, 'OWNED_EXISTING_V6_ORIGINAL_PAYMENT');
  sameOriginal(owned.readOriginalPaymentCheckpoint(INDEPENDENT_PINS));
  assert.equal('prepareWithOriginalPaymentCheckpoint' in owned, false);
  assert.equal('store' in owned, false);
  const view = JSON.stringify(owned.snapshot());
  for (const value of [PAIR.paymentSignatureHeader, SERIALIZED, ORIGINAL.originalBytes.context]) {
    assert.equal(view.includes(value), false);
  }
  await closeOwned();
  const afterOwner = stamp(name);
  assert.equal(afterOwner.epoch, beforeOwner.epoch + 1);
  for (const key of ['version','state','definitions']) assert.deepEqual(afterOwner[key], beforeOwner[key]);
  raw = OPEN6(storeOptions(name));
  assert.deepEqual(raw.load(), unknown);
  assert.deepEqual(raw.prepareWithOriginalPaymentCheckpoint(prepareInput()), unknown);
  sameOriginal(raw.getOriginalPaymentCheckpoint(INDEPENDENT_PINS));
  raw.close(); raw = null;
  // Authorized corruption of this NEW synthetic file only. A self-consistent
  // local rewrite is not authentication: independent original pins still fail.
  withDb(name, db => db.prepare('UPDATE original_payment_checkpoint SET envelope=? WHERE singleton=1').run(changedText));
  raw = OPEN6(storeOptions(name));
  refuses(() => raw.getOriginalPaymentCheckpoint(INDEPENDENT_PINS), 'ORIGINAL_PAYMENT_CHECKPOINT_MISMATCH');
  assert.equal(raw.getOriginalPaymentCheckpoint(changed.pins).originalBytes.context, changedInput.originalBytes.context);
  assert.deepEqual(raw.load(), unknown); raw.close(); raw = null;
  withDb(name, db => db.prepare('DELETE FROM original_payment_checkpoint WHERE singleton=1').run());
  unchangedRefusal(name, () => OPEN6(storeOptions(name)), 'CORRUPT');
  assert.equal(transportCalls, 0);
  t.diagnostic(JSON.stringify({ scenario: 'V6_ORIGINAL_PAYMENT', rollbackPairAndCheckpoint: true,
    exactOriginalReadback: true, externalPinsRequired: true, schema: 6,
    unknownRevision: 3, ambiguityLatched: true, ordinaryOwnedClose: 1,
    modelledTransportCalls: 0, missingCheckpointRefusedUnchanged: true,
    realRestart: 'NOT_RUN', paymentAuthority: 'NONE' }));
});
test("V5 remains explicit and V6 refuses V5 unchanged", OPTIONS, async t => {
  const name = FILES[1];
  raw = CREATE5(storeOptions(name));
  refuses(() => raw.prepareWithOriginalPaymentCheckpoint(prepareInput()), 'ORIGINAL_PAYMENT_CHECKPOINT_NOT_ENABLED');
  refuses(() => raw.getOriginalPaymentCheckpoint(INDEPENDENT_PINS), 'ORIGINAL_PAYMENT_CHECKPOINT_NOT_ENABLED');
  const first = raw.prepare(PAIR);
  assert.equal(first.revision, 1); assert.deepEqual(raw.prepare(PAIR), first);
  raw.close(); raw = null;
  const original = stamp(name);
  assert.equal(original.version, 5);
  unchangedRefusal(name, () => OPEN6(storeOptions(name)), 'SCHEMA_UNSUPPORTED');
  const beforeWrongOwner = fileSha(name);
  assert.throws(() => CLIENT6(clientOptions(name)), { code: XP + 'ACQUISITION_FAILED' });
  assert.equal(fileSha(name), beforeWrongOwner);
  assert.deepEqual(stamp(name), original);
  owned = CLIENT5(clientOptions(name));
  assert.equal('readOriginalPaymentCheckpoint' in owned, false);
  assert.equal(owned.snapshot().resource.ownership, 'OWNED_EXISTING_V5_RESPONSE_OBSERVATION');
  const promise = owned.close(); assert.equal(owned.close(), promise); await promise;
  assert.equal(owned.snapshot().resource.storeCloseAttempts, 1);
  assert.equal(owned.snapshot().resource.phase, 'RELEASED'); closes++; owned = null;
  const last = stamp(name); assert.equal(last.epoch, original.epoch + 1);
  for (const key of ['version','state','definitions']) assert.deepEqual(last[key], original[key]);
  assert.equal(transportCalls, 0);
  t.diagnostic(JSON.stringify({ scenario: 'V5_VERSION_BOUNDARY', schema: 5,
    wrongVersionStoreAndOwnerRefusedUnchanged: true, v5PairPreparePreserved: true,
    v5CheckpointSurface: false, ordinaryOwnedClose: 1, modelledTransportCalls: 0,
    migration: 'NONE', hostedCI: 'NOT_RUN' }));
});
after(async () => {
  if (rawDb !== null) { rawDb.close(); rawDb = null; }
  if (raw !== null) { raw.close(); raw = null; }
  if (owned !== null) { await owned.close(); owned = null; }
  assert.equal(transportCalls, 0); assert.equal(closes, 2);
  for (const name of FILES) {
    const found = bytes(join(scratch, name), 1048576);
    assert.equal(BigInt(found.identity[4]) & 0o777n, 0o600n);
    for (const suffix of ['-journal','-wal','-shm']) {
      assert.throws(() => lstatSync(join(scratch, name + suffix)), { code: 'ENOENT' });
    }
  }
  assert.deepEqual(sources(), sourceBefore);
});
