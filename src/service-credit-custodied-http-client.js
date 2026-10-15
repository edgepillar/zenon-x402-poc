import { types as utilTypes } from 'node:util';
import {
  snapshotOriginalServiceRequestCustodyPolicy,
  snapshotOriginalServiceRequestCustodyKey,
} from './service-credit-original-request-custody-contract.js';
import {
  createServiceCreditCustodiedRequestOwner,
} from './service-credit-custodied-request-owner.js';
import {
  createServiceCreditHttpExecuteDispatch,
} from './service-credit-http-execute-dispatch.js';

const APPLY = Reflect.apply;
const OWN_KEYS = Reflect.ownKeys;
const DESCRIPTOR = Object.getOwnPropertyDescriptor;
const PROTOTYPE = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const DEFINE = Object.defineProperty;
const FREEZE = Object.freeze;
const IS = Object.is;
const IS_SAFE = Number.isSafeInteger;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const TYPE_ERROR = TypeError;
const NativePromise = Promise;
const JSON_PARSE = JSON.parse;
const POLICY = snapshotOriginalServiceRequestCustodyPolicy;
const KEY = snapshotOriginalServiceRequestCustodyKey;
const CREATE_OWNER = createServiceCreditCustodiedRequestOwner;
const CREATE_DISPATCH = createServiceCreditHttpExecuteDispatch;
const PREFIX = 'SERVICE_CREDIT_CUSTODIED_HTTP_CLIENT_';

const CONFIG_FIELDS = FREEZE([
  'store', 'fundingResourceUrl', 'custodyPolicy', 'selectedGrantId',
  'requestImpl', 'deadlineMs',
]);
const INPUT_FIELDS = FREEZE([
  'grantId', 'requestId', 'originalRequestJson', 'originalBodyBase64',
  'serviceResourceUrl', 'authorizationHeader',
]);

/**
 * Explicit selected-grant composition of the existing custody owner and
 * one-use bodyless HTTP dispatch adapter.
 *
 * No default transport, signer, verifier, payment operation or activation.
 * Authorization is checked only as canonical syntax and declared metadata.
 * BOUND is an existing declared precondition, not payer/provider/policy
 * authority. Current authority and real readiness remain external gates.
 *
 * The borrowed store must implement the reviewed synchronous interface.
 * The actual owner performs retention, readback and current-binding checks.
 * Existing records are never automatically dispatched.
 *
 * A fresh dispatcher is created before any store operation for each
 * preflighted submission. The owner invokes its private callback
 * synchronously during submitOriginal, after the custody fence. Its returned
 * native Promise observes the dispatcher's request/response lifecycle.
 *
 * No unused dispatcher is kept in client history. The last-transport slot
 * is assigned only when that private callback is actually invoked.
 * References are released where feasible; JavaScript string erasure and
 * removal of caller/native copies are not promised.
 *
 * close directly delegates to the owner. It has the same cached native
 * Promise identity, synchronously closes admission and never closes the
 * borrowed store. Rejection proves neither delivery nor external cleanup.
 * deadlineMs remains abort initiation, not a hard lifetime/cancellation bound.
 *
 * Captured native intrinsics and component implementations are premises.
 */
