# Native capacity payer-lane binding

Status: an explicit, default-off **source draft** hardwired to the actual P1
payer client. Its separate protocol has 40 passing local DATA controls. The
native owner passed syntax checking only; it was not imported or executed.
This is not a native workload, capacity result, pilot or production qualification.

## Concrete binding

The [native owner](../qualification/capacity-native-payer-lane.owner.draft.mjs)
imports the genuine DP/native funding-service client, V6 original-payment SQLite
store and checkpoint restorer at fixed source paths. It accepts no replacement
SDK, store, native client, fetch or owner factory. Existing application sources,
module slots, recovery profiles and historical evidence remain unchanged.

A new private managed scratch directory must already exist. The draft requires
one fresh `capacity-payer-v6.sqlite`, proves its initially empty V6 state,
observes the creator's returned close, then opens the same physical file through
the actual P1 client. It never adopts another database or creates a missing root.
The process-lifetime lane claim is reserved before native imports and never reset,
even after a returned close. Each future lane therefore needs its own process.

The actual method mapping is explicit:

| Lane API | Actual P1 method or boundary |
| --- | --- |
| `prepare(input)` | `prepareOriginalFunding`; retain the original packet before commit |
| `commit()` | `commitOriginalFunding` with the independently retained original pins |
| `submit()` | `submitOriginalFunding`; require the exact BOUND intake result |
| `bind(originals)` | `handoffToService` with the same checkpoint, selected grant and challenge |
| `execute({cohort, ordinal})` | `submitOriginal` for exactly one previously retained request |
| `close()` | Cached actual client close, without directly closing its consumed V6 handle |
| `inspect()` | Bounded material-free protocol and current native-owner observations |

BOUND is only intake acknowledgement. Grant issuance, economic acceptance,
backend activation, inclusion/finality and authenticated service delivery are not
inferred. A future parent must establish the actual selected grant and backend
admission before service dispatch. No signer, funding POST or original is rebuilt
or replaced after uncertainty.

## Original custody and local sequence

The [pure protocol](../qualification/capacity-native-payer-lane.protocol.js)
separates opening, preparation, commit, submission, binding and service calls.
Only one ticket can be active in a lane. Tickets are identity-bound, cannot be
cloned or borrowed from another lane, and reserve their ordinal before dispatch.
Warmup must finish before measurement. The complete plan is limited to 256 calls,
matching the actual native transport limit; it is never silently truncated.

Before commit, the native draft creates an exclusive private funding pin file,
checks the actual checkpoint against its independent binding/digest pins and
retains the original hash, challenge, signature header and serialized checkpoint.
Before the first service call, it separately persists the complete immutable
warmup/measurement originals manifest. Each request has a unique ID and the exact
existing two-unit, empty-body service profile. The DATA capture validates shape
and correlation only: it does not authenticate capability proofs or signatures.
The real client/backend remains responsible for those checks.

Both private pin files use exclusive creation, restrictive mode, file and directory
fsync, bounded reads and exact identity/content verification before later
admissions. Failure preserves the artifacts. These are cooperative filesystem
observations, not an atomic filesystem lease, hostile-process protection,
rollback resistance or crash/power-loss durability proof.

UNKNOWN permanently holds the lane. There is no automatic retry, new funding,
new proof, re-signing or ordinal reset. Close can be requested while a native
operation is pending; returned close is recorded separately and cannot erase
uncertainty or discard active accounting. The real client alone retains native
resource drain and consumed-store close ownership. A held protocol does not mean
that every physical handle is still open.

## Execution and evidence

The [selected controls](../qualification/capacity-native-payer-lane.protocol.behavior.mjs)
directly execute the real pure protocol on Node 24.19.0, darwin/arm64: 40 passed,
zero failed, cancelled, skipped or TODO. They do not import the native draft or
substitute fake SDK/native owners. Their proof-shaped strings are deliberately
unauthenticated DATA, not generated signatures.

The [exact-source result](../qualification/capacity-native-payer-lane.actual-local-result.json)
records source hashes, expected case names, actual exits, complete stream digests
and a separate syntax-only owner check. One earlier owner syntax check is retained
as superseded after a source-review hardening change; it is not added to the test
total. No SDK, SQLite, socket, key, signature, nonce, child, worker or native
application workload ran. No qualification scratch, task root, source copy or
package installation was needed. Command/test durations are not capacity,
transaction latency or sustainable throughput measurements.

The existing 27-case hosted CI selection is unchanged. It does not execute these
40 DATA controls or the native binding, even if its exact-main run succeeds.

## Explicit unfinished gates

The new `NATIVE_CAPACITY_PAYER_LANE_NODE24_V1` namespace preloader, managed
worker/parent launcher and finite native experiment are not implemented or
qualified here. The draft refuses a missing or mismatched current namespace
snapshot before importing effectful SDK/SQLite modules; it does not install a
fabricated getter or reuse another experiment's native allowance. Source/profile
checks do not grant human authority or provide an OS/network sandbox.

Next work is the full real-graph source/package preloader, isolated lane worker
IPC and actual parent application/RPC/grant orchestration. The existing workload
coordinator still needs a genuine lane adapter plus an independent real backend
balance oracle and actual local transaction boundaries. Do not time IPC arrival
as SQL latency or combine unrelated process clocks. Native load, abort/drain,
recovery, memory/disk accounting and measured capacity require their own reviewed,
approved full selection. P4 remains incomplete; pilot and production remain NO-GO.
