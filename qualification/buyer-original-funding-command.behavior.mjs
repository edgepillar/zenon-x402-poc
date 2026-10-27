// Actual Node memory streams, SDK105 key owner/lifecycle and original DATA code.
// Native client children and key callbacks are declared, with invalid signature
// bytes. No SDK/package evaluation, SQL, TLS, sockets, keys or nonce search.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { PassThrough, Readable, Writable } from 'node:stream';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  captureBuyerOriginalFundingCommandLimits as LIMITS,
  encodeBuyerOriginalFundingCommand as ENCODE, decodeBuyerOriginalFundingCommand as DECODE,
} from '../src/buyer-original-funding-command.js';
import { createBuyerCommandLineChannel as CHANNEL } from '../src/buyer-command-line-channel.js';
import { createBuyerOriginalFundingCommandSession as SESSION } from '../src/buyer-original-funding-command-session.js';
import { sdk105FundingServiceFixture as fixture } from './sdk105-funding-service-lifecycle.fixture.mjs';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_BUYER_COMMAND_CONTROL, 'builtin-memory-stream-originals');
const F = Object.freeze, copy = value => structuredClone(value);
const tick = () => new Promise(resolve => setImmediate(resolve));
function gate() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
  assert.fail('expected local callback was not observed');
}
function command(id, operation, input = {}) { return { version: 1, id, operation, input }; }
function serviceInput() {
  return { grantId: 'grant.sdk105.1', requestId: 'request.sdk105.1',
    originalRequestJson: '{"method":"GET","url":"https://service.example.test/paid"}',
    originalBodyBase64: '', serviceResourceUrl: 'https://service.example.test/paid',
    authorizationHeader: 'Bearer declared-capability-proof' };
}
function harness(mode = {}, options = {}) {
  const f = fixture(mode), chunks = [], replies = [];
  const input = options.input ?? new PassThrough();
  const output = options.output ?? new Writable({
    highWaterMark: options.highWaterMark ?? 16384,
    write(chunk, encoding, callback) {
      chunks.push(Buffer.from(chunk));
      let reply;
      try { reply = JSON.parse(String(chunk)); replies.push(reply); } catch {}
      if (options.onWrite) options.onWrite({ f, input, output, chunks, replies, reply }, callback);
      else callback();
    },
  });
  const limits = LIMITS(options.limits ?? { closeWaitMs: 200 });
  const channel = CHANNEL({ input, output, limits }), owner = SESSION({ client: f.owner, channel, limits });
  return { f, input, output, channel, owner, chunks, replies, limits,
    send(c) { input.write(ENCODE(c, limits.maxLineBytes)); } };
}
async function runRefused(h) {
  await assert.rejects(h.owner.run(), /buyer_original_funding_command_session_/);
  assert.equal(h.f.closes, 1);
  assert.equal(h.channel.inspect().inputStopRequested, true);
  assert.equal(h.channel.inspect().outputStopRequested, true);
  assert.equal(h.owner.inspect().held, true);
}

