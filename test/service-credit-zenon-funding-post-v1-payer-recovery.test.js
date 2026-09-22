import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import {
  chmodSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import nodeTest from 'node:test';
import * as sdk from 'znn-typescript-sdk';

import { canonicalJson, paymentIntentDigest } from '../src/canonical.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';
import { deriveServiceCreditCapabilityCommitment } from '../src/service-credit-capability.js';
import { SERVICE_CREDIT_MODEL_VERSION } from '../src/service-credit-model.js';
import {
  createZenonFundingPostV1PayerRecoveryOwner,
  ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES as OWNER_CODES,
} from '../src/service-credit-zenon-funding-post-v1-payer-recovery-owner.js';
import {
  createZenonFundingPayerRecoverySqliteStore,
  openZenonFundingPayerRecoverySqliteStore,
  ZENON_FUNDING_PAYER_RECOVERY_STATUS as STATUS,
  ZenonFundingPayerRecoverySqliteStore,
} from '../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js';
import {
  parseZenonFundingProviderAttestationAuthorityRecord,
} from '../src/service-credit-zenon-funding-provider-attestation.js';
import { encodeB64Json, makePaymentRequired } from '../src/x402-wire.js';

const NOW = 2_000_000_000_000;
const RESOURCE_URL = 'https://service.example/credits/zenon-fund';
const SOURCE_OWNER = readFileSync(
  new URL('../src/service-credit-zenon-funding-post-v1-payer-recovery-owner.js', import.meta.url),
  'utf8',
);
const SOURCE_STORE = readFileSync(
  new URL('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js', import.meta.url),
  'utf8',
);

function fixedFailure() {
  const error = new Error('SERVICE_CREDIT_ZENON_FUNDING_PAYER_RECOVERY_TEST_FAILED');
  error.stack = 'Error: SERVICE_CREDIT_ZENON_FUNDING_PAYER_RECOVERY_TEST_FAILED';
  return error;
}

function test(name, run) {
  return nodeTest(name, async t => {
    try { await run(t); } catch { throw fixedFailure(); }
  });
}

function errorCode(error) {
  try { return Object.getOwnPropertyDescriptor(error, 'code')?.value; }
  catch { return undefined; }
}

function rejectsCode(code) {
  return error => errorCode(error) === code;
}

function keyAddress(byte) {
  const key = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, byte));
  try { return key.getAddress().toString(); } finally { key.clear(); }
}

function checksum(label) {
  return `sha256:${createHash('sha256').update(`payer-recovery:${label}`).digest('hex')}`;
}

const CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: createHash('sha256').update('payer-recovery-genesis').digest('hex'),
});
const CAPABILITY_PUBLIC_KEY = generateKeyPairSync('ed25519').publicKey
  .export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');
const PROVIDER_PUBLIC_KEY = generateKeyPairSync('ed25519').publicKey
  .export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');
const AUTHORITY_RECORD = canonicalJson({
  authorityRecordVersion: 1,
  authorityProfileId: 'zenon.provider-attestation',
  authorityProfileVersion: 1,
  verifierVersion: 1,
  providerAuthorityId: 'provider.payer.recovery',
  generationId: 'provider.payer.recovery.generation',
  generationVersion: 1,
  keyId: 'provider.payer.recovery.key',
  algorithm: 'Ed25519',
  publicKey: PROVIDER_PUBLIC_KEY,
  network: 'zenon:testnet',
  chainProfile: CHAIN_PROFILE,
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
  bootstrapCheckpoint: {
    height: 10,
    hash: createHash('sha256').update('payer-recovery-bootstrap').digest('hex'),
  },
  sourcePolicyCommitment: checksum('source-policy'),
  maximumAttestationBytes: 4096,
  maximumCanonicalBytes: 524288,
  maximumInitialAgeSeconds: 300,
  maximumFutureSkewSeconds: 5,
  maximumValiditySeconds: 300,
});
const AUTHORITY = parseZenonFundingProviderAttestationAuthorityRecord(AUTHORITY_RECORD);

