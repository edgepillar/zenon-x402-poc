/*
 * Contextv7 qualification inputs for the actual original-funding v2 fixture.
 * Eleven cases: one ephemeral synthetic key and at most ten tx signatures.
 * At most eleven new DB paths here; the direct payer case adds one more.
 * Sixth-cycle age changes use declared JSON callbacks, never live RPC.
 * Importing this module requires the separately reviewed existing Noble/SDK
 * dependency graph. Calling the harness generates one fresh in-memory key.
 * No fake SDK, preflight, store or client factory is supplied. Read and fetch
 * capabilities below are declared synthetic callbacks, NOT real RPC/HTTPS.
 */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { constants, closeSync, fsyncSync, fstatSync, lstatSync, openSync, readSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2';
import { createDynamicPlasmaJsonRpcReadTransport as WIRE } from '../src/zenon/dynamic-plasma-json-rpc-read-transport.js';
import { paymentIntentDigest } from '../src/canonical.js';
import { snapshotDynamicPlasmaQuoteRequestContext } from '../src/zenon/dynamic-plasma-observation-normalizer.js';
import { encodeB64Json } from '../src/x402-wire.js';

const LABELS = Object.freeze(['bound', 'response-loss', 'commit-loss', 'state-conflict',
  'reentrant-close', 'undrained', 'non-v6', 'price-one', 'price-two', 'expired-horizon', 'configuration']);

export function createOriginalFundingSubmissionV2FixtureHarness(ROOT) {
  assert.ok(isAbsolute(ROOT) && resolve(ROOT) === ROOT && ROOT === process.env.SPV_TASK_SCRATCH);
  const directory = lstatSync(ROOT);
  assert.ok(directory.isDirectory() && !directory.isSymbolicLink());
  assert.equal(directory.uid, process.getuid()); assert.equal(directory.mode & 0o077, 0);
  for (const label of LABELS) for (const suffix of ['.db', '.db-journal', '.db-wal', '.db-shm', '.pins.json'])
    assert.throws(() => lstatSync(join(ROOT, label + suffix)), error => error.code === 'ENOENT');
  const copy = value => JSON.parse(JSON.stringify(value));
  const ZERO = '0'.repeat(64), H = '33'.repeat(32), PREVIOUS = '66'.repeat(32);
  const ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx';
  ed.etc.sha512Sync = (...messages) => sha512(ed.etc.concatBytes(...messages));
  const PRIVATE = new Uint8Array(randomBytes(32)); // Never persisted or logged.
  const PUBLIC = Buffer.from(ed.getPublicKey(PRIVATE)).toString('base64');
  const keyDigest = createHash('sha3-256').update(Buffer.from(PUBLIC, 'base64')).digest();
  const PAYER = address([0, ...keyDigest.subarray(0, 19)]);
  const PAYEE = address([0, ...Array(19).fill(34)]);
  const used = new Set(), signedHashes = new Set();
  let destroyed = false;
  const totals = { fixtures: 0, addressCallbacks: 0, signatures: 0, accountReadCallbacks: 0,
    dpReadCallbacks: 0, materialHandoffs: 0, pinFilesWritten: 0, fetchCalls: 0,
    commitLossHooks: 0, recoveryCloseHooks: 0, transportReleases: 0 };
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
  function context(label) {
    const accepted = { scheme: 'exact', network: 'zenon:testnet', asset: ASSET, amount: '5', payTo: PAYEE,
      maxTimeoutSeconds: 60, extra: { poc: true, settlement: 'account-block', paymentFlow: 'upfront',
        zenonChain: { version: 1, chainIdentifier: '73404', genesisMomentumHash: '11'.repeat(32) } } };
    const paymentRequired = { x402Version: 2, resource: { url: 'https://resource.invalid/paid',
      description: 'Synthetic resource: ' + label + '.', mimeType: 'application/json', tags: ['synthetic', label] }, accepts: [copy(accepted)] };
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
  function fixture(label) {
    assert.ok(!destroyed && LABELS.includes(label) && !used.has(label)); used.add(label);
    assert.ok(++totals.fixtures <= 11);
    const value = context(label), positions = [0, 0], accountCalls = [], material = [];
    const f = { value, positions, accountCalls, material, stage: 0, addresses: 0, signatures: 0, unsigned: null,
      age: label === 'price-one' ? 1 : label === 'price-two' ? 2 : label === 'expired-horizon' ? 3 : 0 };
    const transports = [0, 1].map(endpoint => WIRE({ exchange(body) {
      assert.ok(++totals.dpReadCallbacks <= 720);
      const request = JSON.parse(body), index = positions[endpoint]++ % 6;
      assert.equal(request.id, positions[endpoint]); assert.equal(request.method, METHODS[index]);
      const e = advanced(value, f.stage === 6 ? f.age : 0).observation.endpointObservations[endpoint];
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
        assert.equal(++f.addresses, 1); assert.ok(++totals.addressCallbacks <= 10);
        assert.equal(accountCalls.length, 0); return Promise.resolve(PAYER);
      },
      sign(block) {
        assert.equal(this, wallet); assert.equal(arguments.length, 1);
        assert.equal(++f.signatures, 1); assert.ok(++totals.signatures <= 10);
        assert.equal(accountCalls.length, 12); assert.deepEqual(positions, [24, 24]);
        assert.equal(material.length, 1); assert.equal(Object.isFrozen(block), true);
        f.unsigned = block;
        assert.ok(!destroyed && !signedHashes.has(block.hash)); signedHashes.add(block.hash);
        const signature = ed.sign(Buffer.from(block.hash, 'hex'), PRIVATE);
        assert.equal(signature.length, 64);
        return Promise.resolve({ ...copy(block), signature: Buffer.from(signature).toString('base64') });
      },
    };
    f.options = {
      readOptions: { transports, accountExchange(body) {
        const request = JSON.parse(body); accountCalls.push(request);
        assert.ok(++totals.accountReadCallbacks <= 180);
        assert.equal(request.id, accountCalls.length); assert.deepEqual(request.params, [PAYER]);
        f.stage = Math.floor((accountCalls.length - 1) / 3) + 1; assert.ok(f.stage <= 6);
        const result = request.method === 'ledger.getAccountInfoByAddress'
          ? { address: PAYER, accountHeight: 6, balanceInfoMap: { [ASSET]: {
            token: { tokenStandard: ASSET }, balance: '5' } } } : frontierBlock();
        return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
      } },
      materialExchange(request) {
        assert.equal(arguments.length, 1); assert.ok(++totals.materialHandoffs <= 10);
        assert.equal(request.materialRequestVersion, 1); assert.equal(request.workRequest.accountBlock.difficulty, 0);
        material.push(request); assert.equal(material.length, 1);
        return Promise.resolve({ materialVersion: 1, publicKey: PUBLIC, nonce: '0102030405060708' });
      },
      materialWaitMs: 250, wallet,
    };
    f.input = { plannerContext: { plannerContextVersion: 7, readInput: {
      observedUserSendReadVersion: 3, phase: 'UNSIGNED', paymentRequired: value.paymentRequired,
      accepted: value.accepted, payerAddress: PAYER, compiledSporkIds: value.compiledSporkIds,
      policy: value.policy, runtimeContextDigest: value.runtimeContextDigest,
    } }, challenge: { status: 'PAYMENT_REQUIRED', resourceUrl: value.paymentRequired.resource.url,
      paymentRequiredHeader: encodeB64Json(value.paymentRequired), paymentRequired: copy(value.paymentRequired) },
      originalRequest: { requestId: 'original-' + label, contextId: 'context-' + label,
        requestBodyBase64: '', contextBase64: Buffer.from('independent-' + label).toString('base64') } };
    f.storeOptions = { databasePath: join(ROOT, label + '.db'), allowedRoot: ROOT,
      resourceUrl: value.paymentRequired.resource.url,
      custodyPolicy: { policyVersion: 1, maxRequests: 4, serviceResourceUrl: 'https://resource.invalid/service-credit/v1/execute' } };
    f.ownerOptions = (store, fetchImpl, deadlineMs = 200) => ({ preparerOptions: f.options, store,
      fundingResourceUrl: f.storeOptions.resourceUrl, deadlineMs, fetchImpl });
    return f;
  }
  
  function snapshot(f) {
    return [f.addresses, f.signatures, f.accountCalls.length, ...f.positions, f.material.length];
  }
  function note(name) {
    const limits = { fetchCalls: 3, commitLossHooks: 1, recoveryCloseHooks: 1, transportReleases: 1 };
    assert.ok(Object.hasOwn(limits, name)); assert.ok(++totals[name] <= limits[name]);
  }
  function retainPins(label, pins) {
    assert.ok(used.has(label) && label !== 'configuration');
    assert.ok(++totals.pinFilesWritten <= 10);
    const path = join(ROOT, label + '.pins.json'), text = JSON.stringify(pins);
    assert.ok(Buffer.byteLength(text) <= 4096);
    const fd = openSync(path, 'wx', 0o600);
    try { writeFileSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
    return readPins(label);
  }
  function identity(s) {
    return [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeNs, s.ctimeNs].map(String);
  }
  function readPins(label) {
    assert.ok(used.has(label) && label !== 'configuration');
    const path = join(ROOT, label + '.pins.json'), before = lstatSync(path, { bigint: true });
    assert.ok(before.isFile() && !before.isSymbolicLink());
    assert.equal(before.uid, BigInt(process.getuid())); assert.equal(before.mode & 0o777n, 0o600n);
    assert.equal(before.nlink, 1n); assert.ok(before.size > 0n && before.size <= 4096n);
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW), bytes = Buffer.alloc(4097);
    let length = 0;
    try {
      assert.deepEqual(identity(fstatSync(fd, { bigint: true })), identity(before));
      while (length < bytes.length) {
        const read = readSync(fd, bytes, length, bytes.length - length, null);
        if (read === 0) break; length += read;
      }
      assert.equal(BigInt(length), before.size);
      assert.deepEqual(identity(fstatSync(fd, { bigint: true })), identity(before));
      assert.deepEqual(identity(lstatSync(path, { bigint: true })), identity(before));
    } finally { closeSync(fd); }
    return JSON.parse(bytes.subarray(0, length).toString('utf8')); // NEVER learned from SQLite.
  }
  return Object.freeze({ fixture, snapshot, retainPins, readPins, note,
    counts: () => Object.freeze({ ...totals, uniqueSignedHashes: signedHashes.size }),
    destroy: () => { destroyed = true; PRIVATE.fill(0); } }); // Best effort on normal exit, not secure erasure.
}
