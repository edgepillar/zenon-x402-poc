// Actual in-memory ledger and reader core with synthetic activation metadata.
// The trusted-record fixture does not authenticate funding or create proofs.
// Authentication ports are declared DATA; no real capability verification runs.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { canonicalJson } from '../src/canonical.js';
import { captureOriginalFundingGrantRoute as route, createOriginalFundingGrantWireRequest as wire, captureOriginalFundingGrantHttpsRequest as captureRequest, createOriginalFundingGrantHttpFrame as frame, captureOriginalFundingGrantHttpResponse as captureResponse } from '../src/service-credit-original-grant-http-binding.js';
import { createOriginalFundingGrantHttpReaderCore as http } from '../src/service-credit-original-grant-http-reader-core.js';
import { createFundingPostNativeResponseCustody as postCustody, createOriginalFundingGrantNativeResponseCustody as queryCustody } from '../src/service-credit-funding-post-native-response.js';
import { InMemoryServiceCreditModel } from '../src/service-credit-model.js';
import { captureServiceCreditOriginalFundingIdentity as identity,
  captureServiceCreditOriginalFundingGrantQuery as query,
  captureServiceCreditOriginalFundingGrantResult as captureResult } from '../src/service-credit-original-funding-grant.js';
import { createServiceCreditOriginalFundingGrantReaderCore as reader } from '../src/service-credit-original-funding-grant-reader-core.js';

