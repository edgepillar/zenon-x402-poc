import { types as utilTypes } from 'node:util';
import { Buffer } from 'node:buffer';

/*
 * Inert on import. No node:test registration or automatic dispatch.
 *
 * Qualification entry point:
 *   characterizeOfficialX402Contexts(catalog, host?)
 *
 * createCharacterizationBoundary is exported only for the companion
 * pending-characterization module.
 *
 * Required external prerequisites:
 *
 * - Independently admit the complete bundle and actual package/dependency
 *   sources before evaluating them.
 * - Impose a finite aggregate deadline and reviewed memory boundary.
 * - Supply original same-realm ESM namespaces and pristine intrinsics.
 * - Privately register original binding/function identities before use.
 *
 * Scope strings, frozen records, fixture labels and version strings
 * are not source provenance or payment authority.
 *
 * The admission WeakMap is a private reviewed-host prerequisite.
 * A dishonest host can mislabel sources. Registration after evaluation
 * does not retroactively authenticate evaluation.
 *
 * Exact frozen own-data host contract:
 *
 * {
 *   scope: 'REVIEWED_X402_CHARACTERIZATION_HOST_V1',
 *   admissions: genuine WeakMap with no own metadata,
 *   sdk: {
 *     '2.23.0': null | binding,
 *     '2.28.0': null | binding
 *   }
 * }
 *
 * binding:
 * {
 *   scope: 'ORIGINAL_X402_NAMESPACE_BINDING_V1',
 *   version,
 *   server: original @x402/core/server ESM namespace,
 *   facilitator: original @x402/core/facilitator ESM namespace,
 *   types: original @x402/core/types ESM namespace
 * }
 *
 * admissions.get(binding), frozen own-data:
 * {
 *   version,
 *   contextMethod: original buildFacilitatorContext | null,
 *   flowFunction: original resolvePaymentFlow | null,
 *   pendingMethod: original settleWithPendingRetry | null,
 *   SettleError: original SettleError | null
 * }
 *
 * Exact original function identities must match their namespace or
 * prototype locations. No wrappers or fallback SDK implementations.
 *
 * This lane characterizes compiled methods, not complete public
 * registration, a Zenon facilitator, or an existing bridge.
 *
 * Context lane:
 * - Two actual context-method slots, one per version.
 * - Six actual flow subprobes, three per version.
 * - Six version-independent modeled authority subcases, run once each.
 *
 * The modeled matrix is not duplicated under SDK version labels.
 * Its original server-owned challenge is an independent fixture
 * baseline. Payload-derived copies and SDK contexts cannot replace it.
 *
 * No file, process, SQL, listener, timer, transport, wallet, RPC, signing,
 * publication or operational authority is supplied.
 *
 * Native reflection and allocation still depend on the external
 * execution/memory boundary. This is not a hostile-code sandbox.
 */

const F = Object.freeze;
const CREATE = Object.create;
const KEYS = Reflect.ownKeys;
const DESC = Object.getOwnPropertyDescriptor;
const PROTO = Object.getPrototypeOf;
const APPLY = Reflect.apply;
const CONSTRUCT = Reflect.construct;
const HAS_OWN = Object.prototype.hasOwnProperty;
const IS_ARRAY = Array.isArray;
const IS_FROZEN = Object.isFrozen;
const IS_SAFE_INTEGER = Number.isSafeInteger;
const JSON_STRINGIFY = JSON.stringify;
const JSON_PARSE = JSON.parse;
const IS_PROXY = utilTypes.isProxy;
const IS_PROMISE = utilTypes.isPromise;
const IS_NAMESPACE = utilTypes.isModuleNamespaceObject;
const WEAK_GET = WeakMap.prototype.get;
const WEAK_SET = WeakMap.prototype.set;
const WEAK_PROTO = WeakMap.prototype;
const OBJECT_PROTO = Object.prototype;
const ARRAY_PROTO = Array.prototype;
const NATIVE_PROMISE = Promise;
const PROMISE_PROTO = Promise.prototype;
const PROMISE_THEN = Promise.prototype.then;
const PROMISE_CONSTRUCTOR_DESCRIPTOR = DESC(PROMISE_PROTO, 'constructor');
const PROMISE_THEN_DESCRIPTOR = DESC(PROMISE_PROTO, 'then');
const PROMISE_SPECIES_DESCRIPTOR = DESC(NATIVE_PROMISE, Symbol.species);

const TOKEN = F(CREATE(null));
const VERSIONS = F(['2.23.0', '2.28.0']);

const AUTHORITY_SUBCASES = F([
  'ORIGINAL_SERVER_CONTEXT',
  'MISSING_CONTEXT',
  'EXTENSION_CONTEXT_SUBSTITUTED',
  'PAYLOAD_DERIVED_EQUAL_COPY',
  'MUTATED_SELECTED_REQUIREMENT',
  'CROSS_RESOURCE'
]);

const FLOW_SUBCASES = F([
  'EXPLICIT_UPFRONT',
  'OMITTED_FLOW',
  'UNSUPPORTED_FLOW'
]);

