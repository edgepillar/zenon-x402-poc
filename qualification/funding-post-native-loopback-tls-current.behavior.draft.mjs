// Current one-shot source selection. NOT an actual TLS result or run authority.
// Selected real TLS transport qualification, not x402/payment/DP integration.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:https';
import { constants, openSync, closeSync, readFileSync, lstatSync, fstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { test } from 'node:test';

assert.equal(process.env.X402_FUNDING_TLS_SELECTION, 'four-current-loopback-cases-only');
assert.equal(process.env.X402_FUNDING_TLS_NATIVE_MODE, 'reviewed-current-one-shot-tls');
assert.equal(process.argv[2], process.env.SPV_TASK_SCRATCH);
const scratch = process.argv[2];
assert.equal(realpathSync(scratch), scratch);
const directory = lstatSync(scratch);
assert.ok(directory.isDirectory() && !directory.isSymbolicLink());
assert.equal(directory.uid, process.getuid());
assert.equal(directory.mode & 0o777, 0o700);
function identity(s) {
  return [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeMs, s.ctimeMs];
}
function ownedTls(name) {
  const path = join(scratch, name), before = lstatSync(path);
  assert.ok(before.isFile() && !before.isSymbolicLink());
  assert.equal(before.uid, process.getuid()); assert.equal(before.nlink, 1);
  assert.equal(before.mode & 0o777, 0o600);
  assert.ok(before.size > 0 && before.size <= 16384);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    assert.deepEqual(identity(fstatSync(fd)), identity(before));
    const bytes = readFileSync(fd);
    assert.equal(bytes.length, before.size);
    assert.deepEqual(identity(fstatSync(fd)), identity(before));
    assert.deepEqual(identity(lstatSync(path)), identity(before));
    return bytes;
  } finally { closeSync(fd); }
}
const key = ownedTls('tls-key.pem'), ca = ownedTls('tls-cert.pem');
// No module alias, request factory, copied source or alternate close owner.
const { createFundingPostNativeHttpsTransport } = await import(
  '../src/service-credit-funding-post-native-https-transport.js');

