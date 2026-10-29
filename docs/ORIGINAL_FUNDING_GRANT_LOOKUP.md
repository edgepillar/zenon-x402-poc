# Original funding to existing grant lookup

A lost funding acknowledgement can leave a buyer with the original payment but
without a grant ID. The existing provider binding reads a committed grant only
by its resulting ID. The ledger now supplies `readOriginalFundingGrant` for the
independently retained original identity, using its existing transaction and
capability indexes rather than choosing a grant from a balance or similar
amount. No grant ID is supplied to that lookup.

All of the following must match: exact Zenon transaction, network, chain
identifier and genesis, asset, amount, payee, offer ID/version, holder,
capability commitment, payment-resource/requirement/intent digests and funding
commitment. A missing or different record returns NOT_RECORDED and no grant.
That result does not prove absence of funding or liability and does not permit
another payment, signature, activation or service request.

The lookup returns bounded history: the existing grant/activation IDs, stored
lifecycle and exact unit counters. It does not refresh expiry, consult the
clock or pricing, write a revision, release reserved units or create a grant.
A stored ACTIVE value is not current authority. EXPIRED and REVOKED originals
remain recoverable history. Delivery liability is explicitly NOT_QUERIED.

## Holder-authenticated read API

The actual reader core captures one exact query and verifies a caller-supplied
request-capability proof before one selected-store read. Its fixed request uses
GET, route ID `original-funding-grant-read-v1`, and a `funding_lookup_` scope
derived from the original transaction. This namespace cannot be a ledger grant
ID. The canonical query, including every payment binding and request ID, is
covered by the domain-tagged body digest. The existing capability verifier
checks the holder key against the selected capability commitment. Its constant
maxCostUnits field is a proof-schema field; this reader performs no debit.

The native binding hardwires the real existing SQL store method and capability
verifier. It borrows the store and never opens, creates, migrates or closes it.
The pure reader accepts declared ports only for component qualification; JSON
cannot select those native capabilities. A failed proof does not read SQL.
Unknown or failed store observations, pending callbacks and reentry hold the
reader; close only revokes that reader's admission. No close or lookup retry is
generated automatically. Returned records are rechecked against the independently
captured original and cannot carry payment, activation or dispatch authority.

## Integration and evidence boundary

This is an application-internal read API, not a new x402 wire scheme. No HTTP
route or buyer CLI command is added, and the current fresh-intake provider root
is not silently reopened or replaced. The next integration must connect this
exact API to the selected provider/holder channel and preserve the separate
funding and delivery-liability records. The original client handoff still
requires its explicit admission; a returned historical grant ID does not supply
that admission. Funding ACK and full G1/G2 acceptance remain OPEN.

Qualification exercises the actual in-memory model and reader core, declared
trusted activation metadata, declared verifier callbacks and in-memory state
reconstruction. Metadata fixtures do not authenticate funding. No real proof,
key, signature, SQLite, SDK/core, network, process interruption/reopen or native
resource release executes. The actual SQL and capability binding is source and
parser-only. The unchanged required 108-control CI remains a separate lane.
