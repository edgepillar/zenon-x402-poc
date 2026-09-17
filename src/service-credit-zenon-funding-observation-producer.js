import { types as utilTypes } from 'node:util';
import { ZenonFundingObserverSqliteStore } from './service-credit-zenon-funding-observer-sqlite-store.js';
import { parseZenonFundingProviderAttestationAuthorityRecord } from './service-credit-zenon-funding-provider-attestation.js';

const APPLY = Reflect.apply;
const KEYS = Reflect.ownKeys;
const DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const PROTOTYPE = Reflect.getPrototypeOf;
const DEFINE = Object.defineProperty;
const FREEZE = Object.freeze;
const IS_FROZEN = Object.isFrozen;
const HAS_OWN = Object.hasOwn;
const OBJECT_PROTOTYPE = Object.prototype;
const ARRAY_PROTOTYPE = Array.prototype;
const IS_ARRAY = Array.isArray;
const IS_PROXY = utilTypes.isProxy;
const SAFE_INTEGER = Number.isSafeInteger;
const PARSE = JSON.parse;
const STRINGIFY = JSON.stringify;
const BYTE_LENGTH = Buffer.byteLength;
const FROM = Buffer.from;
const TO_STRING = Buffer.prototype.toString;
const SLICE = String.prototype.slice;
const TEST = RegExp.prototype.test;
const STORE_PROTOTYPE = ZenonFundingObserverSqliteStore.prototype;
const LOAD = STORE_PROTOTYPE.load;
const PLAN = STORE_PROTOTYPE.planBackfill;
const PAGE = STORE_PROTOTYPE.applyPage;
const INCLUSION = STORE_PROTOTYPE.applyInclusion;
const HASH = /^[0-9a-f]{64}$/;
const HEX = /^(?:[0-9a-f]{2})*$/;
const DECIMAL = /^[1-9][0-9]{0,76}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const PREFIX = 'ZENON_FUNDING_OBSERVATION_PRODUCER_';
const MAX_REPLY_BYTES = 1024 * 1024;
const MAX_HEADERS = 1024;

class ProducerFailure extends TypeError {
  constructor(suffix) {
    const code = `${PREFIX}${suffix}`;
    super(code);
    DEFINE(this, 'code', { value: code, enumerable: true });
    DEFINE(this, 'stack', { value: code });
    FREEZE(this);
  }
}
function fail(suffix) {
  throw new ProducerFailure(suffix);
}

function exact(value, required, optional = [], frozen = false, code = 'INVALID_INPUT') {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTOTYPE(value) !== OBJECT_PROTOTYPE || (frozen && !IS_FROZEN(value))) fail(code);
  const keys = KEYS(value);
  if (keys.length < required.length || keys.length > required.length + optional.length) fail(code);
  const copy = {};
  for (const key of keys) {
    if (typeof key !== 'string' || (!required.includes(key) && !optional.includes(key))) fail(code);
    const descriptor = DESCRIPTOR(value, key);
    if (!descriptor?.enumerable || !HAS_OWN(descriptor, 'value')) fail(code);
    DEFINE(copy, key, { value: descriptor.value, enumerable: true });
  }
  for (const key of required) if (!HAS_OWN(copy, key)) fail(code);
  return copy;
}

