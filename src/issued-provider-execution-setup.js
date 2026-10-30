import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { createServiceCreditExecutionContract, hydrateServiceCreditExecutionContract } from './service-credit-execution-contract.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, A = Reflect.apply;
function fail() { throw new TypeError('ISSUED_PROVIDER_EXECUTION_SETUP'); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) {
    const d = D(value, name);
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail();
    Object.defineProperty(out, name, { value: d.value, enumerable: true });
  }
  return F(out);
}
function integer(value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < minimum || value > maximum) fail();
}

/** Explicit DATA configuration. No store, clock, initializer or executor is entered. */
export function captureIssuedProviderExecutionSetup(value, selectedDurationMs, maxRequests) {
  if (arguments.length !== 3) fail();
  integer(selectedDurationMs, 1, 60000); integer(maxRequests, 100, 10000);
  const input = fields(value, ['ledgerId', 'policy', 'capacity']);
  const state = createServiceCreditExecutionContract(input);
  integer(state.capacity, 100, maxRequests); integer(state.policy.maxDurationMs, selectedDurationMs, 60000);
  return F({ ledgerId: state.ledgerId, policy: state.policy, capacity: state.capacity });
}

/** One local cutover attempt before intake/funding startup. The native caller
 * supplies fixed actual-store methods; tests supply explicitly declared memory
 * ports. A lost result stays HELD, with no retry, reset, recovery or close. */
export function createIssuedProviderExecutionSetupOwner(setup, storageMode, port) {
  if (arguments.length !== 3 || !['CREATE_NEW', 'OPEN_EXISTING'].includes(storageMode)) fail();
  const selected = captureIssuedProviderExecutionSetup(setup, 1, 10000);
  const candidate = createServiceCreditExecutionContract(selected);
  const p = fields(port, storageMode === 'CREATE_NEW' ? ['read', 'initialize'] : ['read']);
  for (const fn of Object.values(p)) if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail();
  let entered = false, phase = 'NEW', initializationCalls = 0;
  function current() { if (phase !== 'ENTERED') fail(); }
  function snapshot() {
    current();
    const value = fields(A(p.read, undefined, []), ['revision', 'executionState']);
    current();
    integer(value.revision, 0, Number.MAX_SAFE_INTEGER);
    return value;
  }
  function existing(value) {
    const state = hydrateServiceCreditExecutionContract(value);
    if (state.ledgerId !== candidate.ledgerId || state.capacity !== candidate.capacity
        || canonicalJson(state.policy) !== canonicalJson(candidate.policy)
        || state.generation.generationId !== candidate.generation.generationId) fail();
    return state;
  }
  const run = F(function run() {
    if (arguments.length !== 0 || entered) { if (entered) phase = 'HELD'; fail(); }
    entered = true; phase = 'ENTERED';
    try {
      const before = snapshot();
      if (storageMode === 'OPEN_EXISTING') {
        const state = existing(before.executionState);
        phase = 'READY';
        return F({ status: 'EXISTING', revision: before.revision, generationState: state.generation.state, authority: 'NONE' });
      }
      if (before.executionState !== null || before.revision === Number.MAX_SAFE_INTEGER) fail();
      initializationCalls++;
      const ack = fields(A(p.initialize, undefined, [F({ expectedRevision: before.revision, ...selected })]),
        ['disposition', 'revision', 'executionState']);
      current();
      if (ack.disposition !== 'APPLIED' || ack.revision !== before.revision + 1
          || canonicalJson(existing(ack.executionState)) !== canonicalJson(candidate)) fail();
      const after = snapshot();
      if (after.revision !== ack.revision || canonicalJson(existing(after.executionState)) !== canonicalJson(candidate)) fail();
      phase = 'READY';
      return F({ status: 'INITIALIZED', revision: after.revision, generationState: 'OPEN', authority: 'NONE' });
    } catch { phase = 'HELD'; fail(); }
  });
  return F({ run, inspect: F(() => F({ phase, entered, initializationCalls, authority: 'NONE' })) });
}
