// Actual existing V6 backend recovery core plus buyer connector/commands and
// Node streams. Native payer and backend reader callbacks remain declared.
// No SDK/x402 package, SQLite, socket, signature, key or nonce execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { PassThrough, Writable } from 'node:stream';
import { recoveryFixture, F, freeze, copy } from './buyer-original-recovery.fixture.mjs';
import { createBuyerOriginalBackendRecoveryClient as CLIENT } from '../src/buyer-original-recovery-client.js';
import { captureOriginalServiceRequestCustody as CUSTODY } from '../src/service-credit-original-request-custody-contract.js';
import { encodeBuyerOriginalBackendRecoveryCommand as ENCODE, decodeBuyerOriginalBackendRecoveryCommand as DECODE,
  encodeBuyerOriginalRecoveryCommand as LOCAL, encodeBuyerOriginalFundingCommand as FUNDING } from '../src/buyer-original-funding-command.js';
import { createBuyerCommandLineChannel as CHANNEL } from '../src/buyer-command-line-channel.js';
import { createBuyerOriginalBackendRecoveryCommandSession as SESSION } from '../src/buyer-original-funding-command-session.js';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_BUYER_BACKEND_RECOVERY, 'builtin-existing-core-exact-original');
const fixture = () => recoveryFixture({ backendRecovery: true });
const command = (id, operation, input = {}) => ({ version: 1, id, operation, input });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
  assert.fail('expected local callback was not observed');
}
async function heldClose(f) { await assert.rejects(f.client.close()); assert.equal(f.client.inspect().held, true); }
function noAuthority(v) {
  assert.equal(v.authority, 'NONE'); assert.equal(v.currentAuthority, 'NOT_ESTABLISHED');
  assert.equal(v.serviceDelivery, 'NOT_ESTABLISHED'); assert.equal(v.reconciliationRequired, true);
  for (const key of ['mayStartPayment', 'maySignPayment', 'mayDispatchService', 'deliveryConfirmed']) assert.equal(v[key], false);
  const text = JSON.stringify(v);
  for (const key of ['authorizationHeader', 'ServiceCredit ', 'originalRequestJson', 'originalBodyBase64',
    'paymentSignatureHeader', 'serializedCheckpoint', 'cachedResult', 'declared-cached-result']) assert.equal(text.includes(key), false);
}
function harness(options = {}) {
  const f = fixture(), input = new PassThrough(), replies = [], chunks = [];
  const output = new Writable({ highWaterMark: options.highWaterMark ?? 16384,
    write(chunk, encoding, done) {
      chunks.push(Buffer.from(chunk)); replies.push(JSON.parse(String(chunk)));
      if (options.onWrite) options.onWrite({ f, input, replies }, done); else done();
    } });
  const limits = { closeWaitMs: options.closeWaitMs ?? 40 };
  const channel = CHANNEL({ input, output, limits }), owner = SESSION({ client: f.client, channel, limits });
  return { f, input, output, replies, chunks, channel, owner };
}

test('backend recovery construction captures real capability contracts with zero queries or signer acquisition', async () => {
  const f = fixture(); assert.equal(f.backendReads + f.stateReads + f.checkpointReads + f.restores + f.services, 0);
  assert.equal(f.client.inspect().backendRecoveryAvailable, true); assert.equal(f.client.inspect().signerCalls, 0);
  let hooks = 0; const bad = F({ ...f.backend, get close() { hooks++; throw Error('PRIVATE_GETTER'); } });
  assert.throws(() => CLIENT({ client: f.native, selection: f.selection, backend: bad })); assert.equal(hooks, 0);
  assert.throws(() => LOCAL(command('one', 'reconcileOriginal', f.backendInput())));
  assert.throws(() => FUNDING(command('one', 'reconcileOriginal', f.backendInput())));
  assert.throws(() => DECODE('{"id":"one","id":"two","input":{},"operation":"inspect","version":1}'));
  await f.client.close(); assert.equal(f.backendCloses, 1); assert.equal(f.closes, 1);
});

test('combined reconciliation executes the real shared core with two checkpoint reads two custody reads and one exact proof query', async () => {
  const f = fixture(), result = await f.client.readOriginalBackendRecoveryState(f.backendInput());
  noAuthority(result); assert.equal(result.status, 'CACHED_SUCCESS'); assert.equal(result.backendStatus, 'CACHED_SUCCESS');
  assert.equal(result.localReconciliationRequired, false); assert.equal(result.originalCheckpointPinsMatched, true);
  assert.equal(result.sameProcessObservationOnly, true);
  assert.equal(f.checkpointReads, 2); assert.equal(f.stateReads, 2); assert.equal(f.backendReads, 1);
  assert.equal(f.restores + f.services, 0); assert.equal(f.client.inspect().uncertaintyLatched, true);
  assert.equal(Object.isFrozen(f.backendEnvelope.rawHeaders), true); await f.client.close();
});

