# Scoped native Dynamic Plasma main adoption

## Exact runtime scope

This batch transfers eight existing opt-in runtime files from
`a64ec71060472d324425493799e50685247f0e43` onto base main
`dfc799cef3d2c77f1192bc10c8433c6349f567d9`. It does not switch the ordinary buyer,
server, signer, payment planner or network selection.

The [machine-readable review](../qualification/dynamic-plasma-native-main-adoption.review.json)
pins each transferred file. Applying those eight blobs to base main makes all
69 application runtime modules byte-identical to the earlier
[three-case native DP result](P1_FULL_NATIVE_DP_LOOPBACK_LOCAL_RESULT.md).
The earlier qualified source is
`aaf6967e940780affed0c3517a9f8c4aaafff75f`; its manifest, recipe, raw-evidence
references and result remain unchanged. This is source-byte correspondence,
not a new native run or a relabelled current-main native result.

| Runtime delta | Boundary |
| --- | --- |
| `service-credit-funding-post-native-https-transport.js` | Fixed original funding POST; retained native response/close uncertainty; no automatic retry |
| `service-credit-zenon-funding-post-v1-payer-recovery-owner.js` | Bounded post-result drain, pending-operation reentry fence and opt-in guarded store close |
| `zenon/bounded-json-rpc-https-exchange-owner.js` | Legacy/public route policy preserved; explicit retained budgets, current custody and named loopback qualification |
| `zenon/dynamic-plasma-native-https-original-funding-submission.js` | Actual bounded work, retained reads, SDK/preflight, V6 custody and original POST composition |
| `zenon/dynamic-plasma-original-funding-preparation.js` | Explicit independent pins and one original custody attempt; no replacement signature |
| `zenon/dynamic-plasma-original-funding-submission.js` | Explicit preparation/commit/submission and bounded joined native/store close |
| `zenon/dynamic-plasma-retained-https-read-owners.js` | Two independent 78-request DP owners and one 18-request account owner |
| `zenon/dynamic-plasma-retained-https-read-session.js` | Actual three-owner retained read session; no owner recreation or budget reset |

The historical native cases cover BOUND with clean joined close, lost funding
ACK with the original payment retained UNKNOWN and the store held, and a
post-signing horizon refusal before custody/POST. Neither those cases nor this
adoption establish exhaustive legacy payer behavior, live chain identity,
publication, inclusion, real payments, service delivery or production readiness.

## Additional current local regression evidence

The [new 12-case selection](../qualification/bounded-json-rpc-inert-construction.behavior.mjs)
ran against the actual shared HTTPS core without a substituted native namespace.
All 12 passed, with exit 0, complete streams, empty stderr and no skips,
cancellations or TODOs. Six exact source inputs were rechecked afterward.

The cases cover legacy constructor grammar, the unchanged version-one funding
policy with port 443/runtime-default PKI, public loopback refusal, retained
custody inspection before any request, named local CA-copy release on empty
close, invalid route/profile/arity/accessor/proxy admission, invalid empty
exchange and permanent refusal after the same cached empty-close Promise.

The fixture imports the actual HTTPS/TLS builtins, but it never enters a valid
exchange before close. It calls only construction, inspection, invalid input
and empty close. Its four CA bytes are DATA, not a generated/parsed certificate.
No request, socket, TLS session, SDK, SQLite, key, signature or nonce operation
is exercised. Native request entry is excluded by the selected source paths,
not measured by replacing or instrumenting a native request function.
Zero-count owner views do not independently prove OS physical drain.

One bounded direct Node 24.19.0 command used six filesystem read allowlists,
no filesystem-write, child, worker or addon permission, and disabled compile
cache. Captures were capped at 64 KiB stdout/8 KiB stderr, with a 20-second
outer observation bound. No scratch directory, source/package copy, installation,
archive or new task-storage root was created. These controls are not an OS
network sandbox, CPU cancellation or hostile-runtime guarantee.

## Main and CI stay narrowly scoped

The existing `p0-current-p2-node24-v2` profile and its 17 source/workflow inputs
are unchanged. The human separately approved its existing 27 selected hosted
DATA/component cases on Ubuntu 24.04/Node 24.19.0. No workflow edit, dependency
installation, SDK/x402 package execution, SQLite, socket, key/signature, nonce
or native test is added to that lane. This new 12-case fixture is opt-in and is
not silently appended to npm test or hosted CI.

At the pre-adoption review, both pinned source and main had zero current
check-runs, statuses and workflow runs. This review does not assert hosted CI
green; exact-head execution must be checked separately after transfer.
The four existing open PRs had no overlap with the eight runtime paths.
The main branch was unprotected with no applicable rules; a normal
fast-forward remains required, without force-push or protection bypass.

The issued/grant V1 failure and V2 source correction are not part of this
runtime transfer. All 117 V2 application inputs and its manifest remain
unchanged; a new V2 native attempt remains separately unapproved at this review.
No old one-shot allowance is reused, and no held SQLite/pin evidence is
reopened, adopted, force-closed or deleted.

Full P0/P1/P2 completion, forced-interruption recovery, the issued/selected-grant
vertical slice, authenticated economic acceptance and the supervised live pilot
remain separate gates. Economic pilot and production remain NO_GO.
