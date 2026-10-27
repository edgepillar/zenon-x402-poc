import { types as utilTypes } from 'node:util';
import { hrtime } from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { createBuyerOwnedPipeStreams } from './buyer-owned-pipe-streams.js';
import { createBuyerCommandLineChannel } from './buyer-command-line-channel.js';
import { decodeBuyerOriginalRecoveryPipeBootstrap, captureBuyerOriginalRecoveryPipeRoot } from './buyer-original-recovery-pipe-bootstrap.js';
import { createBuyerOriginalRecoveryClient, createBuyerOriginalBackendRecoveryClient } from './buyer-original-recovery-client.js';
import { createBuyerOriginalRecoveryCommandSession,
  createBuyerOriginalBackendRecoveryCommandSession } from './buyer-original-funding-command-session.js';
import { runBuyerOriginalCommandHost } from './buyer-original-command-host.js';
import { createServiceCreditBoundedCloseCompletion } from './service-credit-bounded-close-completion.js';

const F = Object.freeze, APPLY = Reflect.apply, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const PROXY = utilTypes.isProxy, NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = PROMISE.then;
const FAILED = new Set(), LIMITS = F({ closeWaitMs: 250 });
const CLOCK = hrtime.bigint, START_TIMER = setTimeout, STOP_TIMER = clearTimeout;

/** The native binding alone supplies openNativeClient, a trusted operational
 * capability, never JSON/argv or an arbitrary module name. This coordinator owns
 * one channel BEFORE native acquisition and transfers that same channel and one
 * actual original-only client to the existing session. Native callbacks remain
 * declared in component controls; they do not qualify SDK/SQL/HTTPS behavior. */
