/*
 * DRAFT / NOT_RUN: one selected scenario 1..3 per later reviewed launch.
 * Empty-schema testHooks preflight only; no funding state, owner or transport.
 * No SDK, signing, payment, child/worker, network, chain PREPARE or reset.
 * Launcher must pin runtime/source/mount, hold the artifact/task leases, and
 * reserve space above the 10 GiB floor before native acquisition. Node 24.19.0;
 * flags below, env-i, Permission Model OFF for unmodified fchmod/fsync.
 * All four source/package files are DATA-guarded before backend/SQLite imports.
 * Use independent physical APFS source aliases, never hardlinks or fallback.
 * Registered 0700 scratch and empty direct child sqlite-hooks-preflight-fixtures.
 * At most 64 factory/native reservations, one native slot, two new DBs,
 * two child roots and 2 MiB/file checks. These are guards, not an OS sandbox.
 * Only an exact source-reviewed pre-acquisition configuration refusal releases
 * a negative-call reservation. Unknown construction/close blocks all later use.
 * One captured original synchronous close attempt per actual handle; no retry.
 * Retain fixtures, failures and uncertainty/HOLD; never unlink or repair.
 * Empty roots do not prove absence of OS reads. Same-process reopen, native close
 * return and final audit do not establish restart, cleanup or durability.
 * Historical backend graphs/tests are not rebound or rerun by this draft.
 */
import test from 'node:test';
import { equal as q, deepEqual as same, ok, match } from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
 chmodSync, closeSync, constants as FS, fstatSync, lstatSync, mkdtempSync,
 openSync, readSync, readdirSync, realpathSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

q(process.argv.length, 3, 'ONE_NUMERIC_SELECTOR_REQUIRED');
match(process.argv[2], /^[1-3]$/, 'ONE_NUMERIC_SELECTOR_REQUIRED');
q(process.versions.node, '24.19.0');
ok(process.execArgv.includes('--no-addons'));
ok(process.execArgv.includes('--disallow-code-generation-from-strings'));
q(process.env.NODE_OPTIONS, undefined);
q(process.env.NODE_PATH, undefined);
q(process.execArgv.some(value =>
 /^--(?:experimental-permission|permission|allow-fs)(?:=|-|$)/.test(value)), false);
