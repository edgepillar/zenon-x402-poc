// Real command codec/wire capture and provider reference-model composition.
// Existing proof strings and grant activation below are declared mock DATA.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { captureApiCreditServiceCommand as capture, captureApiCreditServiceReplayCommand as replay } from '../src/api-credit-service-command.js';
import { decodeBuyerApiCreditCommand as decode } from '../src/buyer-original-funding-command.js';
import { captureServiceCreditHttpExecuteOriginalInput as captureWire } from '../src/service-credit-http-execute-dispatch.js';
import { createProviderWireRouteFixture } from './provider-wire-route.behavior.mjs';

const F = Object.freeze, checks = [];
function check(id, run) { checks.push(F({ id, run })); }
function fixture(id = 'request.0') {
  const provider = createProviderWireRouteFixture(), wire = provider.wire(id);
  return { provider, wire, options: { id: 'command.0', serviceResourceUrl: provider.serviceUrl, ...wire, maxLineBytes: 262144 } };
}
function parsed(captured) {
  assert.equal(captured.line.endsWith('\n'), true);
  return decode(captured.line.slice(0, -1), 262144);
}
function invoke(provider, captured) {
  const c = parsed(captured), input = c.input;
  const wire = captureWire({ resourceUrl: input.serviceResourceUrl, originalRequestJson: input.originalRequestJson,
    authorizationHeader: input.authorizationHeader });
  assert.equal(input.grantId, wire.grantId); assert.equal(input.requestId, wire.requestId);
  assert.equal(input.originalBodyBase64, '');
  return provider.invoke({ originalRequestJson: input.originalRequestJson, authorizationHeader: input.authorizationHeader });
}

