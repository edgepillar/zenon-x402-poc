// Actual failed-opening owner with declared client/wallet/file/Promise DATA.
// No SDK, SQLite, native opener, key, signature, timer or socket runs.
import assert from 'node:assert/strict';
import { createApiCreditReturnedOpeningCustody as own } from '../src/api-credit-returned-opening-custody.js';

const F = Object.freeze, checks = [];
function check(id, run) { checks.push({ id, run }); }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function drain() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function fixture(options = {}) {
  const events = [], clientDone = deferred(), walletDone = deferred();
  const state = { clientClosed: false, walletClosed: false, clientHeld: false, walletHeld: false,
    walletActive: null, revoked: false, closed: false, fileHeld: false, fileBusy: false,
    clientStops: 0, walletStops: 0, revokes: 0, closes: 0, clientViewUnknown: false, walletViewUnknown: false, fileViewUnknown: false };
  let clientCached = null, walletCached = null;
  const fileView = () => F({ spendingFileOwnerVersion: 1,
    lifecycle: state.fileHeld ? 'HELD' : state.closed ? 'CLOSED' : state.revoked ? 'REVOKED' : 'OPEN',
    held: state.fileHeld, busy: state.fileBusy, backendClosed: state.revoked, databaseOpen: !state.closed,
    physicalCloseEntered: state.closed, physicalCloseReturned: state.closed });
  const file = F({
    revoke: F(() => { events.push('file.revoke'); state.revokes++; state.revoked = true; return options.revoke?.(state); }),
    close: F(() => { events.push('file.close'); state.closes++;
      assert.ok(state.clientClosed && state.walletClosed && !state.clientHeld && !state.walletHeld);
      if (options.close) return options.close(state); state.closed = true; }),
    inspect: F(() => { events.push('file.view'); if (state.fileViewUnknown) throw Error('declared file view unknown');
      return options.fileView ? options.fileView(state, fileView) : fileView(); }),
  });
  const client = F({
    close: F(() => { events.push('client.close'); if (clientCached !== null) return clientCached; state.clientStops++;
      clientCached = options.clientStop ? options.clientStop(clientDone, state) : clientDone.promise; return clientCached; }),
    inspect: F(() => { events.push('client.view'); if (state.clientViewUnknown) throw Error('declared client view unknown');
      return F({ nativeFundingServiceClientVersion: 1, lifecycle: state.clientClosed ? 'CLOSED' : 'CLOSING',
        held: state.clientHeld, publicOperationActive: false }); }),
  });
  const wallet = F({
    close: F(() => { events.push('wallet.close'); if (walletCached !== null) return walletCached; state.walletStops++;
      walletCached = options.walletStop ? options.walletStop(walletDone, state) : walletDone.promise; return walletCached; }),
    inspect: F(() => { events.push('wallet.view'); if (state.walletViewUnknown) throw Error('declared wallet view unknown');
      return F({ sdk105WalletOwnerVersion: 1, lifecycle: state.walletClosed ? 'CLOSED' : 'CLOSING', held: state.walletHeld,
        activeOperation: state.walletActive, clearCalls: state.walletClosed ? 1 : 0,
        clearOutcome: state.walletClosed ? 'CLEAR_RETURNED' : 'NOT_REQUESTED' }); }),
  });
  const config = F({ fileOwner: file, clientOwner: client, walletOwner: wallet });
  return { state, events, file, client, wallet, config, clientDone, walletDone,
    finishClient(value) { state.clientClosed = true; clientDone.resolve(value); },
    finishWallet(value) { state.walletClosed = true; walletDone.resolve(value); } };
}
function held(controller) {
  const v = controller.inspect(); assert.equal(v.lifecycle, 'HELD'); assert.equal(v.held, true);
  assert.equal(v.fileOwnerRetained, true); assert.equal(v.openingMayResume, false); assert.equal(v.authority, 'NONE'); return v;
}
async function finish(f) { f.finishClient(); f.finishWallet(); await drain(); }

