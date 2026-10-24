# Native client: stop late socket assignments

The actual default-off native x402/service-credit client now uses a one-shot
request/socket stop gate. This advances the P1/P2 transport/ownership work
without expanding any pending native qualification allowance.

## Source finding and implementation

Source inspection of
`src/service-credit-native-https-client-transport.js` at parent
`8803841292e280812fef3477f33bc6fce0e983d0` showed a gap between client close and socket assignment.
When the request had not yet emitted close, a subsequently assigned socket
could enter handshake timer/listener setup even though client admission had
already closed. Stopping the request did not explicitly stop that future socket.

This is a source-diagnosed condition, NOT an observed native TLS reproduction
or measured latency regression. The reviewed new adapter:

- Uses the same actual captured native request/socket destroy functions through
  `createNativeHttpsClientRequestStopOwner`; no caller factory, fake native
  builtin, request wrapper or source transformation is introduced.
- Claims each owned destroy before entry. Repeated timeout, error, close or
  reentrant callbacks cannot request that same destroy again, including throws.
- Tracks socket-to-entry ownership until the actual socket close. A closed
  request does not discard ownership of its still-tracked socket.
- Installs actual socket close/error tracking before associating and stopping
  a late socket. A stopped/closed association cannot start a TLS handshake timer
  or secureConnect listener.
- Keeps UNKNOWN sticky. Destroy returning is not an actual close observation,
  physical drain, store-release permit or authority to retry.

The original method/path/header/TLS policy, admission/request limits, caller
end() responsibility and public `{ requestImpl, close, snapshot }` contract
remain selected by the actual adapter. It still returns the genuine
ClientRequest. No default buyer cutover, payment replacement or recovery retry
is added.

## Actual selected component result

The exact component and existing close owner ran once on pinned Node 24.19.0,
darwin-arm64: 18 tests passed, zero failures/skips/cancellations/todo. Both
streams completed; stderr was empty. Inputs were pinned before the command
and rechecked byte-for-byte/identity afterward.

The cases cover stop-before-assignment, late socket, normal close, repeated
stop reasons, independent throws, stop/attachment/close reentry, duplicate
ownership rejection, opaque/accessor/proxy inputs, immutable inspection and
sticky UNKNOWN after late drain in a DATA composition with the actual
close-owner component. A 32-repeat stop case enters each declared destroy
callback only once. The full 18-case run entered 24 declared destroy callbacks.

The component test uses declared opaque handles and trusted synchronous
callbacks. It does NOT import the native HTTPS client, alias native builtins,
construct native requests, open TLS/sockets, start application timers, use
SDK/SQLite/nonce/signers or prove physical cleanup. Test-framework timeout
machinery is not a hard cancellation/resource guarantee.

The changed native client separately passed `node --check` with no module
import or construction. Its integration is source/syntax-only, not native
runtime-qualified. No native TLS run was attempted for this change.

Exact input/stream pins and all selected case names are in
`qualification/native-client-request-stop-owner.actual-local-result.json`.

## Publication and remaining native gate

Five selected files are eligible for the source branch. Only the four
component/test/result/document files are eligible for main. The changed native
HTTPS client stays OFF main in this batch: main's existing client blob remains
`ab6740f8e82c0cf06d5c268ce0b6750d87d0ddeb`. Adding the tested component does not
claim that main's current native client has adopted this new stop behavior.

Both parent heads have zero check runs, statuses and workflow runs. That is
not green CI. No workflow dispatch or historical qualification rebinding is
performed. Full P0, P1, P2 and production remain unqualified.

The pending full native DP fixture, its 74 application/profile inputs,
382 package declarations, closed launcher, limits and manifest digest
`a472e3bcd8840ef4236e395cb918ae5f2a84be9ca45d8f59417c0b77da291933` remain unchanged. This native x402 client
is NOT in that DP graph. Neither an eventual DP-only grant nor an older
funding-only TLS allowance qualifies or authorizes this different native graph.

A future native-client run needs its own current source/launcher/runtime/TLS
review and applicable explicit authority. Existing evidence, dirty work,
unrelated refs/PRs, main runtime, storage roots and automations are preserved.
No new managed scratch/task/root, package install or historical cleanup was
used for these component checks.
