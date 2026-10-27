// Actual recovery/checkpoint/custody code and Node memory streams. Declared
// native callbacks, fixed public DATA and invalid signature bytes only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { PassThrough, Writable } from 'node:stream';
import { recoveryFixture as fixture, F, copy, freeze } from './buyer-original-recovery.fixture.mjs';
import { captureBuyerOriginalRecoverySelection as SELECT, createBuyerOriginalRecoveryClient as CLIENT } from '../src/buyer-original-recovery-client.js';
import { captureBuyerOriginalFundingCommandLimits as LIMITS, encodeBuyerOriginalRecoveryCommand as ENCODE,
  decodeBuyerOriginalRecoveryCommand as DECODE, encodeBuyerOriginalFundingCommand as FUNDING } from '../src/buyer-original-funding-command.js';
import { createBuyerCommandLineChannel as CHANNEL } from '../src/buyer-command-line-channel.js';
import { createBuyerOriginalRecoveryCommandSession as SESSION } from '../src/buyer-original-funding-command-session.js';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_BUYER_RECOVERY_CONTROL, 'builtin-retained-original-no-signer');
const tick = () => new Promise(resolve => setImmediate(resolve));
function gate() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
  assert.fail('expected local callback was not observed');
}
const command = (id, operation, input = {}) => ({ version: 1, id, operation, input });
async function heldClose(f) { await assert.rejects(f.client.close()); assert.equal(f.client.inspect().held, true); }
function noAuthority(v) {
  assert.equal(v.authority, 'NONE'); assert.equal(v.mayDispatchService, false);
  assert.equal(v.serviceDelivery, 'NOT_ESTABLISHED');
  for (const secret of ['authorizationHeader', 'originalRequestJson', 'originalBodyBase64', 'paymentSignatureHeader', 'serializedCheckpoint'])
    assert.equal(Object.hasOwn(v, secret), false);
}
function harness(options = {}) {
  const f = fixture(options.mode), replies = [], chunks = [], input = new PassThrough();
  const output = new Writable({ highWaterMark: options.highWaterMark ?? 16384,
    write(chunk, encoding, done) {
      chunks.push(Buffer.from(chunk)); const reply = JSON.parse(String(chunk)); replies.push(reply);
      if (options.onWrite) options.onWrite({ f, input, output, replies, reply }, done); else done();
    } });
  const limits = LIMITS({ closeWaitMs: options.closeWaitMs ?? 40 });
  const channel = CHANNEL({ input, output, limits }), owner = SESSION({ client: f.client, channel, limits });
  return { f, input, output, replies, chunks, channel, owner,
    send(c) { input.write(ENCODE(c)); } };
}
async function refused(h) {
  await assert.rejects(h.owner.run()); assert.equal(h.owner.inspect().held, true);
  assert.equal(h.f.closes, 1); assert.equal(h.channel.inspect().inputStopRequested, true);
  assert.equal(h.channel.inspect().outputStopRequested, true);
}

test('recovery construction captures external originals without reading funding or obtaining a signer', async () => {
  const f = fixture(), view = f.client.inspect();
  assert.equal(f.restores + f.checkpointReads + f.stateReads + f.services, 0);
  assert.equal(view.signerCalls, 0); assert.equal(view.fundingTransportProvided, false);
  assert.equal(view.phase, 'AWAITING_ORIGINAL_RESTORE');
  assert.equal(Object.hasOwn(f.client, 'prepareOriginalFunding'), false);
  assert.equal(Object.hasOwn(f.client, 'submitOriginalFunding'), false);
  const external = copy(f.selection), captured = SELECT({ originalPayment: external.originalPayment,
    selectedGrantId: external.selectedGrantId, paymentRequiredHeader: external.paymentRequiredHeader });
  external.originalPayment.expectedPins.binding.paymentHash = '00'.repeat(32);
  assert.deepEqual(captured.originalPayment.expectedPins, f.packet.expectedPins); await f.client.close();
});

