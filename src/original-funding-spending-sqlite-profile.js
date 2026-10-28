import { types } from 'node:util';
import { isAbsolute, normalize } from 'node:path';
import { captureOriginalFundingSpendingPolicy } from './original-funding-spending-reservations.js';

const F = Object.freeze, TOKEN = ['version', 'storeId', 'accountId', 'ownerId', 'epoch', 'minimumRevision'];
function fail(code) { const e = new TypeError('SPENDING_SQLITE_PROFILE_' + code); Object.defineProperty(e, 'stack', { value: e.message }); throw F(e); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail('INPUT');
  const out = {};
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail('INPUT'); out[name] = d.value; }
  return out;
}
function id(value) { if (typeof value !== 'string' || /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.exec(value)?.[0] !== value) fail('IDENTITY'); return value; }
function number(value, minimum) { if (!Number.isSafeInteger(value) || value < minimum || value >= Number.MAX_SAFE_INTEGER || Object.is(value, -0)) fail('VERSION'); return value; }
export function captureOriginalFundingSpendingSqliteOwnership(input, policyInput) {
  if (arguments.length !== 2) fail('INPUT');
  const t = fields(input, TOKEN), policy = captureOriginalFundingSpendingPolicy(policyInput);
  if (t.version !== 1 || id(t.accountId) !== policy.accountId) fail('ACCOUNT');
  id(t.storeId); id(t.ownerId); number(t.epoch, 1); number(t.minimumRevision, 0); return F(t);
}
/** A context comparison, never proof of authentication or physical release. */
export function requireOriginalFundingSpendingSqliteOwnership(expected, observed, policyInput) {
  if (arguments.length !== 3) fail('INPUT');
  const a = captureOriginalFundingSpendingSqliteOwnership(expected, policyInput);
  const b = captureOriginalFundingSpendingSqliteOwnership(observed, policyInput);
  if (!['version', 'storeId', 'accountId', 'ownerId', 'epoch'].every(k => a[k] === b[k]) || b.minimumRevision < a.minimumRevision) fail('FENCED');
  return b;
}
export function nextOriginalFundingSpendingSqliteOwnership(current, nextOwnerId, currentRevision, policyInput) {
  if (arguments.length !== 4) fail('INPUT');
  const t = captureOriginalFundingSpendingSqliteOwnership(current, policyInput);
  id(nextOwnerId); number(currentRevision, 0);
  if (currentRevision < t.minimumRevision || t.epoch >= Number.MAX_SAFE_INTEGER - 1) fail('VERSION');
  return F({ ...t, ownerId: nextOwnerId, epoch: t.epoch + 1, minimumRevision: currentRevision });
}
/** Explicit create/open selection. Missing state is never a create fallback. */
export function captureOriginalFundingSpendingSqliteProfile(input) {
  if (arguments.length !== 1 || input === null || typeof input !== 'object' || types.isProxy(input)) fail('INPUT');
  const modeDescriptor = Object.getOwnPropertyDescriptor(input, 'mode');
  if (!modeDescriptor?.enumerable || !Object.hasOwn(modeDescriptor, 'value')) fail('INPUT');
  const creating = modeDescriptor.value === 'CREATE_NEW';
  if (!creating && modeDescriptor.value !== 'OPEN_EXISTING') fail('MODE');
  const c = fields(input, ['version', 'mode', 'databasePath', 'policy', ...(creating ? ['storeId', 'ownerId'] : ['ownerToken'])]);
  if (c.version !== 1 || typeof c.databasePath !== 'string' || c.databasePath.length > 4096 || c.databasePath.includes('\0')
      || !isAbsolute(c.databasePath) || normalize(c.databasePath) !== c.databasePath || !c.databasePath.endsWith('.sqlite')) fail('PATH');
  const policy = captureOriginalFundingSpendingPolicy(c.policy);
  const token = creating ? captureOriginalFundingSpendingSqliteOwnership({ version: 1, storeId: id(c.storeId), accountId: policy.accountId,
    ownerId: id(c.ownerId), epoch: 1, minimumRevision: 0 }, policy) : captureOriginalFundingSpendingSqliteOwnership(c.ownerToken, policy);
  return F({ version: 1, mode: c.mode, databasePath: c.databasePath, policy, ownerToken: token });
}
