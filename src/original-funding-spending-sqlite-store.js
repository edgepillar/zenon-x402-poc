// Native source candidate. Parser checks do not execute or qualify SQLite.
import { DatabaseSync } from 'node:sqlite';
import { types } from 'node:util';
import { inspectOriginalFundingSpendingState, requireOriginalFundingSpendingStateTransition } from './original-funding-spending-reservations.js';
import { captureOriginalFundingSpendingSqliteProfile, requireOriginalFundingSpendingSqliteOwnership,
  nextOriginalFundingSpendingSqliteOwnership } from './original-funding-spending-sqlite-profile.js';

const F = Object.freeze, EXEC = DatabaseSync.prototype.exec, PREPARE = DatabaseSync.prototype.prepare;
const SCHEMA = new Map([
  ['original_spending_meta_v1', 'CREATE TABLE original_spending_meta_v1(singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL CHECK(version=1), store_id TEXT NOT NULL CHECK(length(store_id) BETWEEN 1 AND 128), policy_json TEXT NOT NULL CHECK(length(CAST(policy_json AS BLOB)) BETWEEN 1 AND 8192), owner_id TEXT NOT NULL CHECK(length(owner_id) BETWEEN 1 AND 128), owner_epoch INTEGER NOT NULL CHECK(owner_epoch BETWEEN 1 AND 9007199254740990)) STRICT'],
  ['original_spending_state_v1', 'CREATE TABLE original_spending_state_v1(singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740990), state_json TEXT NOT NULL CHECK(length(CAST(state_json AS BLOB)) BETWEEN 1 AND 1048576)) STRICT'],
]);
function fail(code) { const e = new TypeError('ORIGINAL_SPENDING_SQLITE_' + code); Object.defineProperty(e, 'stack', { value: e.message }); throw F(e); }
function check(value) { if (!value) fail('CORRUPT'); }
/** Borrow a dedicated, already configured connection. The caller owns physical
 * file admission, mount/quota checks and physical close. No connection is opened
 * here. Every operation checks the selected owner epoch inside BEGIN IMMEDIATE.
 * This is not independent authentication against an actor rewriting the file. */
export function openOriginalFundingSpendingSqliteStore(database, profileInput) {
  if (arguments.length !== 2) fail('INPUT');
  const profile = captureOriginalFundingSpendingSqliteProfile(profileInput);
  if (database === null || typeof database !== 'object' || types.isProxy(database) || Object.getPrototypeOf(database) !== DatabaseSync.prototype) fail('DATABASE');
  const policy = profile.policy, token = profile.ownerToken, policyJson = JSON.stringify(policy), cache = new Map();
  let closed = false, busy = false, held = false, lastRevision = null, transactions = 0, transferred = false;
  const exec = sql => Reflect.apply(EXEC, database, [sql]);
  function statement(sql) { if (!cache.has(sql)) cache.set(sql, Reflect.apply(PREPARE, database, [sql])); return cache.get(sql); }
  const get = (sql, ...args) => statement(sql).get(...args);
  const all = sql => statement(sql).all();
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
    check(tables.length === 2 && tables.every(r => r.type === 'table' && SCHEMA.get(r.name) === r.sql));
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
    lastRevision = state.revision; return { raw, state };
  }
  function transaction(work, creating = false) {
    usable(); busy = true; let began = false, committing = false;
    try {
      exec('BEGIN IMMEDIATE'); began = true;
      if (creating) {
        settings(); check(all("SELECT name FROM main.sqlite_schema WHERE name NOT GLOB 'sqlite_*'").length === 0);
        for (const sql of SCHEMA.values()) exec(sql);
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
        const changed = run('UPDATE main.original_spending_state_v1 SET revision=?,state_json=? WHERE singleton=1 AND revision=? AND state_json=?',
          next.revision, proposed, current.state.revision, expected === null ? 'null' : expected);
        check(changed.changes === 1); lastRevision = next.revision; return proposed;
      });
    },
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
