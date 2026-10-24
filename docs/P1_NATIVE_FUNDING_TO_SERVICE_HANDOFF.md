# Native funding-to-service application handoff

A new default-OFF source actor connects the actual DP preparation/funding owner
to the actual native official/V6 service client. It owns the file selection
from the start instead of borrowing an opaque store or trusting a stale close
receipt. The actual SDK/SQLite/native actor is SOURCE AND SYNTAX ONLY; only its
separate external-input DATA contract has executed in this round.

## One explicit application flow

`openZenonDynamicPlasmaNativeFundingServiceClient` accepts three closed groups:

- storeOptions: databasePath, allowedRoot, resourceUrl and custodyPolicy.
- fundingOptions: retained read options, bounded material options/wait, existing
  wallet capability, deadline and funding-POST transport options.
- serviceOptions: explicit official-client metadata/validator/context limit,
  native service transport options and deadline.

It requires one EXISTING EMPTY V6 file. The actual opener may advance
owner_epoch even on a later refusal; it is not SQLite readOnly mode. There is no
missing-file create, schema migration, V5 adoption or borrowed store factory.
Existing nonempty funding/recovery records are refused before a new preparation.

The actor hardwires the actual bounded material exchange, native retained RPC
read session, funding-POST transport, private native close session, V4 funding
submission, and guarded native official/V6 service client. It does not accept
a fetch/request/SDK/store/native factory or turn on the ordinary buyer path.
The legacy native-funding selections and frozen qualification graph are not
modified by this new named actor.

The public operation order remains explicit:

1. prepareOriginalFunding captures the same context-v7 originals and calls the
   actual preparer/signer/preflight once. Official asset metadata is checked
   against the captured challenge before that preparation starts.
2. The caller independently retains the returned original checkpoint and pins.
   commitOriginalFunding requires those external pins again and uses the actual
   retained-candidate current-read and V6 atomic original-custody path.
3. submitOriginalFunding requires the caller's same pins and delegates the ONE
   actual original funding POST. There is no new challenge round trip, replay,
   re-sign, replacement block or implicit recovery submission.
4. handoffToService explicitly supplies originalPayment (resourceUrl,
   serializedCheckpoint and external expectedPins), selectedGrantId and the
   exact original paymentRequiredHeader. BOUND intake is necessary here, but
   BOUND is not a grant, chain inclusion, current economic authority or delivery.
5. After clean actual funding/native/store close, open that same configured V6
   file through the actual guarded service client. Restore the original using
   the actual official client, returning ONLY retained original header bytes.
   No second funding POST is sent.
6. Only a later explicit submitOriginal enters native service transport. The
   existing selected-grant/original-proof/intent/quarantine checks still apply.
   No service dispatch is inferred from handoff, restoration or a cached result.

The original preparation packet remains available through funding inspection
after uncertainty. A failed handoff consumes no new signing authority and never
learns replacement pins from the database. An invalid input is refused BEFORE
consuming the handoff attempt or closing the funding owner. A real handoff can
be attempted at most once; there is no automatic reset or retry.

## Fresh resource custody across the handoff

The actor retains the PRIVATE actual native funding close-session capability.
A historically fulfilled aggregate close Promise alone is not enough. Before
service open/admission, and through the source-owned guard at the ACTUAL
service-store close boundary, it rechecks current native views, the actual
funding payer's returned store close and the same retained file identity.

The file observation binds device/inode/owner/group/mode/link-count and requires
a private regular single-link file. The actual SQLite opener still enforces its
own path/schema/sidecar and file guards. These cooperative pre/post observations
are NOT an atomic filesystem lease, authenticated provenance or rollback
resistance. A replaced path is not silently adopted as a matching file.

The separately named
`openNativeOfficialV6FundingPostOriginalPaymentClientWithFundingHandoffGuard`
keeps the source-owned current funding guard PRIVATE. The old unguarded-handoff
selection keeps its four-group grammar; this new selection requires a fifth
fundingHandoffGuard source capability. It is not a grant or DATA close receipt.
Refusal latches permanently, including service construction cleanup and actual
store.close after the service child's own async joins. A hidden acquisition
hold during an overlapping outer close is not reported as clean cleanup.

Funding and service must share the exact funding/service origin and matching
CA bytes. A private CA copy is detached before funding begins, preventing caller
mutation from swapping later service trust. Both actual native transports make
their own copies. The actor's bounded private copy is zeroed once no later
constructor needs it; the caller's buffer is untouched. This is not secure
erasure or evidence that an uncertain actual native owner released its copy.

Close revokes application admission first and starts BOTH independent owned
close attempts before waiting. Existing actual owners retain their own bounded
native/operation/store close gates. The extra current-public-operation join is
cooperatively limited to min(funding deadline, service deadline, 1000 ms).
A blocked event loop can delay all such checks: no OS/hard-cancellation guarantee
is supplied. UNKNOWN remains HELD; no force-close/reopen follows a late result.
Returned actual DB close evidence cannot be undone or relabeled as an open DB.

The application slot is per evaluated module instance, not an OS lock. Unknown
construction or consumed store claims retain their exact resources in that
slot. A late current-state error can downgrade a closed view without changing
the historical close Promise or seizing another application's released slot.

## Actual selected evidence

One new component entry ran ONCE on pinned Node 24.19.0 darwin-arm64: 12 passed,
zero failures/skips/cancellations/todo, complete streams, empty stderr and ten
source identities/hashes checked before and after. It imports the ACTUAL input
contract and ACTUAL POST-original DATA core, not a transformed native graph.

The cases cover detached independent expectations, exact retained original and
challenge, explicit grant selection, coherent-but-different packet rejection,
GET/POST separation, nonempty bodies, noncanonical bytes, descriptors/proxies,
arity/extra capabilities and refusal to infer economic/native/durable authority.
Fixture signature text is deliberately NOT a cryptographic signature. No
checkpoint reader, actual SDK, SQLite, socket, key, signature or nonce ran.

Two actual effectful source files passed node --check without imports. Four
syntax commands were used, retaining both the earlier and final source pins:
the actor and native client were checked again after source-review hardening.
These checks do NOT execute or qualify the new application, physical same-file
handoff, native close, grant proof, signature, nonce, service delivery or restart.

See qualification/original-funding-service-handoff-request.actual-local-result.json
for exact source, case and stream pins. Earlier results are preserved as
historical evidence; they are not relabeled for this changed native source.

## Publication and remaining acceptance

Six selected files are eligible for the source branch. Only the tested input
contract, component entry, result and this document are eligible for main.
The actual native actor and modified native handoff-selection module remain
OFF main. Main's effectful blobs/defaults are preserved. No hosted workflow is
dispatched, and absent current-head checks/statuses/runs are not a CI pass.

The pending DP-only native profile is unchanged at manifest SHA-256
`a472e3bcd8840ef4236e395cb918ae5f2a84be9ca45d8f59417c0b77da291933`.
Neither this actor nor the native service graph is in that frozen selection.
Its pending scope does not authorize this new graph. Old consumed native,
SDK/SQL/signing/nonce grants are not reused. No managed root/task, temporary
qualification file, download, install or cleanup was created in this round.

Remaining acceptance is a separately admitted exact current SDK/package/native
application selection covering positive work, original funding, actual same-file
handoff/restoration, one-grant service success/pending/lost-ACK/foreign grant/
original replay and failure/HELD lifecycle. Input component passes are not that
acceptance. Packaging/current-head CI, interruption tests and economic/runtime
pilot gates also remain open. Full P0/P1/P2 and production are NOT_COMPLETE.

