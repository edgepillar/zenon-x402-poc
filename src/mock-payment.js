import crypto from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson, paymentIntentDigest, sha256Hex } from './canonical.js';
import {
  createPaymentCapabilities,
  MOCK_NETWORK,
  sameRequirements,
  validatePaymentPayloadEnvelope,
  validatePaymentRequired,
  validateRequirement,
} from './x402-wire.js';

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const HASH_HEX = /^[0-9a-f]{64}$/;
const NONCE_HEX = /^[0-9a-f]{16}$/;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const MAP_GET = Map.prototype.get;
const MAP_HAS = Map.prototype.has;
const MAP_SET = Map.prototype.set;
const GET_OWN_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE = Object.getPrototypeOf;
const DEFINE_PROPERTY = Object.defineProperty;
const CREATE_OBJECT = Object.create;
const HAS_OWN = Object.hasOwn;
const IS_ARRAY = Array.isArray;
const IS_PROXY = types.isProxy;
const IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT_IS = Object.is;
const ARRAY_PROTOTYPE = Array.prototype;
const OBJECT_PROTOTYPE = Object.prototype;
const MOCK_TRANSACTION_FIELDS = Object.freeze([
  'blockType', 'chainIdentifier', 'address', 'toAddress', 'amount',
  'tokenStandard', 'data', 'nonce', 'publicKey', 'signature', 'hash',
]);
const MOCK_PAYMENT_CAPABILITIES = createPaymentCapabilities([{
  scheme: 'exact',
  network: MOCK_NETWORK,
  paymentFlows: ['upfront'],
}]);

function decodeCanonicalBase64(value, expectedBytes) {
  if (typeof value !== 'string' || !BASE64.test(value)) throw new Error('invalid base64');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== expectedBytes || bytes.toString('base64') !== value) throw new Error('invalid base64');
  return bytes;
}

function publicKeyId(publicKeyDerB64) {
  return `mock-${sha256Hex(Buffer.from(publicKeyDerB64, 'base64')).slice(0, 32)}`;
}

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === expected.length &&
    Object.keys(value).every(key => expected.includes(key));
}

function validateMockTransaction(tx) {
  if (!exactKeys(tx, MOCK_TRANSACTION_FIELDS)) throw new Error('invalid mock transaction shape');
  if (tx.blockType !== 2 || !Number.isSafeInteger(tx.chainIdentifier) || tx.chainIdentifier <= 0) {
    throw new Error('invalid mock transaction type');
  }
  for (const field of ['address', 'toAddress', 'amount', 'tokenStandard']) {
    if (typeof tx[field] !== 'string' || !tx[field]) throw new Error('invalid mock transaction field');
  }
  if (!HASH_HEX.test(tx.data ?? '') || !HASH_HEX.test(tx.hash ?? '') || !NONCE_HEX.test(tx.nonce ?? '')) {
    throw new Error('invalid mock transaction encoding');
  }
}

function authorizationIdentity(paymentRequired, requirements, transactionHash) {
  const intentDigest = paymentIntentDigest(paymentRequired, requirements);
  const resourceDigest = sha256Hex(paymentRequired.resource);
  return sha256Hex({
    domain: 'zenon-x402-authorization-v1',
    chainProfile: requirements.extra.zenonChain,
    intentDigest,
    resourceDigest,
    transactionHash,
  });
}

export class MockExactZenonClient {
  constructor() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.publicKeyDerB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    this.address = publicKeyId(this.publicKeyDerB64);
    Object.defineProperty(this, 'paymentCapabilities', {
      value: MOCK_PAYMENT_CAPABILITIES,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }

  async createPaymentPayload(paymentRequired, accepted = paymentRequired?.accepts?.[0]) {
    validatePaymentRequired(paymentRequired);
    validateRequirement(accepted);
    if (accepted.network !== MOCK_NETWORK ||
        !paymentRequired.accepts.some(candidate => sameRequirements(candidate, accepted))) {
      throw new Error('unsupported mock payment requirement');
    }
    const intentDigest = paymentIntentDigest(paymentRequired, accepted);
    const block = {
      blockType: 2,
      chainIdentifier: Number(accepted.extra.zenonChain.chainIdentifier),
      address: this.address,
      toAddress: accepted.payTo,
      amount: accepted.amount,
      tokenStandard: accepted.asset,
      data: intentDigest,
      nonce: crypto.randomBytes(8).toString('hex'),
      publicKey: this.publicKeyDerB64,
    };
    const signature = crypto.sign(null, Buffer.from(canonicalJson(block)), this.privateKey).toString('base64');
    const transaction = { ...block, signature, hash: sha256Hex({ block, signature }) };

    return {
      x402Version: paymentRequired.x402Version,
      resource: structuredClone(paymentRequired.resource),
      accepted: structuredClone(accepted),
      payload: { transaction, intentDigest },
    };
  }
}

export class MockExactZenonFacilitator {
  constructor() {
    this.records = new Map();
  }

