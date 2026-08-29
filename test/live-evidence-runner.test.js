import test from 'node:test';
import assert from 'node:assert/strict';
import { fork as forkProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import * as sdk from 'znn-typescript-sdk';
import { paymentIntentDigest } from '../src/canonical.js';
import {
  parseLiveEvidenceBundle,
  parseLiveEvidenceFragment,
  verifyLiveEvidenceBundle,
} from '../src/live-evidence.js';

import {
  OPERATOR_TRUST_ACKNOWLEDGEMENT,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
} from '../src/zenon/operator-trusted-testnet-profile.js';
import { encodeB64Json, HEADERS } from '../src/x402-wire.js';
import {
  createLifecycleCollector,
  createLiveEvidencePublicTransport,
  assembleLiveEvidenceRunCandidate,
  executeLiveEvidenceRun,
  parseLiveEvidenceRunConfig,
  parseLiveRoleInput,
  preflightLiveEvidenceRun,
  readLiveRoleInputFile,
} from '../src/live-evidence-runner.js';
import { runLiveEvidenceRunnerCli } from '../src/live-evidence-runner-cli.js';
import {
  assertLiveEvidenceFacilitatorController,
  createObservedFacilitatorAdapter,
  readInheritedLiveRoleInput,
  runLiveEvidenceFacilitatorWorker,
  startLiveEvidenceFacilitatorWorker,
} from '../src/live-evidence-facilitator-worker.js';
import {
  assertLiveEvidenceObserver,
  createLiveEvidenceObserver,
  finalizeLiveEvidenceTimeline,
  recordLiveEvidencePhase,
} from '../src/live-observation.js';
import { computeBlockHash, preflightZenonPayment } from '../src/zenon-payment.js';
import {
  EVIDENCE_STATES,
  SettlementJournal,
} from '../src/settlement-journal.js';

const PUBLIC_RESOURCE_URL = 'https://evidence.zenon.network/paid';
const SYNTHETIC_UTC = '2026-01-01T00:00:00.000Z';
const SYNTHETIC_FILE_GENERATION = Object.freeze({
  dev: '1',
  ino: '2',
  size: '3',
  mtimeNs: '4',
  ctimeNs: '5',
});
const CLOSING_FAKE_CHILDREN = new WeakSet();
const PHASES = Object.freeze({
  buyer: Object.freeze([
    'buyer_owner_wait_started',
    'buyer_owner_acquired',
    'buyer_readiness_started',
    'buyer_readiness_finished',
    'prepare_block_started',
    'prepare_block_finished',
    'buyer_owner_released',
  ]),
  facilitator: Object.freeze([
    'facilitator_owner_wait_started',
    'facilitator_owner_acquired',
    'facilitator_readiness_started',
    'facilitator_readiness_finished',
    'publication_started',
    'publication_acknowledged',
    'inclusion_wait_started',
    'momentum_inclusion_observed',
    'facilitator_owner_released',
    'delivery_started',
    'delivery_finished',
  ]),
});

function expectedPaymentRequired() {
  const payTo = sdk.Address.fromPublicKey(Buffer.alloc(32, 21)).toString();
  return {
    x402Version: 2,
    resource: {
      url: PUBLIC_RESOURCE_URL,
      description: 'Zenon x402 PoC protected resource',
      mimeType: 'application/json',
    },
    accepts: [{
      scheme: 'exact',
      network: 'zenon:testnet',
      asset: sdk.ZNN_ZTS.toString(),
      amount: '1',
      payTo,
      maxTimeoutSeconds: 60,
      extra: {
        paymentFlow: 'upfront',
        poc: true,
        settlement: 'account-block',
        zenonChain: { ...OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE },
      },
    }],
  };
}

const CONFIG = Object.freeze({
  runnerVersion: 1,
  sourceRevision: 'a'.repeat(40),
  profileName: OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
  acknowledgements: Object.freeze({
    live: TESTNET_LIVE_ACKNOWLEDGEMENT,
    operatorTrust: OPERATOR_TRUST_ACKNOWLEDGEMENT,
  }),
  expectedPaymentRequired: expectedPaymentRequired(),
  runtime: Object.freeze({
    listenPort: 41000,
    rpcTimeoutMs: 1000,
    maxRecoveryAttempts: 2,
    recoveryDelayMs: 0,
    maxRecoveryElapsedMs: 1000,
  }),
});

function configText(value = CONFIG) {
  return `${JSON.stringify(value)}\n`;
}

function fixedObserver() {
  let monotonicMs = 0;
  return createLiveEvidenceObserver({
    utcNow: () => SYNTHETIC_UTC,
    monotonicNow: () => {
      monotonicMs += 1;
      return monotonicMs;
    },
  });
}

async function validRunnerCandidate() {
  const buyer = sdk.KeyPair.fromPrivateKey(randomBytes(32));
  try {
    const paymentRequired = structuredClone(CONFIG.expectedPaymentRequired);
    const accepted = paymentRequired.accepts[0];
    const intentDigest = paymentIntentDigest(paymentRequired, accepted);
    const block = sdk.AccountBlockTemplate.send(
      sdk.Address.parse(accepted.payTo),
      sdk.TokenStandard.parse(accepted.asset),
      BigInt(accepted.amount),
    );
    block.chainIdentifier = Number(OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.chainIdentifier);
    block.address = buyer.getAddress();
    block.height = 1;
    block.momentumAcknowledged = new sdk.HashHeight(
      sdk.Hash.digest(Buffer.from('offline runner acknowledged momentum')),
      1,
    );
    block.data = Buffer.from(intentDigest, 'hex');
    block.fusedPlasma = 0;
    block.difficulty = 0;
    block.nonce = '0'.repeat(16);
    block.publicKey = buyer.getPublicKey();
    block.hash = computeBlockHash(block, sdk);
    block.signature = buyer.sign(block.hash.getBytes());
    const accountBlock = block.toJson();
    const paymentPayload = {
      x402Version: paymentRequired.x402Version,
      resource: structuredClone(paymentRequired.resource),
      accepted: structuredClone(accepted),
      payload: { transaction: accountBlock, intentDigest },
    };
    const preflight = await preflightZenonPayment(paymentPayload, accepted, paymentRequired);
    const confirmationDetail = {
      numConfirmations: 1,
      momentumHeight: 11,
      momentumHash: sdk.Hash.digest(Buffer.from('offline runner inclusion momentum')).toString(),
      momentumTimestamp: 1,
    };
    const body = {
      ok: true,
      message: 'paid resource unlocked',
      network: accepted.network,
      payer: preflight.payer,
      transaction: preflight.transactionHash,
      generatedAt: SYNTHETIC_UTC,
    };
    const record = {
      authorizationKey: preflight.authorizationKey,
      transactionHash: preflight.transactionHash,
      chainProfile: structuredClone(preflight.chainProfile),
      intentDigest,
      resourceIdentity: structuredClone(paymentRequired.resource),
      resourceDigest: preflight.resourceDigest,
      payer: preflight.payer,
      signedAccountBlock: structuredClone(accountBlock),
      evidenceState: 'MOMENTUM_INCLUDED',
      momentumEvidence: {
        observedAt: SYNTHETIC_UTC,
        confirmationDetail,
      },
      deliveryState: 'DELIVERED',
      cachedResponse: {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body,
      },
      createdAt: SYNTHETIC_UTC,
      updatedAt: SYNTHETIC_UTC,
    };
    const collector = createLifecycleCollector();
    const coordinator = fixedObserver();
    const facilitator = fixedObserver();
    collector.record(coordinator, 'runner', 'challenge_request_started');
    const initialEvent = collector.record(coordinator, 'runner', 'challenge_402_received');
    for (let index = 0; index < PHASES.buyer.length; index += 1) {
      collector.record(coordinator, 'buyer', PHASES.buyer[index]);
    }
    for (let index = 0; index < PHASES.facilitator.length; index += 1) {
      collector.record(facilitator, 'facilitator', PHASES.facilitator[index]);
    }
    const finalEvent = collector.record(coordinator, 'runner', 'paid_response_received');
    collector.close();
    const timeline = finalizeLiveEvidenceTimeline(collector.snapshot().events);
    const settlement = {
      success: true,
      network: accepted.network,
      transaction: preflight.transactionHash,
      payer: preflight.payer,
      state: 'MOMENTUM_INCLUDED',
    };
    return {
      config: CONFIG,
      context: {
        outcome: {
          paymentPayload,
          paymentRequired,
          settlement,
          initialObservedAt: initialEvent.utc,
          final: {
            status: 200,
            contentType: 'application/json; charset=utf-8',
            cacheControl: 'private, no-store, max-age=0',
            vary: 'PAYMENT-SIGNATURE',
            bodyText: JSON.stringify(body, null, 2),
          },
        },
        events: timeline,
        initialObservedAt: initialEvent.utc,
        finalEvent,
        journalSnapshot: {
          quiescent: true,
          schemaVersion: 1,
          revision: 5,
          records: [record],
        },
      },
      body,
    };
  } finally {
    buyer.clear();
  }
}

function recordRole(observer, role) {
  const output = [];
  for (let index = 0; index < PHASES[role].length; index += 1) {
    output.push(recordLiveEvidencePhase(observer, role, PHASES[role][index]));
  }
  return output;
}

function globallySequence(events) {
  return events.map((event, sequence) => Object.freeze({
    sequence,
    phase: event.phase,
    role: event.role,
    clockDomain: event.clockDomain,
    utc: event.utc,
    monotonicMs: event.monotonicMs,
  }));
}

async function privateFixture(t, config = CONFIG) {
  const createdRoot = await mkdtemp(join(tmpdir(), 'live-evidence-runner-'));
  t.after(() => rm(createdRoot, { recursive: true, force: true }));
  const root = await realpath(createdRoot);
  await chmod(root, 0o700);
  const workspaceRoot = join(root, 'workspace');
  await mkdir(workspaceRoot, { mode: 0o700 });
  const configPath = join(workspaceRoot, 'run.json');
  const buyerRpcPath = join(workspaceRoot, 'buyer-rpc.json');
  const buyerWalletPath = join(workspaceRoot, 'buyer-wallet.json');
  const facilitatorRpcPath = join(workspaceRoot, 'facilitator-rpc.json');
  await writeFile(configPath, configText(config), { mode: 0o600 });
  await writeFile(
    buyerRpcPath,
    '{"secretVersion":1,"rpcEndpoint":"wss://buyer.invalid/"}\n',
    { mode: 0o600 },
  );
  await writeFile(
    buyerWalletPath,
    '{"secretVersion":1,"mnemonic":"offline-placeholder-only","accountIndex":0}\n',
    { mode: 0o600 },
  );
  await writeFile(
    facilitatorRpcPath,
    '{"secretVersion":1,"rpcEndpoint":"wss://facilitator.invalid/"}\n',
    { mode: 0o600 },
  );
  return {
    configPath,
    buyerRpcPath,
    buyerWalletPath,
    facilitatorRpcPath,
    workspaceRoot,
    runName: 'single-use-run',
  };
}

function generationFromStat(stat) {
  return {
    dev: stat.dev.toString(),
    ino: stat.ino.toString(),
    size: stat.size.toString(),
    mtimeNs: stat.mtimeNs.toString(),
    ctimeNs: stat.ctimeNs.toString(),
  };
}

function journalInputFromRecord(record) {
  return {
    authorizationKey: record.authorizationKey,
    transactionHash: record.transactionHash,
    chainProfile: structuredClone(record.chainProfile),
    intentDigest: record.intentDigest,
    resourceIdentity: structuredClone(record.resourceIdentity),
    resourceDigest: record.resourceDigest,
    payer: record.payer,
    signedAccountBlock: structuredClone(record.signedAccountBlock),
  };
}

function assertFixedRunFailure(error) {
  return error?.code === 'live_evidence_run_invalid' && error?.cause === undefined;
}

test('observer is synchronous, branded, descriptor-safe, bounded, and finalizes exact phases', () => {
  const collector = createLifecycleCollector();
  const observer = fixedObserver();
  assert.equal(assertLiveEvidenceObserver(observer), observer);
  assert.throws(() => assertLiveEvidenceObserver({}), /live_observation_invalid/);
  const first = collector.record(observer, 'runner', 'challenge_request_started');
  const second = collector.record(observer, 'runner', 'challenge_402_received');
  const buyer = recordRole(observer, 'buyer');
  const facilitatorObserver = fixedObserver();
  const facilitator = recordRole(facilitatorObserver, 'facilitator');
  const final = recordLiveEvidencePhase(observer, 'runner', 'paid_response_received');
  const validEvents = globallySequence([first, second, ...buyer, ...facilitator, final]);
  const timeline = finalizeLiveEvidenceTimeline(validEvents);
  assert.equal(timeline.length, 21);
  assert.equal(Object.isFrozen(timeline), true);
  assert.equal(Object.isFrozen(timeline[0]), true);
  assert.deepEqual(timeline.map(event => event.sequence), Array.from({ length: 21 }, (_, index) => index));

  let selectorClockReads = 0;
  const selectorObserver = createLiveEvidenceObserver({
    utcNow: () => { selectorClockReads += 1; return SYNTHETIC_UTC; },
    monotonicNow: () => { selectorClockReads += 1; return 1; },
  });
  assert.throws(() => recordLiveEvidencePhase(selectorObserver, {}, 'challenge_request_started'));
  assert.equal(selectorClockReads, 0);

  let getterReads = 0;
  const hostileOptions = {};
  Object.defineProperty(hostileOptions, 'utcNow', {
    enumerable: true,
    get() { getterReads += 1; return () => SYNTHETIC_UTC; },
  });
  Object.defineProperty(hostileOptions, 'monotonicNow', {
    enumerable: true,
    value: () => 1,
  });
  assert.throws(() => createLiveEvidenceObserver(hostileOptions));
  assert.equal(getterReads, 0);
  const thenableClock = createLiveEvidenceObserver({
    utcNow: () => ({ then() {} }),
    monotonicNow: () => ({ then() {} }),
  });
  assert.equal(recordLiveEvidencePhase(thenableClock, 'runner', 'challenge_request_started'), null);
  assert.throws(
    () => recordLiveEvidencePhase(thenableClock, 'runner', 'challenge_402_received'),
    /live_observation_invalid/,
  );

  let utcReceiver = 'unset';
  let monotonicReceiver = 'unset';
  const receiverObserver = createLiveEvidenceObserver({
    utcNow() { utcReceiver = this; return SYNTHETIC_UTC; },
    monotonicNow() { monotonicReceiver = this; return 1; },
  });
  assert.ok(recordLiveEvidencePhase(receiverObserver, 'runner', 'challenge_request_started'));
  assert.equal(utcReceiver, undefined);
  assert.equal(monotonicReceiver, undefined);

  let reenter = false;
  let reentrantObserver;
  reentrantObserver = createLiveEvidenceObserver({
    utcNow: () => {
      if (reenter) {
        assert.throws(
          () => recordLiveEvidencePhase(reentrantObserver, 'runner', 'challenge_402_received'),
          /live_observation_invalid/,
        );
      }
      return SYNTHETIC_UTC;
    },
    monotonicNow: () => 1,
  });
  const beforeFault = recordLiveEvidencePhase(
    reentrantObserver,
    'runner',
    'challenge_request_started',
  );
  reenter = true;
  assert.equal(
    recordLiveEvidencePhase(reentrantObserver, 'runner', 'challenge_402_received'),
    null,
  );
  assert.throws(
    () => recordLiveEvidencePhase(reentrantObserver, 'runner', 'paid_response_received'),
    /live_observation_invalid/,
  );
  assert.throws(() => finalizeLiveEvidenceTimeline([beforeFault]), /live_observation_invalid/);

  let monotonicReenter = false;
  let monotonicReentrantObserver;
  monotonicReentrantObserver = createLiveEvidenceObserver({
    utcNow: () => SYNTHETIC_UTC,
    monotonicNow: () => {
      if (monotonicReenter) {
        assert.throws(
          () => recordLiveEvidencePhase(
            monotonicReentrantObserver,
            'runner',
            'challenge_402_received',
          ),
          /live_observation_invalid/,
        );
      }
      return 1;
    },
  });
  const beforeMonotonicFault = recordLiveEvidencePhase(
    monotonicReentrantObserver,
    'runner',
    'challenge_request_started',
  );
  monotonicReenter = true;
  assert.equal(
    recordLiveEvidencePhase(
      monotonicReentrantObserver,
      'runner',
      'challenge_402_received',
    ),
    null,
  );
  assert.throws(
    () => recordLiveEvidencePhase(
      monotonicReentrantObserver,
      'runner',
      'paid_response_received',
    ),
    /live_observation_invalid/,
  );
  assert.throws(
    () => finalizeLiveEvidenceTimeline([beforeMonotonicFault]),
    /live_observation_invalid/,
  );

  let finalizeObserver;
  finalizeObserver = createLiveEvidenceObserver({
    utcNow: () => {
      assert.throws(() => finalizeLiveEvidenceTimeline([]), /live_observation_invalid/);
      return SYNTHETIC_UTC;
    },
    monotonicNow: () => 1,
  });
  assert.equal(
    recordLiveEvidencePhase(finalizeObserver, 'runner', 'challenge_request_started'),
    null,
  );
  assert.throws(
    () => recordLiveEvidencePhase(finalizeObserver, 'runner', 'challenge_402_received'),
    /live_observation_invalid/,
  );

  const optionTrapReads = { value: 0 };
  const transparentOptions = new Proxy({}, {
    getPrototypeOf() { optionTrapReads.value += 1; return Object.prototype; },
  });
  assert.throws(() => createLiveEvidenceObserver(transparentOptions), /live_observation_invalid/);
  assert.equal(optionTrapReads.value, 0);
  const eventTrapReads = { value: 0 };
  const transparentEvent = new Proxy({}, {
    getPrototypeOf() { eventTrapReads.value += 1; return Object.prototype; },
  });
  assert.throws(() => finalizeLiveEvidenceTimeline([transparentEvent]), /live_observation_invalid/);
  assert.equal(eventTrapReads.value, 0);
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();
  assert.throws(() => assertLiveEvidenceObserver(revocable.proxy));
  const revokedOptions = Proxy.revocable({}, {});
  revokedOptions.revoke();
  assert.throws(() => createLiveEvidenceObserver(revokedOptions.proxy), /live_observation_invalid/);
  const revokedEvent = Proxy.revocable({}, {});
  revokedEvent.revoke();
  assert.throws(() => finalizeLiveEvidenceTimeline([revokedEvent.proxy]), /live_observation_invalid/);
  const revokedEvents = Proxy.revocable([], {});
  revokedEvents.revoke();
  assert.throws(() => finalizeLiveEvidenceTimeline(revokedEvents.proxy), /live_observation_invalid/);

  for (const sequence of [-0, -1, 21, 1.5, Number.MAX_SAFE_INTEGER]) {
    const tampered = validEvents.map(event => ({ ...event }));
    tampered[0].sequence = sequence;
    assert.throws(() => finalizeLiveEvidenceTimeline(tampered), /live_observation_invalid/);
  }
  const duplicateSequence = validEvents.map(event => ({ ...event }));
  duplicateSequence[1].sequence = 0;
  assert.throws(() => finalizeLiveEvidenceTimeline(duplicateSequence), /live_observation_invalid/);
});

test('config accepts only canonical public HTTPS paid URL and canonical WSS inputs', () => {
  const parsed = parseLiveEvidenceRunConfig(configText());
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(parsed.expectedPaymentRequired.resource.url, PUBLIC_RESOURCE_URL);
  const invalidUrls = [
    'http://evidence.zenon.network/paid',
    'https://evidence.zenon.network/paid?',
    'https://evidence.zenon.network/paid#',
    'https://user@evidence.zenon.network/paid',
    'https://evidence.zenon.network/not-paid',
    'https://evidence.zenon.network:443/paid',
    'https://EVIDENCE.zenon.network/paid',
    'https://evidence.zenon.network/a/../paid',
    'https://127.0.0.1/paid',
    'https://host.invalid/paid',
    'https://evidence.example.com/paid',
  ];
  for (let index = 0; index < invalidUrls.length; index += 1) {
    const candidate = {
      ...CONFIG,
      expectedPaymentRequired: {
        ...CONFIG.expectedPaymentRequired,
        resource: { ...CONFIG.expectedPaymentRequired.resource, url: invalidUrls[index] },
      },
    };
    assert.throws(() => parseLiveEvidenceRunConfig(configText(candidate)), assertFixedRunFailure);
  }
  assert.throws(
    () => parseLiveEvidenceRunConfig(configText().replace(
      '"runnerVersion":1',
      '"runnerVersion":1,"runnerVersion":1',
    )),
    assertFixedRunFailure,
  );
  assert.deepEqual(
    parseLiveRoleInput('{"secretVersion":1,"rpcEndpoint":"wss://node.invalid/"}\n', 'buyer-rpc'),
    { secretVersion: 1, rpcEndpoint: 'wss://node.invalid/' },
  );
  for (const endpoint of [
    'ws://node.invalid/',
    'wss://node.invalid',
    'wss://node.invalid/?',
    'wss://user@node.invalid/',
  ]) {
    assert.throws(
      () => parseLiveRoleInput(JSON.stringify({ secretVersion: 1, rpcEndpoint: endpoint }), 'buyer-rpc'),
      assertFixedRunFailure,
    );
  }
});

test('public HTTPS transport resolves once, rejects private answers, and pins request lookup', async () => {
  let resolutionCalls = 0;
  let requestCalls = 0;
  let pinnedAddress;
  const resolveAddresses = async () => {
    resolutionCalls += 1;
    return [{ address: ['93', '184', '216', '34'].join('.'), family: 4 }];
  };
  const requestHttps = (_url, options, callback) => {
    requestCalls += 1;
    const request = new EventEmitter();
    request.end = () => {
      options.lookup('evidence.zenon.network', { all: true }, (error, addresses) => {
        assert.equal(error, null);
        pinnedAddress = addresses[0].address;
      });
      options.lookup('changed.zenon.network', { all: false }, error => {
        assert.ok(error);
      });
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = { 'content-type': 'application/json; charset=utf-8' };
      callback(response);
      setImmediate(() => {
        response.emit('data', Buffer.from(JSON.stringify({ ok: true }, null, 2)));
        response.emit('end');
      });
    };
    request.destroy = () => {};
    return request;
  };
  const transport = await createLiveEvidencePublicTransport({
    resourceUrl: PUBLIC_RESOURCE_URL,
    timeoutMs: 100,
    resolveAddresses,
    requestHttps,
  });
  const response = await transport.fetch(transport.healthUrl, { redirect: 'manual' });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), JSON.stringify({ ok: true }, null, 2));
  assert.equal(resolutionCalls, 1);
  assert.equal(requestCalls, 1);
  assert.equal(pinnedAddress, ['93', '184', '216', '34'].join('.'));

  const paid = await transport.fetch(PUBLIC_RESOURCE_URL, { redirect: 'manual' });
  const recovered = await transport.fetch(PUBLIC_RESOURCE_URL, { redirect: 'manual' });
  assert.equal(paid.status, 200);
  assert.equal(recovered.status, 200);
  assert.equal(resolutionCalls, 1);
  assert.equal(requestCalls, 3);

  await assert.rejects(createLiveEvidencePublicTransport({
    resourceUrl: PUBLIC_RESOURCE_URL,
    timeoutMs: 100,
    resolveAddresses: async () => [{ address: '127.0.0.1', family: 4 }],
    requestHttps,
  }), assertFixedRunFailure);
  await assert.rejects(createLiveEvidencePublicTransport({
    resourceUrl: PUBLIC_RESOURCE_URL,
    timeoutMs: 1,
    resolveAddresses: async () => new Promise(() => {}),
    requestHttps,
  }), assertFixedRunFailure);

  for (const address of [
    '64:ff9b::1',
    '64:ff9b:1::1',
    '2001::1',
    '2001:2::1',
    '2002::1',
    'fec0::1',
  ]) {
    await assert.rejects(createLiveEvidencePublicTransport({
      resourceUrl: PUBLIC_RESOURCE_URL,
      timeoutMs: 100,
      resolveAddresses: async () => [{ address, family: 6 }],
      requestHttps,
    }), assertFixedRunFailure);
  }

  const hungTransport = await createLiveEvidencePublicTransport({
    resourceUrl: PUBLIC_RESOURCE_URL,
    timeoutMs: 5,
    resolveAddresses,
    requestHttps: (_url, _options, callback) => {
      const request = new EventEmitter();
      request.end = () => {
        const response = new EventEmitter();
        response.statusCode = 200;
        response.headers = {};
        callback(response);
      };
      request.destroy = () => {};
      return request;
    },
  });
  await assert.rejects(
    hungTransport.fetch(PUBLIC_RESOURCE_URL, { redirect: 'manual' }),
    assertFixedRunFailure,
  );
});

