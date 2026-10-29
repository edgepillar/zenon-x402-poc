// Native source candidate. Parser checks do not execute or qualify SQLite.
import { DatabaseSync } from 'node:sqlite';
import { types } from 'node:util';
import { inspectOriginalFundingSpendingState, requireOriginalFundingSpendingStateTransition } from './original-funding-spending-reservations.js';
import { captureOriginalFundingSpendingSqliteProfile, requireOriginalFundingSpendingSqliteOwnership,
  nextOriginalFundingSpendingSqliteOwnership } from './original-funding-spending-sqlite-profile.js';
import { createOriginalFundingSignerIntent, inspectOriginalFundingSignerRecord, completeOriginalFundingSignerRecord,
  requireOriginalFundingSignerRecordTransition } from './original-funding-signer-custody.js';
import { createOriginalFundingSignerContextIntent, inspectOriginalFundingSignerContextRecord,
  completeOriginalFundingSignerContextRecord } from './original-funding-signer-context-custody.js';

const F = Object.freeze, EXEC = DatabaseSync.prototype.exec, PREPARE = DatabaseSync.prototype.prepare;
const SCHEMA = new Map([
  ['original_spending_meta_v1', 'CREATE TABLE original_spending_meta_v1(singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL CHECK(version=1), store_id TEXT NOT NULL CHECK(length(store_id) BETWEEN 1 AND 128), policy_json TEXT NOT NULL CHECK(length(CAST(policy_json AS BLOB)) BETWEEN 1 AND 8192), owner_id TEXT NOT NULL CHECK(length(owner_id) BETWEEN 1 AND 128), owner_epoch INTEGER NOT NULL CHECK(owner_epoch BETWEEN 1 AND 9007199254740990)) STRICT'],
  ['original_spending_state_v1', 'CREATE TABLE original_spending_state_v1(singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740990), state_json TEXT NOT NULL CHECK(length(CAST(state_json AS BLOB)) BETWEEN 1 AND 1048576)) STRICT'],
]);
const SIGNER_SCHEMA = ['original_spending_signer_v1', 'CREATE TABLE original_spending_signer_v1(payment_id TEXT PRIMARY KEY CHECK(length(payment_id) BETWEEN 1 AND 128), record_json TEXT NOT NULL CHECK(length(CAST(record_json AS BLOB)) BETWEEN 1 AND 16384)) STRICT'];
const SIGNER_CONTEXT_SCHEMA = ['original_spending_signer_v2', 'CREATE TABLE original_spending_signer_v2(payment_id TEXT PRIMARY KEY CHECK(length(payment_id) BETWEEN 1 AND 128), record_json TEXT NOT NULL CHECK(length(CAST(record_json AS BLOB)) BETWEEN 1 AND 196608)) STRICT'];
function fail(code) { const e = new TypeError('ORIGINAL_SPENDING_SQLITE_' + code); Object.defineProperty(e, 'stack', { value: e.message }); throw F(e); }
function check(value) { if (!value) fail('CORRUPT'); }
/** Borrow a dedicated, already configured connection. The caller owns physical
 * file admission, mount/quota checks and physical close. No connection is opened
 * here. Every operation checks the selected owner epoch inside BEGIN IMMEDIATE.
 * This is not independent authentication against an actor rewriting the file. */
export function openOriginalFundingSpendingSqliteStore(database, profileInput) {
  if (arguments.length !== 2) fail('INPUT');
  return openStore(database, profileInput, false);
}
/** Source-only application data profile: the original two budget tables plus
 * one bounded signer-evidence table under the SAME epoch/transaction checks.
 * No adoption/migration of a two-table file, signer call inside SQL, automatic
 * recovery, replacement, intent reset or permission from a historical row. */
