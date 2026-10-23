// Three NEW actual application-server compositions. Both SDK bindings are real
// production modules; no old entry is imported or replayed. Only declared DATA,
// local callbacks and the exact manager-owned normal package namespace are used.
// No native HTTP, fetch, keys, signatures, SQL, nonce search or payment runs.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENTRY = 'qualification/official-x402-application-server-pending-composition.behavior.draft.mjs';
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
const SPECS = [
  {"path":"src/x402-official-selected-settlement-server.js","bytes":14136,"LF":258,"sha256":"d84cbeb27ea77f21752cb5623b06a83831a53aa44ae863afcda85c5341571de6"},
  {"path":"src/x402-official-selected-payment-client.js","bytes":9226,"LF":177,"sha256":"6103703a48ab93b33e1d322d01da367d9552d1e37c9d983326f6e58d1e77693c"},
  {"path":"src/x402-selected-payment-client-bridge.js","bytes":19446,"LF":370,"sha256":"d8252e421240005f51b1627ab97b624496325403508d57b030be423e871a5083"},
  {"path":"src/x402-selected-settlement-server-bridge.js","bytes":39943,"LF":749,"sha256":"38f47d24e1dcdd0f632e786054dc2e9544de2f261f74e949e28fee43ed56f40b"},
  {"path":"src/x402-verification-bound-settlement-context.js","bytes":11311,"LF":221,"sha256":"b3ad2fd33dae7e77a77f069cbc1259bf77e18a2bf383aa30f41bcc19221656f5"},
  {"path":"src/x402-selected-settlement-context.js","bytes":16818,"LF":456,"sha256":"afb6e16603023dd58d6a71cff5790a802dcfa4b98bc9d380b51ccc3d58e10991"},
  {"path":"src/x402-wire.js","bytes":39886,"LF":934,"sha256":"5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"},
  {"path":"package.json","bytes":1413,"LF":40,"sha256":"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"},
  {"path":"@x402/core/package.json","bytes":3853,"LF":138,"sha256":"4130a95721f50c0997dcba3728d14d5584c4f99c12c8c3f9870b21f31da212fd"},
  {"path":"zod/package.json","bytes":3284,"LF":118,"sha256":"70eedbe34fd52385a4ae2f3e5759b19682189f0118ea73a6e7c32c677f61668e"},
  {"path":"@x402/core/dist/esm/client/index.mjs","bytes":26707,"LF":676,"sha256":"653613f25e2fa24615af7d1fe943679177774215a16600289175f61c4df5dda9"},
  {"path":"@x402/core/dist/esm/server/index.mjs","bytes":1761,"LF":60,"sha256":"fa62aa75d072a9a1e2bb00be93ef4980e15507e3617942f1d7ab05c69954a19e"},
  {"path":"@x402/core/dist/esm/http/index.mjs","bytes":1177,"LF":42,"sha256":"f87cf0256b51820628469681ba1421de97f17d55c2eff64bbe9040ef4f5ea084"},
  {"path":"@x402/core/dist/esm/schemas/index.mjs","bytes":1591,"LF":69,"sha256":"b4c12db796c6654de17d8542d65cd78bbbe8cf4bbcc71d05912450d8adfcf0c9"},
  {"path":"@x402/core/dist/esm/chunk-BA2VL4DT.mjs","bytes":116817,"LF":3151,"sha256":"f2ad975e24db34808470b081c9deedaf6aafa53ab95121d29661a1a8b1507f84"},
  {"path":"@x402/core/dist/esm/chunk-N4QXZG2Z.mjs","bytes":5040,"LF":160,"sha256":"19c189f7417214b211ee4abdaada531a80e5adc8504d593c172fe1e2ce61c03e"},
  {"path":"@x402/core/dist/esm/chunk-VE37GDG2.mjs","bytes":107,"LF":6,"sha256":"56fb4db85f03d88dfa5d42c81be8527f72deae2bca4004dfaea6415f186dc086"},
  {"path":"@x402/core/dist/esm/chunk-P3DFEIO7.mjs","bytes":2602,"LF":82,"sha256":"9c124f03f792fcef472452fcaf30d03bd7d6ea44170675d60ccc473d3b02f983"},
  {"path":"@x402/core/dist/esm/chunk-UQQR4X3S.mjs","bytes":5837,"LF":172,"sha256":"a7756bf22635f58e52dce87753863e51f407a38f5c32382a1076c39bd6cb9a62"},
  {"path":"@x402/core/dist/esm/chunk-BJTO5JO5.mjs","bytes":433,"LF":10,"sha256":"1c521b4fbee4089393c982b94b5f8a4f81b1043c2f8cd1848d0d6056430e761f"},
  {"path":"zod/index.js","bytes":105,"LF":4,"sha256":"6419c4ac0e637ff08463083e31886d10354f74cbcc4e584400b2b837e39ac881"},
  {"path":"zod/v3/external.js","bytes":205,"LF":6,"sha256":"5d26d2e47e2352def36f89a3e8bf8581da22b7f857e07ef3114cd52cf4813445"},
  {"path":"zod/v3/errors.js","bytes":243,"LF":9,"sha256":"d40831f478288d76e82bbbcc3b7e95c8513b6e76471f2d49a37c979bc57d492d"},
  {"path":"zod/v3/helpers/parseUtil.js","bytes":3601,"LF":109,"sha256":"b57484013bb360bac2e334d58fcd5f6cbfa63ffcc7d8ff3dbbb3380ca659b956"},
  {"path":"zod/v3/helpers/typeAliases.js","bytes":11,"LF":1,"sha256":"8e609bb71c20b858c77f0e9f90bb1319db8477b13f9f965f1a1e18524bf50881"},
  {"path":"zod/v3/helpers/util.js","bytes":4055,"LF":133,"sha256":"906ef685e5853d496e293ee8f8a2bb8b1ed2d078a1bcdfedb2dfd61d75b6330c"},
  {"path":"zod/v3/types.js","bytes":131212,"LF":3693,"sha256":"9763a2938f0e7f983363ef4bf6530e7583e3f2d54f8a4a6684efad58febc6e8e"},
  {"path":"zod/v3/ZodError.js","bytes":4349,"LF":133,"sha256":"f5ac9e86b92e201d41e294d7aa35986a2aa28829e1bcc8ac25f7c8dce0674b99"},
  {"path":"zod/v3/locales/en.js","bytes":5602,"LF":109,"sha256":"51a6dcc5d4bd52a64da127c012c6c963395c1d9a343ad75d4a8eca662fc8b205"},
  {"path":"zod/v3/helpers/errorUtil.js","bytes":300,"LF":6,"sha256":"68589c0cf44c8b4ad19b77418f53caad2cd1dbc8d714f526e1876ebdee4828c5"}
];
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.env.X402_OFFICIAL_OPT_IN, 'reviewed-existing-synthetic-only');
const ROOTS = JSON.parse(process.env.X402_OFFICIAL_PACKAGE_ROOTS);
assert.deepEqual(Object.keys(ROOTS), ['core', 'zod']);
for (const p of Object.values(ROOTS)) assert.ok(isAbsolute(p) && resolve(p) === p);
const PINS = JSON.parse(process.env.X402_OFFICIAL_SOURCE_PINS);
const sha = b => createHash('sha256').update(b).digest('hex');
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
function physical(label) {
  if (label.startsWith('@x402/core/')) return join(ROOTS.core, label.slice(11));
  if (label.startsWith('zod/')) return join(ROOTS.zod, label.slice(4));
  return join(REPO, label);
}
function sources() {
  assert.equal(PINS.length, 31); assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p.path), ENTRY]);
  let total = 0;
  return PINS.map((p, index) => {
    const filename = physical(p.path), s = lstatSync(filename, { bigint: true });
    assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.uid, BigInt(process.getuid())); assert.equal(s.nlink, 1n);
    assert.ok(s.size > 0n && s.size <= 262144n); assert.deepEqual(ids(s), p.identity);
    const fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW), b = Buffer.alloc(Number(s.size) + 1);
    let used = 0;
    try {
      assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
      while (used < b.length) { const n = readSync(fd, b, used, b.length - used, null); if (!n) break; used += n; }
      assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
    } finally { closeSync(fd); }
    assert.deepEqual(ids(lstatSync(filename, { bigint: true })), p.identity); assert.equal(used, Number(s.size));
    const raw = b.subarray(0, used); assert.equal(raw.includes(0), false);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(raw); assert.deepEqual(Buffer.from(text, 'utf8'), raw);
    total += raw.length; assert.ok(total <= 524288);
    assert.equal(raw.length, p.bytes); assert.equal(sha(raw), p.sha256);
    assert.equal(raw.filter(c => c === 10).length, p.LF);
    if (index < SPECS.length) for (const k of ['path','bytes','LF','sha256']) assert.equal(p[k], SPECS[index][k]);
    return { path: p.path, sha256: p.sha256, bytes: p.bytes, identity: p.identity };
  });
}
const initialSources = sources();
const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
assert.equal(typeof fetchDescriptor.value, 'function'); assert.equal(fetchDescriptor.configurable, true);
let networkCalls = 0;
const denyFetch = () => { networkCalls++; throw new Error('SYNTHETIC_NETWORK_FORBIDDEN'); };
Object.defineProperty(globalThis, 'fetch', { ...fetchDescriptor, value: denyFetch });
const httpModule = await import(pathToFileURL(join(ROOTS.core, 'dist/esm/http/index.mjs')).href);
const schemaModule = await import(pathToFileURL(join(ROOTS.core, 'dist/esm/schemas/index.mjs')).href);
const { createOfficialSelectedPaymentClient: CREATE_CLIENT }
  = await import('../src/x402-official-selected-payment-client.js');
