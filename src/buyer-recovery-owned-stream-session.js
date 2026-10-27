import { types as utilTypes } from 'node:util';
import { hrtime } from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { captureBuyerCommandLineChannelConfiguration, createBuyerCommandLineChannel } from './buyer-command-line-channel.js';
import { captureBuyerOriginalRecoverySelection, createBuyerOriginalRecoveryClient,
  createBuyerOriginalBackendRecoveryClient } from './buyer-original-recovery-client.js';
import { createBuyerOriginalRecoveryCommandSession,
  createBuyerOriginalBackendRecoveryCommandSession } from './buyer-original-funding-command-session.js';
import { createServiceCreditBoundedCloseCompletion } from './service-credit-bounded-close-completion.js';

const F = Object.freeze, APPLY = Reflect.apply, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const PROXY = utilTypes.isProxy, NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = PROMISE.then;
const CLOCK = hrtime.bigint, START_TIMER = setTimeout, STOP_TIMER = clearTimeout, FAILED = new Set();
const NATIVE_PROFILE = 'NATIVE_OFFICIAL_X402_FUNDING_POST_ORIGINAL_V6_CLIENT';

/** Reserve the actual streams before either trusted original-only opener.
 * One monotonic budget spans reader, payer and actual recovery session setup.
 * Factories are private binding capabilities, never JSON/command DATA. A reader
 * fences its borrowed store access only; this owner never closes that store.
 * A timeout cannot cancel an entered native opening or establish physical release. */
export async function openBuyerOriginalRecoveryOwnedStreamSession(configuration) {
  if (arguments.length !== 1 || FAILED.size >= 16) fail();
  const withBackend = configuration !== null && typeof configuration === 'object' && !PROXY(configuration)
    && DESC(configuration, 'openBackendReader') !== undefined;
  const c = fields(configuration, ['selection', 'input', 'output', 'limits', 'openWaitMs', 'openNativeClient',
    ...(withBackend ? ['openBackendReader'] : [])]);
  for (const fn of [c.openNativeClient, ...(withBackend ? [c.openBackendReader] : [])]) {
    if (typeof fn !== 'function' || PROXY(fn) || !Object.isFrozen(fn)) fail();
  }
  const budget = c.openWaitMs;
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 60000 || Object.is(budget, -0)) fail();
  let selection, streams;
  try {
    selection = captureBuyerOriginalRecoverySelection(c.selection);
    streams = captureBuyerCommandLineChannelConfiguration({ input: c.input, output: c.output, limits: c.limits });
  } catch { fail(); }
  const frame = { streams, channel: null, reader: null, native: null, client: null, session: null, opening: null,
    current: null, legs: [], nativeStop: null, readerStop: null, clientStop: null, channelStop: null,
    sessionStop: null, cleanupObserved: false, withBackend };
  try {
    frame.opening = { outcome: 'PENDING', deadline: APPLY(CLOCK, hrtime, []) + BigInt(budget) * 1000000n,
      timer: null, refusal: null };
    frame.opening.timer = START_TIMER(() => refuse(frame, 'DEADLINE_UNKNOWN'), budget);
    // A partial channel constructor owns its quarantine. Never compete with it.
    frame.channel = createBuyerCommandLineChannel(streams);
    requireIdle(frame);
    if (withBackend) await native(openLeg(frame, 'reader', c.openBackendReader));
    requireIdle(frame);
    await native(openLeg(frame, 'native', c.openNativeClient));
    requireIdle(frame);
    frame.client = withBackend
      ? createBuyerOriginalBackendRecoveryClient({ client: frame.native, selection, backend: frame.reader })
      : createBuyerOriginalRecoveryClient({ client: frame.native, selection });
    requireIdle(frame);
    const v = APPLY(method(frame.client, 'inspect'), frame.client, []);
    if (data(v, 'lifecycle') !== 'OPEN' || data(v, 'held') || data(v, 'publicOperationActive')
        || data(v, 'phase') !== 'AWAITING_ORIGINAL_RESTORE' || data(v, 'restoreAttempts') !== 0
        || data(v, 'restored') || data(v, 'closeRequested') || data(v, 'backendRecoveryAvailable') !== withBackend) fail();
    requireIdle(frame);
    const create = withBackend ? createBuyerOriginalBackendRecoveryCommandSession : createBuyerOriginalRecoveryCommandSession;
    frame.session = create({ client: frame.client, channel: frame.channel, limits: streams.limits });
    requireIdle(frame);
    frame.opening.outcome = 'TRANSFERRED'; stopTimer(frame);
    return frame.session;
  } catch {
    refuse(frame, 'OWNER_SETUP_UNKNOWN');
    if (frame.channel !== null || frame.legs.length !== 0) FAILED.add(frame);
    frame.cleanupObserved = await closeKnown(frame, streams.limits.closeWaitMs);
    fail();
  }
}

