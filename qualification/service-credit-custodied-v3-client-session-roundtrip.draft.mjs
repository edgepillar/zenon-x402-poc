import test from 'node:test';
import { equal, deepStrictEqual as same, ok } from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* SOURCE DRAFT / NOT_RUN. The only registered test in this pair.
 * Entire 25-file graph is guarded before importing fixture or application code.
 * One sequential same-process case, two fresh synthetic SQL databases.
 * Source body checks are prerequisite guards, not authenticated filesystem,
 * restart/crash/durability, actual HTTPS delivery or native cleanup proof.
 * External entry SHA and fresh full8 bindings are required BEFORE this import.
 */
const SELF = 'qualification/service-credit-custodied-v3-client-session-roundtrip.draft.mjs';
const FIXTURE = 'qualification/service-credit-custodied-v3-client-session-roundtrip-fixture.draft.mjs';
const THEN = Promise.prototype.then;
const APPLY = Reflect.apply;

const SPECS = [{"path":"src/service-credit-custodied-sqlite-http-client.js","bytes":18540,"LF":511,"sha256":"ea16d6ac5ce72d6434c06e98c52c324daf918dd570f15997cdc21e501f677f4e","gitBlob":"9572dfcca76b83b53bdd5bd132ffaf110720dc3a"},{"path":"src/service-credit-custodied-sqlite-sequential-runner.js","bytes":21467,"LF":510,"sha256":"9378a09dfd23c6ad5e093971d16c5aad62c19b5f3cce353bb199f037df64d7e0","gitBlob":"105b22e1463ab8302b141510e2bb991b746169ad"},{"path":"src/service-credit-custodied-recovery-observation-collection-core.js","bytes":8579,"LF":213,"sha256":"36b7cece2d436cbfcac5f4299dd6bd30e5eede6ebb2ebe769ae7bf3a6f1a72b4","gitBlob":"4dc8765be0aa4b0e927fface960e366a3a6ccd1e"},{"path":"src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js","bytes":57459,"LF":1536,"sha256":"9c925f241effbfec0bf014ff284e834c4d5679c4ea7224f83a6354cde6cffdaf","gitBlob":"260c2f43306b029ca694aa06b8c60d1be037c614"},{"path":"src/x402-wire.js","bytes":39886,"LF":934,"sha256":"5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56","gitBlob":"fb060d4e349b1c31a1219a0cc137af250a8a2291"},{"path":"src/service-credit-pilot-client-plan.js","bytes":7483,"LF":181,"sha256":"73ee3d739de85150039e733234cd0761c228d68de040d1e126902e808a259ac6","gitBlob":"14334c82b5b7c80fb8f7f6a392a1a0f3c3adcbf1"},{"path":"src/service-credit-pilot-status-view.js","bytes":3202,"LF":60,"sha256":"cf3822d8b9ec4eb4772452ed1888b96d398fd87c1ead44cd155a5acc1a6b66ed","gitBlob":"0890db504e44b704d0434dc309e711743570e652"},{"path":"src/service-credit-custodied-recovery-collection-core.js","bytes":13794,"LF":306,"sha256":"51d06da70ecccd0cf8b38d650367d1ae903ea86010a5ebeadb682af98e4b890b","gitBlob":"5275832eebbf87e0cd37f3c2e3b82147ab625a72"},{"path":"src/service-credit-http-execute-dispatch.js","bytes":27034,"LF":770,"sha256":"254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b","gitBlob":"280dd20dc669e2856d263eba62ccd0fe9af72f21"},{"path":"src/service-credit-original-request-custody-contract.js","bytes":14051,"LF":356,"sha256":"fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915","gitBlob":"f911d42d01b69e6577f9bcd66f4ed59aab8ab882"},{"path":"src/service-credit-custodied-request-owner.js","bytes":35073,"LF":938,"sha256":"6e7493a4859d48530820e68a4a19a513aad014ffc1048b42965a3ad36ae7c5f7","gitBlob":"2dee22fd780db9de662fe1243075e74cef0bf296"},{"path":"src/service-credit-custodied-http-client.js","bytes":10755,"LF":292,"sha256":"ddbc54faf4a14d95e6274bc9df27b7b49db251bab67c11b871cfb2f9e78b4f15","gitBlob":"90fd4c8a2cc8fb552f8eb0cb45607bfa44c61108"},{"path":"src/service-credit-custodied-sequential-runner-core.js","bytes":15288,"LF":479,"sha256":"36c99342bf9e47559e39535aefcde78acbbdd7fb210d42a77dbbb93c2fd9f8ff","gitBlob":"c9005ab245f045648d6bf508b9afef6c2d26c583"},{"path":"package.json","bytes":1413,"LF":40,"sha256":"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5","gitBlob":"ec7193f6fd76f34778515079dc777594175c4c34"},{"path":"src/service-credit-sqlite-store.js","bytes":82141,"LF":2333,"sha256":"bda45bd553c8580a7bd66573bb2fb7c3bf12d79bab49a91fe3ac6dc1ebad8422","gitBlob":"6a7364fbc59c43edffb7a73f550210644e78daff"},{"path":"src/service-credit-model.js","bytes":55461,"LF":1580,"sha256":"7ff7e3d88ab8c3b38a0073541533fbdb7a0d9f2be42f337ac35f6a3b05615c3a","gitBlob":"e6ac17254874584d1a01f70e7abc6f771bd35d73"},{"path":"src/service-credit-execution-contract.js","bytes":30258,"LF":956,"sha256":"298f8e74885e1c507953c0fcf7874832f815296746e6bacbdac97a425f1a6c73","gitBlob":"acfbb5c5e943b9e09958a7831b3dbe159463dcf9"},{"path":"src/service-credit-durable-http-session.js","bytes":13978,"LF":425,"sha256":"a0d6d1436cdb697f125fee2f4dc723a5ddcfd2ee7063b55d56fa006bb8ba69bf","gitBlob":"307b72b8a1d114463ad8e18935312b18ccb23199"},{"path":"src/service-credit-durable-session-close.js","bytes":2470,"LF":84,"sha256":"5aae36a7da39ce5b7b9a8da8e9fbda88465cb1e4853dc791520a1df0ab87ede7","gitBlob":"f744b55595e2238dc088cf71ca8849e480cda1bc"},{"path":"src/service-credit-durable-execution-owner.js","bytes":40833,"LF":1301,"sha256":"a63a795dda77489f7da0682d83a0683cf07240f83b803f449668cb687a956863","gitBlob":"f0fd445a17466dd1ab83c785c44aa5e6fdf1e765"},{"path":"src/service-credit-http.js","bytes":32432,"LF":958,"sha256":"c76a7f1864bdfcd0c26916bf28fba615c8aecf899d53e69467e3ebe7d3353d0d","gitBlob":"040da1547c2fa6cc4a4044c47619b253f16d19a1"},{"path":"src/service-credit-capability.js","bytes":8284,"LF":256,"sha256":"cb2b96d9a2e56c132dd1b4aca8f1c065b244ecd0e7e92f41ea3f4a8c969d17c3","gitBlob":"2e19d42c1b9311a75897c84669849f56ae40f785"},{"path":"src/service-credit-custodied-sqlite-recovery-reader.js","bytes":2286,"LF":57,"sha256":"72fd5da6aafd1500255f6170d2a2291155c4f4f5b1126c6b13dce9909decb0f3","gitBlob":"51c59fd254a124626b979a2798d3a960b60e2922"},{"path":"qualification/service-credit-custodied-v3-client-session-roundtrip-fixture.draft.mjs","bytes":37993,"LF":704,"sha256":"3eecb9373bdd66e1493608108eeafd1c1bdb78f2ea8a594ff3f0d3b33c9e7015","gitBlob":"56a8176af70ac873ec07d0c9e1e10432b5fcd9ed"}];

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
    const cap = pin.path === FIXTURE ? 40000
      : pin.path === 'src/service-credit-sqlite-store.js' ? 100000 : 65536;
    const raw = guardedSource(join(repository, pin.path), bindings[pin.path], cap, S.uid);
    equal(raw.length, pin.bytes); equal(raw.toString('ascii').split('\n').length - 1, pin.LF);
    equal(sha(raw), pin.sha256);
    equal(createHash('sha1').update('blob ' + raw.length + '\0').update(raw).digest('hex'), pin.gitBlob);
    if (pin.path === 'package.json') equal(JSON.parse(raw.toString('ascii')).type, 'module');
    S.sourceGuards += 1;
  }
  const self = guardedSource(selfPath, bindings[SELF], 40000, S.uid);
  S.selfBytes = self.length; S.selfDigest = sha(self); S.sourceGuards += 1;
  equal(S.sourceGuards, 25); S.graphVerified = true;
  // Parent verifies the entire expected entry SHA before its run API imports B.
  S.stage = 'CURRENT_ACTUAL_GRAPH_IMPORT';
  const load = path => import(new URL('../' + path, import.meta.url).href);
  const G = {};
  for (const [name, path] of [
    ['session', 'src/service-credit-durable-http-session.js'],
    ['store', 'src/service-credit-sqlite-store.js'],
    ['model', 'src/service-credit-model.js'],
    ['capability', 'src/service-credit-capability.js'],
    ['http', 'src/service-credit-http.js'],
    ['client', 'src/service-credit-custodied-http-client.js'],
    ['funding', 'src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js'],
    ['custody', 'src/service-credit-original-request-custody-contract.js'],
    ['wire', 'src/x402-wire.js'],
    ['reader', 'src/service-credit-custodied-sqlite-recovery-reader.js'],
  ]) G[name] = await load(path);
  S.G = Object.freeze(G);
  S.fixtureModule = await load(FIXTURE);
}