test('explicit commands preserve one original through prepare commit funding handoff and native service void', async () => {
  const h = harness({}, { onWrite({ f, input, reply }, done) {
    if (reply.operation === 'prepare') input.write(ENCODE(command('2', 'commit', { expectedPins: copy(f.packet.expectedPins) })));
    if (reply.operation === 'commit') input.write(ENCODE(command('3', 'submitFunding', { expectedPins: copy(f.packet.expectedPins) })));
    if (reply.operation === 'submitFunding') input.write(ENCODE(command('4', 'handoff', f.request())));
    if (reply.operation === 'handoff') input.write(ENCODE(command('5', 'submitService', serviceInput())));
    if (reply.operation === 'submitService') input.end(ENCODE(command('6', 'close')));
    done();
  } });
  h.send(command('1', 'prepare', h.f.base.input));
  const run = h.owner.run();
  assert.equal(h.owner.run(), run);
  assert.equal(await run, undefined);
  assert.deepEqual(h.replies.map(r => r.operation), ['prepare', 'commit', 'submitFunding', 'handoff', 'submitService']);
  assert.equal(h.replies[0].result.serializedCheckpoint, h.f.packet.serializedCheckpoint);
  assert.equal(h.replies[0].result.paymentRequiredHeader, h.f.base.input.challenge.paymentRequiredHeader);
  assert.equal(h.replies[0].result.independentPinsRequired, true);
  assert.equal(h.replies[1].result.phase, 'LOCAL_STORE_READBACK_MATCHED');
  assert.equal(h.replies[4].result.callbackCompleted, true);
  assert.equal(h.replies[4].result.serviceDelivery, 'NOT_ESTABLISHED');
  assert.equal(h.replies[4].outcome, 'CALLBACK_RETURNED');
  assert.deepEqual(h.f.commitInput.expectedPins, h.f.packet.expectedPins);
  assert.deepEqual(h.f.submitInput.expectedPins, h.f.packet.expectedPins);
  assert.equal(h.f.handoffInput.originalPayment.serializedCheckpoint, h.f.packet.serializedCheckpoint);
  assert.deepEqual(h.f.serviceInput, serviceInput());
  assert.deepEqual(h.f.trace, ['sign', 'clear', 'handoff', 'client-close']);
  assert.equal(h.f.signs, 1); assert.equal(h.f.clears, 1); assert.equal(h.f.services, 1);
  assert.equal(h.owner.inspect().lifecycle, 'CLOSED');
  assert.equal(h.channel.inspect().lifecycle, 'CLOSED');
});

test('prepare followed by EOF never manufactures commit submission handoff or independent pin approval', async () => {
  const h = harness();
  h.input.end(ENCODE(command('prepare-only', 'prepare', h.f.base.input)));
  await h.owner.run();
  assert.equal(h.f.signs, 1); assert.equal(h.f.prepares, 1);
  assert.equal(h.f.commits + h.f.submits + h.f.handoffs + h.f.services, 0);
  assert.equal(h.replies.length, 1);
  assert.equal(h.replies[0].result.persistence, 'NOT_PERFORMED');
  assert.equal(h.replies[0].result.serializedCheckpoint, h.f.packet.serializedCheckpoint);
  assert.equal(h.owner.retainedResult().line, h.chunks[0].toString());
});

test('missing independent commit pins are refused before the actual client commit entry', async () => {
  const h = harness({}, { onWrite({ input }, done) {
    input.end('{"id":"2","input":{},"operation":"commit","version":1}\n'); done();
  } });
  h.send(command('1', 'prepare', h.f.base.input)); await runRefused(h);
  assert.equal(h.f.commits + h.f.submits + h.f.handoffs, 0); assert.equal(h.f.signs, 1);
});

test('duplicate command ids cannot replay a returned preparation or enter commit', async () => {
  const h = harness({}, { onWrite({ f, input }, done) {
    input.end(ENCODE(command('same', 'commit', { expectedPins: copy(f.packet.expectedPins) }))); done();
  } });
  h.send(command('same', 'prepare', h.f.base.input)); await runRefused(h);
  assert.equal(h.f.prepares, 1); assert.equal(h.f.commits, 0); assert.equal(h.f.signs, 1);
});

test('changed handoff original bytes cannot pass the actual SDK105 retained-original gate', async () => {
  const h = harness({}, { onWrite({ f, input, reply }, done) {
    if (reply.operation === 'prepare') input.write(ENCODE(command('2', 'commit', { expectedPins: copy(f.packet.expectedPins) })));
    if (reply.operation === 'commit') input.write(ENCODE(command('3', 'submitFunding', { expectedPins: copy(f.packet.expectedPins) })));
    if (reply.operation === 'submitFunding') {
      const request = f.request(); request.originalPayment.serializedCheckpoint += ' ';
      input.end(ENCODE(command('4', 'handoff', request)));
    }
    done();
  } });
  h.send(command('1', 'prepare', h.f.base.input)); await runRefused(h);
  assert.equal(h.f.handoffs + h.f.services, 0); assert.equal(h.f.signs, 1); assert.equal(h.f.clears, 1);
});

