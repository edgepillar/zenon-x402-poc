# Linux API-credit CLI acceptance harness: unexecuted source candidate

`qualification/api-credit-linux-acceptance.py` drives the existing documented
`src/api-credit-cli.js` and `src/issued-provider-cli.js` through inherited POSIX FIFO descriptors. It does
not introduce another buyer, payment, credential loader or provider product.
The harness has not been executed. Native execution remains disabled by the
current user decision. Do not interpret its DATA preflight results as Linux,
SDK/core, SQLite, HTTPS, signer, restart or release qualification.

The explicit version-six candidate retains the fixed provider journal, start,
ACTIVATE and close sequence and adds three selected service authorization
negatives to the G1 one-funding/100-request
scenario, persisted provider-ledger, payer spending-budget and retained signer observations,
and the normal fresh-process original-result read. Full G1 additionally
requires the actual accepted native run, changed-offer/different-payment and concurrency evidence. G2 still requires
its specified interruption cutpoints, signer loss,
stale-owner and physical release or controlled HELD observations. Both gates
remain OPEN; a `PROVIDER_PROCESS_NEGATIVES_LEDGER_SPENDING_AND_SIGNER_OBSERVATIONS_MATCHED` report is insufficient
to close them by itself.

## Exact scenario

An independently reviewed synthetic fixture supplies all bytes before launch:

1. A canonical, keyless non-DP V3 loopback operator bootstrap and an existing 32-byte
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
7. An independently selected canonical signer-inspection V3 profile, requiring
   `GRANT_RECOVERY_V1`, an explicit uncertainty-age maximum, the same existing
   spending-file owner/policy/root/device/limits and original payment/digest/URL.
8. A canonical provider V3 FRESH profile selecting JOURNAL_ONLY, the same
   purchase offer/selection/terms, execution-receipt product and provider ledger
   database/root/limits used by both historical probes. Provider HTTPS is bound
   to the exact selected `127.0.0.1` origin; its independently selected RPC URL
   is restricted to `ws://127.0.0.1/` with an optional explicit port.
9. An explicit new-journal profile for that same provider journal and selected
   device. Initialization is a separate fixed CLI mode; no existing directory
   is adopted, reset or removed.
10. Exactly one preselected ACTIVATE command, with ID `acceptance-activate`,
    the observer filename for the original payment hash and an independently
    retained record key. The actual provider validates that pair against its
    retained original before opening the observer; DATA preflight does not
    authenticate the record key, grant, chain or authority record.
11. An existing provider TLS key/certificate frame in its own private binary
    file. The harness generates no key, certificate, proof or signature.
12. The closed selected negative profile described below. It changes existing
    proof-bound DATA without generating a cryptographic signature.

The pure preflight uses the real non-DP bootstrap, command, service-wire,
ready-query, original-checkpoint and recorded-result codecs. It validates the
whole supplied transcript before either TLS material or the buyer credential is read. It never converts
actual prepare output into independent pins or generates a proof, signature,
grant, payment, replacement or retry. Signature-shaped test strings are not
authenticated by this preflight. The actual product retains its own checks.

After pure preflight, the parent runs the existing fixed journal initializer
with inherited profile/output FIFOs. The exact INITIALIZED response, EOF, zero
exit and existing clean CLI marker must match before provider startup. The
provider RUN child receives only its fixed profile/TLS/control/output
descriptors. Its exact START/LISTENING response must precede the first buyer
credential read or buyer process launch.

The first buyer application process receives only the fixed RUN arguments. The
parent waits for each complete exact predeclared reply before sending the next
command. A mismatch, refusal, unknown result, extra output, broken frame or
deadline ends advancement. No later command or automatic recovery is sent.

After matching buyer reply two (the original funding BOUND response), the
parent pauses before sending handoff. It sends the single preselected ACTIVATE
command to that same provider process. Only a complete matching ADMITTED
response for the independently selected original grant and transaction allows
handoff and the existing 100 requests plus exact replay. BOUND creates no grant
authority. There is no RESUME, polling loop, retry, replacement or second
observer opener. The parent continues to drain the same provider's bounded
output/stderr while the buyer runs; unexpected provider output refuses progress.

After the buyer's complete clean exit, the fixed negative probe must match all
three selected authorization refusals and known client-close observations while
the same provider remains live. The parent then sends exactly one explicit
CLOSE command to that provider. Its exact CLOSED response, EOF, zero exit and
existing clean provider marker must all match before either ledger probe can
open the provider file. An activation/start/close ambiguity prevents later
stages. Parent endpoint closure does not establish physical release.

