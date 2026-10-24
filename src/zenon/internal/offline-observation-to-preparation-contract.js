/**
 * ISOLATED OFFLINE RECORDED-TRACE QUALIFICATION ONLY.
 *
 * The exact input is { phase, expectedManifest, capturedTrace }. Both the
 * original expectedManifest and capturedTrace.manifest contain exactly:
 *   { payer, publicKey, intent, context, trustLabel }
 * intent is { toAddress, amount, tokenStandard, data }; context is
 * { chainIdentifier, networkIdentifier, profileIdentifier, epochIdentifier }.
 * capturedTrace additionally contains exactly quoteRequest, two account
 * frontier snapshots, two Momentum snapshots, rpcObservation, and nonceRecord.
 *
 * A Momentum snapshot has the dedicated v1-absent-price shape
 *   { chainIdentifier, height, hash, version }
 * or the paired-price shape with both nextFusionPrice and nextWorkPrice.
 * Equality in this contract is only equality between local recorded values.
 * It is not evidence of RPC origin, chain identity, canonicality, finality,
 * freshness, nonce work, or signing authority.
 */

import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { Address, TokenStandard } from 'znn-typescript-sdk';
import { MAX_ZENON_AMOUNT } from '../../x402-wire.js';
import { classifyDynamicPlasmaCompatibility } from '../dynamic-plasma-compatibility.js';

const USER_SEND = 2;
const EMPTY_HASH = '00'.repeat(32);
const HASH = /^[0-9a-f]{64}$/;
const NONCE = /^[0-9a-f]{16}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
const TRUST_LABELS = Object.freeze(['operator-trusted', 'synthetic-recorded']);

const TOP_FIELDS = Object.freeze(['phase', 'expectedManifest', 'capturedTrace']);
const MANIFEST_FIELDS = Object.freeze([
  'payer',
  'publicKey',
  'intent',
  'context',
  'trustLabel',
]);
const INTENT_FIELDS = Object.freeze(['toAddress', 'amount', 'tokenStandard', 'data']);
const CONTEXT_FIELDS = Object.freeze([
  'chainIdentifier',
  'networkIdentifier',
  'profileIdentifier',
  'epochIdentifier',
]);
const CAPTURED_FIELDS = Object.freeze([
  'manifest',
  'quoteRequest',
  'accountFrontierBefore',
  'accountFrontierAfter',
  'momentumBefore',
  'rpcObservation',
  'momentumAfter',
  'nonceRecord',
]);
const QUOTE_REQUEST_FIELDS = Object.freeze(['address', 'blockType', 'toAddress', 'data']);
const ACCOUNT_FRONTIER_FIELDS = Object.freeze(['address', 'height', 'hash']);
const LEGACY_MOMENTUM_FIELDS = Object.freeze([
  'chainIdentifier',
  'height',
  'hash',
  'version',
]);
const PRICED_MOMENTUM_FIELDS = Object.freeze([
  'chainIdentifier',
  'height',
  'hash',
  'version',
  'nextFusionPrice',
  'nextWorkPrice',
]);
const RPC_FIELDS = Object.freeze(['availablePlasma', 'basePlasma', 'requiredDifficulty']);
const NONCE_RECORD_FIELDS = Object.freeze([
  'nonce',
  'payer',
  'previousAccountHash',
  'difficulty',
]);

const ownKeys = Reflect.ownKeys;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const hasOwn = Object.hasOwn;
const defineProperty = Object.defineProperty;
const freeze = Object.freeze;
const isProxy = utilTypes.isProxy;

