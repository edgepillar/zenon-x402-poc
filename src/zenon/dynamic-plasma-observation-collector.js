import { types as utilTypes } from 'node:util';

// This dependent observation producer deliberately has no execution authority.
// Its output matches the detached schema-v1 normalizer input, which does not
// persist a quote-request commitment. It is not signing authorization. A caller
// must retain the UNSIGNED boundary; any later signing integration needs a
// separately reviewed request-binding schema.
//
// Raw fields follow the reviewed go-zenon source: chain/nom/momentum.go,
// rpc/api/{ledger,ledger_types}.go, rpc/api/embedded/{spork,plasma}.go, and
// vm/embedded/definition/{spork,plasma}.go. New raw fields require review.

const freeze = Object.freeze;
const create = Object.create;
const defineProperty = Object.defineProperty;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const getOwnPropertyNames = Object.getOwnPropertyNames;
const getPrototypeOf = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys;
const apply = Reflect.apply;
const hasOwn = Object.hasOwn;
const isFrozen = Object.isFrozen;
const isArray = Array.isArray;
const isSafeInteger = Number.isSafeInteger;
const toNumber = Number;
const toBigInt = BigInt;
const toString = String;
const objectPrototype = Object.prototype;
const initialObjectThenDescriptor = getOwnPropertyDescriptor(objectPrototype, 'then');
const arrayPrototype = Array.prototype;
const isProxy = utilTypes.isProxy;
const isPromise = utilTypes.isPromise;
const NativePromise = Promise;
const promisePrototype = Promise.prototype;
const promiseThen = Promise.prototype.then;
const promiseSpecies = Symbol.species;
const promiseConstructorDescriptor = getOwnPropertyDescriptor(promisePrototype, 'constructor');
const promiseSpeciesDescriptor = getOwnPropertyDescriptor(NativePromise, promiseSpecies);
const TypeErrorConstructor = TypeError;
const ErrorConstructor = Error;
const charCodeAt = Function.call.bind(String.prototype.charCodeAt);
const slice = Function.call.bind(String.prototype.slice);
const indexOf = Function.call.bind(String.prototype.indexOf);
const fromCharCode = String.fromCharCode;
const regExpExec = RegExp.prototype.exec;

const INTEGER_TOKEN_BRAND = Symbol('collector integer token');
const INVALID = Symbol('collector unavailable');
const CONFIGURATION_DRIFT = Symbol('collector configuration drift');
const HASH = /^[0-9a-f]{64}$/;
const POSITIVE_DECIMAL = /^[1-9][0-9]{0,19}$/;
const MAX_UINT64 = 18446744073709551615n;
const MAX_SAFE = 9007199254740991n;
const MAX_UINT32 = 4294967295n;
const MAX_UINT8 = 255n;
const PAGE_SIZE = 128;
const MAX_PAGES = 8;
const MAX_SPORKS = 1024;
const MAX_RESULT_BYTES = 1048576;
const MAX_DEPTH = 16;
const MAX_VALUES = 16384;
const MAX_CONTAINERS = 4096;
const MAX_MEMBERS = 4096;
const MAX_STRING_BYTES = 65536;
const MAX_KEY_BYTES = 128;
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = freeze([0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]);

