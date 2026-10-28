# Purchased original recovery

`src/service-credit-purchased-original-recovery.js` connects immutable purchased
terms to the existing original service-request custody and original payment
checkpoint codecs. It also wraps an already acquired V6
`readOriginalBackendRecoveryState` capability with a fixed purchase binding.
The wrapper acquires no store, transport, payer, grant or execution owner.

`capturePurchasedServiceOriginal(termsJson, custodyJson, checkpointJson,
paymentPinsJson)` returns the exact canonical `recordJson` and its domain-separated
`recordDigest`. Persist the record before relying on it; retain the purchase digest
and checkpoint binding/digest pins independently. Storing a new digest beside an
untrusted replacement record provides no independent protection. This module has
no persistence implementation or authentication authority.

Version 1 selects Zenon integer atomic units explicitly as `zenon-atomic`. The
asset identifier and total quoted amount must equal the selected original x402
requirement. Quantity is retained independently and is not a price multiplier.
The holder must equal the declared original transaction address. Beneficiary is
the service beneficiary and is not inferred from the payment recipient.

The profile retains the existing empty-body, single-offer, upfront wire contract.
The joined record checks the existing checkpoint's independent pins, the complete
original funding resource, selected offer membership, network, declared transaction
hash and original intent digest. Funding request/context identifiers stay separate
from the service grant/request identifiers. Original serialized strings remain
unchanged. These checks compare declared metadata; they do not verify a Zenon
signature, chain inclusion, payment finality or payer identity.

```js
const purchase = capturePurchasedServiceOriginal(
  retainedTermsJson, retainedCustodyJson, retainedCheckpointJson,
  independentlyRetainedPaymentPinsJson,
);
// Persist purchase.recordJson; retain purchase.recordDigest independently.
const reader = createPurchasedServiceOriginalRecoveryReader(
  purchase.recordJson, independentlyRetainedPurchaseDigest,
  independentlyRetainedPaymentPinsJson, existingV6Recovery,
);
const observation = reader.readOriginalPurchaseRecovery(existingAuthorizationHeader);
```

The reader calls the existing core with the fixed service key and independent
checkpoint pins. The core retains its admission, owner and before/after read
contracts. The wrapper checks that returned client custody and every original
backend request field belong to the purchase. A read failure disables further
reads on this wrapper; closing it fences an in-flight observation without closing
the borrowed core or its resources. It never automatically retries.

`reportedBackendStatus: CACHED_SUCCESS` remains a backend assertion. Every returned
observation retains `deliveryStatus: NOT_ESTABLISHED`, unknown delivered quantity,
no payment/signing/dispatch authority and a reconciliation requirement. A single
cached request cannot establish delivery of the purchased quantity. The response
omits raw checkpoint bytes, authorization headers and callback diagnostics.

The component fixture uses the actual pure terms, custody, checkpoint and wire
codecs, plus a declared read-capability fixture. It does not import the native
backend/SQLite reader or execute the actual V6 recovery core. Native ownership,
same-record reopen, durable purchase persistence, delivery, late-payment
obligations and compensation execution require separate integration work.
