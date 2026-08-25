import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as sdk from 'znn-typescript-sdk';
import { paymentIntentDigest } from '../src/canonical.js';
import { createResourceServer } from '../src/resource-server.js';
import { decodeB64Json, encodeB64Json, HEADERS } from '../src/x402-wire.js';
import {
  computeBlockHash,
  ExactZenonClient,
  ExactZenonFacilitator,
  preflightZenonPayment,
} from '../src/zenon-payment.js';
import {
  EVIDENCE_STATES,
  SettlementJournal,
} from '../src/settlement-journal.js';

const PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  // Synthetic test-only identity; not a real network profile.
  genesisMomentumHash: '7'.repeat(64),
});

test('live payment capability routing is immutable and requires no SDK operation', () => {
  const client = new ExactZenonClient({ mnemonic: '', accountIndex: 0, rpcTimeoutMs: 1 });
  const descriptor = Object.getOwnPropertyDescriptor(client, 'paymentCapabilities');
  assert.ok(descriptor);
  assert.equal(descriptor.enumerable, false);
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.configurable, false);
  assert.deepEqual(descriptor.value, {
    version: 1,
    x402Version: 2,
    routes: [{
      scheme: 'exact',
      network: 'zenon:testnet',
      paymentFlows: ['upfront'],
    }],
  });
  assert.equal(Object.isFrozen(descriptor.value.routes[0].paymentFlows), true);
});

function requirement({ asset = sdk.ZNN_ZTS.toString() } = {}) {
  const seller = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 18));
  try {
    return {
      scheme: 'exact',
      network: 'zenon:testnet',
      asset,
      amount: '1',
      payTo: seller.getAddress().toString(),
      maxTimeoutSeconds: 1,
      extra: {
        paymentFlow: 'upfront',
        poc: true,
        settlement: 'account-block',
        zenonChain: { ...PROFILE },
      },
    };
  } finally {
    seller.clear();
  }
}

function challenge(accepted = requirement(), url = 'https://resource.example/paid') {
  return {
    x402Version: 2,
    resource: {
      url,
      description: 'Zenon x402 PoC protected resource',
      mimeType: 'application/json',
    },
    accepts: [accepted],
  };
}

function signedPayment(
  paymentRequired,
  accepted = paymentRequired.accepts[0],
  privateByte = 17,
  { height = 1, previousHash } = {},
) {
  const buyer = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, privateByte));
  try {
    const block = sdk.AccountBlockTemplate.send(
      sdk.Address.parse(accepted.payTo),
      sdk.TokenStandard.parse(accepted.asset),
      BigInt(accepted.amount),
    );
    block.chainIdentifier = Number(accepted.extra.zenonChain.chainIdentifier);
    block.address = buyer.getAddress();
    block.height = height;
    if (previousHash) block.previousHash = previousHash;
    block.momentumAcknowledged = new sdk.HashHeight(
      sdk.Hash.digest(Buffer.from('synthetic acknowledged momentum')),
      1,
    );
    const intentDigest = paymentIntentDigest(paymentRequired, accepted);
    block.data = Buffer.from(intentDigest, 'hex');
    block.nonce = '0000000000000000';
    block.publicKey = buyer.getPublicKey();
    block.hash = computeBlockHash(block, sdk);
    block.signature = buyer.sign(block.hash.getBytes());
    return {
      x402Version: paymentRequired.x402Version,
      resource: structuredClone(paymentRequired.resource),
      accepted: structuredClone(accepted),
      payload: {
        transaction: block.toJson(),
        intentDigest,
      },
    };
  } finally {
    buyer.clear();
  }
}

function observedBlock(transaction, { included = false } = {}) {
  const block = sdk.AccountBlockTemplate.fromJson(transaction);
  block.publicKey = Buffer.from(transaction.publicKey, 'base64');
  block.signature = Buffer.from(transaction.signature, 'base64');
  if (included) {
    block.confirmationDetail = {
      numConfirmations: 1,
      momentumHeight: 11,
      momentumHash: sdk.Hash.digest(Buffer.from('synthetic inclusion momentum')),
      momentumTimestamp: 1,
    };
  }
  return block;
}

