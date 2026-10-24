# Paired native capacity lane source draft

Status: source and syntax only, NOT EXECUTED. This adds the real service-side
application/RPC/grant flow and an actual Node-child pair supervisor. It is not a
runnable managed selection, native integration pass, capacity measurement or
production qualification. No additional native allowance was requested or used.

## Full actual application, not a replacement graph

The [service owner](../qualification/capacity-native-service-lane.owner.draft.mjs)
hardwires the existing ServiceCredit SQLite class, actual issued-funding native
application, native HTTPS factory, actual RPC fixture, observer store, provider
attestation and funding composition. It creates one fresh service/intake pair,
reads a real local HTTPS unpaid challenge, binds that challenge to the actual RPC
fixture and later opens the actual intake-created observer for the same original
payment. It commits a real synthetic provider envelope through the existing
observer/composition APIs and reads the resulting actual grant before admitting
service. No replacement SDK, SQLite/native alias, fabricated grant record or
paid response is supplied.

The fixed two-call fixture is not relabelled as load capacity. Credit units are
derived from the complete finite plan at two units per call, up to 256 calls.
Expiry checks use real wall time, not a frozen fixture clock. The local settlement
callbacks and declared chain pages remain synthetic: neither actual Zenon
publication/inclusion nor economic provider acceptance is established.

The [service worker](../qualification/capacity-native-service-lane.worker.draft.mjs)
receives only public payer/capability identity and the necessary original witness
over private IPC. It never receives the payer wallet's private key. It exposes
START, RETAIN, ACTIVATE, ARM, FINISH, BALANCES and paged TIMINGS commands plus
owned close/release control. FINISH reads the exact successful request and grant
from the actual store. Expected credit is checked independently against the
finite request plan; no success, debit or refund is inferred from a callback count.
Grant activation remains a separate actual composition operation after BOUND.

## Actual SQLite hook boundaries

The existing store already exposes beforeBegin, afterBegin, beforeCommit and
afterCommit hooks. The source binds those exact hooks; it does not patch the
store, replace the database or infer SQL latency from an IPC reply. The interval
before BEGIN through after COMMIT includes JavaScript, validation and identity
checks. Its inner afterBegin/beforeCommit interval excludes BEGIN/COMMIT calls.
Neither interval is labelled pure SQLite CPU or storage latency.

The recorder is bounded to `12 * totalCalls + 64` entries and pages at most 64
records per reply. A hook/clock/capacity failure poisons measurement and returns
undefined, rather than throwing into a financial transaction or forcing its
quarantine. Missing afterCommit leaves an incomplete observation; a later hook
cannot manufacture success. Nominal store reads also use BEGIN IMMEDIATE, so
post-call balance/request observations add real writer transactions. This
observer overhead must be reported, not hidden in a peak-throughput claim.

## Owned native process pair

The [pair supervisor](../qualification/capacity-native-paired-lane.supervisor.draft.mjs)
uses actual Node fork calls with fixed source entry/preloader paths and the same
pinned runtime as the parent. It accepts no child-process factory, wallet, store,
SDK or transport implementation. Payer and service each get a distinct managed
root and private profile. Separate processes respect the real RPC fixture's
single-owner limit; no module slot is reset or owner silently reused. The source
caps pairs at 16 per parent, with two children each, but no such children ran.
This topology and its memory/process overhead still need native measurement.

Funding follows the actual public identity, real issued challenge, bounded
reference search, payer preparation, independent original retention, original
commit/POST, actual grant activation and selected-grant handoff in that order.
The reference search does not rekey or renew its range after exhaustion. Service
commands reserve exact cohort/ordinal originals before dispatch and check actual
request/balance reads afterward. Private headers/checkpoints travel only between
owned processes, never stdout or public reports. Child output prefixes are bounded
and retained privately with completeness/overflow facts; the eventual managed
launcher must persist them through the approved storage manager.

Payer operation timestamps stay in the payer child's clock domain. SQLite hook
records stay in the service child's clock domain. Parent IPC arrival/round-trip
is a third observation and is never substituted for either native interval.
These sources are not yet wired into a qualified sustained-workload report.

## Close is not just a cached acknowledgement

Both workers now support RELEASE_IPC after the actual returned-close path. A
release waits for outstanding native send callbacks before its final reply and
child-initiated IPC disconnect. The parent does not cut the channel immediately
on receiving CLOSE. It separately observes disconnect, zero exit, stdio end and
ChildProcess close. A missing send, nonzero/signal exit, partial/overflow stream,
failed/hidden acquisition or unresolved operation remains UNKNOWN. Close is
cached before native work, does not reset uncertainty or replay an original and
attempts independent owned stops. A known-clean sibling can release its IPC even
when the other side is held; that never upgrades the overall result.

No arbitrary process is killed, no consumed V6 handle is directly closed/reopened,
and no original or historical storage evidence is deleted. Same-user hostile
processes and atomic filesystem/physical drain are not proven by these checks.

## Evidence and exact remaining gates

The [source result](../qualification/capacity-native-paired-lane.source-only-result.json)
records four current successful syntax checks. One earlier supervisor syntax
revision is preserved as superseded after adding bounded child-local timing
retention: five Node syntax commands total, not five runtime tests. The initial
batch hashed the runtime once for four checks. Checked code was never imported;
there were zero SDK, SQL, socket, key/signature, nonce, IPC, child or scratch effects.
The existing 43 DATA controls and successful main CI were not rerun for activity.

The [source delta](../qualification/capacity-native-paired-lane.source-delta.json)
references the immutable P1 baseline and historical payer inventory rather than
repeating all package rows. The earlier payer source pin is historical after the
IPC release addition; neither old record nor old P1/P2 selection is rewritten.
This delta is deliberately NOT a complete native admission manifest. Service and
supervisor namespace preloaders, exact managed private-profile materialization
and the finite launcher remain missing. They must preserve the full real P1
application/package graph, reject missing/replaced roots and never install fake
getters to run a smaller native graph.

Next are those missing controls and the genuine workload-coordinator adapter,
including asynchronous balance/observer costs and bounded process lifetime.
Only then can a full reviewed native effect/storage budget be presented for a
new finite approval. Functional, bounded-burst and sustained-load evidence must
remain separate. Main is unchanged in this increment: the unexecuted native
sources stay on the development branch. Pilot, measured capacity and production
remain NO-GO.
