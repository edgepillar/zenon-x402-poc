import { Buffer } from 'node:buffer';
import { TextDecoder, TextEncoder } from 'node:util';

import { canonicalJson, paymentIntentDigest, sha256Hex } from './canonical.js';
import {
  validateActiveUpfrontRequirement,
  validatePaymentRequired,
  validateResource,
} from './x402-wire.js';

const ERROR_MESSAGE = 'operator_trusted_observation_invalid';
const INPUT_MAX_BYTES = 64 * 1024;
const MAX_DEPTH = 32;
const MAX_NODES = 8192;
const MAX_MEMBERS = 4096;
const MAX_STRINGS = 4096;
const MAX_STRING_BYTES = 16 * 1024;
const HASH_HEX = /^[0-9a-f]{64}$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const CANONICAL_POSITIVE_DECIMAL = /^[1-9]\d*$/;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const UTF8_ENCODER = new TextEncoder();
const BUFFER_ALLOC_UNSAFE = Buffer.allocUnsafe.bind(Buffer);
const BUFFER_BYTE_LENGTH = Buffer.byteLength.bind(Buffer);
const BUFFER_IS_BUFFER = Buffer.isBuffer.bind(Buffer);
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const TYPED_ARRAY_BYTE_LENGTH = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'byteLength',
).get;
const TYPED_ARRAY_SET = Uint8Array.prototype.set;
const TEXT_ENCODER_ENCODE_INTO = TextEncoder.prototype.encodeInto;

const TOP_LEVEL_FIELDS = Object.freeze([
  'recordVersion',
  'recordType',
  'evidenceV1Bundle',
  'issue',
  'publicationClassification',
  'retainedFragmentProjections',
  'nonClaims',
]);
const PROJECTION_FIELDS = Object.freeze(['manifest', 'chain', 'http', 'journal', 'timing']);
const RESOURCE_FIELDS = Object.freeze(['url', 'description', 'mimeType']);
const REQUIREMENT_FIELDS = Object.freeze([
  'scheme', 'network', 'asset', 'amount', 'payTo', 'maxTimeoutSeconds', 'extra',
]);
const CHAIN_PROFILE_FIELDS = Object.freeze([
  'version', 'chainIdentifier', 'genesisMomentumHash',
]);
const PARTIAL_ACCOUNT_BLOCK_FIELDS = Object.freeze([
  'version',
  'chainIdentifier',
  'blockType',
  'hash',
  'height',
  'momentumAcknowledged',
  'address',
  'toAddress',
  'amount',
  'tokenStandard',
  'data',
  'fusedPlasma',
  'difficulty',
]);
const NON_CLAIM_FIELDS = Object.freeze([
  'authenticatedChainIdentity',
  'canonicalRemoteChainIdentity',
  'verifiedFrontierLineage',
  'irreversibleFinality',
  'facilitatorAuthorship',
  'facilitatorPublicationProven',
  'chainObservationIndependentlyAttested',
  'httpExchangeIndependentlyAttested',
  'buyerReceiptCryptographicallyProven',
  'recipientReceiveObserved',
  'recipientSpendabilityEstablished',
  'initial402BodyOrHeaderCaptured',
  'cleanShutdown',
  'release',
  'activation',
  'productionReadiness',
]);
const EVENT_PHASES = Object.freeze({
  runner: Object.freeze([
    'challenge_request_started',
    'challenge_402_received',
    'paid_response_received',
  ]),
  buyer: Object.freeze([
    'buyer_owner_wait_started',
    'buyer_owner_acquired',
    'buyer_readiness_started',
    'buyer_readiness_finished',
    'prepare_block_started',
    'prepare_block_finished',
    'buyer_owner_released',
  ]),
  facilitator: Object.freeze([
    'facilitator_owner_wait_started',
    'facilitator_owner_acquired',
    'facilitator_readiness_started',
    'facilitator_readiness_finished',
    'publication_started',
    'publication_acknowledged',
    'inclusion_wait_started',
    'momentum_inclusion_observed',
    'facilitator_owner_released',
    'delivery_started',
    'delivery_finished',
  ]),
});
const CLOCK_DOMAINS = Object.freeze({
  runner: 'runner-monotonic-v1',
  buyer: 'buyer-monotonic-v1',
  facilitator: 'facilitator-monotonic-v1',
});
const DURATION_BINDINGS = Object.freeze({
  challenge: Object.freeze(['runner', 'challenge_request_started', 'challenge_402_received']),
  total: Object.freeze(['runner', 'challenge_402_received', 'paid_response_received']),
  buyerOwnerWait: Object.freeze(['buyer', 'buyer_owner_wait_started', 'buyer_owner_acquired']),
  buyerOwnerHeld: Object.freeze(['buyer', 'buyer_owner_acquired', 'buyer_owner_released']),
  buyerReadiness: Object.freeze(['buyer', 'buyer_readiness_started', 'buyer_readiness_finished']),
  prepareBlock: Object.freeze(['buyer', 'prepare_block_started', 'prepare_block_finished']),
  facilitatorOwnerWait: Object.freeze([
    'facilitator', 'facilitator_owner_wait_started', 'facilitator_owner_acquired',
  ]),
  facilitatorOwnerHeld: Object.freeze([
    'facilitator', 'facilitator_owner_acquired', 'facilitator_owner_released',
  ]),
  facilitatorReadiness: Object.freeze([
    'facilitator', 'facilitator_readiness_started', 'facilitator_readiness_finished',
  ]),
  publication: Object.freeze(['facilitator', 'publication_started', 'publication_acknowledged']),
  inclusionWait: Object.freeze([
    'facilitator', 'inclusion_wait_started', 'momentum_inclusion_observed',
  ]),
  delivery: Object.freeze(['facilitator', 'delivery_started', 'delivery_finished']),
});
const CROSS_ROLE_ORDERS = Object.freeze([
  Object.freeze(['runner:challenge_402_received', 'buyer:buyer_owner_wait_started']),
  Object.freeze(['buyer:buyer_owner_released', 'facilitator:facilitator_owner_wait_started']),
  Object.freeze(['facilitator:facilitator_owner_released', 'facilitator:delivery_started']),
  Object.freeze(['facilitator:delivery_finished', 'runner:paid_response_received']),
]);

