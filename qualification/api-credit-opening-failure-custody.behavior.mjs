// Actual failure-custody owner with declared file/wallet/Promise ports only.
// No filesystem, SQLite, native opener, key, SDK or process operation runs.
import assert from 'node:assert/strict';
import { createApiCreditOpeningFailureCustody as own } from '../src/api-credit-opening-failure-custody.js';

const F = Object.freeze, checks = [];
function check(id, run) { checks.push({ id, run }); }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function drain() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function fixture(options = {}) {
  const events = [], stop = deferred();
  const state = { revoked: false, closed: false, walletClosed: false, walletHeld: false, walletStops: 0, physicalClears: 0,
    revokes: 0, closes: 0, fileHeld: false, fileViewUnknown: false, walletViewUnknown: false };
  const fileView = () => F({ spendingFileOwnerVersion: 1, lifecycle: state.fileHeld ? 'HELD' : state.closed ? 'CLOSED' : state.revoked ? 'REVOKED' : 'OPEN',
    held: state.fileHeld, busy: false, backendClosed: state.revoked, databaseOpen: !state.closed,
    physicalCloseEntered: state.closed, physicalCloseReturned: state.closed });
  const file = F({
    revoke: F(() => { events.push('file.revoke'); state.revokes++; state.revoked = true; return options.revoke?.(state, events); }),
    close: F(() => { events.push('file.close'); state.closes++; if (options.close) return options.close(state, events); state.closed = true; }),
    inspect: F(() => { events.push('file.view'); if (state.fileViewUnknown) throw Error('synthetic file view uncertainty'); return options.fileView ? options.fileView(state, fileView) : fileView(); }),
  });
  let cached = null;
  const wallet = F({
    close: F(() => { events.push('wallet.close'); if (cached !== null) return cached; state.walletStops++; cached = options.stop ? options.stop(stop, state) : stop.promise; return cached; }),
    inspect: F(() => { events.push('wallet.view'); if (state.walletViewUnknown) throw Error('synthetic wallet view uncertainty');
      return F({ sdk105WalletOwnerVersion: 1, lifecycle: state.walletClosed ? 'CLOSED' : 'CLOSING', held: state.walletHeld,
        activeOperation: null, clearCalls: state.physicalClears, clearOutcome: state.walletClosed ? 'CLEAR_RETURNED' : 'NOT_REQUESTED' }); }),
  });
  const config = (walletPresent = true, walletEntered = true, clientEntered = false) => F({ fileOwner: file,
    walletOwner: walletPresent ? wallet : null, walletOpeningEntered: walletEntered, clientOpeningEntered: clientEntered });
  const finish = value => { state.walletClosed = true; state.physicalClears = 1; stop.resolve(value); };
  return { state, events, stop, file, wallet, config, finish };
}
function held(controller) {
  const view = controller.inspect(); assert.equal(view.lifecycle, 'HELD'); assert.equal(view.held, true);
  assert.equal(view.fileOwnerRetained, true); assert.equal(view.openingMayResume, false); assert.equal(view.authority, 'NONE'); return view;
}

