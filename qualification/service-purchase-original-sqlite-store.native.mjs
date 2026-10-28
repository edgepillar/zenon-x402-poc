// Native SQLite fixture; source-only until a separately reviewed finite launch.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  createNewServicePurchaseOriginalStore as create,
  openExistingServicePurchaseOriginalStore as reopen,
} from '../src/service-purchase-original-sqlite-store.js';
import { purchaseStorageNativeFixtures } from './service-purchase-original-storage.fixture.mjs';

assert.equal(process.versions.node, '24.19.0');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.X402_PURCHASE_NATIVE_PRELOADED, 'source-pins-verified');
assert.equal(process.argv.length, 4);
const root = process.argv[2], mode = process.argv[3];
assert.ok(['write', 'reopen'].includes(mode));
assert.equal(root, path.resolve(root)); assert.equal(process.env.SPV_TASK_SCRATCH, root);
for (let at = root; ; at = path.dirname(at)) {
  assert.equal(lstatSync(at).isSymbolicLink(), false);
  if (at === path.dirname(at)) break;
}
const rootState = lstatSync(root); assert.ok(rootState.isDirectory()); assert.equal(rootState.uid, process.getuid());
assert.equal(rootState.mode & 0o777, 0o700); process.umask(0o077);
for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_V8_COVERAGE']) assert.equal(process.env[key], undefined);

