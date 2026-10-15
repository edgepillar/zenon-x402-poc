import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import {
  snapshotOriginalServiceRequestCustodyPolicy,
  snapshotOriginalServiceRequestCustodyKey,
  captureOriginalServiceRequestCustody,
  parseOriginalServiceRequestCustody,
  serializeOriginalServiceRequestCustody,
} from './service-credit-original-request-custody-contract.js';

const FREEZE = Object.freeze;
const OWN_KEYS = Reflect.ownKeys;
const DESCRIPTOR = Object.getOwnPropertyDescriptor;
const PROTOTYPE = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const DEFINE = Object.defineProperty;
const IS = Object.is;
const APPLY = Reflect.apply;
const IS_PROXY = utilTypes.isProxy;
const IS_PROMISE = utilTypes.isPromise;
const IS_SAFE = Number.isSafeInteger;
const BYTE_LENGTH = Buffer.byteLength;
const REGEXP_TEST = RegExp.prototype.test;
const OBJECT_PROTOTYPE = Object.prototype;
const TYPE_ERROR = TypeError;
const NativePromise = Promise;
const PROMISE_PROTOTYPE = NativePromise.prototype;
const THEN = PROMISE_PROTOTYPE.then;
const SPECIES = Symbol.species;
const NATIVE_SPECIES = DESCRIPTOR(NativePromise, SPECIES);
const ERROR_CODES = new WeakMap();
const WEAK_GET = WeakMap.prototype.get;
const WEAK_SET = WeakMap.prototype.set;
const POLICY = snapshotOriginalServiceRequestCustodyPolicy;
const KEY = snapshotOriginalServiceRequestCustodyKey;
const CAPTURE = captureOriginalServiceRequestCustody;
const PARSE = parseOriginalServiceRequestCustody;
const SERIALIZE = serializeOriginalServiceRequestCustody;
const PREFIX = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const HASH = /^[0-9a-f]{64}$/;
const CONFIG_FIELDS = FREEZE([
  'store', 'fundingResourceUrl', 'custodyPolicy', 'selectedGrantId',
]);
const INPUT_FIELDS = FREEZE([
  'grantId', 'requestId', 'originalRequestJson', 'originalBodyBase64',
  'serviceResourceUrl',
]);
const STORE_METHODS = FREEZE(['load', 'getOriginalRequest', 'retainOriginalRequest']);
const LOAD_FIELDS = FREEZE([
  'revision', 'status', 'ambiguityLatched', 'resourceUrl', 'challengeHeader',
  'paymentHeader', 'paymentRequired', 'paymentPayload', 'requirement',
]);
const LOAD_PICKS = FREEZE([
  'revision', 'status', 'ambiguityLatched', 'resourceUrl', 'paymentPayload',
  'requirement',
]);
const PAYLOAD_FIELDS = FREEZE(['x402Version', 'resource', 'accepted', 'payload']);
const REQUIREMENT_FIELDS = FREEZE([
  'scheme', 'network', 'asset', 'amount', 'payTo', 'maxTimeoutSeconds', 'extra',
]);
const STATUSES = FREEZE([
  'PREPARED', 'ATTEMPT_FENCED', 'OUTCOME_UNKNOWN', 'BOUND',
  'PAYMENT_REJECTED', 'PAYMENT_CONFLICT',
]);

