import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { paymentIntentDigest, sha256Hex } from '../canonical.js';

const IPC_VERSION = 1;
const MAX_FRAME_BYTES = 64 * 1024;
const MAX_STRING_BYTES = 16 * 1024;
const MAX_DEPTH = 20;
const MAX_CONTAINER_ENTRIES = 256;
const MAX_TOTAL_VALUES = 4096;
const MAX_OPERATIONS = 256;
const HASH_HEX = /^[0-9a-f]{64}$/;
const SAFE_ASCII = /^[\x21-\x7e]+$/;
const REQUEST_TYPES = Object.freeze({
  SETTLE: 'SETTLE',
  MARK_DELIVERY_PENDING: 'MARK_DELIVERY_PENDING',
  MARK_DELIVERED: 'MARK_DELIVERED',
});
const CONFIGURATION_FIELDS = Object.freeze([
  'channel', 'facilitator', 'shardId', 'payer', 'generation', 'maxOperations',
]);
const REQUEST_FIELDS = Object.freeze([
  'ipcVersion', 'type', 'correlationId', 'shardId', 'payer', 'generation',
  'sequence', 'transaction', 'authorizationKey', 'network', 'body',
]);
const SETTLE_BODY_FIELDS = Object.freeze([
  'paymentPayload', 'requirements', 'paymentRequired',
]);
const PENDING_BODY_FIELDS = Object.freeze(['settlement', 'acceptedRequirement']);
const DELIVERED_BODY_FIELDS = Object.freeze(['settlement', 'cachedResponse']);
const SETTLE_RESULT_KEYS = new Set([
  'success', 'network', 'transaction', 'payer', 'errorReason', 'state',
  'authorizationKey', 'retrySamePayment', 'deliveryState', 'cachedResponse', 'then',
]);
const DELIVERY_STATES = new Set(['NONE', 'DELIVERY_PENDING', 'DELIVERED']);
const RECOVERY_STATES = new Set([
  'VALIDATED', 'SUBMISSION_ACKNOWLEDGED', 'SUBMISSION_OUTCOME_UNKNOWN',
  'MOMENTUM_INCLUDED',
]);
const PROTOCOL_ERROR_FRAME =
  '{"ipcVersion":1,"type":"PROTOCOL_ERROR","code":"INVALID_REQUEST"}';
const RESERVED_CHANNELS = new WeakSet();
const INVALID = Symbol('invalid');
const UNRESOLVED_PAYMENT = Symbol('unresolved-payment');

const APPLY = Reflect.apply;
const GET_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_ARRAY = Array.isArray;
const IS_PROXY = utilTypes.isProxy;
const OWN_KEYS = Reflect.ownKeys;

function dependencyError() {
  const code = 'FIXED_PAYER_SETTLEMENT_CHILD_INVALID_DEPENDENCY';
  const error = new Error(code);
  error.name = 'FixedPayerSettlementChildError';
  error.code = code;
  error.stack = `FixedPayerSettlementChildError: ${code}`;
  return error;
}

function isReference(value) {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function exactRecord(value, fields, optionalCount = 0) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || IS_ARRAY(value) ||
      GET_PROTOTYPE(value) !== Object.prototype) throw INVALID;
  const keys = OWN_KEYS(value);
  if (keys.some(key => typeof key !== 'string') ||
      keys.length < fields.length - optionalCount || keys.length > fields.length ||
      keys.some(key => !fields.includes(key))) throw INVALID;
  const result = Object.create(null);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const descriptor = GET_DESCRIPTOR(value, field);
    if (descriptor === undefined) {
      if (index < fields.length - optionalCount) throw INVALID;
      continue;
    }
    if (!HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) throw INVALID;
    result[field] = descriptor.value;
  }
  return result;
}

function dataMethod(owner, name) {
  try {
    if (!isReference(owner) || IS_PROXY(owner)) throw INVALID;
    let current = owner;
    for (let depth = 0; current !== null && depth < 16; depth += 1) {
      if (IS_PROXY(current)) throw INVALID;
      const descriptor = GET_DESCRIPTOR(current, name);
      if (descriptor !== undefined) {
        if (!HAS_OWN(descriptor, 'value') || typeof descriptor.value !== 'function') {
          throw INVALID;
        }
        return descriptor.value;
      }
      current = GET_PROTOTYPE(current);
    }
  } catch {}
  throw dependencyError();
}

