import { fileURLToPath } from 'node:url';
// DATA ports only. The SQLite/file/native binding modules are not imported.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { apiCreditCommandDataCases, apiCreditCommandDataFixtures as f } from './api-credit-command.behavior.mjs';
import { createSdk105ApiCreditApplicationLifecycle as application } from '../src/zenon/sdk105-api-credit-application-lifecycle.js';
import { captureOriginalFundingSpendingFileProfile as profile, requireOriginalFundingSpendingFileCapacity as capacity } from '../src/original-funding-spending-file-profile.js';
import { captureSdk105ApiCreditSelection as select, consumeSdk105ApiCreditSelection as consume } from '../src/zenon/sdk105-api-credit-selection.js';
import { runBuyerOriginalCommandHost as host } from '../src/buyer-original-command-host.js';

const F = Object.freeze, checks = [...apiCreditCommandDataCases];
function check(id, run) { checks.push({ id, run }); }
function fileProfile(policy, edit = {}) { return { storageProfile: { version: 1, mode: 'CREATE_NEW', databasePath: '/synthetic/budget/account.sqlite',
  policy, storeId: 'budget.synthetic', ownerId: 'worker.synthetic' }, allowedRoot: '/synthetic/budget',
  filePolicy: { expectedDevice: '123', reservedBytes: '8192', maxDatabaseBytes: 1048576 }, ...edit }; }