export async function runBuyerOriginalRecoveryPipeHost(configuration) {
  if (arguments.length !== 1 || FAILED.size >= 16) fail();
  const hasBackend = configuration !== null && typeof configuration === 'object' && !PROXY(configuration)
    && DESC(configuration, 'openBackend') !== undefined;
  const c = fields(configuration, ['inputFd', 'outputFd', 'allowedRoot', 'openNativeClient',
    ...(hasBackend ? ['openBackend'] : [])]);
  const expectedRoot = captureBuyerOriginalRecoveryPipeRoot(c.allowedRoot);
  if (typeof c.openNativeClient !== 'function' || PROXY(c.openNativeClient) || !Object.isFrozen(c.openNativeClient)) fail();
  if (hasBackend && (typeof c.openBackend !== 'function' || PROXY(c.openBackend) || !Object.isFrozen(c.openBackend))) fail();
  const frame = { streams: null, channel: null, native: null, client: null, session: null,
    openReceipt: null, nativeStop: null, channelStop: null, sessionStop: null, stage: 'PIPES', nativeEntered: false,
    backendMode: false, backendEntered: false, backendOpenReceipt: null, backendRaw: null, backend: null,
    readerStopRequested: false, readerStop: null, readerClosed: false,
    storeStopRequested: false, storeStop: null, storeClose: 'NOT_REQUESTED', acquisition: null };
  try {
    frame.streams = createBuyerOwnedPipeStreams({ inputFd: c.inputFd, outputFd: c.outputFd });
    // If construction throws after transfer, the channel retains partial owners.
    // This frame must not compete with that constructor's quarantine cleanup.
    frame.stage = 'CHANNEL';
    frame.channel = createBuyerCommandLineChannel({ ...frame.streams, limits: LIMITS });
    frame.stage = 'BOOTSTRAP';
    const line = await native(frame.channel.readCommand());
    const bootstrap = decodeBuyerOriginalRecoveryPipeBootstrap(line, expectedRoot);
    if (!channelOpen(frame.channel)) fail();
    frame.backendMode = bootstrap.recoveryPipeBootstrapVersion === 2;
    if (frame.backendMode && !hasBackend) fail();
    startAcquisition(frame, bootstrap.payerOptions.deadlineMs);
    if (frame.backendMode) {
      frame.stage = 'BACKEND_OPEN';
      const opening = openWithinAcquisition(frame, 'BACKEND', c.openBackend, bootstrap);
      frame.backendOpenReceipt = opening.receipt;
      await native(opening.promise); frame.backendRaw = opening.owner;
      if (!Object.isFrozen(frame.backendRaw)) fail();
      frame.backend = F(fields(frame.backendRaw, ['reader', 'closeStore']));
      method(frame.backend, 'closeStore'); method(frame.backend.reader, 'close');
      method(frame.backend.reader, 'readExactOriginal');
      if (!channelOpen(frame.channel)) fail();
    }
    frame.stage = 'NATIVE_OPEN';
    const opening = openWithinAcquisition(frame, 'PAYER', c.openNativeClient, bootstrap);
    frame.openReceipt = opening.receipt;
    await native(opening.promise); frame.native = opening.owner;
    if (!channelOpen(frame.channel)) fail();
    frame.stage = 'CLIENT';
    frame.client = frame.backendMode ? createBuyerOriginalBackendRecoveryClient({
      client: frame.native, selection: bootstrap.selection, backend: frame.backend.reader,
    }) : createBuyerOriginalRecoveryClient({ client: frame.native, selection: bootstrap.selection });
    frame.stage = 'SESSION';
    const createSession = frame.backendMode ? createBuyerOriginalBackendRecoveryCommandSession : createBuyerOriginalRecoveryCommandSession;
    frame.session = createSession({ client: frame.client, channel: frame.channel, limits: LIMITS });
    finishAcquisition(frame);
    frame.stage = 'RUN';
    const sessionResult = await runBuyerOriginalCommandHost(frame.session);
    const stopped = frame.backendMode ? backendResult(frame, sessionResult) : sessionResult;
    const result = F({ ...stopped, ...acquisitionObservation(frame) });
    if (result.exitCode !== 0) FAILED.add(frame);
    return result;
  } catch {
    FAILED.add(frame);
    refuseAcquisition(frame, 'OWNER_SETUP_REFUSED');
    let clean = false;
    if (frame.session !== null) {
      // The real session owns its original whole-close budget and both owners.
      try { frame.sessionStop = frame.session.close(); clean = await native(frame.sessionStop) === undefined; }
      catch {}
    } else if (frame.channel !== null) clean = await closeBeforeSession(frame);
    if (frame.backendMode && frame.backendEntered) clean = closeOwnedBackendStore(frame) && clean;
    // A constructor which returned no owner may retain a hidden HELD native
    // root. Even closed known pipes do not establish release of that resource.
    return F({ buyerOriginalRecoveryPipeRefusalVersion: 1,
      status: clean && !frame.nativeEntered && !frame.backendEntered ? 'BOOTSTRAP_REFUSED' : 'CLOSE_UNKNOWN',
      exitCode: clean && !frame.nativeEntered && !frame.backendEntered ? 1 : 4, stage: frame.stage,
      returnedSession: frame.session !== null, knownOwnersClosedObserved: clean,
      nativeOpenEntered: frame.nativeEntered, nativeResourceRelease: 'NOT_ESTABLISHED',
      ...(frame.backendMode ? backendObservation(frame) : {}),
      ...acquisitionObservation(frame),
      historicalObservation: true, authority: 'NONE', serviceDelivery: 'NOT_ESTABLISHED',
      grantActivation: 'NOT_ESTABLISHED', automaticRetry: false });
  }
}