const PARSE_FAILURE = Object.freeze({});

export class OperatorTrustedObservationError extends Error {
  constructor() {
    super(ERROR_MESSAGE);
    Object.defineProperty(this, 'name', {
      configurable: false,
      enumerable: false,
      value: 'OperatorTrustedObservationError',
      writable: false,
    });
    Object.defineProperty(this, 'code', {
      configurable: false,
      enumerable: true,
      value: ERROR_MESSAGE,
      writable: false,
    });
    Object.defineProperty(this, 'stack', {
      configurable: false,
      enumerable: false,
      value: undefined,
      writable: false,
    });
  }
}

function rejectParse() {
  throw PARSE_FAILURE;
}

function encodeUtf8Bounded(input) {
  const encodedLength = BUFFER_BYTE_LENGTH(input, 'utf8');
  if (encodedLength < 1 || encodedLength > INPUT_MAX_BYTES) rejectParse();
  const bytes = BUFFER_ALLOC_UNSAFE(encodedLength);
  const result = Reflect.apply(TEXT_ENCODER_ENCODE_INTO, UTF8_ENCODER, [input, bytes]);
  if (result.read !== input.length ||
      result.written !== encodedLength ||
      bytes.length !== encodedLength) rejectParse();
  return bytes;
}

function decodeInput(input) {
  let bytes;
  let text;
  if (typeof input === 'string') {
    if (input.length < 1 || input.length > INPUT_MAX_BYTES) rejectParse();
    bytes = encodeUtf8Bounded(input);
    text = UTF8_DECODER.decode(bytes);
    if (text !== input) rejectParse();
  } else if (BUFFER_IS_BUFFER(input) || input instanceof Uint8Array) {
    const intrinsicLength = Reflect.apply(TYPED_ARRAY_BYTE_LENGTH, input, []);
    if (!Number.isSafeInteger(intrinsicLength) ||
        intrinsicLength < 1 ||
        intrinsicLength > INPUT_MAX_BYTES) rejectParse();
    bytes = BUFFER_ALLOC_UNSAFE(intrinsicLength);
    Reflect.apply(TYPED_ARRAY_SET, bytes, [input]);
    if (bytes.length !== intrinsicLength || bytes.length > INPUT_MAX_BYTES) rejectParse();
    text = UTF8_DECODER.decode(bytes);
    if (!encodeUtf8Bounded(text).equals(bytes)) rejectParse();
  } else {
    rejectParse();
  }
  if (text.length === 0 || text.charCodeAt(0) === 0xfeff) rejectParse();
  return text;
}

