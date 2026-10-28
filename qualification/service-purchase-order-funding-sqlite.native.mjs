// Native fixture source. No execution is authorized by a syntax-only check.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  createNewPurchasedOrderFundingSqliteStore as create, openExistingPurchasedOrderFundingSqliteStore as reopen,
} from '../src/service-purchase-order-funding-sqlite-store.js';
import { capturePurchasedOrderPayment, createPurchasedOrderFundingOwner as createOwner } from '../src/service-purchase-order-funding.js';
import {
  claimPurchasedOrderFundingOwnership as claim, releasePurchasedOrderFundingOwnership as release,
  createPurchasedOrderFundingReceiptPort as receiptPort, inspectPurchasedOrderFundingEnvelope as inspect,
} from '../src/service-purchase-order-funding-cas-contract.js';
import { orderFundingFixture as fixture, orderFundingOwnerInputs as inputs, orderFundingProof as proof, NOW } from './service-purchase-order-funding.fixture.mjs';

assert.equal(process.versions.node, '24.19.0'); assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.X402_ORDER_FUNDING_NATIVE_PRELOADED, 'source-pins-verified');
assert.equal(process.argv.length, 4); const root = process.argv[2], mode = process.argv[3];
assert.ok(['write', 'reopen'].includes(mode)); assert.equal(root, path.resolve(root)); assert.equal(process.env.SPV_TASK_SCRATCH, root);
for (let at = root; ; at = path.dirname(at)) { assert.equal(lstatSync(at).isSymbolicLink(), false); if (at === path.dirname(at)) break; }
const rs = lstatSync(root); assert.ok(rs.isDirectory()); assert.equal(rs.uid, process.getuid()); assert.equal(rs.mode & 0o777, 0o700);
process.umask(0o077);
for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_V8_COVERAGE']) assert.equal(process.env[key], undefined);
const storeId = 'store.order.native.1', limits = { maxRecords: 1 }, initialFixture = fixture();
const captured = capturePurchasedOrderPayment(...inputs(initialFixture));
const token = JSON.stringify({ version: 1, storeId, orderId: captured.orderId, paymentScope: captured.paymentScope, ownerId: 'worker.3', epoch: 3 });
const pinText = JSON.stringify({ fixture: initialFixture, storeId, limits, finalOwnerTokenJson: token });
const names = ['order-funding-a.sqlite', 'order-funding-b.sqlite', 'order-funding-pins.json'];
const ownedIds = JSON.parse(process.env.X402_ORDER_FUNDING_OWNED_FILE_IDENTITIES);
assert.deepEqual(Object.keys(ownedIds).sort(), [...names].sort());
function identity(file) {
  const s = lstatSync(file, { bigint: true }); assert.ok(s.isFile() && !s.isSymbolicLink());
  assert.equal(s.nlink, 1n); assert.equal(s.uid, BigInt(process.getuid())); assert.equal(s.mode & 0o777n, 0o600n); assert.ok(s.size <= 1048576n);
  return [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink].map(String);
}
function owned(name, empty = false) {
  const file = path.join(root, name); assert.deepEqual(identity(file), ownedIds[name]);
  if (empty) assert.equal(lstatSync(file).size, 0); return file;
}
const pinPath = owned(names[2], mode === 'write');
if (mode === 'write') {
  const fd = openSync(pinPath, constants.O_RDWR | constants.O_NOFOLLOW);
  try { writeFileSync(fd, pinText); fsyncSync(fd); assert.equal(fstatSync(fd).uid, process.getuid()); } finally { closeSync(fd); }
}
assert.equal(readFileSync(pinPath, 'utf8'), pinText);
const independent = JSON.parse(readFileSync(pinPath, 'utf8')), f = independent.fixture;
const cases = [], databases = [], wrappers = []; let opens = 0, verifierCalls = 0;
async function check(id, work) { await work(); cases.push({ id, status: 'PASS' }); }
function db(name, existing) {
  assert.ok(++opens <= 2); const database = new DatabaseSync(owned(name, !existing), {
    allowExtension: false, enableDoubleQuotedStringLiterals: false, enableForeignKeyConstraints: true, readOnly: false, timeout: 0,
  });
  database.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA temp_store=MEMORY; PRAGMA foreign_keys=ON');
  databases.push(database); return database;
}
function closeDB(database) { database.close(); databases.splice(databases.indexOf(database), 1); }
function holdWrapper(value) { wrappers.push(value); return value; }
function makeOwner(ownerTokenJson, backend, verifier) {
  const port = holdWrapper(receiptPort(ownerTokenJson, backend));
  return { port, owner: createOwner(...inputs(f), { receiptStore: port, maximumVerificationAttempts: 3,
    clock: () => NOW + 30000, verifyFundingEvidence: value => { verifierCalls++; return verifier(value); } }) };
}
try {
  if (mode === 'write') {
    const aDB = db(names[0], false), a = holdWrapper(create(aDB, storeId, limits));
    const firstClaim = claim(storeId, f.terms.orderId, captured.paymentScope, null, 'worker.1', a);
    let resolveOld; const oldProof = new Promise(resolve => { resolveOld = resolve; });
    const first = makeOwner(firstClaim.ownerTokenJson, a, () => oldProof);
    await check('NATIVE-ORIGINAL-IS-RETAINED-BEFORE-VERIFIER', async () => {
      assert.equal(first.owner.recover().phase, 'RETAINED'); assert.equal(verifierCalls, 0);
      const e = inspect(a.readEnvelope(f.terms.orderId, captured.paymentScope)); assert.equal(e.revision, 2);
      assert.equal(JSON.parse(e.receiptJson).paymentRecordJson, captured.paymentRecordJson);
    });
    await check('NATIVE-UNIQUE-PAYMENT-REFUSES-ANOTHER-ORDER', async () => {
      assert.throws(() => claim(storeId, 'order.other', captured.paymentScope, null, 'worker.other', a), /OWNERSHIP_CONFLICT/);
      assert.equal(a.snapshot().records, 1); assert.equal(a.snapshot().held, false);
    });
    const pending = first.owner.verifyFunding(proof());
    // Attach the observer immediately, before any later native assertion can
    // fail. It observes a later stale-worker refusal; it never retries it.
    let oldOutcome = null; const observedOld = pending.then(() => { oldOutcome = 'unexpected-success'; }, error => { oldOutcome = error.code; });
    let verifiedAckLost = false;
    const wrapped = {
      readEnvelope: (orderId, scope) => a.readEnvelope(orderId, scope),
      compareAndSwapEnvelope(orderId, scope, before, after) {
        const result = a.compareAndSwapEnvelope(orderId, scope, before, after);
        if (result === after && JSON.parse(JSON.parse(after).receiptJson ?? '{}').phase === 'VERIFIED') {
          verifiedAckLost = true; throw Error('synthetic transport acknowledgement lost after native commit');
        }
        return result;
      },
    };
    const pendingEnvelope = a.readEnvelope(f.terms.orderId, captured.paymentScope);
    const secondClaim = claim(storeId, f.terms.orderId, captured.paymentScope, pendingEnvelope, 'worker.2', wrapped);
    const second = makeOwner(secondClaim.ownerTokenJson, wrapped, () => Promise.resolve(f.verifiedRecord));
    await check('NATIVE-HANDOFF-KEEPS-EXACT-UNRESOLVED-CANDIDATE', async () => {
      assert.equal(inspect(secondClaim.envelopeJson).receiptJson, inspect(pendingEnvelope).receiptJson);
      assert.equal(second.owner.recover().phase, 'VERIFYING'); assert.equal(verifierCalls, 1);
    });
    await check('NATIVE-VERIFIED-COMMIT-WITH-LOST-ACK-HOLDS-OWNER', async () => {
      await assert.rejects(second.owner.verifyFunding(proof()), /COMMIT_UNKNOWN/); assert.equal(verifiedAckLost, true);
      const r = JSON.parse(inspect(a.readEnvelope(f.terms.orderId, captured.paymentScope)).receiptJson);
      assert.equal(r.phase, 'VERIFIED'); assert.equal(r.attempts, 2); assert.equal(second.port.snapshot().held, true);
    });
    const verifiedEnvelope = a.readEnvelope(f.terms.orderId, captured.paymentScope);
    await check('NATIVE-STALE-WORKER-CANNOT-PUBLISH-LATE-RESULT', async () => {
      resolveOld(f.verifiedRecord); await observedOld; assert.equal(oldOutcome, 'ORDER_FUNDING_CONFLICT');
      assert.equal(a.readEnvelope(f.terms.orderId, captured.paymentScope), verifiedEnvelope);
    });
    const thirdClaim = claim(storeId, f.terms.orderId, captured.paymentScope, verifiedEnvelope, 'worker.3', a);
    assert.equal(thirdClaim.ownerTokenJson, independent.finalOwnerTokenJson);
    const third = makeOwner(thirdClaim.ownerTokenJson, a, () => { assert.fail('no reauthentication'); });
    await check('NATIVE-NEW-OWNER-RECOVERS-PAID-LIABILITY-WITHOUT-VERIFICATION', async () => {
      const v = third.owner.recover(); assert.equal(v.quantityOwed, 10); assert.equal(v.grantFundingUnits, 27);
      assert.equal(v.paymentAtMs, null); assert.equal(v.paymentWasLate, null); assert.equal(v.offerExpired, true); assert.equal(v.grantCreated, false);
      assert.equal(verifierCalls, 2); assert.equal(third.owner.exportReceipt(), inspect(verifiedEnvelope).receiptJson);
      assert.equal((await third.owner.verifyFunding(proof())).quantityOwed, 10); assert.equal(verifierCalls, 2);
    });
    await check('NATIVE-CAPACITY-REFUSAL-PRESERVES-EXISTING-RECEIPT', async () => {
      const before = a.readEnvelope(f.terms.orderId, captured.paymentScope);
      assert.throws(() => claim(storeId, 'order.capacity', 'sha256:' + 'f'.repeat(64), null, 'worker.capacity', a), /OWNERSHIP_ACK_UNKNOWN/);
      assert.equal(a.snapshot().held, false); assert.equal(a.snapshot().records, 1);
      assert.equal(a.readEnvelope(f.terms.orderId, captured.paymentScope), before);
    });
    await check('NATIVE-STABLE-READS-DO-NOT-SCAN-COMPLETE-HISTORY', async () => {
      a.readEnvelope(f.terms.orderId, captured.paymentScope); const before = a.snapshot().fullValidations;
      for (let i = 0; i < 8; i++) a.readEnvelope(f.terms.orderId, captured.paymentScope);
      assert.equal(a.snapshot().fullValidations, before);
    });
    await check('NATIVE-WRAPPER-CLOSE-DOES-NOT-CLOSE-BORROWED-CONNECTION', async () => {
      await Promise.all([first.owner.close(), second.owner.close(), third.owner.close()]); first.port.close(); second.port.close(); third.port.close();
      a.close(); assert.throws(() => a.readEnvelope(f.terms.orderId, captured.paymentScope), /CLOSED/);
      assert.equal(aDB.prepare('SELECT 1 AS value').get().value, 1);
    });
    closeDB(aDB);
    const bDB = db(names[1], false), b = holdWrapper(create(bDB, storeId, limits));
    const badClaim = claim(storeId, f.terms.orderId, captured.paymentScope, null, 'worker.bad-fixture', b);
    const bad = makeOwner(badClaim.ownerTokenJson, b, () => { assert.fail('no verifier for corruption fixture'); }); bad.owner.recover(); await bad.owner.close(); bad.port.close();
    await check('NATIVE-SAME-CONNECTION-CORRUPTION-QUARANTINES-STORE', async () => {
      bDB.prepare('UPDATE order_funding_cas_slots_v1 SET envelope_json=? WHERE order_id=?').run('{}', f.terms.orderId);
      assert.throws(() => b.readEnvelope(f.terms.orderId, captured.paymentScope), /STORE_UNAVAILABLE/); assert.equal(b.snapshot().held, true);
      assert.throws(() => b.readEnvelope(f.terms.orderId, captured.paymentScope), /HELD/);
      assert.equal(bDB.prepare('SELECT envelope_json FROM order_funding_cas_slots_v1').get().envelope_json, '{}');
    });
    b.close(); closeDB(bDB);
  } else {
    const aDB = db(names[0], true), a = holdWrapper(reopen(aDB, independent.storeId, independent.limits));
    const before = a.readEnvelope(f.terms.orderId, captured.paymentScope);
    const next = makeOwner(independent.finalOwnerTokenJson, a, () => { assert.fail('no verifier in fresh-process recovery'); });
    await check('FRESH-PROCESS-READS-EXACT-RECEIPT-WITH-INDEPENDENT-PINS', async () => {
      assert.equal(next.owner.recover().quantityOwed, 10); assert.equal(next.owner.exportReceipt(), inspect(before).receiptJson);
      assert.equal((await next.owner.verifyFunding(proof())).quantityOwed, 10); assert.equal(verifierCalls, 0);
      assert.equal(a.readEnvelope(f.terms.orderId, captured.paymentScope), before); assert.equal(inspect(before).epoch, 3);
    });
    await next.owner.close(); next.port.close(); a.close(); closeDB(aDB);
    const bDB = db(names[1], true);
    await check('FRESH-PROCESS-REFUSES-PRESERVED-CORRUPT-RECEIPT', async () => {
      assert.throws(() => reopen(bDB, independent.storeId, independent.limits), /OPEN_REFUSED/);
      assert.equal(bDB.prepare('SELECT envelope_json FROM order_funding_cas_slots_v1').get().envelope_json, '{}');
    });
    closeDB(bDB);
  }
  assert.equal(databases.length, 0); assert.equal(opens, 2); assert.equal(readFileSync(pinPath, 'utf8'), pinText);
  process.stdout.write(JSON.stringify({ qualification: 'PURCHASE_ORDER_FUNDING_SQLITE_LOCAL', mode, cases, passed: cases.length, failed: 0,
    actualDatabaseConnections: opens, sqliteFiles: 2, independentPinFiles: 1, selectedAuthenticator: 'SYNTHETIC',
    verifierCalls, nativeSqlite: true, SDK: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0,
    grants: 0, serviceExecutions: 0, payouts: 0, realPayment: false, processInterruption: false,
    pinFileSha256: createHash('sha256').update(pinText).digest('hex'),
    databaseIdentities: names.slice(0, 2).map(name => ({ name, identity: identity(path.join(root, name)) })),
    fullApplicationRecovery: 'NOT_ESTABLISHED', physicalReleaseQualification: 'NOT_ESTABLISHED' }) + '\n');
} finally {
  for (const w of wrappers) { try { w.close(); } catch {} }
  for (const d of databases) { try { d.close(); } catch {} }
}
