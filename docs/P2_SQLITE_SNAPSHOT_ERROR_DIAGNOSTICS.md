# P2 SQLite snapshot error diagnostics

Status: test-only observability improved; 157/157 selected local DATA controls
passed. This is not an availability fix, real SQLite concurrency reproduction
or closure of [issue #165](https://github.com/edgepillar/zenon-x402-poc/issues/165).

## Reproduced diagnostic gaps

Two bounded controls executed the exact original diagnostic function extracted
without rewriting it from the current native test source. They confirmed that
an own `EMFILE` code was reduced to `LSTAT=NON_ENOENT` and that the helper had
no `readdir` error observer. The complete old SQLite test entry was not imported.

These were synthetic own-code errors, not an observed OS descriptor-exhaustion
failure. The intermittent native failure's actual predicate/errno remains
unproven; a passing later run still does not resolve the issue.

## Implementation

The existing test helper now lives in
`test/helpers/snapshot-unsafe-file-diagnostic.js`. It preserves the existing
predicate labels and adds fixed `SYSCALL`/`ERRNO` fields only for observed
errors in the lstat, readdir or realpath wrapper context. It reads only an own
data descriptor for `error.code` and emits a closed 33-name errno whitelist.
Unknown strings become `OTHER`; accessors, inherited values, proxies and
non-string values become `UNAVAILABLE`. Message, path, stack and raw syscall
properties are not read or printed.

The real instrumented test's readdir shim uses the same isolated read bridge
that the DATA controls exercise. A raw read error is observed then rethrown as
the exact original object; an observer throw cannot replace it. The read is
called once, not retried. The successful result and arguments retain their
identity. An after-read hook failure is not labelled a raw readdir failure.
The callback contract is synchronous; no async-observer guarantee is added.

Expected journal `ENOENT` keeps its earlier reset behavior. Parent-directory
`ENOENT` is not silently treated as a vanished journal. Zero-link, hardlink,
type, owner, permission and special-bit diagnostic predicates retain failure
classification. No production store predicate, errno mapping, quarantine,
snapshot transaction, journal policy or cleanup behavior was changed.

## Actual qualification

- Two pre-fix gap controls passed using the exact old diagnostic source subset.
- 157 new DATA controls passed with actual exit 0, complete 5,266-byte stdout
  and empty stderr, in about 0.346 seconds.
- The modified full SQLite test file passed syntax checking only, with actual
  exit 0 and empty complete streams. It was not imported or executed.
- All 224 protected inputs remained unchanged, including the production store
  and the frozen timer/native source graph. No existing native test cases or
  expected failure assertions were removed or relaxed.

The controls exercise all 33 errno names for three operation contexts, exact
legacy predicate strings, link-count classes, getter/proxy privacy, injected
label text, phase resets, wrapper result/error identity and observer failures.
They use in-memory metadata/error callbacks; no real filesystem probe, SQLite,
SDK, key, signature, nonce, socket, timer or child process is selected. Verified
source loading is separate from filesystem probe activity.

Node's recently successful source-file hash from the installed-source check
was reused only while its full nine-field identity remained unchanged before
and after these controls. The 121 MB executable was not rehashed or copied.
No dependency install, qualification scratch, database fixture, source tree
copy or storage-manager invocation was needed.

## Publication boundary

The patch modifies only the active native test's diagnostic wiring, adds the
shared test helper and isolated DATA entry, and records this evidence. The
production store and default application path are byte-unchanged. Historical
native sources/results retain their original refs; the old native test blob
and original helper digest are recorded explicitly.

The current automatic hosted profile remains its original 27 selected cases.
It does not include these 157 controls or the large SQLite test file. There is
no workflow/profile/package edit, new native allowance, automatic CI retry,
issue comment or issue closure.

A future separately authorized native Node 24/Linux run must confirm the real
instrumentation and discriminate the actual safety predicate or environmental
FS error. Snapshot integrity, quarantine and real old-or-new concurrency still
need their proportionate native regression. The new labels are observations,
not authenticated causes, retry permission or native acceptance.

Result: `qualification/service-credit-snapshot-unsafe-file-diagnostic-data.actual-local-result.json`.
Authority remains `NONE`.
