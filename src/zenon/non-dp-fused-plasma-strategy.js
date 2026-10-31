import { types } from 'node:util';
import { captureNonDpFusedResourcePolicy } from './non-dp-fused-resource-policy.js';
import { PlasmaStrategy } from './plasma-strategy.js';
import { canonicalJson } from '../canonical.js';
import { classifyDynamicPlasmaCompatibility } from './dynamic-plasma-compatibility.js';
import { snapshotZenonUserSendPolicyBinding, snapshotZenonUnsignedUserSendFields } from './transaction-planner.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, OWNERS = new WeakSet(), QUOTES = new WeakMap();
const ZERO = '0'.repeat(64), NONCE = '0'.repeat(16), HASH = /^sha256:[0-9a-f]{64}$/;
const METHOD = 'embedded.plasma.getRequiredPoWForAccountBlock';
const CONTEXT = ['phase', 'subject', 'paymentRequired', 'accepted', 'payerAddress', 'compiledSporkIds',
  'observation', 'observedQuoteRequest', 'policy', 'runtimeContextDigest'];
const FRONTIER = ['height', 'hash', 'version', 'nextFusionPrice', 'nextWorkPrice'];
function fail() { const e = new TypeError('NON_DP_FUSED_PLASMA'); Object.defineProperty(e, 'stack', { value: e.message }); throw F(e); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = D(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); out[name] = d.value; }
  return F(out);
}
function owner(value) { if (value === null || typeof value !== 'object' || types.isProxy(value) || !OWNERS.has(value)) fail(); }
function context(input) {
  if (D(Object.prototype, 'then') !== undefined || D(Object.prototype, 'toJSON') !== undefined) fail();
  const c = fields(input, CONTEXT);
  if (c.phase !== 'UNSIGNED' || typeof c.runtimeContextDigest !== 'string' || HASH.exec(c.runtimeContextDigest)?.[0] !== c.runtimeContextDigest) fail();
  const binding = snapshotZenonUserSendPolicyBinding({ bindingVersion: 1, subject: c.subject,
    paymentRequired: c.paymentRequired, accepted: c.accepted, payerAddress: c.payerAddress, compiledSporkIds: c.compiledSporkIds });
  const o = fields(c.observation, ['chainProfileMatch', 'beforeFrontier', 'rpcObservation', 'afterFrontier']);
  const observation = F({ chainProfileMatch: fields(o.chainProfileMatch, ['classification']),
    beforeFrontier: o.beforeFrontier === null ? null : fields(o.beforeFrontier, FRONTIER),
    rpcObservation: o.rpcObservation === null ? null : fields(o.rpcObservation, ['availablePlasma', 'basePlasma', 'requiredDifficulty']),
    afterFrontier: o.afterFrontier === null ? null : fields(o.afterFrontier, FRONTIER) });
  // PRE_DP is an observed DATA classification, never authenticated rule state.
  // In particular, a zero-difficulty RPC reply alone does not select this lane.
  if (classifyDynamicPlasmaCompatibility(observation).classification !== 'PRE_DP') fail();
  const rpc = observation.rpcObservation;
  if (rpc.requiredDifficulty !== 0 || rpc.availablePlasma < rpc.basePlasma) fail();
  const policy = captureNonDpFusedResourcePolicy(c.policy);
  if (rpc.basePlasma > policy.maxFusedPlasma) fail();
  const request = F({ address: binding.subject.address, blockType: 2, toAddress: binding.subject.toAddress, data: binding.subject.data });
  const observedRequest = fields(c.observedQuoteRequest, ['address', 'blockType', 'toAddress', 'data']);
  for (const name of ['address', 'blockType', 'toAddress', 'data']) if (observedRequest[name] !== request[name]) fail();
  return F({ binding, observation, policy, request, runtimeContextDigest: c.runtimeContextDigest });
}
function select(instance, input, quote) {
  owner(instance);
  if (quote === null || typeof quote !== 'object' || types.isProxy(quote)) fail();
  const source = QUOTES.get(quote); if (!source || source.owner !== instance) fail();
  const now = context(input), initial = source.context, frontier = now.observation.beforeFrontier, origin = initial.observation.beforeFrontier;
  const advances = frontier.height - origin.height;
  if (now.binding.subjectDigest !== initial.binding.subjectDigest || now.binding.intentDigest !== initial.binding.intentDigest
      || now.runtimeContextDigest !== initial.runtimeContextDigest || canonicalJson(now.policy) !== canonicalJson(initial.policy)
      || canonicalJson(now.request) !== canonicalJson(initial.request) || advances < 0 || advances > initial.policy.maxMomentumAdvances
      || advances === 0 && frontier.hash !== origin.hash || now.observation.rpcObservation.basePlasma !== initial.observation.rpcObservation.basePlasma
      || now.observation.rpcObservation.availablePlasma < quote.selected.fusedPlasma) fail();
  return F({ current: now, selected: quote.selected });
}

