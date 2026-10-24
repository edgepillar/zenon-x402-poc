import { types as utilTypes } from 'node:util';
import {
  createRetainedDynamicPlasmaHttpsReadTransportOwner,
  createRetainedAccountStateHttpsExchangeOwner,
  createRetainedDynamicPlasmaHttpsReadTransportOwnerV2,
  createRetainedAccountStateHttpsExchangeOwnerV2,
  createRetainedDynamicPlasmaHttpsReadTransportOwnerForLocalQualification,
  createRetainedAccountStateHttpsExchangeOwnerForLocalQualification,
} from './dynamic-plasma-retained-https-read-owners.js';
import { createRetainedDynamicPlasmaReadSessionCore } from './dynamic-plasma-retained-read-session-core.js';

const DP = createRetainedDynamicPlasmaHttpsReadTransportOwner;
const ACCOUNT = createRetainedAccountStateHttpsExchangeOwner, SESSION = createRetainedDynamicPlasmaReadSessionCore;
const DP_V2 = createRetainedDynamicPlasmaHttpsReadTransportOwnerV2;
const ACCOUNT_V2 = createRetainedAccountStateHttpsExchangeOwnerV2;
const DP_LOCAL = createRetainedDynamicPlasmaHttpsReadTransportOwnerForLocalQualification;
const ACCOUNT_LOCAL = createRetainedAccountStateHttpsExchangeOwnerForLocalQualification;
const FREEZE = Object.freeze, CREATE = Object.create, DEFINE = Object.defineProperty;
const DESCRIPTOR = Object.getOwnPropertyDescriptor, PROTOTYPE = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, HAS = Object.hasOwn, APPLY = Reflect.apply;
const OBJECT = Object.prototype, ARRAY = Array.prototype, ErrorType = TypeError;
const IS_PROXY = utilTypes.isProxy, IS_FROZEN = Object.isFrozen;

/**
 * SOURCE-ONLY retained read composition, not native runtime qualification.
 * Exact frozen options: {endpoints:[firstDP, secondDP], accountEndpoint}.
 * Each endpoint keeps the actual {route, timeoutMs, closeGraceMs} grammar.
 * Construct two distinct actual78-slot DP owners and one actual18-slot
 * account owner, then return the actual non-native lifecycle core DIRECTLY.
 * No user owner factory, floating limit, collector substitute or default
 * buyer cutover. Construction creates no socket/request or DB/wallet work.
 *
 * Give returned readOptions unchanged to the actual contextv7 preparer or
 * bounded original-funding submission. One private owner set survives all six
 * read cycles; do not recreate the old one-shot observation owner per cycle.
 * Explicit session.close initiates all three real closes and blocks reads.
 * Close all independent funding/store/wallet owners through their own
 * contracts; this session does not release or authenticate them. A rejected
 * read-session close requires HOLD/quarantine, not a cleanup or retry claim.
 * Uncertain close is permanent, even if a borrowed read later settles.
 *
 * Imports the real native HTTPS graph. Component callback tests do NOT import
 * or qualify it. Calling reads can open actual configured HTTPS connections;
 * no test/network, signing, SDK/SQLite or pilot authority is inferred here.
 */
export function createRetainedDynamicPlasmaHttpsReadSession(options) {
  if (arguments.length !== 1) reject();
  return createSession(options, false);
}

/**
 * SOURCE ONLY V2: same real read core/method identities plus the three private
 * native-owner views. A fulfilled aggregate Promise is not substituted for
 * current per-owner counters/late-error state. Inspection opens no connection.
 */
export function createRetainedDynamicPlasmaHttpsReadSessionV2(options) {
  if (arguments.length !== 1) reject();
  return createSession(options, true);
}

/**
 * Named SOURCE-ONLY actual-core local qualification. All three routes must be
 * fixed localhost/127.0.0.1 role paths; the source core binds one explicit CA
 * and unprivileged port. Existing public/native V2 selections are unchanged.
 * Constructing this selection is not authority to execute sockets or tests.
 */
export function createRetainedDynamicPlasmaHttpsReadSessionForLocalQualification(options, localOptions) {
  if (arguments.length !== 2 || typeof localOptions !== 'object' || localOptions === null) reject();
  return createSession(options, true, localOptions);
}

