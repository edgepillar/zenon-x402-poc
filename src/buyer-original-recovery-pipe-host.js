import { types as utilTypes } from 'node:util';
import { createBuyerOwnedPipeStreams } from './buyer-owned-pipe-streams.js';
import { createBuyerCommandLineChannel } from './buyer-command-line-channel.js';
import { decodeBuyerOriginalRecoveryPipeBootstrap, captureBuyerOriginalRecoveryPipeRoot } from './buyer-original-recovery-pipe-bootstrap.js';
import { createBuyerOriginalRecoveryClient } from './buyer-original-recovery-client.js';
import { createBuyerOriginalRecoveryCommandSession } from './buyer-original-funding-command-session.js';
import { runBuyerOriginalCommandHost } from './buyer-original-command-host.js';
import { createServiceCreditBoundedCloseCompletion } from './service-credit-bounded-close-completion.js';

const F = Object.freeze, APPLY = Reflect.apply, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const PROXY = utilTypes.isProxy, NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = PROMISE.then;
const FAILED = new Set(), LIMITS = F({ closeWaitMs: 250 });

/** The native binding alone supplies openNativeClient, a trusted operational
 * capability, never JSON/argv or an arbitrary module name. This coordinator owns
 * one channel BEFORE native acquisition and transfers that same channel and one
 * actual original-only client to the existing session. Native callbacks remain
 * declared in component controls; they do not qualify SDK/SQL/HTTPS behavior. */
export async function runBuyerOriginalRecoveryPipeHost(configuration) {
  if (arguments.length !== 1 || FAILED.size >= 16) fail();
  const c = fields(configuration, ['inputFd', 'outputFd', 'allowedRoot', 'openNativeClient']);
  const expectedRoot = captureBuyerOriginalRecoveryPipeRoot(c.allowedRoot);
  if (typeof c.openNativeClient !== 'function' || PROXY(c.openNativeClient) || !Object.isFrozen(c.openNativeClient)) fail();
  const frame = { streams: null, channel: null, native: null, client: null, session: null,
    openReceipt: null, nativeStop: null, channelStop: null, sessionStop: null, stage: 'PIPES', nativeEntered: false };
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
    frame.stage = 'NATIVE_OPEN'; frame.nativeEntered = true;
    frame.openReceipt = APPLY(c.openNativeClient, undefined, [bootstrap]);
    frame.native = await native(frame.openReceipt);
    if (!channelOpen(frame.channel)) fail();
    frame.stage = 'CLIENT';
    frame.client = createBuyerOriginalRecoveryClient({ client: frame.native, selection: bootstrap.selection });
    frame.stage = 'SESSION';
    frame.session = createBuyerOriginalRecoveryCommandSession({ client: frame.client, channel: frame.channel, limits: LIMITS });
    frame.stage = 'RUN';
    const result = await runBuyerOriginalCommandHost(frame.session);
    if (result.exitCode !== 0) FAILED.add(frame);
    return result;
  } catch {
    FAILED.add(frame);
    let clean = false;
    if (frame.session !== null) {
      // The real session owns its original whole-close budget and both owners.
      try { frame.sessionStop = frame.session.close(); clean = await native(frame.sessionStop) === undefined; }
      catch {}
    } else if (frame.channel !== null) clean = await closeBeforeSession(frame);
    // A constructor which returned no owner may retain a hidden HELD native
    // root. Even closed known pipes do not establish release of that resource.
    return F({ buyerOriginalRecoveryPipeRefusalVersion: 1,
      status: clean && !frame.nativeEntered ? 'BOOTSTRAP_REFUSED' : 'CLOSE_UNKNOWN',
      exitCode: clean && !frame.nativeEntered ? 1 : 4, stage: frame.stage,
      returnedSession: frame.session !== null, knownOwnersClosedObserved: clean,
      nativeOpenEntered: frame.nativeEntered, nativeResourceRelease: 'NOT_ESTABLISHED',
      historicalObservation: true, authority: 'NONE', serviceDelivery: 'NOT_ESTABLISHED',
      grantActivation: 'NOT_ESTABLISHED', automaticRetry: false });
  }
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
  const code = 'buyer_original_recovery_pipe_host_refused', e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); throw F(e);
}