const F = Object.freeze, checks = [], digest = c => 'sha256:' + c.repeat(64);
function check(id, run) { checks.push({ id, run }); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function fixture() {
  const counters = { now: 0, pricing: 0, time: 100 };
  const model = new InMemoryServiceCreditModel({ now() { counters.now++; return counters.time; }, deriveCost() { counters.pricing++; return 2; } });
  const offer = { modelVersion: 1, providerId: 'provider-1', serviceId: 'service-1', resourceId: 'resource-1',
    resourceBinding: digest('1'), offerId: 'offer-1', offerVersion: 1, costPolicyId: 'cost-1', fundingPolicyId: 'funding-1', fundingPolicyVersion: 1 };
  model.registerOffer(offer);
  const activation = { activationVersion: 2, authorityProfileId: 'declared-authority', authorityProfileVersion: 1,
    verifierVersion: 1, authorityRecordDigest: digest('2'), fundingPolicyId: offer.fundingPolicyId, fundingPolicyVersion: 1,
    sourceSettlementId: 'declared-settlement', transactionId: 'zenontx:' + '3'.repeat(64), providerId: offer.providerId,
    serviceId: offer.serviceId, resourceId: offer.resourceId, resourceBinding: offer.resourceBinding, offerId: offer.offerId,
    offerVersion: offer.offerVersion, holderId: 'holder-1', capabilityCommitment: digest('4'), totalUnits: 100,
    expiresAt: 1000, scheme: 'exact', paymentFlow: 'upfront', network: 'zenon:testnet',
    chainProfile: { version: 1, chainIdentifier: '100', genesisMomentumHash: '5'.repeat(64) },
    asset: 'asset-1', amount: '100', payee: 'payee-1', payer: 'holder-1', paymentResourceDigest: digest('6'),
    paymentRequirementDigest: digest('7'), paymentIntentDigest: digest('8'), grantFundingCommitment: digest('9'),
    evidenceVersion: 1, inclusionAuthorizationDigest: digest('a'), evidenceState: 'MOMENTUM_INCLUDED',
    confirmationPolicy: { policyId: 'zenon.authenticated-momentum-inclusion', policyVersion: 1, minimumConfirmations: 2 } };
  const grant = model.activateGrantFromTrustedRecord(activation);
  const original = identity(Object.fromEntries(['transactionId', 'network', 'chainProfile', 'asset', 'amount', 'payee', 'offerId', 'offerVersion',
    'holderId', 'capabilityCommitment', 'paymentResourceDigest', 'paymentRequirementDigest', 'paymentIntentDigest', 'grantFundingCommitment'].map(k => [k, activation[k]])));
  counters.now = counters.pricing = 0; return { model, offer, activation, grant, original, counters };
}
function unchanged(f, run) {
  const before = JSON.stringify(f.model.exportState()), now = f.counters.now, pricing = f.counters.pricing;
  const value = run(); assert.equal(JSON.stringify(f.model.exportState()), before);
  assert.equal(f.counters.now, now); assert.equal(f.counters.pricing, pricing); return value;
}
function noAuthority(value) {
  assert.equal(value.reconciliationRequired, true); assert.equal(value.historicalObservation, true);
  for (const k of ['mayStartPayment', 'maySignPayment', 'mayDispatchService', 'mayActivateGrant']) assert.equal(value[k], false);
  assert.equal(value.authority, 'NONE'); assert.equal(value.grantAuthority, 'NOT_REVALIDATED');
  assert.equal(value.deliveryLiability, 'NOT_QUERIED'); assert.equal(value.spendingReservation, 'UNCHANGED');
}
function absent(f, change) {
  const value = clone(f.original); change(value); const result = unchanged(f, () => f.model.readOriginalFundingGrant(value));
  assert.equal(result.status, 'NOT_RECORDED'); assert.equal(result.record, null); noAuthority(result);
}

function channel(options = {}) {
  const f = fixture(), selected = route('https://provider.example/funding', f.original.paymentResourceDigest);
  const q = { queryVersion: 1, requestId: 'query-1', originalFunding: f.original };
  const scope = query(q), p = { proofVersion: 1, grantId: scope.request.grantId, requestId: q.requestId,
    publicKey: 'declared-public-key', maxCostUnits: 1, signature: 'declared-proof-data' };
  const events = [];
  const core = reader({ verifyCapability: F(input => {
    events.push('verify'); if (options.badProof) throw new Error('declared refusal');
    return F({ verified: true, proofVersion: 1, grantId: input.request.grantId, requestId: input.request.requestId, maxCostUnits: 1 });
  }), readOriginalFundingGrant: F(input => {
    events.push('read'); if (options.badStore) throw new Error('declared store failure');
    return f.model.readOriginalFundingGrant(input);
  }) });
  const server = http(selected, core);
  function request(qi = q, pi = p) {
    const w = wire(selected, qi, pi);
    return { method: 'GET', url: selected.requestTarget, httpVersion: '1.1',
      rawHeaders: ['Host', selected.authority, 'Connection', 'close', ...Object.entries(w.headers).flat()] };
  }
  return { ...f, selected, q, p, core, server, events, request };
}
function response(value) { return { statusCode: value.statusCode, rawHeaders: ['Content-Type', value.contentType, ...Object.entries(value.headers).flat()], body: value.body }; }
function rewrite(request, key, value) { const i = request.rawHeaders.findIndex(h => h.toLowerCase() === key.toLowerCase()); assert.ok(i >= 0); request.rawHeaders[i + 1] = value; }
function refuseBeforeRead(edit) {
  const c = channel(), req = c.request(); edit(req, c);
  assert.equal(c.server.handle(req).statusCode, 400); assert.deepEqual(c.events, []); assert.equal(c.core.inspect().storeReads, 0);
}
check('channel-canonical-provider-holder-ledger-roundtrip-finds-existing-grant', () => {
  const c = channel(), before = JSON.stringify(c.model.exportState());
  const result = unchanged(c, () => captureResponse(response(c.server.handle(c.request())), c.original));
  assert.equal(result.record.grantId, c.grant.grantId); noAuthority(result); assert.deepEqual(c.events, ['verify', 'read']);
  assert.equal(JSON.stringify(c.model.exportState()), before); assert.equal(c.server.inspect().accepted, 1);
});
check('channel-not-recorded-keeps-reconciliation-and-reservation', () => {
  const c = channel(); c.q.originalFunding = { ...c.original, transactionId: 'zenontx:' + 'b'.repeat(64) }; c.p.grantId = query(c.q).request.grantId;
  const result = captureResponse(response(c.server.handle(c.request())), c.q.originalFunding);
  assert.equal(result.status, 'NOT_RECORDED'); noAuthority(result);
});
check('channel-read-after-clock-expiry-does-not-refresh-ledger', () => {
  const c = channel(); c.counters.time = 2000;
  const result = unchanged(c, () => captureResponse(response(c.server.handle(c.request())), c.original));
  assert.equal(result.record.storedLifecycle, 'ACTIVE'); noAuthority(result);
});
check('channel-stored-revocation-is-history-with-no-reactivation', () => {
  const c = channel(); c.model.revokeGrant({ grantId: c.grant.grantId });
  const result = unchanged(c, () => captureResponse(response(c.server.handle(c.request())), c.original));
  assert.equal(result.record.storedLifecycle, 'REVOKED'); noAuthority(result);
});
check('channel-exact-query-repetition-does-not-consume-units', () => {
  const c = channel(); unchanged(c, () => assert.deepEqual(c.server.handle(c.request()), c.server.handle(c.request())));
  assert.equal(c.core.inspect().storeReads, 2);
});
check('channel-wrong-method-rejected-before-authentication', () => refuseBeforeRead(r => { r.method = 'POST'; }));
check('channel-wrong-path-rejected-before-authentication', () => refuseBeforeRead(r => { r.url = '/funding'; }));
check('channel-query-string-rejected-before-authentication', () => refuseBeforeRead(r => { r.url += '?retry=1'; }));
check('channel-wrong-host-rejected-before-authentication', () => refuseBeforeRead(r => rewrite(r, 'Host', 'other.example')));
check('channel-http-version-rejected-before-authentication', () => refuseBeforeRead(r => { r.httpVersion = '2.0'; }));
check('channel-body-length-rejected-before-authentication', () => refuseBeforeRead(r => rewrite(r, 'Content-Length', '1')));
check('channel-chunked-body-rejected-before-authentication', () => refuseBeforeRead(r => { r.rawHeaders.push('Transfer-Encoding', 'chunked'); }));
check('channel-duplicate-host-rejected-before-authentication', () => refuseBeforeRead((r, c) => { r.rawHeaders.push('host', c.selected.authority); }));
check('channel-duplicate-proof-rejected-before-authentication', () => refuseBeforeRead(r => { r.rawHeaders.push('authorization', r.rawHeaders.at(-1)); }));
check('channel-payment-header-rejected-before-authentication', () => refuseBeforeRead(r => { r.rawHeaders.push('PAYMENT-SIGNATURE', 'declared'); }));
check('channel-keepalive-rejected-before-authentication', () => refuseBeforeRead(r => rewrite(r, 'Connection', 'keep-alive')));
check('channel-foreign-resource-rejected-before-proof-or-store', () => refuseBeforeRead((r, c) => {
  const q = { ...c.q, originalFunding: { ...c.original, paymentResourceDigest: digest('f') } };
  rewrite(r, 'Original-Funding-Query', Buffer.from(canonicalJson(q)).toString('base64url'));
}));
check('channel-padding-alias-rejected-before-proof-or-store', () => refuseBeforeRead(r => { const i = r.rawHeaders.indexOf('Original-Funding-Query'); r.rawHeaders[i + 1] += '='; }));
check('channel-noncanonical-json-rejected-before-proof-or-store', () => refuseBeforeRead((r, c) => rewrite(r, 'Original-Funding-Query', Buffer.from(JSON.stringify(c.q, null, 1)).toString('base64url'))));
check('channel-wrong-proof-read-scope-rejected-before-verifier', () => {
  const c = channel(); assert.throws(() => wire(c.selected, c.q, { ...c.p, grantId: c.grant.grantId })); assert.deepEqual(c.events, []);
});
check('channel-wrong-proof-cost-is-not-a-debit-authority', () => { const c = channel(); assert.throws(() => wire(c.selected, c.q, { ...c.p, maxCostUnits: 2 })); });
check('channel-wrong-proof-request-id-is-rejected', () => { const c = channel(); assert.throws(() => wire(c.selected, c.q, { ...c.p, requestId: 'other' })); });
check('channel-invalid-capability-never-enters-store', () => {
  const c = channel({ badProof: true }); assert.equal(c.server.handle(c.request()).statusCode, 401);
  assert.deepEqual(c.events, ['verify']); assert.equal(c.server.inspect().held, false);
});
check('channel-store-uncertainty-latches-service-unavailable', () => {
  const c = channel({ badStore: true }); assert.equal(c.server.handle(c.request()).statusCode, 503);
  assert.equal(c.server.handle(c.request()).statusCode, 503); assert.deepEqual(c.events, ['verify', 'read']); assert.equal(c.server.inspect().held, true);
});
check('channel-logical-retirement-never-closes-or-clears-ledger', () => {
  const c = channel(); unchanged(c, () => { c.server.close(); c.server.close(); });
  assert.equal(c.server.handle(c.request()).statusCode, 503); assert.equal(c.core.inspect().storeOwnership, 'BORROWED_NEVER_CLOSED');
  assert.equal(c.model.readOriginalFundingGrant(c.original).status, 'RECORDED');
});
check('channel-proxy-request-does-not-run-traps', () => { const c = channel(); let calls = 0;
  assert.equal(c.server.handle(new Proxy({}, { getOwnPropertyDescriptor() { calls++; throw Error(); } })).statusCode, 400); assert.equal(calls, 0);
});
check('channel-request-accessor-is-not-invoked', () => { const c = channel(), r = c.request(); let calls = 0;
  Object.defineProperty(r, 'method', { get() { calls++; return 'GET'; } }); assert.equal(c.server.handle(r).statusCode, 400); assert.equal(calls, 0);
});
check('channel-sparse-raw-headers-are-rejected', () => refuseBeforeRead(r => { delete r.rawHeaders[2]; }));
check('channel-header-accessor-is-not-invoked', () => { const c = channel(), r = c.request(); let calls = 0;
  Object.defineProperty(r.rawHeaders, '1', { get() { calls++; return c.selected.authority; } }); assert.equal(c.server.handle(r).statusCode, 400); assert.equal(calls, 0);
});
check('channel-fixed-route-rejects-insecure-and-redirect-aliases', () => {
  for (const url of ['http://provider.example/funding', 'https://provider.example:443/funding', 'https://provider.example/funding?',
    'https://user@provider.example/funding', 'https://provider.example/other', 'https://provider.example/funding#x']) assert.throws(() => route(url, digest('6')));
});
check('channel-forged-selected-route-is-rejected', () => { const c = channel(); assert.throws(() => wire({ ...c.selected, queryUrl: 'https://other.example/query' }, c.q, c.p)); });
check('channel-resource-digest-rejects-line-ending-alias', () => { assert.throws(() => route('https://provider.example/funding', digest('6') + '\n')); });
check('channel-response-other-identity-cannot-reconcile-original', () => { const c = channel(), r = response(c.server.handle(c.request())); assert.throws(() => captureResponse(r, { ...c.original, amount: '101' })); });
check('channel-response-cannot-upgrade-history-to-economic-authority', () => {
  const c = channel(), r = response(c.server.handle(c.request())), body = JSON.parse(r.body); body.mayStartPayment = true;
  r.body = canonicalJson(body); rewrite({ rawHeaders: r.rawHeaders }, 'Content-Length', String(r.body.length)); assert.throws(() => captureResponse(r, c.original));
});
check('channel-response-noncanonical-or-truncated-body-is-rejected', () => {
  const c = channel(), r = response(c.server.handle(c.request())); assert.throws(() => captureResponse({ ...r, body: r.body + ' ' }, c.original));
  assert.throws(() => captureResponse({ ...r, body: r.body.slice(0, -1) }, c.original));
});
check('channel-response-cache-vary-and-length-are-mandatory', () => {
  const c = channel(), r = response(c.server.handle(c.request()));
  for (const [key, value] of [['Cache-Control', 'public'], ['Vary', 'Authorization'], ['Content-Length', '0'], ['Content-Type', 'text/html']]) {
    const b = clone(r); rewrite({ rawHeaders: b.rawHeaders }, key, value); assert.throws(() => captureResponse(b, c.original));
  }
});
check('channel-response-duplicate-header-or-encoding-is-rejected', () => {
  const c = channel(), r = response(c.server.handle(c.request()));
  for (const extra of [['Content-Length', String(r.body.length)], ['Content-Encoding', 'gzip'], ['Transfer-Encoding', 'chunked']])
    assert.throws(() => captureResponse({ ...r, rawHeaders: [...r.rawHeaders, ...extra] }, c.original));
});
check('channel-response-unknown-status-is-not-a-history-result', () => { const c = channel(), r = response(c.server.handle(c.request())); for (const statusCode of [301, 401, 503]) assert.throws(() => captureResponse({ ...r, statusCode }, c.original)); });
check('channel-composed-custody-canonical-response-retains-no-authority', () => {
  const c = channel(), r = c.server.handle(c.request()), custody = queryCustody(); custody.acceptTls();
  custody.acceptHeaders({ statusCode: r.statusCode, rawHeaders: response(r).rawHeaders }); custody.acceptChunk(Buffer.from(r.body));
  custody.acceptEnd(); custody.acceptRequestClose(); custody.acceptSocketClose({ hadError: false });
  const taken = custody.takeResponse(), result = captureResponse({ statusCode: taken.statusCode, rawHeaders: taken.headerPairs.flat(), body: taken.body.toString() }, c.original);
  noAuthority(result); assert.equal(result.record.grantId, c.grant.grantId);
});
function started(factory, count) { const c = factory(); c.acceptTls(); c.acceptHeaders({ statusCode: 200, rawHeaders: ['Content-Length', String(count)] }); return c; }
function finish(c) { c.acceptEnd(); c.acceptRequestClose(); c.acceptSocketClose({ hadError: false }); return c.takeResponse(); }
check('channel-legacy-post-custody-still-accepts-exactly-64-bytes', () => { const c = started(postCustody, 64); c.acceptChunk(Buffer.alloc(64)); assert.equal(finish(c).body.length, 64); assert.equal(c.snapshot().maxResponseBodyBytes, 64); });
check('channel-legacy-post-custody-still-rejects-65-byte-header', () => { assert.throws(() => started(postCustody, 65)); });
check('channel-query-custody-accepts-exactly-8192-independent-bytes', () => { const c = started(queryCustody, 8192), input = Buffer.alloc(8192, 1); c.acceptChunk(input); input.fill(2); assert.equal(finish(c).body[0], 1); assert.equal(c.snapshot().maxResponseBodyBytes, 8192); });
check('channel-query-custody-rejects-8193-before-body', () => { assert.throws(() => started(queryCustody, 8193)); });
check('channel-query-truncated-end-permanently-refuses-late-repair', () => { const c = started(queryCustody, 2); c.acceptChunk(Buffer.alloc(1)); assert.throws(() => c.acceptEnd()); assert.throws(() => c.acceptChunk(Buffer.alloc(1))); assert.throws(() => c.takeResponse()); assert.equal(c.snapshot().phase, 'UNKNOWN'); });
check('channel-query-timeout-before-body-keeps-late-result-unknown', () => { const c = started(queryCustody, 1); c.fail(); assert.throws(() => c.acceptChunk(Buffer.alloc(1))); assert.throws(() => c.takeResponse()); assert.equal(c.snapshot().unknown, true); });
check('channel-query-request-close-is-required-before-handoff', () => { const c = started(queryCustody, 0); c.acceptEnd(); c.acceptSocketClose({ hadError: false }); assert.throws(() => c.takeResponse()); assert.equal(c.snapshot().unknown, true); });
check('channel-query-error-socket-close-cannot-publish-history', () => { const c = started(queryCustody, 0); c.acceptEnd(); c.acceptRequestClose(); assert.throws(() => c.acceptSocketClose({ hadError: true })); assert.throws(() => c.takeResponse()); });
check('channel-query-response-can-be-taken-only-once', () => { const c = started(queryCustody, 0); finish(c); assert.throws(() => c.takeResponse()); });
check('channel-query-duplicate-or-encoded-headers-are-unknown', () => {
  for (const extra of [['Content-Length', '0'], ['Content-Encoding', 'gzip'], ['Transfer-Encoding', 'chunked']]) {
    const c = queryCustody(); c.acceptTls(); assert.throws(() => c.acceptHeaders({ statusCode: 200, rawHeaders: ['Content-Length', '0', ...extra] })); assert.equal(c.snapshot().unknown, true);
  }
});
check('channel-custody-size-is-a-closed-factory-not-caller-configuration', () => { assert.throws(() => postCustody(8192)); assert.throws(() => queryCustody(65536)); });

const cases = [];
for (const { id, run } of checks) {
  try { await run(); cases.push({ id, status: 'PASS' }); }
  catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? 'unknown').slice(0, 256) }); }
}
const failed = cases.filter(c => c.status === 'FAIL').length;
console.log(JSON.stringify({ qualification: 'G2_ORIGINAL_GRANT_CHANNEL_DATA', passed: cases.length - failed, failed, cases,
  actualInMemoryModelAndReaderCore: true, activationFixtures: 'DECLARED_TRUSTED_RECORD_METADATA_ONLY', capabilityVerification: 'DECLARED_PORT_ONLY',
  nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
  nativePhysicalRelease: 'NOT_ESTABLISHED', LinuxAcceptance: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;

