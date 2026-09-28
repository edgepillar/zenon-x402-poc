import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import * as sdk from 'znn-typescript-sdk';
import { paymentIntentDigest, sha256Hex } from '../src/canonical.js';
import { createResourceServer } from '../src/resource-server.js';
import { SettlementJournal } from '../src/settlement-journal.js';
import { decodeB64Json, encodeB64Json, HEADERS } from '../src/x402-wire.js';
import { computeBlockHash, preflightZenonPayment } from '../src/zenon-payment.js';
import {
  FIXED_PAYER_SHARD_MANIFEST_FILE,
  createFixedPayerShardRouting,
} from '../src/zenon/fixed-payer-shard-routing.js';

const parentListenersBeforeImport = Object.freeze({
  message: process.listenerCount('message'),
  disconnect: process.listenerCount('disconnect'),
  exit: process.listenerCount('exit'),
});
const dispatcherImport = import('../src/zenon/fixed-payer-settlement-dispatcher.js');
const childImport = import('../src/zenon/fixed-payer-settlement-child.js');
const ownerImport = import('../src/zenon/fixed-payer-settlement-owner.js');
const childStartupImport = import('../src/zenon/fixed-payer-settlement-child-startup.js');
const [dispatcherModule, childModule, ownerModule, childStartupModule] = await Promise.all([
  dispatcherImport,
  childImport,
  ownerImport,
  childStartupImport,
]);
const {
  FIXED_PAYER_SETTLEMENT_DISPATCHER_ERROR_CODES: DISPATCH_CODES,
  FixedPayerSettlementDispatcherError,
  createFixedPayerSettlementDispatcher,
} = dispatcherModule;
const { runFixedPayerSettlementChild } = childModule;
const {
  FIXED_PAYER_SETTLEMENT_OWNER_ERROR_CODES: OWNER_CODES,
  FixedPayerSettlementOwnerError,
  createFixedPayerSettlementOfflineTestAuthority,
  createFixedPayerSettlementOwner,
} = ownerModule;
const {
  FIXED_PAYER_SETTLEMENT_STARTUP_MARKER_FILE,
  FIXED_PAYER_SETTLEMENT_STARTUP_STDERR_BOUNDARY,
  FIXED_PAYER_SETTLEMENT_STARTUP_STDOUT_BOUNDARY,
  prepareFreshFixedPayerSettlementChild,
} = childStartupModule;

const CHILD_ENTRYPOINT = fileURLToPath(new URL(
  '../src/zenon/fixed-payer-settlement-child-startup.js',
  import.meta.url,
));
const EXECUTABLE = process.execPath;
const FIXTURE_NAME = 'signed-payment.json';
const STARTUP_FIXTURE_NAME = 'fixed-payer-startup.json';
const OFFLINE_TEST_MODE = '--fixed-payer-offline-test-v2';
const DUAL_PAYMENT_STARTUP_MODE = 'OWNER_FACADE_DUAL_PAYMENT';
const PUBLICATION_MARKER = 'PUBLICATION_BOUNDARY';
const STARTUP_STDOUT_BOUNDARY = FIXED_PAYER_SETTLEMENT_STARTUP_STDOUT_BOUNDARY.trimEnd();
const STARTUP_STDERR_BOUNDARY = FIXED_PAYER_SETTLEMENT_STARTUP_STDERR_BOUNDARY.trimEnd();
const STARTUP_CLAIM = Object.freeze({
  REQUIRED: 'REQUIRED',
  RETAINED: 'RETAINED',
  NOT_PROVEN_CLAIMED: 'NOT_PROVEN_CLAIMED',
});
const CONFIGURATION = Object.freeze({
  schemaVersion: 1,
  kind: 'zenon-fixed-payer-shard-routing',
  routingVersion: 1,
  shardIds: Object.freeze(['payer-shard-a', 'payer-shard-b']),
});
const PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: '7'.repeat(64),
});
const RESOURCE = Object.freeze({
  url: 'https://127.0.0.1/paid',
  description: 'Zenon x402 PoC protected resource',
  mimeType: 'application/json',
});
const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function fixedFailure(code) {
  const error = new Error(code);
  error.name = 'FixedPayerSettlementTestError';
  error.stack = `FixedPayerSettlementTestError: ${code}`;
  return error;
}

function requireProof(condition, code) {
  if (!condition) throw fixedFailure(code);
}

function rejectsWith(code) {
  return error => {
    assert.equal(error instanceof FixedPayerSettlementDispatcherError, true);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    return true;
  };
}

function ownerRejectsWith(code) {
  return error => {
    assert.equal(error instanceof FixedPayerSettlementOwnerError, true);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    return true;
  };
}

function startupCommitFrame(descriptor) {
  return {
    ipcVersion: 2,
    type: 'STARTUP_COMMIT',
    correlationId: `${descriptor.generation}:${descriptor.shardId}:startup-commit`,
    shardId: descriptor.shardId,
    payer: descriptor.payer,
    generation: descriptor.generation,
  };
}

function startupCommittedFrame(descriptor) {
  return {
    ipcVersion: 2,
    type: 'STARTUP_COMMITTED',
    correlationId: `${descriptor.generation}:${descriptor.shardId}:startup-commit`,
    shardId: descriptor.shardId,
    payer: descriptor.payer,
    generation: descriptor.generation,
  };
}

function sendStartupCommit(child, descriptor) {
  return new Promise((resolvePromise, rejectPromise) => {
    let returned = false;
    let accepted = false;
    let callbacks = 0;
    let callbackOk = false;
    const fail = () => rejectPromise(fixedFailure('STARTUP_COMMIT_SEND'));
    const finish = () => {
      if (!returned || callbacks !== 1) return;
      if (accepted && callbackOk) resolvePromise();
      else fail();
    };
    const callback = error => {
      callbacks += 1;
      callbackOk = callbacks === 1 && error == null;
      if (callbacks > 1) {
        fail();
        return;
      }
      finish();
    };
    try {
      accepted = child.send(startupCommitFrame(descriptor), callback) === true;
    } catch {
      returned = true;
      fail();
      return;
    }
    returned = true;
    if (!accepted) {
      fail();
      return;
    }
    finish();
  });
}

function manifestText() {
  return `${JSON.stringify(CONFIGURATION)}\n`;
}

function manifestFingerprint(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

async function createPrivateRoot(prefix, rootRegistry) {
  const root = await mkdtemp(join(await realpath(tmpdir()), prefix));
  if (rootRegistry !== undefined) rootRegistry.push(root);
  await chmod(root, 0o700);
  return root;
}

async function createRoutingRoot(prefix = 'fixed-payer-dispatch-routing-', rootRegistry) {
  const root = await createPrivateRoot(prefix, rootRegistry);
  const text = manifestText();
  await writeFile(join(root, FIXED_PAYER_SHARD_MANIFEST_FILE), text, {
    flag: 'wx',
    mode: 0o600,
  });
  const routing = createFixedPayerShardRouting({
    privateRoot: root,
    expectedManifestFingerprint: manifestFingerprint(text),
    expectedConfiguration: CONFIGURATION,
  });
  return { root, routing };
}

async function routingFixture(t) {
  const fixture = await createRoutingRoot();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  return fixture;
}

function polymodStep(checksum, word) {
  const top = checksum >>> 25;
  let result = ((checksum & 0x1ffffff) << 5) ^ word;
  for (let index = 0; index < 5; index += 1) {
    if ((top >>> index) & 1) result ^= GENERATORS[index];
  }
  return result >>> 0;
}

function address(payload) {
  let output = 'z1';
  let checksum = polymodStep(polymodStep(polymodStep(1, 3), 0), 26);
  let accumulator = 0;
  let bits = 0;
  for (const byte of payload) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      const word = (accumulator >>> bits) & 31;
      output += BECH32[word];
      checksum = polymodStep(checksum, word);
    }
  }
  assert.equal(bits, 0);
  for (let index = 0; index < 6; index += 1) checksum = polymodStep(checksum, 0);
  checksum = (checksum ^ 1) >>> 0;
  for (let index = 5; index >= 0; index -= 1) {
    output += BECH32[(checksum >>> (5 * index)) & 31];
  }
  return output;
}

function canonicalPayer(fill) {
  return address([0, ...Array(19).fill(fill)]);
}

function payerDescriptors(routing) {
  const byShard = new Map();
  for (let fill = 1; fill < 256 && byShard.size < 2; fill += 1) {
    const payer = canonicalPayer(fill);
    const { shardId } = routing.route(payer);
    if (!byShard.has(shardId)) byShard.set(shardId, payer);
  }
  requireProof(byShard.size === 2, 'PAYER_SELECTION');
  return CONFIGURATION.shardIds.map((shardId, index) => ({
    shardId,
    payer: byShard.get(shardId),
    generation: index === 0 ? 'fixture-generation-a' : 'fixture-generation-b',
  }));
}

function requirement(payTo) {
  return {
    scheme: 'exact',
    network: 'zenon:testnet',
    asset: sdk.ZNN_ZTS.toString(),
    amount: '1',
    payTo,
    maxTimeoutSeconds: 1,
    extra: {
      paymentFlow: 'upfront',
      poc: true,
      settlement: 'account-block',
      zenonChain: { ...PROFILE },
    },
  };
}

function paymentRequired(accepted, resource = RESOURCE) {
  return {
    x402Version: 2,
    resource: { ...resource },
    accepts: [accepted],
  };
}

function syntheticInput(payer, transaction = 'a'.repeat(64), payTo = canonicalPayer(254)) {
  const requirements = requirement(payTo);
  const required = paymentRequired(requirements);
  return {
    paymentPayload: {
      x402Version: 2,
      resource: structuredClone(required.resource),
      accepted: structuredClone(requirements),
      payload: {
        transaction: { address: payer, hash: transaction },
        intentDigest: paymentIntentDigest(required, requirements),
      },
    },
    requirements,
    paymentRequired: required,
  };
}

function inputIdentity(input) {
  const payer = input.paymentPayload.payload.transaction.address;
  const transaction = input.paymentPayload.payload.transaction.hash;
  return {
    payer,
    transaction,
    authorizationKey: sha256Hex({
      domain: 'zenon-x402-authorization-v1',
      chainProfile: input.requirements.extra.zenonChain,
      intentDigest: paymentIntentDigest(input.paymentRequired, input.requirements),
      resourceDigest: sha256Hex(input.paymentRequired.resource),
      transactionHash: transaction,
    }),
  };
}

function includedResult(input, deliveryState = 'NONE') {
  const identity = inputIdentity(input);
  return {
    success: true,
    network: input.requirements.network,
    transaction: identity.transaction,
    payer: identity.payer,
    state: 'MOMENTUM_INCLUDED',
    authorizationKey: identity.authorizationKey,
    deliveryState,
  };
}

function unknownResult(input) {
  const identity = inputIdentity(input);
  return {
    success: false,
    network: input.requirements.network,
    transaction: identity.transaction,
    payer: identity.payer,
    errorReason: 'submission_outcome_unknown',
    state: 'SUBMISSION_OUTCOME_UNKNOWN',
    authorizationKey: identity.authorizationKey,
    retrySamePayment: true,
    deliveryState: 'NONE',
  };
}

function terminalResult(input, state) {
  const identity = inputIdentity(input);
  return {
    success: false,
    network: input.requirements.network,
    transaction: identity.transaction,
    payer: identity.payer,
    errorReason: 'payment_reconciliation_terminal',
    state,
    authorizationKey: identity.authorizationKey,
    retrySamePayment: false,
    deliveryState: 'NONE',
  };
}

function endpointPair() {
  const parent = new EventEmitter();
  const child = new EventEmitter();
  const counts = { parentSend: 0, childSend: 0 };
  parent.send = (frame, callback) => {
    counts.parentSend += 1;
    child.emit('message', frame);
    callback();
    return true;
  };
  child.send = (frame, callback) => {
    counts.childSend += 1;
    parent.emit('message', frame);
    callback();
    return true;
  };
  return { parent, child, counts };
}

function shardOptions(descriptors, pairs, owners, journalIdentities) {
  return descriptors.map((descriptor, index) => ({
    ...descriptor,
    owner: owners[index],
    channel: pairs[index].parent,
    journalIdentity: journalIdentities[index],
  }));
}

async function localHarness(
  t,
  routing,
  facilitators,
  { timeoutMs = 200, descriptors: suppliedDescriptors } = {},
) {
  const descriptors = suppliedDescriptors ?? payerDescriptors(routing);
  const pairs = descriptors.map(() => endpointPair());
  const owners = descriptors.map(() => new EventEmitter());
  const journalIdentities = descriptors.map(() => Object.freeze({}));
  const controllers = descriptors.map((descriptor, index) =>
    runFixedPayerSettlementChild({
      channel: pairs[index].child,
      facilitator: facilitators[index],
      shardId: descriptor.shardId,
      payer: descriptor.payer,
      generation: descriptor.generation,
      maxOperations: 16,
    }));
  const dispatcher = createFixedPayerSettlementDispatcher({
    routing,
    shards: shardOptions(descriptors, pairs, owners, journalIdentities),
    requestTimeoutMs: timeoutMs,
    maxOperationsPerShard: 16,
  });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    const retired = dispatcher.retire();
    for (let index = 0; index < descriptors.length; index += 1) {
      pairs[index].parent.emit('disconnect');
      pairs[index].child.emit('disconnect');
      owners[index].emit('exit', 0, null);
      owners[index].emit('close', 0, null);
    }
    await Promise.all([retired, ...controllers.map(controller => controller.done)]);
  };
  t.after(close);
  return { descriptors, pairs, owners, controllers, dispatcher, close };
}

function facilitatorDouble(overrides = {}) {
  return {
    async settle(paymentPayload, requirements, required) {
      const input = { paymentPayload, requirements, paymentRequired: required };
      return includedResult(input);
    },
    async markDeliveryPending(settlement) {
      return {
        authorizationKey: settlement.authorizationKey,
        payer: settlement.payer,
        transactionHash: settlement.transaction,
        deliveryState: 'DELIVERY_PENDING',
        deliveryClaimed: true,
      };
    },
    async markDelivered(settlement, cachedResponse) {
      return {
        authorizationKey: settlement.authorizationKey,
        payer: settlement.payer,
        transactionHash: settlement.transaction,
        deliveryState: 'DELIVERED',
        cachedResponse,
      };
    },
    ...overrides,
  };
}

function signedPayment(keyPair, accepted, nonce, {
  resource = RESOURCE,
  height = 1,
  previousHash = sdk.EMPTY_HASH.toString(),
} = {}) {
  const required = paymentRequired(accepted, resource);
  const block = sdk.AccountBlockTemplate.send(
    sdk.Address.parse(accepted.payTo),
    sdk.TokenStandard.parse(accepted.asset),
    BigInt(accepted.amount),
  );
  block.chainIdentifier = Number(accepted.extra.zenonChain.chainIdentifier);
  block.address = keyPair.getAddress();
  block.height = height;
  block.previousHash = sdk.Hash.parse(previousHash);
  block.momentumAcknowledged = new sdk.HashHeight(
    sdk.Hash.digest(Buffer.from('synthetic acknowledged momentum')),
    1,
  );
  const intentDigest = paymentIntentDigest(required, accepted);
  block.data = Buffer.from(intentDigest, 'hex');
  block.nonce = nonce;
  block.publicKey = keyPair.getPublicKey();
  block.hash = computeBlockHash(block, sdk);
  block.signature = keyPair.sign(block.hash.getBytes());
  return {
    x402Version: required.x402Version,
    resource: structuredClone(required.resource),
    accepted: structuredClone(accepted),
    payload: { transaction: block.toJson(), intentDigest },
  };
}

function syntheticKeyPair(fill) {
  const privateKey = Buffer.alloc(32, fill);
  try {
    return sdk.KeyPair.fromPrivateKey(privateKey);
  } finally {
    privateKey.fill(0);
  }
}

function clearSyntheticKeyPairs(keyPairs) {
  let failed = false;
  for (const keyPair of keyPairs) {
    try { keyPair.clear(); } catch { failed = true; }
  }
  if (failed) throw fixedFailure('KEY_CLEAR');
}

function signedPayloadsByShard(routing, accepted, createKeyPair = syntheticKeyPair) {
  const selected = new Map();
  const owned = [];
  try {
    for (let fill = 1; fill < 256 && selected.size < 2; fill += 1) {
      const keyPair = createKeyPair(fill);
      owned.push(keyPair);
      const payer = keyPair.getAddress().toString();
      const shardId = routing.route(payer).shardId;
      if (!selected.has(shardId)) selected.set(shardId, keyPair);
    }
    requireProof(selected.size === 2, 'SIGNED_PAYER_SELECTION');
    return CONFIGURATION.shardIds.map((shardId, index) => {
      const keyPair = selected.get(shardId);
      return signedPayment(keyPair, accepted, String(index + 1).padStart(16, '0'));
    });
  } finally {
    clearSyntheticKeyPairs(owned);
  }
}

function signedStartupPayloads(routing) {
  let payee;
  try {
    payee = syntheticKeyPair(252);
    return signedPayloadsByShard(routing, requirement(payee.getAddress().toString()));
  } finally {
    payee?.clear();
  }
}

function signedPayloadPairsByShard(routing, accepted) {
  const selected = new Map();
  const owned = [];
  try {
    for (let fill = 1; fill < 256 && selected.size < 2; fill += 1) {
      const keyPair = syntheticKeyPair(fill);
      owned.push(keyPair);
      const payer = keyPair.getAddress().toString();
      const shardId = routing.route(payer).shardId;
      if (!selected.has(shardId)) selected.set(shardId, keyPair);
    }
    requireProof(selected.size === 2, 'SIGNED_PAYER_SELECTION');
    return CONFIGURATION.shardIds.map((shardId, index) => {
      const keyPair = selected.get(shardId);
      return [
        signedPayment(keyPair, accepted, String((index * 2) + 1).padStart(16, '0')),
        signedPayment(keyPair, accepted, String((index * 2) + 2).padStart(16, '0')),
      ];
    });
  } finally {
    clearSyntheticKeyPairs(owned);
  }
}

function dualPurchaseResource(shardId, ordinal) {
  return {
    url: `https://127.0.0.1/${shardId}/synthetic-purchase-${ordinal}`,
    description: `Synthetic fixed-payer purchase ${ordinal}`,
    mimeType: 'application/json',
  };
}

function signedDualPayloadsByShard(routing, accepted, { staleSecond = false } = {}) {
  const selected = new Map();
  const owned = [];
  try {
    for (let fill = 1; fill < 256 && selected.size < 2; fill += 1) {
      const keyPair = syntheticKeyPair(fill);
      owned.push(keyPair);
      const payer = keyPair.getAddress().toString();
      const shardId = routing.route(payer).shardId;
      if (!selected.has(shardId)) selected.set(shardId, keyPair);
    }
    requireProof(selected.size === 2, 'DUAL_SIGNED_PAYER_SELECTION');
    return CONFIGURATION.shardIds.map((shardId, index) => {
      const keyPair = selected.get(shardId);
      const first = signedPayment(
        keyPair,
        accepted,
        String((index * 2) + 1).padStart(16, '0'),
        { resource: dualPurchaseResource(shardId, 1) },
      );
      const second = signedPayment(
        keyPair,
        accepted,
        String((index * 2) + 2).padStart(16, '0'),
        {
          resource: dualPurchaseResource(shardId, 2),
          height: 2,
          previousHash: staleSecond
            ? sdk.EMPTY_HASH.toString()
            : first.payload.transaction.hash,
        },
      );
      return [first, second];
    });
  } finally {
    clearSyntheticKeyPairs(owned);
  }
}

function dualPaymentFixture(payloads) {
  requireProof(Array.isArray(payloads) && payloads.length === 2,
    'DUAL_FIXTURE_CARDINALITY');
  return {
    schemaVersion: 1,
    payments: structuredClone(payloads),
  };
}

function fixtureInput(paymentPayload) {
  return {
    paymentPayload,
    requirements: structuredClone(paymentPayload.accepted),
    paymentRequired: paymentRequired(paymentPayload.accepted, paymentPayload.resource),
  };
}

async function signedReplacementFixture(routing) {
  const accepted = requirement(canonicalPayer(251));
  const payloadPairs = signedPayloadPairsByShard(routing, accepted);
  const descriptors = payloadPairs.map((pair, index) => ({
    shardId: CONFIGURATION.shardIds[index],
    payer: pair[0].payload.transaction.address,
    generation: index === 0 ? 'fixture-generation-a' : 'fixture-generation-b',
  }));
  const original = {
    paymentPayload: payloadPairs[0][0],
    requirements: structuredClone(accepted),
    paymentRequired: paymentRequired(accepted),
  };
  const replacement = {
    paymentPayload: payloadPairs[0][1],
    requirements: structuredClone(accepted),
    paymentRequired: paymentRequired(accepted),
  };
  try {
    await Promise.all([original, replacement].map(input => preflightZenonPayment(
      input.paymentPayload,
      input.requirements,
      input.paymentRequired,
    )));
  } catch {
    throw fixedFailure('SIGNED_REPLACEMENT_PREFLIGHT');
  }
  requireProof(
    original.paymentPayload.payload.transaction.address ===
      replacement.paymentPayload.payload.transaction.address &&
    original.paymentPayload.payload.transaction.hash !==
      replacement.paymentPayload.payload.transaction.hash &&
    inputIdentity(original).authorizationKey !== inputIdentity(replacement).authorizationKey,
    'SIGNED_REPLACEMENT_IDENTITY',
  );
  return { descriptors, original, replacement };
}

function settleRequestFrame(descriptor, input, sequence) {
  const identity = inputIdentity(input);
  return JSON.stringify({
    ipcVersion: 2,
    type: 'SETTLE',
    correlationId: `${descriptor.generation}:${descriptor.shardId}:${sequence}`,
    shardId: descriptor.shardId,
    payer: identity.payer,
    generation: descriptor.generation,
    sequence,
    transaction: identity.transaction,
    authorizationKey: identity.authorizationKey,
    network: input.requirements.network,
    body: structuredClone(input),
  });
}

function publicationObservationForRequest(request) {
  return {
    ipcVersion: 2,
    type: 'PUBLICATION_OBSERVED',
    correlationId: request.correlationId,
    shardId: request.shardId,
    payer: request.payer,
    generation: request.generation,
    sequence: request.sequence,
    operation: 'SETTLE',
    transaction: request.transaction,
    authorizationKey: request.authorizationKey,
    network: request.network,
  };
}

function successfulResultForRequest(request, result) {
  return {
    ipcVersion: 2,
    type: 'RESULT',
    correlationId: request.correlationId,
    shardId: request.shardId,
    payer: request.payer,
    generation: request.generation,
    sequence: request.sequence,
    operation: request.type,
    ok: true,
    result,
  };
}

function settleResultForRequest(request, input) {
  return successfulResultForRequest(request, includedResult(input));
}

async function writeSignedFixture(root, paymentPayload) {
  const fixture = join(root, FIXTURE_NAME);
  const encoded = Buffer.from(JSON.stringify(paymentPayload), 'utf8');
  try {
    requireProof(encoded.length > 0 && encoded.length <= 16_384, 'FIXTURE_SIZE');
    await writeFile(fixture, encoded, { flag: 'wx', mode: 0o600 });
  } finally {
    encoded.fill(0);
  }
  const [rootState, fixtureState] = await Promise.all([lstat(root), lstat(fixture)]);
  requireProof(rootState.isDirectory() && (rootState.mode & 0o777) === 0o700,
    'ROOT_MODE');
  requireProof(fixtureState.isFile() && fixtureState.nlink === 1 &&
    (fixtureState.mode & 0o777) === 0o600, 'FIXTURE_MODE');
}

async function writeStartupFixture(root, mode) {
  const encoded = Buffer.from(JSON.stringify({ schemaVersion: 1, mode }), 'utf8');
  try {
    await writeFile(join(root, STARTUP_FIXTURE_NAME), encoded, {
      flag: 'wx',
      mode: 0o600,
    });
  } finally {
    encoded.fill(0);
  }
  const state = await lstat(join(root, STARTUP_FIXTURE_NAME));
  requireProof(state.isFile() && state.nlink === 1 && (state.mode & 0o777) === 0o600,
    'STARTUP_FIXTURE_MODE');
}

function retainedAttempt(input) {
  const transaction = input.paymentPayload.payload.transaction;
  const identity = inputIdentity(input);
  return {
    authorizationKey: identity.authorizationKey,
    transactionHash: identity.transaction,
    chainProfile: structuredClone(input.requirements.extra.zenonChain),
    intentDigest: input.paymentPayload.payload.intentDigest,
    resourceIdentity: structuredClone(input.paymentRequired.resource),
    resourceDigest: sha256Hex(input.paymentRequired.resource),
    payer: identity.payer,
    signedAccountBlock: structuredClone(transaction),
  };
}

async function assertRetainedStartupClaim(root, requirement) {
  requireProof(
    requirement === STARTUP_CLAIM.REQUIRED ||
      requirement === STARTUP_CLAIM.NOT_PROVEN_CLAIMED,
    'STARTUP_CLAIM_REQUIREMENT',
  );
  let marker;
  try {
    marker = await lstat(join(root, FIXED_PAYER_SETTLEMENT_STARTUP_MARKER_FILE));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      if (requirement === STARTUP_CLAIM.NOT_PROVEN_CLAIMED) return requirement;
      throw fixedFailure('STARTUP_CLAIM_REQUIRED');
    }
    throw fixedFailure('STARTUP_CLAIM_INSPECTION_FAILED');
  }
  requireProof(
    marker.isFile() && !marker.isSymbolicLink() && marker.nlink === 1 && marker.size === 0 &&
      (marker.mode & 0o777) === 0o600 &&
      (typeof process.getuid !== 'function' || marker.uid === process.getuid()),
    'STARTUP_CLAIM_UNSAFE',
  );
  return STARTUP_CLAIM.RETAINED;
}

function ownedDescriptors(payloads, roots) {
  return payloads.map((payload, index) => ({
    shardId: CONFIGURATION.shardIds[index],
    payer: payload.payload.transaction.address,
    generation: index === 0 ? 'fixture-generation-a' : 'fixture-generation-b',
    privateRoot: roots[index],
  }));
}

function createOfflineOwner(routing, payloads, roots, overrides = {}) {
  const authority = createFixedPayerSettlementOfflineTestAuthority({
    shards: ownedDescriptors(payloads, roots),
    startupTimeoutMs: overrides.startupTimeoutMs ?? 2_000,
    terminateGraceMs: overrides.terminateGraceMs ?? 500,
    terminateForceMs: overrides.terminateForceMs ?? 1_000,
  });
  const owner = createFixedPayerSettlementOwner({
    authority,
    routing,
    requestTimeoutMs: overrides.requestTimeoutMs ?? 1_000,
    maxOperationsPerShard: 16,
  });
  return { authority, owner };
}

async function waitForOwnerPhase(owner, phases, milliseconds = 2_000) {
  const accepted = new Set(phases);
  const started = performance.now();
  while (performance.now() - started < milliseconds) {
    const status = owner.status();
    if (accepted.has(status.phase)) return status;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
  }
  throw fixedFailure('OWNER_PHASE_TIMEOUT');
}

function launchStartupProbe(label, root, descriptor) {
  const child = spawn(EXECUTABLE, [CHILD_ENTRYPOINT, OFFLINE_TEST_MODE, label, root], {
    env: Object.create(null),
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  });
  let readyFrameSeen = false;
  let committedSeen = false;
  let commitSendComplete = false;
  let stdoutBoundarySeen = false;
  let stderrBoundarySeen = false;
  let startupComplete = false;
  let exited = false;
  let closed = false;
  let outputBytes = 0;
  let stdout = '';
  let stderr = '';
  let diagnostics = false;
  let resolveReady;
  let rejectReady;
  let resolveClosed;
  let resolveExited;
  const ready = new Promise((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });
  const closedPromise = new Promise(resolvePromise => { resolveClosed = resolvePromise; });
  const exitedPromise = new Promise(resolvePromise => { resolveExited = resolvePromise; });
  void ready.catch(() => {});
  const maybeReady = () => {
    if (startupComplete || !readyFrameSeen || !committedSeen || !commitSendComplete ||
        !stdoutBoundarySeen || !stderrBoundarySeen) return;
    startupComplete = true;
    resolveReady();
  };
  const fail = code => {
    diagnostics = true;
    if (!startupComplete) rejectReady(fixedFailure(code));
  };
  const recordBoundary = (stream, chunk) => {
    outputBytes += chunk.length;
    const text = chunk.toString('utf8');
    if (outputBytes > 256 || /[^\x0a\x20-\x7e]/u.test(text)) {
      fail('STARTUP_PROBE_OUTPUT');
      return;
    }
    if (stream === 'stdout') stdout += text;
    else stderr += text;
    const expected = stream === 'stdout' ? STARTUP_STDOUT_BOUNDARY : STARTUP_STDERR_BOUNDARY;
    let buffer = stream === 'stdout' ? stdout : stderr;
    for (let newline; (newline = buffer.indexOf('\n')) !== -1;) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      const alreadySeen = stream === 'stdout' ? stdoutBoundarySeen : stderrBoundarySeen;
      if (line !== expected || alreadySeen) {
        fail('STARTUP_PROBE_OUTPUT');
        return;
      }
      if (stream === 'stdout') stdoutBoundarySeen = true;
      else stderrBoundarySeen = true;
    }
    if (stream === 'stdout') stdout = buffer;
    else stderr = buffer;
    maybeReady();
  };
  child.stdout.on('data', chunk => recordBoundary('stdout', chunk));
  child.stderr.on('data', chunk => recordBoundary('stderr', chunk));
  child.stdout.on('error', () => fail('STARTUP_PROBE_STDOUT'));
  child.stderr.on('error', () => fail('STARTUP_PROBE_STDERR'));
  child.once('error', () => {
    fail('STARTUP_PROBE_SPAWN');
  });
  child.on('message', message => {
    if (committedSeen) {
      if (typeof message !== 'string') diagnostics = true;
      return;
    }
    try {
      if (!readyFrameSeen) {
        assert.deepEqual(message, {
          ipcVersion: 2,
          type: 'READY',
          correlationId: `${descriptor.generation}:${descriptor.shardId}:startup`,
          shardId: descriptor.shardId,
          payer: descriptor.payer,
          generation: descriptor.generation,
          journalSchemaVersion: 1,
          journalRevision: 0,
        });
        readyFrameSeen = true;
        void sendStartupCommit(child, descriptor).then(() => {
          commitSendComplete = true;
          maybeReady();
        }, () => fail('STARTUP_PROBE_COMMIT'));
        return;
      }
      assert.deepEqual(message, startupCommittedFrame(descriptor));
      committedSeen = true;
      maybeReady();
    } catch {
      fail('STARTUP_PROBE_PROTOCOL');
    }
  });
  child.once('exit', () => {
    exited = true;
    resolveExited();
  });
  child.once('close', (code, signal) => {
    closed = true;
    if (!startupComplete) rejectReady(fixedFailure('STARTUP_PROBE_REFUSED'));
    resolveClosed({ code, signal });
  });
  return {
    child,
    ready,
    closed: closedPromise,
    requestClose() {
      if (!closed && !exited && child.kill('SIGTERM') !== true) {
        throw fixedFailure('STARTUP_PROBE_CLOSE_REQUEST');
      }
    },
    async reap() {
      if (!await bounded(Promise.all([exitedPromise, closedPromise]), 1_000)) {
        if (!exited) {
          try { child.kill('SIGKILL'); } catch {}
        }
      }
      if (!await bounded(Promise.all([exitedPromise, closedPromise]), 1_000)) {
        throw fixedFailure('STARTUP_PROBE_REAP');
      }
      return { exited, closed, diagnostics };
    },
    get reaped() { return exited && closed; },
    get diagnostics() { return diagnostics; },
  };
}

function bounded(promise, milliseconds) {
  return new Promise(resolvePromise => {
    const timer = setTimeout(() => resolvePromise(false), milliseconds);
    promise.then(() => {
      clearTimeout(timer);
      resolvePromise(true);
    }, () => {
      clearTimeout(timer);
      resolvePromise(true);
    });
  });
}