function clock() { return APPLY(CLOCK, hrtime, []); }
function startAcquisition(frame, budgetMs) {
  const a = { budgetMs, deadline: clock() + BigInt(budgetMs) * 1000000n, outcome: 'PENDING',
    refusal: null, timer: null, current: null, legs: [] };
  frame.acquisition = a;
  try { a.timer = START_TIMER(() => refuseAcquisition(frame, 'DEADLINE_UNKNOWN'), budgetMs); }
  catch { refuseAcquisition(frame, 'TIMER_UNKNOWN'); fail(); }
}
function refuseAcquisition(frame, reason) {
  const a = frame.acquisition;
  if (a === null || a.outcome !== 'PENDING') return;
  a.outcome = 'UNKNOWN'; a.refusal = reason;
  if (a.timer !== null) { STOP_TIMER(a.timer); a.timer = null; }
  if (a.current !== null) a.current.reject(failure());
  FAILED.add(frame);
}
function requireAcquisition(frame) {
  const a = frame.acquisition;
  if (a === null || a.outcome !== 'PENDING') fail();
  try {
    if (clock() >= a.deadline) { refuseAcquisition(frame, 'DEADLINE_UNKNOWN'); fail(); }
  } catch { refuseAcquisition(frame, 'CLOCK_UNKNOWN'); fail(); }
}
function finishAcquisition(frame) {
  requireAcquisition(frame);
  const a = frame.acquisition;
  if (a.timer !== null) { STOP_TIMER(a.timer); a.timer = null; }
  a.outcome = 'TRANSFERRED';
}
function acquisitionObservation(frame) {
  const a = frame.acquisition;
  return { acquisitionBudgetMs: a?.budgetMs ?? null, acquisitionOutcome: a?.outcome ?? 'NOT_STARTED',
    acquisitionRefusal: a?.refusal ?? null, acquisitionObservationOnly: true,
    nativeCancellationOrTermination: 'NOT_ESTABLISHED' };
}
function openWithinAcquisition(frame, kind, opener, bootstrap) {
  requireAcquisition(frame);
  const a = frame.acquisition;
  let resolve, reject;
  const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, 'constructor', { value: NativePromise });
  observe(promise, () => {}, () => {});
  const leg = { kind, promise, resolve, reject, receipt: null, owner: null, accepted: false,
    lateStopRequested: false, lateStop: null, lateStopObservation: 'NOT_REQUESTED', lateBackend: null };
  a.current = leg; a.legs.push(leg);
  const requireCurrentAcquisition = F(function requireCurrentAcquisition() {
    // This is an operational scope check, never bootstrap DATA or a reusable
    // permit. A returned backend's guard cannot admit a later payer opening.
    if (arguments.length !== 0 || frame.acquisition !== a || a.current !== leg
        || leg.accepted || leg.lateStopRequested) fail();
    try {
      requireAcquisition(frame);
      if (!channelOpen(frame.channel)) { refuseAcquisition(frame, 'CHANNEL_UNKNOWN'); fail(); }
    } catch { refuseAcquisition(frame, 'ACQUISITION_GUARD_UNKNOWN'); fail(); }
  });
  try {
    requireCurrentAcquisition();
    if (kind === 'BACKEND') frame.backendEntered = true; else frame.nativeEntered = true;
    // A fixed async binding must check this same leg after each module load,
    // BEFORE opening a new native/store owner. Already-entered work retains
    // its original receipt/late-stop rules; this does not cancel an import.
    leg.receipt = APPLY(opener, undefined, [bootstrap, requireCurrentAcquisition]);
    observe(leg.receipt, owner => {
      leg.owner = owner;
      try {
        requireAcquisition(frame); leg.accepted = true;
        // Resolve only a void signal: never assimilate the returned owner again.
        leg.resolve(undefined);
      } catch { stopLateAcquisitionOwner(leg); }
    }, () => refuseAcquisition(frame, 'OPEN_REJECTED_UNKNOWN'));
    // A synchronous native entry may block the event loop past the timer. Do
    // not transfer its owner just because a Promise microtask beats that timer.
    requireAcquisition(frame);
  } catch { refuseAcquisition(frame, 'OPEN_RECEIPT_UNKNOWN'); }
  return leg;
}
function stopLateAcquisitionOwner(leg) {
  if (leg.accepted || leg.lateStopRequested) return;
  leg.lateStopRequested = true; leg.lateStopObservation = 'UNKNOWN';
  if (leg.kind === 'BACKEND') {
    try {
      if (!Object.isFrozen(leg.owner)) fail();
      const backend = F(fields(leg.owner, ['reader', 'closeStore']));
      method(backend, 'closeStore'); method(backend.reader, 'close'); method(backend.reader, 'readExactOriginal');
      leg.lateBackend = { backend, client: null, readerStopRequested: false, readerStop: null,
        readerClosed: false, storeStopRequested: false, storeStop: null, storeClose: 'NOT_REQUESTED' };
      if (closeOwnedBackendStore(leg.lateBackend)) leg.lateStopObservation = 'VOID_RECEIPT_OBSERVED';
    } catch {}
  } else {
    try {
      leg.lateStop = APPLY(method(leg.owner, 'close'), leg.owner, []);
      observe(leg.lateStop, value => {
        if (value === undefined) leg.lateStopObservation = 'VOID_RECEIPT_OBSERVED';
      }, () => {});
    } catch {}
  }
  // This retained late owner never enters a client/session, writes a result,
  // reopens a payer, retries close or changes the original UNKNOWN observation.
}

