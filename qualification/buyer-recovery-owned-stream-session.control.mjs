// Actual channel, connector, session and negative native-binding entry.
// Native/reader callbacks are DECLARED. Denied modules never evaluate.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { PassThrough } from 'node:stream';
import { recoveryFixture } from './buyer-original-recovery.fixture.mjs';
import { createBuyerCommandLineChannel as CHANNEL } from '../src/buyer-command-line-channel.js';
import { openBuyerOriginalRecoveryOwnedStreamSession as OPEN } from '../src/buyer-recovery-owned-stream-session.js';
import { encodeBuyerOriginalRecoveryCommand, encodeBuyerOriginalBackendRecoveryCommand } from '../src/buyer-original-funding-command.js';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_RECOVERY_OWNED_STREAM_CONTROL, 'declared-native-no-effects');
assert.equal(process.argv.length, 3);
const scenario = process.argv[2], F = Object.freeze;
const SCENARIOS = ['LOCAL_SUCCESS', 'BACKEND_SUCCESS', 'INVALID_STREAMS', 'ALREADY_OWNED', 'BAD_SELECTION',
  'BAD_BUDGET', 'PAYER_REJECTS', 'BACKEND_REJECTS', 'PAYER_LOAD_EXPIRES', 'BACKEND_LOAD_EXPIRES',
  'SHARED_BUDGET', 'PAYER_SYNC_EXPIRES', 'BACKEND_SYNC_EXPIRES', 'PAYER_LATE_OWNER', 'BACKEND_LATE_OWNER',
  'BACKEND_STOP_THROWS', 'NATIVE_STOP_REJECTS', 'SETUP_EXPIRES', 'GUARD_ARGUMENTS', 'CROSS_LEG_GUARD',
  'CHANNEL_REVOKED_AFTER_LOAD', 'BAD_OPEN_RECEIPT', 'NATIVE_CLOSE_NONVOID', 'BACKEND_STOP_VOID',
  'BINDING_INVALID_STREAMS', 'BINDING_ALREADY_OWNED', 'BINDING_BACKEND_ALREADY_OWNED'];
assert.ok(SCENARIOS.includes(scenario));
const ticks = async () => { await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); };
const timeouts = () => process.getActiveResourcesInfo().filter(name => name === 'Timeout').length;
const initialTimers = timeouts(), f = recoveryFixture();
const selection = { originalPayment: f.selection.originalPayment, selectedGrantId: f.selection.selectedGrantId,
  paymentRequiredHeader: f.selection.paymentRequiredHeader };
const input = new PassThrough(), output = new PassThrough(), limits = { closeWaitMs: 40 };
let channel = null, payerCalls = 0, readerCalls = 0, payerAcquisitions = 0, readerAcquisitions = 0;
let guardArgumentsRefused = 0, crossLegRefused = 0, nativeReceipt = null, backendGuard = null;
const guards = [], deniedResolutions = [];
const denied = new Set(['../src/x402-native-v6-funding-post-client.js', '../src/service-credit-backend-original-outcome-reader.js']
  .map(name => new URL(name, import.meta.url).href));
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  let target = null;
  if (specifier.startsWith('.')) target = new URL(specifier, context.parentURL).href;
  if (denied.has(target)) {
    deniedResolutions.push(target.split('/').at(-1));
    throw Object.assign(new TypeError('DECLARED_TEST_EFFECTFUL_MODULE_RESOLUTION_REFUSED'), { code: 'TEST_EFFECTFUL_MODULE_REFUSED' });
  }
  return nextResolve(specifier, context);
} });
const binding = scenario.startsWith('BINDING_'), backend = scenario.startsWith('BACKEND_')
  || ['SHARED_BUDGET', 'CROSS_LEG_GUARD', 'BINDING_BACKEND_ALREADY_OWNED', 'NATIVE_STOP_REJECTS'].includes(scenario);
