# P2 funding POST late-socket ownership

Status: native adapter source fix implemented on the development branch.
24/24 selected local DATA composition cases passed. The changed adapter was
syntax-checked only: it was not imported or executed over TLS.

## Source-diagnosed gap

The previously published funding transport rejected a first socket arriving
after request close before associating it with owned close tracking. On the
other first-socket path it created the handshake timer before consulting the
stop/close gate. Request destruction also did not consult the shared stop
owner's observed-closed request association.

These are source-order findings, not a reproduced native race, service outage
or measured resource leak. The retained old adapter blob is
`ea47b0e9cc9479f6bb98b07b3b886d6100c630e3`; its SHA-256 is
`3b3fec921b46c62ed7557043f99cffb2e1a12f515bf4e607ea8f61525db28b7c`.

## Actual implementation change

The [development funding transport](https://github.com/edgepillar/zenon-x402-poc/blob/x402/p1-router-late-pending-close-integration-v2/src/service-credit-funding-post-native-https-transport.js)
now uses the existing `createNativeHttpsClientRequestStopOwner`, already used
by the other native client. No new injectable native request or destroy factory
is accepted.

- Mark request/socket closure and drop the corresponding retained reference
  before entering another stop path.
- Track a first late socket and install its error/close listeners before the
  shared stop gate may destroy it.
- Consult the shared handshake permit before creating a TLS timer or installing
  the secure-connect listener. Recheck the permit on the secure-connect path.
- Claim request and socket destruction independently before entry; reentry,
  throws and repeated reasons do not acquire another claim for an owned handle.
- Classify request close without an observed socket as permanently uncertain,
  release its closed request-entry accounting, and still track a later socket.
  A later drain cannot repair the uncertain operation/close Promise.

The fixed POST URL, original header bytes, TLS version/authentication/ALPN,
response custody, request limits, default buyer and store/signing behavior are
unchanged. A duplicate unexpected socket event still fails closed.

## Actual local evidence

The new DATA entry composes the actual existing stop, close and response-custody
modules. Its opaque handles, close observations, tracking sets, timer counts and
destroy callbacks are declared host DATA, not genuine native objects/events.

24 cases passed in one local Node 24.19.0 command: actual exit 0, complete
1,942-byte stdout and empty stderr. Cases include normal response with both
close orders, abort/close before socket assignment, late socket after unknown
settlement, no second destroy/release, destroy throws/reentry, closed-handle
exclusion, partial/errored response, and late drain after deadline.

The changed adapter separately passed one syntax-check command with complete
empty streams and exit 0. Source review checked the actual tracking -> stop ->
handshake gate order and the new shared-owner connection. That source check
is not runtime/native event-order qualification.

All six selected source files and the 230-file protected-input pin set matched
their preflight pins after execution; overlapping sets are not additive. The
protected set includes the prior frozen profiles,
results and unrelated application files; they deliberately exclude the one
native adapter changed in this candidate. No old result was edited to appear
current. No actual SDK, SQLite, key, signature, nonce, socket, product timer,
child, installation, database fixture, task-storage root or manager was used.
Node's prior byte hash was reused only with unchanged full nine-field identity;
the 121 MB executable was not read again.

## Main and native qualification boundaries

Main receives only the DATA entry and these reports. Main's native adapter
stays at the old pin pending proportionate native regression. The existing
27-case hosted profile remains unchanged; it does not run these 24 new cases
or the native adapter.

The historical 147-application/404-package installed-source read remains tied
to its recorded source ref. This candidate changes one of those application
modules, so that old result does not qualify the changed current graph.
Historical native/capacity profiles, launchers and results remain byte-unchanged.
No old native permission is transferred or consumed.

A fresh source-bound native regression must test real late assignment,
request/socket destruction and close, no post-stop TLS work, normal complete
response and uncertainty retention. Its runtime/launch/resource authority is
separate from these DATA passes. No new native run was requested or performed
by this source selection.

Full P1/P2, measured capacity, real payment/pilot, physical cleanup, store-close,
automatic retry/re-signing and production readiness are not established.

Result: `qualification/funding-post-native-stop-lifecycle-data.actual-local-result.json`.
Authority remains `NONE`.