check('opening-custody-unreturned-native-client-revokes-without-physical-close-or-competing-wallet-stop', async () => {
  const f = fixture(), controller = own(f.config(true, true, true)), view = held(controller);
  assert.equal(view.unreturnedBorrower, true); assert.equal(view.fileRevokeReturned, true);
  assert.equal(f.state.revokes, 1); assert.equal(f.state.closes, 0); assert.equal(f.state.walletStops, 0);
  f.finish(); await drain(); held(controller); assert.equal(f.state.closes, 0);
});
check('opening-custody-entered-wallet-constructor-with-no-returned-owner-retains-its-budget-file', () => {
  const f = fixture(), controller = own(f.config(false, true, false)); held(controller);
  assert.equal(f.state.revokes, 1); assert.equal(f.state.closes, 0); assert.equal(f.state.walletStops, 0);
});
check('opening-custody-pre-borrower-refusal-closes-the-exclusive-file-after-revoke-and-fresh-view', () => {
  const f = fixture(), controller = own(f.config(false, false, false)), view = controller.inspect();
  assert.equal(view.lifecycle, 'CLOSED'); assert.equal(view.fileCloseReturned, true); assert.equal(view.fileOwnerRetained, false);
  assert.deepEqual(f.events, ['file.revoke', 'file.view', 'file.close', 'file.view']); assert.equal(f.state.closes, 1);
});
check('opening-custody-returned-wallet-before-client-entry-stops-before-any-file-close', async () => {
  const f = fixture(), controller = own(f.config());
  assert.equal(controller.inspect().lifecycle, 'CLOSING'); assert.equal(f.state.closes, 0); assert.equal(f.state.walletStops, 1);
  f.finish(); await drain(); assert.equal(controller.inspect().lifecycle, 'CLOSED');
  assert.ok(f.events.indexOf('wallet.close') < f.events.indexOf('wallet.view'));
  assert.ok(f.events.indexOf('wallet.view') < f.events.indexOf('file.close')); assert.equal(f.state.closes, 1);
});
check('opening-custody-caller-joining-the-wallet-cached-stop-does-not-repeat-the-physical-clear', async () => {
  const f = fixture(), controller = own(f.config()), outer = f.wallet.close();
  assert.equal(outer, f.stop.promise); assert.equal(f.state.walletStops, 1);
  f.finish(); await outer; await drain(); assert.equal(f.state.physicalClears, 1); assert.equal(f.state.closes, 1);
  assert.equal(controller.inspect().lifecycle, 'CLOSED');
});
check('opening-custody-repeated-same-claim-joins-the-original-observation-without-new-stops', async () => {
  const f = fixture(), config = f.config(), first = own(config);
  assert.equal(own(config), first); assert.equal(f.state.revokes, 1); assert.equal(f.state.walletStops, 1);
  f.finish(); await drain(); assert.equal(own(config), first); assert.equal(f.state.closes, 1);
});
check('opening-custody-a-held-claim-cannot-be-rebound-to-a-less-conservative-phase', () => {
  const f = fixture(), first = own(f.config(true, true, true));
  assert.throws(() => own(f.config(true, true, false))); assert.equal(own(f.config(true, true, true)), first);
  held(first); assert.equal(f.state.revokes, 1); assert.equal(f.state.closes, 0);
});
check('opening-custody-revoke-throw-retains-unknown-even-after-the-known-wallet-stops-late', async () => {
  const f = fixture({ revoke() { throw Error('synthetic revoke uncertainty'); } }), controller = own(f.config());
  held(controller); assert.equal(f.state.walletStops, 1); f.finish(); await drain();
  assert.equal(held(controller).walletStopReturned, true); assert.equal(f.state.closes, 0); assert.equal(f.state.revokes, 1);
});
check('opening-custody-nonvoid-revoke-is-retained-without-reading-a-thenable', () => {
  let entered = 0; const opaque = {}; Object.defineProperty(opaque, 'then', { get() { entered++; throw Error('unselected'); } });
  const f = fixture({ revoke: () => opaque }), controller = own(f.config(false, false, false));
  assert.equal(held(controller).fileRevokeReturned, false); assert.equal(entered, 0); assert.equal(f.state.closes, 0);
});
check('opening-custody-rejected-wallet-stop-never-closes-or-reopens-the-file', async () => {
  const f = fixture(), controller = own(f.config()); f.stop.reject(Error('synthetic stop uncertainty')); await drain();
  held(controller); assert.equal(f.state.closes, 0); assert.equal(f.state.walletStops, 1);
  assert.equal(own(f.config()), controller); assert.equal(f.state.walletStops, 1);
});
check('opening-custody-nonvoid-wallet-stop-cannot-become-a-release-receipt', async () => {
  const f = fixture(), controller = own(f.config()); f.finish(false); await drain();
  assert.equal(held(controller).walletStopReturned, false); assert.equal(f.state.closes, 0);
});
check('opening-custody-unobservable-wallet-stop-is-retained-without-thenable-assimilation', () => {
  let entered = 0; const opaque = {}; Object.defineProperty(opaque, 'then', { get() { entered++; throw Error('unselected'); } });
  const f = fixture({ stop: () => opaque }), controller = own(f.config()); held(controller);
  assert.equal(entered, 0); assert.equal(f.state.closes, 0); assert.equal(f.state.walletStops, 1);
});
check('opening-custody-void-stop-still-requires-a-current-clean-wallet-view', async () => {
  const f = fixture(), controller = own(f.config()); f.state.walletViewUnknown = true; f.finish(); await drain();
  held(controller); assert.equal(f.state.closes, 0);
});
check('opening-custody-a-newly-held-file-view-blocks-physical-close-after-wallet-stop', async () => {
  const f = fixture(), controller = own(f.config()); f.state.fileHeld = true; f.finish(); await drain();
  held(controller); assert.equal(f.state.closes, 0); assert.equal(f.state.walletStops, 1);
});
check('opening-custody-file-close-throw-is-one-attempt-and-does-not-reset-the-original-failure', () => {
  const f = fixture({ close() { throw Error('synthetic physical close uncertainty'); } }), controller = own(f.config(false, false, false));
  const view = held(controller); assert.equal(view.fileCloseEntered, true); assert.equal(view.fileCloseReturned, false);
  assert.equal(own(f.config(false, false, false)), controller); assert.equal(f.state.closes, 1);
});
check('opening-custody-void-file-close-keeps-its-fact-when-the-post-close-view-is-unknown', () => {
  const f = fixture({ close(state) { state.closed = true; state.fileViewUnknown = true; } }), controller = own(f.config(false, false, false));
  const view = held(controller); assert.equal(view.fileCloseReturned, true); assert.equal(view.fileOwnerRetained, true); assert.equal(f.state.closes, 1);
});
check('opening-custody-nonvoid-file-close-is-unknown-and-never-retried', () => {
  const f = fixture({ close: () => Promise.resolve(undefined) }), controller = own(f.config(false, false, false));
  assert.equal(held(controller).fileCloseReturned, false); assert.equal(f.state.closes, 1);
  assert.equal(own(f.config(false, false, false)), controller); assert.equal(f.state.closes, 1);
});
check('opening-custody-reentrant-same-file-claim-joins-before-any-port-is-invoked-twice', () => {
  let f, reentered; f = fixture({ revoke() { reentered = own(f.config(false, false, false)); } });
  const controller = own(f.config(false, false, false)); assert.equal(reentered, controller);
  assert.equal(controller.inspect().lifecycle, 'CLOSED'); assert.equal(f.state.revokes, 1); assert.equal(f.state.closes, 1);
});
check('opening-custody-invalid-stage-or-accessor-input-cannot-request-any-cleanup', () => {
  const f = fixture(); let entered = 0;
  const accessor = { ...f.config() }; Object.defineProperty(accessor, 'clientOpeningEntered', { enumerable: true, get() { entered++; throw Error('unselected'); } }); F(accessor);
  const proxy = new Proxy(f.config(), { get() { entered++; throw Error('unselected'); }, ownKeys() { entered++; throw Error('unselected'); } });
  for (const config of [f.config(true, false, false), f.config(false, false, true), accessor, proxy]) assert.throws(() => own(config));
  assert.equal(entered, 0); assert.equal(f.state.revokes, 0); assert.equal(f.state.closes, 0); assert.equal(f.state.walletStops, 0);
});
check('opening-custody-clean-observation-is-bounded-history-without-restart-or-operation-capabilities', () => {
  const f = fixture(), controller = own(f.config(false, false, false)), view = controller.inspect();
  assert.deepEqual(Reflect.ownKeys(controller), ['inspect']); assert.equal(Object.isFrozen(controller), true); assert.equal(Object.isFrozen(view), true);
  assert.equal(view.authority, 'NONE'); assert.equal(view.openingMayResume, false); assert.equal(view.nativeResourceRelease, 'NOT_ESTABLISHED');
  for (const name of ['file', 'wallet', 'reopen', 'retry', 'release', 'sign', 'prepare', 'submit', 'close']) assert.equal(Object.hasOwn(controller, name), false);
});

const cases = [];
for (const { id, run } of checks) { try { await run(); cases.push({ id, status: 'PASS' }); } catch (error) { cases.push({ id, status: 'FAIL', error: String(error?.message ?? error) }); } }
const failed = cases.filter(row => row.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'G2_API_CREDIT_OPENING_FAILURE_CUSTODY_DATA', passed: cases.length - failed, failed, cases,
  actualOpeningFailureCustodyOwner: true, fileWalletAndStopPorts: 'DECLARED_DATA_ONLY',
  nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
  nativeApplicationExecuted: false, nativePhysicalRelease: 'NOT_ESTABLISHED', freshProcessAcceptance: 'NOT_ESTABLISHED', LinuxAcceptance: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;
