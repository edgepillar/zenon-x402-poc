// Actual pure expiry preparation, no-activation verifier binding and activation
// owner. Projector, authenticator, provider and stores are declared MEMORY DATA.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';
import { prepareZenonFundingResource, deriveZenonFundingObserverTarget } from '../src/service-credit-zenon-funding-evidence.js';
import { captureIssuedFundingActivationTime as time, createIssuedExpiredFundingPreparation as prepare,
  captureIssuedExpiredFundingResult as capture } from '../src/issued-expired-funding-preparation.js';
import { createIssuedFundingGrantActivationOwner as owner } from '../src/issued-funding-grant-activation-owner.js';

const F = Object.freeze, checks = [], HASH = 'c'.repeat(64), EXPIRES = 20000;
const clone = v => JSON.parse(JSON.stringify(v)), digest = x => 'sha256:' + x.repeat(64);
function check(id, run) { checks.push({ id, run }); }
function deep(v) { if (v !== null && typeof v === 'object') { for (const x of Object.values(v)) deep(x); F(v); } return v; }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function flush() { for (let i = 0; i < 24; i++) await Promise.resolve(); }
function context() {
  const resourceUrl = 'https://expired-funding.invalid/funding';
  const authorityProfile = { profileId: 'authority.synthetic', profileVersion: 1, verifierVersion: 1, recordDigest: digest('d'),
    network: 'zenon:testnet', chainProfile: { version: 1, chainIdentifier: '12345', genesisMomentumHash: '1'.repeat(64) },
    confirmationPolicy: { policyId: 'zenon.authenticated-momentum-inclusion', policyVersion: 1, minimumConfirmations: 2 } };
  const offer = { modelVersion: 1, providerId: 'provider.synthetic', serviceId: 'metered-api.v1', resourceId: 'resource.expired',
    resourceBinding: deriveServiceCreditResourceBinding({ resourceId: 'resource.expired', resourceUrl }), offerId: 'offer.synthetic', offerVersion: 1,
    costPolicyId: 'cost.fixed', fundingPolicyId: 'funding.exact', fundingPolicyVersion: 1 };
  const selection = { offerId: offer.offerId, offerVersion: 1, holderId: 'z1syntheticpayer', capabilityCommitment: digest('a') };
  const issued = prepareZenonFundingResource({ offer, selection, resourceUrl, authorityProfile, now: F(() => 1000),
    deriveFundingTerms: F(() => ({ fundingPolicyId: offer.fundingPolicyId, fundingPolicyVersion: 1, totalUnits: 100, expiresAt: EXPIRES,
      requirement: { scheme: 'exact', network: 'zenon:testnet', asset: 'zts1syntheticasset', amount: '100', payTo: 'z1syntheticpayee', maxTimeoutSeconds: 30,
        extra: { paymentFlow: 'upfront', poc: true, settlement: 'account-block', zenonChain: clone(authorityProfile.chainProfile), minimumMomentumConfirmations: 2 } } })) });
  const c = { offer: issued.offer, challenge: issued.challenge, authorityProfile, transactionHash: HASH, payer: selection.holderId, resourceUrl };
  const target = deriveZenonFundingObserverTarget(c);
  const verified = { evidenceVersion: 1, evidenceType: 'zenon-authenticated-funding-evidence', authorityProfileId: authorityProfile.profileId,
    authorityProfileVersion: 1, verifierVersion: 1, authorityRecordDigest: authorityProfile.recordDigest, network: target.network, chainProfile: clone(authorityProfile.chainProfile),
    ...Object.fromEntries(['transactionId', 'payer', 'payee', 'asset', 'amount', 'paymentResourceDigest', 'paymentRequirementDigest', 'paymentIntentDigest', 'resourceBinding',
      'offerId', 'offerVersion', 'fundingPolicyId', 'fundingPolicyVersion', 'capabilityCommitment', 'totalUnits', 'expiresAt', 'grantFundingCommitment'].map(k => [k, target[k]])),
    inclusionEvidence: { state: 'MOMENTUM_INCLUDED', transactionHash: HASH, momentumHeight: 100, momentumHash: 'e'.repeat(64), observedConfirmations: 2 },
    confirmationPolicy: clone(authorityProfile.confirmationPolicy) };
  const row = { status: 'BOUND', issue: { selection, resourceUrl, authorityRecord: 'SYNTHETIC_UNSIGNED_AUTHORITY_DATA', challenge: clone(issued.challenge),
    frame: { status: 402, paymentRequiredHeader: Buffer.from(canonicalJson(issued.challenge.paymentRequired)).toString('base64'), body: 'Payment Required' } },
    binding: { transactionHash: HASH, observerRecordKey: digest('7'), observerTarget: clone(target), observerInitialState: { declared: true } } };
  return { c, selection, verified, row, target };
}
function prepared(options = {}) {
  const f = context(), s = { projects: 0, verifies: 0, now: EXPIRES + 1 };
  const clock = F(() => s.now), t = time(EXPIRES, clock);
  const p = { projectFundingEvidence: F(() => { s.projects++; return options.project ? options.project(f, s) : { evidenceVersion: 1, artifact: { declaredSynthetic: true } }; }),
    verifyFundingEvidence: F(candidate => { s.verifies++; return options.verify ? options.verify(f, s, candidate) : Promise.resolve(f.verified); }) };
  const result = prepare(f.c, t, F(p)); return { f, s, p, t, result, clock };
}
function application(options = {}) {
  const f = context(), s = { phase: 'OPEN', rows: [f.row], projects: 0, verifies: 0, prepares: 0, admissions: 0, closes: 0, now: EXPIRES };
  let root; const observer = F({ declaredObserver: true });
  function view() { return deep({ phase: s.phase, uncertain: false, admissionRevoked: false, activeOperations: 0, fundingBusy: false,
    serviceOpening: false, serviceAdmissionOpen: false, admittedGrantId: null, binding: { boundRetained: true, officialPhase: options.phase ?? 'SETTLED', transactionHash: HASH },
    funding: { intakeBound: true, active: false, held: false } }); }
  const port = F({ providerSnapshot: F(view), providerClose: F(() => { s.closes++; s.phase = 'CLOSED'; return Promise.resolve(undefined); }), loadBound: F(() => s.rows),
    prepareActivation: F((actual, selected) => {
      s.prepares++; assert.equal(actual, observer); assert.equal(selected.binding.transactionHash, HASH);
      if (options.prepare) return options.prepare(f, s, root);
      return prepare(f.c, time(EXPIRES, F(() => s.now)), F({
        projectFundingEvidence: F(() => { s.projects++; return { evidenceVersion: 1, artifact: { declaredSynthetic: true } }; }),
        verifyFundingEvidence: F(candidate => { s.verifies++; return options.verify ? options.verify(f, s, root, candidate) : Promise.resolve(f.verified); }),
      }));
    }), admitCommittedServiceGrant: F(() => { s.admissions++; assert.fail('No grant admission in an expired verification.'); }),
  });
  root = owner({ selection: f.selection, resourceUrl: f.c.resourceUrl, port }); return { f, s, root, observer };
}
async function held(f) { await assert.rejects(f.root.activateOriginalCommittedFunding(f.observer)); assert.equal(f.root.snapshot().held, true); await assert.rejects(f.root.close()); }

