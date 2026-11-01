// Pure preflight for the real two-process CLI harness. It opens no resource.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson } from '../src/canonical.js';
import { decodeBuyerApiCreditCommand } from '../src/buyer-original-funding-command.js';
import { decodeNonDpApiCreditOperatorBootstrap } from '../src/api-credit-operator-bootstrap.js';
import { captureApiCreditServiceCommand, decodeApiCreditServiceCommandResult } from '../src/api-credit-service-command.js';
import { decodeApiCreditRecoveryInspectionProfile, consumeApiCreditRecoveryInspectionProfile,
  releaseApiCreditRecoveryInspectionProfile } from '../src/api-credit-recovery-inspection-profile.js';
import { captureApiCreditRecordedResultInspectionOutput } from '../src/api-credit-recorded-result-inspection.js';
import { decodeApiCreditOriginalGrantQueryProfile, releaseApiCreditOriginalGrantQueryProfile } from '../src/api-credit-original-grant-query-profile.js';

const F = Object.freeze;
const NAMES = ['runProfile', 'commands', 'runReplies', 'recoveryProfile', 'recoveryReply'];
const CAPS = [262144, 2097152, 2097152, 65536, 4096];
const EXPECTED_PHASES = ['AWAITING_INDEPENDENT_PINS', 'LOCAL_STORE_READBACK_MATCHED',
  'FUNDING_INTAKE_BOUND', 'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED'];
function fail() { throw new TypeError('API_CREDIT_LINUX_ACCEPTANCE_PREFLIGHT'); }
function same(a, b) { if (canonicalJson(a) !== canonicalJson(b)) fail(); }
function freeze(value) {
  if (value !== null && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); F(value); }
  return value;
}
function json(text, cap) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > cap || Buffer.from(text).toString('utf8') !== text) fail();
  const value = JSON.parse(text); let nodes = 0;
  function visit(v, depth) {
    if (++nodes > 16384 || depth > 24) fail();
    if (v !== null && typeof v === 'object') for (const child of Object.values(v)) visit(child, depth + 1);
    else if (typeof v === 'number' && (!Number.isSafeInteger(v) || Object.is(v, -0))) fail();
  }
  visit(value, 0); if (canonicalJson(value) !== text) fail(); return freeze(value);
}
function lines(text, cap, count, maxLineBytes) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > cap || !text.endsWith('\n')
      || Buffer.from(text).toString('utf8') !== text) fail();
  const rows = text.slice(0, -1).split('\n');
  if (rows.length !== count || rows.some(row => row.length === 0 || Buffer.byteLength(row) > maxLineBytes)) fail();
  return rows;
}
function noAuthority(result) {
  if (result.authority !== 'NONE' || result.serviceDelivery !== 'NOT_ESTABLISHED') fail();
}
function shape(value, names) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== names.length || names.some(name => !Object.hasOwn(value, name))) fail();
}

/** All expectations are supplied BEFORE launch. In particular, a prepare
 * response cannot become independent pins, a grant, a proof or a retry plan.
 * The returned digests are private fixture bindings, not authenticity proof. */
