// SOURCE V2 ONLY. Requires fresh direct loopback-HTTPS/TLS test authority.
// Prior failed native results and all old entry bytes remain historical.
// Three actual core 2.23.0/native ingress compositions; service session is
// declared callable DATA, NOT SQLite, V6 custody, grant activation or delivery.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, createPrivateKey, X509Certificate } from 'node:crypto';
import { request as nativeRequest } from 'node:https';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENTRY = 'qualification/official-x402-native-https-pending-v2.behavior.draft.mjs';
const SPECS = [
  {
    "path": "src/x402-official-selected-settlement-server.js",
    "bytes": 15704,
    "LF": 284,
    "sha256": "7e226d378b909bbe30a536b4829313f7cc25d772ac2c0dbfba741c64fc2515b5"
  },
  {
    "path": "src/x402-official-https-request-binding.js",
    "bytes": 5085,
    "LF": 99,
    "sha256": "dabf215408887bd0d2ba346085c5ab2df13f724e8759b7a98b71b09c8dc8d692"
  },
  {
    "path": "src/x402-official-selected-payment-client.js",
    "bytes": 9226,
    "LF": 177,
    "sha256": "6103703a48ab93b33e1d322d01da367d9552d1e37c9d983326f6e58d1e77693c"
  },
  {
    "path": "src/x402-selected-payment-client-bridge.js",
    "bytes": 19446,
    "LF": 370,
    "sha256": "d8252e421240005f51b1627ab97b624496325403508d57b030be423e871a5083"
  },
  {
    "path": "src/x402-selected-settlement-server-bridge.js",
    "bytes": 39943,
    "LF": 749,
    "sha256": "38f47d24e1dcdd0f632e786054dc2e9544de2f261f74e949e28fee43ed56f40b"
  },
  {
    "path": "src/x402-verification-bound-settlement-context.js",
    "bytes": 11311,
    "LF": 221,
    "sha256": "b3ad2fd33dae7e77a77f069cbc1259bf77e18a2bf383aa30f41bcc19221656f5"
  },
  {
    "path": "src/x402-selected-settlement-context.js",
    "bytes": 16818,
    "LF": 456,
    "sha256": "afb6e16603023dd58d6a71cff5790a802dcfa4b98bc9d380b51ccc3d58e10991"
  },
  {
    "path": "src/x402-wire.js",
    "bytes": 39886,
    "LF": 934,
    "sha256": "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"
  },
  {
    "path": "package.json",
    "bytes": 2677,
    "LF": 40,
    "sha256": "cb4364b57d7918682d68dd00b10a5c35c26ec6af2118a0d70353df2f3324c65f"
  },
  {
    "path": "@x402/core/package.json",
    "bytes": 3853,
    "LF": 138,
    "sha256": "4130a95721f50c0997dcba3728d14d5584c4f99c12c8c3f9870b21f31da212fd"
  },
  {
    "path": "zod/package.json",
    "bytes": 3284,
    "LF": 118,
    "sha256": "70eedbe34fd52385a4ae2f3e5759b19682189f0118ea73a6e7c32c677f61668e"
  },
  {
    "path": "@x402/core/dist/esm/client/index.mjs",
    "bytes": 26707,
    "LF": 676,
    "sha256": "653613f25e2fa24615af7d1fe943679177774215a16600289175f61c4df5dda9"
  },
  {
    "path": "@x402/core/dist/esm/server/index.mjs",
    "bytes": 1761,
    "LF": 60,
    "sha256": "fa62aa75d072a9a1e2bb00be93ef4980e15507e3617942f1d7ab05c69954a19e"
  },
  {
    "path": "@x402/core/dist/esm/http/index.mjs",
    "bytes": 1177,
    "LF": 42,
    "sha256": "f87cf0256b51820628469681ba1421de97f17d55c2eff64bbe9040ef4f5ea084"
  },
  {
    "path": "@x402/core/dist/esm/schemas/index.mjs",
    "bytes": 1591,
    "LF": 69,
    "sha256": "b4c12db796c6654de17d8542d65cd78bbbe8cf4bbcc71d05912450d8adfcf0c9"
  },
  {
    "path": "@x402/core/dist/esm/chunk-BA2VL4DT.mjs",
    "bytes": 116817,
    "LF": 3151,
    "sha256": "f2ad975e24db34808470b081c9deedaf6aafa53ab95121d29661a1a8b1507f84"
  },
  {
    "path": "@x402/core/dist/esm/chunk-N4QXZG2Z.mjs",
    "bytes": 5040,
    "LF": 160,
    "sha256": "19c189f7417214b211ee4abdaada531a80e5adc8504d593c172fe1e2ce61c03e"
  },
  {
    "path": "@x402/core/dist/esm/chunk-VE37GDG2.mjs",
    "bytes": 107,
    "LF": 6,
    "sha256": "56fb4db85f03d88dfa5d42c81be8527f72deae2bca4004dfaea6415f186dc086"
  },
  {
    "path": "@x402/core/dist/esm/chunk-P3DFEIO7.mjs",
    "bytes": 2602,
    "LF": 82,
    "sha256": "9c124f03f792fcef472452fcaf30d03bd7d6ea44170675d60ccc473d3b02f983"
  },
  {
    "path": "@x402/core/dist/esm/chunk-UQQR4X3S.mjs",
    "bytes": 5837,
    "LF": 172,
    "sha256": "a7756bf22635f58e52dce87753863e51f407a38f5c32382a1076c39bd6cb9a62"
  },
  {
    "path": "@x402/core/dist/esm/chunk-BJTO5JO5.mjs",
    "bytes": 433,
    "LF": 10,
    "sha256": "1c521b4fbee4089393c982b94b5f8a4f81b1043c2f8cd1848d0d6056430e761f"
  },
  {
    "path": "zod/index.js",
    "bytes": 105,
    "LF": 4,
    "sha256": "6419c4ac0e637ff08463083e31886d10354f74cbcc4e584400b2b837e39ac881"
  },
  {
    "path": "zod/v3/external.js",
    "bytes": 205,
    "LF": 6,
    "sha256": "5d26d2e47e2352def36f89a3e8bf8581da22b7f857e07ef3114cd52cf4813445"
  },
  {
    "path": "zod/v3/errors.js",
    "bytes": 243,
    "LF": 9,
    "sha256": "d40831f478288d76e82bbbcc3b7e95c8513b6e76471f2d49a37c979bc57d492d"
  },
  {
    "path": "zod/v3/helpers/parseUtil.js",
    "bytes": 3601,
    "LF": 109,
    "sha256": "b57484013bb360bac2e334d58fcd5f6cbfa63ffcc7d8ff3dbbb3380ca659b956"
  },
  {
    "path": "zod/v3/helpers/typeAliases.js",
    "bytes": 11,
    "LF": 1,
    "sha256": "8e609bb71c20b858c77f0e9f90bb1319db8477b13f9f965f1a1e18524bf50881"
  },
  {
    "path": "zod/v3/helpers/util.js",
    "bytes": 4055,
    "LF": 133,
    "sha256": "906ef685e5853d496e293ee8f8a2bb8b1ed2d078a1bcdfedb2dfd61d75b6330c"
  },
  {
    "path": "zod/v3/types.js",
    "bytes": 131212,
    "LF": 3693,
    "sha256": "9763a2938f0e7f983363ef4bf6530e7583e3f2d54f8a4a6684efad58febc6e8e"
  },
  {
    "path": "zod/v3/ZodError.js",
    "bytes": 4349,
    "LF": 133,
    "sha256": "f5ac9e86b92e201d41e294d7aa35986a2aa28829e1bcc8ac25f7c8dce0674b99"
  },
  {
    "path": "zod/v3/locales/en.js",
    "bytes": 5602,
    "LF": 109,
    "sha256": "51a6dcc5d4bd52a64da127c012c6c963395c1d9a343ad75d4a8eca662fc8b205"
  },
  {
    "path": "zod/v3/helpers/errorUtil.js",
    "bytes": 300,
    "LF": 6,
    "sha256": "68589c0cf44c8b4ad19b77418f53caad2cd1dbc8d714f526e1876ebdee4828c5"
  },
  {
    "path": "src/x402-official-upfront-https-router.js",
    "bytes": 18721,
    "LF": 360,
    "sha256": "0980e8a648eda8f0ee57353010f5ffda50bdd38ac95ee49e129201de136b9921"
  },
  {
    "path": "src/service-credit-bounded-https-ingress-owner.js",
    "bytes": 143191,
    "LF": 4092,
    "sha256": "3ba52fb8f33e332a30297dc93e9e6162e4c1d957b3fda1bdf61090ac57d0971a"
  },
  {
    "path": "src/service-credit-bounded-node-https-server-factory.js",
    "bytes": 26968,
    "LF": 778,
    "sha256": "aead901ba154c39ea25e5cdcc363ea91ed6749841f6e8945cd01debc52cae387"
  }
];
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
assert.equal(process.versions.node, '24.19.0'); assert.equal(process.platform, 'darwin');
assert.equal(process.arch, 'arm64'); assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.env.X402_NATIVE_HTTPS_V2_OPT_IN, 'reviewed-current-loopback-native-https-three-only');
const ROOTS = JSON.parse(process.env.X402_OFFICIAL_PACKAGE_ROOTS);
assert.deepEqual(Object.keys(ROOTS), ['core', 'zod']);
for (const p of Object.values(ROOTS)) assert.ok(isAbsolute(p) && resolve(p) === p);
const PINS = JSON.parse(process.env.X402_OFFICIAL_SOURCE_PINS);
const TLS_PINS = JSON.parse(process.env.X402_NATIVE_TLS_PINS);
assert.deepEqual(TLS_PINS.map(p => p.role), ['key', 'cert']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
function checked(filename, p, cap) {
  const s = lstatSync(filename, { bigint: true });
  assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.uid, BigInt(process.getuid()));
  assert.equal(s.nlink, 1n); assert.deepEqual(ids(s), p.identity); assert.ok(s.size > 0n && s.size <= BigInt(cap));
  const fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW), raw = Buffer.alloc(Number(s.size) + 1);
  let used = 0;
  try {
    assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
    while (used < raw.length) { const n = readSync(fd, raw, used, raw.length - used, null); if (!n) break; used += n; }
    assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
  } finally { closeSync(fd); }
  assert.deepEqual(ids(lstatSync(filename, { bigint: true })), p.identity);
  assert.equal(used, Number(s.size)); const bytes = raw.subarray(0, used);
  assert.equal(bytes.length, p.bytes); assert.equal(sha(bytes), p.sha256);
  return bytes;
}
function physical(label) {
  if (label.startsWith('@x402/core/')) return join(ROOTS.core, label.slice(11));
  if (label.startsWith('zod/')) return join(ROOTS.zod, label.slice(4));
  return join(REPO, label);
}
function sources() {
  assert.equal(PINS.length, 35); assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p.path), ENTRY]);
  let total = 0;
  return PINS.map((p, i) => {
    const raw = checked(physical(p.path), p, 262144); total += raw.length; assert.ok(total <= 1048576);
    assert.equal(raw.filter(c => c === 10).length, p.LF);
    if (i < SPECS.length) for (const k of ['path','bytes','LF','sha256']) assert.equal(p[k], SPECS[i][k]);
    return { path: p.path, bytes: p.bytes, sha256: p.sha256, identity: p.identity };
  });
}
const sourceBefore = sources();
for (const p of TLS_PINS) assert.ok(isAbsolute(p.path) && resolve(p.path) === p.path);
const key = checked(TLS_PINS[0].path, TLS_PINS[0], 16384), cert = checked(TLS_PINS[1].path, TLS_PINS[1], 16384);
const x509 = new X509Certificate(cert);
assert.equal(x509.checkIP('127.0.0.1'), '127.0.0.1');
assert.equal(x509.checkPrivateKey(createPrivateKey(key)), true);
const peerDigest = sha(x509.raw);
const PORT = 44447, ORIGIN = 'https://127.0.0.1:' + PORT, RESOURCE = ORIGIN + '/paid';
const OPTIONS = { timeout: 10000, concurrency: false }, freeze = Object.freeze;
const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
let externalFetches = 0, connectionAttempts = 0, tlsHandshakes = 0;
Object.defineProperty(globalThis, 'fetch', { ...originalFetch, value: () => {
  externalFetches++; throw Error('EXTERNAL_FETCH_FORBIDDEN');
} });
const { createOfficialSelectedPaymentClient: CLIENT } = await import('../src/x402-official-selected-payment-client.js');
const { createOfficialSelectedSettlementServer: SERVER } = await import('../src/x402-official-selected-settlement-server.js');
const { createOfficialUpfrontServiceCreditHttpsRouter: ROUTER } = await import('../src/x402-official-upfront-https-router.js');
const { createServiceCreditBoundedHttpsIngressOwnerForOfficialX402: INGRESS }
  = await import('../src/service-credit-bounded-https-ingress-owner.js');