const OPTION_FIELDS = freeze(['transports']);
const TRANSPORT_FIELDS = freeze(['callRead']);
const INPUT_FIELDS = freeze(['phase', 'expectedChainProfile', 'compiledSporkIds', 'quoteRequest']);
const PROFILE_FIELDS = freeze(['version', 'chainIdentifier', 'genesisMomentumHash']);
const COMPILED_FIELDS = freeze(['dynamicPlasmaId', 'libp2pId']);
const QUOTE_REQUEST_FIELDS = freeze(['address', 'blockType', 'toAddress', 'data']);
const MOMENTUM_FIELDS = freeze([
  'version', 'chainIdentifier', 'hash', 'previousHash', 'height', 'timestamp',
  'data', 'content', 'changesHash', 'publicKey', 'signature', 'nextFusionPrice',
  'nextWorkPrice', 'producer',
]);
const LIST_FIELDS = freeze(['count', 'list']);
const CONTENT_FIELDS = freeze(['address', 'hash', 'height']);
const SPORK_FIELDS = freeze(['id', 'name', 'description', 'activated', 'enforcementHeight']);
const VARIABLE_FIELDS = freeze([
  'MaxBasePlasmaInMomentum', 'FusedPlasmaTarget', 'PowPlasmaTarget',
  'MaxPriceChangePercent', 'PriceChangeDenominator',
]);
const QUOTE_FIELDS = freeze(['availablePlasma', 'basePlasma', 'requiredDifficulty']);
const FRONTIER_METHOD = 'ledger.getFrontierMomentum';
const HEIGHT_METHOD = 'ledger.getMomentumsByHeight';
const SPORK_METHOD = 'embedded.spork.getAll';
const VARIABLES_METHOD = 'embedded.plasma.getVariables';
const QUOTE_METHOD = 'embedded.plasma.getRequiredPoWForAccountBlock';

export const DYNAMIC_PLASMA_OBSERVATION_COLLECTOR_CONTRACT = freeze({
  schemaVersion: 1,
  endpointCount: 2,
  phase: 'UNSIGNED',
  scope: 'DETACHED_DUAL_ENDPOINT_OBSERVATION',
  quoteRequestCommitment: 'NOT_PERSISTED',
  signingAuthorization: 'NOT_ESTABLISHED',
  // Repeated IDs cannot establish a complete paginated snapshot. The normalizer
  // may still classify duplicates from other detached observation producers.
  duplicateSporkIds: 'ENDPOINT_UNAVAILABLE',
  objectPrototypeThen: 'MUST_REMAIN_ABSENT',
  promiseRejectionHandling: freeze({
    safeDrain: 'EXACT_NATIVE_PROMISE_WITH_SAFE_CONSTRUCTOR_AND_SPECIES',
    ownConstructorForDrain: 'ABSENT_OR_OWN_DATA_CAPTURED_PROMISE',
    unsafeDrain: 'TRANSPORT_MUST_PREHANDLE_REJECTION',
  }),
  pageSize: PAGE_SIZE,
  maximumPages: MAX_PAGES,
  maximumSporks: MAX_SPORKS,
  maximumCallsPerEndpoint: 13,
  parserBounds: freeze({
    maximumResultBytes: MAX_RESULT_BYTES,
    maximumDepth: MAX_DEPTH,
    maximumValues: MAX_VALUES,
    maximumContainers: MAX_CONTAINERS,
    maximumMembers: MAX_MEMBERS,
    maximumStringBytes: MAX_STRING_BYTES,
    maximumKeyBytes: MAX_KEY_BYTES,
  }),
});

export function createDynamicPlasmaObservationCollector(options) {
  let firstCallRead;
  let secondCallRead;
  try {
    if (!thenInvariantHolds()) invalid();
    if (arguments.length !== 1) invalid();
    const top = exactObject(options, OPTION_FIELDS, objectPrototype);
    const transports = exactArray(top.transports, 2);
    const first = exactObject(transports[0], TRANSPORT_FIELDS, objectPrototype);
    const second = exactObject(transports[1], TRANSPORT_FIELDS, objectPrototype);
    firstCallRead = first.callRead;
    secondCallRead = second.callRead;
    if (transports[0] === transports[1] || firstCallRead === secondCallRead ||
        !isFrozen(transports[0]) || !isFrozen(transports[1]) ||
        typeof firstCallRead !== 'function' || typeof secondCallRead !== 'function' ||
        isProxy(firstCallRead) || isProxy(secondCallRead) ||
        !isFrozen(firstCallRead) || !isFrozen(secondCallRead)) invalid();
  } catch {
    throw fixedError('configuration_rejected');
  }

  let active = false;
  const collect = freeze(async function collect(input) {
    if (!thenInvariantHolds()) throw fixedError('configuration_rejected');
    // The busy gate intentionally precedes input descriptor inspection.
    if (active) throw fixedError('busy');
    active = true;
    try {
      let snapshot;
      try {
        if (arguments.length !== 1) invalid();
        snapshot = snapshotInput(input);
      } catch {
        throw fixedError('input_rejected');
      }
      const first = await shieldInternalPromise(collectEndpoint(firstCallRead, snapshot.quoteRequest));
      if (first.configurationRejected || !thenInvariantHolds()) throw fixedError('configuration_rejected');
      const second = await shieldInternalPromise(collectEndpoint(secondCallRead, snapshot.quoteRequest));
      if (second.configurationRejected || !thenInvariantHolds()) throw fixedError('configuration_rejected');
      const output = freeze({
        expectedChainProfile: snapshot.expectedChainProfile,
        compiledSporkIds: snapshot.compiledSporkIds,
        endpointObservations: freeze([first.endpoint, second.endpoint]),
      });
      // No intervening await or user callback is permitted between this check
      // and the sole ordinary-object async return in this module.
      if (!thenInvariantHolds()) throw fixedError('configuration_rejected');
      return output;
    } finally {
      active = false;
    }
  });
  return freeze({ collect });
}

