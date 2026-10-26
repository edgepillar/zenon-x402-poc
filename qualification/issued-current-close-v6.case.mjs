/*
 * NOT_EXECUTED V6 source candidate; fresh finite native scope required: actual issued-POST -> DP -> V6 -> grant -> service -> whole-close budget.
 * NOT part of the older three-case full-DP manifest or its one-shot allowance.
 * A future separately approved, source/package-pinned launcher must admit this
 * complete graph, its native builtins and resources BEFORE importing it.
 * These cooperative entry guards are NOT authority or an OS/network sandbox.
 * Exactly one CLEAN case/process under a NEW finite scope; no lost-ACK branch.
 * Never clear actual module slots or reuse a HELD owner. Earlier grants do not transfer.
 */
const E = process.env;
if (process.version !== 'v24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || process.argv.length !== 3 || process.argv[2] !== E.SPV_TASK_SCRATCH
    || E.X402_ISSUED_CLOSE_NATIVE_SELECTION !== 'current-native-issued-close-source-v6'
    || E.X402_ISSUED_CLOSE_NATIVE_RUN_SCOPE !== 'one-current-clean-issued-close-v6'
    || E.X402_ISSUED_CLOSE_NATIVE_MODE !== 'clean'
    || !/^[0-9a-f]{64}$/.test(E.X402_ISSUED_CLOSE_NATIVE_PROFILE_SHA256 || '')
    || E.NODE_OPTIONS !== undefined || E.NODE_PATH !== undefined || E.NODE_TEST_CONTEXT !== undefined
    || process.execArgv.some(v => v === '--permission' || v === '--experimental-permission'
      || v.startsWith('--permission=') || v.startsWith('--allow-fs-'))
    || !process.execArgv.some(v => v === '--import' || v.startsWith('--import='))) {
  throw new TypeError('NATIVE_ISSUED_VERTICAL_NOT_ADMITTED_BEFORE_EFFECT_IMPORTS');
}

const [
  { default: assert }, { default: test }, { Buffer }, crypto, fs, path, net, https,
  ed, { sha512 }, { canonicalJson }, wire, capability,
  { deriveZenonUserSendWorkInput },
  { createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6: CREATE_V6 },
  { openZenonDynamicPlasmaNativeFundingServiceClientForLocalQualification: CLIENT },
  { createOfficialIssuedFundingPostNativeApplication: APPLICATION },
  { createServiceCreditBoundedNodeHttpsServerFactory: NATIVE_FACTORY },
  { createNativeIssuedFundingPostGrantOperatorFixture: GRANTS },
  { createNativeIssuedFundingPostRpcPeerFixture: RPC },
  { observeServiceCreditOperationDrain: DRAIN },
] = await Promise.all([
  import('node:assert/strict'), import('node:test'), import('node:buffer'), import('node:crypto'),
  import('node:fs'), import('node:path'), import('node:net'), import('node:https'),
  import('@noble/ed25519'), import('@noble/hashes/sha2'), import('../src/canonical.js'),
  import('../src/x402-wire.js'), import('../src/service-credit-capability.js'),
  import('../src/zenon/dynamic-plasma-user-send-work-input.js'),
  import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js'),
  import('../src/zenon/dynamic-plasma-native-funding-service-client.js'),
  import('../src/x402-official-issued-funding-post-native-application.js'),
  import('../src/service-credit-bounded-node-https-server-factory.js'),
  import('./issued-current-close-v4-grant.fixture.mjs'),
  import('./issued-current-close-v4-rpc.fixture.mjs'),
  import('../src/service-credit-bounded-operation-drain.js'),
]);

const F = Object.freeze, ROOT = process.argv[2], MODE = E.X402_ISSUED_CLOSE_NATIVE_MODE;
const ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx', ZERO = '0'.repeat(64);
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const CHAIN = F({ version: 1, chainIdentifier: '73404', genesisMomentumHash: '11'.repeat(32) });
const retained = { portOwner: null, grantOperator: null, rpc: null, app: null, client: null,
  initialV6: null, clientOpening: false, appOpening: false, walletKey: null, capabilities: [],
  raw: new Set(), nativeClosePromises: [], held: false, cleanupFailures: 0 };
const counts = { walletKeys: 0, walletAddresses: 0, walletSignatures: 0, capabilityKeys: 0,
  capabilitySignatures: 0, referenceCandidates: 0, referenceWindows: 0, independentPinFiles: 0,
  verify: 0, firstSettle: 0, pendingObserve: 0, executions: 0, rawClientStarts: 0,
  rawAuthenticated: 0, rawCleanCloses: 0, originalClientRepeatRefusals: 0, backendExactReplays: 0,
  foreignGrantRefusals: 0, sameFileInitialCloses: 0, borrowedSqlCloses: 0 };
