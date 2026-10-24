# Paced balance-barrier source integration v2 / outer capture v3

Status: SOURCE IMPLEMENTED, not native integration. The actual new adapter/pair
passed 53 selected constructor/admission-absence DATA controls. The new entry
and preloader each passed one parser-only check. No valid run/stop, positive
namespace, private profile, SDK, SQL, key, signature, nonce, socket or child ran.
This is a development-source batch, not main/native activation.

## Existing observations, no new timing work

The [new adapter](../qualification/capacity-native-paced-workload-adapter-v2.draft.mjs)
imports the genuine [balance-barrier recorder/checker](../src/service-credit-capacity-balance-barrier-trace-data.js)
and binds it to the existing three real source-side balance callbacks.
It passes the already observed start and end values to BEGIN/terminal handles;
it adds no clock, balance query, writer page, source replay or synthetic timer.

The three contexts are AFTER_FUNDING, AFTER_WARMUP and AFTER_DRAIN. The last
bracket includes existing writer-trace paging/validation, so its metric is named
`balanceObservationBarrierNs`, not pure balance-RPC or SQL latency.
The source checks that only the third read is the genuine DRAINING barrier.

If a read fails before its existing end observation, its raw BEGIN stays
unfinished. No timestamp, zero-duration terminal, successful completion or
replacement read is invented. Finalization preserves incomplete/UNKNOWN DATA;
a missing or mismatched independent balance check withholds clean adapter status.

The report owns the one serialized scalar balance recording. A separate private
`privateBalanceBarrierEvidence` capability returns the cached raw capsule and
genuine DATA check, without duplicating that scalar recording. Repeated reads
add no observation or source entry. Raw run/source/lane context stays private.

## New complete parent source, original children

The [new source selection](../qualification/capacity-native-paced-parent-v3.inputs.json)
declares 146 application and 404 package rows, not a smaller compatibility graph.
It retains the complete original R4 child subset: 139 application and 404
package rows at their original source seal. Seven parent-only additions are
the four new versioned native files, paced owner/checker and barrier component.

The [new real preloader](../qualification/capacity-native-paced-supervisor-v2.namespace.preload.draft.mjs)
uses profile version 2, a distinct v2 namespace and explicit v2 source scope.
Its source requires checks of all 550 installed rows and each ENTIRE original
canonical child profile before a future fork. No old namespace is aliased, source row
omitted, module substituted or existing source constant rebound.

The [v2 paired supervisor](../qualification/capacity-native-paced-paired-lane-v2.supervisor.draft.mjs)
still owns the real original payer/service workers and preloaders. Their
protocol, context and source seal remain unchanged. Only run/lane context reaches
those children; the new parent source tag is kept in the parent recorder.
Untrusted run/lane objects are type-rejected without coercion hooks.

The old v1 parent files, v2 selection/capture, existing profile producer,
launch declaration and original unpaced R4 approval are byte-preserved.
Nothing silently reclassifies their source-bound results or native scope.

## Versioned capture, no old-frame rewrite

The [new entry](../qualification/capacity-native-paced-workload-v2.entry.draft.mjs)
requires the real v2 parent admission and builds the adapter context from that
actual namespace's source tag. It emits outer capture version 3 with
`balanceBarrierData.trace` plus the scalar
`result.balanceBarrierRecording`. Each occurs once in the serialized source
layout. The separate paced timing envelope remains version 2 and retains its
one raw inner parent trace and both genuine checks.

The private output still claims no native resources, sustainable capacity,
chain authentication or production. Clean source exit requires the existing
paced/parent checks AND the new raw balance DATA check. Arithmetic does not
authenticate timestamps, callbacks, physical roots, child exit or storage.

## Actual selected evidence and unfinished controller work

The [53 controls](../qualification/service-credit-capacity-paced-balance-binding-construction.behavior.mjs)
import the genuine new adapter/pair and source dependencies. They cover inert
construction/inspect, 16 captured source-lane bindings, pre-final private
capture refusal, wrong-arity calls, malformed context/configuration and absent
real admission. They install no fake namespace and enter no valid run/stop.

The [actual result](../qualification/service-credit-capacity-paced-balance-binding-v2.actual-local-result.json)
pins all selected inputs and separates the successful behavior command from
two successful parser-only commands, with zero stderr/skips/cancellations/TODOs.
The source review finds the same two existing clock-call sites (plus their
definition) as v1; that is source evidence, not a native timing measurement.
The actual selected application pins were read, but the 404 declared package
sources were not opened or executed by this selection.

At this source snapshot the new private-profile producer was not yet authored.
The later [API-v2 producer](SERVICE_CREDIT_CAPACITY_PACED_PARENT_PRODUCER_V2.md)
now has 68 DATA controls plus a real 550-source/five-in-memory-profile check.
That follow-up keeps this historical result and source declaration unchanged;
it creates no private profile file and grants no native authority.

The later [full profile/resource/entry binding](SERVICE_CREDIT_CAPACITY_PACED_PROFILE_RESOURCE_BUNDLE_V2.md)
implements the new resource calculation and complete bundle with 129 DATA controls.
The real managed-launch binding, physical policy admission and independent FULL
v3 outer verifier are still required. Existing 145-application-row parent profiles,
the old v2 outer validator and old
71 MiB/72-second reservations cannot be relabeled as qualification of this new
graph. The original R4 grant is unconsumed; no new paced native grant exists.
The unchanged hosted profile remains 27 controls and does not run these 53.

Native instrumentation execution, complete receipts, storage HOLD/release,
sustainable capacity, chain/economic acceptance, pilot and production remain
unqualified. This source step does not clear the separately recorded four-file
legacy runtime regression gate for the full paced main transfer.
