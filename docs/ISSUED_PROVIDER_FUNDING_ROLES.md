# Issued-provider funding roles

Source candidate for the one-funding, one-grant API-credit provider. Native
execution is disabled. The single operator command is documented in
[the source command contract](ISSUED_PROVIDER_OPERATOR_CLI.md); Linux and full
G1/G2 acceptance remain OPEN.

`createIssuedProviderNativeFundingRoles` takes an actual borrowed
`SettlementJournal` constructed with immutable `existingOnly: true`, the
original upfront requirement and service selection, the explicit existing
operator-trusted testnet policy/RPC/timeout, a 0..16 pending budget, an explicit
pendingObservationMode and the native owner's current-admission check. It
constructs the real `ExactZenonFacilitator` for the owned provider's
funding.official configuration. Its challenge validator returns only void.
The first verify/settle retains its original separate operational authority.
No arbitrary verifier, settlement callback, module path, implicit environment
or mock facilitator is selected.

JOURNAL_ONLY retains the existing original-journal reader. Bootstrap version 1
always selects this mode and rejects new mode fields. Bootstrap version 2
requires JOURNAL_ONLY or ORIGINAL_RPC explicitly. ORIGINAL_RPC is permitted only
for FRESH; restored RECORDED/JOURNAL/WITNESSED modes cannot regain live pending
continuation. RUN still refuses missing journals and nonempty FRESH journals.

The selected pending observer captures the same payload, requirement and
challenge, compares all eight original journal fields and applies the original
confirmation threshold. ACK remains PENDING. In JOURNAL_ONLY mode no fresh
chain read is produced; absent a separately admitted journal update it may
remain pending or exhaust its original budget.

[Explicit ORIGINAL_RPC](ORIGINAL_FUNDING_CHAIN_OBSERVER.md) uses the same actual
facilitator's fixed payer queue, owned SDK session/readiness, one original-hash
ledger lookup and existing journal CAS. It checks the returned full block/hash
with the existing validator. Only ACK-to-inclusion or a stronger count for the
same Momentum can update the original record, followed by exact revision and
record readback. Missing/opaque/changed records and contradictory inclusion
cannot become settlement success. General reconciliation maintenance and its
worklist/tombstone policy are never the pending fallback. There is no new
publication, signature, record creation, grant activation or delivery entry.

The real pending intake reserves its durable observation before invoking this
callback. The separate observer binds one tuple and admits at most the original
0..16 local entries without refund. Concurrent entry is refused. A failed or
opaque queue/read/RPC/CAS receipt keeps HELD. Stop is requested before the same
provider closes, fences queued or late work and never grants retry, rebind or
restart. The owned SDK session remains its own closer. Roles borrow the journal
and never close it or assert physical release.

Only the repository's explicit historical/current/DP testnet policy selectors
are admitted, retaining the original acknowledgements and matching chain
profile. DP selections retain their exact event/endpoint and reset-epoch
expected payer. Plaintext remote RPC, credentials, URL aliases and missing
settings are refused. Operator trust does not authenticate a running network,
binary, genesis, active rules, canonicality or finality. G3a and applicable DP
G3b acceptance remain separate and OPEN.

Current local proof covers actual pure DATA with declared memory ports and
parser-only native source. The actual SDK/core/SQLite/HTTPS/FIFO graph, Linux
startup, one grant and 100 real calls/replay, fresh-process recovery and physical
release have not been executed. Existing native evidence keeps its original
source/runtime scope; source changes do not extend its qualification.
