/**
 * ISOLATED OFFLINE QUALIFICATION ONLY.
 * This is not a production planner or an approved runtime/signing path. It
 * performs no RPC, PoW generation, signing, publication, or runtime selection.
 */

import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import {
  AccountBlockTemplate,
  Address,
  BlockTypeEnum,
  Hash,
  HashHeight,
  TokenStandard,
} from 'znn-typescript-sdk';
import { getTxHash } from '../../../node_modules/znn-typescript-sdk/dist/utilities/block.js';
import { MAX_ZENON_AMOUNT } from '../../x402-wire.js';
import { classifyDynamicPlasmaCompatibility } from '../dynamic-plasma-compatibility.js';

const VERSION = 1;
const USER_SEND = BlockTypeEnum.UserSend;
const EMPTY_HASH = '00'.repeat(32);
const ZERO_NONCE = '0'.repeat(16);
const HASH = /^[0-9a-f]{64}$/;
const NONCE = /^[0-9a-f]{16}$/;
const DECIMAL = /^(0|[1-9]\d*)$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const TOP_FIELDS = Object.freeze([
  'chainIdentifier',
  'payer',
  'publicKey',
  'intent',
  'accountFrontierBefore',
  'accountFrontierAfter',
  'dynamicPlasma',
  'nonce',
]);
const INTENT_FIELDS = Object.freeze(['toAddress', 'amount', 'tokenStandard', 'data']);
const ACCOUNT_FRONTIER_FIELDS = Object.freeze(['address', 'height', 'hash']);
const DYNAMIC_FIELDS = Object.freeze([
  'chainProfileMatch',
  'beforeFrontier',
  'rpcObservation',
  'afterFrontier',
]);
const PROFILE_FIELDS = Object.freeze(['classification']);
const LEGACY_FRONTIER_FIELDS = Object.freeze(['height', 'hash', 'version']);
const PRICED_FRONTIER_FIELDS = Object.freeze([
  'height',
  'hash',
  'version',
  'nextFusionPrice',
  'nextWorkPrice',
]);
const RPC_FIELDS = Object.freeze(['availablePlasma', 'basePlasma', 'requiredDifficulty']);
const ownKeys = Reflect.ownKeys;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const hasOwn = Object.hasOwn;
const isProxy = utilTypes.isProxy;