function createOperationDeadline(milliseconds) {
  const controller = new AbortController();
  const startedAt = performance.now();
  const failure = fixedFailure('WHOLE_OPERATION_TIMEOUT');
  let expired = false;
  let closed = false;
  let timer;
  let rejectDeadline;
  const expire = () => {
    if (!expired) {
      expired = true;
      controller.abort();
      rejectDeadline(failure);
    }
    return failure;
  };
  const deadline = new Promise((_, rejectPromise) => {
    rejectDeadline = rejectPromise;
    timer = setTimeout(expire, milliseconds);
  });
  void deadline.catch(() => {});
  return Object.freeze({
    signal: controller.signal,
    wait(promise) {
      return Promise.race([promise, deadline]);
    },
    close() {
      if (closed) return;
      clearTimeout(timer);
      if (expired || performance.now() - startedAt >= milliseconds) throw expire();
      closed = true;
    },
    get expired() {
      return expired || (!closed && performance.now() - startedAt >= milliseconds);
    },
  });
}

async function closeOwnedServer(resourceServer, {
  firstClosePromise,
  initialMs = 2_000,
  finalMs = 1_000,
} = {}) {
  let closing = firstClosePromise;
  if (closing === undefined) {
    try { closing = resourceServer.close(); } catch { return false; }
  }
  closing = Promise.resolve(closing);
  void closing.catch(() => {});
  if (!await bounded(closing, initialMs)) {
    try { resourceServer.server.closeAllConnections(); } catch {}
  }
  if (!await bounded(closing, finalMs)) return false;
  try {
    await closing;
    return true;
  } catch {
    return false;
  }
}

async function removeOwnedRoots(roots, {
  timeoutMs = 2_000,
  removeOperation = root => rm(root, { recursive: true, force: true }),
} = {}) {
  const removals = Promise.allSettled(roots.map(root =>
    Promise.resolve().then(() => removeOperation(root))));
  if (!await bounded(removals, timeoutMs)) return 'TIMEOUT';
  const results = await removals;
  return results.every(result => result.status === 'fulfilled') ? 'REMOVED' : 'REJECTED';
}

async function removeVerifiedSyntheticRoots(roots) {
  const result = await removeOwnedRoots(roots);
  requireProof(result === 'REMOVED', result === 'TIMEOUT'
    ? 'SYNTHETIC_ROOT_CLEANUP_TIMEOUT_RESIDUE_RETAINED'
    : 'SYNTHETIC_ROOT_CLEANUP_REJECTED_RESIDUE_RETAINED');
}

function launchChild(label, root, descriptor, paymentPayload) {
  const expectedInput = {
    paymentPayload,
    requirements: paymentPayload.accepted,
    paymentRequired: paymentRequired(paymentPayload.accepted),
  };
  const expectedIdentity = inputIdentity(expectedInput);
  const child = spawn(EXECUTABLE, [CHILD_ENTRYPOINT, OFFLINE_TEST_MODE, label, root], {
    env: Object.create(null),
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  });
  let stdout = '';
  let stderr = '';
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let readyFrameSeen = false;
  let commitRequested = false;
  let committedSeen = false;
  let commitSendComplete = false;
  let stdoutBoundarySeen = false;
  let stderrBoundarySeen = false;
  let readySeen = false;
  let markerSeen = false;
  let expectedClose = false;
  let exited = false;
  let closed = false;
  let closeClean = false;
  let failure = null;
  let resolveMarker;
  let rejectMarker;
  let resolveReady;
  let rejectReady;
  let resolveReadyFrame;
  let rejectReadyFrame;
  let resolveClosed;
  let resolveExited;
  const readyWatchdog = setTimeout(() => fail('CHILD_READY_TIMEOUT'), 5_000);
  readyWatchdog.unref();
  const publicationWatchdog = setTimeout(() => fail('CHILD_PUBLICATION_TIMEOUT'), 10_000);
  publicationWatchdog.unref();
  const ready = new Promise((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });
  const readyFrame = new Promise((resolvePromise, rejectPromise) => {
    resolveReadyFrame = resolvePromise;
    rejectReadyFrame = rejectPromise;
  });
  const publication = new Promise((resolvePromise, rejectPromise) => {
    resolveMarker = resolvePromise;
    rejectMarker = rejectPromise;
  });
  const closedPromise = new Promise(resolvePromise => { resolveClosed = resolvePromise; });
  const exitedPromise = new Promise(resolvePromise => { resolveExited = resolvePromise; });
  void ready.catch(() => {});
  void readyFrame.catch(() => {});
  void publication.catch(() => {});
  const fail = code => {
    if (failure !== null) return;
    failure = fixedFailure(code);
    if (!readyFrameSeen) rejectReadyFrame(failure);
    if (!readySeen) rejectReady(failure);
    if (!markerSeen) rejectMarker(failure);
  };
  const maybeReady = () => {
    if (readySeen || !readyFrameSeen || !committedSeen || !commitSendComplete ||
        !stdoutBoundarySeen || !stderrBoundarySeen) return;
    readySeen = true;
    clearTimeout(readyWatchdog);
    resolveReady();
  };
  child.on('message', message => {
    if (committedSeen) {
      if (typeof message !== 'string') {
        fail('CHILD_PROTOCOL');
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(message);
        if (JSON.stringify(parsed) !== message) throw fixedFailure('CHILD_PROTOCOL');
      } catch {
        fail('CHILD_PROTOCOL');
        return;
      }
      if (parsed.type !== 'PUBLICATION_OBSERVED') return;
      const fields = [
        'ipcVersion', 'type', 'correlationId', 'shardId', 'payer', 'generation',
        'sequence', 'operation', 'transaction', 'authorizationKey', 'network',
      ];
      if (markerSeen || !isDeepStrictEqual(Object.keys(parsed), fields) ||
          parsed.ipcVersion !== 2 ||
          parsed.correlationId !== `${descriptor.generation}:${descriptor.shardId}:1` ||
          parsed.shardId !== descriptor.shardId || parsed.payer !== descriptor.payer ||
          parsed.generation !== descriptor.generation || parsed.sequence !== 1 ||
          parsed.operation !== 'SETTLE' ||
          parsed.transaction !== expectedIdentity.transaction ||
          parsed.authorizationKey !== expectedIdentity.authorizationKey ||
          parsed.network !== expectedInput.requirements.network) {
        fail('CHILD_PROTOCOL');
        return;
      }
      markerSeen = true;
      clearTimeout(publicationWatchdog);
      resolveMarker();
      return;
    }
    try {
      if (!readyFrameSeen) {
        assert.deepEqual(message, {
          ipcVersion: 2,
          type: 'READY',
          correlationId: `${descriptor.generation}:${descriptor.shardId}:startup`,
          shardId: descriptor.shardId,
          payer: descriptor.payer,
          generation: descriptor.generation,
          journalSchemaVersion: 1,
          journalRevision: 0,
        });
        readyFrameSeen = true;
        resolveReadyFrame();
        return;
      }
      assert.deepEqual(message, startupCommittedFrame(descriptor));
      committedSeen = true;
      maybeReady();
    } catch {
      fail('CHILD_PROTOCOL');
    }
  });
  child.stdout.on('data', chunk => {
    stdoutBytes += chunk.length;
    const text = chunk.toString('utf8');
    if (stdoutBytes > 128 || /[^\x0a\x20-\x7e]/u.test(text)) {
      fail('CHILD_STDOUT_LIMIT');
      return;
    }
    stdout += text;
    for (let newline; (newline = stdout.indexOf('\n')) !== -1;) {
      const line = stdout.slice(0, newline);
      stdout = stdout.slice(newline + 1);
      if (!stdoutBoundarySeen) {
        if (line !== STARTUP_STDOUT_BOUNDARY) {
          fail('CHILD_PROTOCOL');
          return;
        }
        stdoutBoundarySeen = true;
        maybeReady();
        continue;
      }
      fail('CHILD_PROTOCOL');
      return;
    }
    if (stdoutBoundarySeen && stdout.length > 0) fail('CHILD_PROTOCOL');
  });
  child.stderr.on('data', chunk => {
    stderrBytes += chunk.length;
    const text = chunk.toString('utf8');
    if (stderrBytes > 128 || /[^\x0a\x20-\x7e]/u.test(text)) {
      fail('CHILD_STDERR_LIMIT');
      return;
    }
    stderr += text;
    for (let newline; (newline = stderr.indexOf('\n')) !== -1;) {
      const line = stderr.slice(0, newline);
      stderr = stderr.slice(newline + 1);
      if (line !== STARTUP_STDERR_BOUNDARY || stderrBoundarySeen) {
        fail('CHILD_STDERR');
        return;
      }
      stderrBoundarySeen = true;
      maybeReady();
    }
  });
  child.stdout.on('error', () => fail('CHILD_STDOUT'));
  child.stderr.on('error', () => fail('CHILD_STDERR'));
  child.once('error', () => fail('CHILD_SPAWN'));
  child.once('exit', () => {
    exited = true;
    resolveExited();
  });
  child.once('close', (code, signal) => {
    clearTimeout(readyWatchdog);
    clearTimeout(publicationWatchdog);
    closed = true;
    closeClean = expectedClose && code === 0 && signal === null && failure === null && readySeen &&
      markerSeen && stdout.length === 0 && stderr.length === 0;
    if (!expectedClose || !closeClean) fail('CHILD_CLOSE');
    if (!readyFrameSeen) rejectReadyFrame(failure ?? fixedFailure('CHILD_INCOMPLETE'));
    if (!readySeen) rejectReady(failure ?? fixedFailure('CHILD_INCOMPLETE'));
    if (!markerSeen) rejectMarker(failure ?? fixedFailure('CHILD_INCOMPLETE'));
    resolveClosed();
  });
  return {
    child,
    readyFrame,
    ready,
    publication,
    journalIdentity: Object.freeze({}),
    commit() {
      if (failure !== null || !readyFrameSeen || commitRequested || closed) {
        throw failure ?? fixedFailure('CHILD_COMMIT_STATE');
      }
      commitRequested = true;
      void sendStartupCommit(child, descriptor).then(() => {
        commitSendComplete = true;
        maybeReady();
      }, () => fail('CHILD_COMMIT'));
    },
    release() {
      if (failure !== null || !markerSeen || closed) throw failure ?? fixedFailure('CHILD_STATE');
      child.stdin.end('RELEASE\n');
    },
    requestClose() {
      expectedClose = true;
      if (!closed && !exited && child.kill('SIGTERM') !== true) {
        throw fixedFailure('CHILD_CLOSE_REQUEST');
      }
    },
    async awaitClose() {
      if (!await bounded(Promise.all([exitedPromise, closedPromise]), 2_000)) {
        throw fixedFailure('CHILD_REAP_TIMEOUT');
      }
      if (!exited || !closed || !closeClean) throw failure ?? fixedFailure('CHILD_CLOSE');
    },
    async forceClose() {
      expectedClose = true;
      try { child.stdin.destroy(); } catch {}
      if (!await bounded(closedPromise, 500) && !closed && !exited) {
        try { child.kill('SIGTERM'); } catch {}
      }
      if (!await bounded(Promise.race([closedPromise, exitedPromise]), 1_000) && !exited) {
        try { child.kill('SIGKILL'); } catch {}
      }
      if (!exited) await bounded(exitedPromise, 1_000);
      if (exited && !closed) {
        try { child.stdout.destroy(); } catch {}
        try { child.stderr.destroy(); } catch {}
      }
      await bounded(Promise.all([exitedPromise, closedPromise]), 1_000);
      return exited && closed;
    },
    get exited() { return exited; },
    get closed() { return closed; },
    get reaped() { return exited && closed; },
  };
}

async function submit(baseUrl, payload, signal = undefined) {
  return fetch(`${baseUrl}/paid`, {
    headers: { [HEADERS.PAYMENT_SIGNATURE]: encodeB64Json(payload) },
    signal,
  });
}

function paymentRequiredFailure(response) {
  const encoded = response.headers.get(HEADERS.PAYMENT_REQUIRED);
  if (encoded === null) return null;
  try {
    const decoded = decodeB64Json(encoded);
    return typeof decoded?.error === 'string' ? decoded.error : null;
  } catch {
    return null;
  }
}

test('retained startup claim proof distinguishes required from explicitly unclaimed roots',
  async t => {
    const roots = await Promise.all([
      createPrivateRoot('fixed-payer-claim-proof-absent-'),
      createPrivateRoot('fixed-payer-claim-proof-retained-'),
    ]);
    t.after(async () => removeVerifiedSyntheticRoots(roots));
    const [absent, retained] = roots;
    assert.equal(
      await assertRetainedStartupClaim(absent, STARTUP_CLAIM.NOT_PROVEN_CLAIMED),
      STARTUP_CLAIM.NOT_PROVEN_CLAIMED,
    );
    await assert.rejects(
      assertRetainedStartupClaim(absent, STARTUP_CLAIM.REQUIRED),
      error => error?.name === 'FixedPayerSettlementTestError' &&
        error?.message === 'STARTUP_CLAIM_REQUIRED',
    );

    const marker = join(retained, FIXED_PAYER_SETTLEMENT_STARTUP_MARKER_FILE);
    await writeFile(marker, '', { flag: 'wx', mode: 0o600 });
    assert.equal(
      await assertRetainedStartupClaim(retained, STARTUP_CLAIM.REQUIRED),
      STARTUP_CLAIM.RETAINED,
    );
    await chmod(marker, 0o644);
    await assert.rejects(
      assertRetainedStartupClaim(retained, STARTUP_CLAIM.NOT_PROVEN_CLAIMED),
      error => error?.name === 'FixedPayerSettlementTestError' &&
        error?.message === 'STARTUP_CLAIM_UNSAFE',
    );
    await assert.rejects(
      assertRetainedStartupClaim(marker, STARTUP_CLAIM.NOT_PROVEN_CLAIMED),
      error => error?.name === 'FixedPayerSettlementTestError' &&
        error?.message === 'STARTUP_CLAIM_INSPECTION_FAILED',
    );
  });

test('dispatcher, child, owner and child-startup imports are inert and explicitly opt in', () => {
  assert.equal(typeof createFixedPayerSettlementDispatcher, 'function');
  assert.equal(typeof runFixedPayerSettlementChild, 'function');
  assert.equal(typeof createFixedPayerSettlementOfflineTestAuthority, 'function');
  assert.equal(typeof createFixedPayerSettlementOwner, 'function');
  assert.equal(typeof prepareFreshFixedPayerSettlementChild, 'function');
  assert.equal(typeof FIXED_PAYER_SETTLEMENT_STARTUP_MARKER_FILE, 'string');
  assert.equal(typeof FIXED_PAYER_SETTLEMENT_STARTUP_STDOUT_BOUNDARY, 'string');
  assert.equal(typeof FIXED_PAYER_SETTLEMENT_STARTUP_STDERR_BOUNDARY, 'string');
  assert.equal(typeof OWNER_CODES, 'object');
  assert.equal(typeof FixedPayerSettlementOwnerError, 'function');
  assert.deepEqual({
    message: process.listenerCount('message'),
    disconnect: process.listenerCount('disconnect'),
    exit: process.listenerCount('exit'),
  }, parentListenersBeforeImport);
});

test('READY-shaped values and unbranded callbacks cannot create owned startup authority', async t => {
  const { routing } = await routingFixture(t);
  const listeners = {
    message: process.listenerCount('message'),
    disconnect: process.listenerCount('disconnect'),
    exit: process.listenerCount('exit'),
  };
  for (const authority of [
    Object.freeze({ type: 'READY' }),
    Object.freeze({ markerPresent: true, journalIdentity: Object.freeze({}) }),
    Object.freeze({ activate: () => true }),
  ]) {
    assert.throws(() => createFixedPayerSettlementOwner({
      authority,
      routing,
      requestTimeoutMs: 100,
      maxOperationsPerShard: 8,
    }), ownerRejectsWith(OWNER_CODES.AUTHORITY_REQUIRED));
  }
  assert.deepEqual({
    message: process.listenerCount('message'),
    disconnect: process.listenerCount('disconnect'),
    exit: process.listenerCount('exit'),
  }, listeners);

  const denied = spawn(EXECUTABLE, [CHILD_ENTRYPOINT], {
    env: Object.create(null),
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let outputBytes = 0;
  denied.stdout.on('data', chunk => { outputBytes += chunk.length; });
  denied.stderr.on('data', chunk => { outputBytes += chunk.length; });
  let exitObserved = false;
  let closeObserved = false;
  const exit = new Promise(resolvePromise => denied.once('exit', (code, signal) => {
    exitObserved = true;
    resolvePromise({ code, signal });
  }));
  const close = new Promise(resolvePromise => denied.once('close', (code, signal) => {
    closeObserved = true;
    resolvePromise({ code, signal });
  }));
  const [exitState, closeState] = await Promise.all([exit, close]);
  assert.notEqual(exitState.code, 0);
  assert.equal(exitState.signal, null);
  assert.deepEqual(closeState, exitState);
  assert.equal(exitObserved && closeObserved, true);
  assert.equal(outputBytes, 0);
});

test('the retired v1 offline invocation is refused before a root claim', async t => {
  const { routing } = await routingFixture(t);
  const root = await createPrivateRoot('fixed-payer-v1-invocation-');
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = signedStartupPayloads(routing)[0];
  await writeSignedFixture(root, payload);
  const child = spawn(
    EXECUTABLE,
    [CHILD_ENTRYPOINT, '--fixed-payer-offline-test-v1', 'A', root],
    { env: Object.create(null), shell: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
  );
  let outputBytes = 0;
  child.stdout.on('data', chunk => { outputBytes += chunk.length; });
  child.stderr.on('data', chunk => { outputBytes += chunk.length; });
  const exited = new Promise(resolvePromise => child.once('exit', (code, signal) => {
    resolvePromise({ code, signal });
  }));
  const closed = new Promise(resolvePromise => child.once('close', (code, signal) => {
    resolvePromise({ code, signal });
  }));
  const [exitState, closeState] = await Promise.all([exited, closed]);
  assert.notEqual(exitState.code, 0);
  assert.equal(exitState.signal, null);
  assert.deepEqual(closeState, exitState);
  assert.equal(outputBytes, 0);
  await assert.rejects(
    lstat(join(root, FIXED_PAYER_SETTLEMENT_STARTUP_MARKER_FILE)),
    error => error?.code === 'ENOENT',
  );
  await assert.rejects(lstat(join(root, 'journal')), error => error?.code === 'ENOENT');
});

test('owned startup waits for exact commit ACKs and both FIFO pipe boundaries', {
  timeout: 15_000,
}, async t => {
  const { routing } = await routingFixture(t);
  const roots = await Promise.all([
    createPrivateRoot('fixed-payer-commit-boundary-a-'),
    createPrivateRoot('fixed-payer-commit-boundary-b-'),
  ]);
  const payloads = signedStartupPayloads(routing);
  await Promise.all(roots.map((root, index) => writeSignedFixture(root, payloads[index])));
  await writeStartupFixture(roots[0], 'DELAY_STDERR_BOUNDARY');
  const { owner } = createOfflineOwner(routing, payloads, roots);
  t.after(async () => {
    try { await owner.shutdown(); } catch {}
    const status = owner.status();
    if (status.children.every(child => child.exitObserved && child.closeObserved)) {
      await removeVerifiedSyntheticRoots(roots);
    }
  });

  const starting = owner.start();
  void starting.catch(() => {});
  let gap;
  const deadline = performance.now() + 3_000;
  while (performance.now() < deadline) {
    const status = owner.status();
    const delayed = status.children.find(child => child.label === 'A');
    if (delayed?.ready && delayed.committed && delayed.stdoutBoundary &&
        !delayed.stderrBoundary) {
      gap = status;
      break;
    }
    if (status.phase !== 'IDLE' && status.phase !== 'STARTING') break;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
  }
  assert.notEqual(gap, undefined);
  assert.equal(gap.phase, 'STARTING');
  assert.equal(gap.dispatcherExposed, false);

  const facade = await starting;
  assert.equal(typeof facade.settle, 'function');
  const ready = owner.status();
  assert.equal(ready.phase, 'READY');
  assert.equal(ready.dispatcherExposed, true);
  assert.equal(ready.children.every(child => child.ready && child.committed &&
    child.stdoutBoundary && child.stderrBoundary), true);
  const verdict = await owner.shutdown();
  assert.equal(verdict.quarantined, false);
  assert.equal(owner.status().children.every(child =>
    child.exitObserved && child.closeObserved), true);
});

test('owned startup rejects retired v1 stdout and stderr sentinels without fallback', {
  timeout: 20_000,
}, async t => {
  const scenarios = [
    { name: 'stdout sentinel', mode: 'RETIRED_V1_STDOUT_BOUNDARY' },
    { name: 'stderr sentinel', mode: 'RETIRED_V1_STDERR_BOUNDARY' },
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, async nested => {
      let routingRoot;
      const roots = [];
      let owner;
      nested.after(async () => {
        try { await owner?.shutdown(); } catch {}
        const reaped = owner === undefined ||
          owner.status().children.every(child => child.exitObserved && child.closeObserved);
        if (reaped) {
          await removeVerifiedSyntheticRoots([
            ...(routingRoot === undefined ? [] : [routingRoot]),
            ...roots,
          ]);
        }
      });

      const routingFixtureValue = await createRoutingRoot(
        `fixed-payer-retired-${scenario.mode.toLowerCase()}-routing-`,
      );
      routingRoot = routingFixtureValue.root;
      roots.push(await createPrivateRoot(
        `fixed-payer-retired-${scenario.mode.toLowerCase()}-a-`,
      ));
      roots.push(await createPrivateRoot(
        `fixed-payer-retired-${scenario.mode.toLowerCase()}-b-`,
      ));
      const payloads = signedStartupPayloads(routingFixtureValue.routing);
      await Promise.all(roots.map((root, index) => writeSignedFixture(root, payloads[index])));
      await writeStartupFixture(roots[0], scenario.mode);
      ({ owner } = createOfflineOwner(routingFixtureValue.routing, payloads, roots));

      const starting = owner.start();
      assert.equal(owner.start(), starting);
      await assert.rejects(starting, ownerRejectsWith(OWNER_CODES.STARTUP_FAILED));
      const failed = owner.status();
      assert.equal(failed.phase, 'FAILED');
      assert.equal(failed.startedChildren, 2);
      assert.equal(failed.dispatcherExposed, false);
      assert.equal(failed.cleanupUncertain, false);
      assert.equal(failed.children.length, 2);
      assert.equal(failed.children.every(child =>
        child.exitObserved && child.closeObserved), true);
      assert.equal(owner.start(), starting);
      assert.equal(Object.hasOwn(owner, 'restart'), false);
      assert.equal(Object.hasOwn(owner, 'replace'), false);
      assert.equal(Object.hasOwn(owner, 'recover'), false);
      await new Promise(resolvePromise => setTimeout(resolvePromise, 25));
      assert.equal(owner.status().startedChildren, 2);

      for (const root of roots) {
        assert.equal(
          await assertRetainedStartupClaim(root, STARTUP_CLAIM.REQUIRED),
          STARTUP_CLAIM.RETAINED,
        );
        const journal = new SettlementJournal({
          directory: join(root, 'journal'),
          allowedRoot: root,
          existingOnly: true,
        });
        assert.deepEqual(await journal.load(), {
          schemaVersion: 1,
          revision: 0,
          records: [],
        });
        assert.deepEqual(await journal.list({ includeTombstones: true }), {
          records: [],
          tombstones: [],
        });
      }
    });
  }
});

test('owned startup rejects extra commit ACKs observed during the global startup join', {
  timeout: 20_000,
}, async t => {
  const scenarios = [
    { name: 'duplicate acknowledgement', mode: 'DUPLICATE_STARTUP_ACK' },
    { name: 'mismatched acknowledgement', mode: 'MISMATCHED_STARTUP_ACK' },
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, async nested => {
      let routingRoot;
      const roots = [];
      let owner;
      nested.after(async () => {
        try { await owner?.shutdown(); } catch {}
        const reaped = owner === undefined ||
          owner.status().children.every(child => child.exitObserved && child.closeObserved);
        if (reaped) {
          await removeVerifiedSyntheticRoots([
            ...(routingRoot === undefined ? [] : [routingRoot]),
            ...roots,
          ]);
        }
      });

      const routingFixtureValue = await createRoutingRoot(
        `fixed-payer-startup-${scenario.mode.toLowerCase()}-routing-`,
      );
      routingRoot = routingFixtureValue.root;
      roots.push(await createPrivateRoot(
        `fixed-payer-startup-${scenario.mode.toLowerCase()}-a-`,
      ));
      roots.push(await createPrivateRoot(
        `fixed-payer-startup-${scenario.mode.toLowerCase()}-b-`,
      ));
      const payloads = signedStartupPayloads(routingFixtureValue.routing);
      await Promise.all(roots.map((root, index) => writeSignedFixture(root, payloads[index])));
      await writeStartupFixture(roots[0], scenario.mode);
      ({ owner } = createOfflineOwner(routingFixtureValue.routing, payloads, roots));

      const starting = owner.start();
      assert.equal(owner.start(), starting);
      let returnedFacade;
      let startupError;
      try {
        returnedFacade = await starting;
      } catch (error) {
        startupError = error;
      }
      if (returnedFacade !== undefined) {
        assert.equal(typeof returnedFacade.settle, 'function');
        const quarantined = await waitForOwnerPhase(owner, ['QUARANTINED']);
        assert.equal(quarantined.dispatcherExposed, true);
      }
      assert.equal(returnedFacade, undefined);
      assert.equal(ownerRejectsWith(OWNER_CODES.STARTUP_FAILED)(startupError), true);

      const failed = owner.status();
      assert.equal(failed.phase, 'FAILED');
      assert.equal(failed.startedChildren, 2);
      assert.equal(failed.dispatcherExposed, false);
      assert.equal(failed.cleanupUncertain, false);
      assert.equal(failed.children.every(child => child.ready && child.committed), true);
      assert.equal(failed.children.every(child =>
        child.exitObserved && child.closeObserved), true);
      assert.equal(owner.start(), starting);
      assert.equal(Object.hasOwn(owner, 'restart'), false);
      await new Promise(resolvePromise => setTimeout(resolvePromise, 25));
      assert.equal(owner.status().startedChildren, 2);

      for (const root of roots) {
        const marker = await lstat(join(root, FIXED_PAYER_SETTLEMENT_STARTUP_MARKER_FILE));
        assert.equal(marker.isFile(), true);
        assert.equal(marker.nlink, 1);
        assert.equal(marker.mode & 0o777, 0o600);
        const journal = new SettlementJournal({
          directory: join(root, 'journal'),
          allowedRoot: root,
          existingOnly: true,
        });
        assert.deepEqual(await journal.load(), {
          schemaVersion: 1,
          revision: 0,
          records: [],
        });
        assert.deepEqual(await journal.list({ includeTombstones: true }), {
          records: [],
          tombstones: [],
        });
      }
    });
  }
});

test('owned facade normal retirement preserves raw result and closes without quarantine', {
  timeout: 15_000,
}, async t => {
  const { routing } = await routingFixture(t);
  const roots = await Promise.all([
    createPrivateRoot('fixed-payer-normal-retire-a-'),
    createPrivateRoot('fixed-payer-normal-retire-b-'),
  ]);
  const payloads = signedStartupPayloads(routing);
  await Promise.all(roots.map((root, index) => writeSignedFixture(root, payloads[index])));
  const { owner } = createOfflineOwner(routing, payloads, roots);
  t.after(async () => {
    try { await owner.shutdown(); } catch {}
    const status = owner.status();
    if (status.children.every(child => child.exitObserved && child.closeObserved)) {
      await removeVerifiedSyntheticRoots(roots);
    }
  });

  const facade = await owner.start();
  assert.throws(
    () => facade.retire('invalid'),
    rejectsWith(DISPATCH_CODES.INVALID_REQUEST),
  );
  const healthy = owner.status();
  assert.equal(healthy.phase, 'READY');
  assert.equal(healthy.children.every(child =>
    !child.exitObserved && !child.closeObserved), true);

  const retirement = facade.retire();
  assert.equal(facade.retire(), retirement);
  const shutdown = owner.shutdown();
  assert.equal(owner.shutdown(), shutdown);
  const [retired, verdict] = await Promise.all([retirement, shutdown]);
  assert.deepEqual(retired, { retired: true });
  assert.deepEqual(verdict, {
    closed: true,
    exactReaping: true,
    quarantined: false,
    markerDisposition: 'NOT_REMOVED',
    rootDisposition: 'NOT_REMOVED',
  });
  const closed = owner.status();
  assert.equal(closed.phase, 'CLOSED');
  assert.equal(closed.cleanupUncertain, false);
  assert.equal(closed.children.every(child => child.exitObserved && child.closeObserved), true);
});

test('owned startup exposes no dispatcher before two correlated READY barriers and reaps once', {
  timeout: 15_000,
}, async t => {
  const { routing } = await routingFixture(t);
  const roots = await Promise.all([
    createPrivateRoot('fixed-payer-owner-a-'),
    createPrivateRoot('fixed-payer-owner-b-'),
  ]);
  const payloads = signedStartupPayloads(routing);
  await Promise.all(roots.map((root, index) => writeSignedFixture(root, payloads[index])));
  await writeStartupFixture(roots[1], 'DELAY_READY');
  const { authority, owner } = createOfflineOwner(routing, payloads, roots);
  let cleanupComplete = false;
  t.after(async () => {
    try { await owner.shutdown(); } catch {}
    const status = owner.status();
    if (status.children.every(child => child.exitObserved && child.closeObserved)) {
      await removeVerifiedSyntheticRoots(roots);
      cleanupComplete = true;
    }
  });

  assert.deepEqual(owner.status(), {
    phase: 'IDLE',
    startedChildren: 0,
    dispatcherExposed: false,
    cleanupUncertain: false,
    markerDisposition: 'NOT_REMOVED',
    rootDisposition: 'NOT_REMOVED',
    children: [],
  });
  const starting = owner.start();
  assert.equal(owner.start(), starting);
  assert.equal(await bounded(starting, 25), false);
  const during = owner.status();
  assert.equal(during.phase, 'STARTING');
  assert.equal(during.startedChildren, 2);
  assert.equal(during.dispatcherExposed, false);

  const dispatcher = await starting;
  assert.deepEqual(Reflect.ownKeys(dispatcher), [
    'settle',
    'markDeliveryPending',
    'markDelivered',
    'retire',
    'retirementStatus',
  ]);
  assert.equal(Object.isFrozen(dispatcher), true);
  assert.equal(Reflect.ownKeys(dispatcher).every(name =>
    typeof dispatcher[name] === 'function' && Object.isFrozen(dispatcher[name])), true);
  const ready = owner.status();
  assert.equal(ready.phase, 'READY');
  assert.equal(ready.startedChildren, 2);
  assert.equal(ready.dispatcherExposed, true);
  assert.deepEqual(ready.children.map(child => ({
    label: child.label,
    ready: child.ready,
    exitObserved: child.exitObserved,
    closeObserved: child.closeObserved,
  })), [
    { label: 'A', ready: true, exitObserved: false, closeObserved: false },
    { label: 'B', ready: true, exitObserved: false, closeObserved: false },
  ]);
  assert.throws(() => createFixedPayerSettlementOwner({
    authority,
    routing,
    requestTimeoutMs: 1_000,
    maxOperationsPerShard: 16,
  }), ownerRejectsWith(OWNER_CODES.AUTHORITY_CONSUMED));

  const shutdown = owner.shutdown();
  assert.equal(owner.shutdown(), shutdown);
  const firstInput = {
    paymentPayload: payloads[0],
    requirements: payloads[0].accepted,
    paymentRequired: paymentRequired(payloads[0].accepted),
  };
  await assert.rejects(
    dispatcher.settle(
      firstInput.paymentPayload,
      firstInput.requirements,
      firstInput.paymentRequired,
    ),
    rejectsWith(DISPATCH_CODES.RETIREMENT_STARTED),
  );
  const shutdownResult = await shutdown;
  assert.deepEqual(shutdownResult, {
    closed: true,
    exactReaping: true,
    quarantined: false,
    markerDisposition: 'NOT_REMOVED',
    rootDisposition: 'NOT_REMOVED',
  });
  const closed = owner.status();
  assert.equal(closed.phase, 'CLOSED');
  assert.equal(closed.children.every(child => child.exitObserved && child.closeObserved), true);
  assert.equal(Object.hasOwn(owner, 'restart'), false);
  assert.equal(Object.hasOwn(owner, 'replace'), false);
  assert.equal(Object.hasOwn(owner, 'recover'), false);
  for (const root of roots) {
    const marker = await lstat(join(root, FIXED_PAYER_SETTLEMENT_STARTUP_MARKER_FILE));
    assert.equal(marker.isFile(), true);
    assert.equal(marker.nlink, 1);
    assert.equal(marker.mode & 0o777, 0o600);
  }
  assert.equal(cleanupComplete, false);
});

test('owned startup rejects premature frames and every observed pre-barrier stdout form', {
  timeout: 20_000,
}, async t => {
  const scenarios = [
    { name: 'early string', mode: 'EARLY_STRING', delayPeer: true },
    { name: 'early publication marker', mode: 'EARLY_MARKER', delayPeer: false },
    { name: 'printable partial stdout', mode: 'PARTIAL_STDOUT', delayPeer: false },
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, async nested => {
      let routingRoot;
      const roots = [];
      let owner;
      nested.after(async () => {
        try { await owner?.shutdown(); } catch {}
        const reaped = owner === undefined ||
          owner.status().children.every(child => child.exitObserved && child.closeObserved);
        if (reaped) {
          await removeVerifiedSyntheticRoots([
            ...(routingRoot === undefined ? [] : [routingRoot]),
            ...roots,
          ]);
        }
      });
      const routingFixtureValue = await createRoutingRoot(
        `fixed-payer-startup-${scenario.mode.toLowerCase()}-routing-`,
      );
      routingRoot = routingFixtureValue.root;
      roots.push(await createPrivateRoot(
        `fixed-payer-startup-${scenario.mode.toLowerCase()}-a-`,
      ));
      roots.push(await createPrivateRoot(
        `fixed-payer-startup-${scenario.mode.toLowerCase()}-b-`,
      ));
      const payloads = signedStartupPayloads(routingFixtureValue.routing);
      await Promise.all(roots.map((root, index) => writeSignedFixture(root, payloads[index])));
      await writeStartupFixture(roots[0], scenario.mode);
      if (scenario.delayPeer) await writeStartupFixture(roots[1], 'DELAY_READY');
      ({ owner } = createOfflineOwner(routingFixtureValue.routing, payloads, roots));

      await assert.rejects(owner.start(), ownerRejectsWith(OWNER_CODES.STARTUP_FAILED));
      const status = owner.status();
      assert.equal(status.phase, 'FAILED');
      assert.equal(status.dispatcherExposed, false);
      assert.equal(status.children.every(child => child.exitObserved && child.closeObserved), true);
    });
  }
});

