# Explicit bounded-nonce original-funding adapter

## Implemented selection, not an activated buyer

The new createZenonDynamicPlasmaBoundedOriginalFundingSubmission factory binds
the REAL bounded material producer to the REAL contextv7/V2 original-funding
owner. It is opt-in, not a default buyer cutover, release or pilot. The effectful
adapter remains on the
[scoped source branch](https://github.com/edgepillar/zenon-x402-poc/tree/x402/p1-router-late-pending-close-integration-v2).
Its runtime behavior has NOT been qualified by the DATA test described below.

Construction accepts exactly eight fields: readOptions, materialOptions,
materialWaitMs, wallet, store, fundingResourceUrl, deadlineMs and fetchImpl.
materialOptions contains publicKey, startNonce and limits; limits contains
maxAttempts and maxDifficulty. All budgets/cursors are explicit. No supplied
materialExchange, preparer/owner factory, encoder, preflight or store writer
can replace the actual components.

The constructor configures one actual producer and one actual V2 owner, without
calling search, wallet, SQL or transport. It returns that owner DIRECTLY, without
wrapping its preparation/submission/close methods or changing their Promise
identities, one-admission fences, original-state checks or quarantine duties.
Successful construction transfers store lifetime under the existing owner
contract; failure can consume a local store-object claim and leaves close/
quarantine with the caller. There is no claim-reset or second-owner fallback.

## Real application chain selected by the source

Explicit prepare selects original quote/work -> bounded nonce producer -> same
unsigned assembly/current validation -> one wallet signature -> fifth current
read -> actual SDK/cryptographic preflight. Search remains at most 4096
candidate attempts; independent verification can recheck a found nonce.

Commit is still a separate explicit action AFTER the caller independently
retains original binding/digest pins. The actual V2 owner revalidates the SAME
signed candidate once with a sixth current read and immediately enters existing
atomic V6 original custody/readback. It does not re-quote, reassemble, reenter
material production or sign a replacement in that final step.

Submit remains one explicit funding-intake operation using the same original
headers, independent pins and durable state. BOUND is intake acknowledgement,
not chain publication/inclusion, grant issuance or service delivery. Refusal,
exhaustion, horizon expiry, response loss and rejected close never create a
retry, replacement, new quote or automatic re-signing right. Terminal failed
drain retains its owner/store even after a late response.

The bounded solver is synchronous. materialWaitMs bounds only supported
material-Promise waiting; it cannot preempt candidate CPU work or bound all
reads, signing, the whole operation or native cleanup. Supplied public bytes
and trusted operational handles are not payer authority, key possession or
authenticated runtime/price observations.

## Executed DATA-only configuration checks

The separate captureZenonDynamicPlasmaBoundedOriginalFundingConfiguration
module imports ONLY node:util and node:buffer. It detaches canonical public
bytes, nonce cursor, count/difficulty and wait/deadline budgets. Read, wallet,
store and fetch handles remain borrowed references, not deep-frozen or
validated as genuine operational brands. The real factories retain those
remaining validation duties. A captured configuration grants no authority.

All 17 selected cases passed locally with pinned Node 24.19.0 / Darwin arm64,
actual exit zero, complete stdout and empty stderr. The three exact application
inputs and physical identities were checked before/after. No global discovery,
dependency installation, writable file grant or test-child mode was used.
The [actual DATA result](../qualification/dynamic-plasma-bounded-original-funding-configuration.actual-local-result.json)
retains the complete 4517-byte stdout capture and its digest.

Cases cover detached budgets/bytes, borrowed identities, exact schemas, arity,
prototypes, proxy/accessor/nonenumerable refusal, canonical key/nonce DATA,
count/difficulty/wait bounds, safe redacted errors and zero callback execution.
They do NOT import the nonce producer or effectful adapter, generate a key,
search a nonce, sign, open SQLite or perform network I/O. No new storage task,
qualification scratch, SDK archive or duplicate binary is needed.

The new effectful adapter separately passed a pinned Node --check command with
exact read grants for its source and the root manifest. Exit was zero and both
complete streams were empty. That is syntax only: no import, component,
SDK/SQLite, nonce or signing behavior was executed by that command.
The [source review](../qualification/dynamic-plasma-bounded-original-funding-submission.source-review.json)
keeps these facts separate from the 17 configuration passes.

## Remaining gates

The source association pins 53 literal JavaScript input declarations, of which
51 already match the scoped published source parent. It is NOT a JavaScript
loader, SDK/package provenance or native qualification. Existing application
modules, default buyer, historical fixtures/results and all 49 prior native
runtime inputs stay unchanged. The prior 11-pass/1-fail native result remains
exactly that result.

Main receives the tested DATA utility and its test/evidence/documentation only;
the new effectful adapter stays off main. The pending extra twelve-case native
approval excludes nonce search and therefore cannot qualify this new bounded
adapter. Do not reuse it, the earlier three consumed runs or historical
positive-work results as fresh execution authority or evidence.

Next full acceptance must use a fresh reviewed matching graph and separately
authorized positive work: price advances/horizon refusal during actual search,
same original unsigned/signed bytes, one signer, fifth/sixth current reads,
genuine SDK preflight/V6 custody and durable unknown/rejected-close behavior.
Then assess any cutover separately from current-main hosted CI, real runtime/
chain evidence, provider setup and an economic pilot. All remain open gates.
