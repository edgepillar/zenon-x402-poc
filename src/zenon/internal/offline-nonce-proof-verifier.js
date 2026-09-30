import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';

const ADDRESS_LENGTH = 40;
const HASH_HEX_LENGTH = 64;
const NONCE_HEX_LENGTH = 16;
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = Object.freeze([
  0x3b6a57b2,
  0x26508e6d,
  0x1ea119fa,
  0x3d4233dd,
  0x2a1462b3,
]);
const INPUT_FIELDS = Object.freeze([
  'payer',
  'previousAccountHash',
  'difficulty',
  'nonce',
]);
const POW_RANGE = 1n << 64n;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

function reject() {
  throw new TypeError('Offline nonce proof input rejected');
}

function exactInputRecord(input) {
  if ((input !== null && typeof input === 'object') || typeof input === 'function') {
    if (IS_PROXY(input)) reject();
  }
  if (input === null || typeof input !== 'object' || ARRAY_IS_ARRAY(input) ||
      GET_PROTOTYPE_OF(input) !== OBJECT_PROTOTYPE) reject();

  const keys = REFLECT_OWN_KEYS(input);
  if (keys.length !== INPUT_FIELDS.length) reject();
  for (const key of keys) {
    if (typeof key !== 'string' || !INPUT_FIELDS.includes(key)) reject();
  }

  const snapshot = Object.create(null);
  for (const field of INPUT_FIELDS) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(input, field);
    if (!descriptor || descriptor.enumerable !== true || !HAS_OWN(descriptor, 'value')) reject();
    snapshot[field] = descriptor.value;
  }
  return snapshot;
}

function lowercaseHex(value, length) {
  if (typeof value !== 'string' || value.length !== length) reject();
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const decimal = code >= 48 && code <= 57;
    const lowercase = code >= 97 && code <= 102;
    if (!decimal && !lowercase) reject();
  }
}

function boundedAddress(value) {
  if (typeof value !== 'string' || value.length !== ADDRESS_LENGTH ||
      value.charCodeAt(0) !== 122 || value.charCodeAt(1) !== 49) reject();
}

function bech32Polymod(values) {
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < BECH32_GENERATORS.length; index += 1) {
      if ((top >>> index) & 1) checksum ^= BECH32_GENERATORS[index];
    }
  }
  return checksum >>> 0;
}

function decodeCanonicalUserAddress(value) {
  const values = [];
  for (let index = 2; index < value.length; index += 1) {
    const decoded = BECH32_CHARSET.indexOf(value[index]);
    if (decoded < 0) reject();
    values.push(decoded);
  }

  if (bech32Polymod([3, 0, 26, ...values]) !== 1) reject();
  const words = values.slice(0, -6);
  const output = [];
  let accumulator = 0;
  let bits = 0;
  for (const word of words) {
    accumulator = ((accumulator << 5) | word) & 0xfff;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      output.push((accumulator >>> bits) & 0xff);
    }
  }
  if (bits >= 5 || ((accumulator << (8 - bits)) & 0xff) !== 0 ||
      output.length !== 20 || output[0] !== 0) reject();
  return Buffer.from(output);
}

function frozenResult(status, payer, previousAccountHash, difficulty) {
  const recordedProofScope = Object.freeze({
    payer,
    previousAccountHash,
    difficulty,
  });
  const trust = Object.freeze({
    sourceAuthentication: 'NOT_ESTABLISHED',
    chainAuthentication: 'NOT_ESTABLISHED',
    canonicality: 'NOT_ESTABLISHED',
    finality: 'NOT_ESTABLISHED',
    liveFreshness: 'NOT_ESTABLISHED',
    signingAuthorization: 'NOT_ESTABLISHED',
  });
  return Object.freeze({
    qualification: 'OFFLINE_NONCE_PREDICATE_ONLY',
    status,
    recordedProofScope,
    trust,
  });
}

export function verifyOfflineZenonNonceProof(input) {
  if (arguments.length !== 1) reject();
  const record = exactInputRecord(input);

  // The safe-integer boundary is deliberately narrower than the node's uint64 schema.
  if (!Number.isSafeInteger(record.difficulty) || record.difficulty < 0 ||
      Object.is(record.difficulty, -0)) reject();

  // Bound every string before Bech32/hex decoding or BigInt conversion.
  boundedAddress(record.payer);
  lowercaseHex(record.previousAccountHash, HASH_HEX_LENGTH);
  lowercaseHex(record.nonce, NONCE_HEX_LENGTH);

  const payerBytes = decodeCanonicalUserAddress(record.payer);
  const previousAccountHashBytes = Buffer.from(record.previousAccountHash, 'hex');
  const nonceBytes = Buffer.from(record.nonce, 'hex');

  if (record.difficulty === 0) {
    return frozenResult(
      'NOT_REQUIRED',
      record.payer,
      record.previousAccountHash,
      record.difficulty,
    );
  }

  const domain = createHash('sha3-256')
    .update(payerBytes)
    .update(previousAccountHashBytes)
    .digest();
  const work = createHash('sha3-256')
    .update(nonceBytes)
    .update(domain)
    .digest();
  const observed = work.readBigUInt64LE(0);
  const threshold = POW_RANGE - (POW_RANGE / BigInt(record.difficulty));
  const status = observed >= threshold ? 'VALID' : 'INVALID';
  return frozenResult(
    status,
    record.payer,
    record.previousAccountHash,
    record.difficulty,
  );
}
