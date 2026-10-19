# P0-A scoped HTTP admission: bounded main-adoption evidence

Status: optional component behavior qualified locally. Full P0-A, durable composition and live pilot acceptance remain unestablished.

## Exact production change

Base main: `292b3ca4f7cc568bce04242c54979ab850151935`.

Only `src/service-credit-http.js` changes in this batch. The existing `createServiceCreditHttpAdmission` constructor accepts either the legacy exact `{ store }` option shape or the exact `{ store, admittedGrantId }` shape. An invalid present identifier is refused before loading the store. The constructor validates the entire canonical snapshot and checksum before selecting a single grant; corruption in another grant cannot be hidden by selection. A valid but absent selected identifier is refused. The legacy unscoped option remains available.

The change does not wire the option into a session, server or composition by default. Admission returns a normalized decision; it does not reserve units, debit credit, execute a service, write a response, cache a replay or send a payment.

| Exact file | SHA-256 |
| --- | --- |
| HTTP admission, 32432 bytes | `c76a7f1864bdfcd0c26916bf28fba615c8aecf899d53e69467e3ebe7d3353d0d` |
| Model dependency, 55461 bytes | `7ff7e3d88ab8c3b38a0073541533fbdb7a0d9f2be42f337ac35f6a3b05615c3a` |
| Capability dependency, 8284 bytes | `cb2b96d9a2e56c132dd1b4aca8f1c065b244ecd0e7e92f41ea3f4a8c969d17c3` |
| Package metadata, 1413 bytes | `8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5` |

The three dependencies already match base main exactly. No dependency or package rewrite is included. The complete feature branch is not merged: unrelated history/UI, session/composition, custody, SQLite, Dynamic Plasma and compatibility changes remain separate selections.

## Retained constructor/startup qualification

The unchanged [startup fixture](../qualification/service-credit-http-scoped-startup-current-model.draft.mjs) and its [original result](../qualification/service-credit-http-scoped-startup-current-model.result.json) record five actual passing groups:

1. Invalid present scopes and hostile options are refused before loading.
2. Canonical two-grant snapshots work both scoped and unscoped without mutation.
3. Corruption in an unselected grant is refused even with recomputed checksums.
4. Checksum-only mismatch is refused without repair or unscoped fallback.
5. Missing scope targets, noncanonical grant order and extra envelope fields are refused.

That historical run used Node v24.19.0 binary SHA-256 `3c9448363b9976bf3d9e8f4d320397975800131b42c7b1be342dadc05871dd25`, joined exit 0, with five passes and no failures/skips/cancellations. It made no `admit()` or cryptographic signing call. These completed cases were not rerun for this main adoption. The result's original review-branch publication description is retained as provenance, not rewritten into a new runtime claim.

## Current-runtime capability admission qualification

The [public-safe fixture](../qualification/service-credit-scoped-capability-admission-current-runtime.draft.mjs) and [current result](../qualification/service-credit-scoped-capability-admission-current-runtime.result.json) record one new explicit run, joined exit 0, with four passing cases and no failures/skips/cancellations:

1. A matching owner's real synthetic capability proof reaches actual scoped admission.
2. A genuinely valid proof for another stored grant is excluded, while the selected owner remains usable.
3. A wrong key for the selected grant is refused, while a subsequent correct proof remains usable.
4. Repeating the identical proof yields fresh frozen normalized decisions with the same request identity and no model/load/clock/pricing mutation.

The runtime is Node v24.19.0, darwin/arm64, binary SHA-256 `613be50c90e83aa8da58dd9ed393d0b39914a3b8ef4123fe817b46c2679cebe2`. A version string alone does not equate this binary with either older run.

The four scenario/helper bodies are byte-identical to the earlier private capability fixture. Only explanatory text, source content-pin metadata and caller-supplied physical binding guards were recontextualized. The machine-bound original and its earlier result remain preserved locally and are not republished or rerun. This establishes current-input qualification, not four novel semantic scenarios.

The fixture uses at most eight new in-memory synthetic capability Ed25519 pairs and six signatures. No private key is exported or logged. Source control flow limits these operations; native cryptographic calls were not independently instrumented. The offer/grant/funding context is declared synthetic data, not real authority.

Nine distinct authored groups pass across the retained startup outcome and the current capability outcome. This is not a single nine-test run. The earlier private four-case outcome does not increase the distinct coverage count.

## Launch, preservation and evidence limits

The current check uses one unsaved inline CommonJS built-in test-runner callsite, an explicit positional file, six cleared-environment keys, five literal read grants, no filesystem-write/child/worker/addon grants, and restricted string code generation. No dependency installation, saved operational helper, staging directory, scratch allocation or new host is used.

The caller independently matches all four enqueue/start/pass names, one plan and zero failures. Complete TAP is 914 bytes; the complete combined tool descriptor output is 2237 bytes. Stdout and stderr were not separately metered. Nine exact file identities/content hashes match after the run, including both older fixture/result pairs. The runtime identity matches the retained verified digest; its large binary was not copied or rehashed for this check.

Native crypto, hashing, loader, runner, stream and OS behavior remain premises. Source guards do not close loader TOCTOU. Node permissions are not an OS/network sandbox. The cooperative 5000 ms timeout is not a hard process lifetime, cancellation or native-cleanup guarantee.

No hosted CI run is dispatched by this batch; publication metadata must not be called green CI without actual check results. Local assertions do not qualify SDK/store/controller behavior, provider READY, restart/recovery, durability, service delivery or live pilot acceptance. Independent current context, funding, payer/provider/policy authority, real provider READY, durability and commit/uncertainty/restart gates remain separate.

The real payment signer stays disabled. Protected totals remain two consumed admissions, one actual chain PREPARE, zero bundles and zero native-chain/provider qualification runs. Original payment/request bytes, hashes, payloads, requirements, context and consumed authority are unchanged. PR193's possible VALIDATED exact-same-signed-block resend remains distinct from UNKNOWN versus ACKNOWLEDGED; no real resend occurs here.
