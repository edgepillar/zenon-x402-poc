# Actual bridge/router native-Promise close compatibility

Status: 32 local component tests passed on the changed source, including four
actual SDK-free selected-bridge/router compositions. No official SDK package,
native HTTPS/socket, SQLite, key, signature, nonce search or payment was used.

## The actual composition mismatch

The production selected bridge's close capability returns one cached native
Promise. Its shield installs an own constructor field whose value is the captured
native Promise constructor; enumerable, writable and configurable are all false.
The official server's pending wrapper passes that exact close capability through.

Previously the router rejected every Promise with any own constructor property.
Consequently this real bridge receipt was refused even when its continuation
had detached cleanly. Existing declared-router fixtures returned ordinary
Promises and did not expose the actual producer/consumer format mismatch.

The router now accepts either:

- A native Promise with the exact native prototype and no own constructor.
- The same native Promise with the exact non-enumerable, non-writable,
  non-configurable DATA constructor field produced by the bridge.

It still rejects own then overrides, constructor accessors, arbitrary constructor
values, mutable/enumerable/configurable shields, subclasses, proxies and arbitrary
thenables. Captured prototype then/constructor and native species descriptors
must remain unchanged before dispatch through captured native then. No foreign
getter or species is evaluated to decide admission.

This is format compatibility, not authentication of who created a Promise.
Trusted native intrinsics and cooperative same-process code remain premises.
Pre-import replacement and arbitrary hostile code are not confined by this guard.

The source mismatch was established by comparing the existing producer and
consumer. The historical preimage was not rerun; the actual post-fix compositions
and their exact source inputs are recorded below.

## What ran

See [the regression entry](../qualification/official-x402-router-native-promise-close.behavior.draft.mjs)
and [actual result](../qualification/official-x402-router-native-promise-close.actual-local-result.json).

One Node 24.19.0 command selected all ten unchanged original router cases,
all ten unchanged late-owner cases, and twelve new cases. It used two ordinary
--import test preloads and the unchanged original entry; there was no loader
hook, source replacement, argv rewrite, discovery, filter or child process.

Four cases construct the ACTUAL
createSelectedSettlementServerBridgeForOfficialX402Core223 and its ACTUAL
pending continuation, then pass that continuation to the ACTUAL router:

- Pending close detaches and produces a clean router close.
- Pending-to-success uses the same original tuple, then closes cleanly.
- Pending exhaustion closes without a new first settlement or renewed budget.
- Close during an entered continuation waits for its actual close receipt,
  suppresses the late response and preserves uncertain closure.

The bridge's original verification/first-settlement counts remain one each.
The same owner's bounded observer is used at most once; no new payment, grant,
delivery or callback authority is inferred. The first three cases detach without
a native transport; the fourth waits for an explicitly released declared
callback, not a real socket or external settlement.

Eight additional named cases retain plain-Promise compatibility, accept the
exact locked constructor shape, preserve rejected-close uncertainty, reject
unsafe descriptor/thenable/subclass/proxy forms without their getters, and
refuse changed species/prototype-constructor before gadget dispatch. Temporary
global descriptor changes are restored synchronously and checked again after
all tests.

All 32 names passed with zero failures, skips, cancellations or todo. The three
group markers and complete streams were reviewed. Runtime metadata was printed
by the executed new entry. All twelve input contents and nine identity fields,
the executable identity and local Git status matched before/after; the process
group was absent after join. Complete safe TAP text is retained in the result.

## Resource and authority limits

The controller observed about 0.15 seconds for the one command. That is neither
service latency nor an OS cancellation/resource-release bound. Captures were
limited to 64 KiB per stream in memory. There was no filesystem-write grant,
qualification scratch, package copy/install or task-storage task, so the
remaining managed-task slot was not consumed.

The official server wrapper was reviewed as source but not imported. These tests
execute the actual shared SDK-free bridge, not @x402/core or its HTTP server.
Verifier and settlement responses, payment-signature fields and request/response
objects are declared test data; they are not cryptographic or native evidence.

Existing historical records, including the prior failed native HTTPS run,
remain byte-identical. This change does not relabel their source pins. The
native draft needs a fresh matching source profile and separate allowed
execution. The separate DP nine-case execution gate is unchanged.

Main/hosted CI, actual native HTTPS plus V6 and single-grant service flow,
raw signed-byte custody/restart, physical resources and provider/runtime
acceptance remain separate. Full P0-P4 is incomplete and the economic pilot
remains NO_GO. No active buyer, signer, wallet or provider defaults change.