test('malformed external pins and capability getters are rejected before recovery callbacks', async () => {
  const f = fixture(), selection = copy(f.selection); selection.originalPayment.expectedPins.digests.context = 'bad';
  assert.throws(() => SELECT({ originalPayment: selection.originalPayment,
    selectedGrantId: selection.selectedGrantId, paymentRequiredHeader: selection.paymentRequiredHeader }));
  let hooks = 0;
  const child = F({ ...f.native, get close() { hooks++; throw Error('PRIVATE_GETTER'); } });
  assert.throws(() => CLIENT({ client: child, selection: f.selection }));
  assert.equal(hooks + f.restores + f.checkpointReads + f.stateReads, 0); await f.client.close();
});

test('recovery and funding command protocols cannot admit each other funding or restore operations', async () => {
  for (const op of ['prepare', 'commit', 'submitFunding', 'handoff']) assert.throws(() => ENCODE(command('one', op)));
  const f = fixture(); assert.throws(() => FUNDING(command('one', 'restoreOriginal', f.restoreInput())));
  assert.throws(() => DECODE('{"id":"one","id":"two","input":{},"operation":"inspect","version":1}'));
  assert.throws(() => ENCODE(command('one', 'submitService', { ...f.service(), expectedPins: undefined })));
  await f.client.close();
});

test('restoration returns the exact retained header after three real checkpoint-core reads and DATA comparison', async () => {
  const f = fixture(), result = await f.client.restoreOriginalPayment(f.restoreInput());
  assert.equal(result.paymentSignatureHeader, f.checkpoint.originalBytes.paymentPayload);
  assert.notEqual(result.paymentSignatureHeader, f.comparisonHeader);
  assert.equal(result.signatureCreated, false); assert.equal(result.transport, 'NOT_INVOKED');
  assert.equal(f.restoreCoreReads, 3); assert.equal(f.restores, 1);
  assert.equal(f.checkpointReads + f.stateReads + f.services, 0); await f.client.close();
});

test('wrong fresh restore challenge or pins consume neither original nor native restore attempt', async () => {
  const f = fixture(), changed = f.restoreInput(); changed.expectedPins.binding.contextId += '.other';
  await assert.rejects(f.client.restoreOriginalPayment(changed));
  await assert.rejects(f.client.restoreOriginalPayment({ ...f.restoreInput(), paymentRequiredHeader: 'changed' }));
  assert.equal(f.client.inspect().restoreAttempts, 0); assert.equal(f.restores + f.checkpointReads, 0);
  await f.client.restoreOriginalPayment(f.restoreInput()); await f.client.close();
});

test('a restored original cannot be recreated or selected through a second restore attempt', async () => {
  const f = fixture(); await f.client.restoreOriginalPayment(f.restoreInput());
  await assert.rejects(f.client.restoreOriginalPayment(f.restoreInput()));
  assert.equal(f.restores, 1); assert.equal(f.restoreCoreReads, 3); await f.client.close();
});

test('local recovery reads use two fresh complete-checkpoint fences and expose only redacted observations', async () => {
  const f = fixture(), observed = await f.client.readOriginalRecoveryState(f.readInput());
  noAuthority(observed); assert.equal(observed.recordPresent, true); assert.equal(observed.reconciliationRequired, false);
  assert.equal(f.checkpointReads, 2); assert.equal(f.stateReads, 1);
  assert.equal(f.restores + f.services, 0); await f.client.close();
});

test('changed complete checkpoint before local state prevents the state read and latches HELD', async () => {
  const f = fixture(); f.onCheckpoint = () => ({ ...f.checkpoint, checksum: 'changed' });
  await assert.rejects(f.client.readOriginalRecoveryState(f.readInput()));
  assert.equal(f.checkpointReads, 1); assert.equal(f.stateReads + f.services, 0); await heldClose(f);
});

test('changed complete checkpoint after local state prevents an observation from escaping', async () => {
  const f = fixture(); f.onCheckpoint = n => n === 1 ? f.checkpoint : { ...f.checkpoint, checksum: 'changed' };
  await assert.rejects(f.client.readOriginalRecoveryState(f.readInput()));
  assert.equal(f.checkpointReads, 2); assert.equal(f.stateReads, 1); assert.equal(f.client.inspect().lastRecovery, null); await heldClose(f);
});

