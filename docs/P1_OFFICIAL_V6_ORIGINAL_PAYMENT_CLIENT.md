# P1 retained-original official/V6 client composition

## Implemented application step

The default-off `openOfficialV6OriginalPaymentClient` composition connects the
**actual** official 2.23 client to **one actual existing V6 payer/HTTP owner**.
It accepts no injected SDK/store factory and changes no buyer/server/CLI default,
schema, package dependency or historical qualification entry.

Its SDK/SQL-free `createOriginalPaymentCheckpointClient` adapter is separately
implemented and tested. The effectful factory passed a separate Node --check
syntax-only command, but was not imported, opened or executed by this qualification.

## Original-payment binding

The host supplies one externally retained canonical checkpoint and independent
binding/digest pins. The original must describe the same HTTPS origin and exact
zero-body GET `/paid` route. The service policy must name that origin's exact
`/service-credit/v1/execute` endpoint. The existing V6 owner continues to enforce
the independently selected grant and original-service-request dispatch rules.

On one explicit `restoreOriginalPayment({ paymentRequiredHeader, expectedPins })`:

1. Check the caller's original challenge header and independent pins before
   entering the actual V6 read capability.
2. Read/compare the complete retained checkpoint, then let the actual official
   client bind its original selected context. Its local creator reads that same
   V6 checkpoint again and returns only the already-retained payload DATA.
3. Validate the SDK's encoded DATA against every original transaction, resource
   and requirement field; re-read the checkpoint using the same external pins.
   Return ONLY the retained original PAYMENT-SIGNATURE bytes.

The official 2.23 SDK constructs payload members in a different order from the
original preparation packet. JSON property ordering therefore need not match,
and absent/empty supported extensions are equivalent DATA here. This does not
authorize changing a transaction field or sending a reconstructed header: the
SDK encoding is used for comparison only, never selected as the outgoing value.
Nonempty extensions, changed nonce/hash/resource/amount/context and noncanonical
base64 are refused. Signature authenticity is not established by these checks.

The adapter consumes its creator before entering a reentrant reader and never
resets that attempt. Every read requires independently supplied pins and exact
checkpoint equality. Failed/malformed reads latch HELD; close preserves that
uncertainty rather than converting a late result into permission. The SDK-free
adapter borrows its read capability and never closes a store itself.

## Real resource ownership and remaining funding boundary

The effectful factory statically calls the actual existing V6 HTTP-owner
constructor and the actual official-client constructor. It does not accept a
replacement open/prepare/sign/verify callback. Its checkpoint reader captures
that SAME owned payer; no server-side payer or second recovery connection is
opened. Construction performs no network request.

Opening V6 can write its existing owner epoch. This is NOT SQLite readOnly mode.
The factory does not create, migrate, recover, prepare or fund a store. The host
must supply an appropriate existing V6 store and its independent originals/pins.

Explicit service `submitOriginal` and recovery views delegate to the same actual
V6 owner. Its existing BOUND/preflight/selected-grant/dispatch fences remain in
force. No funding state is promoted from an x402 receipt, and this composition
does not add a funding send, replayUnknown, activation or reconciliation method.
Returning the retained payment header is DATA, not authorization to transmit it.
The original funding transition and current service authority remain explicit
host-owned operations in the complete application flow.

The root claims an active operation before callbacks can reenter. Close revokes
admission, waits for that operation, then closes the actual V6 root once through
a cached native Promise. An uncertain original read or failed actual close keeps
CLOSE_UNKNOWN. This is not a hard cancellation deadline or physical cleanup proof.

## Source-bound component qualification

24 selected component cases passed in one bounded Node 24.19.0 / macOS arm64
command, with complete TAP output and empty stderr. Seven current source inputs
totaled 77,778 bytes. The actual official package, V6 store/factory and HTTPS were
NOT loaded. All checkpoint/reader callbacks used declared in-memory DATA;
SHA-256 metadata hashes did not generate or verify signatures.

The earlier 23-case iteration had 22 passes and one failure: a wire validation
error escaped with the wrong error class. The adapter now maps it to a stable,
path-free local error and has an additional regression for that boundary.
The previous result/source digests and privacy-sanitized failure output remain
separate in the actual result; the failure is not relabeled as a pass.

Both component executions used in-memory bounded output and created no storage
scratch files or managed tasks. The additional syntax-only command also exited
0 with empty streams and no module imports. There was no install, SDK, SQLite, socket,
key/signature operation, nonce search, PREPARE, payment or hosted CI execution.
The earlier single-use native HTTPS permission was not reused.

See `qualification/x402-original-payment-checkpoint-client.actual-local-result.json`
for complete final TAP, exact source pins and the separately retained failed
iteration. Component passes do not qualify the effectful factory.

## Publication and roadmap boundary

The tested SDK/SQL-free adapter, its fixture and this evidence may be transferred
as a small opt-in foundation to main when all five existing dependency blobs
match the executed graph. The source-only effectful factory remains on the
working branch until its separately scoped real SDK/V6/native application
qualification is available. A main evidence/code transfer is not a default
buyer switch or production-readiness claim.

Full P1 still requires ONE current-source actual application flow covering
funding success/pending, response loss, foreign-grant rejection and exact
original service replay through native HTTPS, the actual official package,
V6 payer custody and the selected service ledger. This increment supplies the
retained-original client connection; it does not substitute its 24 component
cases for that end-to-end requirement. Hosted CI, restart/physical lifecycle,
provider/runtime acceptance and the economic pilot remain separate; pilot NO_GO.

