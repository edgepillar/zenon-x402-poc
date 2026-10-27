// Actual stream/session/host and SDK105 wallet/lifecycle ownership code.
// Native children/key callbacks are declared; signatures are fixed invalid DATA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { AsyncLocalStorage } from 'node:async_hooks';
import { openBuyerFundingOwnedStreamSession as OPEN } from '../src/buyer-funding-owned-stream-session.js';
import { runBuyerOriginalCommandHost as HOST } from '../src/buyer-original-command-host.js';
import { encodeBuyerOriginalFundingCommand as ENCODE } from '../src/buyer-original-funding-command.js';
import { createBuyerCommandLineChannel as CHANNEL } from '../src/buyer-command-line-channel.js';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as ASSEMBLE } from '../src/zenon/dynamic-plasma-original-funding-data.js';
import { sdk105FundingServiceFixture as fixture } from './sdk105-funding-service-lifecycle.fixture.mjs';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_FUNDING_OWNED_STREAM_CONTROL, 'builtin-exclusive-before-native');
const F = Object.freeze, copy = value => structuredClone(value), tick = () => new Promise(resolve => setImmediate(resolve));
const command = (id, operation, input = {}) => ENCODE({ version: 1, id, operation, input });
function gate() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function harness(options = {}) {
  const f = fixture(), input = new PassThrough(), replies = [], chunks = [];
  let outputStops = 0, delayedDestroy = null;
  const output = new Writable({ write(chunk, encoding, done) {
    chunks.push(Buffer.from(chunk)); replies.push(JSON.parse(String(chunk))); done();
  }, destroy(error, done) {
    outputStops++; if (options.pendingOutputClose) delayedDestroy = () => done(error); else done(error);
  } });
  let opens = 0;
  const opening = F(function declaredNativeOpen() {
    opens++;
    assert.equal(input.readableFlowing, false); assert.equal(input.listenerCount('data'), 1);
    assert.throws(() => CHANNEL({ input, output, limits: {} }));
    assert.equal(f.signs + f.clears + f.prepares + f.commits + f.submits + f.services, 0);
    return options.open ? options.open({ f, input, output }) : Promise.resolve(f.owner);
  });
  return { f, input, output, replies, chunks, opening, limits: { closeWaitMs: 40 },
    get opens() { return opens; }, get outputStops() { return outputStops; },
    finishOutput() { assert.equal(typeof delayedDestroy, 'function'); delayedDestroy(); },
    open(openClient = opening) {
      return new AsyncLocalStorage().run(F({ ownedFundingTrace: true }), () => OPEN({ input, output, limits: this.limits, openClient }));
    } };
}
function externalInputs(f) {
  // Construct fixed operator expectations BEFORE any native opening or command.
  // Never learn independent pins from preparation output or f.packet.
  const packet = ASSEMBLE(f.base.input, { originalUnsignedBlock: f.original,
    accountBlock: { ...f.original, signature: f.signature.toString('base64') } }, f.base.resourceUrl);
  const grantId = 'grant.sdk105.1', requestId = 'request.sdk105.1';
  const handoff = { originalPayment: { resourceUrl: f.base.resourceUrl,
    serializedCheckpoint: packet.serializedCheckpoint, expectedPins: copy(packet.expectedPins) },
    selectedGrantId: grantId, paymentRequiredHeader: f.base.input.challenge.paymentRequiredHeader };
  const originalRequest = { modelVersion: 1, grantId, requestId, method: 'POST', routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    selectedContentType: 'application/json', maxCostUnits: 1 };
  const service = { grantId, requestId, originalRequestJson: JSON.stringify(originalRequest), originalBodyBase64: '',
    serviceResourceUrl: new URL(f.base.resourceUrl).origin + '/service-credit/v1/execute',
    authorizationHeader: 'ServiceCredit declared-proof-no-cryptography' };
  return { packet, handoff, service, lines: command('prepare', 'prepare', f.base.input)
    + command('commit', 'commit', { expectedPins: copy(packet.expectedPins) })
    + command('funding', 'submitFunding', { expectedPins: copy(packet.expectedPins) })
    + command('handoff', 'handoff', handoff) + command('service', 'submitService', service) + command('close', 'close') };
}
async function refused(h, opening = h.open()) {
  await assert.rejects(opening, /buyer_funding_owned_stream_open_refused|buyer_command_line_channel_/);
  assert.equal(h.input.destroyed, true); assert.equal(h.output.destroyed, true);
  assert.equal(h.input.closed, true); assert.equal(h.output.closed, true); assert.equal(h.outputStops, 1);
}

