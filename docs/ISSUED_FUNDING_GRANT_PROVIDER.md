# Issued funding, service and original-grant history on one provider origin

This source candidate connects the holder's explicit original-grant query to
the same provider origin as funding and service. Native acceptance remains OPEN.

`createIssuedFundingGrantNativeApplication` hardwires the actual intake/core
composition, borrowed SQL-store methods, scoped durable service session,
original-grant reader/verifier, bounded mixed ingress and Node HTTPS server
factory. Construction can enter the existing intake/SDK; it is not a DATA
operation. The published native modules are reviewed and parser-checked only.
Importing or launching them is not part of the local qualification.

The explicitly selected mixed ingress permits exactly these routes:

| Method | Target | Contract |
| --- | --- | --- |
| POST | `/funding` | Existing canonical zero-body funding POST; original 402/202 and Vary semantics |
| POST | `/service-credit/v1/execute` | Bounded JSON and existing scoped service capability admission |
| GET | `/service-credit/v1/original-funding-grant` | Canonical private query/proof; stored history only |

The original POST-only, official x402 and dedicated query-only factories retain
their contracts. The mixed factory is a separate source choice, with three
exact targets and one selected origin. Its metadata check runs at initial
admission and each reinspection. A query never selects another port or listener.

The native factory takes `funding`, `service` and `transport`. Funding keeps
the existing intake/official options and borrowed stores. Service has exactly
`store`, `execute` and `selectedDurationMs`. Transport has `origin`,
`generation`, `limits`, `bind` (`host`, `port`, `exclusive`) and `tlsMaterial`
(`key`, `cert`). The native factory supplies the actual monotonic clock,
callback-first schedule/cancel runtime and HTTPS server factory. JSON cannot
select test factories, timers, a verifier or a store implementation. TLS
material is copied by the real server factory only when the owned start enters
server construction; a refused controller constructor acquires no TLS copy.

The funding challenge is durably issued by the existing native intake
composition. Its exact resource selects the query route and resource digest.
The query borrows the same service store and verifies the existing read proof
before the exact original-funding lookup. It never opens, migrates, closes,
activates or debits that store. Query requests are refused while funding,
service or committed-grant admission is active. The external grant-admission
and pending-reconciliation operations also refuse an active query. A returned
grant ID is historical DATA and does not call the service-admission operation.

The controller uses the actual ingress's four arguments: request, response,
opaque transport context and completion capability. The query bridge claims
completion before any reader/writer call. This corrects the earlier
three-argument native query adapter, which had received parser checks without
native execution. The opaque context is not a wire flag, TLS authentication or
a replacement for the capability proof. One completion is consumed once.
Query callback success is not forwarded until its call returns void; malformed
returns or duplicate/failed completions keep the application uncertain.

Logical close retires funding, service and query admission once. Both SQL
stores remain borrowed. Native ingress remains responsible for its own server,
handlers, sockets, timers and close verdict. A HELD owner is not replaced,
force-closed or reopened. The fresh-intake startup fence rejects existing BOUND
rows; this factory does not silently implement provider restart recovery.

## Evidence scope

The actual pure controller, route admission, four-argument bridge, existing
funding/grant binding, original reader, in-memory ledger and holder close owner
are composed under declared funding/service/listener/verifier/writer/timer
ports. Synthetic activation metadata is not authenticated issuance or funding.
No SDK/core package, SQL, TLS/socket, key/signature, nonce, PREPARE, provider
setup or native process runs. The unchanged hosted 108-control profile is
separate from these local DATA controls.

The protected V2 provider draft is preserved. Its small listenerless intake
dependency is adopted byte-for-byte, while a new controller/native binding adds
the shared route profile. No default operator or active provider is cut over.
Actual same-origin SDK/SQL/TLS acceptance, ACK loss, fresh-process reopen,
ownership transfer, physical release, Linux and G1's 100-call scenario remain
open. G0-G5 are not completed by this source/DATA change.