export function composeOfflinePreparationTrace(trace) {
  if (arguments.length !== 1) reject();
  const top = exactDataRecord(trace, TOP_FIELDS);
  if (top.phase !== 'UNSIGNED') reject();

  const captured = exactDataRecord(top.capturedTrace, CAPTURED_FIELDS);
  if (top.expectedManifest === captured.manifest) reject();
  if (captured.accountFrontierBefore !== null &&
      captured.accountFrontierBefore === captured.accountFrontierAfter) reject();
  if (captured.momentumBefore === captured.momentumAfter) reject();

  const expectedManifestRecord = exactDataRecord(top.expectedManifest, MANIFEST_FIELDS);
  const capturedManifestRecord = exactDataRecord(captured.manifest, MANIFEST_FIELDS);
  if (expectedManifestRecord.intent === capturedManifestRecord.intent ||
      expectedManifestRecord.context === capturedManifestRecord.context) reject();
  const expectedManifest = snapshotManifest(expectedManifestRecord);
  const capturedManifest = snapshotManifest(capturedManifestRecord);
  if (!sameManifest(expectedManifest, capturedManifest)) reject();

  const quoteRequest = snapshotQuoteRequest(captured.quoteRequest);
  if (quoteRequest.address !== expectedManifest.payer ||
      quoteRequest.toAddress !== expectedManifest.intent.toAddress ||
      quoteRequest.data !== expectedManifest.intent.data) reject();

  const accountFrontierBefore = snapshotNullableAccountFrontier(
    captured.accountFrontierBefore,
  );
  const accountFrontierAfter = snapshotNullableAccountFrontier(
    captured.accountFrontierAfter,
  );
  const previousAccountHash = checkedAccountFrontiers(
    accountFrontierBefore,
    accountFrontierAfter,
    expectedManifest.payer,
  );

  const momentumBefore = snapshotMomentum(captured.momentumBefore);
  const rpcObservation = snapshotRpcObservation(captured.rpcObservation);
  const momentumAfter = snapshotMomentum(captured.momentumAfter);
  if (!sameMomentum(momentumBefore, momentumAfter) ||
      momentumBefore.record.chainIdentifier !== expectedManifest.context.chainIdentifier) reject();

  let compatibility;
  try {
    compatibility = classifyDynamicPlasmaCompatibility({
      chainProfileMatch: { classification: 'MATCH' },
      beforeFrontier: classifierMomentum(momentumBefore),
      rpcObservation,
      afterFrontier: classifierMomentum(momentumAfter),
    });
  } catch {
    reject();
  }
  if (compatibility.classification !== 'PRE_DP' &&
      compatibility.classification !== 'DP_ACTIVE') reject();

  let selectedFusedPlasma;
  let selectedDifficulty;
  if (compatibility.classification === 'PRE_DP') {
    selectedDifficulty = rpcObservation.requiredDifficulty;
    selectedFusedPlasma = selectedDifficulty === 0
      ? rpcObservation.basePlasma
      : rpcObservation.availablePlasma;
  } else {
    if (compatibility.quote === null) reject();
    selectedFusedPlasma = compatibility.quote.selectedFusedPlasma;
    selectedDifficulty = compatibility.quote.requiredDifficulty;
  }

  const nonceRecord = snapshotNullableNonceRecord(captured.nonceRecord);
  let nonce;
  if (selectedDifficulty === 0) {
    if (nonceRecord !== null) reject();
    nonce = null;
  } else {
    if (nonceRecord === null || nonceRecord.payer !== expectedManifest.payer ||
        nonceRecord.previousAccountHash !== previousAccountHash ||
        nonceRecord.difficulty !== selectedDifficulty) reject();
    nonce = nonceRecord.nonce;
  }

  const preparationInput = freeze({
    chainIdentifier: expectedManifest.context.chainIdentifier,
    payer: expectedManifest.payer,
    publicKey: expectedManifest.publicKey,
    intent: freeze({
      toAddress: expectedManifest.intent.toAddress,
      amount: expectedManifest.intent.amount,
      tokenStandard: expectedManifest.intent.tokenStandard,
      data: expectedManifest.intent.data,
    }),
    accountFrontierBefore: frozenAccountFrontier(accountFrontierBefore),
    accountFrontierAfter: frozenAccountFrontier(accountFrontierAfter),
    dynamicPlasma: freeze({
      chainProfileMatch: freeze({ classification: 'MATCH' }),
      beforeFrontier: preparationMomentum(momentumBefore),
      rpcObservation: freeze({
        availablePlasma: rpcObservation.availablePlasma,
        basePlasma: rpcObservation.basePlasma,
        requiredDifficulty: rpcObservation.requiredDifficulty,
      }),
      afterFrontier: preparationMomentum(momentumAfter),
    }),
    nonce,
  });

  const trust = freeze({
    recordedTrustLabel: expectedManifest.trustLabel,
    recordedContext: freeze({
      chainIdentifier: expectedManifest.context.chainIdentifier,
      networkIdentifier: expectedManifest.context.networkIdentifier,
      profileIdentifier: expectedManifest.context.profileIdentifier,
      epochIdentifier: expectedManifest.context.epochIdentifier,
    }),
    sourceAuthentication: 'NOT_ESTABLISHED',
    chainAuthentication: 'NOT_ESTABLISHED',
    canonicality: 'NOT_ESTABLISHED',
    finality: 'NOT_ESTABLISHED',
    liveFreshness: 'NOT_ESTABLISHED',
    nonceProof: 'NOT_VERIFIED',
    signingAuthorization: 'NOT_ESTABLISHED',
  });

  // selectedFusedPlasma is deliberately obtained here to force the complete
  // classifier selection before a helper input can be returned. The unchanged
  // preparer independently derives the same value from dynamicPlasma.
  nonnegativeSafeInteger(selectedFusedPlasma);
  return freeze({
    qualification: 'OFFLINE_RECORDED_TRACE_ONLY',
    trust,
    compatibility,
    preparationInput,
  });
}

