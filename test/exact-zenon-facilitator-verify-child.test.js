import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

const MODULE_URL = new URL('../src/zenon/exact-zenon-facilitator-verify-child.js', import.meta.url);
const listenersBeforeImport = { message: process.listenerCount('message'),
  disconnect: process.listenerCount('disconnect') };
const imported = import(MODULE_URL.href);
const RESPONSES = Object.freeze({
  VERIFIED: '{"ipcVersion":1,"requestId":1,"type":"VERIFY_RESULT","ok":true}',
  INVALID_REQUEST: '{"ipcVersion":1,"requestId":1,"type":"VERIFY_RESULT","ok":false,"code":"INVALID_REQUEST"}',
  DUPLICATE_REQUEST: '{"ipcVersion":1,"requestId":1,"type":"VERIFY_RESULT","ok":false,"code":"DUPLICATE_REQUEST"}',
  VERIFY_REJECTED: '{"ipcVersion":1,"requestId":1,"type":"VERIFY_RESULT","ok":false,"code":"VERIFY_REJECTED"}',
  INVALID_RESULT: '{"ipcVersion":1,"requestId":1,"type":"VERIFY_RESULT","ok":false,"code":"INVALID_RESULT"}',
  PAYER_MISMATCH: '{"ipcVersion":1,"requestId":1,"type":"VERIFY_RESULT","ok":false,"code":"PAYER_MISMATCH"}',
  DEADLINE_EXCEEDED: '{"ipcVersion":1,"requestId":1,"type":"VERIFY_RESULT","ok":false,"code":"DEADLINE_EXCEEDED"}',
});
function request(overrides = {}) {
  return JSON.stringify({
    ipcVersion: 1, requestId: 1, type: 'VERIFY',
    paymentPayload: { proof: 'synthetic' }, requirements: { network: 'synthetic' },
    paymentRequired: { version: 2 }, expectedPayer: 'payer.expected', ...overrides,
  });
}
function makeChannel(sendImplementation) {
  const channel = new EventEmitter();
  channel.sent = [];
  channel.send = sendImplementation ?? ((frame, callback) => {
    channel.sent.push(frame); callback(); return true;
  });
  return channel;
}
function deferred() {
  let resolve; const promise = new Promise(release => { resolve = release; });
  return { promise, resolve };
}
async function start(channel, facilitator, timeoutMs = 200) {
  const module = await imported;
  return { done: module.runExactZenonFacilitatorVerifyChild(channel, facilitator, timeoutMs) };
}
function assertClean(channel) {
  assert.deepEqual([channel.listenerCount('message'), channel.listenerCount('disconnect')], [0, 0]);
}
const isDependencyError = error =>
  error?.code === 'EXACT_ZENON_VERIFY_CHILD_INVALID_DEPENDENCY' &&
  error?.stack === 'ExactZenonVerifyChildError: EXACT_ZENON_VERIFY_CHILD_INVALID_DEPENDENCY';
