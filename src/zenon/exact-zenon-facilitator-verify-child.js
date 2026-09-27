import { types as utilTypes } from 'node:util';

const IPC_VERSION = 1, REQUEST_ID = 1, REQUEST_TYPE = 'VERIFY';
const MAX_FRAME_BYTES = 64 * 1024, MAX_STRING_BYTES = 16 * 1024;
const MAX_DEPTH = 16, MAX_CONTAINER_ENTRIES = 128, MAX_TOTAL_VALUES = 1024;
const MAX_PAYER_BYTES = 256, MAX_TIMEOUT_MS = 30_000;
const REQUEST_FIELDS = Object.freeze(['ipcVersion', 'requestId', 'type', 'paymentPayload',
  'requirements', 'paymentRequired', 'expectedPayer']);
const RESPONSE_FRAMES = Object.freeze({
  VERIFIED: '{"ipcVersion":1,"requestId":1,"type":"VERIFY_RESULT","ok":true}',
  INVALID_REQUEST: '{"ipcVersion":1,"requestId":1,"type":"VERIFY_RESULT","ok":false,"code":"INVALID_REQUEST"}',
  DUPLICATE_REQUEST: '{"ipcVersion":1,"requestId":1,"type":"VERIFY_RESULT","ok":false,"code":"DUPLICATE_REQUEST"}',
  VERIFY_REJECTED: '{"ipcVersion":1,"requestId":1,"type":"VERIFY_RESULT","ok":false,"code":"VERIFY_REJECTED"}',
  INVALID_RESULT: '{"ipcVersion":1,"requestId":1,"type":"VERIFY_RESULT","ok":false,"code":"INVALID_RESULT"}',
  PAYER_MISMATCH: '{"ipcVersion":1,"requestId":1,"type":"VERIFY_RESULT","ok":false,"code":"PAYER_MISMATCH"}',
  VERIFY_FAILED: '{"ipcVersion":1,"requestId":1,"type":"VERIFY_RESULT","ok":false,"code":"VERIFY_FAILED"}',
  DEADLINE_EXCEEDED: '{"ipcVersion":1,"requestId":1,"type":"VERIFY_RESULT","ok":false,"code":"DEADLINE_EXCEEDED"}',
});
const ARRAY_IS_ARRAY = Array.isArray, GET_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE = Object.getPrototypeOf, HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy, OBJECT_PROTOTYPE = Object.prototype;
const JSON_PARSE = JSON.parse, JSON_STRINGIFY = JSON.stringify;
const REFLECT_APPLY = Reflect.apply, REFLECT_KEYS = Reflect.ownKeys;
const INVALID_INPUT = Symbol('invalid-input');
const RESERVED_CHANNELS = new WeakSet();
function dependencyError() {
  const code = 'EXACT_ZENON_VERIFY_CHILD_INVALID_DEPENDENCY', error = new Error(code);
  error.name = 'ExactZenonVerifyChildError'; error.code = code;
  error.stack = `ExactZenonVerifyChildError: ${code}`;
  return error;
}
function dataMethod(owner, name) {
  try {
    if (!owner || (typeof owner !== 'object' && typeof owner !== 'function') || IS_PROXY(owner)) throw INVALID_INPUT;
    let current = owner;
    for (let depth = 0; current !== null && depth < 12; depth += 1) {
      if (IS_PROXY(current)) throw INVALID_INPUT;
      const descriptor = GET_DESCRIPTOR(current, name);
      if (descriptor) {
        if (!HAS_OWN(descriptor, 'value') || typeof descriptor.value !== 'function') throw INVALID_INPUT;
        return descriptor.value;
      }
      current = GET_PROTOTYPE(current);
    }
  } catch {}
  throw dependencyError();
}
function utf8SizeAtMost(text, limit) {
  if (typeof text !== 'string' || text.length > limit) return -1;
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit <= 0x7f) bytes += 1;
    else if (unit <= 0x7ff) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return -1;
      bytes += 4; index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return -1;
    else bytes += 3;
    if (bytes > limit) return -1;
  }
  return bytes;
}
function exactRecord(value, fields) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE(value) !== OBJECT_PROTOTYPE) throw INVALID_INPUT;
  const keys = REFLECT_KEYS(value);
  if (keys.length !== fields.length) throw INVALID_INPUT;
  for (const key of keys) if (typeof key !== 'string' || !fields.includes(key)) throw INVALID_INPUT;
  for (const field of fields) {
    const descriptor = GET_DESCRIPTOR(value, field);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) throw INVALID_INPUT;
  }
  return value;
}
function boundedJson(root) {
  const pending = [[root, 0]];
  let total = 0;
  while (pending.length > 0) {
    const [value, depth] = pending.pop();
    total += 1;
    if (total > MAX_TOTAL_VALUES) throw INVALID_INPUT;
    if (value === null || typeof value === 'boolean') continue;
    if (typeof value === 'string') {
      if (utf8SizeAtMost(value, MAX_STRING_BYTES) < 0) throw INVALID_INPUT;
      continue;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw INVALID_INPUT;
      continue;
    }
    if (typeof value !== 'object' || IS_PROXY(value) || depth >= MAX_DEPTH) throw INVALID_INPUT;
    const keys = REFLECT_KEYS(value);
    if (ARRAY_IS_ARRAY(value)) {
      if (GET_PROTOTYPE(value) !== Array.prototype || value.length > MAX_CONTAINER_ENTRIES ||
          keys.length !== value.length + 1) throw INVALID_INPUT;
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = GET_DESCRIPTOR(value, String(index));
        if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) throw INVALID_INPUT;
        pending.push([descriptor.value, depth + 1]);
      }
      continue;
    }
    if (GET_PROTOTYPE(value) !== OBJECT_PROTOTYPE || keys.length > MAX_CONTAINER_ENTRIES) throw INVALID_INPUT;
    for (const key of keys) {
      const descriptor = typeof key === 'string' ? GET_DESCRIPTOR(value, key) : undefined;
      if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) throw INVALID_INPUT;
      pending.push([descriptor.value, depth + 1]);
    }
  }
}
function parseRequest(frame) {
  if (utf8SizeAtMost(frame, MAX_FRAME_BYTES) < 1) throw INVALID_INPUT;
  const request = exactRecord(REFLECT_APPLY(JSON_PARSE, JSON, [frame]), REQUEST_FIELDS);
  boundedJson(request);
  if (REFLECT_APPLY(JSON_STRINGIFY, JSON, [request]) !== frame ||
      request.ipcVersion !== IPC_VERSION || request.requestId !== REQUEST_ID || request.type !== REQUEST_TYPE ||
      !request.paymentPayload || typeof request.paymentPayload !== 'object' || ARRAY_IS_ARRAY(request.paymentPayload) ||
      !request.requirements || typeof request.requirements !== 'object' || ARRAY_IS_ARRAY(request.requirements) ||
      !request.paymentRequired || typeof request.paymentRequired !== 'object' || ARRAY_IS_ARRAY(request.paymentRequired) ||
      utf8SizeAtMost(request.expectedPayer, MAX_PAYER_BYTES) < 1 || /[^\x21-\x7e]/u.test(request.expectedPayer)) {
    throw INVALID_INPUT;
  }
  return { paymentPayload: request.paymentPayload, requirements: request.requirements,
    paymentRequired: request.paymentRequired, expectedPayer: request.expectedPayer };
}
function resultCode(result, expectedPayer) {
  try {
    if (!result || typeof result !== 'object' || IS_PROXY(result) || ARRAY_IS_ARRAY(result) ||
        GET_PROTOTYPE(result) !== OBJECT_PROTOTYPE) return 'INVALID_RESULT';
    const valid = GET_DESCRIPTOR(result, 'isValid');
    if (!valid || !HAS_OWN(valid, 'value') || valid.enumerable !== true) return 'INVALID_RESULT';
    if (valid.value === false) return 'VERIFY_REJECTED';
    if (valid.value !== true) return 'INVALID_RESULT';
    const payer = GET_DESCRIPTOR(result, 'payer');
    const keys = REFLECT_KEYS(result);
    if (!payer || !HAS_OWN(payer, 'value') || payer.enumerable !== true ||
        typeof payer.value !== 'string' || keys.length < 2 || keys.length > 3) {
      return 'INVALID_RESULT';
    }
    for (const key of keys) {
      if (key !== 'isValid' && key !== 'payer' && key !== 'then') return 'INVALID_RESULT';
    }
    if (keys.includes('then')) {
      const then = GET_DESCRIPTOR(result, 'then');
      if (!then || !HAS_OWN(then, 'value') || then.value !== undefined || then.enumerable !== false) {
        return 'INVALID_RESULT';
      }
    }
    return payer.value === expectedPayer ? 'VERIFIED' : 'PAYER_MISMATCH';
  } catch {
    return 'INVALID_RESULT';
  }
}
export function runExactZenonFacilitatorVerifyChild(channel, facilitator, timeoutMs = 5_000) {
  const on = dataMethod(channel, 'on');
  const removeListener = dataMethod(channel, 'removeListener');
  const send = dataMethod(channel, 'send');
  if (RESERVED_CHANNELS.has(channel)) throw dependencyError();
  const verify = dataMethod(facilitator, 'verify');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) throw dependencyError();
  RESERVED_CHANNELS.add(channel);
  let phase = 'WAITING', terminal = false, completed = false;
  let messageListening = false, disconnectListening = false;
  let deadlineTimer, sendTimer, resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });

  const removeMessage = () => {
    if (!messageListening) return;
    messageListening = false;
    try { REFLECT_APPLY(removeListener, channel, ['message', onMessage]); } catch {}
  }, removeDisconnect = () => {
    if (!disconnectListening) return;
    disconnectListening = false;
    try { REFLECT_APPLY(removeListener, channel, ['disconnect', onDisconnect]); } catch {}
  }, complete = code => {
    if (completed) return;
    completed = true;
    removeMessage();
    removeDisconnect();
    clearTimeout(deadlineTimer);
    clearTimeout(sendTimer);
    resolveDone(code);
  }, latch = () => {
    if (terminal) return false;
    terminal = true;
    removeMessage();
    clearTimeout(deadlineTimer);
    deadlineTimer = undefined;
    return true;
  }, respond = code => {
    if (!latch()) return;
    sendTimer = setTimeout(() => complete('SEND_FAILED'), timeoutMs);
    let synchronous = true, callbackResult;
    try {
      const accepted = REFLECT_APPLY(send, channel, [RESPONSE_FRAMES[code], error => {
        const result = error == null ? code : 'SEND_FAILED';
        if (synchronous) callbackResult = result;
        else complete(result);
      }]);
      synchronous = false;
      if (accepted !== true) complete('SEND_FAILED');
      else if (callbackResult) complete(callbackResult);
    } catch {
      synchronous = false;
      complete('SEND_FAILED');
    }
  }, onDisconnect = () => {
    if (!terminal) latch();
    complete('DISCONNECTED');
  }, onMessage = frame => {
    if (terminal) return;
    if (phase !== 'WAITING') return respond('DUPLICATE_REQUEST');
    phase = 'VERIFYING';
    let request;
    try { request = parseRequest(frame); } catch {
      respond('INVALID_REQUEST');
      return;
    }
    let pending;
    try {
      pending = REFLECT_APPLY(verify, facilitator,
        [request.paymentPayload, request.requirements, request.paymentRequired]);
    } catch { respond('VERIFY_FAILED'); return; }
    Promise.resolve(pending).then(
      result => { if (!terminal) respond(resultCode(result, request.expectedPayer)); },
      () => { if (!terminal) respond('VERIFY_FAILED'); },
    );
  };
  try {
    messageListening = true;
    REFLECT_APPLY(on, channel, ['message', onMessage]);
    if (!terminal) {
      disconnectListening = true;
      REFLECT_APPLY(on, channel, ['disconnect', onDisconnect]);
    }
    if (!terminal) deadlineTimer = setTimeout(() => respond('DEADLINE_EXCEEDED'), timeoutMs);
  } catch {
    removeMessage();
    removeDisconnect();
    clearTimeout(deadlineTimer);
    throw dependencyError();
  }
  return done;
}