  async verify(paymentPayload, requirements, paymentRequired) {
    try {
      validatePaymentRequired(paymentRequired);
      validateRequirement(requirements);
      validatePaymentPayloadEnvelope(paymentPayload);
      if (requirements.network !== MOCK_NETWORK) return invalid('unsupported_network');
      if (!sameRequirements(paymentPayload.accepted, requirements) ||
          !paymentRequired.accepts.some(candidate => sameRequirements(candidate, requirements))) {
        return invalid('requirements_mismatch');
      }
      if (sha256Hex(paymentPayload.resource) !== sha256Hex(paymentRequired.resource)) return invalid('resource_mismatch');
      const tx = paymentPayload.payload.transaction;
      validateMockTransaction(tx);
      if (tx.blockType !== 2) return invalid('wrong_block_type');
      if (String(tx.chainIdentifier) !== requirements.extra.zenonChain.chainIdentifier) {
        return invalid('wrong_chain_identifier');
      }
      if (tx.toAddress !== requirements.payTo) return invalid('wrong_recipient');
      if (tx.amount !== requirements.amount) return invalid('wrong_amount');
      if (tx.tokenStandard !== requirements.asset) return invalid('wrong_asset');

      const expectedIntent = paymentIntentDigest(paymentRequired, requirements);
      if (tx.data !== expectedIntent || paymentPayload.payload.intentDigest !== expectedIntent) {
        return invalid('intent_mismatch');
      }

      const publicKey = decodeCanonicalBase64(tx.publicKey, 44);
      const signature = decodeCanonicalBase64(tx.signature, 64);
      if (publicKeyId(tx.publicKey) !== tx.address) return invalid('payer_key_mismatch');
      const unsigned = { ...tx };
      delete unsigned.signature;
      delete unsigned.hash;
      const key = crypto.createPublicKey({ key: publicKey, type: 'spki', format: 'der' });
      if (!crypto.verify(null, Buffer.from(canonicalJson(unsigned)), key, signature)) {
        return invalid('invalid_signature');
      }
      if (tx.hash !== sha256Hex({ block: unsigned, signature: tx.signature })) {
        return invalid('block_hash_mismatch');
      }

      return shieldAsyncEvidence({
        isValid: true,
        payer: tx.address,
        transaction: tx.hash,
        authorizationKey: authorizationIdentity(paymentRequired, requirements, tx.hash),
      });
    } catch {
      return invalid('verification_failed');
    }
  }

  async settle(paymentPayload, requirements, paymentRequired) {
    const verification = await this.verify(paymentPayload, requirements, paymentRequired);
    if (!verification.isValid) {
      return shieldAsyncEvidence({
        success: false,
        network: typeof requirements?.network === 'string' ? requirements.network : '',
        transaction: '',
        payer: verification.payer ?? '',
        errorReason: verification.invalidReason,
        state: 'VALIDATION_FAILED',
      });
    }
    let records, hasExisting, existing;
    try {
      records = readOwnDataValue(this, 'records');
      if (IS_PROXY(records)) throw new Error();
      hasExisting = REFLECT_APPLY(MAP_HAS, records, [verification.transaction]);
      existing = hasExisting ? REFLECT_APPLY(MAP_GET, records, [verification.transaction]) : null;
    } catch {
      return mockSettlementConflict(requirements, verification);
    }

    let fields, cachedResponse, newRecord;
    if (hasExisting) {
      fields = inspectMockDeliveryRecord(existing);
      if (!fields || !OBJECT_IS(fields.authorizationKey, verification.authorizationKey) ||
          !OBJECT_IS(fields.transaction, verification.transaction) ||
          !OBJECT_IS(fields.payer, verification.payer)) {
        return mockSettlementConflict(requirements, verification);
      }
      if (OBJECT_IS(fields.deliveryState, 'DELIVERED')) {
        try {
          cachedResponse = snapshotMockJson(fields.cachedResponse);
        } catch {
          return mockSettlementConflict(requirements, verification);
        }
      } else if ((!OBJECT_IS(fields.deliveryState, 'NONE') &&
          !OBJECT_IS(fields.deliveryState, 'DELIVERY_PENDING')) ||
          !OBJECT_IS(fields.cachedResponse, null)) {
        return mockSettlementConflict(requirements, verification);
      }
    } else {
      fields = {
        authorizationKey: verification.authorizationKey, transaction: verification.transaction,
        payer: verification.payer, deliveryState: 'NONE', cachedResponse: null,
      };
      newRecord = fields;
    }
    const result = shieldAsyncEvidence({
      success: true,
      network: requirements.network,
      transaction: verification.transaction,
      payer: verification.payer,
      state: 'MOMENTUM_INCLUDED',
      authorizationKey: verification.authorizationKey,
      deliveryState: fields.deliveryState,
      ...(OBJECT_IS(fields.deliveryState, 'DELIVERED')
        ? { cachedResponse }
        : {}),
    });
    if (newRecord) {
      REFLECT_APPLY(MAP_SET, records, [verification.transaction, newRecord]);
      return result;
    }
    return result;
  }

