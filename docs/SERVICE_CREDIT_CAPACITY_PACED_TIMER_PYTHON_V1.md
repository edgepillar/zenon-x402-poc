# Independent paced-timer Python DATA verifier V1

Status: **118/118 actual local controls passed** on 2026-10-25.
The real JavaScript source-DATA producer and the new independent Python checker
both exited 0, with complete streams and empty stderr. This is not native SDK,
SQLite, HTTP, wallet or capacity execution.

## What is implemented

The new API consumes the genuine timer-envelope V1 directly: one raw paced trace,
its single nested parent trace and one raw timer trace. It does not construct an
old paced-envelope view, change a historical context, import JavaScript into the
checker or accept supplied successful checks as authority.

The complete parent/cohort/queue/source arithmetic is preserved from the frozen
`96d332f0a3e56edf03db54e47a078535d01a5e0665a3bf29834f582039cc0a99`
predecessor in a distinct raw-input implementation. The historical checker is
unchanged. Parent and paced arithmetic run once per validation; timer arithmetic
then cross-binds directly to those same original rows.

Timer reconstruction checks:

- Monotone event sequence and paced-stream anchors, bounded queue and one logical timer slot.
- ARM ordinal, due time tied to the last dispatch, and exact ceiling-millisecond delay.
- Registration before FIRE/CANCEL; FIRE no earlier than due and tied to the exact next dispatch observation.
- Known cancellation return, complete final anchor and independently derived arm/fire/cancel counts.
- Full caller-report and both supplied check summaries against the independently rebuilt results.

EARLY_FIRE, registration refusal, uncertain cancellation and finalized HELD data
remain refused. A changed late source outcome cannot upgrade the retained
snapshot. This is logical event DATA: it authenticates neither timer liveness nor
physical cancellation/absence.

## Source-bound cross-language coverage

The selected Node 24.19.0 source producer runs the actual paced owner/recorders
with synthetic Promise, ledger-observation, balance and virtual timer callbacks.
Python receives its exact complete bytes via stdin. The producer uses no host
timer, installed package, SDK, SQLite, key, signature, nonce, socket or application
child. Python imports only `re` in the checker itself.

Nine clean scenarios include mixed outcomes, delayed timer delivery, no timer,
withdrawal, pre-wait withdrawal, declared post-stop ledger observation, sixteen
lanes and the complete maximum component scenario. Four genuine UNKNOWN cases
cover early delivery, registration refusal, uncertain cancellation and late
completion after HELD finalization. Mutations cover shared-clock and dispatch
binding, omitted registration, false counts, reordered events, bounds, hostile
types and coordinated forged report/check fields.

| Maximum component scenario | Observed as synthetic DATA |
| --- | ---: |
| Source calls | 4,080 |
| Parent / paced / timer raw rows | 8,244 / 16,321 / 12,238 |
| Canonical complete scenario input | 3,278,178 bytes |
| All thirteen scenarios, exact produced stdin | 3,553,492 bytes |

This component-boundary case is not a native workload admission or throughput
measurement. The full outer native plan still has its own capture/resource
policy, which must refuse oversized proposals rather than reduce samples.

## Avoided scratch and repeated work

The producer stream is capped at 8 MiB, transferred in bounded chunks and
independently digest-bound to Python's complete stdin. The controller does not
parse a second fixture tree. No intermediate fixture JSON, copied source/package
tree or ZIP is written. The successful synthetic fixture is reproducible from
pinned sources; its complete stream digest, byte count, actual exit and EOF
evidence are retained instead of persisting another multi-MiB fixture.

The maximum-input non-mutation check hashes canonical encoder chunks rather
than making another deep input copy or joined JSON buffer. The validator walks
the bounded original tree and derives its own working series; it does not copy
the whole capture. This is not a peak-heap or OS quota guarantee.

All eleven selected sources and 51 protected inputs remained unchanged.
The 118 local controls are separate from the unchanged 27-case hosted
DATA/component CI profile.

## Open gates

The complete outer-V4 command, child streams, balance and writer verifier is
still separate work. Its real timer capsule must be integrated without an old
outer-envelope facade. The versioned managed launcher, physical owned roots,
all-reservation admission and fresh exact finite native authority remain open.

Post-stop ledger duration series, authenticated clocks, native integration,
sustainable capacity and pilot/production readiness are not established. This
change does not activate the development native graph or alter default payment
behavior, historical native allowances or cleanup authority.

See the [checker](../qualification/native_capacity_paced_timer_envelope_data_v1.py),
[controls](../qualification/native_capacity_paced_timer_envelope_data_v1.behavior.py),
[source producer](../qualification/capacity-paced-timer-cross-language-fixture-data-v1.mjs)
and [normalized result](../qualification/native-capacity-paced-timer-envelope-python-v1.actual-local-result.json).