function offer(resourceUrl) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.payer.recovery',
    serviceId: 'service.payer.recovery',
    resourceId: 'resource.payer.recovery',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.payer.recovery',
      resourceUrl,
    }),
    offerId: 'offer.payer.recovery',
    offerVersion: 1,
    costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.payer.recovery',
    fundingPolicyVersion: 1,
  };
}

function fundingTerms(input) {
  return {
    fundingPolicyId: input.offer.fundingPolicyId,
    fundingPolicyVersion: input.offer.fundingPolicyVersion,
    totalUnits: 10,
    expiresAt: NOW + 60_000,
    requirement: {
      scheme: 'exact',
      network: 'zenon:testnet',
      asset: sdk.ZNN_ZTS.toString(),
      amount: '1',
      payTo: keyAddress(18),
      maxTimeoutSeconds: 30,
      extra: {
        paymentFlow: 'upfront',
        poc: true,
        settlement: 'account-block',
        zenonChain: structuredClone(CHAIN_PROFILE),
        minimumMomentumConfirmations: AUTHORITY.confirmationPolicy.minimumConfirmations,
      },
    },
  };
}

function staticChallenge(resourceUrl) {
  const configuredOffer = offer(resourceUrl);
  return makePaymentRequired({
    resourceUrl,
    requirement: fundingTerms({ offer: configuredOffer }).requirement,
  });
}

async function signedPayload(paymentRequired, variation = 1) {
  const originalChainId = sdk.Zenon.getChainIdentifier();
  sdk.Zenon.setChainID(7);
  const zenon = sdk.Zenon.getInstance();
  const originalLedger = zenon.ledger;
  const originalEmbedded = zenon.embedded;
  const payer = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 17));
  const payee = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 18));
  try {
    zenon.ledger = {
      getFrontierAccountBlock: async () => null,
      getFrontierMomentum: async () => ({
        hash: sdk.Hash.digest(Buffer.from(`payer-recovery-momentum-${variation}`)),
        height: 1,
      }),
    };
    zenon.embedded = {
      plasma: {
        getRequiredPoWForAccountBlock: async () => ({
          requiredDifficulty: 0,
          basePlasma: 0,
        }),
      },
    };
    const accepted = paymentRequired.accepts[0];
    const block = sdk.AccountBlockTemplate.send(payee.getAddress(), sdk.ZNN_ZTS, 1n);
    const intentDigest = paymentIntentDigest(paymentRequired, accepted);
    block.data = Buffer.from(intentDigest, 'hex');
    const signed = await zenon.prepareBlock(block, payer);
    return {
      x402Version: 2,
      resource: structuredClone(paymentRequired.resource),
      accepted: structuredClone(accepted),
      payload: {
        transaction: signed.toJson(),
        intentDigest,
      },
    };
  } finally {
    payer.clear();
    payee.clear();
    zenon.ledger = originalLedger;
    zenon.embedded = originalEmbedded;
    sdk.Zenon.setChainID(originalChainId);
  }
}

async function authorizedPair(variation = 1) {
  const paymentRequired = staticChallenge(RESOURCE_URL);
  const paymentSignatureHeader = encodeB64Json(
    await signedPayload(paymentRequired, variation),
  );
  return Object.freeze({
    challenge: Object.freeze({
      status: 'PAYMENT_REQUIRED',
      resourceUrl: RESOURCE_URL,
      paymentRequiredHeader: encodeB64Json(paymentRequired),
      paymentRequired,
    }),
    paymentSignatureHeader,
  });
}

function fakeResponse(status, body) {
  const bytes = Buffer.from(body, 'utf8');
  return Object.freeze({
    status,
    url: RESOURCE_URL,
    redirected: false,
    headers: new Headers({
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Type': 'text/plain; charset=utf-8',
      Vary: 'PAYMENT-SIGNATURE',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': String(bytes.length),
    }),
    body: new Response(bytes).body,
  });
}