function safeAscii(value, maximum) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum ||
      Buffer.byteLength(value, 'utf8') > maximum || !SAFE_ASCII.test(value)) throw INVALID;
  return value;
}

function utf8SizeAtMost(text, maximum) {
  if (typeof text !== 'string' || text.length > maximum) return -1;
  const bytes = Buffer.byteLength(text, 'utf8');
  return bytes <= maximum ? bytes : -1;
}

function snapshotJson(root, { allowRootShield = false, maximumBytes = MAX_FRAME_BYTES } = {}) {
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
      const result = Object.create(null);
      let shieldSeen = false;
      for (const key of keys) {
        const descriptor = GET_DESCRIPTOR(value, key);
        if (rootValue && allowRootShield && key === 'then') {
          if (shieldSeen || !descriptor || !HAS_OWN(descriptor, 'value') ||
              descriptor.value !== undefined || descriptor.enumerable !== false ||
              descriptor.writable !== false || descriptor.configurable !== false) throw INVALID;
          shieldSeen = true;
          continue;
        }
        if (key === '__proto__' || key === 'prototype' || key === 'constructor' ||
            utf8SizeAtMost(key, 256) < 1 || !descriptor ||
            !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) throw INVALID;
        budget.members += 1;
        if (budget.members > MAX_TOTAL_VALUES) throw INVALID;
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

function exactKeys(value, fields) {
  if (!value || typeof value !== 'object' || IS_ARRAY(value) ||
      GET_PROTOTYPE(value) !== Object.prototype) return false;
  const keys = OWN_KEYS(value);
  if (keys.length !== fields.length || keys.some(key =>
    typeof key !== 'string' || !fields.includes(key))) return false;
  for (const key of keys) {
    const descriptor = GET_DESCRIPTOR(value, key);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) return false;
  }
  return true;
}

function requestIdentity(request) {
  return Object.freeze({
    payer: request.payer,
    transaction: request.transaction,
    authorizationKey: request.authorizationKey,
    network: request.network,
  });
}

function sameIdentity(left, right) {
  return left.payer === right.payer && left.transaction === right.transaction &&
    left.authorizationKey === right.authorizationKey && left.network === right.network;
}

function validateSettleBody(request) {
  const body = exactRecord(request.body, SETTLE_BODY_FIELDS);
  const payload = ownData(body.paymentPayload, 'payload');
  const transaction = payload === INVALID ? INVALID : ownData(payload, 'transaction');
  const payer = transaction === INVALID ? INVALID : ownData(transaction, 'address');
  const transactionHash = transaction === INVALID ? INVALID : ownData(transaction, 'hash');
  const accepted = ownData(body.paymentPayload, 'accepted');
  const acceptedNetwork = accepted === INVALID ? INVALID : ownData(accepted, 'network');
  const network = ownData(body.requirements, 'network');
  if (payer !== request.payer || transactionHash !== request.transaction ||
      network !== request.network || acceptedNetwork !== network) throw INVALID;
  let intentDigest;
  let authorizationKey;
  try {
    intentDigest = paymentIntentDigest(body.paymentRequired, body.requirements);
    if (ownData(payload, 'intentDigest') !== intentDigest) throw INVALID;
    authorizationKey = sha256Hex({
      domain: 'zenon-x402-authorization-v1',
      chainProfile: body.requirements.extra.zenonChain,
      intentDigest,
      resourceDigest: sha256Hex(body.paymentRequired.resource),
      transactionHash,
    });
  } catch {
    throw INVALID;
  }
  if (authorizationKey !== request.authorizationKey) throw INVALID;
  const paymentCommitment = sha256Hex({
    domain: 'zenon-x402-fixed-payer-child-payment-v1',
    paymentPayload: body.paymentPayload,
    requirements: body.requirements,
    paymentRequired: body.paymentRequired,
  });
  const requirementCommitment = sha256Hex({
    domain: 'zenon-x402-fixed-payer-child-requirement-v1',
    acceptedRequirement: body.requirements,
  });
  return { body, paymentCommitment, requirementCommitment };
}

function requirementCommitment(acceptedRequirement) {
  return sha256Hex({
    domain: 'zenon-x402-fixed-payer-child-requirement-v1',
    acceptedRequirement,
  });
}

function validateDeliveryBody(request) {
  const fields = request.type === REQUEST_TYPES.MARK_DELIVERY_PENDING
    ? PENDING_BODY_FIELDS
    : DELIVERED_BODY_FIELDS;
  const body = exactRecord(request.body, fields);
  const settlement = body.settlement;
  const identity = {
    payer: ownData(settlement, 'payer'),
    transaction: ownData(settlement, 'transaction'),
    authorizationKey: ownData(settlement, 'authorizationKey'),
    network: ownData(settlement, 'network'),
  };
  const transactionHash = ownData(settlement, 'transactionHash');
  if (!sameIdentity(identity, requestIdentity(request)) ||
      (transactionHash !== INVALID && transactionHash !== identity.transaction)) throw INVALID;
  return body;
}

function parseRequest(frame, configured, expectedSequence) {
  if (utf8SizeAtMost(frame, MAX_FRAME_BYTES) < 1) throw INVALID;
  let request;
  try {
    request = JSON.parse(frame);
    snapshotJson(request);
    if (JSON.stringify(request) !== frame) throw INVALID;
  } catch {
    throw INVALID;
  }
  if (!exactKeys(request, REQUEST_FIELDS) || request.ipcVersion !== IPC_VERSION ||
      !Object.values(REQUEST_TYPES).includes(request.type) ||
      request.shardId !== configured.shardId || request.payer !== configured.payer ||
      request.generation !== configured.generation || request.sequence !== expectedSequence ||
      expectedSequence > configured.maxOperations || !HASH_HEX.test(request.transaction) ||
      !HASH_HEX.test(request.authorizationKey) ||
      request.correlationId !==
        `${configured.generation}:${configured.shardId}:${expectedSequence}`) throw INVALID;
  safeAscii(request.network, 128);
  const identity = requestIdentity(request);
  return request.type === REQUEST_TYPES.SETTLE
    ? { request, identity, ...validateSettleBody(request) }
    : { request, identity, body: validateDeliveryBody(request) };
}

function exactSettleResultShape(value) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || IS_ARRAY(value) ||
      GET_PROTOTYPE(value) !== Object.prototype) throw INVALID;
  const keys = OWN_KEYS(value);
  if (keys.some(key => typeof key !== 'string' || !SETTLE_RESULT_KEYS.has(key))) throw INVALID;
  let shieldSeen = false;
  for (const key of keys) {
    const descriptor = GET_DESCRIPTOR(value, key);
    if (key === 'then') {
      if (shieldSeen || !descriptor || !HAS_OWN(descriptor, 'value') ||
          descriptor.value !== undefined || descriptor.enumerable !== false ||
          descriptor.writable !== false || descriptor.configurable !== false) throw INVALID;
      shieldSeen = true;
    } else if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) {
      throw INVALID;
    }
  }
}

