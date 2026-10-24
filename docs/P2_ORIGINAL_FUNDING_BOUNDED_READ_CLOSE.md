# P2 original-funding bounded read/close join

Status: actual SDK/SQL/network-free component PASS (18/18). The changed actual V4
application connection is source-reviewed and syntax-checked only. It is not a
qualified SDK/SQLite/HTTPS vertical slice, current-head CI result, live payment
or production claim.

## Implemented behavior

The new `createOriginalFundingBoundedReadCloseCoordinator` wraps the existing
actual original-funding read/operation join and actual bounded-operation-drain
observer. It does not substitute copied implementations. Construction starts no
clock, timer, probe or caller callback. The cached, prehandled public close
Promise exists before read-stop reentry.

Start requests the owned read close immediately, including when the initial
clock/intrinsic checks refuse. Read close must fulfill `undefined`, the active
operation must settle, and the source resource guard must return literal
`true` before one funding-close callback can enter. Rejected operations are
joined without reading their raw rejection data or treating them as payments.

A private monotonic budget covers read close, operation join and funding close.
Pending callbacks cannot keep this public close pending indefinitely on a
responsive event loop. Expiry/refusal yields permanent UNKNOWN; late resolution
does not repair it, grant retry or authorize a new funding entry. Direct aliases
to the public close Promise are refused rather than awaited as self-dependencies.
A successful close stays cached after its budget passes; it exposes no further
funding-entry permission.

One owned completion Promise feeds the real bounded-drain observer. The tested
normal path invokes that probe once, instead of repeatedly polling BUSY. This
reduces redundant observation, but is not a measured performance claim.

## Actual V4 wiring: source and syntax only

On the source branch, the already selected actual V4 now uses this bounded join
with `Math.min(existing deadlineMs, 1000)`. No new configuration field, public
factory, clock/timer injection, quote, original packet, pin, signing or database
schema is introduced. V1/V2 legacy close and V3's previous join selection remain
unchanged by this diff.

The actual guarded payer receives a private composite guard: current bounded
permission, current native resource guard, then current bounded permission again.
The unchanged actual payer awaits its own local operation and active attempt,
then checks that same guard immediately before the genuine synchronous
`store.close` and again after it. Checking only at earlier coordinator admission
would not protect the boundary after those awaits.

That source chain was reviewed. Only the changed submission file was parsed by
one `node --check` command; neither its dependencies nor the actual V4/payer
graph were imported or executed. The 18 component tests must not be rebound to
that graph. The changed submission file stays off main.

An observed pre-entry budget veto prevents subsequent admitted entry. If funding
close has already entered, UNKNOWN cannot assert that the store stayed open,
cancel an underlying operation, undo a returned close or prove physical drain.
Use the actual payer's entered/returned/refusal-stage inspection; the component
explicitly reports `SEE_ACTUAL_PAYER_INSPECTION`.

## Actual local evidence

One direct Node 24.19.0 / darwin / arm64 component command completed with actual
exit 0, 18 tests, 18 pass, zero fail/cancel/skip/todo. It imported the new actual
coordinator, unchanged actual original join, unchanged actual bounded-drain
helper, and real Node monotonic timers. Resource callbacks were declared
in-memory data, not native handles or actual payer/store calls.

Coverage includes inert construction, strict input rejection without hooks,
single cached clean close, both pending joins, opaque rejection data,
never-settling read/operation/funding paths, permanent late-result veto, deferred
source-boundary permission, refused/throwing/thenable guards, three direct
self-dependency cases, reentry, bad start arity, intrinsic drift and cached success
after its budget. All 18 selected cases completed; no skipped case is counted.

The run used five exact read-only input grants, no filesystem write/child/worker
grant, disabled addons and compile cache, strict unhandled rejections, a bounded
15-second supervisor and 64 KiB capture per stream. Input/runtime identity and
bytes matched afterward. The supervisor's captures remain in the command record;
the public JSON retains counts, byte sizes and SHA-256, not private paths.

No actual V4, payer, SDK, SQLite, socket, key, signature, nonce, real PREPARE or
payment ran. No new task-storage root/task, scratch, download, archive or cleanup
was needed. Public source/test/result files are not disposable scratch.

Node timers do not guarantee exact callback timing or ordering. These checks are
cooperative, not an OS/CPU/hostile-code deadline or network sandbox. See the pinned
[Node 24.19.0 timer documentation](https://nodejs.org/download/release/v24.19.0/docs/api/timers.html#settimeoutcallback-delay-args).
No test duration is presented as a benchmark.

## Publication boundary and next gate

The source branch receives the new coordinator, its executed test/result,
this document and the changed actual V4 submission. Main receives only the new
coordinator, unchanged tested bounded-drain dependency, executed component test,
normalized result and this document. The existing original join and package pins
match main. The first read-only baseline refused the missing bounded-drain file
on main; no write followed that refusal. The exact executed dependency is now
explicitly included, not assumed present.

Review covers exact parent refs/trees, the selected diff, four open PRs without
target overlap, branch protections/rules and exact-parent CI. Both parents
currently have zero check runs/statuses/workflow runs; that is not green CI.
Only normal fast-forwards are eligible. No workflow, PR/comment, unrelated ref,
default buyer, payment or deployment change is included.

The separately versioned funding-only TLS profile, its 11 pinned input rows and
manifest remain byte-identical. Its old two native attempts remain consumed;
this change does not reset them, launch another native attempt or broaden its
pending one-shot authority. The profile does not import the changed V4 module.

Next qualification is the changed actual V4/read/native-client/payer/store graph
under its own reviewed source/launcher/effects scope. Existing source results,
one-file syntax, historical native runs, this component PASS or later publication
do not establish that qualification. P0/P1/P2 and the full roadmap remain open;
economic pilot and production remain unqualified.
