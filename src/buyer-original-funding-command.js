import { Buffer } from 'node:buffer';
import { captureApiCreditRecordedServiceResult } from './api-credit-recorded-service-result.js';
import { types as utilTypes } from 'node:util';
import { canonicalJson } from './canonical.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, KEYS = Reflect.ownKeys;
const PROTO = Object.getPrototypeOf, OWN = Object.hasOwn, PROXY = utilTypes.isProxy;
const OPERATIONS = F(['prepare', 'commit', 'submitFunding', 'handoff', 'submitService', 'inspect', 'close']);
const RECOVERY_OPERATIONS = F(['restoreOriginal', 'readRecoveryState', 'submitService', 'inspect', 'close']);
const BACKEND_RECOVERY_OPERATIONS = F([...RECOVERY_OPERATIONS, 'reconcileOriginal']);
const DEFAULTS = F({ maxCommands: 16, maxLineBytes: 262144, maxInputBytes: 1048576,
  maxOutputBytes: 1048576, closeWaitMs: 250 });

/** An explicit, bounded machine command protocol. No wallet/store acquisition. */
export function captureBuyerOriginalFundingCommandLimits(input = {}) {
  if (arguments.length > 1) fail('limits_rejected');
  return captureLimits(input, 16, 64);
}

/** Explicit API-credit selection: enough commands for funding, 100 distinct
 * requests and exact replay. All byte and close budgets remain unchanged. */
export function captureBuyerApiCreditCommandLimits(input = {}) {
  if (arguments.length > 1) fail('limits_rejected');
  return captureLimits(input, 128, 128);
}

function captureLimits(input, defaultCommands, maximumCommands) {
  const selected = fields(input, Object.keys(DEFAULTS), false), out = {};
  for (const name of Object.keys(DEFAULTS)) out[name] = OWN(selected, name) ? selected[name] : DEFAULTS[name];
  if (!OWN(selected, 'maxCommands')) out.maxCommands = defaultCommands;
  for (const name of Object.keys(out)) if (!Number.isSafeInteger(out[name])) fail('limits_rejected');
  if (out.maxCommands < 1 || out.maxCommands > maximumCommands || out.closeWaitMs < 1 || out.closeWaitMs > 1000
      || out.maxLineBytes < 256 || out.maxLineBytes > 262144
      || out.maxInputBytes < out.maxLineBytes || out.maxInputBytes > 2097152
      || out.maxOutputBytes < out.maxLineBytes || out.maxOutputBytes > 2097152) fail('limits_rejected');
  return F(out);
}

export function encodeBuyerOriginalFundingCommand(input, maximumBytes = DEFAULTS.maxLineBytes) {
  const command = captureCommand(input, maximumBytes);
  return wire(command, maximumBytes) + '\n';
}

export function decodeBuyerOriginalFundingCommand(line, maximumBytes = DEFAULTS.maxLineBytes) {
  return decode(line, maximumBytes, OPERATIONS);
}

/** Separate closed protocol: no preparation, funding commit or funding send. */
export function encodeBuyerOriginalRecoveryCommand(input, maximumBytes = DEFAULTS.maxLineBytes) {
  return wire(captureCommand(input, maximumBytes, RECOVERY_OPERATIONS), maximumBytes) + '\n';
}

export function decodeBuyerOriginalRecoveryCommand(line, maximumBytes = DEFAULTS.maxLineBytes) {
  return decode(line, maximumBytes, RECOVERY_OPERATIONS);
}

export function encodeBuyerOriginalBackendRecoveryCommand(input, maximumBytes = DEFAULTS.maxLineBytes) {
  return wire(captureCommand(input, maximumBytes, BACKEND_RECOVERY_OPERATIONS), maximumBytes) + '\n';
}

export function decodeBuyerOriginalBackendRecoveryCommand(line, maximumBytes = DEFAULTS.maxLineBytes) {
  return decode(line, maximumBytes, BACKEND_RECOVERY_OPERATIONS);
}