test('missing local originals stop before backend lookup and never manufacture a replacement request', async () => {
  const f = fixture(); f.state = null;
  const result = await f.client.readOriginalBackendRecoveryState(f.backendInput()); noAuthority(result);
  assert.equal(result.status, 'CLIENT_ORIGINAL_NOT_RECORDED'); assert.equal(result.backendStatus, null);
  assert.equal(f.checkpointReads, 1); assert.equal(f.stateReads, 1); assert.equal(f.backendReads, 0); await f.client.close();
});

test('foreign selected-grant keys are refused before any checkpoint custody or backend callback', async () => {
  const f = fixture(), input = f.backendInput(); input.key.grantId = 'grant.foreign';
  await assert.rejects(f.client.readOriginalBackendRecoveryState(input));
  assert.equal(f.checkpointReads + f.stateReads + f.backendReads, 0); await f.client.close();
});

test('changed fresh pins and malformed proof values cannot enter combined recovery', async () => {
  const f = fixture(), changed = f.backendInput(); changed.expectedPins.binding.contextId += '.changed';
  await assert.rejects(f.client.readOriginalBackendRecoveryState(changed));
  for (const authorizationHeader of ['', 'Bearer wrong', 'ServiceCredit ', 'ServiceCredit x\n', 'ServiceCredit ' + 'x'.repeat(1024), null])
    await assert.rejects(f.client.readOriginalBackendRecoveryState({ ...f.backendInput(), authorizationHeader }));
  assert.equal(f.checkpointReads + f.stateReads + f.backendReads, 0); await f.client.close();
});

test('a changed checkpoint before reconciliation prevents every backend query', async () => {
  const f = fixture(); f.onCheckpoint = () => ({ ...f.checkpoint, checksum: 'changed' });
  await assert.rejects(f.client.readOriginalBackendRecoveryState(f.backendInput()));
  assert.equal(f.checkpointReads, 1); assert.equal(f.stateReads + f.backendReads, 0); await heldClose(f);
});

test('a checkpoint changed after the backend assertion cannot escape or be retried', async () => {
  const f = fixture(); f.onCheckpoint = n => n === 1 ? f.checkpoint : { ...f.checkpoint, checksum: 'changed' };
  await assert.rejects(f.client.readOriginalBackendRecoveryState(f.backendInput()));
  await assert.rejects(f.client.readOriginalBackendRecoveryState(f.backendInput()));
  assert.equal(f.backendReads, 1); assert.equal(f.client.inspect().lastBackendRecovery, null); await heldClose(f);
});

test('funding revision changes across the real backend core query remain unavailable', async () => {
  const f = fixture(); f.onBackend = () => { f.change({ funding: { ...f.state.funding, revision: 2 } }); return f.backendReply; };
  await assert.rejects(f.client.readOriginalBackendRecoveryState(f.backendInput()));
  assert.equal(f.stateReads, 2); assert.equal(f.backendReads, 1); await heldClose(f);
});

test('a different valid stored request after backend observation fails the exact-original reread', async () => {
  const f = fixture(); f.onBackend = () => {
    const original = CUSTODY({ originalRequestJson: f.original.originalRequestJson.replace('"maxCostUnits":1', '"maxCostUnits":2'),
      originalBodyBase64: '', serviceResourceUrl: f.original.serviceResourceUrl },
      { fundingResourceUrl: f.original.fundingResourceUrl, paymentHash: f.original.paymentHash, network: f.original.network });
    f.change({ original }); return f.backendReply;
  };
  await assert.rejects(f.client.readOriginalBackendRecoveryState(f.backendInput()));
  assert.equal(f.backendReads, 1); await heldClose(f);
});

test('uncertainty intent or response changes during backend lookup cannot pass the complete reread fence', async () => {
  for (const kind of ['uncertainty', 'intent', 'response']) {
    const f = fixture(); f.onBackend = () => {
      if (kind === 'uncertainty') f.change({ uncertainty: { ...f.state.uncertainty, undrained: true } });
      if (kind === 'intent') f.change({ dispatchIntent: f.intent() });
      if (kind === 'response') f.change({ responseObservation: { httpStatus: 200 }, responseStatus: 'LOCAL_DECLARED_SUCCESS_RESPONSE_OBSERVED' });
      return f.backendReply;
    };
    await assert.rejects(f.client.readOriginalBackendRecoveryState(f.backendInput())); await heldClose(f);
  }
});

