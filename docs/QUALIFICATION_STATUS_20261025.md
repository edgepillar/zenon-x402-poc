# Qualification and roadmap snapshot - 2026-10-25

This dated snapshot separates main, the development candidate and actual execution
evidence. It is not a release, deployment, economic acceptance or production
readiness statement. Historical results retain their original source pins.

The references below were checked before this documentation-only update. A later
commit must be checked at its own head; a prior green run is not that commit's CI.

## Pinned evidence

| Lane | Pinned reference | What the evidence establishes |
| --- | --- | --- |
| Main supported CI | [main baseline f01a51a5](https://github.com/edgepillar/zenon-x402-poc/commit/f01a51a5f9363a7a9b3056ee5691475db93d7f2b), [run 40134504081, attempt 1](https://github.com/edgepillar/zenon-x402-poc/actions/runs/40134504081) | The existing 27 selected controls passed on Ubuntu/Node 24.19.0. No dependency installation, SDK/x402 execution, SQL, keys, signatures, nonce search or native HTTP was selected. |
| Independent balance-barrier component on main | [64-case local DATA result](https://github.com/edgepillar/zenon-x402-poc/blob/f01a51a5f9363a7a9b3056ee5691475db93d7f2b/qualification/service-credit-capacity-balance-barrier-trace-data.actual-local-result.json) | Recorder/checker behavior passed against declared times and outcomes. These 64 cases are not part of the hosted 27-case lane and do not measure SQL, RPC or native balance latency. |
| Exact selected development source pipeline | [development snapshot 2508eaf5](https://github.com/edgepillar/zenon-x402-poc/commit/2508eaf556e715c2d9cb482b4d423a352ad0191d), [15-case local result](https://github.com/edgepillar/zenon-x402-poc/blob/2508eaf556e715c2d9cb482b4d423a352ad0191d/qualification/native-capacity-paced-selected-default-v1.actual-local-result.json) | The actual managed source admission, full in-memory profiles, entry/resource binding and complete selected-default outer DATA verifier agree. The native application, SDK, SQLite, sockets, keys and signatures were not executed by this selection. |

Counts are lane-specific, not additive coverage or a conformance percentage.
The selected [current profile](../qualification/profiles/p0-current-p2-node24-v2.json)
is separate from historical test discovery and source-bound recipes. Its runtime
dependency checks compare the pinned package manifest/lock contract; they do not
qualify an installed x402 namespace or execute that package.

## What the latest source result does and does not close

The development result uses the complete selected plan: two lanes, one warmup
call and four measured calls per lane. Genuine source workload/recording helpers
produce ten completed source calls, eight measured dispatches, fourteen writer
intervals and twelve raw balance-timing events. These are source-DATA facts, not
ten payments or observed native throughput.

The fixture's clocks/timer delivery and pair/child/receipt facts are explicitly
declared or synthetic. Its 1,000 ms window is a ceiling, not a measured second of
sustained native load. The verifier rejects the earlier smaller generic fixture
as evidence for this full plan. Reading pinned package sources is not SDK use,
physical root authentication, receipt authentication or native cleanup proof.

See the development-only [selected-default explanation](https://github.com/edgepillar/zenon-x402-poc/blob/2508eaf556e715c2d9cb482b4d423a352ad0191d/docs/SERVICE_CREDIT_CAPACITY_PACED_SELECTED_DEFAULT_SOURCE.md)
and [managed-launcher description](https://github.com/edgepillar/zenon-x402-poc/blob/2508eaf556e715c2d9cb482b4d423a352ad0191d/docs/SERVICE_CREDIT_CAPACITY_PACED_MANAGED_LAUNCHER_V3.md).
Those files are linked at the candidate commit, not presented as already merged
main runtime behavior.

Earlier native/local composition results remain evidence for their recorded
source only. This snapshot neither erases those results nor upgrades them to a
fresh run of the changed candidate.

## Roadmap and remaining acceptance

| Priority | Current checkpoint | Evidence still required |
| --- | --- | --- |
| P0 - current qualification baseline | Main has an exact selected Node/profile lane; historical recipes remain separate. | Check the intended commit's own CI and actual selected results. Preserve failures/skips and do not widen the profile implicitly. |
| P1 - one real application composition | Main and development contain named x402, HTTPS, V6 custody and selected-grant components with source-bound local records. | A reviewed current-source full composition covering success, pending, response loss, foreign grant and the same original request, with real selected SDK/HTTPS/SQLite owners. |
| P1 - Dynamic Plasma chain | The default buyer source still calls the [legacy signed-composite seam](https://github.com/edgepillar/zenon-x402-poc/blob/f01a51a5f9363a7a9b3056ee5691475db93d7f2b/src/zenon-payment.js#L2115). Named bounded alternatives are not a default cutover. | Current-source positive-work preparation through signing, final validation, original signed custody and publication/reconciliation. Preserve exact original bytes/hash under price, horizon, deadline and uncertainty changes; no automatic replacement. |
| P2 - interruption and resource lifecycle | Native-close guards and crash/recovery records are versioned rather than inferred from one another. | Current-source commit interruption, lost acknowledgement, late/nonclosing socket and HELD-store/reopen behavior. Demonstrate no duplicate dispatch or automatic retry/re-signing. A normal reopen is not power-loss proof. |
| P3 - bounded economic pilot | Remains outside this snapshot's acceptance. | Independently accepted runtime/chain context, provider policy and signer/key-custody lifecycle, economic funding/grant acceptance and operator stop/recovery procedures. |
| P4 - measured capacity | Independent recorders and the complete paced source-DATA pipeline are implemented. | Managed native command/closure receipts, real load observations, pressure/balance correctness and measured error/latency/concurrency distributions. Funding, funded-session, ledger and L1 timing remain separate; Momentum timing is not a TPS result. |

The source-only main/development distinction must not be used to silently move
the default payment path, enable a pilot or call every funded-session service
request an independent L1 transfer.

## Main transfer boundary

The [pinned main-to-development comparison](https://github.com/edgepillar/zenon-x402-poc/compare/f01a51a5f9363a7a9b3056ee5691475db93d7f2b...2508eaf556e715c2d9cb482b4d423a352ad0191d)
contains more than standalone new helpers. In particular, the candidate changes
these existing runtime files:

- `src/service-credit-custodied-sqlite-http-client.js`
- `src/service-credit-native-https-client-transport.js`
- `src/x402-official-selected-settlement-server.js`
- `src/x402-official-v6-original-payment-client.js`

Standalone DATA passes do not qualify those runtime changes. The current 27-case
hosted lane does not cover their new SDK/SQL/native composition. A full runtime
batch needs its current-source regression plan, review and proportionate execution
evidence; native and economic acceptance remain distinct gates.

An independently reviewed, genuinely qualified component can move to main in a
small batch, as the balance-barrier component did. A compatible subset must not
be labeled the whole integration closure.

This update changes documentation only. It changes no package, workflow,
selection profile, runtime source, historical result, native allowance or default.
No application, SDK, SQLite, signer, nonce search, network workload or native test
was run to prepare this snapshot. Any automatic main CI run remains the unchanged
27-control lane, whose actual outcome must be checked separately.
