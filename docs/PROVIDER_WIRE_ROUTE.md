# Fixed receipt product on the service-credit wire route

The fixed provider receipt product now prices `service-credit.execute.v1`, the
existing route identity accepted by the buyer HTTP capture and declared by
`SERVICE_CREDIT_HTTP_ROUTE_ID` in the server HTTP binding. Its endpoint remains
`/service-credit/v1/execute`. The product name `execution-receipt-v1` and cost
policy `execution-receipt-unit-v1` remain unchanged; they identify business
behavior rather than an alternative wire route.

Previously, the buyer accepted only `service-credit.execute.v1` while the
fixed provider cost callback accepted only `execution-receipt.v1`. Thus a buyer
request could pass the real wire capture and fail that provider's cost policy.
The previous provider unit control supplied its internal route literal directly
to the callback and did not connect it to the buyer wire grammar. That control
now admits the same request through the actual buyer capture before pricing.

The fix admits one existing route, without aliases or broader pricing scope.
Method, empty-body digest, JSON representation, selected offer, cost policy,
grant identity and unit price still have their previous checks. Other offers,
changed request metadata and the former internal route label are refused.
No challenge, purchased term, proof, funding, grant or transport is replaced.

The DATA controls compose actual buyer wire capture, fixed provider cost and
receipt callbacks, and the reference ledger. One explicitly declared mock
activation supplies one model grant. They cover 100 distinct accepted requests,
exact replay, JSON state reconstruction, held/unknown reservations and budget
refusal without another debit or receipt execution. The supplied execution IDs
and activation records are declared fixture metadata; they are not native
execution-journal or funding evidence.

These controls do not authenticate a capability or provider. No installed SDK,
SQLite, socket/TLS, key/signature, nonce search, real PREPARE/payment or native
application is executed. JSON reconstruction is not a fresh-process reopen or
durability claim. Native/Linux 100-call acceptance, physical release and G0-G5
remain OPEN. Historical qualification keeps its original source/runtime scope.
