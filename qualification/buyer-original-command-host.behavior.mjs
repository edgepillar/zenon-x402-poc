// Actual command sessions/host and Node streams; native children remain declared.
// No SDK package, SQL, socket, key, cryptographic signature or work search.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { PassThrough, Writable } from 'node:stream';
import { AsyncLocalStorage } from 'node:async_hooks';
import { sdk105FundingServiceFixture } from './sdk105-funding-service-lifecycle.fixture.mjs';
import { recoveryFixture } from './buyer-original-recovery.fixture.mjs';
import { createBuyerCommandLineChannel as CHANNEL } from '../src/buyer-command-line-channel.js';
import { createBuyerOriginalFundingCommandSession as FUNDING, createBuyerOriginalRecoveryCommandSession as RECOVERY,
  createBuyerOriginalBackendRecoveryCommandSession as BACKEND } from '../src/buyer-original-funding-command-session.js';
import { encodeBuyerOriginalFundingCommand as EF, encodeBuyerOriginalRecoveryCommand as ER,
  encodeBuyerOriginalBackendRecoveryCommand as EB } from '../src/buyer-original-funding-command.js';
import { runBuyerOriginalCommandHost as HOST, buyerOriginalCommandHostRefusalResult as REFUSED } from '../src/buyer-original-command-host.js';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_BUYER_COMMAND_HOST, 'builtin-actual-session-terminal-observation');
const F = Object.freeze, copy = value => structuredClone(value);
const command = (id, operation, input = {}) => ({ version: 1, id, operation, input });
const tick = () => new Promise(resolve => setImmediate(resolve));
function gate() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
  assert.fail('expected local callback was not observed');
}
function harness(mode = 'recovery', options = {}) {
  const f = mode === 'funding' ? sdk105FundingServiceFixture(options.mode)
    : recoveryFixture({ backendRecovery: mode === 'backend', ...options.mode });
  const input = new PassThrough(), replies = [], chunks = [];
  const output = new Writable({ highWaterMark: options.highWaterMark ?? 16384,
    write(chunk, encoding, done) {
      chunks.push(Buffer.from(chunk)); const reply = JSON.parse(String(chunk)); replies.push(reply);
      if (options.onWrite) options.onWrite({ f, input, output, replies, reply }, done); else done();
    } });
  const limits = { closeWaitMs: options.closeWaitMs ?? 40 }, channel = CHANNEL({ input, output, limits });
  const create = mode === 'funding' ? FUNDING : mode === 'backend' ? BACKEND : RECOVERY;
  const session = create({ client: mode === 'funding' ? f.owner : f.client, channel, limits });
  return { f, input, output, replies, chunks, channel, session, encode: mode === 'funding' ? EF : mode === 'backend' ? EB : ER };
}
function noAuthority(value) {
  assert.equal(value.authority, 'NONE'); assert.equal(value.grantActivation, 'NOT_ESTABLISHED');
  assert.equal(value.serviceDelivery, 'NOT_ESTABLISHED'); assert.equal(value.nativeResourceCleanup, 'NOT_QUALIFIED');
  assert.equal(value.historicalObservation, true);
  for (const text of ['paymentSignatureHeader', 'serializedCheckpoint', 'originalRequestJson', 'authorizationHeader', 'PRIVATE_', 'ServiceCredit '])
    assert.equal(JSON.stringify(value).includes(text), false);
}
function service(f) {
  return { grantId: 'grant.sdk105.1', requestId: 'request.host.1',
    originalRequestJson: JSON.stringify({ modelVersion: 1, grantId: 'grant.sdk105.1', requestId: 'request.host.1',
      method: 'POST', routeId: 'service-credit.execute.v1',
      canonicalBodyDigest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      selectedContentType: 'application/json', maxCostUnits: 1 }), originalBodyBase64: '',
    serviceResourceUrl: new URL(f.base.resourceUrl).origin + '/service-credit/v1/execute',
    authorizationHeader: 'ServiceCredit declared-proof-no-cryptography' };
}

