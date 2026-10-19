// Current exact payer-backend/runtime recontext; not new legacy coverage.
// Original scenario/resource bodies below remain byte-identical.
// Historical clone/NOT_RUN comments are authoring records; this caller uses no clones.
// DRAFT / NOT_RUN until a separately reviewed current launch.
// Recontext of unchanged legacy V1/V2 coverage for the current backend.
// Only four dependency-pin DATA literals change; scenarios and resources are retained.
// NOT_RUN until a separately reviewed launch. Not full P2, durability or pilot qualification.
/*
 * DRAFT / NOT_RUN; one group 1..3/process. Standing local authorization exists;
 * execution still requires a reviewed pinned manager launch, never this draft.
 * No SDK, keys, signing, child/worker, network, chain PREPARE or real payment.
 * prepare is local declared metadata; reopen is same-process, no durability proof.
 * Launcher: mount/lease/source/runtime pins, reservations, 10 GiB floor plus
 * reserves; env-i, Node 24.19.0, flags below, Permission Model OFF for fchmod/fsync.
 * Physical 0700 registered scratch/fixture child; independent APFS source clones.
 * Max 8 new roots/group (actual 2/2/7), 1 DB/root, 4 rows/DB, 2 MiB/file checks.
 * One reserved native slot; uncertain construction/close blocks later access.
 * One close attempt/handle. Schema refusal releases only by pinned known-close
 * contract. Retain every fixture/failure; child files HOLD. No unlink, repair,
 * migration, downgrade, unknown-outcome retry, fallback or OS sandbox claim.
 */
import test from 'node:test';
import { equal as q, deepEqual as same, ok, throws, match,
 notEqual as ne, fail } from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
 chmodSync, closeSync, constants as FS, fstatSync, lstatSync, mkdtempSync,
 openSync, readSync, readdirSync, realpathSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

q(process.argv.length, 3, 'ONE_NUMERIC_GROUP_REQUIRED');
match(process.argv[2], /^[1-3]$/, 'ONE_NUMERIC_GROUP_REQUIRED');
q(process.versions.node, '24.19.0');
ok(process.execArgv.includes('--no-addons'));
ok(process.execArgv.includes('--disallow-code-generation-from-strings'));
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
 ok(pre.size <= BigInt(cap));
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
 } finally {
  closeSync(fd);
 }
 same(stamp(lstatSync(path, { bigint: true })), stamp(pre));
 return { bytes, identity: stamp(pre) };
}
const specs = [
 ['backend', '../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js',
  57459, '9c925f241effbfec0bf014ff284e834c4d5679c4ea7224f83a6354cde6cffdaf'],
 ['contract', '../src/service-credit-original-request-custody-contract.js',
  14051, 'fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915'],
 ['wire', '../src/x402-wire.js',
  39886, '5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56'],
 ['package', '../package.json',
  1413, '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5'],
];
const guarded = Object.create(null);
for (const [name, relative, length, sha256] of specs) {
 const url = new URL(relative, import.meta.url);
 const path = fileURLToPath(url);
 const { bytes } = readBytes(path, 65536);
 q(bytes.length, length);
 q(createHash('sha256').update(bytes).digest('hex'), sha256);
 const text = bytes.toString('utf8');
 q(/[^\x00-\x7f]/.test(text), false);
 ok(text.endsWith('\n'));
 guarded[name] = { url: url.href, text };
}
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
q(fixtureRoot, join(scratch, 'sqlite-compatibility-fixtures'));
const fixtureId = privateDirectory(fixtureRoot);
q(fixtureId.dev, scratchId.dev);
same(readdirSync(fixtureRoot), []);

const backend = await import(guarded.backend.url);
const wire = await import(guarded.wire.url);
const { DatabaseSync } = await import('node:sqlite');
const {
 createZenonFundingPayerRecoverySqliteStore: createV1,
 openZenonFundingPayerRecoverySqliteStore: openV1,
 createZenonFundingPayerRecoveryCustodySqliteStoreV2: createV2,
 openZenonFundingPayerRecoveryCustodySqliteStoreV2: openV2,
 ZenonFundingPayerRecoverySqliteStore: Store,
 ZenonFundingPayerRecoverySqliteStoreError: StoreError,
} = backend;
const STORE_CLOSE = Object.getOwnPropertyDescriptor(Store.prototype, 'close').value;
const RAW_CLOSE = Object.getOwnPropertyDescriptor(DatabaseSync.prototype, 'close').value;
const APPLY = Reflect.apply;
const PREFIX = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_';
const FUNDING = 'https://compatibility.example.test/funding';
const SERVICE = 'https://compatibility.example.test/service-credit/v1/execute';
const HASH = 'a'.repeat(64);
const fixtures = [];
const entries = [];
let active = null;
let unknown = false;
const policy = maxRequests => ({ policyVersion: 1, maxRequests,
 serviceResourceUrl: SERVICE });
