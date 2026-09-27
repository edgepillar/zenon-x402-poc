import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { lstat, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import * as sdk from 'znn-typescript-sdk';
import { paymentIntentDigest } from '../src/canonical.js';
import { EVIDENCE_STATES, SettlementJournal } from '../src/settlement-journal.js';
import { computeBlockHash, preflightZenonPayment } from '../src/zenon-payment.js';

const CHILD = fileURLToPath(new URL(
  '../test-support/exact-zenon-settle-prepublication-child.js',
  import.meta.url,
));
const EXECUTABLE = process.execPath;
const FIXTURE_NAME = 'signed-payment.json';
const MAX_FIXTURE_BYTES = 16_384;
const MARKER = 'PUBLISH_STUB_REACHED';
const PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: '7'.repeat(64),
});
const RESOURCE = Object.freeze({
  url: 'https://resource.example/paid',
  description: 'Zenon x402 PoC protected resource',
  mimeType: 'application/json',
});

function fixedFailure(code) {
  const error = new Error(code);
  error.name = 'PrepublicationProofError';
  error.stack = `PrepublicationProofError: ${code}`;
  return error;
}

function requireProof(condition, code) {
  if (!condition) throw fixedFailure(code);
}

function bounded(promise, milliseconds) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), milliseconds);
    promise.then(() => { clearTimeout(timer); resolve(true); });
  });
}