class StrictJsonParser {
  constructor(text) {
    this.text = text;
    this.offset = 0;
    this.nodes = 0;
    this.members = 0;
    this.strings = 0;
  }

  parse() {
    this.skipWhitespace();
    const value = this.parseValue(1);
    this.skipWhitespace();
    if (this.offset !== this.text.length) rejectParse();
    return value;
  }

  skipWhitespace() {
    while (this.offset < this.text.length) {
      const code = this.text.charCodeAt(this.offset);
      if (code !== 0x09 && code !== 0x0a && code !== 0x0d && code !== 0x20) return;
      this.offset += 1;
    }
  }

  parseValue(depth) {
    if (depth > MAX_DEPTH) rejectParse();
    this.nodes += 1;
    if (this.nodes > MAX_NODES) rejectParse();
    const code = this.text.charCodeAt(this.offset);
    if (code === 0x7b) return this.parseObject(depth);
    if (code === 0x5b) return this.parseArray(depth);
    if (code === 0x22) return this.parseString();
    if (code >= 0x30 && code <= 0x39) return this.parseInteger();
    if (this.text.startsWith('true', this.offset)) {
      this.offset += 4;
      return true;
    }
    if (this.text.startsWith('false', this.offset)) {
      this.offset += 5;
      return false;
    }
    if (this.text.startsWith('null', this.offset)) {
      this.offset += 4;
      return null;
    }
    rejectParse();
  }

  parseObject(depth) {
    this.offset += 1;
    this.skipWhitespace();
    const output = Object.create(null);
    const keys = new Set();
    if (this.text.charCodeAt(this.offset) === 0x7d) {
      this.offset += 1;
      return output;
    }
    while (this.offset < this.text.length) {
      if (this.text.charCodeAt(this.offset) !== 0x22) rejectParse();
      const key = this.parseString();
      if (keys.has(key)) rejectParse();
      keys.add(key);
      this.members += 1;
      if (this.members > MAX_MEMBERS) rejectParse();
      this.skipWhitespace();
      if (this.text.charCodeAt(this.offset) !== 0x3a) rejectParse();
      this.offset += 1;
      this.skipWhitespace();
      const value = this.parseValue(depth + 1);
      Object.defineProperty(output, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
      this.skipWhitespace();
      const delimiter = this.text.charCodeAt(this.offset);
      if (delimiter === 0x7d) {
        this.offset += 1;
        return output;
      }
      if (delimiter !== 0x2c) rejectParse();
      this.offset += 1;
      this.skipWhitespace();
    }
    rejectParse();
  }

  parseArray(depth) {
    this.offset += 1;
    this.skipWhitespace();
    const output = [];
    if (this.text.charCodeAt(this.offset) === 0x5d) {
      this.offset += 1;
      return output;
    }
    while (this.offset < this.text.length) {
      output.push(this.parseValue(depth + 1));
      this.skipWhitespace();
      const delimiter = this.text.charCodeAt(this.offset);
      if (delimiter === 0x5d) {
        this.offset += 1;
        return output;
      }
      if (delimiter !== 0x2c) rejectParse();
      this.offset += 1;
      this.skipWhitespace();
    }
    rejectParse();
  }

  parseString() {
    this.offset += 1;
    let output = '';
    while (this.offset < this.text.length) {
      const code = this.text.charCodeAt(this.offset);
      if (code === 0x22) {
        this.offset += 1;
        this.strings += 1;
        if (this.strings > MAX_STRINGS || Buffer.byteLength(output, 'utf8') > MAX_STRING_BYTES) {
          rejectParse();
        }
        return output;
      }
      if (code === 0x5c) {
        output += this.parseEscape();
        continue;
      }
      if (code < 0x20) rejectParse();
      if (code >= 0xd800 && code <= 0xdbff) {
        const low = this.text.charCodeAt(this.offset + 1);
        if (low < 0xdc00 || low > 0xdfff) rejectParse();
        output += this.text[this.offset] + this.text[this.offset + 1];
        this.offset += 2;
        continue;
      }
      if (code >= 0xdc00 && code <= 0xdfff) rejectParse();
      output += this.text[this.offset];
      this.offset += 1;
    }
    rejectParse();
  }

  parseEscape() {
    this.offset += 1;
    const escape = this.text[this.offset];
    const simple = {
      '"': '"',
      '\\': '\\',
      '/': '/',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
    };
    if (Object.hasOwn(simple, escape)) {
      this.offset += 1;
      return simple[escape];
    }
    if (escape !== 'u') rejectParse();
    const first = this.parseHexEscape();
    if (first >= 0xdc00 && first <= 0xdfff) rejectParse();
    if (first < 0xd800 || first > 0xdbff) return String.fromCharCode(first);
    if (this.text[this.offset] !== '\\' || this.text[this.offset + 1] !== 'u') rejectParse();
    this.offset += 1;
    const second = this.parseHexEscape();
    if (second < 0xdc00 || second > 0xdfff) rejectParse();
    return String.fromCharCode(first, second);
  }

  parseHexEscape() {
    if (this.text[this.offset] !== 'u') rejectParse();
    const hex = this.text.slice(this.offset + 1, this.offset + 5);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) rejectParse();
    this.offset += 5;
    return Number.parseInt(hex, 16);
  }