const policy2 = policy(2);
const TABLES1 = ['payer_recovery_meta', 'payer_recovery_state'];
const TABLES2 = ['original_request_custody_policy', 'original_service_requests',
 ...TABLES1];
function closed() {
 q(unknown, false, 'NATIVE_OUTCOME_UNKNOWN_HOLD');
 q(active, null, 'NATIVE_SLOT_REMAINS_HOLD');
}
function reserve(kind) {
 closed();
 const e = { kind, state: 'CONSTRUCTING', handle: null,
  closeAttempted: false, closeReturned: false, failure: null };
 entries.push(e);
 active = e;
 return e;
}
function closeEntry(e) {
 q(active, e);
 q(e.closeAttempted, false);
 e.closeAttempted = true;
 try {
  APPLY(e.kind === 'store' ? STORE_CLOSE : RAW_CLOSE, e.handle, []);
  if (e.kind === 'raw') q(e.handle.isOpen, false);
  e.closeReturned = true;
  e.state = 'CLOSED';
  active = null;
 } catch (error) {
  e.failure = error;
  e.state = 'UNKNOWN';
  unknown = true;
  throw error;
 }
}
function code(suffix) {
 return error => {
  const expected = PREFIX + suffix;
  return error instanceof StoreError && error.code === expected
   && error.name === 'ZenonFundingPayerRecoverySqliteStoreError'
   && error.message === expected
   && error.stack === 'ZenonFundingPayerRecoverySqliteStoreError: ' + expected;
 };
}
function fixture(version) {
 closed();
 ok(fixtures.length < 8);
 const root = mkdtempSync(join(fixtureRoot, 'compat-' + selector + '-'));
 chmodSync(root, 0o700);
 q(privateDirectory(root).dev, fixtureId.dev);
 const f = { root, version, databasePath: join(root, 'compat.sqlite'),
  identity: null };
 fixtures.push(f);
 same(readdirSync(root), []);
 return f;
}
function options(f, version = f.version, selected = policy2) {
 const value = { databasePath: f.databasePath, allowedRoot: f.root,
  resourceUrl: FUNDING };
 if (version === 2) value.custodyPolicy = selected;
 return value;
}
function checkFiles(f) {
 q(privateDirectory(f.root).dev, fixtureId.dev);
 const names = readdirSync(f.root);
 ok(names.length <= 2);
 ok(names.includes('compat.sqlite'));
 for (const name of names) {
  ok(name === 'compat.sqlite' || name === 'compat.sqlite-journal');
  const path = join(f.root, name);
  const s = lstatSync(path, { bigint: true });
  ok(s.isFile());
  q(s.isSymbolicLink(), false);
  q(s.uid, uid);
  q(s.nlink, 1n);
  q(s.mode & 0o7777n, 0o600n);
  ok(s.size <= BigInt(CAP));
  q(realpathSync(path), path);
  if (name === 'compat.sqlite') {
   const identity = [s.dev, s.ino];
   if (f.identity === null) f.identity = identity;
   else same(identity, f.identity);
  }
 }
}
function managed(f, kind, construct, body) {
 const e = reserve(kind);
 try {
  e.handle = construct();
  e.state = 'OPEN';
 } catch (error) {
  e.failure = error;
  e.state = 'UNKNOWN';
  unknown = true;
  throw error;
 }
 const errors = [];
 let value;
 try { value = body(e.handle); }
 catch (error) { errors.push(error); }
 finally {
  try { closeEntry(e); } catch (error) { errors.push(error); }
  try { checkFiles(f); } catch (error) { errors.push(error); }
 }
 if (errors.length) throw new AggregateError(errors, 'OPERATION_OR_CLOSE_FAILED');
 return value;
}
function store(f, factory, body) {
 return managed(f, 'store', () => factory(options(f)), body);
}
function raw(f, write, body) {
 closed();
 checkFiles(f);
 return managed(f, 'raw', () => new DatabaseSync(f.databasePath, {
  allowExtension: false, enableDoubleQuotedStringLiterals: false,
  enableForeignKeyConstraints: true, readOnly: !write, timeout: 0,
 }), body);
}
function view(f) {
 return raw(f, false, db => {
  const schema = db.prepare(
   "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all().map(row => ({ ...row }));
  same(schema.map(row => row.name),
   f.version === 1 ? TABLES1 : TABLES2);
  const rows = {};
  let count = 0;
  for (const { name } of schema) {
   rows[name] = db.prepare('SELECT * FROM ' + name).all()
    .map(row => ({ ...row }));
   count += rows[name].length;
  }
  ok(count <= 4);
  q(rows.payer_recovery_meta.length, 1);
  ok(rows.payer_recovery_state.length <= 1);
  if (f.version === 2) {
   q(rows.original_request_custody_policy.length, 1);
   q(rows.original_service_requests.length, 0);
  }
  return {
   version: db.prepare('PRAGMA user_version').get().user_version,
   applicationId: db.prepare('PRAGMA application_id').get().application_id,
   schema, rows, epoch: rows.payer_recovery_meta[0].owner_epoch,
  };
 });
}
function image(f) {
 closed();
 checkFiles(f);
 return readBytes(f.databasePath, CAP);
}
function pair() {
 const requirement = {
  scheme: 'exact', network: 'zenon:testnet', asset: 'declared-test-asset',
  amount: '1', payTo: 'declared-test-payee', maxTimeoutSeconds: 30,
  extra: { poc: true, settlement: 'account-block', paymentFlow: 'upfront',
   zenonChain: { version: 1, chainIdentifier: '42',
    genesisMomentumHash: '1'.repeat(64) } },
 };
 const paymentRequired = { x402Version: 2, resource: { url: FUNDING },
  accepts: [requirement] };
 const payload = { x402Version: 2, resource: { url: FUNDING },
  accepted: requirement, payload: { transaction: { hash: HASH },
   intentDigest: '2'.repeat(64) } };
 return {
  challenge: { status: 'PAYMENT_REQUIRED', resourceUrl: FUNDING,
   paymentRequiredHeader: wire.encodeB64Json(paymentRequired,
    { maxEncodedBytes: 8192 }), paymentRequired },
  paymentSignatureHeader: wire.encodeB64Json(payload, { maxEncodedBytes: 8192 }),
 };
}
function funding(record, declared, revision, status, ambiguity) {
 q(record.revision, revision);
 q(record.status, status);
 q(record.ambiguityLatched, ambiguity);
 q(record.resourceUrl, FUNDING);
 q(record.challengeHeader, declared.challenge.paymentRequiredHeader);
 q(record.paymentHeader, declared.paymentSignatureHeader);
 q(record.paymentPayload.payload.transaction.hash, HASH);
 same(Object.keys(record.paymentPayload.payload.transaction), ['hash']);
 same(record.paymentRequired, declared.challenge.paymentRequired);
 same(record.requirement, declared.challenge.paymentRequired.accepts[0]);
 ok(Object.isFrozen(record));
}
function canonical(value) {
 if (value === null || typeof value !== 'object') return JSON.stringify(value);
 if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
 return '{' + Object.keys(value).sort().map(key =>
  JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
function envelope(record) {
 const core = { schemaVersion: 1, revision: record.revision,
  status: record.status, ambiguityLatched: record.ambiguityLatched,
  resourceUrl: record.resourceUrl, challengeHeader: record.challengeHeader,
  paymentHeader: record.paymentHeader };
 const checksum = 'sha256:' + createHash('sha256')
  .update('zenon-x402:payer-recovery-envelope-v1').update('\0')
  .update(canonical(core)).digest('hex');
 return canonical({ ...core, checksum });
}
function refuseUnchanged(f, version, selected = policy2) {
 const prior = view(f);
 q(prior.epoch, 1);
 const pre = image(f);
 const e = reserve('store');
 let rejection;
 try {
  e.handle = (version === 1 ? openV1 : openV2)(
   options(f, version, selected));
  e.state = 'OPEN';
 } catch (error) {
  e.failure = error;
  rejection = error;
 }
 if (rejection === undefined) {
  closeEntry(e);
  fail('EXPECTED_DIRECT_SCHEMA_REFUSAL');
 }
 if (!code('SCHEMA_UNSUPPORTED')(rejection)) {
  e.state = 'UNKNOWN';
  unknown = true;
  throw rejection;
 }
 e.state = 'REFUSED';
 active = null;
 same(image(f), pre);
 same(view(f), prior);
 same(image(f), pre);
}
const groups = [
 ['legacy V1 two-table schema and explicit V2 four-table policy', () => {
  q(backend.ZENON_FUNDING_PAYER_RECOVERY_SQLITE_SCHEMA_VERSION, 1);
  q(backend.ZENON_FUNDING_PAYER_RECOVERY_CUSTODY_SQLITE_SCHEMA_VERSION, 2);
  for (const version of [1, 2]) {
   const f = fixture(version);
   store(f, version === 1 ? createV1 : createV2, handle => {
    q(handle.load(), null);
    const key = { grantId: 'declared_grant', requestId: 'declared_request' };
    if (version === 1) {
     throws(() => handle.getOriginalRequest(key), code('CUSTODY_NOT_ENABLED'));
     throws(() => handle.retainOriginalRequest({}),
      code('CUSTODY_NOT_ENABLED'));
     q(handle.load(), null);
    } else q(handle.getOriginalRequest(key), null);
   });
   const observed = view(f);
   q(observed.version, version);
   q(observed.applicationId, 0x5a505252);
   q(observed.epoch, 1);
   same(observed.rows.payer_recovery_meta,
    [{ singleton: 1, resource_url: FUNDING, owner_epoch: 1 }]);
   same(observed.rows.payer_recovery_state, []);
   for (const definition of observed.schema) {
    q(definition.type, 'table');
    ok(definition.sql.endsWith(' STRICT'));
   }
   if (version === 2) same(
    observed.rows.original_request_custody_policy,
    [{ singleton: 1, policy_version: 1, max_requests: 2,
     service_resource_url: SERVICE }]);
  }
  q(fixtures.length, 2);
 }],
 ['V1 declared journal bound and unknown states survive same-process reopen', () => {
  for (const status of ['BOUND', 'OUTCOME_UNKNOWN']) {
   const f = fixture(1), declared = pair();
   let saved;
   store(f, createV1, handle => {
    const prepared = handle.prepare(declared);
    funding(prepared, declared, 1, 'PREPARED', false);
    same(handle.prepare(declared), prepared);
    funding(handle.fenceAttempt('PREPARED'), declared, 2, 'ATTEMPT_FENCED', false);
    saved = handle.finishAttempt(status);
    funding(saved, declared, 3, status, status === 'OUTCOME_UNKNOWN');
    same(handle.load(), saved);
   });
   const pre = view(f);
   q(pre.epoch, 1);
   q(pre.rows.payer_recovery_state[0].envelope, envelope(saved));
   const beforeId = image(f).identity.slice(0, 2);
   store(f, openV1, handle => {
    const recovered = handle.load();
    same(recovered, saved);
    ne(recovered, saved);
    funding(recovered, declared, 3, status, status === 'OUTCOME_UNKNOWN');
   });
   const post = view(f);
   q(post.epoch, 2);
   same(post.rows.payer_recovery_state, pre.rows.payer_recovery_state);
   same(post.schema, pre.schema);
   same(post.rows.payer_recovery_meta,
    [{ ...pre.rows.payer_recovery_meta[0], owner_epoch: 2 }]);
   same(image(f).identity.slice(0, 2), beforeId);
  }
  q(fixtures.length, 2);
 }],
 ['direct cross-version policy and header refusals preserve bytes identity epoch', () => {
  const cases = [
   [1, 2, null], [2, 1, null], [2, 2, 'policy'],
   [1, 1, 'application'], [1, 1, 'version'],
   [2, 2, 'application'], [2, 2, 'version'],
  ];
  for (const [created, opened, mutation] of cases) {
   const f = fixture(created), declared = pair();
   store(f, created === 1 ? createV1 : createV2, handle => {
    funding(handle.prepare(declared), declared, 1, 'PREPARED', false);
   });
   if (mutation === 'application' || mutation === 'version') {
    raw(f, true, db => {
     if (mutation === 'application') db.exec('PRAGMA application_id = 0');
     else db.exec('PRAGMA user_version = 77');
    });
   }
   const edited = view(f);
   q(edited.applicationId, mutation === 'application' ? 0 : 0x5a505252);
   q(edited.version, mutation === 'version' ? 77 : created);
   refuseUnchanged(f, opened, mutation === 'policy' ? policy(3) : policy2);
  }
  q(fixtures.length, 7);
 }],
];
q(groups.length, 3);
const [name, run] = groups[selector - 1];
test(name, { timeout: 5000 }, () => {
 const errors = [];
 try { run(); } catch (error) { errors.push(error); }
 try {
  closed();
  for (const e of entries) {
   ok(e.state === 'CLOSED' || e.state === 'REFUSED');
   if (e.state === 'CLOSED') {
    q(e.closeAttempted, true);
    q(e.closeReturned, true);
   } else {
    q(e.handle, null);
    q(e.closeAttempted, false);
    ok(code('SCHEMA_UNSUPPORTED')(e.failure));
   }
  }
  for (const f of fixtures) checkFiles(f);
  ok(fixtures.length <= 8);
  same(readdirSync(fixtureRoot).sort(),
   fixtures.map(f => f.root.slice(fixtureRoot.length + 1)).sort());
  for (const [path, identity] of [[scratch, scratchId],
   [fixtureRoot, fixtureId]]) {
   const now = privateDirectory(path);
   q(now.dev, identity.dev);
   q(now.ino, identity.ino);
  }
 } catch (error) { errors.push(error); }
 if (errors.length) throw new AggregateError(errors, 'GROUP_OR_NATIVE_RESOURCE_HOLD');
});