export function prepareUnsignedZenonPaymentBlock(input) {
  const top = exactDataRecord(input, TOP_FIELDS);
  positiveSafeInteger(top.chainIdentifier);

  const payerAddress = canonicalAddress(top.payer);
  const publicKey = canonicalBase64(top.publicKey, 32);
  const intent = snapshotIntent(top.intent);
  const accountFrontierBefore = snapshotNullableAccountFrontier(top.accountFrontierBefore);
  const accountFrontierAfter = snapshotNullableAccountFrontier(top.accountFrontierAfter);
  const dynamic = snapshotDynamicPlasma(top.dynamicPlasma);
  const suppliedNonce = snapshotNonce(top.nonce);

  if (accountFrontierBefore !== null && top.accountFrontierBefore === top.accountFrontierAfter) reject();
  if (dynamic.before !== null &&
      top.dynamicPlasma.beforeFrontier === top.dynamicPlasma.afterFrontier) reject();

  let compatibility;
  try {
    compatibility = classifyDynamicPlasmaCompatibility(dynamic.classifierInput);
  } catch {
    reject();
  }
  if (compatibility.classification === 'UNAVAILABLE' ||
      compatibility.classification === 'MISBOUND_OR_INCOHERENT') reject();
  if (compatibility.classification !== 'PRE_DP' &&
      compatibility.classification !== 'DP_ACTIVE') reject();

  if (Address.fromPublicKey(publicKey).toString() !== top.payer) reject();
  const accountPosition = checkedAccountPosition(
    accountFrontierBefore,
    accountFrontierAfter,
    top.payer,
  );

  let fusedPlasma;
  let difficulty;
  let pricingBasis;
  if (compatibility.classification === 'PRE_DP') {
    const rpc = dynamic.rpcObservation;
    if (rpc === null) reject();
    difficulty = rpc.requiredDifficulty;
    fusedPlasma = difficulty === 0 ? rpc.basePlasma : rpc.availablePlasma;
    pricingBasis = 'LEGACY_SDK_BEHAVIOR_WITHOUT_DP_COHERENCE_PROOF';
  } else {
    if (compatibility.quote === null) reject();
    fusedPlasma = compatibility.quote.selectedFusedPlasma;
    difficulty = compatibility.quote.requiredDifficulty;
    pricingBasis = 'DYNAMIC_PLASMA_CLASSIFIER';
  }

  let nonce;
  if (difficulty === 0) {
    if (suppliedNonce !== null) reject();
    nonce = ZERO_NONCE;
  } else {
    if (suppliedNonce === null) reject();
    nonce = suppliedNonce;
  }

  const acknowledged = dynamic.after;
  if (acknowledged === null) reject();
  let hash;
  try {
    const sdkBlock = new AccountBlockTemplate({
      version: VERSION,
      chainIdentifier: top.chainIdentifier,
      blockType: USER_SEND,
      hash: Hash.parse(EMPTY_HASH),
      previousHash: Hash.parse(accountPosition.previousHash),
      height: accountPosition.height,
      momentumAcknowledged: new HashHeight(
        Hash.parse(acknowledged.record.hash),
        acknowledged.record.height,
      ),
      address: payerAddress,
      toAddress: intent.toAddress,
      amount: intent.amountValue,
      tokenStandard: intent.tokenStandard,
      fromBlockHash: Hash.parse(EMPTY_HASH),
      data: Buffer.from(intent.data),
      fusedPlasma,
      difficulty,
      nonce,
      publicKey: Buffer.from(publicKey),
      signature: Buffer.alloc(0),
    });
    hash = getTxHash(sdkBlock).toString();
  } catch {
    reject();
  }

  const momentumAcknowledged = Object.freeze({
    hash: acknowledged.record.hash,
    height: acknowledged.record.height,
  });
  const block = Object.freeze({
    version: VERSION,
    chainIdentifier: top.chainIdentifier,
    blockType: USER_SEND,
    hash,
    previousHash: accountPosition.previousHash,
    height: accountPosition.height,
    momentumAcknowledged,
    address: top.payer,
    toAddress: intent.toAddressText,
    amount: intent.amountText,
    tokenStandard: intent.tokenStandardText,
    fromBlockHash: EMPTY_HASH,
    data: intent.dataText,
    fusedPlasma,
    difficulty,
    nonce,
    publicKey: top.publicKey,
    signature: '',
  });
  return Object.freeze({
    qualification: 'OFFLINE_SERIALIZATION_ONLY',
    classification: compatibility.classification,
    pricingBasis,
    block,
  });
}

function snapshotIntent(value) {
  const record = exactDataRecord(value, INTENT_FIELDS);
  const toAddress = canonicalAddress(record.toAddress);
  const tokenStandard = canonicalTokenStandard(record.tokenStandard);
  const amountValue = canonicalAmount(record.amount);
  const data = canonicalBase64(record.data, 32);
  return {
    toAddress,
    toAddressText: record.toAddress,
    tokenStandard,
    tokenStandardText: record.tokenStandard,
    amountValue,
    amountText: record.amount,
    data,
    dataText: record.data,
  };
}

function snapshotNullableAccountFrontier(value) {
  if (value === null) return null;
  const record = exactDataRecord(value, ACCOUNT_FRONTIER_FIELDS);
  canonicalAddress(record.address);
  positiveSafeInteger(record.height);
  canonicalHash(record.hash);
  if (record.hash === EMPTY_HASH) reject();
  return record;
}

function snapshotDynamicPlasma(value) {
  const record = exactDataRecord(value, DYNAMIC_FIELDS);
  const profile = snapshotProfile(record.chainProfileMatch);
  const before = snapshotNullableDynamicFrontier(record.beforeFrontier);
  const rpcObservation = snapshotNullableRpcObservation(record.rpcObservation);
  const after = snapshotNullableDynamicFrontier(record.afterFrontier);

  if (before !== null && after !== null && before.schema !== after.schema) reject();
  const beforeForClassifier = classifierFrontier(before);
  const afterForClassifier = classifierFrontier(after);
  return {
    before,
    after,
    rpcObservation,
    classifierInput: {
      chainProfileMatch: profile,
      beforeFrontier: beforeForClassifier,
      rpcObservation,
      afterFrontier: afterForClassifier,
    },
  };
}

function snapshotProfile(value) {
  const record = exactDataRecord(value, PROFILE_FIELDS);
  if (record.classification !== 'MATCH' && record.classification !== 'MISMATCH' &&
      record.classification !== 'UNAVAILABLE') reject();
  return { classification: record.classification };
}