const DEFINITIONS = F([
  F({
    id: 'CONTEXT_AUTHORITY_MATRIX',
    kind: 'CONTEXT',
    sdkSubcases: F(['EXTENSION_CONTEXT_ONLY']),
    modeledSubcases: AUTHORITY_SUBCASES
  }),
  F({
    id: 'UPFRONT_FLOW_POLICY',
    kind: 'CONTEXT',
    sdkSubcases: FLOW_SUBCASES
  }),
  F({ id: 'PENDING_RESULT', kind: 'PENDING' }),
  F({ id: 'PENDING_TYPED_ERROR', kind: 'PENDING' }),
  F({ id: 'PENDING_TWICE', kind: 'PENDING' }),
  F({ id: 'PENDING_WITHOUT_TRANSACTION', kind: 'PENDING' }),
  F({ id: 'FIRST_CALL_SUCCESS', kind: 'PENDING' }),
  F({ id: 'NONPENDING_FAILED_RESULT', kind: 'PENDING' }),
  F({ id: 'GENERIC_THROWN_ERROR', kind: 'PENDING' }),
  F({ id: 'UNKNOWN_IS_NOT_ACKNOWLEDGED', kind: 'PENDING' }),
  F({ id: 'TRUTHY_INVALID_TRANSACTION', kind: 'PENDING' }),
  F({ id: 'CONSUMED_CONTEXT_GAP', kind: 'PREDICTED_GAP' }),
  F({ id: 'CONTROL_MUTATION', kind: 'SYNTHETIC_ASSERTION_CONTROL' }),
  F({ id: 'CONTROL_REPLACEMENT', kind: 'SYNTHETIC_ASSERTION_CONTROL' }),
  F({ id: 'CONTROL_TRANSACTION_DRIFT', kind: 'SYNTHETIC_ASSERTION_CONTROL' }),
  F({ id: 'CONTROL_PENDING_AUTHORIZATION', kind: 'SYNTHETIC_ASSERTION_CONTROL' })
]);

const LIMITS = F({
  templates: 16,
  versionSpecificSlots: 28,
  modeledAuthoritySubcases: 6,
  syntheticControlSlots: 4,
  totalRecords: 38,
  acceptedSettleCallsPerScenario: 2,
  representationUtf8Bytes: 4096,
  encodedHeaderBytes: 8192,
  catalogUtf8Bytes: 16384
});

const ACTUAL_STATUSES = F([
  'OBSERVED_MATCH',
  'OBSERVED_DIFFERENCE',
  'NOT_RUN',
  'NOT_ADMITTED'
]);

const MODELED_STATUSES = F([
  'CHECK_MATCH',
  'CHECK_FAILED',
  'CONTROL_DETECTED',
  'CONTROL_MISSED',
  'NOT_RUN'
]);

const REASONS = F([
  'MATCH',
  'DIFFERENCE',
  'HOST_NOT_SUPPLIED',
  'HOST_INVALID',
  'SDK_NOT_SUPPLIED',
  'SDK_BINDING_INVALID',
  'SOURCE_NOT_ADMITTED',
  'SDK_ENTRY_ABSENT',
  'INPUT_INVALID',
  'CALL_REJECTED',
  'CALL_RESULT_INVALID',
  'INVARIANT_VIOLATION',
  'PREDICTED_UNEXECUTED',
  'SYNTHETIC_ONLY',
  'CONTROL_DETECTED',
  'CONTROL_MISSED',
  'NOT_RUN'
]);

const COUNTER_MAXIMA = F({
  sdkCalls: 2,
  settleCalls: 2,
  rejectedSettleEntries: 1,
  modeledReplacementCreates: 1,
  modeledSigns: 1,
  modeledPublishes: 1,
  modeledServiceCalls: 1,
  modeledStrictIdentityRejections: 2
});

let contextEntryConsumed = false;

function R(values) {
  const result = CREATE(null);
  for (const key of Object.keys(values)) result[key] = values[key];
  return F(result);
}

function check(condition) {
  if (!condition) throw TOKEN;
}

function data(value, key, optional = false) {
  check(
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    !IS_PROXY(value)
  );

  const descriptor = DESC(value, key);
  if (descriptor === undefined && optional) return undefined;

  check(
    descriptor !== undefined &&
    APPLY(HAS_OWN, descriptor, ['value'])
  );
  return descriptor.value;
}

function record(value, names, frozen = true) {
  check(
    value !== null &&
    typeof value === 'object' &&
    !IS_PROXY(value)
  );

  const prototype = PROTO(value);
  check(prototype === null || prototype === OBJECT_PROTO);
  if (frozen) check(IS_FROZEN(value));

  const keys = KEYS(value);
  check(keys.length === names.length);

  for (const name of names) {
    const descriptor = DESC(value, name);
    check(
      descriptor !== undefined &&
      descriptor.enumerable === true &&
      APPLY(HAS_OWN, descriptor, ['value'])
    );
  }

  return value;
}