function capturedConfiguration() {
  const h = f.fixture(), ca = Buffer.from('PUBLIC-SYNTHETIC-CA-BYTES');
  const applicationOrigin = new URL(h.f.resourceUrl).origin;
  const r = { h, ca, keyCalls: 0, clockCalls: 0 };
  const key = F({ getPublicKey() { r.keyCalls++; throw Error('must not enter'); }, getAddress() { r.keyCalls++; throw Error('must not enter'); },
    sign() { r.keyCalls++; throw Error('must not enter'); }, clear() { r.keyCalls++; throw Error('must not enter'); } });
  const endpoint = (second = false) => F({ route: F({ hostname: second ? 'rpc-two.zenon.network' : 'rpc-one.zenon.network', path: '/rpc', ipv4Address: second ? '1.1.1.1' : '8.8.8.8' }), timeoutMs: 200, closeGraceMs: 100 });
  r.input = { configuration: { storeOptions: { databasePath: '/synthetic/funding/checkpoint.sqlite', allowedRoot: '/synthetic/funding',
    resourceUrl: h.f.resourceUrl, custodyPolicy: { policyVersion: 1, serviceResourceUrl: applicationOrigin + '/service-credit/v1/execute', maxRequests: 128 } },
  fundingOptions: { readSessionOptions: F({ endpoints: F([endpoint(), endpoint(true)]), accountEndpoint: endpoint() }),
    materialOptions: { publicKey: h.f.candidate.accountBlock.publicKey, startNonce: '0000000000000000', limits: { maxAttempts: 4096, maxDifficulty: 16 } },
    materialWaitMs: 250, keyPair: key, expectedAddress: h.policy.accountId, deadlineMs: 500,
    fundingTransportOptions: { resourceUrl: h.f.resourceUrl, ca, maxRequestStarts: 1, requestDeadlineMs: 250, handshakeDeadlineMs: 100, closeGraceMs: 100 } },
  serviceOptions: { official: { validateChallenge: F(function declaredChallenge() {}), assetInfo: { asset: h.policy.asset, decimals: 8, symbol: 'ZNN' }, contextLimit: 16 },
    transportOptions: { origin: applicationOrigin, ca, maxRequestStarts: 128, maxConcurrentRequests: 1, requestDeadlineMs: 250, handshakeDeadlineMs: 100, closeGraceMs: 100 }, deadlineMs: 500 } },
  spendingFile: fileProfile(h.policy), spending: { paymentId: 'payment.api.synthetic', readDay: F(() => { r.clockCalls++; return 10; }) } };
  return r;
}
function appFixture({ mode = 'normal', pending = false, delayedWallet = false } = {}) {
  let port;
  const h = f.fixture({ pending, createLifecycle(c) {
    const base = c.spending.backend, state = { revoked: false, databaseOpen: true, held: false, busy: false, physicalCloseReturned: false,
      revokeCalls: 0, closeCalls: 0, currentCalls: 0, fenced: false, trace: [], mode, resolveWallet: null };
    port = state;
    const checkOpen = () => { if (state.revoked || state.held || !state.databaseOpen) throw Error('declared file unavailable'); };
    const backend = F({ load(account) { checkOpen(); return base.load(account); }, compareAndSwap(...args) { checkOpen(); return base.compareAndSwap(...args); } });
    state.owner = F({ backend,
      assertCurrent: F(function assertCurrent() { state.currentCalls++; checkOpen(); if (state.fenced) throw Error('declared stale epoch');
        base.load(c.spending.policy.accountId); return state.mode === 'nonvoidCurrent' ? true : undefined; }),
      inspect: F(function inspect() { return F({ spendingFileOwnerVersion: 1,
        lifecycle: state.held ? 'HELD' : state.physicalCloseReturned ? 'CLOSED' : state.revoked ? 'REVOKED' : 'OPEN',
        held: state.held, busy: state.busy, backendClosed: state.revoked, databaseOpen: state.databaseOpen,
        physicalCloseEntered: state.closeCalls > 0, physicalCloseReturned: state.physicalCloseReturned,
        physicalRelease: state.physicalCloseReturned ? 'CLOSE_RETURNED' : 'NOT_ESTABLISHED', nativeResourceCleanup: 'NOT_QUALIFIED', authority: 'NONE' }); }),
      revoke: F(function revoke() { state.revokeCalls++; state.trace.push('revoke'); state.revoked = true; if (state.mode === 'revokeThrow') throw Error('declared revoke refusal'); }),
      close: F(function close() {
        state.closeCalls++; state.trace.push('physical-close'); assert.equal(state.revoked, true);
        assert.equal(c.client.inspect().lifecycle, 'CLOSED'); assert.equal(c.walletOwner.inspect().lifecycle, 'CLOSED');
        if (state.mode === 'closeThrow') throw Error('declared close refusal');
        if (state.mode === 'returnsOpen') return undefined;
        state.databaseOpen = false; state.physicalCloseReturned = true; return state.mode === 'nonvoidClose' ? true : undefined;
      }) });
    let wallet = c.walletOwner;
    if (delayedWallet) {
      let resolve; const gate = new Promise(yes => { resolve = yes; }); state.resolveWallet = resolve;
      wallet = F({ inspect: F(() => c.walletOwner.inspect()), close: F(() => gate.then(() => c.walletOwner.close())) });
    }
    return application({ client: c.client, walletOwner: wallet, fileOwner: state.owner, fundingResourceUrl: c.fundingResourceUrl,
      spending: { policy: c.spending.policy, paymentId: c.spending.paymentId, readDay: c.spending.readDay } });
  } });
  h.file = port; return h;
}

