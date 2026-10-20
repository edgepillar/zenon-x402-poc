import { types as utilTypes } from 'node:util';
import {
  calculateDynamicPlasmaPriceAmounts,
} from './dynamic-plasma-price-policy.js';

const freeze = Object.freeze;
const create = Object.create;
const ownKeys = Reflect.ownKeys;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const hasOwn = Object.hasOwn;
const define = Object.defineProperty;
const same = Object.is;
const safeInteger = Number.isSafeInteger;
const isProxy = utilTypes.isProxy;
const apply = Reflect.apply;
const regexpExec = RegExp.prototype.exec;
const objectPrototype = Object.prototype;
const ErrorType = TypeError;
const bigint = BigInt;
const number = Number;
const MAX_SAFE = 9007199254740991n;
const HASH = /^[0-9a-f]{64}$/;
const INPUT = freeze(['requiredFusedQuoteVersion', 'frontier', 'rpcObservation']);
const FRONTIER = freeze(['height', 'hash', 'version', 'nextFusionPrice', 'nextWorkPrice']);
const RPC = freeze([
  'availablePlasma', 'basePlasma', 'requiredDifficulty', 'requiredFusedPlasma',
]);

/**
 * Separate quote-contract namespace v1, for DECLARED frontier version 2 only.
 * go-zenon merged PR170 (b5f93c20c15b0622bc8ed1a175b613d6917be3b2)
 * defines requiredFusedPlasma as the fused-only TOTAL, including encoded zero.
 * It is neither an additional shortfall nor fusion to attach alongside PoW.
 *
 * Input: { requiredFusedQuoteVersion: 1, frontier, rpcObservation }.
 * Frontier has exactly FRONTIER fields; RPC has exactly all four RPC fields.
 * Heights/RPC values are nonnegative safe integers; prices are at least 1000.
 * This validates observed JS number primitives, not lossless uint64 JSON tokens.
 * Checked BigInt intermediates reuse the unchanged price-policy kernel.
 *
 * Matching arithmetic does not authenticate the frontier, bind an RPC origin,
 * prove a spork/enforcement state, or establish active runtime behavior.
 * Both returned alternatives are powerless declared DATA. In particular,
 * fusedOnlyTarget always pairs the TOTAL with difficulty 0; it is never merged
 * with declaredRecommendation. No existing V1 normalizer/policy is changed.
 * Current captured native intrinsics and the imported kernel are premises.
 */
export function validateDynamicPlasmaRequiredFusedQuote(input) {
  if (arguments.length !== 1) reject('invalid_data');
  const top = record(input, INPUT);
  if (top.requiredFusedQuoteVersion !== 1) reject('unsupported_contract_version');
  const f = record(top.frontier, FRONTIER);
  const r = record(top.rpcObservation, RPC);
  safe(f.height);
  safe(f.version);
  safe(f.nextFusionPrice);
  safe(f.nextWorkPrice);
  if (f.version !== 2) reject('unsupported_frontier_version');
  if (typeof f.hash !== 'string' || f.hash.length !== 64
      || apply(regexpExec, HASH, [f.hash]) === null
      || f.nextFusionPrice < 1000 || f.nextWorkPrice < 1000) reject('invalid_frontier');
  for (let index = 0; index < RPC.length; index++) safe(r[RPC[index]]);

  const amounts = calculateDynamicPlasmaPriceAmounts(
    bigint(r.basePlasma), bigint(r.availablePlasma),
    bigint(f.nextFusionPrice), bigint(f.nextWorkPrice),
    1000n, 1500n, safeResult,
  );
  if (bigint(r.requiredFusedPlasma) !== amounts.requiredFusedPlasma) {
    reject('inconsistent_total');
  }
  if (bigint(r.requiredDifficulty) !== amounts.expectedDifficulty) {
    reject('inconsistent_difficulty');
  }
  return freeze({
    requiredFusedQuoteVersion: 1,
    scope: 'DECLARED_V2_REQUIRED_FUSED_TOTAL',
    chainAuthentication: 'NOT_ESTABLISHED',
    activation: 'NOT_ESTABLISHED',
    afterSigningAction: 'NONE',
    authority: 'NONE',
    numberRepresentation: 'NONNEGATIVE_SAFE_INTEGER_ONLY',
    frontier: freeze({
      height: f.height, hash: f.hash, version: f.version,
      nextFusionPrice: f.nextFusionPrice, nextWorkPrice: f.nextWorkPrice,
    }),
    rpcObservation: freeze({
      availablePlasma: r.availablePlasma, basePlasma: r.basePlasma,
      requiredDifficulty: r.requiredDifficulty, requiredFusedPlasma: r.requiredFusedPlasma,
    }),
    fusedOnlyTarget: freeze({
      fusedPlasmaTotal: r.requiredFusedPlasma,
      requiredDifficulty: 0,
    }),
    declaredRecommendation: freeze({
      fusedPlasma: number(amounts.selectedFusedPlasma),
      requiredDifficulty: number(amounts.expectedDifficulty),
      pricingMode: amounts.pricingMode,
    }),
  });
}

function record(value, fields) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype) reject('invalid_data');
  if (ownKeys(value).length !== fields.length) reject('invalid_data');
  const copy = create(null);
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index], d = descriptor(value, field);
    if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) {
      reject('invalid_data');
    }
    copy[field] = d.value;
  }
  return copy;
}

function safe(value) {
  if (!safeInteger(value) || value < 0 || same(value, -0)) reject('unsafe_integer');
}

function safeResult(value) {
  if (typeof value !== 'bigint' || value < 0n || value > MAX_SAFE) reject('arithmetic_bound');
}

function reject(reason) {
  const code = 'dynamic_plasma_required_fused_quote_' + reason;
  const error = new ErrorType(code);
  define(error, 'code', { value: code, enumerable: true });
  define(error, 'stack', { value: 'TypeError: ' + code, enumerable: false });
  throw freeze(error);
}
