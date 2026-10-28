# Purchased service fulfillment and late-payment liability

`createPurchasedServiceFulfillmentOwner` coordinates an order's separate funding,
delivery and compensation records. It reuses the real purchased-original codecs
and the original store's `readOriginal` interface. Its accepted policy is part of
the immutable terms: `conditionsDigest` must equal the domain-separated digest
of the exact canonical policy JSON. There is no implicit policy adoption for
existing purchases whose conditions were agreed differently.

The policy fixes the quantity unit, offer and reservation expiry, a bounded
delivery-entry limit, and `PRO_RATA_CEILING_ATOMIC_V1`. Quantity is measured in
that explicit purchased unit. It is not inferred from a request's maximum cost
or a count of transactions. Compensation for the undelivered remainder is the
ceiling of total atomic price times remaining quantity divided by purchased
quantity; integer arithmetic is exact and no display denomination is accepted.
An operator must agree this policy before the order is accepted. This component
cannot choose a new refund rule after a payment.

Funding is admitted only through the verifier function captured at construction.
Its exact versioned Zenon witness must bind the same payment scope and terms.
The payment scope already includes network, chain identifier, genesis and hash.
Neither a request-side `success` flag, an amount match, nor a Lightning claim is
eligible. The verifier receives the retained purchase/checkpoint and independent
pins; actual authentication of chain, signature, funding and provider authority
belongs to that fixed verifier. Synthetic verifier tests do not establish those
real-world facts.

Once a funding witness is retained, both expiry deadlines are informational.
Advancing time cannot remove its owed quantity, delete a record or declare it
delivered. Late verified payment therefore retains the full delivery-or-
compensation obligation. Funding is never a delivery receipt.

Each delivery intent first checks a durably retained original through the
borrowed original store. Its exact digest, request scope, request ID and chosen
quantity are fixed before an external executor could act. Many distinct original
requests can belong to the same payment and grant. Duplicate intents are
idempotent; changed original, ID or quantity conflicts. Pending or UNKNOWN
deliveries reserve quantity and block compensation. Only the selected delivery
verifier can record an exact `DELIVERED` result or `NOT_PERFORMED` resolution.
`CACHED_SUCCESS` alone is ineligible. Terminal evidence cannot be downgraded or
replaced by a different result.

Compensation has its own ID, transaction hash, original bytes and independently
retained digest. It must cover exactly the remaining quantity under the agreed
atomic-price rule and pay the retained holder on the original payment's network
and asset. An unresolved delivery prohibits compensation retention. Once any
compensation original is retained, new delivery intents and replacement
compensation identities are refused. A missing reply stays `RETAINED` or
`UNKNOWN`; it cannot authorize a second payout. Only an exact witness from the
fixed compensation verifier can record `CONFIRMED`. These metadata checks do
not themselves verify a compensation signature or chain transaction.

The owner requires synchronous, constructor-selected ports:

| Port | Required contract |
| --- | --- |
| `originalStore.readOriginal` | Return the exact previously retained purchase original under independent terms/original/checkpoint pins. |
| `stateStore.load(orderId)` | Return the canonical state JSON or null under the caller's exclusive or fenced ownership. |
| `stateStore.compareAndSwap(orderId, expectedJson, nextJson)` | Durably and atomically compare exact strings, then return exactly `nextJson` only after a known commit. A boolean is not an acknowledgement. |
| `verifier.verifyFunding`, `verifyDelivery`, `verifyCompensation` | Authenticate and return the corresponding exact canonical witness; reject unverified evidence. |
| `clock` | Return the selected nonnegative safe integer timestamp in milliseconds. |

Call `recover()` explicitly before transitions. Construction performs no I/O.
There are no asynchronous callbacks, automatic retries, timers, expiration jobs,
delete APIs or background execution. Reentrancy is refused. A stale CAS result
fences the owner; a thrown or lost CAS acknowledgement leaves it HELD, even if
the store committed. A new owner must recover the same retained state. Closing
this owner does not close any borrowed port or prove physical resource release.
The caller supplies the actual durable/fenced store and authentic verifiers;
cached reads are not an independent observation of another live worker.

No method dispatches a service, signs, pays or starts compensation. Journal
receipts expose no economic authority, including after delivery or compensation
is satisfied. Keep exported state protected: compensation original bytes and
verifier references can be sensitive. Checksums and exact strings detect drift
under the trusted-store premise; they do not authenticate a consistent same-user
rewrite or provide a distributed ownership protocol.

The separate DATA-port composition exercises the actual owner and existing pure
codecs with synthetic selected verifier, original-store and atomic-store ports.
Its [26 local controls passed](../qualification/service-purchase-fulfillment.actual-local-result.json)
on Node 24.19.0 / darwin-arm64 using byte-identical task-owned APFS input clones.
The lost-CAS-ack and new-owner recovery scenarios are in-memory simulations in
one Node process, not a native process restart or SQLite durability result.
It uses no SDK, SQLite engine, key, signature, socket, nonce search or payout.
Durable fulfillment-store integration, real verifier admission, native crash
recovery, physical release and full P1/P2 acceptance remain open. The existing
selected hosted CI profile is independent of these new local controls.
