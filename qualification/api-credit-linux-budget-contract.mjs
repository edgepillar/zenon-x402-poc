// Pure acceptance-only spending readback. No SQLite, clock, key or transport.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson } from '../src/canonical.js';
import { captureOriginalFundingSpendingFileProfile } from '../src/original-funding-spending-file-profile.js';
import { captureOriginalFundingSpendingSqliteProfile } from '../src/original-funding-spending-sqlite-profile.js';
import { inspectOriginalFundingSpendingState, createOriginalFundingSpendingReservations } from '../src/original-funding-spending-reservations.js';
import { captureZenonDynamicPlasmaFundingPostPreparationInput } from '../src/zenon/dynamic-plasma-funding-post-preparation-input.js';
import { captureApiCreditLedgerAcceptanceSelection, apiCreditLedgerProbeOptions,
  readApiCreditAcceptanceLedger } from './api-credit-linux-ledger-contract.mjs';

const F = Object.freeze, STATES = new WeakMap();
const VIEW = ['spendingFileOwnerVersion', 'lifecycle', 'held', 'busy', 'backendClosed', 'databaseOpen',
  'physicalCloseEntered', 'physicalCloseReturned', 'physicalRelease', 'nativeResourceCleanup', 'authority'];
function fail(stage = 'INPUT') { const e = new TypeError('API_CREDIT_LINUX_BUDGET_ACCEPTANCE'); Object.defineProperty(e, 'stage', { value: stage }); throw e; }
function record(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
function text(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 1048576 || Buffer.from(value).toString('utf8') !== value) fail(); return value;
}
const hash = value => createHash('sha256').update(value).digest('hex');
function state(token) { if (token === null || typeof token !== 'object' || types.isProxy(token) || !STATES.has(token)) fail(); return STATES.get(token); }

/** V3 retains the SAME six independently selected inputs and V2 ledger
 * preflight. Only a new clean CREATE_NEW scenario is accepted. The later
 * opener uses that declared epoch-one owner, never an identity read from SQL. */
export function captureApiCreditBudgetAcceptanceSelection(input) {
  if (arguments.length !== 1) fail();
  let stage = 'SELECTION_LEDGER';
  try {
    const ledger = captureApiCreditLedgerAcceptanceSelection(input);
    stage = 'SELECTION_SPENDING';
    const profile = JSON.parse(input.runProfile), file = captureOriginalFundingSpendingFileProfile(profile.spendingFile);
    if (file.storageProfile.mode !== 'CREATE_NEW') fail();
    const storage = captureOriginalFundingSpendingSqliteProfile(file.storageProfile);
    const options = F({ storageProfile: F({ version: 1, mode: 'OPEN_EXISTING', databasePath: storage.databasePath,
      policy: storage.policy, ownerToken: storage.ownerToken }), allowedRoot: file.allowedRoot, filePolicy: file.filePolicy });
    captureOriginalFundingSpendingFileProfile(options);
    stage = 'SELECTION_ORIGINAL';
    const command = JSON.parse(input.commands.slice(0, input.commands.indexOf('\n')));
    const selected = captureZenonDynamicPlasmaFundingPostPreparationInput(command.input, profile.configuration.storeOptions.resourceUrl);
    const accepted = selected.challenge.paymentRequired.accepts[0];
    if (selected.plannerContext.readInput.payerAddress !== storage.policy.accountId || selected.challenge.paymentRequired.accepts.length !== 1) fail();
    // Match the actual spending wrapper's captured codec bytes exactly.
    // Do not impose another key order; it can select a different original digest.
    const original = F({ paymentId: profile.spending.paymentId, originalDigest: 'sha256:' + hash(JSON.stringify(selected)),
      network: accepted.network, asset: accepted.asset, recipient: accepted.payTo, amount: accepted.amount });
    const selectionDigest = hash(canonicalJson({ ledgerSelectionDigest: ledger.summary.selectionDigest, original, options }));
    const summary = F({ ...ledger.summary, version: 3, selectionDigest, spendingProbeProcesses: 0,
      spendingReadsPerProbe: 2, spendingCurrentGuardsPerProbe: 3, persistedSpendingAcceptance: 'NOT_EXECUTED' });
    const token = F({ budgetAcceptanceVersion: 1, summary });
    STATES.set(token, { ledger, original, options, readEntered: false }); return token;
  } catch { fail(stage); }
}
export function apiCreditBudgetProbeOptions(token) {
  if (arguments.length !== 1) fail(); const s = state(token);
  return F({ ledger: apiCreditLedgerProbeOptions(s.ledger), spending: s.options });
}
/** Selected original DATA only; this cannot authorize an opener or dispatch. */
export function apiCreditBudgetExpectedOriginal(token) {
  if (arguments.length !== 1) fail(); return state(token).original;
}
export function readApiCreditAcceptanceProviderLedger(token, ports) {
  if (arguments.length !== 2) fail(); return readApiCreditAcceptanceLedger(state(token).ledger, ports);
}