function decode(line, maximumBytes, operations) {
  boundedString(line, maximumBytes);
  let parsed;
  try { parsed = JSON.parse(line); } catch { fail('input_rejected'); }
  const command = captureCommand(parsed, maximumBytes, operations);
  // Also refuses duplicate keys, alternate number spellings and ambiguous wire
  // forms. The encoder supplies the required canonical JSON object plus LF.
  if (canonicalJson(command) !== line) fail('noncanonical_input');
  return command;
}

/** Output is local callback DATA, never a delivery or settlement receipt. */
export function encodeBuyerOriginalFundingCommandResult(command, result, maximumBytes = DEFAULTS.maxLineBytes) {
  const selected = captureCommand(command, maximumBytes);
  return wire({ version: 1, id: selected.id, operation: selected.operation,
    outcome: 'CALLBACK_RETURNED', result: project(selected.operation, result) }, maximumBytes) + '\n';
}

/** Product-only result projection; ordinary funding/recovery stays void-only. */
export function encodeBuyerApiCreditCommandResult(command, result, maximumBytes = DEFAULTS.maxLineBytes) {
  const selected = captureCommand(command, maximumBytes);
  const output = selected.operation === 'submitService' && result !== undefined
    ? captureApiCreditRecordedServiceResult(result) : project(selected.operation, result);
  if (selected.operation === 'submitService' && result !== undefined
      && (output.grantId !== data(selected.input, 'grantId') || output.requestId !== data(selected.input, 'requestId'))) fail('result_rejected');
  return wire({ version: 1, id: selected.id, operation: selected.operation,
    outcome: 'CALLBACK_RETURNED', result: output }, maximumBytes) + '\n';
}

export function encodeBuyerOriginalRecoveryCommandResult(command, result, maximumBytes = DEFAULTS.maxLineBytes) {
  const selected = captureCommand(command, maximumBytes, RECOVERY_OPERATIONS);
  return wire({ version: 1, id: selected.id, operation: selected.operation,
    outcome: 'CALLBACK_RETURNED', result: project(selected.operation, result) }, maximumBytes) + '\n';
}

export function encodeBuyerOriginalBackendRecoveryCommandResult(command, result, maximumBytes = DEFAULTS.maxLineBytes) {
  const selected = captureCommand(command, maximumBytes, BACKEND_RECOVERY_OPERATIONS);
  return wire({ version: 1, id: selected.id, operation: selected.operation,
    outcome: 'CALLBACK_RETURNED', result: project(selected.operation, result) }, maximumBytes) + '\n';
}

function captureCommand(input, maximumBytes, operations = OPERATIONS) {
  byteLimit(maximumBytes);
  const c = fields(input, ['version', 'id', 'operation', 'input']);
  if (c.version !== 1 || typeof c.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(c.id)
      || !operations.includes(c.operation)) fail('input_rejected');
  const value = snapshot(c.input, maximumBytes);
  fields(value, [], false, true);
  if (c.operation === 'commit' || c.operation === 'submitFunding') fields(value, ['expectedPins']);
  if (c.operation === 'handoff') fields(value, ['originalPayment', 'selectedGrantId', 'paymentRequiredHeader']);
  if (c.operation === 'restoreOriginal') fields(value, ['paymentRequiredHeader', 'expectedPins']);
  if (c.operation === 'readRecoveryState') fields(value, ['key', 'expectedPins']);
  if (c.operation === 'reconcileOriginal') fields(value, ['key', 'authorizationHeader', 'expectedPins']);
  if (c.operation === 'submitService') fields(value, [
    'grantId', 'requestId', 'originalRequestJson', 'originalBodyBase64', 'serviceResourceUrl', 'authorizationHeader',
    ...(operations !== OPERATIONS ? ['expectedPins'] : []),
  ]);
  if ((c.operation === 'inspect' || c.operation === 'close') && KEYS(value).length !== 0) fail('input_rejected');
  const out = F({ version: 1, id: c.id, operation: c.operation, input: value });
  wire(out, maximumBytes);
  return out;
}