/**
 * Explicit opt-in library connection to the synchronous v2 custody interface.
 * Provide an actual opened v2 store and independently match its custody policy.
 * Interface presence is not a store brand, SQL qualification or policy receipt.
 *
 * selectedGrantId is required immutable client scope. It is validated through
 * the pure key contract, not selected by the first request. It authenticates
 * no grant/proof and does not replace backend selected-grant authority.
 *
 * No proof/header/credential is accepted or emitted. Store-owned opaque fields
 * are checked as data descriptors without inspecting their credential values.
 * Only resource/hash/network and funding lifecycle metadata are projected.
 *
 * The caller's dispatch must already have independent current context,
 * payer/provider/policy and proof authority. BOUND alone establishes none of
 * those gates. This owner never funds, authorizes, prepares, signs or verifies.
 *
 * submitOriginal returns Promise<void>. A completed callback means only
 * CALLBACK_COMPLETED, never delivery/service success/settlement.
 * readOriginal is synchronous recovery metadata, not permission to send.
 *
 * Store methods are trusted to implement the reviewed synchronous interface.
 * No await or dispatch callback occurs before retain/readback/binding fencing.
 * No existing record is automatically replayed. A new owner is not restoration.
 *
 * Native promises require the captured native prototype and a safe constructor/
 * species path. Own then getters are not read. Unobservable handles remain held.
 * Dispatch must not depend indirectly on this owner's close for completion.
 *
 * close only drains observable callback work. It never closes the borrowed
 * store or proves external resource cleanup, process restart or durability.
 */
