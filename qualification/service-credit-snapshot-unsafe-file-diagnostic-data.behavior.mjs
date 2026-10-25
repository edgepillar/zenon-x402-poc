// Pure DATA controls for the real extracted diagnostics and observed-read bridge.
// No fs, SQLite, SDK, crypto, socket, child, timer or private fixture is entered.
import assert from 'node:assert/strict';
import { createSnapshotUnsafeFileDiagnostic, createObservedReaddirSync }
  from '../test/helpers/snapshot-unsafe-file-diagnostic.js';

if (process.env.X402_SQLITE_SNAPSHOT_DIAGNOSTIC_DATA !== 'snapshot-unsafe-file-errno-data-v1') {
  throw new Error('EXPLICIT_SNAPSHOT_ERRNO_DATA_SELECTION');
}
const PATH = '/synthetic-diagnostics/observer.sqlite';
const PARENT = '/synthetic-diagnostics';
const UID = typeof process.getuid === 'function' ? BigInt(process.getuid()) : undefined;
const selected = [];
function check(name, body) {
  body();
  selected.push(name);
}
function error(code) {
  return Object.assign(new Error('PRIVATE_SENTINEL_MESSAGE'), { code });
}
function labels(diag) {
  return new Map(diag.labels().split(';').map(value => value.split('=')));
}
function stat(overrides = {}) {
  return { dev: 1n, ino: 10n, uid: UID, nlink: 1n, mode: 0o600n,
    isFile: () => true, isSymbolicLink: () => false, ...overrides };
}
function diagnostic(phase = 'PRE_BEGIN') {
  const value = createSnapshotUnsafeFileDiagnostic(PATH);
  value.hooks.observeReadGuard(phase);
  return value;
}
const ERRNOS = [
  'EACCES', 'EAGAIN', 'EBADF', 'EBUSY', 'ECANCELED', 'EDQUOT', 'EEXIST', 'EFAULT',
  'EFBIG', 'EFTYPE', 'EILSEQ', 'EINTR', 'EINVAL', 'EIO', 'EISDIR', 'ELOOP',
  'EMFILE', 'ENAMETOOLONG', 'ENFILE', 'ENODEV', 'ENOENT', 'ENOMEM', 'ENOSPC',
  'ENOTDIR', 'ENOTEMPTY', 'ENOTSUP', 'ENXIO', 'EOVERFLOW', 'EPERM', 'EROFS',
  'ESTALE', 'ETIMEDOUT', 'EXDEV',
];
for (const code of ERRNOS) {
  for (const [operation, target, hook] of [
    ['LSTAT', PATH, 'observeLstatError'],
    ['READDIR', PARENT, 'observeReaddirError'],
    ['REALPATH', PATH, 'observeRealpathError'],
  ]) {
    check(operation.toLowerCase() + '_own_errno_' + code, () => {
      const diag = diagnostic();
      diag.hooks[hook](error(code), target);
      const row = labels(diag);
      assert.equal(row.get('ERRNO'), code);
      assert.equal(row.get('SYSCALL'), operation);
      assert.equal(row.get('GUARD'), operation === 'READDIR' ? 'PARENT_DIRECTORY' : 'MAIN_DB');
      assert(!diag.labels().includes('PRIVATE_SENTINEL_MESSAGE'));
      assert(!diag.labels().includes(PATH));
    });
  }
}