test('host clean close observes the actual session run and cached close without another execution', async () => {
  const h = harness('funding'); h.input.end(EF(command('one', 'inspect')) + EF(command('end', 'close')));
  const run = HOST(h.session); assert.equal(HOST(h.session), run);
  const result = await run; noAuthority(result); assert.equal(result.status, 'CLOSED'); assert.equal(result.exitCode, 0);
  assert.equal(result.ownersClosedObserved, true); assert.equal(result.runCompletion, 'FULFILLED_UNDEFINED');
  assert.equal(result.closeCompletion, 'FULFILLED_UNDEFINED'); assert.equal(result.localWriteCallbackCompleted, true);
  const close = h.session.close(); await close; assert.equal(h.session.close(), close);
  assert.equal(HOST(h.session), run); assert.equal(h.f.closes, 1); assert.equal(h.f.signs, 0);
});

test('host drives explicit prepare commit funding handoff and original service through the actual lifecycle', async () => {
  const h = harness('funding', { onWrite({ f, input, reply }, done) {
    if (reply.operation === 'prepare') input.write(EF(command('2', 'commit', { expectedPins: copy(f.packet.expectedPins) })));
    if (reply.operation === 'commit') input.write(EF(command('3', 'submitFunding', { expectedPins: copy(f.packet.expectedPins) })));
    if (reply.operation === 'submitFunding') input.write(EF(command('4', 'handoff', f.request())));
    if (reply.operation === 'handoff') input.write(EF(command('5', 'submitService', service(f))));
    if (reply.operation === 'submitService') input.end(EF(command('end', 'close'))); done();
  } });
  h.input.write(EF(command('1', 'prepare', h.f.base.input))); const result = await HOST(h.session);
  noAuthority(result); assert.equal(result.exitCode, 0); assert.equal(h.f.signs, 1); assert.equal(h.f.clears, 1);
  assert.equal(h.f.services, 1); assert.equal(h.f.closes, 1); assert.deepEqual(h.f.serviceInput, service(h.f));
  assert.equal(h.replies.at(-1).result.serviceDelivery, 'NOT_ESTABLISHED');
});

test('host restored-original EOF is a closed session receipt with no leaked header or implicit service', async () => {
  const h = harness(); h.input.end(ER(command('one', 'restoreOriginal', h.f.restoreInput())));
  const result = await HOST(h.session); noAuthority(result); assert.equal(result.exitCode, 0);
  assert.equal(result.retainedResult, true); assert.equal(h.f.restores, 1); assert.equal(h.f.services, 0);
  assert.equal(JSON.parse(h.session.retainedResult().line).result.paymentSignatureHeader, h.f.checkpoint.originalBytes.paymentPayload);
});

test('host distinguishes terminal backend reconciliation from clean command success and unknown owner close', async () => {
  const h = harness('backend'); h.input.end(EB(command('one', 'reconcileOriginal', h.f.backendInput())));
  const result = await HOST(h.session); noAuthority(result);
  assert.equal(result.status, 'RECONCILIATION_REQUIRED'); assert.equal(result.exitCode, 2);
  assert.equal(result.recoveryOutcomeUnknown, true); assert.equal(result.ownersClosedObserved, true);
  assert.equal(result.sessionHeld, true); assert.equal(result.closeCompletion, 'REJECTED');
  assert.equal(h.f.backendReads, 1); assert.equal(h.f.services, 0); assert.equal(h.f.backendCloses, 1);
});

test('host missing-original recovery remains reconciliation without backend or service work', async () => {
  const h = harness(); h.f.state = null; h.input.end(ER(command('one', 'readRecoveryState', h.f.readInput())));
  const result = await HOST(h.session); noAuthority(result); assert.equal(result.exitCode, 2);
  assert.equal(result.ownersClosedObserved, true); assert.equal(h.f.services + h.f.restores, 0);
});

test('host unknown funding intake never reports zero exit or manufactures a second payment', async () => {
  const h = harness('funding', { mode: { unbound: true }, onWrite({ f, input, reply }, done) {
    if (reply.operation === 'prepare') input.write(EF(command('2', 'commit', { expectedPins: copy(f.packet.expectedPins) })));
    if (reply.operation === 'commit') input.end(EF(command('3', 'submitFunding', { expectedPins: copy(f.packet.expectedPins) })));
    done();
  } });
  h.input.write(EF(command('1', 'prepare', h.f.base.input))); const result = await HOST(h.session);
  noAuthority(result); assert.equal(result.status, 'OUTCOME_UNKNOWN'); assert.equal(result.exitCode, 3);
  assert.equal(result.fundingOutcomeUnknown, true); assert.equal(h.f.submits, 1); assert.equal(h.f.signs, 1);
  assert.equal(h.f.handoffs + h.f.services, 0);
});

