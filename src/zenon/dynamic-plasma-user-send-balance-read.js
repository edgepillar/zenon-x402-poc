import { types as utilTypes } from 'node:util';
import { Buffer } from 'node:buffer';
import { snapshotActiveUpfrontRequirement } from '../x402-wire.js';
import { createZenonUserSendObservationInput } from './transaction-planner.js';
import { snapshotBoundedJsonRpcReadResultText } from './bounded-json-rpc-read-core.js';
import { decodeZenonUserSendHashCores } from './dynamic-plasma-json-rpc-read-transport.js';

const REQUIREMENT = snapshotActiveUpfrontRequirement;
const REQUEST = createZenonUserSendObservationInput;
const RESULT = snapshotBoundedJsonRpcReadResultText;
const CORES = decodeZenonUserSendHashCores;
const PARSE = JSON.parse;
const ownKeys = Reflect.ownKeys;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const hasOwn = Object.hasOwn;
const create = Object.create;
const define = Object.defineProperty;
const freeze = Object.freeze;
const isProxy = utilTypes.isProxy;
const isSafeInteger = Number.isSafeInteger;
const same = Object.is;
const toInteger = BigInt;
const toNumber = Number;
const toString = String;
const objectPrototype = Object.prototype;
const ErrorType = TypeError;
const test = Function.call.bind(RegExp.prototype.test);
const HASH = /^[0-9a-f]{64}$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)(?![\s\S])/;
const NUMBER_SOURCE = Symbol('account-info integer source');
const MAX_SAFE = 9007199254740991n;
const FIELDS = freeze([
  'balanceReadVersion', 'phase', 'paymentRequired', 'accepted', 'payerAddress',
  'compiledSporkIds', 'accountFrontier', 'resultJson',
]);
const FRONTIER_FIELDS = freeze(['address', 'chainIdentifier', 'hash', 'height']);
const ACCOUNT_FIELDS = freeze(['address', 'accountHeight', 'balanceInfoMap']);
const BALANCE_FIELDS = freeze(['token', 'balance']);

/**
 * Pure selected-token balance consistency from supplied native AccountInfo
 * result text. Source: go-zenon e58d8e80eabd9fd5630ed62e0707424d96b5303c,
 * rpc/api/ledger_types.go AccountInfo/BalanceInfoMarshal and ledger.go
 * GetAccountInfoByAddress. Native wire uses accountHeight, NOT the SDK's
 * converted blockCount. Balance is a canonical nonnegative decimal string
 * (*big.Int), compared without Number conversion or token-decimal rescaling.
 *
 * Bind selected intent/payer/asset and a declared nonempty account frontier;
 * accountHeight must equal that frontier height. Require an explicit selected
 * entry with matching tokenStandard. Missing/null entry/map is unavailable,
 * never zero or unreceived funds: native construction can skip unknown token
 * metadata, and mailbox/unreceived is a separate endpoint. Explicit zero is
 * valid balance DATA but cannot cover a positive selected amount.
 *
 * AccountInfo contains NO chain ID or block hash. This validates equality of
 * supplied DATA only, NOT the balance sample's chain/origin/frontier hash,
 * atomicity/freshness, authenticated/current balance, canonicality, funds or
 * spendability. Other token metadata and unselected map entries are bounded
 * JSON only, not a full token/account validator. Both reads may be forged.
 *
 * Reuse the existing bounded duplicate/key/depth/UTF8 scanner and native
 * numeric-source retention for accountHeight. A local id1 frame is syntax
 * reuse, never actual RPC correlation. At most65536 raw UTF8 bytes are read.
 * No RPC, SDK, callback, Promise, preparation, key/work/signing, publication,
 * payment, recovery or authority operation occurs; active SDK guard unchanged.
 */
