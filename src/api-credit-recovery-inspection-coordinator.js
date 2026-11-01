import { captureApiCreditRecordedResultInspectionOutput } from './api-credit-recorded-result-inspection.js';
import { types } from 'node:util';
import { createHash } from 'node:crypto';
import { decodeApiCreditFundingInspectionProfile } from './api-credit-funding-inspection-profile.js';
import { captureApiCreditFundingInspectionOutput } from './api-credit-funding-inspection-owner.js';
import { decodeApiCreditOriginalGrantQueryProfile } from './api-credit-original-grant-query-profile.js';
import { captureApiCreditOriginalGrantQueryOutput } from './api-credit-original-grant-query-owner.js';
import { canonicalJson } from './canonical.js';
import { decodeApiCreditRecoveryInspectionProfile } from './api-credit-recovery-inspection-profile.js';
import { captureServiceCreditRecoveryInspectionOutput } from './service-credit-recovery-inspection-owner.js';
import { decodeApiCreditSignerInspectionProfile } from './api-credit-signer-inspection-profile.js';
import { captureApiCreditSignerInspectionOutput } from './original-funding-signer-inspection-owner.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, PP = Promise.prototype, THEN = PP.then, FAILED = new Set();
function fail() { throw new TypeError('API_CREDIT_RECOVERY_INSPECTION_UNKNOWN'); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = DESC(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
function observe(p, yes, no) {
  if (PP.then !== THEN || DESC(Object.prototype, 'then') !== undefined || !types.isPromise(p) || types.isProxy(p)
      || Object.getPrototypeOf(p) !== PP || Reflect.ownKeys(p).some(k => k !== 'constructor')) fail();
  const d = DESC(p, 'constructor'); if (d && (!OWN(d, 'value') || d.value !== Promise)) fail();
  const bridge = Reflect.apply(THEN, p, [yes, no]); Reflect.apply(THEN, bridge, [() => {}, () => {}]);
}
function signal() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; });
  Object.defineProperty(promise, 'constructor', { value: Promise }); observe(promise, () => {}, () => {}); return { promise, resolve, reject }; }
/** Trusted fixed inspection/pipe ports only. JSON cannot select them. One
 * startup budget includes EOF, admission, native inspection and result write.
 * Expiry is observation, never cancellation or a competing store close. */
export async function runApiCreditRecoveryInspectionCoordinator(configuration) {
  if (arguments.length !== 1) fail(); return createCoordinator(configuration, false).run();
}
export async function runApiCreditSignerInspectionCoordinator(configuration) {
  if (arguments.length !== 1) fail(); return createCoordinator(configuration, true).run();
}
export async function runApiCreditRecordedResultInspectionCoordinator(configuration) {
  if (arguments.length !== 1) fail(); return createCoordinator(configuration, false, true).run();
}
export async function runApiCreditFundingInspectionCoordinator(configuration) {
  if (arguments.length !== 1) fail(); return createCoordinator(configuration, false, false, true).run();
}
export async function runApiCreditOriginalGrantQueryCoordinator(configuration) {
  if (arguments.length !== 1) fail(); return createCoordinator(configuration, false, false, false, true).run();
}
/** The same coordinator frame with a cached run and an immediate stop guard.
 * No extra store, owner, timer window, inspection, output retry or authority. */
