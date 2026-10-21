// P2 source-bound SQLite schema-prefix check. Only new private EMPTY synthetic
// databases are used. No funding pair, payment, SDK, grant, signature, network,
// dispatch, recovery attempt, existing database, or chain PREPARE is invoked.
// BASELINE_REPRODUCTION observes the pinned old filter; it is NOT safe-store
// qualification. FIXED_REFUSAL checks a different source version and new files.
// Counts below concern known returned handles, not independent C++/OS cleanup.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, readdirSync, openSync, closeSync, readSync, fstatSync, constants } from 'node:fs';
import { dirname, resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = 'qualification/service-credit-payer-sqlite-schema-prefix-baseline-corrected.behavior.draft.mjs', MODE = 'BASELINE_REPRODUCTION', PREFIX = 'X402_PAYER_SCHEMA_';
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
const SPECS = [
  {
    "path": "src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    "bytes": 57459,
    "LF": 1536,
    "sha256": "9c925f241effbfec0bf014ff284e834c4d5679c4ea7224f83a6354cde6cffdaf"
  },
  {
    "path": "src/service-credit-original-request-custody-contract.js",
    "bytes": 14051,
    "LF": 356,
    "sha256": "fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"
  },
  {
    "path": "src/x402-wire.js",
    "bytes": 39886,
    "LF": 934,
    "sha256": "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"
  },
  {
    "path": "package.json",
    "bytes": 1413,
    "LF": 40,
    "sha256": "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
  }
];
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.env[PREFIX + 'OPT_IN'], 'reviewed-managed-synthetic-only');
const sha = b => createHash('sha256').update(b).digest('hex');
const id = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
const clone = x => JSON.parse(JSON.stringify(x)); // Native rows from this fixed owned synthetic database only.
function noLinks(path) {
  for (let at = path;; at = dirname(at)) {
    assert.equal(lstatSync(at).isSymbolicLink(), false);
    if (dirname(at) === at) break;
  }
}
function readPin(path, cap) {
  noLinks(path); const before = lstatSync(path, { bigint: true });
  assert.ok(before.isFile()); assert.equal(before.uid, BigInt(process.getuid())); assert.equal(before.nlink, 1n);
  assert.ok(before.size > 0n && before.size <= BigInt(cap));
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const b = Buffer.alloc(Number(before.size) + 1); let count = 0;
  try {
    assert.deepEqual(id(fstatSync(fd, { bigint: true })), id(before));
    while (count < b.length) { const got = readSync(fd, b, count, b.length - count, null); if (!got) break; count += got; }
    assert.deepEqual(id(fstatSync(fd, { bigint: true })), id(before));
  } finally { closeSync(fd); }
  assert.deepEqual(id(lstatSync(path, { bigint: true })), id(before)); assert.equal(count, Number(before.size));
  return { bytes: b.subarray(0, count), identity: id(before) };
}
const manifest = JSON.parse(process.env[PREFIX + 'SOURCE_PINS']);
function sources() {
  assert.ok(Array.isArray(manifest)); assert.equal(manifest.length, 5);
  assert.deepEqual(manifest.map(p => p.path), [...SPECS.map(p => p.path), ENTRY]);
  let total = 0;
  return manifest.map((pin, index) => {
    const got = readPin(join(REPO, pin.path), 65536), b = got.bytes;
    total += b.length; assert.ok(total <= 196608);
    assert.deepEqual(got.identity, pin.identity); assert.equal(b.length, pin.bytes);
    assert.equal(sha(b), pin.sha256); assert.equal(b.filter(c => c === 10).length, pin.LF);
    assert.equal(b.includes(0) || b.some(c => c > 127), false);
    if (index < SPECS.length) for (const k of ['path','bytes','LF','sha256']) assert.equal(pin[k], SPECS[index][k]);
    return { path: pin.path, bytes: b.length, sha256: sha(b), identity: got.identity };
  });
}
const initialSources = sources();
const scratch = process.env.SPV_TASK_SCRATCH;
assert.ok(isAbsolute(scratch) && resolve(scratch) === scratch && realpathSync(scratch) === scratch);
noLinks(scratch);
const roots = JSON.parse(process.env[PREFIX + 'ROOTS']);
const COUNT = MODE === 'BASELINE_REPRODUCTION' ? 1 : 7;
assert.ok(Array.isArray(roots)); assert.equal(roots.length, COUNT);
assert.equal(new Set(roots.map(r => r.path)).size, COUNT);
for (const [index, root] of roots.entries()) {
  assert.equal(root.path, join(scratch, 'schema-case-' + (index + 1)));
  noLinks(root.path); const s = lstatSync(root.path, { bigint: true });
  assert.ok(s.isDirectory()); assert.equal(s.uid, BigInt(process.getuid()));
  assert.equal(s.mode & 0o777n, 0o700n); assert.equal(realpathSync(root.path), root.path);
  assert.deepEqual([String(s.dev), String(s.ino)], root.identity); assert.deepEqual(readdirSync(root.path), []);
}
const { DatabaseSync } = await import('node:sqlite');
const store = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const CREATE = [null, store.createZenonFundingPayerRecoverySqliteStore,
  store.createZenonFundingPayerRecoveryCustodySqliteStoreV2, store.createZenonFundingPayerRecoveryDispatchIntentSqliteStoreV3];
