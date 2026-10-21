import { BoundedDynamicPlasmaStrategy } from './bounded-dynamic-plasma-strategy.js';
import { deriveZenonUserSendWorkInput } from './dynamic-plasma-user-send-work-input.js';

const CREATE_DRAFT = BoundedDynamicPlasmaStrategy.prototype.createUnsignedUserSendDraft;
const DERIVE_INPUT = deriveZenonUserSendWorkInput;
const apply = Reflect.apply;
const freeze = Object.freeze;
const define = Object.defineProperty;
const ErrorType = TypeError;

/**
 * Produce the concrete fixed-size work DATA and ORIGINAL selected difficulty
 * before a separate producer could search for a nonce. Reuse the existing
 * original-quote draft producer: its body validates/snapshots synchronously
 * before returning its Promise. After await, read only that detached result,
 * never caller context/quote DATA again. Capture the implementation rather
 * than dispatching through an injected preparer, subclass or wallet callback.
 *
 * This is NOT a work provider, SDK/current-account-state preparation, real
 * PREPARE, approval, work/signature validation or signing capability. A zero
 * declared difficulty says only that this DATA request requires no work; it
 * does not prove sufficient current Plasma. Hash/nonce remain uncomputed zero
 * placeholders, publicKey/signature stay empty, and the original quote must
 * be retained for subsequent assembly/current-context validation. No existing
 * block, payment, consumed authority or quote is accepted for rewriting.
 */
export async function createZenonUnsignedUserSendWorkRequest(context, quote) {
  try {
    if (arguments.length !== 2) reject();
    const draft = await apply(CREATE_DRAFT, undefined, [context, quote]);
    const workInput = DERIVE_INPUT(draft.accountBlock);
    return freeze({
      unsignedWorkRequestVersion: 1, scope: 'DECLARED_USER_SEND_WORK_REQUEST',
      stage: 'BEFORE_NONCE_GENERATION', preparation: 'NOT_PERFORMED',
      accountBlock: draft.accountBlock, selection: draft.selection, workInput,
      subjectDigest: draft.subjectDigest, intentDigest: draft.intentDigest,
      fieldDigest: draft.fieldDigest,
      hashAndNonceValidation: 'NOT_PERFORMED', keyAddressBinding: 'NOT_PERFORMED',
      chainAuthentication: 'NOT_ESTABLISHED', authority: 'NONE', afterSigningAction: 'NONE',
    });
  } catch { reject(); }
}

function reject() {
  const code = 'zenon_user_send_work_request_rejected';
  const error = new ErrorType(code);
  define(error, 'code', { value: code, enumerable: true });
  define(error, 'stack', { value: 'TypeError: ' + code, enumerable: false });
  throw freeze(error);
}
