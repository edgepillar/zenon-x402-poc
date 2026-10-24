# Independent paced timing DATA checker

Status: **155 selected DATA controls passed**: all prior 75 current-source
regressions plus 80 new checker controls. This is runtime source integration,
not native authentication, sustainable throughput or a pilot acceptance.

The [checker](../src/service-credit-capacity-paced-timing-trace-data.js)
exports checkServiceCreditCapacityPacedTimingTraceData. It imports only the
genuine independent parent checker and a builtin type inspector. It never
imports or replays a recorder, SDK, SQL store, transport or source lane.

## Independent inputs and genuine runtime selection

The input has exactly three frozen own-DATA fields: trace, report and expected.
The expected object has the complete original source plan, recordingLimits,
laneCount and minimumStartGapMs. The actual private
[paced owner](../src/service-credit-capacity-paced-workload-owner-core.js)
captures these independently from its source configuration, not from returned
measurement DATA.

When private evidence otherwise looks complete, the genuine owner calls the
actual checker before resolving its result. A mismatch downgrades the outer
report to HELD_UNKNOWN with PRIVATE_TIMING_CHECK_UNKNOWN and retains the raw
capsule as UNKNOWN. No response, retry, re-sign, replacement or resource-release
authority is created. The ordinary factory is not opted into this check; its
three-method API and healthy ordinary/private result equality are preserved.

The positive producer integration ran in this selection. The mismatch-downgrade
branch is source-authored/reviewed; it was not exercised by injecting a fake
verifier or replacing the genuine application source.

## What is independently reconstructed

The checker validates strict frozen objects, exact fields, primitive types,
canonical bounded decimal timestamps and caller-bound plan/limits. It then
reconstructs request ownership, per-lane ordinals, FIFO order, queue peaks,
minimum actual entry gaps, withdrawals and original source outcomes.

Every queue and dispatched-source recorder field is recomputed: complete/empty
state, entry/settlement counts, successes/rejections, pending counts, peaks,
nearest-rank p50/p95/p99, successful versus terminal denominators and full spans.
The genuine existing core checker independently validates its complete parent
recorder. Measured core beginnings are ordered against paced reservations;
source/withdrawal times must lie within the corresponding genuine logical
operation brackets, and outcomes must agree.

A shifted paced clock can preserve all local durations and gaps and still fail
this core correlation. Likewise, internally matching rejected source metrics
cannot replace successful original core outcomes. These are DATA consistency
checks, not proof that any real source callback, account, node or child existed.

## Important limits remain explicit

| DATA | Treatment | Not established |
| --- | --- | --- |
| Queue/source metrics and core parent recorder | Independently reconstructed | Authentic native execution, SQL or L1 latency |
| Timer count and fixed maximum-known-live-slot field | Strict finite declared bounds | Independent timer-event observation or physical timer absence |
| Post-stop ledger durations | Strict declared type/count/range/order bounds | Independent duration recomputation or chain evidence |
| Close/window/balance bookkeeping | Consistent declared source shape/counters | Authenticated balance correctness or physical resource release |
| Caller expectations | Independent source-config binding | Caller/run/source-graph identity authentication |

The returned fixed material-free verdict explicitly sets timerEventsIndependentlyRecomputed,
postStopLedgerDurationSeriesRecomputed, callerExpectationsAuthenticated and
runOrNativeSourceContextAuthenticated to false. In-bound timer-count changes
remain declarations; a selected control demonstrates this limitation rather
than calling them independent proof.

Unknown traces, unfinished/late-completed HELD evidence, missing expectations,
wrong plans/lanes/gaps, extra fields, coercion, reordered requests, false
percentiles/counters, premature/fake terminals and unbounded input refuse with
one fixed error. Getters and proxies are not invoked and errors never echo
private input or exception material.

## Bounded in-place work

There is no full input-tree copy. The checker visits at most 1,000,000 DATA
nodes, depth 32, 30,000 entries per array and 65,536 code units per printable
ASCII string. Actual requests/distributions remain bounded by at most 4,096
recorder samples, and the FIFO is bounded by at most 16 source lanes.

Only derived request bookkeeping and duration series are allocated. All-success
paths sort one duration distribution and share its summary. A separate bounded
successful subset is needed only after the first rejection. No raw event array,
source tree, package, file, database or task-storage object is copied or created.
These are logical limits, not heap-byte, elapsed-time or OS/network guarantees.

## Actual selected evidence and provenance

The [new selected entry](../qualification/service-credit-capacity-paced-timing-trace-data.behavior.mjs)
imports and runs the prior 75 controls against the changed owner and actual
checker, then adds 80 positive/rejection controls. It uses genuine source
factories, recorders and the existing core checker with explicit DATA clocks,
timers, balances and Promise callbacks. A real post-stop declared-ledger
capability is exercised as source DATA, not SQL or chain execution.

The [actual result](../qualification/service-credit-capacity-paced-timing-trace-data.actual-local-result.json)
pins all ten selected source inputs and complete output digests. All 155 passed
without failures, skips, cancellations, TODOs or stderr. The command took about
1.37 seconds, including a 4,080-call virtual-time stress case. This duration
and virtual timeline are not a capacity or throughput benchmark.
The first passing 155-case selection is retained separately. Its input test
reconstructs from one bounded byte replacement: only the source spelling of
the same negative UTF8 vector changed to an ASCII escape. The current selection
reran on the exact final source bytes; no old result was relabeled.

The prior [75-case result](../qualification/service-credit-capacity-paced-private-timing.actual-local-result.json)
is byte-preserved at its
[immutable 0c02c927 baseline](https://github.com/edgepillar/zenon-x402-poc/commit/0c02c92758b4c6b20fcaa6b50ddc18158f933810).
Earlier 47/56/111/49/175 source-bound results and native failure evidence are not
relabeled. The native R4 graph, all five launch controls and its effect ceilings
remain unchanged; that graph does not select this paced owner/checker.

No SDK/x402 package, SQLite, key, signature, nonce search, socket, application
child, manager task, private root, qualification scratch, installer,
source/package copy, historical cleanup or automation ran. The unchanged hosted
profile remains 27 selected DATA/component cases and does not run these 155
controls. Native capture sizing, same-ledger pressure, authenticated native
balance correctness, economic/provider acceptance, pilot and production remain
separate open gates.