function createSession(options, nativeCustody, localOptions = null) {
  let selected;
  try {
    const top = exact(options, ['endpoints', 'accountEndpoint']);
    const endpoints = two(top.endpoints);
    selected = FREEZE([endpoint(endpoints[0]), endpoint(endpoints[1]), endpoint(top.accountEndpoint)]);
    const a = selected[0].route, b = selected[1].route;
    if (a.hostname === b.hostname && a.path === b.path && a.ipv4Address === b.ipv4Address) reject();
  } catch { reject(); }
  const owners = [];
  try {
    put(owners, '0', localOptions !== null ? DP_LOCAL(selected[0], localOptions) : (nativeCustody ? DP_V2 : DP)(selected[0]));
    put(owners, '1', localOptions !== null ? DP_LOCAL(selected[1], localOptions) : (nativeCustody ? DP_V2 : DP)(selected[1]));
    put(owners, '2', localOptions !== null ? ACCOUNT_LOCAL(selected[2], localOptions) : (nativeCustody ? ACCOUNT_V2 : ACCOUNT)(selected[2]));
    // The existing core receives its exact legacy grammar and the SAME actual
    // read/close functions; no fake owner, new request or wrapping close result.
    const first = nativeCustody ? FREEZE({ transport: owners[0].transport,
      close: owners[0].close, requestBudget: owners[0].requestBudget }) : owners[0];
    const second = nativeCustody ? FREEZE({ transport: owners[1].transport,
      close: owners[1].close, requestBudget: owners[1].requestBudget }) : owners[1];
    const account = nativeCustody ? FREEZE({ exchange: owners[2].exchange,
      close: owners[2].close, requestBudget: owners[2].requestBudget }) : owners[2];
    const session = SESSION(FREEZE({ firstOwner: first, secondOwner: second, accountOwner: account }));
    if (!nativeCustody) return session;
    const inspectors = FREEZE([owners[0].inspectNativeCustody, owners[1].inspectNativeCustody,
      owners[2].inspectNativeCustody]);
    const inspectNativeCustody = FREEZE(function inspectNativeCustody() {
      if (arguments.length !== 0) reject();
      return FREEZE({ nativeReadSessionCustodyVersion: 2,
        owners: FREEZE([APPLY(inspectors[0], undefined, []), APPLY(inspectors[1], undefined, []),
          APPLY(inspectors[2], undefined, [])]), nativePhysicalDrain: 'NOT_QUALIFIED', authority: 'NONE' });
    });
    return FREEZE({ readOptions: session.readOptions, close: session.close,
      inspect: session.inspect, inspectNativeCustody });
  } catch {
    // Actual constructors are inert and no readOptions escaped. Ask every
    // created owner to close; do not claim asynchronous/native cleanup or
    // adopt/recreate a resource after construction refusal.
    for (let i = 0; i < owners.length; i++) {
      try { APPLY(owners[i].close, undefined, []); } catch {}
    }
    reject();
  }
}
function endpoint(value) {
  const top = exact(value, ['route', 'timeoutMs', 'closeGraceMs']);
  const route = exact(top.route, ['hostname', 'path', 'ipv4Address']);
  return FREEZE({ route: FREEZE({ hostname: route.hostname, path: route.path, ipv4Address: route.ipv4Address }),
    timeoutMs: top.timeoutMs, closeGraceMs: top.closeGraceMs });
}
function exact(value, fields) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value) || PROTOTYPE(value) !== OBJECT
      || !IS_FROZEN(value) || KEYS(value).length !== fields.length) reject();
  const out = CREATE(null);
  for (let i = 0; i < fields.length; i++) {
    const name = fields[i], d = DESCRIPTOR(value, name);
    if (!d || d.enumerable !== true || !HAS(d, 'value')) reject();
    put(out, name, d.value);
  }
  return out;
}
function two(value) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value) || PROTOTYPE(value) !== ARRAY
      || !IS_FROZEN(value) || KEYS(value).length !== 3) reject();
  const length = DESCRIPTOR(value, 'length'), first = DESCRIPTOR(value, '0'), second = DESCRIPTOR(value, '1');
  if (!length || !HAS(length, 'value') || length.value !== 2
      || !first || !HAS(first, 'value') || first.enumerable !== true
      || !second || !HAS(second, 'value') || second.enumerable !== true) reject();
  return FREEZE([first.value, second.value]);
}
function put(target, name, value) {
  const d = CREATE(null); d.value = value; d.enumerable = true; DEFINE(target, name, d);
}
function reject() {
  const code = 'retained_dynamic_plasma_https_read_session_configuration_rejected', error = new ErrorType(code);
  put(error, 'code', code);
  const stack = CREATE(null); stack.value = 'TypeError: ' + code; DEFINE(error, 'stack', stack);
  throw FREEZE(error);
}