const ingressTimers = new Set(), serviceTimers = new Set();
let tlsKey = null, certificate = null, signedOriginal = null, signedOriginalText = null;
let originalPacketText = null, officialTuple = null, closeProof = null;

function rootIdentity() {
  assert.ok(path.isAbsolute(ROOT) && path.resolve(ROOT) === ROOT);
  for (let at = ROOT; ; at = path.dirname(at)) {
    assert.equal(fs.lstatSync(at).isSymbolicLink(), false);
    if (path.dirname(at) === at) break;
  }
  const s = fs.lstatSync(ROOT, { bigint: true });
  assert.ok(s.isDirectory()); assert.equal(s.uid, BigInt(process.getuid()));
  assert.equal(s.mode & 0o7777n, 0o700n);
  return [s.dev, s.ino, s.uid, s.mode].map(String).join(':');
}
const ROOT_ID = rootIdentity();
function stillRoot() { assert.equal(rootIdentity(), ROOT_ID); }
function privateIdentity(file, cap = 4194304) {
  stillRoot(); assert.equal(path.dirname(file), ROOT);
  const s = fs.lstatSync(file, { bigint: true });
  assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.uid, BigInt(process.getuid()));
  assert.equal(s.mode & 0o7777n, 0o600n); assert.equal(s.nlink, 1n);
  assert.ok(s.size >= 0n && s.size <= BigInt(cap));
  return [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink].map(String).join(':');
}
function readPrivate(name, cap) {
  const file = path.join(ROOT, name), id = privateIdentity(file, cap);
  const before = fs.lstatSync(file, { bigint: true }), fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const identity = s => [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeNs, s.ctimeNs].map(String);
  try {
    assert.deepEqual(identity(fs.fstatSync(fd, { bigint: true })), identity(before));
    const bytes = Buffer.alloc(Number(before.size) + 1); let size = 0;
    while (size < bytes.length) { const n = fs.readSync(fd, bytes, size, bytes.length - size, null); if (!n) break; size += n; }
    assert.equal(size, Number(before.size)); assert.ok(size > 0);
    assert.deepEqual(identity(fs.fstatSync(fd, { bigint: true })), identity(before));
    assert.deepEqual(identity(fs.lstatSync(file, { bigint: true })), identity(before));
    assert.equal(privateIdentity(file, cap), id); return bytes.subarray(0, size);
  } finally { fs.closeSync(fd); }
}
function retainJson(name, value) {
  assert.ok(++counts.independentPinFiles <= 2); stillRoot();
  const file = path.join(ROOT, name), raw = Buffer.from(JSON.stringify(value));
  assert.ok(raw.length <= 65536);
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, raw); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const reread = readPrivate(name, 65536); assert.ok(reread.equals(raw));
  return JSON.parse(reread.toString('utf8')); // Never derive independent originals from SQLite.
}
function scheduleInto(set, callback, delayMs) {
  assert.equal(typeof callback, 'function'); assert.ok(Number.isFinite(delayMs) && delayMs >= 0 && delayMs <= 60000);
  const token = setTimeout(() => { set.delete(token); callback(); }, delayMs);
  set.add(token); return token;
}
const ingressRuntime = F({
  schedule: F(function schedule(callback, ms) { return scheduleInto(ingressTimers, callback, ms); }),
  cancel: F(function cancel(token) { clearTimeout(token); ingressTimers.delete(token); return true; }),
});
const serviceRuntime = F({
  monotonicNowNs: F(function monotonicNowNs() { return process.hrtime.bigint(); }),
  schedule: F(function schedule(callback, ms) { return scheduleInto(serviceTimers, callback, ms); }),
  cancel: F(function cancel(token) { clearTimeout(token); serviceTimers.delete(token); return undefined; }),
}); // Actual distinct contracts: ingress cancel=true; durable-service cancel=undefined.

async function reserveThenReleasePort() {
  let fault = false, closeCallback = false, closeEvent = false, listening = false;
  const server = net.createServer(socket => { fault = true; socket.destroy(); });
  const slot = { server, closePromise: null, stop: null };
  slot.stop = function stop() {
    if (slot.closePromise !== null) return slot.closePromise;
    let yes, no;
    slot.closePromise = new Promise((resolve, reject) => { yes = resolve; no = reject; });
    slot.closePromise.catch(() => undefined); // Cache BEFORE the native call.
    try { server.close(error => { if (error) fault = true; closeCallback = true; }); }
    catch { fault = true; }
    DRAIN(F(() => fault ? 'UNKNOWN' : closeCallback && closeEvent && !server.listening ? 'DRAINED' : 'BUSY'), 1000)
      .then(clean => clean ? yes(undefined) : no(new Error('NATIVE_ISSUED_PORT_CLOSE_UNKNOWN')), no);
    return slot.closePromise;
  };
  retained.portOwner = slot; server.on('error', () => { fault = true; });
  server.once('close', () => { closeEvent = true; });
  const started = new Promise((yes, no) => { server.once('listening', () => { listening = true; yes(); }); server.once('error', no); });
  started.catch(() => undefined);
  server.listen({ host: '127.0.0.1', port: 0, exclusive: true });
  assert.equal(await DRAIN(F(() => fault ? 'UNKNOWN' : listening ? 'DRAINED' : 'BUSY'), 1000), true);
  await started;
  const address = server.address(); assert.equal(address.address, '127.0.0.1');
  assert.ok(Number.isSafeInteger(address.port) && address.port >= 1024 && address.port <= 65535);
  assert.equal(await slot.stop(), undefined);
  retained.portOwner = null; return address.port; // A rebind race MUST refuse; no port retry/fallback.
}

