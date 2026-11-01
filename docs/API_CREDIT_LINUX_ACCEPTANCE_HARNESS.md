# Linux API-credit CLI acceptance harness: unexecuted source candidate

`qualification/api-credit-linux-acceptance.py` drives the existing documented
`src/api-credit-cli.js` through real inherited POSIX FIFO descriptors. It does
not introduce another buyer, payment, credential loader or provider product.
The harness has not been executed. Native execution remains disabled by the
current user decision. Do not interpret its DATA preflight results as Linux,
SDK/core, SQLite, HTTPS, signer, restart or release qualification.

The explicit version-two candidate advances the G1 one-funding/100-request
scenario, persisted provider-ledger observations and the normal fresh-process
original-result read. Full G1 additionally requires the actual accepted native
run, spending-budget, negative-case and concurrency evidence. G2 still requires
its specified interruption cutpoints, signer loss,
stale-owner and physical release or controlled HELD observations. Both gates
remain OPEN; a `PROCESS_AND_LEDGER_OBSERVATIONS_MATCHED` report is insufficient
to close them by itself.

## Exact scenario

An independently reviewed synthetic fixture supplies all bytes before launch:

1. A canonical, keyless non-DP operator bootstrap and an existing 32-byte
   synthetic credential in a separate private file.
2. Exactly 106 command frames: prepare, commit with the ready original-grant
   query, submit funding, original handoff, 100 different service request IDs,
   an exact replay of the first request, and close.
3. Exactly 105 expected reply frames. Close consumes a command without an ACK.
4. A canonical keyless recorded-result inspection profile for the same original
   checkpoint, independently retained pins, payer file, grant, request and proof.
5. The exact expected historical response, including its no-authority fields.
6. The explicit backend-ledger profile, matching the recovery database/limits
   and stating one expected unit per request. No unit-price default is inferred.

The pure preflight uses the real non-DP bootstrap, command, service-wire,
ready-query, original-checkpoint and recorded-result codecs. It validates the
whole supplied transcript before the credential is read. It never converts
actual prepare output into independent pins or generates a proof, signature,
grant, payment, replacement or retry. Signature-shaped test strings are not
authenticated by this preflight. The actual product retains its own checks.

The first application process receives only the fixed RUN arguments. The
parent waits for each complete exact predeclared reply before sending the next
command. A mismatch, refusal, unknown result, extra output, broken frame or
deadline ends advancement. No later command or automatic recovery is sent.

Only a zero exit, complete matching output, EOF and the existing clean CLI
status allow the first fixed provider-ledger probe. That separate process
uses the actual existing `ServiceCreditSqliteStore.openExisting`, `load` and
`getDurableExecutionSnapshot` methods. The snapshot pair is bracketed by a
second ledger load; all three revisions and both complete ledger envelopes
must match. One original grant, 100 distinct successful request/execution
cross-links, exact response commitments and purchased/consumed/held/remaining
units must match the same independent purchase and original command transcript.
No claimed request count is substituted for those persisted records.

The next application process uses only `--recorded-result-fd`
and `--output-fd`; it receives no credential or service-command input. Its
same-original cached response must match the selected first response exactly.
Normal process exit is observed; no interruption or hardware durability claim
is made. A second fixed ledger-probe process must return the identical complete
observation after recovery. The external synthetic provider, accepted native
fixture and release evidence remain prerequisites, not invented counters.

The probe's existing store opening and reads use real transactions, including
BEGIN IMMEDIATE; they are not OS-readonly SQLite handles. The source adds no
table, writer, grant activation or ledger migration. Matching bracketing
revisions are conditional observations, not an atomic snapshot or anti-rollback
guarantee. Store validation, pure state/execution hydration, original identity,
unit counters and result commitments are checked; equality authenticates neither
provider nor chain. A known void close precedes output, without claiming OS
handle release. A throwing or opaque read retains uncertainty without another
read/close attempt. Known bounded semantic conflicts may close once and still
withhold the result.

## Future managed invocation