const JSON_TYPE = 'application/json', RESULT = 'service.scoped.session';

function successfulBackend(S) {
  const { snapshot, grant, credit } = S.F;
  S.after = snapshot(S);
  equal(S.after.ledger.revision, S.baseline.ledger.revision + 3);
  same(S.after.ledger.state.offers, S.baseline.ledger.state.offers);
  equal(S.after.ledger.state.grants.length, 1);
  same(grant(S.after, S.A.grantId), { ...grant(S.baseline, S.A.grantId),
    availableUnits: 5, heldUnits: 0, consumedUnits: 2 });
  credit(grant(S.after, S.A.grantId), [7, 5, 0, 2]);
  equal(S.after.ledger.state.requests.length, 1);
  const request = S.store.getRequest(S.key);
  same([request.grantId, request.requestId, request.state, request.costUnits],
    [S.key.grantId, S.key.requestId, 'SUCCEEDED', 2]);
  same(request.cachedResult, { statusCode: 200, contentType: JSON_TYPE, resultCode: RESULT });
  const ledgerRequest = S.after.ledger.state.requests[0];
  same([ledgerRequest.grantId, ledgerRequest.requestId, ledgerRequest.state, ledgerRequest.costUnits],
    [S.key.grantId, S.key.requestId, 'SUCCEEDED', 2]);
  const { executions: beforeItems, ...beforeRest } = S.baseline.durable.executionState;
  const { executions, ...afterRest } = S.after.durable.executionState;
  same(afterRest, beforeRest); equal(beforeItems.length, 0); equal(executions.length, 1);
  const execution = executions[0];
  same([execution.request.grantId, execution.request.requestId, execution.request.costUnits,
    execution.fencePhase, execution.terminalClassification, execution.uncertaintyReason],
    [S.key.grantId, S.key.requestId, 2, 'MAY_HAVE_STARTED', 'SUCCEEDED', null]);
  ok(/^sha256:[0-9a-f]{64}$/.test(execution.resultCommitment));
  equal(S.after.durable.executionState.generation.state, 'OPEN');
  equal(S.executeCalls, 1); equal(S.backendCalls, 1);
  equal(S.executeIdentities.length, 1);
  const identity = S.executeIdentities[0];
  ok(Object.isFrozen(identity)); same(Object.keys(identity).sort(), ['executionId', 'signal']);
  equal(identity.executionId, execution.executionId);
  const execute = S.promises.filter(record => record.label === 'EXECUTE_ORIGINAL');
  equal(execute.length, 1); equal(execute[0].settled, true); equal(execute[0].ok, true);
  same(execute[0].value, { resultCode: RESULT }); ok(Object.isFrozen(execute[0].value));
  equal(S.schedules, 1); equal(S.cancels, 1); equal(S.handles.size, 0);
  S.backendSucceeded = true;
}

