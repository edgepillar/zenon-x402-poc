import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import {
  validateActiveUpfrontRequirement, validatePaymentRequiredForOfferSelection,
  validatePaymentPayloadEnvelope, sameRequirements, sameResource,
} from './x402-wire.js';

const REQUIREMENT = validateActiveUpfrontRequirement, CHALLENGE = validatePaymentRequiredForOfferSelection;
const PAYLOAD = validatePaymentPayloadEnvelope, SAME_REQUIREMENT = sameRequirements, SAME_RESOURCE = sameResource;
const freeze = Object.freeze, create = Object.create, define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor, prototype = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys, apply = Reflect.apply, hasOwn = Object.hasOwn;
const isProxy = utilTypes.isProxy, isPromise = utilTypes.isPromise, isArray = Array.isArray;
const safe = Number.isSafeInteger, same = Object.is, parse = JSON.parse, stringify = JSON.stringify;
const byteLength = Buffer.byteLength, test = Function.call.bind(RegExp.prototype.test);
const objectPrototype = Object.prototype, arrayPrototype = Array.prototype, functionPrototype = Function.prototype;
const NativePromise = Promise, promisePrototype = NativePromise.prototype, nativeThen = promisePrototype.then;
const constructorDescriptor = descriptor(promisePrototype, 'constructor');
const species = Symbol.species, speciesDescriptor = descriptor(NativePromise, species);
const initialThen = descriptor(objectPrototype, 'then');
const initialObjectJson = descriptor(objectPrototype, 'toJSON'), initialArrayJson = descriptor(arrayPrototype, 'toJSON');
const NativeMap = Map, mapGet = Map.prototype.get, mapHas = Map.prototype.has, mapSet = Map.prototype.set;
const NativeWeakSet = WeakSet, weakAdd = WeakSet.prototype.add, weakHas = WeakSet.prototype.has;
const ErrorType = TypeError;
const CONFIG = freeze(['requirement', 'localClient', 'validateChallenge', 'assetInfo', 'contextLimit']);

/**
 * Default-off SDK-FREE client role extracted from the existing interop client's
 * selected-offer contract, not an import/activation of that test or its SDK.
 * Returns {adapter, getSnapshot}. The adapter supplies exact scheme hooks,
 * createPaymentPayload and explicit fixed-asset metadata, with no transport.
 *
 * localClient.createPaymentPayload is a TRUSTED OPERATIONAL capability. Capture
 * it once, never infer consent from schema validation or consistent DATA, and
 * never default it to a signer/SDK/client. Its owner must enforce payment,
 * signing and account-ordering authority independently. assetInfo is explicit
 * trusted metadata, not authenticated token metadata or a new spend allowance.
 *
 * Capture one unique selected object in an ordered challenge (at most16 offers).
 * Retain descriptor-only bounded snapshots and recheck the original challenge
 * and selected object before and after the borrowed creator. A supplied schema
 * is synchronous/void and cannot replace those snapshots. Only an own undefined
 * optional challenge error is omitted, as in JSON wire encoding.
 *
 * Consume the selected context BEFORE calling its creator. Rejection, malformed
 * fulfillment, source drift and a failure hook never release that claim. No
 * automatic retry, replacement payment, quote refresh or reconstruction exists.
 * Captured raw inputs are detached when creation ends or failure cancels an idle
 * context. Bounded identity tombstones remain. contextLimit1..64 bounds capture
 * attempts and retained contexts separately; there is no eviction/reset/TTL.
 *
 * Native fulfillment is snapshotted BEFORE this bridge resolves its own public
 * Promise. Own then getters are not consulted; unsupported thenables/proxies and
 * direct public-receipt dependencies are refused. Unsafe rejected Promises need
 * owner prehandling; indirect cycles and borrowed operations that never settle
 * remain possible. Captured native intrinsics/dependencies and trusted same-UID
 * code are premises, not a hostile-code, OS, hard lifetime or cancellation fence.
 *
 * This is SDK-shaped structural local composition, NOT official package/HTTP
 * qualification, signature/hash validation, raw signed-byte custody, durable
 * recovery or global replay protection. Fresh objects or instances grant no new
 * payment consent. The external owner retains the original signed bytes/hash
 * and consumed authority after ambiguity. UNKNOWN/ACKNOWLEDGED do not acquire
 * VALIDATED exact-same-block resend permission. No SDK, keys, nonce search, I/O,
 * default buyer/server/CLI import, native PREPARE, publication or live activation.
 */