test('preflight binds verified role descriptors and rejects permissions, aliases, links, and swaps', async t => {
  const fixture = await privateFixture(t);
  const result = await preflightLiveEvidenceRun(fixture);
  assert.deepEqual(result, { valid: true });

  const stat = await lstat(fixture.buyerRpcPath);
  const identity = { dev: String(stat.dev), ino: String(stat.ino), size: String(stat.size) };
  const replacement = join(fixture.workspaceRoot, 'replacement.json');
  await writeFile(replacement, '{"secretVersion":1,"rpcEndpoint":"wss://replacement.invalid/"}\n', {
    mode: 0o600,
  });
  const original = join(fixture.workspaceRoot, 'original.json');
  await rename(fixture.buyerRpcPath, original);
  await rename(replacement, fixture.buyerRpcPath);
  await assert.rejects(
    readLiveRoleInputFile(fixture.buyerRpcPath, 'buyer-rpc', fixture.workspaceRoot, {
      ...identity,
      mtimeNs: '0',
      ctimeNs: '0',
    }),
    assertFixedRunFailure,
  );

  const modeFixture = await privateFixture(t);
  await chmod(modeFixture.buyerWalletPath, 0o640);
  await assert.rejects(preflightLiveEvidenceRun(modeFixture), assertFixedRunFailure);

  const aliasFixture = await privateFixture(t);
  await assert.rejects(preflightLiveEvidenceRun({
    ...aliasFixture,
    buyerWalletPath: aliasFixture.buyerRpcPath,
  }), assertFixedRunFailure);

  const hardlinkFixture = await privateFixture(t);
  const linked = join(hardlinkFixture.workspaceRoot, 'linked.json');
  await link(hardlinkFixture.buyerRpcPath, linked);
  await assert.rejects(preflightLiveEvidenceRun(hardlinkFixture), assertFixedRunFailure);

  const symlinkFixture = await privateFixture(t);
  const target = join(symlinkFixture.workspaceRoot, 'target.json');
  await rename(symlinkFixture.buyerRpcPath, target);
  await symlink(target, symlinkFixture.buyerRpcPath);
  await assert.rejects(preflightLiveEvidenceRun(symlinkFixture), assertFixedRunFailure);

  const parentFixture = await privateFixture(t);
  const realDirectory = join(parentFixture.workspaceRoot, 'real');
  const linkedDirectory = join(parentFixture.workspaceRoot, 'linked-parent');
  await mkdir(realDirectory, { mode: 0o700 });
  const nestedRpc = join(realDirectory, 'rpc.json');
  await writeFile(nestedRpc, '{"secretVersion":1,"rpcEndpoint":"wss://node.invalid/"}\n', {
    mode: 0o600,
  });
  await symlink(realDirectory, linkedDirectory);
  await assert.rejects(preflightLiveEvidenceRun({
    ...parentFixture,
    buyerRpcPath: join(linkedDirectory, 'rpc.json'),
  }), assertFixedRunFailure);

  const directoryModeFixture = await privateFixture(t);
  const restrictedParent = join(directoryModeFixture.workspaceRoot, 'restricted-parent');
  await mkdir(restrictedParent, { mode: 0o755 });
  const nestedRole = join(restrictedParent, 'rpc.json');
  await writeFile(nestedRole, '{"secretVersion":1,"rpcEndpoint":"wss://node.invalid/"}\n', {
    mode: 0o600,
  });
  await assert.rejects(preflightLiveEvidenceRun({
    ...directoryModeFixture,
    buyerRpcPath: nestedRole,
  }), assertFixedRunFailure);

  const workspaceAliasFixture = await privateFixture(t);
  const aliasRoot = join(dirname(workspaceAliasFixture.workspaceRoot), 'workspace-alias');
  await symlink(workspaceAliasFixture.workspaceRoot, aliasRoot);
  await assert.rejects(preflightLiveEvidenceRun({
    ...workspaceAliasFixture,
    workspaceRoot: aliasRoot,
    configPath: join(aliasRoot, 'run.json'),
    buyerRpcPath: join(aliasRoot, 'buyer-rpc.json'),
    buyerWalletPath: join(aliasRoot, 'buyer-wallet.json'),
    facilitatorRpcPath: join(aliasRoot, 'facilitator-rpc.json'),
  }), assertFixedRunFailure);
});

