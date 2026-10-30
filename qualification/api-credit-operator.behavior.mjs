// Declared DATA/method ports only. Native CLI, pipes, SDK and keys are not loaded.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { apiCreditKeyLeaseDataCases } from './api-credit-key-lease.behavior.mjs';
import { apiCreditApplicationDataFixtures as fixtures } from './api-credit-application.behavior.mjs';
import { canonicalJson } from '../src/canonical.js';
import { captureApiCreditCliArguments as args } from '../src/api-credit-cli-arguments.js';
import { captureApiCreditOperatorUtcDay as day } from '../src/api-credit-operator-clock.js';
import { decodeApiCreditOperatorBootstrap as decode, bindApiCreditOperatorBootstrap as bind } from '../src/api-credit-operator-bootstrap.js';
import { runApiCreditOperatorCoordinator as run } from '../src/api-credit-operator-coordinator.js';
import { assertSdk105ApiCreditProductSelection as assertSelection, consumeSdk105ApiCreditProductSelection as consume } from '../src/zenon/sdk105-api-credit-product-profile.js';

const F = Object.freeze, checks = [...apiCreditKeyLeaseDataCases], roots = [];
const argv = () => ['--profile-fd', '3', '--key-fd', '4', '--input-fd', '5', '--output-fd', '6', '--bootstrap-ms', '1000'];
const cleanHost = () => F({ buyerOriginalCommandHostResultVersion: 1, mode: 'FUNDING_API_CREDIT', status: 'CLOSED', exitCode: 0,
  ownersClosedObserved: true, sessionLifecycle: 'CLOSED', sessionHeld: false, outputOutcomeUnknown: false,
  fundingOutcomeUnknown: false, recoveryOutcomeUnknown: false });
