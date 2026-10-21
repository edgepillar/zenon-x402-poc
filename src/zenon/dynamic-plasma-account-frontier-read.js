import { types as utilTypes } from 'node:util';
import { Buffer } from 'node:buffer';
import { snapshotBoundedJsonRpcReadResultText } from './bounded-json-rpc-read-core.js';
import { snapshotDynamicPlasmaQuoteRequest } from './dynamic-plasma-json-rpc-read-transport.js';

const RESULT_TEXT = snapshotBoundedJsonRpcReadResultText;
const PAYER_REQUEST = snapshotDynamicPlasmaQuoteRequest;
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
const toInteger = BigInt;
const toNumber = Number;
const test = Function.call.bind(RegExp.prototype.test);
const objectPrototype = Object.prototype;
const ErrorType = TypeError;
const NUMBER_TOKEN = Symbol('account frontier numeric source');
const MAX_SAFE = 9007199254740991n;
const HASH = /^[0-9a-f]{64}$/;
const POSITIVE = /^[1-9][0-9]{0,19}(?![\s\S])/;
const ZERO_HASH = '0'.repeat(64);
const EMPTY_INTENT = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const INPUT_FIELDS = freeze([
  'frontierReadVersion', 'phase', 'expectedChainIdentifier', 'payerAddress',
  'requestId', 'responseJson',
]);
const BLOCK_FIELDS = freeze([
  'version', 'chainIdentifier', 'blockType', 'hash', 'previousHash', 'height',
  'momentumAcknowledged', 'address', 'toAddress', 'amount', 'tokenStandard',
  'fromBlockHash', 'descendantBlocks', 'data', 'fusedPlasma', 'difficulty',
  'nonce', 'basePlasma', 'usedPlasma', 'changesHash', 'publicKey', 'signature',
  'token', 'confirmationDetail', 'pairedAccountBlock',
]);

/**
 * Extract declared account-frontier DATA from one supplied raw JSON-RPC read
 * response. Wire shape: go-zenon e58d8e80eabd9fd5630ed62e0707424d96b5303c,
 * rpc/api/ledger.go GetFrontierAccountBlock(), rpc/api/ledger_types.go and
 * chain/nom/account_block.go AccountBlockMarshal. Only the25-field version1
 * shape is admitted. Returned four fields fit the existing UserSend subject
 * producer; null/missing/unavailable is NEVER inferred to mean empty account.
 *
 * First reuse the existing duplicate/key/depth/size-bounded envelope scanner.
 * Then keep every numeric primitive's original source through the captured
 * native JSON.parse reviver context; chain/height/version must be actual
 * canonical integer lexemes, not strings, fractions, exponents or rounded
 * Numbers. Fail closed if source context is unavailable. No parser callback
 * is supplied by a caller. Other block fields are bounded JSON only, NOT a
 * complete block/hash/signature/confirmation validation.
 *
 * This does not issue an RPC, change a transport allowlist, authenticate the
 * envelope/request ID/payer/chain, establish genesis/current state/funds,
 * prepare, produce work, sign, publish, retry or replace any existing payment.
 * Declared expected chain/address equality is not origin or signing authority.
 */
export function decodeZenonAccountFrontierRead(input) {
  try {
    if (arguments.length !== 1) reject();
    const top = record(input, INPUT_FIELDS);
    if (top.frontierReadVersion !== 1 || top.phase !== 'UNSIGNED'
        || typeof top.expectedChainIdentifier !== 'string'
        || !test(POSITIVE, top.expectedChainIdentifier)
        || toInteger(top.expectedChainIdentifier) > MAX_SAFE
        || !isSafeInteger(top.requestId) || top.requestId < 1 || top.requestId > 4294967295
        || typeof top.responseJson !== 'string' || top.responseJson.length > 65536
        || Buffer.byteLength(top.responseJson, 'utf8') > 65536) reject();
    PAYER_REQUEST({
      address: top.payerAddress, blockType: 2, toAddress: top.payerAddress, data: EMPTY_INTENT,
    });
    const result = RESULT_TEXT(top.responseJson, top.requestId);
    const block = record(PARSE(result, retainNumberSource), BLOCK_FIELDS);
    if (integer(block.version) !== 1 || integer(block.chainIdentifier) !== toNumber(toInteger(top.expectedChainIdentifier))
        || block.address !== top.payerAddress || typeof block.hash !== 'string' || block.hash.length !== 64
        || !test(HASH, block.hash) || block.hash === ZERO_HASH) reject();
    const height = integer(block.height);
    if (height >= toNumber(MAX_SAFE)) reject();
    return freeze({
      address: top.payerAddress, chainIdentifier: integer(block.chainIdentifier),
      hash: block.hash, height,
    });
  } catch { reject(); }
}

function retainNumberSource(_key, value, context) {
  if (typeof value !== 'number') return value;
  if (typeof context !== 'object' || context === null) reject();
  const source = descriptor(context, 'source');
  if (source === undefined || !hasOwn(source, 'value') || typeof source.value !== 'string') reject();
  return freeze({ [NUMBER_TOKEN]: source.value });
}

function integer(value) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype || ownKeys(value).length !== 1) reject();
  const d = descriptor(value, NUMBER_TOKEN);
  if (d === undefined || !hasOwn(d, 'value') || typeof d.value !== 'string'
      || !test(POSITIVE, d.value) || toInteger(d.value) > MAX_SAFE) reject();
  return toNumber(toInteger(d.value));
}

function record(value, fields) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype || ownKeys(value).length !== fields.length) reject();
  const result = create(null);
  for (const field of fields) {
    const d = descriptor(value, field);
    if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) reject();
    result[field] = d.value;
  }
  return result;
}

function reject() {
  const code = 'zenon_account_frontier_read_input_rejected';
  const error = new ErrorType(code);
  define(error, 'code', { value: code, enumerable: true });
  define(error, 'stack', { value: 'TypeError: ' + code, enumerable: false });
  throw freeze(error);
}

/**
 * Explicit result-text seam for the existing bounded read core, which already
 * checked the actual response envelope before stripping it. This function
 * itself claims NO request correlation or RPC origin: direct caller text is
 * still declared DATA. It accepts exactly5 fields, not the6-field framed API.
 *
 * The local id1 envelope below is ONLY syntax/projection reuse. It is not a
 * network response, acknowledgement, original request ID or authority receipt.
 * Reuse all original duplicate/numeric/shape/payer/chain/next-height checks,
 * including the original total UTF8/frame bounds and sanitized error contract.
 * No transport, exchange, Promise, endpoint or callback is invoked here.
 */
export function decodeZenonAccountFrontierReadResult(input) {
  try {
    if (arguments.length !== 1) reject();
    const top = record(input, [
      'frontierReadVersion', 'phase', 'expectedChainIdentifier', 'payerAddress', 'resultJson',
    ]);
    if (typeof top.resultJson !== 'string' || top.resultJson.length > 65536) reject();
    return decodeZenonAccountFrontierRead({
      frontierReadVersion: top.frontierReadVersion, phase: top.phase,
      expectedChainIdentifier: top.expectedChainIdentifier, payerAddress: top.payerAddress,
      requestId: 1, responseJson: '{"jsonrpc":"2.0","id":1,"result":' + top.resultJson + '}',
    });
  } catch { reject(); }
}
