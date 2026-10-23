# P1 native HTTPS / V6 two-file attempt

Status: FAILED_OR_INCOMPLETE. Full P1 is NOT_ESTABLISHED and the economic
pilot remains NO_GO. The native attempt was not repeated.

## Exact experiment

Executed source:
[aa9195a60e53784a8c60c46556a42e51d47382ea](https://github.com/edgepillar/zenon-x402-poc/commit/aa9195a60e53784a8c60c46556a42e51d47382ea).

The explicit, default-off experiment composed the actual official x402 client
and server, the actual HTTPS application factory, the actual native TLS client
and ingress, the actual V6 payer owner and one scoped durable service session.
It used two new private synthetic SQLite files and the existing
@x402/core 2.23.0 / Zod 3.25.76 bytes. Node was 24.19.0 on darwin/arm64.

The resolve-only namespace verified 56 files / 1,232,354 bytes before the
fixture, loaded 52 declared files, and resolved three fixed bare-package edges.
It performed zero source transformations. The source-row seal was
eeba5ef55ff9aff99d323bc217cd99289569cb93c58cff203c4582f8136f70dd.
This does not qualify the ordinary installed-package namespace or provide an
OS/network sandbox.

The source-pinned capture and sanitized TAP are in
[the failed local result](../qualification/p1-native-v6-two-sqlite-once.failed-local-result.json).
Raw stdout was 4,762 bytes with SHA-256
73d855d7102bf18204495e822c45faf86fa8290f3a1e13f0ef5acc97e40e3ab7.
Its private path prefix was replaced only in the separately hashed public TAP.
Stderr was empty; Node exited 1 with complete capture.

## Observed result

Two of five scenario subtests passed: original pending custody and foreign
grant rejection. First service success and original service replay failed.
The intended response-loss injection was not reached. The parent also failed:
TAP counts were 6 tests, 2 passes, 4 failures, zero skips/cancellations/todos.
These counts must not be represented as a passing full P1 composition.

The failure left the durable request OUTCOME_UNKNOWN and its generation SEALED
with LOST_CONTROL. The affected synthetic grant retained 2 held units, 8
available units and zero consumed units. The other grant retained all 10 units.
These are retained fixture DATA, not real provider/payment evidence.
The terminal ingress close verdict was CLOSE_UNCERTAIN, not clean closure.

## Source finding and separate correction

The executed fixture reused one timer adapter for two distinct contracts.
Its cancel() returned a boolean, which is appropriate for ingress. The actual
durable service owner instead requires cancel() to return undefined. Its
stopTimer() treats any other return as uncertain cleanup and marks LOST_CONTROL.
The pinned source path explains the recorded state; this is source analysis,
not a successful corrected native execution.

The original entry, namespace preloader, launcher, raw capture and files remain
unchanged. A separate v2 draft introduces an explicit void-returning service
timer adapter while retaining ingress's boolean contract:

- qualification/p1-native-v6-two-sqlite-once.behavior-v2.draft.mjs
- qualification/p1-native-v6-once.namespace-v2.preload.mjs

The v2 draft also asserts that the retained proof cannot dispatch after UNKNOWN
and that any uncertain post-loss close stays uncertain. It still requires
zero tracked native resources before treating its cleanup observations as
bounded local evidence. It is SOURCE_ONLY / NOT_RUN. A fresh, explicit one-shot
approval is needed before a new native attempt; v1's allowance was consumed.

## Authority and retention

The actual attempt used one OpenSSL test-TLS command and one Node command with
no Node child. Its bounds were one task / 4 MiB, two synthetic capability
keypairs, three capability signatures and at most 48 loopback connections.
No precise connection total was emitted after the failed parent, so it is
NOT_RECORDED rather than inferred from the planned count.

The funding BOUND handoff and grant activations were explicit privileged
synthetic fixture records. No receipt-to-grant authorization, provider proof,
real wallet signature, Zenon SDK, external network, nonce search, real PREPARE,
live payment, application restart or pilot was tested.

The managed task is CLOSED / FAILURE. Automatic cleanup is HOLD because the
native-created SQLite files were not retroactively adopted for deletion.
Both files (69,632 logical bytes combined), the failed output and the old roots
are preserved. The new root retained 65 CAS objects / 1,318,318 logical bytes.
These are logical payload measurements, not measured APFS physical reclaim.

Only this failure record and document are suitable for a documentation-only
main transfer. The new native transport and unqualified v2 fixture stay on the
working branch. Existing default package/test/CLI behavior and workflows are
unchanged. Hosted CI was not run and must not be reported green.