  parseInteger() {
    const start = this.offset;
    if (this.text[this.offset] === '0') {
      this.offset += 1;
      if (/\d/.test(this.text[this.offset] ?? '')) rejectParse();
    } else {
      while (/\d/.test(this.text[this.offset] ?? '')) this.offset += 1;
    }
    const token = this.text.slice(start, this.offset);
    if (!/^(?:0|[1-9]\d*)$/.test(token)) rejectParse();
    const value = Number(token);
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) rejectParse();
    return value;
  }
}

function parseDocument(input) {
  return new StrictJsonParser(decodeInput(input)).parse();
}

function exactObject(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) rejectParse();
  const keys = Object.keys(value);
  if (keys.length !== fields.length) rejectParse();
  for (const key of keys) if (!fields.includes(key)) rejectParse();
  for (const field of fields) if (!Object.hasOwn(value, field)) rejectParse();
  return value;
}

function exactArray(value, length) {
  if (!Array.isArray(value) || value.length !== length) rejectParse();
  return value;
}

function safeInteger(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < minimum) rejectParse();
  return value;
}

function boundedString(value, maximumBytes, { allowControls = false } = {}) {
  if (typeof value !== 'string' || value.length === 0 ||
      Buffer.byteLength(value, 'utf8') > maximumBytes ||
      (!allowControls && CONTROL_CHARACTERS.test(value))) rejectParse();
  return value;
}

function hashValue(value) {
  if (typeof value !== 'string' || !HASH_HEX.test(value)) rejectParse();
  return value;
}

function timestampValue(value) {
  if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) rejectParse();
  const numeric = Date.parse(value);
  if (!Number.isFinite(numeric) || new Date(numeric).toISOString() !== value) rejectParse();
  return numeric;
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function validateChainProfile(profile) {
  exactObject(profile, CHAIN_PROFILE_FIELDS);
  if (profile.version !== 1 || typeof profile.chainIdentifier !== 'string' ||
      !CANONICAL_POSITIVE_DECIMAL.test(profile.chainIdentifier) ||
      BigInt(profile.chainIdentifier) > BigInt(Number.MAX_SAFE_INTEGER)) rejectParse();
  hashValue(profile.genesisMomentumHash);
}

