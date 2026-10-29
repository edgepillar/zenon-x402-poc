// SOURCE ONLY. No SQLite/filesystem execution is established by parser checks.
import { DatabaseSync } from 'node:sqlite';
import { lstatSync, readdirSync, statfsSync, openSync, fstatSync, fsyncSync, closeSync, constants } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { getuid } from 'node:process';
import { captureOriginalFundingSpendingFileProfile, requireOriginalFundingSpendingFileCapacity } from './original-funding-spending-file-profile.js';
import { openOriginalFundingSpendingSqliteStore, openOriginalFundingSpendingSignerCustodySqliteStore, openOriginalFundingSpendingSignerContextSqliteStore, openOriginalFundingSpendingGrantRecoverySqliteStore } from './original-funding-spending-sqlite-store.js';

const F = Object.freeze, APPLY = Reflect.apply, PROTO = DatabaseSync.prototype;
const EXEC = PROTO.exec, PREPARE = PROTO.prepare, CLOSE = PROTO.close;
const IS_OPEN = Object.getOwnPropertyDescriptor(PROTO, 'isOpen').get;
const OWNERS = new Map();
function fail(code) { const e = new TypeError('ORIGINAL_SPENDING_FILE_' + code); Object.defineProperty(e, 'stack', { value: e.message }); throw F(e); }
function identity(s) { return [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink].map(String).join(':'); }
/** Own one dedicated private file/connection and the actual SQLite backend.
 * Never create a directory, adopt an existing file in CREATE_NEW, migrate,
 * unlink a journal, retry an unknown close or claim a filesystem/OS lease. */
export function openOriginalFundingSpendingFileOwner(configuration) {
  if (arguments.length !== 1) fail('INPUT');
  return openFile(configuration, false);
}
/** Same bounded physical owner with the explicit three-table application
 * profile. Existing two-table files are refused, never migrated/adopted. */
