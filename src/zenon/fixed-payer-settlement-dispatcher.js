import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { paymentIntentDigest, sha256Hex } from '../canonical.js';
import {
  OfflinePayerWorkerAdmission,
  PAYER_WORKER_ADMISSION_ERROR_CODES,
  PAYER_WORKER_LANES,
  PAYER_WORKER_OPERATION_KINDS,
} from './payer-worker-admission.js';

const IPC_VERSION = 1;
const MAX_FRAME_BYTES = 64 * 1024;
const MAX_STRING_BYTES = 16 * 1024;
const MAX_DEPTH = 20;
const MAX_CONTAINER_ENTRIES = 256;
const MAX_TOTAL_VALUES = 4096;
const MAX_TIMEOUT_MS = 30_000;
const MAX_OPERATIONS = 256;
const HASH_HEX = /^[0-9a-f]{64}$/;
const SAFE_ASCII = /^[\x21-\x7e]+$/;
const REQUEST_TYPES = Object.freeze({
  SETTLE: 'SETTLE',
  MARK_DELIVERY_PENDING: 'MARK_DELIVERY_PENDING',
  MARK_DELIVERED: 'MARK_DELIVERED',
});
const OPTION_FIELDS = Object.freeze([
  'routing', 'shards', 'requestTimeoutMs', 'maxOperationsPerShard',
]);
const SHARD_FIELDS = Object.freeze([
  'shardId', 'payer', 'generation', 'owner', 'channel', 'journalIdentity',
]);
const REQUEST_FIELDS = Object.freeze([
  'ipcVersion', 'type', 'correlationId', 'shardId', 'payer', 'generation',
  'sequence', 'transaction', 'authorizationKey', 'network', 'body',
]);
const RESPONSE_SUCCESS_FIELDS = Object.freeze([
  'ipcVersion', 'type', 'correlationId', 'shardId', 'payer', 'generation',
  'sequence', 'operation', 'ok', 'result',
]);
const RESPONSE_FAILURE_FIELDS = Object.freeze([
  'ipcVersion', 'type', 'correlationId', 'shardId', 'payer', 'generation',
  'sequence', 'operation', 'ok', 'code',
]);
const SETTLE_RESULT_KEYS = new Set([
  'success', 'network', 'transaction', 'payer', 'errorReason', 'state',
  'authorizationKey', 'retrySamePayment', 'deliveryState', 'cachedResponse',
]);
const DELIVERY_STATES = new Set(['NONE', 'DELIVERY_PENDING', 'DELIVERED']);
const RECOVERY_STATES = new Set([
  'VALIDATED', 'SUBMISSION_ACKNOWLEDGED', 'SUBMISSION_OUTCOME_UNKNOWN',
  'MOMENTUM_INCLUDED',
]);
const RESERVED_CHANNELS = new WeakSet();
const RESERVED_OWNERS = new WeakSet();
const RESERVED_JOURNALS = new WeakSet();
const INVALID = Symbol('invalid');

const APPLY = Reflect.apply;
const DEFINE_PROPERTY = Object.defineProperty;
const GET_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_ARRAY = Array.isArray;
const IS_FROZEN = Object.isFrozen;
const IS_PROXY = utilTypes.isProxy;
const OWN_KEYS = Reflect.ownKeys;

export const FIXED_PAYER_SETTLEMENT_DISPATCHER_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: 'INVALID_CONFIGURATION',
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNKNOWN_PAYER: 'UNKNOWN_PAYER',
  PAYER_BUSY: 'PAYER_BUSY',
  CAPACITY_EXHAUSTED: 'CAPACITY_EXHAUSTED',
  SHARD_QUARANTINED: 'SHARD_QUARANTINED',
  RETIREMENT_STARTED: 'RETIREMENT_STARTED',
});
const CODES = FIXED_PAYER_SETTLEMENT_DISPATCHER_ERROR_CODES;

export class FixedPayerSettlementDispatcherError extends Error {
  constructor(code) {
    super(code);
    this.name = 'FixedPayerSettlementDispatcherError';
    this.code = code;
    this.stack = `FixedPayerSettlementDispatcherError: ${code}`;
  }
}

function fail(code) {
  throw new FixedPayerSettlementDispatcherError(code);
}

function isReference(value) {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function exactRecord(value, fields, code, optionalCount = 0) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || IS_ARRAY(value) ||
      GET_PROTOTYPE(value) !== Object.prototype) fail(code);
  const keys = OWN_KEYS(value);
  if (keys.some(key => typeof key !== 'string') ||
      keys.length < fields.length - optionalCount || keys.length > fields.length ||
      keys.some(key => !fields.includes(key))) fail(code);
  const result = Object.create(null);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const descriptor = GET_DESCRIPTOR(value, field);
    if (descriptor === undefined) {
      if (index < fields.length - optionalCount) fail(code);
      continue;
    }
    if (!HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail(code);
    result[field] = descriptor.value;
  }
  return result;
}

