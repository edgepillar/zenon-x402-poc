# Original-only recovery over explicit process pipes

The current bootstrap, owned backend resource, original-only connector, command
session and host passed 46 local OS-pipe controls on Node 24.19.0 / macOS arm64:
33 backend controls and 13 rerun local-recovery controls. The hardwired native
binding, standalone CLI and named buyer entry are on development with
source/parser qualification only. Their SDK/SQLite/HTTPS path has not run.

## One operator root, one channel, one original payer

The standalone source entry is src/buyer-original-recovery-pipe-cli.js. A parent
explicitly transfers fresh input-read and output-write FIFO descriptors, distinct
from stdin/stdout/stderr, and separately supplies --allowed-root. The bootstrap
cannot broaden that operator root. Descriptor ownership follows the existing
[provided-pipe contract](BUYER_OWNED_PIPE_STREAMS.md); the parent must not retain
another wrapper or close/reuse a transferred descriptor.

The development-only invocation has the closed argument shape:

    node src/buyer-original-recovery-pipe-cli.js --allowed-root <absolute-operator-root> --input-fd <read-fd> --output-fd <write-fd>

The named programmatic entry is runBuyerOriginalRecoveryPipeCommands with
{ allowedRoot, inputFd, outputFd }. It selects the hardwired native opener;
there is no argv/JSON module path, store/SDK factory, environment secret loading
or default buyer switch. The pure coordinator accepts a trusted native-opening
capability and, for version 2, a fixed backend-opening capability only at its
internal binding boundary. Controls declare these native children.

The launcher owns the actual command channel before reading its first line or
opening a native owner. That first line is canonical UTF-8 JSON followed by LF,
with exactly these fields:

| Field | Explicit content |
| --- | --- |
| recoveryPipeBootstrapVersion | 1 for local recovery, 2 for owned backend reconciliation |
| selection | Original checkpoint bytes, independent pins, selectedGrantId, paymentRequiredHeader |
| payerOptions | Existing databasePath, allowedRoot, fundingResourceUrl, custodyPolicy, selectedGrantId, deadlineMs |
| official | Explicit assetInfo and contextLimit |
| transportOptions | HTTPS origin, caPem, request/concurrency/deadline/close limits |
| backendOptions | Version 2 only: a separate existing databasePath and explicit limits |

Original bytes, pins, grant and challenge come from outside the database. The
existing DATA codecs validate their exact binding. Payer root/resource/grant,
service policy and HTTPS origin must agree. Database paths must be lexically
inside the independently supplied root; the actual native owner still enforces
physical directory/file identity, ownership, link and existing-store checks.
Capture alone is not filesystem authentication or permission to adopt a root.

CA text receives bounded shape checks, not certificate authentication. Asset
metadata must match the original payload asset; it remains operator-supplied
metadata. Only a subsequent separately qualified native TLS operation could
establish peer authentication. Neither parsing nor matching DATA authorizes a
payment, grant, signer, new funding sender or an economics decision.

Only after bootstrap validation does the binding load the existing native
official/V6 original-only client. It supplies the fixed existing challenge
validator, converts the captured CA text to a temporary buffer, and clears that
temporary after the native owner has copied its own certificate DATA. This is
not key erasure. Opening the existing V6 payer can advance owner_epoch; it is
real SQLite work, not read-only inspection, initialization or migration.

The same already-owned channel is transferred to one actual original-recovery
connector/session. Its existing canonical commands follow the bootstrap:
restoreOriginal, readRecoveryState, submitService, inspect and close. Each
critical operation still needs its fresh explicit independent inputs. The
launcher does not feed a returned candidate back as trust or automatically
restore, submit, fund, sign, replace or replay. Funding commands are rejected.
Version 1 keeps the local-only path. Version 2 adds reconcileOriginal to the
same pipe and session, using the supplied proof, exact original request and
independent checkpoint pins. It does not turn cached backend success, absence or
prior intent into permission to resend. Reconciliation ends the session with
RECONCILIATION_REQUIRED even when both stores can be stopped cleanly. A queued
submitService after that result is not dispatched.

## Version-2 owned existing backend

backendOptions has exactly databasePath and limits. Its database must be inside
the separately supplied operator root and differ from the payer path and its
SQLite sidecar names in either direction. Physical path/link checks remain the
actual native stores' responsibility. Limits are closed positive integers:
busyTimeoutMs <= 5000, maxStateBytes between 512 and 1048576, and maxOffers,
maxGrants and maxRequests <= 1024. These bounds do not promise a runtime deadline.

After bootstrap capture, the fixed development binding opens the existing
ServiceCreditSqliteStore with openExisting and a deriveCost callback which
always refuses. It creates the actual selected-grant backend original-outcome
reader, then transfers both to the owned backend resource. No initialization,
migration, quote calculation or execution owner is selected. Only then does the
binding open one original-only payer. A failed backend acquisition never opens
a payer. A failed payer acquisition does not acquire a second payer.

The resource wraps the real synchronous reader and the captured actual store
close capability. It stops the raw reader once, checks its CLOSED DATA, and
only then permits the one store close. A throwing/non-void store stop remains
UNKNOWN; even a later successful-looking receipt cannot request another stop.
Reentrant reader stop cannot close the store while a read is active. The
resource returns operational capabilities, not a physical-release certificate.

