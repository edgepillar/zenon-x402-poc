// Actual in-memory ledger and reader core with synthetic activation metadata.
// The trusted-record fixture does not authenticate funding or create proofs.
// Authentication ports are declared DATA; no real capability verification runs.
import assert from 'node:assert/strict';
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

check('original-grant-finds-the-persisted-identity-without-a-supplied-grant-id', () => {
  const f = fixture(), result = unchanged(f, () => f.model.readOriginalFundingGrant(f.original));
  assert.equal(result.status, 'RECORDED'); assert.equal(result.record.grantId, f.grant.grantId); noAuthority(result);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.record) && Object.isFrozen(result.originalFunding.chainProfile));
});
check('original-grant-missing-transaction-is-not-permission-for-a-new-payment', () => absent(fixture(), q => { q.transactionId = 'zenontx:' + 'b'.repeat(64); }));
check('original-grant-another-capability-cannot-find-the-original-holder-grant', () => absent(fixture(), q => { q.capabilityCommitment = digest('b'); }));
check('original-grant-a-foreign-holder-is-not-selected-by-the-same-transaction', () => absent(fixture(), q => { q.holderId = 'holder-2'; }));
check('original-grant-offer-id-is-an-exact-binding', () => absent(fixture(), q => { q.offerId = 'offer-2'; }));
check('original-grant-offer-version-is-an-exact-binding', () => absent(fixture(), q => { q.offerVersion = 2; }));
check('original-grant-another-network-cannot-reuse-the-transaction', () => absent(fixture(), q => { q.network = 'zenon:other'; }));
check('original-grant-reset-genesis-does-not-find-an-old-grant', () => absent(fixture(), q => { q.chainProfile.genesisMomentumHash = 'b'.repeat(64); }));
check('original-grant-another-chain-identifier-is-not-the-same-funding', () => absent(fixture(), q => { q.chainProfile.chainIdentifier = '101'; }));
check('original-grant-asset-is-an-exact-binding', () => absent(fixture(), q => { q.asset = 'asset-2'; }));
check('original-grant-payee-is-an-exact-binding', () => absent(fixture(), q => { q.payee = 'payee-2'; }));
check('original-grant-a-similar-amount-is-not-the-original-payment', () => absent(fixture(), q => { q.amount = '101'; }));
check('original-grant-resource-requirement-intent-and-funding-commitments-all-match', () => {
  const f = fixture(); for (const k of ['paymentResourceDigest', 'paymentRequirementDigest', 'paymentIntentDigest', 'grantFundingCommitment']) absent(f, q => { q[k] = digest('b'); });
});
check('original-grant-reading-after-expiry-does-not-refresh-or-claim-current-authority', () => {
  const f = fixture(); f.counters.time = 2000;
  const r = unchanged(f, () => f.model.readOriginalFundingGrant(f.original)); assert.equal(r.record.storedLifecycle, 'ACTIVE'); noAuthority(r);
});
check('original-grant-a-stored-expired-grant-remains-original-history', () => {
  const f = fixture(); f.counters.time = 2000; f.model.getGrant(f.grant.grantId);
  const r = unchanged(f, () => f.model.readOriginalFundingGrant(f.original)); assert.equal(r.record.storedLifecycle, 'EXPIRED'); noAuthority(r);
});
check('original-grant-revocation-does-not-erase-the-funded-original', () => {
  const f = fixture(); f.model.revokeGrant({ grantId: f.grant.grantId });
  const r = unchanged(f, () => f.model.readOriginalFundingGrant(f.original)); assert.equal(r.record.storedLifecycle, 'REVOKED'); noAuthority(r);
});
check('original-grant-held-request-units-are-observed-without-a-second-debit', () => {
  const f = fixture(); f.model.reserveRequest({ modelVersion: 1, grantId: f.grant.grantId, requestId: 'request-1', method: 'POST',
    routeId: 'api-1', canonicalBodyDigest: digest('c'), selectedContentType: 'application/json', maxCostUnits: 5 });
  const r = unchanged(f, () => f.model.readOriginalFundingGrant(f.original));
  assert.equal(r.record.heldUnits, 2); assert.equal(r.record.availableUnits, 98); assert.equal(r.record.consumedUnits, 0);
});
check('original-grant-repeated-queries-keep-identical-records-and-no-clock-or-price-calls', () => {
  const f = fixture(); unchanged(f, () => assert.deepEqual(f.model.readOriginalFundingGrant(f.original), f.model.readOriginalFundingGrant(f.original)));
});
check('original-grant-in-memory-state-reconstruction-keeps-the-exact-original', () => {
  const f = fixture(), raw = clone(f.model.exportState());
  const restored = InMemoryServiceCreditModel.fromState({ now() { throw Error('no current-time read'); }, deriveCost() { throw Error('no pricing'); } }, raw);
  assert.deepEqual(restored.readOriginalFundingGrant(f.original), f.model.readOriginalFundingGrant(f.original)); assert.deepEqual(restored.exportState(), raw);
});
check('original-grant-lookup-does-not-provide-another-activation-or-capability', () => {
  const f = fixture(); assert.throws(() => f.model.activateGrantFromTrustedRecord({ ...f.activation, transactionId: 'zenontx:' + 'd'.repeat(64) }));
  const r = unchanged(f, () => f.model.readOriginalFundingGrant(f.original)); assert.equal(r.record.grantId, f.grant.grantId);
});
check('original-grant-missing-extra-and-extra-argument-inputs-are-refused', () => {
  const f = fixture(), q = clone(f.original); delete q.amount;
  assert.throws(() => f.model.readOriginalFundingGrant(q)); assert.throws(() => f.model.readOriginalFundingGrant({ ...f.original, grantId: f.grant.grantId }));
  assert.throws(() => f.model.readOriginalFundingGrant(f.original, f.original));
});
check('original-grant-accessor-input-is-refused-without-running-a-hook', () => {
  const f = fixture(); let hooks = 0; const q = { ...f.original }; Object.defineProperty(q, 'amount', { enumerable: true, get() { hooks++; return '100'; } });
  assert.throws(() => f.model.readOriginalFundingGrant(q)); assert.equal(hooks, 0);
});
check('original-grant-proxy-or-accessor-chain-data-cannot-run-user-hooks', () => {
  const f = fixture(); let hooks = 0;
  const chain = new Proxy({}, { get() { hooks++; throw Error('forbidden'); }, ownKeys() { hooks++; throw Error('forbidden'); } });
  assert.throws(() => identity({ ...f.original, chainProfile: chain })); assert.equal(hooks, 0);
});
check('original-grant-noncanonical-hashes-or-line-breaks-are-refused', () => {
  const f = fixture(); for (const value of [f.original.transactionId + '\n', f.original.transactionId.toUpperCase()]) assert.throws(() => identity({ ...f.original, transactionId: value }));
  assert.throws(() => identity({ ...f.original, paymentIntentDigest: digest('a') + '\n' }));
});
check('original-grant-amount-and-chain-identifier-have-canonical-string-units', () => {
  const f = fixture(); for (const amount of ['0', '01', 100]) assert.throws(() => identity({ ...f.original, amount }));
  for (const chainIdentifier of [100, '0', '0100', '9007199254740992']) assert.throws(() => identity({ ...f.original, chainProfile: { ...f.original.chainProfile, chainIdentifier } }));
});