function normalizedFailureReason(result, state, retrySamePayment, deliveryState) {
  const reason = ownData(result, 'errorReason');
  if (reason !== INVALID && typeof reason !== 'string') throw INVALID;
  if (reason === 'payment_reconciliation_terminal' && retrySamePayment === false) {
    return 'payment_reconciliation_terminal';
  }
  if (state === 'SUBMISSION_OUTCOME_UNKNOWN') return 'submission_outcome_unknown';
  if (state === 'MOMENTUM_INCLUDED' && deliveryState === 'DELIVERY_PENDING') {
    return 'delivery_outcome_unknown';
  }
  if (state === 'MOMENTUM_INCLUDED' && reason === 'momentum_confirmation_threshold_pending') {
    return 'momentum_confirmation_threshold_pending';
  }
  return retrySamePayment ? 'payment_reconciliation_required' : 'payment_settlement_failed';
}

function normalizeSettleResult(value, identity) {
  exactSettleResultShape(value);
  const result = snapshotJson(value, { allowRootShield: true });
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
    const authorizationKey = ownData(result, 'authorizationKey');
    const deliveryState = ownData(result, 'deliveryState');
    if (transaction !== identity.transaction || payer !== identity.payer ||
        authorizationKey !== identity.authorizationKey || state !== 'MOMENTUM_INCLUDED' ||
        !DELIVERY_STATES.has(deliveryState)) throw INVALID;
    const normalized = {
      success: true,
      network,
      transaction,
      payer,
      state,
      authorizationKey,
      deliveryState,
    };
    const cachedResponse = ownData(result, 'cachedResponse');
    if (deliveryState === 'DELIVERED') {
      if (cachedResponse === INVALID) throw INVALID;
      normalized.cachedResponse = cachedResponse;
    } else if (cachedResponse !== INVALID) {
      throw INVALID;
    }
    return { result: normalized, bound: true, deliveryEligible: true };
  }

  if (state === 'VALIDATION_FAILED') {
    if (transaction !== '' || payer !== '' || ownData(result, 'authorizationKey') !== INVALID ||
        ownData(result, 'retrySamePayment') !== INVALID ||
        ownData(result, 'deliveryState') !== INVALID) throw INVALID;
    return {
      result: {
        success: false,
        network,
        transaction: '',
        payer: '',
        errorReason: 'payment_settlement_failed',
        state: 'VALIDATION_FAILED',
      },
      bound: false,
      deliveryEligible: false,
    };
  }

  const authorizationKey = ownData(result, 'authorizationKey');
  const retrySamePayment = ownData(result, 'retrySamePayment');
  const deliveryState = ownData(result, 'deliveryState');
  if (transaction !== identity.transaction || payer !== identity.payer ||
      authorizationKey !== identity.authorizationKey || typeof retrySamePayment !== 'boolean' ||
      !DELIVERY_STATES.has(deliveryState) || !RECOVERY_STATES.has(state)) throw INVALID;
  return {
    result: {
      success: false,
      network,
      transaction,
      payer,
      errorReason: normalizedFailureReason(result, state, retrySamePayment, deliveryState),
      state,
      authorizationKey,
      retrySamePayment,
      deliveryState,
    },
    bound: true,
    deliveryEligible: false,
  };
}

