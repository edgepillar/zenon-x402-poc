# Owned P2 crash cutpoint coordination: source draft

## Scope and current result, 2026-10-24

This is an intermediate implementation for the roadmap's abrupt-death and
resource-lifecycle work, not a smaller replacement for the full application
qualification. The historical V6 process-checkpoint recipe exercises normal
process exits; its result is not abrupt-death evidence.

The new [protocol](../qualification/recovery-crash-cutpoint-protocol.js) has
twenty actual DATA tests passing, including 78 invalid-event refusals and zero
caller hooks. Those tests pass DECLARED process messages and termination
observations. They spawn no child, send no signal and open no database.

The [native supervisor source](../qualification/recovery-crash-cutpoint-supervisor.draft.mjs)
passed a syntax-only check. It has not been imported or run. Its hardwired
committed-intent child program does not yet exist, and its complete native
source profile and managed launcher are not completed.
This draft therefore cannot claim a runnable or qualified native crash test.
See the [separate local result](../qualification/recovery-crash-cutpoint-protocol.actual-local-result.json).

## Implemented coordination contract

The protocol fixes independent original checkpoint/request commitments before
dispatch, then requires an explicit committed-backend/before-response cutpoint
while the original owners remain open. It allows only one selected seed kill
request. A normal exit, different signal, missing stream EOF or open IPC channel
cannot satisfy that cutpoint or authorize the recovery phase.

A distinct owned recovery process must preserve original commitments, show the
same principal files and increment the owner epoch once. It cannot dispatch,
sign, create a response observation, spend again or interpret backend
`CACHED_SUCCESS` as current client authority. Persisted quarantine and the
payer's `CHILD_UNKNOWN` outcome remain UNKNOWN even if its one native SQLite
close returned. Completion is only `DECLARED_PROTOCOL_COMPLETE` in the pure
protocol; its inputs do not authenticate native events.

The supervisor source wires that protocol to actual Node ChildProcess
observations. It has no command-line or import-time execution entry. It pins
the hardwired child and private profile, starts no replacement process,
captures bounded stdout/stderr in memory, and observes exit, pipe EOF and IPC
disconnect separately. A setup/send/admission failure retains the SAME child
observation handle and requests at most one failure stop for that owned child.
Signals target only the two ChildProcess objects, never a caller PID or process
scan. It does not force-close or delete store/child evidence.

Per-child capture limits are 65536 stdout and 8192 stderr bytes; capped output
is incomplete. Messages are capped after native IPC parsing, not by an OS
memory limit. The 45000 ms application observer timers are not hard OS
lifetime, signal-delivery or cleanup guarantees. The future parent launcher
must bound and preserve its own actual command outcome independently.

## Still required, not covered by the twenty tests

Complete the actual committed-intent child and a closed current source graph.
The child must use the real x402/native HTTPS/V6/selected-grant application
components and assert the durable cutpoint, retained originals, no double
debit/dispatch, persistent uncertainty and owned closures.
The two principal database identity checks do not remove the full application's
other required stores, sockets or owners. Interface events, a smaller SQLite
demo or the old normal-exit recipe must not substitute for that final graph.

The independently retained original witness is private test input, not an
authenticated funding/grant record. It must be constructed before dispatch and
must not be learned anew from the recovery database.
The child must admit its complete pinned profile BEFORE effectful imports.
The supervisor's environment labels and source hash arguments are not approval,
a native namespace proof or an OS/network sandbox.

Only after that source/launcher review can a separately authorized finite
native attempt be considered. This two-child/IPC/SIGKILL scope is distinct from
the pending single-process issued/grant V3 clean selection.
No earlier consumed or pending native allowance authorizes it.

The existing V3 manifest, all 117 application rows and five control files remain
unchanged. Main, hosted CI, default buyer/signer, protected historical evidence
and storage roots were not changed by this work.
Full P2, real crash/reopen/native cleanup, physical durability, service delivery,
live pilot and production remain unqualified.
