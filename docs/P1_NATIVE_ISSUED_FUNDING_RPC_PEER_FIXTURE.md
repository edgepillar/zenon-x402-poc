# P1 issued-funding native RPC peer fixture support

Status: **source and syntax only; not imported or executed**. This adds the
actual native RPC peer required by the future issued-application vertical
harness. It is not the complete harness and has no runtime pass.

## Why this source is needed

The historical full-DP fixture owns both RPC and a canned funding response.
That cannot demonstrate that the actual issued application, official x402
server, funding intake and late grant activation work together. It must not
be silently reused as their replacement.

The new support module is
`qualification/issued-funding-post-native-rpc-peer.fixture.draft.mjs`.
Its actual HTTPS listener serves **only**:

- `/rpc/first` and `/rpc/second` for the retained DP collectors;
- `/rpc/account` for the original account-state brackets.

There is no funding route, ready-made BOUND response, application proxy,
borrowed request factory or native-builtin alias. The real funding POST must
target the separately owned actual application, never this RPC peer.

## Source API and original challenge

The one-argument factory is
`createNativeIssuedFundingPostRpcPeerFixture(options)`. Its exact frozen
options contain `tlsMaterial: {key, cert}`, `payerAddress` and
`payeeAddress`. The TLS record is also frozen; its two genuine nonshared
Buffer values are independently copied with a 16 KiB per-buffer cap.
It does not generate keys, read TLS files, create a task/root, or persist data.

The factory returns the actual bound RPC port and four frozen methods:
`bindIssuedChallenge`, `readSessionOptions`, `inspect` and `close`.
There is one native construction per module lifetime, including failure;
an unknown construction does not authorize another instance or root.

The future harness must obtain the actual application's unpaid 402 frame
through native HTTPS, then pass that original frame and resource URL to
`bindIssuedChallenge({resourceUrl, frame})`. The existing actual issued
resource-binding code captures the canonical original header, URL/tags and
requirement. Capture itself does not authenticate the caller's provenance.

The binding is attempted once. It retains one fixed declared chain/profile,
payer, payee and amount. The original unsigned intent data is derived from
the exact issued resource and requirement; the header is not rewritten and
legacy synthetic resource tags are not substituted. The returned DATA
contains the contextv7 planner read input, unsigned subject and original
challenge needed by the actual client and its independent work reference.

`readSessionOptions()` returns the real retained local read route shapes.
The harness must use the separately named actual local actor entry with
`{port: peer.port, ca: certificate}`. The existing actor detaches that CA
and requires equality with funding/service trust before constructing owners.
The application port is separate from the RPC peer port; no funding URL is
derived from the latter.

## Declared RPC sequence and limits

The account path enforces sequential IDs and frontier/account/frontier
method order. Each DP path enforces sequential IDs and its six-method cycle,
including the original intent's exact work-query parameters. Both peer
observations are declared synthetic DATA, not authenticated node/SPV state.

The intended positive-work schedule retains 25409 available plasma while the
declared price advances from 1000 to 1210 over two Momentum increases.
Required fused becomes 25410 and the declared remaining work difficulty is
3000. This module performs no nonce search, signature or original-payment
preparation; those belong to the future actual client/reference path.

Source guards select 78 requests per DP path, 18 account requests and 174
total request/connection observations. They select three concurrent native
connections, one active RPC request, 1024-byte request bodies, 16 KiB
responses, 8 KiB headers and eight header pairs. Only the actual client's
singleton Host/content-type/Accept/content-length/Connection headers are
accepted; no payment signature, chunked body or extra HTTP mode is accepted.

These are source guards and counters applied to observed events, not a
proven kernel-level connection limit or an OS/network sandbox. A future
runtime profile must independently review the complete graph, total
application/RPC connections, allocations and failure behavior. The selection
environment flag is not human execution authority.

## Native lifecycle and uncertainty

The close Promise is claimed before invoking the real native close, including
potential synchronous errors/callbacks. Healthy closure requires its returned
callback, close event, current not-listening state, no raw/TLS sockets, no
active requests and no startup timer. The observation budget is 1000 ms;
blocked event loops are not represented as a hard OS timeout.

The ordinary close path never destroys all sockets or force-closes them to
obtain a healthy result. A refusal may stop its socket and listener, but
permanently records HELD. A late close cannot upgrade that uncertainty.
The peer must be inspected and closed independently from the actual client's
owners and the application/store owners. Calling close during an in-flight
RPC does not establish a clean shutdown or authorize retry.

Only owned TLS copies are cleared after healthy close. Unknown construction
or close retains the native owner/material references; borrowed input
buffers are never cleared. This is not physical erasure or drain proof.

## Current evidence and next work

Two syntax-only Node checks passed; the second covers the final source.
Literal read-only inspection matched four imported local named exports,
the six-file static local import closure and thirteen source properties.
Those matches are neither behavior tests nor full native graph admission.

Zero native listeners, connections, SDK/SQL calls, keys, signatures, nonce
evaluations, OpenSSL commands, child processes, managed tasks/roots or new
qualification scratch were created. No old TLS/native permission was reused.
The exact pins and limits are recorded in
`qualification/issued-funding-post-native-rpc-peer.source-review.json`.

Only this support source, its source review and this document are eligible
for the development-source branch. Main and the default buyer stay unchanged.
The frozen pending full-DP inputs/launcher and historical evidence also stay
unchanged. No current CI pass, live chain observation or production readiness
is inferred.

The next work is the actual case driver, not another canned peer: reserve the
real application port, obtain its native unpaid challenge, perform bounded
reference work and actual signing, retain independent original pins, use
existing-V6 custody and one real funding POST, activate the real synthetic
provider grant, then exercise selected service/replay/foreign/lost-ACK and
independent native close gates. A new complete pinned runtime profile needs
separate scope before execution. P0/P1/P2 and the full roadmap remain open.