test('one verified role-input generation rejects same-size rewrites and is inherited without IPC disclosure', async t => {
  const fixture = await privateFixture(t);
  const handle = await open(fixture.facilitatorRpcPath, 'r');
  t.after(() => handle.close().catch(() => {}));
  const before = await handle.stat({ bigint: true });
  const generation = generationFromStat(before);
  const original = await readFile(fixture.facilitatorRpcPath, 'utf8');
  const replacement = original.replace('facilitator', 'replacement');
  assert.equal(Buffer.byteLength(replacement), Buffer.byteLength(original));
  await writeFile(fixture.facilitatorRpcPath, replacement, { mode: 0o600 });
  await assert.rejects(
    readInheritedLiveRoleInput(handle.fd, generation, 'facilitator-rpc'),
    error => error?.code === 'live_evidence_worker_failed' && error?.cause === undefined,
  );

  const freshHandle = await open(fixture.facilitatorRpcPath, 'r');
  t.after(() => freshHandle.close().catch(() => {}));
  const freshGeneration = generationFromStat(await freshHandle.stat({ bigint: true }));
  let forkOptions;
  let startMessage;
  const child = fakeProtocolChild(message => {
    startMessage = message;
    if (message.type === 'START') return workerMessage(message.requestId, 'READY');
    if (message.type === 'STOP') {
      emitFakeChildExitAndClose(child, 0, null);
      return workerMessage(message.requestId, 'STOPPED', { snapshot: null });
    }
    return workerMessage(message.requestId, 'STATUS', { poisoned: false });
  });
  const controller = await startLiveEvidenceFacilitatorWorker({
    config: CONFIG,
    facilitatorRpcFd: freshHandle.fd,
    facilitatorRpcGeneration: freshGeneration,
    workspaceRoot: fixture.workspaceRoot,
    journalDirectory: join(fixture.workspaceRoot, 'journal'),
    recovery: false,
    forkProcess: (_module, _args, options) => {
      forkOptions = options;
      return child;
    },
  });
  await controller.start();
  assert.equal(forkOptions.stdio[4], freshHandle.fd);
  assert.equal(Object.hasOwn(startMessage, 'facilitatorRpcFd'), false);
  assert.equal(Object.hasOwn(startMessage, 'facilitatorRpcPath'), false);
  assert.equal(Object.hasOwn(startMessage, 'facilitatorRpcGeneration'), true);
  await controller.exit();
});

function cleanController() {
  const observer = fixedObserver();
  const events = recordRole(observer, 'facilitator');
  let exited = false;
  return {
    async start() {},
    async snapshotObservations() {
      return { evidenceEligible: true, events };
    },
    async poisoned() { return false; },
    async closeAndSnapshot() {
      exited = true;
      return { quiescent: true, schemaVersion: 1, revision: 5, records: [{}] };
    },
    async exit() { exited = true; },
    async terminate() { exited = true; },
    async exited() { return exited; },
  };
}

test('clean operational path uses the exact operations contract and one payment construction', async t => {
  const fixture = await privateFixture(t);
  const calls = {
    buyerReadiness: 0,
    facilitatorStart: 0,
    walletRead: 0,
    paidFetch: 0,
    reconcile: 0,
    assemble: 0,
  };
  const coordinatorObserver = fixedObserver();
  const operations = {
    async probeBuyerReadiness({ config }) {
      calls.buyerReadiness += 1;
      assert.equal(config.runnerVersion, 1);
    },
    async probePublicEndpoint() {},
    async startFacilitator({ recovery }) {
      calls.facilitatorStart += 1;
      assert.equal(recovery, false);
      return cleanController();
    },
    async readBuyerWallet() {
      calls.walletRead += 1;
      return Object.freeze({ mnemonic: 'offline-placeholder-only', accountIndex: 0 });
    },
    async paidFetch({ lifecycleObserver, onChallenge, openWallet }) {
      calls.paidFetch += 1;
      assert.equal(lifecycleObserver, coordinatorObserver);
      const challenge = await onChallenge(CONFIG.expectedPaymentRequired);
      const buyerObservations = recordRole(lifecycleObserver, 'buyer');
      await openWallet();
      return {
        kind: 'delivered',
        buyerObservations,
        initialObservedAt: challenge.utc,
        paymentRequired: CONFIG.expectedPaymentRequired,
        paymentPayload: {},
        settlement: { success: true },
        final: {
          status: 200,
          contentType: 'application/json; charset=utf-8',
          cacheControl: 'private, no-store',
          vary: 'PAYMENT-SIGNATURE',
          bodyText: '{}',
        },
      };
    },
    async reconcilePayment() { calls.reconcile += 1; },
    async assembleCandidate(context) {
      calls.assemble += 1;
      assert.equal(context.events.length, 21);
      assert.equal(context.runDirectory, join(fixture.workspaceRoot, fixture.runName));
    },
    submissionArmed() { return true; },
  };
  const result = await executeLiveEvidenceRun(fixture, {
    operations,
    lifecycleObserver: coordinatorObserver,
  });
  assert.deepEqual(result, { status: 'complete', evidenceEligible: true });
  assert.deepEqual(calls, {
    buyerReadiness: 1,
    facilitatorStart: 1,
    walletRead: 1,
    paidFetch: 1,
    reconcile: 0,
    assemble: 1,
  });
  const runStat = await lstat(join(fixture.workspaceRoot, fixture.runName));
  assert.equal(runStat.mode & 0o777, 0o700);
});

