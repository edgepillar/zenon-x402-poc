import { types } from 'node:util';
import { Buffer } from 'node:buffer';
import { canonicalJson } from '../canonical.js';
import { captureZenonDynamicPlasmaFundingPostPreparationInput } from './dynamic-plasma-funding-post-preparation-input.js';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 } from './dynamic-plasma-original-funding-data.js';
import { validateZenonUnsignedUserSendKeyBinding } from './dynamic-plasma-user-send-key-binding.js';
import { createNonDpObservedOriginalReadAdapter } from './non-dp-observed-user-send-read-adapter.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, P = Object.getPrototypeOf, A = Reflect.apply;
const NP = Promise, PP = NP.prototype, THEN = PP.then, PC = D(PP, 'constructor'), PS = D(NP, Symbol.species);
function fail() { const e = new TypeError('NON_DP_CUSTODIED_ORIGINAL_CANDIDATE'); Object.defineProperty(e, 'stack', { value: e.message }); throw F(e); }
function invariant() {
  if (D(Object.prototype, 'then') !== undefined || D(Object.prototype, 'toJSON') !== undefined
      || D(PP, 'then')?.value !== THEN || D(PP, 'constructor')?.value !== PC.value || D(NP, Symbol.species)?.get !== PS.get) fail();
}
function record(value, names, frozen = false) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || P(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length || frozen && !Object.isFrozen(value)) fail();
  const result = {};
  for (const name of names) { const d = D(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); result[name] = d.value; }
  return F(result);
}
function join(pending) {
  invariant();
  if (!pending || types.isProxy(pending) || !types.isPromise(pending) || P(pending) !== PP) fail();
  const names = Object.getOwnPropertyNames(pending);
  if (names.length && (names.length !== 1 || names[0] !== 'constructor' || D(pending, 'constructor')?.value !== NP)) fail();
  const p = new NP(resolve => {
    A(THEN, pending, [value => { resolve(F(Object.assign(Object.create(null), { ok: true, value }))); },
      () => { resolve(F(Object.assign(Object.create(null), { ok: false }))); }]);
  });
  Object.defineProperty(p, 'constructor', { value: NP }); return p;
}
function integer(value, min, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < min || value > max) fail();
}

/** Explicit non-DP source binding to the existing age-bound, context-custodied
 * wallet owner protocol. The native application must supply its SAME actual
 * owner and retained read ports; JSON cannot choose an owner/module/factory.
 * Construction is inert and borrows lifetime. It neither creates nor closes a
 * wallet, key, store, transport, lease or timer. Ports must prehandle rejection.
 *
 * This component calls the borrowed signing port ONCE. It is not a payment
 * preflight, V6 custody writer, dispatcher or service authority. Actual native
 * SDK/signature/SQLite/HTTPS composition remains unqualified and unwired.
 */
