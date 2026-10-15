/*
 * SOURCE DRAFT / NOT_RUN. SQL execution requires separate human approval and
 * approved task-storage lease/evidence registration through SPV_TASK_SCRATCH.
 * No home/temp fallback, deletion, child/worker, SDK, HTTP or production path.
 * Store.prepare() is LOCAL declared metadata, NOT chain PREPARE. Its dummy
 * envelope is not signed, verified, included or settled. No keys are generated.
 * Same-process reopen/faults are not restart/durability proof.
 * A 5000 ms timeout is no hard lifetime or OS sandbox.
 * Retain every fixture, failure and corruption. One selected group/process,
 * at most 8 newly owned roots, 1 DB/root, 4 records/DB, 2 MiB/file post-check;
 * allocation/reservation limits and mount identity remain launcher gates.
 */
import test from 'node:test';
import {
  equal as q,
  deepEqual as same,
  notEqual as ne,
  throws,
  ok,
} from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
if (process.argv.length !== 3 || !/^[1-8]$/.test(process.argv[2])) {
  throw new Error('EXACT_NUMERIC_SCENARIO_REQUIRED');
}
const selector = process.argv[2];
const sourceSpecs = [
  [
    new URL('../src/service-credit-original-request-custody-contract.js', import.meta.url),
    9810,
    '8f4d40d017a89e9a064c411c8e076cb21a45b9fb787fda7a664246b7bd744083',
  ],
  [
    new URL('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js',
      import.meta.url),
    47979,
    '18382896ec5745d8ab4358cbe26ea1a166eccda2d7c4e86840d4df926704da9d',
  ],
  [
    new URL('../src/x402-wire.js', import.meta.url),
    39886,
    '5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56',
  ],
  [
    new URL('../package.json', import.meta.url),
    1413,
    '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5',
  ],
];
const sources = sourceSpecs.map(([url, bytes, sha]) => {
  const path = fileURLToPath(url);
  const before = lstatSync(path, { bigint: true });
  ok(before.isFile());
  q(before.isSymbolicLink(), false);
  q(before.nlink, 1n);
  q(before.size, BigInt(bytes));
  q(realpathSync(path), path);
  const raw = readFileSync(path);
  q(raw.length, bytes);
  q(createHash('sha256').update(raw).digest('hex'), sha);
  const text = raw.toString('utf8');
  q(/[^\x00-\x7f]/.test(text), false);
  ok(text.endsWith('\n'));
  const after = lstatSync(path, { bigint: true });
  q(after.dev, before.dev);
  q(after.ino, before.ino);
  q(after.size, before.size);
  return Object.freeze({ url: url.href, text });
});
const packageData = JSON.parse(sources[3].text);
q(packageData.type, 'module');
q(packageData.engines.node, '>=24');
q(process.versions.node, '24.19.0');
function privateDirectory(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 3800
      || !isAbsolute(path) || resolve(path) !== path
      || typeof process.getuid !== 'function') {
    throw new Error('PRIVATE_TASK_SCRATCH_REQUIRED');
  }
  const stat = lstatSync(path, { bigint: true });
  ok(stat.isDirectory());
  q(stat.isSymbolicLink(), false);
  q(stat.uid, BigInt(process.getuid()));
  q(stat.mode & 0o777n, 0o700n);
  q(stat.mode & 0o7000n, 0n);
  q(realpathSync(path), path);
  return path;
}
// This validates a supplied directory; it does not authenticate a storage lease.
const scratch = privateDirectory(process.env.SPV_TASK_SCRATCH);
const { DatabaseSync } = await import('node:sqlite');
const storeModule = await import(sources[1].url);
const custody = await import(sources[0].url);
const wire = await import(sources[2].url);
const {
  createZenonFundingPayerRecoverySqliteStore: createV1,
  openZenonFundingPayerRecoverySqliteStore: openV1,
  createZenonFundingPayerRecoveryCustodySqliteStoreV2: createV2,
  openZenonFundingPayerRecoveryCustodySqliteStoreV2: openV2,
  ZenonFundingPayerRecoverySqliteStoreError: StoreError,
  ZENON_FUNDING_PAYER_RECOVERY_SQLITE_SCHEMA_VERSION,
  ZENON_FUNDING_PAYER_RECOVERY_CUSTODY_SQLITE_SCHEMA_VERSION,
} = storeModule;
const {
  captureOriginalServiceRequestCustody: captureCustody,
  serializeOriginalServiceRequestCustody: serializeCustody,
  parseOriginalServiceRequestCustody: parseCustody,
} = custody;
const FUNDING = 'https://custody.example.test/funding';
const SERVICE = 'https://custody.example.test/service-credit/v1/execute';
const NETWORK = 'zenon:testnet';
const PAYMENT_HASH = 'a'.repeat(64);
const EMPTY_DIGEST =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const PREFIX = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_';
const MAX_FIXTURES = 8;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const activeHandles = new Set();
let fixtureCount = 0;
const errorCode = suffix => error => {
  const expected = PREFIX + suffix;
  return error instanceof StoreError
    && error.name === 'ZenonFundingPayerRecoverySqliteStoreError'
    && error.code === expected
    && error.message === expected
    && error.stack === 'ZenonFundingPayerRecoverySqliteStoreError: ' + expected;
};
function policy(maxRequests) {
  return { policyVersion: 1, maxRequests, serviceResourceUrl: SERVICE };
}
function original(grantId = 'grant_A', requestId = 'request_A', maxCostUnits = 7) {
  const request = {
    modelVersion: 1,
    grantId,
    requestId,
    method: 'POST',
    routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: EMPTY_DIGEST,
    selectedContentType: 'application/json',
    maxCostUnits,
  };
  return {
    grantId,
    requestId,
    originalRequestJson: JSON.stringify(request),
    originalBodyBase64: '',
    serviceResourceUrl: SERVICE,
  };
}
function requestKey(value) {
  return { grantId: value.grantId, requestId: value.requestId };
}
function contractInput(value) {
  return {
    originalRequestJson: value.originalRequestJson,
    originalBodyBase64: value.originalBodyBase64,
    serviceResourceUrl: value.serviceResourceUrl,
  };
}
function declaredBinding(paymentHash = PAYMENT_HASH) {
  return { fundingResourceUrl: FUNDING, paymentHash, network: NETWORK };
}
function declaredPair() {
  const requirement = {
    scheme: 'exact',
    network: NETWORK,
    asset: 'declared-test-asset',
    amount: '1',
    payTo: 'declared-test-payee',
    maxTimeoutSeconds: 30,
    extra: {
      poc: true,
      settlement: 'account-block',
      paymentFlow: 'upfront',
      zenonChain: {
        version: 1,
        chainIdentifier: '42',
        genesisMomentumHash: '1'.repeat(64),
      },
    },
  };
  const paymentRequired = {
    x402Version: 2,
    resource: { url: FUNDING },
    accepts: [requirement],
  };
  const paymentPayload = {
    x402Version: 2,
    resource: { url: FUNDING },
    accepted: requirement,
    payload: {
      transaction: { hash: PAYMENT_HASH },
      intentDigest: '2'.repeat(64),
    },
  };
  const limits = { maxEncodedBytes: 8192 };
  return {
    challenge: {
      status: 'PAYMENT_REQUIRED',
      resourceUrl: FUNDING,
      paymentRequiredHeader: wire.encodeB64Json(paymentRequired, limits),
      paymentRequired,
    },
    paymentSignatureHeader: wire.encodeB64Json(paymentPayload, limits),
  };
}
function frozenData(value) {
  if (value === null || typeof value !== 'object') return;
  ok(Object.isFrozen(value));
  for (const child of Object.values(value)) frozenData(child);
}
function fixture(maxRequests = 2) {
  fixtureCount++;
  if (fixtureCount > MAX_FIXTURES) throw new Error('FIXTURE_LIMIT_EXCEEDED');
  const root = mkdtempSync(join(scratch, `custody-sqlite-${selector}-${fixtureCount}-`));
  chmodSync(root, 0o700);
  privateDirectory(root);
  return {
    root,
    databasePath: join(root, 'custody.sqlite'),
    custodyPolicy: policy(maxRequests),
    identity: null,
  };
}
function options(f, overrides = {}) {
  const value = {
    databasePath: f.databasePath,
    allowedRoot: f.root,
    resourceUrl: FUNDING,
  };
  if (!overrides.v1) {
    value.custodyPolicy = overrides.policy === undefined
      ? f.custodyPolicy : overrides.policy;
  }
  if (overrides.hooks !== undefined) value.testHooks = overrides.hooks;
  return value;
}
function checkFile(path) {
  const stat = lstatSync(path, { bigint: true });
  ok(stat.isFile());
  q(stat.isSymbolicLink(), false);
  q(stat.uid, BigInt(process.getuid()));
  q(stat.nlink, 1n);
  q(stat.mode & 0o777n, 0o600n);
  q(stat.mode & 0o7000n, 0n);
  ok(stat.size <= BigInt(MAX_FILE_BYTES));
  q(realpathSync(path), path);
  return stat;
}
function checkFiles(f) {
  privateDirectory(f.root);
  const names = readdirSync(f.root);
  ok(names.length <= 2);
  for (const name of names) {
    ok(name === 'custody.sqlite' || name === 'custody.sqlite-journal');
    const stat = checkFile(join(f.root, name));
    if (name === 'custody.sqlite') {
      if (f.identity !== null) {
        q(stat.dev, f.identity.dev);
        q(stat.ino, f.identity.ino);
      } else {
        f.identity = { dev: stat.dev, ino: stat.ino };
      }
    }
  }
}
function managed(f, open, body) {
  q(activeHandles.size, 0);
  const handle = open();
  activeHandles.add(handle);
  const problems = [];
  let result;
  try {
    result = body(handle);
  } catch (error) {
    problems.push(error);
  } finally {
    try {
      handle.close();
      activeHandles.delete(handle);
    } catch (error) {
      problems.push(error);
    }
    try { checkFiles(f); } catch (error) { problems.push(error); }
  }
  if (problems.length === 1) throw problems[0];
  if (problems.length > 1) {
    throw new AggregateError(problems, 'FIXTURE_OPERATION_OR_CLOSE_FAILED');
  }
  return result;
}
function withStore(f, factory, body, overrides = {}) {
  return managed(f, () => factory(options(f, overrides)), body);
}
function withDatabase(f, body, { write = false, foreignKeys = true } = {}) {
  checkFile(f.databasePath);
  return managed(f, () => new DatabaseSync(f.databasePath, {
    allowExtension: false,
    enableDoubleQuotedStringLiterals: false,
    enableForeignKeyConstraints: foreignKeys,
    readOnly: !write,
    timeout: 0,
  }), body);
}
function databaseBytes(f) {
  q(activeHandles.size, 0);
  const before = checkFile(f.databasePath);
  const raw = readFileSync(f.databasePath);
  q(raw.length, Number(before.size));
  const after = checkFile(f.databasePath);
  q(after.dev, before.dev);
  q(after.ino, before.ino);
  q(after.size, before.size);
  return raw;
}
function refuseUnchanged(f, factory, suffix, overrides = {}) {
  const afterEdit = databaseBytes(f);
  let unexpected;
  try {
    throws(() => {
      unexpected = factory(options(f, overrides));
    }, errorCode(suffix));
  } finally {
    if (unexpected !== undefined) unexpected.close();
    checkFiles(f);
  }
  same(databaseBytes(f), afterEdit);
}
function expectFactoryFailure(f, replacementPolicy) {
  let unexpected;
  try {
    throws(() => {
      unexpected = createV2(options(f, { policy: replacementPolicy }));
    }, errorCode('INVALID_CONFIGURATION'));
  } finally {
    if (unexpected !== undefined) unexpected.close();
    checkFiles(f);
  }
}
function seed(f, requests = [original()]) {
  ok(requests.length <= 4);
  const pair = declaredPair();
  return withStore(f, createV2, store => {
    const funding = store.prepare(pair);
    const records = requests.map(value => store.retainOriginalRequest(value));
    return { pair, funding, records };
  });
}
function tableNames(db) {
  return db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all().map(row => row.name);
}
function assertFunding(record, pair) {
  q(record.revision, 1);
  q(record.status, 'PREPARED');
  q(record.ambiguityLatched, false);
  q(record.resourceUrl, FUNDING);
  q(record.challengeHeader, pair.challenge.paymentRequiredHeader);
  q(record.paymentHeader, pair.paymentSignatureHeader);
  q(record.paymentPayload.payload.transaction.hash, PAYMENT_HASH);
  q(record.requirement.network, NETWORK);
  q(record.requirement.extra.zenonChain.chainIdentifier, '42');
  q(record.requirement.extra.zenonChain.genesisMomentumHash, '1'.repeat(64));
  same(Object.keys(record.paymentPayload.payload.transaction), ['hash']);
  frozenData(record);
}
function assertOriginal(record, value) {
  q(record.originalRequestJson, value.originalRequestJson);
  q(record.originalBodyBase64, '');
  q(record.serviceResourceUrl, SERVICE);
  q(record.fundingResourceUrl, FUNDING);
  q(record.paymentHash, PAYMENT_HASH);
  q(record.network, NETWORK);
  q(record.grantId, value.grantId);
  q(record.requestId, value.requestId);
  same(parseCustody(serializeCustody(record)), record);
  frozenData(record);
}
const scenarios = [
  ['v2 schema and policy are explicit while v1 stays two-table', () => {
    q(ZENON_FUNDING_PAYER_RECOVERY_SQLITE_SCHEMA_VERSION, 1);
    q(ZENON_FUNDING_PAYER_RECOVERY_CUSTODY_SQLITE_SCHEMA_VERSION, 2);
    const v2 = fixture(3);
    withStore(v2, createV2, store => {
      q(typeof store.retainOriginalRequest, 'function');
      q(typeof store.getOriginalRequest, 'function');
      q(store.load(), null);
      q(store.getOriginalRequest(requestKey(original())), null);
      throws(() => store.retainOriginalRequest(original()),
        errorCode('INVALID_TRANSITION'));
      q(store.load(), null);
    });
    withDatabase(v2, db => {
      q(db.prepare('PRAGMA user_version').get().user_version, 2);
      q(db.prepare('PRAGMA application_id').get().application_id, 0x5a505252);
      same(tableNames(db), [
        'original_request_custody_policy', 'original_service_requests',
        'payer_recovery_meta', 'payer_recovery_state',
      ]);
      const row = db.prepare('SELECT * FROM original_request_custody_policy').get();
      same({ ...row }, {
        singleton: 1, policy_version: 1, max_requests: 3,
        service_resource_url: SERVICE,
      });
      q(db.prepare('SELECT COUNT(*) AS n FROM payer_recovery_state').get().n, 0);
      q(db.prepare('SELECT COUNT(*) AS n FROM original_service_requests').get().n, 0);
      const columns = db.prepare('PRAGMA table_info(original_service_requests)').all();
      same(columns.map(row => row.name), [
        'grant_id', 'request_id', 'funding_singleton', 'payment_hash',
        'network', 'service_resource_url', 'envelope',
      ]);
      q(columns.find(row => row.name === 'grant_id').pk, 1);
      q(columns.find(row => row.name === 'request_id').pk, 2);
      for (const row of db.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      ).all()) ok(row.sql.endsWith(' STRICT'));
    });
    const v1 = fixture();
    withStore(v1, createV1, store => {
      throws(() => store.retainOriginalRequest(original()),
        errorCode('CUSTODY_NOT_ENABLED'));
      throws(() => store.getOriginalRequest(requestKey(original())),
        errorCode('CUSTODY_NOT_ENABLED'));
      q(store.load(), null);
    }, { v1: true });
    withDatabase(v1, db => {
      q(db.prepare('PRAGMA user_version').get().user_version, 1);
      same(tableNames(db), ['payer_recovery_meta', 'payer_recovery_state']);
      q(db.prepare('SELECT COUNT(*) AS n FROM payer_recovery_state').get().n, 0);
    });
  }],
  ['declared funding metadata and empty request survive same-process reopen', () => {
    const f = fixture(2), pair = declaredPair(), value = original();
    const expectedJson = value.originalRequestJson;
    let fundingBefore, retained;
    withStore(f, createV2, store => {
      fundingBefore = store.prepare(pair);
      assertFunding(fundingBefore, pair);
      retained = store.retainOriginalRequest(value);
      assertOriginal(retained, value);
      const read = store.getOriginalRequest(requestKey(value));
      same(read, retained);
      ne(read, retained);
      frozenData(read);
      value.originalRequestJson = JSON.stringify({
        ...JSON.parse(expectedJson), maxCostUnits: 8,
      });
      q(store.getOriginalRequest(requestKey(value)).originalRequestJson, expectedJson);
      same(store.load(), fundingBefore);
    });
    withStore(f, openV2, store => {
      const fundingAfter = store.load();
      same(fundingAfter, fundingBefore);
      ne(fundingAfter, fundingBefore);
      assertFunding(fundingAfter, pair);
      const read = store.getOriginalRequest({ grantId: 'grant_A', requestId: 'request_A' });
      same(read, retained);
      ne(read, retained);
      q(read.originalRequestJson, expectedJson);
      q(read.originalBodyBase64, '');
      frozenData(read);
    });
    withDatabase(f, db => {
      const selected = db.prepare(
        'SELECT policy_version,max_requests,service_resource_url FROM original_request_custody_policy',
      ).get();
      same({ ...selected }, {
        policy_version: 1, max_requests: 2, service_resource_url: SERVICE,
      });
      q(db.prepare('SELECT owner_epoch FROM payer_recovery_meta').get().owner_epoch, 2);
      const row = db.prepare('SELECT * FROM original_service_requests').get();
      q(row.payment_hash, PAYMENT_HASH);
      q(row.network, NETWORK);
      q(row.envelope, serializeCustody(retained));
    });
  }],
  ['same-key idempotence precedes capacity and changed bytes conflict', () => {
    const f = fixture(1), value = original(), pair = declaredPair();
    let first;
    withStore(f, createV2, store => {
      const funding = store.prepare(pair);
      first = store.retainOriginalRequest(value);
      const second = store.retainOriginalRequest({ ...value });
      same(second, first);
      ne(second, first);
      frozenData(second);
      const baseline = serializeCustody(first);
      const changes = [
        original(value.grantId, value.requestId, 8),
        { ...value, originalRequestJson: value.originalRequestJson + ' ' },
        { ...value, originalBodyBase64: 'AA==' },
        { ...value, serviceResourceUrl:
          'https://other.example.test/service-credit/v1/execute' },
        { ...value, originalRequestJson: original('other_grant', value.requestId).originalRequestJson },
      ];
      for (const changed of changes) {
        throws(() => store.retainOriginalRequest(changed), errorCode('CONFLICT'));
        q(serializeCustody(store.getOriginalRequest(requestKey(value))), baseline);
      }
      throws(() => store.retainOriginalRequest(original('grant_A', 'request_B')),
        errorCode('CUSTODY_CAPACITY'));
      q(store.getOriginalRequest({ grantId: 'grant_A', requestId: 'request_B' }), null);
      q(store.getOriginalRequest({ grantId: 'grant_B', requestId: 'request_A' }), null);
      same(store.load(), funding);
      same(store.retainOriginalRequest(value), first);
    });
    withDatabase(f, db => {
      q(db.prepare('SELECT COUNT(*) AS n FROM original_service_requests').get().n, 1);
      q(db.prepare('SELECT envelope FROM original_service_requests').get().envelope,
        serializeCustody(first));
    });
  }],
  ['closed fixture corruption rejects complete custody records', () => {
    for (const kind of ['checksum', 'columns', 'mixed-binding']) {
      const f = fixture(2), value = original();
      const seeded = seed(f, [value]);
      withDatabase(f, db => {
        if (kind === 'checksum') {
          const changed = {
            ...seeded.records[0],
            checksum: 'sha256:' + '0'.repeat(64),
          };
          ne(changed.checksum, seeded.records[0].checksum);
          db.prepare(
            'UPDATE original_service_requests SET envelope=? WHERE grant_id=? AND request_id=?',
          ).run(JSON.stringify(changed), value.grantId, value.requestId);
        } else if (kind === 'columns') {
          db.prepare(
            'UPDATE original_service_requests SET payment_hash=? WHERE grant_id=? AND request_id=?',
          ).run('b'.repeat(64), value.grantId, value.requestId);
        } else {
          const foreign = captureCustody(contractInput(value), declaredBinding('b'.repeat(64)));
          const text = serializeCustody(foreign);
          q(parseCustody(text).paymentHash, 'b'.repeat(64));
          db.prepare(
            'UPDATE original_service_requests SET payment_hash=?,envelope=? WHERE grant_id=? AND request_id=?',
          ).run('b'.repeat(64), text, value.grantId, value.requestId);
          q(db.prepare('SELECT payment_digest FROM payer_recovery_state').get()
            .payment_digest.length, 71);
        }
      }, { write: true });
      refuseUnchanged(f, openV2, 'CORRUPT');
    }
  }],
  ['version header and policy refusals preserve post-edit database bytes', () => {
    const v2 = fixture(2), v1 = fixture(2);
    withStore(v2, createV2, () => {});
    withStore(v1, createV1, () => {}, { v1: true });
    refuseUnchanged(v2, openV1, 'SCHEMA_UNSUPPORTED', { v1: true });
    refuseUnchanged(v1, openV2, 'SCHEMA_UNSUPPORTED');
    refuseUnchanged(v2, openV2, 'SCHEMA_UNSUPPORTED', { policy: policy(3) });
    withDatabase(v2, db => {
      q(db.prepare('SELECT max_requests FROM original_request_custody_policy')
        .get().max_requests, 2);
    });
    for (const edit of ['application', 'version']) {
      const f = fixture(2);
      withStore(f, createV2, () => {});
      withDatabase(f, db => {
        if (edit === 'application') db.exec('PRAGMA application_id = 0');
        else db.exec('PRAGMA user_version = 77');
      }, { write: true });
      refuseUnchanged(f, openV2, 'SCHEMA_UNSUPPORTED');
    }
  }],
  ['retain commit hooks distinguish rollback from unknown committed outcome', () => {
    const beforeFixture = fixture(2), value = original(), pair = declaredPair();
    let beforeArmed = false;
    const beforeSeen = [];
    const beforeHooks = {
      beforeCommit(name) {
        beforeSeen.push(name);
        if (beforeArmed && name === 'retainOriginalRequest') {
          throw new Error('DECLARED_BEFORE_COMMIT_FAULT');
        }
      },
    };
    withStore(beforeFixture, createV2, store => {
      const funding = store.prepare(pair);
      q(beforeArmed, false);
      beforeArmed = true;
      throws(() => store.retainOriginalRequest(value), errorCode('TRANSACTION_FAILED'));
      beforeArmed = false;
      q(store.getOriginalRequest(requestKey(value)), null);
      same(store.load(), funding);
    }, { hooks: beforeHooks });
    q(beforeSeen.filter(name => name === 'retainOriginalRequest').length, 1);
    withDatabase(beforeFixture, db => {
      q(db.prepare('SELECT COUNT(*) AS n FROM original_service_requests').get().n, 0);
    });
    const afterFixture = fixture(2);
    let afterArmed = false;
    const afterSeen = [];
    const afterHooks = {
      afterCommit(name) {
        afterSeen.push(name);
        if (afterArmed && name === 'retainOriginalRequest') {
          throw new Error('DECLARED_AFTER_COMMIT_FAULT');
        }
      },
    };
    withStore(afterFixture, createV2, store => {
      store.prepare(pair);
      q(afterArmed, false);
      afterArmed = true;
      throws(() => store.retainOriginalRequest(value),
        errorCode('COMMIT_OUTCOME_UNKNOWN'));
      throws(() => store.getOriginalRequest(requestKey(value)), errorCode('QUARANTINED'));
      throws(() => store.load(), errorCode('QUARANTINED'));
      afterArmed = false;
    }, { hooks: afterHooks });
    q(afterSeen.filter(name => name === 'retainOriginalRequest').length, 1);
    const expected = captureCustody(contractInput(value), declaredBinding());
    withStore(afterFixture, openV2, store => {
      assertOriginal(store.getOriginalRequest(requestKey(value)), value);
      same(store.getOriginalRequest(requestKey(value)), expected);
      assertFunding(store.load(), pair);
    });
    q(afterSeen.filter(name => name === 'retainOriginalRequest').length, 1);
  }],
  ['new custody inputs reject hostile and malformed data', () => {
    let touches = 0;
    const trap = () => { touches++; throw new Error('UNREACHED_NEW_INPUT_TRAP'); };
    const traps = {
      get: trap, ownKeys: trap, getPrototypeOf: trap,
      getOwnPropertyDescriptor: trap,
    };
    function accessor(value, field) {
      const changed = { ...value };
      Object.defineProperty(changed, field, { enumerable: true, get: trap });
      return changed;
    }
    const uncreated = fixture(2);
    const badPolicies = [
      new Proxy(policy(2), traps), accessor(policy(2), 'maxRequests'),
      { ...policy(2), extra: true }, { ...policy(2), [Symbol('extra')]: 1 },
      { policyVersion: 1, serviceResourceUrl: SERVICE },
      { ...policy(2), policyVersion: 2 },
      { ...policy(2), serviceResourceUrl:
        'https://other.example.test/service-credit/v1/execute' },
      { ...policy(2), maxRequests: 0 }, { ...policy(2), maxRequests: -0 },
      { ...policy(2), maxRequests: NaN }, { ...policy(2), maxRequests: Infinity },
      { ...policy(2), maxRequests: 1025 }, { ...policy(2), maxRequests: 1n },
      { ...policy(2), maxRequests: new Number(2) },
    ];
    for (const bad of badPolicies) {
      expectFactoryFailure(uncreated, bad);
      same(readdirSync(uncreated.root), []);
    }
    const f = fixture(2), value = original();
    let closedStore;
    withStore(f, createV2, store => {
      closedStore = store;
      store.prepare(declaredPair());
      for (const bad of [
        null, [], {}, new Proxy(requestKey(value), traps),
        accessor(requestKey(value), 'grantId'),
        { grantId: '', requestId: 'r' },
        { grantId: 'g', requestId: 'r', extra: 1 },
        { grantId: new String('g'), requestId: 'r' },
        { grantId: 'g', requestId: { [Symbol.toPrimitive]: trap } },
      ]) throws(() => store.getOriginalRequest(bad), errorCode('INVALID_INPUT'));
      throws(() => store.getOriginalRequest(), errorCode('INVALID_INPUT'));
      throws(() => store.getOriginalRequest(requestKey(value), undefined),
        errorCode('INVALID_INPUT'));
      throws(() => store.retainOriginalRequest(), errorCode('INVALID_INPUT'));
      throws(() => store.retainOriginalRequest(value, undefined),
        errorCode('INVALID_INPUT'));
      const malformed = [
        new Proxy(value, traps), accessor(value, 'originalRequestJson'),
        accessor(value, 'grantId'), { ...value, [Symbol('extra')]: 1 },
        { ...value, originalBodyBase64: 'AA==' },
        { ...value, originalBodyBase64: Buffer.alloc(0) },
        { ...value, originalRequestJson: 'x'.repeat(4097) },
        { ...value, originalRequestJson: '\u00e9'.repeat(2049) },
        { ...value, originalRequestJson: new String(value.originalRequestJson) },
        { ...value, originalRequestJson: { toJSON: trap, [Symbol.toPrimitive]: trap } },
        { ...value, serviceResourceUrl: { [Symbol.toPrimitive]: trap } },
        { ...value, serviceResourceUrl:
          'https://other.example.test/service-credit/v1/execute' },
        { ...value, serviceResourceUrl: SERVICE + '?redirect=other' },
        { ...value, grantId: 'different_grant' },
        { ...value, paymentHash: 'b'.repeat(64) },
        { ...value, network: 'zenon:other' },
        { ...value, fundingResourceUrl: FUNDING + '-other' },
        { ...value, authorization: 'DO_NOT_PERSIST' },
        { ...value, proof: 'DO_NOT_PERSIST' },
      ];
      for (const cost of ['0', '-0', '9007199254740992']) {
        malformed.push({
          ...value,
          originalRequestJson: value.originalRequestJson.replace(
            '"maxCostUnits":7', '"maxCostUnits":' + cost,
          ),
        });
      }
      malformed.push({
        ...value,
        originalRequestJson: JSON.stringify({
          ...JSON.parse(value.originalRequestJson), proof: 'DO_NOT_PERSIST',
        }),
      });
      for (const bad of malformed) {
        throws(() => store.retainOriginalRequest(bad), errorCode('INVALID_INPUT'));
      }
      q(store.getOriginalRequest(requestKey(value)), null);
      const retained = store.retainOriginalRequest(value);
      assertOriginal(retained, value);
      q(JSON.stringify(retained).includes('DO_NOT_PERSIST'), false);
      q(retained.paymentHash, PAYMENT_HASH);
      q(retained.network, NETWORK);
    });
    q(touches, 0);
    throws(() => closedStore.getOriginalRequest({ grantId: '', requestId: 'r' }),
      errorCode('INVALID_INPUT'));
    throws(() => closedStore.getOriginalRequest(requestKey(value)), errorCode('CLOSED'));
    withDatabase(f, db => {
      q(db.prepare('SELECT COUNT(*) AS n FROM original_service_requests').get().n, 1);
      q(db.prepare('SELECT envelope FROM original_service_requests').get()
        .envelope.includes('DO_NOT_PERSIST'), false);
    });
  }],
  ['full-row reopen rejects policy capacity orphan and schema drift', () => {
    const valid = fixture(4);
    const requests = [
      original('a:b', 'c'), original('a', 'b:c'),
      original('a:b', 'd'), original('z', 'c'),
    ];
    q(requests[0].grantId + ':' + requests[0].requestId,
      requests[1].grantId + ':' + requests[1].requestId);
    const saved = seed(valid, requests);
    withStore(valid, openV2, store => {
      for (let index = 0; index < requests.length; index++) {
        const record = store.getOriginalRequest(requestKey(requests[index]));
        same(record, saved.records[index]);
        ne(record, saved.records[index]);
        assertOriginal(record, requests[index]);
      }
      q(store.getOriginalRequest({ grantId: 'a', requestId: 'c' }), null);
      q(store.getOriginalRequest({ grantId: 'a:b', requestId: 'b:c' }), null);
      assertFunding(store.load(), saved.pair);
    });
    withDatabase(valid, db => {
      q(db.prepare('SELECT COUNT(*) AS n FROM original_service_requests').get().n, 4);
      const rows = db.prepare(
        'SELECT grant_id,request_id FROM original_service_requests ORDER BY grant_id,request_id',
      ).all();
      same(rows.map(row => [row.grant_id, row.request_id]), [
        ['a', 'b:c'], ['a:b', 'c'], ['a:b', 'd'], ['z', 'c'],
      ]);
    });
    withDatabase(valid, db => {
      db.prepare(
        'UPDATE original_service_requests SET envelope=? WHERE grant_id=? AND request_id=?',
      ).run('{}', 'z', 'c');
    }, { write: true });
    refuseUnchanged(valid, openV2, 'CORRUPT');
    const missingPolicy = fixture(2);
    seed(missingPolicy);
    withDatabase(missingPolicy, db => {
      db.exec('DELETE FROM original_request_custody_policy WHERE singleton=1');
    }, { write: true });
    refuseUnchanged(missingPolicy, openV2, 'SCHEMA_UNSUPPORTED');
    const overCapacity = fixture(2);
    seed(overCapacity, [original('g', 'one'), original('g', 'two')]);
    withDatabase(overCapacity, db => {
      db.exec('UPDATE original_request_custody_policy SET max_requests=1 WHERE singleton=1');
    }, { write: true });
    refuseUnchanged(overCapacity, openV2, 'CORRUPT', { policy: policy(1) });
    const orphan = fixture(2);
    seed(orphan);
    withDatabase(orphan, db => {
      db.exec('PRAGMA foreign_keys = OFF');
      q(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 0);
      db.exec('DELETE FROM payer_recovery_state WHERE singleton=1');
      q(db.prepare('SELECT COUNT(*) AS n FROM payer_recovery_state').get().n, 0);
      q(db.prepare('SELECT COUNT(*) AS n FROM original_service_requests').get().n, 1);
    }, { write: true, foreignKeys: false });
    refuseUnchanged(orphan, openV2, 'CORRUPT');
    const extraTable = fixture(2);
    seed(extraTable);
    withDatabase(extraTable, db => {
      db.exec('CREATE TABLE unexpected_metadata(value TEXT) STRICT');
    }, { write: true });
    refuseUnchanged(extraTable, openV2, 'SCHEMA_UNSUPPORTED');
  }],
];
q(scenarios.length, 8);
const [name, run] = scenarios[Number(selector) - 1];
test(name, { timeout: 5000 }, () => {
  const problems = [];
  try { run(); } catch (error) { problems.push(error); }
  try {
    q(activeHandles.size, 0);
    ok(fixtureCount <= MAX_FIXTURES);
  } catch (error) { problems.push(error); }
  if (problems.length === 1) throw problems[0];
  if (problems.length > 1) {
    throw new AggregateError(problems, 'SCENARIO_AND_RESOURCE_CHECK_FAILED');
  }
});