function check(id, fn) { checks.push({ id, run: fn }); }
function pending() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function flush() { for (let i = 0; i < 32; i++) await Promise.resolve(); }
function publicData() {
  const r = fixtures.capturedConfiguration(); roots.push(r.h.root);
  const c = r.input.configuration, { keyPair, ...funding } = c.fundingOptions, { ca: fundingCa, ...ft } = funding.fundingTransportOptions;
  const { official, ...service } = c.serviceOptions, { ca: serviceCa, ...st } = service.transportOptions;
  return { operatorBootstrapVersion: 1, productProfileVersion: 1,
    paymentRequiredHeader: r.h.f.input.challenge.paymentRequiredHeader,
    publicCaPem: '-----BEGIN CERTIFICATE-----\nU1lOVEhFVElDLURBVEE=\n-----END CERTIFICATE-----\n',
    configuration: { storeOptions: c.storeOptions, fundingOptions: { ...funding, fundingTransportOptions: ft },
      serviceOptions: { ...service, assetInfo: official.assetInfo, contextLimit: official.contextLimit, transportOptions: st } },
    spendingFile: r.input.spendingFile, spending: { paymentId: r.input.spending.paymentId }, limits: {} };
}
function declaredKey() {
  const forbidden = F(() => { throw Error('declared key methods must not be entered'); });
  return F({ getAddress: forbidden, getPublicKey: forbidden, sign: forbidden, clear: forbidden });
}
function declaredOperator(options = {}) {
  const data = publicData(); if (options.edit) options.edit(data);
  const r = { data, profile: Buffer.from(options.text ?? canonicalJson(data)), credential: Buffer.alloc(options.keyBytes ?? 32, 9),
    now: 0n, timers: [], trace: [], guards: {}, calls: { key: 0, keyStop: 0, session: 0, sessionStop: 0, host: 0, inputs: 0 }, selection: null,
    keyClosed: false, sessionClosed: false, keyStop: null, sessionStop: null };
  r.key = F({ keyPair: declaredKey(), close: F(() => {
    r.calls.keyStop++; if (r.keyStop !== null) return r.keyStop;
    if (options.keyClose) return r.keyStop = options.keyClose(r);
    r.keyClosed = true; return r.keyStop = Promise.resolve(undefined);
  }), inspect: F(() => F({ sdk105ExistingKeyLeaseVersion: 1, lifecycle: r.keyClosed ? 'CLOSED' : 'CLOSING',
    held: false, rawClearCalls: r.keyClosed ? 1 : 0, rawClearReturned: r.keyClosed })) });
  r.session = F({ close: F(() => {
    r.calls.sessionStop++; if (r.sessionStop !== null) return r.sessionStop;
    r.sessionClosed = true; return r.sessionStop = Promise.resolve(options.sessionCloseValue);
  }), inspect: F(() => F({ declaredSession: true })) });
  r.ports = {
    readProfile: F(guard => { guard(); r.guards.profile = guard; r.trace.push('profile'); return options.readProfile ? options.readProfile(r) : Promise.resolve(r.profile); }),
    readCredential: F(guard => { guard(); r.guards.credential = guard; r.trace.push('credential'); return options.readCredential ? options.readCredential(r) : Promise.resolve(r.credential); }),
    createKeyLease: F((bytes, identity, guard) => {
      guard(); r.guards.key = guard; r.trace.push('key'); r.calls.key++;
      assert.equal(bytes, r.credential); assert.equal(bytes.length, 32); assert.ok(Object.isFrozen(identity));
      return options.createKey ? options.createKey(r) : Promise.resolve(r.key);
    }),
    openSession: F((selection, guard, limits) => {
      guard(); r.guards.session = guard; r.trace.push('session'); r.calls.session++; r.selection = selection; r.selectedLimits = limits;
      assert.equal(assertSelection(selection), selection); assert.ok(limits.maxCommands >= 106);
      if (options.openSession) return options.openSession(r);
      selection.release(); return Promise.resolve(r.session);
    }),
    runHost: F(session => { r.trace.push('host'); r.calls.host++; assert.equal(session, r.session);
      return options.host ? options.host(r) : Promise.resolve(cleanHost()); }),
    closeInputs: F(() => { r.trace.push('inputs-close'); r.calls.inputs++; return options.closeInputs ? options.closeInputs(r) : Promise.resolve(undefined); }),
    readDay: F(() => 10), clock: F(() => r.now),
    armTimer: F((budget, callback) => { const token = { budget, callback, cancelled: false }; r.timers.push(token); return token; }),
    cancelTimer: F(token => { token.cancelled = true; })
  };
  r.start = () => run({ arguments: args(argv()), ports: F(r.ports) });
  return r;
}
check('operator-argv-is-explicit-bounded-distinct-and-has-no-secret-default', () => {
  assert.deepEqual(args(['--help']), { mode: 'HELP' }); assert.ok(Object.isFrozen(args(argv())));
  assert.deepEqual(args(argv()), { mode: 'RUN', profileFd: 3, keyFd: 4, inputFd: 5, outputFd: 6, bootstrapMs: 1000 });
  for (const change of [a => a.splice(0, 2), a => a.push('--secret', 'value'), a => { a[0] = '--key-fd'; },
    a => { a[1] = '03'; }, a => { a[1] = '2'; }, a => { a[1] = '1024'; }, a => { a[3] = '3'; },
    a => { a[9] = '60001'; }, a => { a[9] = '0'; }, a => { a[9] = '+1'; }]) { const a = argv(); change(a); assert.throws(() => args(a)); }
});
check('operator-argv-refuses-proxies-accessors-and-extra-properties-without-entry', () => {
  let entered = 0; const a = argv(); Object.defineProperty(a, '0', { get() { entered++; return '--profile-fd'; }, enumerable: true });
  assert.throws(() => args(a)); assert.throws(() => args(new Proxy([], { get() { entered++; return 0; } })));
  const extra = argv(); extra.secret = 'unselected'; assert.throws(() => args(extra)); assert.equal(entered, 0);
});
check('operator-clock-uses-utc-day-numbers-required-by-the-durable-budget', () => {
  assert.equal(day(0), 0); assert.equal(day(86399999), 0); assert.equal(day(86400000), 1); assert.equal(day(1793232000000), 20755);
  assert.equal(day(Number.MAX_SAFE_INTEGER), 104249991);
  for (const value of [-1, -0, '1', Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => day(value));
});
check('operator-bootstrap-is-canonical-keyless-data-without-an-sdk-or-key-placeholder', () => {
  const d = publicData(), p = decode(canonicalJson(d)); assert.ok(Object.isFrozen(p)); assert.equal(p.limits.maxCommands, 128);
  assert.equal(p.expectedIdentity.expectedAddress, d.configuration.fundingOptions.expectedAddress);
  assert.equal(p.product.nativeAcceptance, 'NOT_ESTABLISHED'); p.release(); p.release(); assert.throws(() => bind(p, declaredKey(), F(() => 10)));
});
check('operator-bootstrap-rejects-noncanonical-json-duplicate-properties-and-version-drift', () => {
  const d = publicData(), text = canonicalJson(d);
  for (const value of [' ' + text, text + '\n', text.replace('"operatorBootstrapVersion":1', '"operatorBootstrapVersion":1,"operatorBootstrapVersion":1'),
    text.replace('"operatorBootstrapVersion":1', '"operatorBootstrapVersion":2'), text + '\ud800', 'x'.repeat(262145)]) assert.throws(() => decode(value));
});
check('operator-bootstrap-rejects-secret-loader-clock-validator-and-module-fields', () => {
  for (const edit of [d => { d.module = 'unselected'; }, d => { d.secretPath = 'unselected'; }, d => { d.spending.readDay = 10; },
    d => { d.configuration.fundingOptions.keyPair = {}; }, d => { d.configuration.serviceOptions.validateChallenge = 'unselected'; }]) {
    const d = publicData(); edit(d); assert.throws(() => decode(canonicalJson(d)));
  }
});
check('operator-bootstrap-rejects-overlapping-roots-and-foreign-network-before-key-read', async () => {
  for (const edit of [d => { d.spendingFile.allowedRoot = d.configuration.storeOptions.allowedRoot; },
    d => { d.spendingFile.storageProfile.policy.network = 'zenon:foreign'; }, d => { d.limits.maxCommands = 105; },
    d => { d.configuration.serviceOptions.transportOptions.maxRequestStarts = 99; }]) {
    const r = declaredOperator({ edit }), result = await r.start(); assert.equal(result.status, 'BOOTSTRAP_REFUSED');
    assert.deepEqual(r.trace, ['profile', 'inputs-close']); assert.equal(r.calls.key + r.calls.session + r.calls.host, 0);
  }
});
check('operator-bootstrap-must-carry-a-bounded-public-ca-before-credential-acquisition', async () => {
  for (const pem of ['', 'PUBLIC', '-----BEGIN OTHER-----\nDATA\n-----END OTHER-----\n', 'A'.repeat(65537)]) {
    const r = declaredOperator({ edit: d => { d.publicCaPem = pem; } }), result = await r.start();
    assert.equal(result.status, 'BOOTSTRAP_REFUSED'); assert.equal(r.calls.key, 0); assert.equal(r.calls.inputs, 1);
  }
});
check('operator-bootstrap-attaches-existing-key-once-and-detaches-owned-trust-copies', () => {
  const p = decode(canonicalJson(publicData())), selected = bind(p, declaredKey(), F(() => 10));
  assert.equal(assertSelection(selected), selected); assert.ok(selected.configuration.fundingOptions.fundingTransportOptions.ca.some(b => b !== 0));
  assert.throws(() => bind(p, declaredKey(), F(() => 10))); assert.throws(() => assertSelection(F({ ...selected })));
  consume(selected); assert.throws(() => assertSelection(selected)); selected.release();
  assert.ok(selected.configuration.fundingOptions.fundingTransportOptions.ca.every(b => b === 0));
});
check('operator-bootstrap-binding-rejects-replacement-prepared-data-and-released-selection', () => {
  const p = decode(canonicalJson(publicData())); assert.throws(() => bind(F({ ...p }), declaredKey(), F(() => 10)));
  const selected = bind(p, declaredKey(), F(() => 10)); selected.release(); assert.throws(() => assertSelection(selected));
});
check('operator-data-launch-orders-profile-credential-key-session-and-explicit-host', async () => {
  const r = declaredOperator(), result = await r.start(); assert.equal(result.status, 'CLOSED'); assert.equal(result.exitCode, 0);
  assert.deepEqual(r.trace, ['profile', 'credential', 'key', 'session', 'host', 'inputs-close']);
  assert.deepEqual(r.calls, { key: 1, keyStop: 1, session: 1, sessionStop: 1, host: 1, inputs: 1 });
  assert.ok(r.profile.every(b => b === 0)); assert.ok(r.credential.every(b => b === 0)); assert.ok(r.timers.every(t => t.cancelled));
  assert.equal(result.nativeResourceRelease, 'NOT_ESTABLISHED'); assert.equal(result.keyErasure, 'NOT_ESTABLISHED'); assert.equal(result.serviceDelivery, 'NOT_ESTABLISHED');
});
check('operator-stage-guards-cannot-be-replayed-after-that-stage-or-session-admission', async () => {
  const r = declaredOperator(); const original = r.ports.readCredential;
  r.ports.readCredential = F(guard => { assert.throws(() => r.guards.profile()); return original(guard); });
  const result = await r.start(); assert.equal(result.status, 'CLOSED');
  for (const guard of Object.values(r.guards)) { assert.throws(() => guard()); assert.throws(() => guard('extra')); }
  r.timers[0].callback(); assert.equal(result.status, 'CLOSED'); assert.equal(r.calls.key + r.calls.session, 2);
});
check('operator-short-or-long-credential-is-wiped-without-entering-key-or-session', async () => {
  for (const keyBytes of [0, 31, 33]) {
    const r = declaredOperator({ keyBytes }), result = await r.start(); assert.equal(result.status, 'BOOTSTRAP_REFUSED');
    assert.equal(r.calls.key + r.calls.session + r.calls.host, 0); assert.ok(r.credential.every(b => b === 0)); assert.equal(r.calls.inputs, 1);
  }
});
check('operator-malformed-profile-bytes-never-start-credential-or-key-acquisition', async () => {
  const r = declaredOperator(); r.profile = Buffer.from([255, 254]); const result = await r.start();
  assert.equal(result.status, 'BOOTSTRAP_REFUSED'); assert.deepEqual(r.trace, ['profile', 'inputs-close']); assert.ok(r.profile.every(b => b === 0));
});
check('operator-profile-rejection-returns-only-sanitized-status-data', async () => {
  const r = declaredOperator({ readProfile: () => Promise.reject(Error('private input diagnostic')) }), result = await r.start();
  assert.equal(result.status, 'BOOTSTRAP_REFUSED'); assert.ok(!JSON.stringify(result).includes('private input diagnostic')); assert.equal(r.calls.key, 0);
});
check('operator-shared-credential-view-is-refused-before-the-key-port', async () => {
  const r = declaredOperator(); r.credential = Buffer.from(new SharedArrayBuffer(32)); const result = await r.start();
  assert.equal(result.status, 'BOOTSTRAP_REFUSED'); assert.equal(r.calls.key, 0);
});
check('operator-native-factory-refusal-is-unknown-with-no-host-or-retry', async () => {
  const r = declaredOperator({ createKey: () => Promise.reject(Error('declared unreturned key factory')) }), result = await r.start();
  assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(result.keyCreationEntered, true);
  assert.equal(r.calls.key, 1); assert.equal(r.calls.session + r.calls.host, 0); assert.ok(r.credential.every(b => b === 0));
});
check('operator-foreign-thenable-is-not-assimilated-or-executed', async () => {
  let entered = 0; const value = {}; Object.defineProperty(value, 'then', { get() { entered++; throw Error('must not enter'); } });
  const r = declaredOperator({ createKey: () => value }), result = await r.start();
  assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(entered, 0); assert.equal(r.calls.session, 0);
});
check('operator-expired-profile-is-wiped-when-it-arrives-and-never-opens-key-input', async () => {
  const late = pending(), r = declaredOperator({ readProfile: () => late.promise }), out = r.start();
  await flush(); r.now = 1000000000n; r.timers[0].callback(); const result = await out;
  assert.equal(result.status, 'CLOSE_UNKNOWN'); late.resolve(r.profile); await flush();
  assert.ok(r.profile.every(b => b === 0)); assert.equal(r.calls.key + r.calls.session + r.calls.host, 0); assert.equal(r.calls.inputs, 1);
});
check('operator-deadline-observed-after-synchronous-key-work-stops-the-known-late-owner', async () => {
  const r = declaredOperator({ createKey: r => { r.now = 1000000000n; return Promise.resolve(r.key); } }), result = await r.start();
  assert.equal(result.status, 'CLOSE_UNKNOWN'); await flush(); assert.equal(r.calls.keyStop, 1); assert.equal(r.calls.session, 0);
  assert.equal(result.sessionAccepted, false); assert.equal(result.automaticRetry, false);
});
check('operator-late-key-owner-is-stopped-once-without-opening-a-session-or-upgrading-unknown', async () => {
  const late = pending(), r = declaredOperator({ createKey: () => late.promise }), out = r.start(); await flush();
  r.now = 1000000000n; r.timers[0].callback(); const result = await out; late.resolve(r.key); await flush();
  assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(r.calls.keyStop, 1); assert.equal(r.calls.session + r.calls.host, 0); assert.equal(r.calls.key, 1);
});
check('operator-session-entry-transfers-trust-release-to-that-opener-until-late-settlement', async () => {
  const late = pending(), r = declaredOperator({ openSession: () => late.promise }), out = r.start(); await flush();
  assert.ok(r.selection.configuration.fundingOptions.fundingTransportOptions.ca.some(b => b !== 0));
  r.now = 1000000000n; r.timers[0].callback(); const result = await out;
  assert.ok(r.selection.configuration.fundingOptions.fundingTransportOptions.ca.some(b => b !== 0));
  r.selection.release(); late.resolve(r.session); await flush(); assert.equal(r.calls.sessionStop, 1); assert.equal(r.calls.host, 0);
  assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(r.calls.session, 1); assert.equal(r.calls.keyStop, 1);
});
check('operator-nonvoid-session-close-cannot-report-a-clean-cli-exit', async () => {
  const r = declaredOperator({ sessionCloseValue: true }), result = await r.start();
  assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(r.calls.sessionStop, 1); assert.equal(r.calls.keyStop, 1);
});
check('operator-input-stop-failure-remains-unknown-after-other-known-stops', async () => {
  const r = declaredOperator({ closeInputs: () => Promise.reject(Error('declared close refusal')) }), result = await r.start();
  assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(r.calls.keyStop + r.calls.sessionStop, 2); assert.equal(r.calls.inputs, 1);
});
check('operator-host-ambiguity-does-not-authorize-another-host-session-or-key', async () => {
  const r = declaredOperator({ host: () => Promise.resolve(F({ status: 'OUTCOME_UNKNOWN', exitCode: 3 })) }), result = await r.start();
  assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(r.calls.host, 1); assert.equal(r.calls.session, 1); assert.equal(r.calls.key, 1);
});
check('operator-closed-text-without-the-real-host-owner-observations-is-insufficient', async () => {
  const r = declaredOperator({ host: () => Promise.resolve(F({ status: 'CLOSED', exitCode: 0 })) }), result = await r.start();
  assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(r.calls.host, 1); assert.equal(r.calls.keyStop + r.calls.sessionStop, 2);
});
check('operator-close-expiry-does-not-repeat-stop-or-upgrade-after-late-completion', async () => {
  const close = pending(), r = declaredOperator({ keyClose: () => close.promise }), out = r.start(); await flush();
  assert.equal(r.calls.keyStop, 1); assert.equal(r.timers.length, 2); r.now = 1000000001n; r.timers[1].callback();
  const result = await out; assert.equal(result.status, 'CLOSE_UNKNOWN'); r.keyClosed = true; close.resolve(undefined); await flush();
  assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(r.calls.keyStop, 1); assert.equal(r.calls.sessionStop, 1);
});

export const closeApiCreditOperatorDataFixtures = F(async function closeFixtures() { for (const root of roots) { try { await root.close(); } catch {} } });
export const apiCreditOperatorDataFixtures = F({ publicData, declaredOperator });
export const apiCreditOperatorDataCases = F(checks.map(c => F(c)));
if (typeof process.argv[1] === 'string' && fileURLToPath(import.meta.url) === process.argv[1]) {
const cases = [];
for (const { id, run: execute } of checks) { try { await execute(); cases.push({ id, status: 'PASS' }); } catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); } }
await closeApiCreditOperatorDataFixtures();
const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'G0_G1_OPERATOR_BOOTSTRAP_DATA', passed: cases.length - failed, failed, cases,
  priorKeyLeaseCases: apiCreditKeyLeaseDataCases.length, declaredMethodPorts: true, nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0,
  signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
  nativeProductAcceptance: 'NOT_ESTABLISHED', operatorNativeLaunch: 'NOT_ESTABLISHED', LinuxAcceptance: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;

}