test('post-sentinel legacy publication stdout quarantines and reaps the owned generation', {
  timeout: 15_000,
}, async t => {
  const { routing } = await routingFixture(t);
  const roots = await Promise.all([
    createPrivateRoot('fixed-payer-runtime-stdout-a-'),
    createPrivateRoot('fixed-payer-runtime-stdout-b-'),
  ]);
  const payloads = signedStartupPayloads(routing);
  await Promise.all(roots.map((root, index) => writeSignedFixture(root, payloads[index])));
  await writeStartupFixture(roots[0], 'RUNTIME_LEGACY_STDOUT');
  const { owner } = createOfflineOwner(routing, payloads, roots);
  t.after(async () => {
    try { await owner.shutdown(); } catch {}
    if (owner.status().children.every(child => child.exitObserved && child.closeObserved)) {
      await removeVerifiedSyntheticRoots(roots);
    }
  });

  const facade = await owner.start();
  assert.equal(typeof facade.settle, 'function');
  const quarantined = await waitForOwnerPhase(owner, ['QUARANTINED']);
  assert.equal(quarantined.dispatcherExposed, true);
  const shutdown = await owner.shutdown();
  assert.equal(shutdown.quarantined, true);
  assert.equal(shutdown.exactReaping, true);
  assert.equal(owner.status().children.every(child =>
    child.exitObserved && child.closeObserved), true);
});

test('the durable one-use claim rejects concurrent and repeated same-root startup', {
  timeout: 10_000,
}, async t => {
  const { routing } = await routingFixture(t);
  const root = await createPrivateRoot('fixed-payer-claim-race-');
  const payload = signedStartupPayloads(routing)[0];
  await writeSignedFixture(root, payload);
  const descriptor = {
    shardId: CONFIGURATION.shardIds[0],
    payer: payload.payload.transaction.address,
    generation: 'fixture-generation-a',
  };
  const probes = [
    launchStartupProbe('A', root, descriptor),
    launchStartupProbe('A', root, descriptor),
  ];
  t.after(async () => {
    for (const probe of probes) {
      if (!probe.reaped) {
        try { probe.requestClose(); } catch {}
        try { await probe.reap(); } catch {}
      }
    }
    if (probes.every(probe => probe.reaped)) await removeVerifiedSyntheticRoots([root]);
  });
  const outcomes = await Promise.all(probes.map(probe => Promise.race([
    probe.ready.then(() => 'READY', () => 'REFUSED'),
    probe.closed.then(() => 'REFUSED'),
  ])));
  assert.equal(outcomes.filter(outcome => outcome === 'READY').length, 1);
  const winner = probes[outcomes.indexOf('READY')];
  winner.requestClose();
  const reaped = await Promise.all(probes.map(probe => probe.reap()));
  assert.equal(reaped.every(result => result.exited && result.closed && !result.diagnostics), true);

  const repeated = launchStartupProbe('A', root, descriptor);
  probes.push(repeated);
  await assert.rejects(repeated.ready, error =>
    error?.name === 'FixedPayerSettlementTestError' &&
    error?.message === 'STARTUP_PROBE_REFUSED');
  const repeatedClose = await repeated.closed;
  assert.notEqual(repeatedClose.code, 0);
  assert.equal(repeatedClose.signal, null);
  const repeatedReap = await repeated.reap();
  assert.deepEqual(repeatedReap, { exited: true, closed: true, diagnostics: false });
  const marker = await lstat(join(root, FIXED_PAYER_SETTLEMENT_STARTUP_MARKER_FILE));
  assert.equal(marker.isFile(), true);
  assert.equal(marker.nlink, 1);
  assert.equal(marker.mode & 0o777, 0o600);
});

