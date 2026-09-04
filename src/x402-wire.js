import { types as utilTypes } from 'node:util';

const CREATE_OBJECT = Object.create;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const HAS_OWN = Object.hasOwn;
const OBJECT_IS = Object.is;
const OWN_KEYS = Reflect.ownKeys;

export const X402_VERSION = 2;
export const MAX_ZENON_AMOUNT = (1n << 255n) - 1n;
export const MAX_ZENON_CHAIN_IDENTIFIER = BigInt(Number.MAX_SAFE_INTEGER);
export const MAX_SETTLEMENT_TIMEOUT_SECONDS = 300;
export const MAX_X402_HEADER_ENCODED_BYTES = 8 * 1024;
export const EXPERIMENTAL_LIVE_NETWORK = 'zenon:testnet';
export const MOCK_NETWORK = 'zenon:mock';
export const MOCK_ZENON_CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: Number.MAX_SAFE_INTEGER.toString(),
  // Reserved as the synthetic mock genesis sentinel. Live requirements reject it.
  genesisMomentumHash: '0'.repeat(64),
});

export const HEADERS = Object.freeze({
  PAYMENT_REQUIRED: 'payment-required',
  PAYMENT_SIGNATURE: 'payment-signature',
  PAYMENT_RESPONSE: 'payment-response',
});

