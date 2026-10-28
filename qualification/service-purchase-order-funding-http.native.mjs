// Native qualification source. Import/execution requires its separate finite scope.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { request as nativeRequest } from 'node:https';
import path from 'node:path';
import { createPurchasedOrderFundingNativeHttpApplication as createApplication } from '../src/service-purchase-order-funding-native-http-application.js';
import { purchasedOrderFundingSelectionFromRecovery as restore } from '../src/service-purchase-order-funding-application-core.js';
import { capturePurchasedOrderPayment } from '../src/service-purchase-order-funding.js';
import { inspectPurchasedOrderFundingEnvelope as envelope } from '../src/service-purchase-order-funding-cas-contract.js';
import { createServiceCreditBoundedNodeHttpsServerFactory as serverFactory } from '../src/service-credit-bounded-node-https-server-factory.js';
import { createFundingPostNativeHttpsTransport as clientTransport } from '../src/service-credit-funding-post-native-https-transport.js';
import { createFundingPostNativeResponseCustody as responseCustody } from '../src/service-credit-funding-post-native-response.js';
import { startFundingPostReadableFlow } from '../src/service-credit-funding-post-readable-flow.js';
import { nativeOrderFundingHttpFixture as fixture, orderFundingOwnerInputs as inputs, orderFundingProof as proof } from './service-purchase-order-funding-http-native.fixture.mjs';

