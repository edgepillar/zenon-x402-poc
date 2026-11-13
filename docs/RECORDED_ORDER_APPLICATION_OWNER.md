# Recorded-delivery application ownership

`createPurchasedOrderRecordedApplicationCore` combines the paired purchase-order
application with its recorded-delivery verifier. Select the same independent
purchase and funding/fulfillment ownership inputs as the underlying application.
Provide `recordedDelivery: { ledger, serviceResourceUrl, maximumAttempts }` and an
explicit `verifyCompensation` callback. A caller-supplied delivery verifier cannot
replace the selected recorded-result contract.

The existing application API is preserved, with a read-only
`recordedDeliverySnapshot()` diagnostic. The wrapper owns the read adapter and
keeps the selected ledger borrowed. `close()` first revokes the adapter, then
returns the underlying application's exact close promise. Repeated close calls
share that promise; no new timeout, retry, store close or recovery owner is
introduced. A construction refusal also revokes only the newly created adapter.

This ordering also applies when a selected ledger callback requests application
close. A late returned row cannot authorize delivery, and no later ledger reader
may be entered through the revoked adapter. The underlying application's journal
operation still determines its CLOSED or HELD outcome. Logical read revocation
does not establish physical release of the borrowed backend.

Funding and service execution remain separate accepted operations. This
composition supplies no new grant, dispatch, debit, signer, compensation or
payment authority. Original recovery still uses both existing fenced journals
and their independently pinned recovery digest; creating this wrapper does not
authenticate a replacement ledger or recover an uncertain external effect.

This is source development only. Its focused memory-port controls have not run.
The separate 100-request candidate and its 163 controls are also still awaiting
execution. The wrapper is not selected by the native application, changes no
package catalog or default source profile, and establishes no G0-G5 acceptance.
No native application, installed SDK/core, SQLite, socket, key/signature, nonce,
PREPARE, payment or process-reopen test is part of this source step.
