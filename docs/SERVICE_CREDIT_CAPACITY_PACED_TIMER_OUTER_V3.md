# Paced-timer outer-V4 DATA validator

Status: **151/151 actual local contract controls passed** on 2026-10-25.
The source-DATA producer and Python controls both exited 0 with complete streams
and empty stderr. No native adapter, SDK, SQLite, host timer, socket, signer or
application child was entered.

## Complete new layout, not an old-envelope view

The version-3 Python validator consumes the actual authored outer-V4 schema:
`PRIVATE_PACED_TIMER_NATIVE_CAPACITY_COMPONENT_CAPTURE_NOT_PRODUCTION`,
adapter report V3 and `pacedTimerData` envelope V1. Parent context remains
147 application + 404 package rows
(`0e0533ba2e3bfdf97b2670a0ee693c64ddc04ea93bf52b4e779d9d073cb51c90`).
Original child context remains 139 + 404 rows
(`d756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027`).

It compiles exactly three pinned, existing DATA controls: the unchanged child
writer/window arithmetic, timer resource plan V3 and independent Python timer
verifier V1. The frozen child control was already on main; no extra copy or
replacement legacy control is added. Historical outer validators, fixtures,
launchers and source declarations remain unchanged.

One strict compact JSON frame and its complete stream digests are required.
Floats, negative zero, duplicate decoded keys, extra frames/fields, incomplete
command output and failed/unknown exit declarations refuse. JSON escapes are
checked lexically without serializing another full decoded frame.

The new timer verifier is invoked once on the real timer capsule. It rebuilds
parent/paced/timer arithmetic and exact dispatch anchors. The outer layer then
checks every lane's original payer-command sequence, dispatch counts, private
stream EOF/byte/digest declarations, writer intervals and original-command
attribution. Logical pre-entry withdrawal never fabricates a child EXECUTE.

Balance raw events, scalar/check summaries and each lane's metric are rebuilt.
Callback terminals must precede the parent checks; final balance must follow
measurement stop. Child clocks are never aligned to, merged with or subtracted
from parent time. Whole writer brackets remain un-clipped, not pure SQL latency.

## Source-bound DATA coverage

The producer executes genuine paced owner, timer, writer-window/cohort and
balance helper sources with synthetic callbacks. Pair lifecycle, child exits,
private-stream EOF and command receipts are explicitly **synthetic contract
DATA**, not an actual native capture or independently authenticated evidence.
The native adapter is not imported/executed.

Seven accepted outer scenarios cover the baseline, the exact unreduced selected
default, one lane, sixteen lanes, two writer pages, withdrawal and pre-wait
withdrawal. Two negative frames retain genuine rejected/HELD source results:
complete synthetic child-close facts cannot upgrade either one.

| Selected check | Verified as DATA |
| --- | --- |
| Default plan | Two lanes, one warmup + four measured calls each; ten completed originals |
| Exact default plan digest | `cbbf3b62215473ea614867461eb27ceefc3c5478f6a70eeac781982ad5689a2f` |
| Default resource proposal | 71 MiB task / 72-second Node bound; not allocated or applied |
| Multi-page writer case | Two pages and 74 full intervals per lane; 148 total |
| Writer classification | All seven real helper window classes |
| Complete producer-to-Python input | 745,988 bytes; matching digest and full stdin |

The second writer page, original attribution and all clock hooks are retained;
the tests reject a corrupted second-page ordinal or missing attribution row.
Oversized proposals refuse before parsing/reinterpreting the capture. The plan
is not shortened, samples are not reduced, and no retry is authorized.

## Small-footprint qualification

One Node DATA command produces bounded JSON; one isolated Python DATA command
consumes those exact bytes via stdin. There is no intermediate fixture file,
workspace/package copy, ZIP or second controller-side fixture parse. Complete
success-stream byte counts, digests, actual exits and EOF/input-completeness
evidence are retained. The transient synthetic fixture is reproducible from
pinned sources and was not persisted as another capture file.

All 18 selected sources and 56 protected inputs remained unchanged. The separate
27-case hosted DATA/component CI profile, package files, workflows and default
payment path are unchanged. The 151 controls are local evidence, not hosted CI
coverage of this new Python validator.

## Remaining gates

This closes a selected outer-contract DATA gap, not native integration or
production acceptance. Receipt origin, actual child/command events, physical
owned-root admission, all other storage reservations, timer absence and storage
cleanup remain unqualified. Post-stop ledger duration series are still only
bounded declarations. No sustainable throughput, economic pilot or real payment
is established.

A versioned managed timer-parent controller must bind the real source, owned
roots, actual commands and complete receipts. Fresh exact finite native scope
and storage admission remain required. This result does not consume the original
unpaced R4 allowance, lower any storage floor or erase old evidence.

See the [validator](../qualification/native_capacity_paced_timer_outer_capture_data_v3.py),
[controls](../qualification/native_capacity_paced_timer_outer_capture_data_v3.behavior.py),
[source-DATA producer](../qualification/capacity-paced-timer-outer-contract-fixture-data-v3.mjs)
and [normalized result](../qualification/native-capacity-paced-timer-outer-capture-v3.actual-local-result.json).