test('checkpoint accessors proxies and thenables are refused without running caller hooks', async () => {
  for (const kind of ['accessor', 'proxy', 'thenable']) {
    const f = fixture(); let hooks = 0;
    f.onCheckpoint = () => kind === 'proxy' ? new Proxy({}, { ownKeys() { hooks++; return []; } })
      : kind === 'thenable' ? F({ then() { hooks++; } })
        : F({ get binding() { hooks++; throw Error('PRIVATE_CHECKPOINT'); } });
    await assert.rejects(f.client.readOriginalRecoveryState(f.readInput()));
    assert.equal(hooks + f.stateReads, 0); await heldClose(f);
  }
});

test('an asynchronous checkpoint reader cannot be assimilated into synchronous recovery evidence', async () => {
  const f = fixture(); f.onCheckpoint = () => Promise.resolve(f.checkpoint);
  await assert.rejects(f.client.readOriginalRecoveryState(f.readInput()));
  assert.equal(f.checkpointReads, 1); assert.equal(f.stateReads, 0); await heldClose(f);
});

test('foreign grants and changed per-read pins are refused before checkpoint or custody callbacks', async () => {
  const f = fixture(), foreign = f.readInput(), changed = f.readInput();
  foreign.key.grantId = 'grant.foreign'; changed.expectedPins.digests.requestBody = 'bad';
  await assert.rejects(f.client.readOriginalRecoveryState(foreign)); await assert.rejects(f.client.readOriginalRecoveryState(changed));
  assert.equal(f.checkpointReads + f.stateReads, 0); await f.client.close();
});

test('foreign stored request or funding hash network and resource cannot pass external bindings', async () => {
  for (const [field, value] of [['paymentHash', 'ef'.repeat(32)], ['network', 'zenon:foreign'],
    ['fundingResourceUrl', 'https://foreign.invalid/funding']]) {
    const f = fixture(); f.change({ funding: { ...f.state.funding, [field]: value } });
    await assert.rejects(f.client.readOriginalRecoveryState(f.readInput())); assert.equal(f.services, 0); await heldClose(f);
  }
  const f = fixture(); f.change({ original: { ...f.original, grantId: 'grant.foreign' } });
  await assert.rejects(f.client.readOriginalRecoveryState(f.readInput())); await heldClose(f);
});

test('missing local original requires reconciliation and later clean data cannot clear the latch', async () => {
  const f = fixture(), saved = f.state; f.state = null;
  const missing = await f.client.readOriginalRecoveryState(f.readInput()); noAuthority(missing);
  assert.equal(missing.recordPresent, false); assert.equal(missing.reconciliationRequired, true);
  f.state = saved; const later = await f.client.readOriginalRecoveryState(f.readInput());
  assert.equal(later.reconciliationRequired, true);
  await assert.rejects(f.client.submitOriginal(f.service())); assert.equal(f.services, 0); await f.client.close();
});

test('each funding ambiguity and uncertainty flag independently makes reconciliation sticky', async () => {
  const variants = [
    ...['PREPARED', 'ATTEMPT_FENCED', 'OUTCOME_UNKNOWN', 'PAYMENT_REJECTED', 'PAYMENT_CONFLICT'].map(status => ['funding', { status }]),
    ['funding', { ambiguityLatched: true }],
    ...['custody', 'submission', 'undrained', 'declaredFundingAmbiguitySeen'].map(flag => ['uncertainty', { [flag]: true }]),
  ];
  for (const [part, changes] of variants) {
    const f = fixture(), saved = f.state; f.change({ [part]: { ...f.state[part], ...changes } });
    const v = await f.client.readOriginalRecoveryState(f.readInput()); noAuthority(v); assert.equal(v.reconciliationRequired, true);
    f.state = saved; assert.equal((await f.client.readOriginalRecoveryState(f.readInput())).reconciliationRequired, true);
    assert.equal(f.services + f.restores, 0); await f.client.close();
  }
});