function snapshotInput(input) {
  const top = exactObject(input, INPUT_FIELDS, objectPrototype);
  if (top.phase !== 'UNSIGNED') invalid();
  const profile = exactObject(top.expectedChainProfile, PROFILE_FIELDS, objectPrototype);
  if (profile.version !== 1 || typeof profile.chainIdentifier !== 'string' ||
      !testRegExp(POSITIVE_DECIMAL, profile.chainIdentifier) ||
      toBigInt(profile.chainIdentifier) > MAX_UINT64) invalid();
  hash(profile.genesisMomentumHash);
  const compiled = exactObject(top.compiledSporkIds, COMPILED_FIELDS, objectPrototype);
  hash(compiled.dynamicPlasmaId);
  hash(compiled.libp2pId);
  if (compiled.dynamicPlasmaId === compiled.libp2pId) invalid();
  const quote = exactObject(top.quoteRequest, QUOTE_REQUEST_FIELDS, objectPrototype);
  address(quote.address, true);
  address(quote.toAddress, true);
  if (quote.blockType !== 2) invalid();
  base64Bytes(quote.data, 32);
  return freeze({
    expectedChainProfile: freeze({
      version: 1,
      chainIdentifier: profile.chainIdentifier,
      genesisMomentumHash: profile.genesisMomentumHash,
    }),
    compiledSporkIds: freeze({
      dynamicPlasmaId: compiled.dynamicPlasmaId,
      libp2pId: compiled.libp2pId,
    }),
    quoteRequest: freeze({
      address: quote.address,
      blockType: 2,
      toAddress: quote.toAddress,
      data: quote.data,
    }),
  });
}

async function collectEndpoint(callRead, quoteRequest) {
  try {
    const beforeFrontier = projectMomentum(parseSettlement(await read(callRead, FRONTIER_METHOD, [])));
    const heightResult = exactObject(
      parseSettlement(await read(callRead, HEIGHT_METHOD, [2, 1])), LIST_FIELDS, null,
    );
    safeUint64Number(heightResult.count, 2n);
    const heightList = exactArray(heightResult.list, 1);
    const profileEvidence = freeze({ heightTwo: projectMomentum(heightList[0], true) });

    const list = [];
    const seenIds = create(null);
    let count = null;
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
      const page = exactObject(
        parseSettlement(await read(callRead, SPORK_METHOD, [pageIndex, PAGE_SIZE])), LIST_FIELDS, null,
      );
      const pageCount = uint32Number(page.count);
      if (pageCount > MAX_SPORKS || (count !== null && count !== pageCount)) invalid();
      count = pageCount;
      const remaining = count - pageIndex * PAGE_SIZE;
      const length = remaining < PAGE_SIZE ? remaining : PAGE_SIZE;
      const entries = exactArray(page.list, length);
      for (let index = 0; index < entries.length; index += 1) {
        const entry = projectSpork(entries[index]);
        if (hasOwn(seenIds, entry.id)) invalid();
        put(seenIds, entry.id, true);
        append(list, entry);
      }
      if (list.length === count) break;
    }
    if (list.length !== count) invalid();
    const sporks = freeze({ count, list: freeze(list) });
    const plasmaVariables = projectVariables(parseSettlement(await read(callRead, VARIABLES_METHOD, [])));
    const rpcObservation = projectQuote(parseSettlement(await read(callRead, QUOTE_METHOD, [quoteRequest])));
    const afterFrontier = projectMomentum(parseSettlement(await read(callRead, FRONTIER_METHOD, [])));
    return endpointResult(freeze({ beforeFrontier, profileEvidence, sporks, plasmaVariables, rpcObservation, afterFrontier }));
  } catch (error) {
    // Only private sentinel identity is compared. No raw failure properties or
    // rejection values are read; every async helper returns a null-prototype
    // wrapper, never an ordinary endpoint object susceptible to assimilation.
    return endpointResult(null, error === CONFIGURATION_DRIFT || !thenInvariantHolds());
  }
}

