# Explicit original-payment recovery commands

Date: 2026-10-27. All 80 local-recovery/lifecycle/funding case bodies passed
again within the current 104-case backend-recovery component selection.
The native recovery host is SOURCE ONLY on development. The ordinary buyer
and Phase2C are unchanged.

This entry connects the existing original-only V6 client to an explicit command
session. It does not use the SDK105 funding client, manufacture an SDK105 facade,
acquire a key, prepare a block, open a new store or supply a funding POST
transport. The native owner opens an existing guarded V6 store and may advance
its owner epoch; this is not a SQLite read-only mode.

## External selection and entry

The host must already retain the original resource URL, complete canonical
serialized checkpoint, original payment-required header, independently retained
binding/digest pins and selected grant. None of these expectations is learned
from the database or a previously displayed candidate.

The development-only named export openBuyerOriginalRecoveryCommandSession in
src/buyer-cli.js lazily selects the hardwired native original-only client:

    const session = await openBuyerOriginalRecoveryCommandSession({
      configuration: existingOriginalOnlyNativeConfiguration,
      selection: {
        originalPayment: { resourceUrl, serializedCheckpoint, expectedPins },
        selectedGrantId,
        paymentRequiredHeader,
      },
      input: ownedCommandInput,
      output: ownedResultOutput,
      limits: { maxCommands: 16, closeWaitMs: 250 },
    });
    await session.run();

configuration has exactly payerOptions, originalPayment, official and
transportOptions, as required by openNativeOfficialV6FundingPostOriginalPaymentClient.
The selected grant and complete original bytes/pins must match the external
selection before acquisition. The native client retains its existing closed
payer/official/transport configuration and acquisition/close guards.
No caller-supplied client/store/transport factory is accepted by this host.

The pure createBuyerOriginalRecoveryClient connector owns that actual client;
component tests explicitly declare its native callbacks. It captures methods
without evaluating accessors or proxies, validates the existing native profile,
and exposes no preparation or funding-submission method. A profile identifies
the selected source contract; it does not authenticate arbitrary caller code.

## Closed recovery protocol

Use encodeBuyerOriginalRecoveryCommand from src/buyer-original-funding-command.js.
Each envelope is canonical UTF-8 JSON followed by LF:

    { version: 1, id: 'unique-id', operation: 'restoreOriginal', input }

| operation | Explicit input | Existing operation |
| --- | --- | --- |
| restoreOriginal | paymentRequiredHeader, expectedPins | restoreOriginalPayment |
| readRecoveryState | key: { grantId, requestId }, expectedPins | readOriginalRecoveryState |
| submitService | grantId, requestId, originalRequestJson, originalBodyBase64, serviceResourceUrl, authorizationHeader, expectedPins | submitOriginal |
| inspect | Empty object | Bounded local session/client/channel view |
| close | Empty object | Stop admission and join original owners |

Recovery refuses prepare, commit, submitFunding and handoff. The funding protocol
refuses restoreOriginal and readRecoveryState. Stream ownership, unique command
IDs, canonical records, UTF-8/byte limits, callback/drain ordering and the one
cooperative close budget are shared with the
[funding command session](BUYER_ORIGINAL_FUNDING_COMMANDS.md).

Restoration consumes one explicit original context. The real native client's
official/checkpoint path compares the selected envelope DATA with the complete
retained original and returns only the exact retained payment header. Different
JSON property order in an SDK comparison cannot replace that header. Restoration
does not generate a signature, send a payment, acknowledge funding, activate a
grant or confirm delivery. EOF after restoration closes without implicit work.

Every state read requires fresh caller-supplied pins and brackets the real local
custody read with two complete checkpoint comparisons. The connector validates
the original request checksum, selected key and external funding resource/hash/
network bindings. The returned observation omits the raw request, payment header,
checkpoint and authorization proof. Descriptive network DATA is not chain
authentication or current grant authority.

Missing originals, non-BOUND funding, declared funding ambiguity, each custody/
submission/undrained uncertainty flag, any dispatch intent, and any recorded
response require reconciliation. Later clean DATA cannot clear this latch.
A locally observed success remains local DATA and never permits replay.
After writing an uncertain observation, the command session remains HELD and
admits no subsequent service command.

An explicit service call additionally requires a successful restore, fresh pins,
and a currently retained, unchanged, never-attempted original request. The real
native owner still enforces proof, grant, request and durable-intent rules. The
extra caller pins belong to this connector and are not passed as a seventh field
to the native six-field service API. A returned Promise<void> confirms only
callback completion; it does not claim settlement or service delivery. Once a
dispatch intent exists, a later call requires reconciliation rather than retry.

Output failure retains the last exact result line as immutable in-memory DATA,
with the original local write-callback state. It never writes again, restores
again, re-signs, submits a replacement or replays a service. A close command emits
no fabricated success line; the host observes the actual run/close Promise.
Close requests both owners independently and joins pending operations and the
original write callback. Expiry remains HELD after late completion. A fresh
resource-view failure downgrades current state without rewriting a historical
fulfilled close. Close is not proof of payment outcome or OS termination.

## Source-bound verification and remaining gates

The [current local result](../qualification/buyer-original-backend-recovery-command.actual-local-result.json)
pins 42 component modules and the package manifest (43 inputs), 104 exact case
names, actual exit and stream digests. It includes these unchanged 80 case bodies
and 24 [backend reconciliation controls](BUYER_ORIGINAL_BACKEND_RECOVERY_COMMANDS.md).
The earlier 80-case result remains historical evidence at its original pins.
One current Node 24.19.0 command passed all 104 cases in about 1.56 seconds, with
no failures, skips, cancellations or stderr. It used memory-only fixtures without
new scratch, source/package copies or child processes.

These tests execute the actual recovery connector, shared command session,
canonical checkpoint code, custody DATA validation and Node memory streams.
The 28 local-recovery cases cover exact-header restoration despite reordered comparison
DATA, independent-pin fences, missing/changed originals, getter/proxy/async
reader refusal, uncertainty and prior-attempt latches, original-only service
admission, output loss, backpressure, reentrant close and late resource-view drift.
The existing 52 test bodies are preserved and rerun against the changed shared
codec/session. Native store/client/official callbacks remain declared. Fixed
signature-shaped bytes are deliberately invalid DATA.

The extended native recovery host's 37-file relative source graph was reviewed;
its changed host and CLI roots passed parser-only checks. The native graph's sole
external package specifier is @x402/core/client. No modules in that native graph
were linked or evaluated by the parser checks. No package installation, SDK,
Noble, x402 package, SQLite, application socket, TLS, key/signature production,
nonce search or SDK PREPARE ran in the local component selection.

Main receives the qualified pure connector/shared-code changes, fixture/tests/
runner, result and documentation. The native opener and named CLI export stay
development-only. The unchanged 108-case hosted profile does not run these 104
local cases. Original historical results remain source-pinned evidence; the
separate frozen native allowance is unconsumed and has not been retargeted.

Actual durable reopen/crash recovery, native official-client/SQLite/HTTPS
composition and cleanup, default buyer cutover, grant activation, delivery,
economic pilot and production acceptance remain unqualified.