export function createServiceCreditCustodiedRequestOwner(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  let config, policy, methods, selectedKey;
  try {
    config = exact(configuration, CONFIG_FIELDS);
    policy = POLICY(config.custodyPolicy, config.fundingResourceUrl);
    selectedKey = KEY({ grantId: config.selectedGrantId, requestId: 'scope' });
    methods = captureMethods(config.store);
  } catch {
    throw failure('INVALID_CONFIGURATION');
  }
  const store = config.store;
  const fundingResourceUrl = config.fundingResourceUrl;
  const selectedGrantId = selectedKey.grantId;
  const entries = [];
  const counts = {
    loadReads: 0,
    recordReads: 0,
    retainCalls: 0,
    readbackConfirmations: 0,
    dispatchCalls: 0,
    callbackCompletions: 0,
  };
  let active = false;
  let closed = false;
  let phase = 'IDLE';
  let custodyUncertainty = false;
  let submissionUncertainty = false;
  let unknownUndrained = false;
  let fundingAmbiguityObserved = false;
  let drainStatus = 'NONE';
  let closeCapability = null;
  let closeOutcome = 'NOT_REQUESTED';

  function bump(field) {
    if (counts[field] === Number.MAX_SAFE_INTEGER) throw failure('LIMIT');
    counts[field]++;
  }

  function holdCustody() {
    custodyUncertainty = true;
    if (!unknownUndrained && !submissionUncertainty) phase = 'CUSTODY_OUTCOME_UNKNOWN';
  }

  function holdSubmission(unobservable) {
    submissionUncertainty = true;
    if (unobservable) unknownUndrained = true;
    phase = unknownUndrained ? 'UNKNOWN_UNDRAINED' : 'SUBMISSION_OUTCOME_UNKNOWN';
  }

  function held() {
    return custodyUncertainty || submissionUncertainty || unknownUndrained;
  }

  function settleClose() {
    if (closeCapability === null || active) return;
    if (held()) {
      closeOutcome = 'UNKNOWN';
      closeCapability.reject(failure('CLOSE_FAILED'));
    } else {
      closeOutcome = 'DRAINED';
      closeCapability.resolve(undefined);
    }
  }

  function callStore(name, args, counter) {
    bump(counter);
    try {
      return APPLY(methods[name], store, args);
    } catch {
      holdCustody();
      throw failure('CUSTODY_OUTCOME_UNKNOWN');
    }
  }

  function currentFunding() {
    const raw = callStore('load', [], 'loadReads');
    if (raw === null) throw failure('FUNDING_REQUIRED');
    try {
      const top = project(raw, LOAD_FIELDS, [], LOAD_PICKS);
      if (!IS_SAFE(top.revision) || top.revision < 1 || IS(top.revision, -0)
          || !contains(STATUSES, top.status)
          || typeof top.ambiguityLatched !== 'boolean'
          || top.resourceUrl !== fundingResourceUrl) throw failure('INVALID_DATA');
      if ((top.status === 'PREPARED' && top.ambiguityLatched)
          || (top.status === 'OUTCOME_UNKNOWN' && !top.ambiguityLatched)
          || ((top.status === 'PAYMENT_REJECTED' || top.status === 'PAYMENT_CONFLICT')
            && top.ambiguityLatched)) throw failure('INVALID_DATA');
      const payload = project(top.paymentPayload, PAYLOAD_FIELDS, ['extensions'],
        ['x402Version', 'payload']);
      if (payload.x402Version !== 2) throw failure('INVALID_DATA');
      const inner = project(payload.payload, ['transaction', 'intentDigest'], [],
        ['transaction']);
      // Transaction members are opaque store-owned data. Only hash is read.
      const transaction = project(inner.transaction, ['hash'], null, ['hash']);
      const requirement = project(top.requirement, REQUIREMENT_FIELDS, [], ['network']);
      bounded(transaction.hash, 64);
      bounded(requirement.network, 256);
      if (transaction.hash.length !== 64
          || !APPLY(REGEXP_TEST, HASH, [transaction.hash])) throw failure('INVALID_DATA');
      if (top.ambiguityLatched) fundingAmbiguityObserved = true;
      return FREEZE({
        revision: top.revision,
        status: top.status,
        ambiguityLatched: top.ambiguityLatched,
        fundingResourceUrl: top.resourceUrl,
        paymentHash: transaction.hash,
        network: requirement.network,
      });
    } catch {
      holdCustody();
      throw failure('CUSTODY_OUTCOME_UNKNOWN');
    }
  }

  function sameFunding(left, right) {
    return left.revision === right.revision && left.status === right.status
      && left.ambiguityLatched === right.ambiguityLatched
      && left.fundingResourceUrl === right.fundingResourceUrl
      && left.paymentHash === right.paymentHash && left.network === right.network;
  }

  function binding(current) {
    return {
      fundingResourceUrl: current.fundingResourceUrl,
      paymentHash: current.paymentHash,
      network: current.network,
    };
  }

  function recordForCurrent(raw, key, current) {
    try {
      const text = SERIALIZE(raw);
      const record = PARSE(text);
      if (record.grantId !== key.grantId || record.requestId !== key.requestId
          || record.serviceResourceUrl !== policy.serviceResourceUrl
          || record.fundingResourceUrl !== current.fundingResourceUrl
          || record.paymentHash !== current.paymentHash
          || record.network !== current.network) throw failure('INVALID_DATA');
      return { record, text };
    } catch {
      holdCustody();
      throw failure('CUSTODY_OUTCOME_UNKNOWN');
    }
  }

  function find(key) {
    for (let index = 0; index < entries.length; index++) {
      if (entries[index].grantId === key.grantId
          && entries[index].requestId === key.requestId) return entries[index];
    }
    return null;
  }

  function requireScope(key) {
    if (key.grantId !== selectedGrantId) throw failure('FOREIGN_GRANT');
  }

  function submitOriginal(...args) {
    if (closed) return rejected('CLOSED');
    if (active) return rejected('BUSY');
    if (held()) {
      return rejected(submissionUncertainty
        ? 'SUBMISSION_OUTCOME_UNKNOWN' : 'CUSTODY_OUTCOME_UNKNOWN');
    }
    let input, key, dispatch;
    try {
      if (args.length !== 2) throw failure('INVALID_INPUT');
      input = exact(args[0], INPUT_FIELDS);
      key = KEY({ grantId: input.grantId, requestId: input.requestId });
      dispatch = args[1];
      if (typeof dispatch !== 'function' || IS_PROXY(dispatch)) {
        throw failure('INVALID_INPUT');
      }
      requireScope(key);
    } catch (error) {
      return rejected(known(error) === 'FOREIGN_GRANT'
        ? 'FOREIGN_GRANT' : 'INVALID_INPUT');
    }

    const operation = capability();
    active = true;
    phase = 'CHECKING_CUSTODY';
    let retentionStarted = false;
    let handedOff = false;
    let finished = false;

    function submissionFailed(unobservable) {
      if (finished) return;
      finished = true;
      holdSubmission(unobservable);
      drainStatus = unobservable ? 'UNOBSERVABLE' : 'OBSERVED';
      active = false;
      operation.reject(failure('SUBMISSION_OUTCOME_UNKNOWN'));
      settleClose();
    }

    function callbackCompleted(value) {
      if (finished) return;
      if (value !== undefined) {
        submissionFailed(false);
        return;
      }
      finished = true;
      counts.callbackCompletions++;
      drainStatus = 'OBSERVED';
      phase = 'CALLBACK_COMPLETED';
      active = false;
      operation.resolve(undefined);
      settleClose();
    }

    try {
      const current = currentFunding();
      if (closed) throw failure('CLOSED');
      if (current.status !== 'BOUND') throw failure('FUNDING_NOT_BOUND');
      const prior = find(key);
      const existingRaw = callStore('getOriginalRequest', [key], 'recordReads');
      if (closed) throw failure('CLOSED');
      if (existingRaw === undefined) {
        holdCustody();
        throw failure('CUSTODY_OUTCOME_UNKNOWN');
      }
      let candidate, candidateText;
      try {
        candidate = CAPTURE({
          originalRequestJson: input.originalRequestJson,
          originalBodyBase64: input.originalBodyBase64,
          serviceResourceUrl: input.serviceResourceUrl,
        }, binding(current));
        if (candidate.grantId !== key.grantId || candidate.requestId !== key.requestId
            || candidate.serviceResourceUrl !== policy.serviceResourceUrl) {
          throw failure('INVALID_INPUT');
        }
        candidateText = SERIALIZE(candidate);
      } catch {
        throw failure(existingRaw === null ? 'INVALID_INPUT' : 'CONFLICT');
      }
      if (existingRaw !== null) {
        const existing = recordForCurrent(existingRaw, key, current);
        if (existing.text !== candidateText) throw failure('CONFLICT');
        throw failure('RECOVERY_REQUIRED');
      }
      if (prior !== null) {
        holdCustody();
        throw failure('CUSTODY_OUTCOME_UNKNOWN');
      }
      if (entries.length >= policy.maxRequests) throw failure('CAPACITY');
      entries[entries.length] = FREEZE({
        grantId: key.grantId, requestId: key.requestId,
      });
      phase = 'PERSISTING';
      retentionStarted = true;
      const retainedRaw = callStore('retainOriginalRequest', [{
        grantId: key.grantId,
        requestId: key.requestId,
        originalRequestJson: input.originalRequestJson,
        originalBodyBase64: input.originalBodyBase64,
        serviceResourceUrl: input.serviceResourceUrl,
      }], 'retainCalls');
      const retained = recordForCurrent(retainedRaw, key, current);
      if (retained.text !== candidateText) {
        holdCustody();
        throw failure('CUSTODY_OUTCOME_UNKNOWN');
      }
      const readbackRaw = callStore('getOriginalRequest', [key], 'recordReads');
      const readback = recordForCurrent(readbackRaw, key, current);
      if (readback.text !== candidateText) {
        holdCustody();
        throw failure('CUSTODY_OUTCOME_UNKNOWN');
      }
      const latest = currentFunding();
      if (latest.status !== 'BOUND' || !sameFunding(current, latest)) {
        holdCustody();
        throw failure('CUSTODY_OUTCOME_UNKNOWN');
      }
      counts.readbackConfirmations++;
      if (closed) throw failure('RECOVERY_REQUIRED');

      handedOff = true;
      counts.dispatchCalls++;
      drainStatus = 'PENDING';
      phase = 'DISPATCH_PENDING';
      const returned = APPLY(dispatch, undefined, [PARSE(candidateText)]);
      if (returned === undefined) {
        callbackCompleted(undefined);
      } else if (returned === operation.promise
          || returned === closeCapability?.promise || !safePromise(returned)) {
        submissionFailed(true);
      } else {
        APPLY(THEN, returned, [
          callbackCompleted,
          () => { submissionFailed(false); },
        ]);
      }
    } catch (error) {
      if (handedOff) {
        submissionFailed(true);
      } else {
        if (retentionStarted && known(error) !== 'RECOVERY_REQUIRED') holdCustody();
        const code = held() ? 'CUSTODY_OUTCOME_UNKNOWN' : known(error);
        if (code === undefined) holdCustody();
        if (!held()) {
          phase = code === 'RECOVERY_REQUIRED' ? 'RECOVERY_REQUIRED'
            : closed ? 'CLOSED' : 'IDLE';
        }
        active = false;
        operation.reject(failure(code ?? 'CUSTODY_OUTCOME_UNKNOWN'));
        settleClose();
      }
    }
    return operation.promise;
  }

  function readOriginal(...args) {
    if (closed) throw failure('CLOSED');
    if (active) throw failure('BUSY');
    let key;
    try {
      if (args.length !== 1) throw failure('INVALID_INPUT');
      key = KEY(args[0]);
      requireScope(key);
    } catch (error) {
      throw failure(known(error) ?? 'INVALID_INPUT');
    }
    active = true;
    try {
      const current = currentFunding();
      if (closed) throw failure('CLOSED');
      const raw = callStore('getOriginalRequest', [key], 'recordReads');
      if (raw === null) return null;
      if (raw === undefined) {
        holdCustody();
        throw failure('CUSTODY_OUTCOME_UNKNOWN');
      }
      const record = recordForCurrent(raw, key, current).record;
      const latest = currentFunding();
      if (!sameFunding(current, latest)) {
        holdCustody();
        throw failure('CUSTODY_OUTCOME_UNKNOWN');
      }
      return record;
    } catch (error) {
      const code = known(error);
      if (code === undefined) holdCustody();
      throw failure(code ?? 'CUSTODY_OUTCOME_UNKNOWN');
    } finally {
      active = false;
      settleClose();
    }
  }

  function snapshot(...args) {
    if (args.length !== 0) throw failure('INVALID_INPUT');
    return FREEZE({
      phase,
      closed,
      active,
      grantScoped: true,
      trackedRequests: entries.length,
      maxRequests: policy.maxRequests,
      drainStatus,
      closeOutcome,
      counts: FREEZE({ ...counts }),
      uncertainty: FREEZE({
        custody: custodyUncertainty,
        submission: submissionUncertainty,
        undrained: unknownUndrained,
        declaredFundingAmbiguitySeen: fundingAmbiguityObserved,
      }),
      qualification: 'DECLARED_CALLBACK_LIFECYCLE_ONLY',
      serviceOutcome: 'NOT_ESTABLISHED',
      durability: 'NOT_ESTABLISHED',
      recoveryAuthority: 'NONE',
    });
  }

  function close(...args) {
    if (args.length !== 0) return rejected('INVALID_INPUT');
    if (closeCapability !== null) return closeCapability.promise;
    closed = true;
    closeCapability = capability();
    closeOutcome = 'WAITING';
    settleClose();
    return closeCapability.promise;
  }

  return FREEZE({
    submitOriginal: FREEZE(submitOriginal),
    readOriginal: FREEZE(readOriginal),
    snapshot: FREEZE(snapshot),
    close: FREEZE(close),
  });
}

