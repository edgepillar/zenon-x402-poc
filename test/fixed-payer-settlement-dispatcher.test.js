import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  chmod,
  lstat,
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
const [dispatcherModule, childModule] = await Promise.all([dispatcherImport, childImport]);
const {
  FIXED_PAYER_SETTLEMENT_DISPATCHER_ERROR_CODES: DISPATCH_CODES,
  FixedPayerSettlementDispatcherError,
  createFixedPayerSettlementDispatcher,
} = dispatcherModule;
const { runFixedPayerSettlementChild } = childModule;

const CHILD_ENTRYPOINT = fileURLToPath(new URL(
  '../test-support/fixed-payer-settlement-child.js',
  import.meta.url,
));
const EXECUTABLE = process.execPath;
const FIXTURE_NAME = 'signed-payment.json';
const PUBLICATION_MARKER = 'PUBLICATION_BOUNDARY';
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

function manifestText() {
  return `${JSON.stringify(CONFIGURATION)}\n`;
}

function manifestFingerprint(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

async function createPrivateRoot(prefix) {
  const root = await mkdtemp(join(await realpath(tmpdir()), prefix));
  await chmod(root, 0o700);
  return root;
}

async function createRoutingRoot(prefix = 'fixed-payer-dispatch-routing-') {
  const root = await createPrivateRoot(prefix);
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

function signedPayment(keyPair, accepted, nonce) {
  const required = paymentRequired(accepted);
  const block = sdk.AccountBlockTemplate.send(
    sdk.Address.parse(accepted.payTo),
    sdk.TokenStandard.parse(accepted.asset),
    BigInt(accepted.amount),
  );
  block.chainIdentifier = Number(accepted.extra.zenonChain.chainIdentifier);
  block.address = keyPair.getAddress();
  block.height = 1;
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
    ipcVersion: 1,
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

function launchChild(label, root) {
  const child = spawn(EXECUTABLE, [CHILD_ENTRYPOINT, label, root], {
    env: Object.create(null),
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  });
  let stdout = '';
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let markerSeen = false;
  let expectedClose = false;
  let exited = false;
  let closed = false;
  let closeClean = false;
  let failure = null;
  let resolveMarker;
  let rejectMarker;
  let resolveClosed;
  let resolveExited;
  const publicationWatchdog = setTimeout(() => fail('CHILD_PUBLICATION_TIMEOUT'), 10_000);
  publicationWatchdog.unref();
  const publication = new Promise((resolvePromise, rejectPromise) => {
    resolveMarker = resolvePromise;
    rejectMarker = rejectPromise;
  });
  const closedPromise = new Promise(resolvePromise => { resolveClosed = resolvePromise; });
  const exitedPromise = new Promise(resolvePromise => { resolveExited = resolvePromise; });
  void publication.catch(() => {});
  const fail = code => {
    if (failure !== null) return;
    failure = fixedFailure(code);
    if (!markerSeen) rejectMarker(failure);
  };
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
      if (line !== PUBLICATION_MARKER || markerSeen) {
        fail('CHILD_PROTOCOL');
        return;
      }
      markerSeen = true;
      clearTimeout(publicationWatchdog);
      resolveMarker();
    }
  });
  child.stderr.on('data', chunk => {
    stderrBytes += chunk.length;
    fail(stderrBytes > 128 ? 'CHILD_STDERR_LIMIT' : 'CHILD_STDERR');
  });
  child.stdout.on('error', () => fail('CHILD_STDOUT'));
  child.stderr.on('error', () => fail('CHILD_STDERR'));
  child.once('error', () => fail('CHILD_SPAWN'));
  child.once('exit', () => {
    exited = true;
    resolveExited();
  });
  child.once('close', (code, signal) => {
    clearTimeout(publicationWatchdog);
    closed = true;
    closeClean = expectedClose && code === 0 && signal === null && failure === null &&
      markerSeen && stdout.length === 0;
    if (!expectedClose || !closeClean) fail('CHILD_CLOSE');
    if (!markerSeen) rejectMarker(failure ?? fixedFailure('CHILD_INCOMPLETE'));
    resolveClosed();
  });
  return {
    child,
    publication,
    journalIdentity: Object.freeze({}),
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

test('dispatcher and child imports are inert and explicitly opt in', () => {
  assert.equal(typeof createFixedPayerSettlementDispatcher, 'function');
  assert.equal(typeof runFixedPayerSettlementChild, 'function');
  assert.deepEqual({
    message: process.listenerCount('message'),
    disconnect: process.listenerCount('disconnect'),
    exit: process.listenerCount('exit'),
  }, parentListenersBeforeImport);
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

    children.push(launchChild('A', childRoots[0]));
    children.push(launchChild('B', childRoots[1]));
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

test('an explicit UNKNOWN retries the identical payment on the same child and then delivers there', async t => {
  const { routing } = await routingFixture(t);
  let settleCalls = 0;
  let publicationCalls = 0;
  let pendingCalls = 0;
  let deliveredCalls = 0;
  const recovering = facilitatorDouble({
    async settle(paymentPayload, requirements, required) {
      settleCalls += 1;
      const input = { paymentPayload, requirements, paymentRequired: required };
      if (settleCalls === 1) {
        publicationCalls += 1;
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

  await t.test('correlation mismatch and object frames seal the selected shard', async t => {
    for (const mode of ['correlation', 'object']) await t.test(mode, async () => {
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
            ipcVersion: 1,
            type: 'RESULT',
            correlationId: 'wrong-correlation',
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
  const cases = ['extra-key', 'accessor-frame'];
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
    if (name === 'extra-key') {
      channel.emit('message', JSON.stringify({
        ipcVersion: 1,
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
      ipcVersion: 1,
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