const OPEN = [null, store.openZenonFundingPayerRecoverySqliteStore,
  store.openZenonFundingPayerRecoveryCustodySqliteStoreV2, store.openZenonFundingPayerRecoveryDispatchIntentSqliteStoreV3];
const OPTIONS = { timeout: 5000, concurrency: false };
const FUNDING = 'https://schema.invalid/fund', SERVICE = 'https://schema.invalid/service-credit/v1/execute';
const POLICY = { policyVersion: 1, maxRequests: 1, serviceResourceUrl: SERVICE };
const OLD_QUERY = "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name";
const LITERAL_QUERY = "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite!_%' ESCAPE '!' ORDER BY name";
const PROBE = 'CREATE TABLE sqlitex_probe(marker INTEGER NOT NULL) STRICT';
const TRIGGER = 'CREATE TRIGGER sqlitex_owner_trigger AFTER UPDATE OF owner_epoch ON payer_recovery_meta BEGIN INSERT INTO sqlitex_probe(marker) VALUES(1); END';
const states = new Map();
function fixture(index, profile) {
  assert.equal(states.has(index), false);
  const root = roots[index], f = { index, profile, root: root.path, path: join(root.path, 'custody.sqlite'),
    returned: null, unknownClose: false, createCalls: 0, openCalls: 0, storeCloses: 0, rawOpens: 0, rawCloses: 0 };
  f.options = { databasePath: f.path, allowedRoot: f.root, resourceUrl: FUNDING,
    ...(profile > 1 ? { custodyPolicy: clone(POLICY) } : {}) };
  states.set(index, f); return f;
}
function closeReturned(f) {
  if (f.returned === null) return;
  const current = f.returned; f.returned = null; f.storeCloses++;
  try { assert.equal(current.close(), undefined); } catch (error) { f.unknownClose = true; throw error; }
}
function seed(f) {
  f.createCalls++; f.returned = CREATE[f.profile](f.options);
  try { assert.equal(f.returned.load(), null); }
  finally { closeReturned(f); }
}
function raw(f, readOnly, callback) {
  const db = new DatabaseSync(f.path, { readOnly, allowExtension: false,
    enableDoubleQuotedStringLiterals: false, enableForeignKeyConstraints: true, timeout: 0 });
  f.rawOpens++;
  try { return callback(db); }
  finally {
    f.rawCloses++;
    try { db.close(); } catch (error) { f.unknownClose = true; throw error; }
  }
}
function snapshot(f) {
  const rows = raw(f, true, db => {
    const all = sql => clone(db.prepare(sql).all());
    const objects = all('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name');
    const names = objects.map(o => o.name);
    return { engine: db.prepare('SELECT sqlite_version() AS version').get().version,
      application: db.prepare('PRAGMA application_id').get().application_id,
      version: db.prepare('PRAGMA user_version').get().user_version,
      integrity: db.prepare('PRAGMA integrity_check').get().integrity_check,
      foreignKeys: all('PRAGMA foreign_key_check'),
      meta: all('SELECT * FROM payer_recovery_meta'),
      state: all('SELECT * FROM payer_recovery_state'),
      policy: f.profile > 1 ? all('SELECT * FROM original_request_custody_policy') : [],
      originals: f.profile > 1 ? all('SELECT * FROM original_service_requests') : [],
      intents: f.profile === 3 ? all('SELECT * FROM original_dispatch_intents') : [],
      witness: names.includes('sqlitex_probe') ? all('SELECT marker FROM sqlitex_probe') : null,
      objects, oldVisible: all(OLD_QUERY), literalVisible: all(LITERAL_QUERY) };
  });
  const file = readPin(f.path, 131072);
  assert.equal(BigInt(file.identity[4]) & 0o777n, 0o600n);
  assert.deepEqual(readdirSync(f.root), ['custody.sqlite']);
  assert.equal(rows.application, 0x5a505252); assert.equal(rows.version, f.profile);
  assert.equal(rows.integrity, 'ok'); assert.deepEqual(rows.foreignKeys, []);
  assert.deepEqual(rows.state, []); assert.deepEqual(rows.originals, []); assert.deepEqual(rows.intents, []);
  assert.equal(rows.meta.length, 1); assert.equal(rows.meta[0].resource_url, FUNDING);
  return { ...rows, fileSha256: sha(file.bytes), fileBytes: file.bytes.length,
    fileIdentity: file.identity.slice(0, 2), epoch: rows.meta[0].owner_epoch };
}
function install(f, kind) {
  raw(f, false, db => {
    if (kind === 'table') db.exec(PROBE);
    else if (kind === 'view') db.exec('CREATE VIEW SQLiteX_view AS SELECT owner_epoch FROM payer_recovery_meta');
    else if (kind === 'index') db.exec('CREATE INDEX sqlitex_index ON payer_recovery_meta(resource_url)');
    else if (kind === 'trigger') { db.exec(PROBE); db.exec(TRIGGER); }
    else assert.fail('Unknown fixed synthetic object kind');
  });
}
function unchangedTables(before, after) {
  for (const field of ['application','version','integrity','foreignKeys','state','policy','originals','intents','objects'])
    assert.deepEqual(after[field], before[field]);
  assert.deepEqual(after.fileIdentity, before.fileIdentity);
}
function diagnostic(t, f, kind, before, after, outcome, byteStable) {
  const value = { kind: 'PAYER_SCHEMA_PREFIX', version: 1, phase: MODE, profile: f.profile, objectKind: kind,
    outcome, epochBefore: before.epoch, epochAfter: after.epoch,
    witnessBefore: before.witness === null ? 0 : before.witness.length,
    witnessAfter: after.witness === null ? 0 : after.witness.length,
    oldVisible: before.oldVisible.length, literalVisible: before.literalVisible.length,
    expectedUserObjects: f.profile === 1 ? 2 : f.profile === 2 ? 4 : 5,
    storeCreateCalls: f.createCalls, storeOpenCalls: f.openCalls, returnedStoreCloseCalls: f.storeCloses,
    rawOpens: f.rawOpens, rawCloses: f.rawCloses, byteStable,
    foreignSchemaPreserved: true, sourceBound: true, constructorInternalClose: 'NOT_INSTRUMENTED',
    sqliteVersion: before.engine, authority: 'NONE', livePilot: false };
  assert.equal(f.returned, null); assert.equal(f.unknownClose, false); assert.equal(f.rawOpens, f.rawCloses);
  t.diagnostic(JSON.stringify(value));
}
function baseline(t) {
  const f = fixture(0, 3);
  try {
    seed(f); install(f, 'trigger');
    const before = snapshot(f);
    assert.equal(before.epoch, 1); assert.deepEqual(before.witness, []);
    assert.equal(before.oldVisible.length, 5); assert.equal(before.literalVisible.length, 7);
    f.openCalls++; f.returned = OPEN[3](f.options);
    try { assert.equal(f.returned.load(), null); } finally { closeReturned(f); }
    const after = snapshot(f); unchangedTables(before, after);
    assert.equal(after.epoch, 2); assert.deepEqual(after.witness, [{ marker: 1 }]);
    assert.notEqual(after.fileSha256, before.fileSha256);
    diagnostic(t, f, 'trigger', before, after, 'ACCEPTED_FOREIGN_SCHEMA', false);
  } finally { closeReturned(f); }
}
function cleanControl(t, index, profile) {
  const f = fixture(index, profile);
  try {
    seed(f); const before = snapshot(f), expected = profile === 1 ? 2 : profile === 2 ? 4 : 5;
    assert.equal(before.oldVisible.length, expected); assert.equal(before.literalVisible.length, expected);
    if (profile > 1) assert.ok(before.objects.some(o => o.name.startsWith('sqlite_autoindex_')));
    f.openCalls++; f.returned = OPEN[profile](f.options);
    try { assert.equal(f.returned.load(), null); } finally { closeReturned(f); }
    const after = snapshot(f); unchangedTables(before, after);
    assert.equal(before.epoch, 1); assert.equal(after.epoch, 2);
    diagnostic(t, f, 'none', before, after, 'VALID_PROFILE_OPENED', false);
  } finally { closeReturned(f); }
}
function refuse(t, index, profile, kind) {
  const f = fixture(index, profile);
  try {
    seed(f); install(f, kind); const before = snapshot(f);
    const expected = profile === 1 ? 2 : profile === 2 ? 4 : 5, extra = kind === 'trigger' ? 2 : 1;
    assert.equal(before.epoch, 1); assert.equal(before.oldVisible.length, expected);
    assert.equal(before.literalVisible.length, expected + extra);
    const code = profile === 3 ? 'ZENON_FUNDING_PAYER_RECOVERY_STORE_CORRUPT'
      : 'ZENON_FUNDING_PAYER_RECOVERY_STORE_SCHEMA_UNSUPPORTED';
    f.openCalls++;
    assert.throws(() => { f.returned = OPEN[profile](f.options); }, error => {
      assert.ok(error instanceof store.ZenonFundingPayerRecoverySqliteStoreError);
      assert.equal(error.code, code); assert.equal(error.name, 'ZenonFundingPayerRecoverySqliteStoreError');
      assert.equal(error.message, code); assert.equal(error.stack, 'ZenonFundingPayerRecoverySqliteStoreError: ' + code);
      assert.equal(Object.hasOwn(error, 'cause'), false); return true;
    });
    const after = snapshot(f); unchangedTables(before, after);
    assert.deepEqual(after.meta, before.meta); assert.deepEqual(after.witness, before.witness);
    assert.equal(after.epoch, 1); assert.equal(after.fileSha256, before.fileSha256);
    assert.equal(after.fileBytes, before.fileBytes);
    diagnostic(t, f, kind, before, after, code, true);
  } finally { closeReturned(f); }
}
after(() => {
  assert.equal(states.size, COUNT);
  for (const f of states.values()) {
    assert.equal(f.returned, null); assert.equal(f.unknownClose, false);
    assert.equal(f.rawOpens, f.rawCloses); assert.deepEqual(readdirSync(f.root), ['custody.sqlite']);
  }
  assert.deepEqual(sources(), initialSources);
});
test('payer V3 old wildcard prefix accepts a hidden schema trigger during owner acquisition in a new empty synthetic database', OPTIONS, baseline);