export function validateZenonUserSendBalanceRead(input) {
  try {
    if (arguments.length !== 1) reject();
    const top = record(input, FIELDS);
    if (top.balanceReadVersion !== 1 || top.phase !== 'UNSIGNED') reject();
    const request = REQUEST({
      observationIntentVersion: 1, phase: top.phase, paymentRequired: top.paymentRequired,
      accepted: top.accepted, payerAddress: top.payerAddress, compiledSporkIds: top.compiledSporkIds,
    });
    const accepted = REQUIREMENT(top.accepted);
    CORES({ address: request.quoteRequest.address, toAddress: accepted.payTo, tokenStandard: accepted.asset });
    const frontier = record(top.accountFrontier, FRONTIER_FIELDS);
    if (frontier.address !== request.quoteRequest.address
        || !isSafeInteger(frontier.chainIdentifier) || frontier.chainIdentifier < 1
        || toString(frontier.chainIdentifier) !== request.expectedChainProfile.chainIdentifier
        || !isSafeInteger(frontier.height) || frontier.height < 1 || frontier.height >= toNumber(MAX_SAFE)
        || same(frontier.height, -0) || typeof frontier.hash !== 'string' || frontier.hash.length !== 64
        || !test(HASH, frontier.hash) || frontier.hash === '0'.repeat(64)) reject();
    if (typeof top.resultJson !== 'string' || top.resultJson.length > 65536
        || Buffer.byteLength(top.resultJson, 'utf8') > 65536) reject();
    const json = RESULT('{"jsonrpc":"2.0","id":1,"result":' + top.resultJson + '}', 1);
    const account = record(PARSE(json, retainNumberSource), ACCOUNT_FIELDS);
    if (account.address !== request.quoteRequest.address || integer(account.accountHeight) !== frontier.height) reject();
    object(account.balanceInfoMap);
    const entry = record(field(account.balanceInfoMap, accepted.asset), BALANCE_FIELDS);
    if (field(entry.token, 'tokenStandard') !== accepted.asset
        || typeof entry.balance !== 'string' || !test(DECIMAL, entry.balance)
        || toInteger(entry.balance) < toInteger(accepted.amount)) reject();
    return freeze({
      balanceReadVersion: 1, scope: 'DECLARED_USER_SEND_SELECTED_BALANCE_CONSISTENCY',
      address: account.address, accountHeight: frontier.height, tokenStandard: accepted.asset,
      balance: entry.balance, amount: accepted.amount, coversAmount: true,
      accountInfoChainAndFrontierHashBinding: 'NOT_ESTABLISHED',
      observationOrigin: 'NOT_ESTABLISHED', accountStateFreshness: 'NOT_ESTABLISHED',
      spendability: 'NOT_ESTABLISHED', authority: 'NONE', afterSigningAction: 'NONE',
    });
  } catch { reject(); }
}

function retainNumberSource(_key, value, context) {
  if (typeof value !== 'number') return value;
  if (typeof context !== 'object' || context === null) reject();
  const source = descriptor(context, 'source');
  if (source === undefined || !hasOwn(source, 'value') || typeof source.value !== 'string') reject();
  return freeze({ [NUMBER_SOURCE]: source.value });
}
function integer(value) {
  object(value);
  if (ownKeys(value).length !== 1) reject();
  const d = descriptor(value, NUMBER_SOURCE);
  if (d === undefined || !hasOwn(d, 'value') || typeof d.value !== 'string'
      || d.value.length > 20 || !test(DECIMAL, d.value) || toInteger(d.value) > MAX_SAFE) reject();
  return toNumber(toInteger(d.value));
}
function object(value) {
  if (typeof value !== 'object' || value === null || isProxy(value) || prototype(value) !== objectPrototype) reject();
}
function field(value, key) {
  object(value);
  const d = descriptor(value, key);
  if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) reject();
  return d.value;
}
function record(value, fields) {
  object(value);
  if (ownKeys(value).length !== fields.length) reject();
  const output = create(null);
  for (const key of fields) output[key] = field(value, key);
  return output;
}
function reject() {
  const code = 'zenon_user_send_balance_read_input_rejected';
  const error = new ErrorType(code);
  define(error, 'code', { value: code, enumerable: true });
  define(error, 'stack', { value: 'TypeError: ' + code, enumerable: false });
  throw freeze(error);
}