const CANONICAL_POSITIVE_DECIMAL = /^[1-9]\d*$/;
const CANONICAL_UNSIGNED_DECIMAL = /^(?:0|[1-9]\d*)$/;
const LOWERCASE_HASH = /^[0-9a-f]{64}$/;
const REQUIREMENT_FIELDS = Object.freeze([
  'scheme', 'network', 'asset', 'amount', 'payTo', 'maxTimeoutSeconds', 'extra',
]);
const REQUIREMENT_EXTRA_FIELDS = Object.freeze(['poc', 'settlement', 'zenonChain']);
const REQUIREMENT_EXTRA_OPTIONAL_FIELDS = Object.freeze([
  'paymentFlow', 'minimumMomentumConfirmations',
]);
const CHAIN_PROFILE_FIELDS = Object.freeze(['version', 'chainIdentifier', 'genesisMomentumHash']);
const RESOURCE_REQUIRED_FIELDS = Object.freeze(['url']);
const RESOURCE_OPTIONAL_FIELDS = Object.freeze(['description', 'mimeType', 'serviceName', 'tags', 'iconUrl']);
const RESOURCE_FIELDS = Object.freeze([...RESOURCE_REQUIRED_FIELDS, ...RESOURCE_OPTIONAL_FIELDS]);
const PAYMENT_REQUIRED_FIELDS = Object.freeze(['x402Version', 'resource', 'accepts']);
const PAYMENT_PAYLOAD_FIELDS = Object.freeze(['x402Version', 'resource', 'accepted', 'payload']);
const INNER_PAYMENT_PAYLOAD_FIELDS = Object.freeze(['transaction', 'intentDigest']);
const BASE_REQUIREMENT_FIELDS = Object.freeze([
  'scheme', 'network', 'asset', 'amount', 'payTo', 'maxTimeoutSeconds',
]);
const PAYMENT_CAPABILITY_FIELDS = Object.freeze(['version', 'x402Version', 'routes']);
const PAYMENT_CAPABILITY_ROUTE_FIELDS = Object.freeze(['scheme', 'network', 'paymentFlows']);
const RECOGNIZED_PAYMENT_FLOWS = Object.freeze(['authorization', 'upfront', 'escrow']);
const MAX_PAYMENT_CAPABILITY_ROUTES = 16;
const MAX_PAYMENT_CAPABILITY_STRING_LENGTH = 128;
const MAX_RESOURCE_TAGS = 5;
const MAX_RESOURCE_SERVICE_FIELD_LENGTH = 32;
const MAX_RESOURCE_ICON_URL_LENGTH = 2048;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || utilTypes.isProxy(value) || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`);
}

function assertExactKeys(value, required, { optional = [], label } = {}) {
  assertPlainObject(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains an unexpected field`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label}.${key} is required`);
  }
}

function readExactEnumerableDataObject(value, required, { optional = [], label } = {}) {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  const keys = OWN_KEYS(value);
  const observedKeys = CREATE_OBJECT(null);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    let allowed = false;
    if (typeof key === 'string') {
      for (let requiredIndex = 0; requiredIndex < required.length; requiredIndex += 1) {
        if (required[requiredIndex] === key) {
          allowed = true;
          break;
        }
      }
      if (!allowed) {
        for (let optionalIndex = 0; optionalIndex < optional.length; optionalIndex += 1) {
          if (optional[optionalIndex] === key) {
            allowed = true;
            break;
          }
        }
      }
    }
    if (!allowed) {
      throw new Error(`${label} contains an unexpected field`);
    }
    observedKeys[key] = true;
  }
  for (let index = 0; index < required.length; index += 1) {
    const key = required[index];
    if (!HAS_OWN(observedKeys, key)) throw new Error(`${label}.${key} is required`);
  }

  const descriptors = CREATE_OBJECT(null);
  const values = CREATE_OBJECT(null);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) {
      throw new Error(`${label}.${key} must be an enumerable own data property`);
    }
    descriptors[key] = descriptor;
    values[key] = descriptor.value;
  }
  return { descriptors, keys, prototype, source: value, values };
}

function assertDataObjectUnchanged(snapshot, required, { optional = [], label } = {}) {
  const current = readExactEnumerableDataObject(snapshot.source, required, { optional, label });
  if (current.prototype !== snapshot.prototype || current.keys.length !== snapshot.keys.length) {
    throw new Error(`${label} changed during validation`);
  }
  for (let index = 0; index < current.keys.length; index += 1) {
    if (!HAS_OWN(snapshot.descriptors, current.keys[index])) {
      throw new Error(`${label} changed during validation`);
    }
  }
  for (let index = 0; index < snapshot.keys.length; index += 1) {
    const key = snapshot.keys[index];
    const before = snapshot.descriptors[key];
    const after = current.descriptors[key];
    if (!after || !OBJECT_IS(before.value, after.value) || before.writable !== after.writable ||
        before.enumerable !== after.enumerable || before.configurable !== after.configurable) {
      throw new Error(`${label} changed during validation`);
    }
  }
}

function readRequiredDataProperty(value, key, label) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
    throw new Error(`${label}.${key} is required`);
  }
  return descriptor.value;
}

function readOptionalDataProperty(value, key, label) {
  if (!Object.hasOwn(value, key)) return { present: false, value: undefined };
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
    throw new Error(`${label}.${key} must be an own data property`);
  }
  return { present: true, value: descriptor.value };
}

function readOptionalEnumerableDataProperty(value, key, label) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return { present: false, value: undefined };
  if (!Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
    throw new Error(`${label}.${key} must be an enumerable data property`);
  }
  return { present: true, value: descriptor.value };
}

function readStableExtensionsProperty(value, label, {
  allowUndefinedAsAbsent = false,
} = {}) {
  const extensions = readOptionalEnumerableDataProperty(value, 'extensions', label);
  if (!extensions.present ||
      (allowUndefinedAsAbsent && extensions.value === undefined) ||
      extensions.value === null) {
    return extensions;
  }

  assertPlainObject(extensions.value, `${label}.extensions`);
  for (const key of Reflect.ownKeys(extensions.value)) {
    if (typeof key !== 'string') {
      throw new Error(`${label}.extensions must not contain symbol keys`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(extensions.value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      throw new Error(`${label}.extensions entries must be enumerable data properties`);
    }
  }
  return extensions;
}

function validateEmptyExtensionsProperty(value, label, {
  allowUndefinedAsAbsent = false,
} = {}) {
  const extensions = readStableExtensionsProperty(value, label, {
    allowUndefinedAsAbsent,
  });
  if (!extensions.present ||
      (allowUndefinedAsAbsent && extensions.value === undefined)) {
    return;
  }
  if (extensions.value === null || Reflect.ownKeys(extensions.value).length !== 0) {
    throw new Error(`${label}.extensions is unsupported`);
  }
}

function readExactDataObject(value, required, label) {
  assertPlainObject(value, label);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== required.length || keys.some(key => typeof key !== 'string' || !required.includes(key))) {
    throw new Error(`${label} has an invalid shape`);
  }
  const result = {};
  for (const key of required) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new Error(`${label}.${key} must be an own data property`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function readDataArray(value, label, {
  maxLength,
  requireFrozen = false,
  allowEmpty = false,
  requireEnumerableItems = false,
} = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value') ||
      (!allowEmpty && lengthDescriptor.value === 0) || lengthDescriptor.value > maxLength) {
    throw new Error(`${label} has an invalid length`);
  }
  if (requireFrozen && !Object.isFrozen(value)) throw new Error(`${label} must be frozen`);
  const allowedKeys = new Set([
    'length',
    ...Array.from({ length: lengthDescriptor.value }, (_, index) => String(index)),
  ]);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== allowedKeys.size || keys.some(key => typeof key !== 'string' || !allowedKeys.has(key))) {
    throw new Error(`${label} has an invalid shape`);
  }
  return Array.from({ length: lengthDescriptor.value }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new Error(`${label} entries must be own data properties`);
    }
    if (requireEnumerableItems && descriptor.enumerable !== true) {
      throw new Error(`${label} entries must be enumerable`);
    }
    return descriptor.value;
  });
}

function readResourceFields(resource, { allowUnknown = false } = {}) {
  assertPlainObject(resource, 'ResourceInfo');
  const allowed = new Set(RESOURCE_FIELDS);
  for (const key of Reflect.ownKeys(resource)) {
    if (typeof key !== 'string') throw new Error('ResourceInfo contains an unexpected field');
    const descriptor = Object.getOwnPropertyDescriptor(resource, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      throw new Error(`ResourceInfo.${key} must be an enumerable own data property`);
    }
    if (!allowUnknown && !allowed.has(key)) {
      throw new Error('ResourceInfo contains an unexpected field');
    }
  }
  if (!Object.hasOwn(resource, 'url')) throw new Error('ResourceInfo.url is required');

  const fields = Object.create(null);
  for (const key of RESOURCE_FIELDS) {
    if (!Object.hasOwn(resource, key)) {
      fields[key] = { present: false, value: undefined };
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(resource, key);
    fields[key] = { present: true, value: descriptor.value };
  }
  return fields;
}

function readResourceTags(value) {
  const tags = readDataArray(value, 'ResourceInfo.tags', {
    maxLength: MAX_RESOURCE_TAGS,
    allowEmpty: true,
    requireEnumerableItems: true,
  });
  for (const tag of tags) {
    if (typeof tag !== 'string' || tag.length === 0 ||
        tag.length > MAX_RESOURCE_SERVICE_FIELD_LENGTH || !PRINTABLE_ASCII.test(tag)) {
      throw new Error('ResourceInfo.tags contains an invalid tag');
    }
  }
  return tags;
}

function validateResourceServiceName(value) {
  if (typeof value !== 'string' || value.length === 0 ||
      value.length > MAX_RESOURCE_SERVICE_FIELD_LENGTH || !PRINTABLE_ASCII.test(value)) {
    throw new Error('ResourceInfo.serviceName must be 1 to 32 printable ASCII characters');
  }
}

function validateResourceIconUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_RESOURCE_ICON_URL_LENGTH) {
    throw new Error('ResourceInfo.iconUrl must be a bounded non-empty string');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('ResourceInfo.iconUrl must be an absolute URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('ResourceInfo.iconUrl must use HTTP or HTTPS');
  }
  if (!parsed.hostname) throw new Error('ResourceInfo.iconUrl must contain a hostname');
  if (parsed.username || parsed.password) {
    throw new Error('ResourceInfo.iconUrl must not contain credentials');
  }
  return value;
}

function validateCapabilityString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PAYMENT_CAPABILITY_STRING_LENGTH) {
    throw new Error(`${label} must be a bounded non-empty string`);
  }
}

function copyCapabilityRoutes(routes, { requireFrozen = false } = {}) {
  const values = readDataArray(routes, 'paymentCapabilities.routes', {
    maxLength: MAX_PAYMENT_CAPABILITY_ROUTES,
    requireFrozen,
  });
  const routeKeys = new Set();
  return values.map((route, routeIndex) => {
    if (requireFrozen && !Object.isFrozen(route)) {
      throw new Error('paymentCapabilities routes must be frozen');
    }
    const copied = readExactDataObject(
      route,
      PAYMENT_CAPABILITY_ROUTE_FIELDS,
      `paymentCapabilities.routes[${routeIndex}]`,
    );
    validateCapabilityString(copied.scheme, 'paymentCapabilities route scheme');
    validateCapabilityString(copied.network, 'paymentCapabilities route network');
    if (copied.network.length < 3 || !copied.network.includes(':')) {
      throw new Error('paymentCapabilities route network must be a namespaced identifier');
    }
    const paymentFlows = readDataArray(copied.paymentFlows, 'paymentCapabilities route paymentFlows', {
      maxLength: RECOGNIZED_PAYMENT_FLOWS.length,
      requireFrozen,
    });
    const flowSet = new Set();
    for (const flow of paymentFlows) {
      if (!RECOGNIZED_PAYMENT_FLOWS.includes(flow)) {
        throw new Error('paymentCapabilities contains an unsupported payment flow');
      }
      if (flowSet.has(flow)) throw new Error('paymentCapabilities contains a duplicate payment flow');
      flowSet.add(flow);
    }
    const routeKey = `${copied.scheme}\u0000${copied.network}`;
    if (routeKeys.has(routeKey)) throw new Error('paymentCapabilities contains a duplicate route');
    routeKeys.add(routeKey);
    return {
      scheme: copied.scheme,
      network: copied.network,
      paymentFlows,
    };
  });
}

function freezeCapabilities(routes) {
  const frozenRoutes = routes.map(route => Object.freeze({
    scheme: route.scheme,
    network: route.network,
    paymentFlows: Object.freeze([...route.paymentFlows]),
  }));
  return Object.freeze({
    version: 1,
    x402Version: X402_VERSION,
    routes: Object.freeze(frozenRoutes),
  });
}

function sameChainProfile(a, b) {
  return a.version === b.version &&
    a.chainIdentifier === b.chainIdentifier &&
    a.genesisMomentumHash === b.genesisMomentumHash;
}

function validateEncodedByteLimit(maxEncodedBytes) {
  if (maxEncodedBytes !== undefined &&
      (!Number.isSafeInteger(maxEncodedBytes) || maxEncodedBytes < 0)) {
    throw new Error('maxEncodedBytes must be a nonnegative safe integer');
  }
}

export function encodeB64Json(value, { maxEncodedBytes } = {}) {
  validateEncodedByteLimit(maxEncodedBytes);
  const encoded = Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
  if (maxEncodedBytes !== undefined && encoded.length > maxEncodedBytes) {
    throw new Error('base64 JSON value exceeds encoded byte limit');
  }
  return encoded;
}

export function decodeB64Json(value, { maxDecodedBytes = 64 * 1024, maxEncodedBytes } = {}) {
  if (!value) throw new Error('missing base64 JSON value');
  if (typeof value !== 'string') throw new Error('invalid base64 JSON value');
  validateEncodedByteLimit(maxEncodedBytes);
  if (maxEncodedBytes !== undefined &&
      (value.length > maxEncodedBytes || Buffer.byteLength(value, 'utf8') > maxEncodedBytes)) {
    throw new Error('base64 JSON value exceeds encoded byte limit');
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('invalid base64 JSON value');
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) throw new Error('invalid base64 JSON value');
  if (decoded.length > maxDecodedBytes) throw new Error('base64 JSON value is too large');
  const json = new TextDecoder('utf-8', { fatal: true }).decode(decoded);
  const parsed = JSON.parse(json);
  if (!isPlainObject(parsed)) throw new Error('base64 JSON value must contain an object');
  return parsed;
}

export function validateCanonicalZenonAmount(value, label = 'amount') {
  if (typeof value !== 'string' || !CANONICAL_POSITIVE_DECIMAL.test(value) || BigInt(value) > MAX_ZENON_AMOUNT) {
    throw new Error(`${label} must be a canonical positive Zenon atomic integer not exceeding 2^255 - 1`);
  }
}

function validateZenonChainProfileSnapshot(profile) {
  if (profile.version !== 1) throw new Error('zenonChain.version must equal 1');
  if (typeof profile.chainIdentifier !== 'string' || profile.chainIdentifier.length > 20 ||
      !CANONICAL_POSITIVE_DECIMAL.test(profile.chainIdentifier)) {
    throw new Error('zenonChain.chainIdentifier must be a canonical nonzero decimal string');
  }
  const chainIdentifier = BigInt(profile.chainIdentifier);
  if (chainIdentifier > ((1n << 64n) - 1n) || chainIdentifier > MAX_ZENON_CHAIN_IDENTIFIER) {
    throw new Error('zenonChain.chainIdentifier exceeds the safe range of the current TypeScript SDK');
  }
  if (typeof profile.genesisMomentumHash !== 'string' || !LOWERCASE_HASH.test(profile.genesisMomentumHash)) {
    throw new Error('zenonChain.genesisMomentumHash must be 64 lowercase hexadecimal characters');
  }
}

function snapshotZenonChainProfile(profile, label = 'zenonChain') {
  const scanned = readExactEnumerableDataObject(profile, CHAIN_PROFILE_FIELDS, { label });
  const snapshot = {
    version: scanned.values.version,
    chainIdentifier: scanned.values.chainIdentifier,
    genesisMomentumHash: scanned.values.genesisMomentumHash,
  };
  validateZenonChainProfileSnapshot(snapshot);
  assertDataObjectUnchanged(scanned, CHAIN_PROFILE_FIELDS, { label });
  return Object.freeze(snapshot);
}

export function validateZenonChainProfile(profile) {
  snapshotZenonChainProfile(profile);
}

export function sameRequirements(a, b) {
  try {
    const left = snapshotRequirement(a);
    const right = snapshotRequirement(b);
    const leftHasPaymentFlow = Object.hasOwn(left.extra, 'paymentFlow');
    const rightHasPaymentFlow = Object.hasOwn(right.extra, 'paymentFlow');
    const leftHasMinimumConfirmations = Object.hasOwn(
      left.extra,
      'minimumMomentumConfirmations',
    );
    const rightHasMinimumConfirmations = Object.hasOwn(
      right.extra,
      'minimumMomentumConfirmations',
    );
    return left.scheme === right.scheme &&
      left.network === right.network &&
      left.asset === right.asset &&
      left.amount === right.amount &&
      left.payTo === right.payTo &&
      left.maxTimeoutSeconds === right.maxTimeoutSeconds &&
      left.extra.poc === right.extra.poc &&
      left.extra.settlement === right.extra.settlement &&
      leftHasPaymentFlow === rightHasPaymentFlow &&
      (!leftHasPaymentFlow || left.extra.paymentFlow === right.extra.paymentFlow) &&
      leftHasMinimumConfirmations === rightHasMinimumConfirmations &&
      (!leftHasMinimumConfirmations ||
        left.extra.minimumMomentumConfirmations === right.extra.minimumMomentumConfirmations) &&
      left.extra.zenonChain.version === right.extra.zenonChain.version &&
      left.extra.zenonChain.chainIdentifier === right.extra.zenonChain.chainIdentifier &&
      left.extra.zenonChain.genesisMomentumHash === right.extra.zenonChain.genesisMomentumHash;
  } catch {
    return false;
  }
}

export function createPaymentCapabilities(routes) {
  return freezeCapabilities(copyCapabilityRoutes(routes));
}

export function snapshotPaymentCapabilities(value) {
  if (!Object.isFrozen(value)) throw new Error('paymentCapabilities must be frozen');
  const descriptor = readExactDataObject(value, PAYMENT_CAPABILITY_FIELDS, 'paymentCapabilities');
  if (descriptor.version !== 1 || descriptor.x402Version !== X402_VERSION) {
    throw new Error('paymentCapabilities has an unsupported version');
  }
  return freezeCapabilities(copyCapabilityRoutes(descriptor.routes, { requireFrozen: true }));
}

export function validateBasePaymentRequirement(req) {
  assertExactKeys(req, BASE_REQUIREMENT_FIELDS, {
    optional: ['extra'],
    label: 'PaymentRequirements',
  });
  for (const key of ['scheme', 'network', 'asset', 'amount', 'payTo']) {
    if (typeof req[key] !== 'string' || !req[key]) throw new Error(`PaymentRequirements.${key} is required`);
  }
  if (req.network.length < 3 || !req.network.includes(':')) {
    throw new Error('PaymentRequirements.network must be a namespaced identifier');
  }
  if (typeof req.maxTimeoutSeconds !== 'number' || !Number.isFinite(req.maxTimeoutSeconds) ||
      req.maxTimeoutSeconds <= 0) {
    throw new Error('PaymentRequirements.maxTimeoutSeconds must be a positive finite number');
  }
  if (Object.hasOwn(req, 'extra') && req.extra !== null && !isPlainObject(req.extra)) {
    throw new Error('PaymentRequirements.extra must be an object or null');
  }
}

function validateStableResourceStructure(resource) {
  const fields = readResourceFields(resource, { allowUnknown: true });
  if (typeof fields.url.value !== 'string' || fields.url.value.length === 0) {
    throw new Error('ResourceInfo.url must be a non-empty string');
  }
  for (const key of ['description', 'mimeType']) {
    const field = fields[key];
    if (field.present && field.value !== null && typeof field.value !== 'string') {
      throw new Error(`ResourceInfo.${key} must be a string or null`);
    }
  }
  const serviceName = fields.serviceName;
  if (serviceName.present && serviceName.value !== null) {
    validateResourceServiceName(serviceName.value);
  }
  const tags = fields.tags;
  if (tags.present && tags.value !== null) readResourceTags(tags.value);
  const iconUrl = fields.iconUrl;
  if (iconUrl.present && iconUrl.value !== null &&
      (typeof iconUrl.value !== 'string' || iconUrl.value.length > MAX_RESOURCE_ICON_URL_LENGTH)) {
    throw new Error('ResourceInfo.iconUrl must be a string of at most 2048 characters or null');
  }
}

function validateStableRequirementStructure(requirement) {
  assertPlainObject(requirement, 'PaymentRequirements');
  const values = {};
  for (const key of BASE_REQUIREMENT_FIELDS) {
    values[key] = readRequiredDataProperty(requirement, key, 'PaymentRequirements');
  }
  for (const key of ['scheme', 'network', 'asset', 'amount', 'payTo']) {
    if (typeof values[key] !== 'string' || values[key].length === 0) {
      throw new Error(`PaymentRequirements.${key} must be a non-empty string`);
    }
  }
  if (values.network.length < 3 || !values.network.includes(':')) {
    throw new Error('PaymentRequirements.network must be a namespaced identifier');
  }
  if (typeof values.maxTimeoutSeconds !== 'number' || !Number.isFinite(values.maxTimeoutSeconds) ||
      values.maxTimeoutSeconds <= 0) {
    throw new Error('PaymentRequirements.maxTimeoutSeconds must be a positive finite number');
  }
  const extra = readOptionalDataProperty(requirement, 'extra', 'PaymentRequirements');
  if (extra.present && extra.value !== null && !isPlainObject(extra.value)) {
    throw new Error('PaymentRequirements.extra must be an object or null');
  }
  return { ...values, extra: extra.value };
}

function validateLocalZenonRequirementStructure(values) {
  if (typeof values.amount !== 'string' || !CANONICAL_UNSIGNED_DECIMAL.test(values.amount)) {
    throw new Error('PaymentRequirements.amount must use canonical unsigned decimal encoding');
  }
  assertPlainObject(values.extra, 'PaymentRequirements.extra');
  const poc = readRequiredDataProperty(values.extra, 'poc', 'PaymentRequirements.extra');
  const settlement = readRequiredDataProperty(values.extra, 'settlement', 'PaymentRequirements.extra');
  const profile = readRequiredDataProperty(values.extra, 'zenonChain', 'PaymentRequirements.extra');
  if (typeof poc !== 'boolean') throw new Error('PaymentRequirements.extra.poc must be a boolean');
  if (typeof settlement !== 'string') {
    throw new Error('PaymentRequirements.extra.settlement must be a string');
  }
  assertPlainObject(profile, 'PaymentRequirements.extra.zenonChain');
  const version = readRequiredDataProperty(profile, 'version', 'PaymentRequirements.extra.zenonChain');
  const chainIdentifier = readRequiredDataProperty(
    profile,
    'chainIdentifier',
    'PaymentRequirements.extra.zenonChain',
  );
  const genesisMomentumHash = readRequiredDataProperty(
    profile,
    'genesisMomentumHash',
    'PaymentRequirements.extra.zenonChain',
  );
  if (!Number.isSafeInteger(version)) {
    throw new Error('PaymentRequirements.extra.zenonChain.version must be a safe integer');
  }
  if (typeof chainIdentifier !== 'string' || !CANONICAL_UNSIGNED_DECIMAL.test(chainIdentifier)) {
    throw new Error('PaymentRequirements.extra.zenonChain.chainIdentifier has invalid encoding');
  }
  if (typeof genesisMomentumHash !== 'string' || !LOWERCASE_HASH.test(genesisMomentumHash)) {
    throw new Error('PaymentRequirements.extra.zenonChain.genesisMomentumHash has invalid encoding');
  }

  // The stable extra container permits arbitrary JSON values. Reading only the
  // descriptor rejects accessors without applying local flow policy here.
  readOptionalDataProperty(values.extra, 'paymentFlow', 'PaymentRequirements.extra');
  readOptionalDataProperty(
    values.extra,
    'minimumMomentumConfirmations',
    'PaymentRequirements.extra',
  );
}

export function validatePaymentPayloadStructure(paymentPayload) {
  assertPlainObject(paymentPayload, 'PaymentPayload');
  const x402Version = readRequiredDataProperty(paymentPayload, 'x402Version', 'PaymentPayload');
  if (typeof x402Version !== 'number' || !Number.isFinite(x402Version)) {
    throw new Error('PaymentPayload.x402Version must be a finite number');
  }

  // A well-typed but unsupported version is handled by the existing strict
  // policy lane. Do not impose the V2 member contract on another version.
  if (x402Version !== X402_VERSION) return;

  const accepted = readRequiredDataProperty(paymentPayload, 'accepted', 'PaymentPayload');
  const payload = readRequiredDataProperty(paymentPayload, 'payload', 'PaymentPayload');
  const acceptedValues = validateStableRequirementStructure(accepted);
  assertPlainObject(payload, 'PaymentPayload.payload');

  const resource = readOptionalDataProperty(paymentPayload, 'resource', 'PaymentPayload');
  if (resource.present && resource.value !== null) validateStableResourceStructure(resource.value);
  readStableExtensionsProperty(paymentPayload, 'PaymentPayload', {
    allowUndefinedAsAbsent: true,
  });

  const declaredLocalRoute = acceptedValues.scheme === 'exact' &&
    (acceptedValues.network === MOCK_NETWORK || acceptedValues.network === EXPERIMENTAL_LIVE_NETWORK);
  if (!declaredLocalRoute) return;

  validateLocalZenonRequirementStructure(acceptedValues);
  const transaction = readRequiredDataProperty(payload, 'transaction', 'PaymentPayload.payload');
  const intentDigest = readRequiredDataProperty(payload, 'intentDigest', 'PaymentPayload.payload');
  assertPlainObject(transaction, 'PaymentPayload.payload.transaction');
  if (typeof intentDigest !== 'string' || !LOWERCASE_HASH.test(intentDigest)) {
    throw new Error('PaymentPayload.payload.intentDigest has invalid encoding');
  }
}

function validateRequirementSnapshot(req, { requireActive = false } = {}) {
  for (const key of ['scheme', 'network', 'asset', 'amount', 'payTo']) {
    if (typeof req[key] !== 'string' || !req[key]) throw new Error(`PaymentRequirements.${key} is required`);
  }
  if (req.asset.length > 128 || req.payTo.length > 128 || req.amount.length > 77) {
    throw new Error('PaymentRequirements contains an oversized payment field');
  }
  if (req.scheme !== 'exact') throw new Error('PoC supports only scheme=exact');
  if (req.network !== EXPERIMENTAL_LIVE_NETWORK && req.network !== MOCK_NETWORK) {
    throw new Error('PoC supports only its exact experimental live or mock network label');
  }
  validateCanonicalZenonAmount(req.amount);
  if (!Number.isSafeInteger(req.maxTimeoutSeconds) || req.maxTimeoutSeconds <= 0 ||
      req.maxTimeoutSeconds > MAX_SETTLEMENT_TIMEOUT_SECONDS) {
    throw new Error(`maxTimeoutSeconds must be between 1 and ${MAX_SETTLEMENT_TIMEOUT_SECONDS}`);
  }

  if (req.extra.poc !== true) throw new Error('PaymentRequirements.extra.poc must equal true');
  if (req.extra.settlement !== 'account-block') {
    throw new Error('PaymentRequirements.extra.settlement must equal account-block');
  }
  if (Object.hasOwn(req.extra, 'paymentFlow') && req.extra.paymentFlow !== 'upfront') {
    throw new Error('PaymentRequirements.extra.paymentFlow must equal upfront');
  }
  if (requireActive && !Object.hasOwn(req.extra, 'paymentFlow')) {
    throw new Error('active HTTP payments require PaymentRequirements.extra.paymentFlow=upfront');
  }
  validateZenonChainProfileSnapshot(req.extra.zenonChain);
  const isSyntheticMock = sameChainProfile(req.extra.zenonChain, MOCK_ZENON_CHAIN_PROFILE);
  if (req.network === MOCK_NETWORK && !isSyntheticMock) {
    throw new Error('mock requirements must use the reserved synthetic mock chain profile');
  }
  if (req.network !== MOCK_NETWORK &&
      (isSyntheticMock || req.extra.zenonChain.genesisMomentumHash === MOCK_ZENON_CHAIN_PROFILE.genesisMomentumHash)) {
    throw new Error('live requirements cannot use the synthetic mock chain profile');
  }
  const hasMinimumConfirmations = Object.hasOwn(req.extra, 'minimumMomentumConfirmations');
  if (req.network === MOCK_NETWORK && hasMinimumConfirmations) {
    throw new Error('mock requirements must not set minimumMomentumConfirmations');
  }
  if (req.network === EXPERIMENTAL_LIVE_NETWORK && hasMinimumConfirmations) {
    const minimum = req.extra.minimumMomentumConfirmations;
    if (!Number.isSafeInteger(minimum) || minimum < 2 || minimum > 30) {
      throw new Error('minimumMomentumConfirmations must be an integer from 2 to 30 when present');
    }
  }
}

function snapshotRequirement(requirement, { requireActive = false } = {}) {
  const root = readExactEnumerableDataObject(requirement, REQUIREMENT_FIELDS, {
    label: 'PaymentRequirements',
  });
  const extra = readExactEnumerableDataObject(root.values.extra, REQUIREMENT_EXTRA_FIELDS, {
    optional: REQUIREMENT_EXTRA_OPTIONAL_FIELDS,
    label: 'PaymentRequirements.extra',
  });
  const chain = readExactEnumerableDataObject(extra.values.zenonChain, CHAIN_PROFILE_FIELDS, {
    label: 'PaymentRequirements.extra.zenonChain',
  });

  const chainSnapshot = {
    version: chain.values.version,
    chainIdentifier: chain.values.chainIdentifier,
    genesisMomentumHash: chain.values.genesisMomentumHash,
  };
  const extraSnapshot = {
    ...(HAS_OWN(extra.descriptors, 'paymentFlow')
      ? { paymentFlow: extra.values.paymentFlow }
      : {}),
    poc: extra.values.poc,
    settlement: extra.values.settlement,
    zenonChain: chainSnapshot,
    ...(HAS_OWN(extra.descriptors, 'minimumMomentumConfirmations')
      ? { minimumMomentumConfirmations: extra.values.minimumMomentumConfirmations }
      : {}),
  };
  const snapshot = {
    scheme: root.values.scheme,
    network: root.values.network,
    asset: root.values.asset,
    amount: root.values.amount,
    payTo: root.values.payTo,
    maxTimeoutSeconds: root.values.maxTimeoutSeconds,
    extra: extraSnapshot,
  };

  validateRequirementSnapshot(snapshot, { requireActive });
  assertDataObjectUnchanged(chain, CHAIN_PROFILE_FIELDS, {
    label: 'PaymentRequirements.extra.zenonChain',
  });
  assertDataObjectUnchanged(extra, REQUIREMENT_EXTRA_FIELDS, {
    optional: REQUIREMENT_EXTRA_OPTIONAL_FIELDS,
    label: 'PaymentRequirements.extra',
  });
  assertDataObjectUnchanged(root, REQUIREMENT_FIELDS, { label: 'PaymentRequirements' });

  Object.freeze(chainSnapshot);
  Object.freeze(extraSnapshot);
  return Object.freeze(snapshot);
}

export function snapshotActiveUpfrontRequirement(requirement) {
  return snapshotRequirement(requirement, { requireActive: true });
}

export function effectiveMinimumMomentumConfirmations(requirement) {
  const snapshot = snapshotActiveUpfrontRequirement(requirement);
  return Object.hasOwn(snapshot.extra, 'minimumMomentumConfirmations')
    ? snapshot.extra.minimumMomentumConfirmations
    : 1;
}

export function validateRequirement(req) {
  snapshotRequirement(req);
}

export function validateActiveUpfrontRequirement(req) {
  snapshotActiveUpfrontRequirement(req);
}

function snapshotValidatedResource(resource) {
  const fields = readResourceFields(resource);
  const url = fields.url.value;
  const description = fields.description;
  const mimeType = fields.mimeType;
  const serviceName = fields.serviceName;
  const tags = fields.tags;
  const iconUrl = fields.iconUrl;
  if (typeof url !== 'string' || !url) throw new Error('ResourceInfo.url is required');
  if (description.present && typeof description.value !== 'string') {
    throw new Error('ResourceInfo.description must be a string');
  }
  if (mimeType.present && typeof mimeType.value !== 'string') {
    throw new Error('ResourceInfo.mimeType must be a string');
  }
  if (serviceName.present) validateResourceServiceName(serviceName.value);
  const copiedTags = tags.present ? readResourceTags(tags.value) : undefined;
  const validatedIconUrl = iconUrl.present ? validateResourceIconUrl(iconUrl.value) : undefined;
  if (url.length > 4096 ||
      (description.present && description.value.length > 4096) ||
      (mimeType.present && mimeType.value.length > 256)) {
    throw new Error('ResourceInfo field is too large');
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('ResourceInfo.url must be an absolute URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('ResourceInfo.url must use HTTP or HTTPS');
  }
  if (parsed.username || parsed.password) throw new Error('ResourceInfo.url must not contain credentials');
  if (mimeType.present && /[\r\n]/.test(mimeType.value)) throw new Error('ResourceInfo.mimeType is invalid');

  return {
    url,
    ...(description.present ? { description: description.value } : {}),
    ...(mimeType.present ? { mimeType: mimeType.value } : {}),
    ...(serviceName.present ? { serviceName: serviceName.value } : {}),
    ...(tags.present ? { tags: copiedTags } : {}),
    ...(iconUrl.present ? { iconUrl: validatedIconUrl } : {}),
  };
}

export function validateResource(resource) {
  snapshotValidatedResource(resource);
}

export function sameResource(left, right) {
  try {
    const leftSnapshot = snapshotValidatedResource(left);
    const rightSnapshot = snapshotValidatedResource(right);
    for (const key of ['description', 'mimeType', 'serviceName', 'tags', 'iconUrl']) {
      if (Object.hasOwn(leftSnapshot, key) !== Object.hasOwn(rightSnapshot, key)) return false;
    }
    if (leftSnapshot.url !== rightSnapshot.url ||
        leftSnapshot.description !== rightSnapshot.description ||
        leftSnapshot.mimeType !== rightSnapshot.mimeType ||
        leftSnapshot.serviceName !== rightSnapshot.serviceName ||
        leftSnapshot.iconUrl !== rightSnapshot.iconUrl) {
      return false;
    }
    if (!Object.hasOwn(leftSnapshot, 'tags')) return true;
    if (leftSnapshot.tags.length !== rightSnapshot.tags.length) return false;
    for (let index = 0; index < leftSnapshot.tags.length; index += 1) {
      if (leftSnapshot.tags[index] !== rightSnapshot.tags[index]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function validatePaymentRequired(paymentRequired) {
  validatePaymentRequiredOuter(paymentRequired);
  for (const requirement of paymentRequired.accepts) validateRequirement(requirement);
}

export function validatePaymentRequiredForOfferSelection(paymentRequired) {
  validatePaymentRequiredOuter(paymentRequired);
  for (const requirement of paymentRequired.accepts) validateBasePaymentRequirement(requirement);
}

function validatePaymentRequiredOuter(paymentRequired) {
  assertExactKeys(paymentRequired, PAYMENT_REQUIRED_FIELDS, {
    optional: ['error', 'extensions'],
    label: 'PaymentRequired',
  });
  validateEmptyExtensionsProperty(paymentRequired, 'PaymentRequired');
  if (paymentRequired.x402Version !== X402_VERSION) throw new Error('unsupported x402Version');
  validateResource(paymentRequired.resource);
  if (!Array.isArray(paymentRequired.accepts) || paymentRequired.accepts.length === 0) {
    throw new Error('PaymentRequired.accepts must contain at least one requirement');
  }
  const paymentError = readOptionalEnumerableDataProperty(paymentRequired, 'error', 'PaymentRequired');
  if (paymentError.present && paymentError.value !== undefined && typeof paymentError.value !== 'string') {
    throw new Error('PaymentRequired.error must be a string or undefined');
  }
}

export function validatePaymentPayloadEnvelope(paymentPayload) {
  assertExactKeys(paymentPayload, PAYMENT_PAYLOAD_FIELDS, {
    optional: ['extensions'],
    label: 'PaymentPayload',
  });
  validateEmptyExtensionsProperty(paymentPayload, 'PaymentPayload', {
    allowUndefinedAsAbsent: true,
  });
  if (paymentPayload.x402Version !== X402_VERSION) throw new Error('unsupported x402Version');
  validateResource(paymentPayload.resource);
  validateRequirement(paymentPayload.accepted);
  assertExactKeys(paymentPayload.payload, INNER_PAYMENT_PAYLOAD_FIELDS, { label: 'PaymentPayload.payload' });
  assertPlainObject(paymentPayload.payload.transaction, 'PaymentPayload.payload.transaction');
  if (typeof paymentPayload.payload.intentDigest !== 'string' || !LOWERCASE_HASH.test(paymentPayload.payload.intentDigest)) {
    throw new Error('PaymentPayload.payload.intentDigest must be a lowercase 32-byte hexadecimal digest');
  }
}

export function makePaymentRequired({
  resourceUrl,
  description,
  mimeType,
  serviceName,
  tags,
  iconUrl,
  requirement,
  error,
}) {
  const copiedTags = tags === undefined ? undefined : readResourceTags(tags);
  const result = {
    x402Version: X402_VERSION,
    ...(error ? { error } : {}),
    resource: {
      url: resourceUrl,
      ...(description !== undefined ? { description } : {}),
      ...(mimeType !== undefined ? { mimeType } : {}),
      ...(serviceName !== undefined ? { serviceName } : {}),
      ...(tags !== undefined ? { tags: copiedTags } : {}),
      ...(iconUrl !== undefined ? { iconUrl } : {}),
    },
    accepts: [requirement],
  };
  validatePaymentRequired(result);
  return result;
}
