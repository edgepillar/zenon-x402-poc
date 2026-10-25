// DRAFT native-only regression body. Importing this function is not run authority.
// No SDK, SQLite, payer/wallet/capability signature, nonce or external endpoint.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createServer as createHttpsServer } from 'node:https';
import { createServer as createTcpServer } from 'node:net';
import { constants, openSync, closeSync, readFileSync, lstatSync, fstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { test } from 'node:test';
import { createFundingPostNativeHttpsTransport }
  from '../src/service-credit-funding-post-native-https-transport.js';

export const CASES = Object.freeze([
  "native stop v2 complete BOUND and actual close",
  "native stop v2 partial body remains UNKNOWN",
  "native stop v2 abort after original request remains UNKNOWN",
  "native stop v2 immediate abort admits no new handshake work",
  "native stop v2 immediate owner close admits no new handshake work",
  "native stop v2 abort while real TLS handshake is stalled",
  "native stop v2 wrong URL method and preaborted signal start no request"
]);

export async function runFundingPostNativeStopTlsV2(scratch) {
  assert.equal(arguments.length, 1);
  assert.equal(process.env.X402_FUNDING_STOP_TLS_V2_SELECTION, 'seven-real-loopback-stop-cases-only');
  assert.equal(process.env.X402_FUNDING_STOP_TLS_V2_NATIVE_MODE, 'one-fresh-reviewed-native-run-v2');
  assert.equal(scratch, process.env.SPV_TASK_SCRATCH);
  assert.equal(realpathSync(scratch), scratch);
  const directory = lstatSync(scratch);
  assert.ok(directory.isDirectory() && !directory.isSymbolicLink());
  assert.equal(directory.uid, process.getuid()); assert.equal(directory.mode & 0o777, 0o700);
  const identity = s => [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeMs, s.ctimeMs];
  function ownedTls(name) {
    const file = join(scratch, name), before = lstatSync(file);
    assert.ok(before.isFile() && !before.isSymbolicLink());
    assert.equal(before.uid, process.getuid()); assert.equal(before.nlink, 1);
    assert.equal(before.mode & 0o777, 0o600); assert.ok(before.size > 0 && before.size <= 16384);
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      assert.deepEqual(identity(fstatSync(fd)), identity(before));
      const raw = readFileSync(fd); assert.equal(raw.length, before.size);
      assert.deepEqual(identity(fstatSync(fd)), identity(before));
      assert.deepEqual(identity(lstatSync(file)), identity(before)); return raw;
    } finally { closeSync(fd); }
  }
  const key = ownedTls('tls-key.pem'), ca = ownedTls('tls-cert.pem');
  const activeTcp = new Set(), activeTls = new Set(), silentTcp = new Set(), owners = [], observations = [];
  let connections = 0, tlsConnections = 0, silentConnections = 0, secureConnections = 0, requests = 0;
  let casesEntered = 0, casesCompleted = 0, tlsClientErrors = 0, silentBytesObserved = 0;
  let fixtureFailure = false, stopped = false, cleanupDestroyedSockets = 0, partialResponse = null;
  let httpsListening = false, tcpListening = false, httpsClosed = false, tcpClosed = false;
  const paths = new Set(['/funding/bound', '/funding/partial', '/funding/abort',
    '/funding/early-abort', '/funding/early-close']);
  const marker = path => Buffer.from('synthetic-unsigned-header-data:' + path).toString('base64');
  function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
  const witnesses = new Map([...paths].map(path => [path, deferred()]));
  const hello = deferred();
  function track(socket, set) {
    connections++; set.add(socket);
    socket.on('error', () => undefined); socket.once('close', () => set.delete(socket));
    if (socket.remoteAddress !== '127.0.0.1' || connections > 8) { fixtureFailure = true; socket.destroy(); }
  }
  const https = createHttpsServer({ key, cert: ca, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3',
    ALPNProtocols: ['http/1.1'], maxHeaderSize: 16384 }, (req, res) => {
    try {
      requests++; assert.ok(paths.has(req.url)); assert.equal(req.method, 'POST');
      assert.equal(req.headers.host, '127.0.0.1:' + https.address().port);
      assert.equal(req.headers.connection, 'close'); assert.equal(req.headers['content-length'], '0');
      assert.equal(req.headers['payment-signature'], marker(req.url));
      assert.equal(req.socket.getProtocol(), 'TLSv1.3'); assert.equal(req.socket.alpnProtocol, 'http/1.1');
      assert.equal(req.socket.remoteAddress, '127.0.0.1');
      let bytes = 0;
      req.on('data', chunk => { bytes += chunk.length; });
      req.on('error', () => { fixtureFailure = true; }); res.on('error', () => undefined);
      req.on('end', () => {
        try {
          assert.equal(bytes, 0); witnesses.get(req.url).resolve(true);
          if (req.url !== '/funding/bound' && req.url !== '/funding/partial') return;
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
  https.on('connection', socket => { tlsConnections++; track(socket, activeTcp); });
  https.on('secureConnection', socket => {
    secureConnections++; activeTls.add(socket);
    socket.on('error', () => undefined); socket.once('close', () => activeTls.delete(socket));
  });
  // Early stop can abort a genuine TLS handshake. These bounded fixture errors
  // are counted, not misreported as authenticated handshakes or clean delivery.
  https.on('tlsClientError', () => { if (++tlsClientErrors > 8) fixtureFailure = true; });
  https.on('error', () => { fixtureFailure = true; });
  const silent = createTcpServer(socket => {
    silentConnections++; track(socket, silentTcp);
    socket.on('data', chunk => {
      silentBytesObserved += chunk.length;
      if (silentBytesObserved > 65536) { fixtureFailure = true; socket.destroy(); }
      else if (chunk.length > 0) hello.resolve(true);
    });
    // Intentionally no TLS/server response: observe a real pending handshake.
  });
  silent.on('error', () => { fixtureFailure = true; });
  const drained = owner => {
    const s = owner.snapshot();
    return s.trackedRequests === 0 && s.trackedSockets === 0 && s.ownedTimers === 0;
  };
  async function waitFor(predicate) {
    for (let i = 0; i < 150; i++) {
      assert.equal(fixtureFailure, false); if (predicate()) return; await pause(10);
    }
    assert.fail('NATIVE_STOP_V2_BOUNDED_OBSERVATION_UNKNOWN');
  }
  function options(path, controller = new AbortController()) {
    return { method: 'POST', redirect: 'manual', cache: 'no-store', credentials: 'omit',
      headers: { 'Content-Length': '0', 'PAYMENT-SIGNATURE': marker(path) }, signal: controller.signal };
  }
  function create(path, port = https.address().port) {
    assert.equal(stopped || fixtureFailure, false);
    const url = 'https://127.0.0.1:' + port + path;
    const owner = createFundingPostNativeHttpsTransport({ resourceUrl: url, ca, maxRequestStarts: 1,
      requestDeadlineMs: 3000, handshakeDeadlineMs: 1000, closeGraceMs: 500 });
    owners.push(owner); return { owner, url };
  }
  function start(owner, url, input) {
    assert.equal(stopped || fixtureFailure, false); return owner.fetchImpl(url, input);
  }
  function settled(promise) { return promise.then(value => ({ value }), error => ({ error })); }
  function observe(index, owner, beforeStop = null) {
    const s = owner.snapshot();
    assert(Number.isSafeInteger(s.socketAssignmentsObserved));
    assert(Number.isSafeInteger(s.stoppedSocketAssignmentsObserved));
    assert(Number.isSafeInteger(s.handshakeTimerStartAttempts));
    assert(Number.isSafeInteger(s.requestClosesWithoutSocketObserved));
    assert.ok(s.stoppedSocketAssignmentsObserved <= s.socketAssignmentsObserved);
    assert.ok(s.handshakeTimerStartAttempts <= s.socketAssignmentsObserved - s.stoppedSocketAssignmentsObserved);
    if (beforeStop !== null) {
      assert.equal(s.handshakeTimerStartAttempts, beforeStop.handshakeTimerStartAttempts);
      assert.equal(s.authenticatedTlsHandshakes, beforeStop.authenticatedTlsHandshakes);
    }
    observations.push({ index, requestStarts: s.requestStarts, phase: s.phase, unknown: s.unknown,
      socketAssignmentsObserved: s.socketAssignmentsObserved,
      stoppedSocketAssignmentsObserved: s.stoppedSocketAssignmentsObserved,
      handshakeTimerStartAttempts: s.handshakeTimerStartAttempts,
      requestClosesWithoutSocketObserved: s.requestClosesWithoutSocketObserved,
      beforeStopHandshakeTimerStartAttempts: beforeStop === null ? null : beforeStop.handshakeTimerStartAttempts,
      beforeStopAuthenticatedTls: beforeStop === null ? null : beforeStop.authenticatedTlsHandshakes,
      authenticatedTlsHandshakes: s.authenticatedTlsHandshakes, handlesDrained: drained(owner) });
    return s;
  }
  async function unknownClose(owner) {
    await waitFor(() => drained(owner));
    const p = owner.close(); assert.equal(owner.close(), p);
    await assert.rejects(p, { code: 'service_credit_native_https_client_close_unknown' });
    const s = owner.snapshot();
    assert.equal(s.phase, 'CLOSE_UNKNOWN'); assert.equal(s.unknown, true);
    assert.equal(s.close.localMaterialRelease.attempts, 1);
    assert.equal(s.close.localMaterialRelease.outcome, 'RETURNED'); assert.ok(drained(owner));
  }
  async function selected(index, run) {
    let completed = false;
    await test(CASES[index], { timeout: 5000, concurrency: false }, async () => {
      casesEntered++;
      try { await run(); casesCompleted++; completed = true; }
      catch (error) {
        console.log('# funding-stop-tls-v2-failure ' + JSON.stringify({ casesEntered, casesCompleted,
          connections, secureConnections, requests, observations, nativeCloseQualified: false }));
        throw error;
      }
    });
    if (!completed) { stopped = true; throw new Error('NATIVE_STOP_V2_CASE_FAILED_NO_MORE_STARTS'); }
  }
  async function listen(server) {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
        server.removeListener('error', reject); resolve();
      });
    });
  }
  let completed = false;
  try {
    await listen(https); httpsListening = true; await listen(silent); tcpListening = true;
    await selected(0, async () => {
      const path = '/funding/bound', { owner, url } = create(path);
      const response = await start(owner, url, options(path));
      assert.equal(response.status, 202); assert.equal(response.url, url); assert.equal(response.redirected, false);
      const reader = response.body.getReader(), chunks = [];
      for (let i = 0; i < 8; i++) {
        const next = await reader.read(); if (next.done) break;
        chunks.push(Buffer.from(next.value)); assert.ok(i < 7, 'BODY_READ_BOUND');
      }
      assert.equal(Buffer.concat(chunks).toString('ascii'), 'BOUND');
      assert.ok(drained(owner));
      const p = owner.close(); assert.equal(owner.close(), p);
      assert.deepEqual(await p, { phase: 'CLOSED', trackedRequests: 0, trackedSockets: 0,
        ownedTimers: 0, serviceDelivery: 'NOT_ESTABLISHED' });
      const s = observe(0, owner); assert.equal(s.unknown, false); assert.equal(s.requestStarts, 1);
      assert.equal(s.authenticatedTlsHandshakes, 1); assert.equal(s.socketAssignmentsObserved, 1);
      assert.equal(s.stoppedSocketAssignmentsObserved, 0); assert.equal(s.handshakeTimerStartAttempts, 1);
      assert.equal(s.responseHeadersAccepted, 1); assert.equal(s.responseBodyBytesObserved, 5);
      assert.equal(s.responseEndsObserved, 1); assert.equal(s.responseFlowsStarted, 1);
    });
    await selected(1, async () => {
      const path = '/funding/partial', { owner, url } = create(path);
      const result = settled(start(owner, url, options(path)));
      await waitFor(() => owner.snapshot().responseBodyBytesObserved === 2);
      assert.ok(partialResponse !== null); partialResponse.destroy(); partialResponse = null;
      assert.equal((await result).error?.code, 'FUNDING_POST_NATIVE_HTTPS_OUTCOME_UNKNOWN');
      await unknownClose(owner);
      const s = observe(1, owner); assert.equal(s.responseBodyBytesObserved, 2);
      assert.equal(s.responseEndsObserved, 0); assert.equal(s.responseFlowsStarted, 1);
    });
    await selected(2, async () => {
      const path = '/funding/abort', { owner, url } = create(path), controller = new AbortController();
      const result = settled(start(owner, url, options(path, controller)));
      assert.equal(await Promise.race([witnesses.get(path).promise, result.then(() => false)]), true);
      const before = owner.snapshot(); controller.abort();
      assert.equal((await result).error?.code, 'FUNDING_POST_NATIVE_HTTPS_OUTCOME_UNKNOWN');
      await unknownClose(owner); observe(2, owner, before);
      await assert.rejects(start(owner, url, options(path)), { code: 'FUNDING_POST_NATIVE_HTTPS_INPUT_REJECTED' });
      assert.equal(owner.snapshot().requestStarts, 1);
    });
    await selected(3, async () => {
      const path = '/funding/early-abort', { owner, url } = create(path), controller = new AbortController();
      const result = settled(start(owner, url, options(path, controller)));
      const before = owner.snapshot(); controller.abort(); // No await before stop.
      assert.equal((await result).error?.code, 'FUNDING_POST_NATIVE_HTTPS_OUTCOME_UNKNOWN');
      await unknownClose(owner); observe(3, owner, before);
      await assert.rejects(start(owner, url, options(path)), { code: 'FUNDING_POST_NATIVE_HTTPS_INPUT_REJECTED' });
      assert.equal(owner.snapshot().requestStarts, 1);
    });
    await selected(4, async () => {
      const path = '/funding/early-close', { owner, url } = create(path);
      const result = settled(start(owner, url, options(path)));
      const before = owner.snapshot(), close = owner.close(); // No await before stop.
      const rejected = assert.rejects(close, { code: 'service_credit_native_https_client_close_unknown' });
      assert.equal(owner.close(), close);
      assert.equal((await result).error?.code, 'FUNDING_POST_NATIVE_HTTPS_OUTCOME_UNKNOWN');
      await rejected; await unknownClose(owner); observe(4, owner, before);
    });
    await selected(5, async () => {
      const path = '/funding/stalled-handshake', { owner, url } = create(path, silent.address().port);
      const controller = new AbortController(), result = settled(start(owner, url, options(path, controller)));
      assert.equal(await Promise.race([hello.promise, result.then(() => false)]), true);
      const before = owner.snapshot();
      assert.equal(before.trackedRequests, 1); assert.equal(before.trackedSockets, 1);
      assert.equal(before.authenticatedTlsHandshakes, 0);
      assert.equal(before.socketAssignmentsObserved, 1); assert.equal(before.handshakeTimerStartAttempts, 1);
      controller.abort();
      assert.equal((await result).error?.code, 'FUNDING_POST_NATIVE_HTTPS_OUTCOME_UNKNOWN');
      await unknownClose(owner); observe(5, owner, before);
      await waitFor(() => silentTcp.size === 0);
    });
    await selected(6, async () => {
      const path = '/funding/invalid', { owner, url } = create(path), count = connections;
      await assert.rejects(start(owner, url + '/other', options(path)), { code: 'FUNDING_POST_NATIVE_HTTPS_INPUT_REJECTED' });
      await assert.rejects(start(owner, url, { ...options(path), method: 'GET' }), { code: 'FUNDING_POST_NATIVE_HTTPS_INPUT_REJECTED' });
      const controller = new AbortController(); controller.abort();
      await assert.rejects(start(owner, url, options(path, controller)), { code: 'FUNDING_POST_NATIVE_HTTPS_INPUT_REJECTED' });
      assert.equal(owner.snapshot().requestStarts, 0); assert.equal(connections, count);
      assert.equal((await owner.close()).phase, 'CLOSED'); observe(6, owner);
    });
    await waitFor(() => activeTcp.size === 0 && activeTls.size === 0 && silentTcp.size === 0);
    assert.equal(casesEntered, 7); assert.equal(casesCompleted, 7); assert.equal(observations.length, 7);
    assert.ok(connections >= 4 && connections <= 8); assert.equal(silentConnections, 1);
    assert.ok(tlsConnections >= 3 && tlsConnections <= 5);
    assert.ok(secureConnections >= 3 && secureConnections <= 5);
    assert.ok(requests >= 3 && requests <= 5);
    assert.equal(owners.reduce((n, owner) => n + owner.snapshot().requestStarts, 0), 6);
    assert.equal(owners.filter(owner => owner.snapshot().phase === 'CLOSED').length, 2);
    assert.equal(owners.filter(owner => owner.snapshot().phase === 'CLOSE_UNKNOWN').length, 5);
    assert.equal(fixtureFailure, false); completed = true;
  } finally {
    stopped = true;
    for (const owner of owners) { try { await owner.close(); } catch {} }
    for (const socket of [...activeTcp, ...activeTls, ...silentTcp]) { cleanupDestroyedSockets++; socket.destroy(); }
    if (httpsListening) await new Promise((resolve, reject) => https.close(error => {
      if (error) reject(new Error('HTTPS_FIXTURE_CLOSE_UNKNOWN')); else { httpsClosed = true; resolve(); }
    }));
    if (tcpListening) await new Promise((resolve, reject) => silent.close(error => {
      if (error) reject(new Error('TCP_FIXTURE_CLOSE_UNKNOWN')); else { tcpClosed = true; resolve(); }
    }));
    key.fill(0); ca.fill(0);
  }
  assert.equal(completed, true); assert.equal(httpsClosed && tcpClosed, true);
  assert.equal(activeTcp.size + activeTls.size + silentTcp.size, 0); assert.equal(cleanupDestroyedSockets, 0);
  console.log('# funding-stop-tls-v2 ' + JSON.stringify({ casesEntered, casesCompleted, observations,
    connections, tlsConnections, silentConnections, secureConnections, requests, tlsClientErrors,
    httpsClosed, tcpClosed, cleanupDestroyedSockets, allClientHandlesDrained: owners.every(drained),
    actualLateSocketAssignmentsObserved: observations.reduce((n, row) => n + row.stoppedSocketAssignmentsObserved, 0),
    unobservedLateSocketPathQualified: false, nonclosingSocketQualified: false,
    SDK: false, SQLite: false, nonce: false, paymentSigning: false,
    externalNetwork: false, fullDpGraph: false, nativeOsNetworkSandbox: false }));
}
