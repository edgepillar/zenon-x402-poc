# Grant-free purchased-order liability

The order owner can retain a verified funding receipt and the remaining delivery
or compensation obligation before a grant or service request exists. It reuses
the original-payment, independent-pin, funding-receipt, retained-service-request
and compensation-original codecs. It never creates a grant or an economic
operation. Existing grant-bound fulfillment and application wiring are unchanged.

`createPurchasedOrderFulfillmentOwner` takes the same five immutable purchase
inputs as the grant-free funding owner and selected storage, verifier and clock
ports. Call `recover()` before another operation. `recordVerifiedFunding()` reads
the selected store's exact verified receipt, checks it against the independent
purchase inputs, and retains that receipt separately from delivery state. Receipt
parsing checks consistency; the selected funding store must protect the provenance
of its already authenticated receipts. Copying a `VERIFIED` string is not funding
authentication. Source ownership may change while the immutable receipt stays the
same. A missing or changed source on recovery holds the liability record.

Offer and reservation expiry do not erase a verified obligation. The receipt's
verification observation time is recorded separately. Payment time and whether
payment itself was late remain unknown. Purchased service quantity and grant
funding units are distinct. A view is a cached accounting observation and has no
payment, signing, service-dispatch or compensation authority.

For delivery, `beginDelivery()` requires an actual original service request from
the caller-selected retained-original store, with the same accepted terms and
exact original payment checkpoint. That request selects the grant and service
resource for all later requests on this order. An unretained request, another
grant/resource or excess quantity is refused. `recordDelivery()` accepts only a
synchronously authenticated exact witness from the selected verifier. Pending or
unknown delivery reserves quantity and blocks compensation. `NOT_PERFORMED`
releases quantity while keeping its original request identity; it does not permit
that identity to be reused as another delivery. Terminal evidence is immutable.

When no delivery is unresolved, `retainCompensation()` can retain one exact
compensation original even if no grant was created. Its quantity is the remaining
purchased quantity and its atomic amount is `ceil(price * remaining / quantity)`
using integer arithmetic. Terms, payment scope, network, asset and original
holder/payee must match. Its separate transaction identity cannot be the funding
transaction. The existing original-byte digest is a checksum, not transaction
decoding, signing or proof of a valid payout. `recordCompensation()` requires the
selected verifier's exact witness. Unknown compensation leaves the obligation
outstanding; confirmed compensation reduces it. Neither a missing reply nor an
unknown outcome authorizes replacing the retained original.

The state port must implement durable exact-string compare-and-swap with
exclusive or monotonically fenced session ownership. This owner does not supply
that backend. Its load and commit results are trusted storage capabilities;
checksums and structural consistency alone cannot protect against a compromised
store or authenticate historical witnesses. Lost or malformed acknowledgements
hold the owner. Recovery checks the same purchase pins, funding receipt and
retained service originals. Close revokes this logical owner and never closes
borrowed stores or certifies physical resource release.

The [DATA cases](../qualification/service-purchase-order-fulfillment.behavior.mjs)
exercise actual funding owner/receipt transitions and actual custody codecs with
synthetic storage, ownership fencing and proof authentication. They cover
grant-free liability, partial delivery, exact compensation, ambiguity, stale
sessions and recovery. Stable read/export reuse the validated state; they do not
revalidate every retained request. Each changed state and recovered record still
receives full validation, with at most 64 retained deliveries and a 1 MiB record
limit. No historical evidence or native source graph is replaced.

These DATA results establish neither native SQLite durability, TLS composition,
grant authority, actual delivery, a payout, full P1/P2 acceptance nor production
readiness. No native qualification was run for this addition. The separately
prepared funding HTTP native trial remains unexecuted by user instruction.