const selector = Number(process.argv[2]);
const uid = BigInt(process.getuid());
const CAP = 2 * 1024 * 1024;
const stamp = s => [
 s.dev, s.ino, s.size, s.uid, s.mode, s.nlink, s.mtimeNs, s.ctimeNs,
];
function readBytes(path, cap) {
 const pre = lstatSync(path, { bigint: true });
 ok(pre.isFile());
 q(pre.isSymbolicLink(), false);
 q(pre.uid, uid);
 q(pre.nlink, 1n);
 q(realpathSync(path), path);
 ok(pre.size >= 0n && pre.size <= BigInt(cap));
 ok(FS.O_NOFOLLOW);
 const fd = openSync(path, FS.O_RDONLY | FS.O_NOFOLLOW);
 let bytes;
 try {
  same(stamp(fstatSync(fd, { bigint: true })), stamp(pre));
  bytes = Buffer.alloc(Number(pre.size));
  let offset = 0;
  while (offset < bytes.length) {
   const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
   ok(count > 0);
   offset += count;
  }
  q(readSync(fd, Buffer.alloc(1), 0, 1, offset), 0);
  same(stamp(fstatSync(fd, { bigint: true })), stamp(pre));
 } finally { closeSync(fd); }
 same(stamp(lstatSync(path, { bigint: true })), stamp(pre));
 return { bytes, identity: stamp(pre) };
}
const specs = [
 ['backend', '../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js',
  48095, 1340, 'bd55ed39fb465eab75b71819b30693290b6e12aded503d57fe206cab1fe506b6'],
 ['contract', '../src/service-credit-original-request-custody-contract.js',
  9810, 272, '8f4d40d017a89e9a064c411c8e076cb21a45b9fb787fda7a664246b7bd744083'],
 ['wire', '../src/x402-wire.js',
  39886, 934, '5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56'],
 ['package', '../package.json',
  1413, 40, '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5'],
];
const guarded = Object.create(null);
function sourcePin(spec) {
 const [name, relative, length, lines, sha256] = spec;
 const url = new URL(relative, import.meta.url);
 const path = fileURLToPath(url);
 const result = readBytes(path, 65536);
 q(result.identity[4] & 0o7777n, 0o400n, 'READ_ONLY_SOURCE_ALIAS_REQUIRED');
 q(result.bytes.length, length);
 q(createHash('sha256').update(result.bytes).digest('hex'), sha256);
 const text = result.bytes.toString('utf8');
 q(/[^\x00-\x7f]/.test(text), false);
 q(text.split('\n').length - 1, lines);
 ok(text.endsWith('\n'));
 return { name, path, url: url.href, text, identity: result.identity };
}
for (const spec of specs) {
 const pin = sourcePin(spec);
 guarded[pin.name] = pin;
}
q(specs.length, 4);
const packageData = JSON.parse(guarded.package.text);
q(packageData.type, 'module');
q(packageData.engines.node, '>=24');
function privateDirectory(path) {
 q(typeof path, 'string');
 ok(path.length > 0 && path.length < 3800 && !path.includes('\0'));
 ok(isAbsolute(path));
 q(resolve(path), path);
 const s = lstatSync(path, { bigint: true });
 ok(s.isDirectory());
 q(s.isSymbolicLink(), false);
 q(s.uid, uid);
 q(s.mode & 0o7777n, 0o700n);
 q(realpathSync(path), path);
 return s;
}
const scratch = process.env.SPV_TASK_SCRATCH;
const scratchId = privateDirectory(scratch);
const fixtureRoot = process.env.SPV_SQLITE_FIXTURE_ROOT;
q(fixtureRoot, join(scratch, 'sqlite-hooks-preflight-fixtures'));
const fixtureId = privateDirectory(fixtureRoot);
q(fixtureId.dev, scratchId.dev);
same(readdirSync(fixtureRoot), []);