function exactArray(value, length, code) {
  if (!IS_ARRAY(value) || IS_PROXY(value) || GET_PROTOTYPE(value) !== Array.prototype ||
      value.length !== length || OWN_KEYS(value).length !== length + 1) fail(code);
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = GET_DESCRIPTOR(value, String(index));
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail(code);
    result.push(descriptor.value);
  }
  return result;
}

function safeAscii(value, maximum, code) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum ||
      Buffer.byteLength(value, 'utf8') > maximum || !SAFE_ASCII.test(value)) fail(code);
  return value;
}

function opaqueIdentity(value, code) {
  if (!isReference(value) || IS_PROXY(value)) fail(code);
  return value;
}

function dataMethod(owner, name, code) {
  try {
    if (!isReference(owner) || IS_PROXY(owner)) fail(code);
    let current = owner;
    for (let depth = 0; current !== null && depth < 16; depth += 1) {
      if (IS_PROXY(current)) fail(code);
      const descriptor = GET_DESCRIPTOR(current, name);
      if (descriptor !== undefined) {
        if (!HAS_OWN(descriptor, 'value') || typeof descriptor.value !== 'function') fail(code);
        return descriptor.value;
      }
      current = GET_PROTOTYPE(current);
    }
  } catch (error) {
    if (error instanceof FixedPayerSettlementDispatcherError) throw error;
  }
  fail(code);
}

function utf8SizeAtMost(text, maximum) {
  if (typeof text !== 'string' || text.length > maximum) return -1;
  const bytes = Buffer.byteLength(text, 'utf8');
  return bytes <= maximum ? bytes : -1;
}

function snapshotJson(root, maximumBytes = MAX_FRAME_BYTES, allowRootShield = false) {
  const budget = { nodes: 0, members: 0 };
  const seen = new Set();
  const visit = (value, depth, rootValue) => {
    budget.nodes += 1;
    if (budget.nodes > MAX_TOTAL_VALUES || depth > MAX_DEPTH) throw INVALID;
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (utf8SizeAtMost(value, MAX_STRING_BYTES) < 0) throw INVALID;
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || !Number.isSafeInteger(value)) throw INVALID;
      return value;
    }
    if (!value || typeof value !== 'object' || IS_PROXY(value) || seen.has(value)) throw INVALID;
    const keys = OWN_KEYS(value);
    seen.add(value);
    try {
      if (IS_ARRAY(value)) {
        if (GET_PROTOTYPE(value) !== Array.prototype || value.length > MAX_CONTAINER_ENTRIES ||
            keys.length !== value.length + 1) throw INVALID;
        budget.members += value.length;
        if (budget.members > MAX_TOTAL_VALUES) throw INVALID;
        const result = [];
        for (let index = 0; index < value.length; index += 1) {
          const descriptor = GET_DESCRIPTOR(value, String(index));
          if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) {
            throw INVALID;
          }
          result.push(visit(descriptor.value, depth + 1, false));
        }
        return result;
      }
      const prototype = GET_PROTOTYPE(value);
      if ((prototype !== Object.prototype && prototype !== null) ||
          keys.length > MAX_CONTAINER_ENTRIES || keys.some(key => typeof key !== 'string')) {
        throw INVALID;
      }
      budget.members += keys.length;
      if (budget.members > MAX_TOTAL_VALUES) throw INVALID;
      const result = Object.create(null);
      for (const key of keys) {
        const descriptor = GET_DESCRIPTOR(value, key);
        if (rootValue && allowRootShield && key === 'then') {
          if (!descriptor || !HAS_OWN(descriptor, 'value') ||
              descriptor.value !== undefined || descriptor.enumerable !== false ||
              descriptor.writable !== false || descriptor.configurable !== false) throw INVALID;
          continue;
        }
        if (key === '__proto__' || key === 'prototype' || key === 'constructor' ||
            utf8SizeAtMost(key, 256) < 1) throw INVALID;
        if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) {
          throw INVALID;
        }
        result[key] = visit(descriptor.value, depth + 1, false);
      }
      return result;
    } finally {
      seen.delete(value);
    }
  };
  const snapshot = visit(root, 0, true);
  let encoded;
  try { encoded = JSON.stringify(snapshot); } catch { throw INVALID; }
  if (encoded === undefined || utf8SizeAtMost(encoded, maximumBytes) < 1) throw INVALID;
  return snapshot;
}

function ownData(value, field) {
  if (!value || typeof value !== 'object') return INVALID;
  const descriptor = GET_DESCRIPTOR(value, field);
  return descriptor && HAS_OWN(descriptor, 'value') && descriptor.enumerable === true
    ? descriptor.value
    : INVALID;
}

