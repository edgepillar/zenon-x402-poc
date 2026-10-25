# Private pacing timer source DATA

The genuine paced source owner now has a separate opt-in export,
createServiceCreditCapacityPacedWorkloadOwnerCoreWithPrivateTimerTrace. It adds
captureTimerEvidence to the existing private timing API. The ordinary factory,
the earlier private factory and their report/capture layouts remain unchanged.

Actual local result: **212/212 DATA controls passed**, including all 163 prior
regressions and 49 timer controls. The
[result](../qualification/service-credit-capacity-paced-timer-trace-data.actual-local-result.json)
pins the exact changed producer, new checker, selected entry and import closure.
This is source-DATA execution, not native timer, SDK, SQLite or capacity proof.

## Producer and independent arithmetic

The [actual owner](../src/service-credit-capacity-paced-workload-owner-core.js)
records bounded ARM, ARMED, FIRE and CANCEL calls at their real source seams.
Ordinals replace raw host tokens. Each row anchors to the current paced event
sequence; arm/fire timestamps reuse the existing accepted monotonic clock
observations. No extra clock, scheduler, cancel or source call is made.

The [checker](../src/service-credit-capacity-paced-timer-trace-data.js) runs the
genuine paced/parent arithmetic once, then walks the existing paced events and
new timer rows without copying either trace or the whole input tree. It checks:

- The one logical slot transitions through registration, return and fire/cancel.
- Every arm has a queued original and a due time anchored to the previous actual
  dispatch plus the configured minimum gap. The requested delay is rounded up.
- A fire cannot precede that due time. When a queued original remains, the
  immediate next dispatch must use the exact observed callback time, not a
  historical catchup slot.
- Ordinals, anchors, row limits, terminal completeness and the reported timer
  count agree. An in-bound timer-count edit accepted as a declaration by the
  older checker is rejected without matching new raw DATA.
- Registration-stop reentry retains the exact late token cancellation; clock
  reentry can withdraw all work before a fired callback dispatches anything.

The new factory checks its completed capture before resolving a clean measured
result. A mismatch downgrades it to HELD_UNKNOWN. Synchronous/refused registration,
uncertain cancellation and unfinished source observations retain UNKNOWN evidence.
A late callback or source completion cannot repair a cached final capsule.

Maximum timer rows are 4 * maxSamplesPerPhase + 1, at most 16,385. Ordinary
successful timers need three rows each plus one finalization row. The larger
bound also retains early-delivery diagnostics. These are logical DATA limits,
not heap-byte, event-loop scheduling, physical cancellation or OS guarantees.
The stress case retains all 4,080 genuine source-DATA calls and 12,238 timer
rows. It does not substitute truncation, a smaller workload or a benchmark claim.

## Qualification and evidence limits

The first source-bound selection passed 208 cases. Its output reader initially
expected TAP while Node's default reporter emitted spec. The complete same
capture was reconciled without executing Node again; two existing signed-zero
cases share one displayed name and both terminal rows were retained. Four
additional reentry/deadline controls were then added and the final exact source
passed all 212 cases. No application test failure was hidden by that correction.

The two commands used Node 24.19.0 on darwin/arm64, exact read-only source grants,
no addon/file-write/child/worker grant and bounded capture/supervision. No source
or package tree was copied, no qualification scratch/root/task was created and
no manager, SDK, x402 core, SQL, key, signature, nonce search, socket or application
child ran. The Node permission model is not an OS/network sandbox. Command wall
times include virtual-time stress work and are not throughput measurements.

A matching trace remains caller-declared DATA. A cancel function returning
undefined is not proof that its physical timer disappeared. Clock authenticity,
post-stop ledger duration reconstruction, physical resource release, sustainable
capacity, chain/economic acceptance and production remain unqualified.

Frozen unpaced R4 inputs and earlier results are preserved. The existing paced
native launch/profile declarations still pin the previous owner source; this
batch does not rebind or execute them. The earlier 15-case full source-pipeline
result remains pinned to its original candidate, not relabeled for this change.
Native use of this export requires a separately reviewed current source/profile,
capture/resource binding and finite execution scope.

The unchanged main CI lane contains 27 selected DATA/component controls, not
these 212 controls. All unchanged selected dependencies and the 163 prior
controls are identical on main and development. The five reviewed component
paths are independently eligible for a small main transfer. This changes the
paced source owner, not the SDK/SQL/native application or default buyer. The
four pending native runtime edits, package, workflow and native allowances are
not included. A new main commit still needs its own unchanged CI result.