function read(callRead, method, params) {
  assertThenInvariant();
  const request = freeze({ method, params: freeze(params) });
  const promise = apply(callRead, undefined, [request]);
  assertDrainableNativePromise(promise);
  // Drain before rejecting decoration. Calling the captured native reaction
  // method cannot read an own then/metadata getter; constructor safety was
  // established using descriptors. The resulting callbacks return only owned
  // null-prototype records and discard rejection values without inspection.
  const bridge = apply(promiseThen, promise, [fulfilled, rejected]);
  assertDrainableNativePromise(bridge);
  if (getOwnPropertyNames(promise).length !== 0 || getOwnPropertyNames(bridge).length !== 0) invalid();
  assertThenInvariant();
  return shieldInternalPromise(bridge);
}

function fulfilled(value) {
  const settlement = create(null);
  const accepted = typeof value === 'string';
  put(settlement, 'accepted', accepted);
  put(settlement, 'text', accepted ? value : null);
  put(settlement, 'configurationRejected', !thenInvariantHolds());
  return freeze(settlement);
}

function rejected() {
  return fulfilled(null);
}

function parseSettlement(settlement) {
  if (settlement.configurationRejected) throw CONFIGURATION_DRIFT;
  assertThenInvariant();
  if (!settlement.accepted) invalid();
  return parseResult(settlement.text);
}

function assertDrainableNativePromise(value) {
  // Native reactions read the string-keyed constructor, not instance symbols.
  // Ignore symbols without inspecting their descriptors or values, including
  // runtime async-hook metadata. Every own string property remains forbidden.
  if (typeof value !== 'object' || value === null || isProxy(value) || !isPromise(value) ||
      getPrototypeOf(value) !== promisePrototype ||
      !sameDescriptor(getOwnPropertyDescriptor(promisePrototype, 'constructor'), promiseConstructorDescriptor) ||
      !sameDescriptor(getOwnPropertyDescriptor(NativePromise, promiseSpecies), promiseSpeciesDescriptor)) invalid();
  const constructor = getOwnPropertyDescriptor(value, 'constructor');
  // Unsafe/foreign mechanics cannot be drained without invoking untrusted
  // behavior. The injected transport must already have handled such rejection.
  // A safe own constructor permits draining only, never accepting the result.
  if (constructor !== undefined &&
      (!hasOwn(constructor, 'value') || constructor.value !== NativePromise)) invalid();
}

function thenInvariantHolds() {
  return initialObjectThenDescriptor === undefined &&
    getOwnPropertyDescriptor(objectPrototype, 'then') === undefined;
}

function assertThenInvariant() {
  if (!thenInvariantHolds()) throw CONFIGURATION_DRIFT;
}

function endpointResult(endpoint, configurationRejected = false) {
  const result = create(null);
  put(result, 'endpoint', endpoint);
  put(result, 'configurationRejected', configurationRejected);
  return freeze(result);
}

