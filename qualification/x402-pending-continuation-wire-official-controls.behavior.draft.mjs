// Two admitted changed-source controls against existing @x402/core 2.23.0.
// The new local wire gate must not reject matching real SDK replies.
// Existing dependencies only; no SDK install, Zenon SDK, network, wallet,
// payment, signing, SQLite, native HTTP host, or real resource is exercised.
// The library-owned continuation retains the first paid request's exact tuple.
// This is NOT an automatic SDK pending helper, fresh HTTP retry, or restart.
// Local verifier/settlement replies and handler counters remain declared DATA.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENTRY = 'qualification/x402-pending-continuation-wire-official-controls.behavior.draft.mjs', FACTORY = 'createSelectedSettlementServerBridgeForOfficialX402Core223';
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
const SPECS = [
  {
    "path": "src/x402-selected-settlement-server-bridge.js",
    "bytes": 37946,
    "LF": 711,
    "sha256": "8d1e494c89abb340efd7a9a1fd15bca53ed099bf6e72b9d09902449635bc46b4"
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
    "bytes": 1413,
    "LF": 40,
    "sha256": "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
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
  }
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
  assert.equal(PINS.length, 28); assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p.path), ENTRY]);
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
// Fixed entry points were resolved through the exact reviewed package manifests;
// the full static core/Zod closure is pinned above. No arbitrary module lookup.
const clientModule = await import(pathToFileURL(join(ROOTS.core, 'dist/esm/client/index.mjs')).href);
const serverModule = await import(pathToFileURL(join(ROOTS.core, 'dist/esm/server/index.mjs')).href);
const httpModule = await import(pathToFileURL(join(ROOTS.core, 'dist/esm/http/index.mjs')).href);
const schemaModule = await import(pathToFileURL(join(ROOTS.core, 'dist/esm/schemas/index.mjs')).href);
const local = await import('../src/x402-selected-settlement-server-bridge.js');
const CREATE = local[FACTORY];
assert.equal(typeof CREATE, 'function');
const { x402Client, x402HTTPClient } = clientModule;
const { x402ResourceServer, x402HTTPResourceServer } = serverModule;
const { decodePaymentSignatureHeader, decodePaymentResponseHeader } = httpModule;
const { PaymentRequiredV2Schema } = schemaModule;
const OPTIONS = { timeout: 5000, concurrency: false }, HASH = 'a'.repeat(64);
const URL = 'https://official-pending.invalid/paid';
const copy = value => JSON.parse(JSON.stringify(value)); // Test-owned validated bounded DATA only.
const fixtures = [];
function requirement() {
  return { scheme: 'exact', network: 'zenon:mock', asset: 'zts1declaredasset', amount: '1',
    payTo: 'z1declaredrecipient', maxTimeoutSeconds: 60,
    extra: { paymentFlow: 'upfront', poc: true, settlement: 'account-block',
      zenonChain: { version: 1, chainIdentifier: String(Number.MAX_SAFE_INTEGER), genesisMomentumHash: '0'.repeat(64) } } };
}
class Adapter {
  constructor(header) { this.header = header; }
  getHeader(name) { return name.toLowerCase() === 'payment-signature' ? this.header : undefined; }
  getMethod() { return 'GET'; }
  getPath() { return '/paid'; }
  getUrl() { return URL; }
  getAcceptHeader() { return 'application/json'; }
  getUserAgent() { return 'synthetic-actual-official-core'; }
}
const getHeader = headers => name => Object.entries(headers).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
function settlement(p, r, success) {
  return { success, ...(success ? { payer: 'declared-payer' } : { errorReason: 'settlement_pending' }),
    transaction: p.payload.transaction.hash, network: r.network,
    publicationStatus: success ? 'ACKNOWLEDGED' : 'UNKNOWN' };
}
async function fixture(observerSuccess) {
  const f = { req: requirement(), calls: { schema: 0, verify: 0, first: 0, observer: 0, create: 0, http: 0, handler: 0 },
    callbackTuples: [], sdkTuples: [], challenges: [], originalHeader: null };
  fixtures.push(f);
  function enter(role, args) {
    assert.equal(args.length, 3); f.calls[role]++;
    const texts = args.map(x => JSON.stringify(x)); f.callbackTuples.push({ role, texts });
    assert.equal(args[0].payload.transaction.hash, HASH);
    assert.equal(args[1].network, f.req.network);
  }
  const facilitator = {
    verify(...args) { enter('verify', args); return { isValid: true, payer: 'declared-payer' }; },
    settle(...args) { enter('first', args); return settlement(args[0], args[1], false); },
  };
  f.bridge = CREATE({
    requirement: f.req, localFacilitator: facilitator,
    validateChallenge: function validateChallenge(data) {
      assert.equal(this, undefined); assert.equal(arguments.length, 1); assert.ok(Object.isFrozen(data));
      f.calls.schema++; f.challenges.push(JSON.stringify(data)); PaymentRequiredV2Schema.parse(data);
      // Exact void-returning capability: parsed SDK DATA never replaces the retained challenge.
    },
    reconcilePendingSettlement: function observe(...args) { enter('observer', args); return settlement(args[0], args[1], observerSuccess); },
    maxPendingReconciliations: 1, contextLimit: 8,
  });
  f.server = new x402ResourceServer(f.bridge.facilitatorClient).register(f.req.network, f.bridge.schemeServer);
  f.server.onBeforeSettle(context => {
    assert.equal(context.phase, 'before-handler');
    f.sdkTuples.push({ payload: context.paymentPayload, requirements: context.requirements,
      transport: context.transportContext, texts: [JSON.stringify(context.paymentPayload), JSON.stringify(context.requirements)] });
  });
  f.http = new x402HTTPResourceServer(f.server, {
    'GET /paid': { accepts: { scheme: 'exact', network: f.req.network,
      price: { amount: f.req.amount, asset: f.req.asset }, payTo: f.req.payTo,
      maxTimeoutSeconds: f.req.maxTimeoutSeconds, extra: copy(f.req.extra) },
      resource: URL, description: 'Synthetic retained upfront composition', mimeType: 'application/json' },
  });
  await f.http.initialize();
  assert.deepEqual(f.server.facilitatorClients, [f.bridge.facilitatorClient]);
  const schemeClient = {
    scheme: 'exact',
    async createPaymentPayload(version, selected, context) {
      f.calls.create++; assert.equal(f.calls.create, 1); assert.equal(version, 2);
      assert.deepEqual(selected, f.req); assert.equal(context.extensions, undefined);
      return { x402Version: 2, payload: { transaction: { hash: HASH,
        signature: 'declared-not-a-wallet-signature', nonce: '0000000000000000' }, intentDigest: 'b'.repeat(64) } };
    },
  };
  // This is an explicit bounded synthetic-asset policy, not a default-asset claim.
  f.client = new x402Client().register(f.req.network, schemeClient).setSpendControls({
    allowedAssets: [{ network: f.req.network, asset: f.req.asset, maxAmountPerPayment: '1' }],
    maxAmountPerPayment: false,
  });
  f.httpClient = new x402HTTPClient(f.client);
  const unpaidContext = { adapter: new Adapter(), method: 'GET', path: '/paid' };
  f.calls.http++; const unpaid = await f.http.processHTTPRequest(unpaidContext);
  assert.equal(unpaid.type, 'payment-error'); assert.equal(unpaid.response.status, 402);
  assert.equal(f.calls.verify, 0); assert.equal(f.calls.first, 0); assert.equal(f.calls.observer, 0);
  const challenge = f.httpClient.getPaymentRequiredResponse(getHeader(unpaid.response.headers));
  PaymentRequiredV2Schema.parse(challenge);
  const payload = await f.httpClient.createPaymentPayload(challenge);
  const headers = f.httpClient.encodePaymentSignatureHeader(payload);
  f.originalHeader = headers['PAYMENT-SIGNATURE']; assert.equal(typeof f.originalHeader, 'string');
  f.originalPayloadJson = JSON.stringify(decodePaymentSignatureHeader(f.originalHeader));
  f.paidContext = { adapter: new Adapter(f.originalHeader), method: 'GET', path: '/paid', paymentHeader: f.originalHeader };
  f.calls.http++; f.initial = await f.http.processHTTPRequest(f.paidContext);
  assert.equal(f.initial.type, 'payment-error'); assert.equal(f.initial.response.status, 402);
  const pending = decodePaymentResponseHeader(getHeader(f.initial.response.headers)('PAYMENT-RESPONSE'));
  assert.equal(pending.success, false); assert.equal(pending.errorReason, 'settlement_pending');
  assert.equal(pending.transaction, HASH); assert.equal(f.calls.handler, 0);
  assert.equal(f.sdkTuples.length, 1);
  f.original = f.sdkTuples[0];
  f.originalRequirementsJson = JSON.stringify(f.original.requirements);
  assert.equal(JSON.stringify(f.original.payload), f.originalPayloadJson); assert.deepEqual(f.original.requirements, f.req);
  assert.deepEqual(f.calls, { schema: 2, verify: 1, first: 1, observer: 0, create: 1, http: 2, handler: 0 });
  const owner = f.bridge.getSnapshot().contexts[1].boundOwner;
  assert.equal(owner.verificationCalls, 1); assert.equal(owner.settlement.state, 'PENDING');
  assert.equal(owner.settlement.firstAuthorityConsumed, true);
  assert.equal(owner.settlement.publication.status, 'UNKNOWN');
  return f;
}
function continuationConfig(f, overrides = {}) {
  return {
    paymentPayload: f.original.payload, requirements: f.original.requirements,
    transportContext: f.original.transport,
    processSettlement: function (...args) {
      assert.equal(this, undefined); assert.equal(args.length, 7);
      assert.equal(args[0], f.original.payload); assert.equal(args[1], f.original.requirements);
      assert.equal(args[2], undefined); assert.equal(args[3], f.original.transport);
      assert.equal(args[4], undefined); assert.equal(args[5], undefined); assert.equal(args[6], 'before-handler');
      f.sdkContinuationCalls = (f.sdkContinuationCalls || 0) + 1;
      return f.http.processSettlement(...args);
    },
    ...overrides,
  };
}
async function resume(f) {
  const response = await f.continuation.resume();
  assert.ok(Object.isFrozen(response)); assert.ok(Object.isFrozen(response.settlement));
  assert.ok(Object.isFrozen(response.headers));
  const wire = decodePaymentResponseHeader(getHeader(response.headers)('PAYMENT-RESPONSE'));
  assert.equal(wire.success, response.settlement.success);
  assert.equal(wire.transaction, HASH); assert.equal(wire.network, f.req.network);
  if (response.settlement.success) f.calls.handler++;
  return response.settlement;
}
function continuationState(f, phase, positive) {
  const s = f.continuation.getSnapshot();
  assert.ok(Object.isFrozen(s)); assert.equal(s.phase, phase); assert.equal(s.active, false);
  assert.equal(s.sdkContinuationCalls, 1); assert.equal(s.positiveReplies, positive);
  assert.equal(s.referencesReleased, true); assert.equal(s.pendingReconciliations, 1);
  assert.equal(s.maxPendingReconciliations, 1); assert.equal(s.firstAuthorityConsumed, true);
  assert.equal(s.publication.uncertaintyRetained, true);
  assert.equal(s.persistence, 'MEMORY_ONLY'); assert.equal(s.recoveryAuthority, 'NONE');
  assert.equal(s.serviceDelivery, 'NOT_ESTABLISHED'); assert.equal(s.currentAuthority, 'NOT_ESTABLISHED');
  assert.equal(f.sdkContinuationCalls, 1); assert.equal(f.sdkTuples.length, 2);
  for (const tuple of f.sdkTuples) {
    assert.equal(tuple.payload, f.original.payload); assert.equal(tuple.requirements, f.original.requirements);
    assert.equal(tuple.transport, f.original.transport);
  }
}
function preserved(f) {
  assert.equal(f.paidContext.adapter.header, f.originalHeader); assert.equal(f.calls.create, 1);
  assert.equal(JSON.stringify(decodePaymentSignatureHeader(f.originalHeader)), f.originalPayloadJson);
  for (const item of f.callbackTuples) {
    assert.equal(item.texts[0], f.originalPayloadJson);
    assert.equal(item.texts[1], f.originalRequirementsJson); assert.equal(item.texts[2], f.challenges[1]);
  }
  assert.equal(networkCalls, 0);
}
function diagnostic(t, f, scenario) {
  const s = f.bridge.getSnapshot(), owner = s.contexts[1].boundOwner.settlement;
  t.diagnostic(JSON.stringify({ kind: 'OFFICIAL_X402_OWNED_CONTINUATION', version: 1, scenario,
    coreVersion: '2.23.0', zodVersion: '3.25.76', clientPayloadCreations: f.calls.create,
    sdkHttpRequests: f.calls.http, sdkBeforeSettlementCalls: f.sdkTuples.length,
    localVerifyCalls: f.calls.verify, localFirstCalls: f.calls.first, localObserverCalls: f.calls.observer,
    modeledHandlerCalls: f.calls.handler, positiveBridgeResponses: s.positiveSettlementResponses,
    originalHeaderStable: true, originalCallbackTupleStable: true,
    publicationUncertaintyRetained: owner.publication.uncertaintyRetained,
    declaredAcknowledgement: owner.publication.acknowledgementDeclared,
    firstAuthorityConsumed: owner.firstAuthorityConsumed, networkCalls, signatures: 0, replacements: 0,
    sameProcessOnly: true, phaseExplicit: true, automaticSdkRetry: false, nativeHelperSynthesized: false,
    providerReady: false, serviceDelivery: 'NOT_ESTABLISHED',
    continuationCalls: f.continuation.getSnapshot().sdkContinuationCalls,
    continuationPositiveReplies: f.continuation.getSnapshot().positiveReplies,
    continuationPhase: f.continuation.getSnapshot().phase,
    continuationReferencesReleased: f.continuation.getSnapshot().referencesReleased }));
}
async function pendingSuccess(t) {
  const f = await fixture(true);
  f.continuation = f.bridge.createPendingContinuation(continuationConfig(f));
  const pending = resume(f); // The library gates another caller synchronously.
  await assert.rejects(f.continuation.resume(), e => e.code === 'x402_selected_server_bridge_busy');
  const result = await pending;
  assert.equal(result.success, true); assert.equal(f.calls.handler, 1);
  await assert.rejects(f.continuation.resume(), e => e.code === 'x402_selected_server_bridge_stage_rejected');
  assert.throws(() => f.bridge.createPendingContinuation(continuationConfig(f)));
  assert.deepEqual([f.calls.verify, f.calls.first, f.calls.observer], [1,1,1]);
  continuationState(f, 'SUCCEEDED', 1); preserved(f); diagnostic(t, f, 'PENDING_SUCCESS');
}
async function pendingPending(t) {
  const f = await fixture(false);
  f.continuation = f.bridge.createPendingContinuation(continuationConfig(f));
  const result = await resume(f);
  assert.equal(result.success, false); assert.equal(result.errorReason, 'settlement_pending');
  await assert.rejects(f.continuation.resume(), e => e.code === 'x402_selected_server_bridge_stage_rejected');
  assert.throws(() => f.bridge.createPendingContinuation(continuationConfig(f)));
  assert.equal(f.calls.handler, 0);
  assert.deepEqual([f.calls.verify, f.calls.first, f.calls.observer], [1,1,1]);
  assert.equal(f.bridge.getSnapshot().contexts[1].boundOwner.settlement.state, 'PENDING');
  continuationState(f, 'PENDING_EXHAUSTED', 0); preserved(f); diagnostic(t, f, 'PENDING_PENDING');
}
async function contextDrift(t) {
  const f = await fixture(true), initial = JSON.stringify(f.bridge.getSnapshot());
  for (const override of [
    { paymentPayload: copy(f.original.payload) }, { requirements: copy(f.original.requirements) },
    { requirements: undefined }, { transportContext: undefined },
  ]) assert.throws(() => f.bridge.createPendingContinuation(continuationConfig(f, override)));
  assert.equal(JSON.stringify(f.bridge.getSnapshot()), initial);
  f.continuation = f.bridge.createPendingContinuation(continuationConfig(f));
  for (const args of [[undefined], [f.original.payload, f.original.requirements, f.original.transport]]) {
    await assert.rejects(f.continuation.resume(...args));
    assert.equal(f.continuation.getSnapshot().sdkContinuationCalls, 0);
  }
  const tx = f.original.payload.payload.transaction, request = f.original.transport.request;
  const edits = [
    [tx, 'signature', 'different-declared-signature'], [tx, 'hash', 'c'.repeat(64)],
    [f.original.payload.resource, 'url', URL + '/changed'],
    [f.original.requirements, 'amount', '2'], [request, 'method', 'POST'],
    [request, 'path', '/changed'], [request, 'paymentHeader', 'different-declared-header'],
    [f.original.transport, 'request', { ...request }],
  ];
  for (const [target, key, replacement] of edits) {
    const original = target[key]; target[key] = replacement;
    try {
      await assert.rejects(f.continuation.resume());
      assert.equal(JSON.stringify(f.bridge.getSnapshot()), initial);
      assert.equal(f.continuation.getSnapshot().sdkContinuationCalls, 0);
      assert.equal(f.sdkContinuationCalls || 0, 0);
    } finally { target[key] = original; }
  }
  f.original.transport.responseHeaders = {};
  try { await assert.rejects(f.continuation.resume()); }
  finally { delete f.original.transport.responseHeaders; }
  assert.equal(f.calls.observer, 0); assert.equal(f.calls.handler, 0);
  assert.equal((await resume(f)).success, true); assert.equal(f.calls.handler, 1);
  assert.deepEqual([f.calls.verify, f.calls.first, f.calls.observer], [1,1,1]);
  continuationState(f, 'SUCCEEDED', 1); preserved(f); diagnostic(t, f, 'CONTEXT_DRIFT');
}
after(() => {
  try {
    assert.deepEqual(sources(), initialSources); assert.equal(networkCalls, 0);
    assert.equal(globalThis.fetch, denyFetch);
  } finally { Object.defineProperty(globalThis, 'fetch', fetchDescriptor); }
});
test('official x402 wire-bound continuation preserves pending to success on the changed source', OPTIONS, pendingSuccess);
test('official x402 wire-bound continuation preserves pending to pending on the changed source', OPTIONS, pendingPending);
