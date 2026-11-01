// Actual pure preflight and existing product codecs. All application/store,
// grant, proof and response bytes below are declared memory DATA.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { encodeBuyerApiCreditCommand, encodeBuyerApiCreditCommandResult } from '../src/buyer-original-funding-command.js';
import { apiCreditOperatorDataFixtures, closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { resultInspectionFixture } from './api-credit-recorded-result-inspection.fixture.mjs';
import { purchasedGrantRecoveryData } from './purchased-grant-recovery.fixture.mjs';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { purchaseExpectationFixture } from './api-credit-purchase-expectation.fixture.mjs';
import { captureApiCreditLinuxAcceptanceFixture as capture } from './api-credit-linux-acceptance-contract.mjs';

const F = Object.freeze, checks = [], copy = v => JSON.parse(JSON.stringify(v));
let original = null;
function frozen(v) { if (v && typeof v === 'object') { Object.values(v).forEach(frozen); F(v); } return v; }
function command(id, operation, input = {}) { return { version: 1, id, operation, input }; }
function check(id, run) { checks.push(F({ id, run })); }
async function fixture() {
  if (original === null) {
    const r = await resultInspectionFixture(), profile = apiCreditOperatorDataFixtures.publicData();
    const funding = profile.configuration.fundingOptions;
    funding.expectedPublicKey = funding.materialOptions.publicKey; delete funding.materialOptions; delete funding.materialWaitMs;
    const purchase = purchaseExpectationFixture(), f = retainedOriginalInputFixture({ resourceUrl: purchase.resourceUrl, paymentRequired: purchase.paymentRequired });
    const ready = purchasedGrantRecoveryData(); assert.equal(ready.packet.serializedCheckpoint, r.packet.serializedCheckpoint);
    const selection = copy(r.raw.selection), rawRecovery = copy(r.raw);
    rawRecovery.payerOptions.allowedRoot = profile.configuration.storeOptions.allowedRoot;
    rawRecovery.payerOptions.databasePath = profile.configuration.storeOptions.databasePath;
    rawRecovery.backendOptions.databasePath = rawRecovery.payerOptions.allowedRoot + '/backend.sqlite';
    const commands = [command('prepare', 'prepare', f.input),
      command('commit', 'commit', { expectedPins: r.packet.expectedPins, originalGrantQueryProfile: ready.text }),
      command('funding', 'submitFunding', { expectedPins: r.packet.expectedPins }), command('handoff', 'handoff', selection)];
    const results = [{ phase: 'AWAITING_INDEPENDENT_PINS', packet: r.packet }, { phase: 'LOCAL_STORE_READBACK_MATCHED' },
      { phase: 'FUNDING_INTAKE_BOUND', fundingIntakeStatus: 'BOUND', transactionHash: r.packet.transactionHash },
      { phase: 'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED' }];
    const proof = JSON.parse(Buffer.from(r.input.authorizationHeader.slice('ServiceCredit '.length), 'base64url'));
    for (let i = 0; i < 100; i++) {
      const requestId = i === 0 ? r.input.requestId : 'item.' + i;
      const request = { ...JSON.parse(r.input.originalRequestJson), requestId };
      const input = { ...r.input, requestId, originalRequestJson: JSON.stringify(request),
        authorizationHeader: 'ServiceCredit ' + Buffer.from(JSON.stringify({ ...proof, requestId })).toString('base64url') };
      commands.push(command('call.' + i, 'submitService', input));
      results.push({ apiCreditServiceResultVersion: 1, grantId: input.grantId, requestId,
        responseJson: JSON.stringify({ ok: true, resultCode: 'api.' + requestId }), resultCode: 'api.' + requestId,
        replayed: false, newDispatchRequested: true, source: 'LOCAL_RECORDED_RESPONSE', authority: 'NONE', serviceDelivery: 'NOT_ESTABLISHED' });
    }
    commands.push(command('replay', 'submitService', commands[4].input), command('close', 'close'));
    results.push({ ...results[4], replayed: true, newDispatchRequested: false });
    const recovered = await r.run();
    original = F({ runProfile: canonicalJson(profile), commands: commands.map(c => encodeBuyerApiCreditCommand(c)).join(''),
      runReplies: results.map((v, i) => encodeBuyerApiCreditCommandResult(commands[i], frozen(v))).join(''),
      recoveryProfile: canonicalJson(rawRecovery), recoveryReply: canonicalJson(recovered) + '\n' });
    await closeApiCreditOperatorDataFixtures();
  }
  return { ...original };
}
function editRows(text, index, change) { const rows = text.trimEnd().split('\n'), value = JSON.parse(rows[index]); change(value); rows[index] = canonicalJson(value); return rows.join('\n') + '\n'; }
async function refused(edit) { const f = await fixture(); edit(f); assert.throws(() => capture(f), /API_CREDIT_LINUX_ACCEPTANCE_PREFLIGHT/); }

check('real-106-command-grammar-validates-100-distinct-originals-one-replay-and-keyless-read', async () => {
  const f = await fixture(), result = capture(f); assert.equal(result.status, 'PREFLIGHT_PASS');
  assert.deepEqual([result.commandFrames, result.runReplyFrames, result.distinctRequests, result.exactReplays], [106, 105, 100, 1]);
  assert.equal(result.freshReadProcesses, 1); assert.equal(result.credentialProcesses, 1); assert.equal(Object.isFrozen(result), true);
});
check('fixture-pins-bind-every-exact-private-input-without-echoing-it', async () => {
  const f = await fixture(), result = capture(f), text = JSON.stringify(result);
  for (const [name, value] of Object.entries(f)) assert.equal(result.inputPins[name].bytes, Buffer.byteLength(value));
  for (const forbidden of ['ServiceCredit ', 'serializedCheckpoint', '/synthetic/', 'DECLARED_INVALID_SIGNATURE_BYTES']) assert.equal(text.includes(forbidden), false);
  assert.equal(result.candidatePinsAutomaticallyAdopted, false); assert.equal(result.G1Acceptance, 'NOT_ESTABLISHED'); assert.equal(result.G2Acceptance, 'NOT_ESTABLISHED');
});
check('accessor-proxy-and-extra-field-inputs-never-enter-user-code', async () => {
  const f = await fixture(); let entered = 0;
  Object.defineProperty(f, 'commands', { enumerable: true, get() { entered++; return original.commands; } }); assert.throws(() => capture(f));
  assert.throws(() => capture(new Proxy({}, { ownKeys() { entered++; return []; } })));
  assert.throws(() => capture({ ...original, credential: 'not accepted' })); assert.equal(entered, 0);
});
check('missing-or-extra-command-never-becomes-a-shorter-product-scenario', async () => {
  await refused(f => { f.commands = f.commands.split('\n').slice(1).join('\n'); });
  await refused(f => { f.commands += f.commands.split('\n')[0] + '\n'; });
});
check('missing-close-and-a-second-funding-attempt-refuse', async () => {
  await refused(f => { f.commands = editRows(f.commands, 105, c => { c.operation = 'inspect'; }); });
  await refused(f => { f.commands = editRows(f.commands, 104, c => { c.operation = 'submitFunding'; c.input = JSON.parse(f.commands.split('\n')[2]).input; }); });
});
check('duplicate-correlation-ids-refuse-before-a-child-or-key', async () => { await refused(f => { f.commands = editRows(f.commands, 5, c => { c.id = 'call.0'; }); }); });
check('99-distinct-requests-plus-an-early-repeat-cannot-count-as-100', async () => {
  await refused(f => { const first = JSON.parse(f.commands.split('\n')[4]); f.commands = editRows(f.commands, 5, c => { c.input = first.input; }); });
});
check('a-replay-must-retain-the-complete-original-proof-and-request-bytes', async () => {
  await refused(f => { const second = JSON.parse(f.commands.split('\n')[5]); f.commands = editRows(f.commands, 104, c => { c.input = second.input; }); });
});
check('modified-grant-and-proof-identities-refuse', async () => {
  await refused(f => { f.commands = editRows(f.commands, 4, c => { c.input.grantId = 'foreign'; }); });
  await refused(f => { f.commands = editRows(f.commands, 4, c => { c.input.authorizationHeader += 'x'; }); });
});
check('a-first-call-marked-replayed-cannot-hide-absent-dispatch-observation', async () => {
  await refused(f => { f.runReplies = editRows(f.runReplies, 4, r => { r.result.replayed = true; r.result.newDispatchRequested = false; }); });
});
check('the-exact-replay-cannot-claim-another-dispatch', async () => {
  await refused(f => { f.runReplies = editRows(f.runReplies, 104, r => { r.result.replayed = false; r.result.newDispatchRequested = true; }); });
});
check('changed-replay-result-bytes-are-not-the-historical-response', async () => {
  await refused(f => { f.runReplies = editRows(f.runReplies, 104, r => { r.result.resultCode = 'changed'; r.result.responseJson = '{"ok":true,"resultCode":"changed"}'; }); });
});
check('unexpected-missing-or-a-close-result-frame-refuses', async () => {
  await refused(f => { f.runReplies += f.runReplies.split('\n')[0] + '\n'; });
  await refused(f => { f.runReplies = f.runReplies.split('\n').slice(1).join('\n'); });
});
check('reply-correlation-and-order-are-exact', async () => {
  await refused(f => { f.runReplies = editRows(f.runReplies, 4, r => { r.id = 'call.1'; }); });
  await refused(f => { const rows = f.runReplies.split('\n'); [rows[4], rows[5]] = [rows[5], rows[4]]; f.runReplies = rows.join('\n'); });
});
check('unknown-funding-is-not-a-clean-handoff-fixture', async () => {
  await refused(f => { f.runReplies = editRows(f.runReplies, 2, r => { r.result.fundingIntakeStatus = 'UNKNOWN'; }); });
});
check('declared-success-does-not-become-delivery-or-grant-authority', async () => {
  await refused(f => { f.runReplies = editRows(f.runReplies, 2, r => { r.result.grant = 'ESTABLISHED'; }); });
  await refused(f => { f.runReplies = editRows(f.runReplies, 4, r => { r.result.authority = 'DISPATCH'; }); });
});
check('prepare-output-cannot-silently-select-new-independent-pins', async () => {
  await refused(f => { f.runReplies = editRows(f.runReplies, 0, r => { r.result.candidatePins = {}; }); });
  await refused(f => {
    f.runReplies = editRows(f.runReplies, 0, r => { r.result.transactionHash = 'f'.repeat(64); });
    f.runReplies = editRows(f.runReplies, 2, r => { r.result.transactionHash = 'f'.repeat(64); });
  });
});
check('committed-pins-and-submit-pins-must-be-the-same-predeclared-original', async () => {
  await refused(f => { f.commands = editRows(f.commands, 2, c => { c.input.expectedPins = {}; }); });
});
check('ready-query-profile-must-pass-the-existing-original-byte-contract', async () => {
  await refused(f => { f.commands = editRows(f.commands, 1, c => { c.input.originalGrantQueryProfile = '{}'; }); });
});
check('fresh-read-uses-the-same-checkpoint-grant-and-original-header', async () => {
  await refused(f => { const r = JSON.parse(f.recoveryProfile); r.selection.paymentRequiredHeader += 'A'; f.recoveryProfile = canonicalJson(r); });
});
check('fresh-read-cannot-select-a-second-request-or-a-new-proof', async () => {
  await refused(f => { const r = JSON.parse(f.recoveryProfile); r.requestKey.requestId = 'item.1'; f.recoveryProfile = canonicalJson(r); });
  await refused(f => { const r = JSON.parse(f.recoveryProfile); r.authorizationHeader += 'x'; f.recoveryProfile = canonicalJson(r); });
});
check('fresh-read-must-reopen-the-original-payer-file', async () => {
  await refused(f => { const r = JSON.parse(f.recoveryProfile); r.payerOptions.databasePath = r.payerOptions.allowedRoot + '/other.sqlite'; f.recoveryProfile = canonicalJson(r); });
});
check('backend-only-cache-does-not-prove-the-retained-local-response', async () => {
  await refused(f => { const r = JSON.parse(f.recoveryReply); r.source = 'BACKEND_CACHE'; r.responseJson = null; f.recoveryReply = canonicalJson(r) + '\n'; });
});
check('recovered-result-must-match-the-first-original-result-byte-for-byte', async () => {
  await refused(f => { const r = JSON.parse(f.recoveryReply); r.cachedResult.resultCode = 'changed'; r.responseJson = '{"ok":true,"resultCode":"changed"}'; f.recoveryReply = canonicalJson(r) + '\n'; });
});
check('recovered-success-retains-all-no-authority-and-uncertainty-fields', async () => {
  await refused(f => { const r = JSON.parse(f.recoveryReply); r.mayDispatchService = true; f.recoveryReply = canonicalJson(r) + '\n'; });
});
check('canonical-framing-and-eof-are-required-in-each-transcript', async () => {
  for (const name of ['commands', 'runReplies', 'recoveryReply']) await refused(f => { f[name] = f[name].slice(0, -1); });
  await refused(f => { f.runReplies = ' ' + f.runReplies; });
});
check('non-dp-public-bootstrap-keeps-work-fields-out-of-the-product-run', async () => {
  await refused(f => { const r = JSON.parse(f.runProfile); r.configuration.fundingOptions.materialWaitMs = 1; f.runProfile = canonicalJson(r); });
});
check('configured-byte-limits-are-not-raised-for-the-harness', async () => {
  await refused(f => { const r = JSON.parse(f.runProfile); r.limits = { maxLineBytes: 256 }; f.runProfile = canonicalJson(r); });
});

export const createApiCreditLinuxAcceptanceDataFixture = fixture;
export const apiCreditLinuxAcceptanceDataCases = F(checks);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const c of checks) { try { await c.run(); cases.push({ id: c.id, status: 'PASS' }); }
    catch (error) { cases.push({ id: c.id, status: 'FAIL', message: String(error?.message ?? error) }); break; } }
  await closeApiCreditOperatorDataFixtures();
  const failed = cases.filter(c => c.status !== 'PASS').length;
  process.stdout.write(JSON.stringify({ qualification: 'G1_LINUX_CLI_ACCEPTANCE_PREFLIGHT_DATA', passed: cases.length - failed, failed, cases,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0,
    fixtureProvenance: 'DECLARED_MEMORY_PORTS_AND_UNAUTHENTICATED_PROOF_DATA', LinuxAcceptance: 'NOT_ESTABLISHED', G1: 'OPEN', G2: 'OPEN' }) + '\n');
  if (failed) process.exitCode = 1;
}
