import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import {
  snapshotOriginalServiceRequestCustodyPolicy,
  snapshotOriginalServiceRequestCustodyKey,
  captureOriginalServiceRequestCustody,
  parseOriginalServiceRequestCustody,
  serializeOriginalServiceRequestCustody,
  captureOriginalServiceDispatchIntent,
  parseOriginalServiceDispatchIntent,
  serializeOriginalServiceDispatchIntent,
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
const ARRAY_PROTOTYPE = Array.prototype;
const ARRAY_IS_ARRAY = Array.isArray;
const IS_FROZEN = Object.isFrozen;
const STRING = String;
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
const CAPTURE_INTENT = captureOriginalServiceDispatchIntent;
const PARSE_INTENT = parseOriginalServiceDispatchIntent;
const SERIALIZE_INTENT = serializeOriginalServiceDispatchIntent;
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
  return createOwner(configuration, false);
}
/** V3 opts into a committed original-bound fence before the actual callback. */
export function createServiceCreditCustodiedRequestOwnerV3(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return createOwner(configuration, true);
}
function createOwner(configuration, dispatchIntentEnabled) {
  let config, policy, methods, selectedKey;
  try {
    config = exact(configuration, CONFIG_FIELDS);
    policy = POLICY(config.custodyPolicy, config.fundingResourceUrl);
    selectedKey = KEY({ grantId: config.selectedGrantId, requestId: 'scope' });
    methods = captureMethods(config.store, dispatchIntentEnabled);
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
  if (dispatchIntentEnabled) {
    counts.intentWrites = 0;
    counts.intentReads = 0;
    counts.intentReadbackConfirmations = 0;
  }
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
      const returned = APPLY(methods[name], store, args);
      observeStorePromise(returned);
      return returned;
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

  function intentForCurrent(raw, key, current, original) {
    try {
      const text = SERIALIZE_INTENT(raw), intent = PARSE_INTENT(text);
      const expected = CAPTURE_INTENT(original, {
        fundingRevision: current.revision,
        challengeDigest: intent.challengeDigest,
        paymentDigest: intent.paymentDigest,
        custodyPolicy: policy,
      });
      if (current.status !== 'BOUND' || intent.grantId !== key.grantId
          || intent.requestId !== key.requestId
          || intent.fundingResourceUrl !== current.fundingResourceUrl
          || intent.paymentHash !== current.paymentHash || intent.network !== current.network
          || SERIALIZE_INTENT(expected) !== text) throw failure('INVALID_DATA');
      return { record: intent, text };
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
      if (dispatchIntentEnabled && methods.listOriginalRequestKeys !== null) {
        // The complete global catalog can refuse before retention starts.
        // It reserves no capacity; the later store write stays authoritative.
        const keys = captureRecoveryKeys(callStore('listOriginalRequestKeys', [], 'recordReads'));
        let afterCatalog;
        try {
          afterCatalog = currentFunding();
        } catch (error) {
          if (known(error) === 'FUNDING_REQUIRED') holdCustody();
          throw error;
        }
        if (!sameFunding(current, afterCatalog)) {
          holdCustody();
          throw failure('CUSTODY_OUTCOME_UNKNOWN');
        }
        if (closed) throw failure('CLOSED');
        for (let index = 0; index < keys.length; index++) {
          if (keys[index].grantId === key.grantId && keys[index].requestId === key.requestId) {
            holdCustody();
            throw failure('CUSTODY_OUTCOME_UNKNOWN');
          }
        }
        if (keys.length === policy.maxRequests) throw failure('CAPACITY');
      }
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
      if (dispatchIntentEnabled) {
        phase = 'FENCING_DISPATCH_INTENT';
        const fenced = intentForCurrent(callStore('fenceOriginalDispatchIntent', [key],
          'intentWrites'), key, current, readback.record);
        const confirmed = intentForCurrent(callStore('getOriginalDispatchIntent', [key],
          'intentReads'), key, current, readback.record);
        if (confirmed.text !== fenced.text) {
          holdCustody();
          throw failure('CUSTODY_OUTCOME_UNKNOWN');
        }
        const afterIntent = currentFunding();
        if (!sameFunding(current, afterIntent)) {
          holdCustody();
          throw failure('CUSTODY_OUTCOME_UNKNOWN');
        }
        counts.intentReadbackConfirmations++;
        if (closed) throw failure('RECOVERY_REQUIRED');
      }

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
      if (raw === null) {
        if (closed) throw failure('CLOSED');
        return null;
      }
      if (raw === undefined) {
        holdCustody();
        throw failure('CUSTODY_OUTCOME_UNKNOWN');
      }
      const record = recordForCurrent(raw, key, current).record;
      let latest;
      try {
        latest = currentFunding();
      } catch {
        holdCustody();
        throw failure('CUSTODY_OUTCOME_UNKNOWN');
      }
      if (!sameFunding(current, latest)) {
        holdCustody();
        throw failure('CUSTODY_OUTCOME_UNKNOWN');
      }
      // Reentrant close fences output after complete custody validation.
      if (closed) throw failure('CLOSED');
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

  /**
   * Frozen redacted DATA: { original, funding, uncertainty, evidence,
   * qualification, authority, serviceOutcome }. Funding is the existing
   * validated local-store projection, including its exact raw status. It is
   * not independently authenticated funding/inclusion or permission to send.
   * The complete funding fence also applies when no original is retained.
   */
  function readOriginalRecoveryState(keyValue) {
    if (closed) throw failure('CLOSED');
    if (active) throw failure('BUSY');
    let key;
    try {
      if (arguments.length !== 1) throw failure('INVALID_INPUT');
      key = KEY(keyValue);
      requireScope(key);
    } catch (error) {
      throw failure(known(error) ?? 'INVALID_INPUT');
    }
    active = true;
    try {
      const current = currentFunding();
      if (closed) throw failure('CLOSED');
      const raw = callStore('getOriginalRequest', [key], 'recordReads');
      if (raw === undefined) {
        holdCustody();
        throw failure('CUSTODY_OUTCOME_UNKNOWN');
      }
      const original = raw === null
        ? null : recordForCurrent(raw, key, current).record;
      let dispatchIntent = null;
      if (dispatchIntentEnabled && original !== null) {
        const intentRaw = callStore('getOriginalDispatchIntent', [key], 'intentReads');
        if (intentRaw !== null) dispatchIntent = intentForCurrent(intentRaw, key, current, original).record;
      }
      let latest;
      try {
        latest = currentFunding();
      } catch {
        holdCustody();
        throw failure('CUSTODY_OUTCOME_UNKNOWN');
      }
      if (!sameFunding(current, latest)) {
        holdCustody();
        throw failure('CUSTODY_OUTCOME_UNKNOWN');
      }
      if (closed) throw failure('CLOSED');
      if (original === null) return null;
      return FREEZE({
        original,
        funding: latest,
        uncertainty: FREEZE({
          custody: custodyUncertainty,
          submission: submissionUncertainty,
          undrained: unknownUndrained,
          declaredFundingAmbiguitySeen: fundingAmbiguityObserved,
        }),
        evidence: 'LOCAL_STORE_DECLARED_RECOVERY_STATE',
        qualification: 'UNQUALIFIED',
        authority: 'NONE',
        serviceOutcome: 'NOT_ESTABLISHED',
        ...(dispatchIntentEnabled ? {
          dispatchIntent,
          dispatchStatus: dispatchIntent === null ? 'NO_INTENT_RECORDED' : 'POSSIBLY_ATTEMPTED',
        } : {}),
      });
    } catch (error) {
      const code = known(error);
      if (code === undefined) holdCustody();
      throw failure(code ?? 'CUSTODY_OUTCOME_UNKNOWN');
    } finally {
      active = false;
      settleClose();
    }
  }

  function captureRecoveryKeys(raw) {
    const captured = [];
    try {
      if (typeof raw !== 'object' || raw === null || IS_PROXY(raw) || IS_PROMISE(raw)
          || !ARRAY_IS_ARRAY(raw) || PROTOTYPE(raw) !== ARRAY_PROTOTYPE || !IS_FROZEN(raw)) {
        throw failure('INVALID_DATA');
      }
      const length = DESCRIPTOR(raw, 'length');
      if (!length || !HAS_OWN(length, 'value') || length.enumerable || length.writable
          || length.configurable || !IS_SAFE(length.value) || length.value < 0
          || IS(length.value, -0) || length.value > policy.maxRequests) {
        throw failure('INVALID_DATA');
      }
      const names = OWN_KEYS(raw);
      if (names.length !== length.value + 1 || names[length.value] !== 'length') {
        throw failure('INVALID_DATA');
      }
      let prior = null;
      for (let index = 0; index < length.value; index++) {
        if (names[index] !== STRING(index)) throw failure('INVALID_DATA');
        const element = DESCRIPTOR(raw, names[index]);
        if (!element || !HAS_OWN(element, 'value') || !element.enumerable
            || element.writable || element.configurable) throw failure('INVALID_DATA');
        const value = element.value;
        if (typeof value !== 'object' || value === null || IS_PROXY(value) || IS_PROMISE(value)
            || PROTOTYPE(value) !== OBJECT_PROTOTYPE || !IS_FROZEN(value)) {
          throw failure('INVALID_DATA');
        }
        const fields = OWN_KEYS(value);
        if (fields.length !== 2 || fields[0] !== 'grantId' || fields[1] !== 'requestId') {
          throw failure('INVALID_DATA');
        }
        for (let field = 0; field < fields.length; field++) {
          const descriptor = DESCRIPTOR(value, fields[field]);
          if (!descriptor || !HAS_OWN(descriptor, 'value') || !descriptor.enumerable
              || descriptor.writable || descriptor.configurable) throw failure('INVALID_DATA');
        }
        const key = KEY(value);
        if (prior !== null && (prior.grantId > key.grantId
            || (prior.grantId === key.grantId && prior.requestId >= key.requestId))) {
          throw failure('INVALID_DATA');
        }
        captured[captured.length] = key;
        prior = key;
      }
    } catch {
      holdCustody();
      throw failure('CUSTODY_OUTCOME_UNKNOWN');
    }
    return captured;
  }

  /**
   * V3-only scoped local snapshot, never journal completeness or send authority.
   * One logical recordReads increment denotes one full store catalog call,
   * including an empty result; existing action/intent counters are unchanged.
   * The optional capability is not required of older injected V3 stores.
   */
  function readOriginalRecoveryKeys() {
    if (closed) throw failure('CLOSED');
    if (active) throw failure('BUSY');
    if (arguments.length !== 0) throw failure('INVALID_INPUT');
    if (methods.listOriginalRequestKeys === null) throw failure('RECOVERY_KEYS_UNAVAILABLE');
    active = true;
    try {
      const current = currentFunding();
      if (closed) throw failure('CLOSED');
      const captured = captureRecoveryKeys(callStore('listOriginalRequestKeys', [], 'recordReads'));
      let latest;
      try {
        latest = currentFunding();
      } catch {
        holdCustody();
        throw failure('CUSTODY_OUTCOME_UNKNOWN');
      }
      if (!sameFunding(current, latest)) {
        holdCustody();
        throw failure('CUSTODY_OUTCOME_UNKNOWN');
      }
      if (closed) throw failure('CLOSED');
      const keys = [];
      for (let index = 0; index < captured.length; index++) {
        if (captured[index].grantId === selectedGrantId) keys[keys.length] = captured[index];
      }
      return FREEZE({
        grantId: selectedGrantId,
        keys: FREEZE(keys),
        funding: latest,
        uncertainty: FREEZE({
          custody: custodyUncertainty,
          submission: submissionUncertainty,
          undrained: unknownUndrained,
          declaredFundingAmbiguitySeen: fundingAmbiguityObserved,
        }),
        evidence: 'LOCAL_STORE_DECLARED_RECOVERY_KEYS',
        qualification: 'UNQUALIFIED',
        authority: 'NONE',
        serviceOutcome: 'NOT_ESTABLISHED',
        mayStartPayment: false,
        maySignPayment: false,
        mayDispatchService: false,
        deliveryConfirmed: false,
      });
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
    readOriginalRecoveryState: FREEZE(readOriginalRecoveryState),
    ...(dispatchIntentEnabled ? { readOriginalRecoveryKeys: FREEZE(readOriginalRecoveryKeys) } : {}),
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

function captureMethods(store, dispatchIntentEnabled) {
  if (typeof store !== 'object' || store === null || IS_PROXY(store)) {
    throw failure('INVALID_CONFIGURATION');
  }
  const found = { load: null, getOriginalRequest: null, retainOriginalRequest: null };
  const names = dispatchIntentEnabled
    ? [...STORE_METHODS, 'fenceOriginalDispatchIntent', 'getOriginalDispatchIntent',
      'listOriginalRequestKeys'] : STORE_METHODS;
  if (dispatchIntentEnabled) {
    found.fenceOriginalDispatchIntent = null;
    found.getOriginalDispatchIntent = null;
    found.listOriginalRequestKeys = null;
  }
  let current = store;
  let depth = 0;
  while (current !== null && depth < 8) {
    if (IS_PROXY(current)) throw failure('INVALID_CONFIGURATION');
    for (let index = 0; index < names.length; index++) {
      const name = names[index];
      if (found[name] !== null) continue;
      const descriptor = DESCRIPTOR(current, name);
      if (descriptor === undefined) continue;
      if (!HAS_OWN(descriptor, 'value') || typeof descriptor.value !== 'function'
          || IS_PROXY(descriptor.value)) {
        if (name === 'listOriginalRequestKeys') {
          // An unusable optional descriptor is not a callable DATA capability.
          // Block prototype fallback without invoking a getter/proxy/function.
          found[name] = false;
          continue;
        }
        throw failure('INVALID_CONFIGURATION');
      }
      found[name] = descriptor.value;
    }
    current = PROTOTYPE(current);
    depth++;
  }
  if (current !== null || found.load === null || found.getOriginalRequest === null
      || found.retainOriginalRequest === null
      || (dispatchIntentEnabled && (found.fenceOriginalDispatchIntent === null
        || found.getOriginalDispatchIntent === null))) throw failure('INVALID_CONFIGURATION');
  if (dispatchIntentEnabled && found.listOriginalRequestKeys === false) {
    found.listOriginalRequestKeys = null;
  }
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

function observeStorePromise(value) {
  if (!safePromise(value)) return;
  try {
    // Only observe supported native Promises; preserve the identical raw value
    // for synchronous validation. Neither reaction forwards values or reasons.
    APPLY(THEN, value, [() => undefined, () => undefined]);
  } catch {
    // Native/global observation faults remain unqualified. No async store
    // acceptance, successful outcome, resumption, cleanup or retry is inferred.
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
