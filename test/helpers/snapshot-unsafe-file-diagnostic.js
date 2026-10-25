// Test-only observation. No file/store access, retries or safety decisions.
import { dirname } from 'node:path';
import { types } from 'node:util';

const IS_PROXY = types.isProxy;
const GET_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const HAS_OWN = Object.hasOwn;
const SET_HAS = Set.prototype.has;
const APPLY = Reflect.apply;
const SAFE_ERRNOS = new Set([
  'EACCES', 'EAGAIN', 'EBADF', 'EBUSY', 'ECANCELED', 'EDQUOT', 'EEXIST', 'EFAULT',
  'EFBIG', 'EFTYPE', 'EILSEQ', 'EINTR', 'EINVAL', 'EIO', 'EISDIR', 'ELOOP',
  'EMFILE', 'ENAMETOOLONG', 'ENFILE', 'ENODEV', 'ENOENT', 'ENOMEM', 'ENOSPC',
  'ENOTDIR', 'ENOTEMPTY', 'ENOTSUP', 'ENXIO', 'EOVERFLOW', 'EPERM', 'EROFS',
  'ESTALE', 'ETIMEDOUT', 'EXDEV',
]);

// Never read error.message, stack, path, syscall, inherited code or an accessor.
// An unknown code becomes a fixed label, not caller-controlled public text.
function safeErrno(error) {
  try {
    if (IS_PROXY(error)) return 'UNAVAILABLE';
    const descriptor = GET_DESCRIPTOR(error, 'code');
    if (!descriptor || !HAS_OWN(descriptor, 'value')
        || typeof descriptor.value !== 'string') return 'UNAVAILABLE';
    return APPLY(SET_HAS, SAFE_ERRNOS, [descriptor.value]) ? descriptor.value : 'OTHER';
  } catch {
    return 'UNAVAILABLE';
  }
}

// The real test shim supplies synchronous callbacks. Observe only the raw read
// throw, not an afterRead hook's error. Preserve result and error identity,
// call the filesystem operation once and never retry or suppress its failure.
export function createObservedReaddirSync(readDirectory, afterRead, observeError) {
  if (typeof readDirectory !== 'function'
      || (afterRead !== undefined && typeof afterRead !== 'function')
      || (observeError !== undefined && typeof observeError !== 'function')) {
    throw new TypeError('SNAPSHOT_READDIR_DIAGNOSTIC_CALLBACK');
  }
  return function observedReaddirSync(...args) {
    let entries;
    try {
      entries = readDirectory(...args);
    } catch (error) {
      try { observeError?.(error, ...args); } catch {}
      throw error;
    }
    afterRead?.(args[0], entries);
    return entries;
  };
}

export function createSnapshotUnsafeFileDiagnostic(databasePath) {
  const parentPath = dirname(databasePath);
  const journalPath = `${databasePath}-journal`;
  const blank = () => ({
    guard: 'UNKNOWN', type: 'UNKNOWN', owner: 'UNKNOWN', nlink: 'UNKNOWN',
    nlinkClass: 'UNKNOWN', permission: 'UNKNOWN', specialBits: 'UNKNOWN', lstat: 'UNKNOWN',
    dbIdentity: 'UNKNOWN', dbRealpath: 'UNKNOWN', rawOperation: null, rawErrno: null,
  });
  const predicate = operation => {
    try { return operation() ? 'PASS' : 'FAIL'; } catch { return 'UNKNOWN'; }
  };
  const classifyNlink = value => {
    if (typeof value !== 'bigint' || value < 0n) return 'UNKNOWN';
    if (value === 0n) return 'ZERO';
    return value === 1n ? 'ONE' : 'MULTIPLE';
  };
  let phase = 'UNKNOWN', observation = blank(), identity;
  const guardFor = candidate => candidate === databasePath
    ? 'MAIN_DB' : candidate === journalPath ? 'EXPECTED_JOURNAL' : null;
  const observeDatabaseRealpath = (candidate, status) => {
    if (candidate === databasePath) {
      observation = { ...observation, guard: 'MAIN_DB', dbRealpath: status,
        rawOperation: null, rawErrno: null };
    }
  };
  const hooks = {
    observeReadGuard(candidate) {
      phase = candidate === 'PRE_BEGIN' || candidate === 'POST_COMMIT'
        ? candidate : 'UNKNOWN';
      observation = blank();
    },
    observeLstatResult(stat, candidate) {
      const guard = guardFor(candidate);
      if (guard === null) return;
      let currentIdentity;
      if (guard === 'MAIN_DB') {
        try { currentIdentity = [stat.dev, stat.ino]; } catch {}
        identity ??= currentIdentity;
      }
      let nlinkClass = 'UNKNOWN';
      observation = {
        ...blank(), guard,
        type: predicate(() => stat.isFile() && !stat.isSymbolicLink()),
        owner: predicate(() => typeof process.getuid === 'function'
          && stat.uid === BigInt(process.getuid())),
        nlink: predicate(() => {
          const value = stat.nlink;
          nlinkClass = classifyNlink(value);
          return value === 1n;
        }),
        nlinkClass,
        permission: predicate(() => (stat.mode & 0o777n) === 0o600n),
        specialBits: predicate(() => (stat.mode & 0o7000n) === 0n),
        lstat: 'OK',
        dbIdentity: guard === 'MAIN_DB' && identity !== undefined
          && currentIdentity !== undefined
          ? predicate(() => identity[0] === currentIdentity[0]
            && identity[1] === currentIdentity[1]) : 'UNKNOWN',
        dbRealpath: 'UNKNOWN',
      };
    },
    observeLstatError(error, candidate) {
      const guard = guardFor(candidate);
      if (guard === null) return;
      const errno = safeErrno(error);
      const enoent = errno === 'ENOENT';
      if (guard === 'EXPECTED_JOURNAL' && enoent) {
        observation = blank(); return;
      }
      observation = { ...blank(), guard, lstat: enoent ? 'ENOENT' : 'NON_ENOENT',
        rawOperation: 'LSTAT', rawErrno: errno };
    },
    observeRealpathResult(result, candidate) {
      observeDatabaseRealpath(candidate, result === databasePath ? 'PASS' : 'FAIL');
    },
    observeRealpathError(error, candidate) {
      if (candidate !== databasePath) return;
      observation = { ...observation, guard: 'MAIN_DB', dbRealpath: 'FAIL',
        rawOperation: 'REALPATH', rawErrno: safeErrno(error) };
    },
    observeReaddirError(error, candidate) {
      if (candidate !== parentPath) return;
      observation = { ...blank(), guard: 'PARENT_DIRECTORY',
        rawOperation: 'READDIR', rawErrno: safeErrno(error) };
    },
  };
  return {
    hooks,
    phase: () => phase,
    labels() {
      const known = Object.values(observation).includes('FAIL')
        || observation.lstat === 'ENOENT' || observation.lstat === 'NON_ENOENT'
        || observation.rawOperation !== null;
      const labels = `PHASE=${phase};GUARD=${known ? observation.guard : 'UNKNOWN'}`
        + `;TYPE=${observation.type};OWNER=${observation.owner};NLINK=${observation.nlink}`
        + `;NLINK_CLASS=${observation.nlinkClass}`
        + `;PERMISSION=${observation.permission};SPECIAL_BITS=${observation.specialBits}`
        + `;LSTAT=${observation.lstat};DB_IDENTITY=${observation.dbIdentity}`
        + `;DB_REALPATH=${observation.dbRealpath}`;
      return observation.rawOperation === null ? labels
        : `${labels};SYSCALL=${observation.rawOperation};ERRNO=${observation.rawErrno}`;
    },
  };
}