function stopTimer(frame) {
  if (frame.opening !== null && frame.opening.timer !== null) {
    STOP_TIMER(frame.opening.timer); frame.opening.timer = null;
  }
}
function refuse(frame, reason) {
  const a = frame.opening;
  if (a === null || a.outcome !== 'PENDING') return;
  a.outcome = 'UNKNOWN'; a.refusal = reason; stopTimer(frame);
  if (frame.current !== null) frame.current.reject(problem());
}
function requireOpening(frame) {
  const a = frame.opening;
  if (a === null || a.outcome !== 'PENDING') fail();
  try {
    if (APPLY(CLOCK, hrtime, []) >= a.deadline) { refuse(frame, 'DEADLINE_UNKNOWN'); fail(); }
  } catch { refuse(frame, 'CLOCK_UNKNOWN'); fail(); }
}
function requireIdle(frame) {
  requireOpening(frame);
  // destroy()/end() revokes a stream synchronously, before Node delivers its
  // close/end event to the channel. Do not admit acquisition in that gap.
  const { input, output } = frame.streams;
  if (input.destroyed || input.closed || input.readableEnded || output.destroyed || output.closed || output.writableEnded) {
    refuse(frame, 'STREAM_REVOKED_UNKNOWN'); fail();
  }
  const v = frame.channel.inspect();
  if (data(v, 'lifecycle') !== 'OPEN' || data(v, 'held') || data(v, 'closeRequested')
      || data(v, 'reading') || data(v, 'writing')) { refuse(frame, 'CHANNEL_UNKNOWN'); fail(); }
  requireOpening(frame);
}
function openLeg(frame, kind, opener) {
  let resolve, reject;
  const signal = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  observe(signal, () => {}, () => {});
  const leg = { kind, receipt: null, accepted: false, reject, lateOwner: null, lateStopRequested: false,
    lateStop: null, lateStopObservation: 'NOT_REQUESTED' };
  frame.current = leg; frame.legs.push(leg);
  const requireCurrentOpening = F(function requireCurrentOpening() {
    if (arguments.length !== 0 || frame.current !== leg || leg.accepted || leg.lateStopRequested) fail();
    requireIdle(frame);
  });
  try {
    requireCurrentOpening();
    leg.receipt = APPLY(opener, undefined, [requireCurrentOpening]);
    observe(leg.receipt, owner => {
      try {
        requireCurrentOpening(); frame[kind] = owner; leg.accepted = true;
        // Resolve only a void receipt, never assimilate an operational owner.
        resolve(undefined);
      } catch { stopLate(leg, owner); }
    }, () => refuse(frame, 'OPEN_REJECTED_UNKNOWN'));
    // A blocked synchronous opener cannot win ahead of its expired timer.
    requireCurrentOpening();
  } catch { refuse(frame, 'OPEN_RECEIPT_UNKNOWN'); }
  return signal;
}
function nativeClean(owner) {
  const v = APPLY(method(owner, 'snapshot'), owner, []), n = data(v, 'native');
  return data(v, 'profile') === NATIVE_PROFILE && data(v, 'lifecycle') === 'CLOSED'
    && !data(v, 'operationActive') && data(n, 'phase') === 'CLOSED' && !data(n, 'unknown');
}
function readerClosed(receipt) {
  return data(receipt, 'status') === 'CLOSED' && data(receipt, 'executionAuthorized') === false
    && data(receipt, 'paymentAuthorized') === false && data(receipt, 'signingAuthorized') === false
    && data(receipt, 'deliveryStatus') === 'NOT_ESTABLISHED';
}
function stopLate(leg, owner) {
  if (leg.lateStopRequested) return;
  leg.lateOwner = owner; leg.lateStopRequested = true; leg.lateStopObservation = 'UNKNOWN';
  try {
    leg.lateStop = APPLY(method(owner, 'close'), owner, []);
    if (leg.kind === 'reader') {
      if (readerClosed(leg.lateStop)) leg.lateStopObservation = 'READER_FENCED';
    } else observe(leg.lateStop, value => {
      try { if (value === undefined && nativeClean(owner)) leg.lateStopObservation = 'VOID_RECEIPT_OBSERVED'; } catch {}
    }, () => {});
  } catch {}
  // Retain the original owner/stop receipt. Never retry, run a command, close
  // a borrowed store or upgrade the already refused opening to success.
}

