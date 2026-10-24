# P2 PREPARED crash-pair profile and managed launcher draft

Status: **64 actual DATA tests pass; native pair not run.**

This increment completes a dedicated private-profile builder, bounded capture
parser, parent command entry and managed launcher source for
`PREPARED_BEFORE_EXECUTOR`. It adds no default application behavior and does
not qualify P2, physical durability, native cleanup, delivery or production.

## Exact source and scope

The source parent is `c9b6c68a6aeac0ff0138baff5ca66b039740ecaf`.
The existing [PREPARED source inventory](../qualification/recovery-crash-prepared-full-graph.source-inputs.json)
remains byte-for-byte unchanged:

- 130 application inputs and 404 existing package inputs; 4,711,970 bytes.
- All 117 frozen V3 application inputs and all 404 package inputs remain required.
- Source-row SHA-256: `31fe255b2862dfd2eb0647b8a8b34f9bd4d48e4a6b3afec65846b0a0889ec6b9`.
- No source transform, native builtin alias or reduced SQLite-only substitute.

The [new launch manifest](../qualification/recovery-crash-prepared-pair.launch-inputs.json) pins four Python
controls and five parent controls independently of the child namespace. The
existing committed-case profile/entry/launcher, its inventory and pending native
selection, the V3 clean selection, and historical results are not edited.
The earlier inventory's `managedLauncherComplete: false` is a preserved historical
source assertion, not a mutable completion flag. This document and the new
manifest describe the later authored launcher; its native path remains unrun.

## Implementation

The [dedicated profile/parser](../qualification/recovery_crash_prepared_native_profile.py) requires the
exact PREPARED inventory and its full frozen baseline before building private
file-URL/identity profiles. Physical reads use owner, regular-file, single-link,
no-symlink-ancestor, before/open/after identity, size, LF, SHA-256 and Git-blob
checks. Existing package versions and parent control sources stay pinned.

The [parent entry](../qualification/recovery-crash-prepared-pair.entry.draft.mjs) binds the dedicated prepared
supervisor/protocol, exact seed JSON, source seal and distinct parent selection
before invoking the owned pair. Its one bounded private stdout capture includes
original witness bytes and both children's raw streams; it is not a public
report or a second copied archive.

The parser rejects committed-case capture kinds, V2 protocol snapshots, old
namespace footers, any seed executor call, held-credit-release authority,
unsafe integers and negative-zero spellings. Only the PREPARED protocol's
complete, passive-recovery outcome is accepted; `CHILD_UNKNOWN` and
`NOT_ESTABLISHED` delivery remain. Its DATA return value alone does not
authenticate a native process, SQLite state or command receipt.

The [managed launcher](../qualification/run-recovery-crash-prepared-pair.local.py) defaults to
source-only. Its native branch requires a separate explicit finite selection,
a new private store with exact one-task policy, fresh runtime/source/package/tool
and volume/capacity admission, one test-TLS command, and one bounded parent
command with at most two owned children. The existing committed-case or V3 clean
allowance is not reused. Labels and a pre-native plan are not human approval.
The cooperative launcher is not an OS or network sandbox.

## Actual local checks in this increment

The [actual result record](../qualification/recovery-crash-prepared-profile.actual-local-result.json) pins the inputs and
separates these observations:

- 64 DATA tests passed; zero failures, errors, skips or caller hooks.
- The source-only launcher main entry returned zero in isolated Python 3.12.14
  with site loading and bytecode disabled. This was a same-process source-only
  invocation, not a native command run.
- The new builder verified 130 application and 404 package files in place;
  no package code was imported. Private child and parent profiles were built
  only in memory (255,997 and 2,978 bytes at that local identity snapshot).
- The new parent entry passed Node 24.19.0 syntax-only `--check`; the checked
  entry was not imported or executed.

No task root, task, SQLite fixture, TLS key, application child, signal, signature,
nonce search or socket was created. No manager, SDK or x402 package code ran.
There was no fresh pre-native capacity admission and no native allowance consumed.
The full source graph was read in place instead of copying or repackaging it;
the DATA run needed no qualification scratch.

## Remaining qualification

A source-reviewed, separately approved native PREPARED pair must still observe
the real full-application prepare COMMIT, zero executor calls, HELD credit and
terminal NONE, followed by the exact owned SIGKILL, complete child stream/IPC
termination, same-file reopening and passive reader reconciliation. No mutating
backend recovery or held-credit release is part of this selection.

That experiment has not run. The separate committed-service pair and clean V3
native selections also keep their own approval/evidence boundaries.
The unchanged hosted 27-case profile is a different qualification lane; no new
64-case hosted-CI claim is made. Local development does not wait on those lanes.