function text(value, pattern, maximum = 128, code = 'INVALID_INPUT') {
  if (typeof value !== 'string' || value.length > maximum || !APPLY(TEST, pattern, [value])) fail(code);
}
function integer(value, minimum = 0) {
  if (!SAFE_INTEGER(value) || value < minimum) fail('INVALID_INPUT');
}
function same(left, right) {
  function canonical(value) {
    if (value === null || typeof value !== 'object') return APPLY(STRINGIFY, undefined, [value]);
    if (IS_ARRAY(value)) return `[${value.map(canonical).join(',')}]`;
    return `{${KEYS(value).sort().map(key => `${APPLY(STRINGIFY, undefined, [key])}:${canonical(DESCRIPTOR(value, key).value)}`).join(',')}}`;
  }
  return canonical(left) === canonical(right);
}
function checkpoint(value, frozen = false, code = 'INVALID_INPUT') {
  const result = exact(value, ['height', 'hash'], [], frozen, code);
  if (!SAFE_INTEGER(result.height) || result.height < 0) fail(code);
  text(result.hash, HASH, 64, code);
  return FREEZE({ height: result.height, hash: result.hash });
}
function binding(value, code) {
  const result = exact(value, [
    'sourcePolicyCommitment', 'authorityGeneration', 'chainProfile', 'bootstrapCheckpoint',
  ], [], true, code);
  text(result.sourcePolicyCommitment, /^sha256:[0-9a-f]{64}$/, 71, code);
  const generation = exact(result.authorityGeneration, [
    'generationId', 'generationVersion', 'generationCommitment',
  ], [], true, code);
  text(generation.generationId, IDENTIFIER, 128, code);
  text(generation.generationCommitment, /^sha256:[0-9a-f]{64}$/, 71, code);
  if (!SAFE_INTEGER(generation.generationVersion) || generation.generationVersion < 1) fail(code);
  const profile = exact(result.chainProfile, ['version', 'chainIdentifier', 'genesisMomentumHash'], [], true, code);
  text(profile.chainIdentifier, /^[1-9][0-9]{0,9}$/, 10, code);
  text(profile.genesisMomentumHash, HASH, 64, code);
  if (profile.version !== 1 || Number(profile.chainIdentifier) > 4294967295) fail(code);
  return FREEZE({
    sourcePolicyCommitment: result.sourcePolicyCommitment,
    authorityGeneration: FREEZE({
      generationId: generation.generationId, generationVersion: generation.generationVersion,
      generationCommitment: generation.generationCommitment,
    }),
    chainProfile: FREEZE({
      version: profile.version, chainIdentifier: profile.chainIdentifier, genesisMomentumHash: profile.genesisMomentumHash,
    }),
    bootstrapCheckpoint: checkpoint(result.bootstrapCheckpoint, true, code),
  });
}

function genuineStore(store) {
  if (store === null || typeof store !== 'object' || IS_PROXY(store)
      || PROTOTYPE(store) !== STORE_PROTOTYPE || KEYS(store).length !== 0) return false;
  for (const [name, method] of [['load', LOAD], ['planBackfill', PLAN], ['applyPage', PAGE], ['applyInclusion', INCLUSION]]) {
    const descriptor = DESCRIPTOR(STORE_PROTOTYPE, name);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.value !== method) return false;
  }
  return true;
}

// Only bounded JSON text is decoded. SDK instances, getters, toJSON, Proxies,
// thenables and foreign objects are never reply observation routes.
function decode(reply, maximumBytes) {
  if (typeof reply !== 'string' || reply.length > maximumBytes
      || APPLY(BYTE_LENGTH, undefined, [reply, 'utf8']) > maximumBytes) fail('INVALID_INPUT');
  let value;
  try { value = APPLY(PARSE, undefined, [reply]); } catch { fail('INVALID_INPUT'); }
  let nodes = 0;
  function visit(item, depth) {
    nodes += 1;
    if (nodes > 16384 || depth > 16) fail('INVALID_INPUT');
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return;
    if (typeof item === 'number') { integer(item); return; }
    if (typeof item !== 'object') fail('INVALID_INPUT');
    for (const key of KEYS(item)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') fail('INVALID_INPUT');
      if (key !== 'length') visit(DESCRIPTOR(item, key).value, depth + 1);
    }
  }
  visit(value, 0);
  return exact(value, ['checkpoint', 'frontier', 'momentums', 'accountBlock', 'inclusionMomentum']);
}