async function journalFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zenon-x402-live-integration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'state');
  return {
    root,
    directory,
    journal: new SettlementJournal({ directory, allowedRoot: root }),
  };
}

function installSyntheticNode(t, behavior = {}) {
  const zenon = sdk.Zenon.getInstance();
  const original = {
    initialize: zenon.initialize,
    clearConnection: zenon.clearConnection,
    ledger: zenon.ledger,
    stats: zenon.stats,
    subscribe: zenon.subscribe,
    embedded: zenon.embedded,
    hadClient: Object.hasOwn(zenon, 'client'),
    client: zenon.client,
    chainIdentifier: sdk.Zenon.getChainIdentifier(),
    networkId: sdk.Zenon.getNetworkID(),
  };
  const counters = {
    initialize: 0,
    clearConnection: 0,
    lookup: 0,
    frontier: 0,
    unconfirmed: 0,
    assetLookup: 0,
    publish: 0,
    subscribe: 0,
  };

  zenon.initialize = async () => {
    counters.initialize += 1;
    zenon.client = { synthetic: true };
    return behavior.initialize?.();
  };
  zenon.clearConnection = () => {
    counters.clearConnection += 1;
    zenon.client = undefined;
    return behavior.clearConnection?.();
  };
  zenon.stats = {
    networkInfo: async () => ({
      numPeers: 1,
      self: { publicKey: 'synthetic-node-public-key', ip: 'loopback' },
      peers: [],
    }),
    syncInfo: async () => ({
      state: sdk.SyncState.SyncDone,
      currentHeight: 10,
      targetHeight: 10,
    }),
  };
  zenon.embedded = {
    token: {
      getByZts: async tokenStandard => {
        counters.assetLookup += 1;
        return behavior.asset?.(tokenStandard, counters.assetLookup) ?? { tokenStandard };
      },
    },
  };
  zenon.ledger = {
    getFrontierMomentum: async () => ({
      chainIdentifier: Number(PROFILE.chainIdentifier),
      height: 10,
      hash: sdk.Hash.digest(Buffer.from('synthetic frontier momentum')),
    }),
    getAccountBlockByHash: async () => {
      counters.lookup += 1;
      return behavior.lookup?.(counters.lookup) ?? null;
    },
    getFrontierAccountBlock: async () => {
      counters.frontier += 1;
      return behavior.frontier?.(counters.frontier) ?? null;
    },
    getUnconfirmedBlocksByAddress: async (_address, page, pageSize) => {
      counters.unconfirmed += 1;
      return behavior.unconfirmed?.({ page, pageSize, call: counters.unconfirmed }) ?? { count: 0, list: [] };
    },
    publishRawTransaction: async block => {
      counters.publish += 1;
      return behavior.publish?.(block, counters.publish);
    },
  };
  zenon.subscribe = {
    toAccountBlocksByAddress: async () => {
      counters.subscribe += 1;
      return {
        onNotification(callback) {
          behavior.onSubscription?.(callback);
        },
      };
    },
  };

  t.after(() => {
    zenon.initialize = original.initialize;
    zenon.clearConnection = original.clearConnection;
    zenon.ledger = original.ledger;
    zenon.stats = original.stats;
    zenon.subscribe = original.subscribe;
    zenon.embedded = original.embedded;
    if (original.hadClient) zenon.client = original.client;
    else delete zenon.client;
    sdk.Zenon.setChainID(original.chainIdentifier);
    sdk.Zenon.setNetworkID(original.networkId);
  });

  return { zenon, counters, behavior };
}

function facilitator(journal, options = {}) {
  return new ExactZenonFacilitator({
    journal,
    rpcTimeoutMs: options.rpcTimeoutMs ?? 100,
    authenticateChainProfile: async () => ({ ...PROFILE }),
  });
}

function submit(localUrl, payload) {
  return fetch(`${localUrl}/paid`, {
    headers: { [HEADERS.PAYMENT_SIGNATURE]: encodeB64Json(payload) },
  });
}

function reverseMemberOrder(value) {
  if (Array.isArray(value)) return value.map(reverseMemberOrder);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).reverse().map(key => [key, reverseMemberOrder(value[key])]));
}

