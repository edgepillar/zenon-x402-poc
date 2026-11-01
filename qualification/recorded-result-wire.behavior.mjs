import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { decodeApiCreditServiceCommandResult } from '../src/api-credit-service-command.js';
import { recordedResultWireFixture } from './api-credit-recorded-result-wire.fixture.mjs';

const F = Object.freeze, checks = [];
const check = (id, run) => checks.push({ id, run });
check('recorded-wire-first-committed-response-refusal-stops-before-the-next-input', async () => {
  const s = recordedResultWireFixture({ corruptAt: 1, corruptReply(line) {
    const reply = JSON.parse(line); reply.result.requestId = 'foreign.request'; return canonicalJson(reply) + '\n';
  } });
  try {
    const out = await s.start(), r = s.r, h = s.h;
    assert.equal(s.consumerError instanceof TypeError, true); assert.equal(s.decoded.length, 0);
    assert.equal(s.rawReplies.length, 1); assert.equal(s.serviceCommands.length, 1);
    assert.equal(s.replaySent, false); assert.equal(s.closeSent, false);
    assert.equal(out.status, 'CLOSE_UNKNOWN'); assert.equal(out.exitCode, 4); assert.equal(out.outputOutcomeUnknown, true);
    assert.equal(out.sessionHeld, true); assert.equal(out.authority, 'NONE');
    assert.deepEqual([h.counts.funding, h.counts.grants, r.submissions, r.reserves, r.begins, r.completes], [1, 1, 1, 1, 1, 1]);
    assert.equal(h.model.getGrant(h.grant.grantId).consumedUnits, 1);
    assert.equal(r.records.get('item.0').responseObservation.responseJson, JSON.parse(s.rawReplies[0]).result.responseJson);
    const retained = h.owner.retainedResult(), before = JSON.stringify(h.model.exportState());
    assert.equal(retained.line, s.rawReplies[0]); assert.equal(retained.writeCallbackCompleted, false); assert.equal(retained.authority, 'NONE');
    assert.equal(decodeApiCreditServiceCommandResult(s.first, retained.line).responseJson, JSON.parse(s.rawReplies[0]).result.responseJson);
    assert.equal(JSON.stringify(h.model.exportState()), before); assert.equal(r.submissions, 1);
    assert.deepEqual([h.counts.stops, h.counts.walletStops], [1, 1]);
  } finally { await s.cleanup(); }
});
check('recorded-wire-stale-replay-reply-retains-the-original-without-another-debit', async () => {
  const s = recordedResultWireFixture({ corruptAt: 101, corruptReply(line) {
    const reply = JSON.parse(line); reply.id = 'service.0'; return canonicalJson(reply) + '\n';
  } });
  try {
    const out = await s.start(), r = s.r, h = s.h;
    assert.equal(s.consumerError instanceof TypeError, true); assert.equal(s.decoded.length, 100);
    assert.equal(s.rawReplies.length, 101); assert.equal(s.serviceCommands.length, 101); assert.equal(s.closeSent, false);
    assert.equal(out.status, 'CLOSE_UNKNOWN'); assert.equal(out.exitCode, 4); assert.equal(out.outputOutcomeUnknown, true);
    assert.deepEqual([h.counts.funding, h.counts.grants, r.submissions, r.reserves, r.begins, r.completes], [1, 1, 100, 100, 100, 100]);
    assert.equal(JSON.stringify(h.model.exportState()), s.beforeReplay); assert.equal(h.raw(), s.paymentBeforeReplay);
    assert.equal(s.serviceCommands[100].command.input, s.first.command.input);
    const retained = h.owner.retainedResult(); assert.equal(retained.id, 'replay'); assert.equal(retained.line, s.rawReplies[100]);
    assert.equal(retained.writeCallbackCompleted, false); assert.equal(retained.authority, 'NONE');
    const observed = decodeApiCreditServiceCommandResult(s.active, retained.line);
    assert.equal(observed.replayed, true); assert.equal(observed.newDispatchRequested, false); assert.equal(observed.responseJson, s.firstResult.responseJson);
    assert.equal(JSON.stringify(h.model.exportState()), s.beforeReplay); assert.deepEqual([h.counts.stops, h.counts.walletStops], [1, 1]);
  } finally { await s.cleanup(); }
});

export const recordedResultWireDataCases = F(checks.map(c => F(c)));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = []; for (const { id, run } of checks) { try { await run(); cases.push({ id, status: 'PASS' }); }
    catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); } }
  const failed = cases.filter(c => c.status !== 'PASS').length;
  console.log(JSON.stringify({ qualification: 'G1_G2_RECORDED_RESULT_WIRE_DATA', passed: cases.length - failed, failed, cases,
    actualCommandHostChannelResultReaderAndProduct:true,declaredMemoryFundingGrantFileSqlProofAndNativePortsOnly:true,
    nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
    nativeHundredCallAcceptance:'NOT_ESTABLISHED',nativeRelease:'NOT_ESTABLISHED',freshProcessAcceptance:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED',G0G5Acceptance:'OPEN' }));
  if (failed) process.exitCode = 1;
}
