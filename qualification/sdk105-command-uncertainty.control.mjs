// Actual command/channel/wallet/lifecycle/recovery code. Native/store/key
// capabilities and durable-state records are DECLARED; no SDK or SQLite runs.
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { sdk105FundingServiceFixture as fundingFixture } from './sdk105-funding-service-lifecycle.fixture.mjs';
import { recoveryFixture } from './buyer-original-recovery.fixture.mjs';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as ASSEMBLE } from '../src/zenon/dynamic-plasma-original-funding-data.js';
import { openBuyerFundingOwnedStreamSession as OPEN } from '../src/buyer-funding-owned-stream-session.js';
import { encodeBuyerOriginalFundingCommand as ENCODE } from '../src/buyer-original-funding-command.js';
import { runBuyerOriginalCommandHost as HOST } from '../src/buyer-original-command-host.js';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_SDK105_COMMAND_UNCERTAINTY, 'declared-native-exact-original');
assert.equal(process.argv.length, 3);
const scenario = process.argv[2], F = Object.freeze;
const SCENARIOS = ['DIRECT_ASYNC_REJECT', 'DIRECT_PRECONDITION_REFUSAL', 'DIRECT_REJECT_DURING_CLOSE',
  'DIRECT_LATE_VOID_DURING_CLOSE', 'DIRECT_NONVOID_REJECT', 'COMMAND_PENDING_UNKNOWN',
  'COMMAND_SERVICE_REJECT', 'COMMAND_OUTPUT_LOSS', 'COMMAND_PENDING_SERVICE_CLOSE', 'COMMAND_RECOVERY_UNKNOWN'];
assert.ok(SCENARIOS.includes(scenario));
const f = fundingFixture({ unbound: scenario === 'COMMAND_PENDING_UNKNOWN' });
const r = recoveryFixture({ backendRecovery: true });
const packet = ASSEMBLE(f.base.input, { originalUnsignedBlock: f.original,
  accountBlock: { ...f.original, signature: f.signature.toString('base64') } }, f.base.resourceUrl);
assert.equal(packet.serializedCheckpoint, r.packet.serializedCheckpoint);
const independentPacket = JSON.stringify(packet), signedOriginal = JSON.stringify(f.original);
const handoff = { originalPayment: { resourceUrl: f.base.resourceUrl,
  serializedCheckpoint: packet.serializedCheckpoint, expectedPins: structuredClone(packet.expectedPins) },
  selectedGrantId: r.key.grantId, paymentRequiredHeader: f.base.input.challenge.paymentRequiredHeader };
