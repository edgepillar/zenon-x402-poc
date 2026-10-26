# Fixed independent checkpoint pins and exact fresh reads

Date: 2026-10-26. All 54 current local GET/POST component controls passed.

The [original-payment checkpoint adapter](../src/x402-original-payment-checkpoint-client.js) now retains the exact canonical checkpoint string that was fully validated at construction.
It captures the independently supplied construction pins as detached immutable DATA. Every operation still captures fresh caller expectations, requires the exact closed binding/digest shapes and compares all eight primitive values exactly against those validated external pins.
Expectations are never inferred from the owned reader.

The retained-read path still invokes the actual supplied read capability on every admitted step.
It snapshots and fully validates/encodes the complete returned record, recomputes all four original-byte fingerprints and requires byte-for-byte equality with the full retained canonical checkpoint.
After that complete fresh check, parsing and hashing that identical string again is redundant.
Constructor wire/profile validation, the zero-body GET /paid and named POST /funding selections, original header preservation and single context consumption remain in force.

Close now drops the adapter's internal retained checkpoint, canonical requirement/payload comparison texts and fixed pin references, alongside its existing reader/header/selection references.
This does not erase caller-owned copies, guarantee GC timing or establish a measured heap saving.

## Actual local verification

The same 54 selected cases passed before and after: all 24 retained GET cases, all 12 retained POST cases and 18 new independent-pin, fresh-read, lifecycle and refusal cases.
The [machine-readable result](../qualification/checkpoint-client-fixed-pins-reuse.actual-local-result.json) binds the exact original source files and complete command results.

| Counted work across the same eight observation rows | Before | After |
| --- | ---: | ---: |
| SHA-256 construction | 296 | 80 |
| JSON parse | 62 | 10 |
| JSON stringify | 578 | 524 |

All eight output digests, lengths and scenario identities matched.
Ordinary GET and POST restoration still performs three fresh reads; its measured hashes change from 36 to 12.
Repeated challenge admission still performs six full reads and one creator; its hashes change from 72 to 24.
Wrong independent fields are rejected before the reader. Extra fields, symbols, own prototype names, accessors, proxies, oversized inputs and wrong types cannot disappear through a canonical-JSON comparison.

At each of the three stages, a changed full reader record still latches HELD and preserves consumption.
Reader reentry that closes the adapter cannot release a header or reopen admission.
A changed comparison transaction cannot replace the exact original signed payload bytes.
These are current component/interface controls with real Node hashing/JSON; the reader and SDK-shaped comparison values are synthetic.
They are not actual V6 database, official SDK, TLS, signing, restart or payment qualification.

## Retained unsuccessful fixture attempt

The first baseline attempt recorded 36 passes and 18 failures.
All retained cases passed; the new fixture used the unsupported network label zenon:declared.
Only that fixture was corrected to the existing explicit synthetic zenon:mock profile.
The wire validator and runtime were unchanged by that correction, and the failed receipt remains preserved.

## Running and scope

Use reviewed Node 24.19.0 with X402_CHECKPOINT_REUSE_PHASE=optimized when running scripts/run-current-checkpoint-client-reuse.mjs.
The versioned regression fixture also requires its explicit V3 selection and a current eight-file source identity table; the retained command receipt records the full admission.
The actual local run used ten explicit read permissions, no addons, disabled string code generation, capped output and zero Node test children.
Historical regression files and results keep their original source versions.

The existing 108-case hosted profile/workflow remains unchanged; it does not execute these 54 local cases.
Native source recipes remain bound to their original source versions and do not qualify this changed adapter.
The full funding-to-service/recovery milestone still needs matching native source/package/storage/scope admission.