test('service command before explicit handoff cannot dispatch through the actual lifecycle', async () => {
  const h = harness();
  h.input.end(ENCODE(command('early-service', 'submitService', serviceInput())));
  await runRefused(h); assert.equal(h.f.services + h.f.signs + h.f.handoffs, 0);
});

test('a manufactured service record never becomes a command delivery receipt', async () => {
  const h = harness({ serviceResult: F({ delivered: true }) }, { onWrite({ f, input, reply }, done) {
    if (reply.operation === 'prepare') input.write(ENCODE(command('2', 'commit', { expectedPins: copy(f.packet.expectedPins) })));
    if (reply.operation === 'commit') input.write(ENCODE(command('3', 'submitFunding', { expectedPins: copy(f.packet.expectedPins) })));
    if (reply.operation === 'submitFunding') input.write(ENCODE(command('4', 'handoff', f.request())));
    if (reply.operation === 'handoff') input.end(ENCODE(command('5', 'submitService', serviceInput())));
    done();
  } });
  h.send(command('1', 'prepare', h.f.base.input)); await runRefused(h);
  assert.equal(h.f.services, 1); assert.equal(h.f.signs, 1);
  assert.equal(h.replies.some(r => r.operation === 'submitService'), false);
});

test('unknown funding intake remains HELD after its local result is written without replay', async () => {
  const h = harness({ unbound: true }, { onWrite({ f, input, reply }, done) {
    if (reply.operation === 'prepare') input.write(ENCODE(command('2', 'commit', { expectedPins: copy(f.packet.expectedPins) })));
    if (reply.operation === 'commit') input.end(ENCODE(command('3', 'submitFunding', { expectedPins: copy(f.packet.expectedPins) })));
    done();
  } });
  h.send(command('1', 'prepare', h.f.base.input)); await runRefused(h);
  assert.equal(h.replies.at(-1).result.phase, 'SUBMISSION_OUTCOME_UNKNOWN');
  assert.equal(h.replies.at(-1).result.fundingIntakeStatus, 'UNKNOWN');
  assert.equal(h.owner.inspect().fundingOutcomeUnknown, true);
  assert.equal(h.owner.retainedResult().writeCallbackCompleted, true);
  assert.equal(h.f.submits, 1); assert.equal(h.f.handoffs + h.f.services, 0); assert.equal(h.f.signs, 1);
});

test('output failure retains exact original result DATA and stops both owners without another signing', async () => {
  const h = harness({}, { onWrite(context, done) { done(Error('PRIVATE_OUTPUT_DIAGNOSTIC')); } });
  h.send(command('one', 'prepare', h.f.base.input)); await runRefused(h);
  const retained = h.owner.retainedResult(), result = JSON.parse(retained.line);
  assert.equal(result.result.serializedCheckpoint, h.f.packet.serializedCheckpoint);
  assert.equal(retained.writeCallbackCompleted, false);
  assert.equal(retained.remoteReceipt, 'NOT_ESTABLISHED');
  assert.equal(h.owner.inspect().outputOutcomeUnknown, true);
  assert.equal(h.f.signs, 1); assert.equal(h.f.commits + h.f.submits + h.f.handoffs, 0);
  assert.equal(retained.line.includes('PRIVATE_OUTPUT_DIAGNOSTIC'), false);
});

test('input error after returned preparation closes the key and channel and retains uncertainty', async () => {
  const h = harness({}, { onWrite({ input }, done) {
    done(); setImmediate(() => input.destroy(Error('PRIVATE_INPUT_DIAGNOSTIC')));
  } });
  h.send(command('one', 'prepare', h.f.base.input)); await runRefused(h);
  assert.equal(h.owner.inspect().outputOutcomeUnknown, true);
  assert.equal(h.f.signs, 1); assert.equal(h.f.commits + h.f.submits, 0);
  assert.equal(h.owner.retainedResult().line.includes('PRIVATE_INPUT_DIAGNOSTIC'), false);
});

