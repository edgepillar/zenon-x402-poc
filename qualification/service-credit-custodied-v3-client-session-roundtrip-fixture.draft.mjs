import { equal, deepStrictEqual as same, notEqual, ok } from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { types } from 'node:util';

/* SOURCE DRAFT / NOT_RUN. Fixture machinery for exactly one modular roundtrip
 * qualification. No test registration, top-level execution/await, CLI, host,
 * socket/server/default transport, framework or production helper.
 * The entry module supplies its guarded current production namespace references.
 * Two fresh private synthetic SQL paths; one capability pair/signature maximum.
 * Funding seed transitions are declared SQL DATA, never real chain PREPARE.
 * Declared events/close observations are not HTTPS/delivery, restart/crash,
 * physical durability, native DB cleanup, authenticated funding or authority.
 * No payment signing, raw SQL, patch/interposition, retry/repair/erase/force close.
 */

const NOW = 2_000_000_000_000, JSON_TYPE = 'application/json';
const EMPTY_BODY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const FUNDING = 'https://roundtrip.invalid/funding';
const SERVICE = 'https://roundtrip.invalid/service-credit/v1/execute';
const PAYMENT_HASH = 'a'.repeat(64), RESULT = 'service.scoped.session';
const POLICY = { policyVersion: 1, maxRequests: 2, serviceResourceUrl: SERVICE };
const THEN = Promise.prototype.then, APPLY = Reflect.apply;

const freeze = Object.freeze;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const stamp = stat => [
  stat.dev, stat.ino, stat.uid, stat.mode, stat.nlink,
  stat.size, stat.mtimeNs, stat.ctimeNs,
];
function redacted(label) {
  const error = new Error(label);
  Object.defineProperty(error, 'stack', { value: 'Error: ' + label });
  return freeze(error);
}
function hold(S, label) {
  if (S.hold === 'NONE') S.hold = label;
}
function absent(path) {
  try { lstatSync(path); }
  catch (error) { if (error?.code === 'ENOENT') return; throw error; }
  throw redacted('NEW_SCOPED_FIXTURE_PATH_EXISTS_HOLD');
}
function directories(path) {
  equal(typeof path, 'string');
  ok(path.length > 0 && path.length < 3800 && isAbsolute(path));
  equal(resolve(path), path); equal(path.includes('\0'), false);
  for (let current = path, depth = 0; ; depth += 1) {
    ok(depth < 128);
    const stat = lstatSync(current, { bigint: true });
    ok(stat.isDirectory()); equal(stat.isSymbolicLink(), false);
    equal(realpathSync(current), current);
    const parent = dirname(current); if (parent === current) break;
    current = parent;
  }
}
function privateDirectory(path, uid, device) {
  directories(path);
  const stat = lstatSync(path, { bigint: true });
  equal(stat.uid, uid); equal(stat.mode & 0o7777n, 0o700n);
  if (device !== undefined) equal(stat.dev, device);
  return stat;
}