const invalid = scenario === 'INVALID_STREAMS' || scenario === 'BINDING_INVALID_STREAMS';
const alreadyOwned = scenario.includes('ALREADY_OWNED');
if (alreadyOwned) channel = CHANNEL({ input, output, limits });
let release;
const paused = new Promise(yes => { release = yes; });
let finishNative, finishReader;
const nativeFinished = new Promise(yes => { finishNative = yes; });
const readerFinished = new Promise(yes => { finishReader = yes; });
const asyncExpires = scenario.includes('LOAD_EXPIRES') || scenario.includes('LATE_OWNER');
let stopReceipt = null;
f.onClose = () => {
  if (scenario === 'NATIVE_STOP_REJECTS') return Promise.reject(new Error('declared stop unknown'));
  f.phase = 'CLOSED'; stopReceipt ??= Promise.resolve(undefined); return stopReceipt;
};
if (scenario === 'BACKEND_STOP_THROWS') f.onBackendClose = () => { throw new Error('declared reader stop unknown'); };
if (scenario === 'BACKEND_STOP_VOID') f.onBackendClose = () => undefined;
if (scenario === 'NATIVE_STOP_REJECTS' || scenario === 'NATIVE_CLOSE_NONVOID') f.unknown = true;
if (scenario === 'NATIVE_CLOSE_NONVOID') f.onClose = () => { f.phase = 'CLOSED'; return Promise.resolve(F({ unexpected: true })); };
if (scenario === 'SETUP_EXPIRES') {
  let once = false;
  f.onSnapshot = () => { if (!once) { once = true; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 90); } };
}
const openReader = F(async function declaredReader(guard) {
  try {
  readerCalls++; assert.equal(readerCalls, 1); assert.equal(payerCalls, 0);
  assert.ok(Object.isFrozen(guard)); guards.push(guard); backendGuard = guard; guard();
  if (scenario === 'BACKEND_REJECTS') throw new Error('declared reader refusal');
  if (scenario === 'SHARED_BUDGET') await new Promise(r => setTimeout(r, 35));
  if (scenario === 'BACKEND_LOAD_EXPIRES' || scenario === 'BACKEND_LATE_OWNER') await paused;
  if (scenario === 'BACKEND_SYNC_EXPIRES') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 90);
  if (scenario !== 'BACKEND_LATE_OWNER') guard();
    readerAcquisitions++; return f.backend;
  } finally { finishReader(); }
});
let openNative = F(async function declaredNative(guard) {
  try {
  payerCalls++; assert.equal(payerCalls, 1); assert.ok(Object.isFrozen(guard)); guards.push(guard); guard();
  if (scenario === 'CROSS_LEG_GUARD') { assert.throws(() => backendGuard()); crossLegRefused++; guard(); }
  if (scenario === 'GUARD_ARGUMENTS') { assert.throws(() => guard(1)); guardArgumentsRefused++; guard(); }
  if (['PAYER_REJECTS', 'BACKEND_STOP_THROWS', 'BACKEND_STOP_VOID'].includes(scenario)) throw new Error('declared native refusal');
  if (scenario === 'CHANNEL_REVOKED_AFTER_LOAD') { await Promise.resolve(); input.destroy(); }
  if (scenario === 'SHARED_BUDGET') await new Promise(r => setTimeout(r, 35));
  if (scenario === 'PAYER_LOAD_EXPIRES' || scenario === 'PAYER_LATE_OWNER') await paused;
  if (scenario === 'PAYER_SYNC_EXPIRES') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 90);
  if (scenario !== 'PAYER_LATE_OWNER') guard();
    payerAcquisitions++; return f.native;
  } finally { finishNative(); }
});
if (scenario === 'BAD_OPEN_RECEIPT') openNative = F(function invalidReceipt() {
  payerCalls++; finishNative(); return 42;
});
let session = null, errorCode = null, importedBinding = false;
const success = ['LOCAL_SUCCESS', 'BACKEND_SUCCESS', 'GUARD_ARGUMENTS', 'CROSS_LEG_GUARD'].includes(scenario);
try {
  if (binding) {
    const nativeBinding = await import('../src/zenon/native-original-recovery-command-session.js');
    importedBinding = true;
    const method = backend ? nativeBinding.openNativeOriginalBackendRecoveryCommandSession : nativeBinding.openNativeOriginalRecoveryCommandSession;
    session = await method({ configuration: { payerOptions: { databasePath: '/synthetic-recovery/payer.sqlite',
      allowedRoot: '/synthetic-recovery', fundingResourceUrl: f.selection.originalPayment.resourceUrl,
      custodyPolicy: {}, selectedGrantId: f.selection.selectedGrantId, deadlineMs: 500 },
      originalPayment: f.selection.originalPayment, official: {}, transportOptions: {} },
      selection, input: invalid ? null : input, output, limits, ...(backend ? { backendStore: F({}) } : {}) });
  } else {
    const c = { selection, input: invalid ? null : input, output, limits,
      openWaitMs: scenario === 'BAD_BUDGET' ? 0 : scenario === 'SHARED_BUDGET' ? 60 : success ? 1000 : 35,
      openNativeClient: openNative, ...(backend ? { openBackendReader: openReader } : {}) };
    if (scenario === 'BAD_SELECTION') c.selection = { ...selection, paymentRequiredHeader: 'invalid-challenge-data' };
    nativeReceipt = OPEN(c); session = await nativeReceipt;
  }
} catch (error) { errorCode = error.code ?? error.message; }
if (asyncExpires) release();
// Observe the original callback completion; do not confuse a public timeout
// with cancellation of its outstanding module/native work.
if (payerCalls) await nativeFinished;
if (readerCalls) await readerFinished;
await ticks();
if (success) {
  assert.ok(session); assert.equal(errorCode, null);
  const view = session.inspect(); assert.equal(view.mode, backend ? 'RECOVER_EXISTING_ORIGINAL_WITH_BACKEND' : 'RECOVER_EXISTING_ORIGINAL');
  const chunks = []; output.on('data', value => chunks.push(value));
  const encode = backend ? encodeBuyerOriginalBackendRecoveryCommand : encodeBuyerOriginalRecoveryCommand;
  input.end(encode({ version: 1, id: 'inspect-original', operation: 'inspect', input: {} })
    + encode({ version: 1, id: 'close-original', operation: 'close', input: {} }));
  const run = session.run(); assert.equal(session.run(), run); await run;
  const observed = JSON.parse(Buffer.concat(chunks).toString().trim());
  assert.equal(observed.operation, 'inspect'); assert.equal(observed.result.session.mode, view.mode);
  assert.equal(session.inspect().commands, 2); assert.equal(session.inspect().admittedOperations, 0);
  // Actual session cleanup owns the connector/channel and retains stop receipts.
  const stop = session.close(); assert.equal(session.close(), stop); await stop;
  assert.equal(session.inspect().lifecycle, 'CLOSED');
} else assert.equal(session, null);
for (const guard of guards) assert.throws(() => guard());
if (channel !== null) { assert.equal(channel.inspect().lifecycle, 'OPEN'); await channel.close(); }
if (['INVALID_STREAMS', 'BAD_SELECTION', 'BAD_BUDGET'].includes(scenario)) {
  assert.equal(payerCalls + readerCalls, 0);
  assert.equal(input.destroyed, false); assert.equal(output.destroyed, false);
}
if (alreadyOwned) assert.equal(payerCalls + readerCalls, 0);
const expectedPayer = success || ['SETUP_EXPIRES', 'NATIVE_STOP_REJECTS', 'NATIVE_CLOSE_NONVOID', 'PAYER_LATE_OWNER'].includes(scenario) ? 1 : 0;
const expectedReader = backend && !['BACKEND_REJECTS', 'BACKEND_LOAD_EXPIRES', 'BACKEND_SYNC_EXPIRES',
  'BINDING_BACKEND_ALREADY_OWNED'].includes(scenario) ? 1 : 0;
