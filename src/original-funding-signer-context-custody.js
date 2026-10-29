import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { captureZenonDynamicPlasmaFundingPostPreparationInput } from './zenon/dynamic-plasma-funding-post-preparation-input.js';
import { validateZenonUnsignedUserSendHash, snapshotZenonUserSendPolicyBinding } from './zenon/transaction-planner.js';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 } from './zenon/dynamic-plasma-original-funding-data.js';
import { createOriginalFundingSignerIntent, decodeOriginalFundingSignerRecord, completeOriginalFundingSignerRecord,
  inspectOriginalFundingSignerRecord } from './original-funding-signer-custody.js';

const F = Object.freeze, BASE = ['signerCustodyVersion', 'paymentId', 'originalDigest', 'phase', 'unsignedBlockJson', 'signedBlockJson'];
const CONTEXT = ['fundingResourceUrl', 'preparationInputJson', 'preSignContextJson'];
function fail() { throw new TypeError('ORIGINAL_FUNDING_SIGNER_CONTEXT'); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
function text(value, maximum) {
  if (typeof value !== 'string' || value.length < 1 || Buffer.byteLength(value) > maximum || Buffer.from(value).toString('utf8') !== value) fail(); return value;
}
function jsonCopy(value, depth = 0, budget = { nodes: 4096, characters: 65536 }) {
  if (--budget.nodes < 0 || depth > 16) fail();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail(); return value; }
  if (typeof value === 'string') { budget.characters -= value.length; if (budget.characters < 0 || value.length > 32768) fail(); return value; }
  if (typeof value !== 'object' || types.isProxy(value)) fail(); const proto = Object.getPrototypeOf(value), keys = Reflect.ownKeys(value);
  if (proto !== Object.prototype && proto !== null || keys.length > 64) fail();
  const out = {};
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(value, key); if (typeof key !== 'string' || !d?.enumerable || !Object.hasOwn(d, 'value')) fail();
    Object.defineProperty(out, key, { value: jsonCopy(d.value, depth + 1, budget), enumerable: true }); }
  return F(out);
}
export function captureOriginalFundingSignerPreparation(input, fundingResourceUrl) {
  if (arguments.length !== 2) fail();
  const captured = captureZenonDynamicPlasmaFundingPostPreparationInput(input, fundingResourceUrl), preparationInputJson = JSON.stringify(captured);
  text(preparationInputJson, 65536);
  return F({ fundingResourceUrl, preparationInputJson, originalDigest: 'sha256:' + createHash('sha256').update(preparationInputJson).digest('hex') });
}
function preparation(value) {
  const c = fields(value, ['fundingResourceUrl', 'preparationInputJson', 'originalDigest']); text(c.preparationInputJson, 65536);
  let raw; try { raw = JSON.parse(c.preparationInputJson); } catch { fail(); }
  const captured = captureOriginalFundingSignerPreparation(raw, c.fundingResourceUrl);
  if (captured.preparationInputJson !== c.preparationInputJson || captured.originalDigest !== c.originalDigest) fail();
  return { captured, input: captureZenonDynamicPlasmaFundingPostPreparationInput(raw, c.fundingResourceUrl) };
}
/** Exact DATA from the actual pre-sign handoff. This is not a checkpoint
 * reader or a current quote/price/chain/signing-authority validation. Never
 * invoke a pre-sign reader with a signed block or renew a quote from history. */
