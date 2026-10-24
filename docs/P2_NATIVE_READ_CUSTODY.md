# P2: current native read custody and retired-error latch

Status: **shared leaf component 5/5 PASS; native integration parsed source only**,
24 October 2026. No native read owner, retained session, V4 composition, SDK,
SQLite, request, socket, signature or nonce search was executed in this increment.

## Source integration

The preceding [store-close recheck](P2_NATIVE_STORE_CLOSE_RECHECK.md) joined
read-close contract DATA with the funding owner's current snapshot. The new
explicit retained-read V2 path also captures an inspector directly from each
actual native read owner. The same actual exchange/close functions and existing
78/78/18 budgets are forwarded to the existing read-session core; no owner
factory, new route, limit reset, request re-encoding or success wrapper is added.

The low-level core retains its public exchange-plus-close shape. Its explicit
six-argument internal selection delivers the frozen inspector only to a frozen
source-owned sink, only for the two retained profiles. Legacy four-argument
selection and the separate five-argument funding policy sink keep their
grammars. Existing retained V1 wrappers keep their old public shapes.

The actual native inspector reads the owned generation's request, response,
socket, agent and timer references, close-request/settlement flags, uncertainty
and retired-error state. It contains no URL, headers, body, certificate, key,
error object or raw diagnostic.

Uncertainty yields null counters, **not zero**. Retiring an uncertain generation
and clearing references cannot manufacture a clean-close verdict. Observed
intrinsic drift is latched even if descriptors are later restored. Inspection
may record that uncertainty, but opens no resource, consumes no request,
starts no cleanup and grants no retry.

Retained session V2 returns three direct private inspector views in fixed order:
first DP, second DP, account. The native funding factory's existing V4 guard now
requires both the aggregate close-contract result and every current native
view: requested/settled close, no uncertainty/late error/active generation,
observed close and strict zero tracked references/timers. Null is rejected,
not coerced to zero. The genuine guarded payer still rechecks immediately
before/after the real store-close boundary.

These counters describe **owner-observed references**, not every OS handle.
An event-level close observation is not physical-finalizer, host cleanup,
authenticated chain identity or service-delivery proof.

## Late errors after retirement

The actual shared leaf retains one boolean and exposes only frozen onError
and isLatched functions. The native retirement path installs the same per-owner
onError function on retired request/response/socket/agent error events.
It retains neither the owner/generation/handle nor an Error or its fields.

The selected native core checks this latch before further exchange admission,
during its existing clock/close checks and before accepting a retired response.
Unexpected late socket/response observations also latch uncertainty. A previously
fulfilled close Promise is historical settlement: it cannot be revoked, but
the current inspector and V4 close guard must refuse on the latched error.
No reset, re-sign, replacement, forced close or store reopen is introduced.

Legacy selections keep their original stateless retirement handler. Shared
source bytes did change; old qualification records remain historical.

## What actually ran

One direct Node 24.19.0 darwin/arm64 command imported the **actual production
leaf**, its test and root package metadata. Five selected tests passed, with
zero failures, cancellations, skips or TODOs:

1. Inert frozen capabilities and no reset surface.
2. Error-data getters are never read, and the true state is permanent.
3. Proxy event-argument traps are untouched.
4. Independent per-owner latches ignore the emitter receiver.
5. Invalid factory/inspection arity refuses without clearing uncertainty.

These are declared event arguments, not real native events. The leaf has no
imports or SDK/SQL/network/timer/Promise implementation. This result does not
prove event wiring, retirement timing, socket release or the integrated guard.

Five Node --check commands parsed the four changed files: native core, retained
owners, session and full native funding factory. A reviewed sticky-rejection
correction in the core was rechecked once; the earlier parse is historical,
not relabeled to the corrected bytes. These commands did not import or execute
their application graphs. Their empty output and exact source pins are
recorded separately from the five component cases in the
[actual local result](../qualification/native-read-retired-error-latch.actual-local-result.json).

The bounded captures are complete: unit stdout 1,242 bytes, empty stderr;
all syntax streams empty. Source/runtime identities were checked before/after.
File/child/addon permissions, exact read grants, disabled compile cache and
cleared injection variables were used. These are not an OS/network sandbox.

No package download, extraction, source-copy tree, archive, new managed root,
task, database or qualification scratch was needed. The shared listener/boolean
design avoids retaining an owner graph or error payload per late event; native
heap/finalizer behavior and sustained performance were not measured.

## Publication boundary and remaining work

Main receives only the exact tested leaf, its five-case test, actual component
result and this document. The native core, retained-owner/session V2 and V4
factory changes stay on the
[scoped source branch](https://github.com/edgepillar/zenon-x402-poc/tree/x402/p1-router-late-pending-close-integration-v2),
with a separate source review. Default buyer behavior, packages, workflows,
other branches and PRs are not changed.

The previous funding POST TLS result is still failed: two authorized attempts
consumed, one case failed, three not entered. None was rerun here. This
component result does not expand any native HTTPS/SDK/SQLite/signing allowance.

Actual current native-read event timing, full V4/resource/store composition,
forced interruption/lost ACK/HELD restart, current-head CI, operator/provider
authority, economic pilot and production remain separate, unqualified gates.
