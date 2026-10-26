// Exact bounded byte comparison for trusted, already encoded profile fields.
// This does not parse JSON, authenticate a profile, or grant native authority.
import { Buffer } from 'node:buffer';
import { types } from 'node:util';

const IS_BUFFER = Buffer.isBuffer;
const IS_PROXY = types.isProxy;
const ARRAY = Array.isArray;
const DESCRIPTOR = Object.getOwnPropertyDescriptor;
const OWN = Object.hasOwn;
const CREATE = Object.create;
const APPLY = Reflect.apply;
const COMPARE = Buffer.prototype.compare;
const LENGTH = DESCRIPTOR(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength').get;
const SAFE = Number.isSafeInteger;
const MAXIMUM = 1048576;
const MAX_FRAGMENTS = 256;

function bufferLength(value) {
  if (IS_PROXY(value) || !IS_BUFFER(value)) return null;
  const length = APPLY(LENGTH, value, []);
  const own = DESCRIPTOR(value, 'length');
  if (own !== undefined && (!OWN(own, 'value') || own.value !== length)) return null;
  return length;
}

export function matchesNativeProfileByteFragments(actual, fragments, maximumBytes) {
  if (arguments.length !== 3 || !SAFE(maximumBytes) || maximumBytes < 1 || maximumBytes > MAXIMUM
      || IS_PROXY(fragments) || !ARRAY(fragments)) return false;
  const actualLength = bufferLength(actual);
  const count = DESCRIPTOR(fragments, 'length')?.value;
  if (actualLength === null || actualLength > maximumBytes || !SAFE(count) || count > MAX_FRAGMENTS) return false;
  const captured = CREATE(null);
  let total = 0;
  for (let index = 0; index < count; index++) {
    const descriptor = DESCRIPTOR(fragments, index);
    if (descriptor === undefined || !OWN(descriptor, 'value')) return false;
    const fragment = descriptor.value, length = bufferLength(fragment);
    if (length === null || length > maximumBytes - total) return false;
    total += length;
    captured[index] = { fragment, length };
  }
  if (total !== actualLength) return false;
  let offset = 0;
  for (let index = 0; index < count; index++) {
    const { fragment, length } = captured[index], end = offset + length;
    if (APPLY(COMPARE, actual, [fragment, 0, length, offset, end]) !== 0) return false;
    offset = end;
  }
  return offset === actualLength;
}