function validateResourceProjection(resource) {
  exactObject(resource, RESOURCE_FIELDS);
  boundedString(resource.url, 4096);
  boundedString(resource.description, 4096);
  boundedString(resource.mimeType, 256);
  validateResource(resource);
}

function validateRequirementProjection(requirement) {
  exactObject(requirement, REQUIREMENT_FIELDS);
  for (const field of ['scheme', 'network', 'asset', 'amount', 'payTo']) {
    boundedString(requirement[field], 128);
  }
  safeInteger(requirement.maxTimeoutSeconds, 1);
  exactObject(requirement.extra, ['paymentFlow', 'poc', 'settlement', 'zenonChain']);
  if (requirement.extra.paymentFlow !== 'upfront' || requirement.extra.poc !== true ||
      requirement.extra.settlement !== 'account-block') rejectParse();
  validateChainProfile(requirement.extra.zenonChain);
  validateActiveUpfrontRequirement(requirement);
}

function validatePaymentProjection(payment) {
  exactObject(payment, ['paymentRequired', 'selectedIndex', 'intentDigest']);
  const required = payment.paymentRequired;
  exactObject(required, ['accepts', 'resource', 'x402Version']);
  if (required.x402Version !== 2) rejectParse();
  validateResourceProjection(required.resource);
  exactArray(required.accepts, 1);
  validateRequirementProjection(required.accepts[0]);
  validatePaymentRequired(required);
  if (payment.selectedIndex !== 0) rejectParse();
  hashValue(payment.intentDigest);
}

function validatePartialAccountBlock(block) {
  exactObject(block, PARTIAL_ACCOUNT_BLOCK_FIELDS);
  if (block.version !== 1 || block.blockType !== 2) rejectParse();
  for (const field of ['chainIdentifier', 'height', 'fusedPlasma', 'difficulty']) {
    safeInteger(block[field], field === 'height' || field === 'chainIdentifier' ? 1 : 0);
  }
  hashValue(block.hash);
  exactObject(block.momentumAcknowledged, ['height']);
  safeInteger(block.momentumAcknowledged.height, 1);
  for (const field of ['address', 'toAddress', 'amount', 'tokenStandard']) {
    boundedString(block[field], 128);
  }
  boundedString(block.data, 128);
  const decoded = Buffer.from(block.data, 'base64');
  if (decoded.length !== 32 || decoded.toString('base64') !== block.data) rejectParse();
}

function validateConfirmation(confirmation) {
  exactObject(confirmation, [
    'observedAt', 'numConfirmations', 'momentumHeight', 'momentumTimestamp',
  ]);
  timestampValue(confirmation.observedAt);
  safeInteger(confirmation.numConfirmations, 1);
  safeInteger(confirmation.momentumHeight, 1);
  safeInteger(confirmation.momentumTimestamp);
}

function validateChainProjection(chainProjection) {
  exactObject(chainProjection, ['accountBlock', 'confirmation']);
  validatePartialAccountBlock(chainProjection.accountBlock);
  validateConfirmation(chainProjection.confirmation);
}

function validateBody(body) {
  exactObject(body, ['ok', 'message', 'network', 'payer', 'transaction', 'generatedAt']);
  if (body.ok !== true || body.message !== 'paid resource unlocked') rejectParse();
  boundedString(body.network, 128);
  boundedString(body.payer, 128);
  hashValue(body.transaction);
  timestampValue(body.generatedAt);
}

function validateHttpProjection(http) {
  exactObject(http, ['initial', 'final']);
  exactObject(http.initial, ['status', 'observedAt']);
  if (http.initial.status !== 402) rejectParse();
  timestampValue(http.initial.observedAt);
  exactObject(http.final, [
    'status', 'observedAt', 'paymentResponse', 'contentType', 'cacheControl', 'vary', 'bodyText',
  ]);
  if (http.final.status !== 200 ||
      http.final.contentType !== 'application/json; charset=utf-8' ||
      http.final.cacheControl !== 'private, no-store, max-age=0' ||
      http.final.vary !== 'PAYMENT-SIGNATURE') rejectParse();
  timestampValue(http.final.observedAt);
  exactObject(http.final.paymentResponse, ['success', 'network', 'transaction', 'payer', 'state']);
  if (http.final.paymentResponse.success !== true ||
      http.final.paymentResponse.state !== 'MOMENTUM_INCLUDED') rejectParse();
  boundedString(http.final.paymentResponse.network, 128);
  hashValue(http.final.paymentResponse.transaction);
  boundedString(http.final.paymentResponse.payer, 128);
  boundedString(http.final.bodyText, INPUT_MAX_BYTES, { allowControls: true });
}

