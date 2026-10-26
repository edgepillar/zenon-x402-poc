# Capacity refusal locations without private paths

A reservation capture failure previously exposed only its original error code.
With many managed stores, finding that observation boundary required another
inventory. The current controller now adds a bounded location projection to its
existing refusal event. It still stops at the original failure.

The projection contains exactly seven fields: diagnostic version, stage, store
index, store count, a SHA-256 digest of the validated store ID, an always-false
admission flag and authority NONE. Store indices follow that observation's
discovery order. The digest can be matched against store headers without
scanning task records again. It does not authenticate a store or persist a new
ownership binding.

The four stages distinguish reservation capture, independent reservation
recheck, store-metadata recheck and the final capacity predicate. Predicate
failures have no store index or digest. Earlier discovery failures can retain
the legacy refusal event without a location.

No path, project label, task record, original exception text or OSError filename
is copied into this projection. Only exact supported built-in exception types
are annotated. Projection validation rejects subclasses, malformed fields,
boolean integers, unsupported versions, extra keys and unknown authority
before entering custom hooks. Replaced exception attribute-map subclasses are
also rejected before get/set hooks. Returned dictionaries are detached DATA.

## Preserved behavior

Each wrapper re-raises the same exception object with the same arguments.
The CLI retains its original error code, error type, exit status and no-retry
flag. A successful capacity result and successful default CLI output are
unchanged. Diagnostic DATA cannot authorize an allocation, skip a store, alter
a reservation or start a native command.

The source comparison preserves every existing capacity require predicate,
the full reservation capture and independent snapshot definitions, the prefix
algorithm and capacity arithmetic. The native selection, storage preflight,
task/command/closure implementation and 10 GiB floor remain unchanged. The
174-application/404-package graph still has 578 parent rows and 567 child rows.

## Actual local source checks

All **360 complete pipeline tests pass**, including **29 new cases** for the
actual capacity wrappers and extracted real CLI error guard. These include
exception identity and arguments, OSError privacy, precise failure stages,
early and complete capacity refusal, detached output, malformed or hostile
projections, legacy errors and successful output.

The audit records zero child launches, sockets, SQLite calls, write opens,
outside-source reads and mutations inside the pipeline. The outer controller
runs two isolated Python commands: the pipeline and the real default source-only
CLI. Both exit zero with complete output. The CLI verifies the current 174
application sources without reading installed packages or entering native code.

The finished streams were reconciled without running them again: the outer
controller had incorrectly equated registration-list length with unique
unittest methods. Two duplicate registrations already existed in the prior
suite; all 359 unique current methods passed. The original outer-controller
postcondition failure remains retained separately.

The earlier [31-case reservation recipe at its original source](https://github.com/edgepillar/zenon-x402-poc/blob/abd2039565504ef9dce14d489fe4399ee208b303/qualification/native_capacity_reservation_capture.behavior.py)
and its result are retained. The per-task definitions it exercised are unchanged.
That module-pinned recipe was not rerun or rebound to this changed launcher.

Review also found that an exact built-in exception can have its attribute map
replaced by a dictionary subclass. The final guard rejects that map before any
get/set hook. One regression case was added, and a new 360-case pipeline plus
default CLI run passed. The earlier 359-case pass remains source-bound history.

A separate read-only operational check on the preceding source reached the genuine known-reservation
prefix refusal after an approved single-file preservation action. It did not
produce full storage admission, run a manager task or consume a native allowance.
Private operational paths and metadata remain outside these public artifacts.

## Reproduction and limits

Run from the repository root with the reviewed Python 3.12 runtime:

    X402_CURRENT_V5_PIPELINE_DATA_SELECTION=complete-v5-v6-matched-window-pipeline-data-only X402_CURRENT_V5_LAUNCH_MANIFEST_SHA256=c5d225462c4648016afbb85705267291f6a69c4f3a664234417f0ec7c7feae80 python3.12 -I -S -B qualification/native_capacity_current_offered_pipeline_v4.behavior.py

The [source-bound result](../qualification/capacity-refusal-location.actual-local-result.json)
records the exact changed sources and stream digests. This development-only
controller change is local source/DATA evidence. It does not qualify SDK,
HTTPS/SQLite composition, signatures, nonce work, crash recovery, native
EOF/close, real capacity or production. The unchanged 27-control hosted main
CI selection does not execute this suite. Main transfer remains separate.