export function captureApiCreditLinuxAcceptanceFixture(input) {
  if (arguments.length !== 1 || input === null || typeof input !== 'object' || types.isProxy(input)
      || Object.getPrototypeOf(input) !== Object.prototype || Reflect.ownKeys(input).length !== NAMES.length) fail();
  const texts = {};
  for (let i = 0; i < NAMES.length; i++) {
    const name = NAMES[i], d = Object.getOwnPropertyDescriptor(input, name);
    if (!d?.enumerable || !Object.hasOwn(d, 'value') || typeof d.value !== 'string'
        || Buffer.byteLength(d.value) > CAPS[i] || Buffer.from(d.value).toString('utf8') !== d.value) fail();
    texts[name] = d.value;
  }
  let bootstrap = null, recovery = null, query = null;
  try {
    bootstrap = decodeNonDpApiCreditOperatorBootstrap(texts.runProfile);
    const profile = json(texts.runProfile, CAPS[0]), limits = bootstrap.limits;
    const commandRows = lines(texts.commands, limits.maxInputBytes, 106, limits.maxLineBytes);
    const replyRows = lines(texts.runReplies, limits.maxOutputBytes, 105, limits.maxLineBytes);
    const commands = commandRows.map(row => decodeBuyerApiCreditCommand(row, limits.maxLineBytes));
    const replies = replyRows.map(row => json(row, limits.maxLineBytes));
    if (new Set(commands.map(c => c.id)).size !== 106) fail();
    for (let i = 0; i < commands.length; i++) {
      const expected = i < 4 ? ['prepare', 'commit', 'submitFunding', 'handoff'][i] : i === 105 ? 'close' : 'submitService';
      if (commands[i].operation !== expected) fail();
      if (i < 105) {
        const r = replies[i]; shape(r, ['version', 'id', 'operation', 'outcome', 'result']);
        if (r.version !== 1 || r.id !== commands[i].id || r.operation !== expected || r.outcome !== 'CALLBACK_RETURNED') fail();
        noAuthority(r.result);
      }
    }
    for (let i = 0; i < 4; i++) if (replies[i].result.phase !== EXPECTED_PHASES[i]) fail();
    const prepared = replies[0].result;
    shape(prepared, ['phase', 'authority', 'serviceDelivery', 'serializedCheckpoint', 'paymentRequiredHeader',
      'candidatePins', 'independentPinsRequired', 'persistence', 'transactionHash']);
    if (prepared.independentPinsRequired !== true || prepared.persistence !== 'NOT_PERFORMED'
        || prepared.paymentRequiredHeader !== profile.paymentRequiredHeader) fail();
    shape(replies[1].result, ['phase', 'authority', 'serviceDelivery', 'publication']);
    if (replies[1].result.publication !== 'NOT_PERFORMED') fail();
    shape(replies[2].result, ['phase', 'authority', 'serviceDelivery', 'fundingIntakeStatus', 'chainPublication', 'inclusion', 'grant', 'transactionHash']);
    if (replies[2].result.fundingIntakeStatus !== 'BOUND' || replies[2].result.chainPublication !== 'NOT_ESTABLISHED'
        || replies[2].result.inclusion !== 'NOT_ESTABLISHED' || replies[2].result.grant !== 'NOT_ESTABLISHED'
        || replies[2].result.transactionHash !== prepared.transactionHash) fail();
    shape(replies[3].result, ['phase', 'authority', 'serviceDelivery', 'grantActivation']);
    if (replies[3].result.grantActivation !== 'NOT_ESTABLISHED') fail();
    const committed = commands[1].input, submitted = commands[2].input, handoff = commands[3].input;
    if (typeof committed.originalGrantQueryProfile !== 'string') fail();
    query = decodeApiCreditOriginalGrantQueryProfile(committed.originalGrantQueryProfile);
    if (query.originalGrantQueryVersion !== 1 || query.paymentHash !== prepared.transactionHash) fail();
    const readyQuery = json(committed.originalGrantQueryProfile, 65536);
    same(readyQuery.originalPayment, handoff.originalPayment);
    same(committed.expectedPins, submitted.expectedPins); same(committed.expectedPins, prepared.candidatePins);
    same(handoff.originalPayment.expectedPins, committed.expectedPins);
    if (handoff.originalPayment.serializedCheckpoint !== prepared.serializedCheckpoint
        || handoff.originalPayment.resourceUrl !== profile.configuration.storeOptions.resourceUrl
        || handoff.paymentRequiredHeader !== profile.paymentRequiredHeader) fail();
    const service = [], requestIds = new Set();
    for (let i = 4; i <= 104; i++) {
      const c = commands[i], captured = captureApiCreditServiceCommand({ id: c.id,
        serviceResourceUrl: c.input.serviceResourceUrl, originalRequestJson: c.input.originalRequestJson,
        authorizationHeader: c.input.authorizationHeader, maxLineBytes: limits.maxLineBytes });
      same(c, captured.command);
      if (c.input.grantId !== handoff.selectedGrantId || c.input.serviceResourceUrl !== bootstrap.product.serviceResourceUrl) fail();
      const result = decodeApiCreditServiceCommandResult(captured, replyRows[i] + '\n');
      if (i < 104) {
        if (requestIds.has(c.input.requestId) || result.replayed || !result.newDispatchRequested) fail();
        requestIds.add(c.input.requestId); service.push(result);
      } else {
        same(c.input, commands[4].input);
        same(result, { ...service[0], replayed: true, newDispatchRequested: false });
      }
    }
    if (requestIds.size !== 100) fail();
    recovery = decodeApiCreditRecoveryInspectionProfile(texts.recoveryProfile);
    const retained = consumeApiCreditRecoveryInspectionProfile(recovery), rawRecovery = json(texts.recoveryProfile, CAPS[3]);
    same(rawRecovery.selection, handoff);
    same(retained.manifest.requestKey, { grantId: commands[4].input.grantId, requestId: commands[4].input.requestId });
    if (retained.serializedCheckpoint !== prepared.serializedCheckpoint
        || retained.authorizationHeader !== commands[4].input.authorizationHeader
        || retained.manifest.payerDatabasePath !== profile.configuration.storeOptions.databasePath) fail();
    const recoveredRows = lines(texts.recoveryReply, CAPS[4], 1, 4095);
    const recovered = captureApiCreditRecordedResultInspectionOutput(json(recoveredRows[0], 4095));
    if (!recovered.resultAvailable || recovered.source !== 'LOCAL_RESPONSE_AND_BACKEND_CACHE'
        || recovered.responseJson !== service[0].responseJson || recovered.cachedResult.resultCode !== service[0].resultCode
        || recovered.grantId !== commands[4].input.grantId || recovered.requestId !== commands[4].input.requestId) fail();
    const inputs = {};
    for (const name of NAMES) inputs[name] = F({ bytes: Buffer.byteLength(texts[name]), sha256: createHash('sha256').update(texts[name]).digest('hex') });
    return F({ version: 1, status: 'PREFLIGHT_PASS', inputPins: F(inputs), commandFrames: 106, runReplyFrames: 105,
      distinctRequests: 100, exactReplays: 1, freshReadProcesses: 1, credentialProcesses: 1,
      candidatePinsAutomaticallyAdopted: false, authority: 'NONE', G1Acceptance: 'NOT_ESTABLISHED', G2Acceptance: 'NOT_ESTABLISHED' });
  } catch { fail(); }
  finally {
    if (bootstrap !== null) bootstrap.release(); if (recovery !== null) releaseApiCreditRecoveryInspectionProfile(recovery);
    if (query !== null) releaseApiCreditOriginalGrantQueryProfile(query);
  }
}
