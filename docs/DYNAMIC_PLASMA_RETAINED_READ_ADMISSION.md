# Retained Dynamic Plasma read admission

## Status

The non-native admission counter and account exchange gate are implemented and passed twenty selected component tests. The source branch also contains the corresponding native HTTPS owner changes, but those changes have only source review and syntax checks. They are not native runtime qualified.

The selected component result is [the exact local capture](../qualification/dynamic-plasma-retained-read-admission.actual-local-result.json). Native source association and the two syntax-only results are [recorded separately](../qualification/dynamic-plasma-retained-https-read-owners.source-review.json). These records do not supersede the previous SDK/SQLite result: its third run remains eleven of twelve passing, with an uncertain-close case unqualified.

## The integration gap

The existing generic HTTPS owner admitted thirteen requests. A retained contextv7 original-funding attempt can need six bracketed read cycles. Each Dynamic Plasma collector endpoint has five fixed reads and up to eight spork pages per cycle; each account cycle brackets account-info with two frontier reads.

| Independent channel | Requests per cycle | Cycles | Owner ceiling |
| --- | --- | --- | --- |
| First Dynamic Plasma endpoint | 5 + up to 8 spork pages | 6 | 78 |
| Second Dynamic Plasma endpoint | 5 + up to 8 spork pages | 6 | 78 |
| Payer account bracket | frontier / info / frontier | 6 | 18 |

The combined worst-case ceiling is 174. The easier single-page fixture needs only thirty-six requests per DP endpoint and is not the paginated production-source bound. A ceiling is not a command to issue requests or permission for retries, network execution, signing or replacement.

## Closed profiles and gate

`bounded-json-rpc-read-admission.js` exposes four fixed source-selected profiles. Existing `dynamic_plasma` and `zenon_funding` stay at thirteen requests and policy version1. Only the explicit `dynamic_plasma_retained_candidate` and `zenon_account_state_retained_candidate` profiles select seventy-eight and eighteen, with version2. Counters have no reset, refund or continuation method. Frozen snapshots are detached from later claims.

`dynamic-plasma-retained-account-exchange-gate.js` accepts only the existing account wire's exact JSON-RPC body shape: numeric IDs one through eighteen, one checksum-valid canonical user address, and either `ledger.getFrontierAccountBlock` or `ledger.getAccountInfoByAddress`. It forwards the original string without parsing/re-encoding the body or resetting IDs. It preserves the returned Promise and original close function; it does not inspect borrowed outcome properties.

The gate blocks permanently and requests close once on invalid input, synchronous exchange failure or Promise-runtime drift. It does not turn a rejected/uncertain close into successful native cleanup. It is not an authentication or native-owner brand. The underlying real owner must prehandle its rejected promises and retain its genuine transport/close duties. Repeated raw IDs do not replenish the underlying admission count.

## Source-only native composition

On `x402/p1-router-late-pending-close-integration-v2`, `dynamic-plasma-retained-https-read-owners.js` hardwires the actual bounded HTTPS owner and existing wire/gate, with no caller-supplied owner factory or floating count. Construct a separate DP owner for each collector endpoint and the account owner for the retained preparer's `accountExchange`; the caller remains responsible for all three closes.

The shared native core uses one private actual admission counter per owner and consumes before creating native capabilities. Existing legacy factories keep thirteen. New retained policy descriptors record the explicit count and single-contextv7 purpose, while the legacy funding descriptor stays version1 without a new admission field. Hostname, path, pinned public IPv4, TLS, deadlines, grace, terminal state and uncertain-close duties are unchanged in source.

This native core change and the new native wrapper are source-branch-only. Main receives the tested non-native components and evidence, not either native change. The default buyer, package selector, dependencies and workflows are untouched. Recreating an exhausted volatile owner is not durable attempt renewal or authorization to resume the same original candidate.

## What actually ran

One pinned Node24.19.0 command ran all twenty cases against twelve literal source inputs, including the actual counter, account gate, account wire and shared read core. The collector was imported only to read its existing maximum-pages/calls contract. Its normalizer's `node:crypto` definitions were loaded but not invoked. Nine existing inputs matched both published parents byte-for-byte.

The run exited zero with twenty passing, zero failing/cancelled/skipped/todo, complete output, and empty stderr. Declared callbacks counted forty-four exchanges, forty-two accepted slots and twenty-five close starts, with zero proxy/getter hooks. These are component observations, not native connections or drains.

Two additional `--check` commands checked the modified native core and new native wrapper without module evaluation. No native HTTPS owner, SDK, SQLite, socket, key generation, signing, nonce search, real PREPARE or payment ran. No new task-storage root, task or scratch was allocated. The old native fixtures and evidence remain preserved.

Hosted CI is `NOT_RUN_NOT_GREEN`; no workflow was dispatched. Separate exact-source native qualification is still required for the larger real HTTPS budgets, lifecycle handling and full one-original-candidate composition. Positive-work/signing/custody integration, live pilot and production readiness are not established.
