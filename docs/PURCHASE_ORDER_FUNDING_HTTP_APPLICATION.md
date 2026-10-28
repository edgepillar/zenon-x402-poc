# Original-payment funding HTTP application

This opt-in profile connects the actual original-order application startup and
recovery controller to the existing strict HTTP/1.1 `POST /funding` request
binding and response writer. It selects an already retained original payment,
its independent pins, exact expected ownership envelope, and one local funding
evidence candidate. It does not issue a new challenge or accept a new payment.
The existing fresh-intake/service application and all default wiring are unchanged.

Construction captures DATA. `start()` explicitly claims a new epoch and retains
the unchanged payment before HTTP admission. Only the exact original
`PAYMENT-SIGNATURE` bytes may enter the funding verifier. Re-encoding the same
JSON, changing the route, Host, method, transport declaration or body framing is
refused. Missing signatures get no new `PAYMENT-REQUIRED` challenge. Foreign
signatures cannot obtain the recorded result. Public responses and snapshots
omit the protected checkpoint, context, evidence candidate and recovery record.

One admitted original HTTP request may perform one read-only verification of the
same locally selected candidate. There is no wallet, signer, sender, settlement,
grant, service or payout operation. Concurrent requests cannot start another
verification. After a pending/rejected observation completes, an explicit
original HTTP replay may observe that same candidate again within the immutable
receipt attempt budget. There is no background or hidden retry. Exhaustion and
an unverified result return 503; they never become BOUND by expiration or by an
HTTP cache hit. Changed evidence requires a new explicit local selection.

Selected verified funding returns the existing POST-v1 wire frame: HTTP 202,
plain text `BOUND`, `Content-Length: 5`, exact `Vary: PAYMENT-SIGNATURE`, private
no-store caching and connection close. It includes no x402 protocol response
headers. This means recorded selected-verifier funding, never grant activation,
authenticated service delivery, fulfilled quantity, compensation or acceptance.

An exact replay of a verified record returns the same frame without another
verifier call or durable write. A local header/end failure after the verified
commit is a separate response uncertainty. It does not delete the receipt or
authorize another payment. The protected recovery record can select a new epoch
after close or a lost commit acknowledgement; verified recovery does not
authenticate again. A successful local `response.end` call is not delivery.

The actual bounded-ingress completion seam is void and single-use. Close
detaches response and completion capabilities before the underlying application
drains. A late verifier success/error cannot write into a closed or reassigned
response, complete it twice, repair a rejected close or change pending original
bytes. Unknown funding ownership remains held. The backend and physical DB remain
subject to their existing distinct ownership rules.

## Native assembly

`createPurchasedOrderFundingNativeHttpApplication` fixes the real SQLite order
application, native deadline owners and bounded HTTPS ingress constructors. It
retains the selected original before the listener starts, exposes only
`POST /funding`, and preserves protected recovery separately from the public
wire. The caller supplies a dedicated configured database, trusted TLS/server
factory, selected funding verifier, origin, generation and bounded ingress/timer
limits. Those are explicit capabilities, not self-authenticating labels.

The constructor does not open SQL, invoke the server factory or arm a timer.
`start()` performs the actual native startup. The ingress returns frozen
`{status: 'LISTENING'}` / `{status: 'CLOSED'}` results; these differ from the
order application's void close contract. Native close requires both owners and
the ingress timer owner to drain. Unknown or still-owned sockets/requests/timers
are retained and cannot be force-closed or represented as physically released.
Physical database close remains caller-owned and unqualified by this profile.

## Qualification boundary

The DATA composition loads the actual HTTP binding/writer, application, owner,
receipt and deadline cores. It uses a synthetic atomic unique-payment backend,
authenticator, response and timer actuators. It covers original-only admission,
pending to success, persistent pending, exact replay, selected new-epoch recovery,
lost commit acknowledgement, reply loss and late-close observations. DATA
request fields do not authenticate TLS or native events.

The new native assembly receives a syntax check only and remains on the
development branch. No native HTTP application, SQLite, SDK, timer binding,
socket, key, signature or nonce search executes in these DATA controls. Earlier
component native trials do not qualify this added graph. The existing 108-control
hosted CI selection is unchanged and does not run these new cases. Native
funding response-loss composition, full funding/service integration, signer
restart, physical resource release, authentic funding, economic acceptance and
production readiness remain open.