function backendObservation(frame) {
  return { buyerOriginalBackendRecoveryPipeHostVersion: 1, backendOpenEntered: frame.backendEntered,
    backendReaderFencedObserved: frame.readerClosed,
    ownedBackendStoreClose: frame.backend === null ? 'NOT_RETURNED'
      : frame.storeStopRequested ? frame.storeClose : 'HELD',
    ownedBackendStoreResourceCleanup: 'NOT_QUALIFIED' };
}
function backendResult(frame, result) {
  const stopped = closeOwnedBackendStore(frame);
  return F({ ...result, ...backendObservation(frame), sessionStatus: result.status, sessionExitCode: result.exitCode,
    status: stopped ? result.status : 'CLOSE_UNKNOWN', exitCode: stopped ? result.exitCode : 4,
    ownersClosedObserved: stopped && result.ownersClosedObserved });
}
function nativeQuiet(frame) {
  if (frame.native === null) return true;
  const v = frame.native.snapshot();
  return v.lifecycle === 'CLOSED' && !v.operationActive && v.native.phase === 'CLOSED' && !v.native.unknown;
}
function mayStopBackendStore(frame) {
  try {
    if (frame.backend === null) return false;
    if (frame.client === null) return frame.readerClosed;
    if (frame.session !== null) {
      const s = frame.session.inspect();
      if (!s.executionDone || s.activeKind !== null) return false;
    }
    const v = frame.client.inspect();
    if (v.lifecycle !== 'CLOSED' || v.held || v.publicOperationActive || v.childClose !== 'CLOSED'
        || v.backendReaderClose !== 'CLOSED' || !nativeQuiet(frame)) return false;
    frame.readerClosed = true; return true;
  } catch { return false; }
}
function stopUntransferredReader(frame) {
  if (frame.backend === null || frame.client !== null || frame.readerStopRequested) return;
  frame.readerStopRequested = true;
  try {
    frame.readerStop = APPLY(method(frame.backend.reader, 'close'), frame.backend.reader, []);
    const value = frame.readerStop;
    frame.readerClosed = data(value, 'status') === 'CLOSED'
      && data(value, 'executionAuthorized') === false && data(value, 'paymentAuthorized') === false
      && data(value, 'signingAuthorized') === false && data(value, 'deliveryStatus') === 'NOT_ESTABLISHED';
  } catch { frame.readerClosed = false; }
}
function closeOwnedBackendStore(frame) {
  // Only this owner may stop the actual store. A connector fences its borrowed
  // reader; CLOSED reader DATA alone never asserts that SQLite was closed.
  // A failed channel does not suppress this independent safe store stop.
  stopUntransferredReader(frame);
  if (!mayStopBackendStore(frame)) return false;
  if (!frame.storeStopRequested) {
    frame.storeStopRequested = true; frame.storeClose = 'UNKNOWN';
    try {
      frame.storeStop = APPLY(method(frame.backend, 'closeStore'), frame.backend, []);
      if (frame.storeStop === undefined) frame.storeClose = 'RETURNED_UNDEFINED';
      else { try { observe(frame.storeStop, () => {}, () => {}); } catch {} }
    } catch {}
  }
  // Never retry a throwing/non-void close, even if a later store view says
  // CLOSED. A fresh post-stop check cannot upgrade the historical receipt.
  return frame.storeClose === 'RETURNED_UNDEFINED' && mayStopBackendStore(frame);
}