test('prior dispatch intent or local success observation never authorizes replay or delivery', async () => {
  for (const response of [false, true]) {
    const f = fixture(); await f.client.restoreOriginalPayment(f.restoreInput());
    f.change(response ? { responseObservation: { status: 'DECLARED', httpStatus: 200 }, responseStatus: 'LOCAL_DECLARED_SUCCESS_RESPONSE_OBSERVED' }
      : { dispatchIntent: f.intent() });
    const v = await f.client.readOriginalRecoveryState(f.readInput()); noAuthority(v);
    assert.equal(v.priorAttemptRecorded, true); assert.equal(v.reconciliationRequired, true);
    await assert.rejects(f.client.submitOriginal(f.service())); assert.equal(f.services, 0); await f.client.close();
  }
});

test('close during pending restore joins its original callback and prevents late header escape', async () => {
  const f = fixture(), ready = gate(); f.onRestore = () => ready.promise;
  const restore = f.client.restoreOriginalPayment(f.restoreInput()), refusedRestore = assert.rejects(restore);
  const close = f.client.close(), refusedClose = assert.rejects(close); ready.resolve();
  await refusedRestore; await refusedClose; assert.equal(f.client.inspect().restored, false);
  assert.equal(f.closes, 1); assert.equal(f.services, 0); assert.equal(f.client.close(), close);
});

test('reentrant close from a custody read cannot return an admitted recovery observation', async () => {
  const f = fixture(); let close;
  f.onState = () => { close = f.client.close(); return f.state; };
  await assert.rejects(f.client.readOriginalRecoveryState(f.readInput())); await assert.rejects(close);
  assert.equal(f.stateReads, 1); assert.equal(f.checkpointReads, 1); assert.equal(f.client.inspect().lastRecovery, null);
});

test('only an explicit restored never-attempted original reaches the six-field service capability once', async () => {
  const f = fixture(); await f.client.restoreOriginalPayment(f.restoreInput());
  const request = f.service(); assert.equal(await f.client.submitOriginal(request), undefined);
  const { expectedPins, ...nativeInput } = request; assert.deepEqual(f.serviceInput, nativeInput);
  assert.equal(f.services, 1); assert.equal(f.checkpointReads, 2); assert.equal(f.stateReads, 1);
  await assert.rejects(f.client.submitOriginal(f.service())); assert.equal(f.services, 1); await heldClose(f);
});

test('service requires explicit restore fresh pins and exact stored original bytes before native submit', async () => {
  const early = fixture(); await assert.rejects(early.client.submitOriginal(early.service()));
  assert.equal(early.services + early.checkpointReads, 0); await early.client.close();
  const missing = fixture(); await missing.client.restoreOriginalPayment(missing.restoreInput());
  const input = missing.service(); delete input.expectedPins; await assert.rejects(missing.client.submitOriginal(input));
  assert.equal(missing.checkpointReads + missing.services, 0); await missing.client.close();
  const changed = fixture(); await changed.client.restoreOriginalPayment(changed.restoreInput());
  await assert.rejects(changed.client.submitOriginal({ ...changed.service(), originalRequestJson: changed.original.originalRequestJson + ' ' }));
  assert.equal(changed.services, 0); await heldClose(changed);
});

test('manufactured service result cannot become a callback completion or clean close receipt', async () => {
  const f = fixture({ serviceResult: F({ delivered: true }) }); await f.client.restoreOriginalPayment(f.restoreInput());
  await assert.rejects(f.client.submitOriginal(f.service())); assert.equal(f.services, 1); await heldClose(f);
});

test('explicit recovery commands restore inspect and submit one existing service original without funding', async () => {
  const h = harness({ onWrite({ f, input, reply }, done) {
    if (reply.operation === 'restoreOriginal') input.write(ENCODE(command('2', 'readRecoveryState', f.readInput())));
    if (reply.operation === 'readRecoveryState') input.write(ENCODE(command('3', 'submitService', f.service())));
    if (reply.operation === 'submitService') input.end(ENCODE(command('4', 'close')));
    done();
  } });
  h.send(command('1', 'restoreOriginal', h.f.restoreInput())); const run = h.owner.run(); await run;
  assert.equal(h.owner.run(), run); assert.equal(h.owner.inspect().mode, 'RECOVER_EXISTING_ORIGINAL');
  assert.deepEqual(h.replies.map(r => r.operation), ['restoreOriginal', 'readRecoveryState', 'submitService']);
  assert.equal(h.replies[0].result.paymentSignatureHeader, h.f.checkpoint.originalBytes.paymentPayload);
  noAuthority(h.replies[1].result); assert.equal(h.replies[2].result.callbackCompleted, true);
  assert.equal(h.replies[2].result.serviceDelivery, 'NOT_ESTABLISHED');
  assert.equal(h.f.restores, 1); assert.equal(h.f.services, 1); assert.equal(h.owner.inspect().lifecycle, 'CLOSED');
});

