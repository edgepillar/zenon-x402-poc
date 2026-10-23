// SOURCE V2 ONLY. A fresh one-shot approval is required before execution.
// V1 remains unchanged as the failed historical experiment.
// One selected local P1 attempt. Real core/HTTPS/V6/ledger composition only.
// Trusted grant activation and funding BOUND handoff below are SYNTHETIC DATA,
// not a verifier/provider/payment authority. No wallet signing or real PREPARE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, createPrivateKey, X509Certificate, generateKeyPairSync, sign } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0'); assert.equal(process.platform, 'darwin');
assert.equal(process.arch, 'arm64');
assert.equal(process.env.X402_P1_ONCE_OPT_IN, 'approved-p1-two-sqlite-loopback-once');
const PROFILE = JSON.parse(readFileSync(process.env.X402_P1_PROFILE_PATH, 'utf8'));
const TLS = JSON.parse(process.env.X402_P1_TLS_PINS);
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
const sha = b => createHash('sha256').update(b).digest('hex');
function sources() {
  let total = 0;
  return PROFILE.inputs.map(p => {
    const path = fileURLToPath(p.url), s = lstatSync(path, { bigint: true });
    assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.nlink, 1n);
    assert.equal(s.uid, BigInt(process.getuid())); assert.deepEqual(ids(s), p.identity);
    const raw = readFileSync(path); assert.equal(raw.length, p.bytes); assert.equal(sha(raw), p.sha256);
    assert.deepEqual(ids(lstatSync(path, { bigint: true })), p.identity);
    total += raw.length; assert.ok(total <= 2 * 1048576);
    return [p.logicalPath, p.bytes, p.sha256, p.identity];
  });
}
const before = sources(), scratch = process.env.SPV_TASK_SCRATCH, fixture = join(scratch, 'fixture');
for (const path of [scratch, fixture]) {
  const s = lstatSync(path, { bigint: true });
  assert.ok(s.isDirectory() && !s.isSymbolicLink()); assert.equal(s.uid, BigInt(process.getuid()));
  assert.equal(s.mode & 0o777n, 0o700n);
}
assert.deepEqual(readdirSync(fixture), []);
assert.deepEqual(TLS.map(p => p.role), ['key', 'cert']);
const tlsBytes = TLS.map(p => {
  const s = lstatSync(p.path, { bigint: true }); assert.deepEqual(ids(s), p.identity);
  assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.nlink, 1n);
  assert.equal(s.uid, BigInt(process.getuid())); assert.ok(s.size > 0n && s.size < 16384n);
  const bytes = readFileSync(p.path); assert.equal(sha(bytes), p.sha256); return bytes;
});
const [key, cert] = tlsBytes, x509 = new X509Certificate(cert);
assert.equal(x509.checkIP('127.0.0.1'), '127.0.0.1');
assert.equal(x509.checkPrivateKey(createPrivateKey(key)), true);
const peerDigest = sha(x509.raw), freeze = Object.freeze;
const PORT = 44448, ORIGIN = 'https://127.0.0.1:' + PORT, RESOURCE = ORIGIN + '/paid';
const SERVICE = ORIGIN + '/service-credit/v1/execute', HASH = 'a'.repeat(64);
const NOW = 2_000_000_000_000, FILES = ['p1-ledger.sqlite', 'p1-payer.sqlite'];
const POLICY = freeze({ policyVersion: 1, maxRequests: 4, serviceResourceUrl: SERVICE });
const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
let externalFetches = 0;
Object.defineProperty(globalThis, 'fetch', { ...originalFetch, value: () => {
  externalFetches++; throw Error('EXTERNAL_FETCH_FORBIDDEN');
} });
const { createOfficialServiceCreditHttpsApplication: APPLICATION }
  = await import('../src/x402-official-service-credit-https-application.js');
const { openOfficialV6OriginalPaymentClient: CLIENT }
  = await import('../src/x402-official-v6-original-payment-client.js');