function validateJournalProjection(journal) {
  exactObject(journal, [
    'sourceSchemaVersion', 'sourceRevision', 'activeRecordCount', 'tombstoneCount', 'record',
  ]);
  if (journal.sourceSchemaVersion !== 1 || journal.activeRecordCount !== 1 ||
      journal.tombstoneCount !== 0) rejectParse();
  safeInteger(journal.sourceRevision, 1);
  const record = journal.record;
  exactObject(record, [
    'transactionHash', 'chainProfile', 'intentDigest', 'resourceIdentity', 'resourceDigest',
    'payer', 'signedAccountBlock', 'evidenceState', 'momentumEvidence', 'deliveryState',
    'cachedResponse', 'createdAt', 'updatedAt',
  ]);
  hashValue(record.transactionHash);
  validateChainProfile(record.chainProfile);
  hashValue(record.intentDigest);
  validateResourceProjection(record.resourceIdentity);
  hashValue(record.resourceDigest);
  boundedString(record.payer, 128);
  validatePartialAccountBlock(record.signedAccountBlock);
  if (record.evidenceState !== 'MOMENTUM_INCLUDED' || record.deliveryState !== 'DELIVERED') {
    rejectParse();
  }
  exactObject(record.momentumEvidence, ['observedAt', 'confirmationDetail']);
  timestampValue(record.momentumEvidence.observedAt);
  const detail = record.momentumEvidence.confirmationDetail;
  exactObject(detail, ['numConfirmations', 'momentumHeight', 'momentumTimestamp']);
  safeInteger(detail.numConfirmations, 1);
  safeInteger(detail.momentumHeight, 1);
  safeInteger(detail.momentumTimestamp);
  exactObject(record.cachedResponse, ['status', 'headers', 'body']);
  if (record.cachedResponse.status !== 200) rejectParse();
  exactObject(record.cachedResponse.headers, ['content-type']);
  if (record.cachedResponse.headers['content-type'] !== 'application/json; charset=utf-8') {
    rejectParse();
  }
  validateBody(record.cachedResponse.body);
  timestampValue(record.createdAt);
  timestampValue(record.updatedAt);
}

function validateEvent(event) {
  exactObject(event, ['sequence', 'phase', 'role', 'clockDomain', 'utc', 'monotonicMs']);
  safeInteger(event.sequence);
  if (typeof event.role !== 'string' || !Object.hasOwn(EVENT_PHASES, event.role) ||
      typeof event.phase !== 'string' || !EVENT_PHASES[event.role].includes(event.phase) ||
      event.clockDomain !== CLOCK_DOMAINS[event.role]) rejectParse();
  timestampValue(event.utc);
  safeInteger(event.monotonicMs);
}

function validateTimingProjection(timing) {
  exactObject(timing, ['events', 'durationsMs']);
  exactArray(timing.events, 21);
  for (const event of timing.events) validateEvent(event);
  exactObject(timing.durationsMs, Object.keys(DURATION_BINDINGS));
  for (const value of Object.values(timing.durationsMs)) safeInteger(value);
}

function validateNonClaims(nonClaims) {
  exactObject(nonClaims, NON_CLAIM_FIELDS);
  for (const field of NON_CLAIM_FIELDS) if (nonClaims[field] !== false) rejectParse();
}

function validateFragment(projection, fragmentType, contentName, validateContent) {
  exactObject(projection, ['fragmentVersion', 'fragmentType', contentName]);
  if (projection.fragmentVersion !== 1 || projection.fragmentType !== fragmentType) rejectParse();
  validateContent(projection[contentName]);
}

