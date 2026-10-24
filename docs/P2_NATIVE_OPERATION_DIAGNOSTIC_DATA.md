# Bounded native-operation diagnostic DATA helper

This is implemented DATA code with 16 selected local tests passed, not evidence
that any funding, SQL, transport, grant or recovery operation succeeded. It does
not authorize a new native run, retry, signing operation, service dispatch or
cleanup. It is not an OS/network sandbox.

The [helper](../src/native-qualification-operation-diagnostics.js) retains only
an allowlisted source-stage name, a bounded stage count, an allowlisted returned
phase and an allowlisted error code. It never retains a raw error, message,
stack, cause, expected/actual assertion values, returned record or payment data.
A stage records entry before the actual call, not completion of that call.
The first failure is sticky. Invalid diagnostic input marks measurement
uncertainty; mutators return undefined rather than throwing into the real
operation. Snapshots and strict captures are detached, frozen, null-prototype
DATA objects. Getter/proxy inputs are not evaluated.

The [actual helper test](../qualification/native-qualification-operation-diagnostics.behavior.mjs)
ran directly under Node 24.19.0 with read-only permission for exactly the package
metadata, helper and selected test file. All 16 tests passed; none was skipped.
There was no full application, package/SDK runtime, SQL, key, signature, nonce,
socket, child test process or qualification scratch. The
[exact local result](../qualification/native-qualification-operation-diagnostics.actual-local-result.json)
pins all three source files and records actual exit and complete stream digests.

The separate full P2 diagnostic seed and managed launcher are source-branch
work, not a qualification supplied by this helper. Both prior one-shot native
attempts remain failed and consumed. Do not infer their exact internal failure
from a filename, a source cursor that was not in those attempts, or a green CI
check. A current full-graph native attempt requires its own finite approval.

The existing hosted 27-control profile is unchanged. It does not run these 16
local tests and cannot convert them into SQL/native, chain or production proof.