function coreFixture(options = {}) {
  const f = fixture(), events = [], selected = query({ queryVersion: 1, requestId: 'lookup-1', originalFunding: f.original });
  const proof = F({ proofVersion: 1, grantId: selected.request.grantId, requestId: 'lookup-1', publicKey: 'DECLARED_PUBLIC_KEY_DATA', maxCostUnits: 1, signature: 'DECLARED_SIGNATURE_DATA' });
  const verify = input => F({ verified: true, proofVersion: 1, grantId: input.request.grantId, requestId: input.request.requestId, maxCostUnits: 1 });
  let core;
  core = reader({ verifyCapability: F(input => { events.push('verify'); assert.deepEqual(input.request, selected.request);
    return options.verify ? options.verify(input, core, verify) : verify(input); }),
    readOriginalFundingGrant: F(input => { events.push('read'); assert.deepEqual(input, f.original);
      return options.read ? options.read(input, core, f) : f.model.readOriginalFundingGrant(input); }) });
  return { ...f, events, core, selected, proof, run() { return core.read(selected.query, proof); } };
}
check('original-grant-reader-verifies-the-fixed-query-scope-before-its-one-store-read', () => {
  const f = coreFixture(), r = f.run(); assert.deepEqual(f.events, ['verify', 'read']); assert.equal(r.record.grantId, f.grant.grantId); noAuthority(r);
});
check('original-grant-reader-a-false-verification-does-not-read-any-store', () => {
  const f = coreFixture({ verify(input, c, valid) { return F({ ...valid(input), verified: false }); } }); assert.throws(f.run); assert.deepEqual(f.events, ['verify']);
});
check('original-grant-reader-a-rejected-proof-cannot-read-and-does-not-poison-later-valid-input', () => {
  let first = true; const f = coreFixture({ verify(input, c, valid) { if (first) { first = false; throw Error('declared refusal'); } return valid(input); } });
  assert.throws(f.run); assert.equal(f.core.inspect().held, false); assert.equal(f.run().record.grantId, f.grant.grantId);
});
check('original-grant-reader-real-ledger-grant-ids-cannot-replace-the-lookup-proof-scope', () => {
  const f = coreFixture(); assert.throws(() => f.core.read(f.selected.query, { ...f.proof, grantId: f.grant.grantId })); assert.deepEqual(f.events, []);
  assert.ok(!/^grant_[0-9a-f]{64}$/.test(f.selected.request.grantId));
});
check('original-grant-reader-query-method-route-and-body-digest-are-closed-data', () => {
  const f = coreFixture(); assert.equal(f.selected.request.method, 'GET'); assert.equal(f.selected.request.routeId, 'original-funding-grant-read-v1');
  assert.throws(() => query({ ...f.selected.query, method: 'POST' }));
  const other = query({ ...f.selected.query, originalFunding: { ...f.original, paymentIntentDigest: digest('b') } });
  assert.notEqual(other.request.canonicalBodyDigest, f.selected.request.canonicalBodyDigest);
});
check('original-grant-reader-every-query-binding-is-covered-by-the-request-context', () => {
  const f = coreFixture(); const other = query({ ...f.selected.query, originalFunding: { ...f.original, chainProfile: { ...f.original.chainProfile, genesisMomentumHash: 'b'.repeat(64) } } });
  assert.notEqual(other.request.canonicalBodyDigest, f.selected.request.canonicalBodyDigest); assert.equal(f.core.inspect().storeReads, 0);
});
check('original-grant-reader-proof-request-id-mismatch-precedes-verification-and-read', () => {
  const f = coreFixture(); assert.throws(() => f.core.read(f.selected.query, { ...f.proof, requestId: 'lookup-2' })); assert.deepEqual(f.events, []);
});
check('original-grant-reader-a-verified-different-scope-cannot-authorize-this-lookup', () => {
  const f = coreFixture({ verify(input, c, valid) { return F({ ...valid(input), grantId: 'another-scope' }); } }); assert.throws(f.run); assert.equal(f.core.inspect().storeReads, 0);
});
check('original-grant-reader-pending-verification-is-held-without-a-store-read', async () => {
  let resolve; const pending = new Promise(r => { resolve = r; }); const f = coreFixture({ verify() { return pending; } });
  assert.throws(f.run); assert.equal(f.core.inspect().lifecycle, 'HELD'); resolve(F({ verified: true })); await Promise.resolve(); assert.throws(f.run); assert.equal(f.core.inspect().storeReads, 0);
});
check('original-grant-reader-a-verifier-thenable-hook-is-never-invoked', () => {
  let hooks = 0; const value = Object.defineProperty({}, 'then', { get() { hooks++; throw Error('must not run'); } });
  const f = coreFixture({ verify() { return value; } }); assert.throws(f.run); assert.equal(hooks, 0); assert.equal(f.core.inspect().storeReads, 0);
});
check('original-grant-reader-store-failure-is-sticky-and-not-retried', () => {
  const f = coreFixture({ read() { throw Error('declared store failure'); } }); assert.throws(f.run); assert.equal(f.core.inspect().lifecycle, 'HELD'); assert.throws(f.run); assert.equal(f.core.inspect().storeReads, 1);
});
check('original-grant-reader-a-pending-store-read-cannot-produce-a-late-accepted-result', async () => {
  let resolve; const pending = new Promise(r => { resolve = r; }), f = coreFixture({ read() { return pending; } });
  assert.throws(f.run); resolve(f.model.readOriginalFundingGrant(f.original)); await Promise.resolve(); assert.equal(f.core.inspect().lifecycle, 'HELD'); assert.throws(f.run); assert.equal(f.core.inspect().storeReads, 1);
});
check('original-grant-reader-store-thenables-cannot-run-hooks-or-start-another-read', () => {
  let hooks = 0; const value = Object.defineProperty({}, 'then', { get() { hooks++; throw Error('must not run'); } });
  const f = coreFixture({ read() { return value; } }); assert.throws(f.run); assert.equal(hooks, 0); assert.equal(f.core.inspect().lifecycle, 'HELD');
});
check('original-grant-reader-another-original-result-is-refused-before-output', () => {
  const f = coreFixture({ read(input, c, data) { const actual = data.model.readOriginalFundingGrant(input); return F({ ...actual, originalFunding: F({ ...input, amount: '101' }) }); } });
  assert.throws(f.run); assert.equal(f.core.inspect().lifecycle, 'HELD');
});
check('original-grant-reader-result-flags-cannot-convert-history-into-authority', () => {
  const f = coreFixture({ read(input, c, data) { return F({ ...data.model.readOriginalFundingGrant(input), mayDispatchService: true }); } });
  assert.throws(f.run); assert.equal(f.core.inspect().lifecycle, 'HELD');
});
check('original-grant-reader-close-during-verification-prevents-the-store-read', () => {
  const f = coreFixture({ verify(input, c, valid) { c.close(); return valid(input); } }); assert.throws(f.run); assert.equal(f.core.inspect().storeReads, 0); assert.equal(f.core.inspect().lifecycle, 'HELD');
});
check('original-grant-reader-close-during-store-read-prevents-an-accepted-result', () => {
  const f = coreFixture({ read(input, c, data) { c.close(); return data.model.readOriginalFundingGrant(input); } });
  assert.throws(f.run); assert.equal(f.core.inspect().lifecycle, 'HELD'); assert.equal(f.core.inspect().storeReads, 1);
});
check('original-grant-reader-verification-reentry-does-not-gain-a-store-read', () => {
  const f = coreFixture({ verify(input, c, valid) { assert.throws(() => c.read(input, input)); return valid(input); } });
  assert.throws(f.run); assert.equal(f.core.inspect().lifecycle, 'HELD'); assert.equal(f.core.inspect().storeReads, 0);
});
check('original-grant-reader-store-reentry-is-held-with-only-one-read', () => {
  const f = coreFixture({ read(input, c, data) { assert.throws(() => c.read(input, input)); return data.model.readOriginalFundingGrant(input); } });
  assert.throws(f.run); assert.equal(f.core.inspect().lifecycle, 'HELD'); assert.equal(f.core.inspect().storeReads, 1);
});
check('original-grant-reader-close-is-logical-and-never-closes-the-borrowed-store', () => {
  const f = coreFixture(); assert.equal(f.core.close(), undefined); assert.equal(f.core.close(), undefined); assert.throws(f.run);
  assert.deepEqual(f.events, []); assert.equal(f.core.inspect().storeOwnership, 'BORROWED_NEVER_CLOSED'); assert.equal(f.core.inspect().lifecycle, 'CLOSED');
  assert.equal(captureResult(f.model.readOriginalFundingGrant(f.original), f.original).record.grantId, f.grant.grantId);
});

const cases = [];
for (const { id, run } of checks) {
  try { await run(); cases.push({ id, status: 'PASS' }); }
  catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? 'unknown').slice(0, 256) }); }
}
const failed = cases.filter(c => c.status === 'FAIL').length;
console.log(JSON.stringify({ qualification: 'G2_ORIGINAL_FUNDING_GRANT_LOOKUP_DATA', passed: cases.length - failed, failed, cases,
  actualInMemoryModelAndReaderCore: true, activationFixtures: 'DECLARED_TRUSTED_RECORD_METADATA_ONLY', capabilityVerification: 'DECLARED_PORT_ONLY',
  nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
  authenticatedFunding: false, nativeGrantReaderExecuted: false, nativePhysicalRelease: 'NOT_ESTABLISHED', LinuxAcceptance: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;