test('module import is inert and exposes only the explicit runner', async () => {
  const module = await imported;
  assert.deepEqual(Object.keys(module), ['runExactZenonFacilitatorVerifyChild']);
  assert.deepEqual([process.listenerCount('message'), process.listenerCount('disconnect')],
    [listenersBeforeImport.message, listenersBeforeImport.disconnect]);
});
test('valid request calls verify once, emits the fixed response, and cannot be reused', async () => {
  const channel = makeChannel(), calls = [];
  const facilitator = {
    async verify(...args) { calls.push(args); return { isValid: true, payer: 'payer.expected' }; },
  };
  const { done } = await start(channel, facilitator);
  channel.emit('message', request());
  assert.equal(await done, 'VERIFIED');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [{ proof: 'synthetic' }, { network: 'synthetic' }, { version: 2 }]);
  assert.deepEqual(channel.sent, [RESPONSES.VERIFIED]);
  assertClean(channel);
  channel.emit('message', request());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.deepEqual(channel.sent, [RESPONSES.VERIFIED]);
});
test('a channel is reserved before handling and remains one-shot after completion', async () => {
  const module = await imported, channel = makeChannel();
  let firstCalls = 0, secondCalls = 0;
  const done = module.runExactZenonFacilitatorVerifyChild(channel, {
    async verify() { firstCalls += 1; return { isValid: true, payer: 'payer.expected' }; },
  });
  const second = { verify() { secondCalls += 1; } };
  assert.throws(() => module.runExactZenonFacilitatorVerifyChild(channel, second), isDependencyError);
  assert.deepEqual([channel.listenerCount('message'), channel.listenerCount('disconnect')], [1, 1]);
  channel.emit('message', request());
  assert.equal(await done, 'VERIFIED');
  assert.throws(() => module.runExactZenonFacilitatorVerifyChild(channel, second), isDependencyError);
  channel.emit('message', request());
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([firstCalls, secondCalls], [1, 0]);
  assertClean(channel);
});
test('non-string, oversized, malformed, and out-of-order frames fail closed', async t => {
  const cases = [
    ['non-string', { request: true }],
    ['oversized', 'x'.repeat(70_000)],
    ['malformed', '{'],
    ['out-of-order', request({ requestId: 2 })],
    ['extra top-level key', request({ extra: true })],
  ];
  for (const [name, frame] of cases) {
    await t.test(name, async () => {
      const channel = makeChannel();
      let calls = 0;
      const { done } = await start(channel, { verify() { calls += 1; } });
      channel.emit('message', frame);
      assert.equal(await done, 'INVALID_REQUEST');
      assert.equal(calls, 0);
      assert.deepEqual(channel.sent, [RESPONSES.INVALID_REQUEST]);
      assertClean(channel);
    });
  }
});
test('a duplicate while verify is pending latches failure and ignores late completion', async () => {
  const gate = deferred(), channel = makeChannel();
  let calls = 0;
  const { done } = await start(channel, {
    verify() { calls += 1; return gate.promise; },
  });
  channel.emit('message', request());
  channel.emit('message', request());
  assert.equal(await done, 'DUPLICATE_REQUEST');
  assert.equal(calls, 1);
  assert.deepEqual(channel.sent, [RESPONSES.DUPLICATE_REQUEST]);
  gate.resolve({ isValid: true, payer: 'payer.expected' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(channel.sent, [RESPONSES.DUPLICATE_REQUEST]);
  assertClean(channel);
});
test('payer mismatch, rejection, and malformed facilitator results use fixed failures', async t => {
  const cases = [
    ['payer mismatch', { isValid: true, payer: 'payer.other' }, 'PAYER_MISMATCH'],
    ['rejected', { isValid: false, invalidReason: 'private' }, 'VERIFY_REJECTED'],
    ['malformed result', null, 'INVALID_RESULT'],
  ];
  for (const [name, result, code] of cases) {
    await t.test(name, async () => {
      const channel = makeChannel();
      const { done } = await start(channel, { async verify() { return result; } });
      channel.emit('message', request());
      assert.equal(await done, code);
      assert.deepEqual(channel.sent, [RESPONSES[code]]);
      assertClean(channel);
    });
  }
});
test('deadline latches terminal state before a late verify completion', async () => {
  const gate = deferred(), channel = makeChannel();
  let calls = 0;
  const { done } = await start(channel, {
    verify() { calls += 1; return gate.promise; },
  }, 10);
  channel.emit('message', request());
  assert.equal(await done, 'DEADLINE_EXCEEDED');
  assert.deepEqual(channel.sent, [RESPONSES.DEADLINE_EXCEEDED]);
  gate.resolve({ isValid: true, payer: 'payer.expected' });
  await new Promise(resolve => setImmediate(resolve));
  channel.emit('message', request());
  assert.equal(calls, 1);
  assert.deepEqual(channel.sent, [RESPONSES.DEADLINE_EXCEEDED]);
  assertClean(channel);
});
test('disconnect latches terminal state before a late verify completion', async () => {
  const gate = deferred(), channel = makeChannel();
  let calls = 0;
  const { done } = await start(channel, {
    verify() { calls += 1; return gate.promise; },
  });
  channel.emit('message', request());
  channel.emit('disconnect');
  assert.equal(await done, 'DISCONNECTED');
  assert.deepEqual(channel.sent, []);
  gate.resolve({ isValid: true, payer: 'payer.expected' });
  await new Promise(resolve => setImmediate(resolve));
  channel.emit('message', request());
  assert.equal(calls, 1);
  assert.deepEqual(channel.sent, []);
  assertClean(channel);
});
test('send failure wins over a synchronous successful callback', async t => {
  for (const mode of ['callback-error', 'false-return', 'throw-after-callback']) await t.test(mode, async () => {
    const channel = makeChannel((frame, callback) => {
      channel.sent.push(frame);
      callback(mode === 'callback-error' ? new Error('private') : undefined);
      if (mode === 'throw-after-callback') throw new Error('private');
      return mode !== 'false-return';
    });
    let calls = 0;
    const { done } = await start(channel, {
      async verify() { calls += 1; return { isValid: true, payer: 'payer.expected' }; },
    });
    channel.emit('message', request());
    assert.equal(await done, 'SEND_FAILED');
    channel.emit('message', request());
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    assert.deepEqual(channel.sent, [RESPONSES.VERIFIED]);
    assertClean(channel);
  });
});
test('partial registration failure removes every installed listener', async () => {
  const module = await imported;
  for (const failedEvent of ['message', 'disconnect']) {
    const channel = makeChannel();
    channel.on = function on(event, listener) {
      EventEmitter.prototype.on.call(this, event, listener);
      if (event === failedEvent) throw new Error('private');
      return this;
    };
    assert.throws(() => module.runExactZenonFacilitatorVerifyChild(channel, { verify() {} }), isDependencyError);
    assertClean(channel);
    assert.throws(() => module.runExactZenonFacilitatorVerifyChild(channel, { verify() {} }), isDependencyError);
  }
});
test('synchronous registration emission leaves no listeners or timers', async () => {
  const module = await imported, channel = makeChannel();
  channel.on = function on(event, listener) {
    EventEmitter.prototype.on.call(this, event, listener);
    if (event === 'message') this.emit('message', '{');
    return this;
  };
  const originalSetTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout;
  const activeTimers = new Set();
  globalThis.setTimeout = (...args) => {
    const timer = originalSetTimeout(...args); activeTimers.add(timer); return timer;
  };
  globalThis.clearTimeout = timer => { activeTimers.delete(timer); return originalClearTimeout(timer); };
  let done;
  try { done = module.runExactZenonFacilitatorVerifyChild(channel, { verify() {} }); }
  finally { globalThis.setTimeout = originalSetTimeout; globalThis.clearTimeout = originalClearTimeout; }
  assert.equal(await done, 'INVALID_REQUEST');
  assert.equal(activeTimers.size, 0);
  assert.deepEqual(channel.sent, [RESPONSES.INVALID_REQUEST]);
  assertClean(channel);
});
test('accessor and proxy channel methods are rejected without invocation', async () => {
  const module = await imported;
  const facilitator = { verify() {} }, accessorChannel = new EventEmitter();
  let getterCalls = 0;
  Object.defineProperty(accessorChannel, 'send', {
    get() { getterCalls += 1; throw new Error('private'); },
  });
  assert.throws(() => module.runExactZenonFacilitatorVerifyChild(accessorChannel, facilitator), isDependencyError);
  assert.equal(getterCalls, 0);

  let trapCalls = 0;
  const proxyChannel = new Proxy({}, {
    get() { trapCalls += 1; throw new Error('private'); },
  });
  assert.throws(() => module.runExactZenonFacilitatorVerifyChild(proxyChannel, facilitator), isDependencyError);
  assert.equal(trapCalls, 0);
});