function project(operation, result) {
  if (operation === 'submitService') {
    if (result !== undefined) fail('service_result_unknown');
    return F({ callbackCompleted: true, serviceDelivery: 'NOT_ESTABLISHED', authority: 'NONE' });
  }
  if (operation === 'inspect') return snapshot(result, DEFAULTS.maxLineBytes);
  if (operation === 'reconcileOriginal') {
    fields(result, ['buyerOriginalBackendRecoveryObservationVersion', 'grantId', 'requestId', 'status', 'backendStatus',
      'originalCheckpointPinsMatched', 'localReconciliationRequired', 'reconciliationRequired', 'mayStartPayment',
      'maySignPayment', 'mayDispatchService', 'deliveryConfirmed', 'serviceDelivery', 'sameProcessObservationOnly',
      'currentAuthority', 'authority']);
    if (data(result, 'buyerOriginalBackendRecoveryObservationVersion') !== 1
        || data(result, 'reconciliationRequired') !== true || data(result, 'mayDispatchService') !== false
        || data(result, 'mayStartPayment') !== false || data(result, 'maySignPayment') !== false
        || data(result, 'deliveryConfirmed') !== false || data(result, 'authority') !== 'NONE'
        || data(result, 'serviceDelivery') !== 'NOT_ESTABLISHED') fail('result_rejected');
    return snapshot(result, DEFAULTS.maxLineBytes);
  }
  if (operation === 'restoreOriginal') {
    if (data(result, 'source') !== 'EXACT_RETAINED_V6_ORIGINAL' || data(result, 'signatureCreated') !== false
        || data(result, 'transport') !== 'NOT_INVOKED') fail('result_rejected');
    const header = data(result, 'paymentSignatureHeader'), resource = data(result, 'resourceUrl');
    boundedString(header, 8192); boundedString(resource, 4096);
    return F({ resourceUrl: resource, paymentSignatureHeader: header, source: 'EXACT_RETAINED_V6_ORIGINAL',
      signatureCreated: false, transport: 'NOT_INVOKED', fundingAcknowledgement: 'NOT_ESTABLISHED',
      grantActivation: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED', authority: 'NONE' });
  }
  if (operation === 'readRecoveryState') {
    if (data(result, 'buyerOriginalRecoveryObservationVersion') !== 1
        || typeof data(result, 'recordPresent') !== 'boolean'
        || typeof data(result, 'reconciliationRequired') !== 'boolean') fail('result_rejected');
    return snapshot(result, DEFAULTS.maxLineBytes);
  }
  const phase = data(result, 'phase');
  if (typeof phase !== 'string' || !/^[A-Z][A-Z0-9_]{0,79}$/.test(phase)) fail('result_rejected');
  const output = { phase, authority: 'NONE', serviceDelivery: 'NOT_ESTABLISHED' };
  if (operation === 'prepare') {
    if (phase !== 'AWAITING_INDEPENDENT_PINS') fail('result_rejected');
    const packet = data(result, 'packet'), pair = data(packet, 'pair'), challenge = data(pair, 'challenge');
    output.serializedCheckpoint = data(packet, 'serializedCheckpoint');
    output.paymentRequiredHeader = data(challenge, 'paymentRequiredHeader');
    output.candidatePins = snapshot(data(packet, 'expectedPins'), DEFAULTS.maxLineBytes);
    output.independentPinsRequired = true;
    boundedString(output.serializedCheckpoint, 32768);
    boundedString(output.paymentRequiredHeader, 5464);
    output.persistence = 'NOT_PERFORMED';
  } else if (operation === 'commit') {
    if (phase !== 'LOCAL_STORE_READBACK_MATCHED') fail('result_rejected');
    output.publication = 'NOT_PERFORMED';
  } else if (operation === 'submitFunding') {
    const status = data(result, 'fundingIntakeStatus');
    if (typeof status !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(status)) fail('result_rejected');
    output.fundingIntakeStatus = status;
    output.chainPublication = 'NOT_ESTABLISHED';
    output.inclusion = 'NOT_ESTABLISHED';
    output.grant = 'NOT_ESTABLISHED';
  } else if (operation === 'handoff') {
    if (phase !== 'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED') fail('result_rejected');
    output.grantActivation = 'NOT_ESTABLISHED';
  } else fail('result_rejected');
  const hash = optionalData(operation === 'prepare' ? data(result, 'packet') : result, 'transactionHash');
  if (hash !== undefined) {
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) fail('result_rejected');
    output.transactionHash = hash;
  }
  return F(output);
}

function snapshot(input, maximumBytes) {
  let nodes = 0, strings = 0;
  const active = new WeakSet();
  function visit(value, depth) {
    if (++nodes > 8192 || depth > 24) fail('data_limit');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      boundedString(value, maximumBytes); strings += Buffer.byteLength(value);
      if (strings > maximumBytes) fail('data_limit');
      return value;
    }
    if (value === null || typeof value !== 'object' || PROXY(value) || active.has(value)) fail('input_rejected');
    const array = Array.isArray(value), proto = PROTO(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) fail('input_rejected');
    active.add(value);
    let out;
    if (array) {
      const length = DESC(value, 'length')?.value;
      if (!Number.isSafeInteger(length) || length > 4096 || KEYS(value).length !== length + 1) fail('input_rejected');
      out = [];
      for (let i = 0; i < length; i++) {
        const d = DESC(value, String(i));
        if (!d || !OWN(d, 'value') || !d.enumerable) fail('input_rejected');
        out.push(visit(d.value, depth + 1));
      }
    } else {
      // The real native input codecs require ordinary plain records. Define
      // properties explicitly so a JSON __proto__ key cannot mutate this proto.
      out = {};
      for (const key of KEYS(value)) {
        if (typeof key !== 'string') fail('input_rejected');
        boundedString(key, maximumBytes);
        strings += Buffer.byteLength(key);
        if (strings > maximumBytes) fail('data_limit');
        const d = DESC(value, key);
        if (!d || !OWN(d, 'value') || !d.enumerable) fail('input_rejected');
        Object.defineProperty(out, key, { value: visit(d.value, depth + 1), enumerable: true });
      }
    }
    active.delete(value);
    return F(out);
  }
  return visit(input, 0);
}