test('exclusive channel opens before one real lifecycle executes explicit original funding and service commands', async () => {
  const h = harness(), selected = externalInputs(h.f), session = await h.open();
  assert.equal(h.opens, 1); assert.equal(h.f.signs + h.f.clears, 0);
  h.input.end(selected.lines); const result = await HOST(session);
  assert.equal(result.status, 'CLOSED'); assert.equal(result.exitCode, 0);
  assert.deepEqual(h.replies.map(r => r.operation), ['prepare', 'commit', 'submitFunding', 'handoff', 'submitService']);
  assert.equal(h.replies[0].result.serializedCheckpoint, selected.packet.serializedCheckpoint);
  assert.deepEqual(h.f.commitInput.expectedPins, selected.packet.expectedPins);
  assert.deepEqual(h.f.submitInput.expectedPins, selected.packet.expectedPins);
  assert.deepEqual(h.f.handoffInput, selected.handoff); assert.deepEqual(h.f.serviceInput, selected.service);
  assert.equal(h.replies[4].result.callbackCompleted, true); assert.equal(h.replies[4].result.serviceDelivery, 'NOT_ESTABLISHED');
  assert.deepEqual(h.f.trace, ['sign', 'clear', 'handoff', 'client-close']);
  assert.equal(h.f.signs, 1); assert.equal(h.f.clears, 1); assert.equal(h.f.services, 1); assert.equal(h.f.closes, 1);
  assert.equal(h.outputStops, 1);
});

test('preparation plus EOF never supplies pins or starts funding handoff or service automatically', async () => {
  const h = harness(), session = await h.open(); h.input.end(command('prepare-only', 'prepare', h.f.base.input));
  assert.equal((await HOST(session)).status, 'CLOSED');
  assert.equal(h.f.prepares, 1); assert.equal(h.f.signs, 1); assert.equal(h.f.clears, 1);
  assert.equal(h.f.commits + h.f.submits + h.f.handoffs + h.f.services, 0);
});

test('concurrent same-stream invocation cannot enter a second native or key acquisition while first OPEN is pending', async () => {
  const barrier = gate(), h = harness({ open: ({ f }) => barrier.promise.then(() => f.owner) });
  const first = h.open(); let secondOpens = 0;
  await assert.rejects(h.open(F(() => { secondOpens++; return Promise.resolve(h.f.owner); })));
  assert.equal(secondOpens, 0); assert.equal(h.opens, 1); assert.equal(h.f.signs + h.f.clears + h.f.closes, 0);
  barrier.resolve(); const session = await first; h.input.end(command('close', 'close'));
  assert.equal((await HOST(session)).status, 'CLOSED'); assert.equal(h.f.clears, 1); assert.equal(h.f.closes, 1);
});

test('reentrant same-stream invocation during native entry is refused before its opener', async () => {
  let second = null, secondOpens = 0, h;
  h = harness({ open: ({ f, input, output }) => {
    second = OPEN({ input, output, limits: { closeWaitMs: 40 }, openClient: F(() => { secondOpens++; return Promise.resolve(f.owner); }) });
    second.catch(() => {}); return Promise.resolve(f.owner);
  } });
  const session = await h.open(); await assert.rejects(second); assert.equal(secondOpens, 0);
  h.input.end(command('close', 'close')); assert.equal((await HOST(session)).status, 'CLOSED'); assert.equal(h.f.clears, 1);
});

test('native open rejection stops both owned streams without touching the unreturned key/client', async () => {
  const h = harness({ open: () => Promise.reject(Error('PRIVATE_OPEN')) }); await refused(h);
  assert.equal(h.f.closes + h.f.clears + h.f.signs, 0); await h.f.owner.close();
});

test('native synchronous open throw independently stops the channel without claiming key transfer', async () => {
  const h = harness({ open: () => { throw Error('PRIVATE_OPEN_THROW'); } }); await refused(h);
  assert.equal(h.f.closes + h.f.clears, 0); await h.f.owner.close();
});

test('unsupported opening thenable is refused without invoking its getter', async () => {
  let hooks = 0; const h = harness({ open: () => F({ get then() { hooks++; throw Error('PRIVATE_THEN'); } }) });
  await refused(h); assert.equal(hooks, 0); assert.equal(h.f.clears + h.f.closes, 0); await h.f.owner.close();
});