function privateDirectory(t, registerCleanup = true) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'payer-recovery-')));
  chmodSync(directory, 0o700);
  if (registerCleanup) {
    t.after(() => {
      try { rmSync(directory, { recursive: true, force: true }); }
      catch { throw fixedFailure(); }
    });
  }
  return directory;
}

function storeOptions(directory, testHooks) {
  return {
    databasePath: join(directory, 'payer-recovery.sqlite'),
    allowedRoot: directory,
    resourceUrl: RESOURCE_URL,
    ...(testHooks === undefined ? {} : { testHooks }),
  };
}

function owner(store, fetchImpl, deadlineMs = 2_000) {
  return createZenonFundingPostV1PayerRecoveryOwner({
    store,
    deadlineMs,
    fetchImpl,
  });
}

async function prepareStore(t, pair, testHooks, registerCleanup = true) {
  const directory = privateDirectory(t, registerCleanup);
  const store = createZenonFundingPayerRecoverySqliteStore(
    storeOptions(directory, testHooks),
  );
  const recovery = owner(store, async () => {
    throw fixedFailure();
  });
  assert.deepEqual(await recovery.recover(), { status: 'EMPTY' });
  assert.deepEqual(await recovery.prepare(pair), { status: STATUS.PREPARED });
  assert.deepEqual(await recovery.close(), { status: 'CLOSED' });
  return directory;
}

test('prepare is durable before transport and clean reopen reaches durable BOUND', async t => {
  const pair = await authorizedPair();
  const directory = privateDirectory(t);
  let calls = 0;
  let store = createZenonFundingPayerRecoverySqliteStore(storeOptions(directory));
  let recovery = owner(store, async () => {
    calls += 1;
    return fakeResponse(202, 'BOUND');
  });
  assert.deepEqual(await recovery.recover(), { status: 'EMPTY' });
  assert.deepEqual(await recovery.prepare(pair), { status: STATUS.PREPARED });
  assert.equal(calls, 0);
  assert.deepEqual(await recovery.close(), { status: 'CLOSED' });

  store = openZenonFundingPayerRecoverySqliteStore(storeOptions(directory));
  recovery = owner(store, async () => {
    calls += 1;
    return fakeResponse(202, 'BOUND');
  });
  assert.deepEqual(await recovery.recover(), { status: STATUS.PREPARED });
  assert.equal(calls, 0);
  assert.deepEqual(await recovery.submitPrepared(), { status: STATUS.BOUND });
  assert.equal(calls, 1);
  assert.deepEqual(await recovery.close(), { status: 'CLOSED' });

  store = openZenonFundingPayerRecoverySqliteStore(storeOptions(directory));
  recovery = owner(store, async () => {
    calls += 1;
    throw fixedFailure();
  });
  assert.deepEqual(await recovery.recover(), { status: STATUS.BOUND });
  assert.equal(calls, 1);
  await assert.rejects(recovery.replayUnknown(), rejectsCode(OWNER_CODES.invalidState));
  assert.deepEqual(await recovery.close(), { status: 'CLOSED' });
});

test('prepare persists only the invocation-time pair across asynchronous preflight', async t => {
  const first = await authorizedPair(10);
  const replacement = await authorizedPair(11);
  const mutableInput = {
    challenge: first.challenge,
    paymentSignatureHeader: first.paymentSignatureHeader,
  };
  const directory = privateDirectory(t);
  const store = createZenonFundingPayerRecoverySqliteStore(storeOptions(directory));
  const recovery = owner(store, async () => {
    throw fixedFailure();
  });
  await recovery.recover();
  const preparing = recovery.prepare(mutableInput);
  mutableInput.challenge = replacement.challenge;
  mutableInput.paymentSignatureHeader = replacement.paymentSignatureHeader;
  assert.deepEqual(await preparing, { status: STATUS.PREPARED });
  assert.deepEqual(await recovery.close(), { status: 'CLOSED' });

  const reopened = openZenonFundingPayerRecoverySqliteStore(storeOptions(directory));
  const retained = reopened.load();
  assert.equal(retained.challengeHeader, first.challenge.paymentRequiredHeader);
  assert.equal(retained.paymentHeader, first.paymentSignatureHeader);
  assert.notEqual(retained.paymentHeader, replacement.paymentSignatureHeader);
  reopened.close();
});