/** Explicit non-DP fusion-only planning SPI, with no fallback from DP/UNKNOWN.
 * Observations and rule/profile matches are caller-declared DATA. This class
 * neither queries/authenticates a node nor establishes current balance/rules.
 * The native funding entry remains separate until its read/sign/close owners
 * are bound and qualified. No work search, SDK, signing or payment is entered. */
export class NonDpFusedPlasmaStrategy extends PlasmaStrategy {
  constructor() { super(); if (arguments.length !== 0) fail(); OWNERS.add(this); Object.freeze(this); }
  async quote(input) {
    try {
      if (arguments.length !== 1) fail(); owner(this); const c = context(input), frontier = c.observation.beforeFrontier;
      const ack = c.binding.subject.momentumAcknowledged;
      if (ack.height !== frontier.height || ack.hash !== frontier.hash) fail();
      const selected = F({ fusedPlasma: c.observation.rpcObservation.basePlasma, difficulty: 0 });
      const quote = F({ nonDpFusedQuoteVersion: 1, scope: 'DECLARED_PRE_DP_FUSED_USER_SEND', rpcMethod: METHOD,
        quoteRequest: c.request, subjectDigest: c.binding.subjectDigest, intentDigest: c.binding.intentDigest,
        runtimeContextDigest: c.runtimeContextDigest, policy: c.policy, frontier, selected,
        frontierContinuity: 'HEIGHT_WINDOW_ONLY_NO_ANCESTRY_PROOF', chainAuthentication: 'NOT_ESTABLISHED', afterSigningAction: 'NONE', authority: 'NONE' });
      QUOTES.set(quote, { owner: this, context: c }); return quote;
    } catch { fail(); }
  }
  async apply(input, quote) {
    try { if (arguments.length !== 2) fail(); return select(this, input, quote).selected; } catch { fail(); }
  }
  /** Assemble new unsigned subject DATA with the original fusion allocation.
   * Hash, key and signature remain uncomputed/empty. This is not PREPARE or a
   * prepared-runtime capability, and never edits an existing account block. */
  async createUnsignedUserSendDraft(input, quote) {
    try {
      if (arguments.length !== 2) fail(); const value = select(this, input, quote), subject = value.current.binding.subject;
      const block = { version: subject.version, chainIdentifier: subject.chainIdentifier, blockType: subject.blockType,
        hash: ZERO, previousHash: subject.previousHash, height: subject.height, momentumAcknowledged: subject.momentumAcknowledged,
        address: subject.address, toAddress: subject.toAddress, amount: subject.amount, tokenStandard: subject.tokenStandard,
        fromBlockHash: subject.fromBlockHash, data: subject.data, fusedPlasma: value.selected.fusedPlasma, difficulty: 0,
        nonce: NONCE, publicKey: '', signature: '' };
      const checked = snapshotZenonUnsignedUserSendFields(block);
      if (checked.subjectDigest !== quote.subjectDigest) fail();
      return F({ nonDpFusedDraftVersion: 1, scope: 'DECLARED_NON_DP_FUSED_UNSIGNED_DRAFT', accountBlock: checked.accountBlock,
        subjectDigest: checked.subjectDigest, intentDigest: quote.intentDigest, hashStatus: 'UNCOMPUTED',
        keyAddressBinding: 'NOT_PERFORMED', chainAuthentication: 'NOT_ESTABLISHED', afterSigningAction: 'NONE', authority: 'NONE' });
    } catch { fail(); }
  }
}