export function createSelectedPaymentClientBridge(configuration) {
  let fixed, receiver, creator, schema, asset, limit;
  try {
    if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
    const c = record(configuration, CONFIG);
    fixed = parse(serialize(c.requirement)); REQUIREMENT(fixed); fixed = deepFreeze(fixed);
    receiver = c.localClient; creator = captureMethod(receiver, 'createPaymentPayload');
    schema = callable(c.validateChallenge); limit = c.contextLimit;
    const info = record(c.assetInfo, ['asset', 'decimals', 'symbol']);
    if (schema === creator || info.asset !== fixed.asset
        || !safe(info.decimals) || info.decimals < 0 || info.decimals > 18 || same(info.decimals, -0)
        || typeof info.symbol !== 'string' || !test(/^[\x21-\x7e]{1,32}$/, info.symbol)
        || !safe(limit) || limit < 1 || limit > 64 || same(limit, -0)) fail('configuration_rejected');
    asset = freeze({ asset: info.asset, decimals: info.decimals, symbol: info.symbol });
  } catch { fail('configuration_rejected'); }
  const FIXED = fixed, RECEIVER = receiver, CREATOR = creator, SCHEMA = schema, ASSET = asset;
  const entries = new NativeMap(), publicPromises = new NativeWeakSet();
  let capturing = false, captureAttempts = 0, contexts = 0, schemaCalls = 0;
  let consumedContexts = 0, creationAttempts = 0, created = 0, uncertainCreations = 0, retainedInputs = 0;
  configuration = null; fixed = null; receiver = null; creator = null; schema = null; asset = null;

  function capability() {
    let resolve, reject;
    const promise = new NativePromise((a, b) => { resolve = a; reject = b; });
    put(promise, 'constructor', NativePromise, false);
    apply(weakAdd, publicPromises, [promise]);
    return { promise, resolve, reject };
  }
  function rejected(kind) {
    const c = capability(); c.reject(failure(kind)); return c.promise;
  }
  function detach(entry) {
    if (entry.source !== null) {
      retainedInputs--; entry.source = null; entry.views = null;
      entry.challengeJson = null; entry.requirementJson = null;
    }
  }
  function sourceBound(entry) {
    const current = challenge(entry.source);
    if (current.text !== entry.challengeJson || current.views.length !== entry.views.length)
      fail('context_changed');
    for (let i = 0; i < current.views.length; i++)
      if (current.views[i] !== entry.views[i]) fail('context_changed');
    if (serialize(entry.views[entry.index]) !== entry.requirementJson) fail('context_changed');
  }

  const onBeforePaymentCreation = freeze(function onBeforePaymentCreation(context) {
    const c = capability();
    if (capturing) { c.reject(failure('busy')); return c.promise; }
    try {
      if (arguments.length !== 1 || !invariant()) fail('input_rejected');
      if (captureAttempts >= limit) fail('capacity_exhausted');
      captureAttempts++; capturing = true;
      const top = record(context, ['paymentRequired', 'selectedRequirements'], true);
      const original = challenge(top.paymentRequired), selected = top.selectedRequirements;
      let index = -1;
      for (let i = 0; i < original.views.length; i++) if (original.views[i] === selected) {
        if (index !== -1) fail('input_rejected'); index = i;
      }
      if (index === -1 || apply(mapHas, entries, [selected])) fail('context_already_bound');
      const requirementJson = serialize(selected), detached = parse(original.text);
      REQUIREMENT(detached.accepts[index]);
      if (!SAME_REQUIREMENT(detached.accepts[index], FIXED)) fail('input_rejected');
      schemaCalls++;
      if (apply(SCHEMA, undefined, [deepFreeze(detached)]) !== undefined || !invariant())
        fail('input_rejected');
      const entry = { source: top.paymentRequired, views: original.views, index,
        challengeJson: original.text, requirementJson, hasExtensions: hasOwn(detached, 'extensions'),
        state: 'BOUND' };
      sourceBound(entry);
      apply(mapSet, entries, [selected, entry]); contexts++; retainedInputs++;
      c.resolve(undefined);
    } catch { c.reject(failure('capture_rejected')); }
    finally { capturing = false; context = null; }
    return c.promise;
  });

  const onPaymentCreationFailure = freeze(function onPaymentCreationFailure(context) {
    const c = capability();
    try {
      if (arguments.length !== 1 || !invariant() || capturing) fail('input_rejected');
      const selected = record(context, ['selectedRequirements'], true).selectedRequirements;
      const entry = apply(mapGet, entries, [selected]);
      if (entry !== undefined && entry.state === 'CREATING') fail('busy');
      if (entry !== undefined && entry.state === 'BOUND') {
        entry.state = 'FAILED'; consumedContexts++; detach(entry);
      }
      c.resolve(undefined);
    } catch { c.reject(failure('failure_hook_rejected')); }
    finally { context = null; }
    return c.promise;
  });

  const createPaymentPayload = freeze(function createPaymentPayload(version, selectedRequirement, extensionContext) {
    if (arguments.length < 2 || arguments.length > 3) return rejected('input_rejected');
    const c = capability();
    let entry, ended = false, claimed = false, creatorEntered = false;
    function uncertain() {
      if (ended) return;
      ended = true; entry.state = 'FAILED'; uncertainCreations++; detach(entry);
      c.reject(failure('creation_rejected'));
    }
    function complete(value) {
      if (ended) return;
      let part;
      try {
        if (!invariant()) fail('input_rejected');
        const payload = parse(serialize(value));
        PAYLOAD(payload);
        if (payload.x402Version !== 2 || !SAME_REQUIREMENT(payload.accepted, FIXED)
            || !SAME_RESOURCE(payload.resource, parse(entry.challengeJson).resource))
          fail('input_rejected');
        sourceBound(entry);
        part = create(null); put(part, 'x402Version', 2); put(part, 'payload', payload.payload);
        if (hasOwn(payload, 'extensions')) put(part, 'extensions', payload.extensions);
        deepFreeze(part);
      } catch { uncertain(); return; }
      ended = true; entry.state = 'CREATED'; created++; detach(entry);
      c.resolve(part);
    }
    try {
      if (!invariant() || capturing) fail('input_rejected');
      entry = apply(mapGet, entries, [selectedRequirement]);
      if (entry === undefined || entry.state !== 'BOUND') fail('context_consumed_or_missing');
      entry.state = 'CREATING'; claimed = true; consumedContexts++;
      if (version !== 2) fail('input_rejected');
      sourceBound(entry);
      if (extensionPresence(extensionContext) !== entry.hasExtensions) fail('input_rejected');
      const original = parse(entry.challengeJson), selected = original.accepts[entry.index];
      original.accepts = [selected]; deepFreeze(original);
      creationAttempts++; creatorEntered = true;
      const value = apply(CREATOR, RECEIVER, [original, selected]);
      if (!invariant() || (typeof value === 'object' && value !== null && isProxy(value))
          || apply(weakHas, publicPromises, [value])) fail('input_rejected');
      if (isPromise(value)) {
        if (!supportedPromise(value)) fail('input_rejected');
        apply(nativeThen, value, [complete, uncertain]);
      } else complete(value);
    } catch {
      if (claimed && entry.state === 'CREATING') {
        if (creatorEntered && !ended) uncertain();
        else { ended = true; entry.state = 'FAILED'; detach(entry); c.reject(failure('creation_rejected')); }
      } else c.reject(failure('context_consumed_or_missing'));
    } finally { version = null; selectedRequirement = null; extensionContext = null; }
    return c.promise;
  });

  const findDefaultAsset = freeze(function findDefaultAsset(token, network) {
    if (arguments.length !== 2 || token !== ASSET.asset || network !== FIXED.network) return undefined;
    return { asset: ASSET.asset, decimals: ASSET.decimals, symbol: ASSET.symbol };
  });
  const getSnapshot = freeze(function getSnapshot() {
    if (arguments.length !== 0) fail('input_rejected');
    return freeze({ captureAttempts, contexts, schemaCalls, consumedContexts, creationAttempts,
      created, uncertainCreations, retainedInputs, contextLimit: limit, authority: 'NONE',
      signingAuthorization: 'NOT_ESTABLISHED', qualification: 'SDK_FREE_LOCAL_COMPONENT_ONLY' });
  });
  return freeze({ adapter: freeze({ scheme: 'exact', findDefaultAsset,
    schemeHooks: freeze({ onBeforePaymentCreation, onPaymentCreationFailure }), createPaymentPayload }), getSnapshot });
}

