import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';

import {
  createZenonFundingObserverSqliteStore,
  openZenonFundingObserverSqliteStore,
  ZenonFundingObserverSqliteStore,
} from '../src/service-credit-zenon-funding-observer-sqlite-store.js';
import {
  createZenonFundingObserverState,
  ZENON_FUNDING_OBSERVER_STATUS,
} from '../src/service-credit-zenon-funding-observer-state.js';
import {
  createZenonFundingProviderAttestationSigningBytes,
  parseZenonFundingProviderAttestationAuthorityRecord,
} from '../src/service-credit-zenon-funding-provider-attestation.js';
import {
  createZenonFundingProviderSigningChildResponse,
  frameZenonFundingProviderSigningChildResponse,
  parseZenonFundingProviderSigningChildRequestFrame,
} from '../src/service-credit-zenon-provider-signing-child-protocol.js';
import {
  createZenonFundingProviderSigningOperation,
} from '../src/service-credit-zenon-provider-signing-operation.js';

const NOW = 2_000_000_000;
const INITIAL_HEIGHT = 10;
const INITIAL_HASH = 'a'.repeat(64);
const TRANSACTION_HASH = 'c'.repeat(64);
let dynamicImportSequence = 0;

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function authorityFixture(overrides = {}) {
  const keys = generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' })
    .subarray(-32).toString('base64url');
  const text = canonicalJson({
    authorityRecordVersion: 1,
    authorityProfileId: 'zenon.provider-attestation',
    authorityProfileVersion: 1,
    verifierVersion: 1,
    providerAuthorityId: 'provider.reference',
    generationId: 'provider.attestation.generation',
    generationVersion: 1,
    keyId: 'provider.attestation.key',
    algorithm: 'Ed25519',
    publicKey,
    network: 'zenon:testnet',
    chainProfile: {
      version: 1,
      chainIdentifier: '12345',
      genesisMomentumHash: '1'.repeat(64),
    },
    observerPolicy: {
      policyId: 'zenon.injected-observer',
      policyVersion: 1,
      verifierVersion: 1,
    },
    confirmationPolicy: {
      policyId: 'zenon.authenticated-momentum-inclusion',
      policyVersion: 1,
      minimumConfirmations: 3,
    },
    bootstrapCheckpoint: { height: INITIAL_HEIGHT, hash: INITIAL_HASH },
    sourcePolicyCommitment: digest('8'),
    maximumAttestationBytes: 4096,
    maximumCanonicalBytes: 524288,
    maximumInitialAgeSeconds: 300,
    maximumFutureSkewSeconds: 5,
    maximumValiditySeconds: 300,
    ...overrides,
  });
  return {
    authority: parseZenonFundingProviderAttestationAuthorityRecord(text),
    keys,
    text,
  };
}

function target() {
  return {
    transactionId: `zenontx:${TRANSACTION_HASH}`,
    payer: 'z1syntheticpayer',
    payee: 'z1syntheticpayee',
    asset: 'zts1syntheticasset',
    amount: '7',
    scheme: 'exact',
    paymentFlow: 'upfront',
    settlement: 'account-block',
    network: 'zenon:testnet',
    providerId: 'provider.reference',
    serviceId: 'service.reference',
    resourceId: 'resource.zenon.funding',
    resourceBinding: digest('1'),
    paymentResourceDigest: digest('2'),
    paymentRequirementDigest: digest('3'),
    paymentIntentDigest: digest('4'),
    offerId: 'offer.zenon.reference',
    offerVersion: 1,
    fundingPolicyId: 'funding.exact.zenon.observer',
    fundingPolicyVersion: 1,
    capabilityCommitment: digest('5'),
    totalUnits: 10,
    expiresAt: 2_000_010_000_000,
    grantFundingCommitment: digest('6'),
  };
}

function initialState(authority) {
  return createZenonFundingObserverState({
    observerPolicy: structuredClone(authority.observerPolicy),
    authorityGeneration: structuredClone(authority.authorityGeneration),
    chainProfile: structuredClone(authority.chainProfile),
    confirmationPolicy: structuredClone(authority.confirmationPolicy),
    target: target(),
    checkpoint: structuredClone(authority.bootstrapCheckpoint),
    catchUp: {
      maximumPageEntries: 4,
      maximumBackfillSpan: 8,
      maximumMembersPerMomentum: 4,
    },
  });
}

function momentumHash(height) {
  return createHash('sha256').update(`signing-operation-momentum-${height}`).digest('hex');
}

function momentumsFor(planned, state, memberHeight = null) {
  let previousHash = planned.plan.startCheckpoint.hash;
  const momentums = [];
  for (let height = planned.plan.fromHeight; height <= planned.plan.throughHeight; height += 1) {
    const hash = momentumHash(height);
    momentums.push({
      height,
      hash,
      previousHash,
      members: height === memberHeight
        ? [{
          transactionId: state.target.transactionId,
          targetBindingDigest: state.targetBindingDigest,
        }]
        : [],
    });
    previousHash = hash;
  }
  return momentums;
}

function foundObservation(state) {
  const receipt = state.catchUp.lastAppliedPage;
  return {
    status: 'FOUND',
    transactionId: state.target.transactionId,
    targetBindingDigest: state.targetBindingDigest,
    momentumHeight: receipt.targetMembership.momentumHeight,
    momentumHash: receipt.targetMembership.momentumHash,
    pageDigest: receipt.pageDigest,
  };
}

function reachThreshold(store) {
  const before = store.load().state;
  const planned = store.planBackfill({
    expectedRevision: before.revision,
    frontier: {
      height: INITIAL_HEIGHT + 3,
      hash: momentumHash(INITIAL_HEIGHT + 3),
    },
  });
  const advanced = store.applyPage({
    expectedRevision: before.revision,
    plan: planned.plan,
    momentums: momentumsFor(planned, before, INITIAL_HEIGHT + 1),
  });
  const threshold = store.applyInclusion({
    expectedRevision: advanced.state.revision,
    target: structuredClone(advanced.state.target),
    observation: foundObservation(advanced.state),
  });
  assert.equal(threshold.state.status, ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED);
  return threshold;
}

function advanceObserver(store) {
  const current = store.load().state;
  const height = current.checkpoint.height + 1;
  const planned = store.planBackfill({
    expectedRevision: current.revision,
    frontier: { height, hash: momentumHash(height) },
  });
  return store.applyPage({
    expectedRevision: current.revision,
    plan: planned.plan,
    momentums: momentumsFor(planned, current),
  });
}

function invalidateObserver(store) {
  const current = store.load().state;
  return store.planBackfill({
    expectedRevision: current.revision,
    frontier: { height: current.checkpoint.height, hash: 'f'.repeat(64) },
  });
}

function privateDirectoryFor(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'zenon-signing-operation-')));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function storeFixture(t, {
  prepared = true,
  testHooks = undefined,
  authorityOverrides = {},
} = {}) {
  const directory = privateDirectoryFor(t);
  const fixture = authorityFixture(authorityOverrides);
  const configuration = {
    databasePath: join(directory, 'observer.sqlite'),
    allowedRoot: directory,
    initialState: initialState(fixture.authority),
    authorityRecord: fixture.text,
    ...(testHooks === undefined ? {} : { testHooks }),
  };
  const store = createZenonFundingObserverSqliteStore(configuration);
  const threshold = prepared ? reachThreshold(store) : null;
  return { ...fixture, configuration, directory, store, threshold };
}

function openOptions(fixture, testHooks = undefined) {
  return {
    databasePath: fixture.configuration.databasePath,
    allowedRoot: fixture.configuration.allowedRoot,
    expectedRecordKey: fixture.recordKey,
    authorityRecord: fixture.text,
    ...(testHooks === undefined ? {} : { testHooks }),
  };
}

function signedEnvelope(fixture, request, offset = 0) {
  const issuedAt = NOW + offset;
  const validUntil = issuedAt + 120;
  return {
    envelopeVersion: 1,
    attestationId: request.attestationId,
    keyId: fixture.authority.keyId,
    issuedAt,
    validUntil,
    signature: sign(
      null,
      createZenonFundingProviderAttestationSigningBytes({ request, issuedAt, validUntil }),
      fixture.keys.privateKey,
    ).toString('base64url'),
  };
}