check('service-command-uses-the-real-command-codec-and-buyer-wire-identities', () => {
  const r = fixture(), c = capture(r.options), d = parsed(c);
  assert.equal(c.apiCreditServiceCommandVersion, 1); assert.equal(d.operation, 'submitService');
  assert.equal(d.id, 'command.0'); assert.equal(d.input.grantId, r.provider.grant.grantId);
  assert.equal(d.input.requestId, 'request.0'); assert.deepEqual(d, c.command);
  assert.equal(r.provider.executions, 0);
});
check('service-command-preserves-existing-private-proof-request-and-url-bytes', () => {
  const r = fixture(), c = capture(r.options), input = parsed(c).input;
  for (const name of ['originalRequestJson', 'authorizationHeader', 'serviceResourceUrl']) assert.equal(input[name], r.options[name]);
  assert.equal(input.originalBodyBase64, ''); assert.equal(Object.isFrozen(c), true);
  assert.equal(Object.isFrozen(c.command), true); assert.equal(Object.isFrozen(c.command.input), true);
  assert.equal(r.provider.model.getGrant(r.provider.grant.grantId).availableUnits, 100);
});
check('service-command-refuses-invalid-correlation-ids-and-selected-byte-overflow', () => {
  const r = fixture();
  for (const changed of [{ id: '' }, { id: 'a'.repeat(65) }, { maxLineBytes: 256 }, { maxLineBytes: 262145 }]) {
    assert.throws(() => capture({ ...r.options, ...changed }), /API_CREDIT_SERVICE_COMMAND/);
  }
  assert.equal(r.provider.executions, 0);
});
check('service-command-does-not-read-accessors-or-run-serialization-callbacks', () => {
  const r = fixture(); let called = 0;
  const options = { ...r.options }; Object.defineProperty(options, 'authorizationHeader', { enumerable: true, get() { called++; throw Error(); } });
  assert.throws(() => capture(options));
  assert.throws(() => capture({ ...r.options, toJSON() { called++; return r.options; } }));
  assert.throws(() => capture({ ...r.options, originalRequestJson: { toString() { called++; return r.wire.originalRequestJson; } } }));
  assert.equal(called, 0);
});
check('service-command-refuses-proxies-without-entering-their-traps', () => {
  const r = fixture(); let traps = 0;
  const proxy = new Proxy(r.options, { get() { traps++; throw Error(); }, ownKeys() { traps++; throw Error(); } });
  assert.throws(() => capture(proxy)); assert.equal(traps, 0);
});
check('service-command-rejects-noncanonical-or-nonproduct-original-requests', () => {
  const r = fixture();
  for (const changes of [{ method: 'GET' }, { routeId: 'execution-receipt.v1' }, { canonicalBodyDigest: 'sha256:' + 'f'.repeat(64) },
    { selectedContentType: 'text/plain' }, { maxCostUnits: 0 }]) assert.throws(() => capture({ ...r.options, ...r.provider.wire('request.0', changes) }));
  assert.throws(() => capture({ ...r.options, originalRequestJson: ' ' + r.wire.originalRequestJson }));
  assert.equal(r.provider.executions, 0);
});
check('service-command-rejects-proof-request-identity-or-budget-mismatch', () => {
  const r = fixture(), original = JSON.parse(Buffer.from(r.wire.authorizationHeader.slice('ServiceCredit '.length), 'base64url'));
  for (const change of [{ requestId: 'request.other' }, { grantId: 'grant.other' }, { maxCostUnits: 2 }]) {
    const header = 'ServiceCredit ' + Buffer.from(JSON.stringify({ ...original, ...change })).toString('base64url');
    assert.throws(() => capture({ ...r.options, authorizationHeader: header }));
  }
  assert.equal(r.provider.executions, 0);
});
check('service-command-replay-changes-only-the-command-correlation-id', () => {
  const r = fixture(), first = capture(r.options), again = replay(first, 'command.replay');
  assert.equal(again.command.input, first.command.input);
  assert.deepEqual(parsed(again), { ...parsed(first), id: 'command.replay' });
  assert.equal(first.command.id, 'command.0'); assert.equal(replay(again, 'command.replay.2').command.input, first.command.input);
});
check('service-command-copied-or-fabricated-preparations-cannot-select-replay-input', () => {
  const r = fixture(), first = capture(r.options);
  for (const forged of [{ ...first }, JSON.parse(JSON.stringify(first)), F({ apiCreditServiceCommandVersion: 1, command: first.command, line: first.line })]) {
    assert.throws(() => replay(forged, 'command.replay'));
  }
  assert.throws(() => replay(first, '')); assert.equal(first.command.input.authorizationHeader, r.wire.authorizationHeader);
});
check('service-command-capture-takes-a-stable-snapshot-before-caller-edits', () => {
  const r = fixture(), first = capture(r.options), line = first.line;
  r.options.originalRequestJson = '{}'; r.options.authorizationHeader = 'changed'; r.options.serviceResourceUrl = 'https://other.invalid/';
  assert.equal(first.line, line); assert.equal(replay(first, 'command.replay').command.input, first.command.input);
  assert.equal(first.command.input.originalRequestJson, r.wire.originalRequestJson);
});
check('service-command-100-reference-calls-replay-and-reconstruction-keep-one-debit-and-execution-each', () => {
  const r = fixture(); let first, firstResult;
  for (let i = 0; i < 100; i++) {
    const c = capture({ ...r.options, id: 'command.' + i, ...r.provider.wire('request.' + i) }), result = invoke(r.provider, c);
    assert.equal(result.replayed, false); if (i === 0) { first = c; firstResult = result.cachedResult; }
  }
  const grant = r.provider.model.getGrant(r.provider.grant.grantId);
  assert.deepEqual([grant.totalUnits, grant.availableUnits, grant.heldUnits, grant.consumedUnits], [100, 0, 0, 100]);
  const before = JSON.stringify(r.provider.model.exportState()), result = invoke(r.provider, replay(first, 'command.replay'));
  assert.equal(result.replayed, true); assert.deepEqual(result.cachedResult, firstResult);
  assert.equal(r.provider.executions, 100); assert.equal(JSON.stringify(r.provider.model.exportState()), before);
  const overflow = capture({ ...r.options, id: 'command.overflow', ...r.provider.wire('request.overflow') });
  assert.throws(() => invoke(r.provider, overflow)); assert.equal(JSON.stringify(r.provider.model.exportState()), before);
  r.provider.restore(); const restored = JSON.stringify(r.provider.model.exportState());
  assert.deepEqual(invoke(r.provider, replay(first, 'command.reconstructed')).cachedResult, firstResult);
  assert.equal(JSON.stringify(r.provider.model.exportState()), restored); assert.equal(r.provider.executions, 100);
});
check('service-command-original-replay-keeps-reference-unknown-and-held-budget', () => {
  const r = fixture(), first = capture(r.options), key = { grantId: r.provider.grant.grantId, requestId: 'request.0' };
  r.provider.reserve(r.wire); r.provider.model.beginExecution(key); r.provider.model.markOutcomeUnknown(key); r.provider.restore();
  const before = JSON.stringify(r.provider.model.exportState()), result = invoke(r.provider, replay(first, 'command.replay'));
  assert.equal(result.replayed, true); assert.equal(result.executionAuthorized, false); assert.equal(result.request.state, 'OUTCOME_UNKNOWN');
  assert.equal(result.cachedResult, null); assert.equal(r.provider.executions, 0);
  assert.equal(JSON.stringify(r.provider.model.exportState()), before); assert.equal(r.provider.model.getGrant(key.grantId).heldUnits, 1);
});

export const apiCreditServiceCommandDataCases = F([...checks]);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const c of checks) {
    try { c.run(); cases.push({ id: c.id, status: 'PASS' }); }
    catch (e) { cases.push({ id: c.id, status: 'FAILURE', error: e.code ?? e.message }); break; }
  }
  const failed = cases.filter(c => c.status !== 'PASS').length;
  console.log(JSON.stringify({ qualification: 'G1_API_CREDIT_SERVICE_COMMAND_DATA', passed: cases.length - failed, failed, cases,
    actualCommandCodecAndWireCapture: true, referenceLedger: true, declaredMockActivation: true,
    componentCooperativeTimers: false, newCaseTimerInvocations: 0,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0,
    nodeChildren: 0, actualPrepare: 0, payouts: 0, proofAuthentication: 'NOT_ESTABLISHED',
    nativeReopen: 'NOT_ESTABLISHED', physicalRelease: 'NOT_ESTABLISHED', LinuxAcceptance: 'NOT_ESTABLISHED', G0G5Acceptance: 'OPEN' }));
  if (failed || cases.length !== checks.length) process.exitCode = 1;
}
