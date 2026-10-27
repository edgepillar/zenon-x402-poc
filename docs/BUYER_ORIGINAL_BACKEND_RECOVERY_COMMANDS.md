# Original service backend reconciliation commands

Date: 2026-10-27. All 104 lifecycle/funding/recovery case bodies passed again
within the current 124-case command-host selection, including 20 new terminal
host cases. Native two-store qualification remains separate.

## Connection to the existing recovery API

createBuyerOriginalBackendRecoveryClient reuses the actual
createServiceCreditCustodiedBackendRecoveryCore. It connects the same existing
native original-only V6 payer to one explicit selected-grant backend reader.
It creates no second payer, payment, signer, store, dispatch transport or retry.
The independently retained original selection is unchanged.

On a matched query, the real shared core performs two complete checkpoint
reads and two local custody reads around one backend readExactOriginal call.
The caller's key and original capability proof are forwarded exactly; all eight
fields of the retained original service request bind the backend query.
The outer connector additionally checks the selected grant and external
funding resource/hash/network bindings before exposing those local records.
Changed original, funding revision, uncertainty, intent, response or checkpoint
DATA makes the read unavailable. Reentrant close prevents later child calls.
These are ordered synchronous checks, not an atomic transaction across stores.

The existing native backend reader supplies a local store observation and
performs its existing whole-ledger admission and capability checks. This is
not an HTTP status endpoint, remote chain identity proof or current grant
authority. Its actual SQLite reads may use BEGIN IMMEDIATE. Missing local
originals stop before the backend query. Cached success cannot clear local
funding/custody uncertainty or a recorded dispatch intent.

## Explicit host and command

The development-only named buyer CLI entry is
openBuyerOriginalBackendRecoveryCommandSession:

    const session = await openBuyerOriginalBackendRecoveryCommandSession({
      configuration: existingOriginalOnlyNativeConfiguration,
      selection: { originalPayment, selectedGrantId, paymentRequiredHeader },
      backendStore: existingActualBackendStore,
      input: ownedCommandInput,
      output: ownedResultOutput,
      limits: { maxCommands: 16, closeWaitMs: 250 },
    });
    await session.run();

The hardwired opener uses the real native original-only client and real backend
reader; no supplied client/store factory is accepted. The actual backend store
is borrowed and remains caller-owned. Native payer acquisition, guarded existing
store opening, original configuration and stream ownership remain unchanged.
The legacy and previous named CLI bodies are preserved byte-for-byte. This
source-only entry has not been exercised as a native application.

Use encodeBuyerOriginalBackendRecoveryCommand from
src/buyer-original-funding-command.js. The new explicit operation is:

    {
      version: 1,
      id: 'unique-reconciliation-id',
      operation: 'reconcileOriginal',
      input: { key: { grantId, requestId }, authorizationHeader, expectedPins },
    }

Each wire envelope is canonical UTF-8 JSON plus LF. The backend recovery mode
also retains the explicit original restoration, local read, service submission,
inspect and close commands documented in
[original recovery](BUYER_ORIGINAL_RECOVERY_COMMANDS.md). The funding-only and
local-recovery-only codecs refuse reconcileOriginal. Proofs must retain the
ServiceCredit prefix, fit the 1024-byte limit and contain no CR/LF/NUL; the
actual backend remains responsible for cryptographic admission.

The reconciliation response contains selected IDs, status, backendStatus,
localReconciliationRequired and fixed no-authority flags. It never returns
the proof, raw original request, checkpoint, cached result or payment header.
Every reconciliation result sets reconciliationRequired true and leaves
dispatch, payment, signing and delivery flags false. Absence and cached success
cannot become permission to resend. After writing this terminal observation,
the command session is HELD and admits no queued restore or submit command.
A fresh explicit service command in the separately admitted flow still requires
restore, fresh pins and an unchanged never-attempted original; reconciliation
does not grant that permission.

Output loss preserves the exact redacted result line in memory without another
backend lookup or output replay. Actual callback/drain backpressure and one
cooperative whole-close observation budget remain in force. Late completion
does not heal HELD or rewrite an earlier close receipt.

## Ownership and source-bound evidence

Close fences the shared connection and requests the backend reader and native
payer stops independently. The actual backend reader returns CLOSED DATA;
the native payer returns its original Promise<void>. A failed or malformed
reader receipt cannot suppress the native stop or become a clean close.
Reader close never closes the borrowed backend store. Failed construction keeps
actual acquired owners and their original stop receipts; no reopen, cleanup of
historical evidence or force-close is added.

The [actual local result](../qualification/buyer-original-command-host.actual-local-result.json)
pins 44 component modules and the package manifest (45 inputs), 124 exact case
names, exits and stream hashes. One Node 24.19.0 run passed all cases in about
1.76 seconds, with no failures, skips, cancellations or stderr. It used memory
fixtures with no new managed task, scratch directory, source/package copy or
Node child. The existing 104 test bodies are unchanged; the shared fixture now
also selects explicit declared native backend capabilities.

The 24 backend cases exercise the real shared recovery core through the buyer
connector: exact proof/eight-field original forwarding, before/after fences,
missing originals, changed records/checkpoints, prior intent and uncertainty,
all actual backend outcome statuses, descriptor/Promise refusal, recursive
reads, reentrant close, independent failed stops, exact reader-close contract,
terminal redacted output, output loss and late callback completion.

Native payer, backend reader/proof admission, custody and store callbacks remain
declared. No actual SDK/Noble/x402 package, SQLite, socket/TLS, key, signature,
nonce search or SDK PREPARE executes. A parser-only check passed for the changed
native host and CLI roots; their 37-file relative source graph was reviewed
without linking or evaluation. Its sole external package specifier remains
@x402/core/client.

Main receives the qualified pure changes, fixtures/tests/runner and result/docs.
Native host and CLI wiring stay on development. The unchanged 108-case hosted
profile does not execute these 124 local cases. Historical 104/80/52-case
results remain at their original source pins. The separate frozen native
allowance and its storage refusal are unchanged and have not been retargeted.

Actual native two-store/proof/official/HTTPS composition, existing-store reopen,
process-interruption recovery, OS resource cleanup, default buyer cutover,
grant activation, delivery, economic pilot and production remain unqualified.

## Current terminal host integration

The current 124-case selection also includes 20 [host controls](BUYER_ORIGINAL_COMMAND_HOST.md).
They exercise the actual command sessions, separate reconciliation and unknown
outcomes from clean closure, retain original run/close receipts and prevent
repeated host calls from starting work again. Native CLI run adapters remain
source-only on development. Only the changed CLI root was parsed in the current
host step; unchanged native root parser results were reused at identical bytes.
The earlier 104/80/52-case records remain historical evidence at their original
source pins; they have not been relabeled as results for this current graph.