function syntheticKeyPair(fill) {
  const privateKey = Buffer.alloc(32, fill);
  try {
    return sdk.KeyPair.fromPrivateKey(privateKey);
  } finally {
    privateKey.fill(0);
  }
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

function paymentRequired(accepted) {
  return {
    x402Version: 2,
    resource: { ...RESOURCE },
    accepts: [accepted],
  };
}

function signedPayment(keyPair, accepted) {
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
  block.nonce = '0000000000000000';
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

function signedPayloads() {
  let first;
  let second;
  try {
    first = syntheticKeyPair(71);
    const firstAddress = first.getAddress().toString();
    second = syntheticKeyPair(73);
    const secondAddress = second.getAddress().toString();
    const firstPayload = signedPayment(first, requirement(secondAddress));
    first.clear();
    first = undefined;
    const secondPayload = signedPayment(second, requirement(firstAddress));
    second.clear();
    second = undefined;
    return [firstPayload, secondPayload];
  } finally {
    try {
      first?.clear();
    } finally {
      second?.clear();
    }
  }
}

function settlementInput(paymentPayload) {
  const requirements = paymentPayload.accepted;
  return {
    paymentPayload,
    requirements,
    paymentRequired: {
      x402Version: paymentPayload.x402Version,
      resource: paymentPayload.resource,
      accepts: [requirements],
    },
  };
}

async function writeFixture(root, paymentPayload) {
  const fixture = join(root, FIXTURE_NAME);
  const encoded = Buffer.from(JSON.stringify(paymentPayload), 'utf8');
  try {
    requireProof(encoded.length > 0 && encoded.length <= MAX_FIXTURE_BYTES, 'FIXTURE_SIZE');
    await writeFile(fixture, encoded, { flag: 'wx', mode: 0o600 });
  } finally {
    encoded.fill(0);
  }
  const [rootState, fixtureState] = await Promise.all([lstat(root), lstat(fixture)]);
  requireProof(rootState.isDirectory() && (rootState.mode & 0o777) === 0o700,
    'ROOT_NOT_PRIVATE');
  requireProof(fixtureState.isFile() && fixtureState.nlink === 1 &&
    (fixtureState.mode & 0o777) === 0o600 && fixtureState.size > 0 &&
    fixtureState.size <= MAX_FIXTURE_BYTES, 'FIXTURE_NOT_PRIVATE');
  return fixture;
}

function launch(label, root) {
  const child = spawn(EXECUTABLE, [CHILD, label, root], {
    env: Object.create(null),
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let resolveMarker;
  let rejectMarker;
  let resolveClosed;
  const marker = new Promise((resolve, reject) => {
    resolveMarker = resolve;
    rejectMarker = reject;
  });
  const closedPromise = new Promise(resolve => { resolveClosed = resolve; });
  void marker.catch(() => {});
  let stdout = '';
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let reached = false;
  let closed = false;
  let stopping = false;
  let failure = null;
  let killTimer;

  const terminate = () => {
    if (closed || stopping) return;
    stopping = true;
    try { child.kill('SIGTERM'); } catch {}
    killTimer = setTimeout(() => { if (!closed) try { child.kill('SIGKILL'); } catch {} }, 300);
    killTimer.unref();
  };
  const fail = code => {
    if (failure === null) {
      failure = fixedFailure(code);
      if (!reached) rejectMarker(failure);
    }
    terminate();
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
      if (line !== MARKER || reached) {
        fail('CHILD_PROTOCOL');
        return;
      }
      reached = true;
      resolveMarker();
    }
    if (reached && stdout.length !== 0) fail('CHILD_PROTOCOL');
  });
  child.stderr.on('data', chunk => {
    stderrBytes += chunk.length;
    fail(stderrBytes > 128 ? 'CHILD_STDERR_LIMIT' : 'CHILD_STDERR');
  });
  child.stdout.on('error', () => fail('CHILD_STDOUT'));
  child.stderr.on('error', () => fail('CHILD_STDERR'));
  child.once('error', () => fail('CHILD_SPAWN'));
  const watchdog = setTimeout(() => fail('CHILD_WATCHDOG'), 30_000);
  watchdog.unref();
  child.once('close', () => {
    closed = true;
    clearTimeout(watchdog);
    clearTimeout(killTimer);
    if (!stopping && failure === null) failure = fixedFailure(
      reached ? 'CHILD_EARLY_EXIT' : 'CHILD_INCOMPLETE',
    );
    if (!reached) rejectMarker(failure ?? fixedFailure('CHILD_INCOMPLETE'));
    resolveClosed();
  });

  return {
    identity: child.pid,
    marker,
    assertWaiting() {
      if (failure !== null) throw failure;
      requireProof(reached && !closed && !stopping, 'CHILD_NOT_WAITING');
    },
    async stop() {
      clearTimeout(watchdog);
      if (!closed) {
        stopping = true;
        try { child.kill('SIGTERM'); } catch {}
      }
      if (await bounded(closedPromise, 1_500)) return;
      try { child.kill('SIGKILL'); } catch {}
      if (!await bounded(closedPromise, 1_000)) throw fixedFailure('CHILD_REAP_TIMEOUT');
    },
  };
}

async function expectedAttempt(paymentPayload) {
  const input = settlementInput(paymentPayload);
  try {
    return await preflightZenonPayment(
      input.paymentPayload,
      input.requirements,
      input.paymentRequired,
    );
  } catch {
    throw fixedFailure('FIXTURE_PREFLIGHT');
  }
}

async function verifyJournal(root, expected, other) {
  const directory = join(root, 'journal');
  let state;
  let entries;
  try {
    state = await lstat(directory);
    entries = await new SettlementJournal({
      directory,
      allowedRoot: root,
      existingOnly: true,
    }).list({ includeTombstones: true });
  } catch {
    throw fixedFailure('JOURNAL_READ');
  }
  requireProof(state.isDirectory() && (state.mode & 0o777) === 0o700, 'JOURNAL_NOT_PRIVATE');
  requireProof(entries.records.length === 1 && entries.tombstones.length === 0,
    'JOURNAL_CARDINALITY');
  const record = entries.records[0];
  const actualIdentity = {
    authorizationKey: record.authorizationKey,
    transactionHash: record.transactionHash,
    chainProfile: record.chainProfile,
    intentDigest: record.intentDigest,
    resourceIdentity: record.resourceIdentity,
    resourceDigest: record.resourceDigest,
    payer: record.payer,
    signedAccountBlock: record.signedAccountBlock,
  };
  const expectedIdentity = {
    authorizationKey: expected.authorizationKey,
    transactionHash: expected.transactionHash,
    chainProfile: expected.chainProfile,
    intentDigest: expected.intentDigest,
    resourceIdentity: expected.resourceIdentity,
    resourceDigest: expected.resourceDigest,
    payer: expected.payer,
    signedAccountBlock: expected.signedAccountBlock,
  };
  requireProof(isDeepStrictEqual(actualIdentity, expectedIdentity), 'JOURNAL_WRONG_TRANSACTION');
  requireProof(record.transactionHash !== other.transactionHash && record.payer !== other.payer,
    'JOURNAL_CROSS_PAYER');
  requireProof(record.evidenceState === EVIDENCE_STATES.VALIDATED &&
    record.momentumEvidence === null && record.deliveryState === 'NONE' &&
    record.cachedResponse === null, 'JOURNAL_NOT_VALIDATED');
}

async function cleanup(children, fixtures, roots) {
  const stopped = await Promise.allSettled(children.map(child => child.stop()));
  if (stopped.some(outcome => outcome.status !== 'fulfilled')) {
    throw fixedFailure('CHILD_CLEANUP_FAILED');
  }
  const removedFixtures = await Promise.allSettled(fixtures.map(fixture => rm(fixture, {
    force: true,
  })));
  if (removedFixtures.some(outcome => outcome.status !== 'fulfilled')) {
    throw fixedFailure('FIXTURE_CLEANUP_FAILED');
  }
  const removedRoots = await Promise.allSettled(roots.map(root => rm(root, {
    recursive: true,
    force: true,
  })));
  if (removedRoots.some(outcome => outcome.status !== 'fulfilled')) {
    throw fixedFailure('TEMP_CLEANUP_FAILED');
  }
}

test('two directly spawned payer processes with separate journals overlap at the durable ' +
  'VALIDATED pre-publication settle boundary', async () => {
  const roots = [];
  const fixtures = [];
  const children = [];
  let workFailure = null;
  let cleanupFailure = null;
  try {
    roots.push(await mkdtemp(join(tmpdir(), 'zenon-x402-settle-overlap-a-')));
    roots.push(await mkdtemp(join(tmpdir(), 'zenon-x402-settle-overlap-b-')));
    const payloads = signedPayloads();
    const expected = await Promise.all(payloads.map(expectedAttempt));
    requireProof(expected[0].payer !== expected[1].payer &&
      expected[0].transactionHash !== expected[1].transactionHash, 'FIXTURES_NOT_DISTINCT');
    fixtures.push(await writeFixture(roots[0], payloads[0]));
    fixtures.push(await writeFixture(roots[1], payloads[1]));

    children.push(launch('A', roots[0]));
    children.push(launch('B', roots[1]));
    await Promise.all(children.map(child => child.marker));
    children.forEach(child => child.assertWaiting());
    requireProof(Number.isSafeInteger(children[0].identity) &&
      Number.isSafeInteger(children[1].identity) &&
      children[0].identity !== children[1].identity, 'PROCESSES_NOT_DISTINCT');
    requireProof(roots[0] !== roots[1], 'JOURNALS_NOT_DISTINCT');
    await Promise.all([
      verifyJournal(roots[0], expected[0], expected[1]),
      verifyJournal(roots[1], expected[1], expected[0]),
    ]);
    children.forEach(child => child.assertWaiting());
  } catch (error) {
    workFailure = error?.name === 'PrepublicationProofError'
      ? error
      : fixedFailure('PREPUBLICATION_PROOF_FAILED');
  } finally {
    try { await cleanup(children, fixtures, roots); }
    catch { cleanupFailure = fixedFailure('PROOF_CLEANUP_FAILED'); }
  }
  if (cleanupFailure) throw cleanupFailure;
  if (workFailure) throw workFailure;
  assert.equal(children.length, 2);
});