/** Bracketed bytes must remain identical. Actual journal hydration supplies
 * the budget arithmetic. Observation of the recorded day grants no new day,
 * admission, release, replacement or dispatch permission. */
export function verifyApiCreditAcceptanceSpending(token, beforeText, afterText) {
  if (arguments.length !== 3) fail(); let stage = 'SPENDING_BYTES';
  try {
    const s = state(token), raw = text(beforeText); text(afterText); if (raw !== afterText) fail();
    stage = 'SPENDING_HISTORY';
    const decoded = inspectOriginalFundingSpendingState(raw, s.options.storageProfile.policy);
    if (decoded.revision < 2 || decoded.reservations.length !== 1) fail();
    const row = decoded.reservations[0];
    for (const k of Object.keys(s.original)) if (row[k] !== s.original[k]) fail();
    if (row.status !== 'SPENT') fail();
    stage = 'SPENDING_ARITHMETIC';
    const journal = createOriginalFundingSpendingReservations(decoded.policy, F({ load() { return raw; }, compareAndSwap() { fail('UNSELECTED_WRITE'); } }));
    let observed;
    try { observed = journal.inspect(decoded.lastDay); }
    finally { journal.close(); }
    if (observed.totalExposure !== s.original.amount || observed.unresolved !== 0 || observed.records !== 1 || observed.held || observed.closed
        || observed.dailyExposure !== (row.spentDay === decoded.lastDay ? s.original.amount : '0')) fail();
    return F({ spendingAcceptanceVersion: 1, status: 'SPENDING_OBSERVATION_MATCHED', selectionDigest: token.summary.selectionDigest,
      spendingDigest: hash(raw), revision: decoded.revision, records: 1, spent: 1, unresolved: 0,
      totalExposure: observed.totalExposure, dailyExposure: observed.dailyExposure, observationDay: decoded.lastDay,
      daySource: 'RECORDED_HISTORY_ONLY', authority: 'NONE', mayPrepareFunding: false, mayDispatchService: false,
      atomicSnapshot: false, physicalRelease: 'NOT_ESTABLISHED', G1Acceptance: 'NOT_ESTABLISHED', G2Acceptance: 'NOT_ESTABLISHED' });
  } catch { fail(stage); }
}

/** Attenuated fixed owner ports. An unknown read/guard/view is retained with
 * no physical close or retry. After known complete reads, semantic refusal
 * may revoke and close once, but never publishes an observation. */
export function readApiCreditAcceptanceSpending(token, ports) {
  if (arguments.length !== 2) fail(); const s = state(token); if (s.readEntered) fail();
  const p = record(ports, ['load', 'assertCurrent', 'inspect', 'revoke', 'close']);
  if (Object.values(p).some(fn => typeof fn !== 'function' || types.isProxy(fn))) fail();
  s.readEntered = true; const views = new Set(); let stage = 'SPENDING_OWNER_OPEN';
  function view(expected) {
    const raw = p.inspect(), v = record(raw, VIEW);
    if (!Object.isFrozen(raw) || views.has(raw)) fail(); views.add(raw);
    const closed = expected === 'CLOSED', revoked = expected !== 'OPEN';
    if (v.spendingFileOwnerVersion !== 1 || v.lifecycle !== expected || v.held !== false || v.busy !== false
        || v.backendClosed !== revoked || v.databaseOpen !== !closed || v.physicalCloseEntered !== closed || v.physicalCloseReturned !== closed
        || v.physicalRelease !== (closed ? 'CLOSE_RETURNED' : 'NOT_ESTABLISHED') || v.nativeResourceCleanup !== 'NOT_QUALIFIED' || v.authority !== 'NONE') fail();
  }
  function current() { if (p.assertCurrent() !== undefined) fail(); }
  try {
    view('OPEN'); stage = 'SPENDING_OWNER_READ'; current(); const before = text(p.load());
    current(); const after = text(p.load()); current(); view('OPEN');
    let observed;
    try { observed = verifyApiCreditAcceptanceSpending(token, before, after); }
    finally {
      stage = 'SPENDING_OWNER_REVOKE'; if (p.revoke() !== undefined) fail(); view('REVOKED');
      stage = 'SPENDING_OWNER_CLOSE'; if (p.close() !== undefined) fail(); view('CLOSED');
    }
    return F({ ...observed, storeCloseReturned: true });
  } catch { fail(stage); }
}
