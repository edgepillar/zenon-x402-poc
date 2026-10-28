# Purchased-order funding without grant activation

The order-funding owner retains the exact purchased terms, original payment
checkpoint and persisted Zenon issuance before calling the selected funding
authenticator. It works before a grant or original API request exists. An
expired grant offer does not remove the obligation created by a verified
payment. This is an opt-in adapter; default application routing is unchanged.

## Binding and authentication

`capturePurchasedOrderPayment` requires separately selected terms and checkpoint
pins. It checks the real checkpoint and x402 codecs, original funding request
body, payload, requirements, intent, transaction hash, payer, origin, network,
asset, total atomic price, product, policy and full issuance commitment. The
accepted terms must already be associated with that issuance by the application;
the adapter cannot infer a purchase agreement from a transaction alone.

`verifyZenonIssuedFundingWithoutActivation` captures its context before calling
the application-selected authenticator exactly once. It checks the returned
record against the complete persisted authority, chain, confirmation policy,
transaction and issuance. It does not derive new economic terms, apply an
expiry gate, create a grant or call an activation store. Existing activation
behavior, including its expiry checks, is unchanged.

`captureVerifiedZenonIssuedFunding` only normalizes and rebinds an already
authenticated record. Calling it with invented fields is not authentication.
Neither `success`, `BOUND` nor `CACHED_SUCCESS` is a verified funding record.
The authenticator and its configuration must be selected by trusted application
code, never by a request. This module does not authenticate a node or implement
an evidence producer.

The current authenticated record contains no payment timestamp. The adapter
keeps `paymentAtMs` and `paymentWasLate` unknown. It records local verification
observation time separately. Verification observed after offer expiry still
records the full purchased quantity as delivery or compensation owed. Purchased
API-call quantity and grant funding units have separate fields and units.
Funding is not service delivery and provides no dispatch or payout authority.

## Receipt-store contract

The constructor-fixed `receiptStore` implements:

```text
load(orderId, paymentScope) -> exact receipt JSON or null
compareAndSwap(orderId, paymentScope, expectedJson, nextJson)
  -> exact nextJson acknowledgement or null on conflict
```

The selected store must provide durable atomic CAS, monotonic revision and
ownership fencing, and unique paymentScope across order IDs. A thrown,
malformed or lost acknowledgement holds this owner. It is never interpreted as
an uncommitted write or permission to repeat an economic action. The older
grant-bound fulfillment CAS profile does not accept this new receipt profile.
Its SQLite backend is not this adapter's durable backend.

Explicit recovery retains the original first. Each explicit verification
attempt durably records its candidate and increments a persistent bounded
attempt count before the callback. There is no automatic verifier loop. An
unresolved attempt can only resume the same candidate. A known rejection can
accept a new evidence candidate for the same original payment, within the
original attempt budget. It does not mean the payment failed. A verified repeat
is idempotent and a different candidate is refused.

A new owner can rebind a stored verified receipt without calling the
authenticator again. That relies on the selected trusted writer and durable
store; a checksum or self-consistent database row is not an independent trust
anchor. Original payment and accepted-terms pins still come from outside the
stored receipt. Receipt export contains protected payment material and must
not be logged or served as an ordinary status response.

Close fences new operations and waits for the current operation. A late
verification success or error after close leaves the retained VERIFYING record
for reconciliation. It does not report a clean positive, erase uncertainty,
close the borrowed store, assert physical resource release or terminate work.
There is no timeout takeover, worker cancellation, grant, signing, settlement,
delivery, compensation or cleanup actuator.

## Qualification boundary

The selected DATA composition executes the actual checkpoint, issuance,
authenticated-record binding and order-owner code. Its authenticator and atomic
unique-payment store are synthetic test ports. It covers lost acknowledgements,
same-original recovery, stale-owner conflicts, late results, closed owners,
attempt limits, immutable bindings and expiry-independent liability.

These controls are not native SQLite durability, fresh-process recovery,
cryptographic authentication, SDK, HTTPS, interruption or economic acceptance.
The separately qualified original-purchase SQLite store retains its own exact
source and two-process results; it does not qualify this receipt-store profile.
The existing 108-control hosted CI profile is separate from the new local DATA
composition and is not expanded by this change.
