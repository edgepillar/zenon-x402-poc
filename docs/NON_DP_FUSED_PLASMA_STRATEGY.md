# Explicit non-DP fusion-only preparation source

The roadmap requires a first non-DP product profile that can progress independently
of Dynamic Plasma activation. `NonDpFusedPlasmaStrategy` implements the existing
`PlasmaStrategy` planning SPI for one declared unsigned UserSend subject. It is
the resource-policy and unsigned-draft part of that profile. The existing native
entry remains a DP source candidate; non-DP native read, signer, spending-store,
funding and recovery ownership still need to be connected and qualified.

The SDK 1.0.5 source contract uses
`embedded.plasma.getRequiredPoWForAccountBlock` with one parameter containing
`address`, `blockType`, `toAddress` and base64 `data`. Its response has
`availablePlasma`, `basePlasma` and `requiredDifficulty`. Source inspection read
the current catalog-pinned API, model and base serializer; no SDK was evaluated.

A zero-difficulty response alone cannot identify legacy rules: the same response
shape can occur under DP. This explicit strategy additionally requires the
existing observed PRE_DP classification: matching before/after version-one
frontiers, zero dynamic prices and a declared chain-profile match. Unavailable,
incoherent, active-DP and unsupported observations are rejected. These are DATA
comparisons, not authentication of active rules, ancestry, chain state or an RPC
source. G3a trust-profile acceptance remains required before real network use.

`quote(context)` binds the complete existing UserSend policy/intent, the selected
runtime digest, an independently supplied observed quote request and explicit
fusion/age limits. It selects exactly `basePlasma` fusion and zero difficulty;
insufficient fusion or positive work is refused. There is no PoW fallback, DP
price calculation, work search, default resource limit or quote refresh.

`apply(context, quote)` requires the original branded quote from the same strategy.
It preserves that allocation while checking current declared observations, the
same subject/request/policy/runtime, unchanged base cost and sufficient fusion.
Rollback, a same-height different hash, excessive momentum advances and DP
activation are refused. The height window is not an ancestry proof, wall-time
lease, cancellation guarantee or permission to replace a signed payment.

`createUnsignedUserSendDraft(context, quote)` assembles new DATA through the
shared unsigned-field validator. Original transfer, frontier and acknowledgement
fields remain unchanged. Hash and nonce are zero placeholders; public key and
signature are empty. This is not SDK/current-state PREPARE, a valid PoW claim or
a signer capability. The eventual native binding must independently own fresh
account/balance/rule reads, elapsed-time checks and exact-original custody before
SDK entry; it must preserve the existing UNKNOWN and close contracts.

The DATA controls exercise the actual policy and shared UserSend/hash codecs.
They use declared frontiers, RPC replies and fixed public address/checksum bytes.
They execute no installed SDK, network, SQLite, key generation, signature, nonce
search, real PREPARE or payment. Neither native entry nor package catalog changes.
Native/Linux product acceptance, physical release and G0-G5 remain OPEN.