check('expired-time-classifies-before-at-and-after-original-deadline', () => {
  for (const [at, expired] of [[EXPIRES - 1, false], [EXPIRES, true], [EXPIRES + 1, true]]) {
    let reads = 0; const r = time(EXPIRES, F(() => { reads++; return at; })); assert.equal(r.expired, expired); assert.equal(r.observedAt, at); assert.equal(r.authority, 'NONE'); assert.equal(reads, 1);
  }
});
check('expired-time-rejects-invalid-clock-results-without-thenable-hooks', async () => {
  let hooks = 0; const v = Object.defineProperty({}, 'then', { get() { hooks++; throw Error(); } });
  for (const n of [NaN, Infinity, -1, -0, '20000', v]) assert.throws(() => time(EXPIRES, F(() => n)));
  const p = deferred(); assert.throws(() => time(EXPIRES, F(() => p.promise))); p.reject(Error('declared clock')); await flush(); assert.equal(hooks, 0);
});
check('expired-preparation-is-inert-and-accepts-no-grant-or-store-port', () => {
  const p = prepared(); assert.equal(p.s.projects + p.s.verifies, 0); assert.equal(p.result.status, 'VERIFY_EXPIRED_FUNDING');
  for (const name of ['activate', 'serviceStore', 'now', 'sign', 'payout']) assert.throws(() => prepare(p.f.c, p.t, F({ ...p.p, [name]: F(() => assert.fail()) })));
});
check('expired-preparation-cannot-select-a-nonexpired-original', () => {
  const p = prepared(); assert.throws(() => prepare(p.f.c, time(EXPIRES, F(() => EXPIRES - 1)), F(p.p)));
});
check('expired-verification-reuses-original-authenticator-with-no-grant-authority', async () => {
  const p = prepared(), r = await p.result.verify(); assert.equal(r.status, 'FUNDED_NO_NEW_GRANT'); assert.equal(p.s.projects, 1); assert.equal(p.s.verifies, 1);
  assert.equal(r.grantActivation, 'NOT_ENTERED_THIS_OPERATION'); assert.equal(r.grantExistence, 'NOT_QUERIED'); assert.equal(r.deliveryLiability, 'RECONCILIATION_REQUIRED');
  assert.equal(r.paymentAt, null); for (const key of ['mayStartPayment', 'maySignPayment', 'mayDispatchService', 'mayActivateGrant', 'mayStartCompensation']) assert.equal(r[key], false);
});
check('expired-verification-cannot-repeat-after-success-or-a-clock-regression', async () => {
  const p = prepared(); await p.result.verify(); p.s.now = 1; await assert.rejects(p.result.verify()); assert.equal(p.s.projects, 1); assert.equal(p.s.verifies, 1);
});
check('expired-verification-captures-original-context-before-project-and-await', async () => {
  const gate = deferred(), p = prepared({ project(f) { f.c.authorityProfile.profileId = 'changed'; f.c.challenge = null; return { evidenceVersion: 1, artifact: {} }; }, verify: () => gate.promise });
  const promise = p.result.verify(); gate.resolve(p.f.verified); const r = await promise; assert.equal(r.transactionHash, HASH); assert.equal(p.s.verifies, 1);
});
check('expired-verification-rejects-success-bound-and-cached-flags', async () => {
  for (const value of [{ success: true }, { status: 'BOUND' }, { status: 'CACHED_SUCCESS' }]) {
    const p = prepared({ verify: () => Promise.resolve(value) }); await assert.rejects(p.result.verify()); assert.equal(p.s.verifies, 1);
  }
});
check('expired-verification-rebinds-every-original-field-and-confirmation-policy', async () => {
  for (const key of ['authorityProfileId', 'authorityRecordDigest', 'network', 'transactionId', 'payer', 'payee', 'asset', 'amount',
    'paymentResourceDigest', 'paymentRequirementDigest', 'paymentIntentDigest', 'resourceBinding', 'offerId', 'offerVersion', 'fundingPolicyId', 'fundingPolicyVersion',
    'capabilityCommitment', 'totalUnits', 'expiresAt', 'grantFundingCommitment', 'chainProfile', 'confirmationPolicy']) {
    const p = prepared({ verify(f) { const v = clone(f.verified); if (key === 'chainProfile') v[key].chainIdentifier = '67890';
      else if (key === 'confirmationPolicy') v[key].minimumConfirmations = 3; else v[key] = typeof v[key] === 'number' ? v[key] + 1 : 'foreign'; return Promise.resolve(v); } });
    await assert.rejects(p.result.verify(), key);
  }
});
check('expired-verification-never-enters-project-context-getters', () => {
  const p = prepared(); let hooks = 0; const c = { ...p.f.c }; Object.defineProperty(c, 'challenge', { enumerable: true, get() { hooks++; throw Error(); } });
  assert.throws(() => prepare(c, p.t, F(p.p))); assert.throws(() => prepare(new Proxy(p.f.c, { get() { hooks++; throw Error(); } }), p.t, F(p.p))); assert.equal(hooks, 0);
});
check('expired-verification-rejects-promised-projector-and-custom-verifier-thenable', async () => {
  const gate = deferred(), p = prepared({ project: () => gate.promise }); await assert.rejects(p.result.verify()); gate.reject(Error('declared projector')); await flush(); assert.equal(p.s.verifies, 0);
  let hooks = 0; const q = prepared({ verify: () => Object.defineProperty({}, 'then', { get() { hooks++; throw Error(); } }) }); await assert.rejects(q.result.verify()); assert.equal(hooks, 0);
});
check('expired-receipt-cannot-claim-delivery-compensation-or-existing-grant-absence', async () => {
  const p = prepared(), r = await p.result.verify(), expected = F({ transactionHash: HASH, fundingCommitment: p.f.c.challenge.fundingCommitment, expiresAt: EXPIRES });
  for (const change of [v => v.grantExistence = 'NOT_RECORDED', v => v.serviceDelivery = 'DELIVERED', v => v.compensation = 'CONFIRMED',
    v => v.deliveryLiability = 'SATISFIED', v => v.mayActivateGrant = true, v => v.paymentAt = 1, v => v.transactionHash = 'a'.repeat(64), v => v.fundingCommitment = digest('f')]) {
    const v = clone(r); change(v); assert.throws(() => capture(F(v), expected));
  }
});
check('expired-owner-known-result-preserves-open-provider-and-never-enters-grant-admission', async () => {
  const f = application(), before = canonicalJson(f.s.rows), r = await f.root.activateOriginalCommittedFunding(f.observer);
  assert.equal(r.status, 'FUNDED_NO_NEW_GRANT'); assert.equal(f.root.snapshot().held, false); assert.equal(f.root.snapshot().activationEntered, false);
  assert.equal(f.root.snapshot().verificationEntered, true); assert.equal(f.root.snapshot().fundedWithoutGrantObserved, true); assert.equal(f.s.phase, 'OPEN');
  assert.equal(f.s.admissions, 0); assert.equal(canonicalJson(f.s.rows), before); await f.root.close(); assert.equal(f.s.closes, 1);
});
check('expired-owner-cannot-repeat-or-switch-to-mint-after-known-result', async () => {
  const f = application(); await f.root.activateOriginalCommittedFunding(f.observer); f.s.now = 1;
  await assert.rejects(f.root.activateOriginalCommittedFunding(f.observer)); assert.equal(f.s.prepares, 1); assert.equal(f.s.verifies, 1); assert.equal(f.s.admissions, 0); await f.root.close();
});
check('expired-owner-pending-official-phase-does-not-enter-verification', async () => {
  const f = application({ phase: 'PENDING' }), r = await f.root.activateOriginalCommittedFunding(f.observer);
  assert.equal(r.status, 'NOT_READY'); assert.equal(f.s.prepares + f.s.verifies, 0); await f.root.close();
});
check('expired-owner-authentication-failure-retains-held-and-one-close', async () => {
  const f = application({ verify: () => Promise.reject(Error('declared proof refusal')) }); await held(f); assert.equal(f.s.admissions, 0); assert.equal(f.s.closes, 1);
});
check('expired-owner-does-not-downgrade-a-normal-activation-error-to-known-funding', async () => {
  const f = application({ prepare: () => F({ status: 'READY', activate: F(() => Promise.reject(Error('declared activation result loss'))) }) });
  await held(f); assert.equal(f.root.snapshot().activationEntered, true); assert.equal(f.root.snapshot().fundedWithoutGrantObserved, false); assert.equal(f.s.verifies, 0);
});
check('expired-owner-close-during-verification-cannot-admit-late-success', async () => {
  const gate = deferred(), f = application({ verify: () => gate.promise }), pending = f.root.activateOriginalCommittedFunding(f.observer);
  await flush(); await assert.rejects(f.root.close()); gate.resolve(f.f.verified); await assert.rejects(pending);
  assert.equal(f.root.snapshot().fundedWithoutGrantObserved, false); assert.equal(f.s.admissions, 0); assert.equal(f.s.closes, 1);
});
check('expired-owner-row-drift-after-verification-is-held-with-original-records-untouched', async () => {
  const f = application({ verify(base, state) { state.rows = []; return Promise.resolve(base.verified); } }); await held(f); assert.equal(f.s.admissions, 0); assert.equal(f.root.snapshot().fundedWithoutGrantObserved, false);
});
check('expired-owner-never-invokes-an-opaque-prepared-verifier-getter', async () => {
  let hooks = 0; const f = application({ prepare() { const value = { status: 'VERIFY_EXPIRED_FUNDING' }; Object.defineProperty(value, 'verify', { enumerable: true, get() { hooks++; throw Error(); } }); return F(value); } });
  await held(f); assert.equal(hooks, 0); assert.equal(f.s.verifies + f.s.admissions, 0);
});