function wellFormed(value) {
  for (let index = 0; index < value.length; index += 1) {
    const first = value.charCodeAt(index);

    if (first >= 0xd800 && first <= 0xdbff) {
      check(index + 1 < value.length);
      const second = value.charCodeAt(++index);
      check(second >= 0xdc00 && second <= 0xdfff);
    } else {
      check(first < 0xdc00 || first > 0xdfff);
    }
  }
}

/*
 * Descriptor-safe, bounded representation snapshot.
 * Preserves property order, exact strings and primitive representation.
 * No sorting, normalization, toJSON, getters or shared object aliases.
 */
function text(value, maximum = LIMITS.representationUtf8Bytes) {
  const seen = new Set();
  let nodes = 0;
  let members = 0;
  let bytes = 0;

  function emit(part) {
    bytes += Buffer.byteLength(part, 'utf8');
    check(bytes <= maximum);
    return part;
  }

  function visit(current, depth) {
    nodes += 1;
    check(nodes <= 256 && depth <= 8);

    if (current === null) return emit('null');

    if (typeof current === 'string') {
      check(current.length <= maximum);
      wellFormed(current);
      return emit(JSON_STRINGIFY(current));
    }

    if (typeof current === 'boolean') {
      return emit(current ? 'true' : 'false');
    }

    if (typeof current === 'number') {
      check(IS_SAFE_INTEGER(current) && !Object.is(current, -0));
      return emit(String(current));
    }

    check(
      typeof current === 'object' &&
      !IS_PROXY(current) &&
      !seen.has(current)
    );
    seen.add(current);

    if (IS_ARRAY(current)) {
      check(PROTO(current) === ARRAY_PROTO);

      const length = data(current, 'length');
      check(IS_SAFE_INTEGER(length) && length >= 0 && length <= 32);
      check(KEYS(current).length === length + 1);

      members += length;
      check(members <= 256);

      let result = emit('[');

      for (let index = 0; index < length; index += 1) {
        const descriptor = DESC(current, String(index));
        check(
          descriptor !== undefined &&
          descriptor.enumerable === true &&
          APPLY(HAS_OWN, descriptor, ['value'])
        );

        if (index !== 0) result += emit(',');
        result += visit(descriptor.value, depth + 1);
      }

      return result + emit(']');
    }

    const prototype = PROTO(current);
    check(prototype === null || prototype === OBJECT_PROTO);

    const keys = KEYS(current);
    check(keys.length <= 16);

    members += keys.length;
    check(members <= 256);

    let result = emit('{');

    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      check(typeof key === 'string' && key.length <= 64);
      wellFormed(key);

      const descriptor = DESC(current, key);
      check(
        descriptor !== undefined &&
        descriptor.enumerable === true &&
        APPLY(HAS_OWN, descriptor, ['value'])
      );

      if (index !== 0) result += emit(',');
      result += emit(JSON_STRINGIFY(key));
      result += emit(':');
      result += visit(descriptor.value, depth + 1);
    }

    return result + emit('}');
  }

  return visit(value, 0);
}

function clone(value) {
  return JSON_PARSE(text(value));
}

function freezeTree(value) {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) freezeTree(value[key]);
    F(value);
  }
  return value;
}

function header(value) {
  const encoded = Buffer.from(text(value), 'utf8').toString('base64');
  check(Buffer.byteLength(encoded, 'utf8') <= LIMITS.encodedHeaderBytes);
  return encoded;
}

function expectedCatalog() {
  return {
    schemaVersion: 1,
    scope: 'INERT_X402_CHARACTERIZATION_V1',
    versions: [...VERSIONS],
    limits: { ...LIMITS },
    templates: DEFINITIONS.map(definition => {
      const entry = {
        id: definition.id,
        kind: definition.kind
      };

      if (definition.sdkSubcases !== undefined) {
        entry.sdkSubcases = [...definition.sdkSubcases];
      }

      if (definition.modeledSubcases !== undefined) {
        entry.modeledSubcases = [...definition.modeledSubcases];
      }

      return entry;
    })
  };
}

function validateCatalog(catalog) {
  check(
    text(catalog, LIMITS.catalogUtf8Bytes) ===
    text(expectedCatalog(), LIMITS.catalogUtf8Bytes)
  );
}

/*
 * The original challenge is created by the synthetic server owner.
 * It is never reconstructed from the submitted payment.
 *
 * The outward selected-requirement view is privately linked to the
 * original selection. Both provenance and unchanged representation
 * remain necessary. Equal-looking client copies acquire neither.
 */
