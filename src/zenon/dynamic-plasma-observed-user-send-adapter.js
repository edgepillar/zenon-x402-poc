import { types as utilTypes } from 'node:util';
import {
  createZenonUserSendObservationInput,
  snapshotZenonUserSendPolicyBinding,
} from './transaction-planner.js';
import { createZenonObservedUserSendSubject } from './dynamic-plasma-observed-user-send-subject.js';
import { decodeZenonAccountFrontierReadResult } from './dynamic-plasma-account-frontier-read.js';
import { BoundedDynamicPlasmaStrategy } from './bounded-dynamic-plasma-strategy.js';
import { createZenonUnsignedUserSendWorkRequest } from './dynamic-plasma-user-send-work-request.js';
import { assembleZenonUnsignedUserSend } from './dynamic-plasma-user-send-assembly.js';
import { bindZenonUnsignedUserSendKeyBinding } from './dynamic-plasma-user-send-key-binding.js';

const REQUEST = createZenonUserSendObservationInput;
const SUBJECT = createZenonObservedUserSendSubject;
const BINDING = snapshotZenonUserSendPolicyBinding;
const FRONTIER = decodeZenonAccountFrontierReadResult;
const QUOTE = BoundedDynamicPlasmaStrategy.prototype.quoteUserSend;
const WORK_REQUEST = createZenonUnsignedUserSendWorkRequest;
const ASSEMBLE = assembleZenonUnsignedUserSend;
const VALIDATE_UNSIGNED = bindZenonUnsignedUserSendKeyBinding;
const apply = Reflect.apply;
const ownKeys = Reflect.ownKeys;
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
  'observedUserSendViewVersion', 'phase', 'paymentRequired', 'accepted',
  'payerAddress', 'compiledSporkIds', 'accountFrontierResultJson',
  'observation', 'policy', 'runtimeContextDigest',
]);
const PLAN_FIELDS = freeze(['observedUserSendPlanVersion', 'subject', 'quote']);

/**
 * Default-off DATA composition from the initial request through unchanged
 * unsigned work-input, assembly and complete key/work/hash/price consumers.
 * Initial quote derives the subject/acknowledgement from raw observations and
 * account result DATA, then returns them WITH the existing quote. Later calls
 * require that ORIGINAL plan: retain its subject, quote and acknowledgement,
 * independently decode each supplied account result and reject a changed
 * sequence/hash. Fresh price observations may advance within the ORIGINAL
 * policy horizon without refreshing the subject's acknowledgement or quote.
 *
 * A plan is portable, reproducible declared DATA, NOT a one-use capability,
 * durable custody, lifecycle state or signing authority. Nothing here can
 * tell whether a caller has signed elsewhere. Requoting creates another DATA
 * plan, never permission to replace/re-sign an existing payment or refresh its
 * originals. After signing, preserve those exact bytes/hash/context separately.
 *
 * No RPC/transport/native owner, SDK/current-state preparation, real PREPARE,
 * nonce search, key production, signing, publication, retry or recovery is
 * performed. Account results are projections, not full block authentication;
 * coherent supplied reads, runtime digests and phase are not live chain,
 * funds, runtime p, payer/provider/policy authority or READY evidence. Active
 * buyer, planner stub and locked SDK105 path remain unchanged.
 *
 * Each captured component validates/snapshots synchronously before its first
 * await. After await only detached results are read. No input object is frozen
 * or mutated. Native async/intrinsic behavior remains a premise, not a sandbox.
 */
export class ObservedDynamicPlasmaUserSendAdapter {
  constructor() {
    if (arguments.length !== 0) reject();
    freeze(this);
  }

  // Only intent/profile/spork DATA is traversed at this pre-observation stage.
  // Other exact view fields may be null until account/price reads are supplied.
  createObservationInput(view) {
    try {
      if (arguments.length !== 1) reject();
      const top = snapshotView(view);
      return REQUEST({
        observationIntentVersion: 1, phase: top.phase,
        paymentRequired: top.paymentRequired, accepted: top.accepted,
        payerAddress: top.payerAddress, compiledSporkIds: top.compiledSporkIds,
      });
    } catch { reject(); }
  }

  async quote(view) {
    try {
      if (arguments.length !== 1) reject();
      const top = snapshotView(view);
      const subject = SUBJECT({
        observedSubjectVersion: 1, phase: top.phase,
        paymentRequired: top.paymentRequired, accepted: top.accepted,
        payerAddress: top.payerAddress, compiledSporkIds: top.compiledSporkIds,
        accountFrontierResultJson: top.accountFrontierResultJson, observation: top.observation,
      });
      const quote = await apply(QUOTE, undefined, [context(top, subject)]);
      return freeze({ observedUserSendPlanVersion: 1, subject, quote });
    } catch { reject(); }
  }

  async createWorkRequest(view, originalPlan) {
    try {
      if (arguments.length !== 2) reject();
      const current = laterContext(view, originalPlan);
      return await WORK_REQUEST(current.context, current.quote);
    } catch { reject(); }
  }

  async assemble(view, originalPlan, suppliedMaterial) {
    try {
      if (arguments.length !== 3) reject();
      const current = laterContext(view, originalPlan);
      return await ASSEMBLE(current.context, current.quote, suppliedMaterial);
    } catch { reject(); }
  }

  // Consume this SAME existing unsigned block; never repair/reassemble it.
  async validateUnsigned(view, originalPlan, accountBlock) {
    try {
      if (arguments.length !== 3) reject();
      const current = laterContext(view, originalPlan);
      return await VALIDATE_UNSIGNED(current.context, current.quote, accountBlock);
    } catch { reject(); }
  }
}

function snapshotView(value) {
  const top = record(value, VIEW_FIELDS);
  if (top.observedUserSendViewVersion !== 1 || top.phase !== 'UNSIGNED') reject();
  return top;
}

function laterContext(view, originalPlan) {
  const top = snapshotView(view), plan = record(originalPlan, PLAN_FIELDS);
  if (plan.observedUserSendPlanVersion !== 1) reject();
  // Rebind the ORIGINAL subject to independently supplied selected intent.
  // Never read an acknowledgement from the current price observation here.
  const binding = BINDING({
    bindingVersion: 1, subject: plan.subject,
    paymentRequired: top.paymentRequired, accepted: top.accepted,
    payerAddress: top.payerAddress, compiledSporkIds: top.compiledSporkIds,
  });
  const subject = binding.subject;
  const frontier = FRONTIER({
    frontierReadVersion: 1, phase: top.phase,
    expectedChainIdentifier: binding.expectedQuoteRequestContext.expectedChainProfile.chainIdentifier,
    payerAddress: top.payerAddress, resultJson: top.accountFrontierResultJson,
  });
  if (frontier.address !== subject.address || frontier.chainIdentifier !== subject.chainIdentifier
      || frontier.height + 1 !== subject.height || frontier.hash !== subject.previousHash) reject();
  return { context: context(top, subject), quote: plan.quote };
}

function context(top, subject) {
  return {
    phase: top.phase, subject, paymentRequired: top.paymentRequired, accepted: top.accepted,
    payerAddress: top.payerAddress, compiledSporkIds: top.compiledSporkIds,
    observation: top.observation, policy: top.policy, runtimeContextDigest: top.runtimeContextDigest,
  };
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
  const code = 'zenon_observed_dp_adapter_input_rejected';
  const error = new ErrorType(code);
  define(error, 'code', { value: code, enumerable: true });
  define(error, 'stack', { value: 'TypeError: ' + code, enumerable: false });
  throw freeze(error);
}