const { createServiceCreditBoundedNodeHttpsServerFactory: NATIVE_FACTORY }
  = await import('../src/service-credit-bounded-node-https-server-factory.js');
const { decodePaymentSignatureHeader, decodePaymentResponseHeader }
  = await import(pathToFileURL(join(ROOTS.core, 'dist/esm/http/index.mjs')).href);
const { PaymentRequiredV2Schema }
  = await import(pathToFileURL(join(ROOTS.core, 'dist/esm/schemas/index.mjs')).href);
const fixtures = [];
function transport(header = null, method = 'GET', target = '/paid', host = '127.0.0.1:' + PORT) {
  assert.ok(connectionAttempts < 16); connectionAttempts++;
  return new Promise((resolvePromise, rejectPromise) => {
    let complete = false, socketClosed = false, settled = false, result = null;
    const done = () => {
      if (!settled && complete && socketClosed) { settled = true; resolvePromise(result); }
    };
    const fail = error => { if (!settled) { settled = true; rejectPromise(error); } };
    const req = nativeRequest(new URL(target, ORIGIN), { method, hostname: '127.0.0.1', port: PORT,
      servername: '', agent: false, ca: cert, rejectUnauthorized: true,
      minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', ALPNProtocols: ['http/1.1'],
      headers: { Host: host, Connection: 'close', ...(header === null ? {} : { 'Payment-Signature': header }) } },
    res => {
      const chunks = []; let bytes = 0;
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 16384) { req.destroy(); fail(Error('BOUNDED_REPLY_EXCEEDED')); return; }
        chunks.push(chunk);
      });
      res.once('error', fail);
      res.once('end', () => {
        result = { status: res.statusCode, headers: { ...res.headers },
          body: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)) };
        complete = true; done();
      });
    });
    req.once('socket', socket => {
      socket.once('secureConnect', () => {
        try {
          assert.equal(socket.authorized, true); assert.equal(socket.getProtocol(), 'TLSv1.3');
          assert.equal(socket.alpnProtocol, 'http/1.1');
          assert.equal(sha(socket.getPeerCertificate().raw), peerDigest); tlsHandshakes++;
        } catch (error) { req.destroy(); fail(error); }
      });
      socket.once('close', () => { socketClosed = true; done(); });
    });
    req.once('error', fail);
    req.setTimeout(2000, () => { req.destroy(); fail(Error('BOUNDED_REQUEST_TIMEOUT')); });
    req.end();
  });
}
function runtime() {
  const timers = new Set();
  return { timers, value: freeze({
    schedule: freeze((callback, milliseconds) => {
      const token = setTimeout(() => { timers.delete(token); callback(); }, milliseconds);
      timers.add(token); return token;
    }),
    cancel: freeze(token => {
      if (!timers.has(token)) return false;
      clearTimeout(token); timers.delete(token); return true;
    }),
  }) };
}
const requirement = () => ({ scheme: 'exact', network: 'zenon:mock', asset: 'zts1declaredasset', amount: '1',
  payTo: 'z1declaredrecipient', maxTimeoutSeconds: 60, extra: { paymentFlow: 'upfront', poc: true,
    settlement: 'account-block', zenonChain: { version: 1, chainIdentifier: String(Number.MAX_SAFE_INTEGER),
      genesisMomentumHash: '0'.repeat(64) } } });