test('restart preserves unknown and later 400 or 409 cannot downgrade before exact BOUND', async t => {
  const pair = await authorizedPair(2);
  for (const [responseStatus, body] of [
    [400, 'Bad Request'],
    [409, 'Conflict'],
  ]) {
    const directory = privateDirectory(t);
    let store = createZenonFundingPayerRecoverySqliteStore(storeOptions(directory));
    let recovery = owner(store, async () => {
      throw new Error('SYNTHETIC_PRIVATE_TRANSPORT_DETAIL');
    });
    await recovery.recover();
    await recovery.prepare(pair);
    assert.deepEqual(await recovery.submitPrepared(), {
      status: STATUS.OUTCOME_UNKNOWN,
    });
    assert.deepEqual(await recovery.close(), { status: 'CLOSED' });

    let calls = 0;
    store = openZenonFundingPayerRecoverySqliteStore(storeOptions(directory));
    recovery = owner(store, async () => {
      calls += 1;
      return fakeResponse(responseStatus, body);
    });
    assert.deepEqual(await recovery.recover(), { status: STATUS.OUTCOME_UNKNOWN });
    assert.equal(calls, 0);
    assert.deepEqual(await recovery.replayUnknown(), {
      status: STATUS.OUTCOME_UNKNOWN,
    });
    assert.equal(calls, 1);
    assert.deepEqual(await recovery.close(), { status: 'CLOSED' });

    store = openZenonFundingPayerRecoverySqliteStore(storeOptions(directory));
    recovery = owner(store, async () => {
      calls += 1;
      return fakeResponse(202, 'BOUND');
    });
    assert.deepEqual(await recovery.recover(), { status: STATUS.OUTCOME_UNKNOWN });
    assert.deepEqual(await recovery.replayUnknown(), { status: STATUS.BOUND });
    assert.equal(calls, 2);
    assert.deepEqual(await recovery.close(), { status: 'CLOSED' });
  }
});

test('first exact rejection and conflict are terminal only before ambiguity', async t => {
  const pair = await authorizedPair(3);
  for (const [responseStatus, body, expected] of [
    [400, 'Bad Request', STATUS.PAYMENT_REJECTED],
    [409, 'Conflict', STATUS.PAYMENT_CONFLICT],
  ]) {
    const directory = privateDirectory(t);
    const store = createZenonFundingPayerRecoverySqliteStore(storeOptions(directory));
    const recovery = owner(store, async () => fakeResponse(responseStatus, body));
    await recovery.recover();
    await recovery.prepare(pair);
    assert.deepEqual(await recovery.submitPrepared(), { status: expected });
    await assert.rejects(recovery.replayUnknown(), rejectsCode(OWNER_CODES.invalidState));
    assert.deepEqual(await recovery.close(), { status: 'CLOSED' });
  }
});

test('different authorized bytes conflict without transport or public byte disclosure', async t => {
  const first = await authorizedPair(4);
  const second = await authorizedPair(5);
  const directory = privateDirectory(t);
  let calls = 0;
  const store = createZenonFundingPayerRecoverySqliteStore(storeOptions(directory));
  const recovery = owner(store, async () => {
    calls += 1;
    return fakeResponse(202, 'BOUND');
  });
  await recovery.recover();
  assert.deepEqual(await recovery.prepare(first), { status: STATUS.PREPARED });
  await assert.rejects(recovery.prepare(second), error => {
    assert.equal(errorCode(error), OWNER_CODES.conflict);
    assert.equal(String(error).includes(first.paymentSignatureHeader), false);
    assert.equal(String(error).includes(second.paymentSignatureHeader), false);
    return true;
  });
  assert.equal(calls, 0);
  assert.deepEqual(await recovery.close(), { status: 'CLOSED' });
});