function fixture() {
  const originalChallenge = freezeTree({
    x402Version: 2,
    resource: {
      url: 'https://synthetic.invalid/paid',
      description: 'synthetic-resource',
      mimeType: 'application/json'
    },
    accepts: [{
      scheme: 'exact',
      network: 'synthetic:zenon',
      asset: 'synthetic-asset',
      amount: '1',
      payTo: 'synthetic-payee',
      maxTimeoutSeconds: 1,
      extra: { paymentFlow: 'upfront' }
    }]
  });

  const originalRequirement = originalChallenge.accepts[0];
  const requirement = clone(originalRequirement);

  const payment = {
    x402Version: 2,
    resource: clone(originalChallenge.resource),
    accepted: clone(originalRequirement),
    payload: {
      transaction: {
        id: 'synthetic-transaction-A',
        previous: 'synthetic-previous-A',
        sequence: 1
      },
      memo: 'synthetic opaque payment'
    }
  };

  const selectedOwners = new WeakMap();
  APPLY(WEAK_SET, selectedOwners, [requirement, originalRequirement]);

  const originalChallengeText = text(originalChallenge);
  const originalRequirementText = text(originalRequirement);
  const originalResourceText = text(originalChallenge.resource);
  const paymentText = text(payment);
  const requirementText = text(requirement);
  const paymentHeader = header(payment);

  function matchesOwnedFixture(challenge, selected, submitted) {
    try {
      return (
        challenge === originalChallenge &&
        APPLY(WEAK_GET, selectedOwners, [selected]) === originalRequirement &&
        text(challenge) === originalChallengeText &&
        text(selected) === originalRequirementText &&
        text(data(submitted, 'accepted')) === originalRequirementText &&
        text(data(submitted, 'resource')) === originalResourceText
      );
    } catch {
      return false;
    }
  }

  return R({
    originalChallenge,
    originalRequirement,
    requirement,
    payment,
    transaction: 'synthetic-transaction-A',
    paymentText,
    requirementText,
    paymentHeader,
    matchesOwnedFixture: F(matchesOwnedFixture)
  });
}

function counters() {
  const result = CREATE(null);
  result.counterStatus = 'EXACT';

  for (const name of Object.keys(COUNTER_MAXIMA)) result[name] = 0;
  return result;
}

function counterSnapshot(count) {
  try {
    record(
      count,
      ['counterStatus', ...Object.keys(COUNTER_MAXIMA)],
      false
    );

    const counterStatus = data(count, 'counterStatus');
    check(counterStatus === 'EXACT' || counterStatus === 'LOWER_BOUND');

    const values = CREATE(null);

    for (const name of Object.keys(COUNTER_MAXIMA)) {
      const number = data(count, name);
      check(
        IS_SAFE_INTEGER(number) &&
        number >= 0 &&
        number <= COUNTER_MAXIMA[name]
      );
      values[name] = number;
    }

    return R({ counterStatus, counts: F(values) });
  } catch {
    /*
     * An unreadable counter record is explicitly unavailable.
     * It is never replaced with invented zero counts.
     */
    return R({ counterStatus: 'UNAVAILABLE', counts: null });
  }
}

function markSdkDispatch(count) {
  if (count.sdkCalls >= COUNTER_MAXIMA.sdkCalls) {
    count.counterStatus = 'LOWER_BOUND';
    throw TOKEN;
  }
  count.sdkCalls += 1;
}

function reuseFaults(owned, payment, requirement, count) {
  const faults = [];

  if (payment !== owned.payment || requirement !== owned.requirement) {
    faults.push('REFERENCE_CHANGED');
  }

  try {
    if (
      text(payment) !== owned.paymentText ||
      text(requirement) !== owned.requirementText ||
      header(payment) !== owned.paymentHeader
    ) {
      faults.push('REPRESENTATION_CHANGED');
    }
  } catch {
    faults.push('REPRESENTATION_CHANGED');
  }

  if (
    count.modeledReplacementCreates !== 0 ||
    count.modeledSigns !== 0 ||
    count.modeledPublishes !== 0
  ) {
    faults.push('REPLACEMENT_WORK');
  }

  return F(faults);
}

function transactionMatches(response, owned) {
  try {
    return data(response, 'transaction') === owned.transaction;
  } catch {
    return false;
  }
}

function descriptorSame(left, right) {
  if (left === undefined || right === undefined) return left === right;

  return (
    left.value === right.value &&
    left.get === right.get &&
    left.set === right.set &&
    left.writable === right.writable &&
    left.enumerable === right.enumerable &&
    left.configurable === right.configurable
  );
}

function promiseRouteIntact() {
  return (
    descriptorSame(
      DESC(PROMISE_PROTO, 'constructor'),
      PROMISE_CONSTRUCTOR_DESCRIPTOR
    ) &&
    descriptorSame(
      DESC(PROMISE_PROTO, 'then'),
      PROMISE_THEN_DESCRIPTOR
    ) &&
    descriptorSame(
      DESC(NATIVE_PROMISE, Symbol.species),
      PROMISE_SPECIES_DESCRIPTOR
    )
  );
}

/*
 * Dispatch is counted immediately before Reflect.apply.
 * Raw thrown values are discarded and never enter reports.
 *
 * Arbitrary thenables are boxed as data, never awaited or inspected
 * through .then. Expected-result checks reject unsupported shapes.
 *
 * Unsupported genuine Promise routes fail closed. The independent host
 * remains responsible for containment and the aggregate deadline.
 */