function routeDescriptor(value, code) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || IS_ARRAY(value) ||
      GET_PROTOTYPE(value) !== Object.prototype || !IS_FROZEN(value) ||
      OWN_KEYS(value).length !== 2) fail(code);
  const version = ownData(value, 'version');
  const shardId = ownData(value, 'shardId');
  if (!Number.isSafeInteger(version) || version < 1) fail(code);
  safeAscii(shardId, 64, code);
  return { version, shardId };
}

function captureConfiguration(options) {
  const captured = exactRecord(options, OPTION_FIELDS, CODES.INVALID_CONFIGURATION, 2);
  const routing = captured.routing;
  if (!routing || typeof routing !== 'object' || IS_PROXY(routing) || !IS_FROZEN(routing) ||
      GET_PROTOTYPE(routing) !== Object.prototype) fail(CODES.INVALID_CONFIGURATION);
  const route = dataMethod(routing, 'route', CODES.INVALID_CONFIGURATION);
  if (!IS_FROZEN(route)) fail(CODES.INVALID_CONFIGURATION);
  const rawShards = exactArray(captured.shards, 2, CODES.INVALID_CONFIGURATION);
  const requestTimeoutMs = captured.requestTimeoutMs ?? 5_000;
  const maxOperationsPerShard = captured.maxOperationsPerShard ?? 64;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 ||
      requestTimeoutMs > MAX_TIMEOUT_MS || !Number.isSafeInteger(maxOperationsPerShard) ||
      maxOperationsPerShard < 1 || maxOperationsPerShard > MAX_OPERATIONS) {
    fail(CODES.INVALID_CONFIGURATION);
  }

  const transportOwners = new Map();
  const journalIdentities = new Set();
  const shardIds = new Set();
  const payers = new Set();
  const routes = [];
  const shards = rawShards.map((raw, index) => {
    const shard = exactRecord(raw, SHARD_FIELDS, CODES.INVALID_CONFIGURATION);
    safeAscii(shard.shardId, 64, CODES.INVALID_CONFIGURATION);
    safeAscii(shard.generation, 64, CODES.INVALID_CONFIGURATION);
    if (shardIds.has(shard.shardId) || payers.has(shard.payer)) fail(CODES.INVALID_CONFIGURATION);
    shardIds.add(shard.shardId);
    payers.add(shard.payer);
    opaqueIdentity(shard.owner, CODES.INVALID_CONFIGURATION);
    opaqueIdentity(shard.channel, CODES.INVALID_CONFIGURATION);
    opaqueIdentity(shard.journalIdentity, CODES.INVALID_CONFIGURATION);
    for (const handle of new Set([shard.owner, shard.channel])) {
      if (transportOwners.has(handle) && transportOwners.get(handle) !== index) {
        fail(CODES.INVALID_CONFIGURATION);
      }
      transportOwners.set(handle, index);
    }
    if (journalIdentities.has(shard.journalIdentity)) fail(CODES.INVALID_CONFIGURATION);
    journalIdentities.add(shard.journalIdentity);
    if (RESERVED_OWNERS.has(shard.owner) || RESERVED_CHANNELS.has(shard.channel) ||
        RESERVED_JOURNALS.has(shard.journalIdentity)) fail(CODES.INVALID_CONFIGURATION);
    const selected = routeDescriptor(
      APPLY(route, routing, [shard.payer]),
      CODES.INVALID_CONFIGURATION,
    );
    if (selected.shardId !== shard.shardId) fail(CODES.INVALID_CONFIGURATION);
    routes.push(selected);
    return {
      ...shard,
      routeVersion: selected.version,
      ownerOn: dataMethod(shard.owner, 'on', CODES.INVALID_CONFIGURATION),
      ownerRemove: dataMethod(shard.owner, 'removeListener', CODES.INVALID_CONFIGURATION),
      channelOn: dataMethod(shard.channel, 'on', CODES.INVALID_CONFIGURATION),
      channelRemove: dataMethod(shard.channel, 'removeListener', CODES.INVALID_CONFIGURATION),
      channelSend: dataMethod(shard.channel, 'send', CODES.INVALID_CONFIGURATION),
    };
  });
  if (routes[0].shardId === routes[1].shardId || routes[0].version !== routes[1].version) {
    fail(CODES.INVALID_CONFIGURATION);
  }
  return { routing, route, shards, requestTimeoutMs, maxOperationsPerShard };
}

function identityEqual(left, right) {
  return left !== null && right !== null && left.payer === right.payer &&
    left.transaction === right.transaction && left.authorizationKey === right.authorizationKey &&
    left.network === right.network;
}

function paymentEqual(left, right) {
  return left !== null && right !== null && identityEqual(left.identity, right.identity) &&
    left.paymentCommitment === right.paymentCommitment;
}

