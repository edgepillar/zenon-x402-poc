import test from 'node:test';
import { equal, deepStrictEqual as same, notEqual, ok } from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync,
  readSync, readdirSync, realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';

/* SOURCE DRAFT / NOT_RUN. One actual scoped session and new private mock DB.
 * Max one capability pair and two signatures; requests differ only in maxCostUnits.
 * Three sequential handle calls: original success, valid conflict, original cache.
 * No private-key export/logging, payment signing, server, direct-owner oracle,
 * prototype patch, operational retry, repair, deletion or forced close.
 * Declared responses/timers are not delivery, deadline or native-cleanup proof.
 */
const SELF = 'qualification/service-credit-scoped-session-valid-request-conflict.draft.mjs';
const SPECS = [{"path":"src/service-credit-durable-http-session.js","bytes":13978,"LF":425,"sha256":"a0d6d1436cdb697f125fee2f4dc723a5ddcfd2ee7063b55d56fa006bb8ba69bf","gitBlob":"307b72b8a1d114463ad8e18935312b18ccb23199"},{"path":"src/service-credit-durable-session-close.js","bytes":2470,"LF":84,"sha256":"5aae36a7da39ce5b7b9a8da8e9fbda88465cb1e4853dc791520a1df0ab87ede7","gitBlob":"f744b55595e2238dc088cf71ca8849e480cda1bc"},{"path":"src/service-credit-durable-execution-owner.js","bytes":40833,"LF":1301,"sha256":"a63a795dda77489f7da0682d83a0683cf07240f83b803f449668cb687a956863","gitBlob":"f0fd445a17466dd1ab83c785c44aa5e6fdf1e765"},{"path":"src/service-credit-http.js","bytes":32432,"LF":958,"sha256":"c76a7f1864bdfcd0c26916bf28fba615c8aecf899d53e69467e3ebe7d3353d0d","gitBlob":"040da1547c2fa6cc4a4044c47619b253f16d19a1"},{"path":"src/service-credit-sqlite-store.js","bytes":82141,"LF":2333,"sha256":"bda45bd553c8580a7bd66573bb2fb7c3bf12d79bab49a91fe3ac6dc1ebad8422","gitBlob":"6a7364fbc59c43edffb7a73f550210644e78daff"},{"path":"src/service-credit-model.js","bytes":55461,"LF":1580,"sha256":"7ff7e3d88ab8c3b38a0073541533fbdb7a0d9f2be42f337ac35f6a3b05615c3a","gitBlob":"e6ac17254874584d1a01f70e7abc6f771bd35d73"},{"path":"src/service-credit-execution-contract.js","bytes":30258,"LF":956,"sha256":"298f8e74885e1c507953c0fcf7874832f815296746e6bacbdac97a425f1a6c73","gitBlob":"acfbb5c5e943b9e09958a7831b3dbe159463dcf9"},{"path":"src/service-credit-capability.js","bytes":8284,"LF":256,"sha256":"cb2b96d9a2e56c132dd1b4aca8f1c065b244ecd0e7e92f41ea3f4a8c969d17c3","gitBlob":"2e19d42c1b9311a75897c84669849f56ae40f785"},{"path":"package.json","bytes":1413,"LF":40,"sha256":"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5","gitBlob":"ec7193f6fd76f34778515079dc777594175c4c34"}];
const NOW = 2_000_000_000_000;
const JSON_TYPE = 'application/json';
const RESULT_CODE = 'service.scoped.session';
const SUCCESS = Buffer.from('{"ok":true,"resultCode":"service.scoped.session"}');
const CONFLICT = Buffer.from('{"error":"request_unavailable"}');
const EMPTY_BODY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const THEN = Promise.prototype.then;
const APPLY = Reflect.apply;
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
function guardedSource(path, expected, cap, uid) {
  directories(dirname(path)); equal(realpathSync(path), path);
  const before = lstatSync(path, { bigint: true });
  ok(before.isFile()); equal(before.isSymbolicLink(), false);
  equal(before.uid, uid); equal(before.nlink, 1n);
  equal(before.mode & 0o7777n, 0o644n);
  ok(before.size > 0n && before.size <= BigInt(cap));
  same(stamp(before).map(String), expected);
  ok(Number.isInteger(constants.O_NOFOLLOW) && constants.O_NOFOLLOW !== 0);
  let fd = null;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    same(stamp(fstatSync(fd, { bigint: true })).map(String), expected);
    const storage = Buffer.alloc(Number(before.size) + 1);
    let length = 0, eof = false;
    while (length < storage.length) {
      const count = readSync(fd, storage, length, storage.length - length, null);
      if (count === 0) { eof = true; break; }
      length += count;
    }
    equal(eof, true); equal(length, Number(before.size));
    same(stamp(fstatSync(fd, { bigint: true })).map(String), expected);
    same(stamp(lstatSync(path, { bigint: true })).map(String), expected);
    directories(dirname(path)); equal(realpathSync(path), path);
    const raw = storage.subarray(0, length);
    for (const value of raw) ok(value <= 0x7f);
    return raw;
  } finally {
    // Any unknown source-FD close aborts before application acquisition.
    if (fd !== null) closeSync(fd);
  }
}
function environment(S) {
  equal(process.versions.node, '24.19.0');
  equal(process.platform, 'darwin'); equal(process.arch, 'arm64');
  equal(process.argv.length, 2); equal(process.argv[1], fileURLToPath(import.meta.url));
  equal(process.execArgv.length, 4);
  same(process.execArgv.slice(0, 3), [
    '--no-addons', '--disallow-code-generation-from-strings', '-e',
  ]);
  equal(typeof process.getuid, 'function'); S.uid = BigInt(process.getuid());
  same(Object.keys(process.env).sort(), [
    'PATH', 'LC_ALL', 'SPV_TASK_SCRATCH', 'SPV_SQLITE_FIXTURE_ROOT',
    'TMPDIR', 'SQLITE_TMPDIR', 'NODE_TEST_WORKER_ID',
    '__CF_USER_TEXT_ENCODING', 'SPV_SQLITE_SOURCE_BINDINGS_JSON',
  ].sort());
  equal(process.env.PATH, '/usr/bin:/bin'); equal(process.env.LC_ALL, 'C');
  equal(process.env.NODE_TEST_WORKER_ID, '1');
  equal(process.env.__CF_USER_TEXT_ENCODING,
    '0x' + Number(S.uid).toString(16).toUpperCase() + ':0:0');
  const scratch = process.env.SPV_TASK_SCRATCH;
  const scratchStat = privateDirectory(scratch, S.uid);
  S.root = process.env.SPV_SQLITE_FIXTURE_ROOT; equal(dirname(S.root), scratch);
  equal(process.env.TMPDIR, S.root); equal(process.env.SQLITE_TMPDIR, S.root);
  S.rootPin = privateDirectory(S.root, S.uid, scratchStat.dev);
  same(readdirSync(S.root), []);
}
async function graph(S) {
  S.stage = 'EXACT_SOURCE_GUARDS';
  const selfPath = fileURLToPath(import.meta.url), repository = dirname(dirname(selfPath));
  directories(repository); equal(selfPath, join(repository, SELF));
  const encoded = process.env.SPV_SQLITE_SOURCE_BINDINGS_JSON;
  ok(typeof encoded === 'string' && encoded.length > 0 && encoded.length <= 16384);
  const bindings = JSON.parse(encoded);
  equal(Object.getPrototypeOf(bindings), Object.prototype);
  same(Object.keys(bindings).sort(), [...SPECS.map(pin => pin.path), SELF].sort());
  for (const path of Object.keys(bindings)) {
    const record = bindings[path]; ok(Array.isArray(record)); equal(record.length, 8);
    for (const value of record) ok(typeof value === 'string' && /^[0-9]+$/.test(value));
  }
  for (const pin of SPECS) {
    const cap = pin.path === 'src/service-credit-sqlite-store.js' ? 100000 : 65536;
    const raw = guardedSource(join(repository, pin.path), bindings[pin.path], cap, S.uid);
    equal(raw.length, pin.bytes); equal(raw.toString('ascii').split('\n').length - 1, pin.LF);
    equal(sha(raw), pin.sha256);
    equal(createHash('sha1').update('blob ' + raw.length + '\0').update(raw).digest('hex'), pin.gitBlob);
    if (pin.path === 'package.json') equal(JSON.parse(raw.toString('ascii')).type, 'module');
    S.sourceGuards += 1;
  }
  const self = guardedSource(selfPath, bindings[SELF], 32768, S.uid);
  S.selfBytes = self.length; S.selfDigest = sha(self); S.sourceGuards += 1;
  equal(S.sourceGuards, 10);
  // Parent binds the complete expected self digest before the run API imports it.
  S.stage = 'CURRENT_ACTUAL_GRAPH_IMPORT';
  const load = path => import(new URL('../' + path, import.meta.url).href);
  const session = await load('src/service-credit-durable-http-session.js');
  const store = await load('src/service-credit-sqlite-store.js');
  const model = await load('src/service-credit-model.js');
  const capability = await load('src/service-credit-capability.js');
  const http = await load('src/service-credit-http.js');
  S.G = { session, store, model, capability, http };
}
function unit(S) {
  S.stage = 'NEW_PRIVATE_SYNTHETIC_UNIT';
  const root = privateDirectory(S.root, S.uid, S.rootPin.dev);
  same(stamp(root), stamp(S.rootPin)); same(readdirSync(S.root), []);
  S.directory = join(S.root, 'scoped-session-valid-request-conflict'); absent(S.directory);
  mkdirSync(S.directory, { mode: 0o700 });
  const stat = privateDirectory(S.directory, S.uid, root.dev);
  S.unitPin = [stat.dev, stat.ino]; S.path = join(S.directory, 'ledger.sqlite');
  same(readdirSync(S.directory), []); absent(S.path);
}
function files(S) {
  const unit = privateDirectory(S.directory, S.uid, S.rootPin.dev);
  same([unit.dev, unit.ino], S.unitPin);
  same(readdirSync(S.directory), ['ledger.sqlite']);
  const stat = lstatSync(S.path, { bigint: true });
  ok(stat.isFile()); equal(stat.isSymbolicLink(), false);
  equal(stat.uid, S.uid); equal(stat.dev, S.rootPin.dev);
  equal(stat.nlink, 1n); equal(stat.mode & 0o7777n, 0o600n);
  ok(stat.size > 0n && stat.size <= 2097152n); equal(realpathSync(S.path), S.path);
  if (S.databasePin === null) S.databasePin = [stat.dev, stat.ino];
  else same([stat.dev, stat.ino], S.databasePin);
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
  const ledger = S.store.load(), durable = S.store.getDurableExecutionSnapshot();
  const metadata = S.store.getMetadata();
  equal(ledger.schemaVersion, 1); equal(ledger.state.modelVersion, 1); equal(ledger.state.schemaVersion, 2);
  equal(durable.revision, ledger.revision); equal(metadata.revision, ledger.revision);
  equal(metadata.checksum, ledger.checksum);
  return { ledger, durable, metadata };
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
    // Always immediately settle, including if a wrong replay implementation executes twice.
    const original = Promise.resolve(freeze({ resultCode: RESULT_CODE }));
    observe(S, original, 'EXECUTE_ORIGINAL'); return original;
  }
  S.creatingSession = true; S.sessionCreates += 1;
  try {
    S.session = S.G.session.createDurableServiceCreditHttpSession({
      store: S.store, execute, deadlineRuntime: declaredRuntime(S),
      selectedDurationMs: 1000, admittedGrantId: S.A.grantId,
    });
    ok(Object.isFrozen(S.session)); equal(Object.getPrototypeOf(S.session), Object.prototype);
    same(Object.keys(S.session).sort(), ['close', 'handle']);
    equal(typeof S.session.handle, 'function'); equal(typeof S.session.close, 'function');
    ok(Object.isFrozen(S.session.handle)); ok(Object.isFrozen(S.session.close));
    S.sessionKnown = true; S.creatingSession = false;
  } catch (error) { hold(S, 'SESSION_CONSTRUCTION_UNKNOWN'); throw error; }
  S.baseline = snapshot(S); same(S.baseline, S.beforeSession);
  equal(S.baseline.ledger.state.offers.length, 1); equal(S.baseline.ledger.state.grants.length, 1);
  equal(S.baseline.ledger.state.requests.length, 0); equal(S.baseline.durable.executionState.executions.length, 0);
  credit(grant(S.baseline, S.A.grantId), [7, 7, 0, 0]);
  equal(S.executeCalls, 0); equal(S.schedules, 0); equal(S.cancels, 0);
}
function signedRequest(S, request) {
  ok(S.signAttempts < 2); S.signAttempts += 1;
  ok(Object.isFrozen(request));
  const signingBytes = S.G.capability.createServiceCreditCapabilitySigningBytes(request);
  const signature = sign(null, signingBytes, S.A.privateKey).toString('base64url');
  equal(signature.length, 86); S.signatures += 1;
  const proof = freeze({
    proofVersion: 1, grantId: request.grantId, requestId: request.requestId,
    publicKey: S.A.publicKey, maxCostUnits: request.maxCostUnits, signature,
  });
  const authorization = 'ServiceCredit ' + Buffer.from(canonical(proof)).toString('base64url');
  const headers = freeze(['Authorization', authorization, 'Content-Length', '0']);
  const envelope = freeze({ url: S.G.http.SERVICE_CREDIT_HTTP_PATH, method: 'POST', rawHeaders: headers });
  S.envelopesBuilt += 1;
  const authorizationBytes = Buffer.from(authorization, 'ascii');
  return freeze({
    request, proof, headers, envelope, authorizationBytes, signingBytes,
    requestText: canonical(request), proofText: canonical(proof),
    signingDigest: sha(signingBytes), authorizationDigest: sha(authorizationBytes),
  });
}
function exactEnvelope(item) {
  for (const value of [item, item.request, item.proof, item.envelope, item.headers]) ok(Object.isFrozen(value));
  equal(item.envelope.rawHeaders, item.headers);
  same(item.headers, ['Authorization', 'ServiceCredit ' + Buffer.from(item.proofText).toString('base64url'),
    'Content-Length', '0']);
  equal(canonical(item.request), item.requestText); equal(canonical(item.proof), item.proofText);
  same(Buffer.from(item.headers[1], 'ascii'), item.authorizationBytes);
  equal(sha(item.authorizationBytes), item.authorizationDigest); equal(sha(item.signingBytes), item.signingDigest);
}
function verifiedProof(S, item) {
  const stored = S.store.getGrant(S.A.grantId); ok(stored !== null);
  S.verificationControls += 1;
  const result = S.G.capability.verifyServiceCreditCapability({
    grant: { grantId: stored.grantId, capabilityCommitment: stored.capabilityCommitment },
    request: item.request, proof: item.proof,
  });
  same(result, { verified: true, proofVersion: 1, grantId: S.A.grantId,
    requestId: item.request.requestId, maxCostUnits: item.request.maxCostUnits });
  ok(Object.isFrozen(result)); equal(Object.getPrototypeOf(result), Object.prototype);
  exactEnvelope(item);
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
async function exchange(S, envelope, label) {
  equal(S.hold, 'NONE'); const reply = response();
  S.dispatches += 1;
  let original;
  try { original = S.session.handle(envelope, reply); }
  catch (error) { hold(S, 'SESSION_HANDLE_LAUNCH_UNKNOWN'); throw error; }
  const observed = observe(S, original, label);
  await settled(S, () => observed.settled);
  equal(observed.ok, true); equal(observed.value, undefined);
  return { reply, observed };
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
function completedOnce(S) {
  equal(S.executeCalls, 1); equal(S.executeIdentities.length, 1);
  const originals = S.promises.filter(record => record.label === 'EXECUTE_ORIGINAL');
  equal(originals.length, 1); equal(originals[0].observed, true); equal(originals[0].ok, true);
  same(originals[0].value, { resultCode: RESULT_CODE }); ok(Object.isFrozen(originals[0].value));
  equal(S.schedules, 1); equal(S.cancels, 1); equal(S.handles.size, 0);
  equal(S.sessionCloseCalls, 0); equal(S.sessionCloseReturned, false);
}
function requestSucceeded(S, request) {
  same([request.grantId, request.requestId, request.state, request.costUnits],
    [S.A.grantId, S.original.request.requestId, 'SUCCEEDED', 2]);
}
function firstSuccess(S) {
  completedOnce(S); S.afterFirst = snapshot(S);
  equal(S.afterFirst.ledger.revision, S.baseline.ledger.revision + 3);
  same(S.afterFirst.ledger.state.offers, S.baseline.ledger.state.offers);
  equal(S.afterFirst.ledger.state.grants.length, 1);
  same(grant(S.afterFirst, S.A.grantId), {
    ...grant(S.baseline, S.A.grantId), availableUnits: 5, heldUnits: 0, consumedUnits: 2,
  });
  credit(grant(S.afterFirst, S.A.grantId), [7, 5, 0, 2]);
  equal(S.afterFirst.ledger.state.requests.length, 1);
  S.storedRequest = S.store.getRequest({ grantId: S.A.grantId, requestId: S.original.request.requestId });
  requestSucceeded(S, S.storedRequest);
  same(S.storedRequest.cachedResult, { statusCode: 200, contentType: JSON_TYPE, resultCode: RESULT_CODE });
  requestSucceeded(S, S.afterFirst.ledger.state.requests[0]);
  const { executions: beforeItems, ...beforeRest } = S.baseline.durable.executionState;
  const { executions: afterItems, ...afterRest } = S.afterFirst.durable.executionState;
  same(afterRest, beforeRest); equal(beforeItems.length, 0); equal(afterItems.length, 1);
  equal(S.afterFirst.durable.executionState.capacity, 2);
  const execution = afterItems[0];
  equal(execution.request.grantId, S.A.grantId); equal(execution.request.requestId, S.original.request.requestId);
  equal(execution.request.costUnits, 2); equal(execution.fencePhase, 'MAY_HAVE_STARTED');
  equal(execution.terminalClassification, 'SUCCEEDED'); equal(execution.uncertaintyReason, null);
  ok(/^sha256:[0-9a-f]{64}$/.test(execution.resultCommitment));
  const identity = S.executeIdentities[0];
  ok(Object.isFrozen(identity)); same(Object.keys(identity).sort(), ['executionId', 'signal']);
  equal(identity.executionId, execution.executionId);
}
function unchangedAfterFirst(S) {
  completedOnce(S); equal(S.A.request, S.original.request); exactEnvelope(S.original);
  same(snapshot(S), S.afterFirst);
  same(S.store.getRequest({ grantId: S.A.grantId, requestId: S.original.request.requestId }), S.storedRequest);
  same(snapshot(S), S.afterFirst); files(S);
}
async function exercise(S) {
  environment(S); await graph(S); unit(S); seed(S); createSession(S);
  S.stage = 'ORIGINAL_VALID_PROOF';
  S.original = signedRequest(S, S.A.request);
  verifiedProof(S, S.original); same(snapshot(S), S.baseline); S.originalValid = true;
  S.stage = 'FIRST_ACTUAL_SESSION_SUCCESS';
  const first = await exchange(S, S.original.envelope, 'FIRST_HANDLE');
  responseEquals(first, 200, SUCCESS);
  await settled(S, () => S.promises.every(record => record.settled));
  firstSuccess(S); unchangedAfterFirst(S); S.firstSuccess = true;
  // A prior failure exits this body: no later signing or dispatch is attempted.
  S.stage = 'DISTINCT_SAME_ID_VALID_PROOF';
  const changedRequest = freeze({ ...S.original.request, maxCostUnits: 3 });
  S.changed = signedRequest(S, changedRequest);
  S.A.privateKey = null; // Reference release after two declared signatures, not erasure.
  notEqual(S.changed.request, S.original.request); notEqual(S.changed.proof, S.original.proof);
  notEqual(S.changed.envelope, S.original.envelope);
  same(S.changed.request, { ...S.original.request, maxCostUnits: 3 });
  same({ ...S.changed.proof, maxCostUnits: 2, signature: S.original.proof.signature }, S.original.proof);
  notEqual(S.changed.proof.signature, S.original.proof.signature);
  equal(S.original.request.maxCostUnits, 2); equal(S.changed.request.maxCostUnits, 3);
  ok(S.changed.request.maxCostUnits >= 2);
  ok(grant(S.afterFirst, S.A.grantId).availableUnits >= S.changed.request.maxCostUnits);
  verifiedProof(S, S.changed); exactEnvelope(S.original); unchangedAfterFirst(S); S.changedValid = true;
  S.stage = 'ACTUAL_SESSION_VALID_REQUEST_CONFLICT';
  const conflict = await exchange(S, S.changed.envelope, 'CONFLICT_HANDLE');
  responseEquals(conflict, 409, CONFLICT);
  await settled(S, () => S.promises.every(record => record.settled));
  unchangedAfterFirst(S); exactEnvelope(S.changed); S.conflict409 = true;
  // A conflict assertion failure prevents the final original replay.
  S.stage = 'ORIGINAL_EXACT_ENVELOPE_STILL_ACCEPTED';
  const replay = await exchange(S, S.original.envelope, 'ORIGINAL_REPLAY_HANDLE');
  responseEquals(replay, 200, SUCCESS);
  same(replay.reply.body, first.reply.body); same({ ...replay.reply.headers }, { ...first.reply.headers });
  await settled(S, () => S.promises.every(record => record.settled));
  unchangedAfterFirst(S); exactEnvelope(S.changed);
  equal(S.keyAttempts, 1); equal(S.keyPairs, 1);
  equal(S.signAttempts, 2); equal(S.signatures, 2); equal(S.envelopesBuilt, 2);
  equal(S.dispatches, 3); equal(S.verificationControls, 2);
  S.originalPreserved = true; S.conflictUnchanged = true; S.replay200 = true;
  S.after = S.afterFirst; S.bodyComplete = true; S.stage = 'BODY_ASSERTIONS_COMPLETE';
}
async function closeKnownOwners(S) {
  if (S.hold !== 'NONE' || S.creatingStore || S.creatingSession) {
    if (S.hold === 'NONE') hold(S, 'CONSTRUCTION_UNKNOWN_HOLD');
    return;
  }
  if (S.sessionKnown) {
    S.stage = 'DRAIN_KNOWN_ORIGINAL_WORK';
    await settled(S, () => S.promises.every(record => record.observed && record.settled));
    S.stage = 'CLOSE_ORIGINAL_SESSION';
    equal(S.sessionCloseCalls, 0); S.sessionCloseCalls += 1;
    let original;
    try { original = S.session.close(); }
    catch (error) { hold(S, 'SESSION_CLOSE_LAUNCH_UNKNOWN'); throw error; }
    S.sessionClose = observe(S, original, 'SESSION_CLOSE_ORIGINAL');
    await settled(S, () => S.sessionClose.settled);
    if (!S.sessionClose.ok || S.sessionClose.value !== undefined) {
      hold(S, 'SESSION_CLOSE_NOT_KNOWN_SUCCESS'); throw redacted('SESSION_CLOSE_NOT_KNOWN_SUCCESS');
    }
    S.sessionCloseReturned = true;
    if (S.handles.size !== 0 || S.schedules !== S.cancels) {
      hold(S, 'DECLARED_TIMER_CLEANUP_UNKNOWN');
      throw redacted('DECLARED_TIMER_CLEANUP_UNKNOWN');
    }
    if (S.bodyComplete) {
      S.stage = 'BORROWED_STORE_STILL_READABLE';
      try {
        const borrowed = snapshot(S); same(borrowed, S.after); files(S); S.borrowedReadable = true;
      } catch (error) { hold(S, 'BORROWED_STORE_STATE_UNKNOWN'); throw error; }
    }
  }
  if (S.storeKnown) {
    S.stage = 'CLOSE_FIXTURE_STORE'; equal(S.storeCloseCalls, 0); S.storeCloseCalls += 1;
    try { equal(S.store.close(), undefined); S.storeCloseReturned = true; }
    catch (error) { hold(S, 'FIXTURE_STORE_CLOSE_UNKNOWN'); throw error; }
  }
  S.stage = 'KNOWN_OWNERS_CLOSED';
}
test('P0-A actual scoped session rejects a valid same-ID changed request and preserves original cached success',
  { timeout: 12000, concurrency: false }, async t => {
    const S = {
      stage: 'NOT_STARTED', failureStage: 'NONE', hold: 'NONE', errors: [], uid: null, root: null, directory: null,
      path: null, databasePin: null, sourceGuards: 0, selfBytes: 0, selfDigest: null, G: null,
      store: null, storeKnown: false, creatingStore: false, storeCreates: 0,
      session: null, sessionKnown: false, creatingSession: false, sessionCreates: 0,
      A: null, keyAttempts: 0, keyPairs: 0, signAttempts: 0, signatures: 0,
      original: null, changed: null, storedRequest: null, envelopesBuilt: 0,
      beforeSession: null, baseline: null, afterFirst: null, after: null,
      promises: [], executeIdentities: [], executeCalls: 0, dispatches: 0, verificationControls: 0,
      handles: new Set(), schedules: 0, cancels: 0,
      originalValid: false, changedValid: false, firstSuccess: false, conflict409: false,
      conflictUnchanged: false, replay200: false, originalPreserved: false, bodyComplete: false,
      sessionClose: null, sessionCloseCalls: 0, sessionCloseReturned: false,
      borrowedReadable: false, storeCloseCalls: 0, storeCloseReturned: false,
    };
    try { await exercise(S); }
    catch (error) {
      S.failureStage = S.stage; S.errors.push(error);
      if (S.stage === 'EXACT_SOURCE_GUARDS') hold(S, 'SOURCE_GUARD_REFUSAL_HOLD');
    }
    if (S.A !== null) S.A.privateKey = null;
    try { await closeKnownOwners(S); }
    catch (error) {
      if (S.failureStage === 'NONE') S.failureStage = S.stage;
      S.errors.push(error);
    }
    const passed = S.errors.length === 0 && S.hold === 'NONE' && S.bodyComplete
      && S.sessionCloseReturned && S.borrowedReadable && S.storeCloseReturned;
    const fields = [
      'stage', 'failureStage', 'hold', 'sourceGuards', 'storeCreates', 'sessionCreates',
      'keyAttempts', 'keyPairs', 'signAttempts', 'signatures', 'envelopesBuilt', 'verificationControls',
      'originalValid', 'changedValid', 'firstSuccess', 'conflict409', 'conflictUnchanged',
      'replay200', 'originalPreserved', 'dispatches', 'executeCalls', 'schedules', 'cancels',
      'sessionCloseCalls', 'sessionCloseReturned', 'borrowedReadable', 'storeCloseCalls', 'storeCloseReturned',
    ];
    const report = Object.fromEntries(fields.map(key => [key, S[key]]));
    t.diagnostic(JSON.stringify({
      ...report, status: passed ? 'PASS' : 'FAIL', retainedErrors: S.errors.length,
      declaredHandles: S.handles.size, pendingOriginals: S.promises.filter(record => !record.settled).length,
      counters: 'FIXTURE_CONTROL_NOT_INDEPENDENT_NATIVE_INSTRUMENTATION',
      qualification: 'LOCAL_SYNTHETIC_ACTUAL_SESSION_VALID_REQUEST_CONFLICT_ONLY',
      authority: 'NONE', responseBoundary: 'DECLARED_RESPONSE_ONLY_NO_DELIVERY_PROOF',
      nativeCleanup: 'NOT_ESTABLISHED',
    }));
    if (!passed) throw redacted('ACTUAL_SCOPED_SESSION_VALID_REQUEST_CONFLICT_NOT_QUALIFIED');
  });