function validateTimingSemantics(timing) {
  const expectedPairs = new Set();
  for (const [role, phases] of Object.entries(EVENT_PHASES)) {
    for (const phase of phases) expectedPairs.add(`${role}:${phase}`);
  }
  const events = new Map();
  const roleCursor = { runner: -1, buyer: -1, facilitator: -1 };
  const roleMonotonic = { runner: -1, buyer: -1, facilitator: -1 };
  let priorUtc = -1;
  for (let index = 0; index < timing.events.length; index += 1) {
    const event = timing.events[index];
    const pair = `${event.role}:${event.phase}`;
    const phaseIndex = EVENT_PHASES[event.role].indexOf(event.phase);
    const utc = timestampValue(event.utc);
    if (event.sequence !== index || !expectedPairs.has(pair) || events.has(pair) ||
        phaseIndex <= roleCursor[event.role] ||
        event.monotonicMs < roleMonotonic[event.role] || utc < priorUtc) rejectParse();
    roleCursor[event.role] = phaseIndex;
    roleMonotonic[event.role] = event.monotonicMs;
    priorUtc = utc;
    events.set(pair, event);
  }
  if (events.size !== expectedPairs.size) rejectParse();
  for (const [name, [role, startPhase, endPhase]] of Object.entries(DURATION_BINDINGS)) {
    const start = events.get(`${role}:${startPhase}`);
    const end = events.get(`${role}:${endPhase}`);
    if (!start || !end || start.clockDomain !== end.clockDomain ||
        end.monotonicMs < start.monotonicMs ||
        timing.durationsMs[name] !== end.monotonicMs - start.monotonicMs) rejectParse();
  }
  for (const [before, after] of CROSS_ROLE_ORDERS) {
    if (events.get(before).sequence >= events.get(after).sequence) rejectParse();
  }
  return events;
}

function validateRelationships(record) {
  const retained = record.retainedFragmentProjections;
  const payment = retained.manifest.payment;
  const paymentRequired = payment.paymentRequired;
  const selected = paymentRequired.accepts[payment.selectedIndex];
  const chain = retained.chain.chain;
  const block = chain.accountBlock;
  const http = retained.http.http;
  const journal = retained.journal.journal;
  const journalRecord = journal.record;
  const journalBlock = journalRecord.signedAccountBlock;
  const body = journalRecord.cachedResponse.body;
  const parsedBody = parseDocument(http.final.bodyText);

  validateBody(parsedBody);
  if (payment.intentDigest !== paymentIntentDigest(paymentRequired, selected) ||
      journalRecord.intentDigest !== payment.intentDigest) rejectParse();
  const intentBytes = Buffer.from(payment.intentDigest, 'hex');
  for (const encoded of [block.data, journalBlock.data]) {
    const decoded = Buffer.from(encoded, 'base64');
    if (!decoded.equals(intentBytes)) rejectParse();
  }
  if (!sameJson(paymentRequired.resource, journalRecord.resourceIdentity) ||
      journalRecord.resourceDigest !== sha256Hex(journalRecord.resourceIdentity)) rejectParse();

  if (!sameJson(block, journalBlock) || block.amount !== selected.amount ||
      block.tokenStandard !== selected.asset || block.toAddress !== selected.payTo ||
      block.address !== journalRecord.payer ||
      !sameJson(selected.extra.zenonChain, journalRecord.chainProfile) ||
      block.version !== journalRecord.chainProfile.version ||
      String(block.chainIdentifier) !== journalRecord.chainProfile.chainIdentifier) rejectParse();

  const transaction = block.hash;
  if (journalRecord.transactionHash !== transaction || journalBlock.hash !== transaction ||
      http.final.paymentResponse.transaction !== transaction || body.transaction !== transaction ||
      parsedBody.transaction !== transaction) rejectParse();
  if (http.final.paymentResponse.network !== selected.network || body.network !== selected.network ||
      parsedBody.network !== selected.network || http.final.paymentResponse.payer !== journalRecord.payer ||
      body.payer !== journalRecord.payer || parsedBody.payer !== journalRecord.payer) rejectParse();

  const confirmation = chain.confirmation;
  const detail = journalRecord.momentumEvidence.confirmationDetail;
  if (confirmation.numConfirmations !== detail.numConfirmations ||
      confirmation.momentumHeight !== detail.momentumHeight ||
      confirmation.momentumTimestamp !== detail.momentumTimestamp ||
      confirmation.momentumHeight <= block.momentumAcknowledged.height) rejectParse();

  if (http.final.status !== journalRecord.cachedResponse.status ||
      http.final.contentType !== journalRecord.cachedResponse.headers['content-type'] ||
      !sameJson(parsedBody, body)) rejectParse();

  const createdAt = timestampValue(journalRecord.createdAt);
  const updatedAt = timestampValue(journalRecord.updatedAt);
  if (updatedAt < createdAt) rejectParse();
  const events = validateTimingSemantics(retained.timing.timing);
  const challengeStarted = events.get('runner:challenge_request_started');
  const challengeReceived = events.get('runner:challenge_402_received');
  const paidResponse = events.get('runner:paid_response_received');
  const publicationStarted = events.get('facilitator:publication_started');
  const inclusionObserved = events.get('facilitator:momentum_inclusion_observed');
  const deliveryStarted = events.get('facilitator:delivery_started');
  const deliveryFinished = events.get('facilitator:delivery_finished');
  const generatedAt = timestampValue(body.generatedAt);
  if (challengeReceived.utc !== http.initial.observedAt ||
      paidResponse.utc !== http.final.observedAt ||
      inclusionObserved.utc !== confirmation.observedAt ||
      inclusionObserved.utc !== journalRecord.momentumEvidence.observedAt ||
      timestampValue(challengeStarted.utc) > timestampValue(challengeReceived.utc) ||
      createdAt > timestampValue(publicationStarted.utc) ||
      timestampValue(publicationStarted.utc) > timestampValue(inclusionObserved.utc) ||
      timestampValue(inclusionObserved.utc) > updatedAt ||
      timestampValue(deliveryStarted.utc) > generatedAt ||
      generatedAt > updatedAt ||
      updatedAt > timestampValue(deliveryFinished.utc) ||
      timestampValue(deliveryFinished.utc) > timestampValue(paidResponse.utc)) rejectParse();
}

