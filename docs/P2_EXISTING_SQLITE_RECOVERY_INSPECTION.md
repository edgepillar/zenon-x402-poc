# Existing V6 local recovery inspection

This opt-in command connects the existing V6 payer recovery client to an existing
native service-credit backend. It queries one exact original service request and
closes both handles. It never submits a request or creates a payment, proof,
grant, store or migration. Existing demo, buyer and server CLIs are unchanged.

This is **no-dispatch**, not SQLite read-only mode. Opening the payer can advance
its owner epoch. Both stores use their existing transaction and integrity guards.
Use only operator-selected, authorized private stores; this command is not
permission to open live/customer data.

## Invocation

Use Node 24 with the two flags in this exact order:

```sh
node src/service-credit-recovery-inspect-cli.js --manifest /private/operator-recovery/inspect.json --allowed-root /private/operator-recovery
```

The paths above are placeholders. The allowed root must be an existing,
private operator-owned directory. The manifest and both database paths must be
canonical absolute paths inside it. Symlinks, linked manifests and non-private
manifest/root permissions are refused. Existing native store path guards still
apply independently.

Feed the **original** complete `ServiceCredit ...` Authorization value through
standard input from your secure credential mechanism, then close the input
(EOF). One trailing LF is accepted. Do not put the proof in argv, environment,
the manifest, shell history or logs. No signer or private key is accepted.
Temporary buffers are cleared; erasure of JavaScript strings is not guaranteed.
The native stdin launcher now uses one total 5000 ms application input budget,
starting when it attaches its input collector. Partial bytes do not renew the
budget, and EOF is still required. Timeout, stream error, premature close or an
oversized input refuses before opening either database. The collector pauses and
requests destruction of its owned stdin stream and clears its own buffer/timer.

This is a JavaScript application timer, not a hard OS/native lifetime guarantee,
a store-operation deadline or permission to cancel/retry a payment. Event-loop
or native delays can delay callbacks. The selected native evidence below uses
pipe input on Node 24.19.0/macOS arm64; other stream/platform profiles are not
qualified. Invalid flags are still refused before collecting stdin.

## Private manifest contract

The root has exactly these ten fields, with no defaults:

| Field | Required source |
| --- | --- |
| `inspectionVersion` | Literal `1` |
| `payerDatabasePath` | Existing V6 payer database, never a create target |
| `backendDatabasePath` | Existing service-credit backend, distinct from payer/manifest |
| `fundingResourceUrl` | Original HTTPS funding resource |
| `custodyPolicy` | Original `policyVersion`, `maxRequests`, `serviceResourceUrl` |
| `selectedGrantId` | Selected existing grant |
| `deadlineMs` | Explicit integer 1..60000; not a hard CLI/read deadline |
| `requestKey` | Exact `grantId` and `requestId`, matching the selected grant |
| `expectedCheckpointPins` | Independently retained original `binding` and `digests` |
| `backendLimits` | Explicit existing-store resource limits below |

The manifest is at most 16384 UTF-8 bytes and must not contain the proof.
`custodyPolicy` is checked with BOTH the original funding URL and policy by the
existing validator, including its funding/service same-origin constraint.

`expectedCheckpointPins.binding` contains `requestId`, `paymentHash`, `origin`
and `contextId`. Its `digests` contains the original `requestBody`,
`paymentPayload`, `paymentRequirements` and `context` SHA-256 values, exactly
as independently retained. Do not learn new pins from the same database to
manufacture a trust root, normalize original bytes or invent replacement pins.
Missing/mismatching originals require external reconciliation, not a new payment.

`backendLimits` has exactly `busyTimeoutMs`, `maxStateBytes`, `maxOffers`,
`maxGrants` and `maxRequests`. All are positive integers; busy timeout is at
most 5000 ms, state bytes are 512..1048576, and each record bound is at most 1024.
These must also satisfy the existing backend's bounds/capacity checks. The
selected native test used 50 ms, 65536 bytes, 2 offers, 2 grants and 8 requests.
There is no pricing decision: an explicit throwing cost callback prevents one.

## Output and ownership

Exit 0 returns one bounded JSON line only after the original read and both
owned close calls returned. The line has status and backend-status observations,
whether the independent checkpoint pins matched, and explicit non-authority
fields. It omits paths, IDs, original bytes, proof, public key and raw errors.

