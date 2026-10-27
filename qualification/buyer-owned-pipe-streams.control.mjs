// Actual provided OS pipes plus the actual command channel/session/host.
// Native recovery callbacks remain declared; no package, SQL, key or IP I/O.
import assert from 'node:assert/strict';
import { closeSync, fstatSync } from 'node:fs';
import { createBuyerOwnedPipeStreams as PIPES } from '../src/buyer-owned-pipe-streams.js';
import { createBuyerCommandLineChannel as CHANNEL } from '../src/buyer-command-line-channel.js';
import { createBuyerOriginalRecoveryCommandSession as SESSION } from '../src/buyer-original-funding-command-session.js';
import { runBuyerOriginalCommandHost as HOST } from '../src/buyer-original-command-host.js';
import { recoveryFixture } from './buyer-original-recovery.fixture.mjs';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_BUYER_OWNED_PIPE_CONTROL, 'provided-posix-fifo-only');
assert.equal(process.argv.length, 5);
const [scenario, first, second] = process.argv.slice(2);
assert.ok(['CLEAN_CLOSE', 'ALIASED_PAIR_REFUSED', 'STANDARD_FD_REFUSED', 'OUTPUT_PEER_CLOSED'].includes(scenario));
assert.match(first, /^(0|[1-9][0-9]{0,3})$/); assert.match(second, /^(0|[1-9][0-9]{0,3})$/);
const inputFd = Number(first), outputFd = Number(second);
const identity = fd => {
  const s = fstatSync(fd, { bigint: true });
  return [s.dev, s.ino, s.uid, s.gid, s.mode].map(String);
};
const standardBefore = [0, 1, 2].map(identity);
const providedBefore = [inputFd, outputFd].map(identity);
let facts;

if (scenario === 'ALIASED_PAIR_REFUSED' || scenario === 'STANDARD_FD_REFUSED') {
  assert.throws(() => PIPES({ inputFd, outputFd }), { code: 'buyer_owned_pipe_streams_descriptor_rejected' });
  assert.deepEqual([inputFd, outputFd].map(identity), providedBefore);
  // These descriptors were never transferred; this control still owns them.
  if (inputFd >= 3) closeSync(inputFd);
  if (outputFd >= 3 && outputFd !== inputFd) closeSync(outputFd);
  facts = { refusalBeforeOwnership: true, providedDescriptorsPreservedUntilControlCleanup: true,
    nativeCloses: 0, businessOperations: 0 };
} else {
  // Inert descriptor/configuration refusals do not consume a valid pair.
  let hooks = 0;
  const accessor = { get inputFd() { hooks++; return inputFd; }, outputFd };
  assert.throws(() => PIPES(accessor));
  assert.throws(() => PIPES(new Proxy({ inputFd, outputFd }, { get() { hooks++; } })));
  assert.throws(() => PIPES({ inputFd, outputFd, extra: true }));
  assert.throws(() => PIPES({ inputFd, outputFd: inputFd }));
  assert.throws(() => PIPES({ inputFd: '3', outputFd }));
  assert.equal(hooks, 0);
  assert.deepEqual([inputFd, outputFd].map(identity), providedBefore);
  const streams = PIPES({ inputFd, outputFd });
  assert.equal(Object.isFrozen(streams), true);
  assert.throws(() => PIPES({ inputFd, outputFd }), { code: 'buyer_owned_pipe_streams_descriptor_rejected' });
  const f = recoveryFixture(), limits = { closeWaitMs: 250, maxCommands: 4 };
  const channel = CHANNEL({ ...streams, limits });
  const session = SESSION({ client: f.client, channel, limits });
  const run = HOST(session); assert.equal(HOST(session), run);
  const result = await run;
  assert.equal(result.authority, 'NONE'); assert.equal(result.serviceDelivery, 'NOT_ESTABLISHED');
  assert.equal(f.restores + f.services + f.stateReads, 0); assert.equal(f.closes, 1);
  assert.equal(HOST(session), run); assert.equal(await run, result);
  const originalStop = session.close(); assert.equal(session.close(), originalStop);
  if (scenario === 'CLEAN_CLOSE') {
    assert.equal(result.exitCode, 0); assert.equal(result.status, 'CLOSED');
    assert.equal(result.ownersClosedObserved, true); assert.equal(result.localWriteCallbackCompleted, true);
    assert.equal(await originalStop, undefined);
    assert.equal(channel.inspect().historicalClose, 'FULFILLED_UNDEFINED');
  } else {
    assert.equal(result.exitCode, 4); assert.equal(result.status, 'CLOSE_UNKNOWN');
    assert.equal(result.outputOutcomeUnknown, true); assert.equal(result.localWriteCallbackCompleted, false);
    assert.equal(result.retainedResult, true); assert.equal(session.inspect().held, true);
    await assert.rejects(originalStop);
    assert.equal(channel.inspect().historicalClose, 'REJECTED');
  }
  assert.equal(streams.input.closed && streams.input.destroyed, true);
  assert.equal(streams.output.closed && streams.output.destroyed, true);
  for (const fd of [inputFd, outputFd]) assert.throws(() => fstatSync(fd), { code: 'EBADF' });
  facts = { inputAndOutputFdClosed: true, actualStreamCloseObserved: true,
    hostStatus: result.status, hostExitCode: result.exitCode,
    outputOutcomeUnknown: result.outputOutcomeUnknown,
    localWriteCallbackCompleted: result.localWriteCallbackCompleted,
    originalStopReceiptPreserved: true, nativeCloses: f.closes, businessOperations: 0,
    noDuplicateDescriptorOwner: true, inertConfigurationHooks: hooks };
}
assert.deepEqual([0, 1, 2].map(identity), standardBefore);
const report = JSON.stringify({ scenario, passed: true, ...facts, standardDescriptorsPreserved: true,
  actualProvidedOsPipes: true, ipConnections: 0, nodeChildren: 0, packages: false,
  sql: false, cryptographicSignatures: false, nativeRecoveryCallbacks: 'DECLARED',
  authority: 'NONE', serviceDelivery: 'NOT_ESTABLISHED' }) + '\n';
assert.ok(Buffer.byteLength(report) < 4096);
// Control diagnostics use fd 1. Command results used the independent pipe.
await new Promise((resolve, reject) => process.stdout.write(report, e => e ? reject(e) : resolve()));
process.exitCode = 0;
