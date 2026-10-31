import { types } from 'node:util';
import { Buffer } from 'node:buffer';
import { canonicalJson } from '../canonical.js';
import { snapshotBoundedJsonRpcReadResultText } from './bounded-json-rpc-read-core.js';
import { snapshotDynamicPlasmaQuoteRequest } from './dynamic-plasma-json-rpc-read-transport.js';
import { createZenonAccountStateReadTransport } from './dynamic-plasma-account-state-read-transport.js';
import { decodeZenonAccountFrontierReadResult } from './dynamic-plasma-account-frontier-read.js';
import { validateZenonUserSendBalanceRead } from './dynamic-plasma-user-send-balance-read.js';
import { createZenonUserSendObservationInput, createZenonUserSendSubject,
  snapshotZenonUnsignedUserSendFields, computeZenonUnsignedUserSendHash,
  validateZenonUnsignedUserSendHash } from './transaction-planner.js';
import { NonDpFusedPlasmaStrategy } from './non-dp-fused-plasma-strategy.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, P = Object.getPrototypeOf;
const K = Reflect.ownKeys, A = Reflect.apply, OP = Object.prototype, AP = Array.prototype;
const NP = Promise, PP = NP.prototype, THEN = PP.then, PARSE = JSON.parse;
const PC = D(PP, 'constructor'), PS = D(NP, Symbol.species), PLANS = new WeakMap();
const HASH = /^[0-9a-f]{64}$/, DIGEST = /^sha256:[0-9a-f]{64}$/;
const INPUT = ['nonDpReadInputVersion', 'phase', 'paymentRequired', 'accepted', 'payerAddress',
  'compiledSporkIds', 'policy', 'runtimeContextDigest', 'publicKey'];
const MOMENTUM = ['version', 'chainIdentifier', 'hash', 'previousHash', 'height', 'timestamp',
  'data', 'content', 'changesHash', 'publicKey', 'signature', 'nextFusionPrice', 'nextWorkPrice', 'producer'];
const FRONTIER = 'ledger.getFrontierMomentum', HEIGHT = 'ledger.getMomentumsByHeight';
const SPORK = 'embedded.spork.getAll', QUOTE = 'embedded.plasma.getRequiredPoWForAccountBlock';