function clientCompleted(S) {
  const bodyBytes = S.bridges[0].reply.body.length;
  same(S.client.snapshot(), {
    owner: {
      phase: 'CALLBACK_COMPLETED', closed: false, active: false, grantScoped: true,
      trackedRequests: 1, maxRequests: 2, drainStatus: 'OBSERVED', closeOutcome: 'NOT_REQUESTED',
      counts: { loadReads: 4, recordReads: 3, retainCalls: 1, readbackConfirmations: 1,
        dispatchCalls: 1, callbackCompletions: 1, intentWrites: 1, intentReads: 1, intentReadbackConfirmations: 1 },
      uncertainty: { custody: false, submission: false, undrained: false, declaredFundingAmbiguitySeen: false },
      qualification: 'DECLARED_CALLBACK_LIFECYCLE_ONLY', serviceOutcome: 'NOT_ESTABLISHED',
      durability: 'NOT_ESTABLISHED', recoveryAuthority: 'NONE',
    },
    lastTransport: {
      phase: 'INTERFACE_COMPLETED', used: true, settled: true, unknown: false, undrained: false,
      deadlineFired: false, timerArmed: false, credentialReferenceReleased: true,
      requestObserved: true, responseObserved: true, requestClosed: true,
      responseEnded: true, responseClosed: true, responseComplete: true, replyValidated: true,
      duplicateResponseCallback: false, lateEventSeen: false,
      counts: { requestCalls: 1, responseHandles: 1, listenerRegistrations: 7,
        endCalls: 1, destroyCalls: 0, dataChunks: 1, bodyBytes, settlements: 1 },
      qualification: 'SYNTHETIC_INTERFACE_ONLY', serviceDelivery: 'NOT_ESTABLISHED',
      realReady: 'NOT_ESTABLISHED', restart: 'NOT_ESTABLISHED', durability: 'NOT_ESTABLISHED',
    },
    storeOwnership: 'BORROWED', boundEstablishesAuthority: false,
    qualification: 'SYNTHETIC_COMPOSITION_ONLY', serviceDelivery: 'NOT_ESTABLISHED',
    currentAuthority: 'NOT_ESTABLISHED', realReady: 'NOT_ESTABLISHED',
    durability: 'NOT_ESTABLISHED', restart: 'NOT_ESTABLISHED', pilot: 'NOT_ESTABLISHED',
  });
  equal(S.requestCalls, 1); equal(S.endCalls, 1); equal(S.bridgeDestroys, 0);
  equal(S.bridges.length, 1); equal(S.bridgeErrors, 0); equal(S.unexpectedBridgeCalls, 0);
  S.clientSucceeded = true;
}

