import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { ClientRequest, IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { TLSSocket, checkServerIdentity } from 'node:tls';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import { TextDecoder, types as utilTypes } from 'node:util';
import { performance } from 'node:perf_hooks';
import { setTimeout, clearTimeout } from 'node:timers';
// Internal, default-off, pre-pinned, method-neutral HTTPS exchange owner.
// Closed static wrappers retain their public route/configuration grammars and
// method adapters; this module alone owns native HTTPS/socket lifecycle. It
// performs a second fail-closed validation of the normalized route and timing
// snapshot before any native capability can exist. Neither an exchange nor its
// response is durable signing or publication authorization. There is no route
// discovery.
// Intrinsics/native imports are trusted at evaluation; same-shape pre-evaluation
// replacements are outside this boundary. Later Promise or Object.prototype
// descriptor/prototype drift fails closed, including unrelated instrumentation
// and polyfills. Restoration never reopens an affected owner. The exact adapter
// may already have consumed one opaque ID before private exchange rejects such
// owner-only drift; no native request or owner attempt is consumed at admission.
// Owned byte buffers are zeroed best-effort; JavaScript strings are not erasable.

const freeze = Object.freeze;
const create = Object.create;
const define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const keys = Reflect.ownKeys;
const names = Object.getOwnPropertyNames;
const apply = Reflect.apply;
const hasOwn = Object.hasOwn;
const isFrozen = Object.isFrozen;
const isArray = Array.isArray;
const isSafeInteger = Number.isSafeInteger;
const isFiniteNumber = Number.isFinite;
const same = Object.is;
const ceil = Math.ceil;
const string = String;
const fromCharCode = String.fromCharCode;
const maxSafeInteger = Number.MAX_SAFE_INTEGER;
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const functionPrototype = Function.prototype;
const isProxy = utilTypes.isProxy;
const isPromise = utilTypes.isPromise;
const NativePromise = Promise;
const promisePrototype = Promise.prototype;
const promiseSpecies = Symbol.species;
const promiseConstructorDescriptor = descriptor(promisePrototype, 'constructor');
const promiseSpeciesDescriptor = descriptor(NativePromise, promiseSpecies);
const promiseThenDescriptor = descriptor(promisePrototype, 'then');
const promiseThen = promiseThenDescriptor !== undefined && hasOwn(promiseThenDescriptor, 'value') ? promiseThenDescriptor.value : undefined;
const initialObjectThen = descriptor(objectPrototype, 'then');
const initialObjectPrototype = prototype(objectPrototype);
const objectBaseline = snapshotObjectPrototype();
const NativeError = Error;
const NativeTypeError = TypeError;
const NativeWeakSet = WeakSet;
const weakHas = WeakSet.prototype.has;
const weakAdd = WeakSet.prototype.add;
const charAt = String.prototype.charCodeAt;
const sliceString = String.prototype.slice;
const bufferFrom = Buffer.from;
const bufferAlloc = Buffer.alloc;
const bufferIsBuffer = Buffer.isBuffer;
const bufferCopy = Buffer.prototype.copy;
const bufferFill = Buffer.prototype.fill;
const typedLength = descriptor(prototype(Uint8Array.prototype), 'length').get;
const decode = TextDecoder.prototype.decode;
const on = EventEmitter.prototype.on;
const remove = EventEmitter.prototype.removeListener;
const readableResume = Readable.prototype.resume;
const requestEnd = ClientRequest.prototype.end;
const requestDestroy = ClientRequest.prototype.destroy;
const responseDestroy = IncomingMessage.prototype.destroy;
const socketDestroy = Socket.prototype.destroy;
const agentDestroy = HttpsAgent.prototype.destroy;
const remoteAddress = descriptor(Socket.prototype, 'remoteAddress').get;
const remoteFamily = descriptor(Socket.prototype, 'remoteFamily').get;
const remotePort = descriptor(Socket.prototype, 'remotePort').get;
const tlsProtocol = TLSSocket.prototype.getProtocol;
const tlsReused = TLSSocket.prototype.isSessionReused;
const nowNative = performance.now;
const initialCanonical = canonicalPromises();
const INVALID = Symbol('rejected native read');
const MAX_BODY = 1052672;
const MAX_REQUEST_BYTES = 1024;
const MAX_ATTEMPTS = 13;
const MAX_HEADER_BYTES = 16384;
const MAX_HEADER_PAIRS = 64;
const CONFIGURATION_FIELDS = freeze(['route', 'timeoutMs', 'closeGraceMs']);
const ROUTE_FIELDS = freeze(['hostname', 'path', 'ipv4Address']);
const DYNAMIC_PLASMA = 'dynamic_plasma';

// Shared, stateless tombstone only. It never retains an owner or generation.
function discard() {}

function put(target, key, value, writable = false) {
  const attributes = create(null);
  attributes.value = value;
  attributes.enumerable = true;
  attributes.writable = writable;
  attributes.configurable = false;
  define(target, key, attributes);
}
function record(fields) {
  const value = create(null);
  const fieldsKeys = keys(fields);
  for (let index = 0; index < fieldsKeys.length; index += 1) {
    const key = fieldsKeys[index];
    put(value, key, fields[key], true);
  }
  return value;
}
function append(array, value) {
  define(array, string(array.length), record({ value, enumerable: true, writable: true, configurable: true }));
}
function invalid() { throw INVALID; }
function codeAt(value, index) { return apply(charAt, value, [index]); }
function slice(value, from, to) { return apply(sliceString, value, [from, to]); }
function sameDescriptor(actual, expected) {
  if (actual === undefined || expected === undefined) return actual === expected;
  const expectedKeys = keys(expected);
  if (keys(actual).length !== expectedKeys.length) return false;
  for (let index = 0; index < expectedKeys.length; index += 1) {
    const key = expectedKeys[index];
    if (!hasOwn(actual, key) || !same(actual[key], expected[key])) return false;
  }
  return true;
}
function snapshotObjectPrototype() {
  const baseline = create(null);
  const own = keys(objectPrototype);
  for (let index = 0; index < own.length; index += 1) put(baseline, own[index], freeze(descriptor(objectPrototype, own[index])));
  return freeze(baseline);
}
function sameObjectPrototype() {
  if (initialObjectPrototype !== null || prototype(objectPrototype) !== null) return false;
  const own = keys(objectPrototype);
  if (own.length !== keys(objectBaseline).length) return false;
  for (let index = 0; index < own.length; index += 1) {
    const key = own[index];
    if (!hasOwn(objectBaseline, key) || !sameDescriptor(descriptor(objectPrototype, key), objectBaseline[key])) return false;
  }
  return true;
}
function canonicalData(value, expected, writable) {
  return value !== undefined && keys(value).length === 4 && hasOwn(value, 'value')
    && value.value === expected && value.writable === writable && value.enumerable === false && value.configurable === true;
}
function nativeFunctionShape(value, name, length) {
  return typeof value === 'function' && !isProxy(value) && prototype(value) === functionPrototype
    && keys(value).length === 2
    && canonicalData(descriptor(value, 'name'), name, false)
    && canonicalData(descriptor(value, 'length'), length, false);
}
function canonicalPromises() {
  const constructor = descriptor(promisePrototype, 'constructor');
  const species = descriptor(NativePromise, promiseSpecies);
  const then = descriptor(promisePrototype, 'then');
  return canonicalData(constructor, NativePromise, true)
    && species !== undefined && keys(species).length === 4 && hasOwn(species, 'get') && hasOwn(species, 'set')
    && species.set === undefined && species.enumerable === false && species.configurable === true
    && nativeFunctionShape(species.get, 'get [Symbol.species]', 0)
    && then !== undefined && hasOwn(then, 'value') && canonicalData(then, then.value, true) && nativeFunctionShape(then.value, 'then', 2);
}
function invariant() {
  return initialCanonical && initialObjectThen === undefined && descriptor(objectPrototype, 'then') === undefined
    && sameObjectPrototype()
    && canonicalPromises()
    && sameDescriptor(descriptor(promisePrototype, 'constructor'), promiseConstructorDescriptor)
    && sameDescriptor(descriptor(NativePromise, promiseSpecies), promiseSpeciesDescriptor)
    && sameDescriptor(descriptor(promisePrototype, 'then'), promiseThenDescriptor);
}
function assertInvariant() { if (!invariant()) invalid(); }
function profile(value) {
  if (value === DYNAMIC_PLASMA) {
    return freeze(record({
      label: 'Dynamic Plasma HTTPS read transport owner',
      prefix: 'dynamic_plasma_https_read_transport_owner_',
    }));
  }
  invalid();
}
function internalProfile() {
  return freeze(record({
    label: 'Bounded JSON-RPC HTTPS exchange owner',
    prefix: 'bounded_json_rpc_https_exchange_owner_',
  }));
}
function fixedError(selected, kind) {
  const typed = kind === 'configuration_rejected';
  const suffix = typed ? 'configuration rejected' : kind === 'close_uncertain' ? 'close uncertain' : 'unavailable';
  const message = `${selected.label} ${suffix}`;
  const error = typed ? new NativeTypeError(message) : new NativeError(message);
  define(error, 'stack', record({ value: `${typed ? 'TypeError' : 'Error'}: ${message}`, enumerable: false, writable: false, configurable: false }));
  put(error, 'code', `${selected.prefix}${kind}`);
  return freeze(error);
}
function pending() {
  let resolve;
  let reject;
  const promise = new NativePromise((accept, refuse) => { resolve = accept; reject = refuse; });
  // Attached before any native capability can run. No rejection value is read.
  const bridge = apply(promiseThen, promise, [discard, discard]);
  if (!isPromise(bridge) || isProxy(bridge) || prototype(bridge) !== promisePrototype || names(bridge).length !== 0) invalid();
  return freeze(record({ promise: freeze(promise), resolve, reject }));
}
function rejected(selected, kind) {
  const result = pending();
  result.reject(fixedError(selected, kind));
  return result.promise;
}
function exact(value, fields, expectedPrototype = objectPrototype) {
  if (value === null || typeof value !== 'object' || isProxy(value) || prototype(value) !== expectedPrototype
      || !isFrozen(value) || keys(value).length !== fields.length) invalid();
  const snapshot = create(null);
  for (let index = 0; index < fields.length; index += 1) {
    const key = fields[index];
    const item = descriptor(value, key);
    if (item === undefined || !hasOwn(item, 'value') || item.enumerable !== true) invalid();
    put(snapshot, key, item.value);
  }
  return freeze(snapshot);
}
function milliseconds(value) {
  if (!isSafeInteger(value) || same(value, -0) || value < 1 || value > 60000) invalid();
  return value;
}
function hostname(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 253) invalid();
  let start = 0;
  let labels = 0;
  let numeric = true;
  for (let index = 0; index <= value.length; index += 1) {
    const character = index === value.length ? 46 : codeAt(value, index);
    if (character === 46) {
      const length = index - start;
      if (length < 1 || length > 63 || codeAt(value, start) === 45 || codeAt(value, index - 1) === 45) invalid();
      labels += 1;
      start = index + 1;
    } else {
      if (!((character >= 97 && character <= 122) || (character >= 48 && character <= 57) || character === 45)) invalid();
      if (character < 48 || character > 57) numeric = false;
    }
  }
  if (labels < 2 || numeric) invalid();
  const suffixes = ['localhost', 'local', 'internal', 'home.arpa', 'invalid', 'test', 'example', 'example.com', 'example.net', 'example.org', 'onion', 'alt', 'arpa'];
  for (let index = 0; index < suffixes.length; index += 1) {
    const suffix = suffixes[index];
    if (value === suffix || slice(value, -suffix.length - 1) === `.${suffix}`) invalid();
  }
  return value;
}
function path(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2048 || codeAt(value, 0) !== 47) invalid();
  let segment = 1;
  const punctuation = "-._~!$&'()*+,;=:@";
  for (let index = 1; index <= value.length; index += 1) {
    const character = index === value.length ? 47 : codeAt(value, index);
    if (character === 47) {
      if (index === segment && index !== value.length) invalid();
      const part = slice(value, segment, index);
      if (part === '.' || part === '..') invalid();
      segment = index + 1;
    } else {
      let allowed = (character >= 48 && character <= 57) || (character >= 65 && character <= 90) || (character >= 97 && character <= 122);
      for (let item = 0; !allowed && item < punctuation.length; item += 1) allowed = character === codeAt(punctuation, item);
      if (!allowed) invalid();
    }
  }
  return value;
}
function ipv4(value) {
  if (typeof value !== 'string') invalid();
  const octets = [];
  let start = 0;
  let numeric = 0;
  for (let index = 0; index <= value.length; index += 1) {
    const character = index === value.length ? 46 : codeAt(value, index);
    if (character === 46) {
      const length = index - start;
      if (length < 1 || length > 3 || (length > 1 && codeAt(value, start) === 48) || numeric > 255) invalid();
      append(octets, numeric); numeric = 0; start = index + 1;
    } else {
      if (character < 48 || character > 57) invalid();
      numeric = numeric * 10 + character - 48;
    }
  }
  if (octets.length !== 4) invalid();
  const a = octets[0];
  const b = octets[1];
  const c = octets[2];
  if (a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && ((b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99) || b === 168))
      || (a === 198 && ((b >= 18 && b <= 19) || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113)) invalid();
  return value;
}
function nativeObject(value, expectedPrototype) {
  if (value === null || typeof value !== 'object' || isProxy(value) || prototype(value) !== expectedPrototype) invalid();
  return value;
}
function field(value, key) {
  const item = descriptor(value, key);
  if (item === undefined || !hasOwn(item, 'value')) invalid();
  return item.value;
}
function rawArray(value, maximum) {
  if (value === null || typeof value !== 'object' || isProxy(value) || !isArray(value) || prototype(value) !== arrayPrototype) invalid();
  const length = field(value, 'length');
  if (!isSafeInteger(length) || length < 0 || length > maximum || keys(value).length !== length + 1) invalid();
  const result = [];
  for (let index = 0; index < length; index += 1) append(result, field(value, string(index)));
  return result;
}
function headerName(value) {
  if (typeof value !== 'string' || value.length === 0) invalid();
  let lowered = '';
  const punctuation = "!#$%&'*+-.^_`|~";
  for (let index = 0; index < value.length; index += 1) {
    const character = codeAt(value, index);
    let allowed = (character >= 48 && character <= 57) || (character >= 65 && character <= 90) || (character >= 97 && character <= 122);
    for (let item = 0; !allowed && item < punctuation.length; item += 1) allowed = character === codeAt(punctuation, item);
    if (!allowed) invalid();
    lowered += character >= 65 && character <= 90 ? fromCharCode(character + 32) : slice(value, index, index + 1);
  }
  return lowered;
}
function responseLength(response) {
  if (field(response, 'httpVersion') !== '1.1' || field(response, 'httpVersionMajor') !== 1
      || field(response, 'httpVersionMinor') !== 1 || field(response, 'statusCode') !== 200) invalid();
  const raw = rawArray(field(response, 'rawHeaders'), MAX_HEADER_PAIRS * 2);
  if (raw.length % 2 !== 0) invalid();
  const seen = create(null);
  let bytes = 2;
  let length = null;
  let contentType = false;
  for (let index = 0; index < raw.length; index += 2) {
    const name = headerName(raw[index]);
    const value = raw[index + 1];
    if (hasOwn(seen, name) || typeof value !== 'string') invalid();
    put(seen, name, true);
    bytes += raw[index].length + value.length + 4;
    if (bytes > MAX_HEADER_BYTES) invalid();
    for (let offset = 0; offset < value.length; offset += 1) {
      const character = codeAt(value, offset);
      if (character < 32 || character > 126) invalid();
    }
    if (name === 'transfer-encoding' || name === 'content-encoding' || name === 'trailer' || name === 'upgrade') invalid();
    if (name === 'connection' && value !== 'close') invalid();
    if (name === 'content-type') {
      if (value !== 'application/json' && value !== 'application/json; charset=utf-8') invalid();
      contentType = true;
    }
    if (name === 'content-length') {
      if (value.length < 1 || value.length > 7 || codeAt(value, 0) < 49 || codeAt(value, 0) > 57) invalid();
      length = 0;
      for (let offset = 0; offset < value.length; offset += 1) {
        const character = codeAt(value, offset);
        if (character < 48 || character > 57) invalid();
        length = length * 10 + character - 48;
      }
      if (length < 1 || length > MAX_BODY) invalid();
    }
  }
  if (!contentType || length === null || rawArray(field(response, 'rawTrailers'), 0).length !== 0) invalid();
  return length;
}

