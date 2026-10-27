import { types as utilTypes } from 'node:util';
import { createServiceCreditBoundedCloseCompletion } from './service-credit-bounded-close-completion.js';
import {
  captureBuyerOriginalFundingCommandLimits, decodeBuyerOriginalFundingCommand,
  encodeBuyerOriginalFundingCommandResult,
  decodeBuyerOriginalRecoveryCommand, encodeBuyerOriginalRecoveryCommandResult,
  decodeBuyerOriginalBackendRecoveryCommand, encodeBuyerOriginalBackendRecoveryCommandResult,
} from './buyer-original-funding-command.js';

const F = Object.freeze, APPLY = Reflect.apply, DESC = Object.getOwnPropertyDescriptor;
const OWN = Object.hasOwn, PROTO = Object.getPrototypeOf, PROXY = utilTypes.isProxy;
const NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = PROMISE.then;
const METHODS = F({ prepare: 'prepareOriginalFunding', commit: 'commitOriginalFunding',
  submitFunding: 'submitOriginalFunding', handoff: 'handoffToService', submitService: 'submitOriginal' });
const RECOVERY_METHODS = F({ restoreOriginal: 'restoreOriginalPayment',
  readRecoveryState: 'readOriginalRecoveryState', submitService: 'submitOriginal' });
const BACKEND_METHODS = F({ ...RECOVERY_METHODS, reconcileOriginal: 'readOriginalBackendRecoveryState' });

/**
 * Own one actual client and one command channel. Every critical step requires a
 * fresh explicit command; displayed candidate pins are never fed back as trust.
 * The native opener supplies the real SDK105 client. Component tests declare
 * its native children and execute the actual existing wallet/lifecycle owners.
 */
export function createBuyerOriginalFundingCommandSession(configuration) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createSession(configuration, false);
}

/** Explicit recovery selection over the real retained-original owner; no
 * fake SDK105 facade or funding/preparation capability is manufactured. */
export function createBuyerOriginalRecoveryCommandSession(configuration) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createSession(configuration, true);
}

export function createBuyerOriginalBackendRecoveryCommandSession(configuration) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createSession(configuration, 'backend');
}

