# Issued grant snapshot: one shared field-name and value budget

## Implemented and locally checked, 2026-10-24

The actual pure issued-funding application binding now charges ordinary record
field names against the same 131072-byte UTF-8 budget as string values. The
4096-node and depth-16 limits remain unchanged. This is a bounded DATA contract
correction, not proof of an exploitable HTTP/SQL issue or native grant authority.

Previously an otherwise matching declared grant could include a field name
larger than that byte budget and still consume the one-use DATA grant pin.
The same new fixture first failed against the old source with a missing expected
exception. After the correction all ten cases passed. The existing sixteen
binding/custody DATA cases also passed freshly against the changed source;
their historical report was not relabeled or rewritten.

See the [actual local record](../qualification/issued-grant-snapshot-budget.actual-local-result.json)
and [ten-case regression](../qualification/issued-grant-snapshot-budget.behavior.mjs).
The retained old binding SHA-256 is
`5e404dbeebc107f1aafe29d1ea37f1bf1f3bcede875864c44d88c81303f94468`;
the corrected binding is
`e5ff9d77cb6ad590b26591ef559ac35523f0a60ade40accc775ea2bf128bea48`.

## Exact contract and preserved behavior

The regression covers a single oversized name, aggregate smaller names, nested
names, UTF-8 multibyte names, the exact combined key/value boundary, ordinary
bounded extensions, accessors/proxies, existing structural limits and wrong
original scope. Getter and proxy hooks remained zero. An over-budget record is
refused before it consumes the original DATA pin; a later valid matching record
can still be compared. A successful original pin remains one-use.

Field names and string values share one budget across the entire detached
record. This is not a total JSON encoding budget: array indices and JSON
punctuation are not included. It is not an OS heap or execution sandbox.

The challenge, pending/settled transitions, original transaction and commitment
comparisons, foreign-grant rejection and independent BOUND/grant domains remain
unchanged. The pure binding still authenticates no issuance, committed record,
native event, signature, grant activation or service delivery.

## Evidence boundaries

The ten new and sixteen existing local cases ran on Node 24.19.0 / Darwin arm64
with selected source read access, no filesystem writes, children, workers or
native addons. Source pins were checked before and after each run. There was no
package installation/execution, SDK, SQL, socket, key/signature or nonce work,
and no qualification scratch or new storage root.

The unchanged hosted 27-case profile is a separate lane and does not execute
these new regressions. Any success on that lane must be attributed to its exact
source commit; this local report does not claim a fresh hosted result.

The prior three-case full-DP native inventory remains unchanged. The separate
issued/grant V1 native failure and original V1/V2 inventories are retained.
Because this real binding changed, the old unexecuted V2 source selection must
not be run as if its pins still matched. A coherent full-graph V3 selection and
a fresh narrowly approved native attempt remain separate work; no old native
allowance is reused by this fix.

This batch does not activate a default buyer, change a signer, qualify live
payment, establish full P1/P2 or make the system production ready.
