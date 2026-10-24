# Funding-POST original checkpoint connection

A separately named POST /funding checkpoint selection now connects the actual
DP funding resource shape to the actual official/V6 client implementation.
The existing GET /paid profile is not widened or silently reinterpreted.

## Why this connection was needed

The existing `createOriginalPaymentCheckpointClient` accepts only zero-body
GET /paid originals. DP's local native funding selection uses POST /funding.
A matching origin does not make those method/path contracts interchangeable.
Changing a configuration URL must not reinterpret an already retained /paid
challenge, signed payload or independent checkpoint as a /funding payment.

The new SDK/SQL-free exports are:

- `captureFundingPostCheckpointRoute`: exact canonical HTTPS /funding, fixed
  POST and empty body DATA. It rejects query/fragment delimiters, userinfo,
  noncanonical normalization, another path and port zero before any I/O.
- `createFundingPostOriginalPaymentCheckpointClient`: the same complete-byte,
  independent-pin and one-context fences, selected explicitly for that route.

Both constructors remain closed: no method/path/request factory can be added to
the input to turn them into a generic HTTP client. The legacy GET selection
still returns exactly its original resourceUrl/requirement pair, with no POST
profile. Only the new selection additionally carries an immutable
`requestProfile`.

A POST /funding checkpoint cannot enter the GET constructor, and the POST
constructor cannot reinterpret GET /paid headers from the same origin.
The profile describes application DATA. It does NOT authenticate an actual
native request/Host/TLS peer or cryptographically bind a previously unrecorded
HTTP method. The existing checkpoint does not gain a new signed method field.

## Actual source connection to the official/V6 client

`openOfficialV6FundingPostOriginalPaymentClient` is the new SOURCE-ONLY export
in `src/x402-official-v6-original-payment-client.js`. It selects the new POST
checkpoint adapter, the actual existing V6 SQLite HTTP owner, and the actual
official selected-payment client. No SDK/store factory is supplied by tests.

The configuration still consists of payerOptions, originalPayment and official.
Original resource URL, complete serialized checkpoint and independently retained
pins must agree. The service resource remains the exact same-origin
/service-credit/v1/execute path and its grant remains explicitly selected.

Only explicit restoreOriginalPayment invokes the official envelope creation.
The stored original payload is returned without signing/PoW; SDK-reordered DATA
is checked, but only the exact retained original PAYMENT-SIGNATURE bytes leave
the adapter. The new mode returns requestProfile alongside those bytes.
It neither performs another funding POST nor supplies permission to send them.

Service-only submit/read operations continue through that SAME actual V6 owner
and existing selected-grant/original-proof/intent/quarantine controls. BOUND,
a restored header, envelope construction or a cached receipt activates no grant
and establishes no current dispatch authority or service delivery.

The host must separately finish the original DP owner's lifetime and preserve
its external packet/pins. A HELD/uncertain funding owner is NOT automatically
closed, reopened, retried or replaced by this factory. An explicit existing-V6
open can advance owner_epoch: it is not SQLite readOnly mode or a missing-file
creation fallback. Actual native socket lifetime/close remains a separate gate.

The old openOfficialV6OriginalPaymentClient keeps its GET-only selection. The
shared open implementation changes on the source branch only; it has not been
loaded or executed with the real SDK/SQLite in this round.

## Current selected evidence

A NEW versioned component entry ran once on pinned Node 24.19.0 darwin-arm64:
36 tests passed, zero failures/skips/cancellations/todo, complete streams and
empty stderr. It contains the earlier 24 GET regression case bodies plus 12 POST
cases. The earlier test file and result remain byte-identical historical
artifacts; their old result is not relabeled for this changed shared core.

The new run covers strict route separation/canonicalization, exact original
header selection after reordered comparison DATA, independent per-call pins,
empty body, unchanged transaction fields, sticky HELD, immutable method profile
and preservation of the legacy two-field GET selection. Eight exact source
inputs were verified before and after reporting.

These are actual DATA component tests, not execution of the official package,
V6 store, socket/TLS, valid signature, nonce search or real payment. The declared
signature text is deliberately NOT a cryptographic signature. The changed
effectful official/V6 file separately passed node --check, with no imports or
construction. This is not full P1, ordinary installed namespace, native close,
restart, pilot or production qualification.

See qualification/x402-original-payment-checkpoint-post-v2.actual-local-result.json
for exact source and stream digests, case names and source-only boundaries.

## Publication and next integration gate

Six selected files are eligible for the source branch. Five pure-route/core,
component-test/result/document files are eligible for main. The changed actual
official/V6 module remains OFF main: its existing main blob must remain
`ee582ed684cd73c5ae92d9583aa7057d111baaea`. Thus the new effectful POST export is not
claimed as a main runtime feature. Current-main full SDK behavior is not
qualified merely by this DATA pass.

The pending full native DP profile remains unchanged at manifest SHA-256
`a472e3bcd8840ef4236e395cb918ae5f2a84be9ca45d8f59417c0b77da291933`. None of these changed modules is in that
selected DP-only graph. An eventual approval for it does not authorize this new
official/V6 POST graph. Old native allowances, storage metadata and failures
are preserved; no extra native test, store task/root, installation or cleanup
was performed.

The next end-to-end work is explicit clean funding-owner handoff, same-file V6
reopen with independent originals/pins, actual official POST restoration and
one-grant service execution/reconciliation under separately admitted runtime,
transport and authority. Do not implement a GET/POST relabel, auto-resign,
automatic resend or store-force-close to make that composition pass.