async function nativePost(resourceUrl, extraHeaders = {}) {
  assert.ok(++counts.rawClientStarts <= 3); stillRoot();
  const u = new URL(resourceUrl);
  assert.equal(u.hostname, '127.0.0.1'); assert.equal(u.protocol, 'https:');
  assert.equal(u.search, ''); assert.equal(u.hash, ''); assert.equal(u.username, ''); assert.equal(u.password, '');
  assert.ok(['/funding', '/service-credit/v1/execute'].includes(u.pathname));
  const cell = { request: null, response: null, socket: null, authenticated: false,
    requestClosed: false, responseEnded: false, responseClosed: false, socketClosed: false,
    responseComplete: false, fault: false, timer: null, status: null, headers: null, body: null };
  retained.raw.add(cell); const chunks = []; let bytes = 0;
  function bad() { cell.fault = true; retained.held = true; }
  try {
    const request = https.request({ protocol: 'https:', hostname: '127.0.0.1', family: 4,
      port: Number(u.port), path: u.pathname, method: 'POST', agent: false, ca: certificate,
      rejectUnauthorized: true, servername: '', minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', ALPNProtocols: ['http/1.1'],
      maxHeaderSize: 8192, insecureHTTPParser: false,
      headers: { Host: u.host, Connection: 'close', Accept: 'application/json', 'Content-Length': '0', ...extraHeaders },
    }, response => {
      cell.response = response; cell.status = response.statusCode; cell.headers = response.headers;
      response.on('error', bad); response.once('aborted', bad);
      response.once('close', () => { cell.responseClosed = true; });
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 16384) { bad(); response.destroy(); return; }
        chunks.push(Buffer.from(chunk));
      });
      response.once('end', () => {
        cell.responseComplete = response.complete === true; cell.responseEnded = true;
        cell.body = Buffer.concat(chunks, bytes).toString('utf8');
      });
    });
    cell.request = request; request.on('error', bad);
    request.once('close', () => { cell.requestClosed = true; });
    request.once('socket', socket => {
      cell.socket = socket; socket.on('error', bad);
      socket.once('close', () => { cell.socketClosed = true; });
      socket.once('secureConnect', () => {
        try {
          assert.equal(socket.authorized, true); assert.equal(socket.remoteAddress, '127.0.0.1');
          assert.equal(socket.getProtocol(), 'TLSv1.3'); assert.equal(socket.alpnProtocol, 'http/1.1');
          assert.equal(socket.isSessionReused(), false); cell.authenticated = true; counts.rawAuthenticated++;
        } catch { bad(); request.destroy(); }
      });
    });
    cell.timer = setTimeout(() => { bad(); request.destroy(); }, 2000);
    request.end();
    const drained = await DRAIN(F(function realNativeEvents() {
      if (cell.fault) return 'UNKNOWN';
      return cell.authenticated && cell.requestClosed && cell.responseEnded && cell.responseClosed
        && cell.responseComplete && cell.socketClosed ? 'DRAINED' : 'BUSY';
    }), 1000);
    assert.equal(drained, true); assert.equal(cell.fault, false);
    clearTimeout(cell.timer); cell.timer = null; retained.raw.delete(cell); counts.rawCleanCloses++;
    return F({ status: cell.status, headers: cell.headers, body: cell.body });
  } catch (error) {
    bad(); if (cell.timer !== null) { clearTimeout(cell.timer); cell.timer = null; }
    // Failure-only stop is not clean native release. Keep every handle/evidence.
    try { cell.request?.destroy(); } catch { /* remains HELD */ }
    throw error;
  }
}

