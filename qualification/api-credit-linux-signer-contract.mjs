// Pure acceptance composition. Declared ports in DATA; fixed native ports later.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson } from '../src/canonical.js';
import { decodeApiCreditSignerInspectionProfile, consumeApiCreditSignerInspectionProfile,
  releaseApiCreditSignerInspectionProfile, createApiCreditSignerInspectionFilePorts } from '../src/api-credit-signer-inspection-profile.js';
import { runApiCreditSignerInspectionWithUncertaintyAgeOwner,
  captureApiCreditSignerInspectionOutput } from '../src/original-funding-signer-inspection-owner.js';
import { captureApiCreditBudgetAcceptanceSelection, apiCreditBudgetProbeOptions, apiCreditBudgetExpectedOriginal,
  readApiCreditAcceptanceProviderLedger, verifyApiCreditAcceptanceSpending } from './api-credit-linux-budget-contract.mjs';

const F = Object.freeze, STATES = new WeakMap();
const INPUT = ['runProfile', 'commands', 'runReplies', 'recoveryProfile', 'recoveryReply', 'ledgerProfile', 'signerProfile'];
function fail(stage = 'INPUT') { const e = new TypeError('API_CREDIT_LINUX_SIGNER_ACCEPTANCE'); Object.defineProperty(e, 'stage', { value: stage }); throw e; }
function record(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
const hash = text => createHash('sha256').update(text).digest('hex');
function same(a, b) { if (canonicalJson(a) !== canonicalJson(b)) fail(); }
function state(token) { if (token === null || typeof token !== 'object' || types.isProxy(token) || !STATES.has(token)) fail(); return STATES.get(token); }

/** V4 adds one independently selected V3 signer profile. Independently selected
 * handoff checkpoint/commit pins are never learned from child output or a store. */
export function captureApiCreditSignerAcceptanceSelection(input) {
  if (arguments.length !== 1) fail(); let profile = null, stage = 'SELECTION_INPUT';
  try {
    const c = record(input, INPUT), priorInput = {}; for (const k of INPUT.slice(0, -1)) priorInput[k] = c[k];
    const budget = captureApiCreditBudgetAcceptanceSelection(priorInput), options = apiCreditBudgetProbeOptions(budget);
    const original = apiCreditBudgetExpectedOriginal(budget), run = JSON.parse(c.runProfile);
    stage = 'SELECTION_SIGNER'; profile = decodeApiCreditSignerInspectionProfile(c.signerProfile);
    if (profile.signerInspectionVersion !== 3 || profile.spendingStoreProfile !== 'GRANT_RECOVERY_V1') fail();
    const captured = consumeApiCreditSignerInspectionProfile(profile);
    same(captured.fileConfiguration, options.spending);
    same(captured.expectedOriginal, { paymentId: original.paymentId, originalDigest: original.originalDigest,
      fundingResourceUrl: run.configuration.storeOptions.resourceUrl });
    stage = 'SELECTION_ORIGINAL';
    const commands = c.commands.trimEnd().split('\n').map(JSON.parse), retained = commands[3].input.originalPayment;
    const expected = F({ transactionHash: commands[1].input.expectedPins.binding.paymentHash, serializedCheckpoint: retained.serializedCheckpoint,
      expectedPins: commands[1].input.expectedPins, expectedOriginal: captured.expectedOriginal,
      maximumUnresolvedAgeDays: captured.uncertaintyAgeLimits.maximumUnresolvedAgeDays,
      policyId: options.spending.storageProfile.policy.policyId });
    const selectionDigest = hash(canonicalJson({ budgetSelectionDigest: budget.summary.selectionDigest, expected,
      signerProfileSha256: hash(c.signerProfile) }));
    const summary = F({ ...budget.summary, version: 4, selectionDigest, budgetSelectionDigest: budget.summary.selectionDigest,
      inputPins: F({ ...budget.summary.inputPins, signerProfile: F({ bytes: Buffer.byteLength(c.signerProfile), sha256: hash(c.signerProfile) }) }),
      spendingCurrentGuardsPerProbe: 4, signerReadsPerProbe: 1, additionalProbeProcesses: 0, additionalDatabaseConnections: 0,
      signerHistoryAcceptance: 'NOT_EXECUTED', signerResponseLoss: 'NOT_ESTABLISHED' });
    const token = F({ signerAcceptanceVersion: 1, summary });
    STATES.set(token, { budget, expected, signerText: c.signerProfile, readEntered: false }); return token;
  } catch { fail(stage); }
  finally { if (profile !== null) releaseApiCreditSignerInspectionProfile(profile); }
}
export function apiCreditSignerAcceptanceLedgerOptions(token) {
  if (arguments.length !== 1) fail(); return apiCreditBudgetProbeOptions(state(token).budget).ledger;
}
/** Parent-selected remaining opening allowance; this is an observed budget,
 * not a preemptive timeout or an OS/process lifetime guarantee. */
export function captureApiCreditSignerProbeEnvelope(value) {
  if (arguments.length !== 1) fail(); const c = record(value, ['version', 'maximumOpenMs', 'selection']);
  if (c.version !== 1 || !Number.isSafeInteger(c.maximumOpenMs) || Object.is(c.maximumOpenMs, -0)
      || c.maximumOpenMs < 1 || c.maximumOpenMs > 120000) fail();
  return F({ maximumOpenMs: c.maximumOpenMs, selection: captureApiCreditSignerAcceptanceSelection(c.selection) });
}
export function readApiCreditSignerAcceptanceProviderLedger(token, ports) {
  if (arguments.length !== 2) fail(); return readApiCreditAcceptanceProviderLedger(state(token).budget, ports);
}

function data(value, name) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || !Object.isFrozen(value)) fail();
  const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); return d.value;
}
function method(value, name, frozen = true) {
  const fn = data(value, name); if (typeof fn !== 'function' || types.isProxy(fn) || frozen && !Object.isFrozen(fn)) fail(); return fn;
}
/** Observe only the existing reader. Opaque/unreturned owners pass untouched
 * to the actual owner protocol, which retains unknown receipts. No fallback,
 * raw close, writer, signing method or second acquisition is provided. */
