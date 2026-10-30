import { fileURLToPath } from 'node:url';
// Pure command/lifecycle/model DATA with declared native children and a memory
// CAS port. Invalid signature-shaped fixture bytes are never signed/verified.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PassThrough, Writable } from 'node:stream';
import { captureBuyerOriginalFundingCommandLimits as legacyLimits, captureBuyerApiCreditCommandLimits as limits,
  encodeBuyerOriginalFundingCommand as encode } from '../src/buyer-original-funding-command.js';
import { createBuyerOriginalFundingCommandSession as legacySession, createBuyerApiCreditFundingCommandSession as session,
  createBuyerOriginalRecoveryCommandSession as recovery, createBuyerOriginalBackendRecoveryCommandSession as backendRecovery } from '../src/buyer-original-funding-command-session.js';
import { createBuyerCommandLineChannel as legacyChannel, createBuyerApiCreditCommandLineChannel as channel } from '../src/buyer-command-line-channel.js';
import { openBuyerFundingOwnedStreamSession as legacyOpen, openBuyerApiCreditFundingOwnedStreamSession as open } from '../src/buyer-funding-owned-stream-session.js';
import { runBuyerOriginalCommandHost as host } from '../src/buyer-original-command-host.js';
import { createSpendingBoundedSdk105FundingServiceLifecycle as join } from '../src/zenon/sdk105-funding-service-lifecycle.js';
import { InMemoryServiceCreditModel } from '../src/service-credit-model.js';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as assemble } from '../src/zenon/dynamic-plasma-original-funding-data.js';

assert.equal(process.version, 'v24.19.0');
const F = Object.freeze, copy = value => structuredClone(value), checks = [];
const digest = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const hash = fill => 'sha256:' + fill.repeat(64), NOW = 2_000_000_000_000;
function check(id, run) { checks.push({ id, run }); }
function command(id, operation, input = {}) { return { version: 1, id, operation, input }; }
function offer() { return { modelVersion: 1, providerId: 'provider.synthetic', serviceId: 'api.synthetic', resourceId: 'resource.synthetic',
  resourceBinding: hash('e'), offerId: 'offer.synthetic', offerVersion: 1, costPolicyId: 'fixed.synthetic',
  fundingPolicyId: 'funding.synthetic', fundingPolicyVersion: 1 }; }
function activation() { return { activationVersion: 1, authorityProfileId: 'authority.mock.reference', authorityProfileVersion: 1,
  verifierVersion: 1, authorityRecordDigest: hash('d'), fundingPolicyId: 'funding.synthetic', fundingPolicyVersion: 1,
  sourceSettlementId: 'settlement.synthetic', transactionId: 'mocktx:' + 'a'.repeat(64),
  providerId: 'provider.synthetic', serviceId: 'api.synthetic', resourceId: 'resource.synthetic', resourceBinding: hash('e'),
  offerId: 'offer.synthetic', offerVersion: 1, holderId: 'holder.synthetic', capabilityCommitment: hash('a'), totalUnits: 100,
  expiresAt: NOW + 10_000, scheme: 'exact', paymentFlow: 'upfront', network: 'zenon:mock',
  chainProfile: { version: 1, chainIdentifier: Number.MAX_SAFE_INTEGER.toString(), genesisMomentumHash: '0'.repeat(64) },
  asset: 'zts1mockasset', amount: '1', payee: 'payee.mock', payer: 'holder.synthetic', paymentResourceDigest: hash('4'),
  paymentRequirementDigest: hash('2'), paymentIntentDigest: hash('1'), grantFundingCommitment: hash('3'), evidenceState: 'MOMENTUM_INCLUDED',
  confirmationPolicy: { policyId: 'mock.momentum-included', policyVersion: 1, minimumConfirmations: 1 } }; }
function ledgerRequest(input) {
  const request = JSON.parse(input.originalRequestJson);
  assert.equal(request.method, 'POST'); assert.equal(request.url, 'https://service.example.test/api');
  assert.equal(input.serviceResourceUrl, request.url); assert.equal(input.authorizationHeader, 'Bearer declared-test-proof');
  return { modelVersion: 1, grantId: input.grantId, requestId: input.requestId, method: request.method,
    routeId: 'api.synthetic', canonicalBodyDigest: digest(input.originalBodyBase64), selectedContentType: 'application/json', maxCostUnits: 1 };
}
function service(grantId, id = 'request.1', body = '') { return { grantId, requestId: id,
  originalRequestJson: '{"method":"POST","url":"https://service.example.test/api"}', originalBodyBase64: body,
  serviceResourceUrl: 'https://service.example.test/api', authorizationHeader: 'Bearer declared-test-proof' }; }
