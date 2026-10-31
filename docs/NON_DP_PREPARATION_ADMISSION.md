# Non-DP preparation admission before the original attempt

The fixed non-DP application selects
`createApiCreditNonDpPurchasedGrantRecoveryApplication`. It uses the existing
purchased-grant recovery owner, custody ports, stop chain and UNKNOWN/HELD
semantics. No new journal, signer, budget owner or recovery mechanism exists.
The named DP and generic entries retain their original policy grammar.

Before setting `prepareClaimed` or entering the child application, the named
non-DP owner captures the existing original preparation and validates its
explicit resource policy. That policy has exactly `policyVersion: 1`,
`maxFusedPlasma` from 1 through the maximum safe integer, and
`maxMomentumAdvances` from 0 through 128. Unsafe numbers, negative zero,
missing/extra fields, accessors and unsupported versions refuse. No defaults,
work parameters, callbacks or lane selectors are inferred from input.

A known policy refusal leaves the preparation attempt unconsumed and enters
no child preparation, spending reservation, signer context or query custody.
The operator may correct that precondition before the first child call. Once
an admitted child operation is entered, its existing single-attempt and
ambiguity rules remain: failure or lost output stays HELD and cannot authorize
replacement, re-signing, retry or dispatch. Closing and inspection reentry
retain the existing admission fences and the same one-shot child stop.

The shared pure policy capture also supplies the existing non-DP strategy,
observed reader and original-candidate gates. The original preparation capture
validates the policy without replacing it or normalizing its retained JSON.
For admitted inputs, the generic and named captures retain identical original
preparation bytes and digest. Existing signed-context history still uses its
original decoder; no historical policy is migrated or upgraded.

Policy admission is not an observation, quote, PRE_DP proof, signing permit,
payment preflight or chain authentication. Actual reads must still establish
their required observed classification and current original constraints. The
native application continues to use the same V6 atomic commit, independent
pins, spending file, context/age signer and wire/store/key owners.

The local controls evaluate actual pure capture/recovery owners with declared
child acknowledgements and memory custody. Their checkpoint fixture explicitly
contains non-signature DATA. They do not establish cryptographic payment
validity or a complete funding/grant product run. Native SDK/core/SQLite/HTTPS,
signing, work, physical release, Linux and G0-G5 acceptance remain open.