const fixtures = purchaseStorageNativeFixtures();
const pinText = JSON.stringify({ fixtures, limits: { maxOrders: 2, maxOriginals: 4 }, capacityLimits: { maxOrders: 1, maxOriginals: 1 } });
const pinPath = path.join(root, 'purchase-original-pins.json');
const ownedIds = JSON.parse(process.env.X402_PURCHASE_OWNED_FILE_IDENTITIES);
assert.deepEqual(Object.keys(ownedIds).sort(), ['purchase-orders-a.sqlite', 'purchase-orders-b.sqlite', 'purchase-original-pins.json']);
function identity(file) {
  const s = lstatSync(file, { bigint: true });
  assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.nlink, 1n);
  assert.equal(s.uid, BigInt(process.getuid())); assert.equal(s.mode & 0o777n, 0o600n);
  assert.ok(s.size <= 1048576n);
  return [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink].map(String);
}
function owned(name, empty = false) {
  const file = path.join(root, name);
  assert.deepEqual(identity(file), ownedIds[name]);
  if (empty) assert.equal(lstatSync(file).size, 0);
  return file;
}
if (mode === 'write') {
  owned('purchase-original-pins.json', true);
  const fd = openSync(pinPath, constants.O_RDWR | constants.O_NOFOLLOW);
  try { writeFileSync(fd, pinText); fsyncSync(fd); assert.equal(fstatSync(fd).uid, process.getuid()); }
  finally { closeSync(fd); }
} else {
  owned('purchase-original-pins.json'); assert.equal(readFileSync(pinPath, 'utf8'), pinText);
}
const limits = { maxOrders: 2, maxOriginals: 4 }, capacityLimits = { maxOrders: 1, maxOriginals: 1 };
const cases = [], owners = []; let opens = 0;
function check(id, work) { work(); cases.push({ id, status: 'PASS' }); }
function db(name, existing) {
  assert.ok(++opens <= (mode === 'write' ? 4 : 2));
  const file = owned(name, !existing);
  const database = new DatabaseSync(file, { allowExtension: false, enableDoubleQuotedStringLiterals: false,
    enableForeignKeyConstraints: true, readOnly: false, timeout: 0 });
  database.exec('PRAGMA temp_store=MEMORY'); owners.push(database); return database;
}
const errorCode = suffix => error => error?.code === 'PURCHASE_STORAGE_' + suffix;
const retain = (store, f) => store.retainOriginal(f.recordJson, f.recordDigest, f.paymentPinsJson, f.termsDigest);
const accept = (store, f) => store.retainTerms(f.termsJson, f.termsDigest);
const read = (store, f) => store.readOriginal(f.orderId, f.requestId, f.termsDigest, f.recordDigest, f.paymentPinsJson);
function close(database) { database.close(); owners.splice(owners.indexOf(database), 1); }
try {
  if (mode === 'write') {
    const aDB = db('purchase-orders-a.sqlite', false), a = create(aDB, limits), f = fixtures;
    check('TERMS-MUST-BE-ACCEPTED-BEFORE-ORIGINAL', () => {
      assert.throws(() => retain(a, f.first), errorCode('ORDER_NOT_ACCEPTED'));
      assert.equal(a.snapshot().orders, 0); assert.equal(a.snapshot().originals, 0);
    });
    check('ACCEPTED-TERMS-ARE-IDEMPOTENT-AND-IMMUTABLE', () => {
      assert.equal(accept(a, f.first).changed, true); assert.equal(accept(a, f.first).changed, false);
      assert.throws(() => accept(a, f.changedTerms), errorCode('TERMS_CONFLICT'));
      assert.equal(a.readTerms(f.first.orderId, f.first.termsDigest).termsJson, f.first.termsJson);
    });
    const a2DB = db('purchase-orders-a.sqlite', true), a2 = reopen(a2DB, limits);
    check('EXTERNAL-CONNECTION-COMMIT-TRIGGERS-VALIDATION', () => {
      const before = a.snapshot().fullValidations; accept(a2, f.otherOrder);
      assert.equal(a.readTerms(f.otherOrder.orderId, f.otherOrder.termsDigest).termsJson, f.otherOrder.termsJson);
      assert.ok(a.snapshot().fullValidations > before);
    });
    check('EXACT-ORIGINAL-RETAINS-AND-REPEATS-WITHOUT-ANOTHER-ROW', () => {
      assert.equal(retain(a, f.first).changed, true); assert.equal(retain(a, f.first).changed, false);
      assert.equal(a.snapshot().originals, 1); assert.equal(read(a, f.first).recordJson, f.first.recordJson);
    });
    check('PAYMENT-CANNOT-FUND-ANOTHER-ACCEPTED-ORDER', () => {
      assert.throws(() => retain(a2, f.otherOrder), errorCode('PAYMENT_ALREADY_BOUND'));
      assert.equal(a2.readTerms(f.otherOrder.orderId, f.otherOrder.termsDigest).originalBound, false);
      assert.equal(a2.snapshot().originals, 1);
    });
    check('ONE-PAYMENT-AND-GRANT-SUPPORT-MULTIPLE-ORIGINAL-REQUESTS', () => {
      assert.equal(retain(a, f.second).changed, true); assert.equal(a.snapshot().originals, 2);
      assert.equal(read(a, f.first).recordJson, f.first.recordJson); assert.equal(read(a, f.second).recordJson, f.second.recordJson);
      assert.equal(read(a, f.second).authority, 'NONE');
    });
    check('REPLACEMENT-PAYMENT-GRANT-CONTEXT-AND-REQUEST-COST-ARE-REFUSED', () => {
      assert.throws(() => retain(a, f.changedPayment), errorCode('PAYMENT_CONFLICT'));
      assert.throws(() => retain(a, f.changedContext), errorCode('PAYMENT_CONFLICT'));
      assert.throws(() => retain(a, f.changedGrant), errorCode('GRANT_CONFLICT'));
      assert.throws(() => retain(a, f.changedCost), errorCode('ORIGINAL_CONFLICT'));
      assert.equal(a.snapshot().originals, 2);
    });
    check('BAD-INDEPENDENT-PINS-DO-NOT-POISON-VALID-DATA', () => {
      const pins = JSON.parse(f.first.paymentPinsJson); pins.digests.context = 'c'.repeat(64);
      assert.throws(() => a.readOriginal(f.first.orderId, f.first.requestId, f.first.termsDigest,
        f.first.recordDigest, JSON.stringify(pins)), errorCode('ORIGINAL_CONFLICT'));
      assert.equal(a.snapshot().unavailable, false); assert.equal(read(a, f.first).recordJson, f.first.recordJson);
    });
    check('STABLE-READS-DO-NOT-REVALIDATE-THE-COMPLETE-HISTORY', () => {
      a.readTerms(f.first.orderId, f.first.termsDigest); const before = a.snapshot().fullValidations;
      for (let i = 0; i < 20; i++) assert.equal(read(a, f.second).recordJson, f.second.recordJson);
      assert.equal(a.snapshot().fullValidations, before);
    });
    check('CLOSE-FENCES-WRAPPER-WITHOUT-CLOSING-BORROWED-DATABASE', () => {
      a.close(); a.close(); assert.throws(() => read(a, f.first), errorCode('CLOSED'));
      assert.equal(aDB.prepare('SELECT 1 AS value').get().value, 1); a2.close();
    });
    close(aDB); close(a2DB);
    const againDB = db('purchase-orders-a.sqlite', true), again = reopen(againDB, limits);
    check('NORMAL-SAME-FILE-REOPEN-RETURNS-EXACT-ORIGINALS', () => {
      assert.equal(read(again, f.first).recordJson, f.first.recordJson);
      assert.equal(read(again, f.second).recordJson, f.second.recordJson);
      assert.equal(again.snapshot().orders, 2); assert.equal(again.snapshot().originals, 2);
    });
    again.close(); close(againDB);
    const bDB = db('purchase-orders-b.sqlite', false), b = create(bDB, capacityLimits);
    check('CAPACITY-REFUSALS-KEEP-THE-EXISTING-ORIGINAL', () => {
      accept(b, f.capacity); retain(b, f.capacity);
      assert.throws(() => accept(b, f.otherOrder), errorCode('ORDER_LIMIT'));
      assert.throws(() => retain(b, f.capacitySecond), errorCode('ORIGINAL_LIMIT'));
      assert.equal(read(b, f.capacity).recordJson, f.capacity.recordJson);
      assert.equal(retain(b, f.capacity).changed, false);
    });
    check('SAME-CONNECTION-MUTATION-IS-DETECTED-AND-QUARANTINED', () => {
      bDB.prepare('UPDATE purchase_orders_v1 SET terms_digest=? WHERE order_id=?').run('sha256:' + 'c'.repeat(64), f.capacity.orderId);
      assert.throws(() => b.readTerms(f.capacity.orderId, f.capacity.termsDigest), errorCode('STORE_UNAVAILABLE'));
      assert.equal(b.snapshot().unavailable, true);
      assert.throws(() => read(b, f.capacity), errorCode('UNAVAILABLE'));
      assert.equal(bDB.prepare('SELECT terms_digest FROM purchase_orders_v1').get().terms_digest, 'sha256:' + 'c'.repeat(64));
    });
    b.close(); close(bDB);
  } else {
    const aDB = db('purchase-orders-a.sqlite', true), a = reopen(aDB, limits);
    check('FRESH-PROCESS-READS-INDEPENDENT-PINS-AND-TWO-ORIGINALS', () => {
      assert.equal(read(a, fixtures.first).recordJson, fixtures.first.recordJson);
      assert.equal(read(a, fixtures.second).recordJson, fixtures.second.recordJson);
      assert.equal(a.snapshot().orders, 2); assert.equal(a.snapshot().originals, 2);
      assert.equal(a.readTerms(fixtures.otherOrder.orderId, fixtures.otherOrder.termsDigest).originalBound, false);
    });
    a.close(); close(aDB);
    const bDB = db('purchase-orders-b.sqlite', true);
    check('FRESH-PROCESS-REFUSES-THE-PRESERVED-CORRUPT-FIXTURE', () => {
      assert.throws(() => reopen(bDB, capacityLimits), errorCode('STORE_UNAVAILABLE'));
      assert.equal(bDB.prepare('SELECT terms_digest FROM purchase_orders_v1').get().terms_digest, 'sha256:' + 'c'.repeat(64));
    });
    close(bDB);
  }
  assert.equal(owners.length, 0); assert.equal(readFileSync(pinPath, 'utf8'), pinText);
  console.log(JSON.stringify({ qualification: 'PURCHASE_ORIGINAL_SQLITE_LOCAL', mode, cases, passed: cases.length, failed: 0,
    actualDatabaseConnections: opens, sqliteFiles: 2, independentPinFiles: 1, nativeSqlite: true,
    SDK: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0,
    pinFileSha256: createHash('sha256').update(pinText).digest('hex'),
    databaseIdentities: ['purchase-orders-a.sqlite', 'purchase-orders-b.sqlite'].map(name => ({ name, identity: identity(path.join(root, name)) })),
    realPayment: false, fullApplicationRecovery: 'NOT_ESTABLISHED', physicalReleaseQualification: 'NOT_ESTABLISHED' }));
} finally {
  for (const owner of owners) { try { owner.close(); } catch {} }
}