function headers(value, maximum) {
  if (!IS_ARRAY(value) || PROTOTYPE(value) !== ARRAY_PROTOTYPE || value.length > maximum) fail('INVALID_INPUT');
  const found = [];
  const identities = new Set();
  const hashes = new Set();
  for (const raw of value) {
    const header = exact(raw, ['address', 'hash', 'height']);
    text(header.address, IDENTIFIER);
    text(header.hash, HASH, 64);
    integer(header.height, 1);
    const identity = `${header.address}:${header.height}`;
    if (identities.has(identity) || hashes.has(header.hash)) fail('INVALID_INPUT');
    identities.add(identity);
    hashes.add(header.hash);
    found.push(header);
  }
  return found;
}

// SDK 1.0.5 Momentum.fromJson uses hex data and AccountHeader JSON records.
// Momentum.toJson is deliberately not used: its content is not raw header JSON.
function momentum(value, chainIdentifier, maximumHeaders) {
  const result = exact(value, [
    'version', 'chainIdentifier', 'hash', 'previousHash', 'height', 'timestamp',
    'data', 'content', 'changesHash', 'publicKey', 'signature', 'producer',
  ]);
  integer(result.version, 1);
  integer(result.chainIdentifier, 1);
  if (result.version !== 1 || result.chainIdentifier !== chainIdentifier) fail('SOURCE_CONTEXT_CONFLICT');
  for (const key of ['hash', 'previousHash', 'changesHash']) text(result[key], HASH, 64);
  integer(result.height, 1);
  integer(result.timestamp);
  text(result.data, HEX, 8192);
  for (const key of ['publicKey', 'signature']) text(result[key], /^[\x20-\x7e]*$/, 256);
  text(result.producer, IDENTIFIER);
  return { ...result, content: headers(result.content, maximumHeaders) };
}

function bytes(value, maximum) {
  // Raw AccountBlock JSON data is base64, not the intent's hexadecimal text.
  if (value === null) return '';
  text(value, BASE64, maximum * 4 + 4, 'TARGET_MISMATCH');
  const decoded = APPLY(FROM, undefined, [value, 'base64']);
  if (decoded.length > maximum || APPLY(TO_STRING, decoded, ['base64']) !== value) fail('TARGET_MISMATCH');
  return APPLY(TO_STRING, decoded, ['hex']);
}
function accountBlock(value, target, chainIdentifier) {
  if (value === null) return null;
  const block = exact(value, [
    'version', 'chainIdentifier', 'blockType', 'hash', 'previousHash', 'height',
    'momentumAcknowledged', 'address', 'toAddress', 'amount', 'tokenStandard',
    'fromBlockHash', 'data', 'fusedPlasma', 'difficulty', 'nonce', 'publicKey', 'signature',
  ], [
    'token', 'descendantBlocks', 'basePlasma', 'usedPlasma', 'changesHash', 'confirmationDetail', 'pairedAccountBlock',
  ]);
  for (const key of ['version', 'chainIdentifier', 'blockType', 'height']) integer(block[key], 1);
  for (const key of ['fusedPlasma', 'difficulty', 'basePlasma', 'usedPlasma']) {
    if (HAS_OWN(block, key)) integer(block[key]);
  }
  for (const key of ['hash', 'previousHash', 'fromBlockHash']) text(block[key], HASH, 64);
  if (HAS_OWN(block, 'changesHash')) text(block.changesHash, HASH, 64);
  checkpoint(block.momentumAcknowledged);
  for (const key of ['address', 'toAddress', 'tokenStandard']) text(block[key], IDENTIFIER);
  text(block.amount, DECIMAL, 77);
  text(block.nonce, /^(?:[0-9a-f]{16})?$/, 16);
  for (const key of ['publicKey', 'signature']) {
    const value = block[key];
    if (typeof value === 'string') text(value, BASE64, 128);
    else if (!IS_ARRAY(value) || value.length > 64 || value.some(byte => !SAFE_INTEGER(byte) || byte < 0 || byte > 255)) fail('INVALID_INPUT');
  }
  if (HAS_OWN(block, 'descendantBlocks') && !IS_ARRAY(block.descendantBlocks)) fail('INVALID_INPUT');
  for (const key of ['token', 'pairedAccountBlock']) {
    if (HAS_OWN(block, key) && block[key] !== null && (typeof block[key] !== 'object' || IS_ARRAY(block[key]))) fail('INVALID_INPUT');
  }
  if (block.version !== 1 || block.chainIdentifier !== chainIdentifier || block.blockType !== 2
      || `zenontx:${block.hash}` !== target.transactionId || block.address !== target.payer
      || block.toAddress !== target.payee || block.amount !== target.amount || block.tokenStandard !== target.asset
      || block.fromBlockHash !== '0'.repeat(64)
      || `sha256:${bytes(block.data, 32)}` !== target.paymentIntentDigest) fail('TARGET_MISMATCH');
  let confirmation = null;
  if (block.confirmationDetail !== undefined && block.confirmationDetail !== null) {
    confirmation = exact(block.confirmationDetail, ['numConfirmations', 'momentumHeight', 'momentumHash', 'momentumTimestamp']);
    integer(confirmation.numConfirmations);
    integer(confirmation.momentumHeight, 1);
    integer(confirmation.momentumTimestamp);
    text(confirmation.momentumHash, HASH, 64);
  }
  return { height: block.height, confirmation };
}