After separate native approval and source/dependency/runtime/resource review,
an owned task may invoke the following source candidate:

```sh
python3 -I -S -B qualification/api-credit-linux-acceptance.py \
  --execute-candidate "$SPV_TASK_SCRATCH/manifest.private.json"
```

No approved native invocation has occurred. The outer approved task-storage
launcher supplies `SPV_TASK_SCRATCH`, its lease, quota, mounted-volume identity,
global reservations, ten-GiB floor and foreground process-group supervision.
This harness neither creates/adopts a storage root nor supplies an OS sandbox.

The private manifest has exactly `version: 2`, `node`, `repository`,
`sourcePins`, `fixturePins`, `bootstrapMs` and `totalMs`. `node` has an absolute
path plus exact `bytes` and `sha256`; `repository` is the reviewed absolute
ordinary source tree. `sourcePins` lists unique relative `path`, `bytes` and
`sha256` rows, including the CLI, fixed preflight, pure contract, admission,
catalog, fixed ledger contract/probe and every source/package row in that catalog. The manifest cannot
choose executable arguments, import conditions, a module or package resolver.
Declared pins establish byte equality, not operator identity or authenticity.

`fixturePins` binds the following seven fixed names in the owned scratch directory:

| Key | File | Maximum bytes |
| --- | --- | ---: |
| `runProfile` | `run-profile.json` | 262144 |
| `commands` | `run-commands.jsonl` | 2097152 |
| `runReplies` | `run-replies.jsonl` | 2097152 |
| `recoveryProfile` | `recovery-profile.json` | 65536 |
| `recoveryReply` | `recovery-reply.jsonl` | 4096 |
| `ledgerProfile` | `ledger-profile.json` | 65536 |
| `credential` | `credential.bin` | exactly 32 |

Files must be private, owned regular files with one link and no symlink
ancestors. Every payer, spending and recovery/backend database path and allowed
root must remain beneath this task's own scratch; operator data directories
are refused. Bootstrap is 1-60000 ms; one total deadline of 1-120000 ms spans
preflight, both application processes and the two fixed ledger probes. No child
entry starts after an observed total-deadline expiry. The original product byte limits
remain unchanged. The operator must choose an adequate outer task quota for
all retained fixtures, source aliases, outputs and receipts before admission.

## Ownership, bounds and preserved failures

The parent uses anonymous `os.pipe()` FIFOs and passes only each child's
selected descriptor ends. Node's extra `spawn` stdio can be socket-backed;
those endpoints do not satisfy the existing CLI FIFO contract. No named-pipe
filesystem object, shell, credential in argv/environment or arbitrary command
is used. Application children have no Node flags or loader environment. Binary
and full selected source/package pins are rechecked before each application
entry. Binary hashing streams 64-KiB chunks without copying the runtime.

Each exact reply has its existing aggregate cap; unexpected stdout is refused
and application stderr is capped at 64 KiB. Preflight stdout/stderr are capped
at 4096/128 bytes. Each ledger probe has a 4096-byte output and 64-KiB stderr
cap. No full ledger snapshot or second database copy is written by the probe;
only bounded observations/digests are retained. Raw bounded observations and per-process outcomes are kept
under a newly created private `linux-cli-acceptance` directory. The first
offending bounded prefix remains evidence. No historical output is overwritten,
deleted, repackaged or reclassified, and no output or fixture is public by default.

No helper automatically kills or retries a process. A timeout does not establish
termination: the report retains the actual PID/exit/live observation. A still-live
child remains in the outer managed process group and keeps its task HELD; an
independently approved outer stop/recovery policy is required. Closing known
parent endpoints does not prove child, key, SQLite, socket or provider release.
There is no automatic second opener after UNKNOWN. Known Python buffers are
cleared where possible; complete secret erasure is not established.

The source candidate supplies no installer, TLS/key/proof generator, network
discovery, provider launcher, real funding, SDK PREPARE, CI change or CI retry.
Its current qualification is the pure transcript/ledger preflight over declared
memory DATA plus parser checks. Runtime integration remains unexecuted.