function tapSpendingReads(owner, reads) {
  let backend, load, custody, signerRead, inspect, current, revoke, close;
  try {
    backend = data(owner, 'backend'); load = method(backend, 'load', false); custody = data(owner, 'signerCustody');
    if (data(custody, 'requirePreparationContext') !== true) return owner;
    signerRead = method(custody, 'readSignerRecord'); inspect = method(owner, 'inspect'); current = method(owner, 'assertCurrent');
    revoke = method(owner, 'revoke'); close = method(owner, 'close');
  } catch { return owner; }
  const invoke = fn => F(() => Reflect.apply(fn, owner, []));
  return F({ backend: F({ load(account) {
    const value = Reflect.apply(load, backend, [account]);
    if (value === null || typeof value === 'string' && Buffer.byteLength(value) <= 1048576) {
      if (reads.length >= 2) fail(); reads.push(value);
    }
    return value;
  } }), signerCustody: F({ requirePreparationContext: true, readSignerRecord: F(id => Reflect.apply(signerRead, custody, [id])) }),
  inspect: invoke(inspect), assertCurrent: invoke(current), revoke: invoke(revoke), close: invoke(close) });
}

/** Run the actual V3 selector and same-owned age/history inspection once.
 * Its two bounded journal reads feed the existing monetary verifier after
 * the same owner's known close. No additional file connection is opened. */
export function readApiCreditAcceptanceSignerSpending(token, ports) {
  if (arguments.length !== 2) fail(); const s = state(token); if (s.readEntered) fail();
  const p = record(ports, ['openers', 'requireOpening', 'readDay']);
  for (const fn of [p.requireOpening, p.readDay]) if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail();
  const open = record(p.openers, ['signerContext', 'grantRecovery']);
  if (!Object.isFrozen(p.openers) || Object.values(open).some(fn => typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn))) fail();
  s.readEntered = true; let profile = null, stage = 'SIGNER_READ';
  try {
    profile = decodeApiCreditSignerInspectionProfile(s.signerText); const c = consumeApiCreditSignerInspectionProfile(profile), reads = [];
    const selected = createApiCreditSignerInspectionFilePorts(c, p.requireOpening, F({ signerContext: open.signerContext,
      grantRecovery: F(configuration => tapSpendingReads(Reflect.apply(open.grantRecovery, undefined, [configuration]), reads)) }));
    const result = runApiCreditSignerInspectionWithUncertaintyAgeOwner({ fileConfiguration: c.fileConfiguration,
      expectedOriginal: c.expectedOriginal, uncertaintyAgeLimits: c.uncertaintyAgeLimits, ports: selected,
      requireOpening: p.requireOpening, readDay: p.readDay });
    stage = 'SIGNER_ORIGINAL'; captureApiCreditSignerInspectionOutput(result);
    if (result.status !== 'SIGNED_DATA' || result.spendingOriginalStatus !== 'SPENT' || reads.length !== 2) fail();
    for (const k of ['paymentId', 'originalDigest', 'fundingResourceUrl']) if (result[k] !== s.expected.expectedOriginal[k]) fail();
    for (const k of ['transactionHash', 'serializedCheckpoint']) if (result[k] !== s.expected[k]) fail();
    same(result.expectedPins, s.expected.expectedPins);
    if (result.uncertaintyAge.maximumUnresolvedAgeDays !== s.expected.maximumUnresolvedAgeDays || result.uncertaintyAge.policyId !== s.expected.policyId) fail();
    stage = 'SPENDING_ORIGINAL'; const spending = verifyApiCreditAcceptanceSpending(s.budget, reads[0], reads[1]);
    const historyDigest = hash(canonicalJson({ ...s.expected.expectedOriginal, transactionHash: result.transactionHash,
      serializedCheckpoint: result.serializedCheckpoint, expectedPins: result.expectedPins }));
    // Current UTC observations are checked by the owner, not part of the stable
    // historical digest. A normal read across midnight is not new history.
    return F({ spending: F({ ...spending, budgetSelectionDigest: spending.selectionDigest,
      selectionDigest: token.summary.selectionDigest, storeCloseReturned: true }), signer: F({ signerAcceptanceVersion: 1,
      status: 'SIGNED_HISTORY_OBSERVATION_MATCHED', historyDigest, existingFileProfile: 'GRANT_RECOVERY_V1',
      sharedExistingFileOwner: true, storeCloseReturned: true, agePolicyCheckedByOwner: true,
      authority: 'NONE', mayStartPayment: false, maySignPayment: false, mayDispatchFunding: false, mayDispatchService: false, automaticRetry: false,
      signatureValidation: 'NOT_PERFORMED', physicalRelease: 'NOT_ESTABLISHED', signerResponseLoss: 'NOT_ESTABLISHED' }) });
  } catch { fail(stage); }
  finally { if (profile !== null) releaseApiCreditSignerInspectionProfile(profile); }
}
