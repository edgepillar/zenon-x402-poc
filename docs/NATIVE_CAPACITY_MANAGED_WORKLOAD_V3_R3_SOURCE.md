# Managed V3 source rebinding after private parent trace support

Historical revision 3 at
[3546868](https://github.com/edgepillar/zenon-x402-poc/tree/354686881d0f74796b6aac675ba87a7cce48d7b0).
Its result stays byte-preserved and does not qualify the changed graph. See
[revision 4](NATIVE_CAPACITY_MANAGED_WORKLOAD_V3_R4_SOURCE.md) for the new source integration.

Status: CURRENT SOURCE-ONLY REBIND; ZERO NATIVE ATTEMPTS.

The shared async core now has an explicit, separately tested private timing
selection. The existing native V3 adapter still selects the ordinary factory;
no raw parent trace, new native operation, workload reduction or allowance was
silently added. See [the component contract](SERVICE_CREDIT_CAPACITY_PARENT_TIMING_TRACE.md).

The complete source graph still preserves all 117 application and 404 package
baseline inputs plus the same 21 additional application inputs: 138/404, 542
files, 4,759,641 bytes. Only the changed shared-core row and its
source seal/control bindings were advanced. The new standalone DATA checker is
not claimed as part of that native namespace.

The existing preloader, launcher, private-stream preservation, finite native
effect ceilings, 10 GiB floor, sampled quotas, no-copy source admission and
no-retry/HOLD semantics remain in place. New source identities never renew an
old permission. The prospective native effects were not executed.

Current actual checks were: 111 unchanged core regressions, 49 new trace DATA
controls, 135 rebound managed-capture DATA controls, 87 rebound profile DATA
controls and 17 current inert adapter controls. Every selected case passed
without skips. The actual managed source-only CLI read all 542 existing inputs
in place, with no Node/application execution or private root opened.
[The current result](../qualification/capacity-native-workload-v3.r3.source-only-result.json)
binds the exact graph and all actual local outputs.

Two pre-entry tooling failures are preserved separately: candidate output
serialization exceeded its return budget, and an inert collector lacked its
configuration before any Node launch. Neither is a test pass or native attempt;
neither caused a completed application test to be repeated.

The first and second V3 results remain byte-preserved historical evidence at
[the preceding source revision](https://github.com/edgepillar/zenon-x402-poc/tree/1aa075ae8e4d848abd2b6b2e565ec138ee9cea6b).
They do not qualify this changed graph. The existing 27-case hosted profile
remains unchanged and does not execute the new selections.

A future real private-parent-trace integration must account for every bounded
raw event and full frame, bind the actual manager run/source, use the genuine
native path, and obtain its own exact native scope. Current-source namespace
admission is not native timing, resource release, crash/recovery, sustainable
capacity, economic, pilot or production qualification.