function fail() {
  const e = new TypeError('NON_DP_OBSERVED_USER_SEND_READ');
  Object.defineProperty(e, 'stack', { value: e.message }); throw F(e);
}
function invariant() {
  if (D(OP, 'then') !== undefined || D(OP, 'toJSON') !== undefined || D(PP, 'then')?.value !== THEN
      || D(PP, 'constructor')?.value !== PC.value || D(NP, Symbol.species)?.get !== PS.get) fail();
}
function record(value, fields, frozen = false) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || P(value) !== OP
      || K(value).length !== fields.length || frozen && !Object.isFrozen(value)) fail();
  const out = {};
  for (const key of fields) {
    const d = D(value, key); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail();
    out[key] = d.value;
  }
  return F(out);
}
function uint(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < minimum || value > maximum) fail();
  return value;
}
function hash(value) { if (typeof value !== 'string' || !HASH.test(value) || value.length !== 64) fail(); return value; }
function base64(value, bytes) {
  if (typeof value !== 'string' || value.length !== 4 * Math.ceil(bytes / 3)) fail();
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== bytes || decoded.toString('base64') !== value) fail();
  return value;
}
// Pure address grammar check with fixed public intent bytes; never an RPC.
function address(value) { snapshotDynamicPlasmaQuoteRequest({ address: value, blockType: 2, toAddress: value, data: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }); }
function equal(a, b) { return canonicalJson(a) === canonicalJson(b); }
function capture(value, depth = 0, budget = { nodes: 4096, bytes: 65536 }) {
  if (depth > 24 || --budget.nodes < 0) fail();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return uint(value);
  if (typeof value === 'string') {
    const size = Buffer.byteLength(value, 'utf8'); budget.bytes -= size;
    if (size > 8192 || budget.bytes < 0) fail(); return value;
  }
  if (!value || typeof value !== 'object' || types.isProxy(value)) fail();
  const keys = K(value), array = Array.isArray(value);
  if (P(value) !== (array ? AP : OP) || keys.length > 257) fail();
  const out = array ? [] : {};
  if (array) {
    const d = D(value, 'length'); uint(d?.value, 0, 256);
    if (keys.length !== d.value + 1) fail();
    for (let i = 0; i < d.value; i++) {
      const entry = D(value, String(i)); if (!entry?.enumerable || !Object.hasOwn(entry, 'value')) fail();
      out[i] = capture(entry.value, depth + 1, budget);
    }
  } else {
    for (const key of keys) {
      if (typeof key !== 'string' || key.length > 128
          || ['__proto__', 'prototype', 'constructor', 'then', 'toJSON'].includes(key)) fail();
      const d = D(value, key); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail();
      out[key] = capture(d.value, depth + 1, budget);
    }
  }
  return F(out);
}
function input(value) {
  const c = record(capture(value), INPUT);
  if (c.nonDpReadInputVersion !== 1 || c.phase !== 'UNSIGNED' || typeof c.runtimeContextDigest !== 'string'
      || c.runtimeContextDigest.length !== 71 || !DIGEST.test(c.runtimeContextDigest)) fail();
  base64(c.publicKey, 32);
  const policy = record(c.policy, ['policyVersion', 'maxFusedPlasma', 'maxMomentumAdvances']);
  if (policy.policyVersion !== 1) fail(); uint(policy.maxFusedPlasma, 1); uint(policy.maxMomentumAdvances, 0, 128);
  const request = createZenonUserSendObservationInput({ observationIntentVersion: 1, phase: c.phase,
    paymentRequired: c.paymentRequired, accepted: c.accepted, payerAddress: c.payerAddress, compiledSporkIds: c.compiledSporkIds });
  return F({ c, request });
}
// Native Promise mechanics only. Borrowed ports must prehandle all rejections,
// including malformed promises. Never inspect a thenable or async-context symbol.
function join(pending) {
  invariant();
  if (!pending || types.isProxy(pending) || !types.isPromise(pending) || P(pending) !== PP) fail();
  const names = Object.getOwnPropertyNames(pending);
  if (names.length && (names.length !== 1 || names[0] !== 'constructor' || D(pending, 'constructor')?.value !== NP)) fail();
  const bridge = new NP(resolve => {
    A(THEN, pending, [value => { resolve(F(Object.assign(Object.create(null), { ok: true, value }))); },
      () => { resolve(F(Object.assign(Object.create(null), { ok: false }))); }]);
  });
  Object.defineProperty(bridge, 'constructor', { value: NP }); return bridge;
}
function parseResult(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 1048576) fail();
  // Local id1 framing reuses the existing bounded/duplicate-key scanner. The
  // borrowed transport owns actual envelope correlation; this is no new RPC ID.
  const checked = snapshotBoundedJsonRpcReadResultText('{"jsonrpc":"2.0","id":1,"result":' + text + '}', 1);
  return PARSE(checked, (_key, value, context) => {
    if (typeof value !== 'number') return value;
    const source = context && D(context, 'source');
    if (!source || !Object.hasOwn(source, 'value') || typeof source.value !== 'string'
        || !/^(0|[1-9][0-9]*)$/.test(source.value) || source.value !== String(uint(value))) fail();
    return value;
  });
}
function momentum(raw) {
  const m = record(raw, MOMENTUM);
  uint(m.height, 1); uint(m.chainIdentifier, 1); uint(m.timestamp); hash(m.hash); hash(m.previousHash); hash(m.changesHash);
  if (m.version !== 1 || m.nextFusionPrice !== 0 || m.nextWorkPrice !== 0 || m.data !== ''
      || !Array.isArray(m.content) || m.content.length > 1024) fail();
  base64(m.publicKey, 32); base64(m.signature, 64); address(m.producer);
  for (const rawHeader of m.content) {
    const h = record(rawHeader, ['address', 'hash', 'height']); address(h.address); hash(h.hash); uint(h.height, 1);
  }
  return F({ chainIdentifier: String(m.chainIdentifier), height: m.height, hash: m.hash,
    previousHash: m.previousHash, version: 1, nextFusionPrice: 0, nextWorkPrice: 0 });
}
function projectedFrontier(m) { return F({ height: m.height, hash: m.hash, version: m.version,
  nextFusionPrice: m.nextFusionPrice, nextWorkPrice: m.nextWorkPrice }); }

/** Source component borrowing existing retained read ports. Constructor is
 * inert; the parent owns endpoint authentication, deadlines, abort, drain and
 * close. requireCurrent is a synchronous void ownership guard, not JSON DATA.
 * Exactly quote -> assemble -> validateUnsigned; one original, no work stage,
 * retry, reset, quote refresh, DP fallback or ownership/lease acquisition.
 * All chain/profile/rule/balance matches are observed DATA, not authentication,
 * atomicity, ancestry, spendability, signing authority or native qualification.
 * Native non-DP entry/signer/spending/funding/grant/recovery binding is separate.
 */