function targetHeader(item, block, target) {
  let present = false;
  for (const header of item.content) {
    if (`zenontx:${header.hash}` !== target.transactionId) continue;
    if (block === null || header.address !== target.payer || header.height !== block.height) fail('TARGET_MISMATCH');
    present = true;
  }
  return present;
}
function admitPendingReceiptLineage(state, checkpointReply, frontier, entries) {
  const cursor = state.checkpoint;
  if (checkpointReply.hash !== cursor.hash
      || (frontier.height === cursor.height && frontier.hash !== cursor.hash)) fail('SOURCE_CONTEXT_CONFLICT');
  let previousHash = cursor.hash;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.height !== cursor.height + index + 1 || entry.previousHash !== previousHash) fail('SOURCE_CONTEXT_CONFLICT');
    previousHash = entry.hash;
  }
  const end = entries[entries.length - 1];
  if (end !== undefined && end.height === frontier.height && end.hash !== frontier.hash) fail('SOURCE_CONTEXT_CONFLICT');
}
function aggregate(record, status) {
  return FREEZE({ status, observerStatus: record.state.status, outboxStatus: record.outbox.status, revision: record.state.revision });
}
function immutable(record) {
  return APPLY(STRINGIFY, undefined, [{
    recordKey: record.recordKey, authorityRecordDigest: record.authorityRecordDigest,
    observerRecordId: record.state.observerRecordId, targetBindingDigest: record.state.targetBindingDigest,
    target: record.state.target, chainProfile: record.state.chainProfile,
    observerPolicy: record.state.observerPolicy, authorityGeneration: record.state.authorityGeneration,
    confirmationPolicy: record.state.confirmationPolicy, limits: {
      maximumPageEntries: record.state.catchUp.maximumPageEntries,
      maximumBackfillSpan: record.state.catchUp.maximumBackfillSpan,
      maximumMembersPerMomentum: record.state.catchUp.maximumMembersPerMomentum,
    },
  }]);
}

/**
 * Default-off synchronous admission of one bounded raw-native JSON bundle.
 * Configuration is exactly { fundingObserverStore, authorityRecord,
 * sourceBinding, limits }; sourceBinding and limits must be deeply frozen.
 * apply({ expectedRevision, sourceBinding, reply }) accepts JSON text, or null
 * for unavailable source. No reader, connection, scheduler or signing is owned.
 *
 * The bundle contains raw checkpoint/frontier Momentum replies, one raw
 * MomentumList, AccountBlock or null, and inclusion Momentum or null. Full
 * native content is bounded/validated; only the proven target is projected.
 * Header addresses have bounded identifier syntax, not checksum/ownership
 * verification. The captured external source policy must permit target-only
 * projection; its commitment does not authenticate the supplied JSON.
 * Ancillary account metadata is byte/node-bounded but not used as authority.
 * Existing intake preflight owns signature/hash verification; this step checks
 * the committed target tuple and base64-encoded 32-byte intent, not signatures.
 * Policy/context matching is not endpoint authentication or provider truth.
 * No canonicality, finality, receipt, cancellation or external termination is
 * proved. Stores are borrowed and are never closed. There is no repin/fallback.
 * One step can perform separate existing store transactions, not an atomic
 * batch. Store failure latches recovery; reconstruct from committed state.
 * Exact last-step replay retrieves its fixed result only if the full committed
 * record is unchanged. This is a cooperating-process, not sandbox, contract.
 */
