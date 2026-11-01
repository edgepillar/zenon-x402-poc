# Raw-reply G1/G2 source acceptance composition

The existing 100-call recorded-result scenario now joins the actual command
channel, command session, host, recorded-result product wrapper and original
service-command reply reader. Its memory fixture retains every complete raw
service reply line before JSON reconstruction. The genuine capture for the
currently awaited command validates that exact line.

The scenario emits its next explicit service command after the prior reply
passes. It performs the existing prepare, independent-pin commit, funding and
handoff sequence, then 100 distinct service requests, one exact original replay
and close. The clean source case requires 106 input commands, 105 host replies
and 101 decoded service replies. Close has no result line.

The replay keeps the same captured request/proof/URL object. Its exact response
JSON matches the first response. Original payment bytes, the reference ledger
and one declared funding/grant remain; 100 submissions/debits/executions consume
the grant once. The original client/wallet stop paths are entered once. These
are declared-owner observations, not native physical-release proof.

Two additional source cutpoints reject a foreign request in the first committed
service reply, and a stale correlation ID in the replay reply after 100 calls.
Consumer rejection is injected at the declared memory output callback boundary.
The real command session receives a failed write, retains its original exact
result line with `writeCallbackCompleted: false`, and returns CLOSE_UNKNOWN.
The next input is not emitted; no second funding, grant, debit or execution is
authorized. Reading/decoding the retained line is NONE-authority history and
does not repair the session or establish delivery.

The failure fixture preserves the producer's original line; only its declared
consumer observation is altered. It does not simulate a real TLS connection,
kernel pipe failure, independent process crash or durable reopen. Native
SDK/core/SQLite/HTTPS, real proof authentication, Linux, process fencing and
physical release remain unestablished. G0-G5 remain OPEN.

## Bounded qualification

The fixture uses the existing pure request/result codecs, spending/application
owners and reference ledger. Funding, grant activation, proof, file, SQL and
native-child capabilities are declared memory ports. No key, signature, nonce
search, actual PREPARE/payment or native application is executed.

The task budget counts source aliases and referenced source objects, both
explicit stdout caps, the unchanged one-MiB stderr cap and bounded additional
scratch. The unchanged manager accounts package/evidence JSON separately under
its protected metadata policy. This avoids charging a second arbitrary metadata
allowance to the task while retaining its full four-MiB quota, every-root
reservation check, production free-space floor and command monitoring.

The default native graphs, package catalogs and approved hosted
108-control/22-input profile are unchanged. Exact DATA/runtime bindings and
retained parser origins are recorded separately from native acceptance.
