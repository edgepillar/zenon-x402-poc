// DATA ABI/ownership controls only. Native source files are parser inputs and
// are never imported. Fake SDK methods return invalid signature-shaped bytes.
import assert from 'node:assert/strict';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { nonDpCustodiedCandidateDataFixture, nonDpCustodiedOriginalCandidateDataCases } from './non-dp-custodied-original-candidate.behavior.mjs';
import { createNonDpCustodiedOriginalCandidateForRetainedReads as create } from '../src/zenon/non-dp-custodied-original-candidate.js';
import { decodeOriginalFundingSignerContextRecord as decode } from '../src/original-funding-signer-context-custody.js';

const F = Object.freeze, checks = [...nonDpCustodiedOriginalCandidateDataCases];
function fixture(options = {}) {
  const r = nonDpCustodiedCandidateDataFixture(options);
  r.retainedReads = F({ transports: r.f.options.transports, accountExchange: r.f.options.accountExchange });
  r.nativeOptions = F({ readOptions: r.retainedReads, requireCurrent: F(r.f.options.requireCurrent),
    walletOwner: r.owner, expectedAddress: r.configuration.expectedAddress, expectedPublicKey: r.configuration.expectedPublicKey });
  r.native = create(r.nativeOptions); return r;
}
function check(id, run) { checks.push(F({ id, run })); }
check('non-dp-retained-native-construction-preserves-the-exact-session-read-options', () => {
  const r = fixture(); assert.equal(r.nativeOptions.readOptions, r.retainedReads);
  assert.equal(r.retainedReads.transports, r.f.options.transports); assert.equal(r.retainedReads.accountExchange, r.f.options.accountExchange);
  assert.deepEqual(Object.keys(r.retainedReads), ['transports', 'accountExchange']);
});
check('non-dp-retained-native-construction-is-inert-for-all-original-owners', () => {
  const r = fixture(); assert.deepEqual(r.f.reads, [0, 0, 0]); assert.equal(r.f.guards(), 0);
  assert.equal(r.keyCalls + r.signCalls + r.clearCalls, 0); assert.deepEqual(r.trace, []);
});
check('non-dp-retained-native-full-declared-flow-keeps-one-signer-and-one-identical-packet', async () => {
  const r = fixture(), candidate = await r.native.prepareOriginalFunding(r.input, r.url);
  assert.equal(await r.native.revalidateSignedOriginal(), candidate); assert.deepEqual(r.f.reads, [25, 25, 15]);
  assert.equal(r.signCalls, 1); assert.equal(decode(r.raw).phase, 'SIGNED'); assert.equal(r.clearCalls, 0);
});
check('non-dp-retained-native-revoked-parent-prevents-all-key-and-read-entry', async () => {
  const r = fixture(); r.current = false; await assert.rejects(r.native.prepareOriginalFunding(r.input, r.url));
  assert.deepEqual(r.f.reads, [0, 0, 0]); assert.equal(r.signCalls, 0); assert.equal(r.raw, null);
});
check('non-dp-retained-native-void-current-guard-is-required', async () => {
  const r = fixture(), native = create(F({ ...r.nativeOptions, requireCurrent: F(() => false) }));
  await assert.rejects(native.prepareOriginalFunding(r.input, r.url)); assert.deepEqual(r.f.reads, [0, 0, 0]); assert.equal(r.raw, null);
});
check('non-dp-retained-native-unfrozen-or-extra-guard-contracts-are-refused-inertly', () => {
  const r = fixture(); assert.throws(() => create(F({ ...r.nativeOptions, requireCurrent() {} })));
  assert.throws(() => create(F({ ...r.nativeOptions, close() {} }))); assert.equal(r.f.guards(), 0);
});
check('non-dp-retained-native-accessor-options-are-not-invoked', () => {
  const r = fixture(); let calls = 0; const c = { ...r.nativeOptions };
  Object.defineProperty(c, 'walletOwner', { enumerable: true, get() { calls++; return r.owner; } });
  assert.throws(() => create(F(c))); assert.equal(calls, 0); assert.equal(r.keyCalls, 0);
});
check('non-dp-retained-native-proxy-session-or-configuration-is-not-inspected', () => {
  const r = fixture(); let traps = 0; const wrap = x => new Proxy(x, { get() { traps++; }, ownKeys() { traps++; } });
  assert.throws(() => create(wrap(r.nativeOptions))); assert.throws(() => create(F({ ...r.nativeOptions, readOptions: wrap(r.retainedReads) })));
  assert.equal(traps, 0);
});
check('non-dp-retained-native-guard-is-not-installed-into-the-parent-session-object', () => {
  const r = fixture(); assert.throws(() => create(F({ ...r.nativeOptions, readOptions: r.f.options })));
  assert.equal(Object.hasOwn(r.retainedReads, 'requireCurrent'), false); assert.equal(r.f.guards(), 0);
});
check('non-dp-retained-native-input-must-still-match-the-original-empty-funding-route', async () => {
  const r = fixture(), input = JSON.parse(JSON.stringify(r.input)); input.originalRequest.requestBodyBase64 = 'eA==';
  await assert.rejects(r.native.prepareOriginalFunding(input, r.url)); assert.equal(r.native.inspect().used, false); assert.equal(r.raw, null);
});
check('non-dp-retained-native-intent-ack-loss-does-not-acquire-another-sign-attempt', async () => {
  const r = fixture({ intent() { throw Error('declared intent acknowledgement loss'); } });
  await assert.rejects(r.native.prepareOriginalFunding(r.input, r.url)); await assert.rejects(r.native.prepareOriginalFunding(r.input, r.url));
  assert.equal(r.signCalls, 0); assert.equal(decode(r.raw).phase, 'INTENT'); assert.equal(r.native.inspect().held, true);
});
check('non-dp-retained-native-late-revocation-keeps-signed-record-and-borrowed-owner', async () => {
  const r = fixture(), candidate = await r.native.prepareOriginalFunding(r.input, r.url), raw = r.raw;
  r.current = false; await assert.rejects(r.native.revalidateSignedOriginal());
  assert.equal(r.raw, raw); assert.equal(candidate.packet.transactionHash, decode(raw).transactionHash); assert.equal(r.signCalls, 1);
  assert.equal(r.clearCalls, 0); assert.equal(r.owner.inspect().closeRequested, false);
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const c of checks) { try { await c.run(); cases.push({ id: c.id, status: 'PASS' }); }
    catch (e) { cases.push({ id: c.id, status: 'FAILURE', error: e.code ?? e.message }); break; } }
  const failed = cases.filter(c => c.status !== 'PASS').length;
  console.log(JSON.stringify({ qualification: 'G1_NON_DP_RETAINED_NATIVE_OPTIONS_DATA', passed: cases.length - failed, failed, cases,
    newCases: 12, affectedCases: 64, actualSourceOwnerAndCodecsWithDeclaredPorts: true, nativeSourceFilesEvaluated: 0,
    signatureShapedFixturesDeliberatelyInvalid: true, cryptographicSignatureAlgorithms: 0, componentCooperativeTimers: false,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
    nativeEntryBinding: 'SOURCE_BOUND_NOT_EXECUTED', currentNativeCatalogsUpdated: false,
    chainAuthentication: 'NOT_ESTABLISHED', physicalRelease: 'NOT_ESTABLISHED', G0G5Acceptance: 'OPEN' }));
  if (failed || cases.length !== checks.length) process.exitCode = 1;
}
