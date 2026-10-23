/*
 * SOURCE-ONLY: do not execute under DATA/parse-only scope.
 * Intended actual SDK/preflight + new-private V6 SQLite composition.
 * Requires separate exact dependency/launcher review and synthetic wallet-key,
 * two-signature and two-private-database/independent-pin-file authorization.
 * No real wallet, RPC/socket, SDK prepareBlock, nonce search, chain PREPARE,
 * payment, default buyer cutover, live pilot or hosted-CI qualification.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2';
import { createZenonDynamicPlasmaOriginalFundingPreparation as OWNER } from '../src/zenon/dynamic-plasma-original-funding-preparation.js';
import {
  createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6 as CREATE_V6,
  openZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6 as OPEN_V6,
} from '../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js';
import { createDynamicPlasmaJsonRpcReadTransport as WIRE } from '../src/zenon/dynamic-plasma-json-rpc-read-transport.js';
import { paymentIntentDigest } from '../src/canonical.js';
import { snapshotDynamicPlasmaQuoteRequestContext } from '../src/zenon/dynamic-plasma-observation-normalizer.js';
import { encodeB64Json } from '../src/x402-wire.js';
import { encodeOriginalPaymentCheckpoint } from '../src/service-credit-pilot-original-payment-checkpoint.js';

assert.equal(process.argv.length, 3);
const ROOT = process.argv[2];
assert.ok(isAbsolute(ROOT) && resolve(ROOT) === ROOT);
const directory = lstatSync(ROOT);
assert.ok(directory.isDirectory() && !directory.isSymbolicLink());
assert.equal(directory.uid, process.getuid()); assert.equal(directory.mode & 0o077, 0);
for (const name of ['success.db', 'success.pins.json', 'unknown.db', 'unknown.pins.json'])
  assert.throws(() => lstatSync(join(ROOT, name)), error => error.code === 'ENOENT');
const OPTIONS = { timeout: 5000, concurrency: false };
const copy = value => JSON.parse(JSON.stringify(value));
const ZERO = '0'.repeat(64), H = '33'.repeat(32), PREVIOUS = '66'.repeat(32);
const ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx';
ed.etc.sha512Sync = (...messages) => sha512(ed.etc.concatBytes(...messages));
const PRIVATE = new Uint8Array(randomBytes(32)); // One new in-memory synthetic key, never persisted/logged.
const PUBLIC = Buffer.from(ed.getPublicKey(PRIVATE)).toString('base64');
after(() => PRIVATE.fill(0)); // Best effort on normal termination, not a secure-erasure guarantee.
const totals = { fixtures: 0, addressCallbacks: 0, signatures: 0, accountReadCallbacks: 0,
  dpReadCallbacks: 0, materialHandoffs: 0, pinFilesWritten: 0, commitLossHooks: 0 };
function address(core) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', words = [];
  let accumulator = 0, bits = 0, checksum = 1;
  for (const byte of core) {
    accumulator = (accumulator << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; words.push((accumulator >>> bits) & 31); }
  }
  assert.equal(bits, 0);
  for (const word of [3, 0, 26, ...words, 0, 0, 0, 0, 0, 0]) {
    const top = checksum >>> 25; checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [index, generator] of [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3].entries())
      if ((top >>> index) & 1) checksum ^= generator;
  }
  checksum = (checksum ^ 1) >>> 0;
  return 'z1' + words.map(word => alphabet[word]).join('')
    + Array.from({ length: 6 }, (_, index) => alphabet[(checksum >>> (5 * (5 - index))) & 31]).join('');
}
const keyDigest = createHash('sha3-256').update(Buffer.from(PUBLIC, 'base64')).digest();
const PAYER = address([0, ...keyDigest.subarray(0, 19)]);
const PAYEE = address([0, ...Array(19).fill(34)]);
function context() {
  const accepted = { scheme: 'exact', network: 'zenon:testnet', asset: ASSET, amount: '5', payTo: PAYEE,
    maxTimeoutSeconds: 60, extra: { poc: true, settlement: 'account-block', paymentFlow: 'upfront',
      zenonChain: { version: 1, chainIdentifier: '73404', genesisMomentumHash: '11'.repeat(32) } } };
  const paymentRequired = { x402Version: 2, resource: { url: 'https://resource.invalid/paid',
    description: 'Synthetic resource.', mimeType: 'application/json', tags: ['synthetic'] }, accepts: [copy(accepted)] };
  const subject = { subjectVersion: 1, version: 1, chainIdentifier: 73404, blockType: 2,
    previousHash: PREVIOUS, height: 7, momentumAcknowledged: { hash: H, height: 100 },
    address: PAYER, toAddress: PAYEE, amount: '5', tokenStandard: ASSET, fromBlockHash: ZERO,
    data: Buffer.from(paymentIntentDigest(paymentRequired, accepted), 'hex').toString('base64') };
  const compiledSporkIds = { dynamicPlasmaId: '02'.repeat(32), libp2pId: '01'.repeat(32) };
  const frontier = { chainIdentifier: '73404', height: 100, hash: H, version: 2,
    nextFusionPrice: 1000, nextWorkPrice: 1000 };
  const endpoint = { beforeFrontier: { ...frontier }, profileEvidence: { heightTwo: {
    chainIdentifier: '73404', height: 2, hash: '22'.repeat(32), previousHash: '11'.repeat(32), version: 1 } },
    sporks: { count: 2, list: [
      { id: compiledSporkIds.libp2pId, name: 'libp2p', activated: false, enforcementHeight: 0 },
      { id: compiledSporkIds.dynamicPlasmaId, name: 'dynamic-plasma', activated: true, enforcementHeight: 10 } ] },
    plasmaVariables: { MaxBasePlasmaInMomentum: 4200000, FusedPlasmaTarget: 1050000,
      PowPlasmaTarget: 1050000, MaxPriceChangePercent: 10, PriceChangeDenominator: 20 },
    rpcObservation: { availablePlasma: 30000, basePlasma: 21000, requiredDifficulty: 0, requiredFusedPlasma: 21000 },
    afterFrontier: { ...frontier } };
  const observation = { expectedChainProfile: copy(accepted.extra.zenonChain),
    compiledSporkIds: copy(compiledSporkIds), endpointObservations: [copy(endpoint), copy(endpoint)],
    requiredFusedObservationVersion: 1, quoteRequestContextVersion: 1, quoteRequestContext: null };
  observation.quoteRequestContext = snapshotDynamicPlasmaQuoteRequestContext({ requestContextVersion: 1,
    expectedChainProfile: observation.expectedChainProfile, compiledSporkIds,
    quoteRequest: { address: PAYER, blockType: 2, toAddress: PAYEE, data: subject.data } });
  return { phase: 'UNSIGNED', subject, paymentRequired, accepted, payerAddress: PAYER, compiledSporkIds, observation,
    policy: { policyVersion: 1, maxPriceChangePercent: 10, maxMomentumAdvances: 2,
      maxFusedPlasma: 30000, maxDifficulty: 0 }, runtimeContextDigest: 'sha256:' + 'b'.repeat(64) };
}
function advanced(original, age) {
  const value = copy(original), price = [1000, 1100, 1210, 1331][age];
  for (const endpoint of value.observation.endpointObservations) {
    for (const side of ['beforeFrontier', 'afterFrontier']) {
      Object.assign(endpoint[side], { height: 100 + age, hash: ['33', '44', '55', '66'][age].repeat(32),
        nextFusionPrice: price, nextWorkPrice: price });
    }
    endpoint.rpcObservation.requiredFusedPlasma = Math.ceil(21000 * price / 1000);
  }
  return value;
}
function frontierBlock() {
  return { version: 1, chainIdentifier: 73404, blockType: 3, hash: PREVIOUS,
    previousHash: '77'.repeat(32), height: 6, momentumAcknowledged: { hash: H, height: 100 },
    address: PAYER, toAddress: PAYEE, amount: '5', tokenStandard: ASSET,
    fromBlockHash: '88'.repeat(32), descendantBlocks: [], data: null,
    fusedPlasma: 0, difficulty: 0, nonce: '0000000000000000',
    basePlasma: 21000, usedPlasma: 21000, changesHash: ZERO, publicKey: '', signature: '',
    token: null, confirmationDetail: null, pairedAccountBlock: null };
}
function momentum(frontier) {
  return { version: frontier.version, chainIdentifier: Number(frontier.chainIdentifier),
    hash: frontier.hash, previousHash: '11'.repeat(32), height: frontier.height, timestamp: 1234,
    data: '', content: [], changesHash: '66'.repeat(32), publicKey: Buffer.alloc(32, 6).toString('base64'),
    signature: Buffer.alloc(64, 8).toString('base64'), // Fixed DATA, not signing.
    nextFusionPrice: frontier.nextFusionPrice, nextWorkPrice: frontier.nextWorkPrice, producer: PAYER };
}

const METHODS = ['ledger.getFrontierMomentum', 'ledger.getMomentumsByHeight', 'embedded.spork.getAll',
  'embedded.plasma.getVariables', 'embedded.plasma.getRequiredPoWForAccountBlock', 'ledger.getFrontierMomentum'];
function fixture(label, injectLoss = false) {
  assert.ok(++totals.fixtures <= 2);
  const value = context(), positions = [0, 0], accountCalls = [], material = [];
  const f = { value, positions, accountCalls, material, stage: 0, addresses: 0, signatures: 0, unsigned: null };
  const transports = [0, 1].map(endpoint => WIRE({ exchange(body) {
    assert.ok(++totals.dpReadCallbacks <= 120);
    const request = JSON.parse(body), index = positions[endpoint]++ % 6;
    assert.equal(request.id, positions[endpoint]); assert.equal(request.method, METHODS[index]);
    const e = advanced(value, 0).observation.endpointObservations[endpoint];
    const two = { ...e.beforeFrontier, version: 1, height: 2, hash: '22'.repeat(32),
      nextFusionPrice: 0, nextWorkPrice: 0 };
    const script = [momentum(e.beforeFrontier), { count: 200, list: [momentum(two)] },
      { count: e.sporks.count, list: e.sporks.list.map(s => ({ ...s, description: 'Synthetic.' })) },
      copy(e.plasmaVariables), copy(e.rpcObservation), momentum(e.afterFrontier)];
    return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: script[index] }));
  } }));
  const wallet = {
    getAddress() {
      assert.equal(this, wallet); assert.equal(arguments.length, 0);
      assert.equal(++f.addresses, 1); assert.ok(++totals.addressCallbacks <= 2);
      assert.equal(accountCalls.length, 0); return Promise.resolve(PAYER);
    },
    sign(block) {
      assert.equal(this, wallet); assert.equal(arguments.length, 1);
      assert.equal(++f.signatures, 1); assert.ok(++totals.signatures <= 2);
      assert.equal(accountCalls.length, 12); assert.deepEqual(positions, [24, 24]);
      assert.equal(material.length, 1); assert.equal(Object.isFrozen(block), true);
      f.unsigned = block;
      const signature = ed.sign(Buffer.from(block.hash, 'hex'), PRIVATE);
      assert.equal(signature.length, 64);
      return Promise.resolve({ ...copy(block), signature: Buffer.from(signature).toString('base64') });
    },
  };
  f.options = {
    readOptions: { transports, accountExchange(body) {
      const request = JSON.parse(body); accountCalls.push(request);
      assert.ok(++totals.accountReadCallbacks <= 30);
      assert.equal(request.id, accountCalls.length); assert.deepEqual(request.params, [PAYER]);
      f.stage = Math.floor((accountCalls.length - 1) / 3) + 1; assert.ok(f.stage <= 5);
      const result = request.method === 'ledger.getAccountInfoByAddress'
        ? { address: PAYER, accountHeight: 6, balanceInfoMap: { [ASSET]: {
          token: { tokenStandard: ASSET }, balance: '5' } } } : frontierBlock();
      return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
    } },
    materialExchange(request) {
      assert.equal(arguments.length, 1); assert.ok(++totals.materialHandoffs <= 2);
      assert.equal(request.materialRequestVersion, 1); assert.equal(request.workRequest.accountBlock.difficulty, 0);
      material.push(request); assert.equal(material.length, 1);
      return Promise.resolve({ materialVersion: 1, publicKey: PUBLIC, nonce: '0102030405060708' });
    },
    materialWaitMs: 250, wallet,
  };
  f.input = { plannerContext: { plannerContextVersion: 6, readInput: {
    observedUserSendReadVersion: 3, phase: 'UNSIGNED', paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: PAYER, compiledSporkIds: value.compiledSporkIds,
    policy: value.policy, runtimeContextDigest: value.runtimeContextDigest,
  } }, challenge: { status: 'PAYMENT_REQUIRED', resourceUrl: value.paymentRequired.resource.url,
    paymentRequiredHeader: encodeB64Json(value.paymentRequired), paymentRequired: copy(value.paymentRequired) },
    originalRequest: { requestId: 'original-' + label, contextId: 'context-' + label,
      requestBodyBase64: '', contextBase64: Buffer.from('independent-' + label).toString('base64') } };
  f.storeOptions = { databasePath: join(ROOT, label + '.db'), allowedRoot: ROOT,
    resourceUrl: value.paymentRequired.resource.url,
    custodyPolicy: { policyVersion: 1, maxRequests: 4, serviceResourceUrl: 'https://resource.invalid/service' } };
  if (injectLoss) f.storeOptions.testHooks = { afterCommit(name) {
    if (name === 'prepareWithOriginalPaymentCheckpoint') {
      assert.equal(++totals.commitLossHooks, 1); throw Error('Synthetic commit-before-return loss');
    }
  } };
  f.ownerOptions = store => ({ preparerOptions: f.options, store, fundingResourceUrl: f.storeOptions.resourceUrl });
  return f;
}
function rejected(kind) {
  return error => {
    const code = 'zenon_dynamic_plasma_original_funding_preparation_' + kind;
    assert.ok(error instanceof TypeError && Object.isFrozen(error));
    assert.equal(error.code, code); assert.equal(error.message, code);
    assert.equal(error.stack, 'TypeError: ' + code); return true;
  };
}
function snapshot(f) {
  return [f.addresses, f.signatures, f.accountCalls.length, ...f.positions, f.material.length];
}
function retainPins(label, pins) {
  assert.ok(++totals.pinFilesWritten <= 2);
  const path = join(ROOT, label + '.pins.json'), text = JSON.stringify(pins);
  assert.ok(Buffer.byteLength(text) <= 4096);
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
  const stat = lstatSync(path); assert.equal(stat.uid, process.getuid()); assert.equal(stat.mode & 0o777, 0o600);
  assert.equal(stat.nlink, 1); assert.equal(stat.isSymbolicLink(), false);
  return JSON.parse(readFileSync(path, 'utf8')); // Independent fixture file, NEVER the database.
}
function inspectOriginal(owner, packet, phase) {
  const state = owner.inspectOriginalFunding();
  assert.equal(state.phase, phase); assert.equal(state.packet, packet);
  assert.equal(state.candidate.signatureValidation, 'NOT_PERFORMED'); // Child's volatile DATA label stays honest.
  assert.equal(state.authority, 'NONE'); assert.equal(state.preflightPassed, true);
  return state;
}
function freshOpenOptions(f) {
  const { testHooks, ...configuration } = f.storeOptions; return configuration;
}
test('original funding actual SDK V6 composition commits one original candidate and refuses duplicate store owners', OPTIONS, async () => {
  const f = fixture('success'), store = CREATE_V6(f.storeOptions);
  let reopened;
  try {
    const owner = OWNER(f.ownerOptions(store)), before = snapshot(f);
    assert.throws(() => OWNER(f.ownerOptions(store)), rejected('configuration_rejected'));
    assert.deepEqual(snapshot(f), before);
    const prepared = await owner.prepareOriginalFunding(f.input), packet = prepared.packet;
    assert.equal(prepared.phase, 'AWAITING_INDEPENDENT_PINS');
    assert.equal(prepared.preflight, 'ACTUAL_LOCAL_PREFLIGHT_RETURNED');
    assert.equal(prepared.persistence, 'NOT_PERFORMED'); assert.equal(store.load(), null);
    assert.equal(packet.paymentPayload.payload.transaction.signature.length, 88);
    assert.equal(packet.transactionHash, f.unsigned.hash); assert.equal(f.signatures, 1);
    const beforeDuplicate = snapshot(f);
    assert.throws(() => OWNER(f.ownerOptions(store)), rejected('configuration_rejected'));
    assert.deepEqual(snapshot(f), beforeDuplicate);
    const externalPins = retainPins('success', packet.expectedPins);
    const committed = await owner.commitOriginalFunding({ expectedPins: externalPins });
    assert.equal(committed.phase, 'LOCAL_STORE_READBACK_MATCHED'); assert.equal(committed.authority, 'NONE');
    assert.equal(committed.signatureValidation, 'ACTUAL_LOCAL_PREFLIGHT_RETURNED');
    assert.equal(committed.publication, 'NOT_PERFORMED'); assert.equal(committed.crashDurability, 'NOT_QUALIFIED');
    const stored = store.load();
    assert.equal(stored.status, 'PREPARED'); assert.equal(stored.revision, 1);
    assert.equal(stored.paymentHeader, packet.pair.paymentSignatureHeader);
    assert.equal(encodeOriginalPaymentCheckpoint(store.getOriginalPaymentCheckpoint(externalPins)), packet.serializedCheckpoint);
    inspectOriginal(owner, packet, 'LOCAL_STORE_READBACK_MATCHED');
    await assert.rejects(owner.prepareOriginalFunding(f.input), rejected('used'));
    await assert.rejects(owner.commitOriginalFunding({ expectedPins: externalPins }), rejected('commit_unavailable'));
    assert.deepEqual(snapshot(f), beforeDuplicate);
    store.close();
    reopened = OPEN_V6(freshOpenOptions(f)); // Owner epoch advances; not a read-only or crash/restart-proof open.
    assert.equal(reopened.load().paymentHeader, packet.pair.paymentSignatureHeader);
    assert.equal(encodeOriginalPaymentCheckpoint(reopened.getOriginalPaymentCheckpoint(externalPins)), packet.serializedCheckpoint);
    const newObjectOwner = OWNER(f.ownerOptions(reopened)), beforeOccupied = snapshot(f);
    await assert.rejects(newObjectOwner.prepareOriginalFunding(f.input), rejected('prepare_refused'));
    assert.equal(newObjectOwner.inspectOriginalFunding().phase, 'PREPARE_REFUSED');
    assert.deepEqual(snapshot(f), beforeOccupied); // New object claim is not a file fence; actual nonempty store refuses before wallet.
  } finally { try { reopened?.close(); } finally { store.close(); } }
});
test('original funding actual SDK V6 composition retains commit uncertainty and original bytes across normal reopen without another signature', OPTIONS, async () => {
  const f = fixture('unknown', true), store = CREATE_V6(f.storeOptions);
  let reopened;
  try {
    const owner = OWNER(f.ownerOptions(store));
    const prepared = await owner.prepareOriginalFunding(f.input), packet = prepared.packet;
    assert.equal(prepared.preflight, 'ACTUAL_LOCAL_PREFLIGHT_RETURNED'); assert.equal(store.load(), null);
    const externalPins = retainPins('unknown', packet.expectedPins), beforeCommit = snapshot(f);
    await assert.rejects(owner.commitOriginalFunding({ expectedPins: externalPins }), rejected('commit_unknown_or_refused'));
    const unknown = inspectOriginal(owner, packet, 'COMMIT_OUTCOME_UNKNOWN');
    assert.equal(unknown.commitAttempts, 1); assert.equal(unknown.storeEntered, true); assert.equal(unknown.storeReturned, false);
    await assert.rejects(owner.commitOriginalFunding({ expectedPins: externalPins }), rejected('commit_unavailable'));
    await assert.rejects(owner.prepareOriginalFunding(f.input), rejected('used'));
    assert.throws(() => OWNER(f.ownerOptions(store)), rejected('configuration_rejected'));
    assert.deepEqual(snapshot(f), beforeCommit);
    store.close();
    reopened = OPEN_V6(freshOpenOptions(f));
    const recovered = reopened.load();
    assert.equal(recovered.status, 'PREPARED'); assert.equal(recovered.revision, 1);
    assert.equal(recovered.paymentHeader, packet.pair.paymentSignatureHeader);
    assert.equal(recovered.challengeHeader, f.input.challenge.paymentRequiredHeader);
    assert.equal(encodeOriginalPaymentCheckpoint(reopened.getOriginalPaymentCheckpoint(externalPins)), packet.serializedCheckpoint);
    inspectOriginal(owner, packet, 'COMMIT_OUTCOME_UNKNOWN'); // Readback does not rewrite the old owner's uncertainty or grant resend.
    assert.deepEqual(snapshot(f), beforeCommit);
    assert.deepEqual(totals, { fixtures: 2, addressCallbacks: 2, signatures: 2, accountReadCallbacks: 30,
      dpReadCallbacks: 120, materialHandoffs: 2, pinFilesWritten: 2, commitLossHooks: 1 });
    process.stdout.write('# original-funding-native-fixture ' + JSON.stringify(totals) + '\n');
  } finally { try { reopened?.close(); } finally { store.close(); } }
});
