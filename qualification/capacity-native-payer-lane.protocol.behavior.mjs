import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeCapacityPayerLaneProtocol as create, captureNativeCapacityLanePlan as plan,
  captureNativeCapacityServiceOriginals as originals } from './capacity-native-payer-lane.protocol.js';
import { captureOriginalServiceRequestCustody, validateOriginalServiceRequestCustody,
  serializeOriginalServiceRequestCustody, parseOriginalServiceRequestCustody } from '../src/service-credit-original-request-custody-contract.js';

if (process.version !== 'v24.19.0' || process.env.X402_CAPACITY_LANE_DATA_SELECTION !== 'payer-lane-data-v1')
  throw new TypeError('CAPACITY_LANE_DATA_SELECTION_REQUIRED');
console.log('# capacity-lane-data-runtime ' + JSON.stringify({ Node: process.version,
  platform: process.platform, arch: process.arch, eventsDeclared: true, nativeEffects: false }));

const context = () => ({ runId: 'a'.repeat(64), laneId: 'lane-1', sourceRowsSha256: 'b'.repeat(64) });
const selection = (w = 1, m = 2) => ({ warmupCallsPerLane: w, measurementCallsPerLane: m });
const fresh = (w = 1, m = 2) => create(context(), selection(w,m));
function ready(p) { for (const kind of ['OPEN','PREPARE','COMMIT','SUBMIT','BIND']) p.complete(p.claim(kind), 'SUCCESS'); return p; }
const finish = (p, cohort, ordinal) => p.complete(p.claim('EXECUTE', { cohort, ordinal }), 'SUCCESS');
function envelope(w = 1, m = 2) {
  const grantId = 'synthetic.grant', serviceResourceUrl = 'https://localhost:18443/service-credit/v1/execute';
  return { selectedGrantId: grantId, serviceResourceUrl,
    originals: Array.from({ length: w+m }, (_, i) => {
      const requestId = 'request.' + i;
      const request = { modelVersion: 1, grantId, requestId, method: 'POST', routeId: 'service-credit.execute.v1',
        canonicalBodyDigest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        selectedContentType: 'application/json', maxCostUnits: 2 };
      return { cohort: i < w ? 'WARMUP' : 'MEASUREMENT', ordinal: i < w ? i : i-w,
        original: { grantId, requestId, originalRequestJson: JSON.stringify(request), originalBodyBase64: '',
          serviceResourceUrl, authorizationHeader: 'ServiceCredit synthetic_shape_only_not_a_valid_proof_' + i } };
    }) };
}
function changeRequest(e, edits) {
  const o = e.originals[0].original, r = JSON.parse(o.originalRequestJson);
  o.originalRequestJson = JSON.stringify({ ...r, ...edits });
}