const { createServiceCreditNativeHttpsClientTransport: TRANSPORT }
  = await import('../src/service-credit-native-https-client-transport.js');
const { createServiceCreditBoundedNodeHttpsServerFactory: SERVER_FACTORY }
  = await import('../src/service-credit-bounded-node-https-server-factory.js');
const { ServiceCreditSqliteStore: Backend } = await import('../src/service-credit-sqlite-store.js');
const { createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6: CREATE_PAYER,
  openZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6: OPEN_PAYER }
  = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const { captureOriginalPaymentCheckpoint: CAPTURE, encodeOriginalPaymentCheckpoint: ENCODE }
  = await import('../src/service-credit-pilot-original-payment-checkpoint.js');
const { deriveServiceCreditCapabilityCommitment: COMMIT,
  createServiceCreditCapabilitySigningBytes: SIGNING_BYTES }
  = await import('../src/service-credit-capability.js');
const coreRoot = process.env.X402_P1_CORE_ROOT;
const { decodePaymentRequiredHeader, decodePaymentResponseHeader }
  = await import(pathToFileURL(join(coreRoot, 'dist/esm/http/index.mjs')).href);
const { PaymentRequiredV2Schema }
  = await import(pathToFileURL(join(coreRoot, 'dist/esm/schemas/index.mjs')).href);
const canonical = v => v === null || typeof v !== 'object' ? JSON.stringify(v)
  : Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']'
  : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
const digest = n => 'sha256:' + String(n).repeat(64);
const keyOf = r => ({ grantId: r.grantId, requestId: r.requestId });
const selected = { scheme: 'exact', network: 'zenon:testnet', asset: 'synthetic-asset', amount: '1',
  payTo: 'synthetic-payee', maxTimeoutSeconds: 30, extra: { poc: true, settlement: 'account-block',
    paymentFlow: 'upfront', minimumMomentumConfirmations: 2,
    zenonChain: { version: 1, chainIdentifier: '42', genesisMomentumHash: '1'.repeat(64) } } };

