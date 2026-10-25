# P2 bounded-drain Promise integrity

This change fixes the actual bounded-drain runtime component. The selected
tests use synthetic probe callbacks and real short Node watchdog/backoff
timers. They do not import a native transport/application owner, SDK, SQLite
store, x402 package, wallet, signer or nonce producer.

## Reproduced behavior

The old helper returned `true` when a native probe fulfilled with `DRAINED`
while either `Promise[Symbol.species]` or the inherited
`Promise.prototype.constructor` had been replaced by a getter. In each of
the two isolated actual cases, that getter was invoked once. Descriptors
were restored before the test observed the public result.

The helper is used at funding/operation close joins. These isolated results
do not demonstrate that any real store, socket or native owner was released.
They identify an incomplete supported-Promise boundary, not a live-payment
or cross-process exploit result.

## Correction

The helper captures the native Promise `then`, `constructor` and species
descriptors. It refuses observed drift before admission, again after a probe,
during a pending completion or BUSY backoff, and before publishing a successful
result. A substituted getter is not used as an observation mechanism.

Both normal and invalid-input return promises pin their own non-enumerable,
non-writable and non-configurable native constructor, without invoking an
inherited getter. Existing supported native probe promises, including an own
data constructor with mutable descriptor flags, keep their prior meaning.

The existing 1..1000 ms budget, 64-observation ceiling, 1/2/4/8/16/32 ms backoff,
monotonic deadline checks, pending-probe watchdog and terminal-result rules
remain. No retry, reset, store close, transport stop, new operation or payment
permission is added.

A historical completed result is not rewritten by later drift. The caller
must retain its own uncertainty/HOLD latch; a separate later healthy helper
invocation cannot clear an earlier application refusal or authorize retry.

## Actual local verification

The [source-bound component record](../qualification/service-credit-bounded-operation-drain-intrinsics.actual-local-result.json)
reports one corrected helper command with:

- 30 new Promise-integrity scenarios and all 16 unchanged original scenarios;
- 46 passed, zero failed, cancelled, skipped or todo;
- zero test getter/substituted-method invocations in the new cases;
- 33 directly counted new-case helper invocations;
- complete bounded UTF-8/TAP output, successful exit and empty stderr;
- exact before/after source and Node identity checks.

Coverage includes drift before admission and inside both native-promise and
synchronous probes, descriptor-only changes, late pending/BUSY drift, inherited
and own accessors, subclass/proxy refusals, pinned public promises, ordinary
success/backoff, late completion and existing invalid-budget/result cases.
The old regression file and its historical result were not edited.

The baseline and corrected commands streamed their output without new
qualification scratch, storage tasks, downloads or installation. The observed
command duration is not an application latency/throughput measurement.

## Acceptance limits

This is actual runtime-component evidence, not merely a declared DATA fixture.
It is also not native transport drain, real SQLite lifetime, application
quarantine/reopen, crash/lost-ACK, physical cleanup, chain, custody, grant,
economic-pilot or production proof.

The checks presume the reviewed realm at module loading and cooperating
dependencies afterward. They are not hostile same-process isolation, an OS
sandbox, atomic observation or a hard cancellation/time guarantee. A blocked
event loop can delay a cooperative watchdog, and a borrowed probe may outlive
the public observation.

A read-only publication check found that main did not yet contain the
unchanged 16-case regression dependency. Before any remote write, the focused
entry was moved under `qualification` rather than ordinary test discovery;
only its relative regression import changed. That corrected entry was
actually run again and all 46 cases passed. The first source/result and the
failed read-only review remain preserved; the runtime helper was not changed
between those local runs.

Main receives five scoped files, including that unchanged regression test.
Development receives four, because it already has the exact dependency.
Package/defaults, workflow and the existing automatic 27-case Ubuntu/Node
24.19.0 profile remain unchanged. Its new-head CI result must be observed
separately; the 46 local cases are not claimed as that hosted profile or as a
native application run. Old source-pinned native recipes and evidence are not
rebound by this change.
