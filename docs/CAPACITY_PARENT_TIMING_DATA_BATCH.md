# Offline parent timing DATA batch inspector

Status: **88 selected DATA controls passed**, including two Python-only pipe
CLI smoke invocations. This is a bounded offline inspector, not a native
workload runner or an authentication service.

The [CLI](../qualification/check-capacity-parent-timing-data-batch-v1.py)
loads the exact pinned R4 pure Python controller once, without source rewriting.
It checks that source's identity around each case and refuses changed bytes.
It does not load the application graph, SDK, SQL, manager or private task roots.

## Two deliberately different scopes

| Mode | What is independently checked | What is not established |
| --- | --- | --- |
| `--check-parent` | Expected run/source/lane order, trace limits, every parent event and the entire recorder report | Whole workload/component validation, receipt or native authentication |
| `--check-capture` | The above plus the exact full capture, whole workload/component DATA and supplied receipt fields/digests | Authenticity of receipt, caller context, native events or resource release |

Expected context is supplied independently in the first input frame. It is
never inferred from a returned capture. A self-consistent but fabricated
declaration still has no native or economic authority.

## Input contract

Use a verified **Python 3.12.14** executable with `-I -B -S`. No execution,
input-path, alternate-controller, context-inference or retry option exists.

```sh
python3.12 -I -B -S qualification/check-capacity-parent-timing-data-batch-v1.py --describe
python3.12 -I -B -S qualification/check-capacity-parent-timing-data-batch-v1.py --check-parent < operator-private-batch.ndjson
```

Every input line is one compact ASCII JSON object followed by exactly one LF.
Duplicate keys, non-finite numbers, noncanonical spacing, empty/missing cases
and any trailing byte refuse. Preserve original inner capture key order: a
key reorder changes the original receipt digest even when JSON values agree.

The header has exactly `batchVersion: 1`,
`kind: "PARENT_TIMING_DATA_BATCH_EXPECTATIONS_V1"`, a positive
`inputBudgetBytes`, and an `expectations` array. Each expectation has exactly
`expectedRunId` (64 lowercase hex characters), `sourceRowsSha256`, and
`workload` (the complete independent R4 workload plan). The fixed graph digest is
`d756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027`.

One following case corresponds to each expectation in order:

- Parent mode: exactly `{ "parentTimingData": ..., "recording": ... }`.
- Full mode: exactly `{ "capture": ..., "receipt": ... }`. The capture is
  the original inner JSON object, not its diagnostic summary. This version
  admits only the original empty-stderr success shape. Nonempty stderr,
  UNKNOWN, nonzero exit and incomplete receipt DATA refuse.

Finite floats are admitted only in bounded receipt metadata, for example the
manager's declared completion timestamp. Header, trace and capture DATA retain
the actual controller's strict integer/bool distinction and complete type rules.
Unknown receipt metadata is bounded but is never treated as authority.

## Finite work and storage-conscious behavior

The tool reads at most eight cases sequentially. The header is at most 64 KiB;
the caller's aggregate payload budget is at most 16 MiB + 64 KiB. A bounded
read may consume one extra detection byte on overflow. A final one-byte read
must observe EOF. Output is at most 2,048 bytes per record and 24 KiB overall.
Raw trace, run/lane identifiers, private input and exception details are not
printed. The program writes only its bounded stdout stream and creates no
scratch, cache, source tree, package copy, report or task-storage object.

Only the current case is retained; previous case trees are released before
the next read. Full mode releases its first decoded capture before the actual
controller decodes the reconstructed original bytes. Expected plans and the
single pinned control module remain resident. Temporary JSON strings/bytes and
the controller's bounded arithmetic still allocate memory. These are logical
bounds, not a zero-copy claim or measured peak-RSS guarantee. A slow stdin
producer can still block: the caller owns an outer deadline.

Case output is provisional. Accept a batch only when the final record is
`PARENT_DATA_BATCH_COMPLETE`, all output was captured, and the actual process
exited zero. A write/flush failure can occur after bytes are visible, so a
printed complete record without a successful final exit is not success.
Any generic rejection/partial output/unknown exit withholds completion.
Borrowed input/output streams are not closed by the library entry point.

## Actual local evidence and unchanged gates

The [selected suite](../qualification/capacity-parent-timing-data-batch-v1.behavior.py)
uses the existing genuine-source synthetic fixture, not a replacement checker.
It imports only that fixture builder's DATA helpers; it does not execute the
older 175-case suite. Full captures and manager receipts in this suite are
explicitly synthetic in-memory declarations. Two real CLI processes receive
those declarations through pipes, without scratch or native application workers.

The [actual result](../qualification/capacity-parent-timing-data-batch-v1.actual-local-result.json)
retains three source-bound selections: 81, 88, then the final portable 88 tests
passed with no failures or skips. Review removed source-branch-only preservation
dependencies from the reusable test suite; its four DATA inputs are available
on main. The outer local check still verified 18 preserved native/control
inputs. Do not relabel earlier test-source digests as final-source evidence.
The current 88-case command completed locally in about 0.27 seconds; this is
only test-run duration, not a capacity or performance benchmark.

The native graph declaration, all five Python launch controls, plan and launch manifest
remained byte-identical. This tool is outside that pending native graph. No
native allowance was broadened or consumed. The older native/P2 evidence,
failures and storage remain untouched. The hosted profile remains the existing
27 DATA/component cases; it does not run these Python batch tests.

No SDK/x402 package, SQLite, key, signature, nonce search, socket, manager
task, native worker, install, historical cleanup or automation was entered by
these DATA checks. Native capacity, physical release, economic acceptance,
provider authority, live pilot and production remain unqualified.