export function createServiceCreditCustodiedHttpClient(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');

  let config, policy, selectedKey, owner;
  try {
    config = exact(configuration, CONFIG_FIELDS);
    if (typeof config.requestImpl !== 'function' || IS_PROXY(config.requestImpl)
        || !IS_SAFE(config.deadlineMs) || config.deadlineMs < 1
        || config.deadlineMs > 60000 || IS(config.deadlineMs, -0)) {
      throw failure('INVALID_CONFIGURATION');
    }
    policy = POLICY(config.custodyPolicy, config.fundingResourceUrl);
    selectedKey = KEY({
      grantId: config.selectedGrantId,
      requestId: 'scope',
    });
    owner = CREATE_OWNER({
      store: config.store,
      fundingResourceUrl: config.fundingResourceUrl,
      custodyPolicy: policy,
      selectedGrantId: selectedKey.grantId,
    });
  } catch {
    throw failure('INVALID_CONFIGURATION');
  }

  const requestImpl = config.requestImpl;
  const deadlineMs = config.deadlineMs;
  const selectedGrantId = selectedKey.grantId;
  const serviceResourceUrl = policy.serviceResourceUrl;
  const OWNER_SUBMIT = owner.submitOriginal;
  const OWNER_READ = owner.readOriginal;
  const OWNER_SNAPSHOT = owner.snapshot;
  const OWNER_CLOSE = owner.close;
  let lastTransport = null;

  config = null;
  policy = null;
  selectedKey = null;
  owner = null;
  configuration = null;

  function submitOriginal(...args) {
    if (args.length !== 1) return rejected('INVALID_INPUT');

    // These are observations of the owner's state, not a second lifecycle.
    const state = OWNER_SNAPSHOT();
    if (state.closed) return rejected('CLOSED');
    if (state.active) return rejected('BUSY');
    if (state.uncertainty.submission || state.uncertainty.undrained) {
      return rejected('SUBMISSION_OUTCOME_UNKNOWN');
    }
    if (state.uncertainty.custody) {
      return rejected('CUSTODY_OUTCOME_UNKNOWN');
    }

    let input = null;
    let metadata = null;
    let callbackAdapter = null;
    let rejectionCode = 'INVALID_INPUT';

    try {
      input = exact(args[0], INPUT_FIELDS);
      const key = KEY({
        grantId: input.grantId,
        requestId: input.requestId,
      });
      if (key.grantId !== selectedGrantId) {
        rejectionCode = 'FOREIGN_GRANT';
        throw failure('FOREIGN_GRANT');
      }
      if (input.originalBodyBase64 !== ''
          || input.serviceResourceUrl !== serviceResourceUrl) {
        throw failure('INVALID_INPUT');
      }

      // This factory performs the actual canonical original/auth metadata
      // preflight. It performs no store access and selects no transport.
      callbackAdapter = CREATE_DISPATCH({
        resourceUrl: input.serviceResourceUrl,
        originalRequestJson: input.originalRequestJson,
        authorizationHeader: input.authorizationHeader,
        deadlineMs,
        requestImpl,
      });

      // The dispatcher has already validated and bounded this canonical JSON.
      // Only bind its IDs to the explicit key here; do not recreate its schema
      // or the custody envelope/checksum/funding state machine.
      const original = JSON_PARSE(input.originalRequestJson);
      if (original.grantId !== key.grantId
          || original.requestId !== key.requestId) {
        throw failure('INVALID_INPUT');
      }

      // Authorization is deliberately excluded from the owner's input.
      metadata = {
        grantId: key.grantId,
        requestId: key.requestId,
        originalRequestJson: input.originalRequestJson,
        originalBodyBase64: input.originalBodyBase64,
        serviceResourceUrl: input.serviceResourceUrl,
      };
    } catch {
      callbackAdapter = null;
      metadata = null;
      input = null;
      args = null;
      return rejected(rejectionCode);
    }

    function dispatchRetained(record) {
      const selected = callbackAdapter;
      callbackAdapter = null;
      if (selected === null) throw failure('DISPATCH_UNAVAILABLE');
      lastTransport = selected;
      return APPLY(selected.dispatch, undefined, [record]);
    }

    try {
      return OWNER_SUBMIT(metadata, FREEZE(dispatchRetained));
    } finally {
      // The actual synchronous owner either invoked the callback or refused
      // before it. Do not retain an unused adapter/Authorization afterward.
      callbackAdapter = null;
      metadata = null;
      input = null;
      args = null;
    }
  }

  function readOriginal(...args) {
    if (args.length !== 1) throw failure('INVALID_INPUT');
    // The actual owner enforces selected scope, busy/closed checks and binding.
    // Recovery metadata never invokes a dispatcher or grants send authority.
    return OWNER_READ(args[0]);
  }

  function snapshot(...args) {
    if (args.length !== 0) throw failure('INVALID_INPUT');
    return FREEZE({
      owner: OWNER_SNAPSHOT(),
      lastTransport: lastTransport === null ? null : lastTransport.snapshot(),
      storeOwnership: 'BORROWED',
      boundEstablishesAuthority: false,
      qualification: 'SYNTHETIC_COMPOSITION_ONLY',
      serviceDelivery: 'NOT_ESTABLISHED',
      currentAuthority: 'NOT_ESTABLISHED',
      realReady: 'NOT_ESTABLISHED',
      durability: 'NOT_ESTABLISHED',
      restart: 'NOT_ESTABLISHED',
      pilot: 'NOT_ESTABLISHED',
    });
  }

  function close(...args) {
    if (args.length !== 0) return rejected('INVALID_INPUT');
    // Do not wrap/chain this promise or duplicate the owner's close state.
    return OWNER_CLOSE();
  }

  return FREEZE({
    submitOriginal: FREEZE(submitOriginal),
    readOriginal: FREEZE(readOriginal),
    snapshot: FREEZE(snapshot),
    close: FREEZE(close),
  });
}

function exact(value, fields) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value)
      || PROTOTYPE(value) !== OBJECT_PROTOTYPE) throw failure('INVALID_INPUT');
  const keys = OWN_KEYS(value);
  if (keys.length !== fields.length) throw failure('INVALID_INPUT');
  const result = {};
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    const descriptor = DESCRIPTOR(value, field);
    if (descriptor === undefined || descriptor.enumerable !== true
        || !HAS_OWN(descriptor, 'value')) throw failure('INVALID_INPUT');
    result[field] = descriptor.value;
  }
  return result;
}

function rejected(suffix) {
  return new NativePromise((resolve, reject) => {
    reject(failure(suffix));
  });
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
  return FREEZE(error);
}
