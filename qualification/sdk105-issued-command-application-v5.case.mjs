/* SOURCE ONLY: one explicitly selected SDK105 issued-command application case.
 * Real existing SDK1.0.5 KeyPair, actual owned command channel/session/host,
 * local HTTPS + official core + V6 original custody + selected grant/service.
 * No supplied wallet/client/store/transport factory. The fixed existing local
 * binding owns acquisition and all commands cross its real bounded streams.
 * Shared historical fixture sources are unchanged and keep their v4 role flag;
 * this case has an independent explicit scope/profile marker. Old permissions
 * do not transfer. No runtime source transform, alternate key or automatic retry.
 * A future fresh finite approval AND successful storage admission are required.
 */
const E = process.env;
if (process.version !== 'v24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || process.argv.length !== 3 || process.argv[2] !== E.SPV_TASK_SCRATCH
    || E.X402_SDK105_ISSUED_COMMAND_SELECTION !== 'sdk105-issued-command-application-v5'
    || E.X402_SDK105_ISSUED_COMMAND_RUN_SCOPE !== 'one-sdk105-issued-command-application-v5'
    || !['clean', 'pending', 'service-response-loss'].includes(E.X402_SDK105_ISSUED_COMMAND_MODE)
    || E.X402_ISSUED_CLOSE_NATIVE_SELECTION !== 'current-native-issued-close-source-v4'
    || !/^[0-9a-f]{64}$/.test(E.X402_SDK105_ISSUED_COMMAND_PROFILE_SHA256 || '')
    || E.NODE_OPTIONS !== undefined || E.NODE_PATH !== undefined || E.NODE_TEST_CONTEXT !== undefined
    || process.execArgv.some(v => v === '--permission' || v === '--experimental-permission'
      || v.startsWith('--permission=') || v.startsWith('--allow-fs-'))
    || !process.execArgv.some(v => v === '--import' || v.startsWith('--import=')))
  throw new TypeError('SDK105_ISSUED_COMMAND_NOT_ADMITTED_BEFORE_EFFECT_IMPORTS');

const [
  { default: assert }, { default: test }, { Buffer }, crypto, fs, path, net, https,
  ed, { sha512 }, { canonicalJson }, wire, capability,
  { deriveZenonUserSendWorkInput },
  { createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6: CREATE_V6 },
  { openSdk105NativeFundingCommandSessionForLocalQualification: COMMAND },
  { runBuyerOriginalCommandHost: HOST }, { encodeBuyerOriginalFundingCommand: ENCODE },
  { restoreOriginalPaymentCheckpoint: RESTORE }, { computeZenonUnsignedUserSendHash: HASH },
  { KeyPair }, { PassThrough, Writable },
  { createOfficialIssuedFundingPostNativeApplicationV2: APPLICATION },
  { createServiceCreditBoundedNodeHttpsServerFactory: NATIVE_FACTORY },
  { createNativeIssuedFundingPostGrantOperatorFixture: GRANTS },
  { createNativeIssuedFundingPostRpcPeerFixture: RPC },
  { observeServiceCreditOperationDrain: DRAIN },
  { createNativeCommittedResponseLossSelection: SELECT_LOSS, wrapNativeCommittedResponseLossFactory: LOSS_FACTORY },
] = await Promise.all([
  import('node:assert/strict'), import('node:test'), import('node:buffer'), import('node:crypto'),
  import('node:fs'), import('node:path'), import('node:net'), import('node:https'),
  import('@noble/ed25519'), import('@noble/hashes/sha2'), import('../src/canonical.js'),
  import('../src/x402-wire.js'), import('../src/service-credit-capability.js'),
  import('../src/zenon/dynamic-plasma-user-send-work-input.js'),
  import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js'),
  import('../src/zenon/sdk105-native-funding-command-session.js'),
  import('../src/buyer-original-command-host.js'), import('../src/buyer-original-funding-command.js'),
  import('../src/service-credit-pilot-original-payment-checkpoint.js'), import('../src/zenon/transaction-planner.js'),
  import('znn-typescript-sdk'), import('node:stream'),
  import('../src/x402-official-issued-funding-post-native-application-v2.js'),
  import('../src/service-credit-bounded-node-https-server-factory.js'),
  import('./issued-current-close-v4-grant.fixture.mjs'),
  import('./issued-current-close-v4-rpc.fixture.mjs'),
  import('../src/service-credit-bounded-operation-drain.js'),
  import('./native-committed-response-loss.fixture.mjs'),
]);