test('close during idle command read joins the original read and caches one clean close', async () => {
  const h = harness(), run = h.owner.run();
  await until(() => h.channel.inspect().reading);
  const close = h.owner.close();
  assert.equal(h.owner.close(), close);
  assert.equal(await close, undefined); assert.equal(await run, undefined);
  assert.equal(h.owner.run(), run); assert.equal(h.f.closes, 1); assert.equal(h.f.clears, 1);
  assert.equal(h.f.signs, 0); assert.equal(h.owner.inspect().executionDone, true);
});

test('close while preparation is pending joins its actual operation and refuses late result escape', async () => {
  const h = harness(); h.f.prepareGate = gate();
  h.send(command('one', 'prepare', h.f.base.input));
  const run = h.owner.run(), refused = assert.rejects(run);
  await until(() => h.f.packet !== undefined);
  const close = h.owner.close(), closeRefused = assert.rejects(close);
  await tick(); assert.equal(h.f.closes, 1); assert.equal(h.f.clears, 1);
  h.f.prepareGate.resolve();
  await refused; await closeRefused;
  assert.equal(h.replies.length, 0); assert.equal(h.f.signs, 1);
  assert.equal(h.owner.inspect().held, true); assert.equal(h.owner.close(), close);
});

test('stream close events alone cannot erase a pending real write callback', async () => {
  let release;
  const h = harness({}, { highWaterMark: 1, onWrite(context, done) { release = done; } });
  h.send(command('one', 'prepare', h.f.base.input));
  const run = h.owner.run(), refused = assert.rejects(run);
  await until(() => typeof release === 'function');
  const close = h.owner.close(), closeRefused = assert.rejects(close);
  await tick();
  assert.equal(h.channel.inspect().writeCallbackPending, true);
  assert.notEqual(h.channel.inspect().lifecycle, 'CLOSED');
  release();
  await refused; await closeRefused;
  assert.equal(h.channel.inspect().writeCallbackPending, false);
  assert.equal(h.owner.inspect().outputOutcomeUnknown, true); assert.equal(h.f.signs, 1);
});

test('one whole close deadline is sticky after a late write callback completes', async () => {
  let release;
  const h = harness({}, { limits: { closeWaitMs: 20 }, onWrite(context, done) { release = done; } });
  h.send(command('one', 'prepare', h.f.base.input));
  const run = h.owner.run(), refused = assert.rejects(run);
  await until(() => typeof release === 'function');
  const close = h.owner.close(); await assert.rejects(close); await refused;
  assert.equal(h.f.closes, 1); assert.equal(h.f.clears, 1);
  release(); await tick();
  assert.equal(h.owner.close(), close); await assert.rejects(close);
  assert.equal(h.owner.inspect().lifecycle, 'HELD');
  assert.equal(h.owner.inspect().historicalClose, 'REJECTED');
  assert.equal(h.f.signs, 1); assert.equal(h.f.commits + h.f.submits, 0);
});

test('a stream that never emits close cannot become a clean owner receipt', async () => {
  const input = new Readable({ emitClose: false, read() {} });
  const h = harness({}, { input, limits: { closeWaitMs: 20 } });
  const run = h.owner.run(), refused = assert.rejects(run);
  await until(() => h.channel.inspect().reading);
  const close = h.owner.close(); await assert.rejects(close); await refused;
  assert.equal(h.f.closes, 1); assert.equal(h.output.destroyed, true);
  assert.equal(h.owner.inspect().channelClose, 'PENDING');
  assert.equal(h.owner.inspect().held, true);
});

