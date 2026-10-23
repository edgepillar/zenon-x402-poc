# P1 V3 native composition attempt and API-surface review

## Actual result

**FAILED_OR_INCOMPLETE.** One approved V3 native attempt used the exact source at
[2a4b2ff65efec3868b5eca404a61697e0f57d8f5](https://github.com/edgepillar/zenon-x402-poc/commit/2a4b2ff65efec3868b5eca404a61697e0f57d8f5).
Actual Node exit was 1 with complete stdout/stderr capture. TAP recorded six
tests: four passes, one failed selected case and its failed parent.
There were zero skipped, cancelled or todo tests.

The [exact result and sanitized TAP](../qualification/p1-native-v6-two-sqlite-once-v3.failed-local-result.json)
are not relabelled by subsequent source fixes.

| Selected case | Actual result |
| --- | --- |
| Pending retains the same V6 original and SDK tuple | PASS |
| Success, synthetic BOUND handoff and actual V6 service submission | PASS |
| Original proof replay without another debit | PASS |
| Valid foreign grant rejected by client and native service | PASS |
| Response loss and full same-two-file normal reopen | FAIL |

## Newly reached behavior

The fifth case performed the real post-header response-loss injection and
refused a later submit without another request. The actual payer close returned
its store slot while preserving client CLOSE_UNKNOWN. Normal reopen of the same
V6 payer file matched the retained checkpoint, both originals, both intents,
the prior response observation and the absence of a response for the lost reply.

The real `getOriginalRequestCustodyQuarantine` API returned
CUSTODY_OUTCOME_UNKNOWN after that reopen. The foreign original remained absent.
Thus the payer-reopen/quarantine milestone is observed in this failed
composition, rather than inferred from raw stored bytes or a hard-coded flag.

The actual application closed with zero tracked sockets, requests, handlers
and timers. Backend close returned. The fixture then called nonexistent
`Backend.open` at line 404 and failed:

```text
Backend.open is not a function
```

The class actually exposes static `openExisting` at source line 1108.
No backend reopen occurred. The later ledger equality, final selected/foreign
debit totals and execution-count assertions were not reached. This is a fixture
preparation/review error, not evidence that `openExisting` behavior failed.

V3's new completion guard worked: it recorded the last case FAILED,
`backendReopenedAfterLoss: false`, parent P1_SELECTED_CASE_INCOMPLETE, and emitted
**zero** unconditional success diagnostics. Four completed cases and the actual
failure remain the result; no completion claim is inferred from the summary.

## Native execution boundary and retention

The selected graph contained 57 verified inputs / 1,244,631 source bytes, with
three resolve-only bare-import bindings, 53 declared files resolved and zero
source transforms. Existing packages were `@x402/core@2.23.0` and
`zod@3.25.76`; Node was pinned to 24.19.0 / Darwin arm64. Ordinary installed
namespace qualification and an OS/network sandbox are not established.

Exactly one new 4 MiB task, one OpenSSL test-TLS command and one direct Node
command ran. There were zero Node children. Eight loopback connections completed
eight authenticated TLS 1.3 handshakes, within the 48-connection ceiling.
Only two new synthetic SQLite files, two in-memory synthetic capability keypairs
and three capability signatures were used.

No installation, Zenon SDK, external network, wallet/payment/provider signature,
nonce search, real PREPARE, application restart or pilot ran. Facilitator
verification, settlement, observation, service work, trusted grant activation
and the PREPARED-to-BOUND handoff remained explicitly synthetic. Funding ACK
does not establish grant activation or chain/economic authority.

The task closed FAILURE/HOLD. Both native child files remain protected, not
adopted, reset, removed or reused. Their combined logical size is 77,824 bytes.
Both previous failed tasks and all four prior child-file digests were rechecked
unchanged. CAS reuse added nine unique objects; the root now retains 85 objects /
1,595,867 logical bytes. These are logical counts, not APFS physical reclaim.
No root policy or ownership metadata was rebound and no historical cleanup ran.

## Complete named-surface check before another native attempt

The pre-execution review missed `Backend.open`. To catch that class of error
before allocating another native fixture, the working source now includes the
read-only checker
`qualification/review-p1-native-v6-api-surface.py`.

It reads bounded, identity-checked source only. It neither parses/imports
JavaScript nor launches Node, opens SQL, creates sockets or signs anything.
The finite lexical check maps 73 direct named call occurrences and twelve
relative named imports to actual exported classes, methods and fixed returned
factory surfaces. Unsupported computed receivers, changed factory return shapes
or an unreviewed client alias refuse the gate.

The [source review](../qualification/p1-native-v6-api-surface.actual-source-review.json)
records fifteen passing checker regressions: historical V1/V2 quarantine/open
mismatches, the V3 open mismatch, corrected V4 names, deliberate named typos,
computed receivers, alias drift, missing exports and factory-surface changes.
Client-suffix matches are not double-counted as separate receivers.

The fifteen source-gate cases are reproducible from the working branch without
allocating a task or launching JavaScript. With Python 3.12.14, run:

```text
python3.12 -I -S -B qualification/p1-native-v6-api-surface-regression.py
```

The exact runner bytes and analyzed source inputs are pinned in the source
review record. V1 through V4 fixture sources must be present; V4 remains on the
working branch, so the main-only report does not imply a native test entry point.

The source gate finds V3's missing `Backend.open`. A separate **unparsed/unrun
V4 draft** uses `openExisting` and passes the named-surface check, with no missing
or unsupported names. It also checks all directly used backend and payer
prototype/static methods before fixture resources. V1/V2/V3 sources are unchanged.

This is deliberately NOT a general JavaScript parser or proof of argument,
return-value, schema, runtime or native behavior. It does not authorize another
attempt. Any future launcher must run this gate against its exact pinned source
**before opening its task or invoking OpenSSL/Node**, in addition to independent
fresh one-shot authority, full source/dependency review and capacity checks.
The V4 fixture/profile currently exist on the working branch only.

Main receives only this report and the failure/source-review records. The
checker and regression runner depend on native application and V1-V4 source
inputs that are not all present on main, so those tools remain on the working
branch with their inputs. No incomplete qualification entry point or native
default is transferred to main.

## Remaining gates

The consumed V3 permission was not reused. No V4 native attempt ran in this
V3/source-gate increment. A later, separately approved V4 attempt is recorded in
[its own local qualification](P1_NATIVE_V6_V4_LOCAL_QUALIFICATION.md); it does not
change the failed V3 result.
The new native HTTPS host, native application deadline binding and its shared
component core were excluded from this old application graph; this result does
not qualify them.

Backend normal reopen and complete P1 composition still require selected native
evidence. Forced interruption, actual provider funding/activation, hosted CI,
live delivery and economic pilot remain separate. CI is NOT_RUN_NOT_GREEN,
full P1 remains NOT_ESTABLISHED and economic pilot remains NO_GO.