export function openOriginalFundingSpendingSignerCustodySqliteStore(database, profileInput) {
  if (arguments.length !== 2) fail('INPUT');
  return openStore(database, profileInput, true);
}
/** Current application profile; v1 signer files are retained/refused, not migrated. */
export function openOriginalFundingSpendingSignerContextSqliteStore(database, profileInput) {
  if (arguments.length !== 2) fail('INPUT'); return openStore(database, profileInput, true, true);
}
function openStore(database, profileInput, signerCustodyEnabled, signerContextEnabled = false) {
  const profile = captureOriginalFundingSpendingSqliteProfile(profileInput);
  if (database === null || typeof database !== 'object' || types.isProxy(database) || Object.getPrototypeOf(database) !== DatabaseSync.prototype) fail('DATABASE');
  const policy = profile.policy, token = profile.ownerToken, policyJson = JSON.stringify(policy), cache = new Map();
  const selectedSignerSchema = signerContextEnabled ? SIGNER_CONTEXT_SCHEMA : SIGNER_SCHEMA;
  const schema = new Map(SCHEMA); if (signerCustodyEnabled) schema.set(...selectedSignerSchema);
  const signerTable = selectedSignerSchema[0], inspectSigner = signerContextEnabled ? inspectOriginalFundingSignerContextRecord : inspectOriginalFundingSignerRecord;
  let closed = false, busy = false, held = false, lastRevision = null, transactions = 0, transferred = false;
  const exec = sql => Reflect.apply(EXEC, database, [sql]);
  function statement(sql) { if (!cache.has(sql)) cache.set(sql, Reflect.apply(PREPARE, database, [sql])); return cache.get(sql); }
  const get = (sql, ...args) => statement(sql).get(...args);
  const all = (sql, ...args) => statement(sql).all(...args);
  const run = (sql, ...args) => statement(sql).run(...args);
  function retire() { if (!busy && closed) { cache.clear(); database = null; } }
  function usable() { if (closed || held || busy) fail(closed ? 'CLOSED' : held ? 'HELD' : 'BUSY'); }
  function settings() {
    check(get('PRAGMA main.journal_mode').journal_mode === 'delete');
    check([2, 3].includes(get('PRAGMA main.synchronous').synchronous));
    check(get('PRAGMA temp_store').temp_store === 2 && get('PRAGMA foreign_keys').foreign_keys === 1);
    check(get('PRAGMA ignore_check_constraints').ignore_check_constraints === 0);
    const timeout = get('PRAGMA busy_timeout').timeout; check(Number.isSafeInteger(timeout) && timeout >= 0 && timeout <= 100);
    const databases = all('PRAGMA database_list'), main = databases.find(r => r.name === 'main');
    check(main !== undefined && main.file === profile.databasePath && databases.every(r => r.name === 'main' || r.name === 'temp'));
    if (databases.some(r => r.name === 'temp')) check(all("SELECT name FROM temp.sqlite_schema WHERE name NOT GLOB 'sqlite_*'").length === 0);
  }
  function validate() {
    settings();
    const tables = all("SELECT name,type,sql FROM main.sqlite_schema WHERE name NOT GLOB 'sqlite_*'");
    check(tables.length === schema.size && tables.every(r => r.type === 'table' && schema.get(r.name) === r.sql));
    const metadata = all('SELECT * FROM main.original_spending_meta_v1'), records = all('SELECT * FROM main.original_spending_state_v1');
    check(metadata.length === 1 && records.length === 1);
    const m = metadata[0], r = records[0];
    check(m.singleton === 1 && m.version === 1 && m.store_id === token.storeId && m.policy_json === policyJson && r.singleton === 1);
    const raw = r.state_json === 'null' ? null : r.state_json;
    const state = inspectOriginalFundingSpendingState(raw, policy);
    check(r.revision === state.revision);
    if (lastRevision !== null) check(state.revision >= lastRevision);
    requireOriginalFundingSpendingSqliteOwnership(token, { version: 1, storeId: m.store_id, accountId: policy.accountId,
      ownerId: m.owner_id, epoch: m.owner_epoch, minimumRevision: state.revision }, policy);
    const signerRecords = new Map();
    if (signerCustodyEnabled) {
      const reservations = new Map(state.reservations.map(r => [r.paymentId, r]));
      const rows = all('SELECT payment_id,record_json FROM main.' + signerTable + ' ORDER BY payment_id LIMIT ?', policy.maxRecords + 1);
      check(rows.length <= policy.maxRecords);
      for (const row of rows) {
        const reservation = reservations.get(row.payment_id); check(reservation !== undefined);
        const captured = inspectSigner(row.record_json, reservation);
        check(captured.paymentId === row.payment_id && captured.accountAddress === policy.accountId && !signerRecords.has(row.payment_id));
        signerRecords.set(row.payment_id, { raw: row.record_json, captured });
      }
      for (const r of state.reservations) if (r.status === 'SPENT') check(signerRecords.get(r.paymentId)?.captured.phase === 'SIGNED');
    }
    lastRevision = state.revision; return { raw, state, signerRecords };
  }
  function transaction(work, creating = false) {
    usable(); busy = true; let began = false, committing = false;
    try {
      exec('BEGIN IMMEDIATE'); began = true;
      if (creating) {
        settings(); check(all("SELECT name FROM main.sqlite_schema WHERE name NOT GLOB 'sqlite_*'").length === 0);
        for (const sql of schema.values()) exec(sql);
        run('INSERT INTO main.original_spending_meta_v1 VALUES(1,1,?,?,?,?)', token.storeId, policyJson, token.ownerId, token.epoch);
        run("INSERT INTO main.original_spending_state_v1 VALUES(1,0,'null')");
      }
      const current = validate(), value = work(current);
      if (closed) fail('CLOSED');
      committing = true; exec('COMMIT'); began = false;
      if (closed) fail('ACK_UNKNOWN');
      transactions++; return value;
    } catch {
      held = true;
      if (began) { try { exec('ROLLBACK'); } catch { fail('ROLLBACK_UNKNOWN'); } }
      fail(committing ? 'COMMIT_UNKNOWN' : 'STORE_UNAVAILABLE');
    } finally { busy = false; retire(); }
  }
  try { transaction(() => undefined, profile.mode === 'CREATE_NEW'); }
  catch { fail('OPEN_REFUSED'); }
  function account(value) { if (value !== policy.accountId) fail('ACCOUNT'); }
  return F({
    load(accountId) {
      if (arguments.length !== 1) fail('INPUT'); account(accountId); return transaction(current => current.raw);
    },
    compareAndSwap(accountId, expected, proposed) {
      if (arguments.length !== 3) fail('INPUT'); account(accountId); usable();
      const next = requireOriginalFundingSpendingStateTransition(expected, proposed, policy);
      return transaction(current => {
        if (current.raw !== expected) return null;
        if (proposed === expected) return proposed;
        if (signerCustodyEnabled) for (const r of next.reservations) if (r.status === 'SPENT') check(current.signerRecords.get(r.paymentId)?.captured.phase === 'SIGNED');
        const changed = run('UPDATE main.original_spending_state_v1 SET revision=?,state_json=? WHERE singleton=1 AND revision=? AND state_json=?',
          next.revision, proposed, current.state.revision, expected === null ? 'null' : expected);
        check(changed.changes === 1); lastRevision = next.revision; return proposed;
      });
    },
    ...(signerCustodyEnabled ? {
      beginSignerAttempt(paymentId, unsignedBlock, context) {
        if (arguments.length !== (signerContextEnabled ? 3 : 2)) fail('INPUT');
        return transaction(current => {
          const reservation = current.state.reservations.find(r => r.paymentId === paymentId);
          check(reservation !== undefined && reservation.status === 'RESERVED' && !current.signerRecords.has(paymentId));
          const raw = signerContextEnabled ? createOriginalFundingSignerContextIntent(reservation, unsignedBlock, context) : createOriginalFundingSignerIntent(reservation, unsignedBlock);
          const captured = signerContextEnabled ? inspectSigner(raw, reservation) : requireOriginalFundingSignerRecordTransition(null, raw, reservation); check(captured.accountAddress === policy.accountId);
          const changed = run('INSERT INTO main.' + signerTable + ' VALUES(?,?)', paymentId, raw); check(changed.changes === 1);
          check(get('SELECT record_json FROM main.' + signerTable + ' WHERE payment_id=?', paymentId).record_json === raw);
          return raw;
        });
      },
      retainSignerResult(paymentId, expected, signedBlock) {
        if (arguments.length !== 3) fail('INPUT');
        return transaction(current => {
          const reservation = current.state.reservations.find(r => r.paymentId === paymentId), prior = current.signerRecords.get(paymentId);
          check(reservation !== undefined && prior !== undefined && prior.raw === expected && prior.captured.phase === 'INTENT');
          const raw = (signerContextEnabled ? completeOriginalFundingSignerContextRecord : completeOriginalFundingSignerRecord)(expected, signedBlock, reservation);
          if (!signerContextEnabled) requireOriginalFundingSignerRecordTransition(expected, raw, reservation);
          const changed = run('UPDATE main.' + signerTable + ' SET record_json=? WHERE payment_id=? AND record_json=?', raw, paymentId, expected); check(changed.changes === 1);
          check(get('SELECT record_json FROM main.' + signerTable + ' WHERE payment_id=?', paymentId).record_json === raw);
          return raw;
        });
      },
      readSignerRecord(paymentId) {
        if (arguments.length !== 1 || typeof paymentId !== 'string' || /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.exec(paymentId)?.[0] !== paymentId) fail('INPUT');
        return transaction(current => current.signerRecords.get(paymentId)?.raw ?? null);
      },
    } : {}),
    transferOwnership(nextOwnerId) {
      if (arguments.length !== 1) fail('INPUT');
      nextOriginalFundingSpendingSqliteOwnership(token, nextOwnerId, token.minimumRevision, policy);
      const next = transaction(current => {
        const selected = nextOriginalFundingSpendingSqliteOwnership(token, nextOwnerId, current.state.revision, policy);
        const changed = run('UPDATE main.original_spending_meta_v1 SET owner_id=?,owner_epoch=? WHERE singleton=1 AND owner_id=? AND owner_epoch=?',
          selected.ownerId, selected.epoch, token.ownerId, token.epoch);
        check(changed.changes === 1); return selected;
      });
      transferred = true; closed = true; retire(); return F({ ownerToken: next, authority: 'NONE', physicalRelease: 'NOT_QUALIFIED' });
    },
    close() { if (arguments.length !== 0) fail('INPUT'); closed = true; if (busy) held = true; retire(); },
    snapshot() { if (arguments.length !== 0) fail('INPUT'); return F({ closed, busy, held, transferred, lastRevision, ownerEpoch: token.epoch, transactions,
      authority: 'NONE', physicalRelease: 'NOT_QUALIFIED' }); },
  });
}