const activeTcp = new Set(), activeTls = new Set(), owners = [], witnesses = new Map();
let connections = 0, secureConnections = 0, requests = 0, casesEntered = 0, casesCompleted = 0;
let fixtureFailure = false, fixtureCleanupDestroyedSockets = 0;
let partialResponse = null, serverClosed = false, serverListening = false;
const paths = new Set(['/funding/bound', '/funding/partial', '/funding/abort']);
const marker = path => Buffer.from('synthetic-unsigned-header-data:' + path).toString('base64');
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
for (const path of paths) witnesses.set(path, deferred());
const server = createServer({ key, cert: ca, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3',
  ALPNProtocols: ['http/1.1'], maxHeaderSize: 16384 }, (req, res) => {
  try {
    requests++;
    assert.ok(paths.has(req.url)); assert.equal(req.method, 'POST');
    assert.equal(req.headers.host, '127.0.0.1:' + server.address().port);
    assert.equal(req.headers.connection, 'close'); assert.equal(req.headers['content-length'], '0');
    assert.equal(req.headers['payment-signature'], marker(req.url));
    assert.equal(req.socket.getProtocol(), 'TLSv1.3'); assert.equal(req.socket.alpnProtocol, 'http/1.1');
    assert.equal(req.socket.remoteAddress, '127.0.0.1');
    let bytes = 0;
    req.on('data', chunk => { bytes += chunk.length; });
    req.on('error', () => { fixtureFailure = true; });
    res.on('error', () => undefined);
    req.on('end', () => {
      try {
        assert.equal(bytes, 0);
        witnesses.get(req.url).resolve(true);
        if (req.url === '/funding/abort') return;
        res.writeHead(202, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': '5',
          'Cache-Control': 'private, no-store, max-age=0', Vary: 'PAYMENT-SIGNATURE',
          'X-Content-Type-Options': 'nosniff', Connection: 'close' });
        if (req.url === '/funding/bound') res.end('BOUND');
        else { partialResponse = res; res.write('BO'); }
      } catch { fixtureFailure = true; res.destroy(); }
    });
    req.resume();
  } catch { fixtureFailure = true; req.destroy(); res.destroy(); }
});
server.on('connection', socket => {
  connections++; activeTcp.add(socket);
  socket.on('error', () => undefined);
  socket.once('close', () => { activeTcp.delete(socket); });
  if (socket.remoteAddress !== '127.0.0.1' || connections > 8) {
    fixtureFailure = true; socket.destroy();
  }
});
server.on('secureConnection', socket => {
  secureConnections++; activeTls.add(socket);
  socket.on('error', () => undefined);
  socket.once('close', () => { activeTls.delete(socket); });
});
server.on('tlsClientError', () => { fixtureFailure = true; });
server.on('error', () => { fixtureFailure = true; });
async function waitFor(predicate) {
  for (let i = 0; i < 100; i++) {
    assert.equal(fixtureFailure, false);
    if (predicate()) return;
    await pause(10);
  }
  assert.fail('BOUNDED_NATIVE_OBSERVATION_NOT_ESTABLISHED');
}
function drained(owner) {
  const s = owner.snapshot();
  return s.trackedRequests === 0 && s.trackedSockets === 0 && s.ownedTimers === 0;
}
function options(path, controller = new AbortController()) {
  return { method: 'POST', redirect: 'manual', cache: 'no-store', credentials: 'omit',
    headers: { 'Content-Length': '0', 'PAYMENT-SIGNATURE': marker(path) }, signal: controller.signal };
}
function create(path) {
  const url = 'https://127.0.0.1:' + server.address().port + path;
  const owner = createFundingPostNativeHttpsTransport({ resourceUrl: url, ca,
    maxRequestStarts: 1, requestDeadlineMs: 3000, handshakeDeadlineMs: 1000, closeGraceMs: 500 });
  owners.push(owner); return { owner, url };
}
async function unknownClose(owner) {
  await waitFor(() => drained(owner));
  const close = owner.close(); assert.equal(owner.close(), close);
  await assert.rejects(close, { code: 'service_credit_native_https_client_close_unknown' });
  const s = owner.snapshot(); assert.equal(s.phase, 'CLOSE_UNKNOWN');
  assert.equal(s.unknown, true); assert.equal(s.close.quiescenceObserved, true);
  assert.equal(s.close.localMaterialRelease.attempts, 1);
  assert.equal(s.close.localMaterialRelease.outcome, 'RETURNED'); assert.ok(drained(owner));
  return s;
}
async function selected(name, body) {
  let completed = false;
  await test(name, { timeout: 5000, concurrency: false }, async () => {
    casesEntered++;
    try { await body(); casesCompleted++; completed = true; }
    catch (cause) {
      // This bounded public-safe frame is emitted before fixture cleanup.
      // It is not a request to repair UNKNOWN or retry the original payment.
      console.log('# funding-post-native-loopback-tls-current-failure ' + JSON.stringify({
        casesEntered, casesCompleted, connections, secureConnections, requests,
        owners: owners.map(owner => owner.snapshot()),
        actualCloseQualification: 'NOT_ESTABLISHED', currentSourceDiagnostics: 'OBSERVED_IN_THIS_RUN_NOT_DRAIN_PROOF' }));
      throw cause;
    }
  });
  // node:test reports failure without necessarily rejecting its returned Promise.
  // A failed case vetoes every subsequent native request in this selection.
  if (!completed) throw new Error('SELECTED_CASE_FAILED_NO_FURTHER_NATIVE_STARTS');
}
let completed = false;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      serverListening = true; server.removeListener('error', reject); resolve();
    });
  });
  await selected('native funding TLS complete BOUND and actual close', async () => {
    const path = '/funding/bound', { owner, url } = create(path);
    const response = await owner.fetchImpl(url, options(path));
    assert.equal(response.status, 202); assert.equal(response.url, url); assert.equal(response.redirected, false);
    assert.equal(response.headers.get('content-length'), '5');
    const reader = response.body.getReader(), chunks = [];
    for (let i = 0; i < 8; i++) {
      const next = await reader.read(); if (next.done) break; chunks.push(Buffer.from(next.value));
      assert.ok(i < 7, 'BODY_READ_BOUND');
    }
    assert.equal(Buffer.concat(chunks).toString('ascii'), 'BOUND');
    const before = owner.snapshot(); assert.ok(drained(owner)); assert.equal(before.unknown, false);
    assert.equal(before.requestStarts, 1); assert.equal(before.authenticatedTlsHandshakes, 1);
    assert.equal(before.responseHeadersAccepted, 1); assert.equal(before.responseBodyBytesObserved, 5);
    assert.equal(before.responseEndsObserved, 1); assert.equal(before.responseFlowsStarted, 1);
    const close = owner.close(); assert.equal(owner.close(), close);
    assert.deepEqual(await close, { phase: 'CLOSED', trackedRequests: 0, trackedSockets: 0,
      ownedTimers: 0, serviceDelivery: 'NOT_ESTABLISHED' });
    assert.ok(drained(owner));
  });
  await selected('native funding TLS partial body remains UNKNOWN', async () => {
    const path = '/funding/partial', { owner, url } = create(path);
    const result = owner.fetchImpl(url, options(path)).then(value => ({ value }), error => ({ error }));
    await waitFor(() => owner.snapshot().responseBodyBytesObserved === 2);
    assert.ok(partialResponse !== null); assert.equal(owner.snapshot().responseEndsObserved, 0);
    partialResponse.destroy(); partialResponse = null;
    assert.equal((await result).error?.code, 'FUNDING_POST_NATIVE_HTTPS_OUTCOME_UNKNOWN');
    const s = await unknownClose(owner); assert.equal(s.requestStarts, 1);
    assert.equal(s.authenticatedTlsHandshakes, 1); assert.equal(s.responseHeadersAccepted, 1);
    assert.equal(s.responseBodyBytesObserved, 2); assert.equal(s.responseEndsObserved, 0); assert.equal(s.responseFlowsStarted, 1);
  });
  await selected('native funding TLS abort remains UNKNOWN without replacement', async () => {
    const path = '/funding/abort', { owner, url } = create(path), controller = new AbortController();
    const result = owner.fetchImpl(url, options(path, controller)).then(value => ({ value }), error => ({ error }));
    const observed = await Promise.race([witnesses.get(path).promise, result.then(() => false)]);
    assert.equal(observed, true); controller.abort();
    assert.equal((await result).error?.code, 'FUNDING_POST_NATIVE_HTTPS_OUTCOME_UNKNOWN');
    const s = await unknownClose(owner);
    await assert.rejects(owner.fetchImpl(url, options(path)), { code: 'FUNDING_POST_NATIVE_HTTPS_INPUT_REJECTED' });
    assert.equal(owner.snapshot().requestStarts, 1); assert.equal(s.authenticatedTlsHandshakes, 1);
    assert.equal(s.responseHeadersAccepted, 0); assert.equal(s.responseBodyBytesObserved, 0);
    assert.equal(s.responseEndsObserved, 0); assert.equal(s.responseFlowsStarted, 0); assert.equal(owner.snapshot().unknown, true);
  });
  await selected('native funding TLS wrong URL and method rejected before request', async () => {
    const path = '/funding/invalid', { owner, url } = create(path), count = connections;
    await assert.rejects(owner.fetchImpl(url + '/other', options(path)),
      { code: 'FUNDING_POST_NATIVE_HTTPS_INPUT_REJECTED' });
    await assert.rejects(owner.fetchImpl(url, { ...options(path), method: 'GET' }),
      { code: 'FUNDING_POST_NATIVE_HTTPS_INPUT_REJECTED' });
    assert.equal(owner.snapshot().requestStarts, 0); assert.equal(owner.snapshot().authenticatedTlsHandshakes, 0);
    assert.ok(drained(owner)); assert.equal(connections, count);
    assert.equal((await owner.close()).phase, 'CLOSED');
  });
  await waitFor(() => activeTcp.size === 0 && activeTls.size === 0);
  assert.equal(connections, 3); assert.equal(secureConnections, 3); assert.equal(requests, 3);
  assert.equal(casesEntered, 4); assert.equal(casesCompleted, 4); assert.equal(fixtureFailure, false);
  completed = true;
} finally {
  for (const owner of owners) await owner.close().catch(() => undefined);
  // These are the exact test-owned server handles. Failure cleanup is not an
  // application clean-close verdict and never promotes UNKNOWN.
  for (const socket of [...activeTcp, ...activeTls]) {
    fixtureCleanupDestroyedSockets++; socket.destroy();
  }
  if (serverListening) await new Promise((resolve, reject) => server.close(error => {
    if (error) reject(new Error('FIXTURE_SERVER_CLOSE_UNKNOWN')); else { serverClosed = true; resolve(); }
  }));
  key.fill(0); ca.fill(0);
}
assert.equal(completed, true); assert.equal(serverClosed, true);
assert.equal(activeTcp.size, 0); assert.equal(activeTls.size, 0);
assert.equal(fixtureCleanupDestroyedSockets, 0);
console.log('# funding-post-native-loopback-tls-current ' + JSON.stringify({ casesEntered, casesCompleted,
  connections, secureConnections, requests, serverClosed, fixtureCleanupDestroyedSockets,
  clientRequests: owners.reduce((n, owner) => n + owner.snapshot().requestStarts, 0),
  clientAuthenticatedTls: owners.reduce((n, owner) => n + owner.snapshot().authenticatedTlsHandshakes, 0),
  responseBytesObserved: owners.reduce((n, owner) => n + owner.snapshot().responseBodyBytesObserved, 0),
  responseFlowsStarted: owners.reduce((n, owner) => n + owner.snapshot().responseFlowsStarted, 0),
  cleanOwners: owners.filter(owner => owner.snapshot().phase === 'CLOSED').length,
  unknownOwners: owners.filter(owner => owner.snapshot().phase === 'CLOSE_UNKNOWN').length,
  allClientHandlesDrained: owners.every(drained), SDK: false, SQLite: false, nonce: false,
  paymentSigning: false, externalNetwork: false, fullDpGraph: false, nativeOsNetworkSandbox: false }));