export function captureOriginalFundingSignerPreSignContext(prepared, input) {
  if (arguments.length !== 2) fail(); const p = preparation(prepared), c = fields(input, ['originalUnsignedBlock', 'originalPlan', 'preSignCheckpointJson']);
  const block = validateZenonUnsignedUserSendHash(c.originalUnsignedBlock), plan = fields(jsonCopy(c.originalPlan), ['observedUserSendPlanVersion', 'subject', 'quote']);
  if (plan.observedUserSendPlanVersion !== 1) fail();
  const read = p.input.plannerContext.readInput;
  const binding = snapshotZenonUserSendPolicyBinding({ bindingVersion: 1, subject: plan.subject, paymentRequired: read.paymentRequired,
    accepted: read.accepted, payerAddress: read.payerAddress, compiledSporkIds: read.compiledSporkIds });
  if (binding.subjectDigest !== block.subjectDigest) fail(); text(c.preSignCheckpointJson, 32768);
  let cp; try { cp = fields(jsonCopy(JSON.parse(c.preSignCheckpointJson)), ['accountBlock', 'checkpointVersion', 'phase', 'quote']); } catch { fail(); }
  if (cp.checkpointVersion !== 1 || cp.phase !== 'UNSIGNED' || canonicalJson(cp) !== c.preSignCheckpointJson
      || canonicalJson(cp.accountBlock) !== canonicalJson(block.accountBlock) || canonicalJson(cp.quote) !== canonicalJson(plan.quote)) fail();
  const contextJson = canonicalJson({ originalUnsignedBlock: block.accountBlock, originalPlan: plan, preSignCheckpointJson: c.preSignCheckpointJson });
  text(contextJson, 65536); return F({ fundingResourceUrl: p.captured.fundingResourceUrl, preparationInputJson: p.captured.preparationInputJson, preSignContextJson: contextJson });
}
function capsule(value, originalDigest, unsignedBlockJson) {
  const c = fields(value, CONTEXT); text(c.preSignContextJson, 65536);
  let raw; try { raw = JSON.parse(c.preSignContextJson); } catch { fail(); }
  const validated = captureOriginalFundingSignerPreSignContext({ fundingResourceUrl: c.fundingResourceUrl, preparationInputJson: c.preparationInputJson, originalDigest }, raw);
  if (validated.preSignContextJson !== c.preSignContextJson || canonicalJson(raw.originalUnsignedBlock) !== unsignedBlockJson) fail(); return validated;
}
function legacyBase(r) { return canonicalJson(Object.fromEntries(BASE.map(k => [k, k === 'signerCustodyVersion' ? 1 : r[k]]))); }
export function createOriginalFundingSignerContextIntent(reservation, unsignedBlock, context) {
  if (arguments.length !== 3) fail(); const base = JSON.parse(createOriginalFundingSignerIntent(reservation, unsignedBlock));
  const captured = capsule(context, base.originalDigest, base.unsignedBlockJson);
  const raw = canonicalJson({ ...base, signerCustodyVersion: 2, ...captured }); text(raw, 196608); return raw;
}
export function decodeOriginalFundingSignerContextRecord(raw) {
  if (arguments.length !== 1) fail(); text(raw, 196608); let r; try { r = fields(JSON.parse(raw), [...BASE, ...CONTEXT]); } catch { fail(); }
  if (r.signerCustodyVersion !== 2 || canonicalJson(r) !== raw) fail(); const base = decodeOriginalFundingSignerRecord(legacyBase(r));
  const context = capsule(Object.fromEntries(CONTEXT.map(k => [k, r[k]])), r.originalDigest, r.unsignedBlockJson);
  return F({ ...base, signerCustodyVersion: 2, ...context, quoteAuthority: 'NOT_ESTABLISHED' });
}
export function inspectOriginalFundingSignerContextRecord(raw, reservation) {
  if (arguments.length !== 2) fail(); const captured = decodeOriginalFundingSignerContextRecord(raw); inspectOriginalFundingSignerRecord(legacyBase(captured), reservation); return captured;
}
export function createOriginalFundingSignerContextResult(raw, signedBlock) {
  if (arguments.length !== 2) fail(); const r = decodeOriginalFundingSignerContextRecord(raw); if (r.phase !== 'INTENT') fail();
  const signed = fields(jsonCopy(signedBlock), Reflect.ownKeys(JSON.parse(r.unsignedBlockJson)));
  const next = canonicalJson({ ...Object.fromEntries([...BASE, ...CONTEXT].map(k => [k, r[k]])), phase: 'SIGNED', signedBlockJson: canonicalJson(signed) });
  decodeOriginalFundingSignerContextRecord(next); return next;
}
export function completeOriginalFundingSignerContextRecord(raw, signedBlock, reservation) {
  if (arguments.length !== 3) fail(); const r = inspectOriginalFundingSignerContextRecord(raw, reservation);
  completeOriginalFundingSignerRecord(legacyBase(r), signedBlock, reservation); return createOriginalFundingSignerContextResult(raw, signedBlock);
}
/** A deterministic original DATA projection only. It opens/writes no store,
 * signs/re-quotes nothing and grants no commit, resend or service authority. */
export function projectOriginalFundingSignerContextRecord(raw, expected) {
  if (arguments.length !== 2) fail(); const pins = fields(expected, ['paymentId', 'originalDigest']), r = decodeOriginalFundingSignerContextRecord(raw);
  if (r.paymentId !== pins.paymentId || r.originalDigest !== pins.originalDigest || r.phase !== 'SIGNED') fail();
  const input = captureZenonDynamicPlasmaFundingPostPreparationInput(JSON.parse(r.preparationInputJson), r.fundingResourceUrl);
  const packet = assembleZenonDynamicPlasmaOriginalFundingDataV2(input, { originalUnsignedBlock: JSON.parse(r.unsignedBlockJson), accountBlock: JSON.parse(r.signedBlockJson) }, r.fundingResourceUrl);
  if (packet.transactionHash !== r.transactionHash) fail();
  return F({ signerContextProjectionVersion: 1, packet, authority: 'NONE', maySignPayment: false, mayDispatchFunding: false,
    mayDispatchService: false, currentAuthority: 'NOT_ESTABLISHED', signatureValidation: 'NOT_PERFORMED', preSignContextJson: r.preSignContextJson });
}