export function createBoundedJsonRpcHttpsExchangeOwner(
  adapterOptions,
  publicArgumentCount,
  snapshotConfiguration,
  profileName,
) {
  let route;
  let timeoutMs;
  let closeGraceMs;
  let selected;
  try {
    selected = profile(profileName);
    assertInvariant();
    if (arguments.length !== 4 || publicArgumentCount !== 1
        || typeof snapshotConfiguration !== 'function' || isProxy(snapshotConfiguration)
        || prototype(snapshotConfiguration) !== functionPrototype) invalid();
    const normalized = apply(snapshotConfiguration, undefined, [adapterOptions]);
    const configuration = exact(normalized, CONFIGURATION_FIELDS, null);
    const input = exact(configuration.route, ROUTE_FIELDS, null);
    route = freeze(record({ hostname: hostname(input.hostname), path: path(input.path), ipv4Address: ipv4(input.ipv4Address) }));
    timeoutMs = milliseconds(configuration.timeoutMs);
    closeGraceMs = milliseconds(configuration.closeGraceMs);
  } catch { throw fixedError(selected ?? internalProfile(), 'configuration_rejected'); }

  const unavailable = rejected(selected, 'unavailable');
  const invalidClose = rejected(selected, 'configuration_rejected');
  // Reserve prehandled settlement while mechanics are trusted. This is not a
  // close operation until the first valid zero-argument close invocation.
  const reservedClose = pending();
  const socketsSeen = new NativeWeakSet();
  let closeOperation = null;
  let closing = false;
  let terminal = false;
  let closeUncertain = false;
  let closeSettled = false;
  let active = null;
  let attempts = 0;
  let lastTime = 0;

  function clock() {
    const value = apply(nowNative, performance, []);
    if (typeof value !== 'number' || !isFiniteNumber(value) || value < lastTime || value < 0 || value > maxSafeInteger) invalid();
    lastTime = value;
    if (!invariant()) {
      terminal = true;
      if (active !== null) { active.failed = true; rejectGeneration(active); }
    }
    return value;
  }
  function cancel(gen, name) {
    const handle = gen[name];
    gen[name] = null;
    if (handle !== null) {
      try { apply(clearTimeout, undefined, [handle]); }
      catch { gen.uncertain = true; }
    }
  }
  function schedule(gen, name, callback, delay) {
    try {
      const handle = apply(setTimeout, undefined, [callback, ceil(delay < 1 ? 1 : delay)]);
      if (handle === null || typeof handle !== 'object' || isProxy(handle)) invalid();
      gen[name] = handle;
      if (!invariant()) invalid();
    } catch { gen.uncertain = true; throw INVALID; }
  }
  function listen(gen, target, name, callback) {
    // Captured emitter registration remains usable solely for cleanup guards
    // after acceptance invariants fail; it does not assimilate any promise.
    if (!invariant()) { terminal = true; gen.failed = true; rejectGeneration(gen); }
    append(gen.listeners, record({ target, name, callback }));
    apply(on, target, [name, callback]);
    if (!invariant()) { terminal = true; gen.failed = true; rejectGeneration(gen); }
  }
  function finishClose() {
    if (closeOperation === null || closeSettled || active !== null) return;
    closeSettled = true;
    if (closeUncertain || !invariant()) reservedClose.reject(fixedError(selected, 'close_uncertain'));
    else reservedClose.resolve(undefined);
  }
  function zero(value) {
    if (value !== null) {
      try { apply(bufferFill, value, [0]); } catch { /* best effort, never expose bytes */ }
    }
  }
  function retire(gen) {
    if (gen.retired || gen.creating || gen.cleaning || gen.resuming) return;
    gen.retired = true;
    cancel(gen, 'deadlineTimer');
    cancel(gen, 'graceTimer');
    const resources = [gen.request, gen.response, gen.socket];
    for (let index = 0; index < gen.listeners.length; index += 1) {
      const listener = gen.listeners[index];
      try { apply(remove, listener.target, [listener.name, listener.callback]); }
      catch { gen.uncertain = true; }
      listener.target = null;
      listener.callback = null;
    }
    gen.listeners = [];
    for (let index = 0; index < resources.length; index += 1) {
      const resource = resources[index];
      if (resource !== null) {
        try { apply(on, resource, ['error', discard]); }
        catch { gen.uncertain = true; }
      }
    }
    zero(gen.requestBody); zero(gen.buffer);
    gen.requestBody = null; gen.buffer = null; gen.text = null;
    gen.request = null; gen.response = null; gen.socket = null; gen.agent = null;
    if (gen.uncertain) { closeUncertain = true; terminal = true; }
    if (active === gen) active = null;
    finishClose();
  }
  function drainLateSocket(value) {
    try {
      nativeObject(value, TLSSocket.prototype);
      apply(on, value, ['error', discard]);
      apply(socketDestroy, value, []);
    } catch { closeUncertain = true; terminal = true; }
  }
  function destroy(gen, name, flag, method) {
    const value = gen[name];
    if (value === null || gen[flag]) return;
    gen[flag] = true;
    try { apply(method, value, []); }
    catch { gen.uncertain = true; }
  }
  function rejectGeneration(gen) {
    if (gen.settled) return;
    gen.settled = true;
    gen.outward.reject(fixedError(selected, 'unavailable'));
  }
  function fail(gen) {
    if (gen.retired) return;
    terminal = true;
    gen.failed = true;
    rejectGeneration(gen);
    cancel(gen, 'deadlineTimer');
    cleanup(gen);
  }
  function guarded(gen, operation) {
    return function callback(...args) {
      if (gen.retired) return;
      try {
        assertInvariant();
        if (clock() >= gen.deadline) { fail(gen); return; }
        apply(operation, undefined, args);
        if (!invariant()) fail(gen);
      } catch { fail(gen); }
    };
  }
  function finish(gen) {
    if (gen.retired || gen.creating || gen.cleaning || gen.resuming) return;
    const closed = !gen.requestStarted || (gen.requestClosed && (!gen.socketAssigned || gen.socketClosed));
    if (gen.graceExpired && !closed) gen.uncertain = true;
    // A socket close cannot stand in for a still-live request. With no socket,
    // keep the request guard through grace to catch a late socket assignment.
    const proof = closed && (!gen.requestStarted || gen.socketAssigned || gen.graceExpired);
    if (!proof && !gen.uncertain) return;
    if (gen.uncertain) {
      terminal = true; closeUncertain = true; rejectGeneration(gen); retire(gen); return;
    }
    if (gen.failed || closing || terminal) {
      rejectGeneration(gen); retire(gen); return;
    }
    try {
      assertInvariant();
      if (!gen.bodyEnded || !gen.secure || gen.text === null || clock() >= gen.deadline) invalid();
      const text = gen.text;
      // Closure/listener/timer cleanup is part of acceptance, not a follow-up.
      retire(gen);
      if (gen.uncertain || !invariant() || closing || terminal) invalid();
      gen.settled = true;
      gen.outward.resolve(text);
    } catch {
      terminal = true;
      rejectGeneration(gen);
      retire(gen);
    }
  }
  function graceExpired(gen) {
    if (gen.retired) return;
    gen.graceTimer = null;
    try {
      const remaining = gen.cleanupDeadline - clock();
      if (remaining > 0) { schedule(gen, 'graceTimer', () => graceExpired(gen), remaining); return; }
      gen.graceExpired = true;
      if (gen.requestStarted && (!gen.requestClosed || (gen.socketAssigned && !gen.socketClosed))) gen.uncertain = true;
      if (gen.requestClosedAt !== null && gen.requestClosedAt > gen.cleanupDeadline) gen.uncertain = true;
      finish(gen);
    } catch { gen.uncertain = true; rejectGeneration(gen); retire(gen); }
  }
  function cleanup(gen) {
    if (gen.retired || gen.cleaning) return;
    gen.cleaning = true;
    if (!gen.cleanupStarted) {
      gen.cleanupStarted = true;
      try {
        gen.cleanupDeadline = clock() + closeGraceMs;
        schedule(gen, 'graceTimer', () => graceExpired(gen), closeGraceMs);
      } catch { gen.uncertain = true; }
    }
    destroy(gen, 'request', 'requestDestroyed', requestDestroy);
    destroy(gen, 'response', 'responseDestroyed', responseDestroy);
    destroy(gen, 'socket', 'socketDestroyed', socketDestroy);
    destroy(gen, 'agent', 'agentDestroyed', agentDestroy);
    gen.cleaning = false;
    finish(gen);
  }
  function deadlineExpired(gen) {
    if (gen.retired) return;
    gen.deadlineTimer = null;
    try {
      const remaining = gen.deadline - clock();
      if (remaining > 0) { schedule(gen, 'deadlineTimer', () => deadlineExpired(gen), remaining); return; }
    } catch { gen.uncertain = true; }
    fail(gen);
  }
  function onSocket(gen, value) {
    if (gen.retired) { drainLateSocket(value); return; }
    try {
      nativeObject(value, TLSSocket.prototype);
      if (gen.socketAssigned || apply(weakHas, socketsSeen, [value])) {
        if (value !== gen.socket) { drainLateSocket(value); gen.uncertain = true; }
        fail(gen); return;
      }
      apply(weakAdd, socketsSeen, [value]);
      gen.socketAssigned = true; gen.socket = value;
      listen(gen, value, 'close', function socketClosed(hadError) {
        if (gen.retired) return;
        gen.socketClosed = true;
        try {
          const observedAt = clock();
          if (gen.cleanupStarted && observedAt > gen.cleanupDeadline) gen.uncertain = true;
          if (hadError !== false || !invariant() || (!gen.failed && observedAt >= gen.deadline) || gen.uncertain) { fail(gen); return; }
          if (!gen.bodyEnded && !gen.failed && !closing) { fail(gen); return; }
          finish(gen);
        } catch { fail(gen); }
      });
      listen(gen, value, 'error', () => fail(gen));
      listen(gen, value, 'end', () => { if (!gen.bodyEnded) fail(gen); });
      listen(gen, value, 'timeout', () => fail(gen));
      listen(gen, value, 'secureConnect', guarded(gen, () => {
        if (gen.secure || gen.failed || closing || terminal
            || field(value, 'authorized') !== true || field(value, 'encrypted') !== true
            || field(value, 'servername') !== route.hostname || field(value, 'alpnProtocol') !== 'http/1.1'
            || apply(remoteAddress, value, []) !== route.ipv4Address || apply(remoteFamily, value, []) !== 'IPv4'
            || apply(remotePort, value, []) !== 443 || apply(tlsProtocol, value, []) !== 'TLSv1.3'
            || apply(tlsReused, value, []) !== false || field(gen.request, 'reusedSocket') !== false) invalid();
        gen.secure = true;
      }));
      if (!invariant() || gen.failed || closing || terminal || gen.cleanupStarted) fail(gen);
    } catch { fail(gen); }
  }
  function onResponse(gen, value) {
    if (gen.retired) {
      try { nativeObject(value, IncomingMessage.prototype); apply(on, value, ['error', discard]); apply(responseDestroy, value, []); }
      catch { closeUncertain = true; terminal = true; }
      return;
    }
    try {
      nativeObject(value, IncomingMessage.prototype);
      if (gen.response !== null) {
        if (value !== gen.response) {
          try { apply(on, value, ['error', discard]); apply(responseDestroy, value, []); }
          catch { gen.uncertain = true; }
        }
        fail(gen); return;
      }
      gen.response = value;
      listen(gen, value, 'error', () => fail(gen));
      listen(gen, value, 'aborted', () => fail(gen));
      listen(gen, value, 'close', () => { if (!gen.bodyEnded) fail(gen); });
      if (!gen.secure || gen.failed || closing || terminal) invalid();
      gen.expectedLength = responseLength(value);
      gen.buffer = apply(bufferAlloc, Buffer, [gen.expectedLength]);
      listen(gen, value, 'data', guarded(gen, chunk => {
        if (gen.bodyEnded || gen.failed || closing || terminal || isProxy(chunk) || !apply(bufferIsBuffer, Buffer, [chunk])
            || prototype(chunk) !== Buffer.prototype) invalid();
        const length = apply(typedLength, chunk, []);
        if (gen.received + length > gen.expectedLength) invalid();
        apply(bufferCopy, chunk, [gen.buffer, gen.received]);
        gen.received += length;
      }));
      listen(gen, value, 'end', guarded(gen, () => {
        if (gen.bodyEnded || gen.failed || closing || terminal || field(value, 'complete') !== true
            || gen.received !== gen.expectedLength || rawArray(field(value, 'rawTrailers'), 0).length !== 0) invalid();
        const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
        gen.text = apply(decode, decoder, [gen.buffer]);
        gen.bodyEnded = true;
        cleanup(gen);
      }));
      // Captured EventEmitter.on deliberately avoids dynamic native methods,
      // but unlike Readable.on it does not start a stream's data flow. Start
      // exactly once, only after every guard is installed. Reentrant completion
      // cannot settle until this capability returns with all invariants intact.
      const beforeFlow = clock();
      assertInvariant();
      if (gen.retired || active !== gen || gen.failed || closing || terminal || beforeFlow >= gen.deadline) invalid();
      gen.resuming = true;
      try { apply(readableResume, value, []); }
      finally { gen.resuming = false; }
      const afterFlow = clock();
      assertInvariant();
      if (gen.failed || closing || terminal || afterFlow >= gen.deadline) invalid();
      finish(gen);
    } catch { fail(gen); }
  }

  const exchange = freeze(function exchange(body) {
    if (terminal || closing || active !== null || attempts >= MAX_ATTEMPTS || !invariant()) { terminal = true; return unavailable; }
    try {
      if (arguments.length !== 1 || typeof body !== 'string' || body.length < 1 || body.length > MAX_REQUEST_BYTES) invalid();
      for (let index = 0; index < body.length; index += 1) if (codeAt(body, index) < 32 || codeAt(body, index) > 126) invalid();
    } catch { terminal = true; return unavailable; }
    const outward = pending();
    const gen = record({
      outward, request: null, response: null, socket: null, agent: null,
      listeners: [], requestBody: null, buffer: null, text: null,
      deadline: 0, cleanupDeadline: 0, deadlineTimer: null, graceTimer: null,
      received: 0, expectedLength: 0, creating: true, cleaning: false, resuming: false,
      requestStarted: false, requestClosed: false, requestClosedAt: null, socketAssigned: false, socketClosed: false,
      requestDestroyed: false, responseDestroyed: false, socketDestroyed: false, agentDestroyed: false,
      secure: false, bodyEnded: false, failed: false, uncertain: false, settled: false,
      retired: false, cleanupStarted: false, graceExpired: false,
    });
    active = gen;
    attempts += 1;
    try {
      gen.deadline = clock() + timeoutMs;
      assertInvariant();
      if (terminal || closing || gen.failed) invalid();
      schedule(gen, 'deadlineTimer', () => deadlineExpired(gen), timeoutMs);
      if (terminal || closing || gen.failed) invalid();
      gen.agent = nativeObject(new HttpsAgent({ keepAlive: false, maxSockets: 1, maxTotalSockets: 1, maxFreeSockets: 0, maxCachedSessions: 0 }), HttpsAgent.prototype);
      assertInvariant();
      if (terminal || closing || gen.failed) invalid();
      gen.requestBody = apply(bufferFrom, Buffer, [body, 'ascii']);
      const lookup = freeze(function lookup(host, options, callback) {
        let called = false;
        try {
          assertInvariant();
          if (gen.retired || terminal || closing || host !== route.hostname || typeof callback !== 'function' || isProxy(callback)) invalid();
          let all = false;
          if (isProxy(options)) invalid();
          if (options !== null && typeof options === 'object') {
            const selected = descriptor(options, 'all');
            if (selected !== undefined) { if (!hasOwn(selected, 'value') || typeof selected.value !== 'boolean') invalid(); all = selected.value; }
          }
          called = true;
          if (all) apply(callback, undefined, [null, freeze([freeze({ address: route.ipv4Address, family: 4 })])]);
          else apply(callback, undefined, [null, route.ipv4Address, 4]);
          assertInvariant();
        } catch {
          fail(gen);
          if (!called && typeof callback === 'function' && !isProxy(callback)) {
            try { apply(callback, undefined, [fixedError(selected, 'unavailable')]); } catch { /* no diagnostic inspection */ }
          }
        }
      });
      const headers = freeze({ Host: route.hostname, 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': string(body.length), Connection: 'close' });
      const nativeOptions = freeze({
        protocol: 'https:', hostname: route.hostname, port: 443, path: route.path, method: 'POST',
        family: 4, autoSelectFamily: false, lookup, servername: route.hostname,
        rejectUnauthorized: true, checkServerIdentity, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3',
        ALPNProtocols: freeze(['http/1.1']), agent: gen.agent, headers,
        setHost: false, maxHeaderSize: MAX_HEADER_BYTES, insecureHTTPParser: false, joinDuplicateHeaders: false,
      });
      assertInvariant();
      gen.requestStarted = true;
      const returned = apply(httpsRequest, undefined, [nativeOptions]);
      try { gen.request = nativeObject(returned, ClientRequest.prototype); }
      catch { gen.uncertain = true; throw INVALID; }
      // Install closure guards even if synchronous native reentrancy closed
      // admission while request construction was returning its exact handle.
      listen(gen, gen.request, 'close', () => {
        if (gen.retired) return;
        gen.requestClosed = true;
        try {
          gen.requestClosedAt = clock();
          if (gen.cleanupStarted && gen.requestClosedAt > gen.cleanupDeadline) gen.uncertain = true;
        } catch { gen.uncertain = true; }
        if (!gen.bodyEnded && !gen.failed && !closing) fail(gen);
        else finish(gen);
      });
      listen(gen, gen.request, 'socket', value => onSocket(gen, value));
      listen(gen, gen.request, 'response', value => onResponse(gen, value));
      const rejectedEvents = ['error', 'abort', 'timeout', 'information', 'continue', 'upgrade', 'connect'];
      for (let index = 0; index < rejectedEvents.length; index += 1) listen(gen, gen.request, rejectedEvents[index], () => fail(gen));
      gen.creating = false;
      assertInvariant();
      if (terminal || closing || gen.failed) invalid();
      apply(requestEnd, gen.request, [gen.requestBody]);
      if (!invariant()) fail(gen);
    } catch { gen.creating = false; fail(gen); }
    finally {
      gen.creating = false;
      if (gen.failed || closing || terminal) cleanup(gen);
    }
    return outward.promise;
  });

  const close = freeze(function close() {
    if (arguments.length !== 0) return invalidClose;
    if (closeOperation !== null) return closeOperation;
    closeOperation = reservedClose.promise;
    closing = true;
    terminal = true;
    if (active !== null) fail(active);
    finishClose();
    return closeOperation;
  });
  assertInvariant();
  return freeze({ exchange, close });
}