export function createNonDpCustodiedOriginalCandidate(configuration) {
  invariant(); if (arguments.length !== 1) fail();
  const c = record(configuration, ['readOptions', 'walletOwner', 'expectedAddress', 'expectedPublicKey'], true);
  const readOptions = record(c.readOptions, ['transports', 'accountExchange', 'requireCurrent'], true);
  const wallet = record(c.walletOwner, ['getAddress', 'sign', 'inspect', 'close', 'bindOriginalPreparation',
    'bindOriginalPreSignContext', 'beginPreSignObservation'], true);
  for (const fn of Object.values(wallet)) if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail();
  const guard = readOptions.requireCurrent;
  if (typeof guard !== 'function' || types.isProxy(guard) || typeof c.expectedAddress !== 'string'
      || typeof c.expectedPublicKey !== 'string' || c.expectedPublicKey.length !== 44) fail();
  const key = Buffer.from(c.expectedPublicKey, 'base64');
  if (key.length !== 32 || key.toString('base64') !== c.expectedPublicKey) fail();
  const reads = createNonDpObservedOriginalReadAdapter(c.readOptions);
  let used = false, active = false, held = false, phase = 'IDLE', signingEntered = false, signingReturned = false;
  let originals = null, resource = null, stable = null, plan = null, unsigned = null, preSign = null;
  let rawSigningResult = null, packet = null, candidate = null, custodyReadEntered = false;
  function current() { invariant(); if (A(guard, undefined, []) !== undefined) fail(); invariant(); }
  function invokeVoid(fn, args) { current(); if (A(fn, c.walletOwner, args) !== undefined) fail(); current(); }
  async function wait(pending) { const settled = await join(pending); current(); if (!settled.ok) fail(); return settled.value; }
  function capture(incoming, url) {
    const input = captureZenonDynamicPlasmaFundingPostPreparationInput(incoming, url), r = input.plannerContext.readInput;
    const policy = record(r.policy, ['policyVersion', 'maxFusedPlasma', 'maxMomentumAdvances']);
    if (policy.policyVersion !== 1 || r.payerAddress !== c.expectedAddress) fail();
    integer(policy.maxFusedPlasma, 1); integer(policy.maxMomentumAdvances, 0, 128);
    return F({ input, read: F({ nonDpReadInputVersion: 1, phase: 'UNSIGNED', paymentRequired: r.paymentRequired,
      accepted: r.accepted, payerAddress: r.payerAddress, compiledSporkIds: r.compiledSporkIds,
      policy, runtimeContextDigest: r.runtimeContextDigest, publicKey: c.expectedPublicKey }) });
  }
  async function prepare(incoming, url, count) {
    if (used || active || held || count !== 2) fail();
    // Capture full original challenge/header/body/context and selected intent
    // before any ownership/key callback. Invalid admission consumes no attempt.
    const captured = capture(incoming, url);
    used = true; active = true; phase = 'BINDING_ORIGINAL'; originals = captured.input; resource = url; stable = captured.read;
    try {
      current(); invokeVoid(wallet.bindOriginalPreparation, [originals, resource]);
      phase = 'READING_ORIGINAL'; plan = await wait(reads.quote(stable));
      const assembled = await wait(reads.assemble(stable, plan)); unsigned = assembled.accountBlock;
      // Shared pure key/address/hash/zero-work consistency, not possession or
      // signing permission. No work generation/search is called in this lane.
      validateZenonUnsignedUserSendKeyBinding(unsigned); current();
      invokeVoid(wallet.beginPreSignObservation, []);
      phase = 'FINAL_UNSIGNED_READ'; await wait(reads.validateUnsigned(stable, plan, unsigned));
      // Reuse the existing generic signer custody DATA schema. This is not a
      // DP checkpoint reader or a fabricated DP quote. The actual branded
      // non-DP plan stays private; its quote still says nonDpFusedQuoteVersion.
      const commonPlan = F({ observedUserSendPlanVersion: 1, subject: plan.subject, quote: plan.quote });
      preSign = canonicalJson({ accountBlock: unsigned, checkpointVersion: 1, phase: 'UNSIGNED', quote: plan.quote });
      invokeVoid(wallet.bindOriginalPreSignContext, [F({ originalUnsignedBlock: unsigned,
        originalPlan: commonPlan, preSignCheckpointJson: preSign })]);
      current(); phase = 'SIGNING_ORIGINAL'; signingEntered = true;
      // Preserve any returned result immediately. A later guard/read failure
      // cannot erase it, repeat the port call or authorize another candidate.
      const signed = await join(A(wallet.sign, c.walletOwner, [unsigned]));
      if (signed.ok) { rawSigningResult = signed.value; signingReturned = true; }
      current(); if (!signed.ok) fail();
      packet = assembleZenonDynamicPlasmaOriginalFundingDataV2(originals,
        { originalUnsignedBlock: unsigned, accountBlock: rawSigningResult }, resource); current();
      phase = 'POST_SIGN_ORIGINAL_READ'; await wait(reads.readOriginalAfterSigning(stable, plan, unsigned));
      candidate = F({ nonDpCustodiedOriginalCandidateVersion: 1, originalUnsignedBlock: unsigned,
        accountBlock: packet.paymentPayload.payload.transaction, originalPlan: plan, preSignCheckpointJson: preSign,
        packet, signatureValidation: 'NOT_PERFORMED', persistence: 'BORROWED_SIGNER_OWNER_CONTRACT_NOT_QUALIFIED',
        chainAuthentication: 'NOT_ESTABLISHED', authority: 'NONE' });
      current(); phase = 'AWAITING_INDEPENDENT_PINS'; return candidate;
    } catch { held = true; phase = 'HELD'; fail(); } finally { active = false; }
  }
  async function revalidate(count) {
    if (count !== 0 || active || held || candidate === null || phase !== 'AWAITING_INDEPENDENT_PINS' || custodyReadEntered) fail();
    custodyReadEntered = true; active = true; phase = 'PRE_CUSTODY_ORIGINAL_READ';
    try {
      current(); await wait(reads.readOriginalBeforeCustody(stable, plan, unsigned)); current();
      // Return the SAME encoded original packet; do not assemble or sign again.
      phase = 'ORIGINAL_READ_RETURNED'; return candidate;
    } catch { held = true; phase = 'HELD'; fail(); } finally { active = false; }
  }
  return F({ prepareOriginalFunding: (...args) => prepare(args[0], args[1], args.length),
    revalidateSignedOriginal: (...args) => revalidate(args.length),
    inspect: () => F({ phase, used, active, held, signingEntered, signingReturned,
      signingResultHeld: rawSigningResult !== null, custodyReadEntered, originalCandidateRetained: candidate !== null,
      originalRead: reads.inspect(), actualCustodyCommit: 'NOT_PERFORMED', nativeEntryBinding: 'NOT_IMPLEMENTED',
      parentOwnedStopAndRelease: 'NOT_ESTABLISHED', authority: 'NONE' }) });
}