export function createApiCreditRecoveryInspectionCoordinator(configuration) {
  if (arguments.length !== 1) fail(); return createCoordinator(configuration, false);
}
export function createApiCreditSignerInspectionCoordinator(configuration) {
  if (arguments.length !== 1) fail(); return createCoordinator(configuration, true);
}
export function createApiCreditRecordedResultInspectionCoordinator(configuration) {
  if (arguments.length !== 1) fail(); return createCoordinator(configuration, false, true);
}
export function createApiCreditFundingInspectionCoordinator(configuration) {
  if (arguments.length !== 1) fail(); return createCoordinator(configuration, false, false, true);
}
export function createApiCreditOriginalGrantQueryCoordinator(configuration) {
  if (arguments.length !== 1) fail(); return createCoordinator(configuration, false, false, false, true);
}
function createCoordinator(configuration, signer, recorded = false, funding = false, grantQuery = false) {
  if (FAILED.size >= 16) fail();
  const fd = grantQuery ? 'originalGrantQueryFd' : funding ? 'fundingInspectionFd' : signer ? 'signerInspectionFd' : recorded ? 'recordedResultFd' : 'inspectionFd', mode = grantQuery ? 'ORIGINAL_GRANT_QUERY' : funding ? 'FUNDING_INSPECT' : signer ? 'SIGNER_INSPECT' : recorded ? 'RECORDED_RESULT' : 'INSPECT';
  const c = fields(configuration, ['arguments', 'ports']), a = fields(c.arguments, ['mode', fd, 'outputFd', 'bootstrapMs']);
  if (a.mode !== mode || !Number.isSafeInteger(a.bootstrapMs) || a.bootstrapMs < 1 || a.bootstrapMs > 60000
      || [a[fd], a.outputFd].some(n => !Number.isSafeInteger(n) || n < 3 || n > 1023) || a[fd] === a.outputFd) fail();
  const decodeProfile = grantQuery ? decodeApiCreditOriginalGrantQueryProfile : funding ? decodeApiCreditFundingInspectionProfile : signer ? decodeApiCreditSignerInspectionProfile : decodeApiCreditRecoveryInspectionProfile;
  const captureOutput = grantQuery ? captureApiCreditOriginalGrantQueryOutput : funding ? captureApiCreditFundingInspectionOutput : signer ? captureApiCreditSignerInspectionOutput : recorded ? captureApiCreditRecordedResultInspectionOutput : captureServiceCreditRecoveryInspectionOutput;
  const p = fields(c.ports, ['readProfile', 'inspectOriginal', 'writeResult', 'close', 'inspect', 'clock', 'armTimer', 'cancelTimer']);
  for (const fn of Object.values(p)) if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail();
  const frame = { stage: 'PROFILE', prepared: null, inspectionEntered: false, outputWritten: false, opening: true, unknown: false,
    current: null, value: null, deadline: null, last: null, timer: null, timerCancelHandle: null, opaque: [],
    closeDeadline: null, closeRequested: false, closeReceipt: null, closeTimer: null, closed: false,
    runReceipt: null, stopRequested: false, terminal: false };
  function clock() { const n = p.clock(); if (typeof n !== 'bigint' || frame.last !== null && n < frame.last) fail(); frame.last = n; return n; }
  function expire() { if (!frame.opening) return; frame.opening = false; frame.unknown = true;
    if (frame.current !== null) frame.current.reject(Error('inspection expired')); FAILED.add(frame); }
  const guard = F(function requireOpening() {
    if (arguments.length !== 0 || !frame.opening || frame.unknown) fail();
    try { if (clock() >= frame.deadline) { expire(); fail(); } } catch { expire(); fail(); }
  });
  function stage(invoke) {
    guard(); const out = signal(); frame.current = out;
    const current = F(function requireCurrentStage() { if (arguments.length !== 0 || frame.current !== out) fail(); guard(); });
    try { observe(invoke(current), value => {
      if (frame.current !== out || !frame.opening) return;
      try { guard(); frame.current = null; frame.value = value; out.resolve(undefined); }
      catch { out.reject(Error('inspection expired')); }
    }, () => { if (frame.current === out) { frame.current = null; out.reject(Error('inspection refused')); } }); }
    catch { frame.unknown = true; frame.opening = false; out.reject(Error('inspection unknown')); }
    return out.promise;
  }
  function channelClosed() {
    const v = p.inspect(); if (v === null || typeof v !== 'object' || types.isProxy(v) || !Object.isFrozen(v)) fail();
    for (const [name, expected] of [['lifecycle', 'CLOSED'], ['held', false], ['reading', false], ['writing', false]]) {
      const d = DESC(v, name); if (!d || !OWN(d, 'value') || d.value !== expected) return false;
    }
    return true;
  }
  function keepOpaque(value) {
    frame.opaque.push(value);
    // Only observe genuine native promises; never assimilate a thenable or
    // call an opaque timer receipt as a cleanup capability.
    try { observe(value, () => {}, () => {}); } catch {}
  }
  function timerToken(value) {
    if (value === null || value === undefined || types.isPromise(value) || types.isProxy(value)) {
      frame.unknown = true; keepOpaque(value); fail();
    }
    return value;
  }
  function cancelOwnedTimer(token) {
    let value;
    try { value = p.cancelTimer(token); } catch { frame.unknown = true; throw Error('timer cancel unknown'); }
    if (value !== undefined) { frame.unknown = true; keepOpaque(value); fail(); }
  }
  function closedNow() {
    return frame.closeDeadline !== null && clock() < frame.closeDeadline && channelClosed()
      && clock() < frame.closeDeadline && channelClosed();
  }
  async function closeKnown() {
    frame.closeRequested = true;
    const out = signal(); let terminal = false, finishing = false, arming = false, requested = false, failed = false, timer = null;
    function finish(clean) {
      if (terminal) return;
      requested = true; if (clean !== true) failed = true;
      if (arming || finishing) return;
      finishing = true;
      try {
        if (!failed && !closedNow()) failed = true;
        if (timer !== null) {
          const token = timer; timer = null;
          // A reentrant expiry during cancellation sets failed while this
          // finish is active. It cannot publish a provisional clean verdict.
          cancelOwnedTimer(token);
        }
        if (!failed && !closedNow()) failed = true;
      } catch { failed = true; }
      terminal = true; finishing = false;
      if (failed) frame.unknown = true;
      out.resolve(!failed);
    }
    try { frame.closeReceipt = p.close(); } catch { finish(false); }
    try { observe(frame.closeReceipt, value => {
      if (terminal) return;
      try { finish(value === undefined && closedNow()); } catch { finish(false); }
    }, () => finish(false)); } catch { finish(false); }
    if (!terminal) {
      arming = true;
      try {
        const remaining = frame.closeDeadline === null ? 0n : frame.closeDeadline - clock();
        if (remaining <= 0n) finish(false);
        else { frame.closeTimer = p.armTimer(Number((remaining + 999999n) / 1000000n), F(() => finish(false))); timer = timerToken(frame.closeTimer); }
      } catch { finish(false); }
      finally { arming = false; }
      // An arm callback may have fired before its handle was returned. Now
      // cancel that known handle once before resolving the latched UNKNOWN.
      if (requested) finish(!failed);
    }
    return out.promise;
  }
  async function execute() {
  try {
    if (frame.stopRequested) fail();
    frame.deadline = clock() + BigInt(a.bootstrapMs) * 1000000n;
    if (frame.stopRequested) fail();
    try { frame.timer = p.armTimer(a.bootstrapMs, F(expire)); timerToken(frame.timer); }
    catch { frame.unknown = true; frame.timer = null; throw Error('timer arm unknown'); }
    await stage(g => p.readProfile(g)); const text = frame.value; frame.value = null;
    frame.prepared = decodeProfile(text); guard(); frame.stage = 'INSPECTION';
    await stage(g => { frame.inspectionEntered = true; return p.inspectOriginal(frame.prepared, g); });
    const result = captureOutput(frame.value); frame.value = null;
    if (grantQuery && ['fundingResourceUrl', 'paymentHash', 'requestId', 'checkpointDigest', 'queryDigest'].some(k => result[k] !== frame.prepared[k])) fail();
    if (funding && (result.fundingResourceUrl !== frame.prepared.fundingResourceUrl || result.paymentHash !== frame.prepared.paymentHash
      || result.recordPresent && createHash('sha256').update(result.serializedCheckpoint).digest('hex') !== frame.prepared.checkpointDigest)) fail();
    if (signer && (result.paymentId !== frame.prepared.paymentId || result.originalDigest !== frame.prepared.originalDigest || result.fundingResourceUrl !== frame.prepared.fundingResourceUrl)) fail();
    // Profile V3 selects the four-table current store. Historical output keeps
    // the existing closed V2 age grammar and carries no new authority.
    if (signer && (result.signerInspectionVersion !== (frame.prepared.signerInspectionVersion === 3 ? 2 : frame.prepared.signerInspectionVersion)
        || result.signerInspectionVersion === 2 && (result.uncertaintyAge.maximumUnresolvedAgeDays !== frame.prepared.uncertaintyAgeLimits.maximumUnresolvedAgeDays
          || result.uncertaintyAge.policyId !== frame.prepared.spendingPolicyId))) fail();
    if (recorded && (result.grantId !== frame.prepared.requestKey.grantId || result.requestId !== frame.prepared.requestKey.requestId)) fail();
    guard(); frame.stage = 'OUTPUT';
    await stage(g => p.writeResult(canonicalJson(result) + '\n', g)); if (frame.value !== undefined) fail(); frame.value = null;
    frame.outputWritten = true;
  } catch { if (frame.inspectionEntered) frame.unknown = true; }
  finally {
    frame.opening = false;
    // One absolute channel-close window includes retiring the startup timer.
    // It is never renewed by callback latency or a late clean receipt.
    try { frame.closeDeadline = clock() + 1000000000n; } catch { frame.unknown = true; }
    if (frame.timer !== null) {
      frame.timerCancelHandle = frame.timer; frame.timer = null;
      try { cancelOwnedTimer(frame.timerCancelHandle); } catch { frame.unknown = true; }
    }
    if (frame.prepared !== null && !frame.inspectionEntered) frame.prepared.release();
    try { frame.closed = await closeKnown(); if (frame.closed && !closedNow()) { frame.closed = false; frame.unknown = true; } }
    catch { frame.closed = false; frame.unknown = true; }
  }
  const clean = frame.closed && !frame.unknown, success = clean && frame.outputWritten;
  if (!clean) FAILED.add(frame);
  const result = F({ ...(grantQuery ? { apiCreditOriginalGrantQueryVersion: 1 } : funding ? { apiCreditFundingInspectionVersion: 1 } : signer ? { apiCreditSignerInspectionVersion: 1 } : recorded ? { apiCreditRecordedResultInspectionVersion: 1 } : { apiCreditRecoveryInspectionVersion: 1 }), status: success ? 'CLOSED' : clean ? 'BOOTSTRAP_REFUSED' : 'CLOSE_UNKNOWN',
    exitCode: success ? 0 : clean ? 1 : 4, stage: frame.stage, inspectionEntered: frame.inspectionEntered,
    outputWriteObserved: frame.outputWritten, channelClosedObserved: frame.closed, historicalObservation: true,
    authority: 'NONE', mayDispatchService: false, mayStartPayment: false, maySignPayment: false,
    nativeResourceRelease: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED', automaticRetry: false });
  frame.terminal = true; return result;
  }
  function stop() {
    if (frame.terminal) return;
    frame.stopRequested = true; frame.unknown = true; FAILED.add(frame); expire();
  }
  const run = F(function run() {
    if (arguments.length !== 0) fail();
    if (frame.runReceipt !== null) return frame.runReceipt;
    // Reserve the one run BEFORE clock, timer or inspection port reentry.
    const out = signal(); frame.runReceipt = out.promise; let execution;
    try {
      execution = execute();
      observe(execution, value => out.resolve(value), () => {
        frame.terminal = true; frame.unknown = true; FAILED.add(frame); out.reject(Error('inspection unknown'));
      });
    } catch { stop(); if (execution !== undefined) keepOpaque(execution); out.reject(Error('inspection unknown')); }
    return out.promise;
  });
  const requestStop = F(function requestStop() { if (arguments.length !== 0) fail(); stop(); });
  return F({ run, requestStop });
}
