import test from 'node:test';
import { equal, deepStrictEqual as same, ok } from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync,
  readSync, readdirSync, realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

/* SOURCE DRAFT / NOT_RUN. One synchronous registration, one fresh private DB.
 * Public model V1; public envelope V1; current physical/state schema V2.
 * Only synthetic initialization and one sqliteX_shadow CREATE TABLE mutate data.
 * No grants, funding, keys, execution, hooks, transport, retry, repair or deletion.
 * The final failed constructor's internal close is UNINSTRUMENTED_NOT_ESTABLISHED.
 * Limits and source guards do not establish cancellation or OS isolation.
 */
const SELF = 'qualification/service-credit-sqlite-literal-system-prefix.draft.mjs';
const EXPECTED_REFUSAL = 'SERVICE_CREDIT_STORE_CORRUPT';
const SPECS = [{"path":"src/service-credit-sqlite-store.js","bytes":82141,"LF":2333,"sha256":"bda45bd553c8580a7bd66573bb2fb7c3bf12d79bab49a91fe3ac6dc1ebad8422","gitBlob":"6a7364fbc59c43edffb7a73f550210644e78daff"},{"path":"src/service-credit-model.js","bytes":55461,"LF":1580,"sha256":"7ff7e3d88ab8c3b38a0073541533fbdb7a0d9f2be42f337ac35f6a3b05615c3a","gitBlob":"e6ac17254874584d1a01f70e7abc6f771bd35d73"},{"path":"src/service-credit-execution-contract.js","bytes":30258,"LF":956,"sha256":"298f8e74885e1c507953c0fcf7874832f815296746e6bacbdac97a425f1a6c73","gitBlob":"acfbb5c5e943b9e09958a7831b3dbe159463dcf9"},{"path":"package.json","bytes":1413,"LF":40,"sha256":"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5","gitBlob":"ec7193f6fd76f34778515079dc777594175c4c34"}];
const LEDGER_SQL = 'CREATE TABLE service_credit_ledger(singleton INTEGER PRIMARY KEY CHECK(singleton = 1), envelope TEXT NOT NULL) STRICT';
const SHADOW_SQL = 'CREATE TABLE sqliteX_shadow(marker INTEGER) STRICT';
const OLD_FILTER = "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name";
const CURRENT_FILTER = "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite!_%' ESCAPE '!' ORDER BY type, name";
const ALL_SCHEMA = 'SELECT type, name, tbl_name, rootpage, sql FROM sqlite_schema ORDER BY type, name';
const LEDGER_ROWS = 'SELECT singleton, envelope FROM service_credit_ledger ORDER BY singleton';
const EMPTY_STATE = Object.freeze({
  schemaVersion: 2, modelVersion: 1,
  offers: Object.freeze([]), grants: Object.freeze([]), requests: Object.freeze([]),
});
const stamp = stat => [
  stat.dev, stat.ino, stat.uid, stat.mode, stat.nlink,
  stat.size, stat.mtimeNs, stat.ctimeNs,
];
const textStamp = stat => stamp(stat).map(String);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function blob(bytes) {
  return createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
}
function redacted(label) {
  const error = new Error(label);
  Object.defineProperty(error, 'stack', { value: 'Error: ' + label });
  return Object.freeze(error);
}
function hold(S, label) {
  if (S.hold === 'NONE') S.hold = label;
}
function absent(path) {
  try { lstatSync(path); }
  catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw redacted('NEW_FIXTURE_PATH_ALREADY_EXISTS_HOLD');
}
function directories(path) {
  equal(typeof path, 'string');
  ok(path.length > 0 && path.length < 3800 && isAbsolute(path));
  equal(resolve(path), path); equal(path.includes('\0'), false);
  for (let current = path, depth = 0; ; depth += 1) {
    ok(depth < 128);
    const stat = lstatSync(current, { bigint: true });
    ok(stat.isDirectory()); equal(stat.isSymbolicLink(), false);
    equal(realpathSync(current), current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function privateDirectory(path, uid, device) {
  directories(path);
  const stat = lstatSync(path, { bigint: true });
  equal(stat.uid, uid); equal(stat.mode & 0o7777n, 0o700n);
  if (device !== undefined) equal(stat.dev, device);
  return stat;
}
function sourceBytes(path, expected, cap, uid) {
  directories(dirname(path)); equal(realpathSync(path), path);
  const before = lstatSync(path, { bigint: true });
  ok(before.isFile()); equal(before.isSymbolicLink(), false);
  equal(before.uid, uid); equal(before.nlink, 1n);
  equal(before.mode & 0o7777n, 0o644n);
  ok(before.size > 0n && before.size <= BigInt(cap));
  same(textStamp(before), expected);
  ok(Number.isInteger(constants.O_NOFOLLOW) && constants.O_NOFOLLOW !== 0);
  let fd = null;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    same(textStamp(fstatSync(fd, { bigint: true })), expected);
    const storage = Buffer.alloc(Number(before.size) + 1);
    let length = 0, eof = false;
    while (length < storage.length) {
      const count = readSync(fd, storage, length, storage.length - length, null);
      if (count === 0) { eof = true; break; }
      length += count;
    }
    equal(eof, true); equal(length, Number(before.size));
    same(textStamp(fstatSync(fd, { bigint: true })), expected);
    same(textStamp(lstatSync(path, { bigint: true })), expected);
    directories(dirname(path)); equal(realpathSync(path), path);
    const raw = storage.subarray(0, length);
    for (const value of raw) ok(value <= 0x7f);
    return raw;
  } finally {
    // An unknown source-FD close aborts the test before any DB acquisition.
    if (fd !== null) closeSync(fd);
  }
}
function exactEnvironment(S) {
  equal(process.versions.node, '24.19.0');
  equal(process.platform, 'darwin'); equal(process.arch, 'arm64');
  equal(process.argv.length, 2);
  equal(process.argv[1], fileURLToPath(import.meta.url));
  equal(process.execArgv.length, 4);
  same(process.execArgv.slice(0, 3), [
    '--no-addons', '--disallow-code-generation-from-strings', '-e',
  ]);
  equal(typeof process.getuid, 'function');
  S.uid = BigInt(process.getuid());
  same(Object.keys(process.env).sort(), [
    'PATH', 'LC_ALL', 'SPV_TASK_SCRATCH', 'SPV_SQLITE_FIXTURE_ROOT',
    'TMPDIR', 'SQLITE_TMPDIR', 'NODE_TEST_WORKER_ID',
    '__CF_USER_TEXT_ENCODING', 'SPV_SQLITE_SOURCE_BINDINGS_JSON',
  ].sort());
  equal(process.env.PATH, '/usr/bin:/bin'); equal(process.env.LC_ALL, 'C');
  equal(process.env.NODE_TEST_WORKER_ID, '1');
  equal(process.env.__CF_USER_TEXT_ENCODING,
    '0x' + Number(S.uid).toString(16).toUpperCase() + ':0:0');
  const scratch = process.env.SPV_TASK_SCRATCH;
  const scratchStat = privateDirectory(scratch, S.uid);
  S.root = process.env.SPV_SQLITE_FIXTURE_ROOT;
  equal(S.root, join(scratch, 'sqlite-recovery-observation-collection-fixtures'));
  equal(process.env.TMPDIR, S.root); equal(process.env.SQLITE_TMPDIR, S.root);
  S.rootIdentity = privateDirectory(S.root, S.uid, scratchStat.dev);
  same(readdirSync(S.root), []);
}
async function currentGraph(S) {
  S.stage = 'CURRENT_SOURCE_GUARDS';
  const selfPath = fileURLToPath(import.meta.url);
  const repository = dirname(dirname(selfPath));
  directories(repository); equal(selfPath, join(repository, SELF));
  const encoded = process.env.SPV_SQLITE_SOURCE_BINDINGS_JSON;
  ok(typeof encoded === 'string' && encoded.length > 0 && encoded.length <= 16384);
  const bindings = JSON.parse(encoded);
  equal(Object.getPrototypeOf(bindings), Object.prototype);
  same(Object.keys(bindings).sort(), [...SPECS.map(pin => pin.path), SELF].sort());
  for (const path of Object.keys(bindings)) {
    const record = bindings[path];
    ok(Array.isArray(record)); equal(record.length, 8);
    for (const value of record) ok(typeof value === 'string' && /^[0-9]+$/.test(value));
  }
  for (const pin of SPECS) {
    const expected = bindings[pin.path];
    const cap = pin.path === 'src/service-credit-sqlite-store.js' ? 100000 : 65536;
    const raw = sourceBytes(join(repository, pin.path), expected, cap, S.uid);
    equal(raw.length, pin.bytes);
    equal(raw.toString('ascii').split('\n').length - 1, pin.LF);
    equal(sha(raw), pin.sha256); equal(blob(raw), pin.gitBlob);
    if (pin.path === 'package.json') equal(JSON.parse(raw.toString('ascii')).type, 'module');
    S.sourceGuards += 1;
  }
  // Parent must independently bind this self digest before admission; no circular self hash.
  const self = sourceBytes(selfPath, bindings[SELF], 49152, S.uid);
  S.selfBytes = self.length; S.selfDigest = sha(self); S.sourceGuards += 1;
  equal(S.sourceGuards, 5);
  S.stage = 'EXACT_CURRENT_GRAPH_IMPORT';
  const module = await import(new URL('../src/service-credit-sqlite-store.js', import.meta.url).href);
  equal(typeof module.ServiceCreditSqliteStore, 'function');
  equal(typeof module.ServiceCreditSqliteStoreError, 'function');
  equal(module.SERVICE_CREDIT_SQLITE_SCHEMA_VERSION, 2);
  S.Store = module.ServiceCreditSqliteStore;
  S.StoreError = module.ServiceCreditSqliteStoreError;
}
function makeUnit(S) {
  S.stage = 'NEW_PRIVATE_UNIT';
  const root = privateDirectory(S.root, S.uid, S.rootIdentity.dev);
  same(stamp(root), stamp(S.rootIdentity)); same(readdirSync(S.root), []);
  S.directory = join(S.root, 'literal-system-prefix');
  absent(S.directory); mkdirSync(S.directory, { mode: 0o700 });
  const unit = privateDirectory(S.directory, S.uid, root.dev);
  S.unitIdentity = [unit.dev, unit.ino];
  S.path = join(S.directory, 'ledger.sqlite');
  same(readdirSync(S.directory), []); absent(S.path);
  S.options = Object.freeze({
    databasePath: S.path, allowedRoot: S.directory,
    deriveCost() { S.costCalls += 1; return 1; },
    now() { S.clockCalls += 1; return 2_000_000_000_000; },
    busyTimeoutMs: 50, maxStateBytes: 4096,
    maxOffers: 1, maxGrants: 1, maxRequests: 1,
  });
}
function databaseIdentity(S) {
  const unit = privateDirectory(S.directory, S.uid, S.rootIdentity.dev);
  same([unit.dev, unit.ino], S.unitIdentity);
  same(readdirSync(S.directory), ['ledger.sqlite']);
  const stat = lstatSync(S.path, { bigint: true });
  ok(stat.isFile()); equal(stat.isSymbolicLink(), false);
  equal(stat.uid, S.uid); equal(stat.dev, S.rootIdentity.dev);
  equal(stat.nlink, 1n); equal(stat.mode & 0o7777n, 0o600n);
  ok(stat.size > 0n && stat.size <= 1048576n);
  equal(realpathSync(S.path), S.path);
  const identity = [stat.dev, stat.ino];
  if (S.databaseIdentity === null) S.databaseIdentity = identity;
  else same(identity, S.databaseIdentity);
}
function closeOriginalOnce(S) {
  if (S.createState !== 'RETURNED' || S.storeCloseState !== 'NOT_ATTEMPTED') return;
  S.storeCloseState = 'CALLING'; S.storeCloseCalls += 1;
  try {
    equal(S.store.close(), undefined);
    S.storeCloseState = 'RETURNED';
  } catch (error) {
    S.storeCloseState = 'THREW_UNKNOWN'; hold(S, 'ORIGINAL_STORE_CLOSE_UNKNOWN');
    throw error;
  }
}
function createAndCloseEmpty(S) {
  S.stage = 'ACTUAL_EMPTY_MODEL_V1_STORE_CREATE';
  S.createCalls += 1; S.createState = 'CALLING';
  try {
    S.store = S.Store.create(S.options);
    ok(S.store instanceof S.Store);
    S.createState = 'RETURNED';
    databaseIdentity(S);
    S.initial = S.store.load();
    same(Object.keys(S.initial).sort(), ['schemaVersion', 'revision', 'state', 'checksum'].sort());
    equal(S.initial.schemaVersion, 1); equal(S.initial.revision, 0);
    same(S.initial.state, EMPTY_STATE); ok(Object.isFrozen(S.initial));
    ok(Object.isFrozen(S.initial.state));
    ok(/^sha256:[0-9a-f]{64}$/.test(S.initial.checksum));
    same(S.store.getMetadata(), {
      schemaVersion: 1, modelVersion: 1, revision: 0, checksum: S.initial.checksum,
    });
    equal(S.costCalls, 0); equal(S.clockCalls, 0);
  } catch (error) {
    if (S.createState === 'CALLING') {
      S.createState = 'THREW_UNKNOWN'; hold(S, 'ORIGINAL_STORE_CONSTRUCTION_UNKNOWN');
    } else hold(S, 'EMPTY_STORE_ASSERTION_FAILED');
    throw error;
  } finally {
    closeOriginalOnce(S);
  }
  equal(S.hold, 'NONE'); equal(S.storeCloseCalls, 1);
  equal(S.storeCloseState, 'RETURNED'); databaseIdentity(S);
}
function rows(database, sql) {
  return database.prepare(sql).all().map(row => ({ ...row }));
}
function onePragma(database, sql, field) {
  const result = rows(database, sql);
  equal(result.length, 1); return result[0][field];
}
function pragmas(database) {
  return {
    applicationId: onePragma(database, 'PRAGMA application_id', 'application_id'),
    userVersion: onePragma(database, 'PRAGMA user_version', 'user_version'),
    journalMode: onePragma(database, 'PRAGMA journal_mode', 'journal_mode'),
  };
}
function closeRawOnce(S) {
  if (S.rawState !== 'RETURNED' || S.rawCloseState !== 'NOT_ATTEMPTED') return;
  S.rawCloseState = 'CALLING'; S.rawCloseCalls += 1;
  try {
    equal(S.raw.close(), undefined);
    S.rawCloseState = 'RETURNED';
  } catch (error) {
    S.rawCloseState = 'THREW_UNKNOWN'; hold(S, 'RAW_NATIVE_CLOSE_UNKNOWN');
    throw error;
  }
}
function addAndCompareActualSchema(S) {
  equal(S.hold, 'NONE'); equal(S.storeCloseState, 'RETURNED');
  equal(S.rawCalls, 0); databaseIdentity(S);
  S.stage = 'ACTUAL_RAW_SQLITE_ACQUIRE';
  S.rawCalls += 1; S.rawState = 'CALLING';
  try {
    S.raw = new DatabaseSync(S.path, {
      allowExtension: false, enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true, readOnly: false, timeout: 50,
    });
    ok(S.raw instanceof DatabaseSync); S.rawState = 'RETURNED';
    equal(S.raw.isOpen, true); equal(S.raw.isTransaction, false);
    const expectedPragmas = { applicationId: 0x53435244, userVersion: 2, journalMode: 'delete' };
    same(pragmas(S.raw), expectedPragmas);
    const schemaBefore = rows(S.raw, ALL_SCHEMA);
    equal(schemaBefore.length, 1);
    const ledger = schemaBefore[0];
    same({ type: ledger.type, name: ledger.name, tbl_name: ledger.tbl_name, sql: ledger.sql }, {
      type: 'table', name: 'service_credit_ledger', tbl_name: 'service_credit_ledger', sql: LEDGER_SQL,
    });
    ok(Number.isSafeInteger(ledger.rootpage) && ledger.rootpage > 0);
    const columnsBefore = rows(S.raw, 'PRAGMA table_xinfo(service_credit_ledger)');
    same(columnsBefore, [
      { cid: 0, name: 'singleton', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1, hidden: 0 },
      { cid: 1, name: 'envelope', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0, hidden: 0 },
    ]);
    const ledgerBefore = rows(S.raw, LEDGER_ROWS);
    equal(ledgerBefore.length, 1); equal(ledgerBefore[0].singleton, 1);
    equal(typeof ledgerBefore[0].envelope, 'string');
    ok(Buffer.byteLength(ledgerBefore[0].envelope) <= 8192);
    const physical = JSON.parse(ledgerBefore[0].envelope);
    same(Object.keys(physical).sort(),
      ['physicalVersion', 'revision', 'ledgerState', 'executionState', 'checksum'].sort());
    equal(physical.physicalVersion, 2); equal(physical.revision, 0);
    equal(physical.executionState, null); same(physical.ledgerState, S.initial.state);
    ok(/^sha256:[0-9a-f]{64}$/.test(physical.checksum));
    const ledgerProjection = {
      type: ledger.type, name: ledger.name, tbl_name: ledger.tbl_name, sql: ledger.sql,
    };
    same(rows(S.raw, OLD_FILTER), [ledgerProjection]);
    same(rows(S.raw, CURRENT_FILTER), [ledgerProjection]);
    S.stage = 'ACTUAL_LITERAL_SYSTEM_PREFIX_COMPARISON';
    S.shadowCreates += 1; equal(S.raw.exec(SHADOW_SQL), undefined);
    equal(S.raw.isTransaction, false);
    const schemaAfter = rows(S.raw, ALL_SCHEMA);
    equal(schemaAfter.length, 2);
    same(schemaAfter[0], ledger);
    same({ type: schemaAfter[1].type, name: schemaAfter[1].name,
      tbl_name: schemaAfter[1].tbl_name, sql: schemaAfter[1].sql }, {
      type: 'table', name: 'sqliteX_shadow', tbl_name: 'sqliteX_shadow', sql: SHADOW_SQL,
    });
    ok(Number.isSafeInteger(schemaAfter[1].rootpage) && schemaAfter[1].rootpage > 0);
    const oldVisible = rows(S.raw, OLD_FILTER), currentVisible = rows(S.raw, CURRENT_FILTER);
    same(oldVisible, [ledgerProjection]);
    same(currentVisible, [ledgerProjection, {
      type: 'table', name: 'sqliteX_shadow', tbl_name: 'sqliteX_shadow', sql: SHADOW_SQL,
    }]);
    same(rows(S.raw, LEDGER_ROWS), ledgerBefore);
    same(rows(S.raw, 'PRAGMA table_xinfo(service_credit_ledger)'), columnsBefore);
    same(pragmas(S.raw), expectedPragmas);
    same(rows(S.raw, 'SELECT marker FROM sqliteX_shadow'), []);
    same(rows(S.raw, 'PRAGMA integrity_check'), [{ integrity_check: 'ok' }]);
    same(rows(S.raw, 'PRAGMA foreign_key_check'), []);
    const tables = rows(S.raw, 'PRAGMA table_list');
    const ledgerTable = tables.find(row => row.schema === 'main' && row.name === 'service_credit_ledger');
    same(ledgerTable, {
      schema: 'main', name: 'service_credit_ledger', type: 'table', ncol: 2, wr: 0, strict: 1,
    });
    const shadowTable = tables.find(row => row.schema === 'main' && row.name === 'sqliteX_shadow');
    same(shadowTable, {
      schema: 'main', name: 'sqliteX_shadow', type: 'table', ncol: 1, wr: 0, strict: 1,
    });
    S.schemaBefore = schemaBefore.length; S.schemaAfter = schemaAfter.length;
    S.oldVisible = oldVisible.length; S.currentVisible = currentVisible.length;
    S.ledgerUnchanged = true; S.pragmasUnchanged = true;
  } catch (error) {
    if (S.rawState === 'CALLING') {
      S.rawState = 'THREW_UNKNOWN'; hold(S, 'RAW_NATIVE_CONSTRUCTION_UNKNOWN');
    } else hold(S, 'RAW_SCHEMA_ASSERTION_FAILED');
    throw error;
  } finally {
    closeRawOnce(S);
  }
  equal(S.hold, 'NONE'); equal(S.rawCloseCalls, 1);
  equal(S.rawCloseState, 'RETURNED'); databaseIdentity(S);
}
function finalCurrentStoreAttempt(S) {
  equal(S.hold, 'NONE');
  equal(S.storeCloseState, 'RETURNED'); equal(S.rawCloseState, 'RETURNED');
  equal(S.schemaBefore, 1); equal(S.schemaAfter, 2);
  equal(S.oldVisible, 1); equal(S.currentVisible, 2);
  equal(S.ledgerUnchanged, true); equal(S.pragmasUnchanged, true);
  equal(S.createCalls, 1); equal(S.storeCloseCalls, 1);
  equal(S.rawCalls, 1); equal(S.rawCloseCalls, 1); equal(S.shadowCreates, 1);
  equal(S.costCalls, 0); equal(S.clockCalls, 0);
  // Last permitted filesystem/DB identity observation. No DB access follows this attempt.
  databaseIdentity(S);
  S.stage = 'FINAL_ACTUAL_CURRENT_STORE_REOPEN';
  S.finalAttempt = true; S.reopenCalls += 1; S.reopenState = 'CALLING';
  try {
    S.unexpectedOwner = S.Store.openExisting(S.options);
    S.reopenState = 'RETURNED_UNEXPECTED';
    hold(S, 'FINAL_OPEN_RETURNED_OWNER');
  } catch (error) {
    S.finalErrorObject = error; S.reopenState = 'THREW';
    const isStoreError = error instanceof S.StoreError;
    const code = isStoreError ? Object.getOwnPropertyDescriptor(error, 'code')?.value : undefined;
    S.observedCode = code === 'SERVICE_CREDIT_STORE_CORRUPT'
      ? 'SERVICE_CREDIT_STORE_CORRUPT'
      : code === 'SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED'
        ? 'SERVICE_CREDIT_STORE_SCHEMA_UNSUPPORTED' : 'OTHER';
    if (!isStoreError || code !== EXPECTED_REFUSAL
        || error.name !== 'ServiceCreditSqliteStoreError'
        || error.message !== EXPECTED_REFUSAL
        || error.stack !== 'ServiceCreditSqliteStoreError: ' + EXPECTED_REFUSAL) {
      hold(S, 'FINAL_REFUSAL_UNEXPECTED');
    } else {
      S.reopenState = 'EXPECTED_REFUSAL';
    }
  }
  // No close, query, reopen, file read, repair or cleanup is allowed after finalAttempt.
  if (S.reopenState !== 'EXPECTED_REFUSAL' || S.hold !== 'NONE')
    throw redacted('LITERAL_SYSTEM_PREFIX_REFUSAL_NOT_QUALIFIED_HOLD');
  S.stage = 'EXPECTED_REFUSAL_COMPLETE';
}
test('P0-A actual SQLite literal sqlite_ prefix preserves schema visibility and refuses an extra table',
  { timeout: 12000, concurrency: false }, async t => {
    const S = {
      stage: 'NOT_STARTED', hold: 'NONE', errors: [], uid: null,
      sourceGuards: 0, selfBytes: 0, selfDigest: null,
      root: null, directory: null, path: null, databaseIdentity: null,
      Store: null, StoreError: null, options: null, store: null, raw: null, initial: null,
      createCalls: 0, createState: 'NOT_ATTEMPTED',
      storeCloseCalls: 0, storeCloseState: 'NOT_ATTEMPTED',
      rawCalls: 0, rawState: 'NOT_ATTEMPTED',
      rawCloseCalls: 0, rawCloseState: 'NOT_ATTEMPTED',
      shadowCreates: 0, schemaBefore: 0, schemaAfter: 0,
      oldVisible: 0, currentVisible: 0, ledgerUnchanged: false, pragmasUnchanged: false,
      costCalls: 0, clockCalls: 0, finalAttempt: false, reopenCalls: 0,
      reopenState: 'NOT_ATTEMPTED', observedCode: 'NOT_OBSERVED',
      finalErrorObject: null, unexpectedOwner: null,
    };
    try {
      exactEnvironment(S); await currentGraph(S); makeUnit(S);
      createAndCloseEmpty(S); addAndCompareActualSchema(S); finalCurrentStoreAttempt(S);
    } catch (error) {
      S.errors.push(error);
      if (S.hold === 'NONE') hold(S, 'EARLIER_FAILURE_BLOCKED_LATER_ACQUISITION');
    }
    // Known owners are closed in their owning stage's finally, at most once.
    // A constructor that throws supplies no returned owner. Nothing is retrofitted here.
    const passed = S.errors.length === 0 && S.hold === 'NONE'
      && S.stage === 'EXPECTED_REFUSAL_COMPLETE' && S.reopenCalls === 1;
    t.diagnostic(JSON.stringify({
      status: passed ? 'PASS' : 'FAIL', stage: S.stage, hold: S.hold,
      retainedErrors: S.errors.length, sourceGuards: S.sourceGuards,
      createCalls: S.createCalls, createState: S.createState,
      originalStoreCloseCalls: S.storeCloseCalls, originalStoreCloseState: S.storeCloseState,
      rawCalls: S.rawCalls, rawState: S.rawState,
      rawCloseCalls: S.rawCloseCalls, rawCloseState: S.rawCloseState,
      shadowCreates: S.shadowCreates, schemaBefore: S.schemaBefore, schemaAfter: S.schemaAfter,
      oldPredicateVisible: S.oldVisible, literalPredicateVisible: S.currentVisible,
      ledgerUnchanged: S.ledgerUnchanged, pragmasUnchanged: S.pragmasUnchanged,
      costCalls: S.costCalls, clockCalls: S.clockCalls,
      finalOpenCalls: S.reopenCalls, finalOpenState: S.reopenState,
      expectedCode: EXPECTED_REFUSAL, observedCode: S.observedCode,
      finalConstructorInternalClose: 'UNINSTRUMENTED_NOT_ESTABLISHED',
      qualification: 'LOCAL_SYNTHETIC_SCHEMA_REFUSAL_ONLY', authority: 'NONE',
    }));
    if (!passed) throw redacted('ACTUAL_SQLITE_LITERAL_SYSTEM_PREFIX_NOT_QUALIFIED');
  });
