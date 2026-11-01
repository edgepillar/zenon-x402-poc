// Pure acceptance-only contracts. No SQLite, process, transport or credential.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson } from '../src/canonical.js';
import { InMemoryServiceCreditModel } from '../src/service-credit-model.js';
import { hydrateServiceCreditExecutionContract } from '../src/service-credit-execution-contract.js';
import { captureApiCreditPurchaseExpectation } from '../src/api-credit-purchase-expectation.js';
import { captureApiCreditLinuxAcceptanceFixture } from './api-credit-linux-acceptance-contract.mjs';

const F = Object.freeze, STATES = new WeakMap();
const FIELDS = ['runProfile', 'commands', 'runReplies', 'recoveryProfile', 'recoveryReply', 'ledgerProfile'];
const REQUEST_FIELDS = ['modelVersion', 'grantId', 'requestId', 'method', 'routeId', 'canonicalBodyDigest', 'selectedContentType', 'maxCostUnits'];
function fail(stage = 'INPUT') { const e = new TypeError('API_CREDIT_LINUX_LEDGER_ACCEPTANCE'); Object.defineProperty(e, 'stage', { value: stage }); throw e; }
function same(a, b) { if (canonicalJson(a) !== canonicalJson(b)) fail(); }
function digest(value) { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
function record(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
function text(value, cap) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > cap || Buffer.from(value).toString('utf8') !== value) fail(); return value;
}
function json(value, cap = 1048576, canonical = true) {
  const root = JSON.parse(text(value, cap)); let nodes = 0;
  function visit(v, depth) {
    if (++nodes > 65536 || depth > 24) fail();
    if (typeof v === 'number' && (!Number.isSafeInteger(v) || Object.is(v, -0))) fail();
    if (v !== null && typeof v === 'object') { Object.values(v).forEach(child => visit(child, depth + 1)); F(v); }
  }
  visit(root, 0); if (canonical && canonicalJson(root) !== value) fail(); return root;
}
function state(token) { if (token === null || typeof token !== 'object' || types.isProxy(token) || !STATES.has(token)) fail(); return STATES.get(token); }

/** Explicit V2 fixture: retain the complete existing 106-command preflight and
 * derive ledger expectations from the SAME independent purchase/originals.
 * expectedCostUnits is explicit; it cannot raise any request's signed ceiling. */
export function captureApiCreditLedgerAcceptanceSelection(input) {
  if (arguments.length !== 1) fail();
  let stage = 'SELECTION_INPUT';
  try {
    const c = record(input, FIELDS), base = {};
    for (const name of FIELDS.slice(0, -1)) base[name] = c[name];
    stage = 'SELECTION_BASE'; const prior = captureApiCreditLinuxAcceptanceFixture(base);
    stage = 'SELECTION_PROFILE';
    const profile = json(c.runProfile, 262144), recovery = json(c.recoveryProfile, 65536);
    const ledger = record(json(c.ledgerProfile, 65536), ['ledgerAcceptanceVersion', 'backendOptions', 'allowedRoot', 'expectedCostUnits']);
    if (ledger.ledgerAcceptanceVersion !== 1 || ledger.expectedCostUnits !== 1
        || ledger.allowedRoot !== recovery.payerOptions.allowedRoot || ledger.backendOptions.limits.maxRequests < 100) fail();
    same(ledger.backendOptions, recovery.backendOptions);
    stage = 'SELECTION_TRANSCRIPT';
    const commands = c.commands.trimEnd().split('\n').map(s => json(s, 262144));
    const replies = c.runReplies.trimEnd().split('\n').map(s => json(s, 262144));
    const query = json(commands[1].input.originalGrantQueryProfile, 65536);
    stage = 'SELECTION_PURCHASE';
    const purchase = captureApiCreditPurchaseExpectation(profile.purchaseExpectationJson, profile.paymentRequiredHeader,
      profile.configuration.storeOptions.resourceUrl);
    // The existing wire codec already validated every original's fixed field order.
    // Parse its fields without imposing the unrelated sorted-key snapshot encoding.
    stage = 'SELECTION_REQUESTS';
    const expected = F({ grantId: commands[3].input.selectedGrantId, originalFunding: query.originalFunding, purchase,
      requests: F(commands.slice(4, 104).map((c, i) => F({ request: json(c.input.originalRequestJson, 4096, false),
        resultCode: replies[i + 4].result.resultCode, expectedCostUnits: ledger.expectedCostUnits }))) });
    for (const r of expected.requests) if (r.request.maxCostUnits < ledger.expectedCostUnits) fail();
    const inputPins = F({ ...prior.inputPins, ledgerProfile: F({ bytes: Buffer.byteLength(c.ledgerProfile),
      sha256: createHash('sha256').update(c.ledgerProfile).digest('hex') }) });
    const summary = F({ ...prior, version: 2, inputPins, ledgerProbeProcesses: 2, selectionDigest: digest(expected),
      persistedLedgerAcceptance: 'NOT_EXECUTED', authority: 'NONE' });
    const token = F({ ledgerAcceptanceVersion: 1, summary });
    STATES.set(token, { expected, readEntered: false, options: F({ ...ledger.backendOptions.limits,
      databasePath: ledger.backendOptions.databasePath, allowedRoot: ledger.allowedRoot }) });
    return token;
  } catch { fail(stage); }
}
export function apiCreditLedgerProbeOptions(token) {
  if (arguments.length !== 1) fail(); return state(token).options;
}

/** Validate actual-store output, or declared DATA in the local control suite.
 * Equal bracketing revisions do not establish atomicity or anti-rollback. */