function contains(values, value) {
  for (let index = 0; index < values.length; index++) {
    if (values[index] === value) return true;
  }
  return false;
}

function project(value, required, optional, picks) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value)
      || PROTOTYPE(value) !== OBJECT_PROTOTYPE) throw failure('INVALID_DATA');
  const keys = OWN_KEYS(value);
  if (keys.length > 512 || keys.length < required.length
      || (optional !== null && keys.length > required.length + optional.length)) {
    throw failure('INVALID_DATA');
  }
  const result = {};
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    if (typeof key !== 'string'
        || (optional !== null && !contains(required, key) && !contains(optional, key))) {
      throw failure('INVALID_DATA');
    }
    const descriptor = DESCRIPTOR(value, key);
    if (descriptor === undefined || descriptor.enumerable !== true
        || !HAS_OWN(descriptor, 'value')) throw failure('INVALID_DATA');
    if (contains(picks, key)) result[key] = descriptor.value;
  }
  for (let index = 0; index < required.length; index++) {
    if (!contains(keys, required[index])) throw failure('INVALID_DATA');
  }
  return result;
}

function exact(value, fields) {
  return project(value, fields, [], fields);
}

function captureMethods(store) {
  if (typeof store !== 'object' || store === null || IS_PROXY(store)) {
    throw failure('INVALID_CONFIGURATION');
  }
  const found = { load: null, getOriginalRequest: null, retainOriginalRequest: null };
  let current = store;
  let depth = 0;
  while (current !== null && depth < 8) {
    if (IS_PROXY(current)) throw failure('INVALID_CONFIGURATION');
    for (let index = 0; index < STORE_METHODS.length; index++) {
      const name = STORE_METHODS[index];
      if (found[name] !== null) continue;
      const descriptor = DESCRIPTOR(current, name);
      if (descriptor === undefined) continue;
      if (!HAS_OWN(descriptor, 'value') || typeof descriptor.value !== 'function'
          || IS_PROXY(descriptor.value)) throw failure('INVALID_CONFIGURATION');
      found[name] = descriptor.value;
    }
    current = PROTOTYPE(current);
    depth++;
  }
  if (current !== null || found.load === null || found.getOriginalRequest === null
      || found.retainOriginalRequest === null) throw failure('INVALID_CONFIGURATION');
  return FREEZE(found);
}