async function closeKnown(frame, budgetMs) {
  if (frame.channel === null) return false;
  if (frame.session !== null) {
    try {
      frame.sessionStop = frame.session.close();
      if (await native(frame.sessionStop) !== undefined) return false;
      const v = frame.session.inspect();
      return data(v, 'lifecycle') === 'CLOSED' && !data(v, 'held')
        && data(v, 'executionDone') && data(v, 'activeKind') === null;
    } catch { return false; }
  }
  let completion = null, receipt = null, ownerDone = frame.client === null && frame.native === null;
  let readerDone = frame.client !== null || frame.reader === null, channelDone = false, bad = false;
  function clean() {
    try {
      const io = frame.channel.inspect();
      if (data(io, 'lifecycle') !== 'CLOSED' || data(io, 'held') || data(io, 'reading') || data(io, 'writing')) return false;
      if (frame.client !== null) {
        const v = APPLY(method(frame.client, 'inspect'), frame.client, []);
        return data(v, frame.withBackend ? 'buyerOriginalBackendRecoveryClientVersion' : 'buyerOriginalRecoveryClientVersion') === 1
          && data(v, 'lifecycle') === 'CLOSED' && !data(v, 'held') && !data(v, 'publicOperationActive');
      }
      return frame.native === null || nativeClean(frame.native);
    } catch { return false; }
  }
  function probe() { if (!bad && ownerDone && readerDone && channelDone && completion !== null && clean()) completion.complete(); }
  try { completion = createServiceCreditBoundedCloseCompletion(budgetMs); receipt = completion.start(); } catch { bad = true; }
  if (frame.client !== null || frame.native !== null) {
    try {
      const owner = frame.client ?? frame.native;
      const stop = APPLY(method(owner, 'close'), owner, []);
      if (frame.client !== null) frame.clientStop = stop; else frame.nativeStop = stop;
      observe(stop, value => { ownerDone = value === undefined; if (!ownerDone) bad = true; probe(); }, () => { bad = true; });
    } catch { bad = true; }
  }
  // Once constructed, the actual connector owns its reader. Before transfer,
  // stop reader and native independently even if either stop throws.
  if (frame.client === null && frame.reader !== null) {
    try { frame.readerStop = APPLY(method(frame.reader, 'close'), frame.reader, []); readerDone = readerClosed(frame.readerStop); if (!readerDone) bad = true; }
    catch { bad = true; }
  }
  try {
    frame.channelStop = frame.channel.close();
    observe(frame.channelStop, value => { channelDone = value === undefined; if (!channelDone) bad = true; probe(); }, () => { bad = true; });
  } catch { bad = true; }
  probe();
  if (receipt === null) return false;
  try { return await native(receipt) === undefined && !bad && ownerDone && readerDone && channelDone && clean(); }
  catch { return false; }
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
function data(value, name) {
  if (value === null || typeof value !== 'object' || PROXY(value) || !Object.isFrozen(value)
      || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const d = DESC(value, name);
  if (!d || !OWN(d, 'value') || !d.enumerable) fail();
  return d.value;
}
function method(value, name) {
  const fn = data(value, name);
  if (typeof fn !== 'function' || PROXY(fn) || !Object.isFrozen(fn)) fail();
  return fn;
}
function native(value) {
  if (value === null || typeof value !== 'object' || PROXY(value) || !utilTypes.isPromise(value)
      || Object.getPrototypeOf(value) !== PROMISE || Object.getOwnPropertyNames(value).some(k => k !== 'constructor')) fail();
  const d = DESC(value, 'constructor');
  if (d !== undefined && (!OWN(d, 'value') || d.value !== NativePromise)) fail();
  return value;
}
function observe(value, yes, no) {
  const bridge = APPLY(THEN, native(value), [yes, no]); APPLY(THEN, bridge, [() => {}, () => {}]);
}
function problem() {
  const code = 'buyer_recovery_owned_stream_open_refused', e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); return F(e);
}
function fail() { throw problem(); }