test('ExactZenonFacilitator deterministic settlement integration scenarios', async t => {
  const priorEnvironment = {
    ZENON_LIVE_ACK: process.env.ZENON_LIVE_ACK,
    ZENON_NETWORK_ID: process.env.ZENON_NETWORK_ID,
    ZENON_RPC_URL: process.env.ZENON_RPC_URL,
  };
  process.env.ZENON_LIVE_ACK = 'I_UNDERSTAND_TESTNET_ONLY';
  process.env.ZENON_NETWORK_ID = '3';
  process.env.ZENON_RPC_URL = 'ws://rpc.invalid';
  t.after(() => {
    for (const [key, value] of Object.entries(priorEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  await t.test('scenario 1: the exact signed block is durable before publication', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    required.resource.serviceName = 'Service';
    required.resource.tags = ['alpha', 'alpha', 'beta'];
    required.resource.iconUrl = 'HTTPS://icons.example:443/a%2Fb.png?size=2#mark';
    const payload = signedPayment(required, accepted);
    payload.extensions = {};
    const preflight = await preflightZenonPayment(payload, accepted, required);
    assert.deepEqual(preflight.resourceIdentity, required.resource);
    const { root, directory, journal } = await journalFixture(t);
    const included = observedBlock(payload.payload.transaction, { included: true });
    let published = false;
    const { counters } = installSyntheticNode(t, {
      lookup: () => published ? included : null,
      publish: async block => {
        const persisted = await journal.get(preflight.authorizationKey, preflight.transactionHash);
        assert.equal(persisted.evidenceState, EVIDENCE_STATES.VALIDATED);
        assert.deepEqual(persisted.signedAccountBlock, payload.payload.transaction);
        assert.equal(block.hash.toString(), preflight.transactionHash);
        published = true;
      },
    });

    const result = await facilitator(journal).settle(payload, accepted, required);
    assert.equal(result.success, true);
    assert.equal(result.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(counters.publish, 1);
    const persisted = await journal.get(preflight.authorizationKey, preflight.transactionHash);
    assert.equal(persisted.evidenceState, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.deepEqual(persisted.resourceIdentity, required.resource);
    const reloaded = new SettlementJournal({ directory, allowedRoot: root });
    assert.deepEqual(
      (await reloaded.get(preflight.authorizationKey, preflight.transactionHash)).resourceIdentity,
      required.resource,
    );
  });

  await t.test('scenario 2: included retry bypasses an advanced frontier and never republishes', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted);
    const { journal } = await journalFixture(t);
    const included = observedBlock(payload.payload.transaction, { included: true });
    let published = false;
    const node = installSyntheticNode(t, {
      lookup: () => published ? included : null,
      publish: async () => { published = true; },
      frontier: () => published ? {
        height: 99,
        hash: sdk.Hash.digest(Buffer.from('advanced external frontier')),
      } : null,
    });
    const exact = facilitator(journal);

    const first = await exact.settle(payload, accepted, required);
    assert.equal(first.success, true);
    const countsAfterFirst = { ...node.counters };
    const retry = await exact.settle(payload, accepted, required);
    assert.equal(retry.success, true);
    assert.equal(retry.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(node.counters.publish, 1);
    assert.equal(node.counters.initialize, countsAfterFirst.initialize);
    assert.equal(node.counters.frontier, countsAfterFirst.frontier);
  });

  await t.test('scenario 3: acknowledged retry reconciles inclusion without republishing', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted);
    const preflight = await preflightZenonPayment(payload, accepted, required);
    const { journal } = await journalFixture(t);
    const included = observedBlock(payload.payload.transaction, { included: true });
    let phase = 'initial';
    const node = installSyntheticNode(t, {
      lookup: () => {
        if (phase === 'initial') return null;
        if (phase === 'observation-error') throw new Error('synthetic observation failure');
        return included;
      },
      frontier: () => {
        if (phase === 'included') throw new Error('known transaction retry must not query the advanced frontier');
        return null;
      },
      publish: async () => { phase = 'observation-error'; },
    });
    const exact = facilitator(journal);

    const first = await exact.settle(payload, accepted, required);
    assert.equal(first.success, false);
    assert.equal(first.state, EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED);
    assert.equal(first.retrySamePayment, true);
    assert.equal((await journal.get(preflight.authorizationKey, preflight.transactionHash)).evidenceState,
      EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED);

    const frontierCallsBeforeRetry = node.counters.frontier;
    phase = 'included';
    const retry = await exact.settle(payload, accepted, required);
    assert.equal(retry.success, true);
    assert.equal(retry.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(node.counters.publish, 1);
    assert.equal(node.counters.frontier, frontierCallsBeforeRetry);
  });

  await t.test('scenario 4: publish response loss reconciles the same known transaction', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted);
    const { journal } = await journalFixture(t);
    const observed = observedBlock(payload.payload.transaction);
    const included = observedBlock(payload.payload.transaction, { included: true });
    let phase = 'unknown';
    const node = installSyntheticNode(t, {
      lookup: () => {
        if (phase === 'known') {
          phase = 'included';
          return observed;
        }
        return phase === 'included' ? included : null;
      },
      publish: async () => {
        phase = 'known';
        throw new Error('synthetic response loss');
      },
    });

    const result = await facilitator(journal).settle(payload, accepted, required);
    assert.equal(result.success, true);
    assert.equal(result.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(node.counters.publish, 1);
  });

  await t.test('scenario 5: ambiguous evidence survives reload and reconciles without republishing', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    required.resource.serviceName = 'Service';
    required.resource.tags = [];
    required.resource.iconUrl = 'http://localhost/icon.png?size=2#mark';
    const payload = signedPayment(required, accepted);
    const preflight = await preflightZenonPayment(payload, accepted, required);
    assert.deepEqual(preflight.resourceIdentity, required.resource);
    const { root, directory, journal } = await journalFixture(t);
    const included = observedBlock(payload.payload.transaction, { included: true });
    let phase = 'unknown';
    const node = installSyntheticNode(t, {
      lookup: () => phase === 'included' ? included : null,
      publish: async () => { throw new Error('synthetic uncertain publication'); },
    });

    const first = await facilitator(journal).settle(payload, accepted, required);
    assert.equal(first.success, false);
    assert.equal(first.state, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
    assert.equal(first.retrySamePayment, true);

    const reloaded = new SettlementJournal({ directory, allowedRoot: root });
    const persisted = await reloaded.get(preflight.authorizationKey, preflight.transactionHash);
    assert.equal(persisted.evidenceState, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
    assert.deepEqual(persisted.resourceIdentity, required.resource);
    phase = 'included';
    const retry = await facilitator(reloaded).settle(payload, accepted, required);
    assert.equal(retry.success, true);
    assert.equal(retry.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(node.counters.publish, 1);
  });

  await t.test('scenario 5 evidence: asset validation precedes observation and inclusion is durable', async t => {
    const syntheticZts = sdk.TokenStandard.fromCore(Buffer.alloc(10, 0x42)).toString();
    const accepted = requirement({ asset: syntheticZts });
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted);
    const preflight = await preflightZenonPayment(payload, accepted, required);
    const { journal } = await journalFixture(t);
    const included = observedBlock(payload.payload.transaction, { included: true });
    const events = [];
    const putValidated = journal.putValidated.bind(journal);
    const updateEvidence = journal.updateEvidence.bind(journal);
    journal.putValidated = async input => {
      events.push('journal:validated');
      return putValidated(input);
    };
    journal.updateEvidence = async (...args) => {
      events.push(`journal:${args[2]}`);
      return updateEvidence(...args);
    };
    const node = installSyntheticNode(t, {
      lookup: () => {
        events.push('lookup');
        return included;
      },
      asset: tokenStandard => {
        events.push('asset');
        assert.equal(tokenStandard.toString(), syntheticZts);
        return { tokenStandard };
      },
    });
    const exact = facilitator(journal);

    const first = await exact.settle(payload, accepted, required);
    assert.equal(first.success, true);
    assert.equal(first.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(node.counters.publish, 0);
    assert.ok(events.indexOf('asset') < events.indexOf('lookup'));
    assert.ok(events.indexOf('lookup') < events.indexOf('journal:validated'));
    assert.ok(events.indexOf('journal:validated') < events.indexOf(`journal:${EVIDENCE_STATES.MOMENTUM_INCLUDED}`));
    assert.equal((await journal.get(preflight.authorizationKey, preflight.transactionHash)).evidenceState,
      EVIDENCE_STATES.MOMENTUM_INCLUDED);

    const initializeCalls = node.counters.initialize;
    node.behavior.asset = () => { throw new Error('durable retry must not repeat asset lookup'); };
    node.behavior.lookup = () => { throw new Error('durable retry must not repeat transaction lookup'); };
    const retry = await exact.settle(payload, accepted, required);
    assert.equal(retry.success, true);
    assert.equal(retry.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(node.counters.publish, 0);
    assert.equal(node.counters.initialize, initializeCalls);
  });

  await t.test('scenario 6: a definite pre-publication frontier failure emits bound HTTP rejection evidence', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted, 17, {
      height: 2,
      previousHash: sdk.Hash.digest(Buffer.from('submitted account frontier')),
    });
    const { journal } = await journalFixture(t);
    const node = installSyntheticNode(t, {
      lookup: () => null,
      frontier: () => ({
        height: 1,
        hash: sdk.Hash.digest(Buffer.from('stale frontier')),
      }),
    });
    const exact = facilitator(journal);
    let internalSettlement;
    let deliveries = 0;
    const app = createResourceServer({
      facilitator: {
        settle: async (...args) => {
          internalSettlement = await exact.settle(...args);
          return internalSettlement;
        },
      },
      requirement: accepted,
      advertisedBaseUrl: 'https://resource.example',
      resourceHandler: async () => ({ ok: true, deliveries: ++deliveries }),
    });
    const listening = await app.listen();
    try {
      const response = await submit(listening.url, payload);
      const body = await response.json();
      assert.ok(response.headers.get(HEADERS.PAYMENT_REQUIRED));
      assert.ok(response.headers.get(HEADERS.PAYMENT_RESPONSE));
      const rejectionRequired = decodeB64Json(response.headers.get(HEADERS.PAYMENT_REQUIRED));
      const settlement = decodeB64Json(response.headers.get(HEADERS.PAYMENT_RESPONSE));

      assert.equal(response.status, 402);
      assert.deepEqual(rejectionRequired, required);
      assert.deepEqual(body, { error: 'payment_settlement_failed' });
      assert.deepEqual(settlement, {
        success: false,
        network: accepted.network,
        transaction: payload.payload.transaction.hash,
        payer: payload.payload.transaction.address,
        state: EVIDENCE_STATES.VALIDATED,
        errorReason: 'payment_settlement_failed',
      });
      assert.match(settlement.transaction, /^[0-9a-f]{64}$/);
      assert.equal(Object.hasOwn(settlement, 'retrySamePayment'), false);
      assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
      assert.equal(response.headers.get('vary'), 'PAYMENT-SIGNATURE');

      assert.equal(internalSettlement.success, false);
      assert.equal(internalSettlement.state, EVIDENCE_STATES.VALIDATED);
      assert.equal(internalSettlement.errorReason, 'stale_frontier');
      assert.equal(internalSettlement.retrySamePayment, false);
      assert.equal(internalSettlement.deliveryState, 'NONE');
      assert.equal(internalSettlement.network, accepted.network);
      assert.equal(internalSettlement.transaction, payload.payload.transaction.hash);
      assert.equal(internalSettlement.payer, payload.payload.transaction.address);
      assert.notEqual(internalSettlement.state, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
      assert.equal(node.counters.publish, 0);
      assert.equal(deliveries, 0);
      assert.equal((await journal.list()).length, 0);
    } finally {
      await app.close();
    }
  });

  await t.test('scenario 7: direct settle rejects offline tampering before initialize', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const original = signedPayment(required, accepted);
    const { journal } = await journalFixture(t);
    const node = installSyntheticNode(t);
    const exact = facilitator(journal);

    const wrongNetwork = structuredClone(accepted);
    wrongNetwork.network = 'zenon:mainnet';
    const wrongNetworkRequired = challenge(wrongNetwork);
    const wrongNetworkPayload = structuredClone(original);
    wrongNetworkPayload.accepted = wrongNetwork;
    wrongNetworkPayload.resource = structuredClone(wrongNetworkRequired.resource);

    const substitutedProfile = structuredClone(accepted);
    substitutedProfile.extra.zenonChain.genesisMomentumHash = '8'.repeat(64);
    const substitutedRequired = challenge(substitutedProfile);
    const substitutedPayload = structuredClone(original);
    substitutedPayload.accepted = substitutedProfile;
    substitutedPayload.resource = structuredClone(substitutedRequired.resource);

    const malformedProfile = structuredClone(accepted);
    malformedProfile.extra.zenonChain.unexpected = true;
    const malformedRequired = challenge(malformedProfile);
    const malformedPayload = structuredClone(original);
    malformedPayload.accepted = malformedProfile;
    malformedPayload.resource = structuredClone(malformedRequired.resource);

    const badSignature = structuredClone(original);
    badSignature.payload.transaction.signature = Buffer.alloc(64).toString('base64');

    const reboundRequired = challenge(accepted, 'https://resource.example/different');
    const reboundResource = structuredClone(original);
    reboundResource.resource = structuredClone(reboundRequired.resource);

    const changedSignedHash = structuredClone(original);
    changedSignedHash.payload.transaction.hash = '1'.repeat(64);

    for (const [payload, selected, paymentRequired, expectedReason] of [
      [wrongNetworkPayload, wrongNetwork, wrongNetworkRequired, 'malformed_payment'],
      [substitutedPayload, substitutedProfile, substitutedRequired, 'intent_mismatch'],
      [malformedPayload, malformedProfile, malformedRequired, 'malformed_payment'],
      [badSignature, accepted, required, 'invalid_signature'],
      [reboundResource, accepted, reboundRequired, 'intent_mismatch'],
      [changedSignedHash, accepted, required, 'block_hash_mismatch'],
    ]) {
      const result = await exact.settle(payload, selected, paymentRequired);
      assert.equal(result.success, false);
      assert.equal(result.state, 'VALIDATION_FAILED');
      assert.equal(result.errorReason, expectedReason);
    }

    let deliveries = 0;
    const app = createResourceServer({
      facilitator: exact,
      requirement: accepted,
      advertisedBaseUrl: 'https://resource.example',
      resourceHandler: async () => ({ ok: true, deliveries: ++deliveries }),
    });
    const listening = await app.listen();
    try {
      const response = await submit(listening.url, badSignature);
      assert.equal(response.status, 402);
      assert.ok(response.headers.get(HEADERS.PAYMENT_REQUIRED));
      assert.equal(response.headers.get(HEADERS.PAYMENT_RESPONSE), null);
      assert.deepEqual(await response.json(), { error: 'payment_settlement_failed' });
      assert.equal(deliveries, 0);
    } finally {
      await app.close();
    }
    assert.equal(node.counters.initialize, 0);
    assert.equal(node.counters.publish, 0);
    assert.equal((await journal.list()).length, 0);
  });

  await t.test('journal corruption fails closed before SDK initialization', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted);
    const { directory, journal } = await journalFixture(t);
    const node = installSyntheticNode(t);

    await journal.list();
    await writeFile(join(directory, 'settlement-journal.json'), '{malformed', 'utf8');
    const result = await facilitator(journal).settle(payload, accepted, required);
    assert.equal(result.success, false);
    assert.equal(result.errorReason, 'journal_corrupt');
    assert.equal(result.state, EVIDENCE_STATES.VALIDATED);
    assert.equal(result.retrySamePayment, true);
    assert.equal(node.counters.initialize, 0);
    assert.equal(node.counters.publish, 0);
  });

  await t.test('scenarios 8 and 9: exact concurrent HTTP delivery converges and delivered retry is cached', async t => {
    const accepted = requirement();
    const { journal } = await journalFixture(t);
    let published = false;
    let included;
    const node = installSyntheticNode(t, {
      lookup: () => published ? included : null,
      publish: async () => { published = true; },
    });
    const exact = facilitator(journal);
    let deliveries = 0;
    let signalDelivery;
    let releaseDelivery;
    const deliveryStarted = new Promise(resolve => { signalDelivery = resolve; });
    const deliveryGate = new Promise(resolve => { releaseDelivery = resolve; });
    const app = createResourceServer({
      facilitator: exact,
      requirement: accepted,
      advertisedBaseUrl: 'https://resource.example',
      resourceHandler: async () => {
        deliveries += 1;
        signalDelivery();
        await deliveryGate;
        return { ok: true, entitlement: 'exact-live-test' };
      },
    });
    let paidRequests = 0;
    let signalDuplicateObserved;
    const duplicateObserved = new Promise(resolve => { signalDuplicateObserved = resolve; });
    app.server.on('request', request => {
      if (request.method === 'GET' && request.url === '/paid' && ++paidRequests === 3) {
        signalDuplicateObserved();
      }
    });
    const listening = await app.listen();
    try {
      const first = await fetch(`${listening.url}/paid`);
      const required = decodeB64Json(first.headers.get(HEADERS.PAYMENT_REQUIRED));
      const payload = signedPayment(required, accepted);
      const reorderedPayload = reverseMemberOrder(payload);
      assert.deepEqual(reorderedPayload, payload);
      assert.notEqual(encodeB64Json(reorderedPayload), encodeB64Json(payload));
      included = observedBlock(payload.payload.transaction, { included: true });

      const firstPending = submit(listening.url, payload);
      await deliveryStarted;
      const secondPending = submit(listening.url, reorderedPayload);
      await duplicateObserved;
      assert.equal(deliveries, 1);
      releaseDelivery();
      const [firstPaid, secondPaid] = await Promise.all([firstPending, secondPending]);
      const [firstText, secondText] = await Promise.all([firstPaid.text(), secondPaid.text()]);
      assert.equal(firstPaid.status, 200);
      assert.equal(secondPaid.status, 200);
      assert.equal(firstText, secondText);
      assert.equal(deliveries, 1);
      assert.equal(node.counters.initialize, 1);
      assert.equal(node.counters.publish, 1);

      const countsAfterDelivery = { ...node.counters };
      const retry = await submit(listening.url, payload);
      assert.equal(retry.status, 200);
      assert.equal(await retry.text(), firstText);
      assert.equal(deliveries, 1);
      assert.equal(node.counters.publish, 1);
      assert.equal(node.counters.initialize, countsAfterDelivery.initialize);
    } finally {
      releaseDelivery?.();
      await app.close();
    }
  });

  // This scenario permanently poisons the module-wide live runtime and must be
  // the final exact-facilitator scenario in this isolated test process.
  await t.test('scenario 10: publication timeout is ambiguous, delivers nothing, and blocks later sessions', async t => {
    const accepted = requirement();
    const { journal } = await journalFixture(t);
    const node = installSyntheticNode(t, {
      lookup: () => null,
      publish: () => new Promise(() => {}),
    });
    const exact = facilitator(journal, { rpcTimeoutMs: 20 });
    let deliveries = 0;
    const app = createResourceServer({
      facilitator: exact,
      requirement: accepted,
      advertisedBaseUrl: 'https://resource.example',
      resourceHandler: async () => ({ ok: true, deliveries: ++deliveries }),
    });
    const listening = await app.listen();
    try {
      const first = await fetch(`${listening.url}/paid`);
      const required = decodeB64Json(first.headers.get(HEADERS.PAYMENT_REQUIRED));
      const payload = signedPayment(required, accepted);
      const preflight = await preflightZenonPayment(payload, accepted, required);
      const response = await submit(listening.url, payload);
      const body = await response.json();
      const settlement = decodeB64Json(response.headers.get(HEADERS.PAYMENT_RESPONSE));

      assert.equal(response.status, 409);
      assert.equal(body.action, 'reuse_and_reconcile_same_payment');
      assert.equal(settlement.state, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
      assert.equal(settlement.retrySamePayment, true);
      assert.equal(deliveries, 0);
      assert.equal(node.counters.initialize, 1);
      assert.equal(node.counters.publish, 1);
      assert.equal((await journal.get(preflight.authorizationKey, preflight.transactionHash)).evidenceState,
        EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);

      const initializeCount = node.counters.initialize;
      const retry = await exact.settle(payload, accepted, required);
      assert.equal(retry.success, false);
      assert.equal(retry.errorReason, 'live_runtime_poisoned_restart_required');
      assert.equal(retry.retrySamePayment, true);
      assert.equal(node.counters.initialize, initializeCount);
      assert.equal(node.counters.publish, 1);
    } finally {
      await app.close();
    }
  });
});
