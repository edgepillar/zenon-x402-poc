import { types as utilTypes } from 'node:util';
import { hrtime } from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { captureBuyerCommandLineChannelConfiguration, createBuyerCommandLineChannel } from './buyer-command-line-channel.js';
import { createBuyerOriginalFundingCommandSession } from './buyer-original-funding-command-session.js';
import { createServiceCreditBoundedCloseCompletion } from './service-credit-bounded-close-completion.js';

const F = Object.freeze, APPLY = Reflect.apply, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const PROXY = utilTypes.isProxy, NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = PROMISE.then;
const FAILED = new Set();
const CLOCK = hrtime.bigint, START_TIMER = setTimeout, STOP_TIMER = clearTimeout;

/** Reserve the actual channel synchronously BEFORE invoking the fixed native
 * opener. Its operational capability comes only from the native binding, not
 * command DATA. Preserve the existing key transfer/cleanup contract: this owner
 * never reads/clears a key and stops only a client actually returned by OPEN.
 * One cooperative opening budget spans native entry and session setup. It
 * cannot cancel a native opening or clear an unreturned key. */
export async function openBuyerFundingOwnedStreamSession(configuration) {
  if (arguments.length !== 1 || FAILED.size >= 16) fail();
  const withBudget = configuration !== null && typeof configuration === 'object' && !PROXY(configuration)
    && DESC(configuration, 'openWaitMs') !== undefined;
  const c = fields(configuration, ['input', 'output', 'limits', 'openClient', ...(withBudget ? ['openWaitMs'] : [])]);
  if (typeof c.openClient !== 'function' || PROXY(c.openClient) || !Object.isFrozen(c.openClient)) fail();
  const budgetMs = withBudget ? c.openWaitMs : 5000;
  if (!Number.isSafeInteger(budgetMs) || budgetMs < 1 || budgetMs > 60000 || Object.is(budgetMs, -0)) fail();
  const selected = captureBuyerCommandLineChannelConfiguration({ input: c.input, output: c.output, limits: c.limits });
  const frame = { channel: null, client: null, openReceipt: null, clientStop: null, channelStop: null,
    session: null, sessionStop: null, opening: null, lateClient: null, lateStop: null,
    lateStopRequested: false, lateStopObservation: 'NOT_REQUESTED', nativeEntered: false, cleanupObserved: false };
  try {
    // This constructor reserves both streams before any await/native entry.
    // A partial constructor failure retains its own quarantine; do not compete.
    frame.channel = createBuyerCommandLineChannel(selected);
    await native(openWithinBudget(frame, c.openClient, budgetMs));
    requireOpening(frame);
    const io = frame.channel.inspect(), client = APPLY(method(frame.client, 'inspect'), frame.client, []);
    if (data(io, 'lifecycle') !== 'OPEN' || data(io, 'held') || data(io, 'closeRequested')
        || data(io, 'reading') || data(io, 'writing') || data(client, 'sdk105FundingServiceLifecycleVersion') !== 1
        || data(client, 'lifecycle') !== 'OPEN' || data(client, 'held') || data(client, 'publicOperationActive')
        || data(client, 'phase') !== 'FUNDING' || data(client, 'preparedOriginalRetained')
        || data(client, 'fundingBound') || data(client, 'handoffAttempts') !== 0 || data(client, 'closeRequested')) fail();
    requireOpening(frame);
    frame.session = createBuyerOriginalFundingCommandSession({ client: frame.client, channel: frame.channel, limits: selected.limits });
    requireOpening(frame);
    frame.opening.outcome = 'TRANSFERRED'; stopTimer(frame);
    return frame.session;
  } catch {
    FAILED.add(frame);
    refuseOpening(frame, 'OWNER_SETUP_UNKNOWN');
    frame.cleanupObserved = await closeKnown(frame, selected.limits.closeWaitMs);
    fail();
  }
}