test('host malformed input before payment is refused separately from a payment outcome', async () => {
  const h = harness(); h.input.end('{broken}\n'); const result = await HOST(h.session);
  noAuthority(result); assert.equal(result.status, 'INPUT_REFUSED'); assert.equal(result.exitCode, 1);
  assert.equal(result.ownersClosedObserved, true); assert.equal(h.f.restores + h.f.services + h.f.stateReads, 0);
});

test('host duplicate command after returned original header preserves unknown output without another restore', async () => {
  const h = harness(); h.input.end(ER(command('same', 'restoreOriginal', h.f.restoreInput())) + ER(command('same', 'inspect')));
  const result = await HOST(h.session); noAuthority(result); assert.equal(result.status, 'OUTCOME_UNKNOWN');
  assert.equal(result.exitCode, 3); assert.equal(result.outputOutcomeUnknown, true);
  assert.equal(h.f.restores, 1); assert.equal(h.f.services, 0);
});

test('host output write failure retains original DATA and reports uncertain close without error details', async () => {
  const h = harness('recovery', { onWrite(context, done) { done(Error('PRIVATE_OUTPUT_FAILURE')); } });
  h.input.write(ER(command('one', 'restoreOriginal', h.f.restoreInput()))); const result = await HOST(h.session);
  noAuthority(result); assert.equal(result.exitCode, 4); assert.equal(result.status, 'CLOSE_UNKNOWN');
  assert.equal(result.outputOutcomeUnknown, true); assert.equal(result.localWriteCallbackCompleted, false);
  assert.equal(JSON.parse(h.session.retainedResult().line).result.paymentSignatureHeader, h.f.checkpoint.originalBytes.paymentPayload);
  assert.equal(h.f.restores, 1);
});

test('host joins the actual bounded close and a late write cannot change the historical result', async () => {
  let release;
  const h = harness('recovery', { closeWaitMs: 20, highWaterMark: 1, onWrite(context, done) { release = done; } });
  h.input.write(ER(command('one', 'restoreOriginal', h.f.restoreInput()))); const run = HOST(h.session);
  await until(() => typeof release === 'function'); const close = h.session.close(); await assert.rejects(close);
  const result = await run; noAuthority(result); assert.equal(result.exitCode, 4);
  release(); await tick(); assert.equal(HOST(h.session), run); assert.equal(await run, result);
  assert.equal(h.session.close(), close); await assert.rejects(close); assert.equal(h.f.restores, 1);
});

test('host external stop while idle joins the same session close without creating business work', async () => {
  const h = harness(), run = HOST(h.session); await until(() => h.channel.inspect().reading);
  const close = h.session.close(); assert.equal(await close, undefined); const result = await run;
  noAuthority(result); assert.equal(result.exitCode, 0); assert.equal(h.session.close(), close);
  assert.equal(h.f.restores + h.f.services + h.f.stateReads, 0); assert.equal(h.f.closes, 1);
});

test('host stop during pending restore cannot release a late header or become a clean result', async () => {
  const h = harness(), ready = gate(); h.f.onRestore = () => ready.promise;
  h.input.write(ER(command('one', 'restoreOriginal', h.f.restoreInput()))); const run = HOST(h.session);
  await until(() => h.f.restores === 1); const close = h.session.close(), refused = assert.rejects(close);
  ready.resolve(); await refused; const result = await run; noAuthority(result); assert.equal(result.exitCode, 4);
  assert.equal(h.replies.length, 0); assert.equal(h.f.services, 0); assert.equal(h.f.closes, 1);
});

test('historical host success stays immutable while fresh session owner views can downgrade', async () => {
  const h = harness(); h.input.end(ER(command('end', 'close'))); const run = HOST(h.session), result = await run;
  assert.equal(result.exitCode, 0); h.f.unknown = true;
  assert.equal(h.session.inspect().currentOwnersClosed, false); assert.equal(h.session.inspect().held, true);
  assert.equal(HOST(h.session), run); assert.equal(await run, result); assert.equal(result.historicalObservation, true);
  assert.equal(h.f.closes, 1);
});