test('fence and terminal commit uncertainty never authorize transport or public success', async t => {
  const pair = await authorizedPair(6);
  {
    const directory = privateDirectory(t);
    let armed = true;
    let calls = 0;
    let store = createZenonFundingPayerRecoverySqliteStore(storeOptions(directory, {
      afterCommit(operation) {
        if (armed && operation === 'fenceAttempt') throw fixedFailure();
      },
    }));
    let recovery = owner(store, async () => {
      calls += 1;
      return fakeResponse(202, 'BOUND');
    });
    await recovery.recover();
    await recovery.prepare(pair);
    await assert.rejects(
      recovery.submitPrepared(),
      rejectsCode(OWNER_CODES.storeOutcomeUnknown),
    );
    assert.equal(calls, 0);
    await Promise.resolve();
    await assert.rejects(
      recovery.recover(),
      rejectsCode(OWNER_CODES.quarantined),
    );
    await assert.rejects(
      recovery.submitPrepared(),
      rejectsCode(OWNER_CODES.quarantined),
    );
    assert.equal(calls, 0);
    assert.deepEqual(await recovery.close(), { status: 'CLOSED' });
    armed = false;
    store = openZenonFundingPayerRecoverySqliteStore(storeOptions(directory));
    recovery = owner(store, async () => {
      calls += 1;
      return fakeResponse(202, 'BOUND');
    });
    assert.deepEqual(await recovery.recover(), { status: STATUS.OUTCOME_UNKNOWN });
    assert.equal(calls, 0);
    assert.deepEqual(await recovery.close(), { status: 'CLOSED' });
  }

  {
    const directory = privateDirectory(t);
    let armed = true;
    let store = createZenonFundingPayerRecoverySqliteStore(storeOptions(directory, {
      afterCommit(operation) {
        if (armed && operation === 'finishAttempt') throw fixedFailure();
      },
    }));
    let recovery = owner(store, async () => fakeResponse(202, 'BOUND'));
    await recovery.recover();
    await recovery.prepare(pair);
    await assert.rejects(
      recovery.submitPrepared(),
      rejectsCode(OWNER_CODES.storeOutcomeUnknown),
    );
    assert.deepEqual(await recovery.close(), { status: 'CLOSED' });
    armed = false;
    store = openZenonFundingPayerRecoverySqliteStore(storeOptions(directory));
    recovery = owner(store, async () => {
      throw fixedFailure();
    });
    assert.deepEqual(await recovery.recover(), { status: STATUS.BOUND });
    assert.deepEqual(await recovery.close(), { status: 'CLOSED' });
  }
});

