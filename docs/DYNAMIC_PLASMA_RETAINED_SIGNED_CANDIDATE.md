# Retained signed candidate - explicit pre-custody revalidation

## Implemented stage and actual local result

The explicit contextv7 preparer now adds one `revalidateSignedOriginal()`
operation after the existing wallet-candidate preparation succeeds. It performs
a sixth fresh account/frontier/balance/dual-DP cycle on the same private read
adapter, one account wire, original plan/quote, unsigned projection and retained
signed candidate. It does not accept replacement inputs or invoke the wallet,
material producer, quote or assembly again.

The [selected local result](../qualification/dynamic-plasma-retained-signed-candidate.actual-local-result.json)
records 19 actual passing cases with pinned Node 24.19.0 / Darwin arm64,
complete output, exit 0, empty stderr and zero failures/skips/cancellations/todo.
The 32 source inputs total 402,164 bytes. Tests import the actual preparer,
read adapter, work/balance/price/handoff modules and their DATA dependencies,
not a copy of their implementation.

The named wallet methods are declared in-process callbacks returning fixed,
deliberately invalid signature-shaped DATA. No cryptographic signature, key,
SDK, nonce search, SQLite, native RPC, network, real PREPARE or payment ran.
Material difficulty is zero. These cases do NOT satisfy the separate
positive-PoW-plus-real-signature/custody qualification gate.

## Why this stage is separate

The existing v6 flow validates a candidate after the wallet wait, but custody
can occur later while a caller independently retains its pins. That earlier
read is not a current-price certificate for arbitrary later storage/submission.
This explicit operation checks the retained original again without treating
waiting or a new quote as replacement/signing authority.

Use `createObservedBalanceDeadlineBoundMaterialRetainedCandidatePreparer`
with the same existing options `{readOptions, materialExchange, materialWaitMs,
wallet}`, but `plannerContextVersion:7`. Its surface is:

- prepareSignedCandidate(context)
- getMaterialWaitSnapshot()
- getSignedOriginalData()
- revalidateSignedOriginal()

The underlying explicit read factory is
`createObservedBalanceDynamicPlasmaRetainedSignedCandidateReadAdapter`.
Existing v3-v6 factories keep their old context versions, method surfaces and
pre-sign/five-cycle behavior; their historical source guards and result records
are unchanged. New selected compatibility cases exercised v3, v4, v5 and v6.

## One original and one revalidation attempt

The initial fifth-cycle candidate validation must succeed before the new
operation is admitted. A failed fifth read cannot be repaired with this API.
Wrong arity/preparation order performs no new reads. Overlapping operations
refuse before inspecting caller DATA. Once admitted, revalidation is consumed
before its first read, including refusal or an unresolved result.

Successful sixth validation returns observedSignedCandidateVersion 2 and
validationPurpose BEFORE_ORIGINAL_SIGNED_CUSTODY, with the same signed bytes,
hash, fixed nonce and original ACK. It still says signatureValidation
NOT_PERFORMED, persistence NOT_PERFORMED and authority NONE. It is not a
capability to dispatch or a cryptographic/durability certificate.

Horizon expiry, changed price policy, insufficient balance, moved frontier and
malformed replies retain the same field-bound original. Inspection records
REVALIDATION_REFUSED_OR_UNKNOWN; neither a second current read nor another
preparation/signing attempt is available. A later favorable reply or caller
policy mutation cannot renew the captured original horizon.

The six cycles use the existing ten-cycle/shared-32-handoff account budget;
no partial new wire or unbounded polling is added. Material wait still bounds
only its own existing native wait timer. Wallet/read waits and the whole run
have no new hard deadline, cancellation or hostile-callback sandbox.

## Integration boundary and next required work

This increment implements and qualifies the actual missing retained-original
read stage. The effectful original-funding preparation/submission owners and
their DATA capture still use the existing v6 contract and do **not** call the
new stage yet. An explicit v2 owner/data integration must select v7, retain the
same packet and call this operation before entering atomic original-funding
custody. No active buyer or signer cutover is performed here.

The effectful SDK/preflight/SQLite modules were not imported. Their old
nine-case native profile remains an unchanged source snapshot and must reject
new source hashes; it is not silently rebound or treated as current runtime
evidence. Actual signature validation, durable custody and publication still
need the exact full graph, matching narrow authority and selected results.

Only one direct local Node command ran for these 19 cases, with exact source
read allowlists, no write/child/worker permission and compile cache disabled.
Captures were bounded in memory; no qualification task, scratch, new root,
archive, cleanup or historical payload copy was created. Existing HOLD files
and consumed native permissions remain untouched.

Current read projections remain declared/non-atomic and do not authenticate
funds, ancestry, ABA exclusion, runtime activation or service delivery. Hosted
CI is NOT_RUN_NOT_GREEN; full P0/P1 remains unqualified and economic pilot
remains NO_GO.
