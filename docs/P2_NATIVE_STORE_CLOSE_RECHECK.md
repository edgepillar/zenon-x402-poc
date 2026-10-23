# P2: recheck native custody at the real store-close boundary

Status: **AUTHORED / NOT PARSED OR EXECUTED**, 24 October 2026.
This is a source-level ownership change, not a passing native, SDK, SQLite,
V4 composition, crash/reopen or current-main CI result.

## Source gap and implemented path

The earlier V3 close coordinator joins read close and the public operation,
then admits payer close. Its source guard checks intrinsic/descriptor
invariants. The actual payer can still await a local operation or attempt
lifecycle before entering its synchronous SQLite-store close. An earlier
coordinator check is not a fresh resource check after those waits.

The new opt-in path connects the actual native funding factory to actual
original-funding submission V4 and actual guarded payer V2. It reuses the
existing preparer, original signed checkpoint/pins, V6 store, funding client and
read-close coordinator. No alternate store, fake preflight, external factory,
default buyer cutover or replacement transaction is added.

The coordinator rechecks its private guard before and after payer close. The
actual guarded payer also rechecks **after its own operation joins**, immediately
before its real store-close call and immediately after that call returns. No
await separates the pre-entry guard from the store-close call.

The native factory's guard is closed over its actual funding transport and
joined read session. It requires the funding owner's current CLOSED,
non-unknown, zero-request/socket/timer state and its returned close/material
release observations. It also checks all three joined-read close-contract
results. The native factory accepts no caller-provided guard option. The lower
V4/V2 APIs accept an explicitly trusted source-owned synchronous capability;
a declared callback or literal true is not native authentication.

Joined-read inspection is aggregate contract DATA, not a new direct observation
of every native read handle or an independently authenticated late-error
subscription. This change does not close that remaining qualification boundary.

## Refusal and ownership semantics

| Boundary | Source behavior |
| --- | --- |
| Guard refuses before real store close | Cache a rejected close, quarantine the payer and retain the exclusively owned open store. Never call store.close as fallback. |
| Real store close throws | Preserve uncertainty; method entry does not prove whether the native handle closed. |
| Guard refuses after real store close returned | Reject close and retain uncertainty, but never claim the already-returned close left an open HELD handle. |
| Guard returns literal true on both sides | Permit the existing CLOSED contract result. This is not OS drain, delivery or payment-success evidence. |

The guarded payer reserves and prehandles its public cached close Promise before
calling a guard. Synchronous guard reentry therefore receives the same Promise,
not another close attempt. Only literal true is accepted: false, thrown errors,
Promises and thenables refuse without awaiting or reading a then getter.
Late true cannot repair a cached refusal or reset ownership.

Guarded payer V2 adds a read-only inspectClose view: phase, quarantine, close
stage, guard-refusal boundary and whether the actual store-close call was
entered/returned. It reads no database and exposes no payment, endpoint, key,
certificate or raw diagnostic. V4 forwards this bounded view through its
existing original-funding inspection. Call entry/return is source/API evidence,
not independent physical-finalizer proof.

The original payer selection and V1/V2/V3 submission entry points do not enable
the new guard. Their prior public method selection remains separate, as does
the original error-code table; V2 adds its own code table. Shared source bytes
did change, so old qualification records remain tied to their historical
inputs, not relabeled as current-source passes.

## Five authored cases, zero executed

The selected fixture uses the genuine guarded payer and genuine new V6 stores,
not source copies or store substitutes. Its guard callbacks are deliberately
synthetic DATA. It is guarded before SDK/SQLite application imports and is
not selected by the default test runner.

1. A clean guard reenters close and gets the reserved cached Promise; the actual
   store-close boundary is checked on both sides.
2. False before store close keeps the genuine store owned/open; changing the
   callback to true cannot repair the cached rejection.
3. A real empty-V6 recovery transaction reenters close, then changes the guard
   to false. The payer must recheck after joining recovery, not trust earlier
   close admission.
4. A thenable guard result refuses without reading its then getter or closing
   the store.
5. False after the actual store close returned rejects rather than reporting
   CLOSED, while the inspection truthfully distinguishes the returned close
   from an open HELD store.

The intended selection would create five new synthetic SQLite files and use
one empty recovery transaction, zero reopens, keys, signatures, nonce searches,
fetch entries or sockets. It imports the existing SDK graph but does not select
a signing/preparation operation. No matching execution profile or native
command was launched here. Intended counts are not observed results.

Six read-only literal-source controls matched constructor names, guard
placement, cached-Promise reservation, literal-true/no-thenable handling,
private guard forwarding and the five authored cases. These are not JavaScript
parsing, binding execution, behavior tests or qualification.

## Publication and remaining gates

[The scoped source branch](https://github.com/edgepillar/zenon-x402-poc/tree/x402/p1-router-late-pending-close-integration-v2)
contains the three implementation changes, five-case fixture and pinned
source-review record. Main receives this explanatory document only; it does
not receive the guarded payer, V4 factory selection or unexecuted fixture.
The default buyer, package/lock files, workflows, other branches and open PRs
are outside this increment.

The preceding [native TLS failure report](NATIVE_FUNDING_POST_LOOPBACK_TLS_RESULT.md)
is unchanged: two authorized attempts were consumed, one native BOUND case
failed, and the remaining three did not enter. This P2 change neither diagnoses
nor repairs that failure and does not authorize a third TLS attempt or a new
SDK/SQLite run. No new native command, task-storage root/task, database, download,
archive, process kill or cleanup occurred in this source-only increment.

A future exact-profile qualification must cover the new actual payer boundary,
the V4/native composition, current native read/funding observations and the
original signed checkpoint under uncertainty. Keep historical V3/positive-work
results separate. Forced interruption, lost ACK, HELD-store restart, real
provider authority, economic pilot and production remain unqualified.