function fixture({ pending = false, onWrite = null, createLifecycle = join } = {}) {
  const f = retainedOriginalInputFixture(), packet = assemble(f.input, f.candidate, f.resourceUrl), counts = {
    prepares: 0, funding: 0, grants: 0, handoffs: 0, executions: 0, replays: 0, stops: 0, walletStops: 0,
  };
  const policy = { version: 1, policyId: 'budget.api.synthetic', accountId: f.input.plannerContext.readInput.payerAddress,
    network: f.input.challenge.paymentRequired.accepts[0].network, asset: f.input.challenge.paymentRequired.accepts[0].asset,
    recipients: [f.input.challenge.paymentRequired.accepts[0].payTo], maxPayment: '5', maxDaily: '5', maxTotal: '5', maxRecords: 1 };
  let raw = null, walletClosed = false, childClosed = false;
  const backend = F({ load() { return raw; }, compareAndSwap(account, expected, next) {
    assert.equal(account, policy.accountId); if (raw !== expected) return null; raw = next; return next;
  } });
  const model = new InMemoryServiceCreditModel({ now: () => NOW, deriveCost: () => 1 }); model.registerOffer(offer());
  const h = { f, packet, counts, model, policy, backend, raw: () => raw, grant: null, replies: [], onWrite, input: new PassThrough() };
  const signed = F({ hash: f.candidate.accountBlock.hash, signature: f.candidate.accountBlock.signature, publicKey: f.candidate.accountBlock.publicKey });
  const wallet = F({ inspect: F(function inspect() { return F({ sdk105WalletOwnerVersion: 1, held: false,
    lifecycle: walletClosed ? 'CLOSED' : 'OPEN', clearCalls: walletClosed ? 1 : 0,
    clearOutcome: walletClosed ? 'CLEAR_RETURNED' : 'NOT_REQUESTED', closeRequested: walletClosed, activeOperation: null,
    signingOutcome: 'RETURNED_DATA', wallet: F({ signedOriginal: signed }) }); }),
  close: F(function close() { if (!walletClosed) counts.walletStops++; walletClosed = true; return Promise.resolve(undefined); }) });
  const child = F({ prepareOriginalFunding: F(async function prepare(input) {
    counts.prepares++; assert.notEqual(raw, null); assert.deepEqual(input, f.input); return F({ phase: 'AWAITING_INDEPENDENT_PINS', packet });
  }), commitOriginalFunding: F(async function commit(input) { assert.deepEqual(input.expectedPins, packet.expectedPins); return F({ phase: 'LOCAL_STORE_READBACK_MATCHED' }); }),
  submitOriginalFunding: F(async function submit(input) {
    counts.funding++; assert.deepEqual(input.expectedPins, packet.expectedPins);
    if (pending) return F({ phase: 'SUBMISSION_OUTCOME_UNKNOWN', fundingIntakeStatus: 'UNKNOWN', transactionHash: packet.transactionHash });
    h.grant = model.activateGrantFromTrustedRecord(activation()); counts.grants++;
    return F({ phase: 'FUNDING_INTAKE_BOUND', fundingIntakeStatus: 'BOUND', transactionHash: packet.transactionHash });
  }), handoffToService: F(async function handoff(input) {
    counts.handoffs++; assert.equal(input.selectedGrantId, h.grant.grantId); return F({ phase: 'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED' });
  }), submitOriginal: F(async function submit(input) {
    const selected = ledgerRequest(input), r = model.reserveRequest(selected), ref = { grantId: input.grantId, requestId: input.requestId };
    if (r.replayed) { counts.replays++; assert.equal(r.executionAuthorized, false); assert.equal(r.request.state, 'SUCCEEDED'); return undefined; }
    assert.equal(model.beginExecution(ref).executionAuthorized, true); counts.executions++;
    model.completeExecution({ ...ref, cachedResult: { statusCode: 200, contentType: 'application/json', resultCode: 'api.completed' } });
    return undefined;
  }), inspect: F(function inspect() { return F({ lifecycle: childClosed ? 'CLOSED' : 'OPEN', held: false }); }),
  close: F(async function close() { if (!childClosed) counts.stops++; childClosed = true; }) });
  h.root = createLifecycle({ client: child, walletOwner: wallet, fundingResourceUrl: f.resourceUrl,
    spending: { policy, backend, paymentId: 'payment.api.synthetic', readDay: () => 10 } });
  h.output = new Writable({ write(chunk, encoding, done) {
    try { const r = JSON.parse(String(chunk)); h.replies.push(r); if (h.onWrite) h.onWrite(r, done); else done(); }
    catch (e) { done(e); }
  } });
  h.send = (...commands) => h.input.write(commands.map(c => encode(c)).join(''));
  h.handoff = () => ({ originalPayment: { resourceUrl: f.resourceUrl, serializedCheckpoint: packet.serializedCheckpoint,
    expectedPins: copy(packet.expectedPins) }, selectedGrantId: h.grant.grantId, paymentRequiredHeader: f.input.challenge.paymentRequiredHeader });
  h.open = async (opening = open, selectedLimits = {}) => {
    h.owner = await opening({ input: h.input, output: h.output, limits: selectedLimits,
      openClient: F(async function binding(requireCurrent) { requireCurrent(); return h.root; }) }); return h.owner;
  };
  h.startFunding = continuation => {
    h.onWrite = (r, done) => {
      if (r.operation === 'prepare') h.send(command('commit', 'commit', { expectedPins: copy(packet.expectedPins) }));
      if (r.operation === 'commit') h.send(command('funding', 'submitFunding', { expectedPins: copy(packet.expectedPins) }));
      if (r.operation === 'submitFunding' && !pending) h.send(command('handoff', 'handoff', h.handoff()));
      if (r.operation === 'handoff') continuation();
      done();
    };
    h.send(command('prepare', 'prepare', f.input)); return host(h.owner);
  };
  return h;
}