check('legacy_wrong_journal_type_labels_stay_byte_identical', () => {
  const diag = diagnostic();
  diag.hooks.observeLstatResult(stat({ isFile: () => false }), PATH + '-journal');
  assert.equal(diag.labels(), 'PHASE=PRE_BEGIN;GUARD=EXPECTED_JOURNAL;TYPE=FAIL;OWNER=PASS;NLINK=PASS'
    + ';NLINK_CLASS=ONE;PERMISSION=PASS;SPECIAL_BITS=PASS;LSTAT=OK;DB_IDENTITY=UNKNOWN;DB_REALPATH=UNKNOWN');
});
check('legacy_main_identity_mismatch_labels_stay_byte_identical', () => {
  const diag = diagnostic();
  diag.hooks.observeLstatResult(stat(), PATH);
  diag.hooks.observeReadGuard('POST_COMMIT');
  diag.hooks.observeLstatResult(stat({ dev: 2n }), PATH);
  assert.equal(diag.labels(), 'PHASE=POST_COMMIT;GUARD=MAIN_DB;TYPE=PASS;OWNER=PASS;NLINK=PASS'
    + ';NLINK_CLASS=ONE;PERMISSION=PASS;SPECIAL_BITS=PASS;LSTAT=OK;DB_IDENTITY=FAIL;DB_REALPATH=UNKNOWN');
});
for (const [name, value, expected] of [
  ['zero', 0n, 'ZERO'], ['one', 1n, 'ONE'], ['multiple', 2n, 'MULTIPLE'],
  ['absent', undefined, 'UNKNOWN'], ['number', 1, 'UNKNOWN'], ['negative', -1n, 'UNKNOWN'],
]) {
  check('legacy_nlink_' + name, () => {
    const diag = diagnostic();
    diag.hooks.observeLstatResult(stat({ nlink: value }), PATH + '-journal');
    assert.equal(labels(diag).get('NLINK_CLASS'), expected);
    assert.equal(labels(diag).get('NLINK'), value === 1n ? 'PASS' : 'FAIL');
  });
}
check('legacy_throwing_nlink_stays_unknown', () => {
  const diag = diagnostic(), observation = stat();
  Object.defineProperty(observation, 'nlink', { get() { throw new Error('PRIVATE_SENTINEL_NLINK'); } });
  diag.hooks.observeLstatResult(observation, PATH + '-journal');
  assert.equal(labels(diag).get('NLINK_CLASS'), 'UNKNOWN');
  assert.equal(labels(diag).get('NLINK'), 'UNKNOWN');
  assert(!diag.labels().includes('PRIVATE_SENTINEL'));
});
for (const [name, update, field] of [
  ['type', { isFile: () => false }, 'TYPE'],
  ['link_type', { isSymbolicLink: () => true }, 'TYPE'],
  ['owner', { uid: UID === undefined ? 1n : UID + 1n }, 'OWNER'],
  ['hardlink', { nlink: 2n }, 'NLINK'],
  ['zero_link', { nlink: 0n }, 'NLINK'],
  ['mode', { mode: 0o644n }, 'PERMISSION'],
  ['special_bits', { mode: 0o4600n }, 'SPECIAL_BITS'],
]) {
  check('unsafe_predicate_still_fail_' + name, () => {
    const diag = diagnostic();
    diag.hooks.observeLstatResult(stat(update), PATH + '-journal');
    assert.equal(labels(diag).get(field), 'FAIL');
    assert.equal(labels(diag).get('GUARD'), 'EXPECTED_JOURNAL');
    assert.equal(labels(diag).get('ERRNO'), undefined);
  });
}
check('expected_journal_enoent_retains_legacy_unknown_reset', () => {
  const diag = diagnostic();
  diag.hooks.observeLstatError(error('EIO'), PATH + '-journal');
  diag.hooks.observeLstatError(error('ENOENT'), PATH + '-journal');
  assert.equal(labels(diag).get('GUARD'), 'UNKNOWN');
  assert.equal(labels(diag).get('LSTAT'), 'UNKNOWN');
  assert.equal(labels(diag).get('SYSCALL'), undefined);
});
check('directory_enoent_is_not_expected_journal_disappearance', () => {
  const diag = diagnostic();
  diag.hooks.observeReaddirError(error('ENOENT'), PARENT);
  assert.equal(labels(diag).get('GUARD'), 'PARENT_DIRECTORY');
  assert.equal(labels(diag).get('ERRNO'), 'ENOENT');
});
check('journal_non_enoent_preserves_guard_and_exact_errno', () => {
  const diag = diagnostic();
  diag.hooks.observeLstatError(error('ENFILE'), PATH + '-journal');
  assert.equal(labels(diag).get('GUARD'), 'EXPECTED_JOURNAL');
  assert.equal(labels(diag).get('LSTAT'), 'NON_ENOENT');
  assert.equal(labels(diag).get('ERRNO'), 'ENFILE');
});
for (const [name, value, expected] of [
  ['unknown', 'UNRECOGNIZED', 'OTHER'], ['private_path', '/synthetic-private/PRIVATE_SENTINEL', 'OTHER'],
  ['newline', 'EIO\nPRIVATE_SENTINEL', 'OTHER'], ['labels', 'EIO;ERRNO=PRIVATE_SENTINEL', 'OTHER'],
  ['huge', 'PRIVATE_SENTINEL'.repeat(256), 'OTHER'], ['lowercase', 'emfile', 'OTHER'],
  ['string_object', new String('EMFILE'), 'UNAVAILABLE'], ['number', 23, 'UNAVAILABLE'],
  ['null', null, 'UNAVAILABLE'], ['undefined', undefined, 'UNAVAILABLE'],
  ['symbol', Symbol('PRIVATE_SENTINEL'), 'UNAVAILABLE'],
]) {
  check('safe_errno_' + name, () => {
    const diag = diagnostic();
    diag.hooks.observeReaddirError({ code: value }, PARENT);
    assert.equal(labels(diag).get('ERRNO'), expected);
    assert(!diag.labels().includes('PRIVATE_SENTINEL'));
    assert(diag.labels().length < 400);
  });
}
check('no_error_accessor_message_path_stack_or_syscall_getters_read', () => {
  let consulted = 0;
  const observation = {};
  for (const key of ['code', 'message', 'path', 'stack', 'syscall']) {
    Object.defineProperty(observation, key, { get() { consulted += 1; throw new Error('PRIVATE_SENTINEL'); } });
  }
  const diag = diagnostic();
  diag.hooks.observeLstatError(observation, PATH);
  assert.equal(labels(diag).get('ERRNO'), 'UNAVAILABLE');
  assert.equal(consulted, 0);
});
check('no_inherited_code_getter_read', () => {
  let consulted = 0;
  const prototype = Object.defineProperty({}, 'code', { get() { consulted += 1; return 'EIO'; } });
  const diag = diagnostic();
  diag.hooks.observeLstatError(Object.create(prototype), PATH);
  assert.equal(labels(diag).get('ERRNO'), 'UNAVAILABLE');
  assert.equal(consulted, 0);
});
check('own_code_data_descriptor_can_be_non_enumerable_and_frozen', () => {
  const observation = Object.freeze(Object.defineProperty({}, 'code', { value: 'EMFILE' }));
  const diag = diagnostic();
  diag.hooks.observeReaddirError(observation, PARENT);
  assert.equal(labels(diag).get('ERRNO'), 'EMFILE');
});
check('proxy_error_traps_are_not_consulted', () => {
  let consulted = 0;
  const observation = new Proxy({}, { getOwnPropertyDescriptor() { consulted += 1; throw new Error('PRIVATE_SENTINEL'); } });
  const diag = diagnostic();
  diag.hooks.observeReaddirError(observation, PARENT);
  assert.equal(labels(diag).get('ERRNO'), 'UNAVAILABLE');
  assert.equal(consulted, 0);
});
check('revoked_proxy_error_stays_fixed_unavailable', () => {
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();
  const diag = diagnostic();
  diag.hooks.observeLstatError(revocable.proxy, PATH);
  assert.equal(labels(diag).get('ERRNO'), 'UNAVAILABLE');
});
for (const [name, value] of [['null', null], ['undefined', undefined], ['symbol', Symbol('private')], ['number', 23]]) {
  check('primitive_error_' + name, () => {
    const diag = diagnostic();
    diag.hooks.observeLstatError(value, PATH);
    assert.equal(labels(diag).get('ERRNO'), 'UNAVAILABLE');
  });
}
check('errno_whitelist_uses_captured_set_method', () => {
  const saved = Set.prototype.has;
  const diag = diagnostic();
  try {
    Set.prototype.has = () => true;
    diag.hooks.observeReaddirError(error('PRIVATE_SENTINEL'), PARENT);
  } finally {
    Set.prototype.has = saved;
  }
  assert.equal(labels(diag).get('ERRNO'), 'OTHER');
});
check('phase_reset_drops_stale_errno', () => {
  const diag = diagnostic();
  diag.hooks.observeReaddirError(error('EMFILE'), PARENT);
  diag.hooks.observeReadGuard('POST_COMMIT');
  assert.equal(labels(diag).get('PHASE'), 'POST_COMMIT');
  assert.equal(labels(diag).get('SYSCALL'), undefined);
});
check('successful_lstat_drops_stale_errno', () => {
  const diag = diagnostic();
  diag.hooks.observeLstatError(error('EIO'), PATH);
  diag.hooks.observeLstatResult(stat(), PATH);
  assert.equal(labels(diag).get('SYSCALL'), undefined);
  assert.equal(labels(diag).get('DB_IDENTITY'), 'PASS');
});
check('successful_realpath_drops_stale_errno', () => {
  const diag = diagnostic();
  diag.hooks.observeRealpathError(error('EACCES'), PATH);
  diag.hooks.observeRealpathResult(PATH, PATH);
  assert.equal(labels(diag).get('DB_REALPATH'), 'PASS');
  assert.equal(labels(diag).get('SYSCALL'), undefined);
});
for (const [operation, hook, candidate] of [
  ['readdir', 'observeReaddirError', '/other-directory'],
  ['lstat', 'observeLstatError', PATH + '-wal'],
  ['realpath', 'observeRealpathError', PATH + '-journal'],
]) {
  check('unrelated_target_ignored_' + operation, () => {
    const diag = diagnostic(), before = diag.labels();
    diag.hooks[hook](error('EIO'), candidate);
    assert.equal(diag.labels(), before);
  });
}
check('unknown_phase_is_fixed_not_caller_text', () => {
  const diag = diagnostic('PRIVATE_SENTINEL;PHASE=POST_COMMIT');
  assert.equal(labels(diag).get('PHASE'), 'UNKNOWN');
  assert(!diag.labels().includes('PRIVATE_SENTINEL'));
});