test('real default runner composition stays offline and produces a verified private bundle', async t => {
  const candidate = await validRunnerCandidate();
  const fixture = await privateFixture(t, candidate.config);
  const facilitatorEvents = recordRole(fixedObserver(), 'facilitator');
  const requestKinds = [];
  let paymentConstructions = 0;
  let readinessCalls = 0;
  let inheritedFd;
  let startMessage;
  let child;

  const requestHttps = (url, options, callback) => {
    const request = new EventEmitter();
    request.destroy = () => {};
    request.end = () => {
      void (async () => {
        options.lookup('evidence.zenon.network', { all: true }, (error, addresses) => {
          assert.equal(error, null);
          assert.equal(addresses.length, 1);
        });
        const isHealth = url.pathname === '/health';
        const isPaid = url.pathname === '/paid';
        const hasPayment = Boolean(options.headers?.[HEADERS.PAYMENT_SIGNATURE]);
        requestKinds.push(isHealth ? 'health' : hasPayment ? 'paid' : 'challenge');
        const response = new EventEmitter();
        if (isHealth) {
          response.statusCode = 200;
          response.headers = { 'content-type': 'application/json; charset=utf-8' };
          callback(response);
          response.emit('data', Buffer.from(JSON.stringify({ ok: true }, null, 2)));
        } else if (isPaid && !hasPayment) {
          response.statusCode = 402;
          response.headers = {
            [HEADERS.PAYMENT_REQUIRED]: encodeB64Json(candidate.context.outcome.paymentRequired),
          };
          callback(response);
        } else {
          assert.equal(isPaid, true);
          assert.equal(
            (await lstat(join(fixture.workspaceRoot, fixture.runName, 'SUBMISSION_ARMED'))).isFile(),
            true,
          );
          response.statusCode = 200;
          response.headers = {
            [HEADERS.PAYMENT_RESPONSE]: encodeB64Json(candidate.context.outcome.settlement),
            'content-type': candidate.context.outcome.final.contentType,
            'cache-control': candidate.context.outcome.final.cacheControl,
            vary: candidate.context.outcome.final.vary,
          };
          callback(response);
          response.emit('data', Buffer.from(candidate.context.outcome.final.bodyText));
        }
        response.emit('end');
      })().catch(() => request.emit('error'));
    };
    return request;
  };

  const forkProcess = (_module, _args, options) => {
    inheritedFd = options.stdio[4];
    child = new EventEmitter();
    child.connected = true;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.disconnect = () => { child.connected = false; };
    child.kill = () => {
      child.connected = false;
      emitFakeChildExitAndClose(child, 0, null);
      return true;
    };
    child.send = (message, callback) => {
      callback?.();
      setImmediate(() => {
        let reply;
        if (message.type === 'START') {
          startMessage = message;
          reply = workerMessage(message.requestId, 'READY');
        } else if (message.type === 'OBSERVATIONS') {
          reply = workerMessage(message.requestId, 'OBSERVATIONS', {
            evidenceEligible: true,
            events: facilitatorEvents,
          });
        } else if (message.type === 'STATUS') {
          reply = workerMessage(message.requestId, 'STATUS', { poisoned: false });
        } else if (message.type === 'STOP') {
          reply = workerMessage(message.requestId, 'STOPPED', {
            snapshot: message.final ? candidate.context.journalSnapshot : null,
          });
        }
        child.emit('message', reply);
        if (message.type === 'STOP') {
          emitFakeChildExitAndClose(child, 0, null);
        }
      });
      return true;
    };
    return child;
  };

  const createZenonClient = options => {
    const buyerEvents = recordRole(options.lifecycleObserver, 'buyer');
    return {
      async createPaymentPayload() {
        paymentConstructions += 1;
        return structuredClone(candidate.context.outcome.paymentPayload);
      },
      snapshotLiveEvidenceObservations() {
        return buyerEvents;
      },
    };
  };

  const stdout = [];
  const stderr = [];
  const flags = [
    '--config', fixture.configPath,
    '--buyer-rpc', fixture.buyerRpcPath,
    '--buyer-wallet', fixture.buyerWalletPath,
    '--facilitator-rpc', fixture.facilitatorRpcPath,
    '--workspace', fixture.workspaceRoot,
    '--run-name', fixture.runName,
  ];
  const preflightOutput = [];
  const preflightErrors = [];
  assert.equal(await runLiveEvidenceRunnerCli({
    argv: ['preflight', ...flags],
    stdout: value => { preflightOutput.push(value); },
    stderr: value => { preflightErrors.push(value); },
  }), true);
  assert.deepEqual(preflightOutput, ['LIVE_EVIDENCE_RUN_PREFLIGHT_VALID\n']);
  assert.deepEqual(preflightErrors, []);
  const cliResult = await runLiveEvidenceRunnerCli({
    argv: ['run', ...flags],
    stdout: value => { stdout.push(value); },
    stderr: value => { stderr.push(value); },
    executeInjections: {
      lifecycleObserver: fixedObserver(),
      dependencies: {
        probeZenonRoleReadiness: async () => { readinessCalls += 1; },
        resolveAddresses: async () => [{ address: '93.184.216.34', family: 4 }],
        requestHttps,
        createZenonClient,
        forkProcess,
      },
    },
  });
  assert.equal(cliResult, true);
  assert.deepEqual(stdout, ['LIVE_EVIDENCE_RUN_COMPLETE\n']);
  assert.deepEqual(stderr, []);
  assert.deepEqual(requestKinds, ['health', 'challenge', 'paid']);
  assert.equal(paymentConstructions, 1);
  assert.equal(readinessCalls, 1);
  assert.equal(Number.isSafeInteger(inheritedFd), true);
  assert.equal(Object.hasOwn(startMessage, 'facilitatorRpcGeneration'), true);
  assert.equal(Object.hasOwn(startMessage, 'facilitatorRpcPath'), false);
  assert.equal(Object.hasOwn(startMessage, 'facilitatorRpcFd'), false);
  const evidenceDirectory = join(fixture.workspaceRoot, fixture.runName, 'evidence');
  const bundleText = await readFile(join(evidenceDirectory, 'candidate-bundle.json'), 'utf8');
  assert.deepEqual(
    await verifyLiveEvidenceBundle(parseLiveEvidenceBundle(bundleText)),
    { valid: true, evidenceVersion: 1 },
  );
  assert.deepEqual((await readdir(join(fixture.workspaceRoot, fixture.runName))).sort(), [
    'SUBMISSION_ARMED',
    'evidence',
  ]);
});

test('same-size wallet rewrite after verified open fails before payment construction', async t => {
  const fixture = await privateFixture(t);
  let paymentConstructions = 0;
  let child;
  const originalWallet = await readFile(fixture.buyerWalletPath, 'utf8');
  const replacementWallet = originalWallet.replace('offline-placeholder-only', 'offline-replacement-only');
  assert.equal(Buffer.byteLength(replacementWallet), Buffer.byteLength(originalWallet));
  const requestHttps = (url, options, callback) => {
    const request = new EventEmitter();
    request.destroy = () => {};
    request.end = () => {
      void (async () => {
        const response = new EventEmitter();
        if (url.pathname === '/health') {
          await writeFile(fixture.buyerWalletPath, replacementWallet, { mode: 0o600 });
          response.statusCode = 200;
          response.headers = { 'content-type': 'application/json; charset=utf-8' };
          callback(response);
          response.emit('data', Buffer.from(JSON.stringify({ ok: true }, null, 2)));
        } else {
          response.statusCode = 402;
          response.headers = { [HEADERS.PAYMENT_REQUIRED]: encodeB64Json(CONFIG.expectedPaymentRequired) };
          callback(response);
        }
        response.emit('end');
      })().catch(() => request.emit('error'));
    };
    return request;
  };
  const forkProcess = () => {
    child = fakeProtocolChild(message => {
      if (message.type === 'START') return workerMessage(message.requestId, 'READY');
      if (message.type === 'STOP') return workerMessage(message.requestId, 'STOPPED', { snapshot: null });
      return workerMessage(message.requestId, 'STATUS', { poisoned: false });
    });
    const send = child.send;
    child.send = (message, callback) => {
      const accepted = send(message, callback);
      if (message.type === 'STOP') {
        setTimeout(() => emitFakeChildExitAndClose(child, 0, null), 5);
      }
      return accepted;
    };
    return child;
  };
  await assert.rejects(executeLiveEvidenceRun(fixture, {
    lifecycleObserver: fixedObserver(),
    dependencies: {
      probeZenonRoleReadiness: async () => {},
      resolveAddresses: async () => [{ address: '93.184.216.34', family: 4 }],
      requestHttps,
      createZenonClient: () => ({
        async createPaymentPayload() { paymentConstructions += 1; },
        snapshotLiveEvidenceObservations() { return []; },
      }),
      forkProcess,
    },
  }), assertFixedRunFailure);
  assert.equal(paymentConstructions, 0);
});

test('default runner recovery reuses one payment lineage and remains nonpublishable', async t => {
  const candidate = await validRunnerCandidate();
  const fixture = await privateFixture(t, candidate.config);
  let paymentConstructions = 0;
  let paidRequests = 0;
  const paymentHeaders = [];
  let child;
  const recoverySettlement = {
    success: false,
    network: candidate.context.outcome.settlement.network,
    transaction: candidate.context.outcome.settlement.transaction,
    payer: candidate.context.outcome.settlement.payer,
    state: 'SUBMISSION_OUTCOME_UNKNOWN',
    errorReason: 'payment_outcome_unknown',
    retrySamePayment: true,
  };
  const requestHttps = (url, options, callback) => {
    const request = new EventEmitter();
    request.destroy = () => {};
    request.end = () => {
      const response = new EventEmitter();
      if (url.pathname === '/health') {
        response.statusCode = 200;
        response.headers = { 'content-type': 'application/json; charset=utf-8' };
        callback(response);
        response.emit('data', Buffer.from(JSON.stringify({ ok: true }, null, 2)));
      } else if (!options.headers?.[HEADERS.PAYMENT_SIGNATURE]) {
        response.statusCode = 402;
        response.headers = {
          [HEADERS.PAYMENT_REQUIRED]: encodeB64Json(candidate.context.outcome.paymentRequired),
        };
        callback(response);
      } else {
        paidRequests += 1;
        paymentHeaders.push(options.headers[HEADERS.PAYMENT_SIGNATURE]);
        const final = paidRequests === 3;
        response.statusCode = final ? 200 : 409;
        response.headers = {
          [HEADERS.PAYMENT_RESPONSE]: encodeB64Json(
            final ? candidate.context.outcome.settlement : recoverySettlement,
          ),
          'content-type': candidate.context.outcome.final.contentType,
          'cache-control': candidate.context.outcome.final.cacheControl,
          vary: candidate.context.outcome.final.vary,
        };
        callback(response);
        if (final) response.emit('data', Buffer.from(candidate.context.outcome.final.bodyText));
      }
      response.emit('end');
    };
    return request;
  };
  const forkProcess = () => {
    child = new EventEmitter();
    child.connected = true;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.disconnect = () => { child.connected = false; };
    child.kill = () => {
      emitFakeChildExitAndClose(child, 0, null);
      return true;
    };
    child.send = (message, callback) => {
      callback?.();
      setImmediate(() => {
        let reply;
        if (message.type === 'START') reply = workerMessage(message.requestId, 'READY');
        else if (message.type === 'STATUS') {
          reply = workerMessage(message.requestId, 'STATUS', { poisoned: false });
        } else if (message.type === 'OBSERVATIONS') {
          reply = workerMessage(message.requestId, 'OBSERVATIONS', {
            evidenceEligible: false,
            events: [],
          });
        } else if (message.type === 'STOP') {
          reply = workerMessage(message.requestId, 'STOPPED', {
            snapshot: message.final ? candidate.context.journalSnapshot : null,
          });
        }
        child.emit('message', reply);
        if (message.type === 'STOP') emitFakeChildExitAndClose(child, 0, null);
      });
      return true;
    };
    return child;
  };
  const output = [];
  const errors = [];
  const result = await runLiveEvidenceRunnerCli({
    argv: [
      'run',
      '--config', fixture.configPath,
      '--buyer-rpc', fixture.buyerRpcPath,
      '--buyer-wallet', fixture.buyerWalletPath,
      '--facilitator-rpc', fixture.facilitatorRpcPath,
      '--workspace', fixture.workspaceRoot,
      '--run-name', fixture.runName,
    ],
    stdout: value => { output.push(value); },
    stderr: value => { errors.push(value); },
    executeInjections: {
      lifecycleObserver: fixedObserver(),
      monotonicNow: (() => { let value = 0; return () => value++; })(),
      dependencies: {
        probeZenonRoleReadiness: async () => {},
        resolveAddresses: async () => [{ address: '93.184.216.34', family: 4 }],
        requestHttps,
        createZenonClient: options => {
          const observations = recordRole(options.lifecycleObserver, 'buyer');
          return {
            async createPaymentPayload() {
              paymentConstructions += 1;
              return structuredClone(candidate.context.outcome.paymentPayload);
            },
            snapshotLiveEvidenceObservations() { return observations; },
          };
        },
        forkProcess,
      },
    },
  });
  assert.equal(result, true);
  assert.deepEqual(output, ['LIVE_EVIDENCE_RUN_RESOLVED_NONPUBLISHABLE\n']);
  assert.deepEqual(errors, []);
  assert.equal(paymentConstructions, 1);
  assert.equal(paidRequests, 3);
  assert.equal(paymentHeaders[0], paymentHeaders[1]);
  assert.equal(paymentHeaders[1], paymentHeaders[2]);
  assert.deepEqual(await readdir(join(fixture.workspaceRoot, fixture.runName)), [
    'SUBMISSION_ARMED',
  ]);
});

