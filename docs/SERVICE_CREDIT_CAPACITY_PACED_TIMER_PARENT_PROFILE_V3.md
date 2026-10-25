# Paced timer-parent V3 profile producer

Status: **75/75 actual local DATA controls passed** on 2026-10-25.
This is profile construction and comparison code, not a native application run.

## Versioned source selection

The new producer consumes only
`qualification/capacity-native-paced-timer-parent-v3.inputs.json`
(SHA-256 `90eba86d5f14f4226867815667213dc4ac3799e146d65b74eb75441c047a1236`).
It binds the distinct parent kind, entry, preloader and namespace to profile V3,
outer capture V4 and timer envelope V1.

| Role | Application rows | Package rows | Total rows | Source-table SHA-256 |
| --- | ---: | ---: | ---: | --- |
| Timer parent V3 | 147 | 404 | 551 | `0e0533ba2e3bfdf97b2670a0ee693c64ddc04ea93bf52b4e779d9d073cb51c90` |
| Unchanged R4 children | 139 | 404 | 543 | `d756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027` |

All eight parent additions are required and disjoint from the complete child
table. The parent declares 4,922,944 source bytes. No source row, bare binding,
physical-identity DTO or child byte is replaced with a count-only summary.

The old parent declarations, frozen R4 producer and helper sources are not
rewritten. Earlier committed-byte restoration of the historically named
`capacity-native-paced-parent-v3.inputs.json` does **not** establish its prior
local bytes or identity continuity; that limitation remains. Both historical
parent declarations are refused as the new timer selection.

## Bounded canonical-field reuse

A prepared context detaches and validates the full source registry once. It
serializes the two complete source-input tables, runtime and bare bindings into
four shared canonical fragments. Their combined cap is 1,048,576 bytes.

The selected synthetic registry used 385,038 shared bytes. Parent validation
compared 32 complete child profiles using memoryview slices of the exact expected
canonical fragment stream: zero large-row reserializations and zero whole expected
child encodings were observed during those comparisons. It still checks the
entire byte sequence, including exact trailing newline, and rejects a recomputed
digest over altered inputs, runtime, bindings, context or whitespace.

Requested output profiles are joined once in memory and retain the 524,288-byte
cap. This trades a bounded retained fragment cache for less repeated serialization;
it is not a wall-time comparison, a peak-heap bound or an OS memory guarantee.
No workspace/package copies or profile files are created.

## Actual qualification

The isolated Python 3.12.14 control command completed with exit 0, 75 passes,
zero failures/errors/skips and empty stderr. It ran the actual new producer and
the unchanged pinned R4/base Python helpers. Complete child bytes also matched
the genuine frozen R4 producer. The 16-lane boundary, caller detachment, alias
refusal, full-row corruption and canonical-byte refusal cases passed.

All four selected Python sources and 47 protected inputs remained unchanged.
The test's synthetic registry/root identities are DATA, not authenticated
filesystem observations. The source-reading factory is implemented but was not
entered in this selection. Installed package bytes, native preloaders, SDK,
SQLite, keys, signatures, nonce work, sockets and application children were not
executed. The audit observations are not an OS sandbox.

See the [producer](../qualification/native_capacity_paced_timer_parent_profile_v3.py),
[controls](../qualification/native_capacity_paced_timer_parent_profile_v3.behavior.py)
and [normalized result](../qualification/native-capacity-paced-timer-parent-profile-v3.actual-local-result.json).

## Remaining gates

A timer-specific Python verifier, the complete outer-V4 verifier and a versioned
managed launcher remain separate work. Physical owned-root admission, every other
reservation, fresh exact finite native authority and actual component/capacity
observations are not established. The fixed source-selection manifest is a
historical snapshot; this result does not edit its earlier `remaining` fields or
consume the original unpaced R4 allowance. This producer stays on the development
branch while its native qualification dependencies remain outside main.