function unit(S) {
  try {
    S.stage = 'NEW_PRIVATE_SYNTHETIC_TWO_DATABASE_UNIT';
    const root = privateDirectory(S.root, S.uid, S.rootPin.dev);
    same(stamp(root), stamp(S.rootPin)); same(readdirSync(S.root), []);
    S.directory = join(S.root, 'custodied-v3-actual-session-roundtrip'); absent(S.directory);
    mkdirSync(S.directory, { mode: 0o700 });
    const stat = privateDirectory(S.directory, S.uid, root.dev);
    S.unitPin = [stat.dev, stat.ino];
    S.path = join(S.directory, 'backend.sqlite');
    S.fundingPath = join(S.directory, 'funding.sqlite');
    notEqual(S.path, S.fundingPath); same(readdirSync(S.directory), []);
    absent(S.path); absent(S.fundingPath);
  } catch (error) { hold(S, 'FIXTURE_DIRECTORY_MARKER_UNKNOWN'); throw error; }
}
function files(S) {
  let check = 'ADMISSION';
  try {
    equal(S.hold, 'NONE');
    check = 'DIRECTORY';
    const unit = privateDirectory(S.directory, S.uid, S.rootPin.dev);
    check = 'DIRECTORY_IDENTITY'; same([unit.dev, unit.ino], S.unitPin);
    const fundingLive = S.fundingKnown && !S.fundingCloseReturned;
    const readerLive = S.readerKnown && !S.readerCloseReturned;
    check = 'OWNER_OVERLAP'; equal(fundingLive && readerLive, false);
    check = 'OWNER_EPOCH';
    let epoch = S.journalEpoch;
    if (fundingLive) {
      ok(epoch === 'NONE' || epoch === 'FUNDING'); epoch = 'FUNDING';
    } else if (readerLive) {
      equal(S.fundingCloseReturned, true);
      ok(epoch === 'FUNDING_CLOSED' || epoch === 'READER'); epoch = 'READER';
    } else if (epoch === 'FUNDING') {
      equal(S.fundingCloseReturned, true); epoch = 'FUNDING_CLOSED';
    } else if (epoch === 'READER') {
      equal(S.readerCloseReturned, true); epoch = 'READER_CLOSED';
    }
    const names = [S.storeKnown && 'backend.sqlite', S.fundingKnown && 'funding.sqlite'].filter(Boolean).sort();
    const entries = readdirSync(S.directory).sort(), journalName = 'funding.sqlite-journal';
    const journalPresent = entries.includes(journalName), live = fundingLive || readerLive;
    check = 'EXACT_ENTRY_SET';
    same(entries, journalPresent && live ? [...names, journalName].sort() : names);
    if (live && S.journalPin !== null && epoch === S.journalEpoch) {
      check = 'JOURNAL_DISAPPEARANCE'; equal(journalPresent, true);
    }
    let journalPin = null;
    const selected = [['BACKEND', S.path], ['FUNDING', S.fundingPath]];
    if (journalPresent) selected.push(['JOURNAL', join(S.directory, journalName)]);
    for (const [kind, path] of selected) {
      if (kind === 'BACKEND' && !S.storeKnown || kind === 'FUNDING' && !S.fundingKnown) continue;
      check = kind + '_REGULARITY';
      const stat = lstatSync(path, { bigint: true });
      ok(stat.isFile()); equal(stat.isSymbolicLink(), false);
      check = kind + '_OWNER_DEVICE'; equal(stat.uid, S.uid); equal(stat.dev, S.rootPin.dev);
      check = kind + '_LINK_MODE'; equal(stat.nlink, 1n); equal(stat.mode & 0o7777n, 0o600n);
      check = kind + '_SIZE';
      ok((kind === 'JOURNAL' ? stat.size >= 0n : stat.size > 0n) && stat.size <= 2097152n);
      check = kind + '_REALPATH'; equal(realpathSync(path), path);
      check = kind + '_IDENTITY';
      const pin = [stat.dev, stat.ino];
      if (kind === 'JOURNAL') {
        if (S.journalPin !== null && epoch === S.journalEpoch) same(pin, S.journalPin);
        journalPin = pin;
      } else {
        const name = kind === 'BACKEND' ? 'backend' : 'funding';
        if (S.databasePins[name] === undefined) S.databasePins[name] = pin;
        else same(pin, S.databasePins[name]);
      }
    }
    check = 'ENTRY_SET_STABILITY'; same(readdirSync(S.directory).sort(), entries);
    check = 'DIRECTORY_IDENTITY_STABILITY';
    const after = privateDirectory(S.directory, S.uid, S.rootPin.dev);
    same([after.dev, after.ino], S.unitPin);
    // Closed epochs are admitted only after the exact entry set proves journal absence.
    S.journalEpoch = epoch; S.journalPin = journalPin;
  } catch (error) { hold(S, 'FIXTURE_DATABASE_' + check + '_UNKNOWN'); throw error; }
}
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  return '{' + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
function pair(S, tag) {
  ok(S.keyAttempts < 1); S.keyAttempts += 1;
  const keys = generateKeyPairSync('ed25519');
  const publicDer = keys.publicKey.export({ format: 'der', type: 'spki' });
  equal(publicDer.subarray(0, -32).toString('hex'), '302a300506032b6570032100');
  const publicKey = publicDer.subarray(-32).toString('base64url');
  equal(publicKey.length, 43); S.keyPairs += 1;
  return { tag, privateKey: keys.privateKey, publicKey, grantId: null, request: null, proof: null };
}
function seed(S) {
  S.stage = 'ACTUAL_ONE_GRANT_DURABLE_STORE';
  const G = S.G;
  S.creatingStore = true; S.storeCreates += 1;
  try {
    S.store = G.store.ServiceCreditSqliteStore.create({
      databasePath: S.path, allowedRoot: S.directory, deriveCost: () => 2, now: () => NOW,
      busyTimeoutMs: 50, maxStateBytes: 65536, maxOffers: 1, maxGrants: 1, maxRequests: 2,
    });
    ok(S.store instanceof G.store.ServiceCreditSqliteStore);
    S.storeKnown = true; S.creatingStore = false;
  } catch (error) { hold(S, 'STORE_CONSTRUCTION_UNKNOWN'); throw error; }
  files(S);
  const binding = freeze({
    providerId: 'provider.fixture', serviceId: 'service.fixture', resourceId: 'resource.fixture',
    resourceBinding: 'sha256:' + sha('resource.scoped'), offerId: 'offer.scoped', offerVersion: 1,
    fundingPolicyId: 'funding.scoped', fundingPolicyVersion: 1,
  });
  S.store.registerOffer({
    ...binding, modelVersion: G.model.SERVICE_CREDIT_MODEL_VERSION, costPolicyId: 'cost.scoped',
  });
  S.A = pair(S, 'a');
  const active = S.store.activateGrantFromTrustedRecord({
    ...binding, activationVersion: G.model.SERVICE_CREDIT_ACTIVATION_VERSION,
    authorityProfileId: 'authority.mock.fixture', authorityProfileVersion: 1, verifierVersion: 1,
    authorityRecordDigest: 'sha256:' + sha('authority.scoped.a'),
    sourceSettlementId: 'settlement.scoped.a', transactionId: 'mocktx:' + sha('transaction.scoped.a'),
    holderId: 'holder.scoped.a',
    capabilityCommitment: G.capability.deriveServiceCreditCapabilityCommitment({ publicKey: S.A.publicKey }),
    totalUnits: 7, expiresAt: NOW + 60000,
    scheme: 'exact', paymentFlow: 'upfront', network: 'zenon:mock',
    chainProfile: { version: 1, chainIdentifier: Number.MAX_SAFE_INTEGER.toString(), genesisMomentumHash: '0'.repeat(64) },
    asset: 'zts1mockasset', amount: '1', payee: 'payee.mock.fixture', payer: 'holder.scoped.a',
    paymentResourceDigest: 'sha256:' + sha('payment-resource.scoped.a'),
    paymentRequirementDigest: 'sha256:' + sha('requirement.scoped.a'),
    paymentIntentDigest: 'sha256:' + sha('intent.scoped.a'),
    grantFundingCommitment: 'sha256:' + sha('funding.scoped.a'),
    evidenceState: 'MOMENTUM_INCLUDED',
    confirmationPolicy: { policyId: 'mock.momentum-included', policyVersion: 1, minimumConfirmations: 1 },
  });
  ok(Object.isFrozen(active)); equal(typeof active.grantId, 'string'); S.A.grantId = active.grantId;
  S.A.request = freeze({
    modelVersion: G.model.SERVICE_CREDIT_MODEL_VERSION, grantId: S.A.grantId,
    requestId: 'request.scoped.a', method: 'POST', routeId: G.http.SERVICE_CREDIT_HTTP_ROUTE_ID,
    canonicalBodyDigest: EMPTY_BODY, selectedContentType: JSON_TYPE, maxCostUnits: 2,
  });
  equal(S.keyAttempts, 1); equal(S.keyPairs, 1);
  const revision = S.store.getMetadata().revision;
  const initialized = S.store.initializeDurableExecution({
    expectedRevision: revision, ledgerId: 'ledger.scoped',
    policy: { policyId: 'execution.scoped', policyVersion: 1, maxDurationMs: 1000 }, capacity: 2,
  });
  equal(initialized.disposition, 'APPLIED'); equal(initialized.revision, revision + 1);
  equal(initialized.executionState.capacity, 2);
  equal(initialized.executionState.executions.length, 0); files(S);
}
function snapshot(S) {
  try {
    const ledger = S.store.load(), durable = S.store.getDurableExecutionSnapshot();
    const metadata = S.store.getMetadata();
    equal(ledger.schemaVersion, 1); equal(ledger.state.modelVersion, 1); equal(ledger.state.schemaVersion, 2);
    equal(durable.revision, ledger.revision); equal(metadata.revision, ledger.revision);
    equal(metadata.checksum, ledger.checksum);
    return { ledger, durable, metadata };
  } catch (error) { hold(S, 'BORROWED_BACKEND_READ_UNKNOWN'); throw error; }
}
function grant(view, id) {
  const records = view.ledger.state.grants.filter(item => item.grantId === id);
  equal(records.length, 1); return records[0];
}
function credit(record, expected) {
  same([record.totalUnits, record.availableUnits, record.heldUnits, record.consumedUnits], expected);
}