function snapshotNullableDynamicFrontier(value) {
  if (value === null) return null;
  assertPlainRecord(value);
  const count = ownKeys(value).length;
  if (count === LEGACY_FRONTIER_FIELDS.length) {
    const record = exactDataRecord(value, LEGACY_FRONTIER_FIELDS);
    validateDynamicFrontierBase(record);
    if (record.version !== 1) reject();
    return { schema: 'V1_PRICES_ABSENT', record };
  }
  if (count === PRICED_FRONTIER_FIELDS.length) {
    const record = exactDataRecord(value, PRICED_FRONTIER_FIELDS);
    validateDynamicFrontierBase(record);
    nonnegativeSafeInteger(record.nextFusionPrice);
    nonnegativeSafeInteger(record.nextWorkPrice);
    return { schema: 'PAIRED_PRICES', record };
  }
  reject();
}

function validateDynamicFrontierBase(record) {
  positiveSafeInteger(record.height);
  canonicalHash(record.hash);
  nonnegativeSafeInteger(record.version);
}

function snapshotNullableRpcObservation(value) {
  if (value === null) return null;
  const record = exactDataRecord(value, RPC_FIELDS);
  nonnegativeSafeInteger(record.availablePlasma);
  positiveSafeInteger(record.basePlasma);
  nonnegativeSafeInteger(record.requiredDifficulty);
  return {
    availablePlasma: record.availablePlasma,
    basePlasma: record.basePlasma,
    requiredDifficulty: record.requiredDifficulty,
  };
}

function classifierFrontier(snapshot) {
  if (snapshot === null) return null;
  if (snapshot.schema === 'V1_PRICES_ABSENT') {
    return {
      height: snapshot.record.height,
      hash: snapshot.record.hash,
      version: snapshot.record.version,
      nextFusionPrice: 0,
      nextWorkPrice: 0,
    };
  }
  return {
    height: snapshot.record.height,
    hash: snapshot.record.hash,
    version: snapshot.record.version,
    nextFusionPrice: snapshot.record.nextFusionPrice,
    nextWorkPrice: snapshot.record.nextWorkPrice,
  };
}

function checkedAccountPosition(before, after, payer) {
  if (before === null || after === null) {
    if (before !== null || after !== null) reject();
    return { height: 1, previousHash: EMPTY_HASH };
  }
  if (before.address !== after.address || before.height !== after.height ||
      before.hash !== after.hash || before.address !== payer) reject();
  const height = after.height + 1;
  if (!Number.isSafeInteger(height)) reject();
  return { height, previousHash: after.hash };
}

function snapshotNonce(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !NONCE.test(value)) reject();
  return value;
}

function canonicalAddress(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128) reject();
  try {
    const parsed = Address.parse(value);
    if (parsed.toString() !== value) reject();
    return parsed;
  } catch {
    reject();
  }
}

function canonicalTokenStandard(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128) reject();
  try {
    const parsed = TokenStandard.parse(value);
    if (parsed.toString() !== value) reject();
    return parsed;
  } catch {
    reject();
  }
}

function canonicalAmount(value) {
  if (typeof value !== 'string' || value.length > 77 || !DECIMAL.test(value)) reject();
  const amount = BigInt(value);
  if (amount <= 0n || amount > MAX_ZENON_AMOUNT) reject();
  return amount;
}

function canonicalBase64(value, size) {
  if (typeof value !== 'string' || value.length !== 4 * Math.ceil(size / 3)) reject();
  if (!BASE64.test(value)) reject();
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== size || decoded.toString('base64') !== value) reject();
  return decoded;
}

function canonicalHash(value) {
  if (typeof value !== 'string' || !HASH.test(value)) reject();
}

function exactDataRecord(value, expectedFields) {
  assertPlainRecord(value);
  const keys = ownKeys(value);
  if (keys.length !== expectedFields.length) reject();
  const result = Object.create(null);
  for (let index = 0; index < expectedFields.length; index += 1) {
    const field = expectedFields[index];
    const descriptor = getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined || descriptor.enumerable !== true ||
        !hasOwn(descriptor, 'value')) reject();
    result[field] = descriptor.value;
  }
  return result;
}

function assertPlainRecord(value) {
  if (typeof value !== 'object' || value === null || isProxy(value) ||
      getPrototypeOf(value) !== Object.prototype) reject();
}

function nonnegativeSafeInteger(value) {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) reject();
}

function positiveSafeInteger(value) {
  nonnegativeSafeInteger(value);
  if (value === 0) reject();
}

function reject() {
  const error = new TypeError('Offline pre-sign account-block preparation rejected');
  Object.defineProperty(error, 'code', {
    value: 'pre_sign_account_block_preparation_rejected',
    enumerable: true,
  });
  throw error;
}