const F = Object.freeze, sha = value => createHash('sha256').update(value).digest('hex');
assert.equal(process.versions.node, '24.19.0'); assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.X402_ORDER_HTTP_NATIVE_PRELOADED, 'source-pins-verified');
assert.equal(process.argv.length, 4); const root = process.argv[2], mode = process.argv[3];
assert.ok(['write', 'reopen'].includes(mode)); assert.equal(root, path.resolve(root)); assert.equal(process.env.SPV_TASK_SCRATCH, root);
for (let at = root; ; at = path.dirname(at)) { assert.equal(lstatSync(at).isSymbolicLink(), false); if (at === path.dirname(at)) break; }
const rs = lstatSync(root); assert.ok(rs.isDirectory()); assert.equal(rs.uid, process.getuid()); assert.equal(rs.mode & 0o777, 0o700);
process.umask(0o077); for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_V8_COVERAGE']) assert.equal(process.env[key], undefined);
const names = ['order-http-a.sqlite', 'order-http-b.sqlite', 'order-http-pins.json', 'test-tls.key', 'test-tls.crt', 'test-tls.cnf'];
const owned = JSON.parse(process.env.X402_ORDER_HTTP_NATIVE_OWNED_FILES); assert.deepEqual(Object.keys(owned).sort(), [...names].sort());
function identity(file) {
  const s = lstatSync(file, { bigint: true }); assert.ok(s.isFile() && !s.isSymbolicLink());
  assert.equal(s.uid, BigInt(process.getuid())); assert.equal(s.nlink, 1n); assert.equal(s.mode & 0o777n, 0o600n); assert.ok(s.size <= 1048576n);
  return [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink].map(String);
}
function file(name, empty = false) {
  assert.ok(names.includes(name)); const p = path.join(root, name); assert.deepEqual(identity(p), owned[name]);
  if (empty) assert.equal(lstatSync(p).size, 0); return p;
}
function readOwned(name) {
  const p = file(name), before = lstatSync(p, { bigint: true });
  const stamp = s => [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeNs, s.ctimeNs].map(String);
  const fd = openSync(p, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    assert.deepEqual(stamp(fstatSync(fd, { bigint: true })), stamp(before)); const raw = readFileSync(fd);
    assert.equal(BigInt(raw.length), before.size); assert.deepEqual(stamp(fstatSync(fd, { bigint: true })), stamp(before));
    assert.deepEqual(stamp(lstatSync(p, { bigint: true })), stamp(before)); return raw;
  } finally { closeSync(fd); }
}
const key = readOwned('test-tls.key'), cert = readOwned('test-tls.crt');
assert.ok(key.length > 0 && key.length <= 16384 && cert.length > 0 && cert.length <= 16384);
const pinPath = file('order-http-pins.json', mode === 'write'), cases = [], databases = new Set(), applications = new Set(), transports = new Set();
let opens = 0, verificationCalls = 0, nativeFactoryCalls = 0, rawClientStarts = 0, transportStarts = 0;
let rawSocketAssignments = 0, retainedBeforeListen = 0; const rawObservations = [], transportObservations = [];
const phaseClientLimit = mode === 'write' ? 15 : 1;
function claimClientStart() { assert.ok(rawClientStarts + transportStarts < phaseClientLimit, 'phase connection budget'); }
function selected(f, index, expectedEnvelopeJson = null, ownerId = 'worker.native.http.write') {
  return { purchase: Object.fromEntries(['termsJson', 'termsDigest', 'paymentCheckpointJson', 'paymentPinsJson', 'fundingContextJson'].map((name, i) => [name, inputs(f)[i]])),
    ownership: { storeId: 'store.native.http.' + index, ownerId, expectedEnvelopeJson }, maximumVerificationAttempts: 3, closeBudgetMs: 1000 };
}
function recoveryView(app) { const record = app.exportRecoveryRecord(); return { record, envelope: envelope(JSON.parse(record.recordJson).expectedEnvelopeJson) }; }
function open(index, existing) {
  assert.ok(++opens <= 2); const db = new DatabaseSync(file(names[index], !existing), {
    allowExtension: false, enableDoubleQuotedStringLiterals: false, enableForeignKeyConstraints: true, readOnly: false, timeout: 0,
  });
  databases.add(db); db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA temp_store=MEMORY; PRAGMA foreign_keys=ON'); return db;
}
function create(index, f, db, selection, verify, expectedPhase) {
  let app;
  const port = 49371 + index, url = 'https://127.0.0.1:' + port + '/funding'; assert.equal(f.verifierContext.resourceUrl, url);
  const actualFactory = serverFactory(F({ bind: F({ host: '127.0.0.1', port, exclusive: true }), tlsMaterial: F({ key, cert }) }));
  const counted = F((options, callbacks) => {
    const before = recoveryView(app).envelope;
    assert.equal(JSON.parse(before.receiptJson).phase, expectedPhase); assert.equal(JSON.parse(before.receiptJson).paymentRecordJson, capturePurchasedOrderPayment(...inputs(f)).paymentRecordJson);
    retainedBeforeListen++; nativeFactoryCalls++; return actualFactory(options, callbacks);
  });
  app = createApplication({ database: db, databaseMode: mode === 'write' ? 'CREATE_NEW' : 'OPEN_EXISTING', limits: { maxRecords: 1 },
    purchaseHttp: { selection, fundingCandidateJson: proof() }, verifyFundingEvidence: value => { verificationCalls++; return verify(value); },
    transport: { origin: new URL(url).origin, generation: { generationId: 'native.http.' + mode + '.' + index, generationVersion: 1 },
      limits: { maxHeaderBytes: 16384, maxHeaderCount: 64, maxConcurrentSockets: 4, maxConnectionStarts: 12,
        maxConcurrentRequests: 2, maxRequestStarts: 12, tlsHandshakeDeadlineMs: 1000, headerDeadlineMs: 1000,
        requestResponseDeadlineMs: 2000, idleSocketDeadlineMs: 3000, startDeadlineMs: 2000, closeGraceMs: 3000, metricsCounterLimit: 512 },
      deadlineLimits: { maxScheduleStarts: 256, maxConcurrentTimers: 32, maxDelayMs: 3000 }, httpsServerFactory: counted } });
  applications.add(app); return app;
}
async function closeApplication(app, db) {
  assert.equal(await app.close(), undefined); const s = app.snapshot();
  assert.equal(s.phase, 'CLOSED'); assert.equal(s.appClose, 'DRAINED'); assert.equal(s.ingressClose, 'DRAINED'); assert.equal(s.timerClose, 'DRAINED');
  assert.equal(s.application.application.logicalBackendRetired, true); assert.equal(s.application.application.borrowedDatabaseReferenceRetained, false);
  for (const field of ['trackedSockets', 'trackedRequests', 'trackedHandlers', 'ownedTimers']) assert.equal(s.ingress[field], 0);
  assert.equal(db.prepare('SELECT 1 AS value').get().value, 1); // A logical wrapper never owns physical DB close.
  applications.delete(app); db.close(); databases.delete(db); return s;
}
function transport(url, starts = 2) {
  const c = clientTransport({ resourceUrl: url, ca: cert, maxRequestStarts: starts, requestDeadlineMs: 3000, handshakeDeadlineMs: 1000, closeGraceMs: 1000 });
  transports.add(c); return c;
}
async function fetchOriginal(client, url, signature) {
  claimClientStart(); transportStarts++;
  const headers = signature === null ? { 'Content-Length': '0' } : { 'Content-Length': '0', 'PAYMENT-SIGNATURE': signature };
  const r = await client.fetchImpl(url, { method: 'POST', redirect: 'manual', cache: 'no-store', credentials: 'omit', headers, signal: new AbortController().signal });
  const reader = r.body.getReader(); let body = '', bytes = 0;
  for (;;) { const v = await reader.read(); if (v.done) break; bytes += v.value.byteLength; assert.ok(bytes <= 64); body += Buffer.from(v.value).toString('utf8'); }
  return { status: r.status, headers: r.headers, body };
}
async function closeTransport(client) {
  const receipt = await client.close(); assert.ok(Object.isFrozen(receipt));
  assert.equal(receipt.phase, 'CLOSED'); assert.equal(receipt.trackedRequests, 0); assert.equal(receipt.trackedSockets, 0); assert.equal(receipt.ownedTimers, 0);
  const view = client.snapshot(); assert.equal(view.phase, 'CLOSED'); assert.equal(view.unknown, false);
  assert.equal(view.trackedRequests + view.trackedSockets + view.ownedTimers, 0); transportObservations.push(view); transports.delete(client);
}
function bound(r) {
  assert.equal(r.status, 202); assert.equal(r.body, 'BOUND'); assert.equal(r.headers.get('vary'), 'PAYMENT-SIGNATURE');
  assert.equal(r.headers.get('content-length'), '5'); assert.equal(r.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(r.headers.get('payment-response'), null); assert.equal(r.headers.get('payment-required'), null);
}
// This fixture client is used only for malformed requests and one intentional
// abort after headers. Positive original replays use the actual native client.
// Body acceptance is distinct from bytes present in an OS/TLS receive buffer.
function rawRequest(url, signature, edit = {}, abortAfterHeaders = false) {
  claimClientStart(); rawClientStarts++;
  return new Promise((resolve, reject) => {
    const u = new URL(url); assert.equal(u.hostname, '127.0.0.1'); assert.ok(['49371', '49372'].includes(u.port));
    const custody = responseCustody(), state = { requestClosed: false, socketClosed: false, headersObserved: false,
      authenticated: false, bodyHandedOff: false, abortAfterHeaders, aborted: false, bytesObservedAfterAbort: 0, nativeFailure: false, done: false };
    rawObservations.push(state); let request, timer;
    function stop(cause) { state.nativeFailure = true; try { custody.fail(); } catch {} if (!state.done) { state.done = true; clearTimeout(timer); reject(cause); } try { request?.destroy(); } catch {} }
    function finish() {
      if (state.done || !state.requestClosed || !state.socketClosed) return;
      try {
        assert.equal(state.headersObserved, true); assert.equal(state.authenticated, true);
        if (abortAfterHeaders) { assert.equal(state.aborted, true); assert.equal(custody.snapshot().unknown, true); assert.equal(custody.snapshot().taken, false); }
        else {
          assert.equal(state.nativeFailure, false); const r = custody.takeResponse(); state.bodyHandedOff = true;
          const body = r.body.toString('utf8'); r.body.fill(0); state.status = r.statusCode; state.body = body;
        }
        state.done = true; clearTimeout(timer); resolve(F({ status: state.status, body: state.body ?? null,
          bodyHandedOff: state.bodyHandedOff, phase: custody.snapshot().phase, authenticated: state.authenticated, requestClosed: true, socketClosed: true }));
      } catch (cause) { stop(cause); }
    }
    const body = edit.body ?? '';
    request = nativeRequest(url, { method: edit.method ?? 'POST', path: edit.path ?? '/funding',
      headers: { Host: edit.host ?? u.host, Connection: 'close', 'Content-Length': String(Buffer.byteLength(body)), 'PAYMENT-SIGNATURE': signature },
      agent: false, ca: cert, rejectUnauthorized: true, servername: '', minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', ALPNProtocols: ['http/1.1'],
      maxHeaderSize: 16384, insecureHTTPParser: false }, response => {
      response.on('error', cause => { if (!state.aborted) stop(cause); });
      try {
        assert.equal(state.authenticated, true); custody.acceptHeaders({ statusCode: response.statusCode, rawHeaders: response.rawHeaders });
        state.headersObserved = true; state.status = response.statusCode;
        response.on('data', chunk => { if (state.aborted) state.bytesObservedAfterAbort += chunk.length; else { try { custody.acceptChunk(chunk); } catch (e) { stop(e); } } });
        response.once('end', () => { if (!state.aborted) { try { assert.equal(response.complete, true); assert.equal(response.rawTrailers.length, 0); custody.acceptEnd(); } catch (e) { stop(e); } } });
        if (abortAfterHeaders) { assert.equal(response.statusCode, 202); state.aborted = true; custody.fail(); request.destroy(Error('synthetic client abort before body handoff')); }
        else startFundingPostReadableFlow(response);
      } catch (cause) { stop(cause); }
    });
    request.on('error', cause => { if (!state.aborted) stop(cause); });
    request.once('close', () => { state.requestClosed = true; if (!state.aborted) { try { custody.acceptRequestClose(); } catch (e) { stop(e); } } finish(); });
    request.once('socket', socket => {
      rawSocketAssignments++; socket.on('error', cause => { if (!state.aborted) stop(cause); });
      socket.once('secureConnect', () => { try { assert.equal(socket.authorized, true); assert.equal(socket.getProtocol(), 'TLSv1.3'); assert.equal(socket.alpnProtocol, 'http/1.1'); custody.acceptTls(); state.authenticated = true; } catch (e) { stop(e); } });
      socket.once('close', hadError => { state.socketClosed = true; if (!state.aborted) { try { custody.acceptSocketClose({ hadError }); } catch (e) { stop(e); } } finish(); });
    });
    timer = setTimeout(() => stop(Error('native fixture request deadline')), 4000); request.end(body);
  });
}
async function check(id, work) { await work(); cases.push({ id, status: 'PASS' }); }
let pins;
try {
  if (mode === 'write') {
    const at = Date.now() - 60000, a = fixture('order.native.http.a', 'https://127.0.0.1:49371/funding', at);
    const b = fixture('order.native.http.b', 'https://127.0.0.1:49372/funding', at);
    const aDB = open(0, false), app = create(0, a, aDB, selected(a, 0), () => Promise.resolve(a.verifiedRecord), 'RETAINED');
    await check('NATIVE-STARTUP-RETAINS-ORIGINAL-BEFORE-LISTENER', async () => {
      assert.equal(nativeFactoryCalls, 0); assert.equal(await app.start(), undefined); assert.equal(nativeFactoryCalls, 1); assert.equal(retainedBeforeListen, 1);
      assert.equal(JSON.parse(recoveryView(app).envelope.receiptJson).phase, 'RETAINED'); assert.equal(verificationCalls, 0);
    });
    const original = capturePurchasedOrderPayment(...inputs(a)); let lost;
    await check('NATIVE-FIRST-BOUND-REPLY-ABORT-PRESERVES-VERIFIED-ORIGINAL', async () => {
      lost = await rawRequest(a.verifierContext.resourceUrl, original.checkpoint.originalBytes.paymentPayload, {}, true);
      assert.equal(lost.status, 202); assert.equal(lost.bodyHandedOff, false); assert.equal(lost.phase, 'UNKNOWN');
      const r = JSON.parse(recoveryView(app).envelope.receiptJson); assert.equal(r.phase, 'VERIFIED'); assert.equal(r.paymentRecordJson, original.paymentRecordJson);
      assert.equal(verificationCalls, 1); assert.equal(app.snapshot().application.responseWriteMeansDelivery, false);
    });
    await check('NATIVE-EXACT-REPLAY-USES-RECORDED-BOUND-WITHOUT-VERIFIER-OR-WRITE', async () => {
      const before = recoveryView(app).envelope, client = transport(a.verifierContext.resourceUrl);
      bound(await fetchOriginal(client, a.verifierContext.resourceUrl, original.checkpoint.originalBytes.paymentPayload));
      bound(await fetchOriginal(client, a.verifierContext.resourceUrl, original.checkpoint.originalBytes.paymentPayload));
      assert.deepEqual(recoveryView(app).envelope, before); assert.equal(verificationCalls, 1); await closeTransport(client);
    });
    await check('NATIVE-INVALID-ROUTE-METHOD-HOST-AND-BODY-REFUSE-BEFORE-APPLICATION', async () => {
      const before = app.snapshot().application.requests, retained = recoveryView(app).envelope;
      for (const edit of [{ method: 'GET' }, { path: '/service-credit/v1/execute' }, { host: 'foreign.invalid' }, { body: 'x' }]) {
        const r = await rawRequest(a.verifierContext.resourceUrl, original.checkpoint.originalBytes.paymentPayload, edit);
        assert.equal(r.status, 503); assert.equal(r.bodyHandedOff, true);
      }
      assert.equal(app.snapshot().application.requests, before); assert.equal(verificationCalls, 1); assert.deepEqual(recoveryView(app).envelope, retained);
    });
    await check('NATIVE-MISSING-OR-FOREIGN-PAYMENT-GETS-NO-CHALLENGE-OR-BOUND', async () => {
      const client = transport(a.verifierContext.resourceUrl), missing = await fetchOriginal(client, a.verifierContext.resourceUrl, null);
      assert.equal(missing.status, 400); assert.equal(missing.headers.get('payment-required'), null);
      const foreign = await fetchOriginal(client, a.verifierContext.resourceUrl, 'Zm9yZWlnbg=='); assert.equal(foreign.status, 409);
      assert.equal(verificationCalls, 1); await closeTransport(client);
    });
    const aBefore = recoveryView(app); const aClosed = await closeApplication(app, aDB);
    const bDB = open(1, false), pending = create(1, b, bDB, selected(b, 1), () => Promise.reject(Error('synthetic pending funding')), 'RETAINED');
    await check('NATIVE-PERSISTENT-PENDING-KEEPS-ORIGINAL-AND-EXHAUSTS-FIXED-BUDGET', async () => {
      await pending.start(); const before = JSON.parse(recoveryView(pending).envelope.receiptJson).paymentRecordJson;
      const client = transport(b.verifierContext.resourceUrl), originalB = capturePurchasedOrderPayment(...inputs(b));
      for (let i = 0; i < 2; i++) assert.equal((await fetchOriginal(client, b.verifierContext.resourceUrl, originalB.checkpoint.originalBytes.paymentPayload)).status, 503);
      await closeTransport(client); const finalClient = transport(b.verifierContext.resourceUrl, 1);
      assert.equal((await fetchOriginal(finalClient, b.verifierContext.resourceUrl, originalB.checkpoint.originalBytes.paymentPayload)).status, 503); await closeTransport(finalClient);
      const r = JSON.parse(recoveryView(pending).envelope.receiptJson); assert.equal(r.phase, 'REJECTED'); assert.equal(r.attempts, 3); assert.equal(r.paymentRecordJson, before);
      assert.equal(verificationCalls, 4); assert.equal(pending.snapshot().application.boundResponseWrites, 0);
    });
    const bBefore = recoveryView(pending), bClosed = await closeApplication(pending, bDB);
    await check('NATIVE-CLEAN-LOGICAL-CLOSE-AND-INDEPENDENT-RECOVERY-PINS', async () => {
      pins = { version: 1, issuedAtMs: at, a: { fixture: a, recovery: aBefore.record }, b: { fixture: b, recovery: bBefore.record },
        observedReceiptDigests: [sha(aBefore.envelope.receiptJson), sha(bBefore.envelope.receiptJson)], firstProcessFactoryCalls: nativeFactoryCalls,
        closeSnapshots: [aClosed, bClosed], firstReplyAbort: lost };
      const fd = openSync(pinPath, constants.O_RDWR | constants.O_NOFOLLOW);
      try { assert.equal(fstatSync(fd).uid, process.getuid()); writeFileSync(fd, JSON.stringify(pins)); fsyncSync(fd); } finally { closeSync(fd); }
      assert.equal(nativeFactoryCalls, 2); assert.equal(retainedBeforeListen, 2); assert.equal(opens, 2); assert.equal(rawClientStarts + transportStarts, 12);
    });
  } else {
    // The parent independently preserves/selects this file digest after the
    // first command. Never derive the expected pin from this received packet.
    const rawPins = readOwned('order-http-pins.json'), independentlySelectedPin = process.env.X402_ORDER_HTTP_NATIVE_PIN_SHA256;
    assert.match(independentlySelectedPin ?? '', /^[0-9a-f]{64}$/); assert.equal(sha(rawPins), independentlySelectedPin);
    pins = JSON.parse(rawPins.toString('utf8')); assert.equal(pins.version, 1);
    const selectionA = restore(pins.a.recovery.recordJson, pins.a.recovery.recordDigest, 'worker.native.http.reopen.a');
    const beforeA = envelope(JSON.parse(pins.a.recovery.recordJson).expectedEnvelopeJson);
    const aDB = open(0, true), a = create(0, pins.a.fixture, aDB, selectionA, () => assert.fail('fresh verified recovery must not authenticate'), 'VERIFIED');
    await check('FRESH-NATIVE-HTTP-RECOVERS-VERIFIED-ORIGINAL-WITHOUT-AUTHENTICATION', async () => {
      await a.start(); const current = recoveryView(a).envelope; assert.equal(current.epoch, beforeA.epoch + 1); assert.equal(current.receiptJson, beforeA.receiptJson);
      assert.equal(sha(current.receiptJson), pins.observedReceiptDigests[0]); const client = transport(pins.a.fixture.verifierContext.resourceUrl, 1);
      bound(await fetchOriginal(client, pins.a.fixture.verifierContext.resourceUrl, capturePurchasedOrderPayment(...inputs(pins.a.fixture)).checkpoint.originalBytes.paymentPayload));
      await closeTransport(client); assert.equal(verificationCalls, 0);
    });
    await closeApplication(a, aDB);
    const beforeB = envelope(JSON.parse(pins.b.recovery.recordJson).expectedEnvelopeJson), selectionB = restore(pins.b.recovery.recordJson, pins.b.recovery.recordDigest, 'worker.native.http.reopen.b');
    const bDB = open(1, true), b = create(1, pins.b.fixture, bDB, selectionB, () => assert.fail('startup does not reverify pending evidence'), 'REJECTED');
    await check('FRESH-NATIVE-STARTUP-KEEPS-UNVERIFIED-ORIGINAL-AND-ATTEMPT-BUDGET', async () => {
      await b.start(); const current = recoveryView(b).envelope; assert.equal(current.epoch, beforeB.epoch + 1); assert.equal(current.receiptJson, beforeB.receiptJson);
      assert.equal(sha(current.receiptJson), pins.observedReceiptDigests[1]); assert.equal(JSON.parse(current.receiptJson).attempts, 3);
      assert.equal(b.snapshot().application.boundResponseWrites, 0); assert.equal(verificationCalls, 0);
    });
    await closeApplication(b, bDB);
    await check('FRESH-NATIVE-CLOSE-PRESERVES-INDEPENDENT-PINS-AND-FILE-IDENTITIES', async () => {
      assert.equal(nativeFactoryCalls, 2); assert.equal(retainedBeforeListen, 2); assert.equal(rawClientStarts, 0); assert.equal(transportStarts, 1);
      assert.equal(opens, 2); assert.equal(verificationCalls, 0);
    });
  }
  assert.equal(applications.size + transports.size + databases.size, 0); assert.equal(opens, 2);
  assert.ok(rawObservations.every(s => s.done && s.requestClosed && s.socketClosed && s.authenticated && !s.nativeFailure));
  assert.equal(readOwned('order-http-pins.json').toString('utf8'), JSON.stringify(pins)); assert.equal(retainedBeforeListen, 2);
  const actualTransportSocketAssignments = transportObservations.reduce((sum, s) => sum + s.socketAssignmentsObserved, 0);
  assert.equal(actualTransportSocketAssignments, transportStarts); assert.equal(rawSocketAssignments, rawClientStarts);
  process.stdout.write(JSON.stringify({ qualification: 'PURCHASE_ORDER_FUNDING_ORIGINAL_HTTP_NATIVE', mode, passed: cases.length, failed: 0, cases,
    nativeNodeHttpSqliteAndTimers: true, actualDatabaseConnections: opens, sqliteFiles: 2, independentPinFiles: 1, verificationCalls,
    selectedAuthenticator: 'SYNTHETIC', nativeServerFactoryCalls: nativeFactoryCalls, originalRetainedBeforeListen: retainedBeforeListen,
    rawClientStarts, actualNativeTransportRequestStarts: transportStarts, actualSocketAssignments: rawSocketAssignments + actualTransportSocketAssignments,
    rawRequests: rawObservations.map(s => ({ status: s.status, abortedAfterHeaders: s.aborted, bodyHandedOff: s.bodyHandedOff,
      bytesObservedAfterAbort: s.bytesObservedAfterAbort, requestClosed: s.requestClosed, socketClosed: s.socketClosed, authenticated: s.authenticated })),
    actualClientCloseReceipts: transportObservations.map(s => ({ phase: s.phase, requestStarts: s.requestStarts,
      authenticatedTlsHandshakes: s.authenticatedTlsHandshakes, trackedRequests: s.trackedRequests, trackedSockets: s.trackedSockets, ownedTimers: s.ownedTimers })),
    newEpochOnReopen: mode === 'reopen', originalReceiptBytesUnchangedOnReopen: mode === 'reopen', wholeDatabaseBytesUnchangedClaimed: false,
    pinFileSha256: sha(JSON.stringify(pins)), databaseIdentities: names.slice(0, 2).map(name => ({ name, identity: identity(file(name)) })),
    SDK: 0, walletKeys: 0, paymentSignatures: 0, capabilitySignatures: 0, providerSignatures: 0, nonceSearches: 0, nodeChildren: 0,
    grants: 0, serviceExecutions: 0, payouts: 0, realPayment: false, externalNetwork: false, processInterruption: false,
    nativeApplicationScopeOnly: true, responseWriteMeansDelivery: false, fullFundingServiceAcceptance: 'NOT_ESTABLISHED', physicalOsRelease: 'NOT_QUALIFIED' }) + '\n');
} finally {
  for (const client of transports) { try { await client.close(); } catch {} }
  for (const app of applications) { try { await app.close(); } catch {} }
  // Do not force-close a connection if its application still owns its wrapper.
  for (const db of databases) {
    let retained = false;
    for (const app of applications) { try { if (app.snapshot().application.application.logicalBackendRetired !== true) retained = true; } catch { retained = true; } }
    if (!retained) { try { db.close(); } catch {} }
  }
  key.fill(0); cert.fill(0); // Local fixture copies only; no secure-erasure claim.
}