test('host refuses an already-running session without adopting or interrupting the original caller', async () => {
  const h = harness(), original = h.session.run(); await until(() => h.channel.inspect().reading);
  const refused = HOST(h.session); await assert.rejects(refused); assert.equal(HOST(h.session), refused);
  assert.equal(h.f.closes, 0); h.input.end(ER(command('end', 'close'))); await original; assert.equal(h.f.closes, 1);
});

test('host refuses an already-closed session without another run or native stop', async () => {
  const h = harness(), close = h.session.close(); await close; await assert.rejects(HOST(h.session));
  assert.equal(h.session.inspect().runRequested, false); assert.equal(h.f.closes, 1); assert.equal(h.session.close(), close);
});

test('host capability accessors proxies and invalid initial views run no caller hooks or close another owner', async () => {
  const h = harness(); let hooks = 0;
  const getter = F({ ...h.session, get inspect() { hooks++; throw Error('PRIVATE_INSPECT_GETTER'); } });
  await assert.rejects(HOST(getter));
  await assert.rejects(HOST(new Proxy(h.session, { get() { hooks++; } })));
  const view = F({ ...h.session, inspect: F(() => F({ get buyerOriginalFundingCommandSessionVersion() { hooks++; } })) });
  await assert.rejects(HOST(view)); assert.equal(hooks, 0); assert.equal(h.f.closes, 0); await h.session.close();
});

test('host refuses thenables nonvoid run values and private run exceptions while still stopping the owned session', async () => {
  for (const kind of ['thenable', 'nonvoid', 'throw']) {
    const h = harness(); let hooks = 0;
    const run = F(() => { if (kind === 'throw') throw Error('PRIVATE_RUN_FAILURE');
      return kind === 'nonvoid' ? Promise.resolve({ delivered: true }) : F({ then() { hooks++; } }); });
    const result = await HOST(F({ ...h.session, run })); noAuthority(result); assert.equal(result.exitCode, 3);
    assert.equal(hooks, 0); assert.equal(h.f.closes, 1); assert.equal(h.session.inspect().currentOwnersClosed, true);
  }
});

test('host never accepts manufactured or throwing close receipts even after real child owners stopped', async () => {
  for (const kind of ['record', 'throw']) {
    const h = harness(); h.input.end(ER(command('end', 'close')));
    const close = F(() => { if (kind === 'throw') throw Error('PRIVATE_CLOSE_FAILURE'); return Promise.resolve({ released: true }); });
    const result = await HOST(F({ ...h.session, close })); noAuthority(result); assert.equal(result.exitCode, 4);
    assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(h.f.closes, 1);
  }
});

test('host final observation failure cannot certify clean resources or expose private diagnostics', async () => {
  const h = harness(); h.input.end(ER(command('end', 'close'))); let reads = 0;
  const inspect = F(() => { if (++reads > 1) throw Error('PRIVATE_FINAL_VIEW'); return h.session.inspect(); });
  const result = await HOST(F({ ...h.session, inspect })); noAuthority(result); assert.equal(result.exitCode, 4);
  assert.equal(result.ownersClosedObserved, false); assert.equal(result.sessionLifecycle, 'UNKNOWN');
  assert.equal(h.f.closes, 1);
});

test('host handles actual Node tracing Promise slots and sanitized open refusal without false release claims', async () => {
  const local = new AsyncLocalStorage();
  await local.run(F({ declaredTrace: true }), async () => {
    const h = harness(); h.input.end(ER(command('end', 'close'))); const result = await HOST(h.session);
    noAuthority(result); assert.equal(result.exitCode, 0); assert.equal(h.f.closes, 1);
  });
  for (const [stage, exitCode] of [['OPEN_REFUSED', 1], ['HOST_REFUSED', 4]]) {
    const result = REFUSED(stage); noAuthority(result); assert.equal(result.exitCode, exitCode);
    assert.equal(result.resourceRelease, 'NOT_ESTABLISHED');
  }
  assert.throws(() => REFUSED('PRIVATE_DYNAMIC_DIAGNOSTIC'));
});
