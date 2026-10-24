# P1 current one-shot funding TLS selection

## Status

**Prepared; native execution not authorized or run.** The pure gate passed 16
selected self-contained tests. A separate actual source-only CLI invocation
admitted 11 exact current source rows and four production modules. Two
`node --check` commands parsed the new selection/fixture without importing them.
These are not four passing native TLS scenarios, a successful funding POST,
full P1/P2, hosted CI or production evidence.

Source parent: `87b55e77353d8545ce94698a29f986165b5574f0`.
Main parent: `cc19f63b912b45b720e3e8fdba8f433ee8b0d7bc`.

[Normalized local results and pins](../qualification/funding-tls-current-gate.actual-local-result.json)
separate the actual checks, the initial failure and the still-unexecuted path.

## Versioned current profile, not a historical rewrite

The new source-branch-only `funding-post-native-loopback-tls-current` profile
includes the actual native adapter, response custody, close owner and new
readable-flow dependency. Its source-only gate checks exact bytes, LF counts,
SHA-256/Git blob pins, observed import edges, the fixed single-attempt ceiling
and the complete storage policy before a task can be opened.

The historical manifest, entry, body fixture, launcher, policy and failed
native result remain byte-bound to their old record. They are not edited or
relabelled. The old launcher is reused only for its unchanged pinned
read/binary/capacity helpers beyond source-only mode; its two-attempt main is
not called, its globals are not overridden, and its source is not rewritten.

The new fixture keeps the same four native scenarios and eight-connection
loopback ceiling. It additionally checks the current response-flow counter
inside those existing scenarios. It has not run against TLS.

## Actual pure checks and first failure

The first pure Python unit command exited 1: 14 tests passed and two negative
import cases failed. The original import scan did not see bare import
statements. Its capture digests and pre-correction inputs are retained as
historical failure evidence, not replaced by the later successful counts.

The corrected gate recognizes literal static, dynamic and bare imports,
refuses packages/unselected builtins/relative aliases, and conservatively
rejects unaccounted import tokens. This is a source-pinned lexical check for
these reviewed files, **not a general JavaScript parser or hostile-code sandbox**.

The final 16 unit tests use synthetic source-map and PEM-shaped data. No test
fixture is a cryptographic key, certificate or DER validator. They exercise
source drift, missing/extra/reordered rows, exact numeric types, one-attempt
limits, policy weakening, import escapes, bounded PEM pairs and strict current
capture/TAP acceptance. The suite is self-contained and needs no native profile
or native adapter on main:

```sh
python3 -I -S -B qualification/funding-tls-current-gate.test.py
```

A separate actual `--source-only` invocation read the real current profile,
matched its 11 rows and exited zero. It imported the pure gate, not the native
Node application, historical helper module, manager or any TLS implementation.
This does not prove Node runtime behavior or authorize execution.

## Proposed private TLS-output handling

The new launcher is designed to capture a future OpenSSL key/certificate PEM
stream under explicit caps, then create its two private Node inputs through
the task manager's registered, quota-accounted writes. No raw PEM is printed.
The protected original capture and detached components have separate digests;
there is no archive or second whole-output copy.

The planned command selects the key output explicitly and leaves certificate
output on standard output. The [OpenBSD command manual](https://man.openbsd.org/openssl#REQ)
describes those output options. This plan is not proof of the selected local
binary's behavior: the OpenSSL command and actual key/certificate parsing path
have not executed. The splitter checks framing/base64 only, not cryptography.
A null random-state target avoids planning a new unregistered seed file;
this is also not a native storage qualification.

The trusted manager is unchanged. Existing failed TLS roots, keys/certificates,
HOLD decisions and cleanup helpers are not adopted, changed or cleaned.

## One-shot authority and future prerequisites

Default mode is source-only. Read-only `--pre-native-plan` and native
`--execute` are distinct. Neither a CLI flag, manifest, valid gate result nor
empty store grants human authorization. The separate current single-attempt
request remains pending; the historical two-attempt allowance stays consumed.

A future authorized run requires exact source/manager/runtime pins, the selected
mounted volume identity, a fresh private root and exact store ID, the 10 GiB
floor plus allocation/scoped reservations/safety margin, and the 4 MiB task
policy. One task and two commands are allowed in that selected store. Creating
another store to repeat it would require fresh authority, not reset this scope.

Before each native command, sources, tool identities and capacity are checked.
The one OpenSSL and one Node command may exercise only four 127.0.0.1 scenarios
with at most eight connections and zero Node children. No SDK, SQLite, nonce,
wallet/payment/capability/provider signing, external endpoint or full DP graph
is admitted. TLS test-key generation is its own explicitly requested scope.

## Publication and resource limits

Main receives only the tested pure gate, self-contained test, result and this
document. The native selection, fixture, manifest, policy and launcher stay on
the [source branch](https://github.com/edgepillar/zenon-x402-poc/tree/x402/p1-router-late-pending-close-integration-v2).
No default buyer, package manifest or workflow changes are part of this batch.

This local work made no TLS/OpenSSL call, manager import, storage root/task,
qualification scratch, private key, download or archive. Bytecode/compile
caching was disabled. Python captures were bounded at 32 KiB per stream and
15 seconds per check. Those controls are not an OS/network sandbox or a
performance/capacity benchmark. Native prerequisites/capacity were not measured.

Both exact parents had zero check-runs, statuses and Actions runs at review.
No workflow was dispatched. P0 full current-head CI, full P1/P2, the economic
pilot and measured capacity remain open.
