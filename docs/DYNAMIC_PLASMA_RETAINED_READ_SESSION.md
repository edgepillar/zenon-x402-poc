# Retained Dynamic Plasma read session

## Status and integration

The tested non-native session core now binds two retained DP read capabilities and one account exchange to the exact `{transports, accountExchange}` readOptions consumed by the real contextv7 preparer. It preserves original request/Promise identities, prevents reads once closing starts, and initiates all three owned closes before waiting on any read or close.

The separate native entry `dynamic-plasma-retained-https-read-session.js` hardwires two actual retained DP HTTPS owners and one actual retained account HTTPS owner, then returns that actual lifecycle core directly. It accepts frozen `{endpoints: [firstDP, secondDP], accountEndpoint}`; each endpoint retains the existing frozen route/timeout/grace configuration. The two DP route tuples must differ. No caller-supplied owner factory, fallback transport or floating request limit is accepted.

The old HTTPS observation owner is one-shot and closes endpoint A before endpoint B. Recreating that owner for every retained cycle would reset volatile lifetime/budget boundaries. The new session keeps one private owner set across all six contextv7 cycles: seventy-eight requests for each DP endpoint, including up to eight spork pages per cycle, and eighteen account requests. These are ceilings, not new network/retry/signing authority.

The actual native entry and earlier native owner changes remain source-branch-only on `x402/p1-router-late-pending-close-integration-v2`. Main receives the qualified non-native core and evidence. Native source association or syntax checking is not native execution, authentication, cleanup or full funding integration proof. No default buyer, package, dependency or workflow is changed.

## Closing and uncertainty

Calling session.close blocks even previously retained readOptions immediately and starts all three close callbacks exactly once. It returns one cached Promise. Reads already in progress are not awaited before requesting native abort/close. The session never fabricates their outcome or replaces the original operation.

Every genuine owner close must fulfill undefined. A rejection, synchronous throw, unsafe Promise/thenable, wrong fulfillment value, runtime drift, direct dependency on the public close Promise or aliased owner-close Promise permanently latches `CLOSE_OUTCOME_UNKNOWN`. Remaining owner closes are still requested. Later settlements may update observations but cannot promote the failed close, reopen admission or authorize a replacement.

Native Promise async-context symbols are deliberately not treated as string hooks. Actual Promise identity/prototype and constructor/species mechanics remain checked; own then/accessor decorations, subclass/proxy Promises and ordinary thenables are refused without invoking their hooks. Profiles and borrowed callbacks are not a native-owner brand or a hostile-code sandbox.

The inspection snapshot is detached frozen DATA. `CLOSED` describes the three supplied close contracts, not physical OS resource release or a successful payment. There is no hard bound on arbitrary borrowed callbacks or indirect dependency cycles. Actual native owners retain deadline/grace and rejection-prehandling duties.

The session owns no wallet, funding operation or store lifetime. Give its readOptions unchanged to the actual retained preparer or bounded original-funding submission, and separately join those owners' lifetimes. On uncertain read close, retain/HOLD/quarantine the still-owned resources; do not infer permission to close/reopen a store, re-sign, refresh a quote or retry. Full operation/store/wallet lifetime integration remains unfinished.

## Actual evidence

[The corrected selected result](../qualification/dynamic-plasma-retained-read-session.actual-local-result.json) records twenty-four passing, zero failing/cancelled/skipped/todo cases on pinned Node24.19.0. Eight literal inputs cover the actual session core, real DP/account RPC wires, retained account gate and genuine admission counters with declared in-process owner callbacks.

One case performs all six maximal wire-budget cycles with the same three owner sets: 78 + 78 + 18 = 174 generated JSON-RPC requests. It verifies monotonically retained wire IDs and zero remaining admission slots, without recreating owners or closing an endpoint between cycles. This is a real wire/count composition with synthetic null result envelopes, not the real collector/preparer's observation, account, price, signing or custody validation.

Other cases cover concurrent close, pending read abortion, stale capability refusal, reentry, direct close self-dependency, aliased close Promises, unsafe outcomes, raw-rejection property preservation and permanent unknown close after late settlement. Diagnostics counted 180 declared reads and 72 declared close starts across all cases, with zero hooks. These counts are not native connections or drains.

[The first failed run](../qualification/dynamic-plasma-retained-read-session.first-failed-local-result.json) remains separately recorded as seven passing and seventeen failing, exit1 with complete output. It exposed over-strict rejection of Node async-context symbols and an assert.rejects bridge that touched a deliberately hostile raw error. Application/test corrections have new literal source pins. The public failed output redacts only the private checkout prefix; its recorded raw byte count/SHA-256 refer to the original capture, not the redacted text.

[The native entry review](../qualification/dynamic-plasma-retained-https-read-session.source-review.json) records the eight-application-input native graph and one successful syntax-only check. That entry was not imported or executed. Two component commands plus one syntax command used no new task-storage root, task or scratch. No SDK, SQLite, crypto, key generation, signing, nonce search, socket/network, real PREPARE or payment ran.

Earlier native SDK/SQLite evidence remains eleven of twelve passing; its failed uncertain-close case and all forty-nine earlier runtime input pins are preserved, not reclassified. Hosted CI is `NOT_RUN_NOT_GREEN`; no workflow was dispatched. Full native retained funding, forced-interruption/resource qualification, economic pilot and production readiness remain separate acceptance gates.