test('child startup accepts only a fresh initial journal and retains its claim on every refusal', {
  timeout: 20_000,
}, async t => {
  const { routing } = await routingFixture(t);
  const payload = signedStartupPayloads(routing)[0];
  const input = {
    paymentPayload: payload,
    requirements: payload.accepted,
    paymentRequired: paymentRequired(payload.accepted),
  };
  const descriptor = {
    shardId: CONFIGURATION.shardIds[0],
    payer: payload.payload.transaction.address,
    generation: 'fixture-generation-a',
  };
  const roots = [];
  const probes = [];
  t.after(async () => {
    for (const probe of probes) {
      if (!probe.reaped) {
        try { probe.requestClose(); } catch {}
        try { await probe.reap(); } catch {}
      }
    }
    for (const root of roots) {
      try { await chmod(join(root, 'journal'), 0o700); } catch {}
    }
    if (probes.every(probe => probe.reaped)) await removeVerifiedSyntheticRoots(roots);
  });

  const newRoot = async prefix => {
    const root = await createPrivateRoot(prefix);
    roots.push(root);
    await writeSignedFixture(root, payload);
    return root;
  };
  const runAccepted = async root => {
    const probe = launchStartupProbe('A', root, descriptor);
    probes.push(probe);
    await probe.ready;
    probe.requestClose();
    const result = await probe.reap();
    assert.deepEqual(result, { exited: true, closed: true, diagnostics: false });
    const journal = new SettlementJournal({
      directory: join(root, 'journal'),
      allowedRoot: root,
      existingOnly: true,
    });
    assert.deepEqual(await journal.load(), {
      schemaVersion: 1,
      revision: 0,
      records: [],
    });
    assert.deepEqual(await journal.list({ includeTombstones: true }), {
      records: [],
      tombstones: [],
    });
  };
  const runRefused = async root => {
    const probe = launchStartupProbe('A', root, descriptor);
    probes.push(probe);
    await assert.rejects(probe.ready, error =>
      error?.name === 'FixedPayerSettlementTestError' &&
      error?.message === 'STARTUP_PROBE_REFUSED');
    const close = await probe.closed;
    assert.notEqual(close.code, 0);
    assert.equal(close.signal, null);
    const result = await probe.reap();
    assert.deepEqual(result, { exited: true, closed: true, diagnostics: false });
    const marker = await lstat(join(root, FIXED_PAYER_SETTLEMENT_STARTUP_MARKER_FILE));
    assert.equal(marker.isFile(), true);
    assert.equal(marker.nlink, 1);
    assert.equal(marker.mode & 0o777, 0o600);
  };

  await runAccepted(await newRoot('fixed-payer-fresh-created-'));

  const provisioned = await newRoot('fixed-payer-fresh-provisioned-');
  assert.deepEqual(await new SettlementJournal({
    directory: join(provisioned, 'journal'),
    allowedRoot: provisioned,
  }).load(), { schemaVersion: 1, revision: 0, records: [] });
  await runAccepted(provisioned);

  const retainedRecord = await newRoot('fixed-payer-retained-record-');
  await new SettlementJournal({
    directory: join(retainedRecord, 'journal'),
    allowedRoot: retainedRecord,
  }).putValidated(retainedAttempt(input));
  await runRefused(retainedRecord);

  const retainedRevision = await newRoot('fixed-payer-retained-revision-');
  await mkdir(join(retainedRevision, 'journal'), { mode: 0o700 });
  await writeFile(join(retainedRevision, 'journal', '.settlement-journal.initialized'), '', {
    flag: 'wx',
    mode: 0o600,
  });
  const revisionState = { schemaVersion: 1, revision: 1, records: {} };
  await writeFile(
    join(retainedRevision, 'journal', 'settlement-journal.json'),
    `${JSON.stringify({ ...revisionState, checksum: sha256Hex(revisionState) }, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  await runRefused(retainedRevision);

  const noninitialSchema = await newRoot('fixed-payer-retained-schema-');
  await mkdir(join(noninitialSchema, 'journal'), { mode: 0o700 });
  await writeFile(join(noninitialSchema, 'journal', '.settlement-journal.initialized'), '', {
    flag: 'wx',
    mode: 0o600,
  });
  const schemaState = { schemaVersion: 2, revision: 0, records: {}, tombstones: {} };
  await writeFile(
    join(noninitialSchema, 'journal', 'settlement-journal.json'),
    `${JSON.stringify({ ...schemaState, checksum: sha256Hex(schemaState) }, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  await runRefused(noninitialSchema);

  const retainedTombstone = await newRoot('fixed-payer-retained-tombstone-');
  let journalTime = Date.parse('2026-01-01T00:00:00.000Z');
  const tombstoneJournal = new SettlementJournal({
    directory: join(retainedTombstone, 'journal'),
    allowedRoot: retainedTombstone,
    clock: () => new Date(journalTime),
  });
  const record = await tombstoneJournal.putValidated(retainedAttempt(input));
  const snapshot = await tombstoneJournal.getEntrySnapshot(
    record.authorizationKey,
    record.transactionHash,
  );
  journalTime += 3_600_000;
  await tombstoneJournal.replaceRecordWithTombstone({
    expectedRevision: snapshot.revision,
    expectedRecord: snapshot.entry,
    retentionMs: 3_600_000,
  });
  await runRefused(retainedTombstone);

  const partial = await newRoot('fixed-payer-retained-partial-');
  await mkdir(join(partial, 'journal'), { mode: 0o700 });
  await runRefused(partial);

  const corrupt = await newRoot('fixed-payer-retained-corrupt-');
  await mkdir(join(corrupt, 'journal'), { mode: 0o700 });
  await writeFile(join(corrupt, 'journal', '.settlement-journal.initialized'), '', {
    flag: 'wx',
    mode: 0o600,
  });
  await writeFile(join(corrupt, 'journal', 'settlement-journal.json'), '{', {
    flag: 'wx',
    mode: 0o600,
  });
  await runRefused(corrupt);

  const inaccessible = await newRoot('fixed-payer-retained-inaccessible-');
  await mkdir(join(inaccessible, 'journal'), { mode: 0o700 });
  await chmod(join(inaccessible, 'journal'), 0o000);
  await runRefused(inaccessible);
  await chmod(join(inaccessible, 'journal'), 0o700);

  const uncertainMarker = await newRoot('fixed-payer-retained-marker-');
  await writeFile(join(uncertainMarker, FIXED_PAYER_SETTLEMENT_STARTUP_MARKER_FILE), '', {
    flag: 'wx',
    mode: 0o600,
  });
  await runRefused(uncertainMarker);
});

test('child startup refuses foreign and stale temporary journal entries', {
  timeout: 15_000,
}, async t => {
  const scenarios = [
    { name: 'foreign file', entry: 'foreign-entry' },
    {
      name: 'stale temporary journal',
      entry: '.settlement-journal.json.1.0000000000000000.tmp',
    },
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, async nested => {
      let routingRoot;
      let root;
      let probe;
      nested.after(async () => {
        if (probe !== undefined && !probe.reaped) {
          try { probe.requestClose(); } catch {}
          try { await probe.reap(); } catch {}
        }
        if (probe === undefined || probe.reaped) {
          await removeVerifiedSyntheticRoots([
            ...(routingRoot === undefined ? [] : [routingRoot]),
            ...(root === undefined ? [] : [root]),
          ]);
        }
      });
      const routingFixtureValue = await createRoutingRoot(
        `fixed-payer-journal-${scenario.name.replaceAll(' ', '-')}-routing-`,
      );
      routingRoot = routingFixtureValue.root;
      root = await createPrivateRoot(
        `fixed-payer-journal-${scenario.name.replaceAll(' ', '-')}-`,
      );
      const payload = signedStartupPayloads(routingFixtureValue.routing)[0];
      await writeSignedFixture(root, payload);
      await new SettlementJournal({
        directory: join(root, 'journal'),
        allowedRoot: root,
      }).load();
      await writeFile(join(root, 'journal', scenario.entry), '', {
        flag: 'wx',
        mode: 0o600,
      });
      const descriptor = {
        shardId: CONFIGURATION.shardIds[0],
        payer: payload.payload.transaction.address,
        generation: 'fixture-generation-a',
      };
      probe = launchStartupProbe('A', root, descriptor);

      await assert.rejects(probe.ready, error =>
        error?.name === 'FixedPayerSettlementTestError' &&
        error?.message === 'STARTUP_PROBE_REFUSED');
      const close = await probe.closed;
      assert.notEqual(close.code, 0);
      assert.equal(close.signal, null);
      assert.deepEqual(await probe.reap(), {
        exited: true,
        closed: true,
        diagnostics: false,
      });
      const marker = await lstat(join(root, FIXED_PAYER_SETTLEMENT_STARTUP_MARKER_FILE));
      assert.equal(marker.isFile(), true);
      assert.equal(marker.nlink, 1);
      assert.equal(marker.mode & 0o777, 0o600);
    });
  }
});

test('owned startup failure, timeout and child loss quarantine one generation without respawn', {
  timeout: 25_000,
}, async t => {
  await t.test('partial startup reaps both actually started children', async nested => {
    const { routing } = await routingFixture(nested);
    const roots = await Promise.all([
      createPrivateRoot('fixed-payer-partial-a-'),
      createPrivateRoot('fixed-payer-partial-b-'),
    ]);
    const payloads = signedStartupPayloads(routing);
    await Promise.all(roots.map((root, index) => writeSignedFixture(root, payloads[index])));
    const retainedInput = {
      paymentPayload: payloads[1],
      requirements: payloads[1].accepted,
      paymentRequired: paymentRequired(payloads[1].accepted),
    };
    const retainedJournal = new SettlementJournal({
      directory: join(roots[1], 'journal'),
      allowedRoot: roots[1],
    });
    const retainedRecord = await retainedJournal.putValidated(retainedAttempt(retainedInput));
    const { owner } = createOfflineOwner(routing, payloads, roots);
    nested.after(async () => {
      try { await owner.shutdown(); } catch {}
      const status = owner.status();
      if (status.children.every(child => child.exitObserved && child.closeObserved)) {
        await removeVerifiedSyntheticRoots(roots);
      }
    });
    const startup = owner.start();
    assert.equal(owner.start(), startup);
    await assert.rejects(startup, ownerRejectsWith(OWNER_CODES.STARTUP_FAILED));
    const status = owner.status();
    assert.equal(status.phase, 'FAILED');
    assert.equal(status.startedChildren, 2);
    assert.equal(status.dispatcherExposed, false);
    assert.equal(status.cleanupUncertain, false);
    assert.equal(status.children.every(child => child.exitObserved && child.closeObserved), true);
    await assertRetainedStartupClaim(roots[0], STARTUP_CLAIM.NOT_PROVEN_CLAIMED);
    assert.equal(
      await assertRetainedStartupClaim(roots[1], STARTUP_CLAIM.REQUIRED),
      STARTUP_CLAIM.RETAINED,
    );
    const retainedJournalAfter = new SettlementJournal({
      directory: join(roots[1], 'journal'),
      allowedRoot: roots[1],
      existingOnly: true,
    });
    requireProof(isDeepStrictEqual(await retainedJournalAfter.load(), {
      schemaVersion: 1,
      revision: 1,
      records: [retainedRecord],
    }), 'RETAINED_JOURNAL_CHANGED');
    requireProof(isDeepStrictEqual(
      await retainedJournalAfter.list({ includeTombstones: true }),
      { records: [retainedRecord], tombstones: [] },
    ), 'RETAINED_JOURNAL_CHANGED');
  });

  await t.test('a payer-mismatched READY frame cannot satisfy the owner barrier', async nested => {
    const { routing } = await routingFixture(nested);
    const roots = await Promise.all([
      createPrivateRoot('fixed-payer-ready-mismatch-a-'),
      createPrivateRoot('fixed-payer-ready-mismatch-b-'),
    ]);
    const payloads = signedStartupPayloads(routing);
    await Promise.all(roots.map((root, index) => writeSignedFixture(root, payloads[index])));
    const shards = ownedDescriptors(payloads, roots);
    shards[0].payer = canonicalPayer(249);
    requireProof(shards[0].payer !== shards[1].payer, 'READY_MISMATCH_FIXTURE');
    const authority = createFixedPayerSettlementOfflineTestAuthority({
      shards,
      startupTimeoutMs: 2_000,
      terminateGraceMs: 500,
      terminateForceMs: 1_000,
    });
    const owner = createFixedPayerSettlementOwner({
      authority,
      routing,
      requestTimeoutMs: 1_000,
      maxOperationsPerShard: 16,
    });
    nested.after(async () => {
      try { await owner.shutdown(); } catch {}
      const status = owner.status();
      if (status.children.every(child => child.exitObserved && child.closeObserved)) {
        await removeVerifiedSyntheticRoots(roots);
      }
    });
    await assert.rejects(owner.start(), ownerRejectsWith(OWNER_CODES.STARTUP_FAILED));
    const status = owner.status();
    assert.equal(status.phase, 'FAILED');
    assert.equal(status.startedChildren, 2);
    assert.equal(status.dispatcherExposed, false);
    assert.equal(status.children.every(child => child.exitObserved && child.closeObserved), true);
  });

  await t.test('startup timeout has a separate bounded exact teardown', async nested => {
    const { routing } = await routingFixture(nested);
    const roots = await Promise.all([
      createPrivateRoot('fixed-payer-timeout-a-'),
      createPrivateRoot('fixed-payer-timeout-b-'),
    ]);
    const payloads = signedStartupPayloads(routing);
    await Promise.all(roots.map((root, index) => writeSignedFixture(root, payloads[index])));
    await writeStartupFixture(roots[0], 'HOLD_BEFORE_READY');
    const { owner } = createOfflineOwner(routing, payloads, roots, {
      startupTimeoutMs: 75,
      terminateGraceMs: 250,
      terminateForceMs: 750,
    });
    nested.after(async () => {
      try { await owner.shutdown(); } catch {}
      const status = owner.status();
      if (status.children.every(child => child.exitObserved && child.closeObserved)) {
        await removeVerifiedSyntheticRoots(roots);
      }
    });
    await assert.rejects(owner.start(), ownerRejectsWith(OWNER_CODES.STARTUP_TIMEOUT));
    const status = owner.status();
    assert.equal(status.phase, 'FAILED');
    assert.equal(status.startedChildren, 2);
    assert.equal(status.dispatcherExposed, false);
    assert.equal(status.cleanupUncertain, false);
    assert.equal(status.children.every(child => child.exitObserved && child.closeObserved), true);
  });

  await t.test('post-READY child loss retires both routes and never respawns', async nested => {
    const { routing } = await routingFixture(nested);
    const roots = await Promise.all([
      createPrivateRoot('fixed-payer-loss-a-'),
      createPrivateRoot('fixed-payer-loss-b-'),
    ]);
    const payloads = signedStartupPayloads(routing);
    await Promise.all(roots.map((root, index) => writeSignedFixture(root, payloads[index])));
    await writeStartupFixture(roots[0], 'EXIT_AFTER_READY');
    const { owner } = createOfflineOwner(routing, payloads, roots);
    nested.after(async () => {
      try { await owner.shutdown(); } catch {}
      const status = owner.status();
      if (status.children.every(child => child.exitObserved && child.closeObserved)) {
        await removeVerifiedSyntheticRoots(roots);
      }
    });
    const dispatcher = await owner.start();
    const quarantined = await waitForOwnerPhase(owner, ['QUARANTINED']);
    assert.equal(quarantined.startedChildren, 2);
    assert.equal(quarantined.dispatcherExposed, true);
    for (const payload of payloads) {
      await assert.rejects(
        dispatcher.settle(payload, payload.accepted, paymentRequired(payload.accepted)),
        rejectsWith(DISPATCH_CODES.RETIREMENT_STARTED),
      );
    }
    const closed = await owner.shutdown();
    assert.deepEqual(closed, {
      closed: true,
      exactReaping: true,
      quarantined: true,
      markerDisposition: 'NOT_REMOVED',
      rootDisposition: 'NOT_REMOVED',
    });
    const finalStatus = owner.status();
    assert.equal(finalStatus.phase, 'QUARANTINED');
    assert.equal(finalStatus.startedChildren, 2);
    assert.equal(finalStatus.children.every(child => child.exitObserved && child.closeObserved), true);
  });
});

test('owned facade timeout retires and exactly reaps the whole READY generation', {
  timeout: 15_000,
}, async t => {
  let routingRoot;
  const roots = [];
  let owner;
  t.after(async () => {
    try { await owner?.shutdown(); } catch {}
    const reaped = owner === undefined ||
      owner.status().children.every(child => child.exitObserved && child.closeObserved);
    if (reaped) {
      await removeVerifiedSyntheticRoots([
        ...(routingRoot === undefined ? [] : [routingRoot]),
        ...roots,
      ]);
    }
  });
  const routingFixtureValue = await createRoutingRoot('fixed-payer-owner-timeout-routing-');
  routingRoot = routingFixtureValue.root;
  roots.push(await createPrivateRoot('fixed-payer-owner-timeout-a-'));
  roots.push(await createPrivateRoot('fixed-payer-owner-timeout-b-'));
  const payloads = signedStartupPayloads(routingFixtureValue.routing);
  await Promise.all(roots.map((root, index) => writeSignedFixture(root, payloads[index])));
  ({ owner } = createOfflineOwner(routingFixtureValue.routing, payloads, roots, {
    requestTimeoutMs: 75,
    terminateGraceMs: 500,
    terminateForceMs: 1_000,
  }));
  const facade = await owner.start();
  const result = await facade.settle(
    payloads[0],
    payloads[0].accepted,
    paymentRequired(payloads[0].accepted),
  );
  assert.equal(result.success, false);
  assert.equal(result.state, 'SUBMISSION_OUTCOME_UNKNOWN');
  assert.equal(result.retrySamePayment, true);

  const quarantined = await waitForOwnerPhase(owner, ['QUARANTINED']);
  assert.equal(quarantined.startedChildren, 2);
  const shutdown = await owner.shutdown();
  assert.equal(shutdown.quarantined, true);
  const finalStatus = owner.status();
  assert.equal(finalStatus.phase, 'QUARANTINED');
  assert.equal(finalStatus.children.every(child => child.exitObserved && child.closeObserved), true);
});

test('owner-returned facade quarantines on a mismatched publication observation', {
  timeout: 20_000,
}, async t => {
  const operation = createOperationDeadline(12_000);
  const ownedRoots = [];
  const childRoots = [];
  let owner;
  let facade;
  let originalStart;
  let originalRetire;
  let originalShutdown;
  let startingPromise;
  let retirementPromise;
  let shutdownPromise;
  let ownerClosurePromise;
  let ownerFallbackPromise;
  let exactReaping = false;
  let removalPromise;
  let removalComplete = false;
  let deadlineFailure;
  let deadlineAdjudicated = false;

  const isDeadlineFailure = error =>
    error?.name === 'FixedPayerSettlementTestError' &&
    error?.message === 'WHOLE_OPERATION_TIMEOUT';
  const rememberDeadlineFailure = error => {
    if (!isDeadlineFailure(error)) return false;
    deadlineFailure ??= error;
    return true;
  };
  const exactlyReaped = () => {
    if (owner === undefined) return true;
    try {
      const status = owner.status();
      return status.cleanupUncertain === false && status.startedChildren === 2 &&
        status.children.length === 2 &&
        status.children.every(child => child.exitObserved && child.closeObserved);
    } catch {
      return false;
    }
  };
  const beginOwnerClosure = () => {
    if (owner === undefined) return undefined;
    if (facade !== undefined && retirementPromise === undefined) {
      try {
        retirementPromise = originalRetire();
      } catch {
        retirementPromise = Promise.reject(fixedFailure('OWNER_MISMATCH_RETIREMENT'));
      }
      void retirementPromise.catch(() => {});
    }
    if (shutdownPromise === undefined) {
      try {
        shutdownPromise = originalShutdown();
      } catch {
        shutdownPromise = Promise.reject(fixedFailure('OWNER_MISMATCH_SHUTDOWN'));
      }
      void shutdownPromise.catch(() => {});
    }
    if (ownerClosurePromise === undefined) {
      const operations = [
        ...(retirementPromise === undefined ? [] : [retirementPromise]),
        shutdownPromise,
      ];
      ownerClosurePromise = Promise.all(operations);
      void ownerClosurePromise.catch(() => {});
      ownerFallbackPromise = Promise.allSettled(operations);
    }
    return ownerClosurePromise;
  };
  const beginRootRemoval = () => {
    requireProof(owner === undefined || exactReaping,
      'OWNER_MISMATCH_ROOT_REMOVAL_BEFORE_REAP');
    if (removalPromise !== undefined) return removalPromise;
    const targets = Object.freeze([...ownedRoots]);
    removalPromise = (async () => {
      const disposition = await removeOwnedRoots(targets);
      if (disposition !== 'REMOVED') return disposition;
      const absent = await Promise.all(targets.map(async root => {
        try {
          await lstat(root);
          return false;
        } catch (error) {
          return error?.code === 'ENOENT';
        }
      }));
      return absent.every(Boolean) ? 'REMOVED_VERIFIED' : 'UNVERIFIED';
    })();
    void removalPromise.catch(() => {});
    return removalPromise;
  };
  const finishAfterDeadline = async (promise, milliseconds, code) => {
    try {
      return await operation.wait(promise);
    } catch (error) {
      if (!rememberDeadlineFailure(error)) throw fixedFailure(code);
      if (!await bounded(promise, milliseconds)) throw fixedFailure(code);
      try {
        return await promise;
      } catch {
        throw fixedFailure(code);
      }
    }
  };

  t.after(async () => {
    let afterFailure;
    if (ownerFallbackPromise !== undefined && !exactReaping) {
      if (await bounded(ownerFallbackPromise, 3_500)) {
        await ownerFallbackPromise;
        exactReaping = exactlyReaped();
      }
      if (!exactReaping) {
        afterFailure ??= fixedFailure('OWNER_MISMATCH_REAPING_RESIDUE_RETAINED');
      }
    }
    if (removalPromise !== undefined && !removalComplete) {
      if (await bounded(removalPromise, 2_500)) {
        try {
          removalComplete = await removalPromise === 'REMOVED_VERIFIED';
        } catch {
          afterFailure ??= fixedFailure('OWNER_MISMATCH_ROOT_RESIDUE_RETAINED');
        }
      }
      if (!removalComplete) {
        afterFailure ??= fixedFailure('OWNER_MISMATCH_ROOT_RESIDUE_RETAINED');
      }
    }
    if (afterFailure && deadlineFailure === undefined) throw afterFailure;
  });

  let workFailure;
  let cleanupFailure;
  try {
    const routingFixtureValue = await operation.wait(
      createRoutingRoot('fixed-payer-owner-mismatch-routing-', ownedRoots),
    );
    const firstRoot = await operation.wait(
      createPrivateRoot('fixed-payer-owner-mismatch-a-', ownedRoots),
    );
    childRoots.push(firstRoot);
    const secondRoot = await operation.wait(
      createPrivateRoot('fixed-payer-owner-mismatch-b-', ownedRoots),
    );
    childRoots.push(secondRoot);

    let payee;
    let accepted;
    let payloads;
    try {
      payee = syntheticKeyPair(247);
      accepted = requirement(payee.getAddress().toString());
      payloads = signedPayloadsByShard(routingFixtureValue.routing, accepted);
    } finally {
      payee?.clear();
    }
    const inputs = payloads.map(paymentPayload => ({
      paymentPayload,
      requirements: structuredClone(accepted),
      paymentRequired: paymentRequired(accepted),
    }));
    const identities = inputs.map(inputIdentity);
    const tickets = identities.map(identity => routingFixtureValue.routing.route(identity.payer));
    requireProof(tickets.length === 2 && tickets.every((ticket, index) =>
      Object.isFrozen(ticket) && ticket.version === 1 &&
      ticket.shardId === CONFIGURATION.shardIds[index]), 'OWNER_MISMATCH_ROUTES');
    requireProof(identities[0].payer !== identities[1].payer &&
      identities[0].transaction !== identities[1].transaction &&
      identities[0].authorizationKey !== identities[1].authorizationKey,
    'OWNER_MISMATCH_IDENTITIES');
    try {
      await operation.wait(Promise.all(inputs.map(input => preflightZenonPayment(
        input.paymentPayload,
        input.requirements,
        input.paymentRequired,
      ))));
    } catch (error) {
      if (rememberDeadlineFailure(error)) throw error;
      throw fixedFailure('OWNER_MISMATCH_FIXTURE_PREFLIGHT');
    }
    await operation.wait(Promise.all([
      writeSignedFixture(childRoots[0], payloads[0]),
      writeStartupFixture(childRoots[0], 'OWNER_MISMATCHED_PUBLICATION_OBSERVATION'),
      writeSignedFixture(childRoots[1], payloads[1]),
    ]));

    ({ owner } = createOfflineOwner(
      routingFixtureValue.routing,
      payloads,
      childRoots,
      { requestTimeoutMs: 5_000 },
    ));
    originalStart = owner.start;
    originalShutdown = owner.shutdown;
    startingPromise = originalStart();
    requireProof(originalStart() === startingPromise, 'OWNER_MISMATCH_START_NOT_MEMOIZED');
    facade = await operation.wait(startingPromise);
    originalRetire = facade.retire;
    requireProof(originalStart() === startingPromise &&
      await operation.wait(originalStart()) === facade,
    'OWNER_MISMATCH_FACADE_NOT_MEMOIZED');
    const started = owner.status();
    requireProof(started.phase === 'READY' && started.startedChildren === 2 &&
      started.dispatcherExposed === true && started.cleanupUncertain === false &&
      started.children.length === 2 && started.children.every(child =>
        child.ready && child.committed && child.stdoutBoundary && child.stderrBoundary &&
        !child.exitObserved && !child.closeObserved), 'OWNER_MISMATCH_STARTUP');

    const settlement = await operation.wait(facade.settle(
      inputs[0].paymentPayload,
      inputs[0].requirements,
      inputs[0].paymentRequired,
    ));
    requireProof(isDeepStrictEqual({ ...settlement }, unknownResult(inputs[0])),
      'OWNER_MISMATCH_SETTLEMENT');
    const quarantined = owner.status();
    requireProof(quarantined.phase === 'QUARANTINED' &&
      quarantined.startedChildren === 2 && quarantined.dispatcherExposed === true &&
      quarantined.cleanupUncertain === false && quarantined.children.length === 2,
    'OWNER_MISMATCH_QUARANTINE');
    const quarantinedRoutes = facade.retirementStatus();
    requireProof(isDeepStrictEqual(quarantinedRoutes.map(route => ({
      shardId: route.shardId,
      generation: route.generation,
      quarantined: route.quarantined,
    })), CONFIGURATION.shardIds.map((shardId, index) => ({
      shardId,
      generation: index === 0 ? 'fixture-generation-a' : 'fixture-generation-b',
      quarantined: true,
    }))), 'OWNER_MISMATCH_DISPATCHER_QUARANTINE');
    requireProof(originalStart() === startingPromise &&
      await operation.wait(originalStart()) === facade &&
      owner.status().startedChildren === 2 && !Object.hasOwn(owner, 'restart'),
    'OWNER_MISMATCH_NO_RESPAWN');

    await operation.wait(assert.rejects(
      facade.settle(
        inputs[1].paymentPayload,
        inputs[1].requirements,
        inputs[1].paymentRequired,
      ),
      rejectsWith(DISPATCH_CODES.RETIREMENT_STARTED),
    ));
    await operation.wait(assert.rejects(
      facade.markDeliveryPending(settlement, inputs[0].requirements),
      rejectsWith(DISPATCH_CODES.RETIREMENT_STARTED),
    ));

    retirementPromise = originalRetire();
    requireProof(originalRetire() === retirementPromise,
      'OWNER_MISMATCH_RETIRE_NOT_MEMOIZED');
    shutdownPromise = originalShutdown();
    requireProof(originalShutdown() === shutdownPromise,
      'OWNER_MISMATCH_SHUTDOWN_NOT_MEMOIZED');
    beginOwnerClosure();
    const [retired, shutdown] = await operation.wait(ownerClosurePromise);
    requireProof(isDeepStrictEqual(retired, { retired: true }) &&
      isDeepStrictEqual(shutdown, {
        closed: true,
        exactReaping: true,
        quarantined: true,
        markerDisposition: 'NOT_REMOVED',
        rootDisposition: 'NOT_REMOVED',
      }), 'OWNER_MISMATCH_RETIREMENT_RESULT');
    const reaped = owner.status();
    const finalRoutes = facade.retirementStatus();
    requireProof(reaped.phase === 'QUARANTINED' && reaped.startedChildren === 2 &&
      reaped.dispatcherExposed === true && reaped.cleanupUncertain === false &&
      reaped.children.length === 2 &&
      reaped.children.every(child => child.exitObserved && child.closeObserved) &&
      finalRoutes.length === 2 && finalRoutes.every(route =>
        route.quarantined && route.exitObserved && route.closeObserved),
    'OWNER_MISMATCH_EXACT_REAPING');
    exactReaping = true;

    for (const root of childRoots) {
      requireProof(
        await assertRetainedStartupClaim(root, STARTUP_CLAIM.REQUIRED) ===
          STARTUP_CLAIM.RETAINED,
        'OWNER_MISMATCH_MARKER_RETAINED',
      );
    }
    const snapshots = await operation.wait(Promise.all(childRoots.map(root =>
      new SettlementJournal({
        directory: join(root, 'journal'),
        allowedRoot: root,
        existingOnly: true,
      }).list({ includeTombstones: true }))));
    requireProof(snapshots[0].records.length === 1 && snapshots[0].tombstones.length === 0 &&
      snapshots[1].records.length === 0 && snapshots[1].tombstones.length === 0,
    'OWNER_MISMATCH_JOURNAL_CARDINALITY');
    const record = snapshots[0].records[0];
    const exactPayment = retainedAttempt(inputs[0]);
    const permittedEvidenceStates = new Set([
      'VALIDATED',
      'SUBMISSION_ACKNOWLEDGED',
      'SUBMISSION_OUTCOME_UNKNOWN',
      'MOMENTUM_INCLUDED',
    ]);
    requireProof(Object.entries(exactPayment).every(([field, value]) =>
      isDeepStrictEqual(record[field], value)) &&
      permittedEvidenceStates.has(record.evidenceState) &&
      record.deliveryState === 'NONE' && record.cachedResponse === null &&
      snapshots.every(snapshot => snapshot.records.every(candidate =>
        candidate.deliveryState !== 'DELIVERED' && candidate.cachedResponse === null)) &&
      record.payer === identities[0].payer && record.payer !== identities[1].payer,
    'OWNER_MISMATCH_JOURNAL_BINDING');

    const removalResult = await operation.wait(beginRootRemoval());
    requireProof(removalResult === 'REMOVED_VERIFIED', removalResult === 'TIMEOUT'
      ? 'OWNER_MISMATCH_ROOT_CLEANUP_TIMEOUT_RESIDUE_RETAINED'
      : 'OWNER_MISMATCH_ROOT_CLEANUP_FAILED_RESIDUE_RETAINED');
    removalComplete = true;
  } catch (error) {
    rememberDeadlineFailure(error);
    workFailure = error?.name === 'FixedPayerSettlementTestError'
      ? error
      : fixedFailure('OWNER_MISMATCH_PROOF');
  } finally {
    if (owner !== undefined && !exactReaping) {
      try {
        beginOwnerClosure();
        await finishAfterDeadline(
          ownerFallbackPromise,
          3_500,
          'OWNER_MISMATCH_REAPING_RESIDUE_RETAINED',
        );
        exactReaping = exactlyReaped();
        if (!exactReaping) {
          throw fixedFailure('OWNER_MISMATCH_REAPING_RESIDUE_RETAINED');
        }
      } catch (error) {
        cleanupFailure ??= error?.name === 'FixedPayerSettlementTestError'
          ? error
          : fixedFailure('OWNER_MISMATCH_REAPING_RESIDUE_RETAINED');
      }
    }
    if ((owner === undefined || exactReaping) && ownedRoots.length > 0 && !removalComplete) {
      try {
        const disposition = await finishAfterDeadline(
          beginRootRemoval(),
          2_500,
          'OWNER_MISMATCH_ROOT_RESIDUE_RETAINED',
        );
        removalComplete = disposition === 'REMOVED_VERIFIED';
        if (!removalComplete) throw fixedFailure('OWNER_MISMATCH_ROOT_RESIDUE_RETAINED');
      } catch (error) {
        cleanupFailure ??= error?.name === 'FixedPayerSettlementTestError'
          ? error
          : fixedFailure('OWNER_MISMATCH_ROOT_RESIDUE_RETAINED');
      }
    }
    if (!deadlineAdjudicated) {
      deadlineAdjudicated = true;
      try {
        operation.close();
      } catch (error) {
        if (!rememberDeadlineFailure(error)) {
          cleanupFailure ??= fixedFailure('OWNER_MISMATCH_DEADLINE_ADJUDICATION');
        }
      }
    }
  }
  if (deadlineFailure) throw deadlineFailure;
  if (cleanupFailure) throw cleanupFailure;
  if (workFailure) throw workFailure;
});

test('owner-returned facade settles both fixed payers, delivers, and replays cached responses', {
  timeout: 20_000,
}, async t => {
  const operation = createOperationDeadline(12_000);
  const ownedRoots = [];
  const childRoots = [];
  let owner;
  let facade;
  let retirementPromise;
  let shutdownPromise;
  let exactReaping = false;
  let removalPromise;
  let removalComplete = false;
  let operationClosed = false;
  const verifyRemovedRoots = async () => {
    const absent = await operation.wait(Promise.all(ownedRoots.map(async root => {
      try {
        await lstat(root);
        return false;
      } catch (error) {
        return error?.code === 'ENOENT';
      }
    })));
    requireProof(absent.every(Boolean), 'OWNER_FACADE_ROOT_CLEANUP_UNVERIFIED');
    removalComplete = true;
  };
  t.after(async () => {
    let afterFailure;
    if (shutdownPromise !== undefined && !exactReaping &&
        await bounded(shutdownPromise, 2_500)) {
      try {
        await shutdownPromise;
        exactReaping = owner.status().children.every(child =>
          child.exitObserved && child.closeObserved);
      } catch {
        afterFailure = fixedFailure('OWNER_FACADE_SHUTDOWN_RESIDUE_RETAINED');
      }
    }
    if (removalPromise !== undefined && !removalComplete &&
        await bounded(removalPromise, 2_500)) {
      try {
        const disposition = await removalPromise;
        if (disposition === 'REMOVED') await verifyRemovedRoots();
      } catch (error) {
        afterFailure ??= error;
      }
    }
    if (removalPromise !== undefined && !removalComplete) {
      afterFailure ??= fixedFailure('OWNER_FACADE_ROOT_RESIDUE_RETAINED');
    }
    if (removalComplete && !operationClosed) {
      try {
        operation.close();
        operationClosed = true;
      } catch (error) {
        afterFailure ??= error;
      }
    }
    if (afterFailure) throw afterFailure;
  });

  let workFailure;
  let cleanupFailure;
  try {
    const routingFixtureValue = await operation.wait(
      createRoutingRoot('fixed-payer-owner-facade-routing-', ownedRoots),
    );
    const firstRoot = await operation.wait(
      createPrivateRoot('fixed-payer-owner-facade-a-', ownedRoots),
    );
    childRoots.push(firstRoot);
    const secondRoot = await operation.wait(
      createPrivateRoot('fixed-payer-owner-facade-b-', ownedRoots),
    );
    childRoots.push(secondRoot);

    let payee;
    let accepted;
    let payloads;
    try {
      payee = syntheticKeyPair(249);
      accepted = requirement(payee.getAddress().toString());
      payloads = signedPayloadsByShard(routingFixtureValue.routing, accepted);
    } finally {
      payee?.clear();
    }
    const tickets = payloads.map(payload =>
      routingFixtureValue.routing.route(payload.payload.transaction.address));
    assert.deepEqual(tickets.map(ticket => ({
      frozen: Object.isFrozen(ticket),
      version: ticket.version,
      shardId: ticket.shardId,
    })), [
      { frozen: true, version: 1, shardId: 'payer-shard-a' },
      { frozen: true, version: 1, shardId: 'payer-shard-b' },
    ]);
    await operation.wait(Promise.all(payloads.map(payload => preflightZenonPayment(
      payload,
      accepted,
      paymentRequired(accepted),
    ))));
    await operation.wait(writeSignedFixture(childRoots[0], payloads[0]));
    await operation.wait(writeStartupFixture(childRoots[0], 'OWNER_FACADE_SUCCESS'));
    await operation.wait(writeSignedFixture(childRoots[1], payloads[1]));
    await operation.wait(writeStartupFixture(childRoots[1], 'OWNER_FACADE_SUCCESS'));

    ({ owner } = createOfflineOwner(
      routingFixtureValue.routing,
      payloads,
      childRoots,
      { requestTimeoutMs: 5_000 },
    ));
    const starting = owner.start();
    assert.equal(owner.start(), starting);
    facade = await operation.wait(starting);
    assert.equal(owner.start(), starting);
    assert.equal(await operation.wait(owner.start()), facade);
    const started = owner.status();
    assert.equal(started.phase, 'READY');
    assert.equal(started.startedChildren, 2);
    assert.equal(started.dispatcherExposed, true);
    assert.equal(started.children.every(child => child.ready && child.committed &&
      child.stdoutBoundary && child.stderrBoundary && !child.exitObserved &&
      !child.closeObserved), true);

    const inputs = payloads.map(paymentPayload => ({
      paymentPayload,
      requirements: paymentPayload.accepted,
      paymentRequired: paymentRequired(paymentPayload.accepted),
    }));
    const identities = inputs.map(inputIdentity);
    const included = await operation.wait(Promise.all(inputs.map(input => facade.settle(
      input.paymentPayload,
      input.requirements,
      input.paymentRequired,
    ))));
    included.forEach((result, index) => {
      assert.deepEqual(Object.keys(result), [
        'success',
        'network',
        'transaction',
        'payer',
        'state',
        'authorizationKey',
        'deliveryState',
      ]);
      assert.deepEqual({ ...result }, {
        success: true,
        network: inputs[index].requirements.network,
        transaction: identities[index].transaction,
        payer: identities[index].payer,
        state: 'MOMENTUM_INCLUDED',
        authorizationKey: identities[index].authorizationKey,
        deliveryState: 'NONE',
      });
    });

    const cachedResponses = included.map((result, index) => ({
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: { ok: true, proof: 'owner-returned-facade', index, payer: result.payer },
    }));
    const pending = await operation.wait(Promise.all(included.map((result, index) =>
      facade.markDeliveryPending(result, inputs[index].requirements))));
    pending.forEach((result, index) => {
      assert.deepEqual(result, {
        authorizationKey: identities[index].authorizationKey,
        payer: identities[index].payer,
        transactionHash: identities[index].transaction,
        deliveryState: 'DELIVERY_PENDING',
        deliveryClaimed: true,
      });
    });
    const delivered = await operation.wait(Promise.all(included.map((result, index) =>
      facade.markDelivered(result, cachedResponses[index]))));
    delivered.forEach((result, index) => {
      assert.deepEqual(result, {
        authorizationKey: identities[index].authorizationKey,
        payer: identities[index].payer,
        transactionHash: identities[index].transaction,
        deliveryState: 'DELIVERED',
        cachedResponse: cachedResponses[index],
      });
    });

    const replayInputs = structuredClone(inputs);
    replayInputs.forEach((input, index) => {
      assert.equal(JSON.stringify(input), JSON.stringify(inputs[index]));
    });
    const replayed = await operation.wait(Promise.all(replayInputs.map(input => facade.settle(
      input.paymentPayload,
      input.requirements,
      input.paymentRequired,
    ))));
    replayed.forEach((result, index) => {
      assert.deepEqual({ ...result }, {
        success: true,
        network: inputs[index].requirements.network,
        transaction: identities[index].transaction,
        payer: identities[index].payer,
        state: 'MOMENTUM_INCLUDED',
        authorizationKey: identities[index].authorizationKey,
        deliveryState: 'DELIVERED',
        cachedResponse: cachedResponses[index],
      });
      assert.deepEqual(result.cachedResponse, delivered[index].cachedResponse);
    });
    assert.equal(owner.start(), starting);
    assert.equal(owner.status().startedChildren, 2);
    assert.deepEqual(facade.retirementStatus(), tickets.map((ticket, index) => ({
      shardId: ticket.shardId,
      generation: index === 0 ? 'fixture-generation-a' : 'fixture-generation-b',
      quarantined: false,
      exitObserved: false,
      closeObserved: false,
    })));

    retirementPromise = facade.retire();
    assert.equal(facade.retire(), retirementPromise);
    shutdownPromise = owner.shutdown();
    assert.equal(owner.shutdown(), shutdownPromise);
    const [retired, shutdown] = await operation.wait(Promise.all([
      retirementPromise,
      shutdownPromise,
    ]));
    assert.deepEqual(retired, { retired: true });
    assert.deepEqual(shutdown, {
      closed: true,
      exactReaping: true,
      quarantined: false,
      markerDisposition: 'NOT_REMOVED',
      rootDisposition: 'NOT_REMOVED',
    });
    const closed = owner.status();
    assert.equal(closed.phase, 'CLOSED');
    assert.equal(closed.startedChildren, 2);
    assert.equal(closed.dispatcherExposed, true);
    assert.equal(closed.cleanupUncertain, false);
    assert.equal(closed.children.every(child => child.exitObserved && child.closeObserved), true);
    exactReaping = true;

    const records = await operation.wait(Promise.all(childRoots.map(async (root, index) => {
      const marker = await lstat(join(root, FIXED_PAYER_SETTLEMENT_STARTUP_MARKER_FILE));
      requireProof(marker.isFile() && marker.nlink === 1 &&
        (marker.mode & 0o777) === 0o600, 'OWNER_FACADE_MARKER');
      const snapshot = await new SettlementJournal({
        directory: join(root, 'journal'),
        allowedRoot: root,
        existingOnly: true,
      }).list({ includeTombstones: true });
      requireProof(snapshot.records.length === 1 && snapshot.tombstones.length === 0,
        'OWNER_FACADE_JOURNAL_CARDINALITY');
      const record = snapshot.records[0];
      const expected = retainedAttempt(inputs[index]);
      for (const [field, value] of Object.entries(expected)) {
        assert.deepEqual(record[field], value);
      }
      assert.equal(record.evidenceState, 'MOMENTUM_INCLUDED');
      assert.deepEqual(record.momentumEvidence.confirmationDetail, {
        numConfirmations: 1,
        momentumHeight: 11,
        momentumHash: sdk.Hash.digest(
          Buffer.from('synthetic inclusion momentum'),
        ).toString(),
        momentumTimestamp: 1,
      });
      assert.equal(record.deliveryState, 'DELIVERED');
      assert.deepEqual(record.cachedResponse, cachedResponses[index]);
      return record;
    })));
    requireProof(records[0].payer !== records[1].payer &&
      records[0].transactionHash !== records[1].transactionHash,
    'OWNER_FACADE_JOURNAL_ISOLATION');

    removalPromise = removeOwnedRoots(ownedRoots);
    const disposition = await operation.wait(removalPromise);
    requireProof(disposition === 'REMOVED', disposition === 'TIMEOUT'
      ? 'OWNER_FACADE_ROOT_CLEANUP_TIMEOUT_RESIDUE_RETAINED'
      : 'OWNER_FACADE_ROOT_CLEANUP_REJECTED_RESIDUE_RETAINED');
    await verifyRemovedRoots();
    operation.close();
    operationClosed = true;
  } catch (error) {
    workFailure = error?.name === 'FixedPayerSettlementTestError'
      ? error
      : fixedFailure('OWNER_FACADE_SUCCESS_PROOF');
  } finally {
    if (owner !== undefined && !exactReaping) {
      try {
        if (facade !== undefined && retirementPromise === undefined) {
          retirementPromise = facade.retire();
          void retirementPromise.catch(() => {});
        }
        if (shutdownPromise === undefined) {
          shutdownPromise = owner.shutdown();
          void shutdownPromise.catch(() => {});
        }
        const closing = retirementPromise === undefined
          ? shutdownPromise
          : Promise.all([retirementPromise, shutdownPromise]);
        await operation.wait(closing);
        exactReaping = owner.status().children.every(child =>
          child.exitObserved && child.closeObserved);
        if (!exactReaping) throw fixedFailure('OWNER_FACADE_EXACT_REAPING');
      } catch {
        cleanupFailure ??= fixedFailure('OWNER_FACADE_SHUTDOWN_RESIDUE_RETAINED');
      }
    }
    if ((owner === undefined || exactReaping) && removalPromise === undefined &&
        ownedRoots.length > 0) {
      removalPromise = removeOwnedRoots(ownedRoots);
      void removalPromise.catch(() => {});
    }
    if (removalPromise !== undefined && !removalComplete) {
      try {
        const disposition = await operation.wait(removalPromise);
        if (disposition !== 'REMOVED') {
          throw fixedFailure('OWNER_FACADE_ROOT_RESIDUE_RETAINED');
        }
        await verifyRemovedRoots();
      } catch {
        cleanupFailure ??= fixedFailure('OWNER_FACADE_ROOT_RESIDUE_RETAINED');
      }
    }
    if (removalComplete && !operationClosed) {
      try {
        operation.close();
        operationClosed = true;
      } catch (error) {
        cleanupFailure ??= error;
      }
    }
  }
  if (cleanupFailure) throw cleanupFailure;
  if (workFailure) throw workFailure;
});

async function runOwnedDualPaymentProof(t, { staleSecond }) {
  const proof = staleSecond ? 'OWNER_STALE_SUCCESSOR' : 'OWNER_DUAL_PAYMENT';
  const operation = createOperationDeadline(18_000);
  const ownedRoots = [];
  const childRoots = [];
  let owner;
  let facade;
  let originalStart;
  let originalRetire;
  let originalShutdown;
  let startingPromise;
  let retirementPromise;
  let shutdownPromise;
  let ownerClosurePromise;
  let ownerFallbackPromise;
  let exactReaping = false;
  let removalPromise;
  let removalComplete = false;
  let deadlineFailure;
  let deadlineAdjudicated = false;

  const isDeadlineFailure = error =>
    error?.name === 'FixedPayerSettlementTestError' &&
    error?.message === 'WHOLE_OPERATION_TIMEOUT';
  const rememberDeadlineFailure = error => {
    if (!isDeadlineFailure(error)) return false;
    deadlineFailure ??= error;
    return true;
  };
  const exactlyReaped = () => {
    if (owner === undefined) return true;
    try {
      const status = owner.status();
      return status.cleanupUncertain === false && status.startedChildren === 2 &&
        status.children.length === 2 &&
        status.children.every(child => child.exitObserved && child.closeObserved);
    } catch {
      return false;
    }
  };
  const beginOwnerClosure = () => {
    if (owner === undefined) return undefined;
    if (facade !== undefined && retirementPromise === undefined) {
      try {
        retirementPromise = originalRetire();
      } catch {
        retirementPromise = Promise.reject(fixedFailure(`${proof}_RETIREMENT`));
      }
      void retirementPromise.catch(() => {});
    }
    if (shutdownPromise === undefined) {
      try {
        shutdownPromise = originalShutdown();
      } catch {
        shutdownPromise = Promise.reject(fixedFailure(`${proof}_SHUTDOWN`));
      }
      void shutdownPromise.catch(() => {});
    }
    if (ownerClosurePromise === undefined) {
      const captured = [
        ...(retirementPromise === undefined ? [] : [retirementPromise]),
        shutdownPromise,
      ];
      ownerClosurePromise = Promise.all(captured);
      void ownerClosurePromise.catch(() => {});
      ownerFallbackPromise = Promise.allSettled(captured);
    }
    return ownerClosurePromise;
  };
  const beginRootRemoval = () => {
    requireProof(owner === undefined || exactReaping, `${proof}_REMOVAL_BEFORE_REAP`);
    if (removalPromise !== undefined) return removalPromise;
    const targets = Object.freeze([...ownedRoots]);
    removalPromise = (async () => {
      const disposition = await removeOwnedRoots(targets);
      if (disposition !== 'REMOVED') return disposition;
      const absent = await Promise.all(targets.map(async root => {
        try {
          await lstat(root);
          return false;
        } catch (error) {
          return error?.code === 'ENOENT';
        }
      }));
      return absent.every(Boolean) ? 'REMOVED_VERIFIED' : 'UNVERIFIED';
    })();
    void removalPromise.catch(() => {});
    return removalPromise;
  };
  const finishAfterDeadline = async (promise, milliseconds, code) => {
    try {
      return await operation.wait(promise);
    } catch (error) {
      if (!rememberDeadlineFailure(error)) throw fixedFailure(code);
      if (!await bounded(promise, milliseconds)) throw fixedFailure(code);
      try {
        return await promise;
      } catch {
        throw fixedFailure(code);
      }
    }
  };

  t.after(async () => {
    let afterFailure;
    if (ownerFallbackPromise !== undefined && !exactReaping) {
      if (await bounded(ownerFallbackPromise, 3_500)) {
        await ownerFallbackPromise;
        exactReaping = exactlyReaped();
      }
      if (!exactReaping) afterFailure ??= fixedFailure(`${proof}_REAP_RESIDUE_RETAINED`);
    }
    if (removalPromise !== undefined && !removalComplete) {
      if (await bounded(removalPromise, 2_500)) {
        try {
          removalComplete = await removalPromise === 'REMOVED_VERIFIED';
        } catch {
          afterFailure ??= fixedFailure(`${proof}_ROOT_RESIDUE_RETAINED`);
        }
      }
      if (!removalComplete) afterFailure ??= fixedFailure(`${proof}_ROOT_RESIDUE_RETAINED`);
    }
    if (afterFailure && deadlineFailure === undefined) throw afterFailure;
  });

  let workFailure;
  let cleanupFailure;
  try {
    const routingFixtureValue = await operation.wait(createRoutingRoot(
      staleSecond
        ? 'fixed-payer-stale-successor-routing-'
        : 'fixed-payer-dual-payment-routing-',
      ownedRoots,
    ));
    const firstRoot = await operation.wait(createPrivateRoot(
      staleSecond ? 'fixed-payer-stale-successor-a-' : 'fixed-payer-dual-payment-a-',
      ownedRoots,
    ));
    childRoots.push(firstRoot);
    const secondRoot = await operation.wait(createPrivateRoot(
      staleSecond ? 'fixed-payer-stale-successor-b-' : 'fixed-payer-dual-payment-b-',
      ownedRoots,
    ));
    childRoots.push(secondRoot);

    let payee;
    let accepted;
    let payloadPairs;
    try {
      payee = syntheticKeyPair(staleSecond ? 245 : 246);
      accepted = requirement(payee.getAddress().toString());
      payloadPairs = signedDualPayloadsByShard(
        routingFixtureValue.routing,
        accepted,
        { staleSecond },
      );
    } finally {
      payee?.clear();
    }
    const inputs = payloadPairs.map(pair => pair.map(fixtureInput));
    const identities = inputs.map(pair => pair.map(inputIdentity));
    const flatIdentities = identities.flat();
    const emptyHash = sdk.EMPTY_HASH.toString();
    payloadPairs.forEach((pair, payerIndex) => {
      const first = pair[0].payload.transaction;
      const second = pair[1].payload.transaction;
      requireProof(first.address === second.address && first.height === 1 &&
        first.previousHash === emptyHash && second.height === 2 &&
        second.previousHash === (staleSecond ? emptyHash : first.hash) &&
        pair[0].accepted.network === pair[1].accepted.network &&
        pair[0].payload.intentDigest !== pair[1].payload.intentDigest &&
        identities[payerIndex][0].transaction !== identities[payerIndex][1].transaction &&
        identities[payerIndex][0].authorizationKey !==
          identities[payerIndex][1].authorizationKey,
      `${proof}_SEQUENCE_BINDING`);
      const ticket = routingFixtureValue.routing.route(first.address);
      requireProof(Object.isFrozen(ticket) && ticket.version === 1 &&
        ticket.shardId === CONFIGURATION.shardIds[payerIndex], `${proof}_ROUTE`);
    });
    requireProof(new Set(payloadPairs.map(pair => pair[0].payload.transaction.address)).size === 2 &&
      new Set(flatIdentities.map(identity => identity.transaction)).size === 4 &&
      new Set(flatIdentities.map(identity => identity.authorizationKey)).size === 4 &&
      flatIdentities.every(identity => identity.payer.length > 0), `${proof}_IDENTITIES`);
    try {
      await operation.wait(Promise.all(inputs.flat().map(input => preflightZenonPayment(
        input.paymentPayload,
        input.requirements,
        input.paymentRequired,
      ))));
    } catch (error) {
      if (rememberDeadlineFailure(error)) throw error;
      throw fixedFailure(`${proof}_PREFLIGHT`);
    }
    await operation.wait(Promise.all(childRoots.flatMap((root, index) => [
      writeSignedFixture(root, dualPaymentFixture(payloadPairs[index])),
      writeStartupFixture(root, DUAL_PAYMENT_STARTUP_MODE),
    ])));

    ({ owner } = createOfflineOwner(
      routingFixtureValue.routing,
      payloadPairs.map(pair => pair[0]),
      childRoots,
      { requestTimeoutMs: 5_000 },
    ));
    originalStart = owner.start;
    originalShutdown = owner.shutdown;
    startingPromise = originalStart();
    requireProof(originalStart() === startingPromise, `${proof}_START_NOT_MEMOIZED`);
    facade = await operation.wait(startingPromise);
    originalRetire = facade.retire;
    requireProof(originalStart() === startingPromise &&
      await operation.wait(originalStart()) === facade, `${proof}_FACADE_NOT_MEMOIZED`);
    const started = owner.status();
    requireProof(started.phase === 'READY' && started.startedChildren === 2 &&
      started.dispatcherExposed === true && started.cleanupUncertain === false &&
      started.children.length === 2 && started.children.every(child =>
        child.ready && child.committed && child.stdoutBoundary && child.stderrBoundary &&
        !child.exitObserved && !child.closeObserved), `${proof}_STARTUP`);

    const readSnapshots = async expectedCount => Promise.all(childRoots.map(async root => {
      const journal = new SettlementJournal({
        directory: join(root, 'journal'),
        allowedRoot: root,
        existingOnly: true,
      });
      const listed = await journal.list({ includeTombstones: true });
      const loaded = await journal.load();
      requireProof(listed.records.length === expectedCount && listed.tombstones.length === 0 &&
        loaded.records.length === expectedCount &&
        isDeepStrictEqual(loaded.records, listed.records), `${proof}_JOURNAL_CARDINALITY`);
      return { revision: loaded.revision, records: listed.records };
    }));
    const requireExactRecord = (records, payerIndex, ordinal, cachedResponse) => {
      const identity = identities[payerIndex][ordinal];
      const record = records.find(candidate =>
        candidate.authorizationKey === identity.authorizationKey &&
        candidate.transactionHash === identity.transaction);
      requireProof(record !== undefined, `${proof}_JOURNAL_IDENTITY`);
      const expected = retainedAttempt(inputs[payerIndex][ordinal]);
      requireProof(Object.entries(expected).every(([field, value]) =>
        isDeepStrictEqual(record[field], value)) &&
        record.evidenceState === 'MOMENTUM_INCLUDED' &&
        record.deliveryState === 'DELIVERED' &&
        isDeepStrictEqual(record.cachedResponse, cachedResponse), `${proof}_JOURNAL_BINDING`);
      return record;
    };
    const cachedByOrdinal = [[], []];
    const settleAndDeliver = async ordinal => {
      const included = await operation.wait(Promise.all(inputs.map(pair => facade.settle(
        pair[ordinal].paymentPayload,
        pair[ordinal].requirements,
        pair[ordinal].paymentRequired,
      ))));
      included.forEach((result, payerIndex) => {
        const identity = identities[payerIndex][ordinal];
        requireProof(isDeepStrictEqual({ ...result }, {
          success: true,
          network: inputs[payerIndex][ordinal].requirements.network,
          transaction: identity.transaction,
          payer: identity.payer,
          state: 'MOMENTUM_INCLUDED',
          authorizationKey: identity.authorizationKey,
          deliveryState: 'NONE',
        }), `${proof}_INCLUDED`);
      });
      const pending = await operation.wait(Promise.all(included.map((result, payerIndex) =>
        facade.markDeliveryPending(result, inputs[payerIndex][ordinal].requirements))));
      pending.forEach((result, payerIndex) => {
        const identity = identities[payerIndex][ordinal];
        requireProof(isDeepStrictEqual(result, {
          authorizationKey: identity.authorizationKey,
          payer: identity.payer,
          transactionHash: identity.transaction,
          deliveryState: 'DELIVERY_PENDING',
          deliveryClaimed: true,
        }), `${proof}_DELIVERY_PENDING`);
      });
      const cachedResponses = included.map((result, payerIndex) => ({
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: {
          ok: true,
          proof: 'owner-dual-synthetic-payment',
          ordinal: ordinal + 1,
          payer: result.payer,
          transaction: result.transaction,
          authorizationKey: identities[payerIndex][ordinal].authorizationKey,
        },
      }));
      cachedByOrdinal[ordinal] = cachedResponses;
      const delivered = await operation.wait(Promise.all(included.map((result, payerIndex) =>
        facade.markDelivered(result, cachedResponses[payerIndex]))));
      delivered.forEach((result, payerIndex) => {
        const identity = identities[payerIndex][ordinal];
        requireProof(isDeepStrictEqual(result, {
          authorizationKey: identity.authorizationKey,
          payer: identity.payer,
          transactionHash: identity.transaction,
          deliveryState: 'DELIVERED',
          cachedResponse: cachedResponses[payerIndex],
        }), `${proof}_DELIVERED`);
        const expectedBytes = Buffer.from(JSON.stringify(cachedResponses[payerIndex]), 'utf8');
        const actualBytes = Buffer.from(JSON.stringify(result.cachedResponse), 'utf8');
        try {
          requireProof(actualBytes.equals(expectedBytes), `${proof}_CACHE_BYTES`);
        } finally {
          expectedBytes.fill(0);
          actualBytes.fill(0);
        }
      });
      return included;
    };

    await settleAndDeliver(0);
    const firstSnapshots = await operation.wait(readSnapshots(1));
    firstSnapshots.forEach((snapshot, payerIndex) => {
      requireExactRecord(snapshot.records, payerIndex, 0, cachedByOrdinal[0][payerIndex]);
    });

    let expectedFinalRecordCount;
    let finalSnapshotsBeforeReplay;
    if (!staleSecond) {
      await settleAndDeliver(1);
      expectedFinalRecordCount = 2;
      finalSnapshotsBeforeReplay = await operation.wait(readSnapshots(2));
      finalSnapshotsBeforeReplay.forEach((snapshot, payerIndex) => {
        requireExactRecord(snapshot.records, payerIndex, 0, cachedByOrdinal[0][payerIndex]);
        const secondRecord = requireExactRecord(
          snapshot.records,
          payerIndex,
          1,
          cachedByOrdinal[1][payerIndex],
        );
        requireProof(secondRecord.signedAccountBlock.height === 2 &&
          secondRecord.signedAccountBlock.previousHash ===
            identities[payerIndex][0].transaction, `${proof}_DURABLE_SEQUENCE`);
      });
      for (let ordinal = 0; ordinal < 2; ordinal += 1) {
        const replayed = await operation.wait(Promise.all(inputs.map(pair => facade.settle(
          structuredClone(pair[ordinal].paymentPayload),
          structuredClone(pair[ordinal].requirements),
          structuredClone(pair[ordinal].paymentRequired),
        ))));
        replayed.forEach((result, payerIndex) => {
          const identity = identities[payerIndex][ordinal];
          requireProof(isDeepStrictEqual({ ...result }, {
            success: true,
            network: inputs[payerIndex][ordinal].requirements.network,
            transaction: identity.transaction,
            payer: identity.payer,
            state: 'MOMENTUM_INCLUDED',
            authorizationKey: identity.authorizationKey,
            deliveryState: 'DELIVERED',
            cachedResponse: cachedByOrdinal[ordinal][payerIndex],
          }), `${proof}_REPLAY_BINDING`);
          const expectedBytes = Buffer.from(
            JSON.stringify(cachedByOrdinal[ordinal][payerIndex]),
            'utf8',
          );
          const actualBytes = Buffer.from(JSON.stringify(result.cachedResponse), 'utf8');
          try {
            requireProof(actualBytes.equals(expectedBytes), `${proof}_REPLAY_BYTES`);
          } finally {
            expectedBytes.fill(0);
            actualBytes.fill(0);
          }
        });
      }
    } else {
      expectedFinalRecordCount = 1;
      const refused = await operation.wait(facade.settle(
        inputs[0][1].paymentPayload,
        inputs[0][1].requirements,
        inputs[0][1].paymentRequired,
      ));
      const refusedIdentity = identities[0][1];
      const expectedRefusal = {
        success: false,
        network: inputs[0][1].requirements.network,
        transaction: refusedIdentity.transaction,
        payer: refusedIdentity.payer,
        errorReason: 'payment_settlement_failed',
        state: 'VALIDATED',
        authorizationKey: refusedIdentity.authorizationKey,
        retrySamePayment: false,
        deliveryState: 'NONE',
      };
      requireProof(isDeepStrictEqual({ ...refused }, expectedRefusal),
        `${proof}_TYPED_REFUSAL`);
      const repeated = await operation.wait(facade.settle(
        structuredClone(inputs[0][1].paymentPayload),
        structuredClone(inputs[0][1].requirements),
        structuredClone(inputs[0][1].paymentRequired),
      ));
      requireProof(isDeepStrictEqual({ ...repeated }, expectedRefusal),
        `${proof}_EXACT_RETRY_REFUSAL`);
      await operation.wait(assert.rejects(
        facade.settle(
          inputs[0][0].paymentPayload,
          inputs[0][0].requirements,
          inputs[0][0].paymentRequired,
        ),
        rejectsWith(DISPATCH_CODES.INVALID_REQUEST),
      ));
      const peerReplay = await operation.wait(facade.settle(
        structuredClone(inputs[1][0].paymentPayload),
        structuredClone(inputs[1][0].requirements),
        structuredClone(inputs[1][0].paymentRequired),
      ));
      requireProof(isDeepStrictEqual(peerReplay.cachedResponse, cachedByOrdinal[0][1]) &&
        peerReplay.deliveryState === 'DELIVERED', `${proof}_PEER_CACHE_REPLAY`);
      finalSnapshotsBeforeReplay = await operation.wait(readSnapshots(1));
      finalSnapshotsBeforeReplay.forEach((snapshot, payerIndex) => {
        requireExactRecord(snapshot.records, payerIndex, 0, cachedByOrdinal[0][payerIndex]);
        requireProof(snapshot.records.every(record =>
          record.transactionHash !== identities[payerIndex][1].transaction &&
          record.authorizationKey !== identities[payerIndex][1].authorizationKey &&
          record.cachedResponse !== null), `${proof}_NO_SECOND_RECORD`);
      });
    }

    const journalSnapshotsAfterReplay = await operation.wait(
      readSnapshots(expectedFinalRecordCount),
    );
    requireProof(isDeepStrictEqual(journalSnapshotsAfterReplay, finalSnapshotsBeforeReplay),
      `${proof}_REPLAY_MUTATED_JOURNAL`);
    const healthy = owner.status();
    requireProof(healthy.phase === 'READY' && healthy.startedChildren === 2 &&
      healthy.cleanupUncertain === false && healthy.children.every(child =>
        !child.exitObserved && !child.closeObserved) &&
      facade.retirementStatus().every(route => route.quarantined === false),
    `${proof}_TRANSPORT_HEALTH`);
    requireProof(originalStart() === startingPromise &&
      await operation.wait(originalStart()) === facade &&
      !Object.hasOwn(owner, 'restart'), `${proof}_SAME_GENERATION`);

    retirementPromise = originalRetire();
    requireProof(originalRetire() === retirementPromise, `${proof}_RETIRE_NOT_MEMOIZED`);
    shutdownPromise = originalShutdown();
    requireProof(originalShutdown() === shutdownPromise, `${proof}_SHUTDOWN_NOT_MEMOIZED`);
    beginOwnerClosure();
    const [retired, shutdown] = await operation.wait(ownerClosurePromise);
    requireProof(isDeepStrictEqual(retired, { retired: true }) &&
      isDeepStrictEqual(shutdown, {
        closed: true,
        exactReaping: true,
        quarantined: false,
        markerDisposition: 'NOT_REMOVED',
        rootDisposition: 'NOT_REMOVED',
      }), `${proof}_RETIREMENT_RESULT`);
    const closed = owner.status();
    requireProof(closed.phase === 'CLOSED' && closed.startedChildren === 2 &&
      closed.dispatcherExposed === true && closed.cleanupUncertain === false &&
      closed.children.length === 2 && closed.children.every(child =>
        child.exitObserved && child.closeObserved), `${proof}_EXACT_REAPING`);
    exactReaping = true;

    for (const root of childRoots) {
      requireProof(await assertRetainedStartupClaim(root, STARTUP_CLAIM.REQUIRED) ===
        STARTUP_CLAIM.RETAINED, `${proof}_MARKER_RETAINED`);
    }
    const finalSnapshots = await operation.wait(readSnapshots(expectedFinalRecordCount));
    requireProof(isDeepStrictEqual(finalSnapshots, journalSnapshotsAfterReplay),
      `${proof}_FINAL_JOURNAL_CHANGED`);

    const removalResult = await operation.wait(beginRootRemoval());
    requireProof(removalResult === 'REMOVED_VERIFIED', removalResult === 'TIMEOUT'
      ? `${proof}_ROOT_CLEANUP_TIMEOUT_RESIDUE_RETAINED`
      : `${proof}_ROOT_CLEANUP_FAILED_RESIDUE_RETAINED`);
    removalComplete = true;
  } catch (error) {
    rememberDeadlineFailure(error);
    workFailure = error?.name === 'FixedPayerSettlementTestError'
      ? error
      : fixedFailure(`${proof}_PROOF`);
  } finally {
    if (owner !== undefined && !exactReaping) {
      try {
        beginOwnerClosure();
        await finishAfterDeadline(
          ownerFallbackPromise,
          3_500,
          `${proof}_REAP_RESIDUE_RETAINED`,
        );
        exactReaping = exactlyReaped();
        if (!exactReaping) throw fixedFailure(`${proof}_REAP_RESIDUE_RETAINED`);
      } catch (error) {
        cleanupFailure ??= error?.name === 'FixedPayerSettlementTestError'
          ? error
          : fixedFailure(`${proof}_REAP_RESIDUE_RETAINED`);
      }
    }
    if (deadlineFailure === undefined && (owner === undefined || exactReaping) &&
        ownedRoots.length > 0 && !removalComplete) {
      try {
        const disposition = await finishAfterDeadline(
          beginRootRemoval(),
          2_500,
          `${proof}_ROOT_RESIDUE_RETAINED`,
        );
        removalComplete = disposition === 'REMOVED_VERIFIED';
        if (!removalComplete) throw fixedFailure(`${proof}_ROOT_RESIDUE_RETAINED`);
      } catch (error) {
        cleanupFailure ??= error?.name === 'FixedPayerSettlementTestError'
          ? error
          : fixedFailure(`${proof}_ROOT_RESIDUE_RETAINED`);
      }
    }
    if (!deadlineAdjudicated) {
      deadlineAdjudicated = true;
      try {
        operation.close();
      } catch (error) {
        if (!rememberDeadlineFailure(error)) {
          cleanupFailure ??= fixedFailure(`${proof}_DEADLINE_ADJUDICATION`);
        }
      }
    }
  }
  if (deadlineFailure) throw deadlineFailure;
  if (cleanupFailure) throw cleanupFailure;
  if (workFailure) throw workFailure;
}

test('one owned generation publishes two linked synthetic payments per fixed payer', {
  timeout: 30_000,
}, async t => {
  await runOwnedDualPaymentProof(t, { staleSecond: false });
});

test('the evolving frontier rejects a stale synthetic successor before publication', {
  timeout: 30_000,
}, async t => {
  await runOwnedDualPaymentProof(t, { staleSecond: true });
});

test('owner-returned facade overlaps physical /paid delivery and replays both cached responses', {
  timeout: 40_000,
}, async t => {
  const operation = createOperationDeadline(18_000);
  const ownedRoots = [];
  const childRoots = [];
  const handlerCalls = [0, 0];
  const handlerArrivals = [false, false];
  const responseStates = ['PENDING', 'PENDING'];
  let resolveAllHandlers;
  const allHandlers = new Promise(resolvePromise => { resolveAllHandlers = resolvePromise; });
  let resolveHandlerBarrier;
  const handlerBarrier = new Promise(resolvePromise => { resolveHandlerBarrier = resolvePromise; });
  let handlerFailure;
  let handlerBarrierReleased = false;
  let handlerBarrierReleaseCount = 0;
  let identities = [];
  let expectedBodies = [];
  let owner;
  let facade;
  let startingPromise;
  let resourceServer;
  let resourceServerClosePromise;
  let serverCleanupPromise;
  let serverClosureComplete = false;
  let retirementPromise;
  let shutdownPromise;
  let ownerClosurePromise;
  let ownerFallbackPromise;
  let exactReaping = false;
  let removalPromise;
  let removalComplete = false;
  let deadlineFailure;
  let deadlineAdjudicated = false;

  const releaseHandlerBarrier = () => {
    requireProof(!handlerBarrierReleased, 'OWNER_HTTP_BARRIER_RELEASE_DUPLICATE');
    handlerBarrierReleased = true;
    handlerBarrierReleaseCount += 1;
    resolveHandlerBarrier();
  };
  const isDeadlineFailure = error =>
    error?.name === 'FixedPayerSettlementTestError' &&
    error?.message === 'WHOLE_OPERATION_TIMEOUT';
  const rememberDeadlineFailure = error => {
    if (!isDeadlineFailure(error)) return false;
    deadlineFailure ??= error;
    return true;
  };
  const exactlyReaped = () => {
    if (owner === undefined) return true;
    try {
      const status = owner.status();
      return status.cleanupUncertain === false &&
        status.children.length === status.startedChildren &&
        status.children.every(child => child.exitObserved && child.closeObserved);
    } catch {
      return false;
    }
  };
  const beginServerClosure = () => {
    if (resourceServer === undefined) return undefined;
    if (resourceServerClosePromise === undefined) {
      try {
        resourceServerClosePromise = resourceServer.close();
      } catch {
        resourceServerClosePromise = Promise.reject(fixedFailure('OWNER_HTTP_SERVER_CLOSE'));
      }
      void resourceServerClosePromise.catch(() => {});
    }
    if (serverCleanupPromise === undefined) {
      serverCleanupPromise = closeOwnedServer(resourceServer, {
        firstClosePromise: resourceServerClosePromise,
      });
      void serverCleanupPromise.catch(() => {});
    }
    return serverCleanupPromise;
  };
  const beginOwnerClosure = () => {
    if (owner === undefined) return undefined;
    if (facade !== undefined && retirementPromise === undefined) {
      try {
        retirementPromise = facade.retire();
      } catch {
        retirementPromise = Promise.reject(fixedFailure('OWNER_HTTP_RETIREMENT'));
      }
      void retirementPromise.catch(() => {});
    }
    if (shutdownPromise === undefined) {
      try {
        shutdownPromise = owner.shutdown();
      } catch {
        shutdownPromise = Promise.reject(fixedFailure('OWNER_HTTP_SHUTDOWN'));
      }
      void shutdownPromise.catch(() => {});
    }
    if (ownerClosurePromise === undefined) {
      const operations = [
        ...(retirementPromise === undefined ? [] : [retirementPromise]),
        shutdownPromise,
      ];
      ownerClosurePromise = Promise.all(operations);
      void ownerClosurePromise.catch(() => {});
      ownerFallbackPromise = Promise.allSettled(operations);
    }
    return ownerClosurePromise;
  };
  const beginRootRemoval = () => {
    requireProof(owner === undefined || exactReaping, 'OWNER_HTTP_ROOT_REMOVAL_BEFORE_REAP');
    if (removalPromise !== undefined) return removalPromise;
    const targets = [...ownedRoots];
    removalPromise = (async () => {
      const disposition = await removeOwnedRoots(targets);
      if (disposition !== 'REMOVED') return disposition;
      const absent = await Promise.all(targets.map(async root => {
        try {
          await lstat(root);
          return false;
        } catch (error) {
          return error?.code === 'ENOENT';
        }
      }));
      return absent.every(Boolean) ? 'REMOVED_VERIFIED' : 'UNVERIFIED';
    })();
    void removalPromise.catch(() => {});
    return removalPromise;
  };
  const finishAfterDeadline = async (promise, milliseconds, code) => {
    try {
      return await operation.wait(promise);
    } catch (error) {
      if (!rememberDeadlineFailure(error)) throw fixedFailure(code);
      if (!await bounded(promise, milliseconds)) throw fixedFailure(code);
      try {
        return await promise;
      } catch {
        throw fixedFailure(code);
      }
    }
  };
  const captureResponse = async response => {
    const bodyBytes = Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      bodyBytes,
      bodyText: bodyBytes.toString('utf8'),
      headers: {
        contentType: response.headers.get('content-type'),
        cacheControl: response.headers.get('cache-control'),
        vary: response.headers.get('vary'),
        paymentRequired: response.headers.get(HEADERS.PAYMENT_REQUIRED),
        paymentResponse: response.headers.get(HEADERS.PAYMENT_RESPONSE),
      },
    };
  };
  const verifyCapturedResponse = (captured, index) => {
    requireProof(captured.status === 200, 'OWNER_HTTP_STATUS');
    requireProof(captured.headers.contentType === 'application/json; charset=utf-8',
      'OWNER_HTTP_CONTENT_TYPE');
    requireProof(captured.headers.cacheControl === 'private, no-store, max-age=0',
      'OWNER_HTTP_CACHE_CONTROL');
    requireProof(captured.headers.vary === 'PAYMENT-SIGNATURE', 'OWNER_HTTP_VARY');
    requireProof(captured.headers.paymentRequired === null, 'OWNER_HTTP_REQUIRED_HEADER');
    requireProof(typeof captured.headers.paymentResponse === 'string',
      'OWNER_HTTP_RESPONSE_HEADER');
    let settlement;
    try {
      settlement = decodeB64Json(captured.headers.paymentResponse);
    } catch {
      throw fixedFailure('OWNER_HTTP_RESPONSE_HEADER');
    }
    requireProof(isDeepStrictEqual(settlement, {
      success: true,
      network: 'zenon:testnet',
      transaction: identities[index].transaction,
      payer: identities[index].payer,
      state: 'MOMENTUM_INCLUDED',
    }), 'OWNER_HTTP_RESPONSE_BINDING');
    const expectedText = JSON.stringify(expectedBodies[index], null, 2);
    const expectedBytes = Buffer.from(expectedText, 'utf8');
    try {
      requireProof(captured.bodyText === expectedText &&
        captured.bodyBytes.equals(expectedBytes), 'OWNER_HTTP_BODY_BINDING');
    } finally {
      expectedBytes.fill(0);
    }
  };

  t.after(async () => {
    let afterFailure;
    if (!handlerBarrierReleased) {
      try { releaseHandlerBarrier(); } catch { afterFailure = fixedFailure('OWNER_HTTP_BARRIER'); }
    }
    if (serverCleanupPromise !== undefined && !serverClosureComplete) {
      if (await bounded(serverCleanupPromise, 3_500)) {
        try {
          serverClosureComplete = await serverCleanupPromise === true;
        } catch {
          afterFailure ??= fixedFailure('OWNER_HTTP_SERVER_RESIDUE_RETAINED');
        }
      }
      if (!serverClosureComplete) {
        afterFailure ??= fixedFailure('OWNER_HTTP_SERVER_RESIDUE_RETAINED');
      }
    }
    if (ownerFallbackPromise !== undefined && !exactReaping) {
      if (await bounded(ownerFallbackPromise, 3_500)) {
        await ownerFallbackPromise;
        exactReaping = exactlyReaped();
      }
      if (!exactReaping) {
        afterFailure ??= fixedFailure('OWNER_HTTP_REAPING_RESIDUE_RETAINED');
      }
    }
    if (removalPromise !== undefined && !removalComplete) {
      if (await bounded(removalPromise, 2_500)) {
        try {
          removalComplete = await removalPromise === 'REMOVED_VERIFIED';
        } catch {
          afterFailure ??= fixedFailure('OWNER_HTTP_ROOT_RESIDUE_RETAINED');
        }
      }
      if (!removalComplete) {
        afterFailure ??= fixedFailure('OWNER_HTTP_ROOT_RESIDUE_RETAINED');
      }
    }
    if (afterFailure && deadlineFailure === undefined) throw afterFailure;
  });

  let workFailure;
  let cleanupFailure;
  try {
    const routingFixtureValue = await operation.wait(
      createRoutingRoot('fixed-payer-owner-http-routing-', ownedRoots),
    );
    const firstRoot = await operation.wait(
      createPrivateRoot('fixed-payer-owner-http-a-', ownedRoots),
    );
    childRoots.push(firstRoot);
    const secondRoot = await operation.wait(
      createPrivateRoot('fixed-payer-owner-http-b-', ownedRoots),
    );
    childRoots.push(secondRoot);

    let payee;
    let accepted;
    let payloads;
    try {
      payee = syntheticKeyPair(248);
      accepted = requirement(payee.getAddress().toString());
      payloads = signedPayloadsByShard(routingFixtureValue.routing, accepted);
    } finally {
      payee?.clear();
    }
    const inputs = payloads.map(paymentPayload => ({
      paymentPayload,
      requirements: structuredClone(accepted),
      paymentRequired: paymentRequired(accepted),
    }));
    identities = inputs.map(inputIdentity);
    const tickets = identities.map(identity => routingFixtureValue.routing.route(identity.payer));
    requireProof(tickets.length === 2 && tickets.every((ticket, index) =>
      Object.isFrozen(ticket) && ticket.version === 1 &&
      ticket.shardId === CONFIGURATION.shardIds[index]), 'OWNER_HTTP_ROUTING_TICKETS');
    requireProof(identities[0].payer !== identities[1].payer &&
      identities[0].transaction !== identities[1].transaction &&
      identities[0].authorizationKey !== identities[1].authorizationKey,
    'OWNER_HTTP_IDENTITIES_NOT_DISTINCT');
    try {
      await operation.wait(Promise.all(inputs.map(input => preflightZenonPayment(
        input.paymentPayload,
        input.requirements,
        input.paymentRequired,
      ))));
    } catch (error) {
      if (rememberDeadlineFailure(error)) throw error;
      throw fixedFailure('OWNER_HTTP_FIXTURE_PREFLIGHT');
    }
    await operation.wait(Promise.all([
      writeSignedFixture(childRoots[0], payloads[0]),
      writeStartupFixture(childRoots[0], 'OWNER_FACADE_SUCCESS'),
      writeSignedFixture(childRoots[1], payloads[1]),
      writeStartupFixture(childRoots[1], 'OWNER_FACADE_SUCCESS'),
    ]));

    ({ owner } = createOfflineOwner(
      routingFixtureValue.routing,
      payloads,
      childRoots,
      { requestTimeoutMs: 5_000 },
    ));
    startingPromise = owner.start();
    requireProof(owner.start() === startingPromise, 'OWNER_HTTP_START_NOT_MEMOIZED');
    facade = await operation.wait(startingPromise);
    requireProof(owner.start() === startingPromise &&
      await operation.wait(owner.start()) === facade, 'OWNER_HTTP_FACADE_NOT_MEMOIZED');
    const started = owner.status();
    requireProof(started.phase === 'READY' && started.startedChildren === 2 &&
      started.dispatcherExposed === true && started.cleanupUncertain === false &&
      started.children.every(child => child.ready && child.committed &&
        child.stdoutBoundary && child.stderrBoundary &&
        !child.exitObserved && !child.closeObserved), 'OWNER_HTTP_STARTUP');

    expectedBodies = identities.map((identity, index) => ({
      ok: true,
      proof: 'owner-returned-facade-physical-http',
      index,
      payer: identity.payer,
      transaction: identity.transaction,
    }));
    resourceServer = createResourceServer({
      facilitator: facade,
      requirement: accepted,
      advertisedBaseUrl: 'https://127.0.0.1',
      resourceHandler: async ({ settlement }) => {
        try {
          const index = identities.findIndex(identity =>
            settlement.payer === identity.payer &&
            settlement.transaction === identity.transaction);
          requireProof(index !== -1, 'OWNER_HTTP_HANDLER_IDENTITY');
          requireProof(isDeepStrictEqual(settlement, {
            success: true,
            network: 'zenon:testnet',
            transaction: identities[index].transaction,
            payer: identities[index].payer,
            state: 'MOMENTUM_INCLUDED',
          }), 'OWNER_HTTP_HANDLER_BINDING');
          handlerCalls[index] += 1;
          requireProof(handlerCalls[index] === 1 && !handlerArrivals[index],
            'OWNER_HTTP_HANDLER_REPLAY');
          handlerArrivals[index] = true;
          if (handlerArrivals.every(Boolean)) resolveAllHandlers();
          await handlerBarrier;
          return structuredClone(expectedBodies[index]);
        } catch (error) {
          handlerFailure ??= error?.name === 'FixedPayerSettlementTestError'
            ? error
            : fixedFailure('OWNER_HTTP_HANDLER');
          resolveAllHandlers();
          throw handlerFailure;
        }
      },
    });
    const listening = await operation.wait(resourceServer.listen());
    const responsePromises = inputs.map((input, index) => {
      const response = submit(listening.url, input.paymentPayload, operation.signal);
      void response.then(
        () => { responseStates[index] = 'FULFILLED'; },
        () => { responseStates[index] = 'REJECTED'; },
      );
      return response;
    });
    await operation.wait(allHandlers);
    if (handlerFailure) throw handlerFailure;
    requireProof(handlerArrivals.every(Boolean) &&
      isDeepStrictEqual(handlerCalls, [1, 1]), 'OWNER_HTTP_HANDLER_BARRIER');
    await operation.wait(new Promise(resolvePromise => setTimeout(resolvePromise, 25)));
    requireProof(responseStates.every(state => state === 'PENDING'),
      'OWNER_HTTP_RESPONSE_NOT_PENDING');

    const pendingRecords = await operation.wait(Promise.all(childRoots.map(async (root, index) => {
      const snapshot = await new SettlementJournal({
        directory: join(root, 'journal'),
        allowedRoot: root,
        existingOnly: true,
      }).list({ includeTombstones: true });
      requireProof(snapshot.records.length === 1 && snapshot.tombstones.length === 0,
        'OWNER_HTTP_PENDING_JOURNAL_CARDINALITY');
      const record = snapshot.records[0];
      const exactPayment = retainedAttempt(inputs[index]);
      requireProof(Object.entries(exactPayment).every(([field, value]) =>
        isDeepStrictEqual(record[field], value)) &&
        record.evidenceState === 'MOMENTUM_INCLUDED' &&
        record.deliveryState === 'DELIVERY_PENDING' &&
        record.cachedResponse === null, 'OWNER_HTTP_PENDING_JOURNAL_BINDING');
      return record;
    })));
    requireProof(pendingRecords[0].payer !== pendingRecords[1].payer &&
      pendingRecords[0].transactionHash !== pendingRecords[1].transactionHash,
    'OWNER_HTTP_PENDING_JOURNAL_ISOLATION');

    releaseHandlerBarrier();
    requireProof(handlerBarrierReleaseCount === 1, 'OWNER_HTTP_BARRIER_RELEASE_COUNT');
    const initialResponses = await operation.wait(Promise.all(responsePromises));
    const initialCaptures = await operation.wait(Promise.all(initialResponses.map(captureResponse)));
    initialCaptures.forEach(verifyCapturedResponse);

    const replayInputs = structuredClone(inputs);
    replayInputs.forEach((input, index) => {
      requireProof(input !== inputs[index] &&
        isDeepStrictEqual(input, inputs[index]) &&
        isDeepStrictEqual(inputIdentity(input), identities[index]),
      'OWNER_HTTP_REPLAY_CLONE');
    });
    const handlerCallsBeforeReplay = [...handlerCalls];
    const replayResponses = await operation.wait(Promise.all(replayInputs.map(input =>
      submit(listening.url, input.paymentPayload, operation.signal))));
    const replayCaptures = await operation.wait(Promise.all(replayResponses.map(captureResponse)));
    replayCaptures.forEach((captured, index) => {
      verifyCapturedResponse(captured, index);
      requireProof(captured.bodyText === initialCaptures[index].bodyText &&
        captured.bodyBytes.equals(initialCaptures[index].bodyBytes) &&
        isDeepStrictEqual(captured.headers, initialCaptures[index].headers),
      'OWNER_HTTP_REPLAY_NOT_BYTE_STABLE');
    });
    requireProof(isDeepStrictEqual(handlerCalls, handlerCallsBeforeReplay) &&
      isDeepStrictEqual(handlerCalls, [1, 1]), 'OWNER_HTTP_REPLAY_HANDLER_CALL');
    const replayed = owner.status();
    requireProof(owner.start() === startingPromise &&
      replayed.phase === 'READY' && replayed.startedChildren === 2 &&
      replayed.dispatcherExposed === true && replayed.cleanupUncertain === false &&
      replayed.children.every(child => !child.exitObserved && !child.closeObserved),
    'OWNER_HTTP_REPLAY_OWNER_HEALTH');

    beginServerClosure();
    serverClosureComplete = await operation.wait(serverCleanupPromise) === true;
    requireProof(serverClosureComplete, 'OWNER_HTTP_SERVER_CLOSE');

    retirementPromise = facade.retire();
    requireProof(facade.retire() === retirementPromise, 'OWNER_HTTP_RETIRE_NOT_MEMOIZED');
    shutdownPromise = owner.shutdown();
    requireProof(owner.shutdown() === shutdownPromise, 'OWNER_HTTP_SHUTDOWN_NOT_MEMOIZED');
    beginOwnerClosure();
    const [retired, shutdown] = await operation.wait(ownerClosurePromise);
    requireProof(isDeepStrictEqual(retired, { retired: true }) &&
      isDeepStrictEqual(shutdown, {
        closed: true,
        exactReaping: true,
        quarantined: false,
        markerDisposition: 'NOT_REMOVED',
        rootDisposition: 'NOT_REMOVED',
      }), 'OWNER_HTTP_RETIREMENT_RESULT');
    const closed = owner.status();
    requireProof(closed.phase === 'CLOSED' && closed.startedChildren === 2 &&
      closed.dispatcherExposed === true && closed.cleanupUncertain === false &&
      closed.children.length === 2 &&
      closed.children.every(child => child.exitObserved && child.closeObserved),
    'OWNER_HTTP_CLOSED');
    exactReaping = true;

    const expectedCachedResponses = expectedBodies.map(body => ({
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body,
    }));
    const deliveredRecords = await operation.wait(Promise.all(childRoots.map(async (root, index) => {
      const marker = await lstat(join(root, FIXED_PAYER_SETTLEMENT_STARTUP_MARKER_FILE));
      requireProof(marker.isFile() && !marker.isSymbolicLink() && marker.nlink === 1 &&
        marker.size === 0 && (marker.mode & 0o777) === 0o600,
      'OWNER_HTTP_MARKER_RETAINED');
      const snapshot = await new SettlementJournal({
        directory: join(root, 'journal'),
        allowedRoot: root,
        existingOnly: true,
      }).list({ includeTombstones: true });
      requireProof(snapshot.records.length === 1 && snapshot.tombstones.length === 0,
        'OWNER_HTTP_FINAL_JOURNAL_CARDINALITY');
      const record = snapshot.records[0];
      const exactPayment = retainedAttempt(inputs[index]);
      requireProof(Object.entries(exactPayment).every(([field, value]) =>
        isDeepStrictEqual(record[field], value)) &&
        record.evidenceState === 'MOMENTUM_INCLUDED' &&
        record.deliveryState === 'DELIVERED' &&
        isDeepStrictEqual(record.cachedResponse, expectedCachedResponses[index]),
      'OWNER_HTTP_FINAL_JOURNAL_BINDING');
      return record;
    })));
    requireProof(deliveredRecords[0].payer !== deliveredRecords[1].payer &&
      deliveredRecords[0].transactionHash !== deliveredRecords[1].transactionHash,
    'OWNER_HTTP_FINAL_JOURNAL_ISOLATION');

    const removalResult = await operation.wait(beginRootRemoval());
    requireProof(removalResult === 'REMOVED_VERIFIED', removalResult === 'TIMEOUT'
      ? 'OWNER_HTTP_ROOT_CLEANUP_TIMEOUT_RESIDUE_RETAINED'
      : 'OWNER_HTTP_ROOT_CLEANUP_FAILED_RESIDUE_RETAINED');
    removalComplete = true;
  } catch (error) {
    rememberDeadlineFailure(error);
    workFailure = error?.name === 'FixedPayerSettlementTestError'
      ? error
      : fixedFailure('OWNER_HTTP_PHYSICAL_PROOF');
  } finally {
    if (!handlerBarrierReleased) {
      try { releaseHandlerBarrier(); } catch {
        cleanupFailure ??= fixedFailure('OWNER_HTTP_BARRIER');
      }
    }
    if (resourceServer !== undefined && !serverClosureComplete) {
      try {
        beginServerClosure();
        serverClosureComplete = await finishAfterDeadline(
          serverCleanupPromise,
          3_500,
          'OWNER_HTTP_SERVER_RESIDUE_RETAINED',
        ) === true;
        if (!serverClosureComplete) throw fixedFailure('OWNER_HTTP_SERVER_RESIDUE_RETAINED');
      } catch (error) {
        cleanupFailure ??= error?.name === 'FixedPayerSettlementTestError'
          ? error
          : fixedFailure('OWNER_HTTP_SERVER_RESIDUE_RETAINED');
      }
    }
    if (owner !== undefined && !exactReaping) {
      try {
        beginOwnerClosure();
        await finishAfterDeadline(
          ownerFallbackPromise,
          3_500,
          'OWNER_HTTP_REAPING_RESIDUE_RETAINED',
        );
        exactReaping = exactlyReaped();
        if (!exactReaping) throw fixedFailure('OWNER_HTTP_REAPING_RESIDUE_RETAINED');
      } catch (error) {
        cleanupFailure ??= error?.name === 'FixedPayerSettlementTestError'
          ? error
          : fixedFailure('OWNER_HTTP_REAPING_RESIDUE_RETAINED');
      }
    }
    if ((owner === undefined || exactReaping) && ownedRoots.length > 0 && !removalComplete) {
      try {
        const disposition = await finishAfterDeadline(
          beginRootRemoval(),
          2_500,
          'OWNER_HTTP_ROOT_RESIDUE_RETAINED',
        );
        removalComplete = disposition === 'REMOVED_VERIFIED';
        if (!removalComplete) throw fixedFailure('OWNER_HTTP_ROOT_RESIDUE_RETAINED');
      } catch (error) {
        cleanupFailure ??= error?.name === 'FixedPayerSettlementTestError'
          ? error
          : fixedFailure('OWNER_HTTP_ROOT_RESIDUE_RETAINED');
      }
    }
    if (!deadlineAdjudicated) {
      deadlineAdjudicated = true;
      try {
        operation.close();
      } catch (error) {
        if (!rememberDeadlineFailure(error)) {
          cleanupFailure ??= fixedFailure('OWNER_HTTP_DEADLINE_ADJUDICATION');
        }
      }
    }
  }
  if (deadlineFailure) throw deadlineFailure;
  if (cleanupFailure) throw cleanupFailure;
  if (workFailure) throw workFailure;
});

test('real startup children preserve direct two-shard settlement and delivery without loopback', {
  timeout: 20_000,
}, async t => {
  const operation = createOperationDeadline(12_000);
  let routingRoot;
  const roots = [];
  const children = [];
  let dispatcher;
  let closeRequested = false;
  let shutdownComplete = false;
  let primaryShutdownPromise;
  let removalAttempted = false;
  let removalComplete = false;
  let primaryRemovalPromise;
  let operationClosed = false;
  t.after(async () => {
    let fallbackFailure;
    if (!shutdownComplete) {
      if (primaryShutdownPromise === undefined && dispatcher !== undefined) {
        try {
          const retirement = dispatcher.retire();
          let requestFailed = false;
          if (!closeRequested) {
            closeRequested = true;
            for (const child of children) {
              try { child.requestClose(); } catch { requestFailed = true; }
            }
          }
          if (requestFailed) fallbackFailure ??= fixedFailure('DIRECT_CHILD_CLOSE_REQUEST');
          primaryShutdownPromise = Promise.all([
            retirement,
            ...children.map(child => child.awaitClose()),
          ]);
          void primaryShutdownPromise.catch(() => {});
        } catch {
          fallbackFailure ??= fixedFailure('DIRECT_RETIREMENT');
        }
      }
      if (primaryShutdownPromise !== undefined &&
          await bounded(primaryShutdownPromise, 2_000)) {
        try {
          await primaryShutdownPromise;
          shutdownComplete = children.every(child => child.reaped);
        } catch {
          fallbackFailure ??= fixedFailure('DIRECT_CHILD_REAP');
        }
      }
      if (!shutdownComplete) {
        for (const child of children) {
          if (!child.reaped) await child.forceClose();
        }
        shutdownComplete = children.every(child => child.reaped);
      }
      if (!shutdownComplete) fallbackFailure ??= fixedFailure('DIRECT_CHILD_REAP');
    }
    if (removalAttempted && !removalComplete && primaryRemovalPromise !== undefined) {
      if (await bounded(primaryRemovalPromise, 2_500)) {
        const disposition = await primaryRemovalPromise;
        removalComplete = disposition === 'REMOVED';
      }
      if (!removalComplete) {
        fallbackFailure ??= fixedFailure('DIRECT_ROOT_RESIDUE_RETAINED');
      }
    } else if (!removalAttempted) {
      const removableRoots = [];
      if (routingRoot !== undefined) removableRoots.push(routingRoot);
      for (let index = 0; index < roots.length; index += 1) {
        if (children[index] === undefined || children[index].reaped) {
          removableRoots.push(roots[index]);
        }
      }
      if (removableRoots.length > 0) {
        removalAttempted = true;
        primaryRemovalPromise = removeOwnedRoots(removableRoots);
        const disposition = await primaryRemovalPromise;
        removalComplete = disposition === 'REMOVED';
        if (!removalComplete) {
          fallbackFailure ??= fixedFailure('DIRECT_ROOT_RESIDUE_RETAINED');
        }
      }
    }
    if (!operationClosed) {
      try {
        operation.close();
        operationClosed = true;
      } catch (error) {
        fallbackFailure ??= error;
      }
    }
    if (fallbackFailure) throw fallbackFailure;
  });

  routingRoot = await operation.wait(createPrivateRoot('fixed-payer-direct-routing-'));
  const manifest = manifestText();
  await operation.wait(writeFile(join(routingRoot, FIXED_PAYER_SHARD_MANIFEST_FILE), manifest, {
    flag: 'wx',
    mode: 0o600,
  }));
  const routing = createFixedPayerShardRouting({
    privateRoot: routingRoot,
    expectedManifestFingerprint: manifestFingerprint(manifest),
    expectedConfiguration: CONFIGURATION,
  });
  roots.push(await operation.wait(createPrivateRoot('fixed-payer-direct-a-')));
  roots.push(await operation.wait(createPrivateRoot('fixed-payer-direct-b-')));
  let payee;
  let accepted;
  let payloads;
  try {
    payee = syntheticKeyPair(250);
    accepted = requirement(payee.getAddress().toString());
    payloads = signedPayloadsByShard(routing, accepted);
  } finally {
    payee?.clear();
  }
  await operation.wait(Promise.all(payloads.map(payload => preflightZenonPayment(
    payload,
    accepted,
    paymentRequired(accepted),
  ))));
  await operation.wait(Promise.all(
    roots.map((root, index) => writeSignedFixture(root, payloads[index])),
  ));
  const descriptors = ownedDescriptors(payloads, roots);
  children.push(launchChild('A', roots[0], descriptors[0], payloads[0]));
  children.push(launchChild('B', roots[1], descriptors[1], payloads[1]));
  await operation.wait(Promise.all(children.map(child => child.readyFrame)));
  children.forEach(child => child.commit());
  await operation.wait(Promise.all(children.map(child => child.ready)));
  dispatcher = createFixedPayerSettlementDispatcher({
    routing,
    shards: descriptors.map((descriptor, index) => ({
      shardId: descriptor.shardId,
      payer: descriptor.payer,
      generation: descriptor.generation,
      owner: children[index].child,
      channel: children[index].child,
      journalIdentity: children[index].journalIdentity,
    })),
    requestTimeoutMs: 10_000,
    maxOperationsPerShard: 16,
  });
  const settlements = Promise.all(payloads.map(payload => dispatcher.settle(
    payload,
    accepted,
    paymentRequired(accepted),
  )));
  await operation.wait(Promise.all(children.map(child => child.publication)));
  requireProof(!await bounded(settlements, 25), 'DIRECT_SETTLEMENT_NOT_HELD');
  children.forEach(child => child.release());
  const included = await operation.wait(settlements);
  requireProof(included.every(result => result.success === true &&
    result.state === 'MOMENTUM_INCLUDED'), 'DIRECT_SETTLEMENT');
  const cachedResponses = included.map(result => ({
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: { ok: true, payer: result.payer },
  }));
  const pending = await operation.wait(Promise.all(included.map((result, index) =>
    dispatcher.markDeliveryPending(result, payloads[index].accepted))));
  requireProof(pending.every(result => result.deliveryClaimed === true &&
    result.deliveryState === 'DELIVERY_PENDING'), 'DIRECT_PENDING');
  const delivered = await operation.wait(Promise.all(included.map((result, index) =>
    dispatcher.markDelivered(result, cachedResponses[index]))));
  requireProof(delivered.every((result, index) => result.deliveryState === 'DELIVERED' &&
    isDeepStrictEqual(result.cachedResponse, cachedResponses[index])), 'DIRECT_DELIVERED');

  const retirement = dispatcher.retire();
  closeRequested = true;
  children.forEach(child => child.requestClose());
  primaryShutdownPromise = Promise.all([
    retirement,
    ...children.map(child => child.awaitClose()),
  ]);
  void primaryShutdownPromise.catch(() => {});
  await operation.wait(primaryShutdownPromise);
  requireProof(children.every(child => child.reaped), 'DIRECT_CHILD_NOT_REAPED');
  shutdownComplete = true;
  const records = await operation.wait(Promise.all(roots.map(async (root, index) => {
    const snapshot = await new SettlementJournal({
      directory: join(root, 'journal'),
      allowedRoot: root,
      existingOnly: true,
    }).list({ includeTombstones: true });
    requireProof(snapshot.records.length === 1 && snapshot.tombstones.length === 0,
      'DIRECT_JOURNAL_CARDINALITY');
    const record = snapshot.records[0];
    requireProof(record.payer === payloads[index].payload.transaction.address &&
      record.transactionHash === payloads[index].payload.transaction.hash &&
      record.evidenceState === 'MOMENTUM_INCLUDED' &&
      record.deliveryState === 'DELIVERED' &&
      isDeepStrictEqual(record.cachedResponse, cachedResponses[index]),
    'DIRECT_JOURNAL_DELIVERY');
    return record;
  })));
  requireProof(records[0].payer !== records[1].payer &&
    records[0].transactionHash !== records[1].transactionHash,
  'DIRECT_JOURNAL_ISOLATION');

  removalAttempted = true;
  primaryRemovalPromise = removeOwnedRoots([routingRoot, ...roots]);
  const removalDisposition = await operation.wait(primaryRemovalPromise);
  requireProof(removalDisposition === 'REMOVED', removalDisposition === 'TIMEOUT'
    ? 'DIRECT_ROOT_CLEANUP_TIMEOUT_RESIDUE_RETAINED'
    : 'DIRECT_ROOT_CLEANUP_REJECTED_RESIDUE_RETAINED');
  removalComplete = true;
  operation.close();
  operationClosed = true;
});

test('configuration requires two canonical fixed payers on distinct immutable routes and unique owners', async t => {
  const { routing } = await routingFixture(t);
  const descriptors = payerDescriptors(routing);
  const make = overrides => {
    const pairs = descriptors.map(() => endpointPair());
    const owners = descriptors.map(() => new EventEmitter());
    const journals = descriptors.map(() => Object.freeze({}));
    return {
      pairs,
      owners,
      journals,
      options: {
        routing,
        shards: shardOptions(descriptors, pairs, owners, journals),
        requestTimeoutMs: 100,
        maxOperationsPerShard: 8,
        ...overrides,
      },
    };
  };

  for (const kind of ['channel', 'owner', 'cross-role', 'journal']) {
    const candidate = make();
    if (kind === 'channel') candidate.options.shards[1].channel = candidate.options.shards[0].channel;
    if (kind === 'owner') candidate.options.shards[1].owner = candidate.options.shards[0].owner;
    if (kind === 'cross-role') candidate.options.shards[1].channel = candidate.options.shards[0].owner;
    if (kind === 'journal') {
      candidate.options.shards[1].journalIdentity =
        candidate.options.shards[0].journalIdentity;
    }
    assert.throws(() => createFixedPayerSettlementDispatcher(candidate.options),
      rejectsWith(DISPATCH_CODES.INVALID_CONFIGURATION));
    assert.deepEqual(candidate.pairs.map(pair => pair.counts.parentSend), [0, 0]);
  }

  const sameRoute = [];
  for (let fill = 1; fill < 256 && sameRoute.length < 2; fill += 1) {
    const payer = canonicalPayer(fill);
    if (routing.route(payer).shardId === CONFIGURATION.shardIds[0]) sameRoute.push(payer);
  }
  const collision = make();
  collision.options.shards[0].payer = sameRoute[0];
  collision.options.shards[1].payer = sameRoute[1];
  assert.throws(() => createFixedPayerSettlementDispatcher(collision.options),
    rejectsWith(DISPATCH_CODES.INVALID_CONFIGURATION));
  assert.deepEqual(collision.pairs.map(pair => pair.counts.parentSend), [0, 0]);

  const swapped = make();
  [swapped.options.shards[0].payer, swapped.options.shards[1].payer] =
    [swapped.options.shards[1].payer, swapped.options.shards[0].payer];
  assert.throws(() => createFixedPayerSettlementDispatcher(swapped.options),
    rejectsWith(DISPATCH_CODES.INVALID_CONFIGURATION));
  assert.deepEqual(swapped.pairs.map(pair => pair.counts.parentSend), [0, 0]);
});

test('synthetic signing keys are cleared when address routing throws', () => {
  const created = [];
  const cleared = new Set();
  const createTrackedKeyPair = fill => {
    const keyPair = syntheticKeyPair(fill);
    const clear = keyPair.clear;
    keyPair.clear = function trackedClear() {
      cleared.add(keyPair);
      return Reflect.apply(clear, keyPair, []);
    };
    created.push(keyPair);
    return keyPair;
  };
  const diagnosticRouting = Object.freeze({
    route: Object.freeze(() => { throw fixedFailure('ROUTE_DIAGNOSTIC'); }),
  });
  let clearedBeforeRecovery = -1;
  try {
    assert.throws(
      () => signedPayloadsByShard(
        diagnosticRouting,
        requirement(canonicalPayer(254)),
        createTrackedKeyPair,
      ),
      error => error?.name === 'FixedPayerSettlementTestError' &&
        error?.message === 'ROUTE_DIAGNOSTIC',
    );
    clearedBeforeRecovery = cleared.size;
  } finally {
    for (const keyPair of created) {
      if (!cleared.has(keyPair)) keyPair.clear();
    }
  }
  assert.equal(created.length, 1);
  assert.equal(clearedBeforeRecovery, created.length);
});

test('whole-operation deadline unwinds a post-marker stall and bounds failed server cleanup', async () => {
  const deadline = createOperationDeadline(10);
  let finallyObserved = false;
  await assert.rejects(
    (async () => {
      try {
        await deadline.wait(new Promise(() => {}));
      } finally {
        finallyObserved = true;
        deadline.close();
      }
    })(),
    error => error?.name === 'FixedPayerSettlementTestError' &&
      error?.message === 'WHOLE_OPERATION_TIMEOUT',
  );
  assert.equal(finallyObserved, true);
  assert.equal(deadline.expired, true);

  let forcedConnections = 0;
  const cleaned = await closeOwnedServer({
    close: () => new Promise(() => {}),
    server: {
      closeAllConnections() { forcedConnections += 1; },
    },
  }, { initialMs: 5, finalMs: 5 });
  assert.equal(cleaned, false);
  assert.equal(forcedConnections, 1);
});

test('cleanup-only deadline expiry remains a failed outcome after bounded owned teardown', async () => {
  const deadline = createOperationDeadline(5);
  await new Promise(resolvePromise => {
    if (deadline.signal.aborted) resolvePromise();
    else deadline.signal.addEventListener('abort', resolvePromise, { once: true });
  });
  assert.equal(await bounded(Promise.resolve(), 5), true);
  assert.throws(
    () => deadline.close(),
    error => error?.name === 'FixedPayerSettlementTestError' &&
      error?.message === 'WHOLE_OPERATION_TIMEOUT',
  );
});

test('owned server cleanup awaits the unresolved first close operation', async () => {
  let closeCalls = 0;
  let forcedConnections = 0;
  let resolveFirstClose;
  const firstClose = new Promise(resolvePromise => { resolveFirstClose = resolvePromise; });
  const resourceServer = {
    close() {
      closeCalls += 1;
      return closeCalls === 1 ? firstClose : Promise.resolve();
    },
    server: {
      closeAllConnections() { forcedConnections += 1; },
    },
  };
  const firstClosePromise = resourceServer.close();
  try {
    const cleaned = await closeOwnedServer(resourceServer, {
      firstClosePromise,
      initialMs: 5,
      finalMs: 5,
    });
    assert.equal(cleaned, false);
    assert.equal(closeCalls, 1);
    assert.equal(forcedConnections, 1);
  } finally {
    resolveFirstClose();
    await firstClose;
  }
});

test('owned root cleanup reports a bounded removal rejection', async () => {
  const result = await removeOwnedRoots(['owned-root'], {
    timeoutMs: 10,
    async removeOperation() {
      throw fixedFailure('EXPECTED_ROOT_REMOVAL_REJECTION');
    },
  });
  assert.equal(result, 'REJECTED');
});

test('owned root cleanup reports a bounded removal timeout', async () => {
  const result = await removeOwnedRoots(['owned-root'], {
    timeoutMs: 5,
    removeOperation: () => new Promise(() => {}),
  });
  assert.equal(result, 'TIMEOUT');
});

test('real /paid requests overlap at two child publication boundaries and finish delivery in their private journals', {
  timeout: 30_000,
}, async () => {
  const operation = createOperationDeadline(15_000);
  let routingRoot;
  const childRoots = [];
  const children = [];
  let dispatcher;
  let resourceServer;
  let resourceServerClosePromise;
  let workFailure;
  let cleanupFailure;
  try {
    const routingFixtureValue = await operation.wait(
      createRoutingRoot('fixed-payer-http-routing-'),
    );
    routingRoot = routingFixtureValue.root;
    childRoots.push(...await operation.wait(Promise.all([
      createPrivateRoot('fixed-payer-http-child-a-'),
      createPrivateRoot('fixed-payer-http-child-b-'),
    ])));

    let payee;
    let accepted;
    let payloads;
    try {
      payee = syntheticKeyPair(253);
      accepted = requirement(payee.getAddress().toString());
      payloads = signedPayloadsByShard(routingFixtureValue.routing, accepted);
    } finally {
      payee?.clear();
    }
    requireProof(payloads[0].payload.transaction.address !==
      payloads[1].payload.transaction.address, 'PAYERS_NOT_DISTINCT');
    requireProof(payloads[0].payload.transaction.hash !==
      payloads[1].payload.transaction.hash, 'TRANSACTIONS_NOT_DISTINCT');
    requireProof(routingFixtureValue.routing.route(payloads[0].payload.transaction.address).shardId ===
      CONFIGURATION.shardIds[0], 'FIRST_ROUTE');
    requireProof(routingFixtureValue.routing.route(payloads[1].payload.transaction.address).shardId ===
      CONFIGURATION.shardIds[1], 'SECOND_ROUTE');
    try {
      await operation.wait(Promise.all(payloads.map(paymentPayload => preflightZenonPayment(
        paymentPayload,
        accepted,
        paymentRequired(accepted),
      ))));
    } catch {
      throw fixedFailure('FIXTURE_PREFLIGHT');
    }
    await operation.wait(Promise.all(
      childRoots.map((root, index) => writeSignedFixture(root, payloads[index])),
    ));

    const processDescriptors = ownedDescriptors(payloads, childRoots);
    children.push(launchChild(
      'A', childRoots[0], processDescriptors[0], payloads[0],
    ));
    children.push(launchChild(
      'B', childRoots[1], processDescriptors[1], payloads[1],
    ));
    await operation.wait(Promise.all(children.map(child => child.readyFrame)));
    children.forEach(child => child.commit());
    await operation.wait(Promise.all(children.map(child => child.ready)));
    dispatcher = createFixedPayerSettlementDispatcher({
      routing: routingFixtureValue.routing,
      shards: payloads.map((payload, index) => ({
        shardId: CONFIGURATION.shardIds[index],
        payer: payload.payload.transaction.address,
        generation: index === 0 ? 'fixture-generation-a' : 'fixture-generation-b',
        owner: children[index].child,
        channel: children[index].child,
        journalIdentity: children[index].journalIdentity,
      })),
      requestTimeoutMs: 20_000,
      maxOperationsPerShard: 16,
    });
    resourceServer = createResourceServer({
      facilitator: dispatcher,
      requirement: accepted,
      advertisedBaseUrl: 'https://127.0.0.1',
      resourceHandler: async ({ settlement }) => ({
        ok: true,
        payer: settlement.payer,
      }),
    });
    const listening = await operation.wait(resourceServer.listen());
    const responses = payloads.map(payload => submit(listening.url, payload, operation.signal));
    const responseBatch = Promise.all(responses);
    const publicationBatch = Promise.all(children.map(child => child.publication));
    const firstBoundary = await operation.wait(Promise.race([
      publicationBatch.then(() => 'PUBLICATION'),
      responseBatch.then(completed => {
        if (completed.every(response => response.status === 202)) return 'RECOVERY_RESPONSE';
        if (completed.every(response => response.status === 400)) return 'BAD_REQUEST_RESPONSE';
        if (completed.every(response => response.status === 402)) {
          const failures = completed.map(paymentRequiredFailure);
          if (failures.every(failure => failure === 'invalid_payment_header')) {
            return 'INVALID_PAYMENT_RESPONSE';
          }
          if (failures.every(failure => failure === 'payment_settlement_failed')) {
            return 'SETTLEMENT_FAILURE_RESPONSE';
          }
          return 'PAYMENT_REQUIRED_RESPONSE';
        }
        if (completed.every(response => response.status === 500)) return 'INTERNAL_ERROR_RESPONSE';
        return 'OTHER_RESPONSE';
      }),
    ]));
    const prematureResponseCodes = {
      RECOVERY_RESPONSE: 'HTTP_RECOVERY_BEFORE_PUBLICATION',
      BAD_REQUEST_RESPONSE: 'HTTP_BAD_REQUEST_BEFORE_PUBLICATION',
      INVALID_PAYMENT_RESPONSE: 'HTTP_INVALID_PAYMENT_BEFORE_PUBLICATION',
      SETTLEMENT_FAILURE_RESPONSE: 'HTTP_SETTLEMENT_FAILURE_BEFORE_PUBLICATION',
      PAYMENT_REQUIRED_RESPONSE: 'HTTP_PAYMENT_REQUIRED_BEFORE_PUBLICATION',
      INTERNAL_ERROR_RESPONSE: 'HTTP_INTERNAL_ERROR_BEFORE_PUBLICATION',
      OTHER_RESPONSE: 'HTTP_RESPONSE_BEFORE_PUBLICATION',
    };
    requireProof(firstBoundary === 'PUBLICATION', prematureResponseCodes[firstBoundary]);
    await operation.wait(publicationBatch);
    requireProof(children.every(child => !child.closed), 'CHILD_NOT_HELD');
    requireProof(!await bounded(responseBatch, 25), 'HTTP_POST_MARKER_STALL');
    children.forEach(child => child.release());
    const settledResponses = await operation.wait(responseBatch);
    requireProof(settledResponses.every(response => response.status === 200), 'HTTP_STATUS');
    const bodies = await operation.wait(
      Promise.all(settledResponses.map(response => response.json())),
    );
    requireProof(bodies.every(body => body.ok === true), 'HTTP_BODY');
    requireProof(new Set(bodies.map(body => body.payer)).size === 2, 'HTTP_PAYER_BINDING');

    resourceServerClosePromise = resourceServer.close();
    await operation.wait(resourceServerClosePromise);
    resourceServer = undefined;
    const retirement = dispatcher.retire();
    children.forEach(child => child.requestClose());
    await operation.wait(Promise.all([
      retirement,
      ...children.map(child => child.awaitClose()),
    ]));
    requireProof(children.every(child => child.reaped), 'CHILD_NOT_REAPED');

    const journalSnapshots = await operation.wait(Promise.all(childRoots.map(async (root, index) => {
      requireProof(children[index].reaped, 'CHILD_NOT_REAPED');
      const directory = join(root, 'journal');
      const state = await lstat(directory);
      requireProof(state.isDirectory() && (state.mode & 0o777) === 0o700,
        'JOURNAL_MODE');
      const snapshot = await new SettlementJournal({
        directory,
        allowedRoot: root,
        existingOnly: true,
      }).list({ includeTombstones: true });
      requireProof(snapshot.records.length === 1 && snapshot.tombstones.length === 0,
        'JOURNAL_CARDINALITY');
      const record = snapshot.records[0];
      requireProof(record.payer === payloads[index].payload.transaction.address &&
        record.transactionHash === payloads[index].payload.transaction.hash &&
        record.evidenceState === 'MOMENTUM_INCLUDED' &&
        record.deliveryState === 'DELIVERED' &&
        record.cachedResponse?.body?.payer === record.payer,
      'JOURNAL_DELIVERY');
      return record;
    })));
    requireProof(journalSnapshots[0].payer !== journalSnapshots[1].payer &&
      journalSnapshots[0].transactionHash !== journalSnapshots[1].transactionHash,
    'JOURNAL_ISOLATION');
  } catch (error) {
    workFailure = error?.name === 'FixedPayerSettlementTestError'
      ? error
      : fixedFailure('HTTP_INTEGRATION');
  } finally {
    if (dispatcher !== undefined) {
      try {
        const retirement = dispatcher.retire();
        let requestFailed = false;
        for (const child of children) {
          try { child.requestClose(); } catch { requestFailed = true; }
        }
        if (requestFailed) throw fixedFailure('CHILD_CLOSE_REQUEST');
        const graceful = Promise.all([retirement, ...children.map(child => child.awaitClose())]);
        if (!await bounded(graceful, 3_000)) throw fixedFailure('CHILD_REAP_TIMEOUT');
        await graceful;
      } catch {
        for (const child of children) await child.forceClose();
      }
    } else {
      for (const child of children) await child.forceClose();
    }
    const allReaped = children.every(child => child.reaped);
    if (!allReaped) cleanupFailure ??= fixedFailure(
      children.every(child => child.exited)
        ? 'CHILD_CLOSE_UNOBSERVED'
        : 'CHILD_EXIT_UNCERTAIN',
    );
    if (resourceServer !== undefined && !await closeOwnedServer(resourceServer, {
      firstClosePromise: resourceServerClosePromise,
    })) {
      cleanupFailure ??= fixedFailure('SERVER_CLOSE');
    }
    const removableRoots = [];
    if (routingRoot !== undefined) removableRoots.push(routingRoot);
    for (let index = 0; index < childRoots.length; index += 1) {
      if (children[index] === undefined || children[index].reaped) {
        removableRoots.push(childRoots[index]);
      }
    }
    if (removableRoots.length > 0) {
      const rootCleanup = await removeOwnedRoots(removableRoots);
      if (rootCleanup !== 'REMOVED') {
        cleanupFailure ??= fixedFailure(rootCleanup === 'TIMEOUT'
          ? 'ROOT_CLEANUP_TIMEOUT_RESIDUE_RETAINED'
          : 'ROOT_CLEANUP_REJECTED_RESIDUE_RETAINED');
      }
    }
    try { operation.close(); } catch (error) { cleanupFailure ??= error; }
  }
  if (cleanupFailure) throw cleanupFailure;
  if (workFailure) throw workFailure;
});

test('same-payer overlap is rejected before dispatch and never fans out to another shard', async t => {
  const { routing } = await routingFixture(t);
  const gate = {};
  gate.promise = new Promise(resolvePromise => { gate.resolve = resolvePromise; });
  let heldInput;
  let settleCalls = 0;
  const holding = facilitatorDouble({
    async settle(paymentPayload, requirements, required) {
      settleCalls += 1;
      heldInput = { paymentPayload, requirements, paymentRequired: required };
      await gate.promise;
      return includedResult(heldInput);
    },
  });
  const harness = await localHarness(t, routing, [holding, facilitatorDouble()]);
  const selected = harness.descriptors[0];
  const firstInput = syntheticInput(selected.payer, '1'.repeat(64));
  const secondInput = syntheticInput(selected.payer, '2'.repeat(64));
  const first = harness.dispatcher.settle(
    firstInput.paymentPayload,
    firstInput.requirements,
    firstInput.paymentRequired,
  );
  await new Promise(resolvePromise => setImmediate(resolvePromise));
  assert.equal(settleCalls, 1);
  await assert.rejects(
    harness.dispatcher.settle(
      secondInput.paymentPayload,
      secondInput.requirements,
      secondInput.paymentRequired,
    ),
    rejectsWith(DISPATCH_CODES.PAYER_BUSY),
  );
  assert.deepEqual(harness.pairs.map(pair => pair.counts.parentSend), [1, 0]);
  gate.resolve();
  assert.equal((await first).success, true);

  let unknown = canonicalPayer(250);
  while (harness.descriptors.some(descriptor => descriptor.payer === unknown)) {
    unknown = canonicalPayer(249);
  }
  const unknownInput = syntheticInput(unknown, '3'.repeat(64));
  await assert.rejects(
    harness.dispatcher.settle(
      unknownInput.paymentPayload,
      unknownInput.requirements,
      unknownInput.paymentRequired,
    ),
    rejectsWith(DISPATCH_CODES.UNKNOWN_PAYER),
  );
  assert.deepEqual(harness.pairs.map(pair => pair.counts.parentSend), [1, 0]);
});

test('each validated SETTLE receives a fresh operation-scoped publication capability', async t => {
  const { routing } = await routingFixture(t);
  const descriptor = payerDescriptors(routing)[0];
  const inputs = [
    syntheticInput(descriptor.payer, '0'.repeat(64)),
    syntheticInput(descriptor.payer, '1'.repeat(64)),
    syntheticInput(descriptor.payer, '2'.repeat(64)),
  ];
  const channel = new EventEmitter();
  const sent = [];
  channel.send = (frame, callback) => {
    sent.push(JSON.parse(frame));
    callback();
    return true;
  };
  const capabilities = [];
  const controller = runFixedPayerSettlementChild({
    channel,
    facilitator: facilitatorDouble({
      async settle(paymentPayload, requirements, required, observePublication) {
        capabilities.push(observePublication);
        assert.equal(typeof observePublication, 'function');
        assert.equal(Object.isFrozen(observePublication), true);
        assert.equal(observePublication.length, 0);
        if (capabilities.length <= 2) await observePublication();
        return includedResult({ paymentPayload, requirements, paymentRequired: required });
      },
    }),
    shardId: descriptor.shardId,
    payer: descriptor.payer,
    generation: descriptor.generation,
    maxOperations: 8,
  });
  t.after(async () => {
    channel.emit('disconnect');
    await controller.done;
  });

  for (let index = 0; index < inputs.length; index += 1) {
    channel.emit('message', settleRequestFrame(descriptor, inputs[index], index + 1));
    await new Promise(resolvePromise => setImmediate(resolvePromise));
  }
  assert.equal(capabilities.length, 3);
  assert.equal(new Set(capabilities).size, 3);
  assert.deepEqual(sent.map(frame => frame.type), [
    'PUBLICATION_OBSERVED', 'RESULT',
    'PUBLICATION_OBSERVED', 'RESULT',
    'RESULT',
  ]);
  assert.equal(sent.filter(frame => frame.type === 'RESULT').every(frame => frame.ok), true);
});

test('dispatcher accepts only one exact current SETTLE publication observation', async t => {
  const { routing } = await routingFixture(t);
  const descriptors = payerDescriptors(routing);
  const createRawDispatcher = (nested, onSend, maxOperationsPerShard = 8) => {
    const pairs = descriptors.map(() => endpointPair());
    const owners = descriptors.map(() => new EventEmitter());
    const journals = descriptors.map(() => Object.freeze({}));
    pairs[0].parent.send = (frame, callback) => {
      pairs[0].counts.parentSend += 1;
      return onSend({
        request: JSON.parse(frame),
        channel: pairs[0].parent,
        callback,
      });
    };
    const dispatcher = createFixedPayerSettlementDispatcher({
      routing,
      shards: shardOptions(descriptors, pairs, owners, journals),
      requestTimeoutMs: 100,
      maxOperationsPerShard,
    });
    nested.after(async () => {
      const retirement = dispatcher.retire();
      owners.forEach(owner => {
        owner.emit('exit', 0, null);
        owner.emit('close', 0, null);
      });
      await retirement;
    });
    return { dispatcher, pairs };
  };
  const invoke = (dispatcher, input) => dispatcher.settle(
    input.paymentPayload,
    input.requirements,
    input.paymentRequired,
  );

  await t.test('two sequential observations and a zero-observation result remain healthy',
    async nested => {
      const inputs = [
        syntheticInput(descriptors[0].payer, '3'.repeat(64)),
        syntheticInput(descriptors[0].payer, '4'.repeat(64)),
        syntheticInput(descriptors[0].payer, '5'.repeat(64)),
      ];
      const { dispatcher, pairs } = createRawDispatcher(nested, ({ request, channel, callback }) => {
        const input = inputs[request.sequence - 1];
        if (request.sequence <= 2) {
          channel.emit('message', JSON.stringify(publicationObservationForRequest(request)));
        }
        channel.emit('message', JSON.stringify(settleResultForRequest(request, input)));
        callback();
        return true;
      });
      const results = [];
      for (const input of inputs) results.push(await invoke(dispatcher, input));
      assert.equal(results.every(result => result.success), true);
      assert.equal(pairs[0].counts.parentSend, 3);
      assert.equal(dispatcher.retirementStatus()[0].quarantined, false);
    });

  const mutations = [
    ['version', frame => { frame.ipcVersion = 1; }],
    ['type', frame => { frame.type = 'PUBLICATION'; }],
    ['correlation', frame => { frame.correlationId += ':wrong'; }],
    ['shard', frame => { frame.shardId = descriptors[1].shardId; }],
    ['payer', frame => { frame.payer = descriptors[1].payer; }],
    ['generation', frame => { frame.generation = descriptors[1].generation; }],
    ['future sequence', frame => { frame.sequence += 1; }],
    ['operation', frame => { frame.operation = 'MARK_DELIVERY_PENDING'; }],
    ['transaction', frame => { frame.transaction = '6'.repeat(64); }],
    ['authorization', frame => { frame.authorizationKey = '7'.repeat(64); }],
    ['network', frame => { frame.network = 'zenon:other'; }],
    ['extra field', frame => { frame.extra = true; }],
    ['missing field', frame => { delete frame.network; }],
    ['field order', frame => {
      const reordered = { type: frame.type, ipcVersion: frame.ipcVersion };
      for (const [key, value] of Object.entries(frame)) {
        if (key !== 'type' && key !== 'ipcVersion') reordered[key] = value;
      }
      return reordered;
    }],
  ];
  for (const [name, mutate] of mutations) await t.test(name, async nested => {
    const input = syntheticInput(descriptors[0].payer, '8'.repeat(64));
    const { dispatcher } = createRawDispatcher(nested, ({ request, channel, callback }) => {
      const observation = publicationObservationForRequest(request);
      const replacement = mutate(observation) ?? observation;
      channel.emit('message', JSON.stringify(replacement));
      channel.emit('message', JSON.stringify(settleResultForRequest(request, input)));
      callback();
      return true;
    });
    const result = await invoke(dispatcher, input);
    assert.equal(result.state, 'SUBMISSION_OUTCOME_UNKNOWN');
    assert.equal(dispatcher.retirementStatus()[0].quarantined, true);
  });

  for (const mode of ['duplicate', 'post-result']) await t.test(mode, async nested => {
    const input = syntheticInput(descriptors[0].payer, '9'.repeat(64));
    const { dispatcher } = createRawDispatcher(nested, ({ request, channel, callback }) => {
      const observation = JSON.stringify(publicationObservationForRequest(request));
      if (mode === 'duplicate') {
        channel.emit('message', observation);
        channel.emit('message', observation);
        channel.emit('message', JSON.stringify(settleResultForRequest(request, input)));
      } else {
        channel.emit('message', JSON.stringify(settleResultForRequest(request, input)));
        channel.emit('message', observation);
      }
      callback();
      return true;
    });
    const result = await invoke(dispatcher, input);
    assert.equal(result.state, 'SUBMISSION_OUTCOME_UNKNOWN');
    assert.equal(dispatcher.retirementStatus()[0].quarantined, true);
  });

  await t.test('idle and late observations quarantine without reopening admission',
    async nested => {
      const input = syntheticInput(descriptors[0].payer, 'a'.repeat(64));
      const { dispatcher, pairs } = createRawDispatcher(
        nested,
        ({ request, channel, callback }) => {
          channel.emit('message', JSON.stringify(settleResultForRequest(request, input)));
          callback();
          return true;
        },
      );
      const request = JSON.parse(settleRequestFrame(descriptors[0], input, 1));
      pairs[0].parent.emit(
        'message',
        JSON.stringify(publicationObservationForRequest(request)),
      );
      await assert.rejects(invoke(dispatcher, input), rejectsWith(DISPATCH_CODES.SHARD_QUARANTINED));
    });

  await t.test('a late post-completion observation seals the shard', async nested => {
    const input = syntheticInput(descriptors[0].payer, 'b'.repeat(64));
    let completedRequest;
    const { dispatcher, pairs } = createRawDispatcher(
      nested,
      ({ request, channel, callback }) => {
        completedRequest = request;
        channel.emit('message', JSON.stringify(settleResultForRequest(request, input)));
        callback();
        return true;
      },
    );
    assert.equal((await invoke(dispatcher, input)).success, true);
    pairs[0].parent.emit(
      'message',
      JSON.stringify(publicationObservationForRequest(completedRequest)),
    );
    await assert.rejects(invoke(dispatcher, input), rejectsWith(DISPATCH_CODES.SHARD_QUARANTINED));
  });

  await t.test('an old sequence during a newer SETTLE is rejected', async nested => {
    const inputs = [
      syntheticInput(descriptors[0].payer, 'c'.repeat(64)),
      syntheticInput(descriptors[0].payer, 'd'.repeat(64)),
    ];
    const { dispatcher } = createRawDispatcher(nested, ({ request, channel, callback }) => {
      if (request.sequence === 1) {
        channel.emit('message', JSON.stringify(settleResultForRequest(request, inputs[0])));
      } else {
        const observation = publicationObservationForRequest(request);
        observation.sequence = 1;
        channel.emit('message', JSON.stringify(observation));
        channel.emit('message', JSON.stringify(settleResultForRequest(request, inputs[1])));
      }
      callback();
      return true;
    });
    assert.equal((await invoke(dispatcher, inputs[0])).success, true);
    assert.equal((await invoke(dispatcher, inputs[1])).state, 'SUBMISSION_OUTCOME_UNKNOWN');
    assert.equal(dispatcher.retirementStatus()[0].quarantined, true);
  });

  for (const operation of ['MARK_DELIVERY_PENDING', 'MARK_DELIVERED']) {
    await t.test(`${operation} cannot carry a publication observation`, async nested => {
      const input = syntheticInput(descriptors[0].payer, 'e'.repeat(64));
      const cachedResponse = { status: 200, body: { ok: true } };
      const { dispatcher } = createRawDispatcher(nested, ({ request, channel, callback }) => {
        if (request.type === 'SETTLE') {
          channel.emit('message', JSON.stringify(settleResultForRequest(request, input)));
        } else {
          const observation = publicationObservationForRequest(request);
          observation.operation = request.type;
          channel.emit('message', JSON.stringify(observation));
          const result = request.type === 'MARK_DELIVERY_PENDING'
            ? {
                authorizationKey: request.authorizationKey,
                payer: request.payer,
                transactionHash: request.transaction,
                deliveryState: 'DELIVERY_PENDING',
                deliveryClaimed: true,
              }
            : {
                authorizationKey: request.authorizationKey,
                payer: request.payer,
                transactionHash: request.transaction,
                deliveryState: 'DELIVERED',
                cachedResponse,
              };
          channel.emit('message', JSON.stringify(successfulResultForRequest(request, result)));
        }
        callback();
        return true;
      });
      const settlement = await invoke(dispatcher, input);
      const transition = operation === 'MARK_DELIVERY_PENDING'
        ? dispatcher.markDeliveryPending(settlement, input.requirements)
        : dispatcher.markDelivered(settlement, cachedResponse);
      await assert.rejects(transition, rejectsWith(DISPATCH_CODES.SHARD_QUARANTINED));
      assert.equal(dispatcher.retirementStatus()[0].quarantined, true);
    });
  }
});

test('publication capabilities are active-operation-only and observation send is terminally strict',
  async t => {
    const { routing } = await routingFixture(t);
    const descriptor = payerDescriptors(routing)[0];
    const createDirectChild = (nested, facilitator, send) => {
      const channel = new EventEmitter();
      const sent = [];
      channel.send = (frame, callback) => {
        const parsed = JSON.parse(frame);
        sent.push(parsed);
        return send({ frame: parsed, callback });
      };
      const controller = runFixedPayerSettlementChild({
        channel,
        facilitator,
        shardId: descriptor.shardId,
        payer: descriptor.payer,
        generation: descriptor.generation,
        maxOperations: 16,
      });
      nested.after(async () => {
        channel.emit('disconnect');
        await controller.done;
      });
      return { channel, controller, sent };
    };
    const normalSend = ({ callback }) => {
      callback();
      return true;
    };

    for (const mode of ['wrong arity', 'duplicate call', 'after result']) {
      await t.test(mode, async nested => {
        const input = syntheticInput(descriptor.payer, 'f'.repeat(64));
        let retained;
        const child = createDirectChild(nested, facilitatorDouble({
          async settle(paymentPayload, requirements, required, observePublication) {
            retained = observePublication;
            if (mode === 'wrong arity') observePublication('invalid');
            if (mode === 'duplicate call') {
              await observePublication();
              observePublication();
            }
            return includedResult({ paymentPayload, requirements, paymentRequired: required });
          },
        }), normalSend);
        child.channel.emit('message', settleRequestFrame(descriptor, input, 1));
        if (mode === 'after result') {
          await new Promise(resolvePromise => setImmediate(resolvePromise));
          assert.deepEqual(child.sent.map(frame => frame.type), ['RESULT']);
          assert.throws(() => retained());
        }
        assert.equal(await child.controller.done, 'PROTOCOL_FAULT');
        assert.deepEqual(child.sent.map(frame => frame.type), mode === 'duplicate call'
          ? ['PUBLICATION_OBSERVED']
          : mode === 'after result' ? ['RESULT'] : []);
      });
    }

    await t.test('a prior capability faults while a newer SETTLE is active', async nested => {
      const inputs = [
        syntheticInput(descriptor.payer, '0'.repeat(64)),
        syntheticInput(descriptor.payer, '1'.repeat(64)),
      ];
      const capabilities = [];
      let resolveSecond;
      const second = new Promise(resolvePromise => { resolveSecond = resolvePromise; });
      const child = createDirectChild(nested, facilitatorDouble({
        async settle(paymentPayload, requirements, required, observePublication) {
          capabilities.push(observePublication);
          if (capabilities.length === 2) await second;
          return includedResult({ paymentPayload, requirements, paymentRequired: required });
        },
      }), normalSend);
      child.channel.emit('message', settleRequestFrame(descriptor, inputs[0], 1));
      await new Promise(resolvePromise => setImmediate(resolvePromise));
      child.channel.emit('message', settleRequestFrame(descriptor, inputs[1], 2));
      await new Promise(resolvePromise => setImmediate(resolvePromise));
      assert.equal(capabilities.length, 2);
      assert.notEqual(capabilities[0], capabilities[1]);
      assert.throws(() => capabilities[0]());
      assert.equal(await child.controller.done, 'PROTOCOL_FAULT');
      resolveSecond();
    });

    await t.test('a synchronously queued initial request has its capability before dependency entry',
      async nested => {
        const input = syntheticInput(descriptor.payer, '2'.repeat(64));
        const channel = new EventEmitter();
        const inheritedOn = EventEmitter.prototype.on;
        const sent = [];
        let reentered = false;
        channel.on = function reentrantInitialRequest(event, listener) {
          Reflect.apply(inheritedOn, this, [event, listener]);
          if (!reentered && event === 'message') {
            reentered = true;
            listener(settleRequestFrame(descriptor, input, 1));
          }
          return this;
        };
        channel.send = (frame, callback) => {
          sent.push(JSON.parse(frame));
          callback();
          return true;
        };
        let capabilityValid = false;
        const controller = runFixedPayerSettlementChild({
          channel,
          facilitator: facilitatorDouble({
            async settle(paymentPayload, requirements, required, observePublication) {
              capabilityValid = typeof observePublication === 'function' &&
                Object.isFrozen(observePublication) && observePublication.length === 0;
              await observePublication();
              return includedResult({ paymentPayload, requirements, paymentRequired: required });
            },
          }),
          shardId: descriptor.shardId,
          payer: descriptor.payer,
          generation: descriptor.generation,
          maxOperations: 16,
        });
        nested.after(async () => {
          channel.emit('disconnect');
          await controller.done;
        });
        await new Promise(resolvePromise => setImmediate(resolvePromise));
        assert.equal(capabilityValid, true);
        assert.deepEqual(sent.map(frame => frame.type), ['PUBLICATION_OBSERVED', 'RESULT']);
      });

    const sendFailures = [
      ['throw', () => { throw fixedFailure('OBSERVATION_SEND'); }],
      ['false return', ({ callback }) => { callback(); return false; }],
      ['callback failure', ({ callback }) => { callback(fixedFailure('OBSERVATION_SEND')); return true; }],
      ['duplicate callback', ({ callback }) => { callback(); callback(); return true; }],
    ];
    for (const [name, observationSend] of sendFailures) await t.test(name, async nested => {
      const input = syntheticInput(descriptor.payer, '3'.repeat(64));
      const child = createDirectChild(nested, facilitatorDouble({
        async settle(paymentPayload, requirements, required, observePublication) {
          void observePublication();
          return includedResult({ paymentPayload, requirements, paymentRequired: required });
        },
      }), context => context.frame.type === 'PUBLICATION_OBSERVED'
        ? observationSend(context)
        : normalSend(context));
      child.channel.emit('message', settleRequestFrame(descriptor, input, 1));
      assert.equal(await child.controller.done, 'SEND_FAILED');
      assert.deepEqual(child.sent.map(frame => frame.type), ['PUBLICATION_OBSERVED']);
    });

    await t.test('missing callback blocks the result and a disconnect settles the capability',
      async nested => {
        const input = syntheticInput(descriptor.payer, '4'.repeat(64));
        let lateCallback;
        const child = createDirectChild(nested, facilitatorDouble({
          async settle(paymentPayload, requirements, required, observePublication) {
            void observePublication();
            return includedResult({ paymentPayload, requirements, paymentRequired: required });
          },
        }), context => {
          if (context.frame.type === 'PUBLICATION_OBSERVED') {
            lateCallback = context.callback;
            return true;
          }
          return normalSend(context);
        });
        child.channel.emit('message', settleRequestFrame(descriptor, input, 1));
        await new Promise(resolvePromise => setImmediate(resolvePromise));
        assert.deepEqual(child.sent.map(frame => frame.type), ['PUBLICATION_OBSERVED']);
        assert.equal(await bounded(child.controller.done, 10), false);
        child.channel.emit('disconnect');
        assert.equal(await child.controller.done, 'DISCONNECTED');
        lateCallback();
        assert.deepEqual(child.sent.map(frame => frame.type), ['PUBLICATION_OBSERVED']);
      });

    await t.test('a duplicate observation callback after result is terminal', async nested => {
      const input = syntheticInput(descriptor.payer, '5'.repeat(64));
      let observationCallback;
      const child = createDirectChild(nested, facilitatorDouble({
        async settle(paymentPayload, requirements, required, observePublication) {
          void observePublication();
          return includedResult({ paymentPayload, requirements, paymentRequired: required });
        },
      }), context => {
        if (context.frame.type === 'PUBLICATION_OBSERVED') {
          observationCallback = context.callback;
          context.callback();
          return true;
        }
        return normalSend(context);
      });
      child.channel.emit('message', settleRequestFrame(descriptor, input, 1));
      await new Promise(resolvePromise => setImmediate(resolvePromise));
      assert.deepEqual(child.sent.map(frame => frame.type), [
        'PUBLICATION_OBSERVED', 'RESULT',
      ]);
      observationCallback();
      assert.equal(await child.controller.done, 'SEND_FAILED');
    });
  });

test('publication observation neither advances admission nor consumes logical capacity', async t => {
  const { routing } = await routingFixture(t);
  const descriptors = payerDescriptors(routing);
  const createObservedHarness = (nested, {
    observationSend,
    requestTimeoutMs = 100,
    maxOperationsPerShard = 8,
  }) => {
    const pairs = descriptors.map(() => endpointPair());
    const owners = descriptors.map(() => new EventEmitter());
    const journals = descriptors.map(() => Object.freeze({}));
    const childFrames = [];
    pairs[0].child.send = (frame, callback) => {
      const parsed = JSON.parse(frame);
      childFrames.push(parsed);
      if (parsed.type === 'PUBLICATION_OBSERVED') {
        pairs[0].parent.emit('message', frame);
        return observationSend({ callback, frame: parsed });
      }
      pairs[0].parent.emit('message', frame);
      callback();
      return true;
    };
    const controllers = descriptors.map((descriptor, index) =>
      runFixedPayerSettlementChild({
        channel: pairs[index].child,
        facilitator: index === 0 ? facilitatorDouble({
          async settle(paymentPayload, requirements, required, observePublication) {
            void observePublication();
            return includedResult({ paymentPayload, requirements, paymentRequired: required });
          },
        }) : facilitatorDouble(),
        shardId: descriptor.shardId,
        payer: descriptor.payer,
        generation: descriptor.generation,
        maxOperations: 16,
      }));
    const dispatcher = createFixedPayerSettlementDispatcher({
      routing,
      shards: shardOptions(descriptors, pairs, owners, journals),
      requestTimeoutMs,
      maxOperationsPerShard,
    });
    nested.after(async () => {
      const retirement = dispatcher.retire();
      pairs.forEach(pair => {
        pair.parent.emit('disconnect');
        pair.child.emit('disconnect');
      });
      owners.forEach(owner => {
        owner.emit('exit', 0, null);
        owner.emit('close', 0, null);
      });
      await Promise.all([retirement, ...controllers.map(controller => controller.done)]);
    });
    return { dispatcher, pairs, controllers, childFrames };
  };

  await t.test('a pending observation callback holds result and same-payer admission',
    async nested => {
      let observationCallback;
      const harness = createObservedHarness(nested, {
        observationSend({ callback }) {
          observationCallback = callback;
          return true;
        },
      });
      const input = syntheticInput(descriptors[0].payer, '5'.repeat(64));
      const settlement = harness.dispatcher.settle(
        input.paymentPayload,
        input.requirements,
        input.paymentRequired,
      );
      await new Promise(resolvePromise => setImmediate(resolvePromise));
      assert.deepEqual(harness.childFrames.map(frame => frame.type), ['PUBLICATION_OBSERVED']);
      await assert.rejects(
        harness.dispatcher.settle(
          input.paymentPayload,
          input.requirements,
          input.paymentRequired,
        ),
        rejectsWith(DISPATCH_CODES.PAYER_BUSY),
      );
      assert.equal(harness.pairs[0].counts.parentSend, 1);
      observationCallback();
      assert.equal((await settlement).success, true);
      assert.deepEqual(harness.childFrames.map(frame => frame.type), [
        'PUBLICATION_OBSERVED', 'RESULT',
      ]);
    });

  await t.test('the inherited request timeout seals a missing observation callback',
    async nested => {
      const harness = createObservedHarness(nested, {
        observationSend() { return true; },
        requestTimeoutMs: 15,
      });
      const input = syntheticInput(descriptors[0].payer, '6'.repeat(64));
      const result = await harness.dispatcher.settle(
        input.paymentPayload,
        input.requirements,
        input.paymentRequired,
      );
      assert.equal(result.state, 'SUBMISSION_OUTCOME_UNKNOWN');
      assert.deepEqual(harness.childFrames.map(frame => frame.type), ['PUBLICATION_OBSERVED']);
      assert.equal(harness.dispatcher.retirementStatus()[0].quarantined, true);
    });

  await t.test('two observed SETTLEs consume exactly two admissions', async nested => {
    const harness = createObservedHarness(nested, {
      observationSend({ callback }) { callback(); return true; },
      maxOperationsPerShard: 2,
    });
    const inputs = [
      syntheticInput(descriptors[0].payer, '7'.repeat(64)),
      syntheticInput(descriptors[0].payer, '8'.repeat(64)),
      syntheticInput(descriptors[0].payer, '9'.repeat(64)),
    ];
    for (const input of inputs.slice(0, 2)) {
      const result = await harness.dispatcher.settle(
        input.paymentPayload,
        input.requirements,
        input.paymentRequired,
      );
      assert.equal(result.success, true);
    }
    await assert.rejects(
      harness.dispatcher.settle(
        inputs[2].paymentPayload,
        inputs[2].requirements,
        inputs[2].paymentRequired,
      ),
      rejectsWith(DISPATCH_CODES.CAPACITY_EXHAUSTED),
    );
    assert.equal(harness.pairs[0].counts.parentSend, 2);
    assert.deepEqual(harness.childFrames.map(frame => frame.type), [
      'PUBLICATION_OBSERVED', 'RESULT',
      'PUBLICATION_OBSERVED', 'RESULT',
    ]);
  });
});

test('an explicit UNKNOWN retries the identical payment on the same child and then delivers there', async t => {
  const { routing } = await routingFixture(t);
  let settleCalls = 0;
  let publicationCalls = 0;
  let pendingCalls = 0;
  let deliveredCalls = 0;
  const recovering = facilitatorDouble({
    async settle(paymentPayload, requirements, required, observePublication) {
      settleCalls += 1;
      const input = { paymentPayload, requirements, paymentRequired: required };
      if (settleCalls === 1) {
        publicationCalls += 1;
        await observePublication();
        return unknownResult(input);
      }
      return includedResult(input);
    },
    async markDeliveryPending(settlement) {
      pendingCalls += 1;
      return {
        authorizationKey: settlement.authorizationKey,
        payer: settlement.payer,
        transactionHash: settlement.transaction,
        deliveryState: 'DELIVERY_PENDING',
        deliveryClaimed: true,
      };
    },
    async markDelivered(settlement, cachedResponse) {
      deliveredCalls += 1;
      return {
        authorizationKey: settlement.authorizationKey,
        payer: settlement.payer,
        transactionHash: settlement.transaction,
        deliveryState: 'DELIVERED',
        cachedResponse,
      };
    },
  });
  const harness = await localHarness(t, routing, [recovering, facilitatorDouble()]);
  const selected = harness.descriptors[0];
  const input = syntheticInput(selected.payer, '4'.repeat(64));
  const first = await harness.dispatcher.settle(
    input.paymentPayload,
    input.requirements,
    input.paymentRequired,
  );
  assert.deepEqual({
    success: first.success,
    state: first.state,
    retrySamePayment: first.retrySamePayment,
  }, {
    success: false,
    state: 'SUBMISSION_OUTCOME_UNKNOWN',
    retrySamePayment: true,
  });
  const second = await harness.dispatcher.settle(
    structuredClone(input.paymentPayload),
    structuredClone(input.requirements),
    structuredClone(input.paymentRequired),
  );
  assert.equal(second.success, true);
  assert.equal(second.transaction, first.transaction);
  assert.equal(second.authorizationKey, first.authorizationKey);
  const pending = await harness.dispatcher.markDeliveryPending(second, input.requirements);
  assert.equal(pending.deliveryClaimed, true);
  const cachedResponse = {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: { ok: true },
  };
  const delivered = await harness.dispatcher.markDelivered(second, cachedResponse);
  assert.equal(delivered.deliveryState, 'DELIVERED');
  assert.deepEqual(delivered.cachedResponse, cachedResponse);
  assert.deepEqual({ settleCalls, publicationCalls, pendingCalls, deliveredCalls }, {
    settleCalls: 2,
    publicationCalls: 1,
    pendingCalls: 1,
    deliveredCalls: 1,
  });
  assert.deepEqual(harness.pairs.map(pair => pair.counts.parentSend), [4, 0]);
  assert.deepEqual(harness.pairs.map(pair => pair.counts.childSend), [5, 0]);
});

test('reconciliation publication policy remains state-specific and exact-payment-bound', async t => {
  const { routing } = await routingFixture(t);
  for (const state of ['SUBMISSION_ACKNOWLEDGED', 'SUBMISSION_OUTCOME_UNKNOWN']) {
    await t.test(`${state} exact reconciliation adds no observation`, async nested => {
      const { descriptors, original, replacement } = await signedReplacementFixture(routing);
      let calls = 0;
      const harness = await localHarness(
        nested,
        routing,
        [facilitatorDouble({
          async settle(paymentPayload, requirements, required, observePublication) {
            calls += 1;
            const input = { paymentPayload, requirements, paymentRequired: required };
            if (calls === 1) {
              await observePublication();
              return state === 'SUBMISSION_OUTCOME_UNKNOWN'
                ? unknownResult(input)
                : terminalResult(input, state);
            }
            return includedResult(input);
          },
        }), facilitatorDouble()],
        { descriptors },
      );
      const first = await harness.dispatcher.settle(
        original.paymentPayload,
        original.requirements,
        original.paymentRequired,
      );
      assert.equal(first.state, state);
      await assert.rejects(
        harness.dispatcher.settle(
          replacement.paymentPayload,
          replacement.requirements,
          replacement.paymentRequired,
        ),
        rejectsWith(DISPATCH_CODES.INVALID_REQUEST),
      );
      const recovered = await harness.dispatcher.settle(
        structuredClone(original.paymentPayload),
        structuredClone(original.requirements),
        structuredClone(original.paymentRequired),
      );
      assert.equal(recovered.success, true);
      assert.equal(calls, 2);
      assert.deepEqual(harness.pairs.map(pair => pair.counts.parentSend), [2, 0]);
      assert.deepEqual(harness.pairs.map(pair => pair.counts.childSend), [3, 0]);
    });
  }

  await t.test('a later exact VALIDATED operation may observe one idempotent publication',
    async nested => {
      const { descriptors, original, replacement } = await signedReplacementFixture(routing);
      let calls = 0;
      const harness = await localHarness(
        nested,
        routing,
        [facilitatorDouble({
          async settle(paymentPayload, requirements, required, observePublication) {
            calls += 1;
            const input = { paymentPayload, requirements, paymentRequired: required };
            if (calls === 1) return terminalResult(input, 'VALIDATED');
            await observePublication();
            return includedResult(input);
          },
        }), facilitatorDouble()],
        { descriptors },
      );
      const first = await harness.dispatcher.settle(
        original.paymentPayload,
        original.requirements,
        original.paymentRequired,
      );
      assert.equal(first.state, 'VALIDATED');
      await assert.rejects(
        harness.dispatcher.settle(
          replacement.paymentPayload,
          replacement.requirements,
          replacement.paymentRequired,
        ),
        rejectsWith(DISPATCH_CODES.INVALID_REQUEST),
      );
      const recovered = await harness.dispatcher.settle(
        structuredClone(original.paymentPayload),
        structuredClone(original.requirements),
        structuredClone(original.paymentRequired),
      );
      assert.equal(recovered.success, true);
      assert.equal(calls, 2);
      assert.deepEqual(harness.pairs.map(pair => pair.counts.parentSend), [2, 0]);
      assert.deepEqual(harness.pairs.map(pair => pair.counts.childSend), [3, 0]);
    });
});

test('an explicit UNKNOWN rejects a distinct signed payment before child dispatch and preserves exact recovery', async t => {
  const { routing } = await routingFixture(t);
  let payee;
  let accepted;
  let payloadPairs;
  try {
    payee = syntheticKeyPair(251);
    accepted = requirement(payee.getAddress().toString());
    payloadPairs = signedPayloadPairsByShard(routing, accepted);
  } finally {
    payee?.clear();
  }
  const descriptors = payloadPairs.map((pair, index) => ({
    shardId: CONFIGURATION.shardIds[index],
    payer: pair[0].payload.transaction.address,
    generation: index === 0 ? 'fixture-generation-a' : 'fixture-generation-b',
  }));
  const original = {
    paymentPayload: payloadPairs[0][0],
    requirements: structuredClone(accepted),
    paymentRequired: paymentRequired(accepted),
  };
  const replacement = {
    paymentPayload: payloadPairs[0][1],
    requirements: structuredClone(accepted),
    paymentRequired: paymentRequired(accepted),
  };
  try {
    await Promise.all([original, replacement].map(input => preflightZenonPayment(
      input.paymentPayload,
      input.requirements,
      input.paymentRequired,
    )));
  } catch {
    throw fixedFailure('SIGNED_REPLACEMENT_PREFLIGHT');
  }
  requireProof(
    original.paymentPayload.payload.transaction.address ===
      replacement.paymentPayload.payload.transaction.address &&
    original.paymentPayload.payload.transaction.hash !==
      replacement.paymentPayload.payload.transaction.hash &&
    inputIdentity(original).authorizationKey !== inputIdentity(replacement).authorizationKey,
    'SIGNED_REPLACEMENT_IDENTITY',
  );

  let settleCalls = 0;
  let publicationCalls = 0;
  let journalCalls = 0;
  let deliveryCalls = 0;
  const recovering = facilitatorDouble({
    async settle(paymentPayload, requirements, required) {
      settleCalls += 1;
      journalCalls += 1;
      const input = { paymentPayload, requirements, paymentRequired: required };
      if (settleCalls === 1) {
        publicationCalls += 1;
        return unknownResult(input);
      }
      return includedResult(input);
    },
    async markDeliveryPending() {
      deliveryCalls += 1;
      throw fixedFailure('UNEXPECTED_DELIVERY');
    },
    async markDelivered() {
      deliveryCalls += 1;
      throw fixedFailure('UNEXPECTED_DELIVERY');
    },
  });
  const harness = await localHarness(
    t,
    routing,
    [recovering, facilitatorDouble()],
    { descriptors },
  );
  const first = await harness.dispatcher.settle(
    original.paymentPayload,
    original.requirements,
    original.paymentRequired,
  );
  assert.equal(first.state, 'SUBMISSION_OUTCOME_UNKNOWN');
  await assert.rejects(
    harness.dispatcher.settle(
      replacement.paymentPayload,
      replacement.requirements,
      replacement.paymentRequired,
    ),
    rejectsWith(DISPATCH_CODES.INVALID_REQUEST),
  );
  assert.deepEqual({ settleCalls, publicationCalls, journalCalls, deliveryCalls }, {
    settleCalls: 1,
    publicationCalls: 1,
    journalCalls: 1,
    deliveryCalls: 0,
  });
  assert.deepEqual(harness.pairs.map(pair => pair.counts.parentSend), [1, 0]);

  const recovered = await harness.dispatcher.settle(
    structuredClone(original.paymentPayload),
    structuredClone(original.requirements),
    structuredClone(original.paymentRequired),
  );
  assert.equal(recovered.success, true);
  assert.equal(recovered.transaction, first.transaction);
  assert.equal(recovered.authorizationKey, first.authorizationKey);
  assert.deepEqual({ settleCalls, publicationCalls, journalCalls, deliveryCalls }, {
    settleCalls: 2,
    publicationCalls: 1,
    journalCalls: 2,
    deliveryCalls: 0,
  });
  assert.deepEqual(harness.pairs.map(pair => pair.counts.parentSend), [2, 0]);

  const postReconciliationReplacement = await harness.dispatcher.settle(
    replacement.paymentPayload,
    replacement.requirements,
    replacement.paymentRequired,
  );
  assert.equal(postReconciliationReplacement.success, true);
  assert.equal(settleCalls, 3);
  assert.deepEqual(harness.pairs.map(pair => pair.counts.parentSend), [3, 0]);
});

test('retention terminal replies preserve the parent same-payment guard', async t => {
  const { routing } = await routingFixture(t);
  const scenarios = [
    {
      name: 'UNKNOWN then terminal UNKNOWN',
      priorUnknown: true,
      terminalState: 'SUBMISSION_OUTCOME_UNKNOWN',
      originalCalls: 3,
    },
    {
      name: 'first terminal ACKNOWLEDGED',
      priorUnknown: false,
      terminalState: 'SUBMISSION_ACKNOWLEDGED',
      originalCalls: 2,
    },
    {
      name: 'first terminal UNKNOWN',
      priorUnknown: false,
      terminalState: 'SUBMISSION_OUTCOME_UNKNOWN',
      originalCalls: 2,
    },
    {
      name: 'first terminal VALIDATED',
      priorUnknown: false,
      terminalState: 'VALIDATED',
      originalCalls: 1,
    },
  ];

  for (const scenario of scenarios) await t.test(scenario.name, async subtest => {
    const { descriptors, original, replacement } = await signedReplacementFixture(routing);
    let settleCalls = 0;
    let journalCalls = 0;
    let publicationCalls = 0;
    let deliveryCalls = 0;
    const facilitator = facilitatorDouble({
      async settle(paymentPayload, requirements, required) {
        settleCalls += 1;
        journalCalls += 1;
        const input = { paymentPayload, requirements, paymentRequired: required };
        if (scenario.priorUnknown && settleCalls === 1) {
          publicationCalls += 1;
          return unknownResult(input);
        }
        return terminalResult(input, scenario.terminalState);
      },
      async markDeliveryPending() {
        deliveryCalls += 1;
        throw fixedFailure('UNEXPECTED_DELIVERY');
      },
      async markDelivered() {
        deliveryCalls += 1;
        throw fixedFailure('UNEXPECTED_DELIVERY');
      },
    });
    const harness = await localHarness(
      subtest,
      routing,
      [facilitator, facilitatorDouble()],
      { descriptors },
    );
    const results = [];
    for (let index = 0; index < scenario.originalCalls; index += 1) {
      results.push(await harness.dispatcher.settle(
        structuredClone(original.paymentPayload),
        structuredClone(original.requirements),
        structuredClone(original.paymentRequired),
      ));
    }
    const terminal = results.at(-1);
    assert.equal(terminal.errorReason, 'payment_reconciliation_terminal');
    assert.equal(terminal.retrySamePayment, false);
    assert.equal(terminal.state, scenario.terminalState);
    assert.equal(terminal.transaction, inputIdentity(original).transaction);
    assert.equal(terminal.authorizationKey, inputIdentity(original).authorizationKey);
    await assert.rejects(
      harness.dispatcher.settle(
        replacement.paymentPayload,
        replacement.requirements,
        replacement.paymentRequired,
      ),
      rejectsWith(DISPATCH_CODES.INVALID_REQUEST),
    );
    assert.deepEqual({ settleCalls, journalCalls, publicationCalls, deliveryCalls }, {
      settleCalls: scenario.originalCalls,
      journalCalls: scenario.originalCalls,
      publicationCalls: scenario.priorUnknown ? 1 : 0,
      deliveryCalls: 0,
    });
    assert.deepEqual(
      harness.pairs.map(pair => pair.counts.parentSend),
      [scenario.originalCalls, 0],
    );
  });
});

test('a persistent child rejects unresolved-payment replacement without poisoning exact recovery', async t => {
  const { routing } = await routingFixture(t);
  const descriptor = payerDescriptors(routing)[0];
  const original = syntheticInput(descriptor.payer, 'c'.repeat(64));
  const replacement = syntheticInput(descriptor.payer, 'd'.repeat(64));
  const channel = new EventEmitter();
  const sent = [];
  channel.send = (frame, callback) => {
    sent.push(JSON.parse(frame));
    callback();
    return true;
  };
  let settleCalls = 0;
  const facilitator = facilitatorDouble({
    async settle(paymentPayload, requirements, required) {
      settleCalls += 1;
      const input = { paymentPayload, requirements, paymentRequired: required };
      return settleCalls === 1 ? unknownResult(input) : includedResult(input);
    },
  });
  const controller = runFixedPayerSettlementChild({
    channel,
    facilitator,
    shardId: descriptor.shardId,
    payer: descriptor.payer,
    generation: descriptor.generation,
    maxOperations: 8,
  });
  t.after(() => channel.emit('disconnect'));

  channel.emit('message', settleRequestFrame(descriptor, original, 1));
  await new Promise(resolvePromise => setImmediate(resolvePromise));
  assert.equal(sent[0].ok, true);
  assert.equal(sent[0].result.state, 'SUBMISSION_OUTCOME_UNKNOWN');

  channel.emit('message', settleRequestFrame(descriptor, replacement, 2));
  await new Promise(resolvePromise => setImmediate(resolvePromise));
  assert.equal(sent[1].ok, false);
  assert.equal(sent[1].code, 'UNRESOLVED_PAYMENT');
  assert.equal(settleCalls, 1);
  assert.equal(await bounded(controller.done, 10), false);

  channel.emit('message', settleRequestFrame(descriptor, original, 3));
  await new Promise(resolvePromise => setImmediate(resolvePromise));
  assert.equal(sent[2].ok, true);
  assert.equal(sent[2].result.success, true);
  assert.equal(settleCalls, 2);
  channel.emit('message', settleRequestFrame(descriptor, replacement, 4));
  await new Promise(resolvePromise => setImmediate(resolvePromise));
  assert.equal(sent[3].ok, true);
  assert.equal(sent[3].result.success, true);
  assert.equal(settleCalls, 3);
  channel.emit('disconnect');
  assert.equal(await controller.done, 'DISCONNECTED');
});

test('retention terminal replies preserve the direct persistent child same-payment guard', async t => {
  const { routing } = await routingFixture(t);
  const scenarios = [
    {
      name: 'UNKNOWN then terminal UNKNOWN',
      priorUnknown: true,
      terminalState: 'SUBMISSION_OUTCOME_UNKNOWN',
      originalCalls: 3,
    },
    {
      name: 'first terminal ACKNOWLEDGED',
      priorUnknown: false,
      terminalState: 'SUBMISSION_ACKNOWLEDGED',
      originalCalls: 2,
    },
    {
      name: 'first terminal UNKNOWN',
      priorUnknown: false,
      terminalState: 'SUBMISSION_OUTCOME_UNKNOWN',
      originalCalls: 2,
    },
    {
      name: 'first terminal VALIDATED',
      priorUnknown: false,
      terminalState: 'VALIDATED',
      originalCalls: 1,
    },
  ];

  for (const scenario of scenarios) await t.test(scenario.name, async subtest => {
    const { descriptors, original, replacement } = await signedReplacementFixture(routing);
    const descriptor = descriptors[0];
    const channel = new EventEmitter();
    const sent = [];
    channel.send = (frame, callback) => {
      sent.push(JSON.parse(frame));
      callback();
      return true;
    };
    let settleCalls = 0;
    let journalCalls = 0;
    let publicationCalls = 0;
    let deliveryCalls = 0;
    const controller = runFixedPayerSettlementChild({
      channel,
      facilitator: facilitatorDouble({
        async settle(paymentPayload, requirements, required) {
          settleCalls += 1;
          journalCalls += 1;
          const input = { paymentPayload, requirements, paymentRequired: required };
          if (scenario.priorUnknown && settleCalls === 1) {
            publicationCalls += 1;
            return unknownResult(input);
          }
          return terminalResult(input, scenario.terminalState);
        },
        async markDeliveryPending() {
          deliveryCalls += 1;
          throw fixedFailure('UNEXPECTED_DELIVERY');
        },
        async markDelivered() {
          deliveryCalls += 1;
          throw fixedFailure('UNEXPECTED_DELIVERY');
        },
      }),
      shardId: descriptor.shardId,
      payer: descriptor.payer,
      generation: descriptor.generation,
      maxOperations: 8,
    });
    subtest.after(async () => {
      channel.emit('disconnect');
      await controller.done;
    });

    for (let index = 1; index <= scenario.originalCalls; index += 1) {
      channel.emit('message', settleRequestFrame(descriptor, original, index));
      await new Promise(resolvePromise => setImmediate(resolvePromise));
      assert.equal(sent[index - 1].ok, true);
    }
    const terminal = sent.at(-1).result;
    assert.equal(terminal.errorReason, 'payment_reconciliation_terminal');
    assert.equal(terminal.retrySamePayment, false);
    assert.equal(terminal.state, scenario.terminalState);
    assert.equal(terminal.transaction, inputIdentity(original).transaction);
    assert.equal(terminal.authorizationKey, inputIdentity(original).authorizationKey);

    channel.emit(
      'message',
      settleRequestFrame(descriptor, replacement, scenario.originalCalls + 1),
    );
    await new Promise(resolvePromise => setImmediate(resolvePromise));
    assert.equal(sent.at(-1).ok, false);
    assert.equal(sent.at(-1).code, 'UNRESOLVED_PAYMENT');
    assert.deepEqual({ settleCalls, journalCalls, publicationCalls, deliveryCalls }, {
      settleCalls: scenario.originalCalls,
      journalCalls: scenario.originalCalls,
      publicationCalls: scenario.priorUnknown ? 1 : 0,
      deliveryCalls: 0,
    });
    assert.equal(sent.length, scenario.originalCalls + 1);
    assert.equal(await bounded(controller.done, 10), false);
  });
});

test('post-dispatch timeout returns HTTP same-payment recovery and permanently seals that shard', async t => {
  const { routing } = await routingFixture(t);
  let payee;
  let accepted;
  let payloads;
  try {
    payee = syntheticKeyPair(252);
    accepted = requirement(payee.getAddress().toString());
    payloads = signedPayloadsByShard(routing, accepted);
  } finally {
    payee?.clear();
  }
  const pairs = payloads.map(() => endpointPair());
  const owners = payloads.map(() => new EventEmitter());
  const journals = payloads.map(() => Object.freeze({}));
  let publicationCalls = 0;
  pairs[0].parent.send = (_frame, callback) => {
    pairs[0].counts.parentSend += 1;
    publicationCalls += 1;
    callback();
    return true;
  };
  const descriptors = payloads.map((payload, index) => ({
    shardId: CONFIGURATION.shardIds[index],
    payer: payload.payload.transaction.address,
    generation: index === 0 ? 'fixture-generation-a' : 'fixture-generation-b',
  }));
  const dispatcher = createFixedPayerSettlementDispatcher({
    routing,
    shards: shardOptions(descriptors, pairs, owners, journals),
    requestTimeoutMs: 15,
    maxOperationsPerShard: 8,
  });
  const server = createResourceServer({
    facilitator: dispatcher,
    requirement: accepted,
    advertisedBaseUrl: 'https://127.0.0.1',
  });
  t.after(async () => {
    await server.close();
    const retired = dispatcher.retire();
    owners.forEach(owner => {
      owner.emit('exit', 0, null);
      owner.emit('close', 0, null);
    });
    await retired;
  });
  const listening = await server.listen();
  const first = await submit(listening.url, payloads[0]);
  assert.equal(first.status, 409);
  assert.deepEqual(await first.json(), {
    error: 'payment_outcome_unknown',
    action: 'reuse_and_reconcile_same_payment',
    transaction: payloads[0].payload.transaction.hash,
  });
  const retry = await submit(listening.url, payloads[0]);
  assert.equal(retry.status, 409);
  assert.equal((await retry.json()).action, 'reuse_and_reconcile_same_payment');
  assert.deepEqual(pairs.map(pair => pair.counts.parentSend), [1, 0]);
  assert.equal(publicationCalls, 1);

  const replacement = structuredClone(payloads[0]);
  replacement.payload.transaction.hash = 'e'.repeat(64);
  const replacementResponse = await submit(listening.url, replacement);
  assert.equal(replacementResponse.status, 500);
  assert.deepEqual(pairs.map(pair => pair.counts.parentSend), [1, 0]);
  assert.equal(publicationCalls, 1);
});

test('malformed inputs, frames, results and synchronous send(false) cannot succeed', async t => {
  const { routing } = await routingFixture(t);

  await t.test('accessor and oversized requests fail before a child method', async t => {
    const calls = { settle: 0 };
    const harness = await localHarness(t, routing, [facilitatorDouble({
      async settle() { calls.settle += 1; },
    }), facilitatorDouble()]);
    const selected = harness.descriptors[0];
    const input = syntheticInput(selected.payer, '5'.repeat(64));
    let getterCalls = 0;
    const accessor = {};
    Object.defineProperty(accessor, 'payload', {
      enumerable: true,
      get() { getterCalls += 1; throw new Error('private'); },
    });
    await assert.rejects(
      harness.dispatcher.settle(accessor, input.requirements, input.paymentRequired),
      rejectsWith(DISPATCH_CODES.INVALID_REQUEST),
    );
    const oversized = structuredClone(input.paymentPayload);
    oversized.payload.padding = 'x'.repeat(70_000);
    await assert.rejects(
      harness.dispatcher.settle(oversized, input.requirements, input.paymentRequired),
      rejectsWith(DISPATCH_CODES.INVALID_REQUEST),
    );
    assert.equal(getterCalls, 0);
    assert.equal(calls.settle, 0);
    assert.deepEqual(harness.pairs.map(pair => pair.counts.parentSend), [0, 0]);
  });

  await t.test('accessor, extra-key and oversized dependency results become recovery', async t => {
    const cases = [
      ['accessor', input => {
        let getterCalls = 0;
        const result = {};
        Object.defineProperty(result, 'success', {
          enumerable: true,
          get() { getterCalls += 1; throw new Error('private'); },
        });
        return { result, inspect: () => assert.equal(getterCalls, 0) };
      }],
      ['extra-key', input => ({ result: { ...includedResult(input), extra: true } })],
      ['oversized', input => ({
        result: { ...unknownResult(input), errorReason: 'x'.repeat(70_000) },
      })],
    ];
    for (const [name, build] of cases) await t.test(name, async t => {
      let inspection = () => {};
      const bad = facilitatorDouble({
        async settle(paymentPayload, requirements, required) {
          const built = build({ paymentPayload, requirements, paymentRequired: required });
          inspection = built.inspect ?? inspection;
          return built.result;
        },
      });
      const harness = await localHarness(t, routing, [bad, facilitatorDouble()]);
      const input = syntheticInput(harness.descriptors[0].payer, '6'.repeat(64));
      const result = await harness.dispatcher.settle(
        input.paymentPayload,
        input.requirements,
        input.paymentRequired,
      );
      assert.equal(result.success, false);
      assert.equal(result.state, 'SUBMISSION_OUTCOME_UNKNOWN');
      assert.equal(result.retrySamePayment, true);
      inspection();
      assert.deepEqual(harness.pairs.map(pair => pair.counts.parentSend), [1, 0]);
    });
  });

  await t.test('legacy, correlation-mismatched and object frames seal the selected shard', async t => {
    for (const mode of ['legacy-v1', 'correlation', 'object']) await t.test(mode, async () => {
      const descriptors = payerDescriptors(routing);
      const pairs = descriptors.map(() => endpointPair());
      const owners = descriptors.map(() => new EventEmitter());
      const journals = descriptors.map(() => Object.freeze({}));
      let getterCalls = 0;
      pairs[0].parent.send = (frame, callback) => {
        pairs[0].counts.parentSend += 1;
        const request = JSON.parse(frame);
        if (mode === 'object') {
          const hostile = {};
          Object.defineProperty(hostile, 'toJSON', {
            enumerable: true,
            get() { getterCalls += 1; throw new Error('private'); },
          });
          pairs[0].parent.emit('message', hostile);
        } else {
          pairs[0].parent.emit('message', JSON.stringify({
            ipcVersion: mode === 'legacy-v1' ? 1 : 2,
            type: 'RESULT',
            correlationId: mode === 'correlation'
              ? 'wrong-correlation'
              : request.correlationId,
            shardId: request.shardId,
            payer: request.payer,
            generation: request.generation,
            sequence: request.sequence,
            operation: request.type,
            ok: true,
            result: includedResult(syntheticInput(request.payer, request.transaction)),
          }));
        }
        callback();
        return true;
      };
      const dispatcher = createFixedPayerSettlementDispatcher({
        routing,
        shards: shardOptions(descriptors, pairs, owners, journals),
        requestTimeoutMs: 50,
        maxOperationsPerShard: 8,
      });
      const input = syntheticInput(descriptors[0].payer, '7'.repeat(64));
      const result = await dispatcher.settle(
        input.paymentPayload,
        input.requirements,
        input.paymentRequired,
      );
      assert.equal(result.state, 'SUBMISSION_OUTCOME_UNKNOWN');
      assert.equal(getterCalls, 0);
      assert.deepEqual(pairs.map(pair => pair.counts.parentSend), [1, 0]);
      const retired = dispatcher.retire();
      owners.forEach(owner => owner.emit('close', 0, null));
      await retired;
    });
  });

  await t.test('send(false) wins over a synchronous successful callback', async () => {
    const descriptors = payerDescriptors(routing);
    const pairs = descriptors.map(() => endpointPair());
    const owners = descriptors.map(() => new EventEmitter());
    const journals = descriptors.map(() => Object.freeze({}));
    let possibleEffects = 0;
    pairs[0].parent.send = (_frame, callback) => {
      pairs[0].counts.parentSend += 1;
      possibleEffects += 1;
      callback();
      return false;
    };
    const dispatcher = createFixedPayerSettlementDispatcher({
      routing,
      shards: shardOptions(descriptors, pairs, owners, journals),
      requestTimeoutMs: 50,
      maxOperationsPerShard: 8,
    });
    const input = syntheticInput(descriptors[0].payer, '8'.repeat(64));
    const first = await dispatcher.settle(
      input.paymentPayload,
      input.requirements,
      input.paymentRequired,
    );
    const retry = await dispatcher.settle(
      input.paymentPayload,
      input.requirements,
      input.paymentRequired,
    );
    assert.equal(first.state, 'SUBMISSION_OUTCOME_UNKNOWN');
    assert.equal(retry.state, 'SUBMISSION_OUTCOME_UNKNOWN');
    assert.equal(possibleEffects, 1);
    assert.deepEqual(pairs.map(pair => pair.counts.parentSend), [1, 0]);
    const retired = dispatcher.retire();
    owners.forEach(owner => owner.emit('close', 0, null));
    await retired;
  });
});

test('child listener construction is transactional under synchronous terminal reentry', async t => {
  const { routing } = await routingFixture(t);
  const descriptor = payerDescriptors(routing)[0];
  const payer = descriptor.payer;
  const setupInput = syntheticInput(payer, '9'.repeat(64));

  await t.test('valid SETTLE then registration throw', async () => {
    const channel = new EventEmitter();
    const inheritedOn = EventEmitter.prototype.on;
    const sent = [];
    let resolveSettlement;
    const settlement = new Promise(resolvePromise => { resolveSettlement = resolvePromise; });
    let reentered = false;
    channel.on = function throwingAfterRequest(event, listener) {
      Reflect.apply(inheritedOn, this, [event, listener]);
      if (!reentered && event === 'message') {
        reentered = true;
        listener(settleRequestFrame(descriptor, setupInput, 1));
      }
      if (event === 'disconnect') throw fixedFailure('LISTENER_DIAGNOSTIC');
      return this;
    };
    channel.send = (frame, callback) => {
      sent.push(frame);
      callback();
      return true;
    };
    const effects = { settle: 0, journal: 0, publication: 0, pending: 0, delivered: 0 };
    let thrown;
    try {
      runFixedPayerSettlementChild({
        channel,
        facilitator: facilitatorDouble({
          async settle() {
            effects.settle += 1;
            effects.journal += 1;
            effects.publication += 1;
            return settlement;
          },
          async markDeliveryPending() { effects.pending += 1; },
          async markDelivered() { effects.delivered += 1; },
        }),
        shardId: descriptor.shardId,
        payer,
        generation: descriptor.generation,
        maxOperations: 8,
      });
    } catch (error) {
      thrown = error;
    }
    assert.equal(thrown?.code, 'FIXED_PAYER_SETTLEMENT_CHILD_INVALID_DEPENDENCY');
    assert.deepEqual({
      message: channel.listenerCount('message'),
      disconnect: channel.listenerCount('disconnect'),
      error: channel.listenerCount('error'),
    }, { message: 0, disconnect: 0, error: 0 });
    resolveSettlement(includedResult(setupInput));
    await new Promise(resolvePromise => setImmediate(resolvePromise));
    await new Promise(resolvePromise => setImmediate(resolvePromise));
    assert.deepEqual(effects, {
      settle: 0,
      journal: 0,
      publication: 0,
      pending: 0,
      delivered: 0,
    });
    assert.equal(sent.length, 0);
  });

  await t.test('valid SETTLE then registration disconnect', async () => {
    const channel = new EventEmitter();
    const inheritedOn = EventEmitter.prototype.on;
    const sent = [];
    let resolveSettlement;
    const settlement = new Promise(resolvePromise => { resolveSettlement = resolvePromise; });
    let reentered = false;
    channel.on = function disconnectingAfterRequest(event, listener) {
      Reflect.apply(inheritedOn, this, [event, listener]);
      if (!reentered && event === 'message') {
        reentered = true;
        listener(settleRequestFrame(descriptor, setupInput, 1));
      } else if (event === 'disconnect') {
        listener();
      }
      return this;
    };
    channel.send = (frame, callback) => {
      sent.push(frame);
      callback();
      return true;
    };
    const effects = { settle: 0, journal: 0, publication: 0, pending: 0, delivered: 0 };
    const controller = runFixedPayerSettlementChild({
      channel,
      facilitator: facilitatorDouble({
        async settle() {
          effects.settle += 1;
          effects.journal += 1;
          effects.publication += 1;
          return settlement;
        },
        async markDeliveryPending() { effects.pending += 1; },
        async markDelivered() { effects.delivered += 1; },
      }),
      shardId: descriptor.shardId,
      payer,
      generation: descriptor.generation,
      maxOperations: 8,
    });
    let completions = 0;
    void controller.done.then(() => { completions += 1; });
    assert.equal(await controller.done, 'DISCONNECTED');
    resolveSettlement(includedResult(setupInput));
    await new Promise(resolvePromise => setImmediate(resolvePromise));
    await new Promise(resolvePromise => setImmediate(resolvePromise));
    assert.deepEqual(effects, {
      settle: 0,
      journal: 0,
      publication: 0,
      pending: 0,
      delivered: 0,
    });
    assert.equal(sent.length, 0);
    assert.deepEqual({
      message: channel.listenerCount('message'),
      disconnect: channel.listenerCount('disconnect'),
      error: channel.listenerCount('error'),
    }, { message: 0, disconnect: 0, error: 0 });
    assert.equal(completions, 1);
  });

  await t.test('duplicate valid SETTLE during registration', async () => {
    const channel = new EventEmitter();
    const inheritedOn = EventEmitter.prototype.on;
    const sent = [];
    let resolveSettlement;
    const settlement = new Promise(resolvePromise => { resolveSettlement = resolvePromise; });
    channel.on = function duplicatingRequest(event, listener) {
      Reflect.apply(inheritedOn, this, [event, listener]);
      if (event === 'message') {
        const frame = settleRequestFrame(descriptor, setupInput, 1);
        listener(frame);
        listener(frame);
      }
      return this;
    };
    channel.send = (frame, callback) => {
      sent.push(frame);
      callback();
      return true;
    };
    let settleCalls = 0;
    const controller = runFixedPayerSettlementChild({
      channel,
      facilitator: facilitatorDouble({
        async settle() {
          settleCalls += 1;
          return settlement;
        },
      }),
      shardId: descriptor.shardId,
      payer,
      generation: descriptor.generation,
      maxOperations: 8,
    });
    let completions = 0;
    void controller.done.then(() => { completions += 1; });
    assert.equal(await controller.done, 'DUPLICATE_REQUEST');
    resolveSettlement(includedResult(setupInput));
    await new Promise(resolvePromise => setImmediate(resolvePromise));
    assert.equal(settleCalls, 0);
    assert.equal(sent.length, 0);
    assert.deepEqual({
      message: channel.listenerCount('message'),
      disconnect: channel.listenerCount('disconnect'),
      error: channel.listenerCount('error'),
    }, { message: 0, disconnect: 0, error: 0 });
    assert.equal(completions, 1);
  });

  for (const mode of ['message', 'disconnect']) await t.test(mode, async () => {
    const channel = new EventEmitter();
    const inheritedOn = EventEmitter.prototype.on;
    const sent = [];
    let reentered = false;
    channel.on = function reentrantOn(event, listener) {
      Reflect.apply(inheritedOn, this, [event, listener]);
      if (!reentered && event === mode) {
        reentered = true;
        if (event === 'message') listener('{}');
        else listener();
      }
      return this;
    };
    channel.send = (frame, callback) => {
      sent.push(frame);
      callback();
      return true;
    };
    const effects = { settle: 0, pending: 0, delivered: 0 };
    const controller = runFixedPayerSettlementChild({
      channel,
      facilitator: facilitatorDouble({
        async settle() { effects.settle += 1; },
        async markDeliveryPending() { effects.pending += 1; },
        async markDelivered() { effects.delivered += 1; },
      }),
      shardId: CONFIGURATION.shardIds[0],
      payer,
      generation: 'fixture-generation-a',
      maxOperations: 8,
    });
    let completions = 0;
    void controller.done.then(() => { completions += 1; });
    assert.equal(
      await controller.done,
      mode === 'message' ? 'INVALID_REQUEST' : 'DISCONNECTED',
    );
    await new Promise(resolvePromise => setImmediate(resolvePromise));
    assert.deepEqual(effects, { settle: 0, pending: 0, delivered: 0 });
    assert.deepEqual({
      message: channel.listenerCount('message'),
      disconnect: channel.listenerCount('disconnect'),
      error: channel.listenerCount('error'),
    }, { message: 0, disconnect: 0, error: 0 });
    assert.equal(sent.length, mode === 'message' ? 1 : 0);
    assert.equal(completions, 1);
  });

  await t.test('registration throw', () => {
    const channel = new EventEmitter();
    const inheritedOn = EventEmitter.prototype.on;
    channel.on = function throwingOn(event, listener) {
      Reflect.apply(inheritedOn, this, [event, listener]);
      if (event === 'disconnect') throw fixedFailure('LISTENER_DIAGNOSTIC');
      return this;
    };
    channel.send = () => { throw fixedFailure('UNEXPECTED_SEND'); };
    assert.throws(() => runFixedPayerSettlementChild({
      channel,
      facilitator: facilitatorDouble(),
      shardId: CONFIGURATION.shardIds[0],
      payer,
      generation: 'fixture-generation-a',
      maxOperations: 8,
    }), error => error?.code === 'FIXED_PAYER_SETTLEMENT_CHILD_INVALID_DEPENDENCY');
    assert.deepEqual({
      message: channel.listenerCount('message'),
      disconnect: channel.listenerCount('disconnect'),
      error: channel.listenerCount('error'),
    }, { message: 0, disconnect: 0, error: 0 });
  });
});

test('the child rejects malformed request frames before any dependency call', async t => {
  const { routing } = await routingFixture(t);
  const payer = payerDescriptors(routing)[0].payer;
  const cases = ['legacy-v1', 'extra-key', 'accessor-frame'];
  for (const name of cases) await t.test(name, async () => {
    const channel = new EventEmitter();
    const sent = [];
    channel.send = (frame, callback) => {
      sent.push(frame);
      callback();
      return true;
    };
    let calls = 0;
    let getterCalls = 0;
    const controller = runFixedPayerSettlementChild({
      channel,
      facilitator: facilitatorDouble({
        async settle() { calls += 1; },
      }),
      shardId: CONFIGURATION.shardIds[0],
      payer,
      generation: 'fixture-generation-a',
      maxOperations: 8,
    });
    if (name === 'legacy-v1') {
      const legacy = JSON.parse(settleRequestFrame(
        {
          shardId: CONFIGURATION.shardIds[0],
          payer,
          generation: 'fixture-generation-a',
        },
        syntheticInput(payer, '9'.repeat(64)),
        1,
      ));
      legacy.ipcVersion = 1;
      channel.emit('message', JSON.stringify(legacy));
    } else if (name === 'extra-key') {
      channel.emit('message', JSON.stringify({
        ipcVersion: 2,
        type: 'SETTLE',
        correlationId: 'fixture-generation-a:payer-shard-a:1',
        shardId: CONFIGURATION.shardIds[0],
        payer,
        generation: 'fixture-generation-a',
        sequence: 1,
        transaction: '9'.repeat(64),
        authorizationKey: 'a'.repeat(64),
        network: 'zenon:testnet',
        body: {},
        extra: true,
      }));
    } else {
      const frame = {};
      Object.defineProperty(frame, 'toJSON', {
        enumerable: true,
        get() { getterCalls += 1; throw new Error('private'); },
      });
      channel.emit('message', frame);
    }
    assert.equal(await controller.done, 'INVALID_REQUEST');
    assert.equal(calls, 0);
    assert.equal(getterCalls, 0);
    assert.equal(sent.length, 1);
    assert.deepEqual(JSON.parse(sent[0]), {
      ipcVersion: 2,
      type: 'PROTOCOL_ERROR',
      code: 'INVALID_REQUEST',
    });
  });
});

test('delivery requires the child-owned transaction and authorization binding', async t => {
  const { routing } = await routingFixture(t);
  let deliveryEffects = 0;
  const guarded = facilitatorDouble({
    async markDeliveryPending(settlement) {
      deliveryEffects += 1;
      return {
        authorizationKey: settlement.authorizationKey,
        payer: settlement.payer,
        transactionHash: settlement.transaction,
        deliveryState: 'DELIVERY_PENDING',
        deliveryClaimed: true,
      };
    },
  });
  const harness = await localHarness(t, routing, [guarded, facilitatorDouble()]);
  const input = syntheticInput(harness.descriptors[0].payer, 'a'.repeat(64));
  const settlement = await harness.dispatcher.settle(
    input.paymentPayload,
    input.requirements,
    input.paymentRequired,
  );
  await assert.rejects(
    harness.dispatcher.markDeliveryPending({
      ...settlement,
      transaction: 'b'.repeat(64),
    }, input.requirements),
    rejectsWith(DISPATCH_CODES.SHARD_QUARANTINED),
  );
  assert.equal(deliveryEffects, 0);
  assert.deepEqual(harness.pairs.map(pair => pair.counts.parentSend), [2, 0]);
  await assert.rejects(
    harness.dispatcher.markDelivered(settlement, {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: { ok: true },
    }),
    rejectsWith(DISPATCH_CODES.SHARD_QUARANTINED),
  );
  assert.deepEqual(harness.pairs.map(pair => pair.counts.parentSend), [2, 0]);
});

test('delivery rejects a changed accepted requirement before dependency or journal effects', async t => {
  const { routing } = await routingFixture(t);
  const effects = { settlement: 0, publication: 0, delivery: 0, journal: 0 };
  const guarded = facilitatorDouble({
    async settle(paymentPayload, requirements, required) {
      effects.settlement += 1;
      effects.publication += 1;
      return includedResult({ paymentPayload, requirements, paymentRequired: required });
    },
    async markDeliveryPending(settlement) {
      effects.delivery += 1;
      effects.journal += 1;
      return {
        authorizationKey: settlement.authorizationKey,
        payer: settlement.payer,
        transactionHash: settlement.transaction,
        deliveryState: 'DELIVERY_PENDING',
        deliveryClaimed: true,
      };
    },
  });
  const harness = await localHarness(t, routing, [guarded, facilitatorDouble()]);
  const input = syntheticInput(harness.descriptors[0].payer, 'e'.repeat(64));
  const settlement = await harness.dispatcher.settle(
    input.paymentPayload,
    input.requirements,
    input.paymentRequired,
  );
  const effectsBeforeMismatch = structuredClone(effects);
  const changedRequirement = structuredClone(input.requirements);
  changedRequirement.amount = '2';
  await assert.rejects(
    harness.dispatcher.markDeliveryPending(settlement, changedRequirement),
    rejectsWith(DISPATCH_CODES.SHARD_QUARANTINED),
  );
  assert.deepEqual(effects, effectsBeforeMismatch);
  assert.deepEqual(effects, {
    settlement: 1,
    publication: 1,
    delivery: 0,
    journal: 0,
  });
  assert.deepEqual(harness.pairs.map(pair => pair.counts.parentSend), [2, 0]);
});

test('retirement observes exact supplied-owner close; exit alone is not completion', async t => {
  const { routing } = await routingFixture(t);
  const descriptors = payerDescriptors(routing);
  const pairs = descriptors.map(() => endpointPair());
  const owners = descriptors.map(() => new EventEmitter());
  const journals = descriptors.map(() => Object.freeze({}));
  const dispatcher = createFixedPayerSettlementDispatcher({
    routing,
    shards: shardOptions(descriptors, pairs, owners, journals),
    requestTimeoutMs: 100,
    maxOperationsPerShard: 8,
  });
  const retirement = dispatcher.retire();
  let retired = false;
  retirement.then(() => { retired = true; });
  owners.forEach(owner => owner.emit('exit', 0, null));
  await new Promise(resolvePromise => setImmediate(resolvePromise));
  assert.equal(retired, false);
  assert.deepEqual(dispatcher.retirementStatus().map(status => ({
    exitObserved: status.exitObserved,
    closeObserved: status.closeObserved,
  })), [
    { exitObserved: true, closeObserved: false },
    { exitObserved: true, closeObserved: false },
  ]);
  owners[0].emit('close', 0, null);
  await new Promise(resolvePromise => setImmediate(resolvePromise));
  assert.equal(retired, false);
  owners[1].emit('close', 0, null);
  await retirement;
  assert.equal(retired, true);
  assert.equal(dispatcher.retirementStatus().every(status => status.closeObserved), true);
  assert.equal(Object.hasOwn(dispatcher, 'replace'), false);
  assert.equal(Object.hasOwn(dispatcher, 'clearQuarantine'), false);
});