function transitionIdentity(result) {
  const transaction = ownData(result, 'transaction');
  const transactionHash = ownData(result, 'transactionHash');
  if (transaction === INVALID && transactionHash === INVALID) throw INVALID;
  if (transaction !== INVALID && transactionHash !== INVALID && transaction !== transactionHash) {
    throw INVALID;
  }
  return {
    authorizationKey: ownData(result, 'authorizationKey'),
    payer: ownData(result, 'payer'),
    transaction: transaction === INVALID ? transactionHash : transaction,
  };
}

function normalizePendingResult(value, identity) {
  const result = snapshotJson(value);
  const returned = transitionIdentity(result);
  const deliveryState = ownData(result, 'deliveryState');
  const deliveryClaimed = ownData(result, 'deliveryClaimed');
  if (returned.authorizationKey !== identity.authorizationKey ||
      returned.payer !== identity.payer || returned.transaction !== identity.transaction ||
      typeof deliveryClaimed !== 'boolean' ||
      (deliveryState !== 'DELIVERY_PENDING' && deliveryState !== 'DELIVERED')) throw INVALID;
  const normalized = {
    authorizationKey: identity.authorizationKey,
    payer: identity.payer,
    transactionHash: identity.transaction,
    deliveryState,
    deliveryClaimed,
  };
  const cachedResponse = ownData(result, 'cachedResponse');
  if (deliveryState === 'DELIVERED') {
    if (cachedResponse === INVALID) throw INVALID;
    normalized.cachedResponse = cachedResponse;
  }
  return normalized;
}

function normalizeDeliveredResult(value, identity, expectedCachedResponse) {
  const result = snapshotJson(value);
  const returned = transitionIdentity(result);
  const cachedResponse = ownData(result, 'cachedResponse');
  if (returned.authorizationKey !== identity.authorizationKey ||
      returned.payer !== identity.payer || returned.transaction !== identity.transaction ||
      ownData(result, 'deliveryState') !== 'DELIVERED' || cachedResponse === INVALID ||
      JSON.stringify(cachedResponse) !== JSON.stringify(expectedCachedResponse)) throw INVALID;
  return {
    authorizationKey: identity.authorizationKey,
    payer: identity.payer,
    transactionHash: identity.transaction,
    deliveryState: 'DELIVERED',
    cachedResponse,
  };
}