function snapshotManifest(record) {
  const payer = canonicalAddress(record.payer);
  const publicKey = canonicalBase64(record.publicKey, 32);
  let derivedAddress;
  try {
    derivedAddress = Address.fromPublicKey(publicKey.bytes).toString();
  } catch {
    reject();
  }
  if (derivedAddress !== payer.text) reject();
  const intent = snapshotIntent(record.intent);
  const context = snapshotContext(record.context);
  if (!TRUST_LABELS.includes(record.trustLabel)) reject();
  return {
    payer: payer.text,
    publicKey: publicKey.text,
    intent,
    context,
    trustLabel: record.trustLabel,
  };
}

function snapshotIntent(value) {
  const record = exactDataRecord(value, INTENT_FIELDS);
  const toAddress = canonicalAddress(record.toAddress);
  const amount = canonicalAmount(record.amount);
  const tokenStandard = canonicalTokenStandard(record.tokenStandard);
  const data = canonicalBase64(record.data, 32);
  return {
    toAddress: toAddress.text,
    amount,
    tokenStandard,
    data: data.text,
  };
}

function snapshotContext(value) {
  const record = exactDataRecord(value, CONTEXT_FIELDS);
  positiveSafeInteger(record.chainIdentifier);
  canonicalIdentifier(record.networkIdentifier);
  canonicalIdentifier(record.profileIdentifier);
  canonicalIdentifier(record.epochIdentifier);
  return {
    chainIdentifier: record.chainIdentifier,
    networkIdentifier: record.networkIdentifier,
    profileIdentifier: record.profileIdentifier,
    epochIdentifier: record.epochIdentifier,
  };
}

function snapshotQuoteRequest(value) {
  const record = exactDataRecord(value, QUOTE_REQUEST_FIELDS);
  const address = canonicalAddress(record.address);
  if (record.blockType !== USER_SEND) reject();
  const toAddress = canonicalAddress(record.toAddress);
  const data = canonicalBase64(record.data, 32);
  return {
    address: address.text,
    blockType: USER_SEND,
    toAddress: toAddress.text,
    data: data.text,
  };
}

function snapshotNullableAccountFrontier(value) {
  if (value === null) return null;
  const record = exactDataRecord(value, ACCOUNT_FRONTIER_FIELDS);
  const address = canonicalAddress(record.address);
  positiveSafeInteger(record.height);
  canonicalHash(record.hash);
  if (record.hash === EMPTY_HASH) reject();
  return { address: address.text, height: record.height, hash: record.hash };
}

function checkedAccountFrontiers(before, after, payer) {
  if (before === null || after === null) {
    if (before !== null || after !== null) reject();
    return EMPTY_HASH;
  }
  if (before.address !== payer || after.address !== payer ||
      before.address !== after.address || before.height !== after.height ||
      before.hash !== after.hash || after.height === Number.MAX_SAFE_INTEGER) reject();
  return after.hash;
}

function snapshotMomentum(value) {
  assertPlainRecord(value);
  const count = ownKeys(value).length;
  if (count === LEGACY_MOMENTUM_FIELDS.length) {
    const record = exactDataRecord(value, LEGACY_MOMENTUM_FIELDS);
    validateMomentumBase(record);
    if (record.version !== 1) reject();
    return { schema: 'V1_PRICES_ABSENT', record };
  }
  if (count === PRICED_MOMENTUM_FIELDS.length) {
    const record = exactDataRecord(value, PRICED_MOMENTUM_FIELDS);
    validateMomentumBase(record);
    nonnegativeSafeInteger(record.nextFusionPrice);
    nonnegativeSafeInteger(record.nextWorkPrice);
    return { schema: 'PAIRED_PRICES', record };
  }
  reject();
}

