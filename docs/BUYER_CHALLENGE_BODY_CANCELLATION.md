# Buyer challenge body cancellation

Date: 2026-10-26. All 32 current local component controls passed.

The ordinary [buyer](../src/buyer.js) previously discarded the initial 402
response without canceling its unused body before payment preparation.
It now uses [bounded cooperative cancellation](../src/buyer-challenge-body.js)
after capturing and validating the challenge, and before entering
createPaymentPayload. This avoids starting preparation while that unused body
has an unresolved cancellation outcome.

The helper calls captured native Web Stream cancellation once. It uses the
existing operation-drain observer to arm a watchdog before invoking the stream,
with a default budget of 1000 ms. Only successful cancellation before that
deadline allows preparation. Rejection, a locked or unobservable body, an
invalid stream, or timeout produces payment_challenge_response_cleanup_failed
before any payment payload is created or submitted. Missing and null bodies
remain compatible with response-like fixtures.

The buyer also attempts cleanup when challenge parsing or selection fails.
If validation already failed, that original validation error is preserved even
when cleanup is unknown. Proxy responses and bodies are refused without
invoking their traps, and replacement cancel methods or getters on a genuine
stream are bypassed.

## Ownership and recovery

This cleanup owns only the discarded initial 402 body. Non-402 passthrough
responses and final paid, pending, or outcome-unknown response bodies remain
with their existing caller. Challenge bytes are not read or buffered.

The change introduces no extra fetch, automatic payment preparation, retry,
signing, settlement or quote refresh. Existing payload validation and paid
submission behavior remain in place. Pending and lost-response reconciliation
still use the exact original encoded payment header, with one preparation.
The default DP strategy has not changed.

## Verification

The [actual local result](../qualification/buyer-challenge-body.actual-local-result.json)
binds the exact buyer, helper, fixture, runner and four-file source import
closure. Against the previous buyer, 16 of the same 32 controls failed because
the required cleanup was missing; these are related integration expectations,
not 16 separate incidents. The fixed buyer passed all 32 with zero failures,
skips, cancellations or todo. The failed baseline is retained.

The controls execute the actual buyer, DATA codec, drain observer and helper,
using genuine in-memory Node Web Streams, including two Node Response cases.
Declared HTTP and payload callbacks supply synthetic unsigned data. Cases cover
deferred cancellation ordering, rejection, throwing and locked streams,
validation errors, missing/null bodies, untouched caller bodies, pending and
lost-response exact-header reconciliation, redirects, invalid payload output,
native-method capture, proxy refusal, and late fulfillment/rejection after
a helper timeout.

The explicit runner selects only these 32 cases. It runs in one Node 24.19.0
process with no Node child and no package installation. No SDK, official x402
package, SQL, key, signature, nonce search, socket or native application runs.
The existing 108-case hosted profile remains unchanged and does not execute
these new local controls.

Successful in-memory cancellation does not establish real HTTP socket closure,
physical resource release, heap reclamation, throughput or latency improvement.
The deadline is cooperative and may be delayed by a blocked event loop; it does
not force-stop an underlying pending operation or provide an OS sandbox.

The separately approved V6 clean native selection retains all 123 exact source
rows and its unconsumed allowance. Full native interruption/lost-ACK/HELD-store
recovery, the ordinary DP transition and economic acceptance remain open.
