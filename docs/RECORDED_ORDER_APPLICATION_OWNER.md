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

This component remains source development only; its 14 focused memory-port
controls have not run. The predecessor's first selected batch ended FAILURE:
83 controls were accepted, 35 reported PASS but omitted a required output field,
and the final 45 were not started. The failed record remains immutable. A source
reporting correction leaves all 35 assertions unchanged. A fresh combined
177-control selection is planned, with no new completion claim. The wrapper is not selected by the native application, changes no
package catalog or default source profile, and establishes no G0-G5 acceptance.
No native application, installed SDK/core, SQLite, socket, key/signature, nonce,
PREPARE, payment or process-reopen test is part of this source step.