test('a retained dispatch intent keeps cached backend success under reconciliation with no service replay', async () => {
  const f = fixture(); await f.client.restoreOriginalPayment(f.restoreInput()); f.change({ dispatchIntent: f.intent() });
  const result = await f.client.readOriginalBackendRecoveryState(f.backendInput()); noAuthority(result);
  assert.equal(result.status, 'CLIENT_RECONCILIATION_REQUIRED'); assert.equal(result.backendStatus, 'CACHED_SUCCESS');
  assert.equal(result.localReconciliationRequired, true);
  await assert.rejects(f.client.submitOriginal(f.service())); assert.equal(f.services, 0); await f.client.close();
});

test('backend success cannot heal each local funding or custody uncertainty and later clean data', async () => {
  for (const part of ['funding', 'custody', 'submission', 'undrained', 'declaredFundingAmbiguitySeen']) {
    const f = fixture(), saved = f.state;
    if (part === 'funding') f.change({ funding: { ...f.state.funding, ambiguityLatched: true } });
    else f.change({ uncertainty: { ...f.state.uncertainty, [part]: true } });
    const result = await f.client.readOriginalBackendRecoveryState(f.backendInput()); noAuthority(result);
    assert.equal(result.localReconciliationRequired, true); f.state = saved;
    assert.equal((await f.client.readOriginalBackendRecoveryState(f.backendInput())).localReconciliationRequired, true);
    assert.equal(f.services, 0); await f.client.close();
  }
});

test('every real backend outcome stays powerless and cannot permit a later restored service send', async () => {
  for (const status of ['NOT_RECORDED', 'RECONCILIATION_REQUIRED', 'OUTCOME_UNKNOWN', 'NOT_INVOKED',
    'ORIGINAL_BINDING_MISMATCH', 'REQUEST_ID_CONFLICT', 'CLOSED', 'UNAVAILABLE', 'UNAUTHORIZED',
    'NOT_FOUND', 'METHOD_NOT_ALLOWED', 'BAD_REQUEST']) {
    const f = fixture(); await f.client.restoreOriginalPayment(f.restoreInput()); f.backendReply = f.backendOutcome(status);
    const result = await f.client.readOriginalBackendRecoveryState(f.backendInput()); noAuthority(result); assert.equal(result.backendStatus, status);
    await assert.rejects(f.client.submitOriginal(f.service())); assert.equal(f.services, 0); await f.client.close();
  }
});

test('backend accessors proxies promises and thenables are refused without assimilation or caller hooks', async () => {
  for (const kind of ['accessor', 'proxy', 'promise', 'thenable']) {
    const f = fixture(); let hooks = 0;
    f.onBackend = () => kind === 'promise' ? Promise.resolve(f.backendReply)
      : kind === 'proxy' ? new Proxy({}, { get() { hooks++; } })
        : kind === 'thenable' ? F({ then() { hooks++; } })
          : F({ get status() { hooks++; throw Error('PRIVATE_BACKEND_GETTER'); } });
    await assert.rejects(f.client.readOriginalBackendRecoveryState(f.backendInput()));
    assert.equal(hooks, 0); await heldClose(f);
  }
});

test('private backend exceptions are sanitized and the failed query is never repeated', async () => {
  const f = fixture(); f.onBackend = () => { throw Error('PRIVATE_BACKEND_FAILURE'); };
  await assert.rejects(f.client.readOriginalBackendRecoveryState(f.backendInput()), error => !String(error).includes('PRIVATE_BACKEND_FAILURE'));
  await assert.rejects(f.client.readOriginalBackendRecoveryState(f.backendInput())); assert.equal(f.backendReads, 1); await heldClose(f);
});

test('a recursive combined read is refused while the outer real-core query completes once', async () => {
  const f = fixture(); let nested;
  f.onBackend = () => { nested = f.client.readOriginalBackendRecoveryState(f.backendInput()); return f.backendReply; };
  const outer = f.client.readOriginalBackendRecoveryState(f.backendInput()); await assert.rejects(nested);
  noAuthority(await outer); assert.equal(f.backendReads, 1); await f.client.close();
});

test('reentrant close from the first checkpoint prevents custody and backend callbacks', async () => {
  const f = fixture(); let close;
  f.onCheckpoint = () => { close = f.client.close(); return f.checkpoint; };
  await assert.rejects(f.client.readOriginalBackendRecoveryState(f.backendInput())); await assert.rejects(close);
  assert.equal(f.stateReads + f.backendReads, 0); assert.equal(f.closes, 1); assert.equal(f.backendCloses, 1);
});