test('synchronous input destroy failure cannot suppress output destroy or key close', async () => {
  const input = new Readable({ read() {}, destroy() { throw Error('PRIVATE_DESTROY'); } });
  const h = harness({}, { input, limits: { closeWaitMs: 20 } });
  const close = h.owner.close(); await assert.rejects(close);
  assert.equal(h.output.destroyed, true); assert.equal(h.f.closes, 1); assert.equal(h.f.clears, 1);
  assert.equal(h.channel.inspect().outputStopRequested, true);
  assert.equal(h.owner.inspect().lifecycle, 'HELD');
});

test('invalid UTF8 is refused before any payment operation', async () => {
  const h = harness({}, { limits: { closeWaitMs: 20 } });
  h.input.end(Buffer.from([0xc3, 0x28, 0x0a])); await runRefused(h);
  assert.equal(h.f.prepares + h.f.commits + h.f.submits + h.f.signs, 0);
});

test('oversized line and truncated EOF cannot enter the actual client', async () => {
  for (const text of ['x'.repeat(513) + '\n', '{"unfinished":']) {
    const h = harness({}, { limits: { maxLineBytes: 512, maxInputBytes: 1024, maxOutputBytes: 1024, closeWaitMs: 20 } });
    h.input.end(text); await runRefused(h);
    assert.equal(h.f.prepares + h.f.signs, 0);
  }
});

test('split UTF8 and multiple buffered lines retain exact bytes with one read at a time', async () => {
  const input = new PassThrough(), output = new Writable({ write(chunk, enc, done) { done(); } });
  const channel = CHANNEL({ input, output, limits: {} });
  const line = 'alpha-\u{1f4a1}-omega', bytes = Buffer.from(line + '\nsecond\n');
  const first = channel.readCommand();
  input.write(bytes.subarray(0, 8)); input.end(bytes.subarray(8));
  assert.equal(await first, line);
  assert.equal(await channel.readCommand(), 'second');
  assert.equal(await channel.readCommand(), null);
  await channel.close(); assert.equal(channel.inspect().lifecycle, 'CLOSED');
});

test('real writable backpressure prevents admission of the next buffered command', async () => {
  let release;
  const h = harness({}, { highWaterMark: 1, onWrite(context, done) {
    if (context.replies.length === 1) release = done; else done();
  } });
  h.input.end(ENCODE(command('one', 'inspect')) + ENCODE(command('two', 'inspect')) + ENCODE(command('end', 'close')));
  const run = h.owner.run();
  await until(() => typeof release === 'function');
  await tick(); assert.equal(h.owner.inspect().commands, 1); assert.equal(h.replies.length, 1);
  release(); await run;
  assert.equal(h.replies.length, 2); assert.equal(h.f.signs + h.f.prepares, 0);
  assert.equal(h.owner.inspect().commands, 3);
});

test('post-close stream view drift cannot rewrite the returned close receipt', async () => {
  const h = harness(); h.input.end(ENCODE(command('end', 'close')));
  await h.owner.run(); const close = h.owner.close(); await close;
  Object.defineProperty(h.output, 'closed', { value: false });
  assert.equal(h.owner.inspect().lifecycle, 'HELD');
  assert.equal(h.owner.inspect().historicalClose, 'FULFILLED_UNDEFINED');
  assert.equal(h.owner.close(), close); await close;
  assert.equal(h.f.closes, 1); assert.equal(h.f.clears, 1);
});

test('canonical codec rejects duplicate keys accessors proxies and malformed service inputs without hooks', () => {
  let hooks = 0;
  const accessor = { version: 1, id: 'one', operation: 'prepare', input: {} };
  Object.defineProperty(accessor, 'input', { enumerable: true, get() { hooks++; throw Error('PRIVATE_GETTER'); } });
  assert.throws(() => ENCODE(accessor));
  assert.throws(() => ENCODE(new Proxy({}, { get() { hooks++; } })));
  assert.throws(() => DECODE('{"id":"one","id":"two","input":{},"operation":"inspect","version":1}'));
  assert.throws(() => ENCODE(command('one', 'submitService', { proof: 'wrong-contract' })));
  assert.throws(() => ENCODE(command('one', 'prepare', { text: '\ud800' })));
  assert.equal(hooks, 0);
  const encoded = ENCODE(command('valid', 'prepare', JSON.parse('{"__proto__":{"marker":true},"text":"kept"}')));
  const decoded = DECODE(encoded.slice(0, -1));
  assert.equal(Object.getPrototypeOf(decoded.input), Object.prototype);
  assert.equal(Object.hasOwn(decoded.input, '__proto__'), true);
  assert.equal(Object.prototype.marker, undefined);
});