check('observed_readdir_success_forwards_all_args_and_exact_result_once', () => {
  const entries = Object.freeze(['observer.sqlite-journal']);
  const options = Object.freeze({ withFileTypes: false });
  let calls = 0, after = 0;
  const read = createObservedReaddirSync((...args) => {
    calls += 1; assert.deepEqual(args, [PARENT, options]); return entries;
  }, (parent, observed) => {
    after += 1; assert.equal(parent, PARENT); assert.equal(observed, entries);
  }, () => assert.fail('no error observer on success'));
  assert.equal(read(PARENT, options), entries);
  assert.equal(calls, 1); assert.equal(after, 1);
});
for (const code of ['EMFILE', 'ENFILE', 'ENOENT', 'EIO']) {
  check('observed_readdir_raw_' + code + '_rethrows_identical_error_without_retry', () => {
    const diag = diagnostic(), original = error(code);
    let calls = 0, observed = 0, after = 0;
    const read = createObservedReaddirSync(() => { calls += 1; throw original; },
      () => { after += 1; },
      (failure, ...args) => { observed += 1; assert.equal(failure, original); diag.hooks.observeReaddirError(failure, ...args); });
    assert.throws(() => read(PARENT), failure => failure === original);
    assert.equal(calls, 1); assert.equal(observed, 1); assert.equal(after, 0);
    assert.equal(labels(diag).get('ERRNO'), code);
  });
}
check('observer_throw_cannot_replace_original_filesystem_failure', () => {
  const original = error('EMFILE');
  let calls = 0;
  const read = createObservedReaddirSync(() => { calls += 1; throw original; },
    undefined, () => { throw new Error('PRIVATE_SENTINEL_OBSERVER'); });
  assert.throws(() => read(PARENT), failure => failure === original);
  assert.equal(calls, 1);
});
check('after_read_hook_throw_is_not_mislabeled_as_raw_filesystem_error', () => {
  const original = error('EMFILE');
  let observed = 0, calls = 0;
  const read = createObservedReaddirSync(() => { calls += 1; return []; },
    () => { throw original; }, () => { observed += 1; });
  assert.throws(() => read(PARENT), failure => failure === original);
  assert.equal(calls, 1); assert.equal(observed, 0);
});
check('missing_observers_preserve_raw_failure', () => {
  const original = error('EIO');
  const read = createObservedReaddirSync(() => { throw original; });
  assert.throws(() => read(PARENT), failure => failure === original);
});
for (const [name, args] of [
  ['read', [undefined]], ['after', [() => [], 1]], ['error', [() => [], undefined, 1]],
]) {
  check('invalid_observer_type_' + name, () => assert.throws(
    () => createObservedReaddirSync(...args), { message: 'SNAPSHOT_READDIR_DIAGNOSTIC_CALLBACK' }));
}
assert.equal(new Set(selected).size, selected.length);
console.log(JSON.stringify({ event: 'SQLITE_SNAPSHOT_ERRNO_DIAGNOSTIC_ACTUAL_DATA_CONTROLS',
  successful: true, selectedCases: selected.length, cases: selected,
  legacyPredicateLabelsPreserved: true, realDiagnosticAndReadBridgeUsed: true,
  SDKExecuted: false, SQLiteExecuted: false, nativeFilesystemProbeCalls: 0,
  keysSignaturesNonceSocketsChildrenTimers: false, unsafeFilePolicyChanged: false,
  issue165ActualIntermittentCauseEstablished: false, authority: 'NONE' }));