function testRegExp(pattern, value) {
  return apply(regExpExec, pattern, [value]) !== null;
}

function sameDescriptor(candidate, expected) {
  if (candidate === undefined) return false;
  const fields = ownKeys(expected);
  if (ownKeys(candidate).length !== fields.length) return false;
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!hasOwn(candidate, field) || candidate[field] !== expected[field]) return false;
  }
  return true;
}

function shieldInternalPromise(value) {
  // Internal awaits must not consult a transport-mutated inherited constructor.
  // Externally supplied promises have already passed the empty-string-key gate.
  put(value, 'constructor', NativePromise, false);
  return value;
}

function projectMomentum(raw, heightTwo = false) {
  const value = exactObject(raw, MOMENTUM_FIELDS, null);
  const chainIdentifier = positiveUint64String(value.chainIdentifier);
  const height = safeUint64Number(value.height, 1n);
  const version = safeUint64Number(value.version);
  hash(value.hash);
  hash(value.previousHash);
  hash(value.changesHash);
  uint64Lossless(value.timestamp);
  if (value.data !== '') invalid();
  base64Bytes(value.publicKey, 32);
  base64Bytes(value.signature, 64);
  address(value.producer, true);
  const content = exactArray(value.content);
  for (let index = 0; index < content.length; index += 1) {
    const header = exactObject(content[index], CONTENT_FIELDS, null);
    address(header.address, false);
    hash(header.hash);
    uint64Lossless(header.height);
  }
  if (heightTwo) {
    if (height !== 2 || version !== 1) invalid();
    uint64Lossless(value.nextFusionPrice);
    uint64Lossless(value.nextWorkPrice);
    return freeze({ chainIdentifier, height, hash: value.hash, previousHash: value.previousHash, version });
  }
  return freeze({
    chainIdentifier,
    height,
    hash: value.hash,
    version,
    nextFusionPrice: safeUint64Number(value.nextFusionPrice),
    nextWorkPrice: safeUint64Number(value.nextWorkPrice),
  });
}

function projectSpork(raw) {
  const value = exactObject(raw, SPORK_FIELDS, null);
  hash(value.id);
  if (typeof value.name !== 'string' || typeof value.description !== 'string' ||
      typeof value.activated !== 'boolean' || utf8Length(value.name, 40) < 5) invalid();
  utf8Length(value.description, 400);
  return freeze({
    id: value.id,
    name: value.name,
    activated: value.activated,
    enforcementHeight: safeUint64Number(value.enforcementHeight),
  });
}

function projectVariables(raw) {
  const value = exactObject(raw, VARIABLE_FIELDS, null);
  // Structural integer bounds only; the normalizer owns consensus coherence.
  return freeze({
    MaxBasePlasmaInMomentum: safeUint64Number(value.MaxBasePlasmaInMomentum),
    FusedPlasmaTarget: safeUint64Number(value.FusedPlasmaTarget),
    PowPlasmaTarget: safeUint64Number(value.PowPlasmaTarget),
    MaxPriceChangePercent: uint8Number(value.MaxPriceChangePercent),
    PriceChangeDenominator: uint8Number(value.PriceChangeDenominator),
  });
}

function projectQuote(raw) {
  const value = exactObject(raw, QUOTE_FIELDS, null);
  return freeze({
    availablePlasma: safeUint64Number(value.availablePlasma),
    basePlasma: safeUint64Number(value.basePlasma, 1n),
    requiredDifficulty: safeUint64Number(value.requiredDifficulty),
  });
}

function exactObject(value, fields, prototype) {
  if (typeof value !== 'object' || value === null || isProxy(value) ||
      getPrototypeOf(value) !== prototype || ownKeys(value).length !== fields.length) invalid();
  const result = create(null);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const descriptor = getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined || descriptor.enumerable !== true || !hasOwn(descriptor, 'value')) invalid();
    put(result, field, descriptor.value);
  }
  return result;
}

