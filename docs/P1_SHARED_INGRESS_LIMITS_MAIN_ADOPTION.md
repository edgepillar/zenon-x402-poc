# Shared ingress limits: scoped main adoption

## Change and source boundary

This batch brings the shared 13-field limit validator and the actual ingress
delegation from `2263964279f4723bbfeccd3c0aab0687f5668be8`
onto base main `c2cd06aa863b89a0e0bfec76705859ae758a164f`.
No other runtime file, default buyer, signer, planner, route profile, workflow
or package/lock declaration is changed.

The existing main ingress already rejected a 5,000 ms response deadline with
a 1,000 ms close grace. This is **not** a claim that main previously accepted
that invalid combination. The change extracts its same limits into one shared
DATA-only validator, also used by the separately authored issued application,
and removes the duplicate local validation body. It preserves the exact numeric
ceilings, concurrency/lifetime relationships, deadline ordering and the
connection-starts + request-starts + 32 metrics reserve.

The issued application's early SQL/SDK admission is not part of this main
transfer. Its V1 construction failure remains retained; its V2 native case
has not run. Neither this refactor nor its tests qualifies that full application.

## Current actual-entry evidence

The [new 14-case selection](../qualification/actual-ingress-shared-limits.behavior.mjs)
imports the actual ingress, shared validator and official request-binding code.
The [bound result](../qualification/actual-ingress-shared-limits.actual-local-result.json)
records exit 0, complete streams, empty stderr and no skipped, cancelled or
TODO tests. All five declared source inputs were rechecked afterward.

Both real factories exercise malformed/missing/hidden/symbol/accessor/proxy and
wrong-prototype limits, all thirteen numerical bounds, safe-number rules,
capacity/deadline relationships and the exact metrics reserve. The test observes
352 constructor refusals before any injected server, deadline or downstream
operation. It also observes 24 returned owners with 24 controlled closes.

Valid tests use declared server/socket/response/deadline capabilities to check
captured server options, caller mutation after construction, exact official
GET /paid and POST service, legacy POST /paid, header-count enforcement, and
continued rejection of legacy GET, official POST /paid and foreign Host.
Declared timer tokens are in-memory DATA; no native/application timer runs.
Declared encrypted fields are not authenticated TLS evidence.

The former
[27-case ingress report](https://github.com/edgepillar/zenon-x402-poc/blob/2263964279f4723bbfeccd3c0aab0687f5668be8/qualification/official-x402-ingress-main-transfer.actual-local-result.json)
and recipe remain immutable at their original pins. Their totals are not
relabelled as execution against the new shared source. The separate full-DP
69-module graph is unchanged.

## Resource and publication controls

One bounded direct Node 24.19.0 command used five exact read allowlists,
disabled compile cache and no filesystem-write, child, worker or addon
permission. Output caps were 64 KiB stdout/8 KiB stderr, with a 20-second outer
observation bound and 2-second case limits. No source/package copy, installation,
scratch directory, task-storage root, archive or historical cleanup was created.
These controls are not an OS network sandbox, CPU cancellation or native drain
proof.

The existing, separately approved 27-case current hosted profile stays unchanged;
this new 14-case local fixture is opt-in and is not appended to npm test or CI.
Exact-head CI status must be checked after transfer and is not inferred from
this local component result.

The pending native V2 manifest and all 117 application inputs remain unchanged.
No consumed native allowance, held store, original payment, pin file or preserved
failure is reused, reopened, repaired or deleted. Full native application,
issued/selected-grant integration, crash/restart qualification, economic pilot
and production acceptance remain separate and unestablished.