export function openOriginalFundingSpendingSignerCustodyFileOwner(configuration) {
  if (arguments.length !== 1) fail('INPUT');
  return openFile(configuration, true);
}
export function openOriginalFundingSpendingSignerContextFileOwner(configuration) {
  if (arguments.length !== 1) fail('INPUT'); return openFile(configuration, true, true);
}
/** Same owned connection, with write-once original grant-query custody. */
export function openOriginalFundingSpendingGrantRecoveryFileOwner(configuration) {
  if (arguments.length !== 1) fail('INPUT'); return openFile(configuration, true, true, true);
}
function openFile(configuration, signerCustodyEnabled, signerContextEnabled = false, grantRecoveryEnabled = false) {
  const c = captureOriginalFundingSpendingFileProfile(configuration), p = c.storageProfile, path = p.databasePath;
  const key = path, file = basename(path), uid = BigInt(getuid());
  if (OWNERS.has(key) || OWNERS.size >= 16) fail('OWNER_UNAVAILABLE');
  const slot = { database: null, backend: null, phase: 'ADMITTING', fileCreated: false }; OWNERS.set(key, slot);
  let db = null, store = null, rootIdentity = null, fileIdentity = null, busy = false, held = false;
  let revoked = false, physicalCloseEntered = false, physicalCloseReturned = false;
  const physicalOpen = () => db !== null && APPLY(IS_OPEN, db, []);
  function privateRoot() {
    let at = c.allowedRoot;
    while (true) {
      const s = lstatSync(at, { bigint: true }); if (!s.isDirectory() || s.isSymbolicLink()) fail('DIRECTORY');
      if (at === c.allowedRoot) {
        if (s.uid !== uid || (s.mode & 0o777n) !== 0o700n || String(s.dev) !== c.filePolicy.expectedDevice) fail('DIRECTORY');
        if (rootIdentity !== null && identity(s) !== rootIdentity) fail('DIRECTORY_IDENTITY');
        rootIdentity ??= identity(s);
      }
      const parent = dirname(at); if (parent === at) break; at = parent;
    }
  }
  function checkedFile(name, maximum, main = false) {
    const s = lstatSync(join(c.allowedRoot, name), { bigint: true });
    if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1n || s.uid !== uid || (s.mode & 0o777n) !== 0o600n
        || String(s.dev) !== c.filePolicy.expectedDevice || s.size > BigInt(maximum)) fail('FILE');
    if (main && fileIdentity !== null && identity(s) !== fileIdentity) fail('FILE_IDENTITY');
    return s;
  }
  function guard(expectMain = true, checkCapacity = true) {
    privateRoot();
    const names = readdirSync(c.allowedRoot); if (names.length > 2) fail('FOREIGN_FILE');
    if (expectMain && !names.includes(file)) fail('FILE_MISSING');
    for (const name of names) {
      if (name === file && expectMain) checkedFile(name, c.filePolicy.maxDatabaseBytes, true);
      else if (name === file + '-journal' && expectMain) checkedFile(name, c.filePolicy.maxDatabaseBytes + 65536);
      else fail('FOREIGN_FILE');
    }
    if (checkCapacity) {
      const s = statfsSync(c.allowedRoot, { bigint: true });
      requireOriginalFundingSpendingFileCapacity(c, String(s.bavail * s.bsize));
    }
  }
  function query(sql) { return APPLY(PREPARE, db, [sql]).get(); }
  function markHeld() { held = true; slot.phase = 'HELD'; }
  try {
    guard(p.mode !== 'CREATE_NEW');
    if (p.mode === 'CREATE_NEW') {
      // A failed creation/initialization leaves its exact file as evidence.
      const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { fileIdentity = identity(fstatSync(fd, { bigint: true })); fsyncSync(fd); slot.fileCreated = true; }
      finally { closeSync(fd); }
    } else fileIdentity = identity(checkedFile(file, c.filePolicy.maxDatabaseBytes, true));
    guard();
    db = new DatabaseSync(path, { enableForeignKeyConstraints: true, enableDoubleQuotedStringLiterals: false,
      allowExtension: false, timeout: 0, defensive: true }); slot.database = db;
    if (p.mode === 'CREATE_NEW') APPLY(EXEC, db, ['PRAGMA page_size=4096; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;']);
    APPLY(EXEC, db, ['PRAGMA temp_store=MEMORY; PRAGMA foreign_keys=ON; PRAGMA ignore_check_constraints=OFF; PRAGMA busy_timeout=0;']);
    if (query('PRAGMA page_size').page_size !== 4096) fail('PAGE_PROFILE');
    const cap = c.filePolicy.maxDatabaseBytes / 4096;
    if (query('PRAGMA page_count').page_count > cap || query('PRAGMA max_page_count=' + cap).max_page_count !== cap) fail('PAGE_PROFILE');
    store = (grantRecoveryEnabled ? openOriginalFundingSpendingGrantRecoverySqliteStore : signerContextEnabled ? openOriginalFundingSpendingSignerContextSqliteStore : signerCustodyEnabled ? openOriginalFundingSpendingSignerCustodySqliteStore : openOriginalFundingSpendingSqliteStore)(db, p); slot.backend = store;
    guard(); slot.phase = 'OPEN';
    if (p.mode === 'CREATE_NEW') {
      const fd = openSync(c.allowedRoot, constants.O_RDONLY | constants.O_NOFOLLOW);
      try { fsyncSync(fd); } finally { closeSync(fd); }
    }
  } catch {
    markHeld();
    // Keep the owned file, connection and initialization outcome private and
    // retained. No competing caller or late result may adopt/reset the slot.
    throw new TypeError('ORIGINAL_SPENDING_FILE_OPEN_HELD');
  }
  function available() { if (held || revoked || busy || physicalCloseEntered || !physicalOpen()) fail('UNAVAILABLE'); }
  function operation(name, args) {
    available(); busy = true;
    try { guard(); const value = APPLY(store[name], store, args); guard(); return value; }
    catch { markHeld(); fail('OPERATION_UNKNOWN'); }
    finally { busy = false; }
  }
  const backend = F({ load(account) { if (arguments.length !== 1) fail('INPUT'); return operation('load', [account]); },
    compareAndSwap(account, expected, proposed) { if (arguments.length !== 3) fail('INPUT'); return operation('compareAndSwap', [account, expected, proposed]); } });
  function assertCurrent() {
    if (arguments.length !== 0) fail('INPUT');
    // The real store validates owner epoch/revision inside BEGIN IMMEDIATE.
    // SPENT is not permission for a stale worker to keep dispatching services.
    operation('load', [p.policy.accountId]);
  }
  function revoke() {
    if (arguments.length !== 0) fail('INPUT');
    if (revoked) return;
    revoked = true; if (busy) markHeld();
    try { if (store.close() !== undefined || store.snapshot().held || store.snapshot().busy) markHeld(); }
    catch { markHeld(); }
    if (held) fail('REVOKE_UNKNOWN');
  }
  function close() {
    if (arguments.length !== 0) fail('INPUT');
    if (physicalCloseReturned && !held && !physicalOpen()) return;
    if (!revoked || held || busy || physicalCloseEntered || !store.snapshot().closed || store.snapshot().busy) fail('CLOSE_UNAVAILABLE');
    physicalCloseEntered = true;
    try {
      // Closing must not depend on the free-space floor still being available.
      // Exact file/root identity remains required; no alternate path is opened.
      privateRoot(); checkedFile(file, c.filePolicy.maxDatabaseBytes, true);
      if (APPLY(CLOSE, db, []) !== undefined || physicalOpen()) fail('CLOSE_UNKNOWN');
      physicalCloseReturned = true; slot.phase = 'CLOSED'; OWNERS.delete(key);
    } catch { markHeld(); fail('CLOSE_UNKNOWN'); }
  }
  function inspect() {
    if (arguments.length !== 0) fail('INPUT');
    let open = true;
    try { guard(true, false); open = physicalOpen(); if (physicalCloseReturned && open) markHeld(); }
    catch { markHeld(); }
    return F({ spendingFileOwnerVersion: 1, lifecycle: held ? 'HELD' : physicalCloseReturned ? 'CLOSED' : revoked ? 'REVOKED' : 'OPEN',
      held, busy, backendClosed: revoked, databaseOpen: open, physicalCloseEntered, physicalCloseReturned,
      physicalRelease: physicalCloseReturned ? 'CLOSE_RETURNED' : held ? 'HELD' : 'NOT_ESTABLISHED',
      nativeResourceCleanup: 'NOT_QUALIFIED', authority: 'NONE' });
  }
  const signerCustody = signerCustodyEnabled ? F({
    // The selected context wallet rechecks this same existing owner/token
    // after intent I/O, outside the SDK signer call. No owner is acquired.
    ...(signerContextEnabled ? { requirePreparationContext: true, assertCurrent: F(assertCurrent) } : {}),
    beginSignerAttempt: F(function beginSignerAttempt(paymentId, unsignedBlock, context) {
      if (arguments.length !== (signerContextEnabled ? 3 : 2)) fail('INPUT');
      return operation('beginSignerAttempt', signerContextEnabled ? [paymentId, unsignedBlock, context] : [paymentId, unsignedBlock]);
    }),
    retainSignerResult: F(function retainSignerResult(paymentId, expected, signedBlock) {
      if (arguments.length !== 3) fail('INPUT'); return operation('retainSignerResult', [paymentId, expected, signedBlock]);
    }),
    readSignerRecord: F(function readSignerRecord(paymentId) {
      if (arguments.length !== 1) fail('INPUT'); return operation('readSignerRecord', [paymentId]);
    }),
  }) : null;
  const grantQueryCustody = grantRecoveryEnabled ? F({
    retain: F(function retain(paymentId, profileJson) { if (arguments.length !== 2) fail('INPUT'); return operation('retainGrantQuery', [paymentId, profileJson]); }),
    read: F(function read(paymentId) { if (arguments.length !== 1) fail('INPUT'); return operation('readGrantQuery', [paymentId]); }),
    assertCurrent: F(assertCurrent),
  }) : null;
  return F({ backend, ...(signerCustodyEnabled ? { signerCustody } : {}), ...(grantRecoveryEnabled ? { grantQueryCustody } : {}), assertCurrent: F(assertCurrent), revoke: F(revoke), close: F(close), inspect: F(inspect) });
}