const F = Object.freeze, ROOT = process.argv[2], MODE = E.X402_SDK105_ISSUED_COMMAND_MODE;
const ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx', ZERO = '0'.repeat(64);
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const CHAIN = F({ version: 1, chainIdentifier: '73404', genesisMomentumHash: '11'.repeat(32) });
const retained = { portOwner: null, grantOperator: null, rpc: null, app: null, client: null,
  initialV6: null, clientOpening: false, appOpening: false, walletKey: null, commandHost: null, io: null, capabilities: [],
  faultSelection: null,
  raw: new Set(), nativeClosePromises: [], held: false, cleanupFailures: 0 };
const counts = { walletKeys: 0, operatorAddressReads: 0, observedSignedTransactions: 0, handoffAfterOwnedKeyClose: false, capabilityKeys: 0,
  capabilitySignatures: 0, referenceCandidates: 0, referenceWindows: 0, independentPinFiles: 0,
  verify: 0, firstSettle: 0, pendingObserve: 0, executions: 0, rawClientStarts: 0,
  rawAuthenticated: 0, rawCleanCloses: 0, originalClientRepeatRefusals: 0, backendExactReplays: 0,
  foreignGrantRefusals: 0, sameFileInitialCloses: 0, borrowedSqlCloses: 0, commandStarts: 0, commandResults: 0, commandInputBytes: 0, commandOutputBytes: 0 };
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
  cancel: F(function cancel(token) {
    clearTimeout(token); serviceTimers.delete(token);
    // This fixed queue callback runs AFTER this turn's synchronous completion
    // transaction and BEFORE the durable HTTP continuation writes its response.
    // The gate independently checks the actual committed original; no SQL or
    // native object method is replaced. A fresh native trial must prove loss.
    retained.faultSelection?.gate.serviceTimerCancelled(); return undefined;
  }),
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