function address(core) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', words = []; let bits = 0, acc = 0, checksum = 1;
  for (const byte of core) { acc = (acc << 8) | byte; bits += 8; while (bits >= 5) { bits -= 5; words.push((acc >>> bits) & 31); } }
  assert.equal(bits, 0);
  for (const word of [3, 0, 26, ...words, 0, 0, 0, 0, 0, 0]) {
    const top = checksum >>> 25; checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [i, generator] of [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3].entries())
      if ((top >>> i) & 1) checksum ^= generator;
  }
  checksum = (checksum ^ 1) >>> 0;
  return 'z1' + words.map(v => alphabet[v]).join('')
    + Array.from({ length: 6 }, (_, i) => alphabet[(checksum >>> (5 * (5 - i))) & 31]).join('');
}
function capabilityKey() {
  assert.ok(++counts.capabilityKeys <= 2); const pair = crypto.generateKeyPairSync('ed25519');
  retained.capabilities.push(pair);
  const publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');
  return { privateKey: pair.privateKey, publicKey,
    commitment: capability.deriveServiceCreditCapabilityCommitment({ publicKey }) };
}
function serviceOriginal(grant, key, requestId, serviceResourceUrl) {
  assert.ok(++counts.capabilitySignatures <= 3);
  // This exact property order is the original-request custody JSON contract.
  const request = { modelVersion: 1, grantId: grant.grantId, requestId, method: 'POST',
    routeId: 'service-credit.execute.v1', canonicalBodyDigest: EMPTY, selectedContentType: 'application/json', maxCostUnits: 2 };
  const proof = { proofVersion: 1, grantId: grant.grantId, requestId, publicKey: key.publicKey, maxCostUnits: 2,
    signature: crypto.sign(null, capability.createServiceCreditCapabilitySigningBytes(request), key.privateKey).toString('base64url') };
  assert.equal(capability.verifyServiceCreditCapability({ grant: { grantId: grant.grantId,
    capabilityCommitment: grant.capabilityCommitment }, request, proof }).verified, true);
  return { grantId: grant.grantId, requestId, originalRequestJson: JSON.stringify(request), originalBodyBase64: '', serviceResourceUrl,
    authorizationHeader: 'ServiceCredit ' + Buffer.from(canonicalJson(proof)).toString('base64url') };
}
function reference(subject) {
  const { subjectVersion, ...block } = subject; assert.equal(subjectVersion, 1);
  const work = deriveZenonUserSendWorkInput({ ...block, hash: ZERO, fusedPlasma: 25409, difficulty: 3000,
    nonce: '0000000000000000', publicKey: '', signature: '' });
  const message = Buffer.alloc(40); Buffer.from(work.dataHash, 'hex').copy(message, 8);
  const threshold = (1n << 64n) - (1n << 64n) / 3000n;
  for (let window = 0n; window < 8n; window++) {
    assert.ok(++counts.referenceWindows <= 8);
    for (let offset = 0n; offset < 4096n; offset++) {
      const nonce = window * 4096n + offset; assert.ok(++counts.referenceCandidates <= 32768);
      message.writeBigUInt64LE(nonce);
      if (crypto.createHash('sha3-256').update(message).digest().readBigUInt64LE(0) >= threshold) {
        const start = Buffer.alloc(8), found = Buffer.alloc(8); start.writeBigUInt64LE(window * 4096n); found.writeBigUInt64LE(nonce);
        return F({ startNonce: start.toString('hex'), nonce: found.toString('hex') });
      }
    }
  }
  throw new Error('NATIVE_ISSUED_REFERENCE_EXHAUSTED_NO_REKEY_OR_NEW_RANGE');
}
function untouched(packet) {
  assert.equal(JSON.stringify(packet), originalPacketText); assert.equal(JSON.stringify(signedOriginal), signedOriginalText);
  assert.equal(signedOriginal.hash, packet.transactionHash); assert.equal(counts.walletSignatures, 1);
}
function expectCredit(operator, primaryId, foreignId, spent) {
  const primary = operator.serviceStore.getGrant(primaryId), foreign = operator.serviceStore.getGrant(foreignId);
  assert.equal(primary.availableUnits, 10 - spent); assert.equal(primary.heldUnits, 0); assert.equal(primary.consumedUnits, spent);
  assert.equal(foreign.availableUnits, 10); assert.equal(foreign.heldUnits, 0); assert.equal(foreign.consumedUnits, 0);
}
function sdkTuple(args, packet) {
  assert.equal(args.length, 3); assert.ok(packet !== null);
  const [payload, requirements] = args;
  assert.equal(payload.payload.transaction.hash, packet.transactionHash);
  assert.equal(canonicalJson(requirements), canonicalJson(packet.pair.challenge.paymentRequired.accepts[0]));
  const text = canonicalJson({ payload, requirements });
  if (officialTuple === null) officialTuple = text; else assert.equal(text, officialTuple);
}
function settled(payload, requirements, success) {
  return { success, ...(success ? { payer: payload.payload.transaction.address } : { errorReason: 'settlement_pending' }),
    transaction: payload.payload.transaction.hash, network: requirements.network,
    publicationStatus: success ? 'ACKNOWLEDGED' : 'UNKNOWN' }; // Declared local callback result, NOT publication evidence.
}