async function closeBeforeSession(frame) {
  let completion = null, receipt = null;
  let nativeDone = frame.native === null, channelDone = false, bad = false;
  function currentClean() {
    try {
      const io = frame.channel.inspect();
      if (io.lifecycle !== 'CLOSED' || io.held || io.reading || io.writing) return false;
      if (frame.client !== null) {
        const v = frame.client.inspect();
        if (v.lifecycle !== 'CLOSED' || v.held || v.publicOperationActive) return false;
      } else if (frame.native !== null) {
        const v = frame.native.snapshot();
        if (v.lifecycle !== 'CLOSED' || v.operationActive || v.native.phase !== 'CLOSED' || v.native.unknown) return false;
      }
      return true;
    } catch { return false; }
  }
  function probe() {
    if (!bad && nativeDone && channelDone && completion !== null && currentClean()) completion.complete();
  }
  // Start the one observation budget before either independent child stop.
  try { completion = createServiceCreditBoundedCloseCompletion(250); receipt = completion.start(); }
  catch { bad = true; }
  if (frame.backendMode) stopUntransferredReader(frame);
  if (frame.client !== null || frame.native !== null) {
    try {
      const owner = frame.client ?? frame.native;
      frame.nativeStop = APPLY(method(owner, 'close'), owner, []);
      observe(frame.nativeStop, value => { nativeDone = value === undefined; if (!nativeDone) bad = true; probe(); }, () => { bad = true; });
    } catch { bad = true; }
  }
  try {
    frame.channelStop = frame.channel.close();
    observe(frame.channelStop, value => { channelDone = value === undefined; if (!channelDone) bad = true; probe(); }, () => { bad = true; });
  } catch { bad = true; }
  if (frame.backendMode && frame.client === null) closeOwnedBackendStore(frame);
  probe();
  if (receipt === null) return false;
  try { return await native(receipt) === undefined && !bad && nativeDone && channelDone && currentClean(); }
  catch { return false; }
}
function channelOpen(channel) {
  const v = channel.inspect();
  return v.lifecycle === 'OPEN' && !v.held && !v.closeRequested && !v.reading && !v.writing;
}
function fields(value, names) {
  if (value === null || typeof value !== 'object' || PROXY(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) {
    const d = DESC(value, name);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail();
    Object.defineProperty(out, name, { value: d.value, enumerable: true });
  }
  return out;
}
function method(value, name) {
  if (value === null || typeof value !== 'object' || PROXY(value) || !Object.isFrozen(value)) fail();
  const d = DESC(value, name);
  if (!d || !OWN(d, 'value') || typeof d.value !== 'function' || PROXY(d.value) || !Object.isFrozen(d.value)) fail();
  return d.value;
}
function data(value, name) {
  if (value === null || typeof value !== 'object' || PROXY(value) || !Object.isFrozen(value)
      || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const d = DESC(value, name);
  if (!d || !OWN(d, 'value') || !d.enumerable) fail();
  return d.value;
}
function native(value) {
  if (PROXY(value) || !utilTypes.isPromise(value) || Object.getPrototypeOf(value) !== PROMISE
      || Object.getOwnPropertyNames(value).some(k => k !== 'constructor')) fail();
  const d = DESC(value, 'constructor');
  if (d !== undefined && (!OWN(d, 'value') || d.value !== NativePromise)) fail();
  return value;
}
function observe(value, yes, no) {
  const bridge = APPLY(THEN, native(value), [yes, no]); APPLY(THEN, bridge, [() => {}, () => {}]);
}
function fail() {
  throw failure();
}
function failure() {
  const code = 'buyer_original_recovery_pipe_host_refused', e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); return F(e);
}
