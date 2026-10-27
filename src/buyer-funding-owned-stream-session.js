import { types as utilTypes } from 'node:util';
import { captureBuyerCommandLineChannelConfiguration, createBuyerCommandLineChannel } from './buyer-command-line-channel.js';
import { createBuyerOriginalFundingCommandSession } from './buyer-original-funding-command-session.js';
import { createServiceCreditBoundedCloseCompletion } from './service-credit-bounded-close-completion.js';

const F = Object.freeze, APPLY = Reflect.apply, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const PROXY = utilTypes.isProxy, NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = PROMISE.then;
const FAILED = new Set();

/** Reserve the actual channel synchronously BEFORE invoking the fixed native
 * opener. Its operational capability comes only from the native binding, not
 * command DATA. Preserve the existing key transfer/cleanup contract: this owner
 * never reads/clears a key and stops only a client actually returned by OPEN.
 * This does not add native-opening cancellation or a new funding authority. */
export async function openBuyerFundingOwnedStreamSession(configuration) {
  if (arguments.length !== 1 || FAILED.size >= 16) fail();
  const c = fields(configuration, ['input', 'output', 'limits', 'openClient']);
  if (typeof c.openClient !== 'function' || PROXY(c.openClient) || !Object.isFrozen(c.openClient)) fail();
  const selected = captureBuyerCommandLineChannelConfiguration({ input: c.input, output: c.output, limits: c.limits });
  const frame = { channel: null, client: null, openReceipt: null, clientStop: null, channelStop: null,
    nativeEntered: false, cleanupObserved: false };
  try {
    // This constructor reserves both streams before any await/native entry.
    // A partial constructor failure retains its own quarantine; do not compete.
    frame.channel = createBuyerCommandLineChannel(selected);
    frame.nativeEntered = true;
    frame.openReceipt = APPLY(c.openClient, undefined, []);
    frame.client = await native(frame.openReceipt);
    const io = frame.channel.inspect(), client = APPLY(method(frame.client, 'inspect'), frame.client, []);
    if (data(io, 'lifecycle') !== 'OPEN' || data(io, 'held') || data(io, 'closeRequested')
        || data(io, 'reading') || data(io, 'writing') || data(client, 'sdk105FundingServiceLifecycleVersion') !== 1
        || data(client, 'lifecycle') !== 'OPEN' || data(client, 'held') || data(client, 'publicOperationActive')
        || data(client, 'phase') !== 'FUNDING' || data(client, 'preparedOriginalRetained')
        || data(client, 'fundingBound') || data(client, 'handoffAttempts') !== 0 || data(client, 'closeRequested')) fail();
    return createBuyerOriginalFundingCommandSession({ client: frame.client, channel: frame.channel, limits: selected.limits });
  } catch {
    FAILED.add(frame);
    frame.cleanupObserved = await closeKnown(frame, selected.limits.closeWaitMs);
    fail();
  }
}

async function closeKnown(frame, budgetMs) {
  if (frame.channel === null) return false;
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
function fail() {
  const code = 'buyer_funding_owned_stream_open_refused', e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); throw F(e);
}