function shield(result) {
  DEFINE_PROPERTY(result, 'then', {
    value: undefined,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return result;
}

function recovery(identity) {
  return shield({
    success: false,
    network: identity.network,
    transaction: identity.transaction,
    payer: identity.payer,
    errorReason: 'submission_outcome_unknown',
    state: 'SUBMISSION_OUTCOME_UNKNOWN',
    authorizationKey: identity.authorizationKey,
    retrySamePayment: true,
    deliveryState: 'NONE',
  });
}

function settlementIdentity(body) {
  const paymentPayload = body.paymentPayload;
  const requirements = body.requirements;
  const paymentRequired = body.paymentRequired;
  const payload = ownData(paymentPayload, 'payload');
  const transactionValue = payload === INVALID ? INVALID : ownData(payload, 'transaction');
  const payer = transactionValue === INVALID ? INVALID : ownData(transactionValue, 'address');
  const transaction = transactionValue === INVALID ? INVALID : ownData(transactionValue, 'hash');
  const accepted = ownData(paymentPayload, 'accepted');
  const acceptedNetwork = accepted === INVALID ? INVALID : ownData(accepted, 'network');
  const network = ownData(requirements, 'network');
  if (typeof payer !== 'string' || !HASH_HEX.test(transaction) ||
      typeof network !== 'string' || acceptedNetwork !== network ||
      utf8SizeAtMost(network, 128) < 1) fail(CODES.INVALID_REQUEST);
  let intentDigest;
  let resourceDigest;
  let authorizationKey;
  try {
    intentDigest = paymentIntentDigest(paymentRequired, requirements);
    resourceDigest = sha256Hex(paymentRequired.resource);
    if (ownData(payload, 'intentDigest') !== intentDigest) fail(CODES.INVALID_REQUEST);
    authorizationKey = sha256Hex({
      domain: 'zenon-x402-authorization-v1',
      chainProfile: requirements.extra.zenonChain,
      intentDigest,
      resourceDigest,
      transactionHash: transaction,
    });
  } catch (error) {
    if (error instanceof FixedPayerSettlementDispatcherError) throw error;
    fail(CODES.INVALID_REQUEST);
  }
  if (!HASH_HEX.test(authorizationKey)) fail(CODES.INVALID_REQUEST);
  return Object.freeze({ payer, transaction, authorizationKey, network });
}

function deliveryIdentity(settlement) {
  const payer = ownData(settlement, 'payer');
  const transaction = ownData(settlement, 'transaction');
  const authorizationKey = ownData(settlement, 'authorizationKey');
  const network = ownData(settlement, 'network');
  const transactionHash = ownData(settlement, 'transactionHash');
  if (typeof payer !== 'string' || !HASH_HEX.test(transaction) ||
      !HASH_HEX.test(authorizationKey) || typeof network !== 'string' ||
      utf8SizeAtMost(network, 128) < 1 ||
      (transactionHash !== INVALID && transactionHash !== transaction)) {
    fail(CODES.INVALID_REQUEST);
  }
  return Object.freeze({ payer, transaction, authorizationKey, network });
}

function exactKeys(value, fields) {
  if (!value || typeof value !== 'object' || IS_ARRAY(value) ||
      GET_PROTOTYPE(value) !== Object.prototype) return false;
  const keys = OWN_KEYS(value);
  return keys.length === fields.length && keys.every(key =>
    typeof key === 'string' && fields.includes(key) &&
    HAS_OWN(GET_DESCRIPTOR(value, key), 'value') && GET_DESCRIPTOR(value, key).enumerable === true);
}

function validateSettleResult(result, identity) {
  if (!result || typeof result !== 'object' || IS_ARRAY(result) ||
      GET_PROTOTYPE(result) !== Object.prototype ||
      OWN_KEYS(result).some(key => typeof key !== 'string' || !SETTLE_RESULT_KEYS.has(key))) {
    throw INVALID;
  }
  const success = ownData(result, 'success');
  const network = ownData(result, 'network');
  const transaction = ownData(result, 'transaction');
  const payer = ownData(result, 'payer');
  const state = ownData(result, 'state');
  if (typeof success !== 'boolean' || network !== identity.network ||
      typeof transaction !== 'string' || typeof payer !== 'string' || typeof state !== 'string') {
    throw INVALID;
  }
  if (success) {
    if (transaction !== identity.transaction || payer !== identity.payer ||
        ownData(result, 'authorizationKey') !== identity.authorizationKey ||
        state !== 'MOMENTUM_INCLUDED' || !DELIVERY_STATES.has(ownData(result, 'deliveryState'))) {
      throw INVALID;
    }
  } else {
    if ((transaction !== '' && transaction !== identity.transaction) ||
        (payer !== '' && payer !== identity.payer)) throw INVALID;
    const retry = ownData(result, 'retrySamePayment');
    if (retry === true || RECOVERY_STATES.has(state)) {
      if (transaction !== identity.transaction || payer !== identity.payer ||
          ownData(result, 'authorizationKey') !== identity.authorizationKey ||
          !DELIVERY_STATES.has(ownData(result, 'deliveryState'))) throw INVALID;
    }
  }
  return shield(result);
}

function validateTransitionResult(type, result, identity) {
  const pendingBase = [
    'authorizationKey', 'payer', 'transactionHash', 'deliveryState', 'deliveryClaimed',
  ];
  const pendingDelivered = [...pendingBase, 'cachedResponse'];
  const delivered = [
    'authorizationKey', 'payer', 'transactionHash', 'deliveryState', 'cachedResponse',
  ];
  const validShape = type === REQUEST_TYPES.MARK_DELIVERY_PENDING
    ? exactKeys(result, pendingBase) || exactKeys(result, pendingDelivered)
    : exactKeys(result, delivered);
  if (!validShape || result.authorizationKey !== identity.authorizationKey ||
      result.payer !== identity.payer || result.transactionHash !== identity.transaction) {
    throw INVALID;
  }
  if (type === REQUEST_TYPES.MARK_DELIVERY_PENDING) {
    if (typeof result.deliveryClaimed !== 'boolean' ||
        (result.deliveryState !== 'DELIVERY_PENDING' && result.deliveryState !== 'DELIVERED') ||
        (result.deliveryState === 'DELIVERED') !== HAS_OWN(result, 'cachedResponse')) throw INVALID;
  } else if (result.deliveryState !== 'DELIVERED') {
    throw INVALID;
  }
  return result;
}

function parseResponse(frame, pending) {
  if (utf8SizeAtMost(frame, MAX_FRAME_BYTES) < 1) throw INVALID;
  let parsed;
  try {
    parsed = JSON.parse(frame);
    snapshotJson(parsed);
    if (JSON.stringify(parsed) !== frame) throw INVALID;
  } catch {
    throw INVALID;
  }
  const fields = parsed?.ok === true ? RESPONSE_SUCCESS_FIELDS : RESPONSE_FAILURE_FIELDS;
  if (!exactKeys(parsed, fields) || parsed.ipcVersion !== IPC_VERSION ||
      parsed.type !== 'RESULT' || parsed.correlationId !== pending.correlationId ||
      parsed.shardId !== pending.shard.shardId || parsed.payer !== pending.identity.payer ||
      parsed.generation !== pending.shard.generation || parsed.sequence !== pending.sequence ||
      parsed.operation !== pending.type) throw INVALID;
  if (parsed.ok !== true) {
    if (parsed.ok !== false || utf8SizeAtMost(parsed.code, 64) < 1) throw INVALID;
    return { ok: false };
  }
  return {
    ok: true,
    result: pending.type === REQUEST_TYPES.SETTLE
      ? validateSettleResult(parsed.result, pending.identity)
      : validateTransitionResult(pending.type, parsed.result, pending.identity),
  };
}

function requestFrame(type, shard, identity, body, ticket) {
  const correlationId = `${shard.generation}:${shard.shardId}:${ticket.sequence}`;
  safeAscii(correlationId, 192, CODES.INVALID_REQUEST);
  const message = {
    ipcVersion: IPC_VERSION,
    type,
    correlationId,
    shardId: shard.shardId,
    payer: identity.payer,
    generation: shard.generation,
    sequence: ticket.sequence,
    transaction: identity.transaction,
    authorizationKey: identity.authorizationKey,
    network: identity.network,
    body,
  };
  let frame;
  try { frame = JSON.stringify(message); } catch { fail(CODES.INVALID_REQUEST); }
  if (utf8SizeAtMost(frame, MAX_FRAME_BYTES) < 1 ||
      !REQUEST_FIELDS.every((field, index) => Object.keys(message)[index] === field)) {
    fail(CODES.INVALID_REQUEST);
  }
  return { frame, correlationId };
}

function admissionFailure(error) {
  const code = error?.code;
  if (code === PAYER_WORKER_ADMISSION_ERROR_CODES.PAYER_BUSY) return CODES.PAYER_BUSY;
  if (code === PAYER_WORKER_ADMISSION_ERROR_CODES.CAPACITY_EXHAUSTED ||
      code === PAYER_WORKER_ADMISSION_ERROR_CODES.ADMISSION_LIMIT_REACHED) {
    return CODES.CAPACITY_EXHAUSTED;
  }
  if (code === PAYER_WORKER_ADMISSION_ERROR_CODES.WORKER_QUARANTINED) {
    return CODES.SHARD_QUARANTINED;
  }
  return CODES.INVALID_REQUEST;
}

function removeShardListeners(shard) {
  if (shard.listenersRemoved) return;
  shard.listenersRemoved = true;
  for (const [remove, target, event, listener] of [
    [shard.channelRemove, shard.channel, 'message', shard.onMessage],
    [shard.channelRemove, shard.channel, 'disconnect', shard.onDisconnect],
    [shard.channelRemove, shard.channel, 'error', shard.onChannelError],
    [shard.ownerRemove, shard.owner, 'exit', shard.onExit],
    [shard.ownerRemove, shard.owner, 'close', shard.onClose],
    [shard.ownerRemove, shard.owner, 'error', shard.onOwnerError],
  ]) {
    try { APPLY(remove, target, [event, listener]); } catch {}
  }
}

function quarantineShard(dispatcherState, shard, identity = null) {
  if (!shard.quarantined) {
    shard.quarantined = true;
    try { shard.admission.quarantineWorker(shard.shardId); } catch {}
  }
  if (identity !== null && shard.ambiguousIdentity === null) {
    shard.ambiguousIdentity = identity;
  }
  const pending = shard.pending;
  if (pending && !pending.settled) {
    pending.settled = true;
    clearTimeout(pending.timer);
    shard.pending = null;
    if (shard.ambiguousIdentity === null) shard.ambiguousIdentity = pending.identity;
    pending.resolve({ ambiguous: true });
  }
  if (dispatcherState.retiring && shard.closeObserved) removeShardListeners(shard);
}

function completeIfReady(dispatcherState, pending) {
  if (pending.settled || !pending.sendReturned || pending.accepted !== true ||
      pending.callbackOk !== true || pending.response === null) return;
  if (pending.response.ok !== true) {
    quarantineShard(dispatcherState, pending.shard, pending.identity);
    return;
  }
  if (pending.type === REQUEST_TYPES.SETTLE) {
    try {
      updateUnresolvedPayment(pending.shard, {
        identity: pending.identity,
        paymentCommitment: pending.paymentCommitment,
      }, pending.response.result);
    } catch {
      quarantineShard(dispatcherState, pending.shard, pending.identity);
      return;
    }
  }
  try {
    pending.shard.admission.complete(pending.ticket);
  } catch {
    quarantineShard(dispatcherState, pending.shard, pending.identity);
    return;
  }
  pending.settled = true;
  clearTimeout(pending.timer);
  pending.shard.pending = null;
  pending.resolve({ ambiguous: false, value: pending.response.result });
}

function dispatchOperation(
  dispatcherState,
  shard,
  type,
  identity,
  body,
  paymentCommitment = null,
) {
  if (dispatcherState.retiring) fail(CODES.RETIREMENT_STARTED);
  if (shard.quarantined) {
    if (type === REQUEST_TYPES.SETTLE && identityEqual(identity, shard.ambiguousIdentity)) {
      return Promise.resolve({ ambiguous: true });
    }
    fail(CODES.SHARD_QUARANTINED);
  }
  const kind = type === REQUEST_TYPES.SETTLE
    ? PAYER_WORKER_OPERATION_KINDS.FACILITATOR_SETTLE
    : PAYER_WORKER_OPERATION_KINDS.FACILITATOR_RECONCILE_CANDIDATE;
  let ticket;
  try {
    ticket = shard.admission.admit({
      payer: identity.payer,
      operationId: `${shard.generation}:${shard.shardId}:${shard.nextOperation}`,
      kind,
    });
  } catch (error) {
    fail(admissionFailure(error));
  }
  shard.nextOperation += 1;
  let framed;
  try {
    framed = requestFrame(type, shard, identity, body, ticket);
  } catch (error) {
    try { shard.admission.releaseUndispatched(ticket); } catch {}
    throw error;
  }
  return new Promise(resolve => {
    const pending = {
      shard,
      ticket,
      type,
      identity,
      paymentCommitment,
      sequence: ticket.sequence,
      correlationId: framed.correlationId,
      accepted: false,
      callbackOk: false,
      callbackCount: 0,
      sendReturned: false,
      response: null,
      settled: false,
      timer: undefined,
      resolve,
    };
    shard.pending = pending;
    try {
      shard.admission.markDispatched(ticket);
    } catch {
      quarantineShard(dispatcherState, shard, identity);
      return;
    }
    pending.timer = setTimeout(() => {
      if (!pending.settled) quarantineShard(dispatcherState, shard, identity);
    }, dispatcherState.requestTimeoutMs);
    const callback = error => {
      pending.callbackCount += 1;
      if (pending.settled) return;
      if (pending.callbackCount !== 1 || (error !== undefined && error !== null)) {
        quarantineShard(dispatcherState, shard, identity);
        return;
      }
      pending.callbackOk = true;
      completeIfReady(dispatcherState, pending);
    };
    let accepted;
    try {
      accepted = APPLY(shard.channelSend, shard.channel, [framed.frame, callback]);
    } catch {
      pending.sendReturned = true;
      quarantineShard(dispatcherState, shard, identity);
      return;
    }
    pending.sendReturned = true;
    if (accepted !== true) {
      quarantineShard(dispatcherState, shard, identity);
      return;
    }
    pending.accepted = true;
    completeIfReady(dispatcherState, pending);
  });
}

function selectShard(dispatcherState, payer) {
  let selected;
  try {
    selected = routeDescriptor(
      APPLY(dispatcherState.route, dispatcherState.routing, [payer]),
      CODES.UNKNOWN_PAYER,
    );
  } catch (error) {
    if (error instanceof FixedPayerSettlementDispatcherError) throw error;
    fail(CODES.UNKNOWN_PAYER);
  }
  const shard = dispatcherState.shardsById.get(selected.shardId);
  if (!shard || shard.payer !== payer || shard.routeVersion !== selected.version) {
    fail(CODES.UNKNOWN_PAYER);
  }
  return shard;
}

function settleBody(paymentPayload, requirements, paymentRequired) {
  let body;
  try {
    body = snapshotJson({ paymentPayload, requirements, paymentRequired });
  } catch {
    fail(CODES.INVALID_REQUEST);
  }
  const identity = settlementIdentity(body);
  let paymentCommitment;
  try {
    paymentCommitment = sha256Hex({
      domain: 'zenon-x402-fixed-payer-dispatch-payment-v1',
      paymentPayload: body.paymentPayload,
      requirements: body.requirements,
      paymentRequired: body.paymentRequired,
    });
  } catch {
    fail(CODES.INVALID_REQUEST);
  }
  return { body, identity, paymentCommitment };
}

function assertUnresolvedPayment(shard, capturedRequest) {
  if (shard.unresolvedPayment !== null &&
      !paymentEqual(shard.unresolvedPayment, capturedRequest)) {
    fail(CODES.INVALID_REQUEST);
  }
}

function updateUnresolvedPayment(shard, capturedRequest, result) {
  const success = ownData(result, 'success');
  const state = ownData(result, 'state');
  if (success === true) {
    if (paymentEqual(shard.unresolvedPayment, capturedRequest)) {
      shard.unresolvedPayment = null;
    }
    return;
  }
  if (shard.unresolvedPayment !== null) return;
  if (RECOVERY_STATES.has(state)) {
    if (shard.unresolvedPayment === null) {
      shard.unresolvedPayment = Object.freeze({
        identity: capturedRequest.identity,
        paymentCommitment: capturedRequest.paymentCommitment,
      });
    }
  }
}

function deliveryBody(type, settlement, value) {
  let body;
  try {
    const normalizedSettlement = snapshotJson(settlement, MAX_FRAME_BYTES, true);
    body = type === REQUEST_TYPES.MARK_DELIVERY_PENDING
      ? snapshotJson({ settlement: normalizedSettlement, acceptedRequirement: value })
      : snapshotJson({ settlement: normalizedSettlement, cachedResponse: value });
  } catch {
    fail(CODES.INVALID_REQUEST);
  }
  return { body, identity: deliveryIdentity(body.settlement) };
}

export function createFixedPayerSettlementDispatcher(options) {
  if (arguments.length !== 1) fail(CODES.INVALID_CONFIGURATION);
  const captured = captureConfiguration(options);
  const dispatcherState = {
    routing: captured.routing,
    route: captured.route,
    requestTimeoutMs: captured.requestTimeoutMs,
    retiring: false,
    retirementResolved: false,
    shards: [],
    shardsById: new Map(),
    retirementPromise: null,
    resolveRetirement: null,
  };
  dispatcherState.retirementPromise = new Promise(resolve => {
    dispatcherState.resolveRetirement = resolve;
  });

  for (const capturedShard of captured.shards) {
    RESERVED_OWNERS.add(capturedShard.owner);
    RESERVED_CHANNELS.add(capturedShard.channel);
    RESERVED_JOURNALS.add(capturedShard.journalIdentity);
    const shard = {
      ...capturedShard,
      admission: new OfflinePayerWorkerAdmission({
        lane: PAYER_WORKER_LANES.FACILITATOR,
        workerIds: [capturedShard.shardId],
        maxAdmissions: captured.maxOperationsPerShard,
      }),
      nextOperation: 1,
      pending: null,
      quarantined: false,
      ambiguousIdentity: null,
      unresolvedPayment: null,
      exitObserved: false,
      closeObserved: false,
      listenersRemoved: false,
    };
    dispatcherState.shards.push(shard);
    dispatcherState.shardsById.set(shard.shardId, shard);
  }

  const maybeRetired = () => {
    if (!dispatcherState.retiring || dispatcherState.retirementResolved ||
        !dispatcherState.shards.every(shard => shard.closeObserved)) return;
    dispatcherState.retirementResolved = true;
    for (const shard of dispatcherState.shards) removeShardListeners(shard);
    dispatcherState.resolveRetirement(Object.freeze({ retired: true }));
  };
  try {
    for (const shard of dispatcherState.shards) {
      shard.onMessage = frame => {
        if (shard.quarantined && shard.pending === null) return;
        const pending = shard.pending;
        if (!pending || pending.settled || pending.response !== null) {
          quarantineShard(dispatcherState, shard);
          return;
        }
        try {
          pending.response = parseResponse(frame, pending);
        } catch {
          quarantineShard(dispatcherState, shard, pending.identity);
          return;
        }
        completeIfReady(dispatcherState, pending);
      };
      shard.onDisconnect = () => quarantineShard(dispatcherState, shard);
      shard.onChannelError = () => quarantineShard(dispatcherState, shard);
      shard.onOwnerError = () => quarantineShard(dispatcherState, shard);
      shard.onExit = () => {
        shard.exitObserved = true;
        if (!dispatcherState.retiring) quarantineShard(dispatcherState, shard);
      };
      shard.onClose = () => {
        shard.closeObserved = true;
        quarantineShard(dispatcherState, shard);
        if (dispatcherState.retiring) removeShardListeners(shard);
        maybeRetired();
      };
      APPLY(shard.channelOn, shard.channel, ['message', shard.onMessage]);
      APPLY(shard.channelOn, shard.channel, ['disconnect', shard.onDisconnect]);
      APPLY(shard.channelOn, shard.channel, ['error', shard.onChannelError]);
      APPLY(shard.ownerOn, shard.owner, ['exit', shard.onExit]);
      APPLY(shard.ownerOn, shard.owner, ['close', shard.onClose]);
      APPLY(shard.ownerOn, shard.owner, ['error', shard.onOwnerError]);
    }
  } catch {
    for (const shard of dispatcherState.shards) {
      quarantineShard(dispatcherState, shard);
      removeShardListeners(shard);
    }
    fail(CODES.INVALID_CONFIGURATION);
  }

  const facade = {
    async settle(paymentPayload, requirements, paymentRequired) {
      if (arguments.length !== 3) fail(CODES.INVALID_REQUEST);
      const capturedRequest = settleBody(paymentPayload, requirements, paymentRequired);
      const shard = selectShard(dispatcherState, capturedRequest.identity.payer);
      assertUnresolvedPayment(shard, capturedRequest);
      const outcome = await dispatchOperation(
        dispatcherState,
        shard,
        REQUEST_TYPES.SETTLE,
        capturedRequest.identity,
        capturedRequest.body,
        capturedRequest.paymentCommitment,
      );
      if (outcome.ambiguous) return recovery(capturedRequest.identity);
      return outcome.value;
    },
    async markDeliveryPending(settlement, acceptedRequirement) {
      if (arguments.length !== 2) fail(CODES.INVALID_REQUEST);
      const capturedRequest = deliveryBody(
        REQUEST_TYPES.MARK_DELIVERY_PENDING,
        settlement,
        acceptedRequirement,
      );
      const shard = selectShard(dispatcherState, capturedRequest.identity.payer);
      const outcome = await dispatchOperation(
        dispatcherState,
        shard,
        REQUEST_TYPES.MARK_DELIVERY_PENDING,
        capturedRequest.identity,
        capturedRequest.body,
      );
      if (outcome.ambiguous) fail(CODES.SHARD_QUARANTINED);
      return outcome.value;
    },
    async markDelivered(settlement, cachedResponse) {
      if (arguments.length !== 2) fail(CODES.INVALID_REQUEST);
      const capturedRequest = deliveryBody(
        REQUEST_TYPES.MARK_DELIVERED,
        settlement,
        cachedResponse,
      );
      const shard = selectShard(dispatcherState, capturedRequest.identity.payer);
      const outcome = await dispatchOperation(
        dispatcherState,
        shard,
        REQUEST_TYPES.MARK_DELIVERED,
        capturedRequest.identity,
        capturedRequest.body,
      );
      if (outcome.ambiguous) fail(CODES.SHARD_QUARANTINED);
      return outcome.value;
    },
    retire() {
      if (arguments.length !== 0) fail(CODES.INVALID_REQUEST);
      if (!dispatcherState.retiring) {
        dispatcherState.retiring = true;
        for (const shard of dispatcherState.shards) quarantineShard(dispatcherState, shard);
        maybeRetired();
      }
      return dispatcherState.retirementPromise;
    },
    retirementStatus() {
      if (arguments.length !== 0) fail(CODES.INVALID_REQUEST);
      return Object.freeze(dispatcherState.shards.map(shard => Object.freeze({
        shardId: shard.shardId,
        generation: shard.generation,
        quarantined: shard.quarantined,
        exitObserved: shard.exitObserved,
        closeObserved: shard.closeObserved,
      })));
    },
  };
  for (const method of Object.values(facade)) Object.freeze(method);
  return Object.freeze(facade);
}
