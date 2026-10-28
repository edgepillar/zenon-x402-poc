import { fileURLToPath } from 'node:url';
// Actual pure product gate plus declared memory/application ports only.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { apiCreditAdmissionDataCases } from './api-credit-admission.behavior.mjs';
import { apiCreditApplicationDataFixtures as f } from './api-credit-application.behavior.mjs';
import { apiCreditCommandDataFixtures as commands } from './api-credit-command.behavior.mjs';
import { captureSdk105ApiCreditProductSelection as select, consumeSdk105ApiCreditProductSelection as consume,
  bindSdk105ApiCreditProductLifecycle as bind } from '../src/zenon/sdk105-api-credit-product-profile.js';
import { consumeSdk105ApiCreditSelection as consumeNative } from '../src/zenon/sdk105-api-credit-selection.js';
import { captureZenonDynamicPlasmaFundingPostPreparationInput as captureInput } from '../src/zenon/dynamic-plasma-funding-post-preparation-input.js';
import { encodeB64Json } from '../src/x402-wire.js';

const F = Object.freeze, copy = x => JSON.parse(JSON.stringify(x)), checks = [...apiCreditAdmissionDataCases];
function check(id, run) { checks.push({ id, run }); }
function fixture() {
  const r = f.capturedConfiguration(), s = r.input.configuration.serviceOptions, { official, ...rest } = s;
  r.input.configuration.serviceOptions = { assetInfo: official.assetInfo, contextLimit: official.contextLimit, ...rest };
  r.input.productProfileVersion = 1; r.input.paymentRequiredHeader = r.h.f.input.challenge.paymentRequiredHeader;
  return r;
}
async function refused(edit) {
  const r = fixture(); edit(r); const ca = Buffer.from(r.ca); assert.throws(() => select(r.input));
  assert.equal(r.keyCalls + r.clockCalls, 0); assert.deepEqual(r.ca, ca); await r.h.root.close();
}
async function joined(options) {
  const r = fixture(), s = select(r.input), h = f.appFixture(options), selected = consume(s);
  h.root = bind(h.root, selected.profile); return { r, s, h };
}
function changedInput(h, edit) {
  const input = copy(h.f.input), payment = copy(input.challenge.paymentRequired); edit(payment);
  input.challenge.paymentRequired = payment; input.challenge.paymentRequiredHeader = encodeB64Json(payment);
  input.plannerContext.readInput.paymentRequired = copy(payment); input.plannerContext.readInput.accepted = copy(payment.accepts[0]);
  assert.doesNotThrow(() => captureInput(input, h.f.resourceUrl)); return input;
}
check('fixed-product-capture-binds-one-origin-network-asset-recipient-and-offer-without-key-or-clock-entry', async () => {
  const r = fixture(), s = select(r.input), q = s.profile;
  assert.equal(q.fundingResourceUrl, r.h.f.resourceUrl); assert.equal(q.network, r.h.policy.network);
  assert.equal(q.asset, r.h.policy.asset); assert.equal(q.recipient, r.h.policy.recipients[0]); assert.equal(q.amount, '5');
  assert.equal(q.providerAuthentication, 'NOT_ESTABLISHED'); assert.equal(r.keyCalls + r.clockCalls, 0); s.release(); await r.h.root.close();
});
check('product-version-and-closed-input-shape-are-required', async () => {
  for (const edit of [r => { r.input.productProfileVersion = 2; }, r => { delete r.input.productProfileVersion; },
    r => { r.input.module = 'unselected'; }, r => { delete r.input.paymentRequiredHeader; }]) await refused(edit);
});
check('a-product-caller-cannot-supply-its-own-challenge-validator-or-loader', async () => {
  let entered = 0;
  for (const name of ['official', 'validateChallenge', 'keyLoader']) await refused(r => { r.input.configuration.serviceOptions[name] = () => { entered++; }; });
  assert.equal(entered, 0);
});
check('the-fixed-offer-must-match-the-spending-network-and-asset', async () => {
  await refused(r => { r.input.spendingFile.storageProfile.policy.network = 'zenon:other'; });
  await refused(r => { r.input.spendingFile.storageProfile.policy.asset = 'foreign'; r.input.configuration.serviceOptions.assetInfo.asset = 'foreign'; });
});
check('the-first-product-has-exactly-one-spending-recipient', async () => {
  await refused(r => { r.input.spendingFile.storageProfile.policy.recipients = ['foreign']; });
  await refused(r => { r.input.spendingFile.storageProfile.policy.recipients.push('foreign'); });
});
check('offer-amount-cannot-exceed-the-existing-payment-budget', async () => {
  await refused(r => { r.input.spendingFile.storageProfile.policy.maxPayment = '1'; });
});
check('a-foreign-funding-resource-cannot-select-the-fixed-product', async () => {
  await refused(r => { const q = copy(r.h.f.input.challenge.paymentRequired); q.resource.url = 'https://foreign.example.test/funding'; r.input.paymentRequiredHeader = encodeB64Json(q); });
});
check('multiple-offers-are-not-an-implicit-product-selection', async () => {
  await refused(r => { const q = copy(r.h.f.input.challenge.paymentRequired); q.accepts.push(copy(q.accepts[0])); r.input.paymentRequiredHeader = encodeB64Json(q); });
});
check('the-selected-product-budgets-support-100-distinct-requests-and-an-exact-replay', async () => {
  await refused(r => { r.input.configuration.storeOptions.custodyPolicy.maxRequests = 99; r.input.configuration.serviceOptions.transportOptions.maxRequestStarts = 99; });
  await refused(r => { r.input.configuration.serviceOptions.transportOptions.maxRequestStarts = 100; });
});
check('malformed-oversized-and-noncanonical-wire-headers-refuse-before-acquisition', async () => {
  for (const header of ['bad', 'A'.repeat(5468), Buffer.from(' {"x402Version":2} ').toString('base64')]) await refused(r => { r.input.paymentRequiredHeader = header; });
});
check('the-fixed-challenge-validator-accepts-only-the-captured-semantic-challenge', async () => {
  const r = fixture(), s = select(r.input), validate = s.configuration.serviceOptions.official.validateChallenge;
  const q = copy(r.h.f.input.challenge.paymentRequired); assert.equal(validate(q), undefined);
  for (const edit of [x => { x.accepts[0].amount = '4'; }, x => { x.resource.description = 'another offer'; }, x => { x.accepts[0].payTo = 'foreign'; }]) {
    const changed = copy(q); edit(changed); assert.throws(() => validate(changed));
  }
  assert.equal(r.keyCalls + r.clockCalls, 0); s.release(); await r.h.root.close();
});
check('the-fixed-validator-refuses-accessors-and-proxies-without-entering-them', async () => {
  const r = fixture(), s = select(r.input), validate = s.configuration.serviceOptions.official.validateChallenge;
  let entered = 0; const q = copy(r.h.f.input.challenge.paymentRequired);
  Object.defineProperty(q, 'resource', { enumerable: true, get() { entered++; return {}; } }); assert.throws(() => validate(q));
  assert.throws(() => validate(new Proxy({}, { ownKeys() { entered++; return []; }, getPrototypeOf() { entered++; return Object.prototype; } })));
  assert.equal(entered, 0); s.release(); await r.h.root.close();
});
check('product-selection-consumption-is-one-use-and-lookalikes-have-no-brand', async () => {
  const r = fixture(), s = select(r.input); assert.throws(() => consume(F({ ...s }))); const picked = consume(s);
  assert.equal(picked.profile, s.profile); assert.throws(() => consume(s)); s.release(); assert.throws(() => consume(s)); await r.h.root.close();
});
check('released-product-selection-cannot-be-consumed-and-clears-only-owned-ca-copies', async () => {
  const r = fixture(), s = select(r.input), ca = Buffer.from(r.ca); s.release(); s.release();
  assert.ok(s.configuration.fundingOptions.fundingTransportOptions.ca.every(x => x === 0)); assert.deepEqual(r.ca, ca);
  assert.throws(() => consume(s)); assert.equal(r.keyCalls + r.clockCalls, 0); await r.h.root.close();
});
check('the-existing-native-selection-still-rechecks-ca-and-key-shape-at-its-acquisition-boundary', async () => {
  const r = fixture(), s = select(r.input); s.configuration.fundingOptions.fundingTransportOptions.ca.fill(1); s.configuration.serviceOptions.transportOptions.ca.fill(1);
  const picked = consume(s); assert.throws(() => consumeNative(picked.selection)); s.release(); assert.equal(r.keyCalls + r.clockCalls, 0); await r.h.root.close();
});
check('a-forged-product-profile-cannot-bind-an-application', async () => {
  const r = fixture(), s = select(r.input); assert.throws(() => bind(r.h.root, F({ ...s.profile }))); s.release(); await r.h.root.close();
});
check('a-coherent-cheaper-offer-is-rejected-before-the-real-spending-gate-and-child-preparation', async () => {
  const { r, s, h } = await joined(); const input = changedInput(h, x => { x.accepts[0].amount = '4'; });
  await assert.rejects(h.root.prepareOriginalFunding(input)); assert.equal(h.raw(), null); assert.equal(h.counts.prepares, 0);
  await h.root.prepareOriginalFunding(h.f.input); assert.equal(h.counts.prepares, 1); assert.equal(JSON.parse(h.raw()).reservations.length, 1);
  await h.root.close(); s.release(); await r.h.root.close();
});
check('coherent-resource-metadata-drift-cannot-change-the-captured-offer', async () => {
  const { r, s, h } = await joined(); const input = changedInput(h, x => { x.resource.description = 'another product'; });
  await assert.rejects(h.root.prepareOriginalFunding(input)); assert.equal(h.raw(), null); assert.equal(h.counts.prepares, 0);
  await h.root.close(); s.release(); await r.h.root.close();
});
check('one-fixed-product-funding-grant-100-model-debits-and-exact-replay-use-the-actual-application-gate', async () => {
  const { r, s, h } = await joined(); await h.open(); const result = await h.startFunding(() => {
    for (let i = 0; i < 100; i++) h.send(commands.command('service.' + i, 'submitService', commands.service(h.grant.grantId, 'request.' + (i + 1))));
    h.send(commands.command('replay', 'submitService', commands.service(h.grant.grantId)), commands.command('close', 'close'));
  });
  assert.equal(result.status, 'CLOSED'); assert.equal(result.exitCode, 0); assert.equal(h.owner.inspect().commands, 106);
  assert.deepEqual(h.counts, { prepares: 1, funding: 1, grants: 1, handoffs: 1, executions: 100, replays: 1, stops: 1, walletStops: 1 });
  assert.equal(h.model.getGrant(h.grant.grantId).consumedUnits, 100); assert.equal(h.model.getGrant(h.grant.grantId).availableUnits, 0);
  assert.equal(h.file.closeCalls, 1); assert.equal(JSON.parse(h.raw()).reservations[0].status, 'SPENT');
  assert.equal(result.nativeResourceCleanup, 'NOT_QUALIFIED'); s.release(); await r.h.root.close();
});
check('fixed-product-pending-funding-keeps-unknown-budget-and-does-not-handoff-or-execute', async () => {
  const { r, s, h } = await joined({ pending: true }); await h.open(); const result = await h.startFunding(() => assert.fail('must not handoff'));
  assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(h.counts.grants + h.counts.handoffs + h.counts.executions, 0);
  assert.equal(JSON.parse(h.raw()).reservations[0].status, 'UNKNOWN'); assert.equal(h.file.closeCalls, 0); s.release(); await r.h.root.close();
});
check('changed-handoff-challenge-is-rejected-before-wallet-close-or-child-handoff', async () => {
  const { r, s, h } = await joined(); await h.root.prepareOriginalFunding(h.f.input);
  await h.root.commitOriginalFunding({ expectedPins: h.packet.expectedPins }); await h.root.submitOriginalFunding({ expectedPins: h.packet.expectedPins });
  const input = h.handoff(); input.paymentRequiredHeader += 'A'; await assert.rejects(h.root.handoffToService(input));
  assert.equal(h.counts.walletStops + h.counts.handoffs, 0); await h.root.handoffToService(h.handoff()); assert.equal(h.counts.handoffs, 1);
  await h.root.close(); s.release(); await r.h.root.close();
});
check('a-product-handoff-accessor-is-not-entered', async () => {
  const { r, s, h } = await joined(); let entered = 0;
  const input = {}; Object.defineProperty(input, 'paymentRequiredHeader', { enumerable: true, get() { entered++; return ''; } });
  await assert.rejects(h.root.handoffToService(input)); assert.equal(entered + h.counts.handoffs + h.counts.walletStops, 0);
  await h.root.close(); s.release(); await r.h.root.close();
});
check('the-product-wrapper-preserves-the-original-close-promise-and-ordered-file-release', async () => {
  const { r, s, h } = await joined({ delayedWallet: true }); const a = h.root.close(), b = h.root.close(); assert.equal(a, b);
  assert.equal(h.root.inspect().lifecycle, 'CLOSING'); assert.equal(h.file.closeCalls, 0);
  h.file.resolveWallet(); await a; assert.equal(h.file.closeCalls, 1); assert.equal(h.root.inspect().lifecycle, 'CLOSED'); s.release(); await r.h.root.close();
});
check('late-preparation-after-product-close-cannot-start-a-second-offer-or-release-an-unknown-file', async () => {
  const { r, s, h } = await joined(); const operation = h.root.prepareOriginalFunding(h.f.input), stop = h.root.close();
  await assert.rejects(operation); await assert.rejects(stop); await assert.rejects(h.root.prepareOriginalFunding(h.f.input));
  assert.equal(h.counts.prepares, 1); assert.equal(h.file.closeCalls, 0); assert.equal(h.root.inspect().held, true); s.release(); await r.h.root.close();
});
export const apiCreditProductDataCases = F(checks.map(c => F(c)));
if (typeof process.argv[1] === 'string' && fileURLToPath(import.meta.url) === process.argv[1]) {
const cases = [];
for (const { id, run } of checks) { try { await run(); cases.push({ id, status: 'PASS' }); } catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); } }
const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'G0_G1_FIXED_API_CREDIT_PRODUCT_DATA', passed: cases.length - failed, failed, cases,
  priorAdmissionCases: apiCreditAdmissionDataCases.length, nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0,
  nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0, nativeProductAcceptance: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;
}