async function duplicateFence(S) {
  const { observe, settled, snapshot, persistedPair } = S.F;
  S.stage = 'IDENTICAL_INPUT_DUPLICATE_OWNER_FENCE';
  const beforeOwner = S.client.snapshot().owner, beforeTransport = S.client.snapshot().lastTransport;
  let original;
  try { original = S.client.submitOriginal(S.original.input); }
  catch (error) { hold(S, 'DUPLICATE_SUBMIT_LAUNCH_UNKNOWN'); throw error; }
  const duplicate = observe(S, original, 'DUPLICATE_SUBMIT_ORIGINAL');
  await settled(S, () => duplicate.settled);
  equal(duplicate.ok, false); const error = duplicate.error;
  equal(Object.getPrototypeOf(error), TypeError.prototype); ok(Object.isFrozen(error));
  equal(error.code, 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_RECOVERY_REQUIRED');
  equal(error.message, error.code); equal(error.stack, 'TypeError: ' + error.code);
  const afterOwner = S.client.snapshot().owner;
  equal(afterOwner.phase, 'RECOVERY_REQUIRED'); equal(afterOwner.active, false);
  same(afterOwner.uncertainty, beforeOwner.uncertainty);
  for (const key of ['retainCalls', 'readbackConfirmations', 'intentWrites', 'intentReads',
    'intentReadbackConfirmations', 'dispatchCalls', 'callbackCompletions']) {
    equal(afterOwner.counts[key], beforeOwner.counts[key]);
  }
  same(afterOwner, { ...beforeOwner, phase: 'RECOVERY_REQUIRED',
    counts: { ...beforeOwner.counts, loadReads: beforeOwner.counts.loadReads + 1,
      recordReads: beforeOwner.counts.recordReads + 1 } });
  same(S.client.snapshot().lastTransport, beforeTransport);
  equal(S.requestCalls, 1); equal(S.endCalls, 1); equal(S.backendCalls, 1); equal(S.executeCalls, 1);
  same(snapshot(S), S.after); persistedPair(S); S.duplicateFenced = true;
}

async function exercise(S, declaredConfiguration) {
  const { unit, seed, signedOriginal, seedFunding, createSession, bridgeImpl, observe,
    settled, deliver, persistedPair, readerHandoff } = S.F;
  equal(S.sourceGuards, 25);
  unit(S); seed(S); signedOriginal(S); seedFunding(S); createSession(S);
  ok(Object.isFrozen(declaredConfiguration));
  same(Object.keys(declaredConfiguration), ['fundingResourceUrl', 'custodyPolicy']);
  ok(Object.isFrozen(declaredConfiguration.custodyPolicy));
  equal(declaredConfiguration.fundingResourceUrl, S.fundingSeed.resourceUrl);
  same(declaredConfiguration.custodyPolicy, { policyVersion: 1, maxRequests: 2,
    serviceResourceUrl: S.expectedOriginal.serviceResourceUrl });
  S.stage = 'CONSTRUCT_ACTUAL_BORROWED_V3_CLIENT'; S.creatingClient = true; S.clientCreates += 1;
  try {
    S.client = S.G.client.createServiceCreditCustodiedHttpClientV3({
      store: S.funding, fundingResourceUrl: declaredConfiguration.fundingResourceUrl,
      custodyPolicy: declaredConfiguration.custodyPolicy,
      selectedGrantId: S.A.grantId, requestImpl: bridgeImpl(S), deadlineMs: 5000,
    });
    ok(Object.isFrozen(S.client)); S.clientKnown = true; S.creatingClient = false;
  } catch (error) { hold(S, 'CLIENT_CONSTRUCTION_UNKNOWN'); throw error; }
  S.stage = 'ORIGINAL_CLIENT_SUBMIT_AND_ACTUAL_BACKEND';
  let original;
  try { original = S.client.submitOriginal(S.original.input); }
  catch (error) { hold(S, 'CLIENT_SUBMIT_LAUNCH_UNKNOWN'); throw error; }
  S.submission = observe(S, original, 'CLIENT_SUBMIT_ORIGINAL');
  if (S.hold !== 'NONE') throw redacted('BRIDGE_PRECONDITION_HOLD');
  await settled(S, () => S.bridges.length > 0
    && S.bridges.every(entry => entry.backend !== null && entry.backend.settled));
  equal(S.hold, 'NONE');
  for (const entry of S.bridges) deliver(S, entry);
  await settled(S, () => S.submission.settled);
  equal(S.submission.ok, true); equal(S.submission.value, undefined);
  equal(S.preDispatchFence, true); successfulBackend(S); clientCompleted(S); persistedPair(S);
  await duplicateFence(S); await readerHandoff(S); S.bodyComplete = true;
}

test('P2 actual borrowed V3 client/session, duplicate fence and same-process owned recovery handoff',
  { timeout: 15000, concurrency: false }, async t => {
    const guards = { stage: 'EXACT_ENVIRONMENT_GUARDS', hold: 'NONE', uid: null,
      root: null, sourceGuards: 0, selfBytes: 0, selfDigest: null, G: null };
    let S = null;
    try {
      environment(guards); await graph(guards);
      const F = guards.fixtureModule.roundtripOperations();
      ok(Object.isFrozen(F));
      S = guards.fixtureModule.createRoundtripState(guards); S.F = F;
      const declaredConfiguration = guards.fixtureModule.getRoundtripDeclaredConfiguration();
      await exercise(S, declaredConfiguration);
    } catch (error) {
      if (S === null) {
        t.diagnostic(JSON.stringify({ status: 'FAIL', stage: guards.stage,
          hold: 'GUARD_OR_IMPORT_REFUSAL_HOLD', sourceGuards: guards.sourceGuards,
          retainedErrors: 1, qualification: 'NOT_ESTABLISHED', authority: 'NONE' }));
        throw redacted('MODULAR_ROUNDTRIP_GUARD_OR_IMPORT_REFUSED');
      }
      S.failureStage = S.stage; S.errors.push(error);
    }
    if (S.A !== null) S.A.privateKey = null;
    try { await S.F.closeKnownOwners(S); }
    catch (error) {
      if (S.failureStage === 'NONE') S.failureStage = S.stage;
      S.errors.push(error);
    }
    const passed = S.errors.length === 0 && S.hold === 'NONE' && S.bodyComplete
      && S.clientCloseReturned && S.borrowedFundingReadable && S.fundingCloseReturned
      && S.readerCloseReturned && S.sessionCloseReturned && S.borrowedBackendReadable && S.storeCloseReturned;
    const fields = [
      'stage', 'failureStage', 'hold', 'sourceGuards', 'storeCreates', 'fundingCreates', 'clientCreates',
      'sessionCreates', 'keyAttempts', 'keyPairs', 'signAttempts', 'signatures', 'verificationControls',
      'proofValid', 'preDispatchFence', 'backendSucceeded', 'clientSucceeded', 'duplicateFenced',
      'requestCalls', 'endCalls', 'backendCalls', 'executeCalls', 'bridgeDestroys', 'bridgeErrors',
      'unexpectedBridgeCalls', 'schedules', 'cancels', 'clientCloseCalls', 'clientCloseReturned',
      'borrowedFundingReadable', 'fundingCloseCalls', 'fundingCloseReturned', 'readerOpenCalls',
      'readerRetainedPair', 'readerCloseCalls', 'readerCloseReturned', 'sessionCloseCalls',
      'sessionCloseReturned', 'borrowedBackendReadable', 'storeCloseCalls', 'storeCloseReturned',
    ];
    t.diagnostic(JSON.stringify({
      ...Object.fromEntries(fields.map(key => [key, S[key]])), status: passed ? 'PASS' : 'FAIL',
      retainedErrors: S.errors.length, declaredHandles: S.handles.size,
      pendingOriginals: S.promises.filter(record => !record.settled).length,
      counters: 'FIXTURE_CONTROL_NOT_INDEPENDENT_NATIVE_INSTRUMENTATION',
      qualification: 'LOCAL_SYNTHETIC_CLIENT_SESSION_SAME_PROCESS_READER_ONLY', authority: 'NONE',
      responseBoundary: 'DECLARED_EVENT_FRAMING_NO_HTTPS_OR_DELIVERY_PROOF',
      restart: 'NOT_ESTABLISHED', durability: 'NOT_ESTABLISHED', nativeCleanup: 'NOT_ESTABLISHED',
    }));
    if (!passed) throw redacted('ACTUAL_MODULAR_V3_CLIENT_SESSION_ROUNDTRIP_NOT_QUALIFIED');
  });