test('opening Promise constructor accessor is refused without assimilation', async () => {
  let hooks = 0; const h = harness({ open: ({ f }) => {
    const p = Promise.resolve(f.owner); Object.defineProperty(p, 'constructor', { get() { hooks++; throw Error('PRIVATE_CTOR'); } }); return p;
  } });
  await refused(h); assert.equal(hooks, 0); assert.equal(h.f.clears + h.f.closes, 0); await h.f.owner.close();
});

test('session construction refusal stops the actually returned wallet/client and channel once', async () => {
  const h = harness({ open: ({ f }) => Promise.resolve(F({ ...f.owner, handoffToService: undefined })) }); await refused(h);
  assert.equal(h.f.clears, 1); assert.equal(h.f.closes, 1); assert.equal(h.f.signs, 0);
});

test('previously prepared returned client is not adopted as a pristine funding session', async () => {
  const h = harness(); await h.f.owner.prepareOriginalFunding(h.f.base.input);
  const direct = F(() => Promise.resolve(h.f.owner)); await refused(h, h.open(direct));
  assert.equal(h.f.signs, 1); assert.equal(h.f.clears, 1); assert.equal(h.f.closes, 1);
  assert.equal(h.f.commits + h.f.submits + h.f.handoffs + h.f.services, 0);
});

test('channel closure during pending OPEN prevents session transfer and stops the returned client', async () => {
  const barrier = gate(), h = harness({ open: ({ f }) => barrier.promise.then(() => f.owner) });
  const opening = h.open(); opening.catch(() => {}); h.input.destroy(); await tick(); barrier.resolve();
  await refused(h, opening); assert.equal(h.f.closes, 1); assert.equal(h.f.clears, 1);
});

test('failed returned-client close cannot suppress input and output stop', async () => {
  const h = harness({ open: ({ f }) => { f.onClose = () => Promise.reject(Error('PRIVATE_CLIENT_CLOSE'));
    return Promise.resolve(F({ ...f.owner, handoffToService: undefined })); } });
  await refused(h); assert.equal(h.f.closes, 1); assert.equal(h.f.clears, 1); assert.equal(h.f.owner.inspect().held, true);
});

test('pending returned-client close is retained while the owned channel completes its stop', async () => {
  const h = harness({ open: ({ f }) => { f.onClose = () => new Promise(() => {});
    return Promise.resolve(F({ ...f.owner, handoffToService: undefined })); } });
  await refused(h); assert.equal(h.f.closes, 1); assert.equal(h.f.clears, 1); assert.equal(h.f.owner.inspect().clientClose, 'PENDING');
});

test('late output destroy completion cannot change the already rejected opening or repeat native close', async () => {
  const h = harness({ pendingOutputClose: true, open: ({ f }) => Promise.resolve(F({ ...f.owner, handoffToService: undefined })) });
  await assert.rejects(h.open()); assert.equal(h.f.closes, 1); assert.equal(h.f.clears, 1);
  assert.equal(h.input.closed, true); assert.equal(h.output.closed, false); assert.equal(h.outputStops, 1);
  h.finishOutput(); await tick(); assert.equal(h.output.closed, true); assert.equal(h.f.closes, 1);
});

test('synchronously throwing stop still requests the independent channel stop', async () => {
  let stops = 0; const h = harness({ open: ({ f }) => Promise.resolve(F({ ...f.owner, handoffToService: undefined,
    close: F(() => { stops++; throw Error('PRIVATE_STOP_THROW'); }) })) });
  await refused(h); assert.equal(stops, 1); assert.equal(h.f.clears, 0); await h.f.owner.close();
});

test('returned-client inspection accessor is not invoked and cannot suppress actual owner stops', async () => {
  let hooks = 0; const h = harness({ open: ({ f }) => Promise.resolve(F({ ...f.owner,
    get inspect() { hooks++; throw Error('PRIVATE_INSPECT'); } })) });
  await refused(h); assert.equal(hooks, 0); assert.equal(h.f.clears, 1); assert.equal(h.f.closes, 1);
});

test('inert configuration refusal leaves unacquired streams and native/key callbacks caller-owned', async () => {
  const h = harness(); let hooks = 0;
  await assert.rejects(OPEN({ input: h.input, output: h.output, limits: {}, get openClient() { hooks++; throw Error('PRIVATE_OPEN_GETTER'); } }));
  assert.equal(hooks, 0); assert.equal(h.opens, 0); assert.equal(h.input.destroyed || h.output.destroyed, false);
  assert.equal(h.f.clears + h.f.signs, 0); h.input.destroy(); h.output.destroy(); await h.f.owner.close();
});
