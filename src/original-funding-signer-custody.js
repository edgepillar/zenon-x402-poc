import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { validateZenonUnsignedUserSendHash } from './zenon/transaction-planner.js';

const F = Object.freeze;
const NAMES = ['signerCustodyVersion', 'paymentId', 'originalDigest', 'phase', 'unsignedBlockJson', 'signedBlockJson'];
const ROW = ['paymentId', 'originalDigest', 'network', 'asset', 'recipient', 'amount', 'reservedDay', 'status', 'spentDay'];
function fail() { throw new TypeError('ORIGINAL_FUNDING_SIGNER_CUSTODY'); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
function bounded(text, maximum) {
  if (typeof text !== 'string' || text.length < 1 || Buffer.byteLength(text) > maximum || Buffer.from(text).toString('utf8') !== text) fail(); return text;
}
function original(input) { return validateZenonUnsignedUserSendHash(input).accountBlock; }
function parseBlock(text) {
  bounded(text, 4096); let block; try { block = JSON.parse(text); } catch { fail(); }
  const captured = original(block); if (canonicalJson(captured) !== text || captured.publicKey === '') fail(); return captured;
}
function reservationBinding(reservation, record) {
  const r = fields(reservation, ROW);
  if (!['RESERVED', 'UNKNOWN', 'SPENT'].includes(r.status) || r.paymentId !== record.paymentId || r.originalDigest !== record.originalDigest) fail();
  const block = parseBlock(record.unsignedBlockJson);
  if (block.tokenStandard !== r.asset || block.toAddress !== r.recipient || block.amount !== r.amount) fail(); return { reservation: r, block };
}
function signedText(block, input) {
  const c = fields(input, Reflect.ownKeys(block));
  const signature = bounded(c.signature, 88), bytes = Buffer.from(signature, 'base64');
  if (bytes.length !== 64 || bytes.toString('base64') !== signature) fail();
  const detached = original({ ...c, signature: '' });
  if (canonicalJson(detached) !== canonicalJson(block)) fail(); return canonicalJson({ ...detached, signature });
}
/** Public signed data, never a key or dispatch capability. The real reservation
 * and selected owner epoch are checked by the store in each local transaction.
 * These codecs verify exact fields/hash/encoding, not signature authenticity,
 * work, chain state, durable storage or permission to sign/replay a payment. */
export function createOriginalFundingSignerIntent(reservation, unsignedBlock) {
  if (arguments.length !== 2) fail(); const selected = fields(reservation, ROW), block = original(unsignedBlock);
  const record = F({ signerCustodyVersion: 1, paymentId: selected.paymentId, originalDigest: selected.originalDigest,
    phase: 'INTENT', unsignedBlockJson: canonicalJson(block), signedBlockJson: null });
  if (selected.status !== 'RESERVED' || block.publicKey === '') fail();
  const text = canonicalJson(record); inspectOriginalFundingSignerRecord(text, selected); return text;
}
export function decodeOriginalFundingSignerRecord(raw) {
  if (arguments.length !== 1) fail(); bounded(raw, 16384); let decoded; try { decoded = JSON.parse(raw); } catch { fail(); }
  const r = fields(decoded, NAMES);
  if (r.signerCustodyVersion !== 1 || canonicalJson(r) !== raw || !['INTENT', 'SIGNED'].includes(r.phase)
      || typeof r.paymentId !== 'string' || /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.exec(r.paymentId)?.[0] !== r.paymentId
      || typeof r.originalDigest !== 'string' || /^sha256:[0-9a-f]{64}$/.exec(r.originalDigest)?.[0] !== r.originalDigest) fail();
  const block = parseBlock(r.unsignedBlockJson);
  if (r.phase === 'INTENT') { if (r.signedBlockJson !== null) fail(); }
  else {
    bounded(r.signedBlockJson, 8192); let signed; try { signed = JSON.parse(r.signedBlockJson); } catch { fail(); }
    if (signedText(block, signed) !== r.signedBlockJson) fail();
  }
  return F({ ...r, transactionHash: block.hash, publicKey: block.publicKey, accountAddress: block.address, authority: 'NONE', signatureValidation: 'NOT_PERFORMED' });
}
export function inspectOriginalFundingSignerRecord(raw, reservation) {
  if (arguments.length !== 2) fail(); const r = decodeOriginalFundingSignerRecord(raw);
  const { reservation: selected } = reservationBinding(reservation, r);
  if (r.phase === 'INTENT' && selected.status === 'SPENT') fail(); return r;
}
export function completeOriginalFundingSignerRecord(raw, signedBlock, reservation) {
  if (arguments.length !== 3) fail(); const r = inspectOriginalFundingSignerRecord(raw, reservation);
  if (r.phase !== 'INTENT' || reservation.status === 'SPENT') fail();
  return canonicalJson({ signerCustodyVersion: 1, paymentId: r.paymentId, originalDigest: r.originalDigest,
    phase: 'SIGNED', unsignedBlockJson: r.unsignedBlockJson, signedBlockJson: signedText(parseBlock(r.unsignedBlockJson), signedBlock) });
}
/** No deletion, replacement, idempotent signing or history-to-authority path. */
export function requireOriginalFundingSignerRecordTransition(expected, proposed, reservation) {
  if (arguments.length !== 3) fail(); const next = inspectOriginalFundingSignerRecord(proposed, reservation);
  if (expected === null) {
    if (next.phase !== 'INTENT' || reservation.status !== 'RESERVED') fail(); return next;
  }
  const prior = inspectOriginalFundingSignerRecord(expected, reservation);
  if (prior.phase !== 'INTENT' || next.phase !== 'SIGNED' || prior.paymentId !== next.paymentId
      || prior.originalDigest !== next.originalDigest || prior.unsignedBlockJson !== next.unsignedBlockJson) fail(); return next;
}