function observe(S, original, label) {
  const record = { original, label, observed: false, settled: false, ok: false, value: undefined, error: null };
  S.promises.push(record);
  try {
    ok(types.isPromise(original)); equal(Object.getPrototypeOf(original), Promise.prototype);
    equal(Object.getOwnPropertyDescriptor(original, 'constructor'), undefined);
    record.sink = APPLY(THEN, original, [
      value => { record.settled = true; record.ok = true; record.value = value; },
      error => { record.settled = true; record.error = error; },
    ]);
    record.observed = true; return record;
  } catch (error) { hold(S, 'ORIGINAL_PROMISE_OBSERVATION_UNKNOWN'); throw error; }
}
async function settled(S, predicate) {
  for (let turn = 0; turn < 512; turn += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  hold(S, 'ORIGINAL_WORK_PENDING_HOLD');
  throw redacted('ORIGINAL_WORK_PENDING_HOLD');
}
function declaredRuntime(S) {
  return {
    monotonicNowNs: () => 0n,
    schedule(wake, ms) {
      if (typeof wake !== 'function' || ms !== 1000) {
        hold(S, 'DECLARED_TIMER_SCHEDULE_UNKNOWN'); throw redacted('DECLARED_TIMER_SCHEDULE_UNKNOWN');
      }
      const handle = freeze({}); S.handles.add(handle); S.schedules += 1; return handle;
    },
    cancel(handle) {
      if (!S.handles.has(handle)) {
        hold(S, 'DECLARED_TIMER_CANCEL_UNKNOWN'); throw redacted('DECLARED_TIMER_CANCEL_UNKNOWN');
      }
      S.handles.delete(handle); S.cancels += 1; return undefined;
    },
  };
}

function createSession(S) {
  S.stage = 'ACTUAL_SCOPED_SESSION_CONSTRUCTION'; S.beforeSession = snapshot(S);
  function execute(identity) {
    S.executeCalls += 1; S.executeIdentities.push(identity);
    // Extra invocations also settle; exact-one is asserted after observation.
    const original = Promise.resolve(freeze({ resultCode: RESULT }));
    observe(S, original, 'EXECUTE_ORIGINAL'); return original;
  }
  S.creatingSession = true; S.sessionCreates += 1;
  try {
    S.session = S.G.session.createDurableServiceCreditHttpSession({
      store: S.store, execute, deadlineRuntime: declaredRuntime(S),
      selectedDurationMs: 1000, admittedGrantId: S.A.grantId,
    });
    ok(Object.isFrozen(S.session)); same(Object.keys(S.session).sort(), ['close', 'handle']);
    S.sessionKnown = true; S.creatingSession = false;
  } catch (error) { hold(S, 'SESSION_CONSTRUCTION_UNKNOWN'); throw error; }
  S.baseline = snapshot(S); same(S.baseline, S.beforeSession);
  equal(S.baseline.ledger.state.offers.length, 1); equal(S.baseline.ledger.state.grants.length, 1);
  equal(S.baseline.ledger.state.requests.length, 0);
  equal(S.baseline.durable.executionState.executions.length, 0);
  credit(grant(S.baseline, S.A.grantId), [7, 7, 0, 0]);
}
function signedOriginal(S) {
  const request = S.A.request;
  ok(S.signAttempts < 1); S.signAttempts += 1;
  const signingBytes = S.G.capability.createServiceCreditCapabilitySigningBytes(request);
  const signature = sign(null, signingBytes, S.A.privateKey).toString('base64url');
  equal(signature.length, 86); S.signatures += 1;
  const proof = freeze({ proofVersion: 1, grantId: request.grantId, requestId: request.requestId,
    publicKey: S.A.publicKey, maxCostUnits: request.maxCostUnits, signature });
  const proofJson = canonical(proof);
  const authorization = 'ServiceCredit ' + Buffer.from(proofJson, 'ascii').toString('base64url');
  const requestJson = JSON.stringify(request); // Actual REQUEST_FIELDS insertion order.
  const input = freeze({ grantId: request.grantId, requestId: request.requestId,
    originalRequestJson: requestJson, originalBodyBase64: '',
    serviceResourceUrl: SERVICE, authorizationHeader: authorization });
  S.original = freeze({ request, requestJson, proof, proofJson, authorization, signingBytes,
    signingDigest: sha(signingBytes), authorizationBytes: Buffer.from(authorization, 'ascii'), input });
  const stored = S.store.getGrant(request.grantId);
  const verified = S.G.capability.verifyServiceCreditCapability({
    grant: { grantId: stored.grantId, capabilityCommitment: stored.capabilityCommitment },
    request, proof,
  });
  same(verified, { verified: true, proofVersion: 1, grantId: request.grantId,
    requestId: request.requestId, maxCostUnits: 2 });
  ok(Object.isFrozen(verified)); equal(Object.getPrototypeOf(verified), Object.prototype);
  S.verificationControls += 1; S.proofValid = true;
}
function originalUnchanged(S) {
  const o = S.original;
  equal(o.request, S.A.request); equal(JSON.stringify(o.request), o.requestJson);
  equal(canonical(o.proof), o.proofJson); equal(sha(o.signingBytes), o.signingDigest);
  same(Buffer.from(o.authorization, 'ascii'), o.authorizationBytes);
  equal(o.authorization, 'ServiceCredit ' + Buffer.from(o.proofJson, 'ascii').toString('base64url'));
  equal(o.input.originalRequestJson, o.requestJson); equal(o.input.authorizationHeader, o.authorization);
  equal(S.keyAttempts, 1); equal(S.keyPairs, 1); equal(S.signAttempts, 1); equal(S.signatures, 1);
}

function seedFunding(S) {
  S.stage = 'CREATE_AND_SEED_ACTUAL_V3_FUNDING_STORE';
  const requirement = { scheme: 'exact', network: 'zenon:testnet', asset: 'declared-test-asset',
    amount: '1', payTo: 'declared-test-payee', maxTimeoutSeconds: 30,
    extra: { poc: true, settlement: 'account-block', paymentFlow: 'upfront',
      zenonChain: { version: 1, chainIdentifier: '42', genesisMomentumHash: '1'.repeat(64) } } };
  const required = { x402Version: 2, resource: { url: FUNDING }, accepts: [requirement] };
  const payload = { x402Version: 2, resource: { url: FUNDING }, accepted: requirement,
    payload: { transaction: { hash: PAYMENT_HASH }, intentDigest: '2'.repeat(64) } };
  const declared = { challenge: { status: 'PAYMENT_REQUIRED', resourceUrl: FUNDING,
    paymentRequiredHeader: S.G.wire.encodeB64Json(required, { maxEncodedBytes: 8192 }),
    paymentRequired: required },
    paymentSignatureHeader: S.G.wire.encodeB64Json(payload, { maxEncodedBytes: 8192 }) };
  S.declaredPair = S.G.funding.captureZenonFundingPostV1PayerRecoveryPair(declared, FUNDING);
  S.creatingFunding = true; S.fundingCreates += 1;
  try {
    S.funding = S.G.funding.createZenonFundingPayerRecoveryDispatchIntentSqliteStoreV3({
      databasePath: S.fundingPath, allowedRoot: S.directory, resourceUrl: FUNDING, custodyPolicy: POLICY,
    });
    S.fundingKnown = true; S.creatingFunding = false;
  } catch (error) { hold(S, 'FUNDING_STORE_CONSTRUCTION_UNKNOWN'); throw error; }
  files(S);
  const prepared = S.funding.prepare(declared);
  same([prepared.revision, prepared.status, prepared.ambiguityLatched], [1, 'PREPARED', false]);
  const fenced = S.funding.fenceAttempt('PREPARED');
  same([fenced.revision, fenced.status, fenced.ambiguityLatched], [2, 'ATTEMPT_FENCED', false]);
  const bound = S.funding.finishAttempt('BOUND');
  same([bound.revision, bound.status, bound.ambiguityLatched], [3, 'BOUND', false]);
  equal(bound.challengeHeader, S.declaredPair.challengeHeader);
  equal(bound.paymentHeader, S.declaredPair.paymentHeader); same(bound.paymentPayload, S.declaredPair.paymentPayload);
  S.fundingSeed = bound; S.fundingProjection = freeze({ revision: 3, status: 'BOUND',
    ambiguityLatched: false, fundingResourceUrl: FUNDING, paymentHash: PAYMENT_HASH, network: 'zenon:testnet' });
  S.key = freeze({ grantId: S.A.grantId, requestId: S.A.request.requestId });
  same(S.funding.listOriginalRequestKeys(), []);
  equal(S.funding.getOriginalRequest(S.key), null); equal(S.funding.getOriginalDispatchIntent(S.key), null);
  const c = S.G.custody;
  S.expectedOriginal = c.captureOriginalServiceRequestCustody({
    originalRequestJson: S.original.requestJson, originalBodyBase64: '', serviceResourceUrl: SERVICE,
  }, { fundingResourceUrl: FUNDING, paymentHash: PAYMENT_HASH, network: 'zenon:testnet' });
  S.originalEnvelope = c.serializeOriginalServiceRequestCustody(S.expectedOriginal);
  const digest = (domain, text) => 'sha256:' + createHash('sha256').update(domain).update('\0')
    .update(text, 'utf8').digest('hex');
  S.expectedIntent = c.captureOriginalServiceDispatchIntent(S.expectedOriginal, {
    fundingRevision: 3,
    challengeDigest: digest('zenon-x402:payer-recovery-challenge-v1', bound.challengeHeader),
    paymentDigest: digest('zenon-x402:payer-recovery-payment-v1', bound.paymentHeader), custodyPolicy: POLICY,
  });
  S.intentEnvelope = c.serializeOriginalServiceDispatchIntent(S.expectedIntent);
}
function persistedPair(S) {
  try {
    // These are the original fixture handle's actual public reads, never wrappers.
    const funding = S.funding.load(), original = S.funding.getOriginalRequest(S.key);
    const intent = S.funding.getOriginalDispatchIntent(S.key), c = S.G.custody;
    same(funding, S.fundingSeed); same(S.funding.listOriginalRequestKeys(), [S.key]);
    equal(c.serializeOriginalServiceRequestCustody(original), S.originalEnvelope);
    equal(c.serializeOriginalServiceDispatchIntent(intent), S.intentEnvelope);
    same(original, S.expectedOriginal); same(intent, S.expectedIntent);
    equal(original.originalRequestJson, S.original.requestJson); equal(original.originalBodyBase64, '');
    equal(intent.originalChecksum, original.checksum);
    equal(intent.originalEnvelopeDigest, 'sha256:' + sha(S.originalEnvelope));
    equal(intent.fundingRevision, funding.revision); equal(intent.paymentHash, PAYMENT_HASH);
    equal(intent.network, funding.requirement.network); equal(intent.fundingResourceUrl, funding.resourceUrl);
    for (const forbidden of ['authorizationHeader', 'Authorization', 'proof', 'signature', 'headers']) {
      equal(Object.hasOwn(original, forbidden), false); equal(Object.hasOwn(intent, forbidden), false);
    }
    equal(S.originalEnvelope.includes(S.original.authorization), false);
    equal(S.intentEnvelope.includes(S.original.authorization), false);
    originalUnchanged(S); return { funding, original, intent };
  } catch (error) { hold(S, 'BORROWED_FUNDING_STATE_UNKNOWN'); throw error; }
}

function response() {
  return {
    destroyed: false, writableEnded: false, statusCode: 0, ends: 0, writes: 0,
    headers: Object.create(null), body: null,
    setHeader(name, value) {
      equal(typeof name, 'string'); ok(name.length <= 64); const text = String(value); ok(text.length <= 256);
      this.writes += 1; ok(this.writes <= 5);
      const key = name.toLowerCase(); equal(Object.hasOwn(this.headers, key), false); this.headers[key] = text;
    },
    end(bytes) {
      equal(this.ends, 0); this.body = Buffer.from(bytes); ok(this.body.length <= 256);
      this.ends += 1; this.writableEnded = true;
    },
    destroy() { this.destroyed = true; },
  };
}
function responseEquals(exchange, status, bytes) {
  const reply = exchange.reply;
  equal(reply.destroyed, false); equal(reply.writableEnded, true);
  equal(reply.statusCode, status); equal(reply.ends, 1); same(reply.body, bytes);
  same({ ...reply.headers }, {
    'cache-control': 'private, no-store, max-age=0', 'content-type': JSON_TYPE,
    vary: 'Authorization', 'x-content-type-options': 'nosniff', 'content-length': String(bytes.length),
  });
  equal(reply.writes, 5);
}

function eventHandle(S, allowed) {
  const listeners = new Map(); let closed = false;
  const target = {
    on(event, listener) {
      ok(allowed.includes(event)); equal(typeof listener, 'function');
      equal(listeners.has(event), false); listeners.set(event, listener); return this;
    },
    destroy() {
      S.bridgeDestroys += 1; hold(S, 'DECLARED_INTERFACE_DESTROY_HOLD');
      if (!closed) {
        closed = true; const listener = listeners.get('close');
        if (typeof listener === 'function') APPLY(listener, target, []);
      }
      return this; // Declared interface close only; never native cleanup evidence.
    },
  };
  return { target, emit(event, ...args) {
    const listener = listeners.get(event); equal(typeof listener, 'function');
    if (event === 'close') closed = true;
    APPLY(listener, target, args);
  } };
}
function bridgeImpl(S) {
  return function requestImpl(resourceUrl, options, onResponse) {
    S.requestCalls += 1;
    try {
      equal(S.hold, 'NONE'); ok(S.bridges.length < 4);
      equal(resourceUrl, SERVICE); ok(Object.isFrozen(options)); ok(Object.isFrozen(options.headers));
      same(options, { method: 'POST', headers: { Authorization: S.original.authorization }, agent: false,
        rejectUnauthorized: true, maxHeaderSize: 16384, insecureHTTPParser: false });
      equal(typeof onResponse, 'function');
      persistedPair(S); // BEFORE backend.handle or application execute.
      const owner = S.client.snapshot().owner;
      equal(owner.active, true); equal(owner.phase, 'DISPATCH_PENDING');
      if (S.requestCalls === 1) {
        same(owner.counts, { loadReads: 4, recordReads: 3, retainCalls: 1,
          readbackConfirmations: 1, dispatchCalls: 1, callbackCompletions: 0,
          intentWrites: 1, intentReads: 1, intentReadbackConfirmations: 1 });
        equal(S.executeCalls, 0);
      } else {
        // Extra bridges still get known work/events; exact-one fails afterward.
        S.unexpectedBridgeCalls += 1;
      }
      S.preDispatchFence = true;
      const request = eventHandle(S, ['close', 'error']);
      const entry = { request, onResponse, options, resourceUrl, started: false,
        backend: null, reply: null, delivered: false };
      request.target.end = function end(...args) {
        S.endCalls += 1;
        try {
          equal(args.length, 0);
          if (entry.started) return undefined; // Extra end settles with original work; count later fails.
          entry.started = true;
          const url = new URL(resourceUrl);
          equal(url.search, ''); equal(url.hash, '');
          entry.envelope = freeze({ url: url.pathname, method: options.method,
            rawHeaders: freeze(['Authorization', options.headers.Authorization, 'Content-Length', '0']) });
          entry.reply = response(); S.backendCalls += 1;
          let original;
          try { original = S.session.handle(entry.envelope, entry.reply); }
          catch (error) { hold(S, 'BACKEND_HANDLE_LAUNCH_UNKNOWN'); throw error; }
          entry.backend = observe(S, original, 'BACKEND_HANDLE_ORIGINAL');
          return undefined;
        } catch (error) {
          S.bridgeErrors += 1; hold(S, 'BRIDGE_END_ASSERTION_OR_LAUNCH_HOLD');
          throw redacted('BRIDGE_END_ASSERTION_OR_LAUNCH_HOLD');
        }
      };
      S.bridges.push(entry); return request.target;
    } catch (error) {
      S.bridgeErrors += 1; hold(S, 'BRIDGE_ENTRY_ASSERTION_HOLD');
      throw redacted('BRIDGE_ENTRY_ASSERTION_HOLD');
    }
  };
}
function deliver(S, entry) {
  try {
    equal(entry.delivered, false); equal(entry.backend.settled, true);
    equal(entry.backend.ok, true); equal(entry.backend.value, undefined);
    const expected = Buffer.from(JSON.stringify({ ok: true, resultCode: RESULT }));
    responseEquals({ reply: entry.reply }, 200, expected);
    const responseEvent = eventHandle(S, ['close', 'error', 'aborted', 'data', 'end']);
    const target = responseEvent.target;
    target.statusCode = entry.reply.statusCode;
    target.rawHeaders = Object.entries(entry.reply.headers).flatMap(([name, value]) => [name, value]);
    target.complete = false;
    entry.onResponse(target); responseEvent.emit('data', Buffer.from(entry.reply.body));
    target.complete = true; responseEvent.emit('end'); responseEvent.emit('close');
    entry.request.emit('close'); entry.delivered = true;
  } catch (error) {
    S.bridgeErrors += 1; hold(S, 'BRIDGE_RESPONSE_ASSERTION_HOLD');
    throw redacted('BRIDGE_RESPONSE_ASSERTION_HOLD');
  }
}

async function knownPromise(S, launch, label) {
  let original;
  try { original = launch(); }
  catch (error) { hold(S, label + '_LAUNCH_UNKNOWN'); throw error; }
  const record = observe(S, original, label);
  await settled(S, () => record.settled);
  if (!record.ok || record.value !== undefined) {
    hold(S, label + '_NOT_KNOWN_SUCCESS'); throw redacted(label + '_NOT_KNOWN_SUCCESS');
  }
  return record;
}
async function closeClientAndFunding(S) {
  try {
    if (S.clientKnown && !S.clientCloseReturned) {
      equal(S.clientCloseCalls, 0); S.clientCloseCalls += 1; S.stage = 'CLOSE_BORROWED_CLIENT';
      await knownPromise(S, () => S.client.close(), 'CLIENT_CLOSE_ORIGINAL');
      const view = S.client.snapshot();
      equal(view.owner.closed, true); equal(view.owner.active, false);
      equal(view.owner.closeOutcome, 'DRAINED');
      same(view.owner.uncertainty, { custody: false, submission: false, undrained: false,
        declaredFundingAmbiguitySeen: false });
      equal(view.lastTransport?.unknown ?? false, false);
      equal(view.lastTransport?.undrained ?? false, false);
      equal(view.lastTransport?.timerArmed ?? false, false);
      S.clientCloseReturned = true;
    }
    if (S.fundingKnown && !S.fundingCloseReturned) {
      S.stage = 'BORROWED_FUNDING_READ_AND_FIXTURE_CLOSE';
      try { if (S.preDispatchFence) persistedPair(S); else same(S.funding.load(), S.fundingSeed); files(S); }
      catch (error) { hold(S, 'BORROWED_FUNDING_STATE_UNKNOWN'); throw error; }
      S.borrowedFundingReadable = true;
      equal(S.fundingCloseCalls, 0); S.fundingCloseCalls += 1;
      try { equal(S.funding.close(), undefined); S.fundingCloseReturned = true; }
      catch (error) { hold(S, 'FUNDING_STORE_CLOSE_UNKNOWN'); throw error; }
      files(S); // Positively observe journal absence before any reader acquisition.
    }
  } catch (error) { hold(S, 'CLIENT_OR_FUNDING_CLOSE_OBSERVATION_UNKNOWN'); throw error; }
}
async function closeReader(S) {
  try {
    if (!S.readerKnown || S.readerCloseReturned) return;
    S.stage = 'CLOSE_OWNED_RECOVERY_READER'; equal(S.readerCloseCalls, 0); S.readerCloseCalls += 1;
    await knownPromise(S, () => S.reader.close(), 'READER_CLOSE_ORIGINAL');
    const v = S.reader.snapshot();
    equal(v.close.outcome, 'DRAINED'); equal(v.close.childOutcome, 'FULFILLED');
    equal(v.close.childUncertainty, false); equal(v.close.unknownUndrained, false);
    equal(v.resource.phase, 'RELEASED'); equal(v.resource.slotHeld, false);
    equal(v.resource.admissionClosed, true); equal(v.resource.storeCloseAttempts, 1);
    equal(v.resource.storeCloseOutcome, 'RETURNED');
    equal(v.runner.closeCalls, 1); equal(v.runner.closeOutcome, 'FULFILLED');
    equal(v.unknown, false); equal(v.unknownUndrained, false); S.readerCloseReturned = true;
    files(S); // A known reader close is followed by the same strict absence check.
  } catch (error) { hold(S, 'READER_CLOSE_OBSERVATION_UNKNOWN'); throw error; }
}
async function readerHandoff(S) {
  try {
    await closeClientAndFunding(S);
    equal(S.clientCloseReturned, true); equal(S.fundingCloseReturned, true);
    S.stage = 'OPEN_EXISTING_OWNED_RECOVERY_READER'; S.creatingReader = true; S.readerOpenCalls += 1;
    let original;
    try {
      original = S.G.reader.openServiceCreditCustodiedSqliteRecoveryReaderV3({
        databasePath: S.fundingPath, allowedRoot: S.directory, fundingResourceUrl: FUNDING,
        custodyPolicy: POLICY, selectedGrantId: S.key.grantId, deadlineMs: 5000,
      });
    } catch (error) { hold(S, 'READER_ACQUISITION_LAUNCH_UNKNOWN'); throw error; }
    const opened = observe(S, original, 'READER_OPEN_ORIGINAL');
    await settled(S, () => opened.settled);
    if (!opened.ok) { hold(S, 'READER_ACQUISITION_UNKNOWN'); throw redacted('READER_ACQUISITION_UNKNOWN'); }
    S.reader = opened.value; S.readerKnown = true; S.creatingReader = false;
    ok(Object.isFrozen(S.reader));
    same(Object.keys(S.reader).sort(), ['readOriginal', 'readOriginalRecoveryState', 'readOriginalRecoveryKeys',
      'createOriginalRecoveryPlan', 'createOriginalRecoveryStatePlan', 'createOriginalRecoveryCollection',
      'createOriginalRecoveryObservationCollection', 'close', 'snapshot'].sort());
    equal(Object.hasOwn(S.reader, 'runOriginals'), false); equal(Object.hasOwn(S.reader, 'requestImpl'), false);
    const catalog = S.reader.readOriginalRecoveryKeys();
    same(catalog.keys, [S.key]); equal(catalog.grantId, S.key.grantId);
    same(catalog.funding, S.fundingProjection); equal(catalog.authority, 'NONE');
    for (const field of ['mayStartPayment', 'maySignPayment', 'mayDispatchService', 'deliveryConfirmed']) {
      equal(catalog[field], false);
    }
    const recovered = S.reader.readOriginal(S.key), state = S.reader.readOriginalRecoveryState(S.key);
    const c = S.G.custody;
    equal(c.serializeOriginalServiceRequestCustody(recovered), S.originalEnvelope);
    equal(c.serializeOriginalServiceRequestCustody(state.original), S.originalEnvelope);
    equal(c.serializeOriginalServiceDispatchIntent(state.dispatchIntent), S.intentEnvelope);
    same(state.funding, S.fundingProjection); equal(state.dispatchStatus, 'POSSIBLY_ATTEMPTED');
    equal(state.authority, 'NONE'); equal(state.serviceOutcome, 'NOT_ESTABLISHED');
    equal(state.qualification, 'UNQUALIFIED'); equal(state.evidence, 'LOCAL_STORE_DECLARED_RECOVERY_STATE');
    same(state.uncertainty, { custody: false, submission: false, undrained: false,
      declaredFundingAmbiguitySeen: false });
    const v = S.reader.snapshot(), owner = v.runner.client.owner;
    equal(v.runner.runClaimed, false); equal(v.runner.attempted, 0); equal(v.runner.completed, 0);
    equal(v.runner.client.lastTransport, null); equal(owner.active, false); equal(owner.trackedRequests, 0);
    for (const field of ['retainCalls', 'dispatchCalls', 'callbackCompletions', 'intentWrites',
      'readbackConfirmations', 'intentReadbackConfirmations']) equal(owner.counts[field], 0);
    equal(v.unknown, false); equal(v.unknownUndrained, false);
    equal(S.requestCalls, 1); equal(S.backendCalls, 1); equal(S.executeCalls, 1);
    // Semantic metadata comparison only: owned acquisition may advance owner_epoch.
    files(S); originalUnchanged(S); S.readerRetainedPair = true;
    await closeReader(S);
  } catch (error) { hold(S, 'READER_HANDOFF_OBSERVATION_UNKNOWN'); throw error; }
}

async function closeKnownOwners(S) {
  if (S.hold !== 'NONE' || S.creatingStore || S.creatingSession || S.creatingFunding
      || S.creatingClient || S.creatingReader) {
    if (S.hold === 'NONE') hold(S, 'CONSTRUCTION_UNKNOWN_HOLD'); return;
  }
  await settled(S, () => S.promises.every(record => record.observed && record.settled));
  try { await closeClientAndFunding(S); await closeReader(S); }
  catch (error) { hold(S, 'FUNDING_HANDOFF_CLOSE_UNKNOWN'); throw error; }
  if (S.sessionKnown) {
    S.stage = 'CLOSE_ORIGINAL_BACKEND_SESSION';
    equal(S.sessionCloseCalls, 0); S.sessionCloseCalls += 1;
    await knownPromise(S, () => S.session.close(), 'SESSION_CLOSE_ORIGINAL');
    S.sessionCloseReturned = true;
  }
  // Unconditional, including body assertion failure, BEFORE borrowed backend reads/close.
  if (S.handles.size !== 0 || S.schedules !== S.cancels) {
    hold(S, 'DECLARED_TIMER_CLEANUP_UNKNOWN'); throw redacted('DECLARED_TIMER_CLEANUP_UNKNOWN');
  }
  if (S.storeKnown) {
    if (S.after !== null) {
      S.stage = 'BORROWED_BACKEND_STILL_READABLE';
      try { same(snapshot(S), S.after); files(S); S.borrowedBackendReadable = true; }
      catch (error) { hold(S, 'BORROWED_BACKEND_STATE_UNKNOWN'); throw error; }
    }
    S.stage = 'CLOSE_FIXTURE_BACKEND_STORE'; equal(S.storeCloseCalls, 0); S.storeCloseCalls += 1;
    try { equal(S.store.close(), undefined); S.storeCloseReturned = true; }
    catch (error) { hold(S, 'BACKEND_STORE_CLOSE_UNKNOWN'); throw error; }
  }
  S.stage = 'KNOWN_OWNERS_CLOSED';
}

export function createRoundtripState(context) {
  Object.freeze(POLICY);
  const S = {
      stage: 'NOT_STARTED', failureStage: 'NONE', hold: 'NONE', errors: [], uid: null, root: null,
      directory: null, path: null, fundingPath: null, databasePins: {}, sourceGuards: 0,
      journalEpoch: 'NONE', journalPin: null,
      selfBytes: 0, selfDigest: null, G: null, store: null, storeKnown: false,
      creatingStore: false, storeCreates: 0, storeCloseCalls: 0, storeCloseReturned: false,
      funding: null, fundingKnown: false, creatingFunding: false, fundingCreates: 0,
      fundingCloseCalls: 0, fundingCloseReturned: false, borrowedFundingReadable: false,
      session: null, sessionKnown: false, creatingSession: false, sessionCreates: 0,
      sessionCloseCalls: 0, sessionCloseReturned: false, borrowedBackendReadable: false,
      client: null, clientKnown: false, creatingClient: false, clientCreates: 0,
      clientCloseCalls: 0, clientCloseReturned: false,
      reader: null, readerKnown: false, creatingReader: false, readerOpenCalls: 0,
      readerCloseCalls: 0, readerCloseReturned: false, readerRetainedPair: false,
      A: null, keyAttempts: 0, keyPairs: 0, signAttempts: 0, signatures: 0, original: null,
      verificationControls: 0, proofValid: false, beforeSession: null, baseline: null, after: null,
      promises: [], executeIdentities: [], executeCalls: 0, handles: new Set(), schedules: 0, cancels: 0,
      bridges: [], requestCalls: 0, endCalls: 0, backendCalls: 0, bridgeDestroys: 0, bridgeErrors: 0,
      preDispatchFence: false, backendSucceeded: false, clientSucceeded: false, duplicateFenced: false,
      bodyComplete: false, unexpectedBridgeCalls: 0,
    };
  for (const key of ['uid', 'root', 'rootPin', 'G', 'sourceGuards', 'selfBytes', 'selfDigest']) {
    S[key] = context[key];
  }
  equal(S.sourceGuards, 25); equal(context.graphVerified, true);
  return S;
}

// No fixture phase runs at import. Only this one entry test calls these phases.
export function roundtripOperations() {
  return Object.freeze({
    unit, seed, signedOriginal, seedFunding, createSession, bridgeImpl,
    observe, settled, deliver, persistedPair, readerHandoff, closeKnownOwners,
    snapshot, grant, credit,
  });
}

// Public declared metadata for this single test; no secrets, handles or authority.
export function getRoundtripDeclaredConfiguration() {
  return Object.freeze({
    fundingResourceUrl: FUNDING,
    custodyPolicy: Object.freeze(POLICY),
  });
}
