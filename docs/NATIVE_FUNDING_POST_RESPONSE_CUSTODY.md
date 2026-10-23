# Native funding POST response custody

## Implemented, with separate evidence scopes

The actual funding POST transport is now implemented in
`src/service-credit-funding-post-native-https-transport.js`. A new explicit
`createZenonDynamicPlasmaNativeHttpsOriginalFundingSubmission` selection
connects it to the actual bounded nonce producer, retained three-owner native
RPC read session and V3 original-funding owner.

These two native modules remain SOURCE ONLY on
`x402/p1-router-late-pending-close-integration-v2`; they were syntax-checked,
not imported or executed. The full native/SDK/V6 graph is not qualified.
Nothing changes the old selections, default buyer, package, workflow or pilot.

The shared response-custody implementation
`src/service-credit-funding-post-native-response.js` is actual production code
used directly by the new native transport, not a fake transport or alternate
validator. Twenty selected component cases passed in one local Node command.
Those cases supply declared event observations without opening a socket or
authenticating actual native TLS events. Do not count these twenty passes as
native integration, a payment, a successful cleanup or full P1/P2 completion.

## Funding transport behavior

The standalone native owner accepts exactly `resourceUrl`, `ca`,
`maxRequestStarts`, `requestDeadlineMs`, `handshakeDeadlineMs` and
`closeGraceMs`. It copies the explicit CA DATA; CA selection is an operational
trust decision, not provider authority or pilot acceptance. Construction starts
no request or timer.

Explicit `fetchImpl` accepts only the existing fixed-resource POST-v1
URL/options: POST, manual redirects, no-store cache, omitted credentials,
Content-Length zero, optional original PAYMENT-SIGNATURE bytes and an actual
non-aborted AbortSignal. It creates the actual native HTTPS ClientRequest,
sends no body and performs no redirect/retry or global fetch call. Headers are
not reconstructed from decoded payment fields.

Native TLS requires certificate/hostname authentication, TLS 1.3 and HTTP/1.1
ALPN. No custom verifier, proxy/agent factory, signer, SDK or store is accepted.
One request is active at a time. The standalone maximum is two starts so a
separately owned challenge and original can use one transport; the DP selection
requires exactly one maximum start because its challenge already exists.

The response core accepts at most 64 body bytes, 64 header pairs and 16 KiB of
header text. Content-Length is canonical and exact. Duplicate headers, encoded
or chunked bodies, trailers, unsafe/shared buffers, partial end and premature
or errored close are refused. Input bytes/headers are detached without invoking
proxy/accessor hooks in the selected controls.

No response is delivered until TLS was observed, headers/body/end are valid,
and BOTH actual ClientRequest close and error-free socket close were observed.
The native transport feeds those actual events to this same core. It then
returns a detached fetch-compatible response for the unchanged funding client
to classify; a transport response is not itself BOUND, inclusion or grant
authority. The event-only component cannot establish that the native adapter
does this correctly at runtime.

Timeout/abort/native error permanently latches uncertainty and prevents another
start. Both an already owned request and any socket assigned after an earlier
abort are tracked/destroyed once. The actual native close-owner implementation
observes tracked handles/timers and can release its local CA copy once after
quiescence. Late drain never repairs UNKNOWN, the original operation or retry
authority. A late error after a response handoff may downgrade current state;
it cannot recall the caller copy or rewrite a historical Promise settlement.

Count/time limits are cooperative bounds, not OS isolation, physical-drain,
hard cancellation, secure erasure, crash recovery or production proof.

## Actual DP ownership connection

The new DP factory accepts exactly `readSessionOptions`, `materialOptions`,
`materialWaitMs`, `wallet`, `store`, `fundingResourceUrl`, `deadlineMs` and
`fundingTransportOptions`. Native funding and payer resource URLs must match;
the native request deadline cannot exceed the payer deadline. Existing native
read options retain their unchanged frozen route/limit grammar.

No fetch, request, owner, preflight or store-writer factory can replace the
actual components. The actual V3 owner is returned DIRECTLY; its public
operation/Promise identities, independent pins, final same-original current
read, V6 atomic custody and explicit submit remain unchanged.

V3 first blocks operation admission. Its source-owned combined read-close
capability then starts BOTH actual native read and funding-transport closes
independently, even if one throws. Clean read close and a clean funding close
with zero tracked handles/timers are required before V3 may close its actual
payer/store, after joining the active operation. Any uncertain close permanently
vetoes that store-close entry. There is no replacement, re-signing, new quote,
reopen, implicit replay, provider READY or receipt-to-delivery inference.

Construction starts no search, wallet signature, SQLite operation or native
request. Failure requests close on already constructed inert owners, without
claiming cleanup. Any consumed store claim remains consumed, and caller-owned
store quarantine duties remain.

## Exact component result

[The component result](../qualification/service-credit-funding-post-native-response.actual-local-result.json)
retains all twenty names, exact source/runtime pins and the complete 4537-byte
stdout stream. Actual Node exit was zero, stderr empty, tests/pass 20 and
fail/cancelled/skipped/todo zero. Independent readback checked raw hashes,
exact names/counts and unchanged component source. No extra component run was
used.

The command used pinned Node 24.19.0/darwin/arm64 and explicit read grants for
only package.json, the component and its test. No test discovery, dependency
install, writable scratch, test child, SDK, SQLite, key, signature, nonce,
product timer, socket or external request was selected. Node Permission Model
is not an OS/network sandbox. Framework timing is not product latency or a
capacity benchmark.

[The separate native source review](https://github.com/edgepillar/zenon-x402-poc/blob/x402/p1-router-late-pending-close-integration-v2/qualification/native-funding-post-and-dp-composition.source-review.json)
pins the unexecuted 63-file relative graph, SHA-256
`09290a23eab53144112653cd9241e2e00569f698a9d21c7b3acb71630c4ad29f`.
That source association is not native loader/package provenance or execution.
Only the response component, component test, actual result and this document
are candidates for main. The new native transport/full factory/source review
stay on the scoped source branch until their matching qualification.

The next gate is a separately reviewed bounded local TLS exercise of the
actual funding transport: complete response/close, partial-body loss, abort
uncertainty and wrong URL/method refusal. This does not import the full DP/SDK/
SQLite graph. Complete P1 native HTTPS/x402/selected-grant/V6 qualification,
P2 interruption/reopen, P3 runtime/economic acceptance and P4 measured capacity
remain separate open work. Existing V2/V3/native results and permissions are
not rebound to this new graph.