test('reentrant close during backend lookup prevents later reads and a combined result escape', async () => {
  const f = fixture(); let close;
  f.onBackend = () => { close = f.client.close(); return f.backendReply; };
  await assert.rejects(f.client.readOriginalBackendRecoveryState(f.backendInput())); await assert.rejects(close);
  assert.equal(f.stateReads, 1); assert.equal(f.backendReads, 1); assert.equal(f.client.inspect().lastBackendRecovery, null);
});

test('a backend reader stop failure cannot suppress the native payer stop or close the borrowed store', async () => {
  const f = fixture(); f.onBackendClose = () => { throw Error('PRIVATE_BACKEND_CLOSE'); };
  const close = f.client.close(); await assert.rejects(close); assert.equal(f.client.close(), close);
  assert.equal(f.closes, 1); assert.equal(f.backendCloses, 1); assert.equal(f.borrowedBackendStoreCloses, 0);
  assert.equal(f.client.inspect().childStopRetained, true); assert.equal(f.client.inspect().backendReaderClose, 'UNKNOWN');
});

test('native payer close refusal still fences the backend reader and preserves one original close receipt', async () => {
  const f = fixture(); f.onClose = () => Promise.reject(Error('PRIVATE_NATIVE_CLOSE'));
  const close = f.client.close(); await assert.rejects(close); assert.equal(f.client.close(), close);
  assert.equal(f.backendCloses, 1); assert.equal(f.closes, 1);
  assert.equal(f.client.inspect().backendReaderClose, 'CLOSED'); assert.equal(f.client.inspect().backendStopRetained, true);
});

test('only the actual synchronous CLOSED backend record is a reader-stop receipt', async () => {
  for (const kind of ['void', 'promise', 'authority']) {
    const f = fixture(); f.onBackendClose = () => kind === 'void' ? undefined
      : kind === 'promise' ? Promise.resolve(f.backendOutcome('CLOSED'))
        : f.backendOutcome('CLOSED', { executionAuthorized: true });
    await heldClose(f); assert.equal(f.closes, 1); assert.equal(f.backendCloses, 1);
    assert.equal(f.client.inspect().backendReaderClose, 'UNKNOWN');
  }
});

test('explicit reconciliation writes one redacted result and stops queued restore or submission commands', async () => {
  const h = harness(); h.input.end(ENCODE(command('one', 'reconcileOriginal', h.f.backendInput()))
    + ENCODE(command('two', 'restoreOriginal', h.f.restoreInput())));
  await assert.rejects(h.owner.run()); assert.equal(h.owner.inspect().mode, 'RECOVER_EXISTING_ORIGINAL_WITH_BACKEND');
  assert.equal(h.owner.inspect().commands, 1); assert.equal(h.owner.inspect().recoveryOutcomeUnknown, true);
  assert.equal(h.f.backendReads, 1); assert.equal(h.f.services + h.f.restores, 0); noAuthority(h.replies[0].result);
  assert.equal(h.owner.retainedResult().writeCallbackCompleted, true);
});

test('lost reconciliation output retains only the exact redacted line and never repeats the backend query', async () => {
  const h = harness({ onWrite(context, done) { done(Error('PRIVATE_BACKEND_OUTPUT')); } });
  h.input.write(ENCODE(command('one', 'reconcileOriginal', h.f.backendInput()))); await assert.rejects(h.owner.run());
  const retained = h.owner.retainedResult(); assert.equal(retained.writeCallbackCompleted, false);
  noAuthority(JSON.parse(retained.line).result); assert.equal(retained.line.includes('PRIVATE_BACKEND_OUTPUT'), false);
  assert.equal(h.f.backendReads, 1); assert.equal(h.f.services + h.f.restores, 0);
});

test('backend recovery backpressure and a late output callback cannot heal the bounded close result', async () => {
  let release;
  const h = harness({ highWaterMark: 1, closeWaitMs: 20, onWrite(context, done) { release = done; } });
  h.input.write(ENCODE(command('one', 'reconcileOriginal', h.f.backendInput())));
  const run = h.owner.run(), rejected = assert.rejects(run); await until(() => typeof release === 'function');
  const close = h.owner.close(); await assert.rejects(close); await rejected;
  release(); await tick(); assert.equal(h.owner.close(), close); await assert.rejects(close);
  assert.equal(h.owner.inspect().historicalClose, 'REJECTED'); assert.equal(h.f.backendReads, 1);
  assert.equal(h.f.backendCloses, 1); assert.equal(h.f.closes, 1);
});