const backend = await import(guarded.backend.url);
const { DatabaseSync } = await import('node:sqlite');
const {
 createZenonFundingPayerRecoverySqliteStore: createV1,
 openZenonFundingPayerRecoverySqliteStore: openV1,
 createZenonFundingPayerRecoveryCustodySqliteStoreV2: createV2,
 openZenonFundingPayerRecoveryCustodySqliteStoreV2: openV2,
 ZenonFundingPayerRecoverySqliteStore: Store,
 ZenonFundingPayerRecoverySqliteStoreError: StoreError,
} = backend;
const APPLY = Reflect.apply;
const STORE_CLOSE = Object.getOwnPropertyDescriptor(Store.prototype, 'close').value;
const RAW_CLOSE = Object.getOwnPropertyDescriptor(DatabaseSync.prototype, 'close').value;
q(typeof STORE_CLOSE, 'function');
q(typeof RAW_CLOSE, 'function');
const ERROR_PROTO = Object.getOwnPropertyDescriptor(StoreError, 'prototype').value;
const INVALID = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_INVALID_CONFIGURATION';
const FUNDING = 'https://hooks.example.test/funding';
const SERVICE = 'https://hooks.example.test/service-credit/v1/execute';
const factories = [[1, createV1], [1, openV1], [2, createV2], [2, openV2]];
const fixtures = [];
const entries = [];
let active = null;
let unknown = false;
let bodyPassed = false;
const calls = { before: 0, after: 0 };
function idle() {
 q(unknown, false, 'NATIVE_OUTCOME_UNKNOWN_HOLD');
 q(active, null, 'NATIVE_SLOT_REMAINS_HOLD');
}
function reserve(kind) {
 idle();
 ok(entries.length < 64, 'FINITE_ACQUISITION_BOUND');
 const e = { kind, state: 'CONSTRUCTING', handle: null, failure: null,
  checkFailure: null, closeAttempted: false, closeReturned: false };
 entries.push(e);
 active = e;
 return e;
}
function uncertain(e, error) {
 e.state = 'UNKNOWN';
 if (e.failure === null) e.failure = error;
 else e.checkFailure = error;
 unknown = true;
}
function closeEntry(e) {
 q(active, e);
 q(e.state, 'OPEN');
 q(e.closeAttempted, false);
 e.closeAttempted = true;
 try {
  APPLY(e.kind === 'store' ? STORE_CLOSE : RAW_CLOSE, e.handle, []);
  if (e.kind === 'raw') q(e.handle.isOpen, false);
  e.closeReturned = true;
  e.state = 'CLOSED';
  active = null;
 } catch (error) {
  uncertain(e, error);
  throw error;
 }
}
function options(root, version, testHooks) {
 const input = { databasePath: join(root, 'hooks.sqlite'), allowedRoot: root,
  resourceUrl: FUNDING, testHooks };
 if (version === 2) input.custodyPolicy = {
  policyVersion: 1, maxRequests: 2, serviceResourceUrl: SERVICE,
 };
 return input;
}
function assertFixed(error) {
 // Reject unknown shapes before descriptor inspection; never stringify a value.
 q(error !== null && typeof error === 'object' && !utilTypes.isProxy(error), true);
 q(Object.getPrototypeOf(error) === ERROR_PROTO, true);
 for (const [key, expected] of [
  ['name', 'ZenonFundingPayerRecoverySqliteStoreError'],
  ['code', INVALID], ['message', INVALID],
  ['stack', 'ZenonFundingPayerRecoverySqliteStoreError: ' + INVALID],
 ]) {
  const descriptor = Object.getOwnPropertyDescriptor(error, key);
  q(descriptor !== undefined && Object.hasOwn(descriptor, 'value'), true);
  q(descriptor.value === expected, true, 'FIXED_ERROR_OWN_DATA_' + key);
 }
}
function refuse(version, factory, hooks, verify) {
 const input = options(fixtureRoot, version, hooks);
 const e = reserve('store');
 let rejection;
 try {
  e.handle = APPLY(factory, undefined, [input]);
  e.state = 'OPEN';
 } catch (error) { e.failure = error; rejection = error; }
 if (e.state === 'OPEN') {
  const errors = [new Error('EXPECTED_PRE_ACQUISITION_CONFIGURATION_REFUSAL')];
  try { closeEntry(e); } catch (error) { errors.push(error); }
  throw new AggregateError(errors, 'UNEXPECTED_HANDLE_RETAIN_FIXTURES');
 }
 try {
  assertFixed(rejection);
  verify();
  same(readdirSync(fixtureRoot), []);
  // In this pinned source, invalid hooks fail before configuration/file/SQLite.
  // Other errors or uncertain constructor outcomes do not authorize release.
  e.state = 'REFUSED_BEFORE_ACQUIRE';
  active = null;
 } catch (error) {
  uncertain(e, error);
  throw error;
 }
}
function fixture(version) {
 idle();
 ok(fixtures.length < 2, 'TWO_NEW_DATABASES_MAXIMUM');
 const root = mkdtempSync(join(fixtureRoot, 'hooks-' + selector + '-'));
 chmodSync(root, 0o700);
 const id = privateDirectory(root);
 q(id.dev, fixtureId.dev);
 const f = { root, version, rootId: [id.dev, id.ino], identity: null,
  databasePath: join(root, 'hooks.sqlite') };
 fixtures.push(f);
 same(readdirSync(root), []);
 return f;
}
function files(f) {
 const root = privateDirectory(f.root);
 same([root.dev, root.ino], f.rootId);
 const names = readdirSync(f.root);
 ok(names.length >= 1 && names.length <= 2);
 ok(names.includes('hooks.sqlite'));
 for (const name of names) {
  ok(name === 'hooks.sqlite' || name === 'hooks.sqlite-journal');
  const path = join(f.root, name);
  const s = lstatSync(path, { bigint: true });
  ok(s.isFile());
  q(s.isSymbolicLink(), false);
  q(s.dev, fixtureId.dev);
  q(s.uid, uid);
  q(s.nlink, 1n);
  q(s.mode & 0o7777n, 0o600n);
  ok(s.size >= 0n && s.size <= BigInt(CAP));
  q(realpathSync(path), path);
  if (name === 'hooks.sqlite') {
   const id = [s.dev, s.ino];
   if (f.identity === null) f.identity = id;
   else same(id, f.identity);
  }
 }
}
function managed(f, kind, construct, body) {
 const e = reserve(kind);
 try { e.handle = construct(); e.state = 'OPEN'; }
 catch (error) { uncertain(e, error); throw error; }
 const errors = [];
 let result;
 try { result = body(e.handle); } catch (error) { errors.push(error); }
 finally {
  try { closeEntry(e); } catch (error) { errors.push(error); }
  try { files(f); } catch (error) { errors.push(error); }
 }
 if (errors.length) throw new AggregateError(errors, 'BODY_OR_CLOSE_FAILURE_HOLD');
 return result;
}
function emptyStore(f, factory, hooks) {
 managed(f, 'store', () => factory(options(f.root, f.version, hooks)), store => {
  q(store.load(), null);
  q(store.load(), null);
  same(calls, { before: 0, after: 0 });
 });
}
const TABLES1 = ['payer_recovery_meta', 'payer_recovery_state'];
const TABLES2 = ['original_request_custody_policy', 'original_service_requests',
 ...TABLES1];