export function createNonDpObservedUserSendReadAdapter(options) {
  invariant(); if (arguments.length !== 1) fail();
  const o = record(options, ['transports', 'accountExchange', 'requireCurrent'], true);
  if (!Array.isArray(o.transports) || types.isProxy(o.transports) || P(o.transports) !== AP
      || !Object.isFrozen(o.transports) || K(o.transports).length !== 3 || o.transports.length !== 2) fail();
  const ports = [0, 1].map(index => {
    const d = D(o.transports, String(index)); if (!d || !Object.hasOwn(d, 'value')) fail();
    const port = record(d.value, ['callRead'], true).callRead;
    if (typeof port !== 'function' || types.isProxy(port)) fail(); return port;
  });
  for (const f of [o.accountExchange, o.requireCurrent]) if (typeof f !== 'function' || types.isProxy(f)) fail();
  const accountRead = createZenonAccountStateReadTransport({ exchange: o.accountExchange }).callRead;
  const strategy = new NonDpFusedPlasmaStrategy();
  let active = false, held = false, stage = 'NEW', cycles = 0, original = null, block = null, plan = null;
  const reads = [0, 0, 0]; let guards = 0;
  function current() {
    invariant(); guards++; if (A(o.requireCurrent, undefined, []) !== undefined) fail(); invariant();
  }
  async function read(index, method, params) {
    current(); reads[index]++;
    const request = F({ method, params: F(params) });
    const pending = A(index === 2 ? accountRead : ports[index], undefined, [request]);
    const settled = await join(pending); current();
    if (!settled.ok || typeof settled.value !== 'string') fail(); return settled.value;
  }
  async function endpoint(index, request) {
    const before = momentum(parseResult(await read(index, FRONTIER, [])));
    const heightPage = record(parseResult(await read(index, HEIGHT, [2, 1])), ['count', 'list']);
    uint(heightPage.count, 2);
    if (!Array.isArray(heightPage.list) || heightPage.list.length !== 1) fail();
    const heightTwo = momentum(heightPage.list[0]), expected = request.expectedChainProfile;
    if (heightTwo.height !== 2 || heightTwo.previousHash !== expected.genesisMomentumHash
        || heightTwo.chainIdentifier !== expected.chainIdentifier || before.chainIdentifier !== expected.chainIdentifier) fail();
    const sporks = [], seen = new Set(); let count = null;
    for (let page = 0; page < 8; page++) {
      const p = record(parseResult(await read(index, SPORK, [page, 128])), ['count', 'list']); uint(p.count, 0, 1024);
      if (count !== null && p.count !== count || !Array.isArray(p.list)) fail(); count = p.count;
      if (p.list.length !== Math.min(128, count - page * 128)) fail();
      for (const raw of p.list) {
        const s = record(raw, ['id', 'name', 'description', 'activated', 'enforcementHeight']); hash(s.id); uint(s.enforcementHeight);
        if (typeof s.name !== 'string' || Buffer.byteLength(s.name, 'utf8') < 5 || Buffer.byteLength(s.name, 'utf8') > 40
            || typeof s.description !== 'string' || Buffer.byteLength(s.description, 'utf8') > 400
            || typeof s.activated !== 'boolean' || seen.has(s.id)) fail();
        seen.add(s.id); sporks.push(s);
        if (s.id === request.compiledSporkIds.dynamicPlasmaId && s.activated && s.enforcementHeight <= before.height) fail();
      }
      if (sporks.length === count) break;
    }
    if (sporks.length !== count) fail();
    const quote = record(parseResult(await read(index, QUOTE, [request.quoteRequest])), ['availablePlasma', 'basePlasma', 'requiredDifficulty']);
    uint(quote.availablePlasma); uint(quote.basePlasma, 1); uint(quote.requiredDifficulty);
    const after = momentum(parseResult(await read(index, FRONTIER, [])));
    if (!equal(before, after)) fail();
    return F({ before, heightTwo, sporks: F(sporks), quote, after });
  }
  async function observe(stable) {
    const { c, request } = stable; cycles++;
    const decode = text => decodeZenonAccountFrontierReadResult({ frontierReadVersion: 1, phase: 'UNSIGNED',
      expectedChainIdentifier: request.expectedChainProfile.chainIdentifier, payerAddress: c.payerAddress, resultJson: text });
    const before = decode(await read(2, 'ledger.getFrontierAccountBlock', [c.payerAddress]));
    if (original && !equal(before, original.frontier)) fail();
    const balance = validateZenonUserSendBalanceRead({ balanceReadVersion: 1, phase: 'UNSIGNED', paymentRequired: c.paymentRequired,
      accepted: c.accepted, payerAddress: c.payerAddress, compiledSporkIds: c.compiledSporkIds, accountFrontier: before,
      resultJson: await read(2, 'ledger.getAccountInfoByAddress', [c.payerAddress]) });
    const left = await endpoint(0, request), right = await endpoint(1, request);
    if (!equal(left, right)) fail();
    const after = decode(await read(2, 'ledger.getFrontierAccountBlock', [c.payerAddress]));
    if (!equal(before, after)) fail(); current();
    return F({ frontier: before, balance, observation: F({ chainProfileMatch: F({ classification: 'MATCH' }),
      beforeFrontier: projectedFrontier(left.before), rpcObservation: left.quote, afterFrontier: projectedFrontier(left.after) }) });
  }
  function context(stable, observed, subject) {
    const c = stable.c; return F({ phase: 'UNSIGNED', subject, paymentRequired: c.paymentRequired, accepted: c.accepted,
      payerAddress: c.payerAddress, compiledSporkIds: c.compiledSporkIds, observation: observed.observation,
      observedQuoteRequest: stable.request.quoteRequest, policy: c.policy, runtimeContextDigest: c.runtimeContextDigest });
  }
  async function execute(kind, args) {
    if (active || held || stage !== { quote: 'NEW', assemble: 'QUOTED', validate: 'ASSEMBLED' }[kind]) fail();
    invariant();
    if (args.length !== { quote: 1, assemble: 2, validate: 3 }[kind]) fail();
    const stable = input(args[0]);
    if (kind !== 'quote' && (types.isProxy(args[1]) || PLANS.get(args[1]) !== owner || args[1] !== plan
        || !equal(stable.c, original.stable.c))) fail();
    if (kind === 'validate') {
      const incoming = validateZenonUnsignedUserSendHash(args[2]);
      if (!equal(incoming.accountBlock, block)) fail();
    }
    active = true; let entered = false;
    try {
      entered = true; current(); const observed = await observe(stable); current();
      const subject = kind === 'quote' ? createZenonUserSendSubject({ subjectInputVersion: 1, phase: 'UNSIGNED',
        paymentRequired: stable.c.paymentRequired, accepted: stable.c.accepted, payerAddress: stable.c.payerAddress,
        compiledSporkIds: stable.c.compiledSporkIds, accountFrontier: observed.frontier,
        momentumAcknowledged: F({ height: observed.observation.beforeFrontier.height, hash: observed.observation.beforeFrontier.hash }) }) : plan.subject;
      const c = context(stable, observed, subject);
      if (kind === 'quote') {
        const selected = await join(strategy.quote(c)); current(); if (!selected.ok) fail();
        plan = F({ nonDpObservedUserSendPlanVersion: 1, subject, quote: selected.value, authority: 'NONE' });
        original = F({ stable, frontier: observed.frontier }); PLANS.set(plan, owner); stage = 'QUOTED'; return plan;
      }
      const applied = await join(strategy.apply(c, plan.quote)); current(); if (!applied.ok) fail();
      if (kind === 'assemble') {
        const draft = await join(strategy.createUnsignedUserSendDraft(c, plan.quote)); current(); if (!draft.ok) fail();
        const candidate = { ...draft.value.accountBlock, publicKey: stable.c.publicKey };
        candidate.hash = computeZenonUnsignedUserSendHash(candidate); current();
        block = snapshotZenonUnsignedUserSendFields(candidate).accountBlock; validateZenonUnsignedUserSendHash(block);
        current(); stage = 'ASSEMBLED';
      } else { validateZenonUnsignedUserSendHash(block); current(); stage = 'VALIDATED'; }
      return F({ nonDpObservedUnsignedVersion: 1, scope: 'DECLARED_BRACKETED_NON_DP_UNSIGNED_USER_SEND', originalPlan: plan, accountBlock: block,
        declaredBalanceRead: 'VALIDATED_IN_THIS_BRACKETED_READ_CYCLE', keyAddressBinding: 'NOT_PERFORMED',
        chainAuthentication: 'NOT_ESTABLISHED', signingAuthorization: 'NOT_ESTABLISHED', authority: 'NONE', afterSigningAction: 'NONE' });
    } catch { if (entered) held = true; fail(); } finally { active = false; }
  }
  const owner = F({ quote: (...args) => execute('quote', args), assemble: (...args) => execute('assemble', args),
    validateUnsigned: (...args) => execute('validate', args), inspect: () => F({ stage, active, held, cycles,
      reads: F([...reads]), ownershipGuardCalls: guards, borrowedReadRelease: 'PARENT_OWNED_NOT_ESTABLISHED',
      nativeEntryBinding: 'NOT_IMPLEMENTED', authority: 'NONE' }) });
  return owner;
}