test('restore followed by EOF never implicitly submits a service or fresh funding payment', async () => {
  const h = harness(); h.input.end(ENCODE(command('one', 'restoreOriginal', h.f.restoreInput())));
  await h.owner.run(); assert.equal(h.f.restores, 1); assert.equal(h.f.services + h.f.stateReads, 0);
  assert.equal(h.replies.length, 1); assert.equal(h.owner.retainedResult().line, h.chunks[0].toString());
});

test('uncertain recovery result is retained and written before the command session stops further service admission', async () => {
  const h = harness(); h.f.change({ dispatchIntent: h.f.intent() });
  h.input.end(ENCODE(command('one', 'readRecoveryState', h.f.readInput())) + ENCODE(command('two', 'submitService', h.f.service())));
  await refused(h); assert.equal(h.f.services, 0); assert.equal(h.owner.inspect().commands, 1);
  assert.equal(h.owner.inspect().recoveryOutcomeUnknown, true);
  assert.equal(h.owner.retainedResult().writeCallbackCompleted, true); noAuthority(h.replies[0].result);
});

test('lost recovery output retains the exact original header without another restore or service call', async () => {
  const h = harness({ onWrite(context, done) { done(Error('PRIVATE_RECOVERY_OUTPUT')); } });
  h.send(command('one', 'restoreOriginal', h.f.restoreInput())); await refused(h);
  const retained = h.owner.retainedResult(); assert.equal(retained.writeCallbackCompleted, false);
  assert.equal(JSON.parse(retained.line).result.paymentSignatureHeader, h.f.checkpoint.originalBytes.paymentPayload);
  assert.equal(retained.line.includes('PRIVATE_RECOVERY_OUTPUT'), false);
  assert.equal(h.f.restores, 1); assert.equal(h.f.services, 0); assert.equal(h.owner.inspect().outputOutcomeUnknown, true);
});

test('duplicate recovery command ids cannot replay the original or enter a second operation', async () => {
  const h = harness(); h.input.end(ENCODE(command('same', 'restoreOriginal', h.f.restoreInput()))
    + ENCODE(command('same', 'readRecoveryState', h.f.readInput())));
  await refused(h); assert.equal(h.f.restores, 1); assert.equal(h.f.stateReads, 0);
});

test('recovery output backpressure shares the bounded close budget and a late write cannot heal UNKNOWN', async () => {
  let release;
  const h = harness({ closeWaitMs: 20, highWaterMark: 1, onWrite(context, done) { release = done; } });
  h.send(command('one', 'restoreOriginal', h.f.restoreInput())); const run = h.owner.run(), rejected = assert.rejects(run);
  await until(() => typeof release === 'function'); assert.equal(h.owner.inspect().commands, 1);
  const close = h.owner.close(); await assert.rejects(close); await rejected;
  release(); await tick(); assert.equal(h.owner.close(), close); await assert.rejects(close);
  assert.equal(h.owner.inspect().lifecycle, 'HELD'); assert.equal(h.owner.inspect().historicalClose, 'REJECTED');
  assert.equal(h.f.restores, 1); assert.equal(h.f.services, 0);
});

test('fresh native close-view drift downgrades current recovery state without rewriting historical close', async () => {
  const h = harness(); h.input.end(ENCODE(command('end', 'close'))); await h.owner.run();
  const close = h.owner.close(); await close; h.f.unknown = true;
  assert.equal(h.owner.inspect().lifecycle, 'HELD'); assert.equal(h.f.client.inspect().lifecycle, 'HELD');
  assert.equal(h.owner.inspect().historicalClose, 'FULFILLED_UNDEFINED');
  assert.equal(h.owner.close(), close); await close; assert.equal(h.f.closes, 1);
});