check('legacy-default-16-and-maximum-64-are-preserved', () => {
  assert.equal(legacyLimits().maxCommands, 16); assert.equal(legacyLimits({ maxCommands: 64 }).maxCommands, 64);
  assert.throws(() => legacyLimits({ maxCommands: 65 })); assert.throws(() => legacyLimits(limits()));
});
check('explicit-api-profile-has-128-commands-with-the-same-byte-and-close-limits', () => {
  assert.equal(limits().maxCommands, 128); assert.deepEqual({ ...limits(), maxCommands: 16 }, legacyLimits());
  for (const value of [0, 129, 1.5, NaN, '128']) assert.throws(() => limits({ maxCommands: value }));
  for (const edit of [{ maxLineBytes: 262145 }, { maxInputBytes: 2097153 }, { maxOutputBytes: 2097153 }, { closeWaitMs: 1001 }]) assert.throws(() => limits(edit));
});
check('api-limit-capture-does-not-enter-accessors-or-proxies', () => {
  let entered = 0; const input = {}; Object.defineProperty(input, 'maxCommands', { enumerable: true, get() { entered++; return 128; } });
  assert.throws(() => limits(input)); assert.throws(() => limits(new Proxy({}, {}))); assert.equal(entered, 0);
});
check('funding-and-both-recovery-factories-refuse-api-limits-before-child-capture', () => {
  let entered = 0; const client = { get inspect() { entered++; throw Error('must not enter'); } };
  for (const create of [legacySession, recovery, backendRecovery]) assert.throws(() => create({ client, channel: {}, limits: limits() }));
  assert.throws(() => session({ client, channel: {}, limits: { maxCommands: 129 } })); assert.equal(entered, 0);
});
check('legacy-channel-refuses-api-limits-without-reserving-the-streams', async () => {
  const h = fixture(); assert.throws(() => legacyChannel({ input: h.input, output: h.output, limits: limits() }));
  const c = channel({ input: h.input, output: h.output, limits: limits() }); await c.close(); await h.root.close();
});
check('invalid-api-opening-budget-refuses-before-the-client-opener', async () => {
  const h = fixture(); let entered = 0;
  await assert.rejects(open({ input: h.input, output: h.output, limits: { maxCommands: 129 }, openClient: F(async function opener() { entered++; return h.root; }) }));
  assert.equal(entered, 0); const c = channel({ input: h.input, output: h.output, limits: limits() }); await c.close(); await h.root.close();
});
check('api-opening-reserves-the-same-streams-before-the-fixed-client-opener', async () => {
  const h = fixture(); let entered = 0;
  h.owner = await open({ input: h.input, output: h.output, limits: {}, openClient: F(async function opener(current) {
    current(); entered++; assert.throws(() => legacyChannel({ input: h.input, output: h.output, limits: {} })); return h.root;
  }) });
  h.send(command('close', 'close')); const r = await host(h.owner);
  assert.equal(entered, 1); assert.equal(r.status, 'CLOSED'); assert.equal(r.mode, 'FUNDING_API_CREDIT'); assert.equal(h.counts.prepares, 0);
});
let hundred = null;
check('one-funding-one-grant-and-100-distinct-requests-plus-exact-replay-cross-the-64-command-boundary', async () => {
  const h = fixture(); await h.open();
  const r = await h.startFunding(() => {
    for (let i = 1; i <= 100; i++) h.send(command('call.' + i, 'submitService', service(h.grant.grantId, 'request.' + i)));
    h.send(command('replay', 'submitService', service(h.grant.grantId)), command('close', 'close'));
  });
  assert.equal(r.status, 'CLOSED'); assert.equal(r.exitCode, 0); assert.equal(r.mode, 'FUNDING_API_CREDIT');
  assert.equal(h.owner.inspect().commands, 106); assert.equal(h.owner.inspect().admittedOperations, 105);
  assert.deepEqual(h.counts, { prepares: 1, funding: 1, grants: 1, handoffs: 1, executions: 100, replays: 1, stops: 1, walletStops: 1 });
  assert.equal(h.model.getGrant(h.grant.grantId).consumedUnits, 100); assert.equal(h.model.getGrant(h.grant.grantId).availableUnits, 0);
  const state = JSON.parse(h.raw()); assert.equal(state.reservations.length, 1); assert.equal(state.reservations[0].status, 'SPENT');
  assert.equal(state.reservations[0].amount, '5'); assert.equal(h.replies.filter(x => x.operation === 'submitService').length, 101);
  assert.equal(r.serviceDelivery, 'NOT_ESTABLISHED'); assert.equal(r.nativeResourceCleanup, 'NOT_QUALIFIED');
  assert.ok(h.replies.filter(x => x.operation === 'submitService').every(x => x.result.serviceDelivery === 'NOT_ESTABLISHED'));
  hundred = h;
});
check('model-state-rehydration-preserves-100-debits-and-refuses-another-execution-for-the-exact-request', () => {
  assert.notEqual(hundred, null); const restored = InMemoryServiceCreditModel.fromState({ now: () => NOW, deriveCost: () => 1 }, hundred.model.exportState());
  const ref = service(hundred.grant.grantId), r = restored.reserveRequest(ledgerRequest(ref));
  assert.equal(r.replayed, true); assert.equal(r.request.cachedResult.resultCode, 'api.completed');
  assert.equal(restored.beginExecution({ grantId: ref.grantId, requestId: ref.requestId }).executionAuthorized, false);
  assert.equal(restored.getGrant(ref.grantId).consumedUnits, 100); assert.equal(restored.getGrant(ref.grantId).availableUnits, 0);
});
check('unknown-funding-stops-before-handoff-and-retains-the-spending-reservation', async () => {
  const h = fixture({ pending: true }); await h.open(); const r = await h.startFunding(() => assert.fail('handoff must not run'));
  assert.equal(r.status, 'CLOSE_UNKNOWN'); assert.equal(r.exitCode, 4); assert.equal(h.owner.inspect().held, true);
  assert.equal(r.ownersClosedObserved, false); assert.equal(r.nativeResourceCleanup, 'NOT_QUALIFIED'); assert.equal(h.counts.prepares, 1); assert.equal(h.counts.funding, 1);
  assert.equal(h.counts.handoffs + h.counts.grants + h.counts.executions, 0);
  assert.equal(JSON.parse(h.raw()).reservations[0].status, 'UNKNOWN'); assert.equal(h.root.inspect().held, true);
});
check('foreign-grant-refuses-without-service-debit-or-execution', async () => {
  const h = fixture(); await h.open(); const r = await h.startFunding(() => h.send(command('foreign', 'submitService', service('grant.foreign'))));
  assert.equal(r.status, 'CLOSE_UNKNOWN'); assert.equal(r.exitCode, 4); assert.equal(h.owner.inspect().held, true);
  assert.equal(r.ownersClosedObserved, false); assert.equal(r.nativeResourceCleanup, 'NOT_QUALIFIED'); assert.equal(h.counts.executions, 0); assert.equal(h.model.getGrant(h.grant.grantId).consumedUnits, 0);
});
check('changed-body-under-the-same-request-id-cannot-produce-a-second-debit', async () => {
  const h = fixture(); await h.open(); const r = await h.startFunding(() => h.send(
    command('first', 'submitService', service(h.grant.grantId)), command('changed', 'submitService', service(h.grant.grantId, 'request.1', 'eA=='))));
  assert.equal(r.status, 'CLOSE_UNKNOWN'); assert.equal(r.exitCode, 4); assert.equal(h.owner.inspect().held, true);
  assert.equal(r.ownersClosedObserved, false); assert.equal(r.nativeResourceCleanup, 'NOT_QUALIFIED'); assert.equal(h.counts.executions, 1); assert.equal(h.model.getGrant(h.grant.grantId).consumedUnits, 1);
});
check('maximum-128-commands-including-close-remains-bounded-at-the-session-and-host', async () => {
  const h = fixture(); await h.open(); for (let i = 0; i < 127; i++) h.send(command('inspect.' + i, 'inspect')); h.send(command('close', 'close'));
  assert.equal((await host(h.owner)).status, 'CLOSED'); assert.equal(h.owner.inspect().commands, 128); assert.equal(h.counts.prepares, 0);
});
check('command-129-is-refused-before-admission-and-retains-the-last-returned-result', async () => {
  const h = fixture(); await h.open(); for (let i = 0; i < 129; i++) h.send(command('inspect.' + i, 'inspect'));
  const r = await host(h.owner); assert.equal(r.status, 'INPUT_REFUSED'); assert.equal(h.owner.inspect().commands, 128);
  assert.equal(h.owner.retainedResult().id, 'inspect.127'); assert.equal(h.owner.inspect().admittedOperations, 0);
});
check('legacy-owned-opening-still-uses-the-original-mode-and-16-command-default', async () => {
  const h = fixture(); await h.open(legacyOpen); for (let i = 0; i < 17; i++) h.send(command('inspect.' + i, 'inspect'));
  const r = await host(h.owner); assert.equal(r.status, 'INPUT_REFUSED'); assert.equal(r.mode, 'FUNDING_ORIGINAL'); assert.equal(h.owner.inspect().commands, 16);
});
check('duplicate-command-id-does-not-reenter-preparation', async () => {
  const h = fixture(); await h.open(); h.onWrite = (r, done) => { h.send(command('same', 'prepare', h.f.input)); done(); };
  h.send(command('same', 'prepare', h.f.input)); const r = await host(h.owner);
  assert.equal(r.status, 'OUTCOME_UNKNOWN'); assert.equal(h.counts.prepares, 1); assert.equal(h.counts.funding, 0);
});
check('output-loss-retains-the-original-without-committing-or-submitting-funding', async () => {
  const h = fixture(); await h.open(); h.onWrite = (r, done) => done(Error('declared-output-loss'));
  h.send(command('prepare', 'prepare', h.f.input)); const r = await host(h.owner);
  assert.equal(r.status, 'CLOSE_UNKNOWN'); assert.equal(r.exitCode, 4); assert.equal(h.owner.inspect().held, true);
  assert.equal(r.ownersClosedObserved, false); assert.equal(r.nativeResourceCleanup, 'NOT_QUALIFIED'); assert.equal(h.counts.prepares, 1); assert.equal(h.counts.funding + h.counts.handoffs, 0);
  assert.equal(JSON.parse(h.owner.retainedResult().line).result.serializedCheckpoint, h.packet.serializedCheckpoint);
  assert.equal(h.owner.retainedResult().writeCallbackCompleted, false); assert.equal(JSON.parse(h.raw()).reservations.length, 1);
});
export const apiCreditCommandDataCases = F(checks.map(c => F(c)));
export const apiCreditCommandDataFixtures = F({ fixture, service, command });
if (process.argv[1] === fileURLToPath(import.meta.url)) {
const cases = [];
for (const { id, run } of checks) { try { await run(); cases.push({ id, status: 'PASS' }); } catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); } }
const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'G1_API_CREDIT_COMMAND_DATA', passed: cases.length - failed, failed, cases,
  distinctServiceRequests: hundred?.counts.executions ?? null, modelReplays: hundred?.counts.replays ?? null,
  nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
  grantAuthority: 'DECLARED_MOCK_RECORD', modelBackend: 'IN_MEMORY', spendingBackend: 'DECLARED_MEMORY_CAS',
  nativeHundredCallAcceptance: 'NOT_ESTABLISHED', supportedProductLaunchCommand: 'NOT_ESTABLISHED', nativeDurability: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;
}
