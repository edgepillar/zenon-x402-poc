# Original-only inspection in the fixed operator entry

```sh
node src/api-credit-cli.js --inspect-fd 3 --output-fd 6 --bootstrap-ms 1000
```

This source candidate uses two distinct, exclusive operator-owned POSIX FIFO
ends, not stdio/env or a wallet/key pipe. Supply one canonical JSON envelope,
one newline and EOF. No store module is imported until both that frame and EOF
are observed and the complete envelope passes admission. Startup, native
inspection and output share one monotonic 1..60000 ms observation budget.
JavaScript timers do not cancel native work or provide an OS lifetime limit.

The envelope has exactly `recoveryInspectionVersion: 1`, `selection`,
`payerOptions`, `backendOptions`, `requestKey` and `authorizationHeader`.
It is at most 65536 UTF-8 bytes, depth 16 and 4096 JSON nodes, with no duplicate
properties, noncanonical encoding or trailing bytes. The profile pipe contains
the existing service proof: protect it as credential-bearing input. It is never
persisted or echoed; strings cannot be reliably erased.

- `selection` contains the independent original funding `originalPayment`
  (`resourceUrl`, exact `serializedCheckpoint`, `expectedPins`), selected grant
  and exact `paymentRequiredHeader`. The first product accepts one upfront offer.
- `payerOptions` contains `databasePath`, `allowedRoot`, `fundingResourceUrl`,
  `custodyPolicy`, `selectedGrantId` and `deadlineMs`. The policy contains the
  existing `policyVersion: 1`, service resource URL and request bound.
- `backendOptions` contains a distinct existing `databasePath` and explicit
  `busyTimeoutMs`, `maxStateBytes`, `maxOffers`, `maxGrants`, `maxRequests` limits.
- `requestKey` selects one original request in that grant. The original existing
  `ServiceCredit` authorization value is supplied without regeneration.

Both files must be directly within the selected private root and cannot alias one another
or their sidecars. Lexical DATA checks do not replace the actual stores' physical
identity/schema/ownership checks. Both native opens use existing-store APIs.
Acquisition may advance payer owner_epoch or quarantine old intents; this is
not SQLite readOnly mode, a migration or a process-restart qualification.

The actual V6 no-dispatch connection verifies independent checkpoint pins and
rereads local funding/custody facts around its exact backend query. The new pipe
path also compares the canonical retained checkpoint bytes before and after
the query with the independently supplied original. No transport, SDK package,
wallet, funding/signing method, grant issuance or service execution is selected.
The spending ledger is untouched: history cannot clear its unresolved barrier.

One bounded redacted JSON record is written. CACHED_SUCCESS and absence remain
historical claims with authority NONE, all action flags false and delivery
NOT_ESTABLISHED. Proofs, original bodies and signed bytes never enter output.
Output-callback completion is not delivery or settlement. No partial result,
new payment, re-signing, reauthorization, reopen retry or close retry is generated.

The single-item legacy manifest inspector shares the corrected owner pipeline.
An entered payer opening may already hold a borrowed backend reader even if it
returns no owner. The backend is retained in that case. A returned payer must
give a void close receipt and a fresh RELEASED/quiescent view before the one
backend stop. Throwing/nonvoid/unknown closes retain their original uncertainty.
Sixteen retained active/failed frames bound cooperative ownership admission.

The new route has DATA/declared-port coverage and native-source parser checks
only. No actual CLI, SQLite, SDK/core, proof verification, key/signature, socket,
nonce or payment test was executed. Older native results keep their original
source/runtime scope. Fresh-process cutpoints, native release/fencing, exact
signer-response recovery, Linux and complete G1/G2 acceptance remain OPEN.