test('close and reentrant replay wait for a stalled admitted transport before lock release', async t => {
  const pair = await authorizedPair(7);
  const directory = privateDirectory(t);
  let release;
  let started;
  const startedPromise = new Promise(resolve => { started = resolve; });
  const transport = new Promise(resolve => { release = resolve; });
  const store = createZenonFundingPayerRecoverySqliteStore(storeOptions(directory));
  const recovery = owner(store, async () => {
    started();
    return transport;
  }, 10);
  await recovery.recover();
  await recovery.prepare(pair);
  const submission = recovery.submitPrepared();
  await startedPromise;
  await assert.rejects(recovery.submitPrepared(), rejectsCode(OWNER_CODES.busy));
  await assert.rejects(recovery.replayUnknown(), rejectsCode(OWNER_CODES.busy));
  assert.throws(
    () => openZenonFundingPayerRecoverySqliteStore(storeOptions(directory)),
    error => errorCode(error) === 'ZENON_FUNDING_PAYER_RECOVERY_STORE_OWNER_BUSY',
  );
  assert.deepEqual(await submission, { status: STATUS.OUTCOME_UNKNOWN });
  const closePromise = recovery.close();
  let closeSettled = false;
  closePromise.finally(() => { closeSettled = true; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(closeSettled, false);
  assert.throws(
    () => openZenonFundingPayerRecoverySqliteStore(storeOptions(directory)),
    error => errorCode(error) === 'ZENON_FUNDING_PAYER_RECOVERY_STORE_OWNER_BUSY',
  );
  release(fakeResponse(202, 'BOUND'));
  assert.deepEqual(await closePromise, { status: 'CLOSED' });
  const reopened = openZenonFundingPayerRecoverySqliteStore(storeOptions(directory));
  let replayCalls = 0;
  const restarted = owner(reopened, async () => {
    replayCalls += 1;
    throw fixedFailure();
  });
  assert.deepEqual(await restarted.recover(), {
    status: STATUS.OUTCOME_UNKNOWN,
  });
  assert.equal(replayCalls, 0);
  assert.deepEqual(await restarted.close(), { status: 'CLOSED' });
});

test('abrupt process death leaves a fenced attempt unknown and releases exclusive custody', async t => {
  const pair = await authorizedPair(8);
  const directory = await prepareStore(t, pair, undefined, false);
  const storeModule = pathToFileURL(join(
    process.cwd(),
    'src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js',
  )).href;
  const ownerModule = pathToFileURL(join(
    process.cwd(),
    'src/service-credit-zenon-funding-post-v1-payer-recovery-owner.js',
  )).href;
  const databasePath = join(directory, 'payer-recovery.sqlite');
  const childSource = `
    const storeModule = await import(process.argv[1]);
    const ownerModule = await import(process.argv[2]);
    const store = storeModule.openZenonFundingPayerRecoverySqliteStore({
      databasePath: process.argv[3],
      allowedRoot: process.argv[4],
      resourceUrl: process.argv[5],
    });
    const owner = ownerModule.createZenonFundingPostV1PayerRecoveryOwner({
      store,
      deadlineMs: 60000,
      fetchImpl: async () => {
        process.stdout.write('TRANSPORT\\n');
        return new Promise(() => {});
      },
    });
    await owner.recover();
    owner.submitPrepared();
  `;
  const child = spawn(process.execPath, [
    '--input-type=module',
    '-e',
    childSource,
    storeModule,
    ownerModule,
    databasePath,
    directory,
    RESOURCE_URL,
  ], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let childExitObserved = false;
  const childExited = new Promise(resolve => {
    const observe = () => {
      childExitObserved = true;
      resolve();
    };
    child.once('exit', observe);
    child.once('error', observe);
  });
  t.after(async () => {
    if (!childExitObserved) child.kill('SIGKILL');
    let timer;
    const reaped = await Promise.race([
      childExited.then(() => true),
      new Promise(resolve => {
        timer = setTimeout(() => resolve(false), 5_000);
      }),
    ]);
    clearTimeout(timer);
    if (!reaped) throw fixedFailure();
    try { rmSync(directory, { recursive: true, force: true }); }
    catch { throw fixedFailure(); }
  });
  const admitted = await Promise.race([
    new Promise(resolve => child.stdout.once('data', chunk => {
      resolve(String(chunk) === 'TRANSPORT\n');
    })),
    new Promise(resolve => setTimeout(() => resolve(false), 5_000)),
  ]);
  assert.equal(admitted, true);

  const contenderSource = `
    const storeModule = await import(process.argv[1]);
    try {
      const store = storeModule.openZenonFundingPayerRecoverySqliteStore({
        databasePath: process.argv[2],
        allowedRoot: process.argv[3],
        resourceUrl: process.argv[4],
      });
      store.close();
      process.exitCode = 2;
    } catch (error) {
      process.exitCode = error?.code === 'ZENON_FUNDING_PAYER_RECOVERY_STORE_OWNER_BUSY' ? 0 : 3;
    }
  `;
  const contender = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    contenderSource,
    storeModule,
    databasePath,
    directory,
    RESOURCE_URL,
  ], {
    stdio: ['ignore', 'ignore', 'ignore'],
    timeout: 5_000,
  });
  assert.equal(contender.status, 0);
  child.kill('SIGKILL');
  await childExited;

  let calls = 0;
  const store = openZenonFundingPayerRecoverySqliteStore(storeOptions(directory));
  const recovery = owner(store, async () => {
    calls += 1;
    return fakeResponse(202, 'BOUND');
  });
  assert.deepEqual(await recovery.recover(), { status: STATUS.OUTCOME_UNKNOWN });
  assert.equal(calls, 0);
  assert.deepEqual(await recovery.close(), { status: 'CLOSED' });
});

test('unsafe files and checksum-valid schema drift fail closed without recovery output', async t => {
  const pair = await authorizedPair(9);

  {
    const directory = await prepareStore(t, pair);
    const databasePath = join(directory, 'payer-recovery.sqlite');
    chmodSync(databasePath, 0o644);
    assert.throws(
      () => openZenonFundingPayerRecoverySqliteStore(storeOptions(directory)),
      error => errorCode(error) === 'ZENON_FUNDING_PAYER_RECOVERY_STORE_UNSAFE_FILE',
    );
    chmodSync(databasePath, 0o600);
  }

  {
    const directory = await prepareStore(t, pair);
    const databasePath = join(directory, 'payer-recovery.sqlite');
    const alias = join(directory, 'alias.sqlite');
    linkSync(databasePath, alias);
    assert.throws(
      () => openZenonFundingPayerRecoverySqliteStore(storeOptions(directory)),
      error => errorCode(error) === 'ZENON_FUNDING_PAYER_RECOVERY_STORE_UNSAFE_FILE',
    );
    rmSync(alias);
  }

  {
    const directory = await prepareStore(t, pair);
    const databasePath = join(directory, 'payer-recovery.sqlite');
    const alias = join(directory, 'alias.sqlite');
    symlinkSync(databasePath, alias);
    assert.throws(
      () => openZenonFundingPayerRecoverySqliteStore({
        databasePath: alias,
        allowedRoot: directory,
        resourceUrl: RESOURCE_URL,
      }),
    );
    rmSync(alias);
  }

  {
    const directory = await prepareStore(t, pair);
    const databasePath = join(directory, 'payer-recovery.sqlite');
    const database = new DatabaseSync(databasePath, { allowExtension: false });
    database.exec('PRAGMA user_version = 99');
    database.close();
    assert.throws(
      () => openZenonFundingPayerRecoverySqliteStore(storeOptions(directory)),
      error => errorCode(error) === 'ZENON_FUNDING_PAYER_RECOVERY_STORE_SCHEMA_UNSUPPORTED',
    );
  }
});

test('module boundary is default-off and excludes signing, wallet, RPC, and publication authority', () => {
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  for (const source of [SOURCE_OWNER, SOURCE_STORE]) {
    assert.doesNotMatch(source, /prepareBlock|publishRawTransaction|KeyPair|mnemonic|\.send\s*\(/);
    assert.doesNotMatch(source, /createServer|\.listen\s*\(|WebSocket|node:https/);
  }
  assert.doesNotMatch(SOURCE_OWNER, /settlement-journal|funding-publication-bridge/);
  assert.doesNotMatch(packageText, /payer-recovery-owner|payer-recovery-sqlite-store/);
  assert.match(SOURCE_OWNER, /replayUnknown/);
  assert.match(SOURCE_STORE, /locking_mode = EXCLUSIVE/);
  assert.match(SOURCE_STORE, /BEGIN IMMEDIATE/);
});

test('forged store prototypes fail owner construction with fixed invalid configuration', () => {
  const forgedStore = Object.create(ZenonFundingPayerRecoverySqliteStore.prototype);
  assert.throws(
    () => createZenonFundingPostV1PayerRecoveryOwner({
      store: forgedStore,
      deadlineMs: 1_000,
      fetchImpl: async () => {
        throw fixedFailure();
      },
    }),
    rejectsCode(OWNER_CODES.invalidConfiguration),
  );
});
