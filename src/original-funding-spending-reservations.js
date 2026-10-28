import { types } from 'node:util';
import { Buffer } from 'node:buffer';

const F = Object.freeze, MAX = (1n << 255n) - 1n;
const POLICY = ['version', 'policyId', 'accountId', 'network', 'asset', 'recipients', 'maxPayment', 'maxTotal', 'maxDaily', 'maxRecords'];
const STATE = ['version', 'policy', 'revision', 'lastDay', 'reservations'];
const ROW = ['paymentId', 'originalDigest', 'network', 'asset', 'recipient', 'amount', 'reservedDay', 'status', 'spentDay'];
function fail(suffix) { const e = new TypeError('ORIGINAL_FUNDING_SPENDING_' + suffix); Object.defineProperty(e, 'stack', { value: e.message }); throw F(e); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail('INPUT');
  const out = {};
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail('INPUT'); out[name] = d.value; }
  return out;
}
function text(value) { if (typeof value !== 'string' || /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.exec(value)?.[0] !== value) fail('INPUT'); return value; }
function day(value) { if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647 || Object.is(value, -0)) fail('DAY'); return value; }
function amount(value) { if (typeof value !== 'string' || /^[1-9][0-9]{0,76}$/.exec(value)?.[0] !== value || BigInt(value) > MAX) fail('AMOUNT'); return BigInt(value); }
function hash(value) { if (typeof value !== 'string' || /^sha256:[a-f0-9]{64}$/.exec(value)?.[0] !== value) fail('INPUT'); return value; }
function list(value, maximum) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype
      || value.length < 1 || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) fail('INPUT');
  const out = [];
  for (let i = 0; i < value.length; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail('INPUT'); out.push(d.value); }
  return out;
}
export function captureOriginalFundingSpendingPolicy(input) {
  if (arguments.length !== 1) fail('INPUT'); const p = fields(input, POLICY);
  if (p.version !== 1) fail('POLICY');
  for (const k of ['policyId', 'accountId', 'network', 'asset']) text(p[k]);
  p.recipients = F(list(p.recipients, 16).map(text));
  if (new Set(p.recipients).size !== p.recipients.length) fail('POLICY');
  for (const k of ['maxPayment', 'maxTotal', 'maxDaily']) amount(p[k]);
  if (amount(p.maxPayment) > amount(p.maxTotal) || amount(p.maxPayment) > amount(p.maxDaily)
      || !Number.isSafeInteger(p.maxRecords) || p.maxRecords < 1 || p.maxRecords > 1024) fail('POLICY');
  return F(p);
}
function method(owner, name) {
  if (owner === null || typeof owner !== 'object' || types.isProxy(owner) || Object.getPrototypeOf(owner) !== Object.prototype) fail('BACKEND');
  const d = Object.getOwnPropertyDescriptor(owner, name);
  if (!d?.enumerable || !Object.hasOwn(d, 'value') || typeof d.value !== 'function' || types.isProxy(d.value)) fail('BACKEND');
  return (...args) => Reflect.apply(d.value, owner, args);
}
function reservation(input, policy, selectedDay) {
  const r = fields(input, ['paymentId', 'originalDigest', 'network', 'asset', 'recipient', 'amount']);
  text(r.paymentId); hash(r.originalDigest); text(r.network); text(r.asset); text(r.recipient); amount(r.amount);
  if (r.network !== policy.network || r.asset !== policy.asset || !policy.recipients.includes(r.recipient)) fail('ALLOWLIST');
  if (amount(r.amount) > amount(policy.maxPayment)) fail('PER_PAYMENT_LIMIT');
  return { ...r, reservedDay: selectedDay, status: 'RESERVED', spentDay: null };
}
function totals(rows, selectedDay) {
  let total = 0n, daily = 0n, unresolved = 0;
  for (const r of rows) {
    const value = amount(r.amount); total += value;
    // All unresolved originals carry into every later admission day. A late
    // BOUND observation moves the same exposure into that observed day's spend.
    if (r.status !== 'SPENT' || r.spentDay === selectedDay) daily += value;
    if (r.status !== 'SPENT') unresolved++;
  }
  return { total, daily, unresolved };
}
function decode(raw, policy) {
  if (raw === null) return { version: 1, policy, revision: 0, lastDay: 0, reservations: [] };
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 1048576) fail('CORRUPT');
  let parsed; try { parsed = JSON.parse(raw); } catch { fail('CORRUPT'); }
  const s = fields(parsed, STATE);
  if (s.version !== 1 || JSON.stringify(captureOriginalFundingSpendingPolicy(s.policy)) !== JSON.stringify(policy)
      || !Number.isSafeInteger(s.revision) || s.revision < 1 || s.revision === Number.MAX_SAFE_INTEGER) fail('CORRUPT');
  day(s.lastDay);
  if (!Array.isArray(s.reservations) || s.reservations.length < 1 || s.reservations.length > policy.maxRecords) fail('CORRUPT');
  const ids = new Set(), originals = new Set();
  for (const item of s.reservations) {
    const r = fields(item, ROW); reservation(Object.fromEntries(ROW.slice(0, 6).map(k => [k, r[k]])), policy, day(r.reservedDay));
    if (r.reservedDay > s.lastDay || ids.has(r.paymentId) || originals.has(r.originalDigest) || !['RESERVED', 'UNKNOWN', 'SPENT'].includes(r.status)) fail('CORRUPT');
    ids.add(r.paymentId); originals.add(r.originalDigest);
    if (r.status === 'SPENT' ? day(r.spentDay) < r.reservedDay || r.spentDay > s.lastDay : r.spentDay !== null) fail('CORRUPT');
  }
  const exposure = totals(s.reservations, s.lastDay);
  if (exposure.total > amount(policy.maxTotal) || exposure.daily > amount(policy.maxDaily) || JSON.stringify(s) !== raw) fail('CORRUPT');
  const days = new Set(s.reservations.flatMap(r => r.spentDay === null ? [r.reservedDay] : [r.reservedDay, r.spentDay]));
  for (const d of days) {
    let historical = 0n;
    for (const r of s.reservations) if (r.reservedDay <= d && (r.spentDay === null || r.spentDay >= d)) historical += amount(r.amount);
    if (historical > amount(policy.maxDaily)) fail('CORRUPT');
  }
  return s;
}
/** Synchronous exact-CAS journal. Backend durability is a separate integration
 * requirement. No timeout, expiry, release, prune or reauthorization operation
 * exists. Reopening a reservation supplies inspection, never dispatch rights. */