function responseFrame(request, ok, value) {
  const response = ok ? {
    ipcVersion: IPC_VERSION,
    type: 'RESULT',
    correlationId: request.correlationId,
    shardId: request.shardId,
    payer: request.payer,
    generation: request.generation,
    sequence: request.sequence,
    operation: request.type,
    ok: true,
    result: value,
  } : {
    ipcVersion: IPC_VERSION,
    type: 'RESULT',
    correlationId: request.correlationId,
    shardId: request.shardId,
    payer: request.payer,
    generation: request.generation,
    sequence: request.sequence,
    operation: request.type,
    ok: false,
    code: value,
  };
  const frame = JSON.stringify(response);
  if (utf8SizeAtMost(frame, MAX_FRAME_BYTES) < 1) throw INVALID;
  return frame;
}

function captureConfiguration(options) {
  let captured;
  try { captured = exactRecord(options, CONFIGURATION_FIELDS, 1); } catch { throw dependencyError(); }
  const { channel, facilitator } = captured;
  try {
    if (!isReference(channel) || IS_PROXY(channel) || RESERVED_CHANNELS.has(channel) ||
        !isReference(facilitator) || IS_PROXY(facilitator)) throw INVALID;
    safeAscii(captured.shardId, 64);
    safeAscii(captured.payer, 128);
    safeAscii(captured.generation, 64);
    const maxOperations = captured.maxOperations ?? 64;
    if (!Number.isSafeInteger(maxOperations) || maxOperations < 1 ||
        maxOperations > MAX_OPERATIONS) throw INVALID;
    return {
      channel,
      facilitator,
      shardId: captured.shardId,
      payer: captured.payer,
      generation: captured.generation,
      maxOperations,
      on: dataMethod(channel, 'on'),
      removeListener: dataMethod(channel, 'removeListener'),
      send: dataMethod(channel, 'send'),
      settle: dataMethod(facilitator, 'settle'),
      markDeliveryPending: dataMethod(facilitator, 'markDeliveryPending'),
      markDelivered: dataMethod(facilitator, 'markDelivered'),
    };
  } catch (error) {
    if (error?.code === 'FIXED_PAYER_SETTLEMENT_CHILD_INVALID_DEPENDENCY') throw error;
    throw dependencyError();
  }
}

