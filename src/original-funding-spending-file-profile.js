import { types } from 'node:util';
import { dirname, isAbsolute, normalize } from 'node:path';
import { captureOriginalFundingSpendingSqliteProfile } from './original-funding-spending-sqlite-profile.js';

const F = Object.freeze;
function fail() { throw new TypeError('ORIGINAL_SPENDING_FILE_PROFILE'); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
function unsigned(value) {
  if (typeof value !== 'string' || /^(0|[1-9][0-9]{0,18})$/.exec(value)?.[0] !== value || BigInt(value) > (1n << 63n) - 1n) fail();
  return value;
}
/** Explicit operator file/device/reservation selection. The reservation is a
 * caller assertion, not proof of the global task-storage reservation ledger. */
export function captureOriginalFundingSpendingFileProfile(configuration) {
  if (arguments.length !== 1) fail();
  const c = fields(configuration, ['storageProfile', 'allowedRoot', 'filePolicy']);
  const storage = captureOriginalFundingSpendingSqliteProfile(c.storageProfile);
  const selection = F({ version: 1, mode: storage.mode, databasePath: storage.databasePath, policy: storage.policy,
    ...(storage.mode === 'CREATE_NEW' ? { storeId: storage.ownerToken.storeId, ownerId: storage.ownerToken.ownerId } : { ownerToken: storage.ownerToken }) });
  if (typeof c.allowedRoot !== 'string' || !isAbsolute(c.allowedRoot) || normalize(c.allowedRoot) !== c.allowedRoot
      || c.allowedRoot.length > 4096 || !/^[\x20-\x7e]+$/.test(c.allowedRoot) || dirname(storage.databasePath) !== c.allowedRoot) fail();
  const policy = fields(c.filePolicy, ['expectedDevice', 'reservedBytes', 'maxDatabaseBytes']);
  unsigned(policy.expectedDevice); unsigned(policy.reservedBytes);
  if (!Number.isSafeInteger(policy.maxDatabaseBytes) || policy.maxDatabaseBytes < 65536 || policy.maxDatabaseBytes > 4194304
      || policy.maxDatabaseBytes % 4096 !== 0) fail();
  return F({ storageProfile: selection, allowedRoot: c.allowedRoot, filePolicy: F(policy),
    requiredFreeBytes: String(10737418240n + BigInt(policy.reservedBytes) + 2n * BigInt(policy.maxDatabaseBytes) + 65536n) });
}

export function requireOriginalFundingSpendingFileCapacity(profile, availableBytes) {
  if (arguments.length !== 2) fail();
  const input = fields(profile, ['storageProfile', 'allowedRoot', 'filePolicy', 'requiredFreeBytes']);
  const selected = captureOriginalFundingSpendingFileProfile({ storageProfile: input.storageProfile,
    allowedRoot: input.allowedRoot, filePolicy: input.filePolicy });
  if (input.requiredFreeBytes !== selected.requiredFreeBytes) fail();
  unsigned(availableBytes);
  if (BigInt(availableBytes) < BigInt(selected.requiredFreeBytes)) fail();
  return F({ requiredFreeBytes: selected.requiredFreeBytes, authority: 'NONE' });
}