function challenge(value) {
  const top = record(value, ['x402Version', 'resource', 'accepts'], true);
  const views = arrayValues(top.accepts, 16);
  if (views.length === 0) fail('input_rejected');
  const copy = create(null);
  for (const key of ownKeys(value)) {
    const d = descriptor(value, key);
    if (key === 'error' && d.value === undefined) continue;
    put(copy, key, d.value);
  }
  const text = serialize(copy, true), parsed = parse(text);
  CHALLENGE(parsed);
  return { text, views };
}
function extensionPresence(value) {
  if (value === undefined) return false;
  record(value, [], true);
  const d = descriptor(value, 'extensions');
  if (d === undefined || d.value === undefined) return false;
  const ext = d.value;
  if (ext === null || typeof ext !== 'object' || isProxy(ext)
      || prototype(ext) !== objectPrototype || ownKeys(ext).length !== 0) fail('input_rejected');
  return true;
}
function captureMethod(receiver, name) {
  if (typeof receiver !== 'object' || receiver === null || isProxy(receiver)) fail('configuration_rejected');
  let p = receiver;
  for (let n = 0; n < 8 && p !== null && p !== objectPrototype && p !== functionPrototype; n++) {
    if (isProxy(p)) fail('configuration_rejected');
    const d = descriptor(p, name);
    if (d !== undefined) {
      if (!hasOwn(d, 'value')) fail('configuration_rejected');
      return callable(d.value);
    }
    p = prototype(p);
  }
  fail('configuration_rejected');
}
function callable(value) {
  if (typeof value !== 'function' || isProxy(value)) fail('configuration_rejected');
  return value;
}
function record(value, fields, extra = false) {
  if (value === null || typeof value !== 'object' || isProxy(value) || prototype(value) !== objectPrototype)
    fail('input_rejected');
  const keys = ownKeys(value);
  if (keys.length > 32 || (!extra && keys.length !== fields.length)) fail('input_rejected');
  const out = create(null);
  for (const key of keys) {
    const d = descriptor(value, key);
    if (typeof key !== 'string' || d === undefined || !hasOwn(d, 'value') || d.enumerable !== true)
      fail('input_rejected');
    for (let i = 0; i < fields.length; i++) if (fields[i] === key) put(out, key, d.value);
  }
  for (const key of fields) if (!hasOwn(out, key)) fail('input_rejected');
  return out;
}
function arrayValues(value, cap) {
  if (value === null || typeof value !== 'object' || isProxy(value) || !isArray(value)
      || prototype(value) !== arrayPrototype) fail('input_rejected');
  const d = descriptor(value, 'length');
  if (!d || !hasOwn(d, 'value') || !safe(d.value) || d.value < 0 || d.value > cap
      || ownKeys(value).length !== d.value + 1) fail('input_rejected');
  const out = [];
  for (let i = 0; i < d.value; i++) {
    const item = descriptor(value, String(i));
    if (!item || !hasOwn(item, 'value') || item.enumerable !== true) fail('input_rejected');
    put(out, String(i), item.value);
  }
  return out;
}
function serialize(value, detachedTop = false) {
  const out = data(value, 0, { nodes: 4096, units: 131072, bytes: 131072 }, detachedTop);
  const text = stringify(out);
  if (typeof text !== 'string' || text.length === 0 || text.length > 131072
      || apply(byteLength, Buffer, [text, 'utf8']) > 131072) fail('input_rejected');
  return text;
}
function data(value, depth, budget, detachedTop = false) {
  if (depth > 16 || --budget.nodes < 0) fail('input_rejected');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!safe(value) || same(value, -0)) fail('input_rejected');
    return value;
  }
  if (typeof value === 'string') { textBudget(value, budget); return value; }
  if (typeof value !== 'object' || isProxy(value)) fail('input_rejected');
  if (isArray(value)) {
    const items = arrayValues(value, 1024), out = [];
    for (let i = 0; i < items.length; i++) put(out, String(i), data(items[i], depth + 1, budget));
    return freeze(out);
  }
  if ((prototype(value) !== objectPrototype && !(detachedTop && prototype(value) === null))
      || ownKeys(value).length > 256) fail('input_rejected');
  const out = create(null);
  for (const key of ownKeys(value)) {
    if (typeof key !== 'string' || key.length > 128 || key === 'toJSON') fail('input_rejected');
    textBudget(key, budget);
    const d = descriptor(value, key);
    if (!d || !hasOwn(d, 'value') || d.enumerable !== true) fail('input_rejected');
    put(out, key, data(d.value, depth + 1, budget));
  }
  return freeze(out);
}
function textBudget(value, budget) {
  if (value.length > 131072) fail('input_rejected');
  budget.units -= value.length; budget.bytes -= apply(byteLength, Buffer, [value, 'utf8']);
  if (budget.units < 0 || budget.bytes < 0) fail('input_rejected');
}
function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const key of ownKeys(value)) deepFreeze(value[key]);
    return freeze(value);
  }
  return value;
}
function supportedPromise(value) {
  if (prototype(value) !== promisePrototype) return false;
  const d = descriptor(value, 'constructor');
  return d === undefined || (hasOwn(d, 'value') && d.value === NativePromise);
}
function invariant() {
  return initialThen === undefined && descriptor(objectPrototype, 'then') === undefined
    && initialObjectJson === undefined && descriptor(objectPrototype, 'toJSON') === undefined
    && initialArrayJson === undefined && descriptor(arrayPrototype, 'toJSON') === undefined
    && sameDescriptor(descriptor(promisePrototype, 'constructor'), constructorDescriptor)
    && sameDescriptor(descriptor(NativePromise, species), speciesDescriptor);
}
function sameDescriptor(a, b) {
  if (a === undefined || b === undefined || ownKeys(a).length !== ownKeys(b).length) return false;
  for (const key of ownKeys(b)) if (!hasOwn(a, key) || a[key] !== b[key]) return false;
  return true;
}
function put(target, key, value, enumerable = true) {
  const d = create(null); d.value = value; d.enumerable = enumerable; d.writable = false; d.configurable = false;
  define(target, key, d);
}
function failure(kind) {
  const code = 'x402_selected_client_bridge_' + kind, error = new ErrorType(code);
  put(error, 'code', code); put(error, 'stack', 'TypeError: ' + code, false);
  return freeze(error);
}
function fail(kind) { throw failure(kind); }