function bounded(value, limit) {
  if (typeof value !== 'string' || value.length === 0 || value.length > limit
      || APPLY(BYTE_LENGTH, Buffer, [value, 'utf8']) > limit) {
    throw failure('INVALID_DATA');
  }
}

function safePromise(value) {
  try {
    if (typeof value !== 'object' || value === null || IS_PROXY(value)
        || !IS_PROMISE(value) || PROTOTYPE(value) !== PROMISE_PROTOTYPE) return false;
    const ownConstructor = DESCRIPTOR(value, 'constructor');
    if (ownConstructor !== undefined
        && (!HAS_OWN(ownConstructor, 'value') || ownConstructor.value !== NativePromise)) {
      return false;
    }
    const constructor = DESCRIPTOR(PROMISE_PROTOTYPE, 'constructor');
    if (!constructor || !HAS_OWN(constructor, 'value')
        || constructor.value !== NativePromise) return false;
    const species = DESCRIPTOR(NativePromise, SPECIES);
    if (!species || !NATIVE_SPECIES) return false;
    if (HAS_OWN(NATIVE_SPECIES, 'value')) {
      return HAS_OWN(species, 'value') && species.value === NATIVE_SPECIES.value;
    }
    return !HAS_OWN(species, 'value') && species.get === NATIVE_SPECIES.get
      && species.set === NATIVE_SPECIES.set;
  } catch {
    return false;
  }
}

function capability() {
  let resolve, reject;
  const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  return FREEZE({ promise, resolve, reject });
}

function rejected(code) {
  const result = capability();
  result.reject(failure(code));
  return result.promise;
}

function failure(suffix) {
  const code = PREFIX + suffix;
  const error = new TYPE_ERROR(code);
  DEFINE(error, 'code', { value: code, enumerable: true });
  DEFINE(error, 'stack', {
    value: 'TypeError: ' + code,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  FREEZE(error);
  APPLY(WEAK_SET, ERROR_CODES, [error, suffix]);
  return error;
}

function known(error) {
  return APPLY(WEAK_GET, ERROR_CODES, [error]);
}