async function invoke(callable, receiver, args, count) {
  check(promiseRouteIntact());

  let value;

  markSdkDispatch(count);
  try {
    value = APPLY(callable, receiver, args);
  } catch {
    return R({ kind: 'THREW', value: null });
  }

  if (!IS_PROMISE(value)) {
    return R({ kind: 'RETURNED', value });
  }

  check(
    !IS_PROXY(value) &&
    PROTO(value) === PROMISE_PROTO &&
    KEYS(value).length === 0 &&
    promiseRouteIntact()
  );

  const observed = APPLY(PROMISE_THEN, value, [
    result => R({ kind: 'RETURNED', value: result }),
    () => R({ kind: 'THREW', value: null })
  ]);

  return await observed;
}

function constructActual(constructor, args, count) {
  markSdkDispatch(count);
  return CONSTRUCT(constructor, args);
}

function optionalFunction(value) {
  if (value === undefined || value === null) return null;
  check(typeof value === 'function' && !IS_PROXY(value));
  return value;
}

function namespace(value) {
  check(
    typeof IS_NAMESPACE === 'function' &&
    value !== null &&
    typeof value === 'object' &&
    !IS_PROXY(value) &&
    IS_NAMESPACE(value)
  );
  return value;
}

function prototypeMethod(moduleNamespace, exportName, methodName) {
  const constructor = optionalFunction(data(moduleNamespace, exportName, true));
  if (constructor === null) return null;

  const prototype = data(constructor, 'prototype');
  check(prototype !== null && typeof prototype === 'object' && !IS_PROXY(prototype));

  return optionalFunction(data(prototype, methodName, true));
}

function unavailable(status, reason) {
  return R({
    status,
    reason,
    context: null,
    flow: null,
    pending: null,
    SettleError: null
  });
}

function captureSlots(host) {
  if (host === null || host === undefined) {
    return R({
      '2.23.0': unavailable('NOT_RUN', 'HOST_NOT_SUPPLIED'),
      '2.28.0': unavailable('NOT_RUN', 'HOST_NOT_SUPPLIED')
    });
  }

  let admissions;
  let supplied;

  try {
    record(host, ['scope', 'admissions', 'sdk']);
    check(host.scope === 'REVIEWED_X402_CHARACTERIZATION_HOST_V1');

    admissions = host.admissions;
    check(
      admissions !== null &&
      typeof admissions === 'object' &&
      !IS_PROXY(admissions) &&
      PROTO(admissions) === WEAK_PROTO &&
      KEYS(admissions).length === 0
    );

    supplied = record(host.sdk, VERSIONS);
  } catch {
    return R({
      '2.23.0': unavailable('NOT_ADMITTED', 'HOST_INVALID'),
      '2.28.0': unavailable('NOT_ADMITTED', 'HOST_INVALID')
    });
  }

  const captured = CREATE(null);

  for (const version of VERSIONS) {
    const binding = supplied[version];

    if (binding === null) {
      captured[version] = unavailable('NOT_RUN', 'SDK_NOT_SUPPLIED');
      continue;
    }

    try {
      check(
        binding !== null &&
        typeof binding === 'object' &&
        !IS_PROXY(binding)
      );

      const admission = APPLY(WEAK_GET, admissions, [binding]);

      if (admission === undefined) {
        captured[version] = unavailable('NOT_ADMITTED', 'SOURCE_NOT_ADMITTED');
        continue;
      }

      record(admission, [
        'version',
        'contextMethod',
        'flowFunction',
        'pendingMethod',
        'SettleError'
      ]);

      record(binding, [
        'scope',
        'version',
        'server',
        'facilitator',
        'types'
      ]);

      check(
        admission.version === version &&
        binding.version === version &&
        binding.scope === 'ORIGINAL_X402_NAMESPACE_BINDING_V1'
      );

      const server = namespace(binding.server);
      const facilitator = namespace(binding.facilitator);
      const types = namespace(binding.types);

      const context = prototypeMethod(
        facilitator,
        'x402Facilitator',
        'buildFacilitatorContext'
      );

      const flow = optionalFunction(data(server, 'resolvePaymentFlow', true));

      const pending = prototypeMethod(
        server,
        'x402ResourceServer',
        'settleWithPendingRetry'
      );

      const SettleError = optionalFunction(data(types, 'SettleError', true));

      check(
        admission.contextMethod === context &&
        admission.flowFunction === flow &&
        admission.pendingMethod === pending &&
        admission.SettleError === SettleError
      );

      captured[version] = R({
        status: 'AVAILABLE',
        reason: 'MATCH',
        context,
        flow,
        pending,
        SettleError
      });
    } catch {
      captured[version] = unavailable('NOT_ADMITTED', 'SDK_BINDING_INVALID');
    }
  }

  return F(captured);
}