function stopTimer(frame) {
  if (frame.opening !== null && frame.opening.timer !== null) {
    STOP_TIMER(frame.opening.timer); frame.opening.timer = null;
  }
}
function refuseOpening(frame, reason) {
  const a = frame.opening;
  if (a === null || a.outcome !== 'PENDING') return;
  a.outcome = 'UNKNOWN'; a.refusal = reason; stopTimer(frame);
  a.reject(problem());
}
function requireOpening(frame) {
  const a = frame.opening;
  if (a === null || a.outcome !== 'PENDING') fail();
  try {
    if (APPLY(CLOCK, hrtime, []) >= a.deadline) { refuseOpening(frame, 'DEADLINE_UNKNOWN'); fail(); }
  } catch { refuseOpening(frame, 'CLOCK_UNKNOWN'); fail(); }
}
function openWithinBudget(frame, opener, budgetMs) {
  let resolve, reject;
  const signal = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(signal, 'constructor', { value: NativePromise });
  observe(signal, () => {}, () => {});
  frame.opening = { budgetMs, deadline: APPLY(CLOCK, hrtime, []) + BigInt(budgetMs) * 1000000n,
    outcome: 'PENDING', refusal: null, timer: null, resolve, reject, signal };
  try {
    frame.opening.timer = START_TIMER(() => refuseOpening(frame, 'DEADLINE_UNKNOWN'), budgetMs);
    requireOpening(frame);
    frame.nativeEntered = true;
    const requireCurrentOpening = F(function requireCurrentOpening() {
      if (arguments.length !== 0) fail();
      requireOpening(frame);
      const view = frame.channel.inspect();
      if (data(view, 'lifecycle') !== 'OPEN' || data(view, 'held') || data(view, 'closeRequested')
          || data(view, 'reading') || data(view, 'writing')) fail();
    });
    // A fixed async binding must recheck after SDK module loading, BEFORE it
    // starts a new key/native acquisition. This guard is never command DATA.
    frame.openReceipt = APPLY(opener, undefined, [requireCurrentOpening]);
    observe(frame.openReceipt, owner => {
      try {
        requireOpening(frame); frame.client = owner;
        // Do not resolve the operational owner through Promise assimilation.
        resolve(undefined);
      } catch { stopLateClient(frame, owner); }
    }, () => refuseOpening(frame, 'OPEN_REJECTED_UNKNOWN'));
    // The actual entry can block synchronously beyond its timer. A fulfilled
    // opening Promise must not win merely because its microtask runs first.
    requireOpening(frame);
  } catch { refuseOpening(frame, 'OPEN_RECEIPT_UNKNOWN'); }
  return signal;
}
function stopLateClient(frame, owner) {
  if (frame.lateStopRequested) return;
  frame.lateClient = owner; frame.lateStopRequested = true; frame.lateStopObservation = 'UNKNOWN';
  try {
    frame.lateStop = APPLY(method(owner, 'close'), owner, []);
    observe(frame.lateStop, value => {
      try {
        const view = APPLY(method(owner, 'inspect'), owner, []);
        if (value === undefined && data(view, 'sdk105FundingServiceLifecycleVersion') === 1
            && data(view, 'lifecycle') === 'CLOSED' && !data(view, 'held') && !data(view, 'publicOperationActive'))
          frame.lateStopObservation = 'VOID_RECEIPT_OBSERVED';
      } catch {}
    }, () => {});
  } catch {}
  // This one returned client owns its key stop. No raw key access, transfer,
  // command execution, stream output, second opening or uncertainty upgrade.
}

async function closeKnown(frame, budgetMs) {
  if (frame.channel === null) return false;
  if (frame.session !== null) {
    // Session construction transferred both owners. Preserve its one existing
    // whole-close budget; do not compete with separate client/channel stops.
    try {
      frame.sessionStop = frame.session.close();
      if (await native(frame.sessionStop) !== undefined) return false;
      const view = frame.session.inspect();
      return data(view, 'lifecycle') === 'CLOSED' && !data(view, 'held')
        && data(view, 'executionDone') && data(view, 'activeKind') === null;
    } catch { return false; }
  }
  let completion = null, receipt = null, clientDone = frame.client === null, channelDone = false, bad = false;
  function currentClean() {
    try {
      const io = frame.channel.inspect();
      if (data(io, 'lifecycle') !== 'CLOSED' || data(io, 'held') || data(io, 'reading') || data(io, 'writing')) return false;
      if (frame.client !== null) {
        const v = APPLY(method(frame.client, 'inspect'), frame.client, []);
        if (data(v, 'sdk105FundingServiceLifecycleVersion') !== 1 || data(v, 'lifecycle') !== 'CLOSED'
            || data(v, 'held') || data(v, 'publicOperationActive')) return false;
      }
      return true;
    } catch { return false; }
  }
  function probe() { if (!bad && clientDone && channelDone && completion !== null && currentClean()) completion.complete(); }
  try { completion = createServiceCreditBoundedCloseCompletion(budgetMs); receipt = completion.start(); }
  catch { bad = true; }
  if (frame.client !== null) {
    try {
      frame.clientStop = APPLY(method(frame.client, 'close'), frame.client, []);
      observe(frame.clientStop, value => { clientDone = value === undefined; if (!clientDone) bad = true; probe(); }, () => { bad = true; });
    } catch { bad = true; }
  }
  try {
    frame.channelStop = frame.channel.close();
    observe(frame.channelStop, value => { channelDone = value === undefined; if (!channelDone) bad = true; probe(); }, () => { bad = true; });
  } catch { bad = true; }
  probe();
  if (receipt === null) return false;
  try { return await native(receipt) === undefined && !bad && clientDone && channelDone && currentClean(); }
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
  const code = 'buyer_funding_owned_stream_open_refused', e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); return F(e);
}
function fail() { throw problem(); }
