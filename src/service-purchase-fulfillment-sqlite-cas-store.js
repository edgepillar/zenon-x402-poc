// Native implementation candidate. Syntax checks do not qualify SQLite I/O.
import { DatabaseSync } from 'node:sqlite';
import { types } from 'node:util';
import {
  inspectPurchasedFulfillmentEnvelope,
  requirePurchasedFulfillmentEnvelopeTransition,
} from './service-purchase-fulfillment-cas-contract.js';

const EXEC = DatabaseSync.prototype.exec, PREPARE = DatabaseSync.prototype.prepare;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SCHEMA = new Map([
  ['fulfillment_cas_meta_v1', 'CREATE TABLE fulfillment_cas_meta_v1(singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL CHECK(version=1), store_id TEXT NOT NULL CHECK(length(store_id) BETWEEN 1 AND 128), max_records INTEGER NOT NULL CHECK(max_records BETWEEN 1 AND 1024)) STRICT'],
  ['fulfillment_cas_slots_v1', 'CREATE TABLE fulfillment_cas_slots_v1(order_id TEXT PRIMARY KEY CHECK(length(order_id) BETWEEN 1 AND 128), owner_id TEXT CHECK(owner_id IS NULL OR length(owner_id) BETWEEN 1 AND 128), owner_epoch INTEGER NOT NULL CHECK(owner_epoch BETWEEN 1 AND 9007199254740991), revision INTEGER NOT NULL CHECK(revision BETWEEN owner_epoch AND 9007199254740991), envelope_json TEXT NOT NULL CHECK(length(CAST(envelope_json AS BLOB)) BETWEEN 1 AND 524288)) STRICT'],
]);
function fail(suffix = 'INVALID_INPUT') {
  const code = 'FULFILLMENT_SQLITE_' + suffix, e = new TypeError(code);
  Object.defineProperties(e, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } });
  throw Object.freeze(e);
}
function check(ok) { if (!ok) fail('CORRUPT'); }
function id(value) { if (typeof value !== 'string' || ID.exec(value)?.[0] !== value) fail(); return value; }
function limits(input) {
  if (input === null || typeof input !== 'object' || types.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype
      || Reflect.ownKeys(input).length !== 1) fail();
  const d = Object.getOwnPropertyDescriptor(input, 'maxRecords');
  if (!d?.enumerable || !Object.hasOwn(d, 'value') || !Number.isSafeInteger(d.value) || d.value < 1 || d.value > 1024) fail();
  return d.value;
}
function create(database, storeId, inputLimits, creating) {
  id(storeId); const maxRecords = limits(inputLimits);
  if (database === null || typeof database !== 'object' || types.isProxy(database)
      || Object.getPrototypeOf(database) !== DatabaseSync.prototype) fail('INVALID_DATABASE');
  const cache = new Map(); let closed = false, busy = false, unavailable = false;
  let epochs = null, count = 0, fullValidations = 0, transactions = 0;
  const exec = raw => Reflect.apply(EXEC, database, [raw]);
  function statement(raw) {
    if (!cache.has(raw)) cache.set(raw, Reflect.apply(PREPARE, database, [raw])); return cache.get(raw);
  }
  const get = (raw, ...args) => statement(raw).get(...args);
  const all = raw => statement(raw).all();
  const run = (raw, ...args) => statement(raw).run(...args);
  function settings() {
    check(get('PRAGMA main.journal_mode').journal_mode === 'delete');
    check(get('PRAGMA main.synchronous').synchronous >= 2);
    check(get('PRAGMA temp_store').temp_store === 2);
    check(get('PRAGMA ignore_check_constraints').ignore_check_constraints === 0);
    check(get('PRAGMA foreign_keys').foreign_keys === 1);
    const dbs = all('PRAGMA database_list'); check(dbs.every(d => d.name === 'main' || d.name === 'temp'));
    if (dbs.some(d => d.name === 'temp')) check(all("SELECT name FROM temp.sqlite_schema WHERE name NOT LIKE 'sqlite_%'").length === 0);
  }
  function versions() {
    const v = [get('PRAGMA main.data_version').data_version, get('PRAGMA main.schema_version').schema_version,
      get('SELECT total_changes() AS changes').changes];
    check(v.every(n => Number.isSafeInteger(n) && n >= 0)); return v;
  }
  function row(value) {
    if (value === undefined) return null;
    let e; try { e = inspectPurchasedFulfillmentEnvelope(value.envelope_json); } catch { fail('CORRUPT'); }
    check(e.storeId === storeId && e.orderId === value.order_id && e.ownerId === value.owner_id
      && e.epoch === value.owner_epoch && e.revision === value.revision);
    return value.envelope_json;
  }
  function validateAll() {
    settings(); const tables = all("SELECT name,type,sql FROM main.sqlite_schema WHERE name NOT LIKE 'sqlite_%'");
    check(tables.length === 2 && tables.every(t => t.type === 'table' && SCHEMA.get(t.name) === t.sql));
    const meta = all('SELECT * FROM main.fulfillment_cas_meta_v1');
    check(meta.length === 1 && meta[0].singleton === 1 && meta[0].version === 1 && meta[0].store_id === storeId && meta[0].max_records === maxRecords);
    count = get('SELECT count(*) AS count FROM main.fulfillment_cas_slots_v1').count;
    check(Number.isSafeInteger(count) && count >= 0 && count <= maxRecords);
    const records = all('SELECT * FROM main.fulfillment_cas_slots_v1 ORDER BY order_id'); check(records.length === count);
    for (const item of records) row(item); fullValidations++;
  }
  function usable() { if (closed) fail('CLOSED'); if (unavailable) fail('HELD'); if (busy) fail('BUSY'); }
  function transaction(work, initial = false) {
    usable(); busy = true; let began = false, committing = false, previousCount = count;
    try {
      exec('BEGIN IMMEDIATE'); began = true; const observed = versions();
      if (!initial && (epochs === null || observed.some((v, i) => v !== epochs[i]))) validateAll();
      previousCount = count; settings(); const result = work();
      // Capture while locked; a commit after unlock must be detected next time.
      const nextEpochs = versions(); committing = true; exec('COMMIT'); began = false;
      epochs = nextEpochs; transactions++; return result;
    } catch (e) {
      epochs = null; count = previousCount;
      if (began) { try { exec('ROLLBACK'); } catch { unavailable = true; fail('ROLLBACK_UNKNOWN'); } }
      if (committing) { unavailable = true; fail('COMMIT_UNKNOWN'); }
      if (e?.code === 'FULFILLMENT_SQLITE_CAPACITY') throw e;
      unavailable = true; fail('STORE_UNAVAILABLE');
    } finally { busy = false; }
  }
  settings();
  transaction(() => {
    if (creating) {
      check(all("SELECT name FROM main.sqlite_schema WHERE name NOT LIKE 'sqlite_%'").length === 0);
      for (const sql of SCHEMA.values()) exec(sql);
      run('INSERT INTO main.fulfillment_cas_meta_v1 VALUES(1,1,?,?)', storeId, maxRecords);
    }
    validateAll();
  }, true);
  const readEnvelope = function readEnvelope(orderId) {
    if (arguments.length !== 1) fail(); id(orderId); usable();
    return transaction(() => row(get('SELECT * FROM main.fulfillment_cas_slots_v1 WHERE order_id=?', orderId)));
  };
  const compareAndSwapEnvelope = function compareAndSwapEnvelope(orderId, expectedJson, nextJson) {
    if (arguments.length !== 3) fail(); id(orderId); usable();
    const next = requirePurchasedFulfillmentEnvelopeTransition(expectedJson, nextJson);
    if (next.storeId !== storeId || next.orderId !== orderId) fail('BINDING_CONFLICT');
    return transaction(() => {
      const actual = row(get('SELECT * FROM main.fulfillment_cas_slots_v1 WHERE order_id=?', orderId));
      if (actual !== expectedJson) return null;
      if (actual === nextJson) return nextJson;
      if (actual === null) {
        if (count >= maxRecords) fail('CAPACITY');
        run('INSERT INTO main.fulfillment_cas_slots_v1 VALUES(?,?,?,?,?)', orderId, next.ownerId, next.epoch, next.revision, nextJson); count++;
      } else {
        const result = run('UPDATE main.fulfillment_cas_slots_v1 SET owner_id=?,owner_epoch=?,revision=?,envelope_json=? WHERE order_id=? AND envelope_json=?',
          next.ownerId, next.epoch, next.revision, nextJson, orderId, expectedJson);
        check(result.changes === 1);
      }
      return nextJson;
    });
  };
  return Object.freeze({ readEnvelope, compareAndSwapEnvelope,
    close() { if (arguments.length !== 0) fail(); closed = true; cache.clear(); database = null; },
    snapshot() { return Object.freeze({ closed, busy, unavailable, records: count, maxRecords, fullValidations, transactions,
      authority: 'NONE', physicalRelease: 'NOT_QUALIFIED' }); } });
}
/** The caller owns the dedicated configured connection, file identity, quota and physical close. */
export function createNewPurchasedFulfillmentCasSqliteStore(database, storeId, inputLimits) {
  if (arguments.length !== 3) fail(); return create(database, storeId, inputLimits, true);
}
export function openExistingPurchasedFulfillmentCasSqliteStore(database, storeId, inputLimits) {
  if (arguments.length !== 3) fail(); return create(database, storeId, inputLimits, false);
}
