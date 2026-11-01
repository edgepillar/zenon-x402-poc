# Explicit non-DP loopback read bootstrap: source candidate

The existing API-credit RUN entry accepts an explicit version-three non-DP
bootstrap for local qualification. Version two keeps its existing public
hostname/path/pinned-public-IPv4 policy and runtime-default read PKI.
The entry command and separate profile/credential/control/output FIFOs are
unchanged. No environment toggle, supplied owner factory, route discovery,
installation or default switch selects the local profile.

The canonical public bootstrap retains all version-two fields and changes
`operatorBootstrapVersion` and `productProfileVersion` to `3`. It adds exactly:

```json
{"loopbackRead":{"port":4444,"profile":"LOOPBACK_QUALIFICATION_V1"}}
```

The port must be an explicit integer from 1024 through 65535. All three
`configuration.fundingOptions.readSessionOptions` endpoints must select
`hostname: "localhost"`, `ipv4Address: "127.0.0.1"` and the existing closed
role paths: two distinct `/rpc/first` and `/rpc/second` endpoints, plus the
account endpoint at `/rpc/account`. Existing timing and request budgets remain.
V3 accepts only the existing non-DP `expectedPublicKey` configuration; material,
nonce, work and wait fields do not select or construct a producer.

The same independently supplied `publicCaPem` bytes bind funding, service and
the local read selection. Pure bootstrap admission checks the entire closed
shape, route/port and CA selection before the credential is read. It parses no
certificate, authenticates no chain/provider and invokes no key/day method.
The bound product takes independent owned copies of the three CA buffers;
release clears its copies without clearing borrowed configuration or a key.

The one-use selection pins those CA digests. Its current-selection guard runs
before the native application opens its file, again after deferred native
module loading before key entry, and again before the native client opener.
Changing any or all CA buffers cannot rebind the selected trust after that
deferred boundary. A refused consumed selection is released and cannot be
consumed again, retried or converted into another original.

The fixed native application chooses the separately named non-DP local
qualification client from that captured selection. It reuses the existing
API-credit wire/store owner and the existing retained local HTTPS read session:
two 78-request read owners and one 18-request account owner for the same
bounded attempt. Each owner retains the established TLS 1.3, hostname/SNI,
explicit CA, fixed IPv4, role path, request-byte, timing and close semantics.
No caller-selected fetch/client/SDK factory or public-read fallback is added.
The non-DP preparer, original checkpoint/pins, spending/signer file, funding,
handoff, service replay and recovery ownership contracts remain in force.

The existing Linux harness preflight can bind this V3 buyer through the same
complete independent purchase/transcript/signer/provider selection. Its summary
states the selected buyer read profile and that no public-read fallback exists.
The externally managed synthetic RPC server and accepted private native
fixtures are still prerequisites. The public DATA fixture uses declared CA and
invalid signature-shaped bytes; it is not a usable native credential set.

This change is qualified only by actual pure DATA controls and parser/source
inspection. No native application, SDK/core, SQLite, TLS/socket, key/signature,
nonce search, PREPARE, interruption or payment has run. A source-level loopback
selection is not OS/network isolation, physical release, chain authentication,
Linux acceptance or production qualification. G0-G5 remain OPEN.
