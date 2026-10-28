import { types as utilTypes } from 'node:util';
const apply = Reflect.apply, charAt = String.prototype.charCodeAt, sliceString = String.prototype.slice;
const descriptor = Object.getOwnPropertyDescriptor, hasOwn = Object.hasOwn;
function codeAt(value, index) { return apply(charAt, value, [index]); }
function slice(value, from, to) { return apply(sliceString, value, [from, to]); }
function append(array, value) { Object.defineProperty(array, String(array.length), { value, enumerable: true, writable: true, configurable: true }); }
function invalid() { throw new TypeError('NATIVE_PUBLIC_HTTPS_READ_ROUTE'); }
/** Existing public hostname/path/pinned-IPv4 byte grammar, shared with the
 * native read owner. No DNS lookup, connection, TLS or request is performed. */
export function captureNativePublicHttpsReadRoute(value) {
  if (arguments.length !== 1 || value === null || typeof value !== 'object' || utilTypes.isProxy(value)
      || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      || !Object.isFrozen(value) || Reflect.ownKeys(value).length !== 3) invalid();
  const out = {};
  for (const name of ['hostname', 'path', 'ipv4Address']) { const d = descriptor(value, name); if (!d?.enumerable || !hasOwn(d, 'value')) invalid(); out[name] = d.value; }
  return Object.freeze({ hostname: hostname(out.hostname), path: path(out.path), ipv4Address: ipv4(out.ipv4Address) });
}
function hostname(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 253) invalid();
  let start = 0;
  let labels = 0;
  let numeric = true;
  for (let index = 0; index <= value.length; index += 1) {
    const character = index === value.length ? 46 : codeAt(value, index);
    if (character === 46) {
      const length = index - start;
      if (length < 1 || length > 63 || codeAt(value, start) === 45 || codeAt(value, index - 1) === 45) invalid();
      labels += 1;
      start = index + 1;
    } else {
      if (!((character >= 97 && character <= 122) || (character >= 48 && character <= 57) || character === 45)) invalid();
      if (character < 48 || character > 57) numeric = false;
    }
  }
  if (labels < 2 || numeric) invalid();
  const suffixes = ['localhost', 'local', 'internal', 'home.arpa', 'invalid', 'test', 'example', 'example.com', 'example.net', 'example.org', 'onion', 'alt', 'arpa'];
  for (let index = 0; index < suffixes.length; index += 1) {
    const suffix = suffixes[index];
    if (value === suffix || slice(value, -suffix.length - 1) === `.${suffix}`) invalid();
  }
  return value;
}
function path(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2048 || codeAt(value, 0) !== 47) invalid();
  let segment = 1;
  const punctuation = "-._~!$&'()*+,;=:@";
  for (let index = 1; index <= value.length; index += 1) {
    const character = index === value.length ? 47 : codeAt(value, index);
    if (character === 47) {
      if (index === segment && index !== value.length) invalid();
      const part = slice(value, segment, index);
      if (part === '.' || part === '..') invalid();
      segment = index + 1;
    } else {
      let allowed = (character >= 48 && character <= 57) || (character >= 65 && character <= 90) || (character >= 97 && character <= 122);
      for (let item = 0; !allowed && item < punctuation.length; item += 1) allowed = character === codeAt(punctuation, item);
      if (!allowed) invalid();
    }
  }
  return value;
}
function ipv4(value) {
  if (typeof value !== 'string') invalid();
  const octets = [];
  let start = 0;
  let numeric = 0;
  for (let index = 0; index <= value.length; index += 1) {
    const character = index === value.length ? 46 : codeAt(value, index);
    if (character === 46) {
      const length = index - start;
      if (length < 1 || length > 3 || (length > 1 && codeAt(value, start) === 48) || numeric > 255) invalid();
      append(octets, numeric); numeric = 0; start = index + 1;
    } else {
      if (character < 48 || character > 57) invalid();
      numeric = numeric * 10 + character - 48;
    }
  }
  if (octets.length !== 4) invalid();
  const a = octets[0];
  const b = octets[1];
  const c = octets[2];
  if (a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && ((b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99) || b === 168))
      || (a === 198 && ((b >= 18 && b <= 19) || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113)) invalid();
  return value;
}
