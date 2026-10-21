import { types as utilTypes } from 'node:util';
import { BoundedDynamicPlasmaStrategy } from './bounded-dynamic-plasma-strategy.js';
import { createZenonUserSendSubject } from './transaction-planner.js';
import { createZenonUnsignedUserSendWorkRequest } from './dynamic-plasma-user-send-work-request.js';
import { assembleZenonUnsignedUserSend } from './dynamic-plasma-user-send-assembly.js';
import { bindZenonUnsignedUserSendKeyBinding } from './dynamic-plasma-user-send-key-binding.js';
import { snapshotDynamicPlasmaObservationCollectionInput } from './dynamic-plasma-observation-collector.js';

const SUBJECT = createZenonUserSendSubject;
const QUOTE = BoundedDynamicPlasmaStrategy.prototype.quoteUserSend;
const WORK_REQUEST = createZenonUnsignedUserSendWorkRequest;
const ASSEMBLE = assembleZenonUnsignedUserSend;
const VALIDATE_UNSIGNED = bindZenonUnsignedUserSendKeyBinding;
const SNAPSHOT_COLLECTION = snapshotDynamicPlasmaObservationCollectionInput;
const apply = Reflect.apply;
const keys = Reflect.ownKeys;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const hasOwn = Object.hasOwn;
const create = Object.create;
const define = Object.defineProperty;
const freeze = Object.freeze;
const isProxy = utilTypes.isProxy;
const objectPrototype = Object.prototype;
const ErrorType = TypeError;
const VIEW_FIELDS = freeze([
  'rawUserSendViewVersion', 'phase', 'paymentRequired', 'accepted', 'payerAddress',
  'compiledSporkIds', 'accountFrontier', 'momentumAcknowledged',
  'observation', 'policy', 'runtimeContextDigest',
]);

/**
 * One versioned, stateless, separately imported raw DATA adapter over the
 * existing subject, original-quote policy, work-input and unsigned assembly
 * implementations. The caller supplies a new explicit declared view at each
 * stage, but retains the ORIGINAL quote and acknowledgement. Subject fields
 * cannot be supplied or overridden: derive them from the view's declared
 * account frontier and selected intent every time. A changed account sequence,
 * intent or original acknowledgement therefore cannot reuse that old quote.
 *
 * Reuse existing result contracts unchanged; no new persisted/wire format or
 * authority receipt is created. Only rawUserSendViewVersion:1 is admitted.
 * Constructor accepts no wallet, preparer, callback or operational dependency.
 * Implementations are captured at module load, not virtually dispatched.
 *
 * Context construction and each captured component's input validation/snapshot
 * happen synchronously before its first await. After await only the detached
 * component result is returned. This relies on the reviewed existing snapshot
 * contracts; no caller input object is frozen or mutated by this adapter.
 *
 * This is NOT ZenonTransactionPlanner.prepareUnsigned(), SDK/current-account-
 * state preparation, a real PREPARE, authenticated/current chain or funding
 * evidence, a work producer, key possession, approval or signing capability.
 * Phase/frontier/observations are declared DATA, not authority. No existing
 * payment or consumed authority can be supplied for retry/replacement. The
 * active buyer and locked legacy path are unchanged; no real signer or runtime
 * activation is enabled. Work/signing/inclusion/recovery remain separate.
 */
export class DeclaredDynamicPlasmaUserSendAdapter {
  constructor() {
    if (arguments.length !== 0) reject();
    freeze(this);
  }

  /**
   * Produce the existing schema3 collector input/digest pair from this view's
   * independently derived selected intent. Pure, synchronous DATA only: no
   * collector, transport, owner, Promise or callback is constructed/invoked.
   * Observation, policy and runtimeContextDigest are not traversed/forwarded
   * and may be null before observation; later pricing stages still validate
   * them fully. Never accept a caller-selected quoteRequest or subject.
   *
   * The existing request digest binds RPC request/profile/sporks, NOT the
   * entire subject/account frontier/acknowledgement, current state or signing
   * authority. Those independent bindings remain mandatory at later stages.
   */
  createObservationInput(view) {
    try {
      if (arguments.length !== 1) reject();
      const ctx = context(view);
      return SNAPSHOT_COLLECTION({
        phase: ctx.phase, requiredFusedObservationVersion: 1, quoteRequestContextVersion: 1,
        expectedChainProfile: ctx.accepted.extra.zenonChain, compiledSporkIds: ctx.compiledSporkIds,
        quoteRequest: {
          address: ctx.subject.address, blockType: ctx.subject.blockType,
          toAddress: ctx.subject.toAddress, data: ctx.subject.data,
        },
      });
    } catch { reject(); }
  }

  async quote(view) {
    try {
      if (arguments.length !== 1) reject();
      return await apply(QUOTE, undefined, [context(view)]);
    } catch { reject(); }
  }

  async createWorkRequest(view, originalQuote) {
    try {
      if (arguments.length !== 2) reject();
      return await WORK_REQUEST(context(view), originalQuote);
    } catch { reject(); }
  }

  async assemble(view, originalQuote, suppliedMaterial) {
    try {
      if (arguments.length !== 3) reject();
      return await ASSEMBLE(context(view), originalQuote, suppliedMaterial);
    } catch { reject(); }
  }

  /**
   * Revalidate an EXISTING unsigned block against a fresh declared view and
   * the ORIGINAL quote, rather than treating earlier assembly success as a
   * later price/frontier check. Derive the independent subject again, then
   * consume this SAME block's fields, hash, supplied nonce and public bytes
   * through the captured complete key/work/hash/price binder. Never assemble
   * or repair a replacement, refresh a quote, or virtually dispatch assembly.
   *
   * The captured binder snapshots/validates synchronously before its first
   * await and returns its unchanged detached DATA contract. Empty signature
   * is mandatory; an assembly receipt is not a block and is not trusted.
   * Fresh means newly supplied DATA, NOT authenticated/current account state
   * or new signing authority. After await the caller still needs independent
   * current-state, funding, authority, signer and uncertainty/recovery gates.
   */
  async validateUnsigned(view, originalQuote, accountBlock) {
    try {
      if (arguments.length !== 3) reject();
      return await VALIDATE_UNSIGNED(context(view), originalQuote, accountBlock);
    } catch { reject(); }
  }
}

function context(value) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype || keys(value).length !== VIEW_FIELDS.length) reject();
  const top = create(null);
  for (const field of VIEW_FIELDS) {
    const d = descriptor(value, field);
    if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) reject();
    top[field] = d.value;
  }
  if (top.rawUserSendViewVersion !== 1 || top.phase !== 'UNSIGNED') reject();
  const subject = SUBJECT({
    subjectInputVersion: 1, phase: top.phase, paymentRequired: top.paymentRequired,
    accepted: top.accepted, payerAddress: top.payerAddress, compiledSporkIds: top.compiledSporkIds,
    accountFrontier: top.accountFrontier, momentumAcknowledged: top.momentumAcknowledged,
  });
  return freeze({
    phase: top.phase, subject, paymentRequired: top.paymentRequired, accepted: top.accepted,
    payerAddress: top.payerAddress, compiledSporkIds: top.compiledSporkIds,
    observation: top.observation, policy: top.policy, runtimeContextDigest: top.runtimeContextDigest,
  });
}

function reject() {
  const code = 'zenon_declared_dp_adapter_input_rejected';
  const error = new ErrorType(code);
  define(error, 'code', { value: code, enumerable: true });
  define(error, 'stack', { value: 'TypeError: ' + code, enumerable: false });
  throw freeze(error);
}
