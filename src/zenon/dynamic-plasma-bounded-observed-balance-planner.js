import { types as utilTypes } from 'node:util';
import { createBoundedNonceDynamicPlasmaMaterialExchange } from './dynamic-plasma-bounded-material-exchange.js';
import { createObservedBalanceDeferredMaterialDynamicPlasmaTransactionPlanner } from './dynamic-plasma-observed-balance-deferred-material-planner.js';

const CREATE_MATERIAL = createBoundedNonceDynamicPlasmaMaterialExchange;
const CREATE_PLANNER = createObservedBalanceDeferredMaterialDynamicPlasmaTransactionPlanner;
const freeze = Object.freeze;
const create = Object.create;
const define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys;
const hasOwn = Object.hasOwn;
const isProxy = utilTypes.isProxy;
const objectPrototype = Object.prototype;
const ErrorType = TypeError;
const FIELDS = freeze(['readOptions', 'materialOptions']);

/**
 * Opt-in v3 observed-balance planner with its OWN bounded material producer.
 * UNEXECUTED LOCAL INTEGRATION DRAFT. Importing this module evaluates the
 * separate nonce-search/producer drafts. Synthetic fixed-material permission
 * alone does NOT admit that import, candidate work or this qualification.
 *
 * Exact options: {readOptions, materialOptions}. Reuse the unchanged v3 read
 * options and producer {publicKey, startNonce, limits} contract. No caller
 * materialExchange, balance, block, quote, key generator or signer is accepted.
 * Construction captures both factories and configures exactly ONE producer
 * and ONE planner, without invoking an endpoint, search or external callback.
 *
 * Return the existing frozen planner DIRECTLY, not a wrapper around its
 * prepareUnsigned receipt. This retains its private public-Promise identity,
 * reentry/self-dependency checks, one-admission state and bounded reads.
 * Its sole admitted run obtains the original quote and work request, calls
 * the retained producer once, assembles one unsigned block and validates that
 * SAME block through fresh account/balance and DP observations. No renewal,
 * fallback, material retry, wire recreation or replacement quote is added.
 *
 * Candidate work remains limited by the producer's explicit maxAttempts<=4096,
 * maxDifficulty and start cursor. Zero difficulty keeps the existing zero
 * nonce without searching. Positive exhaustion returns no block. These count
 * limits are NOT hard lifetime, cancellation, CPU or native-cleanup guarantees.
 * The final account and price checks occur AFTER producer work: completing
 * work never bypasses current funds, account movement or original-quote expiry.
 *
 * Public-key bytes are supplied, not generated and not proof of possession.
 * Assembly retains its existing key/address, work/hash and original-price
 * consumers. Coherent callbacks, balances, runtime p/context and UNSIGNED are
 * declared DATA, not authenticated state, signer state or operating authority.
 * Native crypto/Promise/loader/dependency/OS behavior remains a premise.
 *
 * Default-off and unwired to the buyer, SDK, wallet, native owner, signer or
 * publication. No real PREPARE, payment, signature, recovery, inclusion,
 * provider READY, durability/restart or pilot acceptance is established.
 * Recreating a volatile planner does not reset consumed payment authority.
 * Preserve original signed bytes/hash/payload/requirements/context elsewhere;
 * VALIDATED possible exact-same-signed-block resend remains distinct from
 * UNKNOWN/ACKNOWLEDGED. This composition must stop BEFORE external signing.
 */
export function createBoundedObservedBalanceDynamicPlasmaTransactionPlanner(options) {
  try {
    if (arguments.length !== 1) reject();
    const top = configuration(options);
    const materialExchange = CREATE_MATERIAL(top.materialOptions);
    return CREATE_PLANNER({ readOptions: top.readOptions, materialExchange });
  } catch { reject(); }
}

function configuration(value) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype || ownKeys(value).length !== FIELDS.length) reject();
  const result = create(null);
  for (const field of FIELDS) {
    const d = descriptor(value, field);
    if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) reject();
    put(result, field, d.value);
  }
  return result;
}
function put(value, key, content, enumerable = true) {
  const d = create(null);
  d.value = content; d.enumerable = enumerable; d.writable = false; d.configurable = false;
  define(value, key, d);
}
function reject() {
  const code = 'zenon_bounded_observed_balance_dp_planner_configuration_rejected';
  const error = new ErrorType(code);
  put(error, 'code', code);
  put(error, 'stack', 'TypeError: ' + code, false);
  throw freeze(error);
}