export function verifyApiCreditAcceptanceLedger(token, beforeText, executionText, afterText) {
  if (arguments.length !== 4) fail();
  let stage = 'SNAPSHOT_INPUT';
  try {
    const s = state(token), before = record(json(beforeText), ['schemaVersion', 'revision', 'state', 'checksum']);
    const after = record(json(afterText), ['schemaVersion', 'revision', 'state', 'checksum']);
    const durable = record(json(executionText), ['revision', 'executionState']);
    if (beforeText !== afterText || before.schemaVersion !== 1 || !Number.isSafeInteger(before.revision) || before.revision < 0
        || durable.revision !== before.revision || before.checksum !== 'sha256:' + digest({ schemaVersion: 1, revision: before.revision, state: before.state })) fail();
    stage = 'LEDGER_HYDRATION';
    const forbidden = () => { fail(); };
    const model = InMemoryServiceCreditModel.fromState({ now: forbidden, deriveCost: forbidden }, before.state);
    same(model.exportState(), before.state);
    stage = 'EXECUTION_HYDRATION';
    const ledger = before.state, execution = hydrateServiceCreditExecutionContract(durable.executionState);
    same(execution, durable.executionState);
    stage = 'COUNTS';
    if (ledger.offers.length !== 1 || ledger.grants.length !== 1 || ledger.requests.length !== 100
        || execution.executions.length !== 100 || execution.generation.state !== 'OPEN') fail();
    stage = 'GRANT_TERMS';
    const grant = ledger.grants[0], expected = s.expected, p = expected.purchase;
    if (grant.grantId !== expected.grantId || grant.totalUnits !== p.totalUnits || grant.expiresAt !== p.expiresAt
        || grant.consumedUnits !== 100 || grant.heldUnits !== 0 || grant.availableUnits !== p.totalUnits - 100) fail();
    stage = 'GRANT_PURCHASE';
    for (const name of ['providerId', 'serviceId', 'resourceId', 'offerId', 'offerVersion', 'holderId', 'capabilityCommitment']) {
      if (grant[name] !== p[name] || grant.activation[name] !== p[name]) fail();
    }
    stage = 'FUNDING_POLICY';
    if (ledger.offers[0].costPolicyId !== p.costPolicyId || grant.activation.fundingPolicyId !== p.fundingPolicyId
        || grant.activation.fundingPolicyVersion !== p.fundingPolicyVersion || grant.activation.authorityRecordDigest !== p.authorityRecordDigest) fail();
    stage = 'ORIGINAL_FUNDING';
    for (const name of Object.keys(expected.originalFunding)) same(grant.activation[name], expected.originalFunding[name]);
    if (grant.transactionId !== expected.originalFunding.transactionId) fail();
    stage = 'REQUEST_EXECUTION_BINDING';
    const requests = new Map(ledger.requests.map(r => [r.requestId, r])), executions = new Map(execution.executions.map(e => [e.request.requestId, e]));
    if (requests.size !== 100 || executions.size !== 100) fail();
    for (const selected of expected.requests) {
      const r = requests.get(selected.request.requestId), e = executions.get(selected.request.requestId);
      if (!r || !e || r.state !== 'SUCCEEDED' || r.costUnits !== selected.expectedCostUnits || e.terminalClassification !== 'SUCCEEDED') fail();
      for (const name of REQUEST_FIELDS) if (r[name] !== selected.request[name] || e.request[name] !== selected.request[name]) fail();
      for (const name of ['requestDigest', 'costUnits']) if (e.request[name] !== r[name]) fail();
      same(r.cachedResult, { statusCode: 200, contentType: 'application/json', resultCode: selected.resultCode });
      const committed = 'sha256:' + createHash('sha256').update('zenon-x402:service-credit-sqlite-result-v1\0').update(canonicalJson(r.cachedResult)).digest('hex');
      if (e.resultCommitment !== committed) fail();
    }
    return F({ ledgerAcceptanceVersion: 1, status: 'LEDGER_OBSERVATION_MATCHED', selectionDigest: token.summary.selectionDigest,
      revision: before.revision, ledgerDigest: digest(before), executionDigest: digest(execution), grants: 1, requests: 100,
      successfulExecutions: 100, totalUnits: p.totalUnits, consumedUnits: 100, heldUnits: 0, availableUnits: p.totalUnits - 100,
      authority: 'NONE', mayDispatchService: false, serviceDelivery: 'NOT_ESTABLISHED', atomicSnapshot: false,
      physicalRelease: 'NOT_ESTABLISHED', G1Acceptance: 'NOT_ESTABLISHED', G2Acceptance: 'NOT_ESTABLISHED' });
  } catch { fail(stage); }
}

/** The fixed native caller supplies three existing-store read/close wrappers.
 * Missing, throwing or opaque read receipts retain the original owner. Known
 * bounded snapshots may close once even when semantic comparison refuses.
 * No unknown close is retried and no observation is published before close. */
export function readApiCreditAcceptanceLedger(token, ports) {
  if (arguments.length !== 2) fail(); const s = state(token); if (s.readEntered) fail();
  const p = record(ports, ['load', 'executions', 'close']);
  if (Object.values(p).some(fn => typeof fn !== 'function' || types.isProxy(fn))) fail();
  s.readEntered = true;
  const before = text(p.load(), 1048576), execution = text(p.executions(), 1048576), after = text(p.load(), 1048576);
  let result;
  try { result = verifyApiCreditAcceptanceLedger(token, before, execution, after); }
  finally { if (p.close() !== undefined) fail(); }
  return F({ ...result, storeCloseReturned: true });
}
