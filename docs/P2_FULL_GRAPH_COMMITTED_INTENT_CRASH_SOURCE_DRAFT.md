# Full-graph P2 committed-intent crash: source draft

This document retains the child-source milestone. The later private profile
builder, managed launcher, 52 DATA tests and separate read-only results are in
[the managed-launcher draft](P2_MANAGED_CRASH_PAIR_PROFILE_AND_LAUNCHER_DRAFT.md).
Neither milestone is a native crash execution result.

## Current evidence, 2026-10-24

The actual application child, separate grant-operator fixture, closed namespace
preloader and owned supervisor are now authored. They are **not imported or run**.
All four current files passed Node 24.19.0 syntax-only checks.

The versioned [V2 protocol](../qualification/recovery-crash-cutpoint-protocol-v2.js)
has **24 actual DATA tests passing**, including 92 invalid-event refusals and
zero caller hooks. Its process messages, PIDs and termination events are
DECLARED input. No child, signal, SQLite, SDK, x402 package, key/signature,
nonce search or socket ran in those tests.

See the [source-bound result](../qualification/recovery-crash-full-graph.source-review.json)
and [complete source inventory](../qualification/recovery-crash-full-graph.source-inputs.json).
The earlier [V1 result](../qualification/recovery-crash-cutpoint-protocol.actual-local-result.json)
and its twenty tests remain unchanged; they are historical evidence, not the
current child's test result.

## Actual application chain in the source

The [child](../qualification/recovery-crash-committed-intent.child.draft.mjs)
uses the existing real issued-funding HTTP application, native HTTPS transports,
official x402 objects, bounded DP preparation/signing and V6 original-payment
custody. Its provider/settlement/chain callbacks remain synthetic, not
authenticated node, provider or publication evidence.

The new
[grant operator](../qualification/issued-funding-post-native-crash-grant-operator.fixture.draft.mjs)
retains the original operator's actual fixed two-unit service cost. It does not
change the application to satisfy V1's earlier one-unit example. A successful
service execution must leave eight available units out of ten.

Funding originals and independent checkpoint pins are retained and acknowledged
by the parent **before funding submission**. The service original and its
existing capability proof are independently retained and acknowledged **before
service dispatch**. The parent cannot predict a transaction hash generated
later inside the seed. Recovery must use those retained original bytes, not a
new trust root learned from recovery SQLite.

The selected interruption point is the real service store's
`completeDurableExecution` transaction: native COMMIT returned, terminal backend
success/debit is durable in the local SQLite interface, but the client has not
observed a service response. The fixture uses the store's existing afterCommit
test hook. It never reenters that guarded store. Separate bounded read-only
native SQLite handles inspect the actual principal files.

At that point the seed sends its committed summary and uses a bounded 5000 ms
main-thread wait without a Worker. If the selected signal does not arrive, it
fails; it cannot return from the hook and report the cutpoint as a success.
The seed's actual application, RPC, service/payer and socket owners are still
open, not gracefully closed to imitate an abrupt death.

The [supervisor](../qualification/recovery-crash-cutpoint-supervisor.draft.mjs)
admits each child's boot namespace before sending initial input. It retains one
owned seed object, requests SIGKILL once at the selected cutpoint and requires
its matching terminal signal, complete pipe EOF and IPC closure. Only then can
one distinct owned recovery child start. Setup or observation failures preserve
the same handles and evidence; there is no replacement attempt or PID scan.

Recovery uses the real no-dispatch V6 backend recovery client on the SAME
`native-issued-service.sqlite` and `native-issued-payer-v6.sqlite` files.
It requires the exact funding checkpoint/pins, original request, dispatch
intent, zero response observations, unchanged backend envelope and payer
metadata except one owner_epoch increment. Cached backend success cannot
clear persisted custody UNKNOWN, authorize dispatch/signing, prove delivery
or upgrade the cached CHILD_UNKNOWN close. The backend store remains borrowed
until its explicit single close.

These are implemented source assertions, **not observations from a native run**.

## Full namespace, without a smaller substitute

The inventory physically matches 130 application inputs and all 404 existing
package inputs: 4,710,510 bytes read in place, with no copied package tree or
qualification scratch. All 117 baseline application rows are mandatory and
unchanged. The thirteen additions include the new child/operator/preloader,
the baseline manifest itself and the real recovery-reader dependency chain.
Three separate protocol/supervisor control inputs are pinned outside the
child namespace.

The [preloader](../qualification/recovery-crash-full-namespace.preload.draft.mjs)
requires those baseline rows before effectful imports. It admits only declared
source URLs and the existing package versions, with two explicit Noble edges
for the new child. It has no source transformation, load hook or native builtin
alias. The 128 JavaScript-file literal source scan found 600 import occurrences,
no non-literal import expression and no unresolved declared literal edge.
That static superset does **not** prove runtime resolution or ordinary installed
namespace compatibility. The future native resolve guard must still enforce
the complete selection at execution.

Private source URLs, filesystem identities, raw funding/proof material and
process outputs do not belong in this public inventory. The private profile
builder and managed parent launcher are not yet completed. The supervisor has
no command-line/autostart entry; a flag or source hash is never execution
authority or an OS/network sandbox.

## Remaining work and authority

Next implement and DATA-test the private profile builder and managed parent
launcher, including source/runtime/tool/mount identities, quota/reservations,
bounded complete parent output, owned process lifetime and failure preservation.
Do not replay an unchanged metadata check or consume an older allowance to
claim this native case.

Only after the full source and launcher review may a separate finite
parent/two-child/IPC/SIGKILL allowance be considered. It must explicitly account
for the full existing application, all stores and independent pins, synthetic
keys/signatures/nonce work, loopback connections, extra read-only handles,
bounded main-thread wait and owned failure stops. The pending one-process V3
clean selection is a different, unchanged scope; no prior allowance is reused.

No application default, workflow, historical native result or storage root was
changed. This work is a source-branch candidate, not a main or hosted-CI
qualification of the unexecuted native draft. Full P2 socket/HELD-store
composition, abrupt native recovery/cleanup, power-loss durability, real
service delivery, live pilot and production remain unqualified.