function createSession(configuration, recovery) {
  const withBackend = recovery === 'backend';
  const c = fields(configuration, ['client', 'channel', 'limits']);
  const limits = captureBuyerOriginalFundingCommandLimits(c.limits), client = c.client, channel = c.channel;
  const operations = {};
  const methods = withBackend ? BACKEND_METHODS : recovery ? RECOVERY_METHODS : METHODS;
  const DECODE = withBackend ? decodeBuyerOriginalBackendRecoveryCommand : recovery ? decodeBuyerOriginalRecoveryCommand : decodeBuyerOriginalFundingCommand;
  const ENCODE = withBackend ? encodeBuyerOriginalBackendRecoveryCommandResult : recovery ? encodeBuyerOriginalRecoveryCommandResult : encodeBuyerOriginalFundingCommandResult;
  for (const operation of Object.keys(methods)) operations[operation] = method(client, methods[operation]);
  const CLIENT_VIEW = method(client, 'inspect'), CLIENT_CLOSE = method(client, 'close');
  const READ = method(channel, 'readCommand'), WRITE = method(channel, 'writeResult');
  const CHANNEL_VIEW = method(channel, 'inspect'), CHANNEL_CLOSE = method(channel, 'close');
  const completion = createServiceCreditBoundedCloseCompletion(limits.closeWaitMs);
  const ids = new Set();
  let running = null, closing = null, executionDone = true, activeKind = null, held = false;
  let lifecycle = 'OPEN', clientLeg = 'NOT_REQUESTED', channelLeg = 'NOT_REQUESTED';
  let clientStop = null, channelStop = null, historicalClose = 'NOT_REQUESTED', closeTerminal = false;
  let commands = 0, admittedOperations = 0, outputUnknown = false, fundingUnknown = false, recoveryUnknown = false, retained = null;
  function hold() { held = true; lifecycle = 'HELD'; }
  function clientView() {
    const v = APPLY(CLIENT_VIEW, client, []);
    if (data(v, withBackend ? 'buyerOriginalBackendRecoveryClientVersion'
      : recovery ? 'buyerOriginalRecoveryClientVersion' : 'sdk105FundingServiceLifecycleVersion') !== 1) fail('client_view_unknown');
    return F({ phase: data(v, 'phase'), lifecycle: data(v, 'lifecycle'), held: data(v, 'held'),
      publicOperationActive: data(v, 'publicOperationActive') });
  }
  function channelView() {
    const v = APPLY(CHANNEL_VIEW, channel, []);
    if (data(v, 'buyerCommandLineChannelVersion') !== 1) fail('channel_view_unknown');
    return F({ lifecycle: data(v, 'lifecycle'), held: data(v, 'held'),
      reading: data(v, 'reading'), writing: data(v, 'writing') });
  }
  function currentClean() {
    try {
      const a = clientView(), b = channelView();
      return a.lifecycle === 'CLOSED' && a.held === false && a.publicOperationActive === false
        && b.lifecycle === 'CLOSED' && b.held === false && b.reading === false && b.writing === false;
    } catch { return false; }
  }
  function checkCompletion() {
    if (closing === null || closeTerminal || !executionDone || clientLeg !== 'CLOSED' || channelLeg !== 'CLOSED') return;
    if (!currentClean()) { hold(); return; }
    completion.complete();
  }
  function terminal(clean) {
    if (closeTerminal) return;
    closeTerminal = true;
    if (clean && executionDone && clientLeg === 'CLOSED' && channelLeg === 'CLOSED' && currentClean() && !held) {
      lifecycle = 'CLOSED'; historicalClose = 'FULFILLED_UNDEFINED'; closing.resolve(undefined);
    } else {
      hold(); historicalClose = 'REJECTED'; closing.reject(error('close_unknown'));
      // A stuck private operation remains retained; the public run does not
      // wait forever or acquire a false stop/delivery receipt.
      if (running !== null) running.reject(error('run_unknown'));
    }
  }
  function stop(owner, fn, leg) {
    let returned;
    try {
      returned = APPLY(fn, owner, []);
      observe(returned, result => {
        const clean = result === undefined;
        if (leg === 'client') clientLeg = clean ? 'CLOSED' : 'UNKNOWN';
        else channelLeg = clean ? 'CLOSED' : 'UNKNOWN';
        if (!clean) hold();
        checkCompletion();
      }, () => {
        if (leg === 'client') clientLeg = 'UNKNOWN'; else channelLeg = 'UNKNOWN';
        hold(); checkCompletion();
      });
    } catch {
      if (leg === 'client') clientLeg = 'UNKNOWN'; else channelLeg = 'UNKNOWN';
      hold();
    }
    return returned;
  }
  const close = F(function close() {
    if (arguments.length !== 0) return rejected('input_rejected');
    if (closing !== null) return closing.promise;
    // Revoke admission before monitor, stream, wallet or store callbacks.
    closing = pending(); lifecycle = held ? 'HELD' : 'CLOSING';
    if (activeKind === 'EXECUTE' || activeKind === 'WRITE') { outputUnknown = true; hold(); }
    try { observe(completion.start(), () => terminal(true), () => terminal(false)); }
    catch { hold(); terminal(false); }
    clientLeg = 'PENDING'; channelLeg = 'PENDING';
    clientStop = stop(client, CLIENT_CLOSE, 'client');
    channelStop = stop(channel, CHANNEL_CLOSE, 'channel');
    checkCompletion();
    return closing.promise;
  });
  const inspect = F(function inspect() {
    if (arguments.length !== 0) fail('input_rejected');
    if (lifecycle === 'CLOSED' && !currentClean()) hold();
    return F({ buyerOriginalFundingCommandSessionVersion: 1, lifecycle, held,
      mode: withBackend ? 'RECOVER_EXISTING_ORIGINAL_WITH_BACKEND' : recovery ? 'RECOVER_EXISTING_ORIGINAL' : 'FUNDING_ORIGINAL',
      runRequested: running !== null, closeRequested: closing !== null, executionDone, activeKind,
      commands, admittedOperations, clientClose: clientLeg, channelClose: channelLeg, historicalClose,
      outputOutcomeUnknown: outputUnknown, fundingOutcomeUnknown: fundingUnknown,
      recoveryOutcomeUnknown: recoveryUnknown, retainedResult: retained !== null,
      retainedWriteCallbackCompleted: retained?.writeCallbackCompleted ?? false,
      clientStopRetained: clientStop !== null, channelStopRetained: channelStop !== null,
      serviceDelivery: 'NOT_ESTABLISHED', grantActivation: 'NOT_ESTABLISHED', authority: 'NONE' });
  });
  async function execute() {
    let failed = false;
    try {
      while (closing === null && !held) {
        activeKind = 'READ';
        const line = await native(APPLY(READ, channel, []));
        if (closing !== null) break;
        if (line === null) break;
        if (commands >= limits.maxCommands) fail('command_limit');
        const command = DECODE(line, limits.maxLineBytes);
        if (ids.has(command.id)) fail('duplicate_id');
        ids.add(command.id); commands++;
        if (command.operation === 'close') { activeKind = null; break; }
        let result;
        if (command.operation === 'inspect') {
          activeKind = 'INSPECT';
          result = F({ session: inspect(), client: clientView(), channel: channelView(),
            serviceDelivery: 'NOT_ESTABLISHED', authority: 'NONE' });
        } else {
          activeKind = 'EXECUTE'; admittedOperations++;
          result = await native(APPLY(operations[command.operation], client, [command.input]));
        }
        const resultLine = ENCODE(command, result, limits.maxLineBytes);
        const returnedFundingUnknown = command.operation === 'submitFunding'
          && (/UNKNOWN/.test(data(result, 'phase')) || /UNKNOWN/.test(data(result, 'fundingIntakeStatus')));
        const returnedRecoveryUnknown = (command.operation === 'readRecoveryState' || command.operation === 'reconcileOriginal')
          && data(result, 'reconciliationRequired') === true;
        // Retain exact returned DATA even if the following output write fails.
        // Retrieval is read-only and never writes/resubmits the command.
        retained = F({ id: command.id, operation: command.operation, line: resultLine,
          writeCallbackCompleted: false, remoteReceipt: 'NOT_ESTABLISHED', authority: 'NONE' });
        if (closing !== null || held) { outputUnknown = true; hold(); break; }
        activeKind = 'WRITE';
        if (await native(APPLY(WRITE, channel, [resultLine])) !== undefined) fail('write_unknown');
        if (closing !== null || held) { outputUnknown = true; hold(); break; }
        retained = F({ ...retained, writeCallbackCompleted: true });
        activeKind = null;
        if (returnedFundingUnknown) { fundingUnknown = true; hold(); }
        if (returnedRecoveryUnknown) { recoveryUnknown = true; hold(); }
      }
    } catch {
      failed = true;
      if (closing === null || activeKind !== 'READ') { outputUnknown = admittedOperations > 0; hold(); }
    } finally {
      activeKind = null;
      // Work-body completion is separate from the public run Promise: close
      // joins this flag and the original stop receipts, never its own waiter.
      executionDone = true;
      checkCompletion();
    }
    try { await close(); } catch { failed = true; }
    if (failed || held) running.reject(error('run_unknown'));
    else running.resolve(undefined);
  }
  return F({
    run: F(function run() {
      if (arguments.length !== 0) return rejected('input_rejected');
      if (running !== null) return running.promise;
      running = pending();
      if (closing !== null || held) { running.reject(error('run_unavailable')); return running.promise; }
      executionDone = false;
      try { observe(execute(), () => {}, () => { hold(); running.reject(error('run_unknown')); close(); }); }
      catch { hold(); running.reject(error('run_unknown')); close(); }
      return running.promise;
    }),
    close, inspect,
    retainedResult: F(function retainedResult() {
      if (arguments.length !== 0) fail('input_rejected');
      return retained;
    }),
  });
}
function fields(value, names) {
  if (value === null || typeof value !== 'object' || PROXY(value) || PROTO(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail('configuration_rejected');
  const out = {};
  for (const name of names) {
    const d = DESC(value, name);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail('configuration_rejected');
    Object.defineProperty(out, name, { value: d.value, enumerable: true });
  }
  return out;
}
function method(owner, key) {
  if (owner === null || typeof owner !== 'object' || PROXY(owner) || !Object.isFrozen(owner)) fail('configuration_rejected');
  const d = DESC(owner, key);
  if (!d || !OWN(d, 'value') || typeof d.value !== 'function' || PROXY(d.value)) fail('configuration_rejected');
  return d.value;
}
function data(value, key) {
  if (value === null || typeof value !== 'object' || PROXY(value) || !Object.isFrozen(value)
      || (PROTO(value) !== Object.prototype && PROTO(value) !== null)) fail('observation_rejected');
  const d = DESC(value, key);
  if (!d || !OWN(d, 'value') || !d.enumerable) fail('observation_rejected');
  return d.value;
}
function native(value) {
  if (PROXY(value) || !utilTypes.isPromise(value) || PROTO(value) !== PROMISE) fail('observation_rejected');
  // Node async_hooks/AsyncLocalStorage attach private symbol slots to genuine
  // native Promises. They are not then/constructor overrides. Match the
  // existing bounded-close observer: restrict named own properties, without
  // reading/copying runtime symbol values or rejecting tracing contexts.
  if (Object.getOwnPropertyNames(value).some(key => key !== 'constructor')) fail('observation_rejected');
  const d = DESC(value, 'constructor');
  if (d !== undefined && (!OWN(d, 'value') || d.value !== NativePromise)) fail('observation_rejected');
  return value;
}
function observe(value, yes, no) {
  const bridge = APPLY(THEN, native(value), [yes, no]);
  APPLY(THEN, bridge, [() => {}, () => {}]);
}
function pending() {
  let resolve, reject;
  const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, 'constructor', { value: NativePromise });
  APPLY(THEN, promise, [() => {}, () => {}]);
  return { promise, resolve, reject };
}
function rejected(kind) { const out = pending(); out.reject(error(kind)); return out.promise; }
function error(kind) {
  const code = 'buyer_original_funding_command_session_' + kind, value = new TypeError(code);
  Object.defineProperty(value, 'code', { value: code, enumerable: true });
  Object.defineProperty(value, 'stack', { value: 'TypeError: ' + code });
  return F(value);
}
function fail(kind) { throw error(kind); }