const { createOfficialSelectedSettlementServer: CREATE_SERVER }
  = await import('../src/x402-official-selected-settlement-server.js');
const { decodePaymentSignatureHeader, decodePaymentResponseHeader } = httpModule;
const { PaymentRequiredV2Schema } = schemaModule;
const OPTIONS = { timeout: 5000, concurrency: false }, HASH = 'a'.repeat(64);
const URL = 'https://selected-server-composition.invalid/paid';
const RESOURCE = { url: URL, description: 'Synthetic application-owned upfront request', mimeType: 'application/json' };
const copy = value => JSON.parse(JSON.stringify(value));
const fixtures = [];
function requirement() {
  return { scheme: 'exact', network: 'zenon:mock', asset: 'zts1declaredasset', amount: '1',
    payTo: 'z1declaredrecipient', maxTimeoutSeconds: 60,
    extra: { paymentFlow: 'upfront', poc: true, settlement: 'account-block',
      zenonChain: { version: 1, chainIdentifier: String(Number.MAX_SAFE_INTEGER), genesisMomentumHash: '0'.repeat(64) } } };
}
const headerValue = (headers, name) => Object.entries(headers).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
function settlement(p, r, success) {
  return { success, ...(success ? { payer: 'declared-payer' } : { errorReason: 'settlement_pending' }),
    transaction: p.payload.transaction.hash, network: r.network,
    publicationStatus: success ? 'ACKNOWLEDGED' : 'UNKNOWN' };
}
async function fixture(observerSuccess, preflight = false) {
  const f = { req: requirement(), calls: { schema: 0, verify: 0, first: 0, observer: 0, create: 0, handler: 0 },
    callbackTuples: [], challenges: [], clientSchemas: 0 };
  fixtures.push(f);
  function enter(role, args) {
    assert.equal(args.length, 3); f.calls[role]++;
    const texts = args.map(x => JSON.stringify(x));
    if (role === 'verify') { f.originalRequirementsJson = texts[1]; assert.deepEqual(args[1], f.req); }
    f.callbackTuples.push({ role, texts });
    assert.equal(args[0].payload.transaction.hash, HASH); assert.equal(args[1].network, f.req.network);
  }
  const facilitator = {
    verify(...args) { enter('verify', args); return { isValid: true, payer: 'declared-payer' }; },
    settle(...args) { enter('first', args); return settlement(args[0], args[1], false); },
  };
  f.options = { requirement: f.req, resource: copy(RESOURCE), localFacilitator: facilitator,
    validateChallenge: function validateChallenge(data) {
      assert.equal(this, undefined); assert.equal(arguments.length, 1); assert.ok(Object.isFrozen(data));
      f.calls.schema++; f.challenges.push(JSON.stringify(data)); PaymentRequiredV2Schema.parse(data);
    },
    reconcilePendingSettlement: function observe(...args) { enter('observer', args); return settlement(args[0], args[1], observerSuccess); },
    maxPendingReconciliations: 1, contextLimit: 8 };
  f.server = await CREATE_SERVER(f.options);
  assert.deepEqual(Object.keys(f.server), ['processRequest', 'getSnapshot']);
  assert.ok(Object.isFrozen(f.server));
  for (const method of Object.values(f.server)) assert.ok(Object.isFrozen(method));
  if (preflight) await preflightRefusals(f);
  f.client = CREATE_CLIENT({ requirement: f.req, contextLimit: 8,
    assetInfo: { asset: f.req.asset, decimals: 8, symbol: 'DECLARED' },
    validateChallenge: function (data) { f.clientSchemas++; PaymentRequiredV2Schema.parse(data); },
    localClient: { createPaymentPayload(challenge, selected) {
      assert.equal(arguments.length, 2); f.calls.create++; assert.equal(f.calls.create, 1);
      assert.ok(Object.isFrozen(challenge)); assert.ok(Object.isFrozen(selected));
      assert.equal(challenge.accepts[0], selected); assert.deepEqual(selected, f.req);
      return { x402Version: 2, resource: copy(challenge.resource), accepted: copy(selected),
        payload: { transaction: { hash: HASH, signature: 'DECLARED_NOT_A_WALLET_SIGNATURE',
          nonce: '0000000000000000' }, intentDigest: 'b'.repeat(64) } };
    } } });
  const unpaid = await f.server.processRequest(null);
  assert.equal(unpaid.type, 'payment-error'); assert.equal(unpaid.response.status, 402); assert.equal(unpaid.pending, null);
  assert.ok(Object.isFrozen(unpaid.response)); assert.ok(Object.isFrozen(unpaid.response.headers));
  assert.deepEqual([f.calls.verify, f.calls.first, f.calls.observer], [0,0,0]);
  const challenge = f.client.decodePaymentRequiredHeader(headerValue(unpaid.response.headers, 'PAYMENT-REQUIRED'));
  assert.deepEqual(challenge.resource, RESOURCE);
  f.payload = await f.client.createPaymentPayload(challenge);
  f.header = f.client.encodePaymentSignatureHeader(f.payload);
  f.payloadJson = JSON.stringify(decodePaymentSignatureHeader(f.header));
  const paid = await f.server.processRequest(f.header);
  assert.equal(paid.type, 'payment-error'); assert.equal(paid.response.status, 402);
  assert.ok(Object.isFrozen(paid)); assert.ok(Object.isFrozen(paid.pending));
  assert.deepEqual(Object.keys(paid.pending), ['resume', 'close', 'getSnapshot']);
  const pendingWire = decodePaymentResponseHeader(headerValue(paid.response.headers, 'PAYMENT-RESPONSE'));
  assert.equal(pendingWire.success, false); assert.equal(pendingWire.errorReason, 'settlement_pending');
  assert.equal(pendingWire.transaction, HASH); f.continuation = paid.pending;
  assert.deepEqual(f.calls, { schema: 2, verify: 1, first: 1, observer: 0, create: 1, handler: 0 });
  const state = f.server.getSnapshot();
  assert.equal(state.requestCalls, 2); assert.equal(state.requestLimit, 8); assert.equal(state.active, false);
  const owner = state.bridge.contexts[1].boundOwner;
  assert.equal(owner.verificationCalls, 1); assert.equal(owner.settlement.state, 'PENDING');
  assert.equal(owner.settlement.firstAuthorityConsumed, true); assert.equal(owner.settlement.publication.status, 'UNKNOWN');
  return f;
}
async function preflightRefusals(f) {
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_CALLER_HOOK'); };
  const getter = { ...f.options }; Object.defineProperty(getter, 'resource', { get: hook, enumerable: true });
  const proxy = new Proxy(f.options, { ownKeys: hook, getPrototypeOf: hook });
  for (const options of [null, {}, getter, proxy, { ...f.options, contextLimit: 0 },
    { ...f.options, resource: { ...RESOURCE, extra: 'unsupported' } }])
    await assert.rejects(CREATE_SERVER(options), { code: 'x402_official_selected_server_configuration_rejected' });
  await assert.rejects(CREATE_SERVER(), { code: 'x402_official_selected_server_configuration_rejected' });
  const state = f.server.getSnapshot();
  for (const header of [undefined, '', 'not base64', 'A'.repeat(8196), new Proxy({}, { get: hook })])
    await assert.rejects(f.server.processRequest(header), { code: 'x402_official_selected_server_input_rejected' });
  await assert.rejects(f.server.processRequest(), { code: 'x402_official_selected_server_input_rejected' });
  assert.equal(hooks, 0); assert.deepEqual(f.server.getSnapshot(), state);
  assert.deepEqual([f.calls.schema, f.calls.verify, f.calls.first, f.calls.observer], [0,0,0,0]);
}
async function resume(f) {
  const response = await f.continuation.resume();
  assert.ok(Object.isFrozen(response)); assert.ok(Object.isFrozen(response.settlement)); assert.ok(Object.isFrozen(response.headers));
  const wire = decodePaymentResponseHeader(headerValue(response.headers, 'PAYMENT-RESPONSE'));
  assert.equal(wire.success, response.settlement.success); assert.equal(wire.transaction, HASH);
  assert.equal(wire.network, f.req.network);
  if (response.settlement.success) f.calls.handler++; // Declared modeled effect, never actual delivery.
  return response.settlement;
}
function preserved(f, phase, positive) {
  const state = f.server.getSnapshot(), client = f.client.getSnapshot(), c = f.continuation.getSnapshot();
  assert.ok(Object.isFrozen(state)); assert.equal(state.active, false); assert.equal(state.requestCalls, 2);
  assert.equal(c.phase, phase); assert.equal(c.active, false); assert.equal(c.sdkContinuationCalls, 1);
  assert.equal(c.positiveReplies, positive); assert.equal(c.referencesReleased, true); assert.equal(c.pendingReconciliations, 1);
  assert.equal(c.maxPendingReconciliations, 1); assert.equal(c.firstAuthorityConsumed, true);
  assert.equal(c.publication.uncertaintyRetained, true); assert.equal(c.serviceDelivery, 'NOT_ESTABLISHED');
  assert.equal(state.serviceDelivery, 'NOT_ESTABLISHED'); assert.equal(state.persistence, 'MEMORY_ONLY');
  assert.equal(client.created, 1); assert.equal(client.consumedContexts, 1); assert.equal(client.retainedInputs, 0);
  assert.equal(f.clientSchemas, 1); assert.equal(JSON.stringify(decodePaymentSignatureHeader(f.header)), f.payloadJson);
  for (const item of f.callbackTuples) {
    assert.equal(item.texts[0], f.payloadJson); assert.equal(item.texts[1], f.originalRequirementsJson);
    assert.equal(item.texts[2], f.challenges[1]);
  }
  assert.deepEqual([f.calls.verify, f.calls.first, f.calls.observer, f.calls.create], [1,1,1,1]);
  assert.equal(state.bridge.positiveSettlementResponses, positive); assert.equal(networkCalls, 0);
}
function diagnostic(t, f, scenario) {
  const state = f.server.getSnapshot(), c = f.continuation.getSnapshot();
  const owner = state.bridge.contexts[1].boundOwner.settlement;
  t.diagnostic(JSON.stringify({ kind: 'OFFICIAL_X402_APPLICATION_SERVER_COMPOSITION', version: 1, scenario,
    coreVersion: '2.23.0', zodVersion: '3.25.76', serverRequestCalls: state.requestCalls,
    serverSchemaCalls: f.calls.schema, clientSchemaCalls: f.clientSchemas, clientCreatorCalls: f.calls.create,
    verifyCalls: f.calls.verify, firstSettlementCalls: f.calls.first, observerCalls: f.calls.observer,
    sdkContinuationCalls: c.sdkContinuationCalls, positiveContinuationReplies: c.positiveReplies,
    continuationPhase: c.phase, originalHeaderRetained: true, originalCallbackSerializationsRetained: true,
    privateSdkTupleHookChecks: true, changedContextRequestsRefused: f.changedContextRefusals || 0,
    modeledHandlerCalls: f.calls.handler, firstSettlementAuthorityConsumed: owner.firstAuthorityConsumed,
    publicationUncertaintyRetained: owner.publication.uncertaintyRetained, publicationStatus: owner.publication.status,
    networkCalls, keys: 0, signatures: 0, sql: 0, nonceSearch: 0, payments: 0, realPrepare: 0, replacements: 0,
    serviceDelivery: 'NOT_ESTABLISHED', sameProcessOnly: true, automaticSdkRetry: false }));
}
async function pendingSuccess(t) {
  const f = await fixture(true, true);
  const pending = resume(f);
  await assert.rejects(f.continuation.resume(), { code: 'x402_official_selected_server_busy' });
  await assert.rejects(f.server.processRequest(null), { code: 'x402_official_selected_server_busy' });
  assert.equal((await pending).success, true); assert.equal(f.calls.handler, 1);
  await assert.rejects(f.continuation.resume(), { code: 'x402_selected_server_bridge_stage_rejected' });
  preserved(f, 'SUCCEEDED', 1);
  const close = f.continuation.close(); assert.equal(f.continuation.close(), close); await close;
  diagnostic(t, f, 'PENDING_TO_SUCCESS_PRIVATE_SERVER_BINDING');
}
async function pendingPending(t) {
  const f = await fixture(false);
  const result = await resume(f); assert.equal(result.success, false); assert.equal(result.errorReason, 'settlement_pending');
  await assert.rejects(f.continuation.resume(), { code: 'x402_selected_server_bridge_stage_rejected' });
  assert.equal(f.calls.handler, 0); preserved(f, 'PENDING_EXHAUSTED', 0);
  diagnostic(t, f, 'PENDING_TO_PENDING_BUDGET_EXHAUSTED');
}
async function changedContext(t) {
  const f = await fixture(true), altered = copy(f.payload);
  altered.resource.description = 'Different request context must not replace the retained original.';
  const changedHeader = f.client.encodePaymentSignatureHeader(altered), before = f.server.getSnapshot();
  await assert.rejects(f.server.processRequest(changedHeader), { code: 'x402_official_selected_server_input_rejected' });
  f.changedContextRefusals = 1;
  assert.deepEqual(f.server.getSnapshot(), before); assert.equal(f.calls.handler, 0);
  assert.equal(f.continuation.getSnapshot().phase, 'PENDING'); assert.equal(f.calls.observer, 0);
  assert.equal((await resume(f)).success, true); assert.equal(f.calls.handler, 1);
  preserved(f, 'SUCCEEDED', 1); diagnostic(t, f, 'CHANGED_CONTEXT_REFUSED_ORIGINAL_CONTINUATION_RETAINED');
}
after(async () => {
  try {
    assert.equal(fixtures.length, 3);
    for (const f of fixtures) if (f.continuation !== undefined) await f.continuation.close();
    assert.deepEqual(sources(), initialSources); assert.equal(networkCalls, 0);
    assert.equal(globalThis.fetch, denyFetch);
  } finally { Object.defineProperty(globalThis, 'fetch', fetchDescriptor); }
});
test('application official server owns the SDK pending tuple and returns one original success', OPTIONS, pendingSuccess);
test('application official server retains consumed first authority when its observer budget remains pending', OPTIONS, pendingPending);
test('application official server refuses changed request context while retaining the original pending continuation', OPTIONS, changedContext);