  async markDeliveryPending(settlement) {
    const context = captureMockRecordContext(this, settlement);
    if (!OBJECT_IS(context.state, 'NONE')) {
      return shieldAsyncEvidence({ ...context.trusted, deliveryClaimed: false });
    }

    const committed = {
      authorizationKey: context.trusted.authorizationKey,
      transaction: context.trusted.transaction,
      payer: context.trusted.payer,
      deliveryState: 'DELIVERY_PENDING',
      cachedResponse: null,
    };
    const result = shieldAsyncEvidence({ ...committed, deliveryClaimed: true });
    REFLECT_APPLY(MAP_SET, context.records, [context.transaction, committed]);
    return result;
  }

  async markDelivered(settlement, cachedResponse) {
    const context = captureMockRecordContext(this, settlement);
    if (OBJECT_IS(context.state, 'NONE')) throw new Error('mock delivery not pending');
    const candidate = snapshotMockJson(cachedResponse);

    if (OBJECT_IS(context.state, 'DELIVERED')) {
      if (!sameMockJson(context.trusted.cachedResponse, candidate)) throw new Error('mock delivery conflict');
      return shieldAsyncEvidence(context.trusted);
    }

    const committed = {
      authorizationKey: context.trusted.authorizationKey,
      transaction: context.trusted.transaction,
      payer: context.trusted.payer,
      deliveryState: 'DELIVERED',
      cachedResponse: candidate,
    };
    const result = shieldAsyncEvidence(snapshotMockJson(committed));
    REFLECT_APPLY(MAP_SET, context.records, [context.transaction, committed]);
    return result;
  }
}

const MOCK_DELIVERY_RECORD_KEYS = ['authorizationKey', 'transaction', 'payer', 'deliveryState', 'cachedResponse'];

function readOwnDataValue(object, key) {
  const descriptor = GET_OWN_DESCRIPTOR(object, key);
  if (!descriptor || !HAS_OWN(descriptor, 'value')) throw new Error();
  return descriptor.value;
}
function captureMockRecordContext(owner, settlement) {
  let records, transaction, authorizationKey, payer, record;
  try {
    if (!owner || typeof owner !== 'object' || IS_PROXY(owner) ||
        !settlement || typeof settlement !== 'object' || IS_PROXY(settlement)) throw new Error();
    records = readOwnDataValue(owner, 'records');
    transaction = readOwnDataValue(settlement, 'transaction');
    authorizationKey = readOwnDataValue(settlement, 'authorizationKey');
    payer = readOwnDataValue(settlement, 'payer');
    if (IS_PROXY(records) || typeof transaction !== 'string' ||
        typeof authorizationKey !== 'string' || typeof payer !== 'string') throw new Error();
    record = REFLECT_APPLY(MAP_GET, records, [transaction]);
  } catch {
    throw new Error('mock settlement identity not found');
  }

  const fields = inspectMockDeliveryRecord(record);
  if (!fields || !OBJECT_IS(fields.authorizationKey, authorizationKey) ||
      !OBJECT_IS(fields.transaction, transaction) || !OBJECT_IS(fields.payer, payer))
    throw new Error('mock settlement identity not found');
  const state = fields.deliveryState;
  if (!OBJECT_IS(state, 'NONE') && !OBJECT_IS(state, 'DELIVERY_PENDING') &&
      !OBJECT_IS(state, 'DELIVERED'))
    throw new Error('mock delivery not pending');

  let trustedCache = null;
  if (OBJECT_IS(state, 'DELIVERED')) {
    trustedCache = snapshotMockJson(fields.cachedResponse, 'mock settlement identity not found');
  } else if (!OBJECT_IS(fields.cachedResponse, null)) {
    throw new Error('mock settlement identity not found');
  }
  return { records, transaction, state,
    trusted: {
      authorizationKey,
      transaction,
      payer,
      deliveryState: state,
      cachedResponse: trustedCache,
    },
  };
}
function inspectMockDeliveryRecord(record) {
  if (!record || typeof record !== 'object' || IS_PROXY(record)) return null;
  const prototype = GET_PROTOTYPE(record);
  const keys = REFLECT_OWN_KEYS(record);
  if ((!OBJECT_IS(prototype, OBJECT_PROTOTYPE) && !OBJECT_IS(prototype, null)) ||
      !OBJECT_IS(keys.length, MOCK_DELIVERY_RECORD_KEYS.length)) return null;
  const fields = CREATE_OBJECT(null);
  for (let index = 0; index < MOCK_DELIVERY_RECORD_KEYS.length; index += 1) {
    const key = MOCK_DELIVERY_RECORD_KEYS[index];
    const descriptor = GET_OWN_DESCRIPTOR(record, key);
    if (!descriptor?.enumerable || !HAS_OWN(descriptor, 'value')) return null;
    fields[key] = descriptor.value;
  }
  return fields;
}
function snapshotMockJson(value, errorMessage = 'mock delivery cache invalid') {
  try { return copyMockJson(value, []); }
  catch { throw new Error(errorMessage); }
}
function copyMockJson(value, ancestors) {
  if (OBJECT_IS(value, null) || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!IS_SAFE_INTEGER(value)) throw new Error();
    return OBJECT_IS(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object' || IS_PROXY(value)) throw new Error();
  for (let index = 0; index < ancestors.length; index += 1) {
    if (OBJECT_IS(ancestors[index], value)) throw new Error();
  }

  defineInternalIndex(ancestors, ancestors.length, value);
  try {
    const prototype = GET_PROTOTYPE(value);
    const keys = REFLECT_OWN_KEYS(value);
    for (let index = 0; index < keys.length; index += 1) {
      if (typeof keys[index] !== 'string') throw new Error();
    }

    if (IS_ARRAY(value)) {
      const length = GET_OWN_DESCRIPTOR(value, 'length');
      if (!OBJECT_IS(prototype, ARRAY_PROTOTYPE) || !length || length.enumerable ||
          !HAS_OWN(length, 'value') || !OBJECT_IS(keys.length, length.value + 1)) {
        throw new Error();
      }
      const snapshot = [];
      for (let index = 0; index < length.value; index += 1) {
        const descriptor = GET_OWN_DESCRIPTOR(value, `${index}`);
        if (!descriptor || !descriptor.enumerable || !HAS_OWN(descriptor, 'value')) throw new Error();
        const member = copyMockJson(descriptor.value, ancestors);
        defineInternalIndex(snapshot, index, member);
      }
      return snapshot;
    }

    if (!OBJECT_IS(prototype, OBJECT_PROTOTYPE) && !OBJECT_IS(prototype, null)) throw new Error();
    const snapshot = CREATE_OBJECT(prototype);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const descriptor = GET_OWN_DESCRIPTOR(value, key);
      if (!descriptor || !descriptor.enumerable || !HAS_OWN(descriptor, 'value')) throw new Error();
      const member = copyMockJson(descriptor.value, ancestors);
      DEFINE_PROPERTY(snapshot, key, mockDataDescriptor(member, true, true, true));
    }
    return snapshot;
  } finally {
    ancestors.length -= 1;
  }
}
function sameMockJson(left, right) {
  if (OBJECT_IS(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' ||
      !OBJECT_IS(IS_ARRAY(left), IS_ARRAY(right))) return false;
  const leftKeys = REFLECT_OWN_KEYS(left);
  const rightKeys = REFLECT_OWN_KEYS(right);
  if (!OBJECT_IS(leftKeys.length, rightKeys.length)) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    const leftDescriptor = GET_OWN_DESCRIPTOR(left, key);
    const rightDescriptor = GET_OWN_DESCRIPTOR(right, key);
    if (!rightDescriptor || !sameMockJson(leftDescriptor.value, rightDescriptor.value)) return false;
  }
  return true;
}
function defineInternalIndex(array, index, value) {
  DEFINE_PROPERTY(array, `${index}`, mockDataDescriptor(value, true, true, true));
}
function mockDataDescriptor(value, enumerable, writable, configurable) {
  const descriptor = CREATE_OBJECT(null);
  descriptor.value = value;
  descriptor.enumerable = enumerable;
  descriptor.writable = writable;
  descriptor.configurable = configurable;
  return descriptor;
}
function shieldAsyncEvidence(value) {
  DEFINE_PROPERTY(value, 'then', mockDataDescriptor(undefined, false, false, false));
  return value;
}
function mockSettlementConflict(requirements, verification) {
  return shieldAsyncEvidence({
    success: false, network: requirements.network,
    transaction: verification.transaction, payer: verification.payer,
    errorReason: 'payment_identity_conflict', state: 'VALIDATION_FAILED',
  });
}

function invalid(reason) {
  return shieldAsyncEvidence({ isValid: false, invalidReason: reason, payer: '' });
}