export const expiredOriginalFundingDataCases = F([...checks]);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = []; let current = null, reported = false;
  function report() { if (reported) return; reported = true; const failed = cases.filter(c => c.status === 'FAIL').length;
    console.log(JSON.stringify({ qualification: 'G1_G2_EXPIRED_ORIGINAL_FUNDING_DATA', passed: cases.length - failed, failed, cases,
      actualNoActivationVerifierBindingAndActivationOwner: true, projectVerifierProviderAndStorePorts: 'DECLARED_MEMORY_DATA', activationMetadata: 'SYNTHETIC_UNSIGNED_DATA',
      nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
      nativeFundingAuthentication: 'NOT_EXECUTED', paymentTime: 'NOT_ESTABLISHED', netDeliveryLiability: 'NOT_QUERIED', compensation: 'NOT_ESTABLISHED', physicalRelease: 'NOT_ESTABLISHED', LinuxAcceptance: 'NOT_ESTABLISHED', G1G2: 'OPEN' })); if (failed) process.exitCode = 1; }
  function unsettled() { if (current !== null) { cases.push({ id: current, status: 'FAIL', error: 'UNSETTLED_DECLARED_DATA_PROMISE' }); report(); } }
  process.once('beforeExit', unsettled); for (const { id, run } of checks) { current = id; try { await run(); cases.push({ id, status: 'PASS' }); } catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? 'unknown').slice(0, 256) }); } current = null; }
  process.off('beforeExit', unsettled); report();
}