const errorExpected = binding ? 'buyer_native_original_recovery_command_open_refused' : 'buyer_recovery_owned_stream_open_refused';
const passed = (success ? session !== null : errorCode === errorExpected)
  && (!binding || importedBinding && deniedResolutions.length === 0)
  && payerAcquisitions === expectedPayer && readerAcquisitions === expectedReader;
if (!binding) {
  assert.equal(f.closes, expectedPayer); assert.equal(f.backendCloses, expectedReader);
  if (scenario === 'GUARD_ARGUMENTS') assert.equal(guardArgumentsRefused, 1);
  if (scenario === 'CROSS_LEG_GUARD') assert.equal(crossLegRefused, 1);
}
assert.equal(f.borrowedBackendStoreCloses, 0);
assert.equal(f.services + f.restores + f.checkpointReads + f.stateReads + f.backendReads, 0);
await ticks(); assert.equal(timeouts(), initialTimers);
hooks.deregister();
process.stdout.write(JSON.stringify({ scenario, passed, errorCode, importedBinding, deniedResolutions,
  payerCalls, readerCalls, payerAcquisitions, readerAcquisitions, payerCloses: f.closes,
  readerCloses: f.backendCloses, borrowedStoreCloses: f.borrowedBackendStoreCloses,
  retiredGuardsRefused: guards.length, guardArgumentsRefused, crossLegRefused,
  nativeCallbacks: 'DECLARED', actualRecoverySession: session !== null, localInspectAndCloseCommands: success ? 2 : 0,
  admittedNativeOperations: 0,
  sdkEvaluations: 0, sql: 0, sockets: 0, keys: 0, signatures: 0, nonce: 0,
  activeTimeoutsBefore: initialTimers, activeTimeoutsAfter: timeouts(), physicalRelease: 'NOT_QUALIFIED' }) + '\n');
assert.equal(passed, true);