const service = r.service(); delete service.expectedPins;
const originalServiceText = JSON.stringify(service);
const command = (id, operation, input = {}) => ENCODE({ version: 1, id, operation, input });
const tick = () => new Promise(resolve => setImmediate(resolve));
function gate() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const entered = gate(), reply = gate();
let session = null, host = null, firstRejected = false, secondRejected = false, closeRejected = false;
let heldAfterFirst = null, hostBeforeLate = null, recovery = null, backendRecovery = null;
let outputStops = 0, outputFaults = 0;
const results = [];
function recordUnknown() {
  // One shared declared durable original record, not a second payment/store.
  r.change({ dispatchIntent: r.intent(), uncertainty: { ...r.state.uncertainty, submission: true } });
}
if (scenario.startsWith('DIRECT_')) {
  await f.ready();
  if (scenario === 'DIRECT_PRECONDITION_REFUSAL') {
    try { await f.owner.submitOriginal(service); } catch { firstRejected = true; }
    heldAfterFirst = f.owner.inspect().held; assert.equal(f.services, 0);
  }
  await f.owner.handoffToService(handoff);
  if (scenario === 'DIRECT_NONVOID_REJECT') f.onService = () => Promise.resolve(F({ invented: true }));
  else if (scenario === 'DIRECT_REJECT_DURING_CLOSE' || scenario === 'DIRECT_LATE_VOID_DURING_CLOSE') {
    f.onService = () => reply.promise;
  } else if (scenario === 'DIRECT_ASYNC_REJECT') f.onService = () => {
    if (f.services === 1) { recordUnknown(); return Promise.reject(Error('DECLARED_SERVICE_RESPONSE_LOST')); }
    return Promise.resolve(undefined);
  };
  if (scenario === 'DIRECT_REJECT_DURING_CLOSE' || scenario === 'DIRECT_LATE_VOID_DURING_CLOSE') {
    const operation = f.owner.submitOriginal(service); operation.catch(() => {});
    const stop = f.owner.close(); stop.catch(() => {});
    if (scenario === 'DIRECT_REJECT_DURING_CLOSE') reply.reject(Error('DECLARED_RESPONSE_LOST'));
    else reply.resolve(undefined);
    try { await operation; } catch { firstRejected = true; }
    try { await stop; } catch { closeRejected = true; }
    assert.equal(f.owner.close(), stop); heldAfterFirst = f.owner.inspect().held;
  } else {
    try { await f.owner.submitOriginal(service); } catch { firstRejected = true; }
    if (scenario !== 'DIRECT_PRECONDITION_REFUSAL') {
      heldAfterFirst = f.owner.inspect().held;
      // A different explicit service request must not enter after uncertainty.
      try { await f.owner.submitOriginal({ ...service, requestId: 'request.next' }); } catch { secondRejected = true; }
    }
    try { await f.owner.close(); } catch { closeRejected = true; }
  }
} else {
  const input = new PassThrough();
  const output = new Writable({ write(chunk, encoding, done) {
    const value = JSON.parse(String(chunk)); results.push(value);
    if (scenario === 'COMMAND_OUTPUT_LOSS' && value.operation === 'submitService') {
      outputFaults++; done(Error('DECLARED_LOCAL_RESPONSE_WRITE_LOST'));
    } else done();
  }, destroy(error, done) { outputStops++; done(error); } });
  if (scenario !== 'COMMAND_PENDING_UNKNOWN') f.onService = () => {
    assert.deepEqual(f.serviceInput, service);
    assert.equal(f.serviceInput.originalRequestJson, service.originalRequestJson);
    recordUnknown(); entered.resolve();
    if (scenario === 'COMMAND_PENDING_SERVICE_CLOSE') return reply.promise;
    if (scenario === 'COMMAND_OUTPUT_LOSS') return Promise.resolve(undefined);
    return Promise.reject(Error('DECLARED_NATIVE_RESPONSE_LOST'));
  };
  session = await OPEN({ input, output, limits: { closeWaitMs: 40 }, openWaitMs: 1000,
    openClient: F(async () => f.owner) });
  input.end(command('prepare', 'prepare', f.base.input)
    + command('commit', 'commit', { expectedPins: structuredClone(packet.expectedPins) })
    + command('funding', 'submitFunding', { expectedPins: structuredClone(packet.expectedPins) })
    + command('handoff', 'handoff', handoff) + command('service-first', 'submitService', service)
    + command('service-again', 'submitService', service) + command('close', 'close'));
  const running = HOST(session); assert.equal(HOST(session), running);
  if (scenario === 'COMMAND_PENDING_SERVICE_CLOSE') {
    await entered.promise; const stop = session.close(); stop.catch(() => {});
    host = await running; hostBeforeLate = JSON.stringify(host);
    reply.resolve(undefined); await tick(); await tick();
    assert.equal(JSON.stringify(host), hostBeforeLate); assert.equal(session.close(), stop);
    try { await stop; } catch { closeRejected = true; }
  } else host = await running;
  assert.notEqual(host.status, 'CLOSED'); assert.notEqual(host.exitCode, 0);
  assert.equal(host.authority, 'NONE'); assert.equal(host.serviceDelivery, 'NOT_ESTABLISHED');
  assert.equal(outputStops, 1); assert.equal(input.closed, true); assert.equal(output.closed, true);
  assert.equal(f.handoffs, scenario === 'COMMAND_PENDING_UNKNOWN' ? 0 : 1);
  assert.equal(f.services, scenario === 'COMMAND_PENDING_UNKNOWN' ? 0 : 1);
  assert.equal(results.some(v => v.id === 'service-again'), false);
  if (scenario === 'COMMAND_PENDING_UNKNOWN') {
    assert.equal(host.fundingOutcomeUnknown, true); assert.equal(results.at(-1).result.fundingIntakeStatus, 'UNKNOWN');
    assert.equal(session.retainedResult().operation, 'submitFunding');
  } else if (scenario === 'COMMAND_OUTPUT_LOSS') {
    assert.equal(host.outputOutcomeUnknown, true); assert.equal(outputFaults, 1);
    assert.equal(session.retainedResult().operation, 'submitService');
    assert.equal(session.retainedResult().writeCallbackCompleted, false);
  } else assert.equal(results.some(v => v.operation === 'submitService'), false);
  if (scenario === 'COMMAND_RECOVERY_UNKNOWN') {
    const restored = await r.client.restoreOriginalPayment(r.restoreInput());
    assert.equal(restored.paymentSignatureHeader, packet.pair.paymentSignatureHeader);
    recovery = await r.client.readOriginalRecoveryState(r.readInput());
    backendRecovery = await r.client.readOriginalBackendRecoveryState(r.backendInput());
    assert.equal(recovery.reconciliationRequired, true); assert.equal(recovery.priorAttemptRecorded, true);
    assert.equal(recovery.mayDispatchService, false); assert.equal(backendRecovery.backendStatus, 'CACHED_SUCCESS');
    assert.equal(backendRecovery.reconciliationRequired, true); assert.equal(backendRecovery.mayDispatchService, false);
    assert.equal(backendRecovery.maySignPayment, false); assert.equal(backendRecovery.mayStartPayment, false);
    assert.equal(r.services, 0); assert.equal(r.backendReads, 1);
  }
}
await tick();
assert.equal(JSON.stringify(packet), independentPacket); assert.equal(JSON.stringify(f.original), signedOriginal);
assert.equal(f.packet.serializedCheckpoint, packet.serializedCheckpoint);
assert.equal(f.wallet.inspect().wallet.signedOriginal.hash, packet.transactionHash);
assert.equal(f.signs, 1); assert.equal(f.clears, 1); assert.equal(f.closes, 1); assert.equal(f.submits, 1);
const directSticky = ['DIRECT_ASYNC_REJECT', 'DIRECT_NONVOID_REJECT', 'DIRECT_REJECT_DURING_CLOSE'].includes(scenario);
const passed = scenario.startsWith('COMMAND_') || directSticky
  ? scenario.startsWith('COMMAND_') || firstRejected && heldAfterFirst === true && closeRejected
    && f.services === 1 && (scenario === 'DIRECT_REJECT_DURING_CLOSE' || secondRejected)
  : firstRejected && heldAfterFirst === false && closeRejected === false && f.services === 1;
const observation = { scenario, passed, firstRejected, secondRejected, heldAfterFirst, closeRejected,
  serviceCalls: f.services, signCallbacks: f.signs, keyClearCallbacks: f.clears, fundingPosts: f.submits,
  handoffs: f.handoffs, payerCloses: f.closes, outputFaults, outputStops, originalPacketUnchanged: true,
  originalSignedHashUnchanged: true, host, hostRemainedUnknownAfterLateCompletion: hostBeforeLate !== null,
  recovery, backendRecovery, recoveryDispatches: r.services, durableState: 'DECLARED_NO_SQL',
  SDK: 0, SQLite: 0, sockets: 0, generatedKeys: 0, cryptographicSignatures: 0, nonceSearch: 0,
  physicalNativeRelease: 'NOT_QUALIFIED', serviceDelivery: 'NOT_ESTABLISHED', authority: 'NONE' };
await r.client.close();
process.stdout.write(JSON.stringify(observation) + '\n');
assert.equal(passed, true);