function validSubcase(template, subcase, version) {
  if (template === 'CONTEXT_AUTHORITY_MATRIX') {
    return version === 'SYNTHETIC'
      ? AUTHORITY_SUBCASES.includes(subcase)
      : subcase === 'EXTENSION_CONTEXT_ONLY';
  }

  if (template === 'UPFRONT_FLOW_POLICY') {
    return version !== 'SYNTHETIC' && FLOW_SUBCASES.includes(subcase);
  }

  const definition = DEFINITIONS.find(entry => entry.id === template);
  if (definition === undefined || subcase !== 'SCENARIO') return false;

  return definition.kind === 'SYNTHETIC_ASSERTION_CONTROL'
    ? version === 'SYNTHETIC'
    : version !== 'SYNTHETIC';
}

function result(
  template,
  subcase,
  version,
  actualStatus,
  actualReason,
  modeledStatus,
  modeledReason,
  count
) {
  const snapshot = counterSnapshot(count);

  const valid =
    DEFINITIONS.some(entry => entry.id === template) &&
    (VERSIONS.includes(version) || version === 'SYNTHETIC') &&
    validSubcase(template, subcase, version) &&
    ACTUAL_STATUSES.includes(actualStatus) &&
    MODELED_STATUSES.includes(modeledStatus) &&
    REASONS.includes(actualReason) &&
    REASONS.includes(modeledReason);

  if (!valid) {
    return R({
      scope: 'INERT_X402_CHARACTERIZATION_ONLY',
      template: 'UNCLASSIFIED',
      subcase: 'UNCLASSIFIED',
      version: 'UNSPECIFIED',
      actual: R({ status: 'NOT_ADMITTED', reason: 'INPUT_INVALID' }),
      modeled: R({ status: 'CHECK_FAILED', reason: 'INVARIANT_VIOLATION' }),
      counterStatus: snapshot.counterStatus,
      counts: snapshot.counts,
      integration: 'UNQUALIFIED'
    });
  }

  if (snapshot.counterStatus === 'UNAVAILABLE') {
    actualStatus = 'OBSERVED_DIFFERENCE';
    actualReason = 'INVARIANT_VIOLATION';
    modeledStatus = 'CHECK_FAILED';
    modeledReason = 'INVARIANT_VIOLATION';
  }

  return R({
    scope: 'INERT_X402_CHARACTERIZATION_ONLY',
    template,
    subcase,
    version,
    actual: R({ status: actualStatus, reason: actualReason }),
    modeled: R({ status: modeledStatus, reason: modeledReason }),
    counterStatus: snapshot.counterStatus,
    counts: snapshot.counts,
    integration: 'UNQUALIFIED'
  });
}

function summary(lane, records) {
  check(lane === 'CONTEXT' || lane === 'PENDING');
  check(records.length <= (lane === 'CONTEXT' ? 14 : 24));

  const versionRecords = records.filter(item => item.version !== 'SYNTHETIC');
  const modeledAuthorityRecords = records.filter(
    item =>
      item.version === 'SYNTHETIC' &&
      item.template === 'CONTEXT_AUTHORITY_MATRIX'
  );
  const controlRecords = records.filter(
    item =>
      item.version === 'SYNTHETIC' &&
      item.template !== 'CONTEXT_AUTHORITY_MATRIX'
  );

  const unavailableCounters = records.some(
    item => item.counterStatus === 'UNAVAILABLE'
  );
  const lowerBoundCounters = records.some(
    item => item.counterStatus === 'LOWER_BOUND'
  );

  function sum(name) {
    if (unavailableCounters) return null;
    return records.reduce((total, item) => total + item.counts[name], 0);
  }

  return R({
    scope: 'INERT_X402_CHARACTERIZATION_ONLY',
    lane,
    status: 'PARTIAL_CHARACTERIZATION',
    versionSpecificSlots: versionRecords.length,
    modeledAuthoritySubcases: modeledAuthorityRecords.length,
    syntheticControlSlots: controlRecords.length,
    totalRecords: records.length,
    actualMethodsMatched: versionRecords.filter(
      item => item.actual.status === 'OBSERVED_MATCH'
    ).length,
    actualMethodsDiffered: versionRecords.filter(
      item => item.actual.status === 'OBSERVED_DIFFERENCE'
    ).length,
    actualNotRun: versionRecords.filter(
      item => item.actual.status === 'NOT_RUN'
    ).length,
    actualNotAdmitted: versionRecords.filter(
      item => item.actual.status === 'NOT_ADMITTED'
    ).length,
    modeledAuthorityChecksMatched: modeledAuthorityRecords.filter(
      item => item.modeled.status === 'CHECK_MATCH'
    ).length,
    syntheticControlsDetected: controlRecords.filter(
      item => item.modeled.status === 'CONTROL_DETECTED'
    ).length,
    counterStatus: unavailableCounters
      ? 'UNAVAILABLE'
      : lowerBoundCounters ? 'LOWER_BOUND' : 'EXACT',
    sdkDispatchAttempts: sum('sdkCalls'),
    settlementCallbackEntries: sum('settleCalls'),
    rejectedSettleEntries: sum('rejectedSettleEntries'),
    integration: 'UNQUALIFIED',
    records: F(records)
  });
}