function executableDigest(path) {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function comparedDirectoryIdentity(path) {
  const stat = lstatSync(path, { bigint: true });
  return {
    canonicalPath: realpathSync(path),
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    uid: stat.uid,
    gid: stat.gid,
  };
}

function comparedExecutableIdentity(path) {
  const stat = lstatSync(path, { bigint: true });
  return {
    canonicalPath: realpathSync(path),
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    uid: stat.uid,
    gid: stat.gid,
    nlink: stat.nlink,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
    digest: executableDigest(path),
  };
}

function executableFixture(t, directory, source = '#!/bin/sh\nexit 0\n') {
  const path = join(directory, `attestor-${Math.random().toString(16).slice(2)}`);
  writeFileSync(path, source, { mode: 0o700 });
  chmodSync(path, 0o700);
  return {
    executablePath: realpathSync(path),
    executableDigest: executableDigest(path),
    protocolVersion: 1,
  };
}

function realDeadlineRuntime() {
  return {
    schedule(callback, delayMs) { return setTimeout(callback, delayMs); },
    cancel(handle) { clearTimeout(handle); },
  };
}

function operationOptions(fixture, signerExecutable, overrides = {}) {
  return {
    fundingObserverStore: fixture.store,
    authorityRecord: fixture.text,
    signerExecutable,
    now: () => NOW,
    deadlineRuntime: realDeadlineRuntime(),
    timeoutMs: 1_000,
    maximumResponseBytes: 16 * 1024,
    ...overrides,
  };
}

function responseFor(fixture, wire, status, offset = 0) {
  return createZenonFundingProviderSigningChildResponse({
    protocolVersion: 1,
    messageType: 'zenon-funding-provider-signing-response',
    operationId: wire.operationId,
    status,
    reasonCode: status === 'APPROVAL_REQUIRED'
      ? 'OPERATOR_APPROVAL_REQUIRED'
      : status === 'REJECTED' ? 'POLICY_REJECTED' : null,
    envelope: status === 'READY'
      ? signedEnvelope(fixture, wire.attestationRequest, offset)
      : null,
  });
}

function fakeSpawn(handler, observations = {}) {
  return (path, args, options) => {
    observations.calls = (observations.calls ?? 0) + 1;
    observations.path = path;
    observations.args = args;
    observations.options = options;
    const child = new EventEmitter();
    const request = new PassThrough();
    const response = new PassThrough();
    child.stdio = [null, null, null, request, response];
    child.kill = signal => {
      queueMicrotask(() => child.emit('close', null, signal));
      return true;
    };
    const chunks = [];
    request.on('data', chunk => chunks.push(Buffer.from(chunk)));
    request.once('finish', () => {
      const frame = Buffer.concat(chunks);
      try {
        handler({ child, frame, response });
      } catch {
        child.emit('error', new Error('synthetic child failure'));
      }
    });
    return child;
  };
}

async function operationFactoryWithSpawn(t, spawnImplementation) {
  const restore = t.mock.method(childProcess, 'spawn', spawnImplementation);
  let module;
  try {
    dynamicImportSequence += 1;
    module = await import(
      `../src/service-credit-zenon-provider-signing-operation.js?test=${dynamicImportSequence}`
    );
  } finally {
    restore.mock.restore();
  }
  return module.createZenonFundingProviderSigningOperation;
}

function readyHandler(fixture, observations = {}, options = {}) {
  return ({ child, frame, response }) => {
    const wire = parseZenonFundingProviderSigningChildRequestFrame(
      frame,
      fixture.authority,
    );
    observations.operationId = wire.operationId;
    observations.request = wire;
    if (options.beforeResponse) options.beforeResponse(wire);
    const responseValue = responseFor(
      fixture,
      wire,
      options.status ?? 'READY',
      options.offset ?? 0,
    );
    observations.response = responseValue;
    const responseFrame = options.rawResponse
      ?? frameZenonFundingProviderSigningChildResponse(responseValue);
    const split = Math.max(1, Math.floor(responseFrame.length / 3));
    response.write(responseFrame.subarray(0, split));
    response.write(responseFrame.subarray(split, split * 2));
    response.end(responseFrame.subarray(split * 2));
    queueMicrotask(() => child.emit('close', options.exitCode ?? 0, null));
  };
}

function expectOperationCode(promise, code) {
  return assert.rejects(
    promise,
    error => error?.code === code && error?.message === code
      && !JSON.stringify(error).includes('sha256:'),
  );
}

test('signing operation imports only inert local contracts and required built-ins', () => {
  const source = readFileSync(
    new URL('../src/service-credit-zenon-provider-signing-operation.js', import.meta.url),
    'utf8',
  );
  const imports = [...source.matchAll(/from '([^']+)'/g)]
    .map(match => match[1])
    .sort();
  assert.deepEqual(imports, [
    './service-credit-zenon-funding-observer-sqlite-store.js',
    './service-credit-zenon-funding-observer-state.js',
    './service-credit-zenon-funding-provider-attestation.js',
    './service-credit-zenon-provider-signing-child-protocol.js',
    'node:child_process',
    'node:crypto',
    'node:events',
    'node:fs',
    'node:path',
    'node:stream',
    'node:util',
  ]);
  assert.doesNotMatch(
    source,
    /createPrivateKey|generateKeyPair|\bsign\s*\(|WebSocket|fetch\(|node:(?:net|http|https|tls)|process\.env/u,
  );
  assert.match(source, /process\.geteuid/u);
  assert.doesNotMatch(source, /process\.getuid/u);
  assert.doesNotMatch(source, /Array\.prototype\.push|ARRAY_PUSH|\.push\(/u);
  assert.match(source, /Object\.defineProperty/u);
});

test('construction is inert, exact, and rejects prototype-only or hostile stores', t => {
  const fixture = storeFixture(t, { prepared: false });
  const executable = executableFixture(t, fixture.directory);
  const owner = createZenonFundingProviderSigningOperation(
    operationOptions(fixture, executable),
  );
  assert.deepEqual(Object.keys(owner).sort(), ['close', 'start']);
  assert.equal(fixture.store.load().outbox.status, 'NONE');
  for (const store of [
    Object.create(ZenonFundingObserverSqliteStore.prototype),
    new Proxy(fixture.store, {}),
    { load() {}, peekPreparedAttestation() {}, commitAuthenticatedEnvelope() {} },
  ]) {
    assert.throws(
      () => createZenonFundingProviderSigningOperation({
        ...operationOptions(fixture, executable),
        fundingObserverStore: store,
      }),
      error => error?.code === 'ZENON_FUNDING_PROVIDER_SIGNING_INVALID_CONFIGURATION',
    );
  }
  fixture.store.close();
});

test('a real non-signing child exchanges only over dedicated descriptors', async t => {
  const fixture = storeFixture(t);
  const source = `#!${process.execPath}\n`
    + "import fs from 'node:fs';\n"
    + "const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;\n"
    + "const input=fs.readFileSync(3);const n=input.readUInt32BE(0);const request=JSON.parse(input.subarray(4,4+n).toString('utf8'));\n"
    + "const safe=process.argv.length===1||process.argv.length===2;\n"
    + "const response={protocolVersion:1,messageType:'zenon-funding-provider-signing-response',operationId:request.operationId,status:safe?'APPROVAL_REQUIRED':'REJECTED',reasonCode:safe?'OPERATOR_APPROVAL_REQUIRED':'POLICY_REJECTED',envelope:null};\n"
    + "const payload=Buffer.from(canonical(response));const prefix=Buffer.alloc(4);prefix.writeUInt32BE(payload.length);fs.writeSync(4,Buffer.concat([prefix,payload]));\n";
  const executable = executableFixture(t, fixture.directory, source);
  const owner = createZenonFundingProviderSigningOperation(
    operationOptions(fixture, executable),
  );
  const first = owner.start();
  assert.strictEqual(owner.start(), first);
  assert.deepEqual(await first, { status: 'APPROVAL_REQUIRED' });
  assert.deepEqual(await owner.close(), { status: 'APPROVAL_REQUIRED' });
  assert.equal(fixture.store.load().outbox.status, 'PREPARED');
  fixture.store.close();
});

test('fragmented READY imports exactly once and repeated start never respawns', async t => {
  const fixture = storeFixture(t);
  const executable = executableFixture(t, fixture.directory);
  const observations = {};
  const factory = await operationFactoryWithSpawn(
    t,
    fakeSpawn(readyHandler(fixture, observations), observations),
  );
  const owner = factory(operationOptions(fixture, executable));
  const first = owner.start();
  assert.strictEqual(owner.start(), first);
  assert.deepEqual(await first, { status: 'READY_COMMITTED' });
  assert.strictEqual(owner.start(), first);
  assert.equal(observations.calls, 1);
  assert.deepEqual(observations.args, []);
  assert.equal(Reflect.ownKeys(observations.options.env).length, 0);
  assert.deepEqual(observations.options.stdio, [
    'ignore', 'ignore', 'ignore', 'pipe', 'pipe',
  ]);
  assert.equal(observations.options.shell, false);
  assert.equal(observations.options.detached, false);
  assert.equal(fixture.store.load().outbox.status, 'READY');
  assert.deepEqual(await owner.close(), { status: 'CLOSED' });
  fixture.store.close();
});

test('NONE, READY, INVALIDATED, and EQUIVOCATED reject before spawn', async t => {
  for (const mode of ['NONE', 'READY', 'INVALIDATED', 'EQUIVOCATED']) {
    await t.test(mode, async t => {
      const fixture = storeFixture(t, { prepared: mode !== 'NONE' });
      if (mode === 'READY' || mode === 'EQUIVOCATED') {
        const request = fixture.store.peekPreparedAttestation();
        fixture.store.commitAuthenticatedEnvelope({
          expectedObserverRevision: fixture.store.load().state.revision,
          expectedOutboxRevision: 1,
          attestationId: request.attestationId,
          envelope: signedEnvelope(fixture, request),
          nowEpochSeconds: NOW,
        });
        if (mode === 'EQUIVOCATED') {
          fixture.store.commitAuthenticatedEnvelope({
            expectedObserverRevision: fixture.store.load().state.revision,
            expectedOutboxRevision: 2,
            attestationId: request.attestationId,
            envelope: signedEnvelope(fixture, request, 1),
            nowEpochSeconds: NOW + 1,
          });
        }
      } else if (mode === 'INVALIDATED') {
        const current = fixture.store.load().state;
        fixture.store.planBackfill({
          expectedRevision: current.revision,
          frontier: { height: current.checkpoint.height, hash: 'f'.repeat(64) },
        });
      }
      const executable = executableFixture(t, fixture.directory);
      const observations = {};
      const factory = await operationFactoryWithSpawn(
        t,
        fakeSpawn(() => {}, observations),
      );
      const owner = factory(operationOptions(fixture, executable));
      await expectOperationCode(
        owner.start(),
        'ZENON_FUNDING_PROVIDER_SIGNING_ATTESTATION_UNAVAILABLE',
      );
      assert.equal(observations.calls ?? 0, 0);
      await owner.close();
      fixture.store.close();
    });
  }
});

test('stable operation identity survives store reopen and owner reconstruction', async t => {
  const fixture = storeFixture(t);
  const executable = executableFixture(t, fixture.directory);
  const firstObserved = {};
  let factory = await operationFactoryWithSpawn(
    t,
    fakeSpawn(readyHandler(fixture, firstObserved, { status: 'APPROVAL_REQUIRED' })),
  );
  let owner = factory(operationOptions(fixture, executable));
  assert.deepEqual(await owner.start(), { status: 'APPROVAL_REQUIRED' });
  await owner.close();
  fixture.recordKey = fixture.store.load().recordKey;
  fixture.store.close();
  fixture.store = openZenonFundingObserverSqliteStore(openOptions(fixture));
  const secondObserved = {};
  factory = await operationFactoryWithSpawn(
    t,
    fakeSpawn(readyHandler(fixture, secondObserved), secondObserved),
  );
  owner = factory(operationOptions(fixture, executable));
  assert.deepEqual(await owner.start(), { status: 'READY_COMMITTED' });
  assert.equal(secondObserved.operationId, firstObserved.operationId);
  assert.equal(canonicalJson(secondObserved.request), canonicalJson(firstObserved.request));
  assert.equal(fixture.store.load().outbox.status, 'READY');
  await owner.close();
  fixture.store.close();
});

test('unsafe executables fail before spawn and post-dispatch replacement is unknown', async t => {
  const fixture = storeFixture(t);
  const executable = executableFixture(t, fixture.directory);
  const observations = {};
  let factory = await operationFactoryWithSpawn(t, fakeSpawn(() => {}, observations));
  let owner;
  await t.test('digest mismatch', async () => {
    owner = factory(operationOptions(fixture, {
      ...executable,
      executableDigest: digest('f'),
    }));
    await expectOperationCode(
      owner.start(),
      'ZENON_FUNDING_PROVIDER_SIGNING_UNSAFE_EXECUTABLE',
    );
  });
  assert.equal(observations.calls ?? 0, 0);

  await t.test('unsafe mode', async () => {
    chmodSync(executable.executablePath, 0o777);
    const unsafe = factory(operationOptions(fixture, {
      ...executable,
      executableDigest: executableDigest(executable.executablePath),
    }));
    await expectOperationCode(
      unsafe.start(),
      'ZENON_FUNDING_PROVIDER_SIGNING_UNSAFE_EXECUTABLE',
    );
    chmodSync(executable.executablePath, 0o700);
  });

  await t.test('symlink', async () => {
    const link = join(fixture.directory, 'attestor-link');
    symlinkSync(executable.executablePath, link);
    owner = factory(operationOptions(fixture, {
      ...executable,
      executablePath: link,
    }));
    await expectOperationCode(
      owner.start(),
      'ZENON_FUNDING_PROVIDER_SIGNING_UNSAFE_EXECUTABLE',
    );
  });

  await t.test('safe leaf below an unsafe ancestor', async () => {
    const unsafeDirectory = join(fixture.directory, 'unsafe-ancestor');
    const leafDirectory = join(unsafeDirectory, 'safe-leaf');
    mkdirSync(unsafeDirectory, { mode: 0o700 });
    mkdirSync(leafDirectory, { mode: 0o700 });
    chmodSync(unsafeDirectory, 0o777);
    const nested = executableFixture(t, leafDirectory);
    const unsafe = factory(operationOptions(fixture, nested));
    await expectOperationCode(
      unsafe.start(),
      'ZENON_FUNDING_PROVIDER_SIGNING_UNSAFE_EXECUTABLE',
    );
    chmodSync(unsafeDirectory, 0o700);
  });

  await t.test('symlinked ancestor', async () => {
    const actualDirectory = join(fixture.directory, 'actual-ancestor');
    const linkedDirectory = join(fixture.directory, 'linked-ancestor');
    mkdirSync(actualDirectory, { mode: 0o700 });
    symlinkSync(actualDirectory, linkedDirectory);
    const nested = executableFixture(t, actualDirectory);
    const throughLink = {
      ...nested,
      executablePath: join(linkedDirectory, basename(nested.executablePath)),
    };
    const unsafe = factory(operationOptions(fixture, throughLink));
    await expectOperationCode(
      unsafe.start(),
      'ZENON_FUNDING_PROVIDER_SIGNING_UNSAFE_EXECUTABLE',
    );
  });

  await t.test('a root-owned sticky temporary ancestor is allowed where portable', async t => {
    let stickyRoot;
    let stickyStat;
    try {
      stickyRoot = realpathSync('/tmp');
      stickyStat = lstatSync(stickyRoot);
    } catch {
      t.skip('no portable root-owned sticky temporary directory');
      return;
    }
    if (
      stickyStat.uid !== 0
      || (stickyStat.mode & 0o1000) === 0
      || (stickyStat.mode & 0o002) === 0
    ) {
      t.skip('no portable root-owned sticky temporary directory');
      return;
    }
    const stickyDirectory = realpathSync(mkdtempSync(join(stickyRoot, 'zenon-signing-sticky-')));
    chmodSync(stickyDirectory, 0o700);
    t.after(() => rmSync(stickyDirectory, { recursive: true, force: true }));
    const nested = executableFixture(t, stickyDirectory);
    const stickyObserved = {};
    const stickyFactory = await operationFactoryWithSpawn(
      t,
      fakeSpawn(
        readyHandler(fixture, stickyObserved, { status: 'APPROVAL_REQUIRED' }),
        stickyObserved,
      ),
    );
    const accepted = stickyFactory(operationOptions(fixture, nested));
    assert.deepEqual(await accepted.start(), { status: 'APPROVAL_REQUIRED' });
    assert.equal(stickyObserved.calls, 1);
    assert.deepEqual(await accepted.close(), { status: 'APPROVAL_REQUIRED' });
  });

  await t.test('ancestor identity drift before request dispatch is definite', async () => {
    const stableDirectory = join(fixture.directory, 'stable-ancestor');
    mkdirSync(stableDirectory, { mode: 0o700 });
    const nested = executableFixture(t, stableDirectory);
    const driftObservations = {};
    const childSpawn = fakeSpawn(() => {}, driftObservations);
    factory = await operationFactoryWithSpawn(t, (...args) => {
      const child = childSpawn(...args);
      const before = lstatSync(stableDirectory);
      chmodSync(stableDirectory, 0o755);
      driftObservations.modeBefore = before.mode;
      driftObservations.modeAfter = lstatSync(stableDirectory).mode;
      queueMicrotask(() => child.emit('error', new Error('not exposed')));
      return child;
    });
    const uncertain = factory(operationOptions(fixture, nested));
    await expectOperationCode(
      uncertain.start(),
      'ZENON_FUNDING_PROVIDER_SIGNING_UNSAFE_EXECUTABLE',
    );
    assert.notEqual(driftObservations.modeAfter, driftObservations.modeBefore);
    assert.deepEqual(await uncertain.close(), { status: 'CLOSED' });
    chmodSync(stableDirectory, 0o700);
  });

  await t.test('ancestor replacement before request dispatch is definite', async t => {
    const outerDirectory = join(fixture.directory, 'replaceable-outer');
    const displacedDirectory = join(fixture.directory, 'displaced-outer');
    const innerDirectory = join(outerDirectory, 'intact-inner');
    mkdirSync(outerDirectory, { mode: 0o700 });
    mkdirSync(innerDirectory, { mode: 0o700 });
    t.after(() => {
      rmSync(outerDirectory, { recursive: true, force: true });
      rmSync(displacedDirectory, { recursive: true, force: true });
    });
    const nested = executableFixture(t, innerDirectory);
    const replacementObservations = {};
    const respond = readyHandler(fixture, replacementObservations, {
      status: 'APPROVAL_REQUIRED',
    });
    const childSpawn = fakeSpawn(payload => {
      replacementObservations.dispatched = true;
      respond(payload);
    }, replacementObservations);
    factory = await operationFactoryWithSpawn(t, (...args) => {
      const child = childSpawn(...args);
      replacementObservations.outerBefore = comparedDirectoryIdentity(
        outerDirectory,
      );
      replacementObservations.innerBefore = comparedDirectoryIdentity(
        innerDirectory,
      );
      replacementObservations.executableBefore = comparedExecutableIdentity(
        nested.executablePath,
      );
      const outerLinkCountBefore = lstatSync(outerDirectory).nlink;
      const innerLinkCountBefore = lstatSync(innerDirectory).nlink;
      renameSync(outerDirectory, displacedDirectory);
      mkdirSync(outerDirectory, { mode: 0o700 });
      renameSync(
        join(displacedDirectory, basename(innerDirectory)),
        innerDirectory,
      );
      replacementObservations.outerAfter = comparedDirectoryIdentity(
        outerDirectory,
      );
      replacementObservations.innerAfter = comparedDirectoryIdentity(
        innerDirectory,
      );
      replacementObservations.executableAfter = comparedExecutableIdentity(
        nested.executablePath,
      );
      replacementObservations.outerLinkCountBefore = outerLinkCountBefore;
      replacementObservations.outerLinkCountAfter = lstatSync(outerDirectory).nlink;
      replacementObservations.innerLinkCountBefore = innerLinkCountBefore;
      replacementObservations.innerLinkCountAfter = lstatSync(innerDirectory).nlink;
      return child;
    });
    const unsafe = factory(operationOptions(fixture, nested));
    await expectOperationCode(
      unsafe.start(),
      'ZENON_FUNDING_PROVIDER_SIGNING_UNSAFE_EXECUTABLE',
    );
    assert.equal(replacementObservations.calls, 1);
    assert.equal(replacementObservations.dispatched ?? false, false);
    assert.equal(
      replacementObservations.outerBefore.dev
        === replacementObservations.outerAfter.dev
        && replacementObservations.outerBefore.ino
          === replacementObservations.outerAfter.ino,
      false,
    );
    assert.equal(
      replacementObservations.outerAfter.canonicalPath,
      replacementObservations.outerBefore.canonicalPath,
    );
    assert.equal(
      replacementObservations.outerAfter.mode,
      replacementObservations.outerBefore.mode,
    );
    assert.equal(
      replacementObservations.outerAfter.uid,
      replacementObservations.outerBefore.uid,
    );
    assert.equal(
      replacementObservations.outerAfter.gid,
      replacementObservations.outerBefore.gid,
    );
    assert.equal(
      replacementObservations.outerLinkCountAfter,
      replacementObservations.outerLinkCountBefore,
    );
    assert.equal(
      replacementObservations.innerLinkCountAfter,
      replacementObservations.innerLinkCountBefore,
    );
    assert.deepEqual(
      replacementObservations.innerAfter,
      replacementObservations.innerBefore,
    );
    assert.deepEqual(
      replacementObservations.executableAfter,
      replacementObservations.executableBefore,
    );
    assert.deepEqual(await unsafe.close(), { status: 'CLOSED' });
  });

  await t.test('post-dispatch replacement', async () => {
    const replaced = executableFixture(t, fixture.directory);
    const post = {};
    factory = await operationFactoryWithSpawn(
      t,
      fakeSpawn(readyHandler(fixture, post, {
        beforeResponse() {
          writeFileSync(replaced.executablePath, '#!/bin/sh\nexit 1\n');
          chmodSync(replaced.executablePath, 0o700);
        },
      }), post),
    );
    owner = factory(operationOptions(fixture, replaced));
    assert.deepEqual(await owner.start(), { status: 'SIGNER_OUTCOME_UNKNOWN' });
    assert.deepEqual(await owner.close(), { status: 'SIGNER_OUTCOME_UNKNOWN' });
  });
  fixture.store.close();
});

test('executable ownership follows the effective rather than real user where portable', async t => {
  if (
    typeof process.getuid !== 'function'
    || typeof process.geteuid !== 'function'
    || process.getuid() === 0
  ) {
    t.skip('effective-user mismatch probe is unavailable on this runtime');
    return;
  }
  const fixture = storeFixture(t);
  const executable = executableFixture(t, fixture.directory);
  const observations = {};
  const alternateEffectiveUid = process.getuid() === 1 ? 2 : 1;
  const restoreSpawn = t.mock.method(childProcess, 'spawn', fakeSpawn(() => {}, observations));
  const restoreEffectiveUid = t.mock.method(process, 'geteuid', () => alternateEffectiveUid);
  let module;
  try {
    dynamicImportSequence += 1;
    module = await import(
      `../src/service-credit-zenon-provider-signing-operation.js?test=${dynamicImportSequence}`
    );
  } finally {
    restoreEffectiveUid.mock.restore();
    restoreSpawn.mock.restore();
  }
  const owner = module.createZenonFundingProviderSigningOperation(
    operationOptions(fixture, executable),
  );
  await expectOperationCode(
    owner.start(),
    'ZENON_FUNDING_PROVIDER_SIGNING_UNSAFE_EXECUTABLE',
  );
  assert.equal(observations.calls ?? 0, 0);
  assert.deepEqual(await owner.close(), { status: 'CLOSED' });
  fixture.store.close();
});

test('construction fails closed when effective-user identity is unavailable where mockable', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'geteuid');
  if (descriptor === undefined || !descriptor.configurable) {
    t.skip('effective-user capture cannot be isolated on this runtime');
    return;
  }
  const fixture = storeFixture(t);
  const executable = executableFixture(t, fixture.directory);
  let module;
  try {
    Object.defineProperty(process, 'geteuid', {
      configurable: true,
      enumerable: descriptor.enumerable,
      value: undefined,
      writable: true,
    });
    dynamicImportSequence += 1;
    module = await import(
      `../src/service-credit-zenon-provider-signing-operation.js?test=${dynamicImportSequence}`
    );
  } finally {
    Object.defineProperty(process, 'geteuid', descriptor);
  }
  assert.throws(
    () => module.createZenonFundingProviderSigningOperation(
      operationOptions(fixture, executable),
    ),
    error => error?.code === 'ZENON_FUNDING_PROVIDER_SIGNING_INVALID_CONFIGURATION',
  );
  fixture.store.close();
});

test('every uncertain child outcome is terminal without replacement', async t => {
  for (const mode of [
    'timeout',
    'crash',
    'missing',
    'truncated',
    'multiple',
    'oversized',
    'malformed',
    'bad-signature',
  ]) {
    await t.test(mode, async t => {
      const fixture = storeFixture(t);
      const executable = executableFixture(t, fixture.directory);
      const observations = {};
      const handler = mode === 'timeout'
        ? () => {}
        : mode === 'crash'
          ? ({ child, response }) => { response.end(); child.emit('close', 1, null); }
          : mode === 'missing'
            ? ({ child, response }) => { response.end(); child.emit('close', 0, null); }
            : mode === 'truncated'
              ? ({ child, response }) => {
                response.end(Buffer.from([0, 0, 0, 2, 0]));
                child.emit('close', 0, null);
              }
              : mode === 'multiple'
                ? ({ child, frame, response }) => {
                  const wire = parseZenonFundingProviderSigningChildRequestFrame(
                    frame,
                    fixture.authority,
                  );
                  const framed = frameZenonFundingProviderSigningChildResponse(
                    responseFor(fixture, wire, 'APPROVAL_REQUIRED'),
                  );
                  response.end(Buffer.concat([framed, framed]));
                  child.emit('close', 0, null);
                }
                : mode === 'oversized'
                  ? ({ child, response }) => {
                    response.end(Buffer.alloc(16 * 1024 + 5));
                    child.emit('close', 0, null);
                  }
          : mode === 'malformed'
            ? ({ child, response }) => {
              response.end(Buffer.from([0, 0, 0, 1, 0]));
              child.emit('close', 0, null);
            }
            : ({ child, frame, response }) => {
              const wire = parseZenonFundingProviderSigningChildRequestFrame(
                frame,
                fixture.authority,
              );
              const valid = responseFor(fixture, wire, 'READY');
              const signature = Buffer.from(valid.envelope.signature, 'base64url');
              signature[0] ^= 1;
              const invalid = createZenonFundingProviderSigningChildResponse({
                ...valid,
                envelope: {
                  ...valid.envelope,
                  signature: signature.toString('base64url'),
                },
              });
              response.end(frameZenonFundingProviderSigningChildResponse(invalid));
              child.emit('close', 0, null);
              observations.badSignatureResponseCompleted = true;
            };
      const factory = await operationFactoryWithSpawn(t, fakeSpawn(handler, observations));
      const owner = factory(operationOptions(fixture, executable, {
        timeoutMs: mode === 'timeout' ? 10 : 1_000,
      }));
      const preparedRequest = mode === 'bad-signature'
        ? fixture.store.peekPreparedAttestation()
        : null;
      const started = owner.start();
      assert.deepEqual(await started, { status: 'SIGNER_OUTCOME_UNKNOWN' });
      assert.deepEqual(await owner.close(), { status: 'SIGNER_OUTCOME_UNKNOWN' });
      assert.equal(fixture.store.load().outbox.status, 'PREPARED');
      if (mode === 'bad-signature') {
        assert.equal(observations.badSignatureResponseCompleted, true);
        assert.strictEqual(owner.start(), started);
        assert.equal(observations.calls, 1);
        assert.deepEqual(fixture.store.peekPreparedAttestation(), preparedRequest);
        assert.equal(fixture.store.projectCommittedFundingEvidence(), null);
      }
      fixture.store.close();
    });
  }
});

test('request and child channel failures are armed before dispatch and remain contained', async t => {
  for (const timing of ['synchronous write error', 'asynchronous partial write error']) {
    await t.test(timing, async t => {
      const fixture = storeFixture(t);
      const executable = executableFixture(t, fixture.directory);
      const observations = {};
      const factory = await operationFactoryWithSpawn(t, () => {
        observations.calls = (observations.calls ?? 0) + 1;
        const child = new EventEmitter();
        const request = new Writable({
          write(_chunk, _encoding, callback) {
            if (timing === 'synchronous write error') callback(new Error('not exposed'));
            else queueMicrotask(() => callback(new Error('not exposed')));
          },
        });
        const response = new PassThrough();
        child.stdio = [null, null, null, request, response];
        child.kill = () => true;
        observations.child = child;
        observations.request = request;
        observations.responsePipe = response;
        return child;
      });
      const owner = factory(operationOptions(fixture, executable));
      assert.deepEqual(await owner.start(), { status: 'SIGNER_OUTCOME_UNKNOWN' });
      assert.equal(observations.calls, 1);
      assert.deepEqual(await owner.close(), { status: 'SIGNER_OUTCOME_UNKNOWN' });
      observations.child.emit('error', new Error('not exposed'));
      observations.child.emit('error', new Error('not exposed'));
      observations.request.emit('error', new Error('not exposed'));
      observations.request.emit('error', new Error('not exposed'));
      observations.responsePipe.emit('error', new Error('not exposed'));
      observations.responsePipe.emit('error', new Error('not exposed'));
      fixture.store.close();
    });
  }

  await t.test('request descriptor closes before dispatch', async t => {
    const fixture = storeFixture(t);
    const featureLinkCountBefore = lstatSync(fixture.directory).nlink;
    let featureDirectory = null;
    let featureLinkCountAfter;
    try {
      featureDirectory = mkdtempSync(join(
        fixture.directory,
        'link-count-feature-',
      ));
      featureDirectory = realpathSync(featureDirectory);
      featureLinkCountAfter = lstatSync(fixture.directory).nlink;
    } finally {
      if (featureDirectory !== null) {
        rmSync(featureDirectory, { recursive: true, force: true });
      }
    }
    assert.equal(lstatSync(fixture.directory).nlink, featureLinkCountBefore);
    if (featureLinkCountAfter === featureLinkCountBefore) {
      fixture.store.close();
      t.skip('test filesystem does not expose child-directory link-count changes');
      return;
    }
    const executable = executableFixture(t, fixture.directory);
    const observations = {};
    const childSpawn = fakeSpawn(() => {}, observations);
    let siblingDirectory = null;
    t.after(() => {
      if (siblingDirectory !== null) {
        rmSync(siblingDirectory, { recursive: true, force: true });
      }
    });
    const factory = await operationFactoryWithSpawn(t, (...args) => {
      const child = childSpawn(...args);
      const before = lstatSync(fixture.directory);
      observations.ancestorStableBefore = {
        canonicalPath: realpathSync(fixture.directory),
        dev: before.dev,
        ino: before.ino,
        mode: before.mode,
        uid: before.uid,
        gid: before.gid,
      };
      siblingDirectory = mkdtempSync(join(
        fixture.directory,
        'unrelated-child-',
      ));
      siblingDirectory = realpathSync(siblingDirectory);
      const after = lstatSync(fixture.directory);
      observations.ancestorStableAfter = {
        canonicalPath: realpathSync(fixture.directory),
        dev: after.dev,
        ino: after.ino,
        mode: after.mode,
        uid: after.uid,
        gid: after.gid,
      };
      observations.ancestorLinkCountBefore = before.nlink;
      observations.ancestorLinkCountAfter = after.nlink;
      observations.request = child.stdio[3];
      return child;
    });
    const owner = factory(operationOptions(fixture, executable, {
      deadlineRuntime: {
        schedule() {
          observations.request.emit('close');
          return Object.freeze({});
        },
        cancel() {},
      },
    }));
    await expectOperationCode(
      owner.start(),
      'ZENON_FUNDING_PROVIDER_SIGNING_CHILD_CHANNEL_FAILED',
    );
    assert.deepEqual(
      observations.ancestorStableAfter,
      observations.ancestorStableBefore,
    );
    assert.notEqual(
      observations.ancestorLinkCountAfter,
      observations.ancestorLinkCountBefore,
    );
    assert.deepEqual(await owner.close(), { status: 'CLOSED' });
    fixture.store.close();
  });

  await t.test('child error and exit ordering after dispatch cannot escape', async t => {
    const fixture = storeFixture(t);
    const executable = executableFixture(t, fixture.directory);
    const observations = {};
    const factory = await operationFactoryWithSpawn(t, fakeSpawn(({ child, response }) => {
      child.emit('error', new Error('not exposed'));
      child.emit('exit', 1, null);
      child.emit('close', 1, null);
      response.emit('error', new Error('not exposed'));
      response.end();
    }, observations));
    const owner = factory(operationOptions(fixture, executable));
    assert.deepEqual(await owner.start(), { status: 'SIGNER_OUTCOME_UNKNOWN' });
    assert.deepEqual(await owner.close(), { status: 'SIGNER_OUTCOME_UNKNOWN' });
    fixture.store.close();
  });

  await t.test('late and duplicate channel errors cannot revise a completed result', async t => {
    const fixture = storeFixture(t);
    const executable = executableFixture(t, fixture.directory);
    const observations = {};
    const childSpawn = fakeSpawn(
      readyHandler(fixture, observations, { status: 'APPROVAL_REQUIRED' }),
      observations,
    );
    const factory = await operationFactoryWithSpawn(t, (...args) => {
      const child = childSpawn(...args);
      observations.child = child;
      observations.requestPipe = child.stdio[3];
      observations.responsePipe = child.stdio[4];
      return child;
    });
    const owner = factory(operationOptions(fixture, executable));
    assert.deepEqual(await owner.start(), { status: 'APPROVAL_REQUIRED' });
    for (const emitter of [
      observations.child,
      observations.requestPipe,
      observations.responsePipe,
    ]) {
      emitter.emit('error', new Error('not exposed'));
      emitter.emit('error', new Error('not exposed'));
    }
    assert.deepEqual(await owner.close(), { status: 'APPROVAL_REQUIRED' });
    fixture.store.close();
  });
});

test('APPROVAL_REQUIRED and deterministic REJECTED are terminal with no respawn', async t => {
  for (const status of ['APPROVAL_REQUIRED', 'REJECTED']) {
    await t.test(status, async t => {
      const fixture = storeFixture(t);
      const executable = executableFixture(t, fixture.directory);
      const observations = {};
      const factory = await operationFactoryWithSpawn(
        t,
        fakeSpawn(readyHandler(fixture, observations, { status }), observations),
      );
      const owner = factory(operationOptions(fixture, executable));
      const started = owner.start();
      assert.deepEqual(await started, { status });
      assert.strictEqual(owner.start(), started);
      assert.equal(observations.calls, 1);
      assert.deepEqual(await owner.close(), { status });
      assert.equal(fixture.store.load().outbox.status, 'PREPARED');
      fixture.store.close();
    });
  }
});

test('a cryptographically valid replay outside either import window requires manual recovery', async t => {
  for (const [name, authorityOverrides, now] of [
    ['initial age', { maximumInitialAgeSeconds: 10 }, NOW + 11],
    ['validity', {}, NOW + 120],
  ]) {
    await t.test(name, async t => {
      const fixture = storeFixture(t, { authorityOverrides });
      const executable = executableFixture(t, fixture.directory);
      const firstObserved = {};
      let factory = await operationFactoryWithSpawn(
        t,
        fakeSpawn(readyHandler(fixture, firstObserved), firstObserved),
      );
      let owner = factory(operationOptions(fixture, executable, { now: () => now }));
      const started = owner.start();
      assert.deepEqual(await started, { status: 'RECOVERY_WINDOW_EXPIRED' });
      assert.strictEqual(owner.start(), started);
      assert.deepEqual(await owner.close(), { status: 'RECOVERY_WINDOW_EXPIRED' });
      assert.equal(firstObserved.calls, 1);
      assert.equal(fixture.store.load().outbox.status, 'PREPARED');

      const secondObserved = {};
      factory = await operationFactoryWithSpawn(
        t,
        fakeSpawn(readyHandler(fixture, secondObserved), secondObserved),
      );
      owner = factory(operationOptions(fixture, executable, { now: () => now }));
      assert.deepEqual(await owner.start(), { status: 'RECOVERY_WINDOW_EXPIRED' });
      assert.deepEqual(await owner.close(), { status: 'RECOVERY_WINDOW_EXPIRED' });
      assert.equal(secondObserved.calls, 1);
      assert.equal(secondObserved.operationId, firstObserved.operationId);
      assert.deepEqual(secondObserved.request, firstObserved.request);
      assert.deepEqual(secondObserved.response.envelope, firstObserved.response.envelope);
      assert.equal(fixture.store.load().outbox.status, 'PREPARED');
      fixture.store.close();
    });
  }
});

test('expired replay revalidates committed PREPARED after the clock callback', async t => {
  for (const scenario of [
    {
      name: 'invalidation',
      mutate(fixture) { invalidateObserver(fixture.store); },
      outcome: 'reject-invalidated',
      outbox: 'INVALIDATED',
    },
    {
      name: 'external READY',
      mutate(fixture, observations) {
        const current = fixture.store.load();
        const request = fixture.store.peekPreparedAttestation();
        fixture.store.commitAuthenticatedEnvelope({
          expectedObserverRevision: current.state.revision,
          expectedOutboxRevision: current.outbox.revision,
          attestationId: request.attestationId,
          envelope: observations.response.envelope,
          nowEpochSeconds: NOW,
        });
      },
      outcome: 'store-recovery',
      outbox: 'READY',
    },
    {
      name: 'store close',
      mutate(fixture) { fixture.store.close(); },
      outcome: 'unknown',
      outbox: null,
    },
    {
      name: 'revision drift',
      mutate(fixture) { advanceObserver(fixture.store); },
      outcome: 'unknown',
      outbox: 'PREPARED',
    },
    {
      name: 'method replacement',
      mutate(_fixture, _observations, state) {
        state.descriptor = Object.getOwnPropertyDescriptor(
          ZenonFundingObserverSqliteStore.prototype,
          'load',
        );
        Object.defineProperty(ZenonFundingObserverSqliteStore.prototype, 'load', {
          ...state.descriptor,
          value() { throw new Error('not exposed'); },
        });
      },
      outcome: 'unknown',
      outbox: 'PREPARED',
    },
  ]) {
    await t.test(scenario.name, async t => {
      const fixture = storeFixture(t);
      const executable = executableFixture(t, fixture.directory);
      const observations = {};
      const mutationState = {};
      const factory = await operationFactoryWithSpawn(
        t,
        fakeSpawn(readyHandler(fixture, observations), observations),
      );
      let mutated = false;
      const owner = factory(operationOptions(fixture, executable, {
        now() {
          if (!mutated) {
            mutated = true;
            scenario.mutate(fixture, observations, mutationState);
          }
          return NOW + 120;
        },
      }));
      try {
        if (scenario.outcome === 'reject-invalidated') {
          await expectOperationCode(
            owner.start(),
            'ZENON_FUNDING_PROVIDER_SIGNING_INVALIDATED',
          );
          assert.deepEqual(await owner.close(), { status: 'INVALIDATED' });
        } else if (scenario.outcome === 'store-recovery') {
          assert.deepEqual(await owner.start(), { status: 'STORE_RECOVERY_REQUIRED' });
          assert.deepEqual(await owner.close(), { status: 'STORE_RECOVERY_REQUIRED' });
        } else {
          assert.deepEqual(await owner.start(), { status: 'SIGNER_OUTCOME_UNKNOWN' });
          assert.deepEqual(await owner.close(), { status: 'SIGNER_OUTCOME_UNKNOWN' });
        }
      } finally {
        if (mutationState.descriptor !== undefined) {
          Object.defineProperty(
            ZenonFundingObserverSqliteStore.prototype,
            'load',
            mutationState.descriptor,
          );
        }
      }
      assert.equal(observations.calls, 1);
      if (scenario.outbox !== null) {
        assert.equal(fixture.store.load().outbox.status, scenario.outbox);
        fixture.store.close();
      }
    });
  }
});

test('an external READY transition during response handling requires store recovery', async t => {
  const fixture = storeFixture(t);
  const executable = executableFixture(t, fixture.directory);
  const observations = {};
  const handler = readyHandler(fixture, observations, {
    offset: 1,
    beforeResponse(wire) {
      fixture.store.commitAuthenticatedEnvelope({
        expectedObserverRevision: fixture.store.load().state.revision,
        expectedOutboxRevision: fixture.store.load().outbox.revision,
        attestationId: wire.attestationId,
        envelope: signedEnvelope(fixture, wire.attestationRequest),
        nowEpochSeconds: NOW,
      });
    },
  });
  const factory = await operationFactoryWithSpawn(t, fakeSpawn(handler, observations));
  const owner = factory(operationOptions(fixture, executable, { now: () => NOW + 1 }));
  assert.deepEqual(await owner.start(), { status: 'STORE_RECOVERY_REQUIRED' });
  assert.equal(fixture.store.load().outbox.status, 'READY');
  assert.deepEqual(await owner.close(), { status: 'STORE_RECOVERY_REQUIRED' });
  fixture.store.close();
});

test('committed PREPARED drift never returns a stale approval or rejection', async t => {
  for (const status of ['APPROVAL_REQUIRED', 'REJECTED']) {
    await t.test(`${status} after revision drift`, async t => {
      const fixture = storeFixture(t);
      const executable = executableFixture(t, fixture.directory);
      const observations = {};
      const factory = await operationFactoryWithSpawn(
        t,
        fakeSpawn(readyHandler(fixture, observations, {
          status,
          beforeResponse() { advanceObserver(fixture.store); },
        }), observations),
      );
      const owner = factory(operationOptions(fixture, executable));
      assert.deepEqual(await owner.start(), { status: 'SIGNER_OUTCOME_UNKNOWN' });
      assert.deepEqual(await owner.close(), { status: 'SIGNER_OUTCOME_UNKNOWN' });
      assert.equal(fixture.store.load().outbox.status, 'PREPARED');
      fixture.store.close();
    });
  }

  await t.test('invalidation after spawn', async t => {
    const fixture = storeFixture(t);
    const executable = executableFixture(t, fixture.directory);
    const observations = {};
    const childSpawn = fakeSpawn(() => {}, observations);
    const factory = await operationFactoryWithSpawn(t, (...args) => {
      const child = childSpawn(...args);
      invalidateObserver(fixture.store);
      return child;
    });
    const owner = factory(operationOptions(fixture, executable));
    await expectOperationCode(
      owner.start(),
      'ZENON_FUNDING_PROVIDER_SIGNING_INVALIDATED',
    );
    assert.deepEqual(await owner.close(), { status: 'INVALIDATED' });
    assert.equal(fixture.store.load().outbox.status, 'INVALIDATED');
    fixture.store.close();
  });

  await t.test('store close after spawn', async t => {
    const fixture = storeFixture(t);
    const executable = executableFixture(t, fixture.directory);
    const observations = {};
    const childSpawn = fakeSpawn(() => {}, observations);
    const factory = await operationFactoryWithSpawn(t, (...args) => {
      const child = childSpawn(...args);
      fixture.store.close();
      return child;
    });
    const owner = factory(operationOptions(fixture, executable));
    await expectOperationCode(
      owner.start(),
      'ZENON_FUNDING_PROVIDER_SIGNING_ATTESTATION_UNAVAILABLE',
    );
    assert.deepEqual(await owner.close(), { status: 'CLOSED' });
  });

  await t.test('prototype method replacement during scheduling', async t => {
    const fixture = storeFixture(t);
    const executable = executableFixture(t, fixture.directory);
    const observations = {};
    const factory = await operationFactoryWithSpawn(
      t,
      fakeSpawn(() => {}, observations),
    );
    const descriptor = Object.getOwnPropertyDescriptor(
      ZenonFundingObserverSqliteStore.prototype,
      'load',
    );
    let replaced = false;
    const deadlineRuntime = {
      schedule(callback, delayMs) {
        Object.defineProperty(ZenonFundingObserverSqliteStore.prototype, 'load', {
          ...descriptor,
          value() { throw new Error('not exposed'); },
        });
        replaced = true;
        return setTimeout(callback, delayMs);
      },
      cancel(handle) { clearTimeout(handle); },
    };
    try {
      const owner = factory(operationOptions(fixture, executable, { deadlineRuntime }));
      await expectOperationCode(
        owner.start(),
        'ZENON_FUNDING_PROVIDER_SIGNING_CHILD_CHANNEL_FAILED',
      );
      assert.deepEqual(await owner.close(), { status: 'CLOSED' });
    } finally {
      if (replaced) {
        Object.defineProperty(ZenonFundingObserverSqliteStore.prototype, 'load', descriptor);
      }
    }
    assert.equal(observations.calls, 1);
    fixture.store.close();
  });
});

test('committed invalidation during signing suppresses import and remains terminal', async t => {
  const fixture = storeFixture(t);
  const executable = executableFixture(t, fixture.directory);
  const observations = {};
  const factory = await operationFactoryWithSpawn(
    t,
    fakeSpawn(readyHandler(fixture, observations, {
      beforeResponse() {
        const current = fixture.store.load().state;
        fixture.store.planBackfill({
          expectedRevision: current.revision,
          frontier: { height: current.checkpoint.height, hash: 'f'.repeat(64) },
        });
      },
    }), observations),
  );
  const owner = factory(operationOptions(fixture, executable));
  await expectOperationCode(
    owner.start(),
    'ZENON_FUNDING_PROVIDER_SIGNING_INVALIDATED',
  );
  assert.equal(fixture.store.load().outbox.status, 'INVALIDATED');
  assert.deepEqual(await owner.close(), { status: 'INVALIDATED' });
  assert.deepEqual(await owner.close(), { status: 'INVALIDATED' });
  fixture.store.close();
});

test('store commit ambiguity exposes no success and reopen reveals old or exact READY', async t => {
  const fixture = storeFixture(t);
  fixture.recordKey = fixture.store.load().recordKey;
  fixture.store.close();
  fixture.store = openZenonFundingObserverSqliteStore(openOptions(fixture, {
    afterCommit({ operation }) {
      if (operation === 'commitAuthenticatedEnvelope') throw new Error('synthetic');
    },
  }));
  const executable = executableFixture(t, fixture.directory);
  const observations = {};
  const factory = await operationFactoryWithSpawn(
    t,
    fakeSpawn(readyHandler(fixture, observations), observations),
  );
  const owner = factory(operationOptions(fixture, executable));
  assert.deepEqual(await owner.start(), { status: 'STORE_RECOVERY_REQUIRED' });
  assert.deepEqual(await owner.close(), { status: 'STORE_RECOVERY_REQUIRED' });
  try { fixture.store.close(); } catch {}
  fixture.store = openZenonFundingObserverSqliteStore(openOptions(fixture));
  assert.equal(fixture.store.load().outbox.status, 'READY');
  fixture.store.close();
});

test('pre-commit ambiguity reconstructs with the same stable operation identity', async t => {
  const fixture = storeFixture(t);
  fixture.recordKey = fixture.store.load().recordKey;
  fixture.store.close();
  fixture.store = openZenonFundingObserverSqliteStore(openOptions(fixture, {
    commitAttempt({ operation }) {
      if (operation === 'commitAuthenticatedEnvelope') throw new Error('synthetic');
    },
  }));
  const executable = executableFixture(t, fixture.directory);
  const firstObserved = {};
  let factory = await operationFactoryWithSpawn(
    t,
    fakeSpawn(readyHandler(fixture, firstObserved), firstObserved),
  );
  let owner = factory(operationOptions(fixture, executable));
  assert.deepEqual(await owner.start(), { status: 'STORE_RECOVERY_REQUIRED' });
  assert.deepEqual(await owner.close(), { status: 'STORE_RECOVERY_REQUIRED' });
  try { fixture.store.close(); } catch {}
  fixture.store = openZenonFundingObserverSqliteStore(openOptions(fixture));
  assert.equal(fixture.store.load().outbox.status, 'PREPARED');
  const secondObserved = {};
  factory = await operationFactoryWithSpawn(
    t,
    fakeSpawn(readyHandler(fixture, secondObserved), secondObserved),
  );
  owner = factory(operationOptions(fixture, executable));
  assert.deepEqual(await owner.start(), { status: 'READY_COMMITTED' });
  assert.equal(secondObserved.operationId, firstObserved.operationId);
  assert.equal(canonicalJson(secondObserved.request), canonicalJson(firstObserved.request));
  assert.equal(fixture.store.load().outbox.status, 'READY');
  await owner.close();
  fixture.store.close();
});

test('close during a dispatched request preserves signer uncertainty', async t => {
  const fixture = storeFixture(t);
  const executable = executableFixture(t, fixture.directory);
  const observations = {};
  const factory = await operationFactoryWithSpawn(t, fakeSpawn(() => {}, observations));
  const owner = factory(operationOptions(fixture, executable, { timeoutMs: 10 }));
  const started = owner.start();
  const closing = owner.close();
  assert.deepEqual(await started, { status: 'SIGNER_OUTCOME_UNKNOWN' });
  assert.deepEqual(await closing, { status: 'SIGNER_OUTCOME_UNKNOWN' });
  assert.deepEqual(await owner.close(), { status: 'SIGNER_OUTCOME_UNKNOWN' });
  assert.equal(observations.calls, 1);
  fixture.store.close();
});

test('synchronous spawn and deadline reentry sees the published native operation', async t => {
  for (const boundary of ['spawn', 'schedule']) {
    await t.test(boundary, async t => {
      const fixture = storeFixture(t);
      const executable = executableFixture(t, fixture.directory);
      const observations = {};
      let owner;
      let reenteredStart;
      let reenteredClose;
      const childSpawn = fakeSpawn(readyHandler(fixture, observations), observations);
      const spawn = (...args) => {
        const child = childSpawn(...args);
        if (boundary === 'spawn') {
          reenteredStart = owner.start();
          reenteredClose = owner.close();
        }
        return child;
      };
      const factory = await operationFactoryWithSpawn(t, spawn);
      const deadlineRuntime = boundary === 'schedule'
        ? {
          schedule(callback, delayMs) {
            reenteredStart = owner.start();
            reenteredClose = owner.close();
            return setTimeout(callback, delayMs);
          },
          cancel(handle) { clearTimeout(handle); },
        }
        : realDeadlineRuntime();
      owner = factory(operationOptions(fixture, executable, { deadlineRuntime }));
      const started = owner.start();
      assert.equal(observations.calls ?? 0, 0);
      assert.deepEqual(await started, { status: 'READY_COMMITTED' });
      assert.strictEqual(reenteredStart, started);
      assert.strictEqual(owner.close(), reenteredClose);
      assert.deepEqual(await reenteredClose, { status: 'CLOSED' });
      assert.equal(observations.calls, 1);
      await new Promise(resolveTurn => setImmediate(resolveTurn));
      fixture.store.close();
    });
  }
});

test('closed or post-construction method-poisoned stores fail before spawn', async t => {
  const closedFixture = storeFixture(t);
  const closedExecutable = executableFixture(t, closedFixture.directory);
  const closedObserved = {};
  let factory = await operationFactoryWithSpawn(
    t,
    fakeSpawn(() => {}, closedObserved),
  );
  let owner = factory(operationOptions(closedFixture, closedExecutable));
  closedFixture.store.close();
  await expectOperationCode(
    owner.start(),
    'ZENON_FUNDING_PROVIDER_SIGNING_ATTESTATION_UNAVAILABLE',
  );
  assert.equal(closedObserved.calls ?? 0, 0);

  const poisonedFixture = storeFixture(t);
  const poisonedExecutable = executableFixture(t, poisonedFixture.directory);
  const poisonedObserved = {};
  factory = await operationFactoryWithSpawn(
    t,
    fakeSpawn(() => {}, poisonedObserved),
  );
  owner = factory(operationOptions(poisonedFixture, poisonedExecutable));
  const descriptor = Object.getOwnPropertyDescriptor(
    ZenonFundingObserverSqliteStore.prototype,
    'load',
  );
  try {
    Object.defineProperty(ZenonFundingObserverSqliteStore.prototype, 'load', {
      ...descriptor,
      value() { throw new Error('not invoked'); },
    });
    await expectOperationCode(
      owner.start(),
      'ZENON_FUNDING_PROVIDER_SIGNING_ATTESTATION_UNAVAILABLE',
    );
    assert.equal(poisonedObserved.calls ?? 0, 0);
  } finally {
    Object.defineProperty(ZenonFundingObserverSqliteStore.prototype, 'load', descriptor);
  }
  poisonedFixture.store.close();
});

test('spawn and pre-dispatch child-surface failures are definite', async t => {
  const definite = storeFixture(t);
  const executable = executableFixture(t, definite.directory);
  let factory = await operationFactoryWithSpawn(t, () => {
    throw new Error('synthetic');
  });
  let owner = factory(operationOptions(definite, executable));
  await expectOperationCode(
    owner.start(),
    'ZENON_FUNDING_PROVIDER_SIGNING_SPAWN_FAILED',
  );
  assert.deepEqual(await owner.close(), { status: 'CLOSED' });
  definite.store.close();

  const hostile = storeFixture(t);
  const hostileExecutable = executableFixture(t, hostile.directory);
  let getterCalls = 0;
  factory = await operationFactoryWithSpawn(t, () => {
    const child = new EventEmitter();
    Object.defineProperty(child, 'stdio', {
      enumerable: true,
      get() { getterCalls += 1; throw new Error('not invoked'); },
    });
    return child;
  });
  owner = factory(operationOptions(hostile, hostileExecutable));
  await expectOperationCode(
    owner.start(),
    'ZENON_FUNDING_PROVIDER_SIGNING_CHILD_CHANNEL_FAILED',
  );
  assert.equal(getterCalls, 0);
  assert.deepEqual(await owner.close(), { status: 'CLOSED' });
  hostile.store.close();
});

test('post-import inherited numeric accessors cannot observe sensitive internal arrays', async t => {
  const fixture = storeFixture(t);
  const executable = executableFixture(t, fixture.directory);
  const requestPipe = new PassThrough();
  const responsePipe = new PassThrough();
  const child = new EventEmitter();
  child.stdio = [null, null, null, requestPipe, responsePipe];
  child.kill = signal => {
    queueMicrotask(() => child.emit('close', null, signal));
    return true;
  };

  const requestChunks = [];
  let responsePieces = null;
  requestPipe.on('data', chunk => {
    Object.defineProperty(requestChunks, `${requestChunks.length}`, {
      configurable: true,
      enumerable: true,
      value: Buffer.from(chunk),
      writable: true,
    });
  });
  requestPipe.once('finish', () => {
    try {
      const wire = parseZenonFundingProviderSigningChildRequestFrame(
        Buffer.concat(requestChunks),
        fixture.authority,
      );
      const responseValue = responseFor(fixture, wire, 'READY');
      const responseFrame = frameZenonFundingProviderSigningChildResponse(responseValue);
      const split = Math.max(1, Math.floor(responseFrame.length / 3));
      responsePieces = [
        Buffer.from(responseFrame.subarray(0, split)),
        Buffer.from(responseFrame.subarray(split, split * 2)),
        Buffer.from(responseFrame.subarray(split * 2)),
      ];
      responsePipe.write(responsePieces[0]);
      responsePipe.write(responsePieces[1]);
      responsePipe.end(responsePieces[2]);
      queueMicrotask(() => child.emit('close', 0, null));
    } catch {
      child.emit('error', new Error('synthetic child failure'));
    }
  });

  const observations = { calls: 0 };
  const factory = await operationFactoryWithSpawn(t, () => {
    observations.calls += 1;
    return child;
  });
  const owner = factory(operationOptions(fixture, executable));

  const sensitivePaths = new Set();
  let component = dirname(executable.executablePath);
  while (true) {
    sensitivePaths.add(component);
    const parent = dirname(component);
    if (parent === component) break;
    component = parent;
  }
  const numericKeys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  const originalDescriptors = Object.create(null);
  let sensitiveObservation = false;

  function isSensitive(value) {
    if (value === requestPipe || value === responsePipe) return true;
    if (typeof value === 'string' && sensitivePaths.has(value)) return true;
    if (
      value !== null
      && typeof value === 'object'
      && Object.getPrototypeOf(value) === Object.prototype
      && Object.isFrozen(value)
      && Object.hasOwn(value, 'dev')
      && Object.hasOwn(value, 'ino')
      && Object.hasOwn(value, 'mode')
      && Object.hasOwn(value, 'uid')
    ) return true;
    if (Buffer.isBuffer(value) && responsePieces !== null) {
      for (let index = 0; index < responsePieces.length; index += 1) {
        if (value.equals(responsePieces[index])) return true;
      }
    }
    return false;
  }

  function receiverContainsSensitive(receiver) {
    if (!Array.isArray(receiver)) return false;
    for (let index = 0; index < numericKeys.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(receiver, numericKeys[index]);
      if (descriptor && Object.hasOwn(descriptor, 'value') && isSensitive(descriptor.value)) {
        return true;
      }
    }
    return false;
  }

  let result;
  try {
    for (let index = 0; index < numericKeys.length; index += 1) {
      const key = numericKeys[index];
      originalDescriptors[key] = Object.getOwnPropertyDescriptor(Array.prototype, key);
      Object.defineProperty(Array.prototype, key, {
        configurable: true,
        get() {
          if (receiverContainsSensitive(this)) sensitiveObservation = true;
          return undefined;
        },
        set(value) {
          if (isSensitive(value) || receiverContainsSensitive(this)) sensitiveObservation = true;
          Object.defineProperty(this, key, {
            configurable: true,
            enumerable: true,
            value,
            writable: true,
          });
        },
      });
    }
    result = await owner.start();
  } finally {
    for (let index = 0; index < numericKeys.length; index += 1) {
      const key = numericKeys[index];
      const descriptor = originalDescriptors[key];
      if (descriptor === undefined) delete Array.prototype[key];
      else Object.defineProperty(Array.prototype, key, descriptor);
    }
  }

  assert.deepEqual(result, { status: 'READY_COMMITTED' });
  assert.equal(observations.calls, 1);
  assert.equal(sensitiveObservation, false);
  assert.equal(fixture.store.load().outbox.status, 'READY');
  assert.deepEqual(await owner.close(), { status: 'CLOSED' });
  fixture.store.close();
});

test('configuration and public inputs are exact and errors never reflect sensitive values', async t => {
  const fixture = storeFixture(t);
  const executable = executableFixture(t, fixture.directory);
  for (const options of [
    new Proxy(operationOptions(fixture, executable), {}),
    { ...operationOptions(fixture, executable), approved: true },
    { ...operationOptions(fixture, executable), timeoutMs: 0 },
    { ...operationOptions(fixture, executable), maximumResponseBytes: 600_000 },
    { ...operationOptions(fixture, executable), signerExecutable: { ...executable, extra: true } },
  ]) {
    assert.throws(
      () => createZenonFundingProviderSigningOperation(options),
      error => error?.code === 'ZENON_FUNDING_PROVIDER_SIGNING_INVALID_CONFIGURATION',
    );
  }
  const owner = createZenonFundingProviderSigningOperation(
    operationOptions(fixture, executable),
  );
  await expectOperationCode(
    owner.start({ approved: true }),
    'ZENON_FUNDING_PROVIDER_SIGNING_INVALID_INPUT',
  );
  await expectOperationCode(
    owner.close({ retry: true }),
    'ZENON_FUNDING_PROVIDER_SIGNING_INVALID_INPUT',
  );
  fixture.store.close();
  const rejected = await owner.start().catch(error => error);
  const rendered = `${rejected?.name}:${rejected?.message}:${JSON.stringify(rejected)}`;
  assert.doesNotMatch(rendered, /sha256:|zenontx:|signature|publicKey|observer\.sqlite|attestor-/u);
});