test('lane protocol construction is native-free and initially inert', () => {
  const p = fresh(); assert.equal(p.snapshot().phase, 'NEW'); assert.equal(p.snapshot().sequence, 0);
  assert.equal(p.snapshot().nativeExecution, 'NOT_ESTABLISHED'); assert.equal(p.snapshot().authority, 'NONE');
});
test('context accepts exact bounded identifiers and detached source DATA', () => {
  const c = context(), p = create(c, selection()); c.laneId = 'changed';
  assert.equal(p.context.laneId, 'lane-1');
  for (const c of [{ ...context(), extra: 1 }, { ...context(), runId: 'A'.repeat(64) },
    { ...context(), laneId: '../escape' }, { ...context(), sourceRowsSha256: 'b'.repeat(63) }]) assert.throws(() => create(c, selection()));
});
test('context accessors and proxies are rejected without invocation', () => {
  let calls = 0; const c = context(); Object.defineProperty(c, 'laneId', { get() { calls++; return 'x'; }, enumerable: true });
  assert.throws(() => create(c, selection()));
  assert.throws(() => create(new Proxy(context(), { get() { calls++; } }), selection())); assert.equal(calls, 0);
});
test('actual client call capacity is explicit with no silent truncation', () => {
  assert.equal(plan(selection(255,1)).totalCalls, 256);
  for (const p of [selection(256,1), selection(0,0), selection(-0,1), selection(1,-0), selection(true,1),
    selection(0,Infinity), selection(0,1.5), selection(-1,1), { ...selection(), extra: 1 }]) assert.throws(() => plan(p));
});
test('plan capture is detached deeply frozen and exact arity', () => {
  const source = selection(), p = plan(source); source.measurementCallsPerLane = 200;
  assert.equal(p.totalCalls, 3); assert.ok(Object.isFrozen(p));
  assert.throws(() => plan()); assert.throws(() => plan(selection(), undefined));
});
test('actual funding method sequence has five distinct successful boundaries', () => {
  const p = fresh(); const stages = ['FUNDING_READY','PREPARED','COMMITTED','BOUND','SERVICE_READY'];
  ['OPEN','PREPARE','COMMIT','SUBMIT','BIND'].forEach((kind,i) => {
    const t = p.claim(kind); assert.ok(Object.isFrozen(t)); assert.equal(t.sequence, i+1);
    assert.equal(p.complete(t, 'SUCCESS').phase, stages[i]);
  });
});
test('invalid method order rejects without consuming an operation', () => {
  const p = fresh(); for (const kind of ['PREPARE','COMMIT','SUBMIT','BIND','EXECUTE','CLOSE','toString']) assert.throws(() => p.claim(kind));
  assert.equal(p.snapshot().sequence, 0); assert.equal(p.snapshot().held, false);
});
test('each lane admits one active operation only', () => {
  const p = fresh(), t = p.claim('OPEN'); assert.throws(() => p.claim('OPEN'));
  assert.throws(() => p.claim('PREPARE')); assert.equal(p.snapshot().activeOperation, true);
  p.complete(t, 'SUCCESS'); assert.equal(p.claim('PREPARE').sequence, 2);
});
test('a cloned ticket cannot complete or free an active operation', () => {
  const p = fresh(), t = p.claim('OPEN'); assert.throws(() => p.complete({ ...t }, 'SUCCESS'));
  assert.equal(p.snapshot().held, true); assert.equal(p.snapshot().activeOperation, true);
  p.complete(t, 'SUCCESS'); assert.equal(p.snapshot().phase, 'HELD');
});
test('tickets from another lane are not interchangeable', () => {
  const a = fresh(), b = fresh(), ta = a.claim('OPEN'), tb = b.claim('OPEN');
  assert.throws(() => a.complete(tb, 'SUCCESS')); assert.equal(b.snapshot().held, false);
  b.complete(tb, 'SUCCESS'); a.complete(ta, 'SUCCESS'); assert.equal(a.snapshot().held, true);
});
test('duplicate completion latches uncertainty and cannot authorize a retry', () => {
  const p = fresh(), t = p.claim('OPEN'); p.complete(t, 'SUCCESS');
  assert.throws(() => p.complete(t, 'SUCCESS')); assert.equal(p.snapshot().held, true);
  assert.throws(() => p.claim('OPEN')); assert.throws(() => p.claim('PREPARE'));
});
test('UNKNOWN at every funding boundary permanently holds the lane', () => {
  const kinds = ['OPEN','PREPARE','COMMIT','SUBMIT','BIND'];
  for (let at = 0; at < kinds.length; at++) {
    const p = fresh(); for (let i = 0; i < at; i++) p.complete(p.claim(kinds[i]), 'SUCCESS');
    p.complete(p.claim(kinds[at]), 'UNKNOWN'); assert.equal(p.snapshot().phase, 'HELD');
    assert.throws(() => p.claim(kinds[at]));
  }
});
test('warmup precedes measurement with exact ordinal reservations', () => {
  const p = ready(fresh()); assert.throws(() => p.claim('EXECUTE', { cohort: 'MEASUREMENT', ordinal: 0 }));
  finish(p, 'WARMUP', 0); assert.throws(() => p.claim('EXECUTE', { cohort: 'MEASUREMENT', ordinal: 1 }));
  finish(p, 'MEASUREMENT', 0); finish(p, 'MEASUREMENT', 1);
  assert.equal(p.snapshot().completedCalls, 3); assert.equal(p.snapshot().measurementReserved, 2);
});
test('zero warmup goes directly to measurement without a fabricated warmup', () => {
  const p = ready(fresh(0,1)); finish(p, 'MEASUREMENT', 0);
  assert.equal(p.snapshot().warmupReserved, 0); assert.equal(p.snapshot().completedCalls, 1);
});
test('maximum bounded plan completes 256 declared calls without reset', () => {
  const p = ready(fresh(128,128));
  for (const cohort of ['WARMUP','MEASUREMENT']) for (let ordinal = 0; ordinal < 128; ordinal++) finish(p, cohort, ordinal);
  assert.equal(p.snapshot().sequence, 261); assert.equal(p.snapshot().completedCalls, 256);
});
test('completed call plan refuses excess and duplicate originals', () => {
  const p = ready(fresh(0,1)); finish(p, 'MEASUREMENT', 0);
  assert.throws(() => p.claim('EXECUTE', { cohort: 'MEASUREMENT', ordinal: 0 }));
  assert.throws(() => p.claim('EXECUTE', { cohort: 'MEASUREMENT', ordinal: 1 }));
  assert.equal(p.snapshot().measurementReserved, 1);
});
test('returned close waits for active operation accounting', () => {
  const p = ready(fresh()), t = p.claim('EXECUTE', { cohort: 'WARMUP', ordinal: 0 }), c = p.requestClose();
  p.completeClose(c, 'RETURNED'); assert.equal(p.snapshot().phase, 'CLOSING'); assert.equal(p.snapshot().activeOperation, true);
  p.complete(t, 'SUCCESS'); assert.equal(p.snapshot().phase, 'CLOSED'); assert.equal(p.snapshot().closeOutcome, 'RETURNED');
});
test('unknown close remains unknown after late operation success', () => {
  const p = fresh(), t = p.claim('OPEN'), c = p.requestClose(); p.completeClose(c, 'UNKNOWN'); p.complete(t, 'SUCCESS');
  assert.equal(p.snapshot().phase, 'HELD'); assert.equal(p.snapshot().closeOutcome, 'UNKNOWN');
});
test('close request is cached even before opening and blocks new admissions', () => {
  const p = fresh(), c = p.requestClose(); assert.equal(p.requestClose(), c); assert.equal(p.snapshot().sequence, 1);
  assert.throws(() => p.claim('OPEN')); p.completeClose(c, 'RETURNED'); assert.equal(p.snapshot().phase, 'CLOSED');
});
test('late UNKNOWN is never erased by an already returned close', () => {
  const p = fresh(), t = p.claim('OPEN'), c = p.requestClose(); p.completeClose(c, 'RETURNED'); p.complete(t, 'UNKNOWN');
  assert.equal(p.snapshot().phase, 'HELD'); assert.equal(p.snapshot().closeOutcome, 'RETURNED');
});
test('duplicate close completion preserves returned historical fact but holds the lane', () => {
  const p = fresh(), c = p.requestClose(); p.completeClose(c, 'RETURNED');
  assert.throws(() => p.completeClose(c, 'UNKNOWN')); assert.equal(p.snapshot().closeOutcome, 'RETURNED'); assert.equal(p.snapshot().held, true);
});
test('explicit local uncertainty does not discard the active ticket', () => {
  const p = fresh(), t = p.claim('OPEN'); p.markUnknown(); assert.equal(p.snapshot().activeOperation, true);
  p.complete(t, 'SUCCESS'); assert.equal(p.snapshot().held, true); assert.equal(p.snapshot().activeOperation, false);
});
test('public protocol snapshot is immutable and contains no context or original material', () => {
  const p = ready(fresh()), s = p.snapshot(); assert.ok(Object.isFrozen(s)); assert.ok(Object.isFrozen(p.context));
  assert.equal(Object.keys(s).length, 13); const text = JSON.stringify(s);
  for (const forbidden of ['requestId','authorizationHeader','serializedCheckpoint','runId','sourceRowsSha256']) assert.equal(text.includes(forbidden), false);
});
test('all service originals are detached frozen before dispatch', () => {
  const e = envelope(), captured = originals(e, selection());
  e.originals[0].original.authorizationHeader = 'changed';
  assert.ok(captured.originals[0].original.authorizationHeader.startsWith('ServiceCredit '));
  assert.ok(Object.isFrozen(captured)); assert.ok(Object.isFrozen(captured.originals)); assert.ok(Object.isFrozen(captured.originals[0].original));
});
test('foreign grant and resource are rejected before original capture', () => {
  const a = envelope(); a.originals[0].original.grantId = 'foreign'; assert.throws(() => originals(a, selection()));
  const b = envelope(); b.originals[0].original.serviceResourceUrl = 'https://localhost:18444/service-credit/v1/execute'; assert.throws(() => originals(b, selection()));
});
test('duplicate original request IDs are never adopted', () => {
  const e = envelope(); e.originals[1].original = { ...e.originals[0].original }; assert.throws(() => originals(e, selection()));
});
test('original manifest enforces the complete exact cohort order', () => {
  for (const field of ['cohort','ordinal']) { const e = envelope(); e.originals[1][field] = field === 'cohort' ? 'WARMUP' : 1;
    assert.throws(() => originals(e, selection())); }
  const e = envelope(); e.originals[0].ordinal = -0; assert.throws(() => originals(e, selection()));
});
test('original accessors and proxies are rejected without reading their values', () => {
  let invoked = 0; const e = envelope(); Object.defineProperty(e.originals[0].original, 'requestId', { get() { invoked++; }, enumerable: true });
  assert.throws(() => originals(e, selection())); const b = envelope(); b.originals = new Proxy(b.originals, { get() { invoked++; } });
  assert.throws(() => originals(b, selection())); assert.equal(invoked, 0);
});
test('nonempty body and nonexisting business profiles are rejected', () => {
  const a = envelope(); a.originals[0].original.originalBodyBase64 = 'eA=='; assert.throws(() => originals(a, selection()));
  const b = envelope(); changeRequest(b, { routeId: 'other' }); assert.throws(() => originals(b, selection()));
});
test('request JSON must preserve canonical field order and exact bytes', () => {
  const a = envelope(); a.originals[0].original.originalRequestJson += ' '; assert.throws(() => originals(a, selection()));
  const b = envelope(), o = b.originals[0].original, r = JSON.parse(o.originalRequestJson);
  o.originalRequestJson = JSON.stringify({ requestId: r.requestId, ...r }); assert.throws(() => originals(b, selection()));
});
test('cost digest method content type and version cannot drift', () => {
  for (const edits of [{ maxCostUnits: 3 }, { canonicalBodyDigest: '0'.repeat(64) }, { method: 'GET' },
    { selectedContentType: 'text/plain' }, { modelVersion: 2 }, { requestId: 'replacement' }]) {
    const e = envelope(); changeRequest(e, edits); assert.throws(() => originals(e, selection()));
  }
});
test('proof header shape rejects controls unsupported prefix and oversize without authenticating proofs', () => {
  for (const header of ['ServiceCredit a\r\nb','Bearer abc','ServiceCredit ','ServiceCredit a=','ServiceCredit '+ 'x'.repeat(16384)]) {
    const e = envelope(); e.originals[0].original.authorizationHeader = header; assert.throws(() => originals(e, selection()));
  }
  assert.ok(originals(envelope(), selection())); // Shape-only DATA is intentionally not a valid cryptographic proof.
});
test('only the explicit unprivileged loopback service route is selected', () => {
  for (const url of ['https://example.invalid:18443/service-credit/v1/execute','http://localhost:18443/service-credit/v1/execute',
    'https://localhost:443/service-credit/v1/execute','https://localhost:65536/service-credit/v1/execute',
    'https://localhost:18443/service-credit/v1/execute?x=1']) {
    const e = envelope(); e.serviceResourceUrl = url; assert.throws(() => originals(e, selection()));
  }
});
test('complete manifest has a bounded aggregate memory envelope', () => {
  const e = envelope(0,256); for (const row of e.originals) row.original.authorizationHeader = 'ServiceCredit ' + 'x'.repeat(3000);
  assert.throws(() => originals(e, selection(0,256)));
});
test('holes inherited fields symbols and array side fields are rejected', () => {
  const a = envelope(); delete a.originals[1]; assert.throws(() => originals(a, selection()));
  const b = envelope(); b.originals.extra = 1; assert.throws(() => originals(b, selection()));
  const c = envelope(); c.originals[0].original[Symbol('x')] = 1; assert.throws(() => originals(c, selection()));
  const d = envelope(); Object.setPrototypeOf(d.originals[0].original, { extra: 1 }); assert.throws(() => originals(d, selection()));
});
test('public protocol methods require exact arity and outcome values', () => {
  const p = fresh(); assert.throws(() => p.claim('OPEN', undefined)); assert.throws(() => p.requestClose(1));
  assert.throws(() => p.snapshot(1)); assert.throws(() => p.markUnknown(1)); assert.throws(() => create(context(), selection(), 1));
  const t = p.claim('OPEN'); assert.throws(() => p.complete(t, 'PASS')); assert.equal(p.snapshot().held, true);
});
test('ordinal aliases booleans accessors and extra selection keys cannot consume a call', () => {
  const p = ready(fresh()); let reads = 0;
  const a = { cohort: 'WARMUP' }; Object.defineProperty(a, 'ordinal', { get() { reads++; return 0; }, enumerable: true });
  for (const row of [a, { cohort: 'WARMUP', ordinal: -0 }, { cohort: 'WARMUP', ordinal: '0' },
    { cohort: 'WARMUP', ordinal: false }, { cohort: 'WARMUP', ordinal: 0, extra: 1 }]) assert.throws(() => p.claim('EXECUTE', row));
  assert.equal(p.snapshot().warmupReserved, 0); assert.equal(reads, 0);
});
test('an unknown service original is reserved once and cannot be replaced', () => {
  const p = ready(fresh()), t = p.claim('EXECUTE', { cohort: 'WARMUP', ordinal: 0 }); p.complete(t, 'UNKNOWN');
  assert.equal(p.snapshot().warmupReserved, 1); assert.equal(p.snapshot().completedCalls, 0);
  assert.throws(() => p.claim('EXECUTE', { cohort: 'WARMUP', ordinal: 0 }));
  assert.throws(() => p.claim('EXECUTE', { cohort: 'MEASUREMENT', ordinal: 0 }));
});
test('unknown handoff cannot authorize a new funding or selected-grant lane', () => {
  const p = fresh(); for (const kind of ['OPEN','PREPARE','COMMIT','SUBMIT']) p.complete(p.claim(kind), 'SUCCESS');
  p.complete(p.claim('BIND'), 'UNKNOWN'); for (const kind of ['OPEN','PREPARE','BIND']) assert.throws(() => p.claim(kind));
});
test('returned close cannot clear an earlier held observation or manufacture handle proof', () => {
  const p = ready(fresh()); p.markUnknown(); const c = p.requestClose(); p.completeClose(c, 'RETURNED');
  assert.equal(p.snapshot().phase, 'HELD'); assert.equal(p.snapshot().closeOutcome, 'RETURNED');
  assert.equal(p.snapshot().nativeExecution, 'NOT_ESTABLISHED'); assert.equal('nativeHandleOpen' in p.snapshot(), false);
});

