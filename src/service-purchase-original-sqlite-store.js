import { DatabaseSync } from 'node:sqlite';
import { types } from 'node:util';
import {
  purchaseStorageFailure, purchaseStorageIdentifier, purchaseStorageDigest, purchaseStorageText,
  purchaseStorageLimits, capturePurchaseStorageTerms, capturePurchaseStorageOriginal,
  inspectStoredPurchaseOriginal,
} from './service-purchase-storage-contract.js';

const EXEC = DatabaseSync.prototype.exec, PREPARE = DatabaseSync.prototype.prepare;
const SCHEMA = Object.freeze([
  ['purchase_meta_v1', 'CREATE TABLE purchase_meta_v1(singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL CHECK(version=1), max_orders INTEGER NOT NULL CHECK(max_orders BETWEEN 1 AND 1024), max_originals INTEGER NOT NULL CHECK(max_originals BETWEEN 1 AND 4096)) STRICT'],
  ['purchase_orders_v1', 'CREATE TABLE purchase_orders_v1(order_id TEXT PRIMARY KEY CHECK(length(order_id) BETWEEN 1 AND 128), terms_json TEXT NOT NULL CHECK(length(CAST(terms_json AS BLOB)) BETWEEN 1 AND 4096), terms_digest TEXT NOT NULL CHECK(length(terms_digest)=71), payment_scope TEXT UNIQUE CHECK(payment_scope IS NULL OR length(payment_scope)=71), checkpoint_json TEXT CHECK(checkpoint_json IS NULL OR length(CAST(checkpoint_json AS BLOB)) BETWEEN 1 AND 32768), grant_id TEXT CHECK(grant_id IS NULL OR length(grant_id) BETWEEN 1 AND 128), service_url TEXT CHECK(service_url IS NULL OR length(CAST(service_url AS BLOB)) BETWEEN 1 AND 4096), CHECK((payment_scope IS NULL AND checkpoint_json IS NULL AND grant_id IS NULL AND service_url IS NULL) OR (payment_scope IS NOT NULL AND checkpoint_json IS NOT NULL AND grant_id IS NOT NULL AND service_url IS NOT NULL))) STRICT'],
  ['purchase_originals_v1', 'CREATE TABLE purchase_originals_v1(order_id TEXT NOT NULL REFERENCES purchase_orders_v1(order_id), request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 1 AND 128), request_scope TEXT NOT NULL UNIQUE CHECK(length(request_scope)=71), record_json TEXT NOT NULL CHECK(length(CAST(record_json AS BLOB)) BETWEEN 1 AND 65536), record_digest TEXT NOT NULL CHECK(length(record_digest)=71), PRIMARY KEY(order_id,request_id)) STRICT'],
]);
const EXPECTED = new Map(SCHEMA);
const EXPECTED_REJECTIONS = new Set(['TERMS_CONFLICT', 'ORDER_NOT_ACCEPTED', 'ORDER_LIMIT', 'ORIGINAL_LIMIT',
  'PAYMENT_ALREADY_BOUND', 'PAYMENT_CONFLICT', 'GRANT_CONFLICT', 'ORIGINAL_CONFLICT']);
function fail(code) { throw purchaseStorageFailure(code); }
function check(value) { if (!value) fail('CORRUPT'); }
function receipt(status, changed, orderId, requestId = null) {
  return Object.freeze({ status, changed, orderId, requestId, authority: 'NONE',
    paymentVerification: 'NOT_PERFORMED', deliveryStatus: 'NOT_ESTABLISHED',
    mayStartPayment: false, maySignPayment: false, mayDispatchService: false });
}

/**
 * Dedicated borrowed DatabaseSync connection only. No path is opened here.
 * The caller owns file safety, leases, quotas and the native connection's close.
 * Store close fences this wrapper only. CREATE_NEW refuses existing user tables;
 * OPEN_EXISTING requires the exact schema and explicit original limits.
 */
