# Current P2 and capacity qualification profile V3

V3 is a new opt-in, source-pinned local lane. It combines 13 current profile
contract cases, one accepted-receipt case, seven abort/drain composition cases,
seven dependency-text contract cases and 80 actual capacity-window component
cases: **108 tests** over **22 selected source files**.

The prior V1/V2 manifests, validators, launchers, tests, results, package scripts
and active workflow remain unchanged. This is not broad test discovery.
The current npm test and automatic main workflow still select the reviewed
27-control V2 lane. V3 hosted execution is not established by this local result.

## Closed selection and actual local result

The manifest is
[qualification/profiles/p0-current-p2-capacity-node24-v3.json](../qualification/profiles/p0-current-p2-capacity-node24-v3.json).
It pins exact bytes, LF counts and SHA-256 values for the validator, launcher,
each selected test, runtime/dependency text and every local import. The
[launcher](../scripts/run-current-qualification-v3.mjs) rejects unknown arguments,
case filters, unexpected/nested/duplicate registrations, skips, todo,
cancellation, incomplete streams, source or identity drift and reporter failures.

The actual restricted command ran on Node 24.19.0/darwin-arm64: **108 passes**,
zero failures, cancellations, skips, todo or stderr. The plan-only command
separately exited zero without discovering/importing test entries. Source pins
and full file identities matched before and after both commands.

Node's permission flags allow reads of only the 22 source files and manifest.
No filesystem write, child-process or worker permission is granted; addons and
code generation from strings are disabled. This is not an OS/network sandbox
claim. The complete reviewed import graph uses built-ins and local modules;
there is no install, SDK/x402 execution, SQL, socket, key/signature, nonce search,
payment, provider activation, manager task or physical-storage admission.

The capacity selector is set only for test execution, rejects a conflicting
caller value and is restored in finally. It is DATA selection, not hosted/native
execution authority. The default workflow is not inferred from a CLI flag.

## Smaller file buffers without reducing verification

The earlier file reader allocated its maximum capacity plus one byte for every
file. V3 allocates the observed file length plus one, within the same existing
per-file cap. The extra byte detects growth; descriptor, open/read/path identity,
complete length, EOF, LF, ASCII and SHA-256 checks remain present. The validator
still performs complete content/identity checks again after the test streams end.

A real test counts Buffer.alloc requests while inspecting the actual selected
files and verifies every admitted source hash. For the SAME 23-file inspection:

| Requested buffers | Bytes |
| --- | ---: |
| Earlier maximum-capacity formula applied to this selection | 2,916,375 |
| Actual V3 file-sized allocations | 336,453 |
| Difference | 2,579,922 |

The older value is calculated from the unchanged file caps for this expanded
selection. It is not a measured allocation of the smaller V2 test graph.
The new value is observed function-entry allocation length, not measured heap,
RSS, OS allocation, disk I/O, APFS reclaim or speedup. The single extra regression
inspection is included in the 108 tests.

## Reproduction and proposed hosted selection

The [reviewed workflow diff](../qualification/current-p2-capacity-profile-v3.workflow.diff)
contains the exact restricted Node argv used locally, with a portable node
command in place of the verified local runtime path. Its allow-read paths and
flags can be used from the repository root. Append --plan to inspect the
selection without executing test entries. The runner accepts no case filter.

The diff is DATA only and has not been applied. It proposes replacing the one
existing workflow job's npm test command with this explicit V3 command, without
an install, extra job, altered timeout, expanded permissions or action/runtime
upgrade. Checkout/setup/clean-tree checks and action pins remain preserved.
A new hosted-scope decision is required before this switch: existing authority
covers the unchanged 27-control CI selection.

See the [source-bound local result](../qualification/current-p2-capacity-profile-v3.actual-local-result.json).
P0 now has a broader locally executed candidate. Actual V3 hosted CI, full P1
SDK/HTTPS/SQLite composition, native P2 closure/recovery, economic pilot and
measured native P4 capacity remain separate acceptance gates.
