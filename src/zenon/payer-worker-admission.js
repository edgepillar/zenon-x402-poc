import { types as utilTypes } from 'node:util';
const APPLY = Reflect.apply;
const OWN_KEYS = Reflect.ownKeys;
const GET_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const GET_PROTOTYPE = Reflect.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const FREEZE = Object.freeze;
const IS_FROZEN = Object.isFrozen;
const IS_ARRAY = Array.isArray;
const ARRAY_CONSTRUCTOR = Array;
const ARRAY_FIND = Array.prototype.find;
const ARRAY_MAP = Array.prototype.map;
const IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT_PROTOTYPE = Object.prototype;
const ARRAY_PROTOTYPE = Array.prototype;
const REGEXP_TEST = RegExp.prototype.test;
const IS_PROXY = utilTypes.isProxy;
const MAP_GET = Map.prototype.get;
const MAP_SET = Map.prototype.set;
const SET_HAS = Set.prototype.has;
const SET_ADD = Set.prototype.add;
const WEAK_MAP_GET = WeakMap.prototype.get;
const WEAK_MAP_SET = WeakMap.prototype.set;
const MAP_CONSTRUCTOR = Map;
const SET_CONSTRUCTOR = Set;
const WEAK_MAP_CONSTRUCTOR = WeakMap;
const SAFE_ASCII = /^[\x21-\x7e]+$/;
const CONFIGURATION_FIELDS = FREEZE(['lane', 'workerIds', 'maxAdmissions']);
const REQUEST_FIELDS = FREEZE(['payer', 'operationId', 'kind']);
const TICKET_FIELDS = FREEZE([
  'version', 'lane', 'kind', 'payer', 'operationId', 'workerId', 'sequence',
]);

export const PAYER_WORKER_LANES = FREEZE({
  BUYER: 'buyer',
  FACILITATOR: 'facilitator',
});

export const PAYER_WORKER_OPERATION_KINDS = FREEZE({
  BUYER_PREPARE: 'buyer.prepare',
  FACILITATOR_VERIFY: 'facilitator.verify',
  FACILITATOR_SETTLE: 'facilitator.settle',
  FACILITATOR_RECONCILE_CANDIDATE: 'facilitator.reconcile-candidate',
});

export const PAYER_WORKER_ADMISSION_ERROR_CODES = FREEZE({
  INVALID_CONFIGURATION: 'INVALID_CONFIGURATION',
  INVALID_REQUEST: 'INVALID_REQUEST',
  OPERATION_REPLAY: 'OPERATION_REPLAY',
  PAYER_BUSY: 'PAYER_BUSY',
  CAPACITY_EXHAUSTED: 'CAPACITY_EXHAUSTED',
  ADMISSION_LIMIT_REACHED: 'ADMISSION_LIMIT_REACHED',
  INVALID_TICKET: 'INVALID_TICKET',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  WORKER_QUARANTINED: 'WORKER_QUARANTINED',
});

const CODES = PAYER_WORKER_ADMISSION_ERROR_CODES;
const REGISTRIES = new WEAK_MAP_CONSTRUCTOR();

export class PayerWorkerAdmissionError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PayerWorkerAdmissionError';
    this.code = code;
    this.stack = `PayerWorkerAdmissionError: ${code}`;
  }
}

function fail(code) {
  throw new PayerWorkerAdmissionError(code);
}

function mapGet(map, key) {
  return APPLY(MAP_GET, map, [key]);
}

function mapSet(map, key, value) {
  APPLY(MAP_SET, map, [key, value]);
}