check('file-profile-keeps-create-and-existing-ownership-selections-round-trippable', async () => {
  const h = f.fixture(), p = profile(fileProfile(h.policy)); assert.equal(profile({ storageProfile: p.storageProfile, allowedRoot: p.allowedRoot, filePolicy: p.filePolicy }).requiredFreeBytes, p.requiredFreeBytes);
  const existing = profile({ ...fileProfile(h.policy), storageProfile: { version: 1, mode: 'OPEN_EXISTING', databasePath: p.storageProfile.databasePath, policy: h.policy,
    ownerToken: { version: 1, storeId: 'budget.synthetic', accountId: h.policy.accountId, ownerId: 'worker.synthetic', epoch: 2, minimumRevision: 4 } } });
  assert.equal(existing.storageProfile.ownerToken.epoch, 2); assert.equal(existing.storageProfile.mode, 'OPEN_EXISTING'); await h.root.close();
});
check('file-capacity-includes-10-GiB-floor-all-declared-reserves-and-main-plus-journal-allocation', async () => {
  const h = f.fixture(), p = profile(fileProfile(h.policy)), required = 10737418240n + 8192n + 2n * 1048576n + 65536n;
  assert.equal(p.requiredFreeBytes, String(required)); assert.equal(capacity(p, String(required)).requiredFreeBytes, String(required));
  assert.throws(() => capacity(p, String(required - 1n))); assert.throws(() => capacity({ ...p, requiredFreeBytes: '1' }, '1')); await h.root.close();
});
check('file-profile-rejects-relative-roots-alternate-devices-and-unbounded-file-caps', async () => {
  const h = f.fixture(); for (const edit of [{ allowedRoot: 'relative' }, { allowedRoot: '/different' },
    { filePolicy: { expectedDevice: '-1', reservedBytes: '0', maxDatabaseBytes: 1048576 } },
    { filePolicy: { expectedDevice: '123', reservedBytes: '-1', maxDatabaseBytes: 1048576 } },
    { filePolicy: { expectedDevice: '123', reservedBytes: '0', maxDatabaseBytes: 4198400 } }]) assert.throws(() => profile(fileProfile(h.policy, edit)));
  await h.root.close();
});
check('selection-captures-existing-key-identity-policy-and-trust-without-calling-the-key-or-clock', async () => {
  const r = capturedConfiguration(), s = select(r.input); assert.equal(r.keyCalls + r.clockCalls, 0);
  assert.equal(s.configuration.fundingOptions.keyPair, r.input.configuration.fundingOptions.keyPair);
  assert.equal(s.spending.policy.accountId, r.h.policy.accountId); assert.notEqual(s.configuration.fundingOptions.fundingTransportOptions.ca, r.ca);
  assert.ok(Object.isFrozen(s.configuration.fundingOptions.readSessionOptions.endpoints[0].route)); s.release(); await r.h.root.close();
});
check('operator-mutation-after-selection-cannot-replace-the-captured-recipient-asset-or-transport', async () => {
  const r = capturedConfiguration(), s = select(r.input);
  r.input.spendingFile.storageProfile.policy.recipients[0] = 'foreign'; r.input.configuration.serviceOptions.official.assetInfo.asset = 'foreign';
  r.input.configuration.fundingOptions.fundingTransportOptions.resourceUrl = 'https://foreign.example.test/funding'; r.ca.fill(0);
  assert.notEqual(s.spending.policy.recipients[0], 'foreign'); assert.notEqual(s.configuration.serviceOptions.official.assetInfo.asset, 'foreign');
  assert.equal(s.configuration.fundingOptions.fundingTransportOptions.resourceUrl, r.h.f.resourceUrl); assert.ok(s.configuration.fundingOptions.fundingTransportOptions.ca.some(x => x !== 0));
  s.release(); await r.h.root.close();
});
check('selection-release-clears-only-owned-trust-copies-and-cannot-refund-consumption', async () => {
  const r = capturedConfiguration(), original = Buffer.from(r.ca), s = select(r.input), ca = s.configuration.fundingOptions.fundingTransportOptions.ca;
  assert.equal(consume(s), s); assert.throws(() => consume(s)); s.release(); s.release(); assert.ok(ca.every(x => x === 0)); assert.deepEqual(r.ca, original);
  assert.throws(() => consume(s)); assert.equal(r.keyCalls + r.clockCalls, 0); await r.h.root.close();
});
check('selection-rejects-account-asset-and-overlapping-store-roots-before-any-key-entry', async () => {
  for (const edit of [r => { r.input.configuration.fundingOptions.expectedAddress = 'foreign'; },
    r => { r.input.configuration.serviceOptions.official.assetInfo.asset = 'foreign'; },
    r => { r.input.configuration.storeOptions.allowedRoot = r.input.spendingFile.allowedRoot; }]) {
    const r = capturedConfiguration(); edit(r); assert.throws(() => select(r.input)); assert.equal(r.keyCalls + r.clockCalls, 0); await r.h.root.close();
  }
});
check('selection-rejects-nested-accessors-and-unselected-function-capabilities-without-invoking-them', async () => {
  const r = capturedConfiguration(); let calls = 0;
  Object.defineProperty(r.input.configuration.storeOptions.custodyPolicy, 'maxRequests', { enumerable: true, get() { calls++; return 128; } });
  assert.throws(() => select(r.input)); assert.equal(calls + r.keyCalls + r.clockCalls, 0); await r.h.root.close();
  const other = capturedConfiguration(); other.input.configuration.fundingOptions.readSessionOptions = { forbiddenFactory() { calls++; } };
  assert.throws(() => select(other.input)); assert.equal(calls, 0); await other.h.root.close();
});
check('unconsumed-released-or-forged-selection-cannot-enter-the-fixed-native-binding', async () => {
  assert.throws(() => consume({})); const r = capturedConfiguration(), s = select(r.input); s.release(); assert.throws(() => consume(s)); await r.h.root.close();
});
check('application-close-revokes-the-budget-before-physical-close-and-caches-the-same-stop', async () => {
  const h = appFixture(); const a = h.root.close(), b = h.root.close(); assert.equal(a, b); assert.equal(h.file.revoked, true); assert.equal(h.file.closeCalls, 0);
  await a; assert.deepEqual(h.file.trace, ['revoke', 'physical-close']); assert.equal(h.root.inspect().lifecycle, 'CLOSED'); assert.equal(h.file.closeCalls, 1);
  await h.root.close(); assert.equal(h.file.revokeCalls, 1); assert.equal(h.file.closeCalls, 1);
});
check('a-pending-wallet-stop-prevents-physical-close-without-marking-a-normal-close-as-held', async () => {
  const h = appFixture({ delayedWallet: true }), p = h.root.close();
  assert.equal(h.root.inspect().lifecycle, 'CLOSING'); assert.equal(h.root.inspect().held, false); assert.equal(h.file.closeCalls, 0);
  h.file.resolveWallet(); await p; assert.equal(h.file.closeCalls, 1); assert.equal(h.root.inspect().held, false);
});
check('active-preparation-close-retains-unknown-budget-and-never-forces-the-physical-file-closed', async () => {
  const h = appFixture(), p = h.root.prepareOriginalFunding(h.f.input), q = h.root.close();
  await assert.rejects(p); await assert.rejects(q); assert.equal(JSON.parse(h.raw()).reservations[0].status, 'UNKNOWN');
  assert.equal(h.file.revoked, true); assert.equal(h.file.closeCalls, 0); assert.equal(h.root.inspect().held, true);
});
check('physical-close-exception-is-held-and-is-not-retried', async () => {
  const h = appFixture({ mode: 'closeThrow' }); await assert.rejects(h.root.close()); await assert.rejects(h.root.close());
  assert.equal(h.file.closeCalls, 1); assert.equal(h.root.inspect().held, true); assert.equal(h.file.databaseOpen, true);
});
check('a-nonvoid-physical-close-or-still-open-database-cannot-become-clean-close', async () => {
  for (const mode of ['nonvoidClose', 'returnsOpen']) { const h = appFixture({ mode }); await assert.rejects(h.root.close());
    assert.equal(h.root.inspect().held, true); assert.equal(h.file.closeCalls, 1); }
});
check('logical-revoke-refusal-still-stops-the-existing-client-and-holds-physical-close', async () => {
  const h = appFixture({ mode: 'revokeThrow' }); await assert.rejects(h.root.close());
  assert.equal(h.counts.stops, 1); assert.equal(h.counts.walletStops, 1); assert.equal(h.file.closeCalls, 0); assert.equal(h.root.inspect().held, true);
});
check('fresh-view-loss-after-close-latches-held-and-never-reopens-or-retries', async () => {
  const h = appFixture(); await h.root.close(); h.file.databaseOpen = true; assert.equal(h.root.inspect().held, true);
  await h.root.close(); assert.equal(h.root.inspect().held, true); assert.equal(h.file.closeCalls, 1);
});
check('unknown-funding-retains-its-original-budget-and-open-file-under-application-close', async () => {
  const h = appFixture({ pending: true }); await h.open(); const r = await h.startFunding(() => assert.fail('no handoff'));
  assert.equal(r.status, 'CLOSE_UNKNOWN'); assert.equal(JSON.parse(h.raw()).reservations[0].status, 'UNKNOWN');
  assert.equal(h.file.closeCalls, 0); assert.equal(h.file.revoked, true); assert.equal(h.file.databaseOpen, true); assert.equal(h.counts.funding, 1);
});
check('one-grant-100-request-and-exact-replay-command-flow-joins-the-spending-file-close-owner', async () => {
  const h = appFixture(); await h.open(); const r = await h.startFunding(() => {
    for (let i = 1; i <= 100; i++) h.send(f.command('call.' + i, 'submitService', f.service(h.grant.grantId, 'request.' + i)));
    h.send(f.command('replay', 'submitService', f.service(h.grant.grantId)), f.command('close', 'close'));
  });
  assert.equal(r.status, 'CLOSED'); assert.equal(h.counts.funding, 1); assert.equal(h.counts.grants, 1); assert.equal(h.counts.executions, 100); assert.equal(h.counts.replays, 1);
  assert.equal(h.model.getGrant(h.grant.grantId).consumedUnits, 100); assert.equal(h.file.closeCalls, 1); assert.equal(h.file.databaseOpen, false);
  assert.equal(JSON.parse(h.raw()).reservations[0].status, 'SPENT'); assert.equal(r.nativeResourceCleanup, 'NOT_QUALIFIED'); assert.equal(r.serviceDelivery, 'NOT_ESTABLISHED');
});
check('stale-file-owner-is-refused-before-preparation-or-reserving-another-original', async () => {
  const h = appFixture(); h.file.fenced = true; await assert.rejects(h.root.prepareOriginalFunding(h.f.input));
  assert.equal(h.counts.prepares, 0); assert.equal(h.raw(), null); assert.equal(h.file.currentCalls, 1);
  await assert.rejects(h.root.close()); assert.equal(h.file.closeCalls, 0); assert.equal(h.root.inspect().held, true);
});
check('owner-epoch-is-rechecked-before-service-even-after-the-budget-is-spent', async () => {
  const h = appFixture(); await h.open(); const r = await h.startFunding(() => {
    h.file.fenced = true; h.send(f.command('stale', 'submitService', f.service(h.grant.grantId)));
  });
  assert.equal(r.status, 'CLOSE_UNKNOWN'); assert.equal(h.file.currentCalls, 5); assert.equal(h.counts.executions, 0);
  assert.equal(JSON.parse(h.raw()).reservations[0].status, 'SPENT'); assert.equal(h.file.closeCalls, 0);
});
check('a-nonvoid-current-owner-check-cannot-authorize-an-operation', async () => {
  const h = appFixture({ mode: 'nonvoidCurrent' }); await assert.rejects(h.root.prepareOriginalFunding(h.f.input));
  assert.equal(h.counts.prepares, 0); assert.equal(h.raw(), null); await assert.rejects(h.root.close()); assert.equal(h.file.closeCalls, 0);
});
export const apiCreditApplicationDataCases = F(checks.map(c => F(c)));
export const apiCreditApplicationDataFixtures = F({ capturedConfiguration, appFixture });
if (process.argv[1] === fileURLToPath(import.meta.url)) {
const cases = [];
for (const { id, run } of checks) { try { await run(); cases.push({ id, status: 'PASS' }); } catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); } }
const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'G1_API_CREDIT_APPLICATION_DATA', passed: cases.length - failed, failed, cases,
  priorCommandCases: apiCreditCommandDataCases.length, nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0,
  nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0, nativeFileOwnerExecution: 'NOT_ESTABLISHED',
  nativeProductAcceptance: 'NOT_ESTABLISHED', nativeHundredCallAcceptance: 'NOT_ESTABLISHED', nativeDurability: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;
}