test('closed limits and native capability descriptors refuse configuration hooks before ownership', async () => {
  assert.throws(() => LIMITS({ unknown: 1 }));
  assert.throws(() => LIMITS({ closeWaitMs: 1001 }));
  let hooks = 0; const h = harness();
  const bad = F({ ...h.f.owner, get close() { hooks++; throw Error('PRIVATE_CAPABILITY'); } });
  assert.throws(() => SESSION({ client: bad, channel: h.channel, limits: {} }));
  assert.equal(hooks, 0); assert.equal(h.f.closes + h.f.clears, 0);
  await h.owner.close();
  assert.equal(h.f.closes, 1); assert.equal(h.f.clears, 1);
});

test('command budget permits EOF at its boundary and rejects an additional action before dispatch', async () => {
  const one = harness({}, { limits: { maxCommands: 1 } });
  one.input.end(ENCODE(command('one', 'inspect'))); await one.owner.run();
  assert.equal(one.owner.inspect().commands, 1);
  const two = harness({}, { limits: { maxCommands: 1 } });
  two.input.end(ENCODE(command('one', 'inspect')) + ENCODE(command('two', 'prepare', two.f.base.input)));
  await runRefused(two); assert.equal(two.f.prepares + two.f.signs, 0);
});

test('actual AsyncLocalStorage promise symbols preserve the command and close lifecycle', async () => {
  const storage = new AsyncLocalStorage(), h = harness();
  h.input.end(ENCODE(command('view', 'inspect')) + ENCODE(command('end', 'close')));
  try {
    await storage.run(F({ label: 'public-trace-fixture' }), () => h.owner.run());
    assert.equal(h.owner.inspect().lifecycle, 'CLOSED');
    assert.equal(h.replies[0].result.client.phase, 'FUNDING');
    assert.equal(h.f.closes, 1); assert.equal(h.f.clears, 1);
  } finally { storage.disable(); }
});

test('exclusive stream reservation rejects a second owner without altering the first channel', async () => {
  const h = harness(), spareInput = new PassThrough(), spareOutput = new Writable({ write(c, e, done) { done(); } });
  try {
    assert.throws(() => CHANNEL({ input: h.input, output: spareOutput, limits: {} }));
    assert.throws(() => CHANNEL({ input: spareInput, output: h.output, limits: {} }));
    assert.equal(h.input.destroyed, false); assert.equal(h.output.destroyed, false);
    h.input.end(ENCODE(command('view', 'inspect')) + ENCODE(command('end', 'close')));
    await h.owner.run();
    assert.equal(h.replies.length, 1); assert.equal(h.f.signs, 0);
    assert.equal(h.f.closes, 1); assert.equal(h.f.clears, 1);
  } finally { spareInput.destroy(); spareOutput.destroy(); }
});

test('partial listener setup failure privately retains ownership and requests both actual stream stops', async () => {
  const input = new PassThrough(), output = new Writable({ write(c, e, done) { done(); } });
  input.on('pause', () => {
    input.on('newListener', name => { if (name === 'data') throw Error('PRIVATE_LISTENER_SETUP'); });
  });
  assert.throws(() => CHANNEL({ input, output, limits: {} }), /acquisition_unknown/);
  await tick();
  assert.equal(input.destroyed, true); assert.equal(output.destroyed, true);
  assert.throws(() => CHANNEL({ input, output, limits: {} }), /configuration_rejected/);
});
