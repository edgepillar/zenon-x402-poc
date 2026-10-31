import { types } from 'node:util';
import { captureIssuedExpiredFundingResult } from './issued-expired-funding-receipt.js';
import {
  createOfficialFundingPostExpiredRecord,
  inspectOfficialFundingPostCustodyRecord,
  inspectOfficialFundingPostExpiredReceipt,
} from './official-funding-post-custody-record.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, A = Reflect.apply;
const NP = Promise, PP = NP.prototype, THEN = PP.then;
function fail() { throw new TypeError('ISSUED_EXPIRED_FUNDING_RETENTION'); }
function fields(value, keys) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== keys.length) fail();
  const out = {};
  for (const key of keys) {
    const d = D(value, key); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail();
    Object.defineProperty(out, key, { value: d.value, enumerable: true });
  }
  return F(out);
}
function discard(value) {
  try {
    if (!types.isPromise(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== PP
        || D(value, 'then') !== undefined || PP.then !== THEN) return;
    const d = D(value, 'constructor'); if (d && (!Object.hasOwn(d, 'value') || d.value !== NP)) return;
    const q = A(THEN, value, [() => {}, () => {}]); A(THEN, q, [() => {}, () => {}]);
  } catch {}
}

/** The fixed native preparer supplies the same intake row/CAS port. Claim
 * precedes verification; the activation OWNER must fence retain() after the
 * verifier returns and before any output. This owner performs no verification,
 * grant activation, SDK operation, payout or backend close of its own. */
export function createIssuedExpiredFundingRetention(options) {
  if (arguments.length !== 1) fail();
  const c = fields(options, ['officialRecordJson', 'context', 'port']);
  const context = fields(c.context, ['transactionHash', 'fundingCommitment', 'expiresAt']);
  const p = fields(c.port, ['read', 'compareAndSwap']);
  for (const fn of Object.values(p)) if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail();
  if (p.read === p.compareAndSwap) fail();
  const original = c.officialRecordJson;
  if (inspectOfficialFundingPostCustodyRecord(original).phase !== 'SETTLED'
      || inspectOfficialFundingPostExpiredReceipt(original, context) !== null) fail();
  let claimed = false, completed = false, held = false, busy = false, assertCurrent = null;
  let reads = 0, writes = 0, receipt = null, proposed = null, acknowledged = false, readBack = false;
  const opaque = [];
  function hold(value) { held = true; if (value !== undefined) { opaque.push(value); discard(value); } fail(); }
  function live() { if (held || busy || completed) fail(); }
  function current() {
    let result; try { result = A(assertCurrent, undefined, []); } catch { hold(); }
    if (result !== undefined) hold(result); if (held) fail();
  }
  function read() {
    let value; reads++;
    try { value = A(p.read, undefined, []); } catch { hold(); }
    if (typeof value !== 'string') hold(value);
    if (held) fail(); return value;
  }
  const claim = F(function claim(guard) {
    if (arguments.length !== 1 || typeof guard !== 'function' || types.isProxy(guard)
        || !Object.isFrozen(guard) || Object.values(p).includes(guard)) fail();
    live(); if (claimed) fail(); claimed = true; assertCurrent = guard; busy = true;
    try { current(); if (read() !== original) hold(); current(); return undefined; }
    catch { held = true; fail(); } finally { busy = false; }
  });
  const retain = F(function retain(value) {
    if (arguments.length !== 1) fail(); live(); if (!claimed) fail(); busy = true;
    try {
      // Capture the closed verified candidate before encoding can refuse a
      // bounded record. Refusal retains the candidate but never permits retry.
      receipt = captureIssuedExpiredFundingResult(value, context);
      proposed = createOfficialFundingPostExpiredRecord(original, receipt, context);
      current();
      if (read() !== original) hold(); current();
      let result; writes++;
      try { result = A(p.compareAndSwap, undefined, [original, proposed]); } catch { hold(); }
      if (typeof result !== 'string' || result !== proposed) hold(result);
      if (held) fail(); acknowledged = true; current();
      if (read() !== proposed) hold();
      current(); if (held) fail(); readBack = true; completed = true; return undefined;
    } catch { held = true; fail(); } finally { busy = false; }
  });
  const finishUnexpired = F(function finishUnexpired() {
    if (arguments.length !== 0) fail(); live(); if (!claimed) fail(); current(); completed = true; return undefined;
  });
  const snapshot = F(function snapshot() {
    if (arguments.length !== 0) fail();
    return F({ expiredFundingRetentionVersion: 1, claimed, completed, held, busy, reads, writes,
      candidateReceiptRetained: receipt !== null, proposedWriteRetained: proposed !== null,
      writeAcknowledged: acknowledged, readBackObserved: readBack, opaqueReturns: opaque.length,
      backend: 'BORROWED_NOT_CLOSED', authority: 'NONE', nativeDurability: 'NOT_ESTABLISHED' });
  });
  return F({ claim, retain, finishUnexpired, snapshot });
}