function commandIO() {
  let pending = null, sequence = 0, fault = false;
  const input = new PassThrough({ highWaterMark: 65536 });
  const output = new Writable({ highWaterMark: 65536, write(chunk, encoding, done) {
    const cell = pending;
    try {
      assert.equal(fault, false); assert.ok(cell !== null);
      const raw = Buffer.from(chunk); counts.commandOutputBytes += raw.length;
      assert.ok(raw.length <= 65536 && counts.commandOutputBytes <= 262144);
      const text = raw.toString('utf8'); assert.equal(text.endsWith('\n'), true);
      assert.equal(text.slice(0, -1).includes('\n'), false);
      const reply = JSON.parse(text); assert.equal(reply.version, 1);
      assert.equal(reply.id, cell.id); assert.equal(reply.operation, cell.operation);
      assert.equal(reply.outcome, 'CALLBACK_RETURNED');
      assert.equal(reply.result.authority, 'NONE'); clearTimeout(cell.timer);
      pending = null; counts.commandResults++; done(); cell.resolve(reply.result);
    } catch (error) {
      fault = true; if (cell !== null) { clearTimeout(cell.timer); cell.reject(error); }
      done(error); // Preserve the actual channel's failed-output hold.
    }
  } });
  function rejectWaiting(error) {
    if (pending === null) return;
    const cell = pending; pending = null; clearTimeout(cell.timer); fault = true; cell.reject(error);
  }
  input.on('error', rejectWaiting); output.on('error', rejectWaiting);
  output.once('close', () => rejectWaiting(Error('SDK105_COMMAND_OUTPUT_CLOSED_WITHOUT_RESULT')));
  function line(operation, data) {
    assert.equal(fault, false); assert.ok(++counts.commandStarts <= 8);
    const id = 'sdk105.command.' + (++sequence);
    const encoded = ENCODE({ version: 1, id, operation, input: data }, 65536);
    counts.commandInputBytes += Buffer.byteLength(encoded); assert.ok(counts.commandInputBytes <= 262144);
    return { id, encoded };
  }
  async function issue(operation, data) {
    assert.equal(pending, null); assert.notEqual(operation, 'close');
    const selected = line(operation, data);
    return await new Promise((resolve, reject) => {
      const cell = { id: selected.id, operation, resolve, reject, timer: null }; pending = cell;
      cell.timer = setTimeout(() => { fault = true; reject(Error('SDK105_COMMAND_RESULT_UNKNOWN')); }, 7000);
      try { assert.equal(input.write(selected.encoded, 'utf8'), true); }
      catch (error) { clearTimeout(cell.timer); fault = true; reject(error); }
    });
  }
  function finish() {
    assert.equal(pending, null); const selected = line('close', {});
    input.end(selected.encoded, 'utf8'); // Close has no manufactured result line.
  }
  function stopWaiting() {
    if (pending !== null) { clearTimeout(pending.timer); fault = true;
      pending.reject(Error('SDK105_COMMAND_OWNER_STOPPED_UNKNOWN')); }
  }
  return { input, output, issue, finish, stopWaiting };
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
  assert.equal(signedOriginal.hash, packet.transactionHash); assert.equal(counts.observedSignedTransactions, 1);
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
  retained.held = true; retained.io?.stopWaiting();
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

async function closeCurrentCommand(client, io, expectedCommands, expectedResults, expectedOperations, held) {
  if (!held) io.finish();
  const host = await retained.commandHost;
  assert.equal(host.serviceDelivery, 'NOT_ESTABLISHED'); assert.equal(host.nativeResourceCleanup, 'NOT_QUALIFIED');
  const p = client.close(); assert.equal(client.close(), p);
  if (held) {
    await assert.rejects(p); assert.ok(['CLOSE_UNKNOWN', 'OUTCOME_UNKNOWN'].includes(host.status));
    assert.equal(host.runCompletion, 'REJECTED'); assert.equal(host.closeCompletion, 'REJECTED');
    assert.equal(host.sessionHeld, true); assert.notEqual(host.exitCode, 0);
  } else {
    assert.equal(await p, undefined); assert.equal(host.status, 'CLOSED'); assert.equal(host.exitCode, 0);
    assert.equal(host.ownersClosedObserved, true); assert.equal(host.runCompletion, 'FULFILLED_UNDEFINED');
    assert.equal(host.closeCompletion, 'FULFILLED_UNDEFINED');
  }
  const view = client.inspect(); assert.equal(view.lifecycle, held ? 'HELD' : 'CLOSED'); assert.equal(view.held, held);
  assert.equal(view.commands, expectedCommands); assert.equal(view.admittedOperations, expectedOperations);
  assert.equal(counts.commandStarts, expectedCommands); assert.equal(counts.commandResults, expectedResults);
  assert.equal(view.fundingOutcomeUnknown, false); assert.equal(view.outputOutcomeUnknown, held);
  if (!held) {
    assert.equal(view.currentOwnersClosed, true); assert.equal(view.clientClose, 'CLOSED'); assert.equal(view.channelClose, 'CLOSED');
    assert.equal(io.input.closed, true); assert.equal(io.output.closed, true);
  }
  closeProof = F({ actualCommandHostClosed: host.status === 'CLOSED', hostStatus: host.status,
    sessionLifecycle: view.lifecycle, sessionHeld: view.held,
    currentOwnersClosed: view.currentOwnersClosed, clientClose: view.clientClose, channelClose: view.channelClose,
    historicalClose: view.historicalClose, executionDone: view.executionDone,
    nativePhysicalDrain: 'NOT_QUALIFIED', actualV6PhysicalRelease: 'NOT_QUALIFIED' });
}
async function closeNativeApplicationOwners(app, peer, operator) {
  const rpcView = peer.inspect(); assert.equal(rpcView.counts.accountCalls, 18);
  assert.equal(rpcView.firstRequests, 36); assert.equal(rpcView.secondRequests, 36); assert.equal(rpcView.counts.rpcResponses, 90);
  const appClose = app.close(); assert.equal(app.close(), appClose); assert.equal((await appClose).status, 'CLOSED');
  assert.equal(app.snapshot().phase, 'CLOSED'); assert.equal(app.snapshot().activeOperations, 0);
  const rpcClose = peer.close(); assert.equal(peer.close(), rpcClose); assert.equal(await rpcClose, undefined);
  const observerClose = operator.closeOwnedObservers(); assert.equal(operator.closeOwnedObservers(), observerClose);
  assert.equal(await observerClose, undefined); assert.equal(operator.snapshot().phase, 'CLOSED');
  assert.equal(ingressTimers.size, 0); assert.equal(serviceTimers.size, 0); assert.equal(retained.raw.size, 0);
  // These two borrowed owners are idle after their application owners stopped.
  // A HELD command's payer V6 is NEVER closed or reopened directly here.
  assert.equal(operator.intakeStore.close(), undefined); counts.borrowedSqlCloses++;
  assert.equal(operator.serviceStore.close(), undefined); counts.borrowedSqlCloses++;
  const pending = MODE === 'pending';
  assert.equal(counts.independentPinFiles, pending ? 1 : 2); assert.equal(counts.capabilitySignatures, pending ? 0 : 3);
  assert.equal(counts.rawClientStarts, pending ? 1 : 3); assert.equal(counts.rawCleanCloses, pending ? 1 : 3);
  assert.equal(operator.snapshot().counts.providerSignatureCalls, pending ? 0 : 2);
  assert.equal(retained.walletKey, null); retained.capabilities.length = 0; tlsKey.fill(0); certificate.fill(0);
}
function emitCompletedCase() {
  const pending = MODE === 'pending', loss = MODE === 'service-response-loss';
  console.log('# actual-sdk105-issued-command-application-v5 ' + JSON.stringify({ mode: MODE, caseCompleted: true,
    officialSettlementPhase: retained.app.snapshot().binding.officialPhase, counts,
    actualExistingSdk105KeyPair: true, actualOwnedCommandHost: true,
    actualStreamCommands: counts.commandStarts, actualStreamResults: counts.commandResults,
    expectedHeldCommandOwner: loss, actualV6PhysicalRelease: 'NOT_QUALIFIED',
    taskScratchDisposition: 'PRESERVE_CHILD_FILES', closeProof,
    responseLoss: retained.faultSelection?.gate.inspect() ?? null,
    sourceTransforms: 0, nativeModuleAliases: 0, actualApplication: true, actualNativeHTTPS: true,
    actualOfficialCore: true, sameV6File: true, fundingPosts: 1, actualClientServiceRequests: pending ? 0 : loss ? 1 : 2,
    grantActivation: pending ? 'NOT_REQUESTED_PENDING' : 'ACTUAL_COMPOSITION_WITH_SYNTHETIC_SIGNED_PROVIDER_ENVELOPES',
    chainObservations: 'DECLARED_NOT_AUTHENTICATED', producerCandidateReservation: 4096,
    fixedVerificationReservation: 16384, aggregateCandidateReservation: counts.referenceCandidates + 4096 + 16384,
    sdkPrepareBlock: false, realPayment: false, productionQualified: false, nativePhysicalDrain: 'NOT_QUALIFIED' }));
}

await test('actual SDK105 issued funding through owned commands: ' + MODE, { timeout: 30000, concurrency: false }, async () => {
  let packet = null, completed = false;
  try {
    tlsKey = readPrivate('tls-key.pem', 16384); certificate = readPrivate('tls-cert.pem', 16384);
    const appPort = await reserveThenReleasePort(), origin = 'https://127.0.0.1:' + appPort;
    const resourceUrl = origin + '/funding', serviceResourceUrl = origin + '/service-credit/v1/execute';
    counts.walletKeys++; assert.equal(counts.walletKeys, 1);
    ed.etc.sha512Sync = (...messages) => sha512(ed.etc.concatBytes(...messages));
    const seed = crypto.randomBytes(32);
    try { retained.walletKey = KeyPair.fromPrivateKey(seed); } finally { seed.fill(0); }
    const publicBytes = Buffer.from(retained.walletKey.getPublicKey()), publicKey = publicBytes.toString('base64');
    counts.operatorAddressReads++; const payer = retained.walletKey.getAddress().toString();
    assert.equal(payer, address([0, ...crypto.createHash('sha3-256').update(publicBytes).digest().subarray(0, 19)]));
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
    const genuineFactory = NATIVE_FACTORY(F({ bind: F({ host: '127.0.0.1', port: appPort, exclusive: true }),
      tlsMaterial: F({ key: tlsKey, cert: certificate }) }));
    const factory = LOSS_FACTORY(genuineFactory, F(() => retained.faultSelection));
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
        sdkTuple(args, packet); assert.ok(++counts.pendingObserve <= 2); return settled(args[0], args[1], MODE !== 'pending' && counts.pendingObserve === 2);
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
    const databasePath = path.join(ROOT, 'native-issued-payer-v6.sqlite');
    for (const suffix of ['', '-journal', '-wal', '-shm']) assert.throws(() => fs.lstatSync(databasePath + suffix), e => e.code === 'ENOENT');
    const storeOptions = { databasePath, allowedRoot: ROOT, resourceUrl,
      custodyPolicy: { policyVersion: 1, maxRequests: 4, serviceResourceUrl } };
    retained.initialV6 = CREATE_V6(storeOptions); assert.equal(retained.initialV6.load(), null);
    assert.equal(retained.initialV6.close(), undefined); counts.sameFileInitialCloses++;
    retained.initialV6 = null; const fileId = privateIdentity(databasePath);
    retained.io = commandIO(); const io = retained.io;
    retained.clientOpening = true;
    const client = await COMMAND({ configuration: { storeOptions,
      fundingOptions: { readSessionOptions: peer.readSessionOptions(),
        materialOptions: { publicKey, startNonce: expected.startNonce, limits: { maxAttempts: 4096, maxDifficulty: 38115000 } },
        materialWaitMs: 5000, keyPair: retained.walletKey, expectedAddress: payer, deadlineMs: 5000,
        fundingTransportOptions: F({ resourceUrl, ca: certificate, maxRequestStarts: 1, requestDeadlineMs: 5000,
          handshakeDeadlineMs: 1000, closeGraceMs: 500 }) },
      serviceOptions: { official: { validateChallenge, assetInfo: { asset: ASSET, decimals: 8, symbol: 'ZNN' }, contextLimit: 1 },
        transportOptions: F({ origin, ca: certificate, maxRequestStarts: 2, maxConcurrentRequests: 1,
          requestDeadlineMs: 5000, handshakeDeadlineMs: 1000, closeGraceMs: 500 }), deadlineMs: 5000 },
    }, input: io.input, output: io.output,
      limits: { maxCommands: 8, maxLineBytes: 65536, maxInputBytes: 262144, maxOutputBytes: 262144, closeWaitMs: 1000 } },
      F({ port: peer.port, ca: certificate }));
    retained.client = client; retained.clientOpening = false;
    retained.walletKey = null; // Successful existing-key transfer revokes all caller aliases.
    retained.commandHost = HOST(client); retained.commandHost.catch(() => undefined);
    const prepared = await io.issue('prepare', { plannerContext: { plannerContextVersion: 7, readInput: bound.plannerReadInput },
      challenge: bound.challenge, originalRequest: { requestId: 'native.original', contextId: 'native.context',
        requestBodyBase64: '', contextBase64: Buffer.from('independent-native-original').toString('base64') } });
    assert.equal(prepared.phase, 'AWAITING_INDEPENDENT_PINS'); assert.equal(prepared.independentPinsRequired, true);
    // Operator review precedes pin acceptance: use the issued challenge and
    // independently computed nonce/hash/public identity, never a SQLite read.
    assert.equal(prepared.paymentRequiredHeader, bound.challenge.paymentRequiredHeader);
    const proposal = RESTORE(prepared.serializedCheckpoint, prepared.candidatePins);
    assert.equal(proposal.originalBytes.paymentRequirements, bound.challenge.paymentRequiredHeader);
    const paymentPayload = JSON.parse(Buffer.from(proposal.originalBytes.paymentPayload, 'base64').toString('utf8'));
    wire.validatePaymentPayloadEnvelope(paymentPayload);
    signedOriginal = paymentPayload.payload.transaction; signedOriginalText = JSON.stringify(signedOriginal);
    assert.equal(signedOriginal.address, payer); assert.equal(signedOriginal.publicKey, publicKey);
    assert.equal(signedOriginal.toAddress, payee); assert.equal(signedOriginal.nonce, expected.nonce);
    assert.equal(signedOriginal.difficulty, 3000); assert.equal(signedOriginal.fusedPlasma, 25409);
    assert.equal(signedOriginal.momentumAcknowledged.height, 100);
    assert.equal(signedOriginal.hash, HASH({ ...signedOriginal, signature: '' }));
    assert.equal(ed.verify(Buffer.from(signedOriginal.signature, 'base64'), Buffer.from(signedOriginal.hash, 'hex'), publicBytes), true);
    counts.observedSignedTransactions++; assert.equal(counts.observedSignedTransactions, 1);
    assert.equal(prepared.transactionHash, signedOriginal.hash); assert.equal(proposal.binding.paymentHash, signedOriginal.hash);
    assert.equal(proposal.binding.requestId, 'native.original'); assert.equal(proposal.binding.contextId, 'native.context');
    assert.equal(proposal.binding.origin, origin); assert.equal(proposal.originalBytes.requestBody, '');
    assert.equal(proposal.originalBytes.context, Buffer.from('independent-native-original').toString('base64'));
    packet = { transactionHash: signedOriginal.hash, serializedCheckpoint: prepared.serializedCheckpoint,
      expectedPins: prepared.candidatePins, pair: { challenge: bound.challenge,
        paymentSignatureHeader: proposal.originalBytes.paymentPayload } };
    originalPacketText = JSON.stringify(packet);
    const independent = retainJson('native-issued-original.pins.json', { transactionHash: packet.transactionHash,
      paymentRequiredHeader: packet.pair.challenge.paymentRequiredHeader, paymentSignatureHeader: packet.pair.paymentSignatureHeader,
      serializedCheckpoint: packet.serializedCheckpoint, expectedPins: packet.expectedPins });
    assert.equal((await io.issue('commit', { expectedPins: independent.expectedPins })).phase, 'LOCAL_STORE_READBACK_MATCHED');
    untouched(packet); assert.equal(privateIdentity(databasePath), fileId);
    assert.equal((await io.issue('submitFunding', { expectedPins: independent.expectedPins })).phase, 'FUNDING_INTAKE_BOUND');
    untouched(packet); assert.equal(app.snapshot().paidCalls, 1); assert.equal(app.snapshot().binding.officialPhase, 'PENDING');
    assert.equal((await app.resumeOriginalSettlement()).phase, 'PENDING');
    assert.equal((await app.resumeOriginalSettlement()).phase, MODE === 'pending' ? 'EXHAUSTED' : 'SETTLED');
    assert.equal(counts.verify, 1); assert.equal(counts.firstSettle, 1); assert.equal(counts.pendingObserve, 2);
    if (MODE === 'pending') {
      assert.equal(app.snapshot().binding.officialPhase, 'EXHAUSTED');
      const state = await io.issue('inspect', {}); assert.equal(state.client.phase, 'FUNDING');
      assert.equal(state.client.held, false); assert.equal(state.authority, 'NONE');
      assert.equal(counts.executions, 0); assert.equal(counts.capabilitySignatures, 0);
      untouched(packet); assert.equal(privateIdentity(databasePath), fileId);
      await closeCurrentCommand(client, io, 5, 4, 3, false);
      await closeNativeApplicationOwners(app, peer, operator); completed = true; emitCompletedCase(); return;
    }
    const primary = (await operator.activateBoundOriginal({ transactionHash: independent.transactionHash,
      paymentRequiredHeader: independent.paymentRequiredHeader })).grant;
    const foreign = (await operator.activateDeclaredForeign({ declaredTransactionHash: '99'.repeat(32) })).grant;
    assert.notEqual(primary.grantId, foreign.grantId);
    assert.equal(operator.serviceStore.initializeDurableExecution({ expectedRevision: operator.serviceStore.getMetadata().revision,
      ledgerId: 'native.issued.execution', policy: { policyId: 'native.fixed', policyVersion: 1, maxDurationMs: 1000 }, capacity: 8 }).disposition, 'APPLIED');
    assert.equal(app.admitCommittedServiceGrant(primary.grantId).status, 'ADMITTED');
    const handoff = await io.issue('handoff', { originalPayment: { resourceUrl, serializedCheckpoint: independent.serializedCheckpoint,
      expectedPins: independent.expectedPins }, selectedGrantId: primary.grantId, paymentRequiredHeader: independent.paymentRequiredHeader });
    assert.equal(handoff.phase, 'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED'); assert.equal(privateIdentity(databasePath), fileId); untouched(packet);
    // The actual handoff rechecks its original owned key-close receipt. No
    // borrowed KeyPair method or private-key read is permitted after transfer.
    counts.handoffAfterOwnedKeyClose = true;
    const state = await io.issue('inspect', {}); assert.equal(state.client.phase, 'SERVICE');
    assert.equal(state.client.held, false); assert.equal(state.authority, 'NONE');
    const originals = retainJson('native-issued-service-originals.pins.json', {
      first: serviceOriginal(primary, primaryKey, 'native.first', serviceResourceUrl),
      second: serviceOriginal(primary, primaryKey, 'native.second', serviceResourceUrl),
      foreign: serviceOriginal(foreign, foreignKey, 'native.foreign', serviceResourceUrl),
    });
    if (MODE === 'service-response-loss') {
      // The exact original and proof were retained independently BEFORE dispatch.
      retained.faultSelection = SELECT_LOSS(originals.first, operator.serviceStore);
      const first = io.issue('submitService', originals.first); first.catch(() => undefined);
      const host = await retained.commandHost; await assert.rejects(first);
      assert.equal(host.runCompletion, 'REJECTED'); assert.equal(host.sessionHeld, true);
      const loss = retained.faultSelection.gate.inspect();
      assert.equal(loss.phase, 'COMMITTED_STOP_REQUESTED'); assert.equal(loss.unknown, false);
      assert.equal(loss.commitMatched, true); assert.equal(loss.probeEntries, 1); assert.equal(loss.queueAttempts, 1);
      assert.equal(loss.stopAttempts, 1); assert.equal(loss.stopVoidObserved, true);
      assert.equal(loss.nativePhysicalDrain, 'NOT_QUALIFIED');
    } else {
      assert.equal((await io.issue('submitService', originals.first)).callbackCompleted, true);
    }
    assert.equal(counts.executions, 1);
    assert.equal(operator.serviceStore.getRequest({ grantId: primary.grantId, requestId: 'native.first' }).state, 'SUCCEEDED');
    expectCredit(operator, primary.grantId, foreign.grantId, 2);
    // Backend exact replay and foreign-grant rejection use bounded native
    // operator requests. An invalid command would terminate the owned session;
    // do not bypass that contract to continue a supposedly clean test.
    const replay = await nativePost(serviceResourceUrl, { Authorization: originals.first.authorizationHeader });
    assert.equal(replay.status, 200); assert.equal(JSON.parse(replay.body).resultCode, 'native.ok'); counts.backendExactReplays++;
    expectCredit(operator, primary.grantId, foreign.grantId, 2); assert.equal(counts.executions, 1);
    const wrongGrant = await nativePost(serviceResourceUrl, { Authorization: originals.foreign.authorizationHeader });
    assert.equal(wrongGrant.status, 401); counts.foreignGrantRefusals++;
    assert.equal(operator.serviceStore.getRequest({ grantId: foreign.grantId, requestId: 'native.foreign' }), null);
    expectCredit(operator, primary.grantId, foreign.grantId, 2); assert.equal(counts.executions, 1);
    if (MODE === 'service-response-loss') {
      assert.equal(retained.faultSelection.gate.inspect().stopAttempts, 1); // Operator exact replay was not dropped again.
      assert.equal(operator.serviceStore.getRequest({ grantId: primary.grantId, requestId: 'native.second' }), null);
      expectCredit(operator, primary.grantId, foreign.grantId, 2); assert.equal(counts.executions, 1);
      await closeCurrentCommand(client, io, 6, 5, 5, true);
    } else {
      assert.equal((await io.issue('submitService', originals.second)).callbackCompleted, true);
      await closeCurrentCommand(client, io, 8, 7, 6, false);
      assert.equal(operator.serviceStore.getRequest({ grantId: primary.grantId, requestId: 'native.second' }).state, 'SUCCEEDED');
      expectCredit(operator, primary.grantId, foreign.grantId, 4); assert.equal(counts.executions, 2);
    }
    untouched(packet); assert.equal(privateIdentity(databasePath), fileId); assert.equal(app.snapshot().paidCalls, 1);
    await closeNativeApplicationOwners(app, peer, operator); completed = true; emitCompletedCase();
  } finally {
    if (!completed) await stopOwnersAfterFailure();
  }
});