export function createOriginalFundingSpendingReservations(policyInput, backend) {
  if (arguments.length !== 2) fail('INPUT');
  const policy = captureOriginalFundingSpendingPolicy(policyInput);
  const LOAD = method(backend, 'load'), CAS = method(backend, 'compareAndSwap');
  let current = null, state = null, busy = false, closed = false, held = false;
  function usable() { if (busy || closed || held) fail(closed ? 'CLOSED' : held ? 'HELD' : 'BUSY'); }
  function after() { if (closed) { held = true; fail('CLOSED'); } }
  busy = true;
  try { current = LOAD(policy.accountId); state = decode(current, policy); } catch { held = true; fail('READ_UNKNOWN'); }
  finally { busy = false; }
  function change(work) {
    usable(); busy = true;
    try {
      const proposed = work(state);
      if (proposed === state) return;
      if (state.revision >= Number.MAX_SAFE_INTEGER - 1) fail('REVISION_EXHAUSTED');
      proposed.revision = state.revision + 1;
      const raw = JSON.stringify(proposed); decode(raw, policy);
      let observed;
      try { observed = CAS(policy.accountId, current, raw); after(); } catch { held = true; fail(closed ? 'CLOSED' : 'COMMIT_UNKNOWN'); }
      if (observed !== raw) { held = true; fail(observed === null ? 'CONFLICT' : 'COMMIT_UNKNOWN'); }
      current = raw; state = proposed;
    } finally { busy = false; }
  }
  function selectedDay(value) { day(value); if (value < state.lastDay) fail('CLOCK_ROLLBACK'); return value; }
  return F({
    reserve(input, nowDay) {
      if (arguments.length !== 2) fail('INPUT');
      let selected;
      change(s => {
        const d = selectedDay(nowDay); selected = reservation(input, policy, d);
        if (s.reservations.some(r => r.paymentId === selected.paymentId || r.originalDigest === selected.originalDigest)) fail('ORIGINAL_ALREADY_RESERVED');
        if (s.reservations.length >= policy.maxRecords) fail('RECORD_LIMIT');
        const rows = [...s.reservations, selected], exposure = totals(rows, d);
        if (exposure.total > amount(policy.maxTotal)) fail('TOTAL_LIMIT');
        if (exposure.daily > amount(policy.maxDaily)) fail('DAILY_LIMIT');
        return { ...s, lastDay: d, reservations: rows };
      });
      // Only this successful live reserve call may precede one preparation.
      // The receipt is not persisted authority and is never accepted on reopen.
      return F({ paymentId: selected.paymentId, originalDigest: selected.originalDigest, status: 'RESERVED' });
    },
    observe(paymentId, originalDigest, status, nowDay) {
      if (arguments.length !== 4) fail('INPUT'); text(paymentId); hash(originalDigest);
      if (!['UNKNOWN', 'SPENT'].includes(status)) fail('STATUS');
      change(s => {
        const d = selectedDay(nowDay), index = s.reservations.findIndex(r => r.paymentId === paymentId);
        if (index < 0 || s.reservations[index].originalDigest !== originalDigest) fail('ORIGINAL_MISMATCH');
        const old = s.reservations[index];
        if (old.status === 'SPENT') { if (status !== 'SPENT') fail('DOWNGRADE'); return s; }
        const rows = s.reservations.map((r, i) => i === index ? { ...r, status, spentDay: status === 'SPENT' ? d : null } : r);
        return { ...s, lastDay: d, reservations: rows };
      });
    },
    inspect(nowDay) {
      if (arguments.length !== 1) fail('INPUT'); usable(); const d = selectedDay(nowDay), exposure = totals(state.reservations, d);
      return F({ version: 1, accountId: policy.accountId, policyId: policy.policyId, revision: state.revision,
        totalExposure: String(exposure.total), dailyExposure: String(exposure.daily), unresolved: exposure.unresolved,
        records: state.reservations.length, lastDay: state.lastDay, held, closed, authority: 'NONE', durability: 'BACKEND_REQUIRED' });
    },
    close() { if (arguments.length !== 0) fail('INPUT'); closed = true; },
    snapshot() { if (arguments.length !== 0) fail('INPUT'); return F({ busy, closed, held, authority: 'NONE' }); },
  });
}
