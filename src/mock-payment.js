import crypto from 'node:crypto';
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

      return {
        isValid: true,
        payer: tx.address,
        transaction: tx.hash,
        authorizationKey: authorizationIdentity(paymentRequired, requirements, tx.hash),
      };
    } catch {
      return invalid('verification_failed');
    }
  }

  async settle(paymentPayload, requirements, paymentRequired) {
    const verification = await this.verify(paymentPayload, requirements, paymentRequired);
    if (!verification.isValid) {
      return {
        success: false,
        network: typeof requirements?.network === 'string' ? requirements.network : '',
        transaction: '',
        payer: verification.payer ?? '',
        errorReason: verification.invalidReason,
        state: 'VALIDATION_FAILED',
      };
    }
    const existing = this.records.get(verification.transaction);
    if (existing && existing.authorizationKey !== verification.authorizationKey) {
      return {
        success: false,
        network: requirements.network,
        transaction: verification.transaction,
        payer: verification.payer,
        errorReason: 'payment_identity_conflict',
        state: 'VALIDATION_FAILED',
      };
    }
    const record = existing ?? {
      authorizationKey: verification.authorizationKey,
      transaction: verification.transaction,
      payer: verification.payer,
      deliveryState: 'NONE',
      cachedResponse: null,
    };
    this.records.set(verification.transaction, record);
    return {
      success: true,
      network: requirements.network,
      transaction: verification.transaction,
      payer: verification.payer,
      state: 'MOMENTUM_INCLUDED',
      authorizationKey: verification.authorizationKey,
      deliveryState: record.deliveryState,
      ...(record.deliveryState === 'DELIVERED' ? { cachedResponse: record.cachedResponse } : {}),
    };
  }

  async markDeliveryPending(settlement) {
    const record = this.#record(settlement);
    const deliveryClaimed = record.deliveryState === 'NONE';
    if (deliveryClaimed) record.deliveryState = 'DELIVERY_PENDING';
    return { ...structuredClone(record), deliveryClaimed };
  }

  async markDelivered(settlement, cachedResponse) {
    const record = this.#record(settlement);
    if (record.deliveryState === 'DELIVERED' &&
        canonicalJson(record.cachedResponse) !== canonicalJson(cachedResponse)) {
      throw new Error('mock delivery conflict');
    }
    record.deliveryState = 'DELIVERED';
    record.cachedResponse = structuredClone(cachedResponse);
    return structuredClone(record);
  }

  #record(settlement) {
    const record = this.records.get(settlement?.transaction);
    if (!record || record.authorizationKey !== settlement.authorizationKey) {
      throw new Error('mock settlement identity not found');
    }
    return record;
  }
}

function invalid(reason) {
  return { isValid: false, invalidReason: reason, payer: '' };
}
