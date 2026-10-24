/*
 * Actual full native local DP fixture SUPPORT, unexecuted draft.
 * Reuses earlier synthetic DATA shapes, not its owner/fetch/material callbacks.
 * Calling the factory creates one NEW synthetic key and an actual IPv4 HTTPS
 * server. Import/use requires separately reviewed full native authority.
 * No real wallet, node endpoint, SDK.prepareBlock, provider signer or pilot.
 */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:https';
import { constants, closeSync, fsyncSync, fstatSync, lstatSync, openSync, readSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2';
import { paymentIntentDigest } from '../src/canonical.js';
import { snapshotDynamicPlasmaQuoteRequestContext } from '../src/zenon/dynamic-plasma-observation-normalizer.js';
import { deriveZenonUserSendWorkInput } from '../src/zenon/dynamic-plasma-user-send-work-input.js';
import { encodeB64Json } from '../src/x402-wire.js';
import { observeServiceCreditOperationDrain } from '../src/service-credit-bounded-operation-drain.js';

const F = Object.freeze, LABELS = F(['bound', 'lost-ack', 'expired-horizon']);
const DP_METHODS = F(['ledger.getFrontierMomentum', 'ledger.getMomentumsByHeight', 'embedded.spork.getAll',
  'embedded.plasma.getVariables', 'embedded.plasma.getRequiredPoWForAccountBlock', 'ledger.getFrontierMomentum']);
const MAXIMUM = F({ tcpConnections: 524, tlsConnections: 524, rpcRequests: 522, fundingRequests: 2,
  syntheticSignatures: 3, producerCandidateReservation: 12288, referenceCandidates: 32768,
  fixedVerificationReservation: 16384, aggregateCandidates: 65536 });

export async function createFullNativeLoopbackFixtureHarness(ROOT) {
  assert.ok(isAbsolute(ROOT) && resolve(ROOT) === ROOT && ROOT === process.env.SPV_TASK_SCRATCH);
  for (let path = ROOT; ; path = dirname(path)) {
    assert.equal(lstatSync(path).isSymbolicLink(), false);
    if (dirname(path) === path) break;
  }
  const root = lstatSync(ROOT);
  assert.ok(root.isDirectory()); assert.equal(root.uid, process.getuid()); assert.equal(root.mode & 0o077, 0);
  for (const label of LABELS) for (const suffix of ['.db', '.db-journal', '.db-wal', '.db-shm', '.pins.json'])
    assert.throws(() => lstatSync(join(ROOT, label + suffix)), error => error.code === 'ENOENT');
  const tlsKey = readOwned(join(ROOT, 'tls-key.pem'), 16384, true);
  const certificate = readOwned(join(ROOT, 'tls-cert.pem'), 16384, true);
  const PRIVATE = randomBytes(32); // One owned synthetic key buffer; never persisted/logged.
  ed.etc.sha512Sync = (...messages) => sha512(ed.etc.concatBytes(...messages));
  const PUBLIC = Buffer.from(ed.getPublicKey(PRIVATE)).toString('base64');
  const keyDigest = createHash('sha3-256').update(Buffer.from(PUBLIC, 'base64')).digest();
  const copy = value => JSON.parse(JSON.stringify(value));
  const ZERO = '0'.repeat(64), H = '33'.repeat(32), PREVIOUS = '66'.repeat(32);
  const ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx';
  const PAYER = address([0, ...keyDigest.subarray(0, 19)]), PAYEE = address([0, ...Array(19).fill(34)]);
  const rawSockets = new Set(), tlsSockets = new Set(), used = new Set(), signed = new Set(), pinLabels = new Set();
  const counts = { fixtures: 0, addresses: 0, signatures: 0, tcpConnections: 0, tlsConnections: 0,
    rpcRequests: 0, fundingRequests: 0, lostAcks: 0, referenceWindows: 0, referenceCandidates: 0,
    producerCandidateReservation: 0, pinFiles: 0, asyncFailures: 0, forcedServerSocketDestructions: 0 };
  let active = null, failure = null, stopped = false, reference = null, referenceInput = null;
  let resourceUrl = null, serviceResourceUrl = null, port = null;
  function failed(code) {
    counts.asyncFailures++;
    if (failure === null) failure = new Error(code);
  }
  const server = createServer({ key: tlsKey, cert: certificate,
    minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', ALPNProtocols: ['http/1.1'] }, (request, response) => {
    const f = active; let size = 0; const chunks = [];
    try {
      assert.ok(f !== null && !stopped && failure === null);
      assert.ok(request.method === 'POST' && request.headers.connection === 'close');
      assert.ok(request.socket.remoteAddress === '127.0.0.1');
      request.on('error', () => failed('NATIVE_REQUEST_ERROR'));
      response.on('error', () => failed('NATIVE_RESPONSE_ERROR'));
      request.on('data', chunk => {
        try { size += chunk.length; assert.ok(size <= 1024); chunks.push(chunk); }
        catch { failed('NATIVE_REQUEST_BODY_BOUND'); request.destroy(); }
      });
      request.on('end', () => {
        try {
          assert.ok(f === active && failure === null && request.complete === true);
          const route = request.url;
          if (route === '/funding') {
            assert.ok(++counts.fundingRequests <= MAXIMUM.fundingRequests);
            assert.ok(++f.fundingRequests === 1 && f.label !== 'expired-horizon');
            assert.ok(request.headers.host === '127.0.0.1:' + port && size === 0);
            assert.ok(f.packet !== null && request.headers['payment-signature'] === f.packet.pair.paymentSignatureHeader);
            assert.ok(f.store.load().status === 'ATTEMPT_FENCED'); // Same owned new test store; no recovery/open.
            if (f.label === 'lost-ack') {
              counts.lostAcks++; request.socket.destroy(); return; // AFTER observing the exact original durable-fenced POST.
            }
            const text = 'BOUND'; response.sendDate = false;
            response.writeHead(202, { 'content-type': 'text/plain; charset=utf-8', 'content-length': '5',
              'cache-control': 'private, no-store, max-age=0', vary: 'PAYMENT-SIGNATURE',
              'x-content-type-options': 'nosniff', connection: 'close' });
            response.end(text); return;
          }
          assert.ok(['/rpc/first', '/rpc/second', '/rpc/account'].includes(route));
          assert.ok(++counts.rpcRequests <= MAXIMUM.rpcRequests);
          assert.ok(request.headers.host === 'localhost:' + port && request.headers['payment-signature'] === undefined);
          assert.ok(request.headers['content-type'] === 'application/json' && size > 0);
          const packet = JSON.parse(Buffer.concat(chunks, size).toString('ascii'));
          assert.deepEqual(Object.keys(packet).sort(), ['id', 'jsonrpc', 'method', 'params']);
          assert.ok(packet.jsonrpc === '2.0' && Number.isSafeInteger(packet.id) && Array.isArray(packet.params));
          const result = rpc(f, route, packet);
          const text = JSON.stringify({ jsonrpc: '2.0', id: packet.id, result });
          response.sendDate = false; response.writeHead(200, { 'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(text)), connection: 'close' }); response.end(text);
        } catch { failed('NATIVE_HTTP_FIXTURE_REFUSED'); request.socket.destroy(); }
      });
    } catch { failed('NATIVE_HTTP_ADMISSION_REFUSED'); request.socket.destroy(); }
  });
  server.on('error', () => failed('NATIVE_SERVER_ERROR'));
  server.on('tlsClientError', () => failed('NATIVE_TEST_TLS_CLIENT_ERROR'));
  server.on('connection', socket => {
    rawSockets.add(socket);
    if (++counts.tcpConnections > MAXIMUM.tcpConnections || socket.remoteAddress !== '127.0.0.1') {
      failed('NATIVE_CONNECTION_BOUND'); socket.destroy();
    }
    socket.on('error', () => failed('NATIVE_SERVER_RAW_SOCKET_ERROR'));
    socket.once('close', () => rawSockets.delete(socket));
  });
  server.on('secureConnection', socket => {
    tlsSockets.add(socket);
    if (++counts.tlsConnections > MAXIMUM.tlsConnections
        || socket.getProtocol() !== 'TLSv1.3' || socket.alpnProtocol !== 'http/1.1') {
      failed('NATIVE_TLS_CONNECTION_BOUND'); socket.destroy();
    }
    socket.on('error', () => failed('NATIVE_SERVER_TLS_SOCKET_ERROR'));
    socket.once('close', () => tlsSockets.delete(socket));
  });
  try {
    await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
    const at = server.address();
    assert.ok(at !== null && at.address === '127.0.0.1' && Number.isSafeInteger(at.port) && at.port >= 1024 && at.port <= 65535);
    port = at.port; resourceUrl = 'https://127.0.0.1:' + port + '/funding';
    serviceResourceUrl = 'https://127.0.0.1:' + port + '/service-credit/v1/execute';
  } catch (error) {
    PRIVATE.fill(0); tlsKey.fill(0); certificate.fill(0);
    for (const socket of rawSockets) socket.destroy();
    for (const socket of tlsSockets) socket.destroy();
    try { server.close(() => undefined); } catch {}
    throw error;
  }

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
    const paymentRequired = { x402Version: 2, resource: { url: resourceUrl,
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
      rpcObservation: { availablePlasma: 25409, basePlasma: 21000, requiredDifficulty: 0, requiredFusedPlasma: 21000 },
      afterFrontier: { ...frontier } };
    const observation = { expectedChainProfile: copy(accepted.extra.zenonChain),
      compiledSporkIds: copy(compiledSporkIds), endpointObservations: [copy(endpoint), copy(endpoint)],
      requiredFusedObservationVersion: 1, quoteRequestContextVersion: 1, quoteRequestContext: null };
    observation.quoteRequestContext = snapshotDynamicPlasmaQuoteRequestContext({ requestContextVersion: 1,
      expectedChainProfile: observation.expectedChainProfile, compiledSporkIds,
      quoteRequest: { address: PAYER, blockType: 2, toAddress: PAYEE, data: subject.data } });
    return { phase: 'UNSIGNED', subject, paymentRequired, accepted, payerAddress: PAYER, compiledSporkIds, observation,
      policy: { policyVersion: 1, maxPriceChangePercent: 10, maxMomentumAdvances: 2,
        maxFusedPlasma: 25409, maxDifficulty: 38115000 }, runtimeContextDigest: 'sha256:' + 'b'.repeat(64) };
  }
  function advanced(original, age) {
    const value = copy(original), price = [1000, 1100, 1210, 1331][age];
    for (const endpoint of value.observation.endpointObservations) {
      for (const side of ['beforeFrontier', 'afterFrontier']) {
        Object.assign(endpoint[side], { height: 100 + age, hash: ['33', '44', '55', '66'][age].repeat(32),
          nextFusionPrice: price, nextWorkPrice: price });
      }
      const required = Math.ceil(21000 * price / 1000);
      const available = endpoint.rpcObservation.availablePlasma;
      endpoint.rpcObservation.requiredFusedPlasma = required;
      endpoint.rpcObservation.requiredDifficulty = available >= required ? 0
        : Math.ceil((21000 - Math.floor(available * 1000 / price)) * price / 1000) * 1500;
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


  function rpc(f, route, request) {
    if (route === '/rpc/account') {
      f.accountCalls++;
      assert.ok(request.id === f.accountCalls && f.accountCalls <= 18 && request.params.length === 1 && request.params[0] === PAYER);
      f.stage = Math.floor((f.accountCalls - 1) / 3) + 1;
      const expectedMethod = ['ledger.getFrontierAccountBlock', 'ledger.getAccountInfoByAddress',
        'ledger.getFrontierAccountBlock'][(f.accountCalls - 1) % 3];
      assert.equal(request.method, expectedMethod);
      return request.method === 'ledger.getAccountInfoByAddress'
        ? { address: PAYER, accountHeight: 6, balanceInfoMap: { [ASSET]: { token: { tokenStandard: ASSET }, balance: '5' } } }
        : frontierBlock();
    }
    const endpoint = route === '/rpc/first' ? 0 : 1, position = f.positions[endpoint]++, index = position % 6;
    assert.ok(request.id === position + 1 && position < 78 && request.method === DP_METHODS[index]);
    const expectedParams = index === 1 ? [2, 1] : index === 2 ? [0, 128] : index === 4
      ? [{ address: PAYER, blockType: 2, toAddress: PAYEE, data: f.value.subject.data }] : [];
    assert.deepEqual(request.params, expectedParams);
    const age = f.stage <= 2 ? 0 : f.label === 'expired-horizon' && f.stage === 6 ? 3 : 2;
    f.observedAges.push(age);
    const e = advanced(f.value, age).observation.endpointObservations[endpoint];
    const two = { ...e.beforeFrontier, version: 1, height: 2, hash: '22'.repeat(32), nextFusionPrice: 0, nextWorkPrice: 0 };
    const values = [momentum(e.beforeFrontier), { count: 200, list: [momentum(two)] },
      { count: e.sporks.count, list: e.sporks.list.map(s => ({ ...s, description: 'Synthetic.' })) },
      copy(e.plasmaVariables), copy(e.rpcObservation), momentum(e.afterFrontier)];
    return values[index];
  }
  function referenceFor(value) {
    const { subjectVersion, ...subject } = value.subject;
    assert.equal(subjectVersion, 1);
    const work = deriveZenonUserSendWorkInput({ ...subject, hash: ZERO, fusedPlasma: 25409, difficulty: 3000,
      nonce: '0000000000000000', publicKey: '', signature: '' });
    if (referenceInput !== null) assert.ok(referenceInput === work.dataHash);
    else referenceInput = work.dataHash;
    if (reference !== null) return reference;
    const message = Buffer.alloc(40); Buffer.from(work.dataHash, 'hex').copy(message, 8);
    const threshold = (1n << 64n) - (1n << 64n) / 3000n;
    for (let window = 0n; window < 8n; window++) {
      assert.ok(++counts.referenceWindows <= 8);
      for (let offset = 0n; offset < 4096n; offset++) {
        const cursor = window * 4096n + offset; message.writeBigUInt64LE(cursor, 0);
        assert.ok(++counts.referenceCandidates <= MAXIMUM.referenceCandidates);
        if (createHash('sha3-256').update(message).digest().readBigUInt64LE(0) >= threshold) {
          const start = Buffer.alloc(8), nonce = Buffer.alloc(8);
          start.writeBigUInt64LE(window * 4096n); nonce.writeBigUInt64LE(cursor);
          reference = F({ startNonce: start.toString('hex'), nonce: nonce.toString('hex'), dataHash: work.dataHash });
          return reference;
        }
      }
    }
    throw new Error('SYNTHETIC_REFERENCE_EXHAUSTED_NO_NEW_KEY_OR_RANGE');
  }
  function fixture(label) {
    assert.ok(!stopped && failure === null && active === null && LABELS.includes(label) && !used.has(label));
    used.add(label); assert.ok(++counts.fixtures <= 3);
    const value = context(label), expected = referenceFor(value);
    counts.producerCandidateReservation += 4096;
    assert.ok(counts.producerCandidateReservation <= MAXIMUM.producerCandidateReservation
      && counts.referenceCandidates + counts.producerCandidateReservation + MAXIMUM.fixedVerificationReservation <= MAXIMUM.aggregateCandidates);
    const f = { label, value, expected, positions: [0, 0], accountCalls: 0, stage: 0, observedAges: [],
      addresses: 0, signatures: 0, unsigned: null, packet: null, pins: null, fundingRequests: 0, store: null };
    f.wallet = F({
      getAddress() {
        assert.ok(++counts.addresses <= 3 && ++f.addresses === 1 && f.accountCalls === 0);
        return Promise.resolve(PAYER);
      },
      sign(block) {
        assert.ok(++counts.signatures <= MAXIMUM.syntheticSignatures && ++f.signatures === 1);
        assert.ok(f.accountCalls === 12 && f.positions[0] === 24 && f.positions[1] === 24);
        assert.ok(Object.isFrozen(block) && block.publicKey === PUBLIC && block.nonce === expected.nonce
          && block.difficulty === 3000 && block.fusedPlasma === 25409);
        assert.ok(!signed.has(block.hash)); signed.add(block.hash); f.unsigned = block;
        const bytes = ed.sign(Buffer.from(block.hash, 'hex'), PRIVATE);
        assert.ok(bytes.length === 64);
        return Promise.resolve({ ...copy(block), signature: Buffer.from(bytes).toString('base64') });
      },
    });
    f.input = { plannerContext: { plannerContextVersion: 7, readInput: {
      observedUserSendReadVersion: 3, phase: 'UNSIGNED', paymentRequired: value.paymentRequired,
      accepted: value.accepted, payerAddress: PAYER, compiledSporkIds: value.compiledSporkIds,
      policy: value.policy, runtimeContextDigest: value.runtimeContextDigest,
    } }, challenge: { status: 'PAYMENT_REQUIRED', resourceUrl, paymentRequiredHeader: encodeB64Json(value.paymentRequired),
      paymentRequired: copy(value.paymentRequired) },
      originalRequest: { requestId: 'original-' + label, contextId: 'context-' + label,
        requestBodyBase64: '', contextBase64: Buffer.from('independent-' + label).toString('base64') } };
    f.storeOptions = { databasePath: join(ROOT, label + '.db'), allowedRoot: ROOT, resourceUrl,
      custodyPolicy: { policyVersion: 1, maxRequests: 4, serviceResourceUrl } };
    active = f; return f;
  }
  function ownerOptions(f, store) {
    assert.ok(active === f && f.store === null); f.store = store;
    const endpoint = path => F({ route: F({ hostname: 'localhost', path, ipv4Address: '127.0.0.1' }),
      timeoutMs: 5000, closeGraceMs: 500 });
    return {
      readSessionOptions: F({ endpoints: F([endpoint('/rpc/first'), endpoint('/rpc/second')]),
        accountEndpoint: endpoint('/rpc/account') }),
      materialOptions: { publicKey: PUBLIC, startNonce: f.expected.startNonce, limits: { maxAttempts: 4096, maxDifficulty: 38115000 } },
      materialWaitMs: 5000, wallet: f.wallet, store, fundingResourceUrl: resourceUrl, deadlineMs: 5000,
      fundingTransportOptions: F({ resourceUrl, ca: certificate, maxRequestStarts: 1,
        requestDeadlineMs: 5000, handshakeDeadlineMs: 2000, closeGraceMs: 500 }),
      localReadQualificationOptions: F({ port, ca: certificate }),
    };
  }
  function retainPins(f, pins) {
    assert.ok(active === f && !pinLabels.has(f.label)); pinLabels.add(f.label); assert.ok(++counts.pinFiles <= 3);
    const path = join(ROOT, f.label + '.pins.json'), text = JSON.stringify(pins);
    assert.ok(Buffer.byteLength(text) <= 4096);
    const fd = openSync(path, 'wx', 0o600);
    try { writeFileSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
    return JSON.parse(readOwned(path, 4096, true).toString('utf8')); // Never learned from SQLite.
  }
  async function completeFixture(f) {
    assert.ok(active === f);
    const idle = await observeServiceCreditOperationDrain(F(() => rawSockets.size === 0 && tlsSockets.size === 0 ? 'DRAINED' : 'BUSY'), 1000);
    assert.ok(idle === true && failure === null);
    assert.ok(f.accountCalls === 18 && f.positions[0] === 36 && f.positions[1] === 36);
    assert.ok(f.addresses === 1 && f.signatures === 1);
    assert.ok(f.fundingRequests === (f.label === 'expired-horizon' ? 0 : 1));
    active = null;
  }
  async function close() {
    if (stopped) return;
    stopped = true;
    if (rawSockets.size || tlsSockets.size) {
      failed('SERVER_OWNED_RESOURCES_RETAINED');
      for (const socket of new Set([...rawSockets, ...tlsSockets])) {
        counts.forcedServerSocketDestructions++; socket.destroy();
      }
    }
    try { await new Promise((yes, no) => server.close(error => error ? no(error) : yes())); }
    finally { PRIVATE.fill(0); tlsKey.fill(0); certificate.fill(0); }
    assert.ok(failure === null && rawSockets.size === 0 && tlsSockets.size === 0);
  }
  return F({ fixture, ownerOptions, retainPins, completeFixture, close,
    counts: () => F({ ...counts, uniqueSignedHashes: signed.size, ownedRawSockets: rawSockets.size,
      ownedTlsSockets: tlsSockets.size, fixedVerificationReservation: MAXIMUM.fixedVerificationReservation,
      aggregateCandidateReservation: counts.referenceCandidates + counts.producerCandidateReservation + MAXIMUM.fixedVerificationReservation,
      actualProducerCandidateCount: 'NOT_INSTRUMENTED', nativeOsNetworkSandbox: false, liveOrProduction: false }) });
}
function identity(s) { return [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeNs, s.ctimeNs].map(String); }
function readOwned(path, maximum, privateMode) {
  const before = lstatSync(path, { bigint: true });
  assert.ok(before.isFile() && !before.isSymbolicLink() && before.uid === BigInt(process.getuid())
    && before.nlink === 1n && before.size > 0n && before.size <= BigInt(maximum));
  if (privateMode) assert.ok((before.mode & 0o777n) === 0o600n);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW), out = Buffer.alloc(Number(before.size) + 1);
  try {
    assert.deepEqual(identity(fstatSync(fd, { bigint: true })), identity(before));
    let length = 0;
    while (length < out.length) { const n = readSync(fd, out, length, out.length - length, null); if (n === 0) break; length += n; }
    assert.ok(length === Number(before.size));
    assert.deepEqual(identity(fstatSync(fd, { bigint: true })), identity(before));
    assert.deepEqual(identity(lstatSync(path, { bigint: true })), identity(before));
    return out.subarray(0, length);
  } finally { closeSync(fd); }
}
