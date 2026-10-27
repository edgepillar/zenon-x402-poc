# Original buyer command host results

Date: 2026-10-27. All 124 selected builtin component cases passed: the unchanged
104 lifecycle/funding/recovery case bodies and 20 new host cases. Native SDK,
store, transport and CLI run adapters remain separately qualified.

## One actual session and its original receipts

runBuyerOriginalCommandHost owns one fresh actual command session. It captures
the frozen public methods, validates the session contract, starts its run once
and joins its original cached close Promise. Repeated host calls return the
same host-result Promise and never start another operation or output write.
An already-running or closed session is refused without being adopted, stopped
or reopened by the host. A contract identifier is not authentication of arbitrary
caller code; the native bindings below supply the actual existing session.

The driver owns no second wallet, payer, backend, stream or timer. It performs
no signing, funding, reconciliation action, retry, re-sign, replacement or result
replay. The actual session still owns input/output, explicit command admission,
independent pins, writable callback/drain and its one cooperative close budget.
Idle command input can wait for the operator; the host adds no idle timeout.
An explicit session.close or input EOF uses that existing close lifecycle.

The session now exposes currentOwnersClosed from fresh client/channel views
after work-body completion. This separates a terminal reconciliation observation
from a failed child-stop view. It is a local source-contract observation, not
proof of OS termination, physical key erasure, durable outcome or later state.
The parent can remain HELD even when these current child views are closed.

## Exit classification

| exitCode | status | Meaning |
| --- | --- | --- |
| 0 | CLOSED | Run/close returned undefined, fresh owner views closed, no retained uncertainty |
| 1 | INPUT_REFUSED | Input was refused before a business operation, with observed child stops |
| 1 | OPEN_REFUSED | No command session was returned; partial native release is not established |
| 2 | RECONCILIATION_REQUIRED | Terminal recovery DATA, observed child stops, original rejected close preserved |
| 3 | OUTCOME_UNKNOWN | Business/output result or run contract remains uncertain |
| 4 | CLOSE_UNKNOWN | Original close receipt or final owner observation is unknown |
| 4 | HOST_REFUSED | Owned-host entry failure; native release is not established |

Zero means a clean local command-session completion, never a payment, grant,
settlement, READY or delivery receipt. Unknown funding/output cannot become
zero. Backend CACHED_SUCCESS or absence cannot become zero or permit replay.
A terminal backend or missing-original observation can return 2 while the actual
session remains HELD and its cached close Promise stays rejected.

The host result records runCompletion, closeCompletion, mode, uncertainty flags,
whether the last local write callback completed and the fresh owner-view result.
It contains no raw result line, proof, checkpoint, payment header or private
exception. The session's existing retainedResult remains available explicitly
to its owner; the host does not echo or erase it.

A returned result has historicalObservation true and is immutable. Late callbacks
cannot heal it or change the cached Promise. A later child-view drift may downgrade
a fresh session.inspect without rewriting the earlier result. This is not a live
monitor or a guarantee that a process will exit while unknown native handles remain.

## Explicit native run adapters

On development, src/buyer-cli.js exposes three explicit programmatic run entries:

- runBuyerOriginalFundingCommands(configuration)
- runBuyerOriginalRecoveryCommands(configuration)
- runBuyerOriginalBackendRecoveryCommands(configuration)

Each selects its existing hardwired named opener, obtains one actual session and
runs this shared host. It accepts the same closed configuration and explicitly
owned streams as the corresponding open entry. BackendStore remains borrowed.
No caller-supplied opener/client/store factory, automatic key derivation, implicit
process stdio or new CLI/default/Phase2C selection is introduced.

A host that has already selected and owns the appropriate resources can use:

    const result = await runBuyerOriginalBackendRecoveryCommands({
      configuration: existingOriginalOnlyNativeConfiguration,
      selection: { originalPayment, selectedGrantId, paymentRequiredHeader },
      backendStore: existingActualBackendStore,
      input: ownedCommandInput,
      output: ownedResultOutput,
      limits: { maxCommands: 16, closeWaitMs: 250 },
    });
    process.exitCode = result.exitCode;

The adapter never calls process.exit, writes another line to the closed command
output, prints private errors or retries an opener. If a session was returned
before an entry failure, its existing close is requested and observed; a failure
does not imply release. Earlier native quarantine rules remain in force.
For explicit stop or later observations, the lower-level open entries plus
runBuyerOriginalCommandHost remain available to the owner.

The legacy buyer and all earlier named open entries remain byte-for-byte
unchanged. These new run entries are source-only native wiring; they have not
been exercised with actual SDK, stores, proof admission or transport.

## Actual verification

The [actual local result](../qualification/buyer-original-command-host.actual-local-result.json)
pins 44 component modules and the package manifest (45 inputs), 124 exact case
names, actual exit and stream digests. One Node 24.19.0 command passed all cases
in about 1.76 seconds, with no failures, skips, cancellations or stderr.
No new scratch, managed task, source/package copy or Node child was created.

Tests execute the actual host and three actual command-session modes using Node
memory streams. Existing SDK105 key/lifecycle and original/backend recovery code
executes over declared native callbacks and invalid fixed signature DATA.
The 20 new cases cover complete explicit funding flow, original restoration,
backend/missing-original reconciliation, unknown funding, refused input, duplicate
IDs, lost output, pending writes, external idle/pending-operation close, immutable
history, active/closed owner refusal, descriptor/Promise guards, private exception
sanitization and real AsyncLocalStorage tracing slots.

The combined 104-file literal relative source graph of both native command
bindings and the pure host was reviewed. Its package specifiers remain
@noble/ed25519, @noble/hashes/sha2, @x402/core/client and znn-typescript-sdk.
Only the changed buyer CLI root received a parser-only check; unchanged native
root parsers and completed native trials were not repeated. No module in that
native graph was linked or evaluated by the parser check.

Main receives the pure host, shared observation change, tests/runner/result and
documentation. The named native run adapters remain on development. The unchanged
108-case hosted profile does not execute these 124 local cases. Older 104/80/52
results remain historical source-bound evidence. The separate frozen native
allowance remains unconsumed at its original source selection.

Native SDK/official/store/transport composition and cleanup, process-interruption
recovery, default buyer cutover, grant activation, delivery, economic pilot and
production acceptance remain unqualified.