function exactArray(value, exactLength = null) {
  if (typeof value !== 'object' || value === null || isProxy(value) ||
      !isArray(value) || getPrototypeOf(value) !== arrayPrototype) invalid();
  const lengthDescriptor = getOwnPropertyDescriptor(value, 'length');
  if (lengthDescriptor === undefined || !hasOwn(lengthDescriptor, 'value') ||
      lengthDescriptor.enumerable !== false || !isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      (exactLength !== null && lengthDescriptor.value !== exactLength)) invalid();
  const length = lengthDescriptor.value;
  if (ownKeys(value).length !== length + 1) invalid();
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = getOwnPropertyDescriptor(value, toString(index));
    if (descriptor === undefined || descriptor.enumerable !== true || !hasOwn(descriptor, 'value')) invalid();
    append(result, descriptor.value);
  }
  return result;
}

function put(object, key, value, enumerable = true) {
  const descriptor = create(null);
  descriptor.value = value;
  descriptor.enumerable = enumerable;
  descriptor.writable = false;
  descriptor.configurable = false;
  defineProperty(object, key, descriptor);
}

function append(array, value) {
  put(array, toString(array.length), value);
}

function hash(value) {
  if (typeof value !== 'string' || !testRegExp(HASH, value)) invalid();
}

function integerLexeme(value) {
  if (typeof value !== 'object' || value === null || isProxy(value) ||
      getPrototypeOf(value) !== null || ownKeys(value).length !== 2) invalid();
  const lexeme = getOwnPropertyDescriptor(value, 'lexeme');
  const brand = getOwnPropertyDescriptor(value, INTEGER_TOKEN_BRAND);
  if (lexeme === undefined || !hasOwn(lexeme, 'value') ||
      brand === undefined || !hasOwn(brand, 'value') || brand.value !== true ||
      lexeme.enumerable !== true || brand.enumerable !== false ||
      lexeme.writable !== false || lexeme.configurable !== false ||
      brand.writable !== false || brand.configurable !== false) invalid();
  return lexeme.value;
}

function boundedInteger(value, minimum, maximum) {
  const lexeme = integerLexeme(value);
  const magnitude = toBigInt(lexeme);
  if (magnitude < minimum || magnitude > maximum) invalid();
  return lexeme;
}

function positiveUint64String(value) {
  return boundedInteger(value, 1n, MAX_UINT64);
}

function uint64Lossless(value) {
  boundedInteger(value, 0n, MAX_UINT64);
}

function safeUint64Number(value, minimum = 0n, maximum = MAX_SAFE) {
  const result = toNumber(boundedInteger(value, minimum, maximum));
  if (!isSafeInteger(result)) invalid();
  return result;
}

function uint32Number(value) {
  return safeUint64Number(value, 0n, MAX_UINT32);
}

function uint8Number(value) {
  return safeUint64Number(value, 0n, MAX_UINT8);
}

function utf8Length(value, maximum) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = charCodeAt(value, index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = charCodeAt(value, index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) invalid();
      index += 1;
      bytes += 4;
    } else {
      if (code >= 0xdc00 && code <= 0xdfff) invalid();
      bytes += 3;
    }
    if (bytes > maximum) invalid();
  }
  return bytes;
}

function base64Bytes(value, expectedLength) {
  if (typeof value !== 'string' || value.length !== (expectedLength === 32 ? 44 : 88)) invalid();
  const padding = expectedLength === 32 ? 1 : 2;
  let accumulator = 0;
  let bits = 0;
  const bytes = [];
  for (let index = 0; index < value.length - padding; index += 1) {
    const word = indexOf(BASE64, value[index]);
    if (word < 0) invalid();
    accumulator = (accumulator << 6) | word;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      append(bytes, (accumulator >>> bits) & 255);
    }
  }
  for (let index = value.length - padding; index < value.length; index += 1) {
    if (value[index] !== '=') invalid();
  }
  if (bytes.length !== expectedLength || (accumulator & ((1 << bits) - 1)) !== 0) invalid();
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    encoded += BASE64[first >>> 2] + BASE64[((first & 3) << 4) | (second >>> 4)];
    encoded += index + 1 < bytes.length ? BASE64[((second & 15) << 2) | (third >>> 6)] : '=';
    encoded += index + 2 < bytes.length ? BASE64[third & 63] : '=';
  }
  if (encoded !== value) invalid();
}

