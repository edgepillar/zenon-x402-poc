# P1 actual native DP loopback qualification selection

Status: DATA policy PASS (16/16); four changed native application files are
source-reviewed and syntax-checked only. No native constructor, TLS, SDK, SQLite,
signing, nonce search or full application test executed. The full native fixture
and launcher are still required, not declared complete by this result.

## Why an actual local selection is needed

The existing RPC owner admits public IPv4 routes at port 443 with runtime-default
PKI. It deliberately refuses localhost/private routes. A real local end-to-end
test cannot use that public selection against a fresh self-signed loopback server.

A separately named local-qualification path now runs through the SAME actual
HTTPS core, retained DP/account owners, retained read session, bounded material
producer, native funding POST transport and V4/SDK/V6 submission graph. It does
not replace those owners with a fake request/fetch/store or copied implementation.
The ordinary public selection remains on its previous input grammar and branch.
Neither selection nor its output is human permission to execute effects.

## Closed route and trust DATA

The new DATA module accepts only immutable own-data route/options records:

- RPC DNS/SNI hostname is exactly localhost; lookup pins exactly 127.0.0.1.
- Port is one integer from 1024 through 65535.
- DP roles use only /rpc/first and /rpc/second; account uses only /rpc/account.
- CA is genuine nonshared unadorned Buffer DATA, from 1 through 65536 bytes.
  Each read owner receives its own bounded copy; caller bytes are not retained
  as that owned copy or cleared.
- Funding is exactly https://127.0.0.1:<same-port>/funding. The top-level local
  factory requires the same borrowed CA input for read and funding options.

Proxies, accessors, coercible ports/profiles, unknown fields, alternate hosts,
IPv6, shared memory, fake Buffer prototypes and caller request/lookup/global-trust
knobs refuse. Byte admission is not PEM/X509 parsing or certificate acceptance:
the actual TLS call still has to authenticate its peer.

The source core supplies its private CA only on the explicit local request,
keeps rejectUnauthorized, node.checkServerIdentity, TLS 1.3, HTTP/1.1 ALPN,
fresh-socket/agent behavior, no session reuse and the existing 78/78/18 read
budgets. The local Host header includes its non-default port. No global CA or
environment override is added.

Node's explicit ca option supplies its own trust set rather than appending the
runtime defaults, and https.request accepts that TLS option. These are API
semantics, not evidence that this new application path ran:
[pinned TLS documentation](https://nodejs.org/download/release/v24.19.0/docs/api/tls.html#tlscreatesecurecontextoptions),
[pinned HTTPS documentation](https://nodejs.org/download/release/v24.19.0/docs/api/https.html#httpsrequestoptions-callback).

The source requests one best-effort clear/drop of its owned CA at construction
refusal or owned close completion. The attempt is claimed before filling; a
failure marks close uncertain. The local native view retains the release outcome.
That path has not executed here and is not secure erasure, native physical drain
or a right to force-close a held store.

## Actual source connection

The dedicated full export is:

`createZenonDynamicPlasmaNativeHttpsOriginalFundingSubmissionForLocalQualification`

Its ninth exact group, localReadQualificationOptions, holds port and ca. It
validates the exact same-port funding URL/CA identity before constructing the
actual funding owner, then chooses the actual retained local read session and
returns the actual V4 owner through the existing private read/funding join.

The new named retained-session and DP/account wrappers choose the explicit
seventh local-options argument of the actual HTTPS core. Existing four/five/six
argument source selections retain the public route validation, port 443 and
runtime-default PKI branch. The delta was reviewed, not executed as a regression
or compatibility test. No default buyer, signing, quote, original packet, schema,
store implementation, owner factory or retry behavior is changed.

## Exact checks and their limits

One direct Node 24.19.0 / darwin / arm64 command passed all 16 authored DATA cases
on its first attempt, with actual exit 0, complete captures and zero fail/cancel/
skip/todo. It loaded only the actual new DATA policy plus builtins, using three
exact read-only input grants, no write/child/worker grant, disabled addons and
compile cache, strict unhandled rejections, a 15-second supervisor and 64 KiB
capture per stream. Inputs/runtime identities and bytes matched afterward.

Coverage includes both DP paths, the account role, closed host/address/port
grammar, getter/proxy/coercion/extra-field refusal, real Buffer brands and limits,
independent copy ownership, nonshared bytes, exact funding URL, entry arities and
the absence of execution/production authority. CA bytes were explicitly synthetic
non-certificate DATA. This was not a TLS test or a performance benchmark.

Four separate node --check commands parsed the current HTTPS core, retained owner
wrappers, retained session and full factory, without imports/construction/runtime.
Their exact source pins and earlier parent pins are in the normalized result.
No syntax PASS or historical native/component result qualifies the new graph.

No new download, archive, qualification scratch, managed root/task, OpenSSL,
socket, SDK, SQLite, key, signature, nonce evaluation or payment occurred.
Historical records and the separately pinned funding-only TLS profile are
unchanged; its two consumed attempts and pending one-shot scope are not reset
or expanded to full DP by this selection.

## Publication and immediate next work

The source branch receives the DATA policy, four changed actual native files,
executed policy test/result and this document. Main eligibility is only the
policy, its executed test, normalized result and this document. Native changes
stay off main; the public main HTTPS implementation is not silently relaxed.

Review pins exact refs/trees/diffs, four open PRs without overlap,
protections/rules and exact-parent CI. Both parent heads have zero
checks/statuses/workflow runs; this is not green CI. Only normal fast-forwards
are eligible, with no workflow, PR/comment or unrelated-branch change.

Next work is the actual pinned full native local fixture and launcher: real TLS
requests to these routes, bounded positive work, synthetic signing, independent
pins, original V6 custody, one original funding POST, lost acknowledgement and
uncertain close/held-store behavior. Exact effects/candidate/connection/storage
ceilings and the source/dependency/manager/disk/capacity review must precede its
own explicit native authorization and launch. The narrower pending funding-only
allowance is not that authority.

Even successful local execution would not prove public port-443/default-PKI
behavior, authenticated Zenon chain identity, an economic pilot or production.
P0/P1/P2 and the full roadmap remain open.
