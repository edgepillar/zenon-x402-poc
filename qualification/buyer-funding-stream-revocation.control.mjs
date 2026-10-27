// Actual stream/session/wallet/lifecycle owners; native/key callbacks DECLARED.
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { openBuyerFundingOwnedStreamSession as OPEN } from '../src/buyer-funding-owned-stream-session.js';
import { runBuyerOriginalCommandHost as HOST } from '../src/buyer-original-command-host.js';
import { encodeBuyerOriginalFundingCommand as ENCODE } from '../src/buyer-original-funding-command.js';
import { sdk105FundingServiceFixture as fixture } from './sdk105-funding-service-lifecycle.fixture.mjs';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_FUNDING_STREAM_REVOCATION, 'declared-native-current-stream-state');
assert.equal(process.argv.length, 3);
const scenario = process.argv[2], F = Object.freeze, f = fixture(), input = new PassThrough();
const scenarios = ['INPUT_DESTROY_BEFORE_GUARD', 'OUTPUT_DESTROY_BEFORE_GUARD', 'OUTPUT_END_BEFORE_GUARD',
  'INPUT_DESTROY_BEFORE_RETURN', 'OUTPUT_DESTROY_BEFORE_RETURN', 'INPUT_DESTROY_DURING_INSPECT',
  'OUTPUT_END_DURING_INSPECT', 'CHANNEL_SETUP_OVERRUN', 'EVENT_DELIVERED_GUARD_REFUSES', 'SUCCESS'];
assert.ok(scenarios.includes(scenario));
const timers = () => process.getActiveResourcesInfo().filter(x => x === 'Timeout').length;
const initialTimers = timers(), tick = () => new Promise(r => setImmediate(r));
let outputStops = 0, writes = 0, openCalls = 0, acquisitions = 0, current = null;
const output = new Writable({ write(chunk, encoding, done) { writes++; done(); },
  destroy(error, done) { outputStops++; done(error); } });
if (scenario === 'CHANNEL_SETUP_OVERRUN') input.once('pause', () => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 70);
});
function revoke() {
  if (scenario.startsWith('INPUT_') || scenario === 'EVENT_DELIVERED_GUARD_REFUSES') input.destroy();
  else if (scenario.startsWith('OUTPUT_END')) output.end();
  else output.destroy();
}
const opener = F(async function declaredNative(requireCurrentOpening) {
  openCalls++; assert.equal(openCalls, 1); current = requireCurrentOpening;
  assert.ok(Object.isFrozen(current)); current();
  if (scenario.endsWith('BEFORE_GUARD') || scenario === 'EVENT_DELIVERED_GUARD_REFUSES') {
    await Promise.resolve(); revoke();
    if (scenario === 'EVENT_DELIVERED_GUARD_REFUSES') await tick();
    current();
  } else if (scenario.endsWith('BEFORE_RETURN')) { await Promise.resolve(); revoke(); }
  acquisitions++;
  if (scenario.endsWith('DURING_INSPECT')) {
    let once = false;
    return F({ ...f.owner, inspect: F(() => {
      if (!once) { once = true; revoke(); }
      return f.owner.inspect();
    }) });
  }
  return f.owner;
});
let session = null, errorCode = null, closeReceipt = null;
try { session = await OPEN({ input, output, limits: { closeWaitMs: 40 },
  openWaitMs: scenario === 'CHANNEL_SETUP_OVERRUN' ? 10 : 1000, openClient: opener }); }
catch (error) { errorCode = error.code; }
const transferred = session !== null;
if (scenario === 'SUCCESS') {
  input.end(ENCODE({ version: 1, id: 'inspect', operation: 'inspect', input: {} })
    + ENCODE({ version: 1, id: 'close', operation: 'close', input: {} }));
  const result = await HOST(session); assert.equal(result.status, 'CLOSED');
  closeReceipt = session.close(); assert.equal(session.close(), closeReceipt); await closeReceipt;
} else if (session !== null) {
  // Preserve baseline observations and stop the incorrectly transferred owner.
  // Cleanup success does not erase the unwanted acquisition/transfer.
  closeReceipt = session.close(); try { await closeReceipt; } catch {}
}
await tick(); await tick();
if (current !== null) assert.throws(() => current());
const expectedAcquisitions = scenario === 'SUCCESS' || scenario.endsWith('BEFORE_RETURN') || scenario.endsWith('DURING_INSPECT') ? 1 : 0;
const expectedOpens = scenario === 'CHANNEL_SETUP_OVERRUN' ? 0 : 1;
const passed = acquisitions === expectedAcquisitions && openCalls === expectedOpens
  && transferred === (scenario === 'SUCCESS')
  && (scenario === 'SUCCESS' ? errorCode === null : errorCode === 'buyer_funding_owned_stream_open_refused')
  && f.closes === expectedAcquisitions && f.clears === expectedAcquisitions;
assert.equal(f.prepares + f.signs + f.commits + f.submits + f.handoffs + f.services, 0);
assert.equal(input.closed, true); assert.equal(output.closed, true); assert.equal(outputStops, 1);
assert.equal(writes, scenario === 'SUCCESS' ? 1 : 0); assert.equal(timers(), initialTimers);
const observed = { scenario, passed, errorCode, transferred, openCalls, acquisitions, expectedAcquisitions,
  payerCloses: f.closes, declaredKeyClears: f.clears, outputStops, writes,
  originalCloseReceiptRetained: closeReceipt !== null, activeTimeoutsBefore: initialTimers,
  activeTimeoutsAfter: timers(), actualCommands: scenario === 'SUCCESS' ? 2 : 0,
  nativeAndKeyCallbacks: 'DECLARED', sdk: 0, SQLite: 0, sockets: 0, keysGenerated: 0,
  cryptographicSignatures: 0, nonce: 0, physicalRelease: 'NOT_QUALIFIED' };
process.stdout.write(JSON.stringify(observed) + '\n');
// An unreturned declared fixture remains caller-owned; only the fixture caller
// closes it after recording that the tested owner did not claim its key.
if (f.closes === 0) await f.owner.close();
assert.equal(passed, true);