function polymodStep(checksum, word) {
  const top = checksum >>> 25;
  let result = ((checksum & 0x1ffffff) << 5) ^ word;
  for (let index = 0; index < 5; index += 1) {
    if ((top >>> index) & 1) result ^= BECH32_GENERATORS[index];
  }
  return result >>> 0;
}

function address(value, userOnly) {
  if (typeof value !== 'string' || value.length !== 40 || value[0] !== 'z' || value[1] !== '1') invalid();
  // HRP expansion for the single lowercase ASCII character z.
  let checksum = polymodStep(polymodStep(polymodStep(1, 3), 0), 26);
  const words = [];
  for (let index = 2; index < 40; index += 1) {
    const word = indexOf(BECH32, value[index]);
    if (word < 0) invalid();
    append(words, word);
    checksum = polymodStep(checksum, word);
  }
  if (checksum !== 1) invalid();
  let accumulator = 0;
  let bits = 0;
  const bytes = [];
  let nonzero = false;
  for (let index = 0; index < 32; index += 1) {
    accumulator = (accumulator << 5) | words[index];
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      const byte = (accumulator >>> bits) & 255;
      append(bytes, byte);
      if (byte !== 0) nonzero = true;
    }
  }
  if (bytes.length !== 20 || bits !== 0 || !nonzero ||
      (userOnly ? bytes[0] !== 0 : bytes[0] !== 0 && bytes[0] !== 1)) invalid();
  let encoded = 'z1';
  accumulator = 0;
  bits = 0;
  checksum = polymodStep(polymodStep(polymodStep(1, 3), 0), 26);
  for (let index = 0; index < bytes.length; index += 1) {
    accumulator = (accumulator << 8) | bytes[index];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      const word = (accumulator >>> bits) & 31;
      encoded += BECH32[word];
      checksum = polymodStep(checksum, word);
    }
  }
  if (bits !== 0) invalid();
  for (let index = 0; index < 6; index += 1) checksum = polymodStep(checksum, 0);
  checksum = (checksum ^ 1) >>> 0;
  for (let index = 5; index >= 0; index -= 1) encoded += BECH32[(checksum >>> (5 * index)) & 31];
  if (encoded !== value) invalid();
}

