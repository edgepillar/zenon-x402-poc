// Declared method ports only: no SDK KeyPair, private key or cryptographic sign.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { apiCreditProductDataCases } from './api-credit-product.behavior.mjs';
import { createSdk105ApiCreditExistingKeyLease as create, claimSdk105ApiCreditExistingKeyLease as claim,
  bindSdk105ApiCreditExistingKeyLeaseOwner as bind } from '../src/zenon/sdk105-api-credit-existing-key-lease.js';

const F = Object.freeze, checks = [...apiCreditProductDataCases], leases = [];
function check(id, run) { checks.push({ id, run }); }
function fixture(options = {}) {
  const r = { calls: { address: 0, public: 0, sign: 0, clear: 0, ownerClose: 0, ownerInspect: 0 }, busy: false, closed: false,
    failed: false, closing: null, resolve: null, reject: null, raw: null, lease: null, onSign: null, onClear: null };
  const signatureData = Buffer.alloc(64, 7); // Declared bytes, never a produced signature.
  r.raw = { getAddress() { r.calls.address++; return options.addressResult ?? 'declared.address'; },
    getPublicKey() { r.calls.public++; return Buffer.alloc(32, 3); },
    sign(input) { r.calls.sign++; r.signReceiver = this; r.signInput = input; if (r.onSign) r.onSign(); return signatureData; },
    clear() { r.calls.clear++; if (r.onClear) r.onClear(); if (options.clearThrow) throw Error('declared clear refusal'); return options.clearResult; } };
  r.lease = create(r.raw); leases.push(r.lease);
  r.finish = () => {
    if (r.closing === null || r.busy || r.closed || r.failed || options.delay) return;
    try { r.lease.keyPair.clear(); r.closed = true; r.resolve(undefined); }
    catch { r.failed = true; r.reject(Error('declared owner close unknown')); }
  };
  r.owner = F({ close: F(function close() {
    r.calls.ownerClose++;
    if (options.ownerThrow) throw Error('declared owner failure');
    if (options.ownerResult !== undefined) return options.ownerResult;
    if (r.closing === null) { r.closing = new Promise((yes, no) => { r.resolve = yes; r.reject = no; }); r.finish(); }
    return r.closing;
  }), inspect: F(function inspect() {
    r.calls.ownerInspect++; if (options.inspectThrow) throw Error('declared inspect failure');
    return F({ sdk105WalletOwnerVersion: 1, lifecycle: r.closed ? 'CLOSED' : 'OPEN', held: r.failed,
      activeOperation: r.busy ? 'sign' : null, clearCalls: r.calls.clear, clearOutcome: r.closed ? 'CLEAR_RETURNED' : 'NOT_REQUESTED', ...options.view });
  }) });
  r.adopt = () => { assert.equal(claim(r.lease.keyPair), true); assert.equal(bind(r.lease.keyPair, r.owner), true); };
  return r;
}
check('key-lease-construction-is-descriptor-only-and-the-handle-is-frozen', async () => {
  const r = fixture(); assert.equal(Object.values(r.calls).reduce((a, b) => a + b, 0), 0);
  assert.ok(Object.isFrozen(r.lease)); assert.ok(Object.isFrozen(r.lease.keyPair)); assert.equal(r.lease.inspect().lifecycle, 'UNCLAIMED'); await r.lease.close();
});
check('unclaimed-close-clears-once-and-returns-one-cached-receipt', async () => {
  const r = fixture(), a = r.lease.close(), b = r.lease.close(); assert.equal(a, b); await a;
  assert.equal(r.calls.clear, 1); assert.equal(r.calls.ownerClose, 0); assert.equal(r.lease.inspect().lifecycle, 'CLOSED'); await r.lease.close(); assert.equal(r.calls.clear, 1);
});
check('revocation-precedes-unclaimed-clear-callbacks-and-blocks-a-late-native-claim', async () => {
  const r = fixture(); r.onClear = () => { assert.throws(() => claim(r.lease.keyPair)); assert.equal(r.lease.close(), r.lease.close()); };
  await r.lease.close(); assert.throws(() => claim(r.lease.keyPair)); assert.throws(() => r.lease.keyPair.sign(Buffer.alloc(32)));
  assert.equal(r.calls.clear, 1); assert.equal(r.calls.sign, 0);
});
check('key-methods-cannot-enter-before-both-native-claim-and-wallet-binding', async () => {
  const r = fixture(); for (const name of ['getAddress', 'getPublicKey', 'sign', 'clear']) assert.throws(() => r.lease.keyPair[name]());
  claim(r.lease.keyPair); assert.throws(() => r.lease.keyPair.getAddress()); bind(r.lease.keyPair, r.owner);
  assert.equal(r.lease.keyPair.getAddress(), 'declared.address'); await r.lease.close();
});
check('bound-key-methods-preserve-receiver-input-and-returned-data', async () => {
  const r = fixture(), input = Buffer.alloc(32, 9); let received;
  r.raw.sign = function () { throw Error('must use the originally captured method'); };
  r.adopt(); const output = r.lease.keyPair.sign(input); received = output;
  assert.equal(received.length, 64); assert.ok(received.every(x => x === 7)); assert.equal(r.calls.sign, 1);
  assert.equal(r.signReceiver, r.raw); assert.equal(r.signInput, input);
  assert.equal(r.lease.keyPair.getPublicKey().length, 32); await r.lease.close(); assert.equal(r.calls.clear, 1);
});
check('a-raw-key-cannot-be-leased-again-even-after-its-first-close', async () => {
  const r = fixture(); assert.throws(() => create(r.raw)); await r.lease.close(); assert.throws(() => create(r.raw));
});
check('copied-key-methods-do-not-forge-the-native-claim-brand', async () => {
  const r = fixture(), copy = F({ ...r.lease.keyPair }); assert.equal(claim(copy), false); assert.throws(() => copy.getAddress());
  assert.equal(r.calls.address, 0); await r.lease.close();
});
check('bare-legacy-keys-do-not-enter-the-lease-protocol-or-wallet-view', () => {
  let calls = 0; const raw = F({ get sign() { calls++; throw Error('must not enter'); } });
  assert.equal(claim(raw), false); assert.equal(bind(raw, new Proxy({}, { get() { calls++; } })), false); assert.equal(calls, 0);
});
check('raw-key-accessors-and-prototype-proxies-are-rejected-without-entry', () => {
  let calls = 0; const raw = {}; Object.defineProperty(raw, 'getAddress', { get() { calls++; return () => {}; } }); assert.throws(() => create(raw));
  assert.throws(() => create(new Proxy({}, { getPrototypeOf() { calls++; return null; } })));
  assert.equal(calls, 0);
});
check('sdk-prototype-method-lookup-retains-the-original-receiver', async () => {
  let calls = 0; const proto = { getAddress() { assert.equal(this, raw); calls++; return 'declared'; }, getPublicKey() {}, sign() {}, clear() { calls++; } }, raw = Object.create(proto);
  const lease = create(raw); leases.push(lease); claim(lease.keyPair);
  const owner = F({ close: F(() => { lease.keyPair.clear(); return Promise.resolve(); }), inspect: F(() => F({ sdk105WalletOwnerVersion: 1,
    lifecycle: 'CLOSED', held: false, activeOperation: null, clearCalls: 1, clearOutcome: 'CLEAR_RETURNED' })) });
  bind(lease.keyPair, owner); assert.equal(lease.keyPair.getAddress(), 'declared'); await lease.close(); assert.equal(calls, 2);
});
check('a-second-native-claim-and-a-second-wallet-binding-are-refused', async () => {
  const r = fixture(); r.adopt(); assert.throws(() => claim(r.lease.keyPair)); assert.throws(() => bind(r.lease.keyPair, r.owner));
  await r.lease.close(); assert.equal(r.calls.ownerClose, 1);
});
check('claimed-close-delegates-to-the-original-wallet-stop-before-clearing', async () => {
  const r = fixture({ delay: true }); r.adopt(); const p = r.lease.close(); assert.equal(r.calls.ownerClose, 1); assert.equal(r.calls.clear, 0);
  assert.throws(() => r.lease.keyPair.getAddress()); assert.equal(r.lease.inspect().lifecycle, 'CLOSING');
  r.lease.keyPair.clear(); r.closed = true; r.resolve(undefined); await p; assert.equal(r.calls.clear, 1); assert.equal(r.lease.inspect().lifecycle, 'CLOSED');
});
check('a-key-cleared-by-the-original-wallet-is-not-cleared-again-by-launcher-close', async () => {
  const r = fixture(); r.adopt(); await r.owner.close(); assert.equal(r.calls.clear, 1); await r.lease.close();
  assert.equal(r.calls.clear, 1); assert.equal(r.lease.inspect().ownerStopReturned, true);
});
check('reentrant-launcher-close-joins-the-original-active-wallet-operation', async () => {
  const r = fixture(); r.adopt(); let stop; r.busy = true;
  r.onSign = () => { stop = r.lease.close(); assert.equal(r.calls.clear, 0); assert.throws(() => r.lease.keyPair.getAddress()); };
  const retained = r.lease.keyPair.sign(Buffer.alloc(32)); assert.equal(retained.length, 64); assert.equal(r.calls.clear, 0);
  r.busy = false; r.finish(); await stop; assert.equal(r.calls.sign, 1); assert.equal(r.calls.clear, 1); assert.equal(r.lease.inspect().held, false);
});
check('claimed-without-returned-wallet-remains-held-and-never-direct-clears', async () => {
  const r = fixture(); claim(r.lease.keyPair); const p = r.lease.close(); await assert.rejects(p);
  assert.equal(r.calls.clear, 0); assert.equal(r.lease.inspect().held, true); assert.equal(r.lease.close(), p);
});
check('a-late-wallet-is-stopped-once-without-upgrading-the-first-held-close', async () => {
  const r = fixture(); claim(r.lease.keyPair); const p = r.lease.close(); await assert.rejects(p);
  assert.throws(() => bind(r.lease.keyPair, r.owner)); await Promise.resolve(); await Promise.resolve();
  assert.equal(r.calls.ownerClose, 1); assert.equal(r.calls.clear, 1); assert.equal(r.lease.inspect().ownerStopReturned, true);
  assert.equal(r.lease.inspect().held, true); await assert.rejects(r.lease.close());
});
check('an-owner-close-exception-is-held-without-retrying-or-direct-clear', async () => {
  const r = fixture({ ownerThrow: true }); r.adopt(); await assert.rejects(r.lease.close()); await assert.rejects(r.lease.close());
  assert.equal(r.calls.ownerClose, 1); assert.equal(r.calls.clear, 0); assert.equal(r.lease.inspect().held, true);
});
check('an-owner-thenable-is-not-assimilated', async () => {
  let entered = 0; const result = {}; Object.defineProperty(result, 'then', { get() { entered++; return () => {}; } });
  const r = fixture({ ownerResult: result }); r.adopt(); await assert.rejects(r.lease.close()); assert.equal(entered, 0); assert.equal(r.calls.clear, 0);
});
check('an-owner-close-promise-constructor-accessor-is-not-entered', async () => {
  let entered = 0; const result = Promise.resolve(undefined); Object.defineProperty(result, 'constructor', { get() { entered++; return Promise; } });
  const r = fixture({ ownerResult: result }); r.adopt(); await assert.rejects(r.lease.close()); assert.equal(entered, 0); assert.equal(r.calls.clear, 0);
});
check('a-clean-looking-owner-view-cannot-substitute-for-the-actual-clear-receipt', async () => {
  const r = fixture({ ownerResult: Promise.resolve(undefined), view: { lifecycle: 'CLOSED', clearCalls: 1, clearOutcome: 'CLEAR_RETURNED' } });
  r.adopt(); await assert.rejects(r.lease.close()); assert.equal(r.calls.clear, 0); assert.equal(r.lease.inspect().rawClearReturned, false);
});
check('a-malformed-current-owner-view-preserves-unknown-after-one-returned-clear', async () => {
  const r = fixture({ view: { held: true } }); r.adopt(); await assert.rejects(r.lease.close());
  assert.equal(r.calls.clear, 1); assert.equal(r.lease.inspect().rawClearReturned, true); assert.equal(r.lease.inspect().held, true);
});
check('raw-clear-throw-never-gets-another-clear-attempt', async () => {
  const r = fixture({ clearThrow: true }); await assert.rejects(r.lease.close()); await assert.rejects(r.lease.close());
  assert.equal(r.calls.clear, 1); assert.equal(r.lease.inspect().lifecycle, 'HELD');
});
check('a-nonvoid-clear-return-is-not-a-clear-completion', async () => {
  const r = fixture({ clearResult: true }); await assert.rejects(r.lease.close()); assert.equal(r.lease.inspect().rawClearReturned, false); assert.equal(r.calls.clear, 1);
});
check('an-unsupported-clear-promise-is-observed-only-to-suppress-its-native-rejection', async () => {
  const r = fixture({ clearResult: Promise.reject(Error('declared rejected clear port')) }); await assert.rejects(r.lease.close());
  assert.equal(r.calls.clear, 1); assert.equal(r.lease.inspect().held, true); assert.equal(r.lease.inspect().unobservedClearResultHeld, true);
});
check('a-clear-thenable-getter-is-never-entered', async () => {
  let entered = 0; const value = {}; Object.defineProperty(value, 'then', { get() { entered++; return () => {}; } });
  const r = fixture({ clearResult: value }); await assert.rejects(r.lease.close()); assert.equal(entered, 0); assert.equal(r.calls.clear, 1);
});
check('lease-inspection-exposes-no-key-material-and-closed-handles-cannot-reenter', async () => {
  const r = fixture(); r.adopt(); await r.lease.close(); const v = r.lease.inspect();
  assert.equal(v.authority, 'NONE'); assert.equal(v.keyErasure, 'NOT_ESTABLISHED'); assert.equal(v.signerRecovery, 'NOT_ESTABLISHED');
  assert.ok(!Reflect.ownKeys(v).some(k => /private|secret|signature|publicKey|address/.test(k)));
  assert.throws(() => r.lease.keyPair.getPublicKey()); assert.throws(() => r.lease.keyPair.clear()); assert.equal(r.calls.clear, 1);
});
check('a-previously-held-key-close-rejects-before-a-pending-wallet-stop-can-settle', async () => {
  const r = fixture({ clearResult: true, delay: true }); r.adopt(); assert.throws(() => r.lease.keyPair.clear());
  const p = r.lease.close(); let outcome = 'PENDING'; p.then(() => { outcome = 'FULFILLED'; }, () => { outcome = 'REJECTED'; });
  assert.equal(r.lease.inspect().lifecycle, 'HELD'); await Promise.resolve(); await Promise.resolve(); assert.equal(outcome, 'REJECTED');
  assert.equal(r.calls.ownerClose, 1); assert.equal(r.calls.clear, 1); r.closed = true; r.resolve(undefined);
  await Promise.resolve(); await Promise.resolve(); assert.equal(r.lease.inspect().ownerStopReturned, true);
  assert.equal(r.lease.inspect().held, true); assert.equal(r.lease.close(), p);
});
check('held-during-wallet-stop-rejects-even-if-that-wallet-claims-a-clean-return', async () => {
  const r = fixture({ clearResult: true }); claim(r.lease.keyPair);
  const owner = F({ close: F(() => { r.calls.ownerClose++; try { r.lease.keyPair.clear(); } catch {} return Promise.resolve(undefined); }),
    inspect: F(() => F({ sdk105WalletOwnerVersion: 1, lifecycle: 'CLOSED', held: false, activeOperation: null, clearCalls: 1, clearOutcome: 'CLEAR_RETURNED' })) });
  bind(r.lease.keyPair, owner); const p = r.lease.close(); let outcome = 'PENDING'; p.then(() => { outcome = 'FULFILLED'; }, () => { outcome = 'REJECTED'; });
  for (let i = 0; i < 5; i++) await Promise.resolve(); assert.equal(outcome, 'REJECTED');
  assert.equal(r.lease.inspect().held, true); assert.equal(r.calls.clear, 1); assert.equal(r.calls.ownerClose, 1); await assert.rejects(r.lease.close());
});
check('unknown-key-leases-have-a-finite-retained-owner-limit', async () => {
  for (const lease of leases) assert.ok(['HELD', 'CLOSED'].includes(lease.inspect().lifecycle));
  let held = leases.filter(l => l.inspect().held).length; assert.ok(held < 16);
  for (; held < 16; held++) { const r = fixture({ clearThrow: true }); await assert.rejects(r.lease.close()); }
  assert.throws(() => fixture());
});
const cases = [];
for (const { id, run } of checks) { try { await run(); cases.push({ id, status: 'PASS' }); } catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); } }
const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'G0_G2_EXISTING_KEY_LEASE_DATA', passed: cases.length - failed, failed, cases, priorProductCases: apiCreditProductDataCases.length,
  declaredKeyMethodPortsOnly: true, nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0,
  nodeChildren: 0, actualPrepare: 0, payouts: 0, nativeKeyLeaseAcceptance: 'NOT_ESTABLISHED', nativeProductAcceptance: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;
