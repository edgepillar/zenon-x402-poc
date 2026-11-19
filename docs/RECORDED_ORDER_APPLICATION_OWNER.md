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

An exact repeat of a committed delivery uses the retained receipt from the
validated fulfillment journal. Reuse requires the same original digest, selected
route, one-call quantity, and recorded-result receipt format. It preserves the
recorded outcome when the inspection allowance has been spent or the application
recovers the same journal with a new owner. Unresolved deliveries require the
selected ledger reader. A held reader continues to refuse operations.

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

An independent review of the prior revision reported 11 passes and three
failures. Source inspection traced the three expectations to a read of the
ledger on each repeat, including after memory recovery. The fulfillment owner
compared the retained receipt after rechecking it through the read adapter.
That path performs a read and consumes an inspection attempt.

The [local result](../qualification/recorded-order-application-owner.actual-local-result.json) records
15 passing memory controls on Node 24.19.0. The combined batch passed 178
controls, including the predecessor's 163. The predecessor's initial failed
attempt remains recorded. These controls use synthetic memory stores and
original records. Native product acceptance remains open.
