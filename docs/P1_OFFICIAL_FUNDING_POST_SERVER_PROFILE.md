# Explicit official x402 funding-POST server profile

The actual selected official server previously hardwired GET /paid in both its
SDK route table and private request adapter. The DP original-funding client uses
POST /funding. A matching origin does not make those protocol profiles equal.

A new separately named actual SDK selection,
`createOfficialFundingPostSelectedSettlementServer`, now configures
POST /funding explicitly. It is SOURCE AND SYNTAX ONLY. The new HTTP binding
component has executed separately; it does not qualify the real SDK server.

## Closed HTTP input before SDK request entry

`captureOfficialFundingPostHttpsRoute` reuses the strict canonical HTTPS funding
route and registers a private local route identity. Its companion
`captureOfficialFundingPostHttpsRequest` requires own HTTP/1.1 POST /funding,
the exact Host authority, declared TLS and unambiguous zero-body framing.

Raw header names/values are bounded ASCII DATA. Duplicate names (case
insensitive), ambiguous lengths, transfer encoding, expectations, upgrades,
trailers, malformed arrays, proxies and accessors are refused. The original
PAYMENT-SIGNATURE scalar is copied without decoding or reencoding; null stays
distinct from a paid header. A header admitted by this transport-DATA contract
can still be invalid payment DATA and must be rejected by the actual SDK later.

A cloned/caller-forged route is not a registered route identity. POST and the
unchanged legacy GET binding have separate route identities and cannot
cross-select. These identities are application capabilities, NOT native handle
brands, cryptographic method binding, authenticated peer identity or consent.
The socket encrypted flag remains a trusted native-host premise. No stream is
read, listener created, decoder/settlement/intake called or header sent here.

## Actual source connection, separate from legacy GET

The new POST export selects the actual x402ResourceServer, actual
x402HTTPResourceServer and existing selected-settlement bridge, with no SDK or
success factory. Its SDK route table uses POST /funding; its private adapter and
processHTTPRequest method/path use that same POST profile, not synthetic GET
adapter values. A non-funding resource is refused at construction.

processHttpRequest first calls the new closed POST capture, then delegates to
the SAME actual processRequest operation, synchronous busy/context budget and
original tuple owner. Existing PENDING continuation/resume/close behavior is
preserved rather than constructing another verifier, first-settlement call or
replacement payment. The actual hook still checks tuple identity.

The old createOfficialSelectedSettlementServer still selects GET /paid and its
old snapshot profile. Its scalar resource acceptance is kept; its native HTTP
entry still requires the existing GET route. The shared SDK module changed and
was NOT runtime regression-tested in this round, so it remains OFF main.

## Do not turn settlement DATA into intake BOUND

The actual funding-POST-v1 client expects the actual intake protocol:
202 with the literal BOUND body means locally verified signed-block intake.
It does not mean publication ACK, inclusion, a grant, credit activation or
delivery. The actual intake adapter owns that separate durable transition.

The official selected server instead returns x402 payment-error/settled DATA
and, when admitted, its original pending continuation. An official settled
receipt is NOT an intake record. This change does not map a 200 response into
202/BOUND, manufacture a provider intake, create a grant, or mount the old GET
application/router over POST. The existing HTTPS application/router still
select GET /paid. The native funding transport is still absent from main.

Consequently the full current DP-funding-to-service application is not
qualified by this addition. The next integration must explicitly compose the
ACTUAL intake transition/acknowledgement, actual official POST tuple/continuation
and independently scoped durable service backend. Retain exact original bytes
and independent pins; never reset consumed authority, resend or re-sign because
an observer, response or close is uncertain. Grant authority remains external.

## Actual selected evidence

Twelve SDK/SQL/socket-free HTTP binding cases passed on pinned Node 24.19.0
darwin-arm64 with complete streams, empty stderr and five input identities/
hashes checked before and after. Two DATA commands ran: after the first pass,
two explicit legacy GET arity checks were added to the new unpublished entry.
Both runs' pins are retained; only the second qualifies the final test entry.

The cases exercise exact method/path/Host/zero-body framing, header retention,
unpaid/paid distinction, canonical routes, private route identities, bounds,
duplicate/framing ambiguity, descriptors/proxies and no inferred intake/grant.
Both actual DATA binding modules run; no fake SDK/native module or transformed
application graph is used. Invalid signature text is deliberately admitted only
as a transport scalar; this is NOT a signature/payment verification result.

The actual changed official server file separately passed one node --check
without importing/evaluating its SDK graph. There was no real core package,
native HTTPS, SQLite, key/signature, nonce, intake, settlement or grant execution.
See qualification/official-funding-post-https-request-binding.actual-local-result.json
for exact inputs, current/earlier streams, cases and the syntax-only boundary.

## Publication and remaining qualification

Five selected files are eligible for the source branch. Only the tested
SDK-free binding, component entry, result and this document are eligible for
main. Main's actual official server/application/router blobs remain unchanged;
the new actual SDK POST export is not represented as a main runtime feature.
No hosted workflow is dispatched, and absent current-head CI is not a pass.

The frozen pending DP-only profile remains at SHA-256
`a472e3bcd8840ef4236e395cb918ae5f2a84be9ca45d8f59417c0b77da291933`.
This changed official POST SDK graph is not in it. Its pending scope does not
authorize this graph, and earlier consumed TLS/SDK/SQL/signing/nonce allowances
are not reused. No new managed root/task or temporary qualification files were
created. Existing storage refusals and historical evidence remain protected.

The actual shared SDK GET/POST behavior, native ingress and intake-to-official
response composition need a separately admitted exact current profile. That
profile must also retain same-file V6 originals, explicit selected-grant proof,
pending/lost-ACK/foreign-grant/replay and HELD-close cases. Current input passes
are not full P0/P1/P2, restart, pilot, economic or production qualification.