function view(f) {
 idle();
 files(f);
 return managed(f, 'raw', () => new DatabaseSync(f.databasePath, {
  allowExtension: false, enableDoubleQuotedStringLiterals: false,
  enableForeignKeyConstraints: true, readOnly: true, timeout: 0,
 }), db => {
  const schema = db.prepare(
   "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all().map(row => ({ ...row }));
  same(schema.map(row => row.name), f.version === 1 ? TABLES1 : TABLES2);
  for (const definition of schema) {
   q(definition.type, 'table');
   ok(definition.sql.endsWith(' STRICT'));
  }
  const meta = db.prepare('SELECT * FROM payer_recovery_meta').all()
   .map(row => ({ ...row }));
  q(meta.length, 1);
  same(db.prepare('SELECT * FROM payer_recovery_state').all(), []);
  let policy = [];
  if (f.version === 2) {
   policy = db.prepare('SELECT * FROM original_request_custody_policy').all()
    .map(row => ({ ...row }));
   same(policy, [{ singleton: 1, policy_version: 1, max_requests: 2,
    service_resource_url: SERVICE }]);
   same(db.prepare('SELECT * FROM original_service_requests').all(), []);
  }
  const version = db.prepare('PRAGMA user_version').get().user_version;
  const applicationId = db.prepare('PRAGMA application_id').get().application_id;
  q(version, f.version);
  q(applicationId, 0x5a505252);
  return { schema, meta, policy, version, applicationId };
 });
}
const trapNames = ['apply', 'construct', 'defineProperty', 'deleteProperty',
 'get', 'getOwnPropertyDescriptor', 'getPrototypeOf', 'has', 'isExtensible',
 'ownKeys', 'preventExtensions', 'set', 'setPrototypeOf'];
const groups = [
 ['hook Proxy inputs reject without traps across V1 and V2 factories', () => {
  for (const [version, factory] of factories) {
   for (const kind of ['object', 'function', 'array']) {
    for (const revoked of [false, true]) {
     const counts = Object.fromEntries(trapNames.map(name => [name, 0]));
     const handler = Object.fromEntries(trapNames.map(name => [name, () => {
      counts[name] += 1;
      throw new Error('CONTROLLED_PROXY_TRAP_' + name);
     }]));
     const target = kind === 'object' ? {} : kind === 'array' ? [] : function () {};
     const pair = Proxy.revocable(target, handler);
     if (revoked) pair.revoke();
     refuse(version, factory, pair.proxy, () => {
      same(counts, Object.fromEntries(trapNames.map(name => [name, 0])));
     });
    }
   }
   for (const key of ['beforeCommit', 'afterCommit']) {
    let getters = 0;
    const hooks = Object.defineProperty({}, key, { enumerable: true,
     get() { getters += 1; throw new Error('HOOK_GETTER_MUST_NOT_RUN'); } });
    refuse(version, factory, hooks, () => q(getters, 0));
   }
  }
  q(entries.length, 32);
  q(fixtures.length, 0);
  same(readdirSync(fixtureRoot), []);
 }],
 ['primitive hook inputs keep fixed configuration errors without file creation', () => {
  const values = [null, false, true, 0, 1, NaN, Infinity, '', 'hooks',
   0n, 1n, Symbol('hooks')];
  for (const [version, factory] of factories) {
   for (const value of values) refuse(version, factory, value, () => {});
  }
  q(entries.length, 48);
  q(fixtures.length, 0);
  same(readdirSync(fixtureRoot), []);
 }],
 ['ordinary hook objects preserve empty V1 and V2 create and reopen', () => {
  q(backend.ZENON_FUNDING_PAYER_RECOVERY_SQLITE_SCHEMA_VERSION, 1);
  q(backend.ZENON_FUNDING_PAYER_RECOVERY_CUSTODY_SQLITE_SCHEMA_VERSION, 2);
  for (const version of [1, 2]) {
   const f = fixture(version);
   const ordinary = { beforeCommit() { calls.before += 1; },
    afterCommit() { calls.after += 1; } };
   const nullPrototype = Object.assign(Object.create(null), ordinary);
   const hooks = version === 1 ? [ordinary, nullPrototype, undefined]
    : [nullPrototype, ordinary, undefined];
   let baseline;
   for (let index = 0; index < hooks.length; index += 1) {
    const factory = version === 1
     ? (index === 0 ? createV1 : openV1) : (index === 0 ? createV2 : openV2);
    emptyStore(f, factory, hooks[index]);
    const observed = view(f);
    same(observed.meta, [{ singleton: 1, resource_url: FUNDING,
     owner_epoch: index + 1 }]);
    if (index === 0) baseline = observed;
    else {
     same(observed.schema, baseline.schema);
     same(observed.policy, baseline.policy);
     q(observed.version, baseline.version);
     q(observed.applicationId, baseline.applicationId);
    }
    files(f);
    same(calls, { before: 0, after: 0 });
   }
  }
  q(fixtures.length, 2);
  q(entries.length, 12);
  idle();
  for (const e of entries) {
   q(e.state, 'CLOSED');
   q(e.closeAttempted, true);
   q(e.closeReturned, true);
  }
 }],
];
function finalAudit() {
 idle();
 q(bodyPassed, true, 'BODY_ASSERTIONS_REQUIRED');
 for (const e of entries) {
  ok(e.state === 'CLOSED' || e.state === 'REFUSED_BEFORE_ACQUIRE');
  if (e.state === 'CLOSED') {
   q(e.closeAttempted, true);
   q(e.closeReturned, true);
  } else {
   q(e.handle, null);
   q(e.closeAttempted, false);
   q(e.closeReturned, false);
   assertFixed(e.failure);
  }
 }
 ok(fixtures.length <= 2);
 for (const f of fixtures) files(f);
 same(readdirSync(fixtureRoot).sort(),
  fixtures.map(f => f.root.slice(fixtureRoot.length + 1)).sort());
 for (const [path, id] of [[scratch, scratchId], [fixtureRoot, fixtureId]]) {
  const now = privateDirectory(path);
  same([now.dev, now.ino], [id.dev, id.ino]);
 }
 for (const spec of specs) {
  const after = sourcePin(spec);
  same(after.identity, guarded[after.name].identity);
 }
}
q(groups.length, 3);
const [name, scenario] = groups[selector - 1];
test(name, { timeout: 5000 }, () => {
 const errors = [];
 try { scenario(); bodyPassed = true; } catch (error) { errors.push(error); }
 try { finalAudit(); } catch (error) { errors.push(error); }
 if (errors.length) throw new AggregateError(errors, 'SCENARIO_OR_NATIVE_RESOURCE_HOLD');
});