function validateRecord(record) {
  exactObject(record, TOP_LEVEL_FIELDS);
  if (record.recordVersion !== 1 ||
      record.recordType !== 'operator-trusted-same-route-live-observation' ||
      record.evidenceV1Bundle !== false) rejectParse();
  boundedString(record.issue, 256);
  exactObject(record.publicationClassification, [
    'trustModel', 'routeRelationship', 'independentOperatorVerification',
  ]);
  if (record.publicationClassification.trustModel !== 'operator-trusted' ||
      record.publicationClassification.routeRelationship !== 'same-route' ||
      record.publicationClassification.independentOperatorVerification !== false) rejectParse();
  exactObject(record.retainedFragmentProjections, PROJECTION_FIELDS);
  validateFragment(
    record.retainedFragmentProjections.manifest,
    'manifest',
    'payment',
    validatePaymentProjection,
  );
  validateFragment(record.retainedFragmentProjections.chain, 'chain', 'chain', validateChainProjection);
  validateFragment(record.retainedFragmentProjections.http, 'http', 'http', validateHttpProjection);
  validateFragment(
    record.retainedFragmentProjections.journal,
    'journal',
    'journal',
    validateJournalProjection,
  );
  validateFragment(
    record.retainedFragmentProjections.timing,
    'timing',
    'timing',
    validateTimingProjection,
  );
  validateNonClaims(record.nonClaims);
  validateRelationships(record);
}

/**
 * Verify only internal relationships retained in an operator-trusted observation.
 * A true result is self-consistency, not provenance, authenticity, chain validity,
 * transaction existence, finality, receipt, or any evidence-v1 conclusion.
 */
export function verifyOperatorTrustedObservation(input) {
  try {
    const record = parseDocument(input);
    validateRecord(record);
    return true;
  } catch {
    throw new OperatorTrustedObservationError();
  }
}