export function runFixedPayerSettlementChild(options) {
  if (arguments.length !== 1) throw dependencyError();
  const configured = captureConfiguration(options);
  RESERVED_CHANNELS.add(configured.channel);
  const bindingsByTransaction = new Map();
  const transactionsByAuthorization = new Map();
  let expectedSequence = 1;
  let phase = 'INITIALIZING';
  let queuedFrame = null;
  let queuedFramePresent = false;
  let completed = false;
  let unresolvedPayment = null;
  const listenerRegistrations = [];
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });

  const removeRegistration = registration => {
    if (!registration.owned) return;
    try {
      APPLY(configured.removeListener, configured.channel, [
        registration.event,
        registration.listener,
      ]);
    } catch {}
    if (!registration.installing) registration.owned = false;
  };
  const removeListeners = () => {
    for (const registration of listenerRegistrations) removeRegistration(registration);
  };
  const finish = code => {
    if (completed) return;
    completed = true;
    phase = 'TERMINAL';
    queuedFrame = null;
    queuedFramePresent = false;
    removeListeners();
    resolveDone(code);
  };
  const close = function close() {
    if (arguments.length !== 0) throw dependencyError();
    finish('CLOSED');
    return done;
  };
  Object.freeze(close);
  const controller = Object.freeze({ done, close });
  const sendTerminal = (frame, code) => {
    if (completed) return;
    phase = 'TERMINAL';
    let callbackCount = 0;
    let callbackOk = false;
    let sendReturned = false;
    let accepted = false;
    const callback = error => {
      callbackCount += 1;
      callbackOk = callbackCount === 1 && error == null;
      if (sendReturned) finish(accepted && callbackOk ? code : 'SEND_FAILED');
    };
    try {
      accepted = APPLY(configured.send, configured.channel, [frame, callback]) === true;
    } catch {
      sendReturned = true;
      finish('SEND_FAILED');
      return;
    }
    sendReturned = true;
    if (!accepted || callbackCount > 1 || (callbackCount === 1 && !callbackOk)) {
      finish('SEND_FAILED');
    } else if (callbackCount === 1) {
      finish(code);
    }
  };
  const sendContinuation = frame => {
    phase = 'SENDING';
    let callbackCount = 0;
    let callbackOk = false;
    let sendReturned = false;
    let accepted = false;
    const afterSend = () => {
      if (!sendReturned || callbackCount !== 1) return;
      if (!accepted || !callbackOk) {
        finish('SEND_FAILED');
        return;
      }
      expectedSequence += 1;
      phase = 'READY';
      if (queuedFramePresent) {
        const next = queuedFrame;
        queuedFrame = null;
        queuedFramePresent = false;
        processFrame(next);
      }
    };
    const callback = error => {
      callbackCount += 1;
      callbackOk = callbackCount === 1 && error == null;
      if (callbackCount > 1) {
        finish('SEND_FAILED');
        return;
      }
      afterSend();
    };
    try {
      accepted = APPLY(configured.send, configured.channel, [frame, callback]) === true;
    } catch {
      sendReturned = true;
      finish('SEND_FAILED');
      return;
    }
    sendReturned = true;
    if (!accepted) {
      finish('SEND_FAILED');
      return;
    }
    afterSend();
  };
  const sendResult = (request, result) => {
    let frame;
    try { frame = responseFrame(request, true, result); } catch {
      sendTerminal(responseFrame(request, false, 'INVALID_RESULT'), 'INVALID_RESULT');
      return;
    }
    sendContinuation(frame);
  };
  const sendRejection = (request, code) => {
    let frame;
    try { frame = responseFrame(request, false, code); } catch {
      sendTerminal(PROTOCOL_ERROR_FRAME, 'INVALID_REQUEST');
      return;
    }
    sendContinuation(frame);
  };
  const sendFailure = (request, code) => {
    let frame;
    try { frame = responseFrame(request, false, code); } catch {
      sendTerminal(PROTOCOL_ERROR_FRAME, 'INVALID_REQUEST');
      return;
    }
    sendTerminal(frame, code);
  };
  const bindSettlement = (
    identity,
    paymentCommitment,
    acceptedRequirementCommitment,
    deliveryEligible,
  ) => {
    const prior = bindingsByTransaction.get(identity.transaction);
    const authorizationTransaction = transactionsByAuthorization.get(identity.authorizationKey);
    if ((prior && (!sameIdentity(prior.identity, identity) ||
        prior.paymentCommitment !== paymentCommitment ||
        prior.requirementCommitment !== acceptedRequirementCommitment)) ||
        (authorizationTransaction !== undefined && authorizationTransaction !== identity.transaction)) {
      throw INVALID;
    }
    if (!prior && bindingsByTransaction.size >= configured.maxOperations) throw INVALID;
    const binding = {
      identity,
      paymentCommitment,
      requirementCommitment: acceptedRequirementCommitment,
      deliveryEligible: deliveryEligible || prior?.deliveryEligible === true,
    };
    bindingsByTransaction.set(identity.transaction, binding);
    transactionsByAuthorization.set(identity.authorizationKey, identity.transaction);
  };
  const samePayment = (binding, parsed) => binding !== null &&
    sameIdentity(binding.identity, parsed.identity) &&
    binding.paymentCommitment === parsed.paymentCommitment;
  const updateUnresolvedPayment = (parsed, normalized) => {
    const result = normalized.result;
    if (result.success === true) {
      if (samePayment(unresolvedPayment, parsed)) unresolvedPayment = null;
      return;
    }
    if (unresolvedPayment !== null) return;
    if (normalized.bound && RECOVERY_STATES.has(result.state)) {
      unresolvedPayment = Object.freeze({
        identity: parsed.identity,
        paymentCommitment: parsed.paymentCommitment,
      });
    }
  };
  const processSettle = async parsed => {
    if (unresolvedPayment !== null && !samePayment(unresolvedPayment, parsed)) {
      throw UNRESOLVED_PAYMENT;
    }
    const prior = bindingsByTransaction.get(parsed.identity.transaction);
    if (prior && (!sameIdentity(prior.identity, parsed.identity) ||
        prior.paymentCommitment !== parsed.paymentCommitment)) throw INVALID;
    const value = await APPLY(configured.settle, configured.facilitator, [
      parsed.body.paymentPayload,
      parsed.body.requirements,
      parsed.body.paymentRequired,
    ]);
    const normalized = normalizeSettleResult(value, parsed.identity);
    if (normalized.bound) {
      bindSettlement(
        parsed.identity,
        parsed.paymentCommitment,
        parsed.requirementCommitment,
        normalized.deliveryEligible,
      );
    }
    updateUnresolvedPayment(parsed, normalized);
    return normalized.result;
  };
  const processPending = async parsed => {
    const binding = bindingsByTransaction.get(parsed.identity.transaction);
    if (!binding || !binding.deliveryEligible || !sameIdentity(binding.identity, parsed.identity)) {
      throw INVALID;
    }
    if (binding.requirementCommitment !==
        requirementCommitment(parsed.body.acceptedRequirement)) throw INVALID;
    const value = await APPLY(configured.markDeliveryPending, configured.facilitator, [
      parsed.body.settlement,
      parsed.body.acceptedRequirement,
    ]);
    return normalizePendingResult(value, parsed.identity);
  };
  const processDelivered = async parsed => {
    const binding = bindingsByTransaction.get(parsed.identity.transaction);
    if (!binding || !binding.deliveryEligible || !sameIdentity(binding.identity, parsed.identity)) {
      throw INVALID;
    }
    const value = await APPLY(configured.markDelivered, configured.facilitator, [
      parsed.body.settlement,
      parsed.body.cachedResponse,
    ]);
    return normalizeDeliveredResult(value, parsed.identity, parsed.body.cachedResponse);
  };
  const processFrame = frame => {
    if (completed) return;
    phase = 'RUNNING';
    let parsed;
    try { parsed = parseRequest(frame, configured, expectedSequence); } catch {
      sendTerminal(PROTOCOL_ERROR_FRAME, 'INVALID_REQUEST');
      return;
    }
    let pending;
    try {
      if (parsed.request.type === REQUEST_TYPES.SETTLE) pending = processSettle(parsed);
      else if (parsed.request.type === REQUEST_TYPES.MARK_DELIVERY_PENDING) {
        pending = processPending(parsed);
      } else {
        pending = processDelivered(parsed);
      }
    } catch {
      sendFailure(parsed.request, 'DEPENDENCY_FAILED');
      return;
    }
    Promise.resolve(pending).then(
      result => {
        if (!completed && phase === 'RUNNING') sendResult(parsed.request, result);
      },
      error => {
        if (completed || phase !== 'RUNNING') return;
        if (error === UNRESOLVED_PAYMENT) {
          sendRejection(parsed.request, 'UNRESOLVED_PAYMENT');
          return;
        }
        sendFailure(parsed.request, error === INVALID ? 'IDENTITY_MISMATCH' : 'DEPENDENCY_FAILED');
      },
    );
  };
  function onMessage(frame) {
    if (completed) return;
    if (phase === 'INITIALIZING') {
      if (!queuedFramePresent) {
        queuedFrame = frame;
        queuedFramePresent = true;
        return;
      }
      finish('DUPLICATE_REQUEST');
      return;
    }
    if (phase === 'READY') {
      processFrame(frame);
      return;
    }
    if (phase === 'SENDING' && !queuedFramePresent) {
      queuedFrame = frame;
      queuedFramePresent = true;
      return;
    }
    finish('DUPLICATE_REQUEST');
  }
  function onDisconnect() { finish('DISCONNECTED'); }
  function onError() { finish('CHANNEL_ERROR'); }

  const installListener = (event, listener) => {
    if (completed) return false;
    const registration = { event, listener, owned: true, installing: true };
    listenerRegistrations.push(registration);
    try {
      APPLY(configured.on, configured.channel, [event, listener]);
    } finally {
      registration.installing = false;
      if (completed) removeRegistration(registration);
    }
    return !completed;
  };
  try {
    if (!installListener('message', onMessage)) return controller;
    if (!installListener('disconnect', onDisconnect)) return controller;
    if (!installListener('error', onError)) return controller;
  } catch {
    finish('INVALID_DEPENDENCY');
    throw dependencyError();
  }
  phase = 'READY';
  if (queuedFramePresent) {
    const initialFrame = queuedFrame;
    queuedFrame = null;
    queuedFramePresent = false;
    processFrame(initialFrame);
  }
  return controller;
}