export function createZenonFundingObservationProducer(options) {
  if (arguments.length !== 1) fail('INVALID_CONFIGURATION');
  let configuration;
  let authority;
  let sourceBinding;
  let limits;
  let initial;
  try {
    configuration = exact(options, ['fundingObserverStore', 'authorityRecord', 'sourceBinding', 'limits'], [], true, 'INVALID_CONFIGURATION');
    if (!genuineStore(configuration.fundingObserverStore) || typeof configuration.authorityRecord !== 'string'
        || configuration.authorityRecord.length > 524288) fail('INVALID_CONFIGURATION');
    authority = parseZenonFundingProviderAttestationAuthorityRecord(configuration.authorityRecord);
    sourceBinding = binding(configuration.sourceBinding, 'INVALID_CONFIGURATION');
    limits = exact(configuration.limits, ['maximumReplyBytes', 'maximumContentHeaders'], [], true, 'INVALID_CONFIGURATION');
    if (!SAFE_INTEGER(limits.maximumReplyBytes) || limits.maximumReplyBytes < 1 || limits.maximumReplyBytes > MAX_REPLY_BYTES
        || !SAFE_INTEGER(limits.maximumContentHeaders) || limits.maximumContentHeaders < 1 || limits.maximumContentHeaders > MAX_HEADERS) fail('INVALID_CONFIGURATION');
    if (!same(sourceBinding, binding(FREEZE({
      sourcePolicyCommitment: authority.sourcePolicyCommitment,
      authorityGeneration: authority.authorityGeneration, chainProfile: authority.chainProfile,
      bootstrapCheckpoint: authority.bootstrapCheckpoint,
    }), 'INVALID_CONFIGURATION'))) fail('INVALID_CONFIGURATION');
    initial = APPLY(LOAD, configuration.fundingObserverStore, []);
    if (initial.authorityRecordDigest !== authority.authorityRecordDigest
        || !same(initial.state.authorityGeneration, authority.authorityGeneration)
        || !same(initial.state.chainProfile, authority.chainProfile)
        || !same(initial.state.observerPolicy, authority.observerPolicy)
        || !same(initial.state.confirmationPolicy, authority.confirmationPolicy)) fail('INVALID_CONFIGURATION');
  } catch { fail('INVALID_CONFIGURATION'); }
  const store = configuration.fundingObserverStore;
  const captured = immutable(initial);
  const chainIdentifier = Number(sourceBinding.chainProfile.chainIdentifier);
  let active = false;
  let terminal = null;
  let replay = null;
  function load() {
    if (!genuineStore(store)) { terminal = 'STORE_RECOVERY_REQUIRED'; fail(terminal); }
    let record;
    try { record = APPLY(LOAD, store, []); } catch { terminal = 'STORE_RECOVERY_REQUIRED'; fail(terminal); }
    if (immutable(record) !== captured) { terminal = 'SOURCE_CONTEXT_CONFLICT'; fail(terminal); }
    return record;
  }
  function mutate(method, input) {
    let outcome;
    try { outcome = APPLY(method, store, [input]); } catch { terminal = 'STORE_RECOVERY_REQUIRED'; fail(terminal); }
    if (terminal !== null) fail(terminal);
    return outcome;
  }
  const apply = FREEZE(function applyZenonFundingObservationStep(input, ...extra) {
    if (extra.length !== 0) fail('INVALID_INPUT');
    if (active) { terminal = 'STORE_RECOVERY_REQUIRED'; fail('REENTRANT'); }
    if (terminal !== null) fail(terminal);
    active = true;
    try {
      const request = exact(input, ['expectedRevision', 'sourceBinding', 'reply']);
      integer(request.expectedRevision);
      if (!same(binding(request.sourceBinding, 'INVALID_INPUT'), sourceBinding)) {
        terminal = 'SOURCE_CONTEXT_CONFLICT'; fail(terminal);
      }
      let record = load();
      const recordBytes = APPLY(STRINGIFY, undefined, [record]);
      if (replay !== null && request.expectedRevision === replay.expectedRevision && request.reply === replay.reply
          && recordBytes === replay.recordBytes) return replay.result;
      if (request.expectedRevision !== record.state.revision) fail('STALE_REVISION');
      if (record.state.status === 'QUARANTINED') return aggregate(record, 'QUARANTINED');
      if (request.reply === null) return aggregate(record, 'SOURCE_UNAVAILABLE');
      const raw = decode(request.reply, limits.maximumReplyBytes);
      const checkpointReply = raw.checkpoint === null ? null : momentum(raw.checkpoint, chainIdentifier, limits.maximumContentHeaders);
      const frontier = momentum(raw.frontier, chainIdentifier, limits.maximumContentHeaders);
      const listReply = exact(raw.momentums, ['count', 'list']);
      integer(listReply.count);
      // The legacy DTO declares count but establishes no pagination meaning.
      // Coverage comes from the exact bounded list and linked store plan only.
      if (!IS_ARRAY(listReply.list) || listReply.list.length > record.state.catchUp.maximumPageEntries) fail('INVALID_INPUT');
      const list = listReply.list.map(item => momentum(item, chainIdentifier, limits.maximumContentHeaders));
      const block = accountBlock(raw.accountBlock, record.state.target, chainIdentifier);
      const inclusion = raw.inclusionMomentum === null ? null : momentum(raw.inclusionMomentum, chainIdentifier, limits.maximumContentHeaders);
      if (block?.confirmation) {
        if (inclusion === null || inclusion.height !== block.confirmation.momentumHeight
            || inclusion.hash !== block.confirmation.momentumHash || inclusion.timestamp !== block.confirmation.momentumTimestamp
            || !targetHeader(inclusion, block, record.state.target)) fail('TARGET_MISMATCH');
      } else if (inclusion !== null) fail('TARGET_MISMATCH');
      const projected = list.map(item => {
        const present = targetHeader(item, block, record.state.target);
        if (present && (inclusion === null || item.height !== inclusion.height || item.hash !== inclusion.hash)) fail('TARGET_MISMATCH');
        return { height: item.height, hash: item.hash, previousHash: item.previousHash,
          members: present ? [{ transactionId: record.state.target.transactionId, targetBindingDigest: record.state.targetBindingDigest }] : [] };
      });
      if (frontier.height < record.state.checkpoint.height) return aggregate(record, 'SOURCE_BEHIND');
      if (checkpointReply === null) return aggregate(record, 'SOURCE_UNAVAILABLE');
      const expectedEntries = Math.min(
        frontier.height - record.state.checkpoint.height,
        record.state.catchUp.maximumPageEntries, record.state.catchUp.maximumBackfillSpan,
      );
      if (projected.length !== expectedEntries) fail('INVALID_INPUT');
      if (checkpointReply.height !== record.state.checkpoint.height) {
        terminal = 'SOURCE_CONTEXT_CONFLICT'; fail(terminal);
      }
      const cursorConflict = checkpointReply.hash !== record.state.checkpoint.hash;
      // A real first-page parent conflict is given to the existing quarantine
      // transition. An inconsistent checkpoint-only bundle is refused locally;
      // no synthetic page or quarantine observation is invented.
      if (cursorConflict && (projected.length === 0 || projected[0].previousHash !== checkpointReply.hash)) {
        terminal = 'SOURCE_CONTEXT_CONFLICT'; fail(terminal);
      }
      let changed = false;
      // A retained target receipt must be classified before another page can
      // replace it. This also resumes the genuine applyPage commit window.
      if (record.state.inclusion === null && record.state.catchUp.lastAppliedPage !== null
          && record.state.catchUp.lastAppliedPage.targetMembership !== null) {
        // Validate all available lineage before this separate transaction can
        // commit positive eligibility. Refusal leaves the pending receipt intact;
        // no invented page or quarantine observation crosses the store boundary.
        admitPendingReceiptLineage(record.state, checkpointReply, frontier, projected);
        const receipt = record.state.catchUp.lastAppliedPage;
        mutate(INCLUSION, {
          expectedRevision: record.state.revision, target: record.state.target,
          observation: block?.confirmation ? {
            status: 'FOUND', transactionId: record.state.target.transactionId,
            targetBindingDigest: record.state.targetBindingDigest,
            momentumHeight: block.confirmation.momentumHeight, momentumHash: block.confirmation.momentumHash,
            pageDigest: receipt.pageDigest,
          } : { status: 'NOT_FOUND', transactionId: record.state.target.transactionId },
        });
        changed = true;
        record = load();
        if (record.state.status === 'QUARANTINED') return aggregate(record, 'QUARANTINED');
      }
      const planned = mutate(PLAN, { expectedRevision: record.state.revision, frontier: { height: frontier.height, hash: frontier.hash } });
      if (planned.disposition === 'QUARANTINED') return aggregate(load(), 'QUARANTINED');
      if (planned.plan !== null) {
        if (projected.length !== planned.plan.entryCount) fail('INVALID_INPUT');
        mutate(PAGE, { expectedRevision: record.state.revision, plan: planned.plan, momentums: projected });
        changed = true;
        record = load();
        if (record.state.status === 'QUARANTINED') return aggregate(record, 'QUARANTINED');
      } else if (projected.length !== 0) fail('INVALID_INPUT');
      if (block?.confirmation && block.confirmation.momentumHeight <= record.state.checkpoint.height) {
        const receipt = record.state.catchUp.lastAppliedPage;
        if (receipt === null) { terminal = 'SOURCE_CONTEXT_CONFLICT'; fail(terminal); }
        const outcome = mutate(INCLUSION, {
          expectedRevision: record.state.revision, target: record.state.target,
          observation: {
            status: 'FOUND', transactionId: record.state.target.transactionId,
            targetBindingDigest: record.state.targetBindingDigest,
            momentumHeight: block.confirmation.momentumHeight, momentumHash: block.confirmation.momentumHash,
            pageDigest: receipt.pageDigest,
          },
        });
        changed = changed || outcome.disposition === 'APPLIED';
        record = load();
      } else if (block === null || block.confirmation === null) {
        mutate(INCLUSION, {
          expectedRevision: record.state.revision, target: record.state.target,
          observation: { status: 'NOT_FOUND', transactionId: record.state.target.transactionId },
        });
        record = load();
      }
      const result = aggregate(record, record.state.status === 'QUARANTINED' ? 'QUARANTINED' : changed ? 'APPLIED' : 'UNCHANGED');
      replay = { expectedRevision: request.expectedRevision, reply: request.reply,
        recordBytes: APPLY(STRINGIFY, undefined, [record]), result };
      return result;
    } catch (error) {
      if (!(error instanceof ProducerFailure)) { terminal = 'STORE_RECOVERY_REQUIRED'; fail(terminal); }
      if (DESCRIPTOR(error, 'code')?.value === `${PREFIX}SOURCE_CONTEXT_CONFLICT`) terminal = 'SOURCE_CONTEXT_CONFLICT';
      throw error;
    } finally { active = false; }
  });
  return FREEZE({ apply });
}
