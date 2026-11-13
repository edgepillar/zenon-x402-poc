# Recorded API delivery and order liability

This opt-in adapter connects an already recorded provider result to the existing
purchase-order fulfillment owner. Its first-product scope is one funded order,
one original grant and one `api-call` per delivery. It provides no new execution
or payment authority.

`createPurchasedOrderRecordedDeliveryVerifier` takes the same five independently
pinned purchase inputs as the fulfillment owner. Its sixth argument selects a
trusted synchronous ledger with `readOriginalFundingGrant` and `getRequest`, an
independently selected `serviceResourceUrl`, and an explicit `maximumAttempts`
in the range 1 through 4096. Methods are captured
once. The adapter neither opens nor closes the borrowed ledger.

Supply its `verifyDelivery` method to the existing fulfillment owner's verifier
port. Keep the separately accepted compensation verifier explicit. For a retained
original request, use `beginDelivery(originalJson, originalDigest, deliveryId, 1)`
and then `recordDelivery(deliveryId, originalDigest)`. The digest selects the
already retained original; it is not a signature or backend authentication.

The adapter validates the purchase, original payment pins, request scope, grant
and immutable request fields before accepting a recorded result. The funding
lookup uses the exact original payment, network, genesis, asset, payee, holder,
offer, capability and funding commitments. It checks the recorded grant quantity
and expiry against the original funding target. A current balance or another
grant with a similar amount cannot replace this identity.

Only an exact `SUCCEEDED` request with a canonical request digest and a recorded
2xx result produces `EXACT_SERVICE_DELIVERY_V1`. The receipt binds the original
request, payment scope and complete cached-result metadata. Repeated reads of
that success produce the same receipt. The fulfillment owner's existing CAS
keeps a repeat from reducing the outstanding quantity twice. Expiry and
revocation do not erase a prior delivery; this historical read calls neither
the clock nor pricing.

Missing, reserved, executing, unknown, released and non-2xx results produce no
delivery receipt. In particular, absence and `FAILED_RELEASED` are never mapped
to `NOT_PERFORMED` or used as compensation evidence. The existing pending
liability remains for separate reconciliation. This conservative adapter does
not define error-response delivery semantics for other products or quantity
units.

Reads, close and reentry are fenced. A throwing or non-synchronous reader leaves
the adapter held. Close during a read prevents a late receipt. A swallowed
reentry refusal still fences the outer call. There is no retry, reset, debit,
grant activation, dispatch, signing, payout or borrowed-store retirement path.
The attempt bound limits inspection; recreating a reader grants no economic
authority.

The provider ledger and its store ownership are trusted selected capabilities.
Checksums and structural comparisons do not authenticate a remote store,
settlement, provider, signature or real service effect. The funding receipt and
liability record remain separate local commits. This adapter is not selected by
the current native application profile and does not close G1 or G2.

## Delivery-policy admission

The shared purchased-fulfillment policy now admits an explicit
`maximumDeliveries` from 1 through 128, allowing the 100-distinct-request product
case. The previous global ceiling of 64 rejected that profile before any ledger
could be opened. This is a bounded policy-admission extension, not an automatic
increase of an existing order's own limit.

Each order still retains its original policy and conditions digest. An old
64-record policy keeps that same checksum and still refuses its 65th delivery.
Rebinding its terms/context or reopening its existing journal as a 128-record
order remains invalid. Counts above 128, non-integers and noncanonical encodings
are refused. Quantities, prices, funding identity, record-byte caps, compensation
rules and per-order limits are unchanged.

The policy module and this adapter are outside the currently selected native
application source graph. Its 246 source modules plus root package metadata and
583-row admission catalog remain unchanged. No package-admission or installed
package update is part of this change. The existing 2,723-control profile also
has no changed source graph; these product-contract controls are a separate
focused DATA scope, not new qualification of that native application.

## Validation scope

The accompanying DATA entries exercise the actual in-memory credit model,
purchase codecs and funding/fulfillment owners with declared memory stores and
authentication ports. It includes 100 distinct metered calls under one original
funding and grant, exact repeats, memory reconstruction, unresolved results,
foreign bindings, reader failures, close/reentry and the attempt bound.

The first selected batch ended FAILURE. Its first five entries were accepted:
21 adapter controls, six paired-application controls, seven policy boundaries,
26 generic fulfillment controls and 23 generic fencing controls (83 total).
Both 100-distinct-request cases passed. The next 35 assertions all reported
PASS, but their legacy packet omitted the required explicit `actualPrepare: 0`
field. The supervisor rejected that packet and did not start the final 45
original-funding lookup controls. There is no complete 163-control acceptance
from that attempt; its failure and complete original streams remain retained.

The reporting correction adds the missing field without changing any of those
35 assertions or rewriting the old packet. A fresh 177-control selection is
planned: the original 163 controls plus the separate owned-application
component's 14 controls, each entry in a fresh Node process. No result for that
new selection is claimed yet. Memory reconstruction is not fresh
process/SQLite recovery. No native application, installed SDK/core package,
SQLite, HTTPS, socket, key, signature, nonce search or payment is selected.
Hosted CI and product acceptance remain separate evidence lanes.


## Application composition

Use the same pinned purchase that appears in the application selection. Select
an already recorded provider ledger and the exact service URL independently:

```js
const p = selection.funding.purchase;
const delivery = createPurchasedOrderRecordedDeliveryVerifier(
  p.termsJson, p.termsDigest, p.paymentCheckpointJson, p.paymentPinsJson,
  p.fundingContextJson,
  { ledger, serviceResourceUrl, maximumAttempts: 256 },
);
const app = createPurchasedOrderApplicationCore({
  selection, fundingBackend, fulfillmentBackend, originalStore,
  verifyFundingEvidence, clock, deadlines,
  verifier: {
    verifyDelivery: delivery.verifyDelivery,
    verifyCompensation: separatelyAcceptedCompensationVerifier,
  },
});
```

The caller retains lifecycle ownership of the read adapter. Revoke it with
`delivery.close()` before closing the application, including when close is
requested during a ledger callback. Neither close operation is evidence of
physical release of the borrowed ledger.

The paired-application DATA entry uses the actual application core and both
actual fencing contracts over memory ports. It prepares cases for 100 distinct
deliveries, unchanged exact repeats, explicit same-record memory recovery,
delivery-commit acknowledgement loss, pending liability after unknown execution,
and close during a ledger read. Its grant is preloaded through the model's
explicit trusted-record test boundary; it does not establish real funding to
grant activation, authentication or fresh-process recovery. Those six controls
passed within the first failed batch; they do not turn that whole attempt into
a success. No new hosted CI or native scope is implied.
