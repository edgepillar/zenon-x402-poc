import { types as utilTypes } from 'node:util';
import {
  createBoundedJsonRpcHttpsExchangeOwner,
} from './zenon/bounded-json-rpc-https-exchange-owner.js';
import {
  createZenonFundingJsonRpcReadTransport,
} from './service-credit-zenon-funding-json-rpc-read-transport.js';

// Default-off, pre-pinned Zenon funding wrapper. It owns the exact public
// configuration and route policy plus the closed four-method funding JSON-RPC
// composition. The shared internal owner alone holds native HTTPS/socket
// capabilities. Neither response is wallet, signing, publication, payment,
// canonicality, finality, credit, grant or service authority. Owned byte
// buffers are zeroed best-effort there; JavaScript strings are not erasable.

const freeze = Object.freeze;
const create = Object.create;
const define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const keys = Reflect.ownKeys;
const hasOwn = Object.hasOwn;
const isFrozen = Object.isFrozen;
const isSafeInteger = Number.isSafeInteger;
const same = Object.is;
const string = String;
const objectPrototype = Object.prototype;
const isProxy = utilTypes.isProxy;
const charAt = String.prototype.charCodeAt;
const sliceString = String.prototype.slice;
const apply = Reflect.apply;
const fromCharCode = String.fromCharCode;
const INVALID = Symbol('rejected Zenon funding HTTPS configuration');
const CONFIGURATION_FIELDS = freeze(['route', 'timeoutMs', 'closeGraceMs']);
const ROUTE_FIELDS = freeze(['hostname', 'path', 'ipv4Address']);

function invalid() { throw INVALID; }
function put(target, key, value, writable = false) {
  const attributes = create(null);
  attributes.value = value;
  attributes.enumerable = true;
  attributes.writable = writable;
  attributes.configurable = false;
  define(target, key, attributes);
}
function record(fields) {
  const value = create(null);
  const fieldsKeys = keys(fields);
  for (let index = 0; index < fieldsKeys.length; index += 1) {
    const key = fieldsKeys[index];
    put(value, key, fields[key], true);
  }
  return value;
}
function append(array, value) {
  define(
    array,
    string(array.length),
    record({ value, enumerable: true, writable: true, configurable: true }),
  );
}
function codeAt(value, index) { return apply(charAt, value, [index]); }
function slice(value, from, to) { return apply(sliceString, value, [from, to]); }
function exact(value, fields) {
  if (value === null || typeof value !== 'object' || isProxy(value)
      || prototype(value) !== objectPrototype || !isFrozen(value)
      || keys(value).length !== fields.length) invalid();
  const snapshot = create(null);
  for (let index = 0; index < fields.length; index += 1) {
    const key = fields[index];
    const item = descriptor(value, key);
    if (item === undefined || !hasOwn(item, 'value') || item.enumerable !== true) invalid();
    put(snapshot, key, item.value);
  }
  return freeze(snapshot);
}
function milliseconds(value) {
  if (!isSafeInteger(value) || same(value, -0) || value < 1 || value > 60000) invalid();
  return value;
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
      if (length < 1 || length > 63 || codeAt(value, start) === 45
          || codeAt(value, index - 1) === 45) invalid();
      labels += 1;
      start = index + 1;
    } else {
      if (!((character >= 97 && character <= 122)
          || (character >= 48 && character <= 57) || character === 45)) invalid();
      if (character < 48 || character > 57) numeric = false;
    }
  }
  if (labels < 2 || numeric) invalid();
  const suffixes = [
    'localhost', 'local', 'internal', 'home.arpa', 'invalid', 'test',
    'example', 'example.com', 'example.net', 'example.org', 'onion', 'alt',
    'arpa',
  ];
  for (let index = 0; index < suffixes.length; index += 1) {
    const suffix = suffixes[index];
    if (value === suffix || slice(value, -suffix.length - 1) === `.${suffix}`) invalid();
  }
  return value;
}
function path(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2048
      || codeAt(value, 0) !== 47) invalid();
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
      let allowed = (character >= 48 && character <= 57)
        || (character >= 65 && character <= 90)
        || (character >= 97 && character <= 122);
      for (let item = 0; !allowed && item < punctuation.length; item += 1) {
        allowed = character === codeAt(punctuation, item);
      }
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
      if (length < 1 || length > 3 || (length > 1 && codeAt(value, start) === 48)
          || numeric > 255) invalid();
      append(octets, numeric);
      numeric = 0;
      start = index + 1;
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
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && ((b === 0 && (c === 0 || c === 2))
        || (b === 88 && c === 99) || b === 168))
      || (a === 198 && ((b >= 18 && b <= 19) || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113)) invalid();
  return value;
}
function snapshotConfiguration(options) {
  if (arguments.length !== 1) invalid();
  const configuration = exact(options, CONFIGURATION_FIELDS);
  const input = exact(configuration.route, ROUTE_FIELDS);
  const route = freeze(record({
    hostname: hostname(input.hostname),
    path: path(input.path),
    ipv4Address: ipv4(input.ipv4Address),
  }));
  return freeze(record({
    route,
    timeoutMs: milliseconds(configuration.timeoutMs),
    closeGraceMs: milliseconds(configuration.closeGraceMs),
  }));
}

export function createZenonFundingHttpsReadTransportOwner(options) {
  const exchangeOwner = createBoundedJsonRpcHttpsExchangeOwner(
    options,
    arguments.length,
    snapshotConfiguration,
    'zenon_funding',
  );
  const transport = createZenonFundingJsonRpcReadTransport(
    freeze({ exchange: exchangeOwner.exchange }),
  );
  return freeze({ transport, close: exchangeOwner.close });
}
