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
  if (arguments.length !== 1) fail(); return coordinate(configuration, false);
}
export async function runApiCreditSignerInspectionCoordinator(configuration) {
  if (arguments.length !== 1) fail(); return coordinate(configuration, true);
}
export async function runApiCreditRecordedResultInspectionCoordinator(configuration) {
  if (arguments.length !== 1) fail(); return coordinate(configuration, false, true);
}
export async function runApiCreditFundingInspectionCoordinator(configuration) {
  if (arguments.length !== 1) fail(); return coordinate(configuration, false, false, true);
}
export async function runApiCreditOriginalGrantQueryCoordinator(configuration) {
  if (arguments.length !== 1) fail(); return coordinate(configuration, false, false, false, true);
}
async function coordinate(configuration, signer, recorded = false, funding = false, grantQuery = false) {
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
    current: null, value: null, deadline: null, last: null, timer: null, closeRequested: false, closeReceipt: null, closed: false };
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
  async function closeKnown() {
    frame.closeRequested = true;
    const out = signal(); let terminal = false, timer = null, limit = null;
    try { limit = clock() + 1000000000n; } catch { frame.unknown = true; }
    function finish(clean) {
      if (terminal) return; terminal = true;
      if (timer !== null) { try { p.cancelTimer(timer); } catch { clean = false; } }
      out.resolve(clean);
    }
    try { frame.closeReceipt = p.close(); } catch { finish(false); }
    try { observe(frame.closeReceipt, value => {
      try { finish(value === undefined && limit !== null && clock() < limit && channelClosed()); } catch { finish(false); }
    }, () => finish(false)); } catch { finish(false); }
    if (!terminal) { try { timer = p.armTimer(1000, F(() => finish(false))); } catch { finish(false); } }
    return out.promise;
  }
  try {
    frame.deadline = clock() + BigInt(a.bootstrapMs) * 1000000n; frame.timer = p.armTimer(a.bootstrapMs, F(expire));
    await stage(g => p.readProfile(g)); const text = frame.value; frame.value = null;
    frame.prepared = decodeProfile(text); guard(); frame.stage = 'INSPECTION';
    await stage(g => { frame.inspectionEntered = true; return p.inspectOriginal(frame.prepared, g); });
    const result = captureOutput(frame.value); frame.value = null;
    if (grantQuery && ['fundingResourceUrl', 'paymentHash', 'requestId', 'checkpointDigest', 'queryDigest'].some(k => result[k] !== frame.prepared[k])) fail();
    if (funding && (result.fundingResourceUrl !== frame.prepared.fundingResourceUrl || result.paymentHash !== frame.prepared.paymentHash
      || result.recordPresent && createHash('sha256').update(result.serializedCheckpoint).digest('hex') !== frame.prepared.checkpointDigest)) fail();
    if (signer && (result.paymentId !== frame.prepared.paymentId || result.originalDigest !== frame.prepared.originalDigest || result.fundingResourceUrl !== frame.prepared.fundingResourceUrl)) fail();
    if (recorded && (result.grantId !== frame.prepared.requestKey.grantId || result.requestId !== frame.prepared.requestKey.requestId)) fail();
    guard(); frame.stage = 'OUTPUT';
    await stage(g => p.writeResult(canonicalJson(result) + '\n', g)); if (frame.value !== undefined) fail(); frame.value = null;
    frame.outputWritten = true;
  } catch { if (frame.inspectionEntered) frame.unknown = true; }
  finally {
    frame.opening = false;
    if (frame.timer !== null) { try { p.cancelTimer(frame.timer); } catch { frame.unknown = true; } }
    if (frame.prepared !== null && !frame.inspectionEntered) frame.prepared.release();
    try { frame.closed = await closeKnown(); } catch { frame.unknown = true; }
  }
  const clean = frame.closed && !frame.unknown, success = clean && frame.outputWritten;
  if (!clean) FAILED.add(frame);
  return F({ ...(grantQuery ? { apiCreditOriginalGrantQueryVersion: 1 } : funding ? { apiCreditFundingInspectionVersion: 1 } : signer ? { apiCreditSignerInspectionVersion: 1 } : recorded ? { apiCreditRecordedResultInspectionVersion: 1 } : { apiCreditRecoveryInspectionVersion: 1 }), status: success ? 'CLOSED' : clean ? 'BOOTSTRAP_REFUSED' : 'CLOSE_UNKNOWN',
    exitCode: success ? 0 : clean ? 1 : 4, stage: frame.stage, inspectionEntered: frame.inspectionEntered,
    outputWriteObserved: frame.outputWritten, channelClosedObserved: frame.closed, historicalObservation: true,
    authority: 'NONE', mayDispatchService: false, mayStartPayment: false, maySignPayment: false,
    nativeResourceRelease: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED', automaticRetry: false });
}