function emptyReport(lane, reason) {
  return R({
    scope: 'INERT_X402_CHARACTERIZATION_ONLY',
    lane,
    status: reason === 'ENTRY_ALREADY_CONSUMED' ? 'NOT_RUN' : 'NOT_ADMITTED',
    reason,
    records: F([]),
    integration: 'UNQUALIFIED'
  });
}

/*
 * Fixed shared fixture support, not a loader or admission authority.
 * Its private helpers must not cross a product/client interface.
 */
export function createCharacterizationBoundary(catalog, host = null) {
  check(arguments.length >= 1 && arguments.length <= 2);
  validateCatalog(catalog);

  const slots = captureSlots(host);

  return R({
    versions: VERSIONS,
    slot: F(version => {
      check(VERSIONS.includes(version));
      return slots[version];
    }),
    fixture: F(fixture),
    counters: F(counters),
    text: F(text),
    header: F(header),
    clone: F(clone),
    invoke: F(invoke),
    reuseFaults: F(reuseFaults),
    transactionMatches: F(transactionMatches),
    result: F(result),
    summary: F(summary),
    data: F(data),
    check: F(check),
    construct: F(constructActual)
  });
}

function contextShape(value) {
  try {
    record(value, ['getExtension'], false);
    return typeof value.getExtension === 'function' && !IS_PROXY(value.getExtension);
  } catch {
    return false;
  }
}

function flowMatches(value) {
  try {
    record(value, ['assetTransferMethod', 'paymentFlow'], false);
    return (
      value.assetTransferMethod === 'default' &&
      value.paymentFlow === 'upfront'
    );
  } catch {
    return false;
  }
}

function strictUpfront(requirement) {
  try {
    return data(data(requirement, 'extra'), 'paymentFlow', true) === 'upfront';
  } catch {
    return false;
  }
}

async function contextMethodProbe(boundary, slot, version, count) {
  if (slot.context === null) {
    return boundary.result(
      'CONTEXT_AUTHORITY_MATRIX', 'EXTENSION_CONTEXT_ONLY', version,
      'NOT_RUN', 'SDK_ENTRY_ABSENT',
      'NOT_RUN', 'NOT_RUN',
      count
    );
  }

  const owned = boundary.fixture();

  /*
   * Explicit synthetic receiver for the original compiled method.
   * No facilitator constructor or registration lifecycle is exercised.
   */
  const receiver = R({ extensions: new Map() });

  const observed = await boundary.invoke(
    slot.context,
    receiver,
    [],
    count
  );

  const actualMatch =
    observed.kind === 'RETURNED' &&
    contextShape(observed.value);

  const modeledMatch =
    actualMatch &&
    !owned.matchesOwnedFixture(
      observed.value,
      owned.requirement,
      owned.payment
    );

  return boundary.result(
    'CONTEXT_AUTHORITY_MATRIX', 'EXTENSION_CONTEXT_ONLY', version,
    actualMatch ? 'OBSERVED_MATCH' : 'OBSERVED_DIFFERENCE',
    actualMatch ? 'MATCH' :
      observed.kind === 'THREW' ? 'CALL_REJECTED' : 'CALL_RESULT_INVALID',
    actualMatch
      ? modeledMatch ? 'CHECK_MATCH' : 'CHECK_FAILED'
      : 'NOT_RUN',
    actualMatch
      ? modeledMatch ? 'MATCH' : 'INVARIANT_VIOLATION'
      : 'NOT_RUN',
    count
  );
}

async function flowProbe(boundary, slot, version, subcase, count) {
  if (slot.flow === null) {
    return boundary.result(
      'UPFRONT_FLOW_POLICY', subcase, version,
      'NOT_RUN', 'SDK_ENTRY_ABSENT',
      'NOT_RUN', 'NOT_RUN',
      count
    );
  }

  const owned = boundary.fixture();

  const scheme = freezeTree({
    scheme: 'exact',
    defaultAssetTransferMethod: 'default',
    paymentFlows: {
      default: {
        supported: ['upfront'],
        default: 'upfront'
      }
    }
  });

  let requirement = owned.requirement;

  if (subcase === 'OMITTED_FLOW') {
    requirement = boundary.clone(owned.requirement);
    requirement.extra = {};
  } else if (subcase === 'UNSUPPORTED_FLOW') {
    requirement = boundary.clone(owned.requirement);
    requirement.extra.paymentFlow = 'authorization';
  }

  const observed = await boundary.invoke(
    slot.flow,
    undefined,
    [scheme, requirement],
    count
  );

  const actualMatch = subcase === 'UNSUPPORTED_FLOW'
    ? observed.kind === 'THREW'
    : observed.kind === 'RETURNED' && flowMatches(observed.value);

  /*
   * This is a separate modeled policy assertion.
   * Official default resolution does not waive explicit local upfront
   * policy or expand the existing separate legacy compatibility lane.
   */
  const modeledMatch =
    strictUpfront(requirement) === (subcase === 'EXPLICIT_UPFRONT');

  return boundary.result(
    'UPFRONT_FLOW_POLICY', subcase, version,
    actualMatch ? 'OBSERVED_MATCH' : 'OBSERVED_DIFFERENCE',
    actualMatch ? 'MATCH' : 'DIFFERENCE',
    modeledMatch ? 'CHECK_MATCH' : 'CHECK_FAILED',
    modeledMatch ? 'MATCH' : 'INVARIANT_VIOLATION',
    count
  );
}