test('captured originals pass the genuine existing custody contract unchanged', () => {
  const selected = originals(envelope(), selection());
  for (const row of selected.originals) {
    const o = row.original;
    const retained = captureOriginalServiceRequestCustody({ originalRequestJson: o.originalRequestJson,
      originalBodyBase64: o.originalBodyBase64, serviceResourceUrl: o.serviceResourceUrl },
    { fundingResourceUrl: 'https://localhost:18443/funding', paymentHash: 'a'.repeat(64), network: 'zenon:testnet' });
    assert.equal(retained.profile, 'service-credit.execute.v1.empty-body');
    assert.equal(retained.originalRequestJson, o.originalRequestJson);
    assert.equal(retained.grantId, selected.selectedGrantId); assert.equal(retained.requestId, o.requestId);
    assert.deepEqual(validateOriginalServiceRequestCustody(retained), retained);
    assert.deepEqual(parseOriginalServiceRequestCustody(serializeOriginalServiceRequestCustody(retained)), retained);
  }
});
test('unprefixed legacy fixture digest is rejected by both actual contracts', () => {
  const e = envelope(); changeRequest(e, { canonicalBodyDigest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' });
  assert.throws(() => originals(e, selection())); const o = e.originals[0].original;
  assert.throws(() => captureOriginalServiceRequestCustody({ originalRequestJson: o.originalRequestJson,
    originalBodyBase64: o.originalBodyBase64, serviceResourceUrl: o.serviceResourceUrl },
  { fundingResourceUrl: 'https://localhost:18443/funding', paymentHash: 'a'.repeat(64), network: 'zenon:testnet' }));
});
test('prefixed but wrong body digest cannot enter either actual contract', () => {
  const e = envelope(); changeRequest(e, { canonicalBodyDigest: 'sha256:' + '0'.repeat(64) });
  assert.throws(() => originals(e, selection())); const o = e.originals[0].original;
  assert.throws(() => captureOriginalServiceRequestCustody({ originalRequestJson: o.originalRequestJson,
    originalBodyBase64: o.originalBodyBase64, serviceResourceUrl: o.serviceResourceUrl },
  { fundingResourceUrl: 'https://localhost:18443/funding', paymentHash: 'a'.repeat(64), network: 'zenon:testnet' }));
});
