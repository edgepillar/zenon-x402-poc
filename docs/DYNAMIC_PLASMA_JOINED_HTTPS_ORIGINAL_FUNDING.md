# Joined bounded HTTPS original funding

## Source implementation

The new opt-in factory `createZenonDynamicPlasmaBoundedHttpsOriginalFundingSubmission` connects the actual bounded material producer, retained three-owner HTTPS read session and original-funding V3 owner. It returns that actual V3 owner directly. There is no caller-supplied owner/preparer factory, replacement validator/store writer, material substitute or default-buyer cutover.

Exact options are `readSessionOptions`, `materialOptions`, `materialWaitMs`, `wallet`, `store`, `fundingResourceUrl`, `deadlineMs` and `fetchImpl`. The actual DATA capture detaches the existing material/wait/count values before creating private read owners. The session's readOptions object is passed unchanged and identity-checked by V3. The contextv7/V2 preparation, final same-original read, independent expected pins, V6 atomic custody and original packet checks remain the real existing implementation.

Construction invokes no read, nonce search, wallet sign or SQL operation. On refusal any created read session is still inert and receives close; the caller retains close/quarantine for the existing store, and a consumed store-object claim is never reset. Successful outer construction transfers store lifetime to the actual payer owner. Returning that owner directly leaves no subsequent outer wrapper construction step that can lose its handle.

Prepare, independent pin retention, commit and submit stay explicit. BOUND remains funding-intake acknowledgement, not chain publication, inclusion, grant, service delivery or pilot acceptance. No re-quote, replay, re-sign, reopen or replacement is introduced.

## Why a new close selection is needed

Waiting for read close before asking the old funding owner to close would leave an already active submit able to enter transport. Calling the old funding close immediately could instead reach payer/store close before read uncertainty was known. V3 therefore changes the actual owner lifecycle, not just an outer status projection.

V3 close first sets its own lifecycle to CLOSING and assigns a reserved prehandled Promise before a read-close callback can reenter. The actual read session immediately requests all three native closes. The coordinator joins the active operation without reading its value or rejection reason. Only clean read close plus completed operation and source-owner guards allow the actual captured payer close. The real payer still enforces its own POST-drain and store-close contract.

Read uncertainty permanently vetoes the payer/store-close entry, even if the operation or other reads later settle. A false/throwing source-owner guard, unsafe Promise, alias/self-dependency or failed close also holds the result. The original phase/packet/candidate remain inspectable; the close result never upgrades an uncertain original operation.

V3 close returns version1 joined close-contract DATA with lifecycle/read/operation/funding close status. It is not the legacy V1/V2 close shape; use the V3 inspector for the original operation phase. V1/V2 public selections, legacy close body and legacy inspection return are preserved in source. Prepare/commit and public-operation launch bodies are also unchanged. These source comparisons are not a native compatibility run.

The wallet/material/fetch capabilities retain their own operational and unsafe-Promise duties. No wallet cancellation or hard whole-operation deadline is invented. An unresolved callback or indirect dependency may still require external HOLD/quarantine. CLOSED is a joined close-contract result, not physical OS cleanup, crash durability or payment success.

## Evidence and publication boundary

[The selected component result](../qualification/dynamic-plasma-original-funding-read-close.actual-local-result.json) records twenty-four passing and zero failing/cancelled/skipped/todo cases on pinned Node24.19.0. Five exact source inputs cover the actual close coordinator and actual retained read-session core with declared in-process resource callbacks. Three composition cases exercise the genuine read-session core's three closes, pending-operation join and permanent uncertainty veto. Funding closes are callback counts, not SQLite operations.

Diagnostics counted 39 read-close calls, 34 operation snapshots, 20 declared funding-close calls, 32 guards and nine actual read-session owner-close callbacks, with zero getter/proxy hooks. One bounded component command and two syntax-only commands used no new task-storage root, task or scratch.

[The source review](../qualification/dynamic-plasma-bounded-https-original-funding.source-review.json) pins sixty relative native application inputs plus the component/configuration associations. Both the modified submission file and new full factory passed syntax checking only; neither was imported or executed. SDK/Noble dynamic imports were not loaded. No SDK, SQLite, native HTTPS, crypto, key generation, signature, nonce search, real PREPARE or payment ran.

One of the previous forty-nine native runtime files intentionally changed: the actual submission owner now has V3. Forty-eight remain byte-identical. The older native input manifest and eleven-of-twelve result remain historical and unchanged; the old source blob is retained at the recorded source parent. Do not update the old pins or reuse that result for the new application graph. Earlier source associations that include this file are historical, not current native qualification.

Only the tested non-native coordinator, tests and evidence are eligible for main. The modified actual submission and full SDK/SQLite/HTTPS factory remain on `x402/p1-router-late-pending-close-integration-v2`. Main's actual funding implementation, default buyer, package and workflows are untouched. Hosted CI is NOT_RUN_NOT_GREEN; no workflow was dispatched.

The full chain is now connected in source, not native-qualified. An exact-source native profile and matching effect authority are still required before execution. The exhausted three-run SDK/SQLite scope and pending extra SDK/SQLite-only request do not authorize this native HTTPS/positive-work graph. Full P1 runtime proof, P2 forced interruption/resource proof, economic pilot and production readiness remain open.
