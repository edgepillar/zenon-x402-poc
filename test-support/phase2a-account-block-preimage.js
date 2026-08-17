import { createHash } from 'node:crypto';

export const ACCOUNT_BLOCK_HASH_PREIMAGE_BYTES = 306;

const HASH_HEX = /^[0-9a-f]{64}$/;
const CANONICAL_DECIMAL = /^(0|[1-9]\d*)$/;
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const NONCE_HEX = /^(?:[0-9a-f]{2}){0,8}$/;
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_VALUES = new Map(Array.from(BECH32_CHARSET, (character, value) => [character, value]));
const BECH32_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

// Independent regression encoder pinned to znn-typescript-sdk 1.0.5:
// - hash field order: dist/utilities/block.js:17-39
// - amount encoding: dist/utilities/bytes.js:287-300
// - HashHeight encoding: dist/model/primitives/hashHeight.js:21-25
// - Address/ZTS core bytes: dist/model/primitives/address.js:46-47 and
//   dist/model/primitives/tokenStandard.js:37-38
// Production's independent reconstruction is src/zenon-payment.js:209-230.
// This 306-byte hash preimage is distinct from AccountBlock JSON and the full
// PaymentPayload JSON bytes carried in PAYMENT-SIGNATURE.

function assertRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function safeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
  return BigInt(value);
}

function canonicalDecimal(value, label) {
  if (typeof value !== 'string' || !CANONICAL_DECIMAL.test(value)) {
    throw new TypeError(`${label} must be a canonical unsigned decimal string`);
  }
  return BigInt(value);
}

function unsignedBigEndian(value, width, label) {
  const limit = 1n << BigInt(width * 8);
  if (value < 0n || value >= limit) {
    throw new RangeError(`${label} does not fit in ${width} bytes`);
  }

  const output = Buffer.alloc(width);
  let remaining = value;
  for (let index = width - 1; index >= 0; index -= 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}

function safeIntegerBytes(value, width, label) {
  return unsignedBigEndian(safeInteger(value, label), width, label);
}

function hashBytes(value, label) {
  if (typeof value !== 'string' || !HASH_HEX.test(value)) {
    throw new TypeError(`${label} must be 32 lowercase hexadecimal bytes`);
  }
  return Buffer.from(value, 'hex');
}

function canonicalBase64Bytes(value, label) {
  if (typeof value !== 'string' || !CANONICAL_BASE64.test(value)) {
    throw new TypeError(`${label} must be canonical Base64`);
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) {
    throw new TypeError(`${label} must be canonical Base64`);
  }
  return bytes;
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

function bech32HrpValues(hrp) {
  return [
    ...Array.from(hrp, character => character.charCodeAt(0) >>> 5),
    0,
    ...Array.from(hrp, character => character.charCodeAt(0) & 31),
  ];
}

function convertFiveBitWords(words, label) {
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

  if (bits >= 5 || ((accumulator << (8 - bits)) & 0xff) !== 0) {
    throw new TypeError(`${label} has non-canonical Bech32 padding`);
  }
  return Buffer.from(output);
}

function bech32Core(value, expectedHrp, expectedBytes, label) {
  if (typeof value !== 'string' || value.length > 90 || value !== value.toLowerCase()) {
    throw new TypeError(`${label} must be canonical lowercase Bech32`);
  }
  const separator = value.lastIndexOf('1');
  if (separator <= 0 || separator + 7 > value.length) {
    throw new TypeError(`${label} must be canonical lowercase Bech32`);
  }

  const hrp = value.slice(0, separator);
  if (hrp !== expectedHrp) throw new TypeError(`${label} has an unexpected Bech32 prefix`);

  const encoded = value.slice(separator + 1);
  const values = [];
  for (const character of encoded) {
    const decoded = BECH32_VALUES.get(character);
    if (decoded === undefined) throw new TypeError(`${label} contains an invalid Bech32 character`);
    values.push(decoded);
  }
  if (bech32Polymod([...bech32HrpValues(hrp), ...values]) !== 1) {
    throw new TypeError(`${label} has an invalid Bech32 checksum`);
  }

  const core = convertFiveBitWords(values.slice(0, -6), label);
  if (core.length !== expectedBytes) {
    throw new RangeError(`${label} must encode exactly ${expectedBytes} bytes`);
  }
  return core;
}

function nonceBytes(value) {
  if (typeof value !== 'string' || !NONCE_HEX.test(value)) {
    throw new TypeError('transaction.nonce must contain at most 8 lowercase hexadecimal bytes');
  }
  const nonce = Buffer.from(value, 'hex');
  const padded = Buffer.alloc(8);
  nonce.copy(padded, padded.length - nonce.length);
  return padded;
}

function sha3Bytes(value) {
  if (!(value instanceof Uint8Array)) throw new TypeError('SHA3-256 input must be bytes');
  return createHash('sha3-256').update(value).digest();
}

/** Return the lowercase SHA3-256 digest of a byte array. */
export function sha3Hex(value) {
  return sha3Bytes(value).toString('hex');
}

/**
 * Independently serialize an AccountBlock JSON literal into the 306-byte
 * preimage hashed by znn-typescript-sdk 1.0.5. This intentionally does not
 * import production hashing code or SDK-private utilities.
 */
export function accountBlockHashPreimage(transaction) {
  const block = assertRecord(transaction, 'transaction');
  const acknowledged = assertRecord(block.momentumAcknowledged, 'transaction.momentumAcknowledged');
  const data = canonicalBase64Bytes(block.data, 'transaction.data');

  const preimage = Buffer.concat([
    safeIntegerBytes(block.version, 8, 'transaction.version'),
    safeIntegerBytes(block.chainIdentifier, 8, 'transaction.chainIdentifier'),
    safeIntegerBytes(block.blockType, 8, 'transaction.blockType'),
    hashBytes(block.previousHash, 'transaction.previousHash'),
    safeIntegerBytes(block.height, 8, 'transaction.height'),
    hashBytes(acknowledged.hash, 'transaction.momentumAcknowledged.hash'),
    safeIntegerBytes(acknowledged.height, 8, 'transaction.momentumAcknowledged.height'),
    bech32Core(block.address, 'z', 20, 'transaction.address'),
    bech32Core(block.toAddress, 'z', 20, 'transaction.toAddress'),
    unsignedBigEndian(canonicalDecimal(block.amount, 'transaction.amount'), 32, 'transaction.amount'),
    bech32Core(block.tokenStandard, 'zts', 10, 'transaction.tokenStandard'),
    hashBytes(block.fromBlockHash, 'transaction.fromBlockHash'),
    sha3Bytes(Buffer.alloc(0)),
    sha3Bytes(data),
    safeIntegerBytes(block.fusedPlasma, 8, 'transaction.fusedPlasma'),
    safeIntegerBytes(block.difficulty, 8, 'transaction.difficulty'),
    nonceBytes(block.nonce),
  ]);

  if (preimage.length !== ACCOUNT_BLOCK_HASH_PREIMAGE_BYTES) {
    throw new Error(`account-block preimage invariant failed: ${preimage.length} bytes`);
  }
  return preimage;
}

/** Independently compute the lowercase AccountBlock hash from its JSON literal. */
export function accountBlockHashHex(transaction) {
  return sha3Hex(accountBlockHashPreimage(transaction));
}