function parseResult(text) {
  if (typeof text !== 'string') invalid();
  utf8Length(text, MAX_RESULT_BYTES);
  let cursor = 0;
  let values = 0;
  let containers = 0;
  let members = 0;

  function whitespace() {
    while (cursor < text.length && isWhitespace(charCodeAt(text, cursor))) cursor += 1;
  }

  function member() {
    members += 1;
    if (members > MAX_MEMBERS) invalid();
  }

  function unicodeUnit() {
    let result = 0;
    for (let count = 0; count < 4; count += 1) {
      const code = charCodeAt(text, cursor++);
      let digit;
      if (code >= 48 && code <= 57) digit = code - 48;
      else if (code >= 65 && code <= 70) digit = code - 55;
      else if (code >= 97 && code <= 102) digit = code - 87;
      else invalid();
      result = result * 16 + digit;
    }
    return result;
  }

  function string(maximum) {
    if (text[cursor++] !== '"') invalid();
    let result = '';
    let bytes = 0;
    while (cursor < text.length) {
      let code = charCodeAt(text, cursor++);
      if (code === 34) return result;
      let escaped = false;
      if (code === 92) {
        escaped = true;
        const escape = text[cursor++];
        if (escape === 'u') code = unicodeUnit();
        else if (escape === '"') code = 34;
        else if (escape === '\\') code = 92;
        else if (escape === '/') code = 47;
        else if (escape === 'b') code = 8;
        else if (escape === 'f') code = 12;
        else if (escape === 'n') code = 10;
        else if (escape === 'r') code = 13;
        else if (escape === 't') code = 9;
        else invalid();
      } else if (code < 32) invalid();
      if (code >= 0xd800 && code <= 0xdbff) {
        let low;
        if (escaped) {
          if (text[cursor++] !== '\\' || text[cursor++] !== 'u') invalid();
          low = unicodeUnit();
        } else {
          low = charCodeAt(text, cursor++);
        }
        if (!(low >= 0xdc00 && low <= 0xdfff)) invalid();
        bytes += 4;
        result += fromCharCode(code, low);
      } else {
        if (code >= 0xdc00 && code <= 0xdfff) invalid();
        bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
        result += fromCharCode(code);
      }
      if (bytes > maximum) invalid();
    }
    invalid();
  }

  function number() {
    const start = cursor;
    const first = text[cursor++];
    if (first !== '0') {
      while (cursor < text.length && isDigit(charCodeAt(text, cursor))) {
        cursor += 1;
        if (cursor - start > 20) invalid();
      }
    }
    if (cursor < text.length && !isDelimiter(charCodeAt(text, cursor))) invalid();
    const token = create(null);
    put(token, 'lexeme', slice(text, start, cursor));
    put(token, INTEGER_TOKEN_BRAND, true, false);
    return freeze(token);
  }

  function value(depth) {
    whitespace();
    values += 1;
    if (values > MAX_VALUES) invalid();
    const character = text[cursor];
    if (character === '"') return string(MAX_STRING_BYTES);
    if (isDigit(charCodeAt(text, cursor))) return number();
    if (character === 't' && slice(text, cursor, cursor + 4) === 'true') {
      cursor += 4;
      return true;
    }
    if (character === 'f' && slice(text, cursor, cursor + 5) === 'false') {
      cursor += 5;
      return false;
    }
    if (character === 'n' && slice(text, cursor, cursor + 4) === 'null') {
      cursor += 4;
      return null;
    }
    if (character !== '{' && character !== '[') invalid();
    containers += 1;
    if (depth >= MAX_DEPTH || containers > MAX_CONTAINERS) invalid();
    cursor += 1;
    const object = character === '{';
    const result = object ? create(null) : [];
    const end = object ? '}' : ']';
    whitespace();
    if (text[cursor] === end) {
      cursor += 1;
      return freeze(result);
    }
    while (cursor < text.length) {
      member();
      whitespace();
      if (object) {
        const key = string(MAX_KEY_BYTES);
        if (key === '__proto__' || key === 'constructor' || key === 'prototype' || hasOwn(result, key)) invalid();
        whitespace();
        if (text[cursor++] !== ':') invalid();
        put(result, key, value(depth + 1));
      } else {
        append(result, value(depth + 1));
      }
      whitespace();
      if (text[cursor] === end) {
        cursor += 1;
        return freeze(result);
      }
      if (text[cursor++] !== ',') invalid();
    }
    invalid();
  }

  const parsed = value(0);
  whitespace();
  if (cursor !== text.length) invalid();
  return parsed;
}

function isWhitespace(code) {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

function isDigit(code) {
  return code >= 48 && code <= 57;
}

function isDelimiter(code) {
  return isWhitespace(code) || code === 44 || code === 93 || code === 125;
}

function fixedError(kind) {
  const busy = kind === 'busy';
  const message = busy ? 'Dynamic Plasma observation collector busy' :
    kind === 'configuration_rejected' ? 'Dynamic Plasma observation collector configuration rejected' :
      'Dynamic Plasma observation collector input rejected';
  const error = busy ? new ErrorConstructor(message) : new TypeErrorConstructor(message);
  const descriptor = create(null);
  descriptor.value = `${busy ? 'Error' : 'TypeError'}: ${message}`;
  descriptor.enumerable = false;
  descriptor.writable = false;
  descriptor.configurable = false;
  defineProperty(error, 'stack', descriptor);
  put(error, 'code', `dynamic_plasma_observation_collector_${kind}`);
  return freeze(error);
}

function invalid() {
  throw INVALID;
}