function exactRecord(value, fields, code, optionalLast = false) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      GET_PROTOTYPE(value) !== OBJECT_PROTOTYPE) fail(code);
  const keys = OWN_KEYS(value);
  const minimum = fields.length - (optionalLast ? 1 : 0);
  if (keys.length < minimum || keys.length > fields.length) fail(code);
  const captured = new ARRAY_CONSTRUCTOR(fields.length);
  for (let index = 0; index < minimum; index += 1) {
    const descriptor = GET_DESCRIPTOR(value, fields[index]);
    if (descriptor === undefined || descriptor.enumerable !== true ||
        !HAS_OWN(descriptor, 'value')) fail(code);
    captured[index] = descriptor.value;
  }
  if (optionalLast) {
    const index = fields.length - 1;
    const descriptor = GET_DESCRIPTOR(value, fields[index]);
    if (descriptor === undefined) {
      if (keys.length !== minimum) fail(code);
    } else {
      if (keys.length !== fields.length || descriptor.enumerable !== true ||
          !HAS_OWN(descriptor, 'value')) fail(code);
      captured[index] = descriptor.value;
    }
  }
  return captured;
}

function safeAscii(value, maximum, code) {
  if (typeof value !== 'string' || value.length > maximum ||
      !APPLY(REGEXP_TEST, SAFE_ASCII, [value])) fail(code);
  return value;
}

function captureWorkerIds(value) {
  const code = CODES.INVALID_CONFIGURATION;
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      !IS_ARRAY(value) || GET_PROTOTYPE(value) !== ARRAY_PROTOTYPE) fail(code);
  const lengthDescriptor = GET_DESCRIPTOR(value, 'length');
  if (lengthDescriptor === undefined || !HAS_OWN(lengthDescriptor, 'value') ||
      !IS_SAFE_INTEGER(lengthDescriptor.value) || lengthDescriptor.value < 1 ||
      lengthDescriptor.value > 8 || OWN_KEYS(value).length !== lengthDescriptor.value + 1) {
    fail(code);
  }
  const result = new ARRAY_CONSTRUCTOR(lengthDescriptor.value);
  const seen = new SET_CONSTRUCTOR();
  for (let index = 0; index < result.length; index += 1) {
    const descriptor = GET_DESCRIPTOR(value, String(index));
    if (descriptor === undefined || descriptor.enumerable !== true ||
        !HAS_OWN(descriptor, 'value')) fail(code);
    const workerId = safeAscii(descriptor.value, 64, code);
    if (APPLY(SET_HAS, seen, [workerId])) fail(code);
    APPLY(SET_ADD, seen, [workerId]);
    result[index] = workerId;
  }
  return result;
}

function validKind(lane, kind) {
  if (lane === PAYER_WORKER_LANES.BUYER) {
    return kind === PAYER_WORKER_OPERATION_KINDS.BUYER_PREPARE;
  }
  return kind === PAYER_WORKER_OPERATION_KINDS.FACILITATOR_VERIFY ||
    kind === PAYER_WORKER_OPERATION_KINDS.FACILITATOR_SETTLE ||
    kind === PAYER_WORKER_OPERATION_KINDS.FACILITATOR_RECONCILE_CANDIDATE;
}

function registryFor(instance) {
  const state = APPLY(WEAK_MAP_GET, REGISTRIES, [instance]);
  if (state === undefined) fail(CODES.INVALID_CONFIGURATION);
  return state;
}

function ticketRecord(state, ticket) {
  exactRecord(ticket, TICKET_FIELDS, CODES.INVALID_TICKET);
  if (!IS_FROZEN(ticket)) fail(CODES.INVALID_TICKET);
  const record = APPLY(WEAK_MAP_GET, state.tickets, [ticket]);
  if (record === undefined) fail(CODES.INVALID_TICKET);
  return record;
}

function transition(instance, ticket, expected, next, release) {
  const state = registryFor(instance);
  const record = ticketRecord(state, ticket);
  if (record.worker.quarantined) fail(CODES.WORKER_QUARANTINED);
  if (record.phase !== expected || record.worker.active !== record) {
    fail(CODES.INVALID_TRANSITION);
  }
  record.phase = next;
  if (release) record.worker.active = null;
}