function validateMomentumBase(record) {
  positiveSafeInteger(record.chainIdentifier);
  positiveSafeInteger(record.height);
  canonicalHash(record.hash);
  nonnegativeSafeInteger(record.version);
}

function snapshotRpcObservation(value) {
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

function snapshotNullableNonceRecord(value) {
  if (value === null) return null;
  const record = exactDataRecord(value, NONCE_RECORD_FIELDS);
  if (typeof record.nonce !== 'string' || record.nonce.length !== 16 ||
      !NONCE.test(record.nonce)) reject();
  const payer = canonicalAddress(record.payer);
  canonicalHash(record.previousAccountHash);
  positiveSafeInteger(record.difficulty);
  return {
    nonce: record.nonce,
    payer: payer.text,
    previousAccountHash: record.previousAccountHash,
    difficulty: record.difficulty,
  };
}

function sameManifest(left, right) {
  return left.payer === right.payer && left.publicKey === right.publicKey &&
    left.intent.toAddress === right.intent.toAddress &&
    left.intent.amount === right.intent.amount &&
    left.intent.tokenStandard === right.intent.tokenStandard &&
    left.intent.data === right.intent.data &&
    left.context.chainIdentifier === right.context.chainIdentifier &&
    left.context.networkIdentifier === right.context.networkIdentifier &&
    left.context.profileIdentifier === right.context.profileIdentifier &&
    left.context.epochIdentifier === right.context.epochIdentifier &&
    left.trustLabel === right.trustLabel;
}

function sameMomentum(left, right) {
  if (left.schema !== right.schema) return false;
  const a = left.record;
  const b = right.record;
  if (a.chainIdentifier !== b.chainIdentifier || a.height !== b.height ||
      a.hash !== b.hash || a.version !== b.version) return false;
  return left.schema === 'V1_PRICES_ABSENT' ||
    (a.nextFusionPrice === b.nextFusionPrice && a.nextWorkPrice === b.nextWorkPrice);
}

function classifierMomentum(momentum) {
  const record = momentum.record;
  if (momentum.schema === 'V1_PRICES_ABSENT') {
    return {
      height: record.height,
      hash: record.hash,
      version: record.version,
      nextFusionPrice: 0,
      nextWorkPrice: 0,
    };
  }
  return {
    height: record.height,
    hash: record.hash,
    version: record.version,
    nextFusionPrice: record.nextFusionPrice,
    nextWorkPrice: record.nextWorkPrice,
  };
}

function preparationMomentum(momentum) {
  const record = momentum.record;
  if (momentum.schema === 'V1_PRICES_ABSENT') {
    return freeze({ height: record.height, hash: record.hash, version: record.version });
  }
  return freeze({
    height: record.height,
    hash: record.hash,
    version: record.version,
    nextFusionPrice: record.nextFusionPrice,
    nextWorkPrice: record.nextWorkPrice,
  });
}

function frozenAccountFrontier(value) {
  if (value === null) return null;
  return freeze({ address: value.address, height: value.height, hash: value.hash });
}

function canonicalAddress(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128) reject();
  try {
    const parsed = Address.parse(value);
    if (parsed.toString() !== value) reject();
    return { text: value };
  } catch {
    reject();
  }
}

function canonicalTokenStandard(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128) reject();
  try {
    const parsed = TokenStandard.parse(value);
    if (parsed.toString() !== value) reject();
    return value;
  } catch {
    reject();
  }
}

function canonicalAmount(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 77 ||
      !DECIMAL.test(value)) reject();
  const amount = BigInt(value);
  if (amount <= 0n || amount > MAX_ZENON_AMOUNT) reject();
  return value;
}

function canonicalBase64(value, size) {
  const encodedLength = 4 * Math.ceil(size / 3);
  if (typeof value !== 'string' || value.length !== encodedLength || !BASE64.test(value)) reject();
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== size || bytes.toString('base64') !== value) reject();
  return { text: value, bytes };
}

function canonicalIdentifier(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64 ||
      !IDENTIFIER.test(value)) reject();
}

function canonicalHash(value) {
  if (typeof value !== 'string' || value.length !== 64 || !HASH.test(value)) reject();
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
  const error = new TypeError('Offline observation-to-preparation trace rejected');
  defineProperty(error, 'code', {
    value: 'offline_observation_to_preparation_contract_rejected',
    enumerable: true,
  });
  throw error;
}