async function stopOwnersAfterFailure() {
  retained.held = true;
  if (retained.portOwner !== null) {
    try { const p = retained.portOwner.stop(); retained.nativeClosePromises.push(p); p.catch(() => undefined); }
    catch { retained.cleanupFailures++; }
  }
  // Independent actual stop attempts; a rejection never skips the other owner.
  for (const owner of [retained.client, retained.app, retained.rpc]) {
    if (owner === null) continue;
    try {
      const p = owner.close(); retained.nativeClosePromises.push(p);
      p.catch(() => undefined);
    } catch { retained.cleanupFailures++; }
  }
  const outcomes = retained.nativeClosePromises.map(p => { const cell = { done: false }; p.then(() => { cell.done = true; }, () => { cell.done = true; }); return cell; });
  await DRAIN(F(() => outcomes.every(cell => cell.done) ? 'DRAINED' : 'BUSY'), 1000);
  // No direct close/reopen of V6, no SQL-owner force close, file deletion,
  // timer-set clearing, root adoption or fabricated success after uncertainty.
}

await test('actual current issued funding and whole-close budget: ' + MODE, { timeout: 30000, concurrency: false }, async () => {
  let packet = null, completed = false;
  try {
    tlsKey = readPrivate('tls-key.pem', 16384); certificate = readPrivate('tls-cert.pem', 16384);
    const appPort = await reserveThenReleasePort(), origin = 'https://127.0.0.1:' + appPort;
    const resourceUrl = origin + '/funding', serviceResourceUrl = origin + '/service-credit/v1/execute';
    counts.walletKeys++; assert.equal(counts.walletKeys, 1); retained.walletKey = crypto.randomBytes(32);
    ed.etc.sha512Sync = (...messages) => sha512(ed.etc.concatBytes(...messages));
    const publicBytes = Buffer.from(ed.getPublicKey(retained.walletKey)), publicKey = publicBytes.toString('base64');
    const payer = address([0, ...crypto.createHash('sha3-256').update(publicBytes).digest().subarray(0, 19)]);
    const payee = address([0, ...Array(19).fill(34)]), primaryKey = capabilityKey(), foreignKey = capabilityKey();
    const primarySelection = F({ offerId: 'native.primary', offerVersion: 1, holderId: payer, capabilityCommitment: primaryKey.commitment });
    const foreignSelection = F({ offerId: 'native.foreign', offerVersion: 1, holderId: payer, capabilityCommitment: foreignKey.commitment });
    const operator = GRANTS(F({ root: ROOT, resourceUrl, ledgerDomain: 'native.issued.vertical', primarySelection, foreignSelection, payee,
      chainProfile: CHAIN, bootstrapCheckpoint: F({ height: 100, hash: '33'.repeat(32) }), nowEpochMs: Date.now() }));
    retained.grantOperator = operator;
    const peer = await RPC(F({ tlsMaterial: F({ key: tlsKey, cert: certificate }), payerAddress: payer, payeeAddress: payee }));
    retained.rpc = peer;
    const validateChallenge = F(function validateChallenge(value) {
      wire.validatePaymentRequired(value); assert.equal(value.accepts.length, 1); wire.validateActiveUpfrontRequirement(value.accepts[0]);
      assert.equal(value.accepts[0].asset, ASSET); assert.equal(value.accepts[0].payTo, payee);
    });
    const execute = F(function execute(identity) {
      assert.ok(Object.isFrozen(identity)); assert.equal(typeof identity.executionId, 'string');
      assert.ok(++counts.executions <= 2);
      return { resultCode: 'native.ok' };
    });
    const factory = NATIVE_FACTORY(F({ bind: F({ host: '127.0.0.1', port: appPort, exclusive: true }),
      tlsMaterial: F({ key: tlsKey, cert: certificate }) }));
    retained.appOpening = true;
    const app = await APPLICATION(F({
      funding: F({ intake: F({ store: operator.intakeStore, serviceCreditStore: operator.serviceStore,
        authorityRecord: operator.authorityRecord, deriveFundingTerms: operator.deriveFundingTerms, now: operator.now,
        observerRoot: ROOT, observerCatchUp: operator.observerCatchUp, selection: primarySelection, resourceUrl }),
      official: F({ localFacilitator: {
        verify(...args) { sdkTuple(args, packet); assert.equal(++counts.verify, 1); return { isValid: true, payer }; },
        settle(...args) { sdkTuple(args, packet); assert.equal(++counts.firstSettle, 1); return settled(args[0], args[1], false); },
      }, validateChallenge,
      reconcilePendingSettlement: F(function reconcile(...args) {
        sdkTuple(args, packet); assert.ok(++counts.pendingObserve <= 2); return settled(args[0], args[1], counts.pendingObserve === 2);
      }), maxPendingReconciliations: 2 }), maxIntakeAttempts: 1, closeBudgetMs: 1000 }),
      service: F({ store: operator.serviceStore, execute, deadlineRuntime: serviceRuntime, selectedDurationMs: 1000 }),
      transport: F({ origin, generation: F({ generationId: 'native.issued.vertical', generationVersion: 1 }),
        limits: F({ maxHeaderBytes: 16384, maxHeaderCount: 16, maxConcurrentSockets: 2, maxConnectionStarts: 8,
          maxConcurrentRequests: 1, maxRequestStarts: 8, tlsHandshakeDeadlineMs: 1000, headerDeadlineMs: 2000,
          requestResponseDeadlineMs: 5000, idleSocketDeadlineMs: 2000, startDeadlineMs: 1000, closeGraceMs: 5000, metricsCounterLimit: 10000 }),
        deadlineRuntime: ingressRuntime, httpsServerFactory: factory }),
    }));
    retained.app = app; retained.appOpening = false;
    assert.equal((await app.start()).status, 'LISTENING');
    const unpaid = await nativePost(resourceUrl);
    assert.equal(unpaid.status, 402); assert.equal(unpaid.body, 'Payment Required');
    const frame = F({ status: unpaid.status, paymentRequiredHeader: unpaid.headers['payment-required'], body: unpaid.body });
    const bound = peer.bindIssuedChallenge(F({ resourceUrl, frame })), expected = reference(bound.unsignedSubject);
    assert.ok(counts.referenceCandidates + 4096 + 16384 <= 65536);
    const wallet = F({
      getAddress: F(function getAddress() { assert.equal(++counts.walletAddresses, 1); return Promise.resolve(payer); }),
      sign: F(function sign(block) {
        assert.equal(++counts.walletSignatures, 1); assert.equal(block.publicKey, publicKey);
        assert.equal(block.nonce, expected.nonce); assert.equal(block.difficulty, 3000); assert.equal(block.fusedPlasma, 25409);
        assert.equal(block.momentumAcknowledged.height, 100); assert.ok(Object.isFrozen(block));
        signedOriginal = block; signedOriginalText = JSON.stringify(block);
        const signature = Buffer.from(ed.sign(Buffer.from(block.hash, 'hex'), retained.walletKey)).toString('base64');
        return Promise.resolve({ ...JSON.parse(signedOriginalText), signature });
      }),
    });
    const databasePath = path.join(ROOT, 'native-issued-payer-v6.sqlite');
    for (const suffix of ['', '-journal', '-wal', '-shm']) assert.throws(() => fs.lstatSync(databasePath + suffix), e => e.code === 'ENOENT');
    const storeOptions = { databasePath, allowedRoot: ROOT, resourceUrl,
      custodyPolicy: { policyVersion: 1, maxRequests: 4, serviceResourceUrl } };
    retained.initialV6 = CREATE_V6(storeOptions); assert.equal(retained.initialV6.load(), null);
    assert.equal(retained.initialV6.close(), undefined); counts.sameFileInitialCloses++;
    retained.initialV6 = null; const fileId = privateIdentity(databasePath);
    retained.clientOpening = true;
    const client = await CLIENT({ storeOptions,
      fundingOptions: { readSessionOptions: peer.readSessionOptions(),
        materialOptions: { publicKey, startNonce: expected.startNonce, limits: { maxAttempts: 4096, maxDifficulty: 38115000 } },
        materialWaitMs: 5000, wallet, deadlineMs: 5000,
        fundingTransportOptions: F({ resourceUrl, ca: certificate, maxRequestStarts: 1, requestDeadlineMs: 5000,
          handshakeDeadlineMs: 1000, closeGraceMs: 500 }) },
      serviceOptions: { official: { validateChallenge, assetInfo: { asset: ASSET, decimals: 8, symbol: 'ZNN' }, contextLimit: 1 },
        transportOptions: F({ origin, ca: certificate, maxRequestStarts: 2, maxConcurrentRequests: 1,
          requestDeadlineMs: 5000, handshakeDeadlineMs: 1000, closeGraceMs: 500 }), deadlineMs: 5000 },
    }, F({ port: peer.port, ca: certificate }));
    retained.client = client; retained.clientOpening = false;
    const prepared = await client.prepareOriginalFunding({ plannerContext: { plannerContextVersion: 7, readInput: bound.plannerReadInput },
      challenge: bound.challenge, originalRequest: { requestId: 'native.original', contextId: 'native.context',
        requestBodyBase64: '', contextBase64: Buffer.from('independent-native-original').toString('base64') } });
    assert.equal(prepared.phase, 'AWAITING_INDEPENDENT_PINS'); packet = prepared.packet; originalPacketText = JSON.stringify(packet);
    const independent = retainJson('native-issued-original.pins.json', { transactionHash: packet.transactionHash,
      paymentRequiredHeader: packet.pair.challenge.paymentRequiredHeader, paymentSignatureHeader: packet.pair.paymentSignatureHeader,
      serializedCheckpoint: packet.serializedCheckpoint, expectedPins: packet.expectedPins });
    assert.equal((await client.commitOriginalFunding({ expectedPins: independent.expectedPins })).phase, 'LOCAL_STORE_READBACK_MATCHED');
    untouched(packet); assert.equal(privateIdentity(databasePath), fileId);
    assert.equal((await client.submitOriginalFunding({ expectedPins: independent.expectedPins })).phase, 'FUNDING_INTAKE_BOUND');
    untouched(packet); assert.equal(app.snapshot().paidCalls, 1); assert.equal(app.snapshot().binding.officialPhase, 'PENDING');
    assert.equal((await app.resumeOriginalSettlement()).phase, 'PENDING');
    assert.equal((await app.resumeOriginalSettlement()).phase, 'SETTLED');
    assert.equal(counts.verify, 1); assert.equal(counts.firstSettle, 1); assert.equal(counts.pendingObserve, 2);
    const primary = (await operator.activateBoundOriginal({ transactionHash: independent.transactionHash,
      paymentRequiredHeader: independent.paymentRequiredHeader })).grant;
    const foreign = (await operator.activateDeclaredForeign({ declaredTransactionHash: '99'.repeat(32) })).grant;
    assert.notEqual(primary.grantId, foreign.grantId);
    assert.equal(operator.serviceStore.initializeDurableExecution({ expectedRevision: operator.serviceStore.getMetadata().revision,
      ledgerId: 'native.issued.execution', policy: { policyId: 'native.fixed', policyVersion: 1, maxDurationMs: 1000 }, capacity: 8 }).disposition, 'APPLIED');
    assert.equal(app.admitCommittedServiceGrant(primary.grantId).status, 'ADMITTED');
    const handoff = await client.handoffToService({ originalPayment: { resourceUrl, serializedCheckpoint: independent.serializedCheckpoint,
      expectedPins: independent.expectedPins }, selectedGrantId: primary.grantId, paymentRequiredHeader: independent.paymentRequiredHeader });
    assert.equal(handoff.phase, 'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED'); assert.equal(privateIdentity(databasePath), fileId); untouched(packet);
    const originals = retainJson('native-issued-service-originals.pins.json', {
      first: serviceOriginal(primary, primaryKey, 'native.first', serviceResourceUrl),
      second: serviceOriginal(primary, primaryKey, 'native.second', serviceResourceUrl),
      foreign: serviceOriginal(foreign, foreignKey, 'native.foreign', serviceResourceUrl),
    });
    assert.equal(await client.submitOriginal(originals.first), undefined); assert.equal(counts.executions, 1);
    assert.equal(operator.serviceStore.getRequest({ grantId: primary.grantId, requestId: 'native.first' }).state, 'SUCCEEDED');
    expectCredit(operator, primary.grantId, foreign.grantId, 2);
    const serviceCalls = app.snapshot().serviceCalls;
    await assert.rejects(client.submitOriginal(originals.first), e => e.code === 'zenon_native_funding_service_client_operation_unavailable');
    counts.originalClientRepeatRefusals++;
    assert.equal(app.snapshot().serviceCalls, serviceCalls); assert.equal(counts.executions, 1);
    const replay = await nativePost(serviceResourceUrl, { Authorization: originals.first.authorizationHeader });
    assert.equal(replay.status, 200); assert.equal(JSON.parse(replay.body).resultCode, 'native.ok'); counts.backendExactReplays++;
    expectCredit(operator, primary.grantId, foreign.grantId, 2); assert.equal(counts.executions, 1);
    const wrongGrant = await nativePost(serviceResourceUrl, { Authorization: originals.foreign.authorizationHeader });
    assert.equal(wrongGrant.status, 401); counts.foreignGrantRefusals++;
    assert.equal(operator.serviceStore.getRequest({ grantId: foreign.grantId, requestId: 'native.foreign' }), null);
    expectCredit(operator, primary.grantId, foreign.grantId, 2); assert.equal(counts.executions, 1);
    {
      assert.equal(await client.submitOriginal(originals.second), undefined);
      const p = client.close(); assert.equal(client.close(), p); assert.equal(await p, undefined);
      const view = client.inspect(), completion = view.closeCompletion;
      assert.equal(view.lifecycle, 'CLOSED'); assert.equal(view.held, false);
      assert.equal(view.historicalClose, 'FULFILLED_UNDEFINED');
      assert.equal(view.applicationSlotHeld, false); assert.equal(view.applicationSlotPhase, 'RELEASED');
      assert.equal(view.operationDrain, 'DRAINED'); assert.equal(view.fundingCloseOutcome, 'CLOSED');
      assert.equal(view.serviceCloseOutcome, 'CLOSED'); assert.equal(view.closeCompletionOutcome, 'DRAINED');
      assert.equal(view.funding.lifecycle, 'CLOSED'); assert.equal(view.service.lifecycle, 'CLOSED');
      assert.equal(completion.boundedCloseCompletionVersion, 1); assert.equal(completion.budgetMs, 1000);
      assert.equal(completion.started, true); assert.equal(completion.completionOffered, true);
      assert.equal(completion.outcome, 'CLOSED'); assert.equal(completion.refusal, null);
      assert.equal(completion.observationStarts, 1); assert.equal(completion.completionProbeEntries, 1);
      assert.equal(view.funding.nativeResourceClose.storeCloseCallEntered, true);
      assert.equal(view.funding.nativeResourceClose.storeCloseCallReturned, true);
      closeProof = F({ wholeCloseBudgetObserved: true, budgetMs: completion.budgetMs,
        outcome: completion.outcome, observationStarts: completion.observationStarts,
        completionProbeEntries: completion.completionProbeEntries, operationDrain: view.operationDrain,
        fundingClose: view.fundingCloseOutcome, serviceClose: view.serviceCloseOutcome,
        historicalClose: view.historicalClose, applicationSlotHeld: view.applicationSlotHeld,
        currentFundingClosed: view.funding.lifecycle === 'CLOSED', currentServiceClosed: view.service.lifecycle === 'CLOSED',
        actualFundingStoreCloseReturned: view.funding.nativeResourceClose.storeCloseCallReturned });
    }
    // The real local ledger must show both executions, not just a client receipt.
    assert.equal(operator.serviceStore.getRequest({ grantId: primary.grantId, requestId: 'native.second' }).state, 'SUCCEEDED');
    expectCredit(operator, primary.grantId, foreign.grantId, 4); assert.equal(counts.executions, 2);
    untouched(packet); assert.equal(privateIdentity(databasePath), fileId); assert.equal(app.snapshot().paidCalls, 1);
    const rpcView = peer.inspect(); assert.equal(rpcView.counts.accountCalls, 18);
    assert.equal(rpcView.firstRequests, 36); assert.equal(rpcView.secondRequests, 36); assert.equal(rpcView.counts.rpcResponses, 90);
    const appClose = app.close(); assert.equal(app.close(), appClose); assert.equal((await appClose).status, 'CLOSED');
    assert.equal(app.snapshot().phase, 'CLOSED'); assert.equal(app.snapshot().activeOperations, 0);
    const rpcClose = peer.close(); assert.equal(peer.close(), rpcClose); assert.equal(await rpcClose, undefined);
    const observerClose = operator.closeOwnedObservers(); assert.equal(operator.closeOwnedObservers(), observerClose);
    assert.equal(await observerClose, undefined); assert.equal(operator.snapshot().phase, 'CLOSED');
    assert.equal(ingressTimers.size, 0); assert.equal(serviceTimers.size, 0); assert.equal(retained.raw.size, 0);
    // Only these borrowed owners are now known idle/closed at their admissions.
    // An expected HELD client retains its V6; it is never closed directly here.
    assert.equal(operator.intakeStore.close(), undefined); counts.borrowedSqlCloses++;
    assert.equal(operator.serviceStore.close(), undefined); counts.borrowedSqlCloses++;
    assert.equal(counts.independentPinFiles, 2); assert.equal(counts.capabilitySignatures, 3);
    assert.equal(counts.rawClientStarts, 3); assert.equal(counts.rawCleanCloses, 3);
    assert.equal(operator.snapshot().counts.providerSignatureCalls, 2);
    retained.walletKey.fill(0); retained.walletKey = null; retained.capabilities.length = 0;
    tlsKey.fill(0); certificate.fill(0); completed = true;
    console.log('# actual-issued-native-close-completion-v6 ' + JSON.stringify({ mode: MODE, caseCompleted: true, counts,
      expectedHeldV6: false, taskScratchDisposition: 'PRESERVE_CHILD_FILES', closeProof,
      sourceTransforms: 0, nativeModuleAliases: 0, actualApplication: true, actualNativeHTTPS: true,
      actualOfficialCore: true, sameV6File: true, fundingPosts: 1, actualClientServiceRequests: 2,
      grantActivation: 'ACTUAL_COMPOSITION_WITH_SYNTHETIC_SIGNED_PROVIDER_ENVELOPES',
      chainObservations: 'DECLARED_NOT_AUTHENTICATED', producerCandidateReservation: 4096,
      fixedVerificationReservation: 16384, aggregateCandidateReservation: counts.referenceCandidates + 4096 + 16384,
      sdkPrepareBlock: false, realPayment: false, productionQualified: false, nativePhysicalDrain: 'NOT_QUALIFIED' }));
  } finally {
    if (!completed) await stopOwnersAfterFailure();
  }
});