A backend `CACHED_SUCCESS` is a recorded backend assertion. The client can still
report `CLIENT_RECONCILIATION_REQUIRED`. Neither observation confirms delivery,
clears persisted uncertainty or permits a retry, signature or replacement.
The current-authority and service-delivery fields remain `NOT_ESTABLISHED`.

A program refusal produces exit 1 with the fixed
`SERVICE_CREDIT_RECOVERY_INSPECTION_FAILED` line on stderr. The command does not
override Node's runtime warning policy: runtime diagnostics are distinct from
that fixed program line. Both successful native invocations in the selected
Node 24.19.0/macOS arm64 result had empty stderr. Other runtime/platform profiles
and a warning-present path are not qualified by that observation.

An explicit quiet runtime profile places `--no-warnings` before the script:

```sh
node --no-warnings src/service-credit-recovery-inspect-cli.js --manifest /private/operator-recovery/inspect.json --allowed-root /private/operator-recovery
```

This suppresses Node warnings, not program refusals; it grants no new authority.
A failed close is not silently retried or reported as release. The importable
`inspectServiceCreditOriginal` API provides only a fixed internal stage enum on
its redacted exception; the CLI never prints underlying reasons.

The V6 connection owns the payer and borrows this command's backend. The command
closes the payer connection once, then its own backend once on success/failure.
No root/store/transport handle escapes. The command does not clean any files,
recover a held owner, bypass an admission refusal or change storage policy.

## Exact evidence limit

The paired local result is
`qualification/service-credit-recovery-inspect-cli.behavior.result.json`.
One selected application-command test used two new private synthetic SQLite
files and one in-memory synthetic capability key/proof. It seeded one declared
request, then checked a cached original read, changed independent pins, and a
missing payer file. The CLI caused no additional dispatch, debit, execution or
proof. The original funding/checkpoint/request rows and backend ledger stayed
unchanged; two real local payer owner acquisitions were observed.

That paired API result exercises the importable CLI argument/manifest/native-owner
command path, not a separate process's stdin/stdout launcher. It remains
unchanged and must not be reinterpreted as native-process evidence.

The additional selected process result is
`qualification/service-credit-recovery-inspect-process.behavior.result.json`.
One new test starts four actual CLI processes using two new private synthetic
SQLite files and one in-memory capability key/proof. It checks the default
invocation with one trailing LF, the explicit quiet profile without LF, invalid
flags while stdin stays open with no bytes/EOF, and 1027 noncredential bytes.
Both successful processes return the same redacted JSON. Both negative cases
return only the fixed refusal and cause no further payer owner acquisition.
All four exits, stream EOFs and child-close events were observed, with no
remaining process at the check. The original rows and backend ledger remain
unchanged; exactly two local inspection owner acquisitions occur.

That earlier process slice is normal-exit native reopen, not forced-crash,
hardware-loss or full server-restart qualification. It changed no application
source at that time. Its API/process records remain bound to the old exact CLI
source, which is retained in protected CAS and immutable Git. They do not
qualify a later changed stdin reader.

The changed-reader result is
`qualification/service-credit-recovery-inspect-input-deadline.behavior.result.json`.
It exercises five new native processes under one selected test: both original
EOF forms, empty open stdin, partial open stdin with another byte at 3000 ms,
and oversized noncredential input. Both successful inspections still return the
same redacted line. Empty and partial streams refuse at approximately 5.03 and
5.04 seconds in that single observation; the separate 7000 ms test guard never
fires. Those times are evidence of the selected total-input-budget paths, not
a hard OS guarantee or throughput benchmark. Neither refusal acquires another
payer owner or changes original rows/backend ledger. All five processes close
normally and their stream EOFs are observed.

The exported inspection API, args/manifest handling, original-read and
payer/backend-close function bodies are unchanged by this stdin-only edit.
That source comparison does not transfer every older runtime case to the
changed graph. The previous code and usage-document versions remain retained.

Broader malformed/UTF-8 input, input error/premature-close injection, late full
credentials after timeout, concurrency, close-failure and platform matrices
remain separately unqualified. No existing test entry was replayed. No SDK,
network, provider signature, real payment, PREPARE, chain qualification or live
pilot ran. Hosted CI is NOT_RUN, not green. Full P2 and production acceptance
remain open.
