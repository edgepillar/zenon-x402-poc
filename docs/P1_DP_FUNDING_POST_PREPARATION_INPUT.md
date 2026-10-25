# P1 DP fixed-POST preparation input

Status: the new synchronous DATA component is implemented and locally verified.
Its connection into the real native client is SOURCE/SYNTAX ONLY, not a native
SDK/SQLite/wallet qualification or a default buyer cutover.

Reviewed main parent: `a2bd9e15b20c84698bee409fc84ff53059a4c533`.
Reviewed development parent: `2d6cf9eb6c9f266a5375334f481e679481aae7a3`.

## The integration gap

The general contextv6/contextv7 original-funding capture deliberately supports
bounded nonempty original request bodies. That is a valid generic DATA contract
and remains unchanged. The fixed funding POST checkpoint consumer, however,
requires exactly `POST /funding` with an empty original body.

A direct current-module DATA control demonstrated all three facts: the generic
contextv7 capture accepted a nonempty original; the real POST checkpoint DATA
constructor accepted an otherwise matching empty-body fixture; and that same
consumer rejected the nonempty-body fixture without reading a checkpoint store.
The fixture's transaction/signature text is deliberately invalid DATA, not a
signed/prepared Zenon transaction or a cryptographic signature.

Source inspection found that the native funding/service client's preparation
entry used only the generic capture before entering its real preparer. Its
fixed-body requirement was therefore not enforced at that early source seam.
A native wallet/preparation/commit/handoff failure was NOT executed or reproduced.

## Implemented contract

`captureZenonDynamicPlasmaFundingPostPreparationInput(input, fundingResourceUrl)`
in `src/zenon/dynamic-plasma-funding-post-preparation-input.js`:

- Reuses the actual fixed POST route consumer, then the unchanged contextv7
  original-input capture.
- Requires the detached original body to equal the route's exact empty-body
  contract. It rejects a coherent nonempty body, never strips or rewrites it.
- Returns the generic capture's same detached, frozen record shape directly.
  It does not add a receipt, profile, operation, retry right or consumed flag.
- Rejects wrong routes, old context versions, non-UNSIGNED phases, descriptor
  hooks and inconsistent original challenge/resource DATA.
- Preserves identifiers, context bytes and the exact original challenge header.
  It does not re-encode a recovered payment, invent a block or change generic
  v1/v2 body support.

The native development source now binds this actual helper before its existing
official-asset guard and real `prepareOriginalFunding` entry. The source-only
diff is four added/two removed lines. No wallet, read/material, signing, commit,
submission, close, handoff or default implementation is replaced.

This gate is before the preparation operation, NOT before native client
construction: the effectful client may already own its native resources and V6
store. Passing DATA is not payer consent, current funds/price, key possession,
signature validity, durable custody, publication, grant or service authority.

## Actual verification and limits

- 42 current DATA scenarios passed, with 41 expected-refusal checks. These are
  different counts, not 41 negative scenarios.
- Positive controls cover detached immutable originals, exact byte retention,
  the real later POST DATA constructor, generic v1/v2 nonempty-body compatibility,
  and canonical explicit HTTPS ports.
- Negative controls cover body content/limits/encoding, route/origin drift,
  old context versions, post-sign phases, challenge drift, missing/extra fields,
  arity, proxies/getters/coercion and callback-like input.
- 26 selected source identities and 257 other protected input identities were
  unchanged. The closed DATA process used 25 explicitly allowed source files;
  it did not import the native client or a package/SDK/SQLite/nonce-search module.
- DATA stdout: 11693 bytes,
  SHA-256 `c4b38b875f063d2bad8006b2cc86fd31d5a92fb2f2b063c37074500a3ad82058`; stderr: 0 bytes.
  Command runtime: 0.393949 seconds, not a native latency benchmark.
- One actual Node `--check` of the changed native source exited 0 with complete
  empty streams. The import/alias and pre-preparer call order were also reviewed.
  Syntax and source order are NOT runtime/native integration proof.

No application socket/timer, SDK, SQLite, wallet/key/signature, nonce search,
real PREPARE, payment or native handoff was executed. The positive checkpoint
reader callback stayed unentered. No task-storage manager/root, historical
cleanup or old native allowance was used. No OS/network sandbox is claimed.

The bounded DATA path reuses existing consumers rather than duplicating the
native setup or rerunning completed native qualifications. The source gate is
intended to reject an incompatible request before expensive preparation; no
measured native performance or avoided-signature count is claimed.

## Main and development publication

Only the new verified DATA module, its fixed fixture/test and honest report are
eligible for main. Their existing 21-file production dependency closure matched
the reviewed main and development trees. The existing native actor was absent
from main and remains excluded from this main batch.

Development additionally receives the small SOURCE-ONLY native connection.
Historical native manifests/results are not rebound to these changed bytes.
Fresh current-source native scope and actual integration evidence remain a
separate gate; source-only development does not wait on it.

The workflow, package/defaults and automatic 27-case Ubuntu/Node 24.19.0 profile
remain unchanged. The 42 local DATA cases are not silently added to that lane.
The new commit's automatic CI outcome must be observed separately; no manual
workflow run, retry or artifact transport is requested.
