// Actual pure model/execution contracts and acceptance verifier over memory.
// No actual provider, SQLite, process, capability authentication or key exists.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { InMemoryServiceCreditModel } from '../src/service-credit-model.js';
import { createServiceCreditExecutionContract, prepareServiceCreditExecution,
  fenceServiceCreditExecution, completeServiceCreditExecution } from '../src/service-credit-execution-contract.js';
import { createApiCreditLinuxAcceptanceDataFixture } from './api-credit-linux-acceptance.behavior.mjs';
import { captureApiCreditLedgerAcceptanceSelection as select, apiCreditLedgerProbeOptions as options,
  verifyApiCreditAcceptanceLedger as verify, readApiCreditAcceptanceLedger as read } from './api-credit-linux-ledger-contract.mjs';

const F = Object.freeze, checks = [], clone = v => JSON.parse(JSON.stringify(v));
let saved = null;
const hash = v => 'sha256:' + createHash('sha256').update(canonicalJson(v)).digest('hex');
function envelope(state, revision = 401) { const v = { schemaVersion: 1, revision, state }; return { ...v, checksum: hash(v) }; }
function check(id, run) { checks.push(F({ id, run })); }
async function fixture() {
  if (saved === null) {
    const input = await createApiCreditLinuxAcceptanceDataFixture(), profile = JSON.parse(input.runProfile);
    const purchase = JSON.parse(profile.purchaseExpectationJson), commands = input.commands.trimEnd().split('\n').map(JSON.parse);
    const replies = input.runReplies.trimEnd().split('\n').map(JSON.parse), funding = JSON.parse(commands[1].input.originalGrantQueryProfile).originalFunding;
    const a = purchase.authorityProfile, offer = purchase.offer;
    const model = new InMemoryServiceCreditModel({ now: () => 2_000_000_000_000, deriveCost: () => 1 }); model.registerOffer(offer);
    const grant = model.activateGrantFromTrustedRecord({ activationVersion: 2, evidenceVersion: 1, inclusionAuthorizationDigest: 'sha256:' + 'e'.repeat(64), authorityProfileId: a.profileId, authorityProfileVersion: a.profileVersion,
      verifierVersion: a.verifierVersion, authorityRecordDigest: a.recordDigest, fundingPolicyId: offer.fundingPolicyId, fundingPolicyVersion: offer.fundingPolicyVersion,
      sourceSettlementId: 'acceptance.synthetic', ...funding, providerId: offer.providerId, serviceId: offer.serviceId, resourceId: offer.resourceId,
      resourceBinding: offer.resourceBinding, totalUnits: purchase.terms.totalUnits, expiresAt: purchase.terms.expiresAt,
      scheme: 'exact', paymentFlow: 'upfront', payer: funding.holderId, evidenceState: 'MOMENTUM_INCLUDED', confirmationPolicy: a.confirmationPolicy });
    commands[3].input.selectedGrantId = grant.grantId;
    const policy = { policyId: 'acceptance.synthetic', policyVersion: 1, maxDurationMs: 1000 };
    let execution = createServiceCreditExecutionContract({ ledgerId: 'acceptance.synthetic', policy, capacity: 100 });
    for (let i = 4; i < 105; i++) {
      const c = commands[i], request = { ...JSON.parse(c.input.originalRequestJson), grantId: grant.grantId };
      const proof = JSON.parse(Buffer.from(c.input.authorizationHeader.slice('ServiceCredit '.length), 'base64url'));
      c.input.grantId = grant.grantId; c.input.originalRequestJson = JSON.stringify(request);
      c.input.authorizationHeader = 'ServiceCredit ' + Buffer.from(JSON.stringify({ ...proof, grantId: grant.grantId })).toString('base64url');
      replies[i].result.grantId = grant.grantId;
      if (i === 104) continue;
      const r = model.reserveRequest(request).request;
      const projected = {}; for (const k of ['modelVersion', 'grantId', 'requestId', 'requestDigest', 'method', 'routeId', 'canonicalBodyDigest', 'selectedContentType', 'maxCostUnits', 'costUnits']) projected[k] = r[k];
      const prepared = prepareServiceCreditExecution({ state: execution, request: projected, policy, selectedDurationMs: 1000, wallClockStartMs: i * 10 });
      const fenced = fenceServiceCreditExecution({ state: prepared.state, executionId: prepared.execution.executionId, wallClockNowMs: i * 10 + 1 }).fenceTransitionCandidate;
      model.beginExecution({ grantId: r.grantId, requestId: r.requestId });
      const cachedResult = { statusCode: 200, contentType: 'application/json', resultCode: replies[i].result.resultCode };
      model.completeExecution({ grantId: r.grantId, requestId: r.requestId, cachedResult });
      const commitment = 'sha256:' + createHash('sha256').update('zenon-x402:service-credit-sqlite-result-v1\0').update(canonicalJson(cachedResult)).digest('hex');
      execution = completeServiceCreditExecution({ state: fenced.state, executionId: fenced.execution.executionId, resultCommitment: commitment, wallClockNowMs: i * 10 + 2 }).state;
    }
    const recovery = JSON.parse(input.recoveryProfile); recovery.selection.selectedGrantId = grant.grantId; recovery.payerOptions.selectedGrantId = grant.grantId;
    recovery.requestKey.grantId = grant.grantId; recovery.authorizationHeader = commands[4].input.authorizationHeader;
    const recovered = JSON.parse(input.recoveryReply); recovered.grantId = grant.grantId;
    input.commands = commands.map(c => canonicalJson(c) + '\n').join(''); input.runReplies = replies.map(r => canonicalJson(r) + '\n').join('');
    input.recoveryProfile = canonicalJson(recovery); input.recoveryReply = canonicalJson(recovered) + '\n';
    input.ledgerProfile = canonicalJson({ ledgerAcceptanceVersion: 1, backendOptions: recovery.backendOptions,
      allowedRoot: recovery.payerOptions.allowedRoot, expectedCostUnits: 1 });
    saved = F({ input: F(input), before: canonicalJson(envelope(model.exportState())), execution: canonicalJson({ revision: 401, executionState: execution }) });
  }
  const input = { ...saved.input };
  return { input, token: select(input), before: saved.before, execution: saved.execution, after: saved.before };
}
function mutated(text, change) { const v = JSON.parse(text); change(v); if (v.state) v.checksum = hash({ schemaVersion: v.schemaVersion, revision: v.revision, state: v.state }); return canonicalJson(v); }
async function refused(change) { const r = await fixture(); change(r); assert.throws(() => verify(r.token, r.before, r.execution, r.after), /API_CREDIT_LINUX_LEDGER_ACCEPTANCE/); }
function ports(r, overrides = {}) {
  const trace = [], values = [r.before, r.after];
  return { trace, value: { load() { trace.push('load'); return values.shift(); }, executions() { trace.push('executions'); return r.execution; }, close() { trace.push('close'); }, ...overrides } };
}
check('one-original-grant-100-real-model-debits-and-execution-contract-results-match', async () => {
  const r = await fixture(), observed = verify(r.token, r.before, r.execution, r.after);
  assert.deepEqual([observed.grants, observed.requests, observed.successfulExecutions, observed.consumedUnits, observed.heldUnits, observed.availableUnits], [1, 100, 100, 100, 0, 0]);
  assert.equal(observed.totalUnits, 100); assert.equal(observed.revision, 401); assert.equal(observed.atomicSnapshot, false);
});
check('selection-retains-the-existing-106-command-and-independent-original-preflight', async () => {
  const r = await fixture(); const wire = JSON.parse(r.input.commands.split('\n')[4]).input.originalRequestJson;
  assert.notEqual(wire, canonicalJson(JSON.parse(wire))); assert.equal(r.token.summary.commandFrames, 106); assert.equal(r.token.summary.distinctRequests, 100);
  assert.equal(r.token.summary.exactReplays, 1); assert.equal(r.token.summary.version, 2); assert.equal(r.token.summary.ledgerProbeProcesses, 2);
  const changed = { ...r.input, commands: r.input.commands.replace('"operation":"prepare"', '"operation":"inspect"') };
  assert.throws(() => select(changed));
});
check('database-and-limits-are-the-same-explicit-recovery-backend', async () => {
  const r = await fixture(), v = options(r.token), recovery = JSON.parse(r.input.recoveryProfile);
  assert.equal(v.databasePath, recovery.backendOptions.databasePath); assert.equal(v.allowedRoot, recovery.payerOptions.allowedRoot);
  assert.equal(v.maxRequests, recovery.backendOptions.limits.maxRequests);
  const p = JSON.parse(r.input.ledgerProfile); p.backendOptions.databasePath += '.other'; assert.throws(() => select({ ...r.input, ledgerProfile: canonicalJson(p) }));
});
check('missing-cost-or-a-raised-unit-price-cannot-select-a-different-scenario', async () => {
  const r = await fixture(); for (const value of [undefined, 0, 2, '1']) { const p = JSON.parse(r.input.ledgerProfile); p.expectedCostUnits = value; if (value === undefined) delete p.expectedCostUnits; assert.throws(() => select({ ...r.input, ledgerProfile: canonicalJson(p) })); }
});
check('snapshot-payload-and-output-digests-do-not-echo-originals-or-proof-data', async () => {
  const r = await fixture(), text = JSON.stringify(verify(r.token, r.before, r.execution, r.after));
  for (const marker of ['grant_', 'zenontx:', '/synthetic/', 'ServiceCredit ', 'paymentRequired']) assert.equal(text.includes(marker), false);
  assert.equal(r.token.summary.persistedLedgerAcceptance, 'NOT_EXECUTED');
});
check('stale-execution-revision-refuses', async () => { await refused(r => { r.execution = mutated(r.execution, v => { v.revision--; }); }); });
check('changed-ledger-between-bracketing-reads-refuses-even-with-a-new-valid-checksum', async () => { await refused(r => { r.after = mutated(r.after, v => { v.revision++; }); }); });
check('tampered-public-ledger-checksum-refuses', async () => { await refused(r => { r.before = r.after = mutated(r.before, v => {}); const v = JSON.parse(r.before); v.checksum = 'sha256:' + 'f'.repeat(64); r.before = r.after = canonicalJson(v); }); });
check('missing-or-extra-request-cannot-be-counted-as-100', async () => { await refused(r => { r.before = r.after = mutated(r.before, v => { v.state.requests.pop(); }); }); });
check('missing-execution-with-100-successful-ledger-rows-refuses', async () => { await refused(r => { r.execution = mutated(r.execution, v => { v.executionState.executions.pop(); }); }); });
check('another-original-payment-cannot-be-used-for-the-selected-grant', async () => { await refused(r => { r.before = r.after = mutated(r.before, v => { v.state.grants[0].activation.transactionId = 'zenontx:' + 'f'.repeat(64); }); }); });
check('changed-purchase-lifetime-does-not-renew-the-original-grant', async () => { await refused(r => { r.before = r.after = mutated(r.before, v => { v.state.grants[0].expiresAt++; }); }); });
check('changed-request-identity-refuses-even-with-the-same-request-count', async () => { await refused(r => { r.before = r.after = mutated(r.before, v => { v.state.requests[0].routeId = 'foreign'; }); }); });
check('cached-result-must-match-the-original-response-and-execution-commitment', async () => { await refused(r => { r.before = r.after = mutated(r.before, v => { v.state.requests[0].cachedResult.resultCode = 'changed'; }); }); });
check('a-successful-execution-with-another-result-commitment-refuses', async () => { await refused(r => { r.execution = mutated(r.execution, v => { v.executionState.executions[0].resultCommitment = 'sha256:' + 'f'.repeat(64); }); }); });
check('unit-counters-must-preserve-the-purchased-total-and-no-held-units', async () => { await refused(r => { r.before = r.after = mutated(r.before, v => { v.state.grants[0].consumedUnits--; v.state.grants[0].availableUnits++; }); }); });
check('unknown-or-unfenced-execution-never-becomes-a-successful-run', async () => { await refused(r => { r.execution = mutated(r.execution, v => { v.executionState.executions[0].terminalClassification = 'NONE'; v.executionState.executions[0].resultCommitment = null; }); }); });
check('canonical-bounded-snapshot-strings-are-required', async () => {
  await refused(r => { r.before = ' ' + r.before; }); await refused(r => { r.execution = 'x'.repeat(1048577); });
});
check('one-owned-read-orders-ledger-execution-ledger-and-void-close-before-output', async () => {
  const r = await fixture(), p = ports(r), observed = read(r.token, p.value);
  assert.deepEqual(p.trace, ['load', 'executions', 'load', 'close']); assert.equal(observed.storeCloseReturned, true); assert.equal(observed.physicalRelease, 'NOT_ESTABLISHED');
});
check('throwing-read-retains-the-owner-without-close-or-a-second-attempt', async () => {
  const r = await fixture(), p = ports(r, { executions() { p.trace.push('throw'); throw Error('declared read refusal'); } });
  assert.throws(() => read(r.token, p.value)); assert.deepEqual(p.trace, ['load', 'throw']); assert.throws(() => read(r.token, p.value)); assert.deepEqual(p.trace, ['load', 'throw']);
});
check('opaque-read-receipts-do-not-enter-then-getters-or-force-close', async () => {
  const r = await fixture(); let entered = 0; const opaque = { get then() { entered++; throw Error(); } };
  const p = ports(r, { load() { p.trace.push('opaque'); return opaque; } }); assert.throws(() => read(r.token, p.value)); assert.equal(entered, 0); assert.deepEqual(p.trace, ['opaque']);
});
check('known-semantic-conflict-closes-once-and-withholds-observation', async () => {
  const r = await fixture(); r.after = mutated(r.after, v => { v.revision++; }); const p = ports(r);
  assert.throws(() => read(r.token, p.value)); assert.deepEqual(p.trace, ['load', 'executions', 'load', 'close']); assert.throws(() => read(r.token, p.value)); assert.equal(p.trace.length, 4);
});
check('nonvoid-or-throwing-close-never-publishes-or-retries', async () => {
  for (const throws of [false, true]) { const r = await fixture(), p = ports(r, { close() { p.trace.push('bad-close'); if (throws) throw Error(); return true; } });
    assert.throws(() => read(r.token, p.value)); assert.throws(() => read(r.token, p.value)); assert.deepEqual(p.trace, ['load', 'executions', 'load', 'bad-close']); }
});
check('copied-tokens-and-proxy-callbacks-cannot-acquire-a-store-read', async () => {
  const r = await fixture(), p = ports(r); assert.throws(() => options({ ...r.token })); assert.throws(() => read(F({ ...r.token }), p.value));
  let entered = 0; assert.throws(() => read(r.token, new Proxy({}, { ownKeys() { entered++; return []; } }))); assert.equal(entered, 0); assert.deepEqual(p.trace, []);
});
check('successful-history-retains-none-authority-and-open-native-gates', async () => {
  const r = await fixture(), observed = verify(r.token, r.before, r.execution, r.after);
  assert.equal(observed.authority, 'NONE'); assert.equal(observed.mayDispatchService, false); assert.equal(observed.serviceDelivery, 'NOT_ESTABLISHED');
  assert.equal(observed.G1Acceptance, 'NOT_ESTABLISHED'); assert.equal(observed.G2Acceptance, 'NOT_ESTABLISHED');
});

export const createApiCreditLinuxLedgerDataFixture = fixture;
export const apiCreditLinuxLedgerDataCases = F(checks);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const c of checks) { try { await c.run(); cases.push({ id: c.id, status: 'PASS' }); }
    catch (error) { cases.push({ id: c.id, status: 'FAIL', message: String(error?.message ?? error) + (typeof error?.stage === 'string' ? ':' + error.stage : '') }); break; } }
  const failed = cases.filter(c => c.status !== 'PASS').length;
  process.stdout.write(JSON.stringify({ qualification: 'G1_LINUX_LEDGER_ACCEPTANCE_DATA', passed: cases.length - failed, failed, cases,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0,
    fixtureProvenance: 'DECLARED_MEMORY_MODEL_AND_EXECUTION_CONTRACT', LinuxAcceptance: 'NOT_ESTABLISHED', G1: 'OPEN', G2: 'OPEN' }) + '\n');
  if (failed) process.exitCode = 1;
}