async function fixture(success) {
  const f = { calls: { schema: 0, clientSchema: 0, creator: 0, verify: 0, first: 0, observer: 0, service: 0, close: 0 },
    tuples: [], owner: null, router: null, server: null, closed: false, runtime: runtime() };
  fixtures.push(f); const selected = requirement();
  function settlement(payload, requirements, ok) {
    return { success: ok, ...(ok ? { payer: 'declared-payer' } : { errorReason: 'settlement_pending' }),
      transaction: payload.payload.transaction.hash, network: requirements.network,
      publicationStatus: ok ? 'ACKNOWLEDGED' : 'UNKNOWN' };
  }
  function enter(role, args) {
    assert.equal(args.length, 3); f.calls[role]++;
    f.tuples.push({ role, values: args.map(v => JSON.stringify(v)) });
    assert.equal(args[0].payload.transaction.hash, 'a'.repeat(64)); assert.deepEqual(args[1], selected);
  }
  f.server = await SERVER({ requirement: selected, resource: { url: RESOURCE,
    description: 'Native loopback selected upfront application', mimeType: 'application/json' },
    localFacilitator: {
      verify(...args) { enter('verify', args); return { isValid: true, payer: 'declared-payer' }; },
      settle(...args) { enter('first', args); return settlement(args[0], args[1], false); },
    },
    validateChallenge(data) { f.calls.schema++; PaymentRequiredV2Schema.parse(data); },
    reconcilePendingSettlement(...args) { enter('observer', args); return settlement(args[0], args[1], success); },
    maxPendingReconciliations: 1, contextLimit: 8 });
  const service = freeze({
    handle: freeze(async () => { f.calls.service++; throw Error('SERVICE_NOT_SELECTED'); }),
    close: freeze(async () => { f.calls.close++; }),
  });
  f.router = ROUTER({ resourceUrl: RESOURCE, officialServer: f.server, serviceSession: service, maxFundingPayments: 8 });
  const factory = NATIVE_FACTORY(freeze({ bind: freeze({ host: '127.0.0.1', port: PORT, exclusive: true }),
    tlsMaterial: freeze({ key, cert }) }));
  f.owner = INGRESS({ origin: ORIGIN, requestTargets: freeze(['/paid', '/service-credit/v1/execute']),
    generation: freeze({ generationId: 'native.official.' + fixtures.length, generationVersion: 1 }),
    limits: freeze({ maxHeaderBytes: 16384, maxHeaderCount: 32, maxConcurrentSockets: 2, maxConnectionStarts: 16,
      maxConcurrentRequests: 1, maxRequestStarts: 12, tlsHandshakeDeadlineMs: 500, headerDeadlineMs: 1000,
      requestResponseDeadlineMs: 2000, idleSocketDeadlineMs: 3000, startDeadlineMs: 2000,
      closeGraceMs: 3000, metricsCounterLimit: 10000 }),
    downstream: freeze({ handle: f.router.handle, close: f.router.close }), deadlineRuntime: f.runtime.value,
    httpsServerFactory: factory });
  await f.owner.start(); assert.equal(f.owner.snapshotMetrics().phase, 'LISTENING');
  const client = CLIENT({ requirement: selected, contextLimit: 8,
    assetInfo: { asset: selected.asset, decimals: 8, symbol: 'DECLARED' },
    validateChallenge(data) { f.calls.clientSchema++; PaymentRequiredV2Schema.parse(data); },
    localClient: { createPaymentPayload(challenge, accepted) {
      f.calls.creator++; assert.equal(f.calls.creator, 1);
      return { x402Version: 2, resource: { ...challenge.resource }, accepted: { ...accepted },
        payload: { transaction: { hash: 'a'.repeat(64), signature: 'DECLARED_NOT_A_WALLET_SIGNATURE',
          nonce: '0000000000000000' }, intentDigest: 'b'.repeat(64) } };
    } } });
  const unpaid = await transport(); assert.equal(unpaid.status, 402);
  const challenge = client.decodePaymentRequiredHeader(unpaid.headers['payment-required']);
  assert.equal(challenge.resource.url, RESOURCE);
  f.payload = await client.createPaymentPayload(challenge); f.client = client;
  f.header = client.encodePaymentSignatureHeader(f.payload);
  f.originalPayload = JSON.stringify(decodePaymentSignatureHeader(f.header));
  return f;
}
async function pending(f) {
  const paid = await transport(f.header); assert.equal(paid.status, 402);
  const wire = decodePaymentResponseHeader(paid.headers['payment-response']);
  assert.equal(wire.success, false); assert.equal(wire.errorReason, 'settlement_pending');
  assert.deepEqual([f.calls.creator, f.calls.verify, f.calls.first, f.calls.observer], [1,1,1,0]);
}
async function close(f) {
  const closing = f.owner.close(); assert.equal(f.owner.close(), closing); await closing; f.closed = true;
  const metrics = f.owner.snapshotMetrics();
  assert.equal(metrics.phase, 'CLOSED');
  for (const key of ['trackedSockets','trackedRequests','trackedHandlers','ownedTimers']) assert.equal(metrics[key], 0);
  assert.equal(f.runtime.timers.size, 0); assert.equal(f.calls.close, 1);
  assert.equal(f.router.snapshot().phase, 'CLOSED');
}
function preserved(f) {
  assert.deepEqual([f.calls.creator, f.calls.verify, f.calls.first, f.calls.observer, f.calls.service], [1,1,1,1,0]);
  assert.equal(f.server.getSnapshot().requestCalls, 2);
  assert.equal(f.router.snapshot().uncertain, false);
  assert.equal(JSON.stringify(decodePaymentSignatureHeader(f.header)), f.originalPayload);
  for (const t of f.tuples) assert.equal(t.values[0], f.originalPayload);
  assert.deepEqual(f.tuples[0].values, f.tuples[1].values); assert.deepEqual(f.tuples[1].values, f.tuples[2].values);
}
function diagnostic(t, f, scenario) {
  t.diagnostic(JSON.stringify({ kind: 'OFFICIAL_X402_NATIVE_HTTPS_COMPOSITION_V2', version: 2, scenario,
    coreVersion: '2.23.0', zodVersion: '3.25.76', actualNativeServerFactory: true, actualIngressOwner: true,
    actualOfficialServerAndClient: true, tls: 'TLSv1.3', alpn: 'http/1.1', loopbackOnly: true,
    nativeConnectionAttemptsTotal: connectionAttempts, authenticatedTlsHandshakesTotal: tlsHandshakes,
    sdkRequestCalls: f.server.getSnapshot().requestCalls, creatorCalls: f.calls.creator,
    verifierCalls: f.calls.verify, firstSettlementCalls: f.calls.first, observerCalls: f.calls.observer,
    serviceCalls: f.calls.service, serviceSessionDeclaredOnly: true, applicationFactoryExecuted: false,
    originalPaymentHeaderAndTupleRetained: true, nativeClosePhase: f.owner.snapshotMetrics().phase,
    trackedSockets: 0, trackedRequests: 0, trackedHandlers: 0, ownedTimers: 0,
    sql: 0, capabilityKeys: 0, capabilitySignatures: 0, walletKeys: 0, paymentSignatures: 0,
    tlsFixtureKeyPairs: 1, nonceSearch: 0, realPrepare: 0, payments: 0,
    serviceDelivery: 'NOT_ESTABLISHED', v6ApplicationIntegration: 'NOT_ESTABLISHED', fullP1: 'NOT_ESTABLISHED' }));
}
test('native HTTPS original pending request resumes once and replays acknowledgement without another settle', OPTIONS, async t => {
  const f = await fixture(true), before = f.server.getSnapshot();
  for (const [method, target, host] of [['POST','/paid','127.0.0.1:' + PORT],
    ['GET','/other','127.0.0.1:' + PORT], ['GET','/paid','other.invalid']]) {
    assert.equal((await transport(null, method, target, host)).status, 503);
    assert.deepEqual(f.server.getSnapshot(), before);
  }
  await pending(f); const success = await transport(f.header); assert.equal(success.status, 200);
  assert.equal(decodePaymentResponseHeader(success.headers['payment-response']).success, true);
  const replay = await transport(f.header); assert.equal(replay.body, success.body);
  assert.equal(replay.headers['payment-response'], success.headers['payment-response']);
  preserved(f); await close(f); diagnostic(t, f, 'NATIVE_PENDING_SUCCESS_EXACT_REPLAY');
});
test('native HTTPS pending budget stays exhausted without a new first settlement', OPTIONS, async t => {
  const f = await fixture(false); await pending(f);
  const exhausted = await transport(f.header), replay = await transport(f.header);
  assert.equal(exhausted.status, 402); assert.equal(replay.body, exhausted.body);
  assert.equal(decodePaymentResponseHeader(exhausted.headers['payment-response']).success, false);
  preserved(f); await close(f); diagnostic(t, f, 'NATIVE_PENDING_EXHAUSTED_ORIGINAL_RETAINED');
});
test('native HTTPS changed context is refused while its original pending continuation survives', OPTIONS, async t => {
  const f = await fixture(true); await pending(f);
  const changed = JSON.parse(JSON.stringify(f.payload)); changed.resource.description = 'Changed context';
  const header = f.client.encodePaymentSignatureHeader(changed), before = f.server.getSnapshot();
  assert.equal((await transport(header)).status, 400); assert.deepEqual(f.server.getSnapshot(), before);
  assert.equal((await transport(f.header)).status, 200);
  preserved(f); await close(f); diagnostic(t, f, 'NATIVE_CHANGED_CONTEXT_ORIGINAL_CONTINUATION_RETAINED');
});
after(async () => {
  try {
    for (const f of fixtures) if (f.owner !== null && !f.closed) await close(f);
    assert.equal(fixtures.length, 3); assert.equal(connectionAttempts, 15);
    assert.equal(tlsHandshakes, 15); assert.equal(externalFetches, 0);
    assert.deepEqual(sources(), sourceBefore);
    for (const p of TLS_PINS) checked(p.path, p, 16384);
  } finally {
    key.fill(0); cert.fill(0); Object.defineProperty(globalThis, 'fetch', originalFetch);
  }
});
