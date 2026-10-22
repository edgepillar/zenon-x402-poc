/*
 * Six selected fixed-policy cases over the actual funding-resource consumer
 * and actual in-memory model. No old test entry is imported. No SQLite, key,
 * signature, verifier/source operation, socket, real PREPARE, payment, grant
 * activation or live pilot. Synthetic terms below are NOT operator choices.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFixedZenonFundingPolicy as CREATE } from '../src/service-credit-zenon-fixed-funding-policy.js';
import { InMemoryServiceCreditModel } from '../src/service-credit-model.js';
import { createZenonFundingEvidenceActivation as ACTIVATION } from '../src/service-credit-zenon-funding-evidence.js';
import { canonicalJson } from '../src/canonical.js';

assert.equal(process.argv.length, 2);
const OPTIONS = { timeout: 5000, concurrency: false }, NOW = 2000000000000;
const RESOURCE = 'https://service.example/credits/zenon-fund';
const clone = value => JSON.parse(JSON.stringify(value)); // Owned fixture DATA.
const digest = fill => 'sha256:' + fill.repeat(64);
const totals = { configuredPolicies: 0, models: 0, consumers: 0, resourceAttempts: 0,
  issuedCandidates: 0, rejectedActivationCalls: 0, verifierCalls: 0, deriveCostCalls: 0,
  modelClockCalls: 0, fundingClockCalls: 0, hooks: 0 };
function configuration(version = 1) {
  const offer = { modelVersion: 1, providerId: 'provider.reference', serviceId: 'service.reference',
    resourceId: 'resource.zenon.funding', resourceBinding: 'sha256:' + createHash('sha256')
      .update('zenon-x402-service-credit-resource-binding-v1\0')
      .update(canonicalJson({ resourceId: 'resource.zenon.funding', resourceUrl: RESOURCE })).digest('hex'),
    offerId: 'offer.zenon.reference', offerVersion: version, costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.zenon.fixed', fundingPolicyVersion: version };
  return { offer, selection: { offerId: offer.offerId, offerVersion: version,
    holderId: 'z1syntheticpayer', capabilityCommitment: digest('a') },
    terms: { fundingPolicyId: offer.fundingPolicyId, fundingPolicyVersion: version,
      totalUnits: version === 1 ? 10 : 12, expiresAt: NOW + (version === 1 ? 10000 : 20000),
      requirement: { scheme: 'exact', network: 'zenon:testnet', asset: 'zts1syntheticasset',
        amount: version === 1 ? '7' : '8', payTo: 'z1syntheticpayee', maxTimeoutSeconds: 30,
        extra: { paymentFlow: 'upfront', poc: true, settlement: 'account-block',
          zenonChain: { version: 1, chainIdentifier: '12345', genesisMomentumHash: '1'.repeat(64) },
          minimumMomentumConfirmations: 2 } } } };
}
function input(config) {
  return { offer: clone(config.offer), holderId: config.selection.holderId,
    capabilityCommitment: config.selection.capabilityCommitment };
}
function policy(config) { const result = CREATE(config); totals.configuredPolicies++; return result; }
function frozen(value) {
  if (value !== null && typeof value === 'object') {
    assert.equal(Object.isFrozen(value), true); for (const child of Object.values(value)) frozen(child);
  }
}
function rejected(kind = 'input_rejected') {
  return error => {
    const code = 'service_credit_zenon_fixed_funding_policy_' + kind;
    assert.ok(error instanceof TypeError && Object.isFrozen(error));
    assert.equal(error.code, code); assert.equal(error.message, code);
    assert.equal(error.stack, 'TypeError: ' + code); assert.equal(Object.hasOwn(error, 'cause'), false);
    return true;
  };
}
function owner(config, fixedPolicy, existingModel = null) {
  const model = existingModel || new InMemoryServiceCreditModel({
    deriveCost() { totals.deriveCostCalls++; throw Error('UNEXPECTED_COST'); },
    now() { totals.modelClockCalls++; throw Error('UNEXPECTED_MODEL_CLOCK'); },
  });
  if (existingModel === null) totals.models++;
  model.registerOffer(config.offer);
  const state = { now: NOW };
  const activation = ACTIVATION({ store: model, deriveFundingTerms: fixedPolicy,
    verifyFundingEvidence() { totals.verifierCalls++; throw Error('UNEXPECTED_VERIFIER'); },
    authorityProfile: { profileId: 'authority.zenon.synthetic', profileVersion: 1, verifierVersion: 1,
      recordDigest: digest('d'), network: 'zenon:testnet',
      chainProfile: clone(config.terms.requirement.extra.zenonChain),
      confirmationPolicy: { policyId: 'zenon.authenticated-momentum-inclusion',
        policyVersion: 1, minimumConfirmations: 2 } },
    now() { totals.fundingClockCalls++; return state.now; } });
  totals.consumers++;
  return { activation, model, state, config };
}
function issue(f, selection = f.config.selection, resourceUrl = RESOURCE) {
  totals.resourceAttempts++; assert.ok(totals.resourceAttempts <= 8);
  const result = f.activation.createFundingResource({ selection, resourceUrl });
  totals.issuedCandidates++; return result;
}
function consumerRejected(error) {
  assert.equal(error.code, 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED'); return true;
}
function unchangedModel(f, before) {
  assert.deepEqual(f.model.exportState(), before);
  assert.equal(f.model.exportState().grants.length, 0);
}
test('fixed funding policy returns one captured frozen synchronous terms record without caller mutation or rolling expiry', OPTIONS, () => {
  const config = configuration(), original = clone(config), p = policy(config), selected = input(original);
  assert.equal(typeof p, 'function'); assert.equal(Object.isFrozen(p), true); assert.equal(p.length, 1);
  const first = p(selected); frozen(first); assert.deepEqual(first, original.terms);
  config.offer.costPolicyId = 'changed'; config.selection.holderId = 'other';
  config.terms.totalUnits = 999; config.terms.expiresAt += 100000;
  config.terms.requirement.amount = '999'; config.terms.requirement.extra.zenonChain.chainIdentifier = '1';
  assert.equal(p(input(original)), first); assert.equal(first.expiresAt, NOW + 10000);
  assert.equal(Object.isFrozen(config), false); assert.equal(Object.isFrozen(config.terms), false);
  assert.equal(typeof first.then, 'undefined'); assert.equal(Object.getPrototypeOf(first), Object.prototype);
});
test('fixed funding policy binds every offer field and exact holder capability without accepting per-call economics', OPTIONS, () => {
  const config = configuration(), p = policy(config), selected = input(config), expected = p(selected);
  const changes = { modelVersion: 2, providerId: 'other', serviceId: 'other', resourceId: 'other',
    resourceBinding: digest('e'), offerId: 'other', offerVersion: 2, costPolicyId: 'other',
    fundingPolicyId: 'other', fundingPolicyVersion: 2 };
  for (const [key, value] of Object.entries(changes)) {
    const candidate = clone(selected); candidate.offer[key] = value;
    assert.throws(() => p(candidate), rejected());
  }
  for (const candidate of [{ ...selected, holderId: 'other' }, { ...selected, capabilityCommitment: digest('b') },
    { ...selected, totalUnits: 999 }, { ...selected, expiresAt: NOW + 99999 }])
    assert.throws(() => p(candidate), rejected());
  assert.equal(p(input(config)), expected);
});
test('fixed funding policy requires all explicit economic fields and rejects invalid grammar or policy version at construction', OPTIONS, () => {
  const original = configuration();
  for (const key of Object.keys(original.terms)) {
    const candidate = clone(original); delete candidate.terms[key];
    assert.throws(() => CREATE(candidate), rejected('configuration_rejected'));
  }
  for (const edit of [
    c => { c.terms.totalUnits = 0; }, c => { c.terms.totalUnits = Number.MAX_SAFE_INTEGER + 1; },
    c => { c.terms.expiresAt = -1; }, c => { c.terms.fundingPolicyId = 'other'; },
    c => { c.terms.fundingPolicyVersion = 2; }, c => { c.selection.offerVersion = 2; },
    c => { c.terms.requirement.amount = '07'; }, c => { c.terms.requirement.amount = '9'.repeat(78); },
    c => { c.terms.requirement.extra.minimumMomentumConfirmations = 1; },
    c => { delete c.terms.requirement.extra.minimumMomentumConfirmations; },
    c => { c.terms.requirement.extra.zenonChain.chainIdentifier = '9007199254740992'; },
    c => { c.terms.requirement.extra.paymentFlow = 'deferred'; },
  ]) {
    const candidate = clone(original); edit(candidate);
    assert.throws(() => CREATE(candidate), rejected('configuration_rejected'));
  }
  for (const args of [[], [original, null]]) assert.throws(() => CREATE(...args), rejected('configuration_rejected'));
});
test('fixed funding policy rejects accessor proxy cycle oversized and wrong-arity inputs without invoking hooks', OPTIONS, () => {
  const config = configuration(), p = policy(config), selected = input(config);
  const hook = () => { totals.hooks++; throw Error('PRIVATE'); };
  const getter = clone(config);
  Object.defineProperty(getter.terms, 'requirement', { enumerable: true, get: hook });
  const nested = clone(config);
  Object.defineProperty(nested.terms.requirement.extra.zenonChain, 'chainIdentifier', { enumerable: true, get: hook });
  const cycle = clone(config); cycle.terms.requirement.extra.zenonChain.chainIdentifier = cycle;
  for (const candidate of [getter, nested, cycle, new Proxy(config, { ownKeys: hook, getPrototypeOf: hook })]) {
    assert.throws(() => CREATE(candidate), rejected('configuration_rejected'));
  }
  const oversized = clone(config); oversized.terms.requirement.amount = '1'.repeat(4097);
  assert.throws(() => CREATE(oversized), rejected('configuration_rejected'));
  const badInput = clone(selected); Object.defineProperty(badInput.offer, 'providerId', { enumerable: true, get: hook });
  for (const candidate of [badInput, new Proxy(selected, { ownKeys: hook, getPrototypeOf: hook })])
    assert.throws(() => p(candidate), rejected());
  assert.throws(() => p(), rejected()); assert.throws(() => p(selected, null), rejected());
  assert.throws(() => new p(selected), rejected()); assert.equal(totals.hooks, 0);
  assert.deepEqual(p(selected), config.terms);
});
test('actual funding resource consumer uses fixed stored offer terms and rejects expired or changed scope without granting credit', OPTIONS, () => {
  const config = configuration(), p = policy(config), f = owner(config, p), before = f.model.exportState();
  const first = issue(f); f.state.now += 1; const again = issue(f);
  assert.deepEqual(again, first); frozen(first);
  assert.equal(first.activationIntent.totalUnits, 10); assert.equal(first.activationIntent.expiresAt, NOW + 10000);
  assert.deepEqual(first.paymentRequired.accepts, [config.terms.requirement]);
  assert.equal(typeof first.fundingCommitment, 'string'); assert.match(first.fundingCommitment, /^sha256:[0-9a-f]{64}$/);
  assert.throws(() => issue(f, { ...config.selection, holderId: 'other' }), consumerRejected);
  assert.throws(() => issue(f, config.selection, RESOURCE + '-other'), consumerRejected);
  f.state.now = config.terms.expiresAt; assert.throws(() => issue(f), consumerRejected);
  assert.equal(p(input(config)).expiresAt, NOW + 10000); unchangedModel(f, before);
});
test('actual funding consumer rejects activation drift before verifier and requires an explicit new offer policy version', OPTIONS, async t => {
  const config = configuration(), p = policy(config), f = owner(config, p), base = issue(f);
  const before = f.model.exportState();
  for (const field of ['intent', 'requirement']) {
    const intent = clone(base.activationIntent), paymentRequired = clone(base.paymentRequired);
    if (field === 'intent') intent.totalUnits++;
    else paymentRequired.accepts[0].amount = '8';
    totals.rejectedActivationCalls++;
    await assert.rejects(f.activation.activate({ intent, paymentRequired,
      fundingEvidence: { evidenceVersion: 1, artifact: { format: 'synthetic-no-verifier', bytes: 'not-evidence' } } }),
    consumerRejected);
  }
  unchangedModel(f, before);
  const next = configuration(2); f.model.registerOffer(next.offer);
  assert.throws(() => issue(f, next.selection), consumerRejected);
  const p2 = policy(next), v2 = owner(next, p2, f.model), nextBefore = v2.model.exportState(), issued = issue(v2);
  assert.equal(issued.activationIntent.totalUnits, 12); assert.equal(issued.paymentRequired.accepts[0].amount, '8');
  assert.notEqual(issued.fundingCommitment, base.fundingCommitment); unchangedModel(v2, nextBefore);
  assert.deepEqual(totals, { configuredPolicies: 6, models: 2, consumers: 3, resourceAttempts: 8,
    issuedCandidates: 4, rejectedActivationCalls: 2, verifierCalls: 0, deriveCostCalls: 0,
    modelClockCalls: 0, fundingClockCalls: 6, hooks: 0 });
  t.diagnostic(JSON.stringify({ kind: 'P4_FIXED_FUNDING_POLICY', ...totals,
    grantsAdded: 0, nonceSearchCalls: 0, candidateEvaluations: 0, keyGeneration: 0, signatures: 0,
    sqliteFiles: 0, networkCalls: 0, realPrepareCalls: 0, persistentWrites: 0,
    oldQualificationEntriesRegistered: 0, qualification: 'SELECTED_SYNTHETIC_POLICY_NOT_LIVE_PROVIDER' }));
});