function create(database, inputLimits, creating) {
  const limits = purchaseStorageLimits(inputLimits);
  if (database === null || typeof database !== 'object' || types.isProxy(database)
      || Object.getPrototypeOf(database) !== DatabaseSync.prototype) fail('INVALID_DATABASE');
  const cache = new Map();
  let closed = false, unavailable = false, busy = false, epochs = null;
  let orderCount = 0, originalCount = 0, fullValidations = 0, transactions = 0;
  const exec = text => Reflect.apply(EXEC, database, [text]);
  function statement(text) {
    if (!cache.has(text)) cache.set(text, Reflect.apply(PREPARE, database, [text]));
    return cache.get(text);
  }
  const get = (text, ...params) => statement(text).get(...params);
  const all = text => statement(text).all();
  const run = (text, ...params) => statement(text).run(...params);
  function captureEpochs() {
    const values = [get('PRAGMA main.data_version').data_version,
      get('PRAGMA main.schema_version').schema_version, get('SELECT total_changes() AS changes').changes];
    check(values.every(value => Number.isSafeInteger(value) && value >= 0));
    return values;
  }
  function checkConnection() {
    check(get('PRAGMA main.journal_mode').journal_mode === 'delete');
    check(get('PRAGMA main.synchronous').synchronous >= 2);
    check(get('PRAGMA temp_store').temp_store === 2);
    check(get('PRAGMA ignore_check_constraints').ignore_check_constraints === 0);
    check(get('PRAGMA foreign_keys').foreign_keys === 1);
    const databases = all('PRAGMA database_list');
    check(databases.every(row => row.name === 'main' || row.name === 'temp'));
    if (databases.some(row => row.name === 'temp')) {
      check(all("SELECT name FROM temp.sqlite_schema WHERE name NOT LIKE 'sqlite_%'").length === 0);
    }
  }
  function schema() {
    const rows = all("SELECT name,type,sql FROM main.sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name");
    check(rows.length === 3 && rows.every(row => row.type === 'table' && EXPECTED.get(row.name) === row.sql));
    const meta = all('SELECT * FROM main.purchase_meta_v1');
    check(meta.length === 1 && meta[0].singleton === 1 && meta[0].version === 1
      && meta[0].max_orders === limits.maxOrders && meta[0].max_originals === limits.maxOriginals);
  }
  function order(row) {
    check(row !== undefined);
    let accepted;
    try { accepted = capturePurchaseStorageTerms(row.terms_json, row.terms_digest); }
    catch { fail('CORRUPT'); }
    check(accepted.orderId === row.order_id);
    const fields = [row.payment_scope, row.checkpoint_json, row.grant_id, row.service_url];
    check(fields.every(value => value === null) || fields.every(value => typeof value === 'string' && value.length > 0));
    return accepted;
  }
  function matchesOrder(row, original) {
    check(row.order_id === original.orderId && row.terms_json === original.termsJson && row.terms_digest === original.termsDigest
      && row.payment_scope === original.paymentScope && row.checkpoint_json === original.paymentCheckpointJson
      && row.grant_id === original.grantId && row.service_url === original.serviceResourceUrl);
  }
  function validateAll() {
    checkConnection(); schema();
    check(get('SELECT count(*) AS count FROM main.purchase_orders_v1').count <= limits.maxOrders);
    check(get('SELECT count(*) AS count FROM main.purchase_originals_v1').count <= limits.maxOriginals);
    const orders = all('SELECT * FROM main.purchase_orders_v1 ORDER BY order_id');
    const originals = all('SELECT * FROM main.purchase_originals_v1 ORDER BY order_id,request_id');
    check(orders.length <= limits.maxOrders && originals.length <= limits.maxOriginals);
    const indexed = new Map(), seenPayments = new Set(), seenRequests = new Set(), linked = new Set();
    for (const row of orders) {
      order(row); check(!indexed.has(row.order_id)); indexed.set(row.order_id, row);
      if (row.payment_scope !== null) { check(!seenPayments.has(row.payment_scope)); seenPayments.add(row.payment_scope); }
    }
    for (const row of originals) {
      const original = inspectStoredPurchaseOriginal(row.record_json, row.record_digest);
      check(row.order_id === original.orderId && row.request_id === original.requestId && row.request_scope === original.requestScope
        && indexed.has(row.order_id) && !seenRequests.has(row.request_scope));
      matchesOrder(indexed.get(row.order_id), original);
      seenRequests.add(row.request_scope); linked.add(row.order_id);
    }
    for (const row of orders) check((row.payment_scope !== null) === linked.has(row.order_id));
    orderCount = orders.length; originalCount = originals.length; fullValidations++;
  }
  function usable() { if (closed) fail('CLOSED'); if (unavailable) fail('UNAVAILABLE'); if (busy) fail('BUSY'); }
  function transaction(body, initial = false) {
    usable(); busy = true; let began = false, committing = false;
    let oldCounts = [orderCount, originalCount];
    try {
      exec('BEGIN IMMEDIATE'); began = true;
      const observed = captureEpochs();
      if (!initial && (epochs === null || observed.some((value, i) => value !== epochs[i]))) validateAll();
      oldCounts = [orderCount, originalCount];
      // Connection durability settings are not cached: PRAGMA changes need not
      // increment SQLite data/schema versions or total_changes().
      checkConnection();
      const value = body();
      const nextEpochs = captureEpochs();
      // Capture UNDER the lock, not after COMMIT: an external commit in the
      // unlock gap must remain visible to the next transaction's comparison.
      committing = true; exec('COMMIT'); began = false; epochs = nextEpochs; transactions++;
      return value;
    } catch (error) {
      epochs = null; [orderCount, originalCount] = oldCounts;
      if (began) {
        try { exec('ROLLBACK'); }
        catch { unavailable = true; fail('ROLLBACK_UNKNOWN'); }
      }
      const code = typeof error?.code === 'string' ? error.code : '';
      if (committing) { unavailable = true; fail('COMMIT_UNKNOWN'); }
      if (code.startsWith('PURCHASE_STORAGE_') && EXPECTED_REJECTIONS.has(code.slice('PURCHASE_STORAGE_'.length))) throw error;
      unavailable = true; fail('STORE_UNAVAILABLE');
    } finally { busy = false; }
  }
  // Refuse unsupported connection settings before taking a write transaction.
  checkConnection();
  transaction(() => {
    if (creating) {
      check(all("SELECT name FROM main.sqlite_schema WHERE name NOT LIKE 'sqlite_%'").length === 0);
      for (const [, text] of SCHEMA) exec(text);
      run('INSERT INTO main.purchase_meta_v1 VALUES(1,1,?,?)', limits.maxOrders, limits.maxOriginals);
    }
    validateAll();
  }, true);

  const retainTerms = function retainTerms(termsJson, expectedTermsDigest) {
    usable(); if (arguments.length !== 2) fail('INVALID_INPUT');
    const accepted = capturePurchaseStorageTerms(termsJson, expectedTermsDigest);
    return transaction(() => {
      const existing = get('SELECT * FROM main.purchase_orders_v1 WHERE order_id=?', accepted.orderId);
      if (existing !== undefined) {
        order(existing);
        if (existing.terms_json !== termsJson || existing.terms_digest !== expectedTermsDigest) fail('TERMS_CONFLICT');
        return receipt('TERMS_RETAINED', false, accepted.orderId);
      }
      if (orderCount >= limits.maxOrders) fail('ORDER_LIMIT');
      run('INSERT INTO main.purchase_orders_v1(order_id,terms_json,terms_digest) VALUES(?,?,?)', accepted.orderId, termsJson, expectedTermsDigest);
      orderCount++; return receipt('TERMS_RETAINED', true, accepted.orderId);
    });
  };
  const retainOriginal = function retainOriginal(recordJson, expectedRecordDigest, paymentPinsJson, expectedTermsDigest) {
    usable(); if (arguments.length !== 4) fail('INVALID_INPUT');
    const original = capturePurchaseStorageOriginal(recordJson, expectedRecordDigest, paymentPinsJson, expectedTermsDigest);
    return transaction(() => {
      const retained = get('SELECT * FROM main.purchase_orders_v1 WHERE order_id=?', original.orderId);
      if (retained === undefined) fail('ORDER_NOT_ACCEPTED');
      order(retained);
      if (retained.terms_json !== original.termsJson || retained.terms_digest !== expectedTermsDigest) fail('TERMS_CONFLICT');
      if (retained.payment_scope !== null) {
        if (retained.payment_scope !== original.paymentScope || retained.checkpoint_json !== original.paymentCheckpointJson) fail('PAYMENT_CONFLICT');
        if (retained.grant_id !== original.grantId || retained.service_url !== original.serviceResourceUrl) fail('GRANT_CONFLICT');
      }
      const paymentOwner = get('SELECT order_id FROM main.purchase_orders_v1 WHERE payment_scope=?', original.paymentScope);
      if (paymentOwner !== undefined && paymentOwner.order_id !== original.orderId) fail('PAYMENT_ALREADY_BOUND');
      const request = get('SELECT * FROM main.purchase_originals_v1 WHERE request_scope=?', original.requestScope);
      if (request !== undefined) {
        if (request.order_id !== original.orderId || request.request_id !== original.requestId
            || request.record_json !== recordJson || request.record_digest !== expectedRecordDigest) fail('ORIGINAL_CONFLICT');
        return receipt('ORIGINAL_RETAINED', false, original.orderId, original.requestId);
      }
      if (originalCount >= limits.maxOriginals) fail('ORIGINAL_LIMIT');
      if (retained.payment_scope === null) run('UPDATE main.purchase_orders_v1 SET payment_scope=?,checkpoint_json=?,grant_id=?,service_url=? WHERE order_id=?',
        original.paymentScope, original.paymentCheckpointJson, original.grantId, original.serviceResourceUrl, original.orderId);
      run('INSERT INTO main.purchase_originals_v1 VALUES(?,?,?,?,?)', original.orderId, original.requestId, original.requestScope, recordJson, expectedRecordDigest);
      originalCount++; return receipt('ORIGINAL_RETAINED', true, original.orderId, original.requestId);
    });
  };
  const readTerms = function readTerms(orderId, expectedTermsDigest) {
    usable(); if (arguments.length !== 2) fail('INVALID_INPUT');
    purchaseStorageIdentifier(orderId); purchaseStorageDigest(expectedTermsDigest);
    return transaction(() => {
      const row = get('SELECT * FROM main.purchase_orders_v1 WHERE order_id=?', orderId);
      if (row === undefined) return null;
      const accepted = order(row);
      if (accepted.termsDigest !== expectedTermsDigest) fail('TERMS_CONFLICT');
      return Object.freeze({ ...accepted, originalBound: row.payment_scope !== null, authority: 'NONE' });
    });
  };
  const readOriginal = function readOriginal(orderId, requestId, expectedTermsDigest, expectedRecordDigest, paymentPinsJson) {
    usable(); if (arguments.length !== 5) fail('INVALID_INPUT');
    purchaseStorageIdentifier(orderId); purchaseStorageIdentifier(requestId);
    purchaseStorageDigest(expectedTermsDigest); purchaseStorageDigest(expectedRecordDigest); purchaseStorageText(paymentPinsJson, 4096);
    return transaction(() => {
      const row = get('SELECT * FROM main.purchase_originals_v1 WHERE order_id=? AND request_id=?', orderId, requestId);
      if (row === undefined) return null;
      if (row.record_digest !== expectedRecordDigest) fail('ORIGINAL_CONFLICT');
      const stored = inspectStoredPurchaseOriginal(row.record_json, row.record_digest);
      check(stored.orderId === orderId && stored.requestId === requestId && stored.requestScope === row.request_scope);
      matchesOrder(get('SELECT * FROM main.purchase_orders_v1 WHERE order_id=?', orderId), stored);
      let original;
      try { original = capturePurchaseStorageOriginal(row.record_json, expectedRecordDigest, paymentPinsJson, expectedTermsDigest); }
      catch { fail('ORIGINAL_CONFLICT'); }
      return Object.freeze({ recordJson: original.recordJson, recordDigest: original.recordDigest,
        orderId, requestId, authority: 'NONE', deliveryStatus: 'NOT_ESTABLISHED' });
    });
  };
  return Object.freeze({ retainTerms, retainOriginal, readTerms, readOriginal,
    close() { if (arguments.length !== 0) fail('INVALID_INPUT'); closed = true; cache.clear(); database = null; },
    snapshot() { return Object.freeze({ closed, unavailable, orders: orderCount, originals: originalCount,
      fullValidations, transactions, limits, authority: 'NONE', deliveryStatus: 'NOT_ESTABLISHED' }); } });
}

export function createNewServicePurchaseOriginalStore(database, limits) {
  if (arguments.length !== 2) fail('INVALID_INPUT');
  return create(database, limits, true);
}
export function openExistingServicePurchaseOriginalStore(database, limits) {
  if (arguments.length !== 2) fail('INVALID_INPUT');
  return create(database, limits, false);
}