test('candidate assembly verifies cached response and publishes one atomic private artifact set', async t => {
  const root = await mkdtemp(join(tmpdir(), 'live-evidence-candidate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await chmod(root, 0o700);
  const candidate = await validRunnerCandidate();
  const serialized = await assembleLiveEvidenceRunCandidate(
    candidate.config,
    candidate.context,
    root,
  );
  const evidenceDirectory = join(root, 'evidence');
  assert.equal((await lstat(evidenceDirectory)).mode & 0o777, 0o700);
  assert.deepEqual((await readdir(evidenceDirectory)).sort(), [
    'COMPLETE',
    'candidate-bundle.json',
    'chain.json',
    'http.json',
    'journal.json',
    'manifest.json',
    'timing.json',
  ]);
  for (const name of await readdir(evidenceDirectory)) {
    assert.equal((await lstat(join(evidenceDirectory, name))).mode & 0o777, 0o600);
  }
  const bundleText = await readFile(join(evidenceDirectory, 'candidate-bundle.json'), 'utf8');
  assert.equal(bundleText, serialized);
  const bundle = parseLiveEvidenceBundle(bundleText);
  assert.deepEqual(await verifyLiveEvidenceBundle(bundle), { valid: true, evidenceVersion: 1 });
  const http = parseLiveEvidenceFragment(
    await readFile(join(evidenceDirectory, 'http.json'), 'utf8'),
    'http',
  );
  const journal = parseLiveEvidenceFragment(
    await readFile(join(evidenceDirectory, 'journal.json'), 'utf8'),
    'journal',
  );
  assert.equal(http.http.final.bodyText, JSON.stringify(candidate.body, null, 2));
  assert.deepEqual(journal.journal.record.cachedResponse.body, candidate.body);
  assert.deepEqual(
    (await readdir(root)).filter(name => name.startsWith('.evidence-partial-')),
    [],
  );

  const failedRoot = join(root, 'failed');
  await mkdir(failedRoot, { mode: 0o700 });
  const tampered = structuredClone(candidate.context);
  tampered.outcome.final.bodyText = '{}';
  await assert.rejects(
    assembleLiveEvidenceRunCandidate(candidate.config, tampered, failedRoot),
    assertFixedRunFailure,
  );
  assert.deepEqual(await readdir(failedRoot), []);

  const stagedFailureRoot = join(root, 'staged-failure');
  await mkdir(stagedFailureRoot, { mode: 0o700 });
  await mkdir(join(stagedFailureRoot, 'evidence'), { mode: 0o700 });
  await assert.rejects(
    assembleLiveEvidenceRunCandidate(candidate.config, candidate.context, stagedFailureRoot),
    assertFixedRunFailure,
  );
  assert.deepEqual(
    (await readdir(stagedFailureRoot)).filter(name => name.startsWith('.evidence-partial-')),
    [],
  );
  await rm(join(stagedFailureRoot, 'evidence'), { recursive: true, force: true });
  assert.deepEqual(await readdir(stagedFailureRoot), []);
});

test('default schema-v1 journal persistence has one clean record lane and no capsule', async t => {
  const root = await mkdtemp(join(tmpdir(), 'live-evidence-journal-default-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await chmod(root, 0o700);
  const journalDirectory = join(root, 'journal');
  class CountingJournal extends SettlementJournal {
    loadCalls = 0;
    listCalls = 0;
    async load() {
      this.loadCalls += 1;
      return super.load();
    }
    async list(...args) {
      this.listCalls += 1;
      return super.list(...args);
    }
  }
  const journal = new CountingJournal({ directory: journalDirectory, allowedRoot: root });
  assert.deepEqual(await journal.load(), { schemaVersion: 1, revision: 0, records: [] });
  const candidate = await validRunnerCandidate();
  const completed = candidate.context.journalSnapshot.records[0];
  const input = journalInputFromRecord(completed);
  await journal.putValidated(input);
  await journal.updateEvidence(
    completed.authorizationKey,
    completed.transactionHash,
    EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
  );
  await journal.updateEvidence(
    completed.authorizationKey,
    completed.transactionHash,
    EVIDENCE_STATES.MOMENTUM_INCLUDED,
    completed.momentumEvidence,
  );
  await journal.markDeliveryPending(completed.authorizationKey, completed.transactionHash);
  await journal.markDelivered(
    completed.authorizationKey,
    completed.transactionHash,
    completed.cachedResponse,
  );
  const final = await journal.load();
  assert.equal(final.schemaVersion, 1);
  assert.equal(final.revision, 5);
  assert.equal(final.records.length, 1);
  assert.equal(final.records[0].deliveryState, 'DELIVERED');
  assert.equal(journal.loadCalls, 2);
  assert.equal(journal.listCalls, 0);
  assert.deepEqual((await readdir(journalDirectory)).sort(), [
    '.settlement-journal.initialized',
    'settlement-journal.json',
  ]);
  assert.equal((await lstat(journalDirectory)).mode & 0o777, 0o700);
});

test('public HTTPS readiness failure stops before wallet access and payment construction', async t => {
  const fixture = await privateFixture(t);
  let walletReads = 0;
  let paidFetchCalls = 0;
  const controller = cleanController();
  await assert.rejects(executeLiveEvidenceRun(fixture, {
    operations: {
      async probeBuyerReadiness() {},
      async probePublicEndpoint() { throw new Error('synthetic-redirect-or-drift'); },
      async startFacilitator() { return controller; },
      async readBuyerWallet() { walletReads += 1; return {}; },
      async paidFetch() { paidFetchCalls += 1; },
      async reconcilePayment() {},
      async assembleCandidate() {},
      submissionArmed() { return false; },
    },
  }), assertFixedRunFailure);
  assert.equal(walletReads, 0);
  assert.equal(paidFetchCalls, 0);
  await assert.rejects(lstat(join(fixture.workspaceRoot, fixture.runName)));
});

test('coordinator observation fault aborts before payment construction with fixed failure', async t => {
  const fixture = await privateFixture(t);
  let paidFetchCalls = 0;
  const observer = createLiveEvidenceObserver({
    utcNow: () => { throw new Error('private-clock-failure'); },
    monotonicNow: () => 1,
  });
  await assert.rejects(executeLiveEvidenceRun(fixture, {
    lifecycleObserver: observer,
    operations: {
      async probeBuyerReadiness() {},
      async probePublicEndpoint() {},
      async startFacilitator() { return cleanController(); },
      async readBuyerWallet() { throw new Error('must-not-run'); },
      async paidFetch() { paidFetchCalls += 1; },
      async reconcilePayment() { throw new Error('must-not-run'); },
      async assembleCandidate() { throw new Error('must-not-run'); },
      submissionArmed() { return false; },
    },
  }), assertFixedRunFailure);
  assert.equal(paidFetchCalls, 0);
  await assert.rejects(lstat(join(fixture.workspaceRoot, fixture.runName)));
});

test('same-payment recovery is bounded, retains owner lineage, waits for old worker exit, and is nonpublishable', async t => {
  const fixture = await privateFixture(t);
  const firstOwner = Object.freeze({ opaque: true });
  let firstExited = false;
  let starts = 0;
  let paidFetchCalls = 0;
  let reconcileCalls = 0;
  let assembleCalls = 0;
  const controller = poisoned => ({
    async start() {},
    async snapshotObservations() { return { evidenceEligible: false, events: [] }; },
    async poisoned() { return poisoned; },
    async closeAndSnapshot() {
      return { quiescent: true, schemaVersion: 1, revision: 5, records: [{}] };
    },
    async exit() { firstExited = true; },
    async terminate() { firstExited = true; },
    async exited() { return firstExited; },
  });
  const result = await executeLiveEvidenceRun(fixture, {
    monotonicNow: (() => { let value = 0; return () => value++; })(),
    operations: {
      async probeBuyerReadiness() {},
      async probePublicEndpoint() {},
      async startFacilitator({ recovery, restartEpoch }) {
        starts += 1;
        if (recovery) {
          assert.equal(firstExited, true);
          assert.equal(restartEpoch, 1);
        }
        return controller(!recovery);
      },
      async readBuyerWallet() {
        return Object.freeze({ mnemonic: 'offline-placeholder-only', accountIndex: 0 });
      },
      async paidFetch({ onChallenge, openWallet }) {
        paidFetchCalls += 1;
        await onChallenge(CONFIG.expectedPaymentRequired);
        await openWallet();
        await writeFile(
          join(fixture.workspaceRoot, fixture.runName, 'SUBMISSION_ARMED'),
          'SUBMISSION_ARMED\n',
          { mode: 0o600 },
        );
        return { kind: 'recovery', owner: firstOwner, buyerObservations: [] };
      },
      async reconcilePayment(owner) {
        reconcileCalls += 1;
        assert.equal(owner, firstOwner);
        return { kind: 'delivered' };
      },
      async assembleCandidate() { assembleCalls += 1; },
      submissionArmed() { return true; },
    },
  });
  assert.deepEqual(result, { status: 'resolved', evidenceEligible: false });
  assert.equal(paidFetchCalls, 1);
  assert.equal(reconcileCalls, 1);
  assert.equal(assembleCalls, 0);
  assert.equal(starts, 2);
  const entries = await readdir(join(fixture.workspaceRoot, fixture.runName));
  assert.deepEqual(entries.sort(), ['SUBMISSION_ARMED']);
});

test('post-submission failure and coordinator loss preserve the armed run and forbid replacement', async t => {
  const fixture = await privateFixture(t);
  let armed = false;
  let paidFetchCalls = 0;
  const operations = {
    async probeBuyerReadiness() {},
    async probePublicEndpoint() {},
    async startFacilitator() { return cleanController(); },
    async readBuyerWallet() { return {}; },
    async paidFetch() {
      paidFetchCalls += 1;
      const runDirectory = join(fixture.workspaceRoot, fixture.runName);
      await writeFile(join(runDirectory, 'SUBMISSION_ARMED'), 'SUBMISSION_ARMED\n', { mode: 0o600 });
      armed = true;
      throw new Error('post-submission-private-sentinel');
    },
    async reconcilePayment() {},
    async assembleCandidate() {},
    submissionArmed() { return armed; },
  };
  await assert.rejects(executeLiveEvidenceRun(fixture, { operations }), assertFixedRunFailure);
  assert.equal(paidFetchCalls, 1);
  const marker = await lstat(join(fixture.workspaceRoot, fixture.runName, 'SUBMISSION_ARMED'));
  assert.equal(marker.isFile(), true);
  await assert.rejects(preflightLiveEvidenceRun(fixture), assertFixedRunFailure);
  assert.equal(paidFetchCalls, 1);
});

test('recovery rejects repeated owners and elapsed-time exhaustion without a new payment', async t => {
  for (const mode of ['owner', 'elapsed']) {
    const config = {
      ...CONFIG,
      runtime: { ...CONFIG.runtime, maxRecoveryElapsedMs: 1 },
    };
    const fixture = await privateFixture(t, config);
    const owner = {};
    let paidFetchCalls = 0;
    const times = mode === 'elapsed' ? [0, 0, 2] : [0, 0, 0, 0];
    let timeIndex = 0;
    await assert.rejects(executeLiveEvidenceRun(fixture, {
      monotonicNow: () => times[Math.min(timeIndex++, times.length - 1)],
      operations: {
        async probeBuyerReadiness() {},
        async probePublicEndpoint() {},
        async startFacilitator() { return cleanController(); },
        async readBuyerWallet() { return {}; },
        async paidFetch() {
          paidFetchCalls += 1;
          return { kind: 'recovery', owner, buyerObservations: [] };
        },
        async reconcilePayment() { return { kind: 'recovery', owner }; },
        async assembleCandidate() {},
        submissionArmed() { return true; },
      },
    }), assertFixedRunFailure);
    assert.equal(paidFetchCalls, 1);
  }
});

test('one absolute recovery deadline terminates a stalled facilitator and preserves incompleteness', async t => {
  const config = {
    ...CONFIG,
    runtime: { ...CONFIG.runtime, maxRecoveryElapsedMs: 5 },
  };
  const fixture = await privateFixture(t, config);
  let terminated = 0;
  const stalled = {
    ...cleanController(),
    async poisoned() { return new Promise(() => {}); },
    async terminate() {
      terminated += 1;
      return new Promise(() => {});
    },
  };
  const completion = Promise.race([
    executeLiveEvidenceRun(fixture, {
    operations: {
      async probeBuyerReadiness() {},
      async probePublicEndpoint() {},
      async startFacilitator() { return stalled; },
      async readBuyerWallet() { return {}; },
      async paidFetch() { return { kind: 'recovery', owner: {}, buyerObservations: [] }; },
      async reconcilePayment() { throw new Error('must-not-run'); },
      async assembleCandidate() { throw new Error('must-not-run'); },
      submissionArmed() { return true; },
    },
    }).then(() => 'resolved', error => assertFixedRunFailure(error) ? 'rejected' : 'wrong-error'),
    new Promise(resolve => setTimeout(() => resolve('hung'), 100)),
  ]);
  assert.equal(await completion, 'rejected');
  assert.equal(terminated, 1);
  assert.equal((await lstat(join(fixture.workspaceRoot, fixture.runName))).isDirectory(), true);
});

test('observed delivery adapter captures once and records only durable delivery completion', async () => {
  const observer = fixedObserver();
  let snapshots = 0;
  let pending = 0;
  let delivered = 0;
  const facilitator = {
    async settle() { return { success: true }; },
    async markDeliveryPending() { pending += 1; return { deliveryState: 'PENDING' }; },
    async markDelivered() { delivered += 1; return { deliveryState: 'DELIVERED' }; },
    snapshotLiveEvidenceObservations() { snapshots += 1; return []; },
  };
  const adapter = createObservedFacilitatorAdapter(facilitator, observer);
  await adapter.markDeliveryPending({});
  await adapter.markDelivered({}, {});
  const events = adapter.snapshotLiveEvidenceObservations();
  assert.equal(snapshots, 1);
  assert.equal(pending, 1);
  assert.equal(delivered, 1);
  assert.deepEqual(events.map(event => event.phase), ['delivery_started', 'delivery_finished']);
  assert.throws(() => createObservedFacilitatorAdapter({
    settle() {}, markDeliveryPending() {}, markDelivered() {},
  }, observer));
});

function workerMessage(requestId, type, fields = {}) {
  return { ipcVersion: 1, requestId, type, ...fields };
}

test('worker child protocol rejects extras and binds replies to request IDs', async () => {
  const channel = new EventEmitter();
  const sent = [];
  channel.connected = true;
  channel.send = (message, callback) => {
    sent.push(message);
    callback?.();
    return true;
  };
  channel.disconnect = () => {
    channel.connected = false;
    channel.emit('disconnect');
  };
  let snapshots = 0;
  await runLiveEvidenceFacilitatorWorker({
    channel,
    start: async () => ({
      snapshotObservations() {
        snapshots += 1;
        return { evidenceEligible: false, events: [] };
      },
      poisoned() { return false; },
      async stop() {
        return { quiescent: true, schemaVersion: 1, revision: 5, records: [{}] };
      },
    }),
  });
  channel.emit('message', workerMessage(1, 'START', {
    config: CONFIG,
    facilitatorRpcGeneration: SYNTHETIC_FILE_GENERATION,
    workspaceRoot: 'protected',
    journalDirectory: 'protected/journal',
    recovery: false,
  }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent[0].type, 'READY');
  assert.equal(sent[0].requestId, 1);
  channel.emit('message', workerMessage(2, 'OBSERVATIONS'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent[1].type, 'OBSERVATIONS');
  assert.equal(sent[1].requestId, 2);
  assert.equal(snapshots, 1);
  channel.emit('message', { ...workerMessage(3, 'STATUS'), extra: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent[2].type, 'FAILED');
  assert.equal(sent[2].requestId, 3);
});

test('worker child rejects replay/concurrency and stops on coordinator disconnect', async () => {
  const makeChannel = () => {
    const channel = new EventEmitter();
    channel.connected = true;
    channel.sent = [];
    channel.send = (message, callback) => {
      channel.sent.push(message);
      callback?.();
      return true;
    };
    channel.disconnect = () => {
      channel.connected = false;
      channel.emit('disconnect');
    };
    return channel;
  };
  const startMessage = workerMessage(1, 'START', {
    config: CONFIG,
    facilitatorRpcGeneration: SYNTHETIC_FILE_GENERATION,
    workspaceRoot: 'protected',
    journalDirectory: 'protected/journal',
    recovery: false,
  });

  const replayChannel = makeChannel();
  let replayStops = 0;
  await runLiveEvidenceFacilitatorWorker({
    channel: replayChannel,
    start: async () => ({
      snapshotObservations: () => ({ evidenceEligible: false, events: [] }),
      poisoned: () => false,
      stop: async () => { replayStops += 1; return null; },
    }),
  });
  replayChannel.emit('message', startMessage);
  await new Promise(resolve => setImmediate(resolve));
  replayChannel.emit('message', workerMessage(1, 'STATUS'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(replayChannel.sent.at(-1).type, 'FAILED');
  assert.equal(replayStops, 1);

  const concurrentChannel = makeChannel();
  let releaseStart;
  const startGate = new Promise(resolve => { releaseStart = resolve; });
  let concurrentStops = 0;
  await runLiveEvidenceFacilitatorWorker({
    channel: concurrentChannel,
    start: async () => {
      await startGate;
      return {
        snapshotObservations: () => ({ evidenceEligible: false, events: [] }),
        poisoned: () => false,
        stop: async () => { concurrentStops += 1; return null; },
      };
    },
  });
  concurrentChannel.emit('message', startMessage);
  concurrentChannel.emit('message', workerMessage(2, 'STATUS'));
  releaseStart();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(concurrentChannel.sent.some(message => message.type === 'FAILED'), true);
  assert.equal(concurrentStops, 1);

  const disconnectChannel = makeChannel();
  let disconnectStops = 0;
  await runLiveEvidenceFacilitatorWorker({
    channel: disconnectChannel,
    start: async () => ({
      snapshotObservations: () => ({ evidenceEligible: false, events: [] }),
      poisoned: () => false,
      stop: async () => { disconnectStops += 1; return null; },
    }),
  });
  disconnectChannel.emit('message', startMessage);
  await new Promise(resolve => setImmediate(resolve));
  disconnectChannel.emit('disconnect');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(disconnectStops, 1);
});

test('unexpected coordinator disconnect bounds stalled worker shutdown and forces sanitized exit', async () => {
  const channel = new EventEmitter();
  channel.connected = true;
  channel.sent = [];
  channel.send = (message, callback) => {
    channel.sent.push(message);
    callback?.();
    return true;
  };
  channel.disconnect = () => { channel.connected = false; };
  const exitCodes = [];
  await runLiveEvidenceFacilitatorWorker({
    channel,
    shutdownTimeoutMs: 5,
    forceExit: code => { exitCodes.push(code); },
    start: async () => ({
      snapshotObservations: () => ({ evidenceEligible: false, events: [] }),
      poisoned: () => false,
      stop: async () => new Promise(() => {}),
    }),
  });
  channel.emit('message', workerMessage(1, 'START', {
    config: CONFIG,
    facilitatorRpcGeneration: SYNTHETIC_FILE_GENERATION,
    workspaceRoot: 'protected',
    journalDirectory: 'protected/journal',
    recovery: false,
  }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(channel.sent[0].type, 'READY');
  channel.emit('disconnect');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(exitCodes, [1]);
  assert.equal(channel.sent.some(message => message.type === 'FAILED'), false);
});

test('coordinator disconnect hard-watchdog bounds pending START and already-running STOP', async () => {
  const makeChannel = () => {
    const channel = new EventEmitter();
    channel.connected = true;
    channel.sent = [];
    channel.send = (message, callback) => {
      channel.sent.push(message);
      callback?.();
      return true;
    };
    channel.disconnect = () => { channel.connected = false; };
    return channel;
  };
  const startMessage = workerMessage(1, 'START', {
    config: CONFIG,
    facilitatorRpcGeneration: SYNTHETIC_FILE_GENERATION,
    workspaceRoot: 'protected',
    journalDirectory: 'protected/journal',
    recovery: false,
  });

  const pendingChannel = makeChannel();
  const pendingExitCodes = [];
  await runLiveEvidenceFacilitatorWorker({
    channel: pendingChannel,
    shutdownTimeoutMs: 5,
    forceExit: code => { pendingExitCodes.push(code); },
    start: async () => new Promise(() => {}),
  });
  pendingChannel.emit('message', startMessage);
  await new Promise(resolve => setImmediate(resolve));
  pendingChannel.emit('disconnect');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(pendingExitCodes, [1]);
  assert.equal(pendingChannel.sent.length, 0);

  const stoppingChannel = makeChannel();
  const stoppingExitCodes = [];
  await runLiveEvidenceFacilitatorWorker({
    channel: stoppingChannel,
    shutdownTimeoutMs: 5,
    forceExit: code => { stoppingExitCodes.push(code); },
    start: async () => ({
      snapshotObservations: () => ({ evidenceEligible: false, events: [] }),
      poisoned: () => false,
      stop: async () => new Promise(() => {}),
    }),
  });
  stoppingChannel.emit('message', startMessage);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stoppingChannel.sent[0].type, 'READY');
  stoppingChannel.emit('message', workerMessage(2, 'STOP', { final: true }));
  await new Promise(resolve => setImmediate(resolve));
  stoppingChannel.emit('disconnect');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(stoppingExitCodes, [1]);
  assert.equal(stoppingChannel.sent.some(message => message.type === 'STOPPED'), false);
});

async function createProtocolChild(t) {
  const root = await mkdtemp(join(tmpdir(), 'live-evidence-worker-child-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const modulePath = join(root, 'child.mjs');
  const source = `
import { pathToFileURL } from 'node:url';
const moduleUrl = pathToFileURL(process.cwd() + '/src/live-evidence-facilitator-worker.js').href;
const journalUrl = pathToFileURL(process.cwd() + '/src/settlement-journal.js').href;
const canonicalUrl = pathToFileURL(process.cwd() + '/src/canonical.js').href;
const worker = await import(moduleUrl);
const { SettlementJournal, EVIDENCE_STATES } = await import(journalUrl);
const { sha256Hex } = await import(canonicalUrl);
let loadCalls = 0;
let listCalls = 0;
let firstLoad;
const originalLoad = SettlementJournal.prototype.load;
const originalList = SettlementJournal.prototype.list;
SettlementJournal.prototype.load = async function (...args) {
  loadCalls += 1;
  const snapshot = await Reflect.apply(originalLoad, this, args);
  if (loadCalls === 1) firstLoad = structuredClone(snapshot);
  return snapshot;
};
SettlementJournal.prototype.list = async function (...args) {
  listCalls += 1;
  return Reflect.apply(originalList, this, args);
};

function fixedInput(config) {
  const resourceIdentity = structuredClone(config.expectedPaymentRequired.resource);
  const accepted = config.expectedPaymentRequired.accepts[0];
  const chainProfile = structuredClone(accepted.extra.zenonChain);
  const intentDigest = Buffer.alloc(32, 1).toString('hex');
  const transactionHash = Buffer.alloc(32, 2).toString('hex');
  const resourceDigest = sha256Hex(resourceIdentity);
  const authorizationKey = sha256Hex({
    domain: 'zenon-x402-authorization-v1',
    chainProfile,
    intentDigest,
    resourceDigest,
    transactionHash,
  });
  const payer = 'z1' + 'a'.repeat(38);
  return {
    authorizationKey,
    transactionHash,
    chainProfile,
    intentDigest,
    resourceIdentity,
    resourceDigest,
    payer,
    signedAccountBlock: {
      version: 1,
      chainIdentifier: Number(chainProfile.chainIdentifier),
      blockType: 2,
      hash: transactionHash,
      previousHash: Buffer.alloc(32).toString('hex'),
      height: 1,
      momentumAcknowledged: {
        hash: Buffer.alloc(32, 3).toString('hex'),
        height: 1,
      },
      address: payer,
      toAddress: accepted.payTo,
      amount: accepted.amount,
      tokenStandard: accepted.asset,
      fromBlockHash: Buffer.alloc(32).toString('hex'),
      data: Buffer.from(intentDigest, 'hex').toString('base64'),
      fusedPlasma: 0,
      difficulty: 0,
      nonce: Buffer.alloc(8).toString('hex'),
      publicKey: Buffer.alloc(32, 4).toString('base64'),
      signature: Buffer.alloc(64, 5).toString('base64'),
    },
  };
}

function lowLevelDependencies(config) {
  const input = fixedInput(config);
  let journal;
  const observedAt = '2026-01-01T00:00:00.000Z';
  const momentumEvidence = {
    observedAt,
    confirmationDetail: {
      numConfirmations: 1,
      momentumHeight: 2,
      momentumHash: Buffer.alloc(32, 6).toString('hex'),
      momentumTimestamp: 1,
    },
  };
  const cachedResponse = {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: {
      ok: true,
      message: 'paid resource unlocked',
      network: config.expectedPaymentRequired.accepts[0].network,
      payer: input.payer,
      transaction: input.transactionHash,
      generatedAt: observedAt,
    },
  };
  return {
    probeRoleReadiness: async () => {},
    createFacilitator: options => {
      journal = options.journal;
      return {
        async settle() {
          await journal.putValidated(input);
          await journal.updateEvidence(
            input.authorizationKey,
            input.transactionHash,
            EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
          );
          await journal.updateEvidence(
            input.authorizationKey,
            input.transactionHash,
            EVIDENCE_STATES.MOMENTUM_INCLUDED,
            momentumEvidence,
          );
          return { authorizationKey: input.authorizationKey, transaction: input.transactionHash };
        },
        async markDeliveryPending() {
          return journal.markDeliveryPending(input.authorizationKey, input.transactionHash);
        },
        async markDelivered() {
          return journal.markDelivered(
            input.authorizationKey,
            input.transactionHash,
            cachedResponse,
          );
        },
        snapshotLiveEvidenceObservations: () => [],
      };
    },
    createServer: options => ({
      async listen() {
        const settlement = await options.facilitator.settle({});
        await options.facilitator.markDeliveryPending(settlement);
        await options.facilitator.markDelivered(settlement, cachedResponse);
      },
      async close() {},
    }),
    runtimePoisoned: () => false,
  };
}

await worker.runLiveEvidenceFacilitatorWorker({
  start: async message => {
    const runtime = await worker.startDefaultLiveEvidenceFacilitatorRuntime(
      message,
      lowLevelDependencies(message.config),
    );
    if (loadCalls !== 1 || listCalls !== 0 || firstLoad?.schemaVersion !== 1 ||
        firstLoad?.revision !== 0 || firstLoad?.records?.length !== 0) {
      throw new Error('fixed-test-harness-failure');
    }
    return {
      snapshotObservations: runtime.snapshotObservations,
      poisoned: runtime.poisoned,
      async stop(options) {
        const snapshot = await runtime.stop(options);
        if (options.final && (loadCalls !== 2 || listCalls !== 0 ||
            snapshot?.schemaVersion !== 1 || snapshot?.revision !== 5 ||
            snapshot?.records?.length !== 1)) {
          throw new Error('fixed-test-harness-failure');
        }
        return snapshot;
      },
    };
  },
});
`;
  await writeFile(modulePath, source, { mode: 0o600 });
  return modulePath;
}

function controllerOptions(
  modulePath,
  facilitatorRpcFd = 0,
  facilitatorRpcGeneration = SYNTHETIC_FILE_GENERATION,
  workspaceRoot = 'protected',
  journalDirectory = 'protected/journal',
  inspectFork = () => {},
) {
  return {
    config: CONFIG,
    facilitatorRpcFd,
    facilitatorRpcGeneration,
    workspaceRoot,
    journalDirectory,
    recovery: false,
    forkProcess: (_module, args, options) => {
      inspectFork(args, options);
      return forkProcess(modulePath, [], options);
    },
  };
}

test('real worker IPC topology uses default composition, real journal, and confirmed OS exit', async t => {
  const modulePath = await createProtocolChild(t);
  const fixture = await privateFixture(t);
  const roleHandle = await open(fixture.facilitatorRpcPath, 'r');
  t.after(() => roleHandle.close().catch(() => {}));
  const generation = generationFromStat(await roleHandle.stat({ bigint: true }));
  const journalDirectory = join(fixture.workspaceRoot, 'journal');
  let forkInspected = false;
  const first = await startLiveEvidenceFacilitatorWorker(controllerOptions(
    modulePath,
    roleHandle.fd,
    generation,
    fixture.workspaceRoot,
    journalDirectory,
    (args, options) => {
      assert.deepEqual(args, []);
      assert.deepEqual(options.env, {});
      assert.deepEqual(options.execArgv, []);
      assert.equal(options.stdio[4], roleHandle.fd);
      forkInspected = true;
    },
  ));
  t.after(() => first.terminate().catch(() => {}));
  assert.equal(assertLiveEvidenceFacilitatorController(first), first);
  await first.start();
  assert.equal(forkInspected, true);
  assert.equal(await first.poisoned(), false);
  const observations = await first.snapshotObservations();
  assert.equal(observations.evidenceEligible, false);
  assert.deepEqual(
    observations.events.map(event => event.phase),
    ['delivery_started', 'delivery_finished'],
  );
  const snapshot = await first.closeAndSnapshot();
  assert.equal(snapshot.quiescent, true);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.revision, 5);
  assert.equal(snapshot.records.length, 1);
  assert.equal(snapshot.records[0].evidenceState, 'MOMENTUM_INCLUDED');
  assert.equal(snapshot.records[0].deliveryState, 'DELIVERED');
  assert.equal(await first.exited(), true);
  assert.deepEqual((await readdir(journalDirectory)).sort(), [
    '.settlement-journal.initialized',
    'settlement-journal.json',
  ]);
  assert.equal((await lstat(journalDirectory)).mode & 0o777, 0o700);
  assert.deepEqual((await readdir(fixture.workspaceRoot)).sort(), [
    'buyer-rpc.json',
    'buyer-wallet.json',
    'facilitator-rpc.json',
    'journal',
    'run.json',
  ]);

  const replacementFixture = await privateFixture(t);
  const replacementHandle = await open(replacementFixture.facilitatorRpcPath, 'r');
  t.after(() => replacementHandle.close().catch(() => {}));
  const replacementGeneration = generationFromStat(await replacementHandle.stat({ bigint: true }));
  const second = await startLiveEvidenceFacilitatorWorker(controllerOptions(
    modulePath,
    replacementHandle.fd,
    replacementGeneration,
    replacementFixture.workspaceRoot,
    join(replacementFixture.workspaceRoot, 'journal'),
  ));
  t.after(() => second.terminate().catch(() => {}));
  await second.start();
  await second.exit();
  assert.equal(await second.exited(), true);
});

test('real worker default composition rejects schema-v2 and multiple-record journals', async t => {
  const modulePath = await createProtocolChild(t);

  const multipleFixture = await privateFixture(t);
  const multipleDirectory = join(multipleFixture.workspaceRoot, 'journal');
  const multipleJournal = new SettlementJournal({
    directory: multipleDirectory,
    allowedRoot: multipleFixture.workspaceRoot,
  });
  const firstCandidate = await validRunnerCandidate();
  const secondCandidate = await validRunnerCandidate();
  await multipleJournal.putValidated(
    journalInputFromRecord(firstCandidate.context.journalSnapshot.records[0]),
  );
  await multipleJournal.putValidated(
    journalInputFromRecord(secondCandidate.context.journalSnapshot.records[0]),
  );
  const multipleHandle = await open(multipleFixture.facilitatorRpcPath, 'r');
  t.after(() => multipleHandle.close().catch(() => {}));
  const multiple = await startLiveEvidenceFacilitatorWorker(controllerOptions(
    modulePath,
    multipleHandle.fd,
    generationFromStat(await multipleHandle.stat({ bigint: true })),
    multipleFixture.workspaceRoot,
    multipleDirectory,
  ));
  t.after(() => multiple.terminate().catch(() => {}));
  await assert.rejects(multiple.start(), error => error?.code === 'live_evidence_worker_failed');
  assert.equal(await multiple.exited(), true);

  const schemaTwoFixture = await privateFixture(t);
  const schemaTwoDirectory = join(schemaTwoFixture.workspaceRoot, 'journal');
  let journalNow = '2026-01-01T00:00:00.000Z';
  const schemaTwoJournal = new SettlementJournal({
    directory: schemaTwoDirectory,
    allowedRoot: schemaTwoFixture.workspaceRoot,
    clock: () => journalNow,
  });
  const schemaTwoCandidate = await validRunnerCandidate();
  const schemaTwoInput = journalInputFromRecord(
    schemaTwoCandidate.context.journalSnapshot.records[0],
  );
  await schemaTwoJournal.putValidated(schemaTwoInput);
  const entry = await schemaTwoJournal.getEntrySnapshot(
    schemaTwoInput.authorizationKey,
    schemaTwoInput.transactionHash,
  );
  journalNow = '2026-01-01T02:00:00.000Z';
  await schemaTwoJournal.replaceRecordWithTombstone({
    expectedRevision: entry.revision,
    expectedRecord: entry.entry,
    retentionMs: 3_600_000,
  });
  assert.equal((await schemaTwoJournal.load()).schemaVersion, 2);
  const schemaTwoHandle = await open(schemaTwoFixture.facilitatorRpcPath, 'r');
  t.after(() => schemaTwoHandle.close().catch(() => {}));
  const schemaTwo = await startLiveEvidenceFacilitatorWorker(controllerOptions(
    modulePath,
    schemaTwoHandle.fd,
    generationFromStat(await schemaTwoHandle.stat({ bigint: true })),
    schemaTwoFixture.workspaceRoot,
    schemaTwoDirectory,
  ));
  t.after(() => schemaTwo.terminate().catch(() => {}));
  await assert.rejects(schemaTwo.start(), error => error?.code === 'live_evidence_worker_failed');
  assert.equal(await schemaTwo.exited(), true);
});

function fakeProtocolChild(reply) {
  const child = new EventEmitter();
  child.connected = true;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.send = (message, callback) => {
    callback?.();
    setImmediate(() => child.emit('message', reply(message)));
    return true;
  };
  child.disconnect = () => { child.connected = false; };
  child.kill = () => {
    child.connected = false;
    emitFakeChildExitAndClose(child, 0, null);
    return true;
  };
  return child;
}

function emitFakeChildExitAndClose(child, code, signal) {
  if (CLOSING_FAKE_CHILDREN.has(child)) return;
  CLOSING_FAKE_CHILDREN.add(child);
  setImmediate(() => {
    child.emit('exit', code, signal);
    setImmediate(() => child.emit('close', code, signal));
  });
}

test('controller waits for child close after exit before resolving stop', async () => {
  let child;
  child = fakeProtocolChild(message => {
    if (message.type === 'START') return workerMessage(message.requestId, 'READY');
    if (message.type === 'STOP') {
      setImmediate(() => child.emit('exit', 0, null));
      return workerMessage(message.requestId, 'STOPPED', { snapshot: null });
    }
    return workerMessage(message.requestId, 'STATUS', { poisoned: false });
  });
  const controller = await startLiveEvidenceFacilitatorWorker({
    ...controllerOptions('unused'),
    forkProcess: () => child,
  });
  await controller.start();
  const exited = new Promise(resolve => child.once('exit', resolve));
  let stopped = false;
  const stopping = controller.exit().then(() => { stopped = true; });
  await exited;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stopped, false);
  child.emit('close', 0, null);
  await stopping;
  assert.equal(stopped, true);
});

test('child errors after exit force bounded reaping through close', async () => {
  const kills = [];
  let child;
  child = fakeProtocolChild(message => {
    if (message.type === 'START') return workerMessage(message.requestId, 'READY');
    if (message.type === 'STOP') {
      setImmediate(() => {
        child.emit('exit', 0, null);
        setImmediate(() => child.emit('error', new Error('synthetic-child-error')));
      });
      return workerMessage(message.requestId, 'STOPPED', { snapshot: null });
    }
    return workerMessage(message.requestId, 'STATUS', { poisoned: false });
  });
  child.kill = signal => {
    kills.push(signal);
    if (signal === 'SIGKILL') setImmediate(() => child.emit('close', 0, null));
    return true;
  };
  const controller = await startLiveEvidenceFacilitatorWorker({
    ...controllerOptions('unused'),
    forkProcess: () => child,
  });
  await controller.start();
  await assert.rejects(
    controller.exit(),
    error => error?.code === 'live_evidence_worker_failed' && error?.cause === undefined,
  );
  assert.deepEqual(kills, ['SIGTERM', 'SIGKILL']);
  assert.equal(child.stdout.destroyed, true);
  assert.equal(child.stderr.destroyed, true);
  assert.equal(await controller.exited(), true);
});

test('semantic STOP failure reaps the child through close', async t => {
  const kills = [];
  let child;
  child = fakeProtocolChild(message => {
    if (message.type === 'START') return workerMessage(message.requestId, 'READY');
    if (message.type === 'STOP') {
      return workerMessage(message.requestId, 'STOPPED', { snapshot: null });
    }
    return workerMessage(message.requestId, 'STATUS', { poisoned: false });
  });
  child.kill = signal => {
    kills.push(signal);
    if (signal === 'SIGTERM') emitFakeChildExitAndClose(child, null, 'SIGTERM');
    return true;
  };
  const controller = await startLiveEvidenceFacilitatorWorker({
    ...controllerOptions('unused'),
    forkProcess: () => child,
  });
  t.after(() => controller.terminate().catch(() => {}));
  await controller.start();
  await assert.rejects(
    controller.closeAndSnapshot(),
    error => error?.code === 'live_evidence_worker_failed' && error?.cause === undefined,
  );
  assert.deepEqual(kills, ['SIGTERM']);
  assert.equal(child.stdout.destroyed, true);
  assert.equal(child.stderr.destroyed, true);
  assert.equal(await controller.exited(), true);
});

test('unexpected idle exit starts bounded close reaping', async t => {
  const kills = [];
  let child;
  child = fakeProtocolChild(message => workerMessage(message.requestId, 'READY'));
  child.kill = signal => {
    kills.push(signal);
    if (signal === 'SIGKILL') child.emit('close', 1, null);
    return true;
  };
  const controller = await startLiveEvidenceFacilitatorWorker({
    ...controllerOptions('unused'),
    forkProcess: () => child,
  });
  t.after(() => controller.terminate().catch(() => {}));
  await controller.start();
  child.emit('exit', 1, null);
  await assert.rejects(
    controller.poisoned(),
    error => error?.code === 'live_evidence_worker_failed' && error?.cause === undefined,
  );
  assert.deepEqual(kills, ['SIGTERM', 'SIGKILL']);
  assert.equal(child.stdout.destroyed, true);
  assert.equal(child.stderr.destroyed, true);
  assert.equal(await controller.exited(), true);
});

test('parent rejects stale, extra, and oversized worker output and sanitizes fork failures', async () => {
  const invalidReplies = [
    message => ({ ...workerMessage(message.requestId + 1, 'READY') }),
    message => ({ ...workerMessage(message.requestId, 'READY'), extra: true }),
  ];
  for (let index = 0; index < invalidReplies.length; index += 1) {
    const controller = await startLiveEvidenceFacilitatorWorker({
      ...controllerOptions('unused'),
      forkProcess: () => fakeProtocolChild(invalidReplies[index]),
    });
    await assert.rejects(
      controller.start(),
      error => error?.code === 'live_evidence_worker_failed' && error?.cause === undefined,
    );
  }

  const noisy = fakeProtocolChild(message => workerMessage(message.requestId, 'READY'));
  const noisyController = await startLiveEvidenceFacilitatorWorker({
    ...controllerOptions('unused'),
    forkProcess: () => noisy,
  });
  const pending = noisyController.start();
  noisy.stdout.write(Buffer.alloc(64 * 1024 + 1));
  await assert.rejects(pending, /live_evidence_worker_failed/);

  await assert.rejects(startLiveEvidenceFacilitatorWorker({
    ...controllerOptions('unused'),
    forkProcess: () => { throw new Error('private-spawn-sentinel'); },
  }), error => error?.code === 'live_evidence_worker_failed' && error?.cause === undefined);

  let configGetterReads = 0;
  const hostile = controllerOptions('unused');
  Object.defineProperty(hostile, 'config', {
    enumerable: true,
    get() { configGetterReads += 1; return CONFIG; },
  });
  await assert.rejects(startLiveEvidenceFacilitatorWorker(hostile), /live_evidence_worker_failed/);
  assert.equal(configGetterReads, 0);

  for (const invalidSnapshot of [
    { quiescent: true, schemaVersion: 2, revision: 5, records: [{}] },
    { quiescent: true, schemaVersion: 1, revision: 5, records: [{}, {}] },
  ]) {
    const invalidChild = fakeProtocolChild(message => {
      if (message.type === 'START') return workerMessage(message.requestId, 'READY');
      if (message.type === 'STOP') {
        return workerMessage(message.requestId, 'STOPPED', { snapshot: invalidSnapshot });
      }
      return workerMessage(message.requestId, 'STATUS', { poisoned: false });
    });
    const controller = await startLiveEvidenceFacilitatorWorker({
      ...controllerOptions('unused'),
      forkProcess: () => invalidChild,
    });
    await controller.start();
    await assert.rejects(controller.closeAndSnapshot(), /live_evidence_worker_failed/);
  }
});

test('parent rejects unclean child exit and escalates termination from TERM to KILL', async () => {
  for (const exit of [
    { code: 1, signal: null },
    { code: null, signal: 'SIGTERM' },
  ]) {
    const child = fakeProtocolChild(message => {
      if (message.type === 'START') return workerMessage(message.requestId, 'READY');
      if (message.type === 'STOP') {
        emitFakeChildExitAndClose(child, exit.code, exit.signal);
        return workerMessage(message.requestId, 'STOPPED', { snapshot: null });
      }
      return workerMessage(message.requestId, 'STATUS', { poisoned: false });
    });
    child.kill = () => true;
    const controller = await startLiveEvidenceFacilitatorWorker({
      ...controllerOptions('unused'),
      forkProcess: () => child,
    });
    await controller.start();
    await assert.rejects(controller.exit(), /live_evidence_worker_failed/);
  }

  const kills = [];
  const child = fakeProtocolChild(message => workerMessage(message.requestId, 'READY'));
  child.kill = signal => {
    kills.push(signal);
    if (signal === 'SIGKILL') emitFakeChildExitAndClose(child, null, 'SIGKILL');
    return true;
  };
  const controller = await startLiveEvidenceFacilitatorWorker({
    ...controllerOptions('unused'),
    forkProcess: () => child,
  });
  await controller.terminate();
  assert.deepEqual(kills, ['SIGTERM', 'SIGKILL']);
  assert.equal(child.stdout.destroyed, true);
  assert.equal(child.stderr.destroyed, true);
  assert.equal(await controller.exited(), true);
});

test('runner CLI has fixed success and failure output with strict flags and result checks', async () => {
  const argv = [
    'preflight',
    '--config', 'config',
    '--buyer-rpc', 'buyer-rpc',
    '--buyer-wallet', 'buyer-wallet',
    '--facilitator-rpc', 'facilitator-rpc',
    '--workspace', 'workspace',
    '--run-name', 'run-name',
  ];
  const stdout = [];
  const stderr = [];
  assert.equal(await runLiveEvidenceRunnerCli({
    argv,
    stdout: value => { stdout.push(value); },
    stderr: value => { stderr.push(value); },
    preflight: async () => Object.freeze({ valid: true }),
    execute: async () => { throw new Error('must-not-run'); },
  }), true);
  assert.deepEqual(stdout, ['LIVE_EVIDENCE_RUN_PREFLIGHT_VALID\n']);
  assert.deepEqual(stderr, []);

  for (const [result, expected] of [
    [Object.freeze({ status: 'complete', evidenceEligible: true }), 'LIVE_EVIDENCE_RUN_COMPLETE\n'],
    [Object.freeze({ status: 'resolved', evidenceEligible: false }),
      'LIVE_EVIDENCE_RUN_RESOLVED_NONPUBLISHABLE\n'],
  ]) {
    const runOutput = [];
    const runErrors = [];
    assert.equal(await runLiveEvidenceRunnerCli({
      argv: ['run', ...argv.slice(1)],
      stdout: value => { runOutput.push(value); },
      stderr: value => { runErrors.push(value); },
      preflight: async () => { throw new Error('must-not-run'); },
      execute: async () => result,
    }), true);
    assert.deepEqual(runOutput, [expected]);
    assert.deepEqual(runErrors, []);
  }

  const invalidRun = [];
  assert.equal(await runLiveEvidenceRunnerCli({
    argv: ['run', ...argv.slice(1)],
    stdout: () => { throw new Error('must-not-write'); },
    stderr: value => { invalidRun.push(value); },
    preflight: async () => { throw new Error('must-not-run'); },
    execute: async () => ({ status: 'complete', evidenceEligible: false }),
  }), false);
  assert.deepEqual(invalidRun, ['LIVE_EVIDENCE_RUN_FAILED\n']);

  const invalidArgv = [
    [...argv, '--unknown', 'value'],
    argv.map((value, index) => index === 3 ? '--config' : value),
  ];
  for (let index = 0; index < invalidArgv.length; index += 1) {
    const fixedOut = [];
    assert.equal(await runLiveEvidenceRunnerCli({
      argv: invalidArgv[index],
      stdout: () => { throw new Error('must-not-write'); },
      stderr: value => { fixedOut.push(value); },
      preflight: async () => Object.freeze({ valid: true }),
      execute: async () => Object.freeze({ status: 'complete', evidenceEligible: true }),
    }), false);
    assert.deepEqual(fixedOut, ['LIVE_EVIDENCE_RUN_FAILED\n']);
  }
  const badResult = [];
  assert.equal(await runLiveEvidenceRunnerCli({
    argv,
    stdout: () => {},
    stderr: value => { badResult.push(value); },
    preflight: async () => Object.freeze({ valid: false }),
    execute: async () => {},
  }), false);
  assert.deepEqual(badResult, ['LIVE_EVIDENCE_RUN_FAILED\n']);
});