check('returned-opening-publishes-both-stops-and-revocation-before-any-file-close', async () => {
  const f = fixture(), c = own(f.config);
  assert.deepEqual(f.events, ['client.close', 'wallet.close', 'file.revoke']);
  assert.equal(c.inspect().lifecycle, 'CLOSING'); assert.equal(f.state.closes, 0);
  await finish(f); assert.equal(c.inspect().lifecycle, 'CLOSED'); assert.equal(f.state.closes, 1);
});
check('returned-opening-client-first-success-still-waits-for-the-original-wallet-stop', async () => {
  const f = fixture(), c = own(f.config); f.finishClient(); await drain();
  assert.equal(c.inspect().clientStopReturned, true); assert.equal(f.state.closes, 0);
  f.finishWallet(); await drain(); assert.equal(c.inspect().lifecycle, 'CLOSED');
  assert.ok(f.events.lastIndexOf('client.view') > f.events.indexOf('file.close')); assert.equal(f.state.closes, 1);
});
check('returned-opening-wallet-first-success-still-waits-for-the-original-client-stop', async () => {
  const f = fixture(), c = own(f.config); f.finishWallet(); await drain();
  assert.equal(c.inspect().walletStopReturned, true); assert.equal(f.state.closes, 0);
  f.finishClient(); await drain(); assert.equal(c.inspect().lifecycle, 'CLOSED'); assert.equal(f.state.closes, 1);
});
check('returned-opening-repeated-identical-claims-join-without-new-stop-or-close-calls', async () => {
  const f = fixture(), c = own(f.config); assert.equal(own(f.config), c); await finish(f);
  assert.equal(own(f.config), c); assert.equal(c.inspect().lifecycle, 'CLOSED');
  assert.equal(f.state.clientStops, 1); assert.equal(f.state.walletStops, 1); assert.equal(f.state.revokes, 1); assert.equal(f.state.closes, 1);
});
check('returned-opening-reentrant-same-claim-joins-before-the-first-stop-returns', async () => {
  let f, joined; f = fixture({ clientStop(done) { joined = own(f.config); return done.promise; } });
  const c = own(f.config); assert.equal(joined, c); await finish(f); assert.equal(c.inspect().lifecycle, 'CLOSED');
  assert.equal(f.state.clientStops, 1); assert.equal(f.state.walletStops, 1); assert.equal(f.state.closes, 1);
});
check('returned-opening-a-file-claim-cannot-be-rebound-to-another-wallet', async () => {
  const f = fixture(), other = fixture(), c = own(f.config);
  assert.throws(() => own(F({ fileOwner: f.file, clientOwner: f.client, walletOwner: other.wallet })));
  await finish(f); assert.equal(c.inspect().lifecycle, 'CLOSED'); assert.deepEqual(other.events, []);
});
check('returned-opening-late-wallet-completion-cannot-use-a-cached-clean-client-view', async () => {
  const f = fixture(), c = own(f.config); f.finishClient(); await drain();
  f.state.clientHeld = true; f.finishWallet(); await drain();
  held(c); assert.equal(f.state.closes, 0); f.state.clientHeld = false; held(c); assert.equal(f.state.closes, 0);
});
check('returned-opening-late-client-completion-cannot-use-a-cached-clean-wallet-view', async () => {
  const f = fixture(), c = own(f.config); f.finishWallet(); await drain();
  f.state.walletHeld = true; f.finishClient(); await drain(); held(c); assert.equal(f.state.closes, 0);
});
check('returned-opening-post-close-client-uncertainty-keeps-the-actual-file-return-and-holds', async () => {
  const f = fixture({ close(state) { state.closed = true; state.clientHeld = true; } }), c = own(f.config);
  await finish(f); const v = held(c); assert.equal(v.fileCloseReturned, true);
  assert.equal(f.state.closes, 1); f.state.clientHeld = false; held(c); assert.equal(f.state.closes, 1);
});
check('returned-opening-post-close-wallet-operation-invalidates-the-current-clean-observation', async () => {
  const f = fixture(), c = own(f.config); await finish(f); assert.equal(c.inspect().lifecycle, 'CLOSED');
  f.state.walletActive = 'DECLARED_LATE_OPERATION'; const v = held(c); assert.equal(v.fileCloseReturned, true);
  assert.equal(f.state.walletStops, 1); assert.equal(f.state.closes, 1);
});
check('returned-opening-client-stop-throw-does-not-suppress-wallet-stop-or-revocation', async () => {
  const f = fixture({ clientStop() { throw Error('declared stop failure'); } }), c = own(f.config);
  f.finishWallet(); await drain(); held(c);
  assert.equal(f.state.clientStops, 1); assert.equal(f.state.walletStops, 1); assert.equal(f.state.revokes, 1); assert.equal(f.state.closes, 0);
});
check('returned-opening-wallet-stop-throw-does-not-repeat-the-client-stop', async () => {
  const f = fixture({ walletStop() { throw Error('declared stop failure'); } }), c = own(f.config);
  f.finishClient(); await drain(); held(c); assert.equal(f.state.clientStops, 1); assert.equal(f.state.revokes, 1); assert.equal(f.state.closes, 0);
});
check('returned-opening-rejected-client-stop-is-sticky-after-a-later-clean-wallet', async () => {
  const f = fixture(), c = own(f.config); f.clientDone.reject(Error('declared rejection'));
  f.finishWallet(); await drain(); held(c); f.state.clientClosed = true; held(c); assert.equal(f.state.closes, 0);
});
check('returned-opening-nonvoid-wallet-result-never-authorizes-file-release', async () => {
  const f = fixture(), c = own(f.config); f.finishClient(); f.finishWallet('unexpected nonvoid'); await drain();
  held(c); assert.equal(f.state.closes, 0); assert.equal(c.inspect().walletStopReturned, false);
});
check('returned-opening-unobservable-client-stop-never-reads-a-thenable-hook', async () => {
  let hooks = 0; const thenable = Object.defineProperty({}, 'then', { get() { hooks++; throw Error('must not run'); } });
  const f = fixture({ clientStop() { return thenable; } }), c = own(f.config);
  f.finishWallet(); await drain(); held(c); assert.equal(hooks, 0); assert.equal(f.state.walletStops, 1); assert.equal(f.state.closes, 0);
});
check('returned-opening-revoke-throw-keeps-both-original-stops-without-a-file-retry', async () => {
  const f = fixture({ revoke() { throw Error('declared revoke failure'); } }), c = own(f.config);
  await finish(f); held(c); assert.equal(f.state.clientStops, 1); assert.equal(f.state.walletStops, 1); assert.equal(f.state.closes, 0);
});
check('returned-opening-nonvoid-revoke-is-retained-and-cannot-upgrade-after-both-stops', async () => {
  const f = fixture({ revoke() { return Promise.resolve(); } }), c = own(f.config);
  await finish(f); held(c); assert.equal(c.inspect().fileRevokeReturned, false); assert.equal(f.state.closes, 0);
});
check('returned-opening-held-budget-file-blocks-release-after-clean-child-stops', async () => {
  const f = fixture(), c = own(f.config); f.state.fileHeld = true; await finish(f); held(c); assert.equal(f.state.closes, 0);
});
check('returned-opening-physical-close-throw-is-a-single-retained-attempt', async () => {
  const f = fixture({ close() { throw Error('declared close failure'); } }), c = own(f.config);
  await finish(f); const v = held(c); assert.equal(v.fileCloseEntered, true); assert.equal(v.fileCloseReturned, false);
  assert.equal(own(f.config), c); held(c); assert.equal(f.state.closes, 1); assert.equal(f.state.revokes, 1);
});
check('returned-opening-void-close-preserves-its-fact-when-the-next-file-view-is-unknown', async () => {
  const f = fixture({ close(state) { state.closed = true; state.fileViewUnknown = true; } }), c = own(f.config);
  await finish(f); const v = held(c); assert.equal(v.fileCloseReturned, true); assert.equal(f.state.closes, 1);
});
check('returned-opening-void-close-with-an-open-database-view-remains-held', async () => {
  const f = fixture({ close() {} }), c = own(f.config); await finish(f); held(c);
  assert.equal(c.inspect().fileCloseReturned, true); assert.equal(f.state.closes, 1);
});
check('returned-opening-early-unknown-client-view-cannot-be-repaired-by-a-late-clean-view', async () => {
  const f = fixture(), c = own(f.config); f.state.clientViewUnknown = true; f.finishClient(); await drain(); held(c);
  f.state.clientViewUnknown = false; f.finishWallet(); await drain(); held(c); assert.equal(f.state.closes, 0);
});
check('returned-opening-accessor-configuration-is-rejected-before-any-owner-call', () => {
  const f = fixture(); let hooks = 0;
  const bad = F({ fileOwner: f.file, clientOwner: f.client, get walletOwner() { hooks++; return f.wallet; } });
  assert.throws(() => own(bad)); assert.equal(hooks, 0); assert.deepEqual(f.events, []);
  assert.throws(() => own(f.config, f.config)); assert.deepEqual(f.events, []);
});
check('returned-opening-one-object-cannot-be-selected-for-two-owner-roles', () => {
  const f = fixture(); assert.throws(() => own(F({ fileOwner: f.file, clientOwner: f.client, walletOwner: f.client })));
  assert.deepEqual(f.events, []);
});



check('returned-opening-held-custody-limit-denies-new-claims-without-owner-side-effects', () => {
  // Sixteen earlier independent unknown frames are intentionally retained.
  const f = fixture(); assert.throws(() => own(f.config)); assert.deepEqual(f.events, []);
});

const cases = [];
for (const { id, run } of checks) {
  try { await run(); cases.push({ id, status: 'PASS' }); }
  catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? 'unknown').slice(0, 256) }); }
}
const failed = cases.filter(c => c.status === 'FAIL').length;
console.log(JSON.stringify({ qualification: 'G2_API_CREDIT_RETURNED_OPENING_CUSTODY_DATA',
  passed: cases.length - failed, failed, cases, actualReturnedOpeningOwner: true,
  storeWalletClientAndClosePorts: 'DECLARED_DATA_ONLY', nativeExecutions: 0, SDK: 0, SQLite: 0,
  keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
  nativeReturnedOpeningExecuted: false, nativePhysicalRelease: 'NOT_ESTABLISHED', LinuxAcceptance: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;