function modeledAuthorityProbe(boundary, subcase, count) {
  const owned = boundary.fixture();

  let challenge = owned.originalChallenge;
  let selected = owned.requirement;
  let submitted = owned.payment;
  let setupMatches = true;

  if (subcase === 'MISSING_CONTEXT') {
    challenge = null;
  } else if (subcase === 'EXTENSION_CONTEXT_SUBSTITUTED') {
    /*
     * Explicitly synthetic extension context for this version-independent
     * assertion. Actual SDK context objects are checked separately.
     */
    challenge = R({ getExtension: F(() => undefined) });
  } else if (subcase === 'PAYLOAD_DERIVED_EQUAL_COPY') {
    /*
     * Build an equal-looking challenge entirely from client payment
     * fields. Neither this challenge nor its selected requirement is
     * registered as the original server-owned authority.
     */
    challenge = {
      x402Version: submitted.x402Version,
      resource: boundary.clone(submitted.resource),
      accepts: [boundary.clone(submitted.accepted)]
    };
    selected = challenge.accepts[0];

    setupMatches =
      challenge !== owned.originalChallenge &&
      selected !== owned.requirement &&
      selected !== owned.originalRequirement &&
      boundary.text(challenge) === boundary.text(owned.originalChallenge) &&
      boundary.text(selected) === boundary.text(owned.originalRequirement);
  } else if (subcase === 'MUTATED_SELECTED_REQUIREMENT') {
    selected.amount = '2';
  } else if (subcase === 'CROSS_RESOURCE') {
    submitted.resource.url = 'https://synthetic.invalid/other';
  }

  const matched = owned.matchesOwnedFixture(
    challenge,
    selected,
    submitted
  );

  const expected = subcase === 'ORIGINAL_SERVER_CONTEXT';
  const correct = setupMatches && matched === expected;

  return boundary.result(
    'CONTEXT_AUTHORITY_MATRIX', subcase, 'SYNTHETIC',
    'NOT_RUN', 'SYNTHETIC_ONLY',
    correct ? 'CHECK_MATCH' : 'CHECK_FAILED',
    correct ? 'MATCH' : 'INVARIANT_VIOLATION',
    count
  );
}

export async function characterizeOfficialX402Contexts(catalog, host = null) {
  if (contextEntryConsumed) {
    return emptyReport('CONTEXT', 'ENTRY_ALREADY_CONSUMED');
  }
  contextEntryConsumed = true;

  let boundary;

  try {
    check(arguments.length >= 1 && arguments.length <= 2);
    boundary = createCharacterizationBoundary(catalog, host);
  } catch {
    return emptyReport('CONTEXT', 'INPUT_INVALID');
  }

  const records = [];

  const sdkScenarios = [
    ['CONTEXT_AUTHORITY_MATRIX', 'EXTENSION_CONTEXT_ONLY'],
    ...FLOW_SUBCASES.map(subcase => ['UPFRONT_FLOW_POLICY', subcase])
  ];

  for (const version of boundary.versions) {
    const slot = boundary.slot(version);

    for (const [template, subcase] of sdkScenarios) {
      const count = boundary.counters();

      if (slot.status !== 'AVAILABLE') {
        records.push(boundary.result(
          template, subcase, version,
          slot.status, slot.reason,
          'NOT_RUN', 'NOT_RUN',
          count
        ));
        continue;
      }

      try {
        const report = template === 'CONTEXT_AUTHORITY_MATRIX'
          ? await contextMethodProbe(boundary, slot, version, count)
          : await flowProbe(boundary, slot, version, subcase, count);

        records.push(report);
      } catch {
        /*
         * Preserve the SAME count record after any dispatched call.
         * No fresh counters are substituted on failure.
         */
        records.push(boundary.result(
          template, subcase, version,
          'OBSERVED_DIFFERENCE', 'CALL_RESULT_INVALID',
          'CHECK_FAILED', 'INVARIANT_VIOLATION',
          count
        ));
      }
    }
  }

  for (const subcase of AUTHORITY_SUBCASES) {
    const count = boundary.counters();

    try {
      records.push(modeledAuthorityProbe(boundary, subcase, count));
    } catch {
      records.push(boundary.result(
        'CONTEXT_AUTHORITY_MATRIX', subcase, 'SYNTHETIC',
        'NOT_RUN', 'SYNTHETIC_ONLY',
        'CHECK_FAILED', 'INVARIANT_VIOLATION',
        count
      ));
    }
  }

  return boundary.summary('CONTEXT', records);
}
