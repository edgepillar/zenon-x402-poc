import { types as utilTypes } from 'node:util';
import {
  createRetainedDynamicPlasmaHttpsReadTransportOwner,
  createRetainedAccountStateHttpsExchangeOwner,
} from './dynamic-plasma-retained-https-read-owners.js';
import { createRetainedDynamicPlasmaReadSessionCore } from './dynamic-plasma-retained-read-session-core.js';

const DP = createRetainedDynamicPlasmaHttpsReadTransportOwner;
const ACCOUNT = createRetainedAccountStateHttpsExchangeOwner, SESSION = createRetainedDynamicPlasmaReadSessionCore;
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
  let selected;
  try {
    if (arguments.length !== 1) reject();
    const top = exact(options, ['endpoints', 'accountEndpoint']);
    const endpoints = two(top.endpoints);
    selected = FREEZE([endpoint(endpoints[0]), endpoint(endpoints[1]), endpoint(top.accountEndpoint)]);
    const a = selected[0].route, b = selected[1].route;
    if (a.hostname === b.hostname && a.path === b.path && a.ipv4Address === b.ipv4Address) reject();
  } catch { reject(); }
  const owners = [];
  try {
    put(owners, '0', DP(selected[0])); put(owners, '1', DP(selected[1]));
    put(owners, '2', ACCOUNT(selected[2]));
    return SESSION(FREEZE({ firstOwner: owners[0], secondOwner: owners[1], accountOwner: owners[2] }));
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