function fields(input, names, exact = true, allowAny = false) {
  if (input === null || typeof input !== 'object' || PROXY(input)
      || (PROTO(input) !== Object.prototype && PROTO(input) !== null)) fail('input_rejected');
  const keys = KEYS(input), out = Object.create(null);
  if (!allowAny && (exact ? keys.length !== names.length : keys.some(k => !names.includes(k)))) fail('input_rejected');
  for (const key of keys) {
    const d = DESC(input, key);
    if (typeof key !== 'string' || !d || !OWN(d, 'value') || !d.enumerable
        || exact && !names.includes(key)) fail('input_rejected');
    Object.defineProperty(out, key, { value: d.value, enumerable: true });
  }
  return out;
}
function data(input, key) {
  const result = optionalData(input, key);
  if (result === undefined) fail('result_rejected');
  return result;
}
function optionalData(input, key) {
  if (input === null || typeof input !== 'object' || PROXY(input) || !Object.isFrozen(input)
      || (PROTO(input) !== Object.prototype && PROTO(input) !== null)) fail('result_rejected');
  const d = DESC(input, key);
  if (d === undefined) return undefined;
  if (!OWN(d, 'value') || !d.enumerable) fail('result_rejected');
  return d.value;
}
function byteLimit(value) {
  if (!Number.isSafeInteger(value) || value < 256 || value > 262144) fail('limits_rejected');
}
function boundedString(value, maximumBytes) {
  byteLimit(maximumBytes);
  if (typeof value !== 'string' || Buffer.byteLength(value) > maximumBytes
      || Buffer.from(value, 'utf8').toString('utf8') !== value) fail('input_rejected');
}
function wire(value, maximumBytes) {
  byteLimit(maximumBytes);
  const text = canonicalJson(value);
  boundedString(text, maximumBytes);
  return text;
}
function fail(kind) {
  const code = 'buyer_original_funding_command_' + kind, error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw F(error);
}