Only a zero exit, complete matching output, EOF and the existing clean CLI
status allow the first fixed provider-ledger probe. That separate process
uses the actual existing `ServiceCreditSqliteStore.openExisting`, `load` and
`getDurableExecutionSnapshot` methods. The snapshot pair is bracketed by a
second ledger load; all three revisions and both complete ledger envelopes
must match. One original grant, 100 distinct successful request/execution
cross-links, exact response commitments and purchased/consumed/held/remaining
units must match the same independent purchase and original command transcript.
No claimed request count is substituted for those persisted records.

The same probe process then opens the existing payer spending file using the
actual four-table grant-recovery owner used by the product. It derives the
OPEN_EXISTING profile from the independently declared CREATE_NEW selection:
the same account, policy, store/owner identity, epoch one, device, private root
and file limits are retained. It never adopts metadata from a database,
transfers ownership, creates a missing file or falls back to a signer-only
schema. The actual opener also validates its retained signer/grant-query rows;
the probe has no signing, record-retention or grant-query-write operation.

Four current-owner guards bracket two complete spending loads and one retained
signer read through the actual same-owned signer/age protocol. Both spending strings
must be identical and pass the actual spending-history decoder and journal
arithmetic. Exactly one SPENT row must bind the same payment ID, accepted
network/asset/recipient/amount and preparation digest used by the real spending
wrapper. That digest uses the existing codec's captured JSON bytes; the
unrelated sorted snapshot encoding must not replace it. RESERVED, UNKNOWN,
missing, foreign, extra or changed originals fail the clean scenario. Money
exposure and provider service units are separate observations.

The selected signer record must contain SIGNED_DATA for that same original.
Its transaction hash, complete serialized checkpoint and all independent pins
must equal the independently selected handoff checkpoint and commit pins. No byte or expectation is learned from actual child output or the database. An intent-only, missing,
foreign or different signed original cannot qualify the clean scenario.

The actual V3 selector and signer/age owner perform the existing read, UTC-day,
current-owner, revoke and close protocol. A read-only facade records only its
two bounded journal loads; it forwards original method returns unchanged and
exposes no CAS, signing or record-retention method. The existing budget verifier
checks those same bytes after the same known close. There is one payer owner,
with no extra connection, probe process or database copy. Throwing or opaque
reads retain the original protocol's UNKNOWN behavior without a forced close
or another acquisition.

Budget arithmetic observes the stored day. The signer owner separately checks
its current UTC observations and selected uncertainty-age policy. The redacted
stable history digest excludes the current day, so a normal read across midnight
is not mistaken for changed history. No clock, expiry or age observation releases
a reservation, replaces an original, authorizes a signer or permits dispatch.
The provider owner must close before the payer owner opens; the two stores do
not share an atomic snapshot.

This normal retained-history observation is a prerequisite for G2 qualification,
not a SIGNER-RESPONSE-LOSS result. No signer-response-loss or interruption
cutpoint has been run, and no new signature is produced by either probe.

The next application process uses only `--recorded-result-fd`
and `--output-fd`; it receives no credential or service-command input. Its
same-original cached response must match the selected first response exactly.
Normal process exit is observed; no interruption or hardware durability claim
is made. A second fixed ledger-probe process must return the identical complete
provider-and-spending observation after recovery. An accepted native fixture,
externally managed synthetic RPC and release evidence remain prerequisites.

The accompanying provider fixture is pure codec DATA with deliberately invalid
signature-shaped bytes, synthetic authority text and a declared CA. It is not
an accepted native fixture. The explicit non-DP V3 buyer bootstrap can select
the existing closed loopback HTTPS read session with the same CA and an explicit
unprivileged port. V2 keeps its public pinned-route policy. See [the V3 read
bootstrap](API_CREDIT_LOOPBACK_READ_BOOTSTRAP.md). The preflight states the selected
buyer read profile and never falls back to public reads. This source selection
does not establish OS/network isolation or native fixture acceptance. All routes
and native resources still require separate review before a future native run;
neither this preflight nor the Python source supplies a network sandbox.

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

The private manifest has exactly `version: 6`, `node`, `repository`,
`sourcePins`, `fixturePins`, `bootstrapMs` and `totalMs`. `node` has an absolute
path plus exact `bytes` and `sha256`; `repository` is the reviewed absolute
ordinary source tree. `sourcePins` lists unique relative `path`, `bytes` and
`sha256` rows, including the CLI, fixed preflight, pure contract, admission,
catalogs for both CLIs, fixed provider/ledger/spending/signer contracts/probe,
the negative contract/reply/probe modules and every source/package row in both catalogs. The manifest cannot
choose executable arguments, import conditions, a module or package resolver.
Declared pins establish byte equality, not operator identity or authenticity.

`fixturePins` binds the following thirteen fixed names in the owned scratch directory:

