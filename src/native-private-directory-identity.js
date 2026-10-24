import { types as utilTypes } from 'node:util';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor;
const NAMES = ['dev', 'ino', 'uid', 'gid', 'mode'];
const MAX = (1n << 64n) - 1n;

/** Stable identity DATA for a mutable, private native directory.
 * Callers must obtain these five fields from their own lstat, check directory
 * kind and every path ancestor, and retain their existing file/NOFOLLOW guards.
 * Do not bind a writer's directory to nlink, size, mtime or ctime: adding a
 * legitimate child can change them. This is not a pathname/race authentication
 * primitive, a filesystem observation, cleanup permission or native authority.
 * Regular-file pins must STILL check nlink === 1 and their full identities.
 */
export function captureNativePrivateDirectoryStatIdentity(value, expectedUid) {
  if (arguments.length !== 2 || typeof expectedUid !== 'bigint'
      || expectedUid < 0n || expectedUid > MAX
      || value === null || typeof value !== 'object' || utilTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== NAMES.length) refuse();
  const fields = [];
  for (const name of NAMES) {
    const field = D(value, name);
    if (!field || !Object.hasOwn(field, 'value') || field.enumerable !== true
        || typeof field.value !== 'bigint' || field.value < 0n || field.value > MAX) refuse();
    fields.push(field.value);
  }
  if (fields[1] === 0n || fields[2] !== expectedUid
      || fields[4] > 0o177777n || (fields[4] & 0o170000n) !== 0o040000n
      || (fields[4] & 0o7777n) !== 0o700n) refuse();
  return F(fields.map(String));
}

function refuse() {
  const code = 'NATIVE_PRIVATE_DIRECTORY_IDENTITY_REJECTED';
  const error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw F(error);
}