Once transferred, the actual backend recovery connector owns reader and payer
shutdown. The pipe host owns the store, checks the session body and current
client/native views after that shutdown, then requests store close once. The
independent result pipe does not borrow the store: a failed result write cannot
suppress a safe store stop after the reader/payer have stopped. The returned
output uncertainty is preserved. Before connector transfer, the binding/host
fences its untransferred reader and closes its own known store independently.

After connector transfer, pending/failed payer close, changed context, an
unfenced reader or active public operation holds the store. No late callback
automatically closes or reopens it.
A store close error overrides a clean session result with CLOSE_UNKNOWN while
retaining sessionStatus/sessionExitCode. ownedBackendStoreClose distinguishes
RETURNED_UNDEFINED, UNKNOWN, HELD and NOT_RETURNED. Native physical cleanup is
NOT_QUALIFIED; even a void callback return is not a real SQLite execution test.

## Failure and close ownership

Before a session exists, bootstrap refusal or acquisition failure attempts the
known native/client stop and channel stop independently, once, under one 250 ms
cooperative close observation. A rejected stop cannot suppress the other leg.
Fresh owner views are checked after stop receipts and again after the final
await. Unknown or failed frames remain private, including the original opening
and stop receipts. Late clean views never rewrite a returned unknown result.

Once the actual session exists, its original close Promise and whole-close
budget own shutdown. The launcher does not install a competing cleanup owner.
If a channel constructor did not return a facade, its existing partial-owner
quarantine remains authoritative; the launcher does not raw-close uncertain FDs.
An opener which returned no facade may retain a hidden HELD root. Closing known
pipes therefore never asserts nativeResourceRelease or retries that acquisition.

Invalid bootstrap before native entry can report BOOTSTRAP_REFUSED / 1 after
known pipe close. Native-open or cleanup uncertainty reports CLOSE_UNKNOWN / 4.
An actual session returns the existing host classification. Successful command
results go only to the independent result pipe. The native CLI writes one bounded
status label to fd 2 and sets process.exitCode; it never force-exits or appends a
second result to an already-closed command output.

Bootstrap input may wait for its operator. Native module loading/opening has no
new hard cancellation or elapsed-time guarantee. The cooperative cleanup budget
does not prove OS termination, native drain, durable outcome, delivery or future
resource state. The owner must retain uncertainty across interruption.

## Actual source-bound evidence

The [current local result](../qualification/buyer-original-backend-recovery-pipe.actual-local-result.json)
records 46 exact cases, real process exits and separate stdout/stderr/command
stream digests. All passed in about 6.80 seconds. The Python controller supplied
the retained fixed vector before each Node process started; the child did not
learn originals or pins from a database. The vector contains deliberately
invalid certificate/signature DATA and no wallet key or usable payment signer.

The 13 rerun local controls cover clean inspection, exact original-header restoration, noncanonical
bootstrap, grant mismatch, database outside root, attempted root change, native
open rejection, client setup failure, failed client stop, final close-view drift,
output peer loss, funding-command rejection and an unsupported thenable without
invoking its getter. Actual descriptor closure and preserved standard descriptors
are checked under real AsyncLocalStorage. Native OPEN/close callbacks are declared;
no SDK, SQL, IP connection, key, signature, nonce search or service dispatch runs.

The 33 backend cases add cached/absent/local-missing/prior-intent reconciliation,
foreign grant and changed context, queued-original no-replay, independent store
close failure/non-void/promise receipts, failed/unclosed readers, rejected/late
payer close, failed and thenable backend acquisition, failed payer/client setup,
post-store view drift, lost output peer, forbidden funding, invalid backend
root/alias/sidecar/limits, missing capability, inert owner-shape refusal, early
store stop, reentrant reader stop, promise-valued read, repeated-close guards and
an error-receipt Promise constructor accessor which must never be invoked.
Each close sequence is observed; the declared store callback is never mistaken
for the reader's CLOSED DATA or actual SQLite cleanup.

The prior four pipe controls and 124 component cases were reused only after all
48 original inputs matched exactly. They were not rerun. New evidence references
the SHA-pinned 621-row unchanged protected manifest instead of copying its table into every
report. Each new case is journaled before final result derivation. No source or
package copy, managed task, filesystem scratch or Node child was created.

The 117-file literal native graph was reviewed. The changed native binding had
one fresh parser check without linking/evaluating modules; the two unchanged
CLI-root parser observations were reused at exact root/package pins. All changed
pure runtime modules were parsed and executed by the current controls. The
108-case hosted profile stays unchanged and does not execute these 46 controls.
The [prior 13-case result](../qualification/buyer-original-recovery-pipe.actual-local-result.json)
and earlier 11/12-case records remain historical at their own source pins. The
unpublished initial 45-case source snapshot is preserved separately; the final
46-case run includes the strict Promise-constructor guard.

Main receives the qualified pure bootstrap/host, vector, controls, controller,
result and documentation. Native CLI/binding/named-entry wiring stays on
development. Current native composition, standalone runtime qualification,
interruption/lost-ACK/HELD-store recovery, default cutover, delivery, economic
pilot and production remain incomplete. The frozen native allowance keeps its
original revision and remains unconsumed.
