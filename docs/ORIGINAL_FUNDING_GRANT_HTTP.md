# Original-funding grant history over a fixed HTTPS query channel

The opt-in history channel finds an existing grant using the exact retained
funding identity when a buyer has no grant ID. It is part of the G2 funding ACK
recovery work. A history response never authorizes another payment, grant
activation, service dispatch, wallet release or compensation. `NOT_RECORDED`
also leaves reconciliation and the spending reservation unchanged.

The selected provider's canonical `https://origin/funding` URL and independently
retained payment-resource digest select the fixed GET endpoint
`/service-credit/v1/original-funding-grant`. No redirect, query string, body,
alternate Host, payment-signature header or caller-selected route is accepted.
`Original-Funding-Query` carries canonical base64url JSON with the original
identity and request ID. `Authorization: ServiceCredit ...` carries the existing
capability proof in its separate `funding_lookup_...` read namespace. Query
metadata and a foreign resource digest are rejected before verification or a
store read. The production binding uses the actual capability verifier and the
borrowed service store's original-funding history reader. It never opens,
refreshes, activates, mutates or closes that store.

The dedicated ingress factory accepts exactly this one GET target and repeats
its binding check at admission reinspection. The ordinary POST and official
x402 factories retain their existing method contracts. The native downstream
is supplied explicitly to that ingress, together with the existing bounded
Node HTTPS server factory. It is an independent opt-in query listener; it does
not replace, stop or recover an existing funding listener. An uncertain old
owner must remain held. Bind refusal is not authority to interrupt it.

The holder selects `createOriginalFundingGrantNativeHttpsTransport` with the
captured route and fixed query URL. Its configuration requires exactly one
request start. `read(query, proof, signal)` performs no retry or key operation.
The shared native transport retains TLS 1.3, CA/hostname validation, bounded
deadlines, abort handling and actual request/socket close observation. The
query response custody holds at most 8192 bytes; the original funding POST
custody remains limited to 64 bytes. Exact length, canonical JSON, resource
identity, no-store headers and the response's no-authority fields are checked
before a history result is returned. Malformed or lost responses keep UNKNOWN
sticky. `close()` remains explicit and cached. A returned history record is not
proof that the transport owner closed cleanly; callers must inspect its close
result and retain uncertain ownership.

## Evidence and remaining acceptance

The DATA controls exercise actual codecs, the synchronous HTTP reader core,
the in-memory ledger, declared capability-verifier ports and bounded response
custody. They perform no cryptographic proof verification, SQL, TLS, socket,
SDK, key generation, signature, nonce search, payment or native application
execution. Native modules receive source review and parser-only checks.

The holder query is mounted in the explicit source-only
[`--funding-grant-query-fd` CLI mode](ORIGINAL_FUNDING_GRANT_QUERY_CLI.md).
It requires the original checkpoint/independent pins, retained selection and an
existing read proof; it creates no key or signature. The single owner requires
the transport's actual CLOSED receipt and fresh zero-count snapshots before
result output. The issued-funding root is not replaced, and provider listener
startup remains an explicit separate composition. Native proof/TLS composition,
restart/ownership admission and the single Linux product entry still need
acceptance. Funding ACK loss, fresh-process reopen, release and G1's 100-call
scenario are not established by these DATA results. Existing historical native
records remain bound to their own source/runtime versions. G0-G5 remain open.