test('P1 same native HTTPS and two-file V6 composition', { timeout: 25000, concurrency: false }, async t => {
  const f = { app: null, backend: null, client: null, native: null, raw: null, keys: [],
    execute: 0, verify: 0, first: 0, observer: 0, losses: 0, dropNext: false, proofs: 0, keysCreated: 0,
    tls: 0, starts: 0, schema: 0, clientSchema: 0, tuples: [], draining: [],
    ingressTimers: new Set(), serviceTimers: new Set(), normalPayerCloses: 0 };
  let captured, serialized, pair, grant, foreign, inputs, proofs, originalHeader;
  let primary = null;
  const options = () => ({ databasePath: join(fixture, FILES[1]), allowedRoot: fixture,
    resourceUrl: RESOURCE, custodyPolicy: POLICY });
  function ingressRuntime(set) {
    return freeze({
      schedule: freeze((callback, milliseconds) => {
        const token = setTimeout(() => { set.delete(token); callback(); }, milliseconds);
        set.add(token); return token;
      }),
      cancel: freeze(token => { if (!set.delete(token)) return false; clearTimeout(token); return true; }),
    });
  }
  function serviceRuntime(set) {
    const timers = ingressRuntime(set);
    // The durable owner requires cancel() -> undefined, NOT ingress's boolean.
    // Cancelling an already-fired token is also an idempotent void operation.
    return freeze({ monotonicNowNs: freeze(() => process.hrtime.bigint()),
      schedule: timers.schedule, cancel: freeze(token => { timers.cancel(token); }) });
  }
  const transportOptions = headers => freeze({ method: 'GET', headers: freeze(headers),
    agent: false, rejectUnauthorized: true, maxHeaderSize: 16384, insecureHTTPParser: false });
  function request(url, opts, onResponse) {
    assert.ok(f.starts < 48); f.starts++;
    const req = f.native.requestImpl(url, opts, res => {
      onResponse(res);
      if (f.dropNext) {
        f.dropNext = false; f.losses++;
        // Real response handle, AFTER server committed response headers/result.
        // Never synthesize response data or replace/retry the request.
        res.destroy(Error('SYNTHETIC_POST_HEADER_RESPONSE_LOSS'));
      }
    });
    f.draining.push(new Promise(resolveClose => req.once('close', resolveClose)));
    req.once('socket', socket => socket.once('secureConnect', () => {
      assert.equal(socket.authorized, true); assert.equal(socket.getProtocol(), 'TLSv1.3');
      assert.equal(socket.alpnProtocol, 'http/1.1'); assert.equal(sha(socket.getPeerCertificate().raw), peerDigest);
      f.tls++;
    }));
    return req;
  }
  function exchange(url, opts) {
    return new Promise((yes, no) => {
      let ended = false, closed = false, result = null;
      const done = () => { if (ended && closed) yes(result); };
      const req = request(url, opts, res => {
        const chunks = []; let used = 0;
        res.on('data', bytes => {
          used += bytes.length;
          if (used > 16384) { req.destroy(); no(Error('REPLY_CAP')); }
          else chunks.push(bytes);
        });
        res.once('error', no);
        res.once('end', () => {
          assert.equal(res.complete, true);
          result = { status: res.statusCode, headers: { ...res.headers }, body: Buffer.concat(chunks).toString('utf8') };
          ended = true; done();
        });
      });
      req.once('error', no); req.once('close', () => { closed = true; done(); }); req.end();
    });
  }
  const funding = header => exchange(RESOURCE, transportOptions(header === null ? {} : { 'Payment-Signature': header }));
  const service = proof => exchange(SERVICE, freeze({ ...transportOptions({ Authorization: proof }), method: 'POST' }));
  async function openClient() {
    assert.equal(f.client, null);
    f.client = await CLIENT({ payerOptions: { databasePath: join(fixture, FILES[1]), allowedRoot: fixture,
      fundingResourceUrl: RESOURCE, custodyPolicy: POLICY, selectedGrantId: grant.grantId,
      requestImpl: request, deadlineMs: 2500 },
    originalPayment: { resourceUrl: RESOURCE, serializedCheckpoint: serialized, expectedPins: captured.pins },
    official: { validateChallenge(data) { f.clientSchema++; PaymentRequiredV2Schema.parse(data); },
      assetInfo: { asset: selected.asset, decimals: 8, symbol: 'SYNTHETIC' }, contextLimit: 8 } });
    assert.deepEqual(f.client.readOriginalPaymentCheckpoint(captured.pins), captured.checkpoint);
  }
  async function closeClient(unknown) {
    const client = f.client, closing = client.close(); assert.equal(client.close(), closing);
    if (unknown) await assert.rejects(closing, { code: 'x402_official_v6_original_payment_client_close_unknown' });
    else await closing;
    const view = client.snapshot();
    assert.equal(view.lifecycle, unknown ? 'CLOSE_UNKNOWN' : 'CLOSED');
    assert.equal(view.payer.resource.storeCloseAttempts, 1);
    assert.equal(view.payer.resource.storeCloseOutcome, 'RETURNED');
    assert.equal(view.payer.resource.phase, 'RELEASED');
    assert.equal(view.payer.close.outcome, unknown ? 'CHILD_UNKNOWN' : 'DRAINED');
    f.normalPayerCloses++; f.client = null;
  }
  function enter(role, args) {
    assert.equal(args.length, 3); f[role]++;
    assert.equal(args[0].payload.transaction.hash, HASH); assert.deepEqual(args[1], selected);
    f.tuples.push(args.map(v => JSON.stringify(v)));
  }
  function settlement(payload, requirement, success) {
    return { success, ...(success ? { payer: 'synthetic-holder' } : { errorReason: 'settlement_pending' }),
      transaction: payload.payload.transaction.hash, network: requirement.network,
      publicationStatus: success ? 'ACKNOWLEDGED' : 'UNKNOWN' };
  }
  function activate(keys, id, hash) {
    return f.backend.activateGrantFromTrustedRecord({
      activationVersion: 2, evidenceVersion: 1, inclusionAuthorizationDigest: digest(7),
      authorityProfileId: 'synthetic-p1-authority', authorityProfileVersion: 1, verifierVersion: 1,
      authorityRecordDigest: digest(2), fundingPolicyId: 'p1-funding', fundingPolicyVersion: 1,
      sourceSettlementId: 'p1-settlement-' + id, transactionId: 'zenontx:' + hash,
      providerId: 'p1-provider', serviceId: 'p1-service', resourceId: 'p1-resource',
      resourceBinding: digest(1), offerId: 'p1-offer', offerVersion: 1, holderId: 'synthetic-holder-' + id,
      capabilityCommitment: COMMIT({ publicKey: keys.publicKey.export({ format: 'jwk' }).x }),
      totalUnits: 10, expiresAt: NOW + 60000, scheme: 'exact', paymentFlow: 'upfront',
      network: selected.network, chainProfile: selected.extra.zenonChain, asset: selected.asset,
      amount: selected.amount, payee: selected.payTo, payer: 'synthetic-holder-' + id,
      paymentResourceDigest: digest(3), paymentRequirementDigest: digest(4), paymentIntentDigest: digest(5),
      grantFundingCommitment: digest(6), evidenceState: 'MOMENTUM_INCLUDED',
      confirmationPolicy: { policyId: 'zenon.authenticated-momentum-inclusion', policyVersion: 1, minimumConfirmations: 2 },
    });
  }
  try {
    f.native = TRANSPORT({ origin: ORIGIN, ca: cert, maxRequestStarts: 48, maxConcurrentRequests: 1,
      requestDeadlineMs: 3000, handshakeDeadlineMs: 1500, closeGraceMs: 3000 });
    for (let i = 0; i < 2; i++) { f.keys.push(generateKeyPairSync('ed25519')); f.keysCreated++; }
    f.backend = Backend.create({ databasePath: join(fixture, FILES[0]), allowedRoot: fixture,
      deriveCost: () => 2, now: () => NOW, busyTimeoutMs: 50, maxStateBytes: 65536,
      maxOffers: 2, maxGrants: 2, maxRequests: 8 });
    f.backend.registerOffer({ modelVersion: 1, providerId: 'p1-provider', serviceId: 'p1-service',
      resourceId: 'p1-resource', resourceBinding: digest(1), offerId: 'p1-offer', offerVersion: 1,
      costPolicyId: 'p1-cost', fundingPolicyId: 'p1-funding', fundingPolicyVersion: 1 });
    // Explicit privileged fixture records. No attestor, receipt-to-grant path or funding authority.
    grant = activate(f.keys[0], 'selected', HASH); foreign = activate(f.keys[1], 'foreign', 'c'.repeat(64));
    f.backend.initializeDurableExecution({ expectedRevision: f.backend.load().revision,
      ledgerId: 'p1-synthetic-ledger', policy: { policyId: 'p1-deadline', policyVersion: 1, maxDurationMs: 1000 }, capacity: 8 });
    f.app = await APPLICATION({
      official: { requirement: selected, resource: { url: RESOURCE, description: 'P1 synthetic same-origin flow',
        mimeType: 'application/json' }, localFacilitator: {
        verify(...args) { enter('verify', args); return { isValid: true, payer: 'synthetic-holder' }; },
        settle(...args) { enter('first', args); return settlement(args[0], args[1], false); },
      },
      validateChallenge(data) { f.schema++; PaymentRequiredV2Schema.parse(data); },
      reconcilePendingSettlement(...args) { enter('observer', args); return settlement(args[0], args[1], true); },
      maxPendingReconciliations: 1, contextLimit: 8 },
      service: { store: f.backend, admittedGrantId: grant.grantId, selectedDurationMs: 1000,
        execute() { f.execute++; return { resultCode: 'p1-synthetic-success' }; },
        deadlineRuntime: serviceRuntime(f.serviceTimers) },
      transport: { origin: ORIGIN, generation: freeze({ generationId: 'p1-native-once', generationVersion: 1 }),
        limits: freeze({ maxHeaderBytes: 16384, maxHeaderCount: 32, maxConcurrentSockets: 2, maxConnectionStarts: 48,
          maxConcurrentRequests: 1, maxRequestStarts: 48, tlsHandshakeDeadlineMs: 1500, headerDeadlineMs: 2000,
          requestResponseDeadlineMs: 3000, idleSocketDeadlineMs: 4000, startDeadlineMs: 2000,
          closeGraceMs: 4000, metricsCounterLimit: 10000 }),
        deadlineRuntime: ingressRuntime(f.ingressTimers),
        httpsServerFactory: SERVER_FACTORY(freeze({ bind: freeze({ host: '127.0.0.1', port: PORT, exclusive: true }),
          tlsMaterial: freeze({ key, cert }) })) },
    });
    await f.app.start(); assert.equal(f.app.snapshot().ingress.phase, 'LISTENING');
    const unpaid = await funding(null); assert.equal(unpaid.status, 402);
    const required = decodePaymentRequiredHeader(unpaid.headers['payment-required']);
    PaymentRequiredV2Schema.parse(required); assert.deepEqual(required.accepts, [selected]);
    const payload = { x402Version: 2, resource: required.resource, accepted: selected,
      payload: { transaction: { hash: HASH, signature: 'DECLARED_NOT_A_PAYMENT_SIGNATURE',
        nonce: '0000000000000000' }, intentDigest: 'b'.repeat(64) } };
    originalHeader = Buffer.from(JSON.stringify(payload)).toString('base64');
    pair = { challenge: { status: 'PAYMENT_REQUIRED', resourceUrl: RESOURCE,
      paymentRequiredHeader: unpaid.headers['payment-required'], paymentRequired: required },
      paymentSignatureHeader: originalHeader };
    captured = CAPTURE({ binding: { requestId: 'p1-original-funding', paymentHash: HASH,
      origin: ORIGIN, contextId: 'p1-original-context' },
      originalBytes: { requestBody: '', paymentPayload: originalHeader,
        paymentRequirements: pair.challenge.paymentRequiredHeader,
        context: Buffer.from(' { "synthetic": true, "spacing": "retained" }\n').toString('base64') } });
    serialized = ENCODE(captured.checkpoint);
    f.raw = CREATE_PAYER(options());
    f.raw.prepareWithOriginalPaymentCheckpoint({ pair, serializedCheckpoint: serialized, expectedPins: captured.pins });
    assert.equal(f.raw.load().status, 'PREPARED'); f.raw.close(); f.raw = null;
    await openClient();

    await t.test('pending preserves the actual V6 original and same SDK tuple', async () => {
      const restored = await f.client.restoreOriginalPayment({
        paymentRequiredHeader: pair.challenge.paymentRequiredHeader, expectedPins: captured.pins });
      assert.equal(restored.paymentSignatureHeader, originalHeader);
      assert.equal(restored.signatureCreated, false); assert.equal(restored.grantActivation, 'NOT_ESTABLISHED');
      assert.equal(f.client.snapshot().original.checkpointReads, 3);
      const reply = await funding(restored.paymentSignatureHeader); assert.equal(reply.status, 402);
      const receipt = decodePaymentResponseHeader(reply.headers['payment-response']);
      assert.equal(receipt.success, false); assert.equal(receipt.errorReason, 'settlement_pending');
      assert.deepEqual([f.verify, f.first, f.observer, f.execute], [1,1,0,0]);
      assert.equal(f.backend.getGrant(grant.grantId).consumedUnits, 0);
      assert.deepEqual(f.client.readOriginalPaymentCheckpoint(captured.pins), captured.checkpoint);
    });
    if (t.signal.aborted) throw Error('SUBTEST_ABORTED');
    let completedResponse;
    await t.test('success uses the same original before explicit synthetic BOUND handoff', async () => {
      const ack = await funding(originalHeader); assert.equal(ack.status, 200);
      assert.equal(decodePaymentResponseHeader(ack.headers['payment-response']).success, true);
      const replay = await funding(originalHeader);
      assert.equal(replay.body, ack.body); assert.equal(replay.headers['payment-response'], ack.headers['payment-response']);
      assert.deepEqual([f.verify, f.first, f.observer, f.execute], [1,1,1,0]);
      assert.deepEqual(f.tuples[0], f.tuples[1]); assert.deepEqual(f.tuples[1], f.tuples[2]);
      await closeClient(false);
      f.raw = OPEN_PAYER(options());
      assert.equal(f.raw.load().status, 'PREPARED');
      assert.deepEqual(f.raw.getOriginalPaymentCheckpoint(captured.pins), captured.checkpoint);
      // Test-only host handoff. ACK above DOES NOT authorize this production transition.
      f.raw.fenceAttempt('PREPARED'); assert.equal(f.raw.finishAttempt('BOUND').revision, 3);
      f.raw.close(); f.raw = null;
      const requests = [
        { grantId: grant.grantId, requestId: 'p1-success', keyIndex: 0 },
        { grantId: grant.grantId, requestId: 'p1-response-loss', keyIndex: 0 },
        { grantId: foreign.grantId, requestId: 'p1-foreign', keyIndex: 1 },
      ].map(({ keyIndex, ...r }) => ({ keyIndex, request: { modelVersion: 1, ...r, method: 'POST',
        routeId: 'service-credit.execute.v1', canonicalBodyDigest: digestOfEmpty(),
        selectedContentType: 'application/json', maxCostUnits: 2 } }));
      proofs = requests.map(({ keyIndex, request: r }) => {
        assert.ok(f.proofs < 3); f.proofs++;
        return 'ServiceCredit ' + Buffer.from(canonical({ proofVersion: 1, grantId: r.grantId,
          requestId: r.requestId, publicKey: f.keys[keyIndex].publicKey.export({ format: 'jwk' }).x, maxCostUnits: 2,
          signature: sign(null, SIGNING_BYTES(r), f.keys[keyIndex].privateKey).toString('base64url') })).toString('base64url');
      });
      inputs = requests.map(({ request: r }, index) => freeze({ ...keyOf(r),
        originalRequestJson: JSON.stringify(r), originalBodyBase64: '', serviceResourceUrl: SERVICE,
        authorizationHeader: proofs[index] }));
      await openClient();
      assert.equal(f.client.snapshot().restorations, 0);
      assert.equal(await f.client.submitOriginal(inputs[0]), undefined);
      completedResponse = f.client.readOriginalRecoveryState(keyOf(inputs[0]));
      assert.equal(completedResponse.responseStatus, 'LOCAL_DECLARED_SUCCESS_RESPONSE_OBSERVED');
      assert.equal(completedResponse.original.paymentHash, HASH); assert.equal(f.execute, 1);
      assert.equal(f.backend.getGrant(grant.grantId).consumedUnits, 2);
    });
    await t.test('original service replay reuses proof and cached result without debit', async () => {
      const beforeLedger = f.backend.load(), beforeProofs = f.proofs;
      const replay = await service(proofs[0]); assert.equal(replay.status, 200);
      assert.equal(replay.body, completedResponse.responseObservation.responseJson);
      assert.deepEqual(f.backend.load(), beforeLedger); assert.equal(f.execute, 1); assert.equal(f.proofs, beforeProofs);
      assert.equal(f.client.readOriginalRecoveryState(keyOf(inputs[0])).original.originalRequestJson,
        inputs[0].originalRequestJson);
    });
    await t.test('valid foreign grant is refused at client and actual service admission', async () => {
      const beforeStarts = f.starts, beforeLedger = f.backend.load(), beforeForeign = f.backend.getGrant(foreign.grantId);
      await assert.rejects(f.client.submitOriginal(inputs[2]), { code: 'x402_official_v6_original_payment_client_operation_unavailable' });
      assert.equal(f.starts, beforeStarts);
      const rejected = await service(proofs[2]); assert.equal(rejected.status, 401);
      assert.equal(f.execute, 1); assert.deepEqual(f.backend.load(), beforeLedger);
      assert.deepEqual(f.backend.getGrant(foreign.grantId), beforeForeign);
    });
    await t.test('real response loss retains UNKNOWN across normal reopen of the same files', async () => {
      f.dropNext = true;
      await assert.rejects(f.client.submitOriginal(inputs[1]), { code: 'x402_official_v6_original_payment_client_operation_unavailable' });
      await Promise.all(f.draining);
      assert.equal(f.losses, 1); assert.equal(f.execute, 2); assert.equal(f.starts, 8);
      await assert.rejects(f.client.submitOriginal(inputs[0]), {
        code: 'x402_official_v6_original_payment_client_operation_unavailable' });
      assert.equal(f.starts, 8); // A retained proof cannot bypass the UNKNOWN latch.
      const unknown = f.client.snapshot();
      assert.equal(unknown.payer.client.owner.uncertainty.submission, true);
      await closeClient(true);
      f.raw = OPEN_PAYER(options());
      assert.equal(f.raw.load().status, 'BOUND');
      assert.equal(f.raw.load().revision, 3);
      assert.deepEqual(f.raw.getOriginalPaymentCheckpoint(captured.pins), captured.checkpoint);
      const a = keyOf(inputs[0]), b = keyOf(inputs[1]);
      for (const r of [a, b]) {
        assert.equal(f.raw.getOriginalRequest(r).paymentHash, HASH);
        assert.equal(f.raw.getOriginalDispatchIntent(r).paymentHash, HASH);
      }
      assert.equal(f.raw.getOriginalResponseObservation(a).responseJson, completedResponse.responseObservation.responseJson);
      assert.equal(f.raw.getOriginalResponseObservation(b), null);
      assert.equal(f.raw.getOriginalCustodyQuarantine({ grantId: grant.grantId }).status, 'CUSTODY_OUTCOME_UNKNOWN');
      assert.equal(f.raw.getOriginalRequest(keyOf(inputs[2])), null);
      f.raw.close(); f.raw = null;
      const appClosing = f.app.close(); assert.equal(f.app.close(), appClosing);
      try { await appClosing; }
      catch (error) {
        assert.equal(f.losses, 1);
        assert.equal(error.code, 'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_CLOSE_UNCERTAIN');
      }
      const view = f.app.snapshot();
      assert.ok(['CLOSED', 'CLOSE_UNCERTAIN'].includes(view.ingress.phase));
      for (const name of ['trackedSockets','trackedRequests','trackedHandlers','ownedTimers']) assert.equal(view.ingress[name], 0);
      const ledgerBefore = f.backend.load(); f.backend.close(); f.backend = null;
      f.backend = Backend.open({ databasePath: join(fixture, FILES[0]), allowedRoot: fixture,
        deriveCost: () => 2, now: () => NOW, busyTimeoutMs: 50, maxStateBytes: 65536,
        maxOffers: 2, maxGrants: 2, maxRequests: 8 });
      assert.deepEqual(f.backend.load(), ledgerBefore);
      assert.deepEqual([f.backend.getGrant(grant.grantId).consumedUnits,
        f.backend.getGrant(grant.grantId).availableUnits, f.backend.getGrant(foreign.grantId).consumedUnits], [4,6,0]);
      assert.equal(f.backend.getDurableExecutionSnapshot().executionState.executions.length, 2);
      assert.equal(f.starts, 8); assert.equal(f.tls, 8); assert.equal(f.proofs, 3);
      assert.equal(f.ingressTimers.size, 0); assert.equal(f.serviceTimers.size, 0);
    });
  } catch (error) { primary = error; }
  finally {
    try {
      if (f.client !== null) { try { await f.client.close(); } catch {} f.client = null; }
      if (f.raw !== null) { f.raw.close(); f.raw = null; }
      if (f.app !== null) {
        try { await f.app.close(); }
        catch (error) {
          assert.equal(f.losses, 1);
          assert.equal(error.code, 'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_CLOSE_UNCERTAIN');
        }
      }
      if (f.backend !== null) { f.backend.close(); f.backend = null; }
      await Promise.all(f.draining);
      if (f.native !== null) {
        const closing = f.native.close(); assert.equal(f.native.close(), closing);
        try { await closing; } catch {
          assert.equal(f.native.snapshot().unknown, true);
          assert.equal(f.native.snapshot().phase, 'CLOSE_UNKNOWN');
        }
        const view = f.native.snapshot();
        assert.equal(view.trackedRequests, 0); assert.equal(view.trackedSockets, 0); assert.equal(view.ownedTimers, 0);
      }
      assert.equal(f.ingressTimers.size, 0); assert.equal(f.serviceTimers.size, 0);
      assert.deepEqual(sources(), before); assert.equal(externalFetches, 0);
    } catch (error) { primary ??= error; }
    finally { f.keys = []; key.fill(0); cert.fill(0); Object.defineProperty(globalThis, 'fetch', originalFetch); }
  }
  // Emit observed counters even when a parent/cleanup assertion fails. The
  // runner's actual subtest/exit results remain authoritative, never this DATA.
  t.diagnostic(JSON.stringify({ kind: 'P1_NATIVE_V6_ATTEMPT_SUMMARY_V2', version: 2,
    nativeConnections: f.starts, authenticatedTlsHandshakes: f.tls,
    syntheticCapabilityKeyPairs: f.keysCreated, syntheticCapabilitySignatures: f.proofs,
    responseLossInjections: f.losses, nativeServiceCallbacks: f.execute,
    verifierCalls: f.verify, firstSettlementCalls: f.first, observerCalls: f.observer,
    clientTransport: f.native === null ? null : f.native.snapshot(),
    applicationIngress: f.app === null ? null : f.app.snapshot().ingress,
    parentErrorCode: typeof primary?.code === 'string' ? primary.code : primary === null ? null : 'UNCLASSIFIED',
    fullP1: 'NOT_ESTABLISHED' }));
  if (primary !== null) throw primary;
  assert.deepEqual(readdirSync(fixture).sort(), FILES);
  t.diagnostic(JSON.stringify({ kind: 'P1_NATIVE_V6_TWO_SQLITE_ONCE', version: 2,
    ingressCancelContract: 'BOOLEAN', serviceCancelContract: 'UNDEFINED',
    serverClosePhase: f.app.snapshot().ingress.phase, clientClosePhase: f.native.snapshot().phase,
    actualApplicationFactory: true, actualOfficialV6Client: true, actualNativeTlsTransport: true,
    actualCore: '2.23.0', nativeConnections: f.starts, authenticatedTlsHandshakes: f.tls,
    nativeSqliteFiles: 2, normalSameFileReopen: true, originalHeaderAndTupleRetained: true,
    syntheticCapabilityKeyPairs: 2, syntheticCapabilitySignatures: f.proofs, responseLosses: f.losses,
    nativeServiceCallbacks: f.execute, foreignGrantDebits: 0, selectedGrantDebits: 4,
    serviceProofReplayWithoutNewDebit: true, responseLossQuarantineRetained: true,
    payerReturnedStoreCloses: f.normalPayerCloses, declaredFundingHandoff: true,
    providerActivationProof: 'NOT_ESTABLISHED', realPayment: 'NOT_RUN', fullP1: 'NOT_ESTABLISHED',
    economicPilot: 'NO_GO', applicationRestart: 'NOT_RUN', sourceFiles: before.length }));
});
function digestOfEmpty() { return 'sha256:' + sha(Buffer.alloc(0)); }