export class OfflinePayerWorkerAdmission {
  constructor(options) {
    const code = CODES.INVALID_CONFIGURATION;
    if (arguments.length !== 1) fail(code);
    const [lane, workerIdsValue, maxAdmissionsValue] = exactRecord(
      options, CONFIGURATION_FIELDS, code, true,
    );
    if (lane !== PAYER_WORKER_LANES.BUYER &&
        lane !== PAYER_WORKER_LANES.FACILITATOR) fail(code);
    const workerIds = captureWorkerIds(workerIdsValue);
    const maxAdmissions = maxAdmissionsValue === undefined ? 64 : maxAdmissionsValue;
    if (!IS_SAFE_INTEGER(maxAdmissions) || maxAdmissions < 1 || maxAdmissions > 256) {
      fail(code);
    }
    const workers = APPLY(ARRAY_MAP, workerIds, [id => ({
      id, payer: null, active: null, quarantined: false, sequence: 0,
    })]);
    const workersById = new MAP_CONSTRUCTOR();
    for (const worker of workers) mapSet(workersById, worker.id, worker);
    APPLY(WEAK_MAP_SET, REGISTRIES, [this, {
      lane,
      workers,
      workersById,
      workersByPayer: new MAP_CONSTRUCTOR(),
      tickets: new WEAK_MAP_CONSTRUCTOR(),
      operationIds: new SET_CONSTRUCTOR(),
      admissions: 0,
      maxAdmissions,
    }]);
  }

  admit(request) {
    if (arguments.length !== 1) fail(CODES.INVALID_REQUEST);
    const state = registryFor(this);
    const [payer, operationId, kind] = exactRecord(
      request, REQUEST_FIELDS, CODES.INVALID_REQUEST,
    );
    safeAscii(payer, 128, CODES.INVALID_REQUEST);
    safeAscii(operationId, 128, CODES.INVALID_REQUEST);
    if (typeof kind !== 'string' || !validKind(state.lane, kind)) {
      fail(CODES.INVALID_REQUEST);
    }
    if (APPLY(SET_HAS, state.operationIds, [operationId])) fail(CODES.OPERATION_REPLAY);

    let worker = mapGet(state.workersByPayer, payer);
    if (worker !== undefined) {
      if (worker.quarantined) fail(CODES.WORKER_QUARANTINED);
      if (worker.active !== null) fail(CODES.PAYER_BUSY);
    }
    if (state.admissions >= state.maxAdmissions) fail(CODES.ADMISSION_LIMIT_REACHED);
    if (worker === undefined) {
      worker = APPLY(ARRAY_FIND, state.workers, [candidate =>
        candidate.payer === null && !candidate.quarantined]);
      if (worker === undefined) fail(CODES.CAPACITY_EXHAUSTED);
    }

    const sequence = worker.sequence + 1;
    const ticket = FREEZE({
      version: 1,
      lane: state.lane,
      kind,
      payer,
      operationId,
      workerId: worker.id,
      sequence,
    });
    const record = { ticket, worker, phase: 'RESERVED' };
    APPLY(WEAK_MAP_SET, state.tickets, [ticket, record]);
    if (worker.payer === null) {
      worker.payer = payer;
      mapSet(state.workersByPayer, payer, worker);
    }
    worker.sequence = sequence;
    worker.active = record;
    APPLY(SET_ADD, state.operationIds, [operationId]);
    state.admissions += 1;
    return ticket;
  }

  markDispatched(ticket) {
    if (arguments.length !== 1) fail(CODES.INVALID_TICKET);
    transition(this, ticket, 'RESERVED', 'DISPATCHED', false);
  }

  releaseUndispatched(ticket) {
    if (arguments.length !== 1) fail(CODES.INVALID_TICKET);
    transition(this, ticket, 'RESERVED', 'RELEASED', true);
  }

  complete(ticket) {
    if (arguments.length !== 1) fail(CODES.INVALID_TICKET);
    transition(this, ticket, 'DISPATCHED', 'COMPLETED', true);
  }

  quarantineWorker(workerId) {
    if (arguments.length !== 1) fail(CODES.INVALID_REQUEST);
    const state = registryFor(this);
    safeAscii(workerId, 64, CODES.INVALID_REQUEST);
    const worker = mapGet(state.workersById, workerId);
    if (worker === undefined) fail(CODES.INVALID_REQUEST);
    worker.quarantined = true;
  }
}