| Key | File | Maximum bytes |
| --- | --- | ---: |
| `runProfile` | `run-profile.json` | 262144 |
| `commands` | `run-commands.jsonl` | 2097152 |
| `runReplies` | `run-replies.jsonl` | 2097152 |
| `recoveryProfile` | `recovery-profile.json` | 65536 |
| `recoveryReply` | `recovery-reply.jsonl` | 4096 |
| `ledgerProfile` | `ledger-profile.json` | 65536 |
| `signerProfile` | `signer-profile.json` | 16384 |
| `providerProfile` | `provider-profile.json` | 262144 |
| `providerJournalProfile` | `provider-journal-profile.json` | 8192 |
| `providerActivation` | `provider-activation.json` | 1024 |
| `negativeProfile` | `negative-profile.json` | 8192 |
| `providerTls` | `provider-tls.bin` | 131080 |
| `credential` | `credential.bin` | exactly 32 |

Files must be private, owned regular files with one link and no symlink
ancestors. Every payer, spending, provider intake, observer, journal and recovery/backend path and allowed
root must remain beneath this task's own scratch; operator data directories
are refused. The four explicit FRESH database paths must be distinct and absent;
the journal directory must be absent and the selected private observer root
empty. Bootstrap is 1-60000 ms; one total deadline of 1-120000 ms spans
preflight, journal initialization, provider lifetime, both buyer application
processes, the one fixed service-negative probe and the two fixed ledger probes. The separately bounded provider
command/execution/start/close allowances do not renew this parent deadline.
Immediately before each ledger probe launch, the parent wraps the seven selected
text inputs with a remaining opening allowance in milliseconds. The negative
probe receives the eleven preflight texts and the same remaining-allowance form.
The fixed ledger probe
captures an observed local monotonic deadline before reading that envelope and
checks it before acquisition and subsequent admission. Neither allowance is a
preemptive timeout, a common-clock proof or an OS/process lifetime guarantee. No child
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
at 8192/128 bytes. Each ledger and service-negative probe has a 4096-byte output and 64-KiB stderr
cap. No full ledger snapshot or second database copy is written by the probe;
only bounded observations/digests are retained; raw signer/checkpoint bytes never enter probe stdout. Raw bounded observations and per-process outcomes are kept
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
discovery, arbitrary provider command, real funding, SDK PREPARE, CI change or CI retry.
Its current qualification is the pure transcript/ledger/spending/signer preflight over declared
memory DATA plus parser checks. Runtime integration remains unexecuted.

## V6 selected service authorization negatives (unexecuted)

The version-six candidate requires the explicit non-DP V3 loopback buyer profile
and one additional independent `negative-profile.json` text input. The closed
profile has `negativeAcceptanceVersion: 1`, `foreignGrantId`, `changedRequestId`
and `changedMaxCostUnits`. The first must differ from the selected grant; the
second must differ from all 100 positive request IDs; the cost must be a different
positive integer no greater than 1,000,000. These are authorization-test inputs,
not new spending limits. The same provider must retain at least 109 selected
request and connection starts. The harness never raises either selected limit.

The existing 106-command buyer transcript is unchanged. Once that buyer has
closed with EOF and zero exit, the still-running provider receives exactly three
empty service POSTs in one additional fixed probe process. Each mutation starts
with the independently selected first positive request/proof: change only its
grant ID, request ID or cost ceiling in both the proof DATA and request metadata.
Keep the same public-key and signature strings. No signing, key generation,
funding request, second grant, new buyer credential or SQL opener is added to
this stage. No negative request is generated from an observed reply.

The probe uses the existing native HTTPS transport at the same selected
`127.0.0.1` provider origin and CA, on an unprivileged port. Each request gets one
fixed client owner, a single zero-argument `end()`, one connection/start allowance
and the existing selected deadline/handshake/close budgets bounded by the parent
allowance. The reply collector requires exactly HTTP 401, the existing
`ServiceCredit` authentication challenge, the private response-header policy and
`{"error":"unauthorized"}` bytes. It also requires complete response end and both
request/response close events. The known client must return from close with zero
tracked handles/timers and no unknown state before the next case. An error stops
the sequence; the token cannot retry, resume or create a fourth request.

The parent drains the same provider's control output while the probe runs. It
then requires the existing explicit provider CLOSE/EOF/zero-exit barrier. Both
existing ledger/spending/signer probes remain: one before fresh keyless recovery
and one afterward. The existing whole-original ledger verifier still requires
one grant, exactly 100 original successful requests/executions, 100 consumed
units, no held units and the original remaining balance. Thus these negatives
cannot be accepted merely because some HTTP error was returned. They add no
store connection, buyer command or spending/signing operation.

This covers intentionally altered authorization DATA and an unselected grant
reference. It does not establish interoperability with another valid holder or
grant, changed-offer rejection, different-payment rejection, concurrency,
interruption or physical release. Those acceptance requirements remain open.
The source-only candidate and pure declared-memory controls do not authenticate
fixtures or execute the Python harness/native probe, TLS, capability verification,
SDK/core or SQLite. Current native execution remains disabled. G0-G5 stay OPEN.
