# Issued-provider operator command: source candidate

```sh
node src/issued-provider-cli.js --profile-fd 3 --tls-fd 4 --input-fd 5 --output-fd 6 --bootstrap-ms 1000
```

This is the single candidate provider entry for the existing one-funding,
one-grant, metered-call and exact-original-recovery application. The command has
not been executed. It is not Linux support, installation, native integration,
economic acceptance, a deployment instruction or a completed G0/G1/G2 gate.
Existing successful native records retain their original source/runtime scope.

The entry uses Node 24.19.0 on Linux/macOS x64 or arm64, no Node flags and unset
NODE_OPTIONS, NODE_PATH and NODE_PRESERVE_SYMLINKS. These metadata predicates are
compatibility checks, not binary authentication. `--help` imports no native
launcher, package admission, SDK, credential or file owner.

RUN first admits its separate fixed module catalog through the existing ordinary
resolve/load guard, then imports and checks the fixed native launcher before
adopting any descriptor. The provider catalog includes the existing pinned
SDK/core/Noble package rows and the explicit core/server entry. The buyer entry and package policy remain unchanged; its source graph and
catalog/reader are repinned for the original-only chain observer imported by
the shared facilitator. No installer, module path, loader choice,
mock mode or implicit operator environment is accepted. The native guard and
ordinary installed namespace remain unqualified; trusted early boot source and
unchanged runtime intrinsics are premises, not a hostile-process sandbox.

## Input ownership

Supply four distinct, exclusive POSIX FIFO ends, owned by the operator and
distinct from stdin/stdout/stderr. The program creates no FIFO, discovers no
credential source and takes no secret-file path. All descriptor values are
canonical integers 3..1023. `bootstrap-ms` is explicit, 1..60000.

The profile channel supplies canonical UTF-8 public JSON, at most 262144 bytes,
terminated by EOF. It is admitted before reading the separate TLS channel. The
TLS channel supplies two unsigned 32-bit big-endian lengths, followed by the
existing key bytes and certificate bytes, then EOF. Each byte field is 1..65536;
the complete frame is at most 131080 bytes. No private PEM string, generated key,
wallet key, mnemonic or secret environment variable is used. Owned TLS copies
are wiped after the actual owned provider has taken its independent copies;
this is source behavior, not verified native erasure or key-custody acceptance.

The control/output channels use canonical JSON lines and remain private operator
channels. Output may include original payment/grant/history DATA and must not be
published as a diagnostic. Stderr contains fixed status labels only. A local
write callback does not establish a remote receipt, delivery or settlement.

## Explicit new-journal setup

The same entry also has a distinct Linux-only source mode:

```sh
node src/issued-provider-cli.js --initialize-journal-fd 3 --output-fd 6 --bootstrap-ms 1000
```

This mode requires only two distinct exclusive operator-owned FIFO ends. It
reads at most 8192 canonical UTF-8 bytes then EOF, and writes one bounded local
JSON result. It never reads TLS material or creates an application, SQLite
store, payment, key, grant, SDK session or service authority. The ordinary fixed
provider package admission still precedes acquisition. macOS setup is refused;
RUN retains its existing Linux/macOS source compatibility predicate.

The public input is exactly providerJournalSetupVersion=1, journal,
expectedDevice and operationBudgetMs. journal contains directory, allowedRoot,
maxRecords (1..10000) and maxFileBytes (1024..4194304). directory must be one
canonical absolute direct child of allowedRoot. expectedDevice is the selected
device's canonical decimal identifier, not a default or mount authentication.
operationBudgetMs is 1..60000. No adoption, overwrite, recursion or cleanup flag
exists. The operator supplies an already existing private allowedRoot; this
mode does not provision a parent tree or repair permissions.

The Linux source opens that exact real operator-owned 0700 root, comparing its
selected device and identity. It creates only the new child with nonrecursive
mkdir. Linux /proc/self/fd paths anchor creation to the original open root and
child directory handles; mutable selected paths are rechecked. The two 0600
files use O_EXCL/O_NOFOLLOW, single-link checks, explicit bounded writes, file
and directory sync, exact readback and the same directory identity. Existing
paths are refused. Neither legacy load() nor its marker-adoption behavior is
used. The additive createSettlementJournalInitialization serializer uses the
actual journal's existing empty-state/checksum/validation/serialization code;
all old class methods and existingOnly behavior are unchanged. Actual codec
and filesystem compatibility remain source/parser-only, not DATA execution.

The setup protocol requests the original handle close once, marker/state before
child/root, and requires its clean closed view before INITIALIZED. Reentry,
partial writes, lost receipts, deadline expiry, unreturned/opaque borrowers and
unknown close remain HELD. There is no deletion, rename, automatic retry or
adoption of a prior partial attempt. A pending unknown borrower is retained
without a competing close. Late completion cannot restart setup or confer
service authority. SIGINT/SIGTERM handlers precede acquisition and retain the
existing sticky bootstrap/control stop selection. A lost output may follow
completed setup; it is not permission to rerun against the same directory.

The filesystem protocol has one operationBudgetMs deadline across its legs and
close. The outer command uses one bootstrap-ms observation window across input,
native admission checks, output and pipe close; new operations check that
window. These are callback observation limits, not OS syscall/sandbox bounds or
power-loss guarantees. Source identity checks do not establish cross-process
owner fencing. Physical release, real signals, Linux command execution,
native journal durability and the complete G1/G2 product acceptance remain OPEN.

## Funding close budget admission

funding.closeBudgetMs is an explicit integer from 1 through 1000 milliseconds.
The bootstrap now enforces the actual funding backend and operation-drain
helper's existing range, before TLS material or application stores are acquired.
It previously admitted up to 60000 although the backend would refuse anything
above 1000 later in construction. Oversized values are rejected, never clamped
or replaced with a default. The backend/drain code and their cooperative
observation semantics are unchanged. Other selected deadlines retain their own
bounds; this is not OS cancellation or physical-release qualification.

## Restore the original resource after expiry

FRESH continues to use the original issuance preparer and actual clock. A new
issuance at or after the configured expiresAt is rejected. No expiry, terms,
clock or grant policy is refreshed or defaulted.

RECORDED, JOURNAL and WITNESSED now capture resource configuration without a
new-issuance clock decision. Previously the ordinary command applied the fresh
expiry check to every mode, refusing an expired original before it could open
the selected historical stores. The configuration-only candidate creates no
persisted issue, payment, verification receipt or grant and grants no authority.

The owned restored opener compares this candidate with the exact independently
pinned bound row before constructing the provider. It requires the original raw
authority record and digest, complete challenge, decoded payment-required frame,
selection and resource URL. Two exact bound-row reads must agree. Changed amount,
payee, asset, units, expiry or authority is refused; no row is repaired or
replaced. The actual recorded backend still separately checks the independently
selected outcome digest and original complete custody context before serving.
The early bound-row comparison does not claim to verify that outcome itself.

The existing actual fresh preparer, activation/verifier methods and grant clock
rules are unchanged. This permits restoration of original evidence; it does not
mint or reactivate an expired grant, erase a paid obligation, authorize dispatch,
prove delivery or authorize compensation. The separate late-payment/delivery
contract, real fresh-process reopen and full G0/G1/G2 acceptance remain OPEN.

Local controls use the actual pure configuration/mode/row functions with declared
synthetic authority, row and clock DATA. Actual SDK, SQLite, journal, TLS/socket,
keys/signatures, native command and physical release are not exercised.

## Explicit durable execution setup

The native source entry now requires providerBootstrapVersion=3. It keeps the
version-2 funding observation selection and adds executionSetup with exactly
ledgerId, policy and capacity. policy has policyId, policyVersion and
maxDurationMs. The selected service duration must fit that explicit 1..60000 ms
policy. Capacity is 100..serviceStore.maxRequests. No ledger identity, policy or
capacity is generated or defaulted. Version-1/2 DATA decoders remain available
for historical inspection; native startup refuses them before reading TLS or
opening the journal/stores. A direct owned native application also requires the
explicit setup before opening its stores.

FRESH creates the new service store, registers the original offer, then reads
its actual durable snapshot. Only a missing execution contract may be initialized
using that exact revision and the existing initializeDurableExecution method.
One APPLIED acknowledgement, revision + 1, the exact initial contract and a
matching durable readback are required before opening intake or starting funding.
Previously this entry omitted initialization, although the real HTTP session
requires it when admitting the grant. An initialization error or lost result is
HELD; there is no retry, rollback, file replacement or implicit adoption.

RECORDED/JOURNAL/WITNESSED only read the existing execution contract and compare
ledger, policy, capacity and original generation identity. They never receive an
initializer port, reset units/executions or reopen a sealed generation. This
check provides no grant, dispatch or recovery authority. Actual store ownership,
HTTP session admission and original recovery rules remain in their existing
owners. The SQLite methods and their transaction contracts are unchanged.

The new setup owner and configuration seams are tested with declared memory
ports. Actual SQL initialization/readback, Linux startup, the native 100-call
scenario, physical release and full G0/G1/G2 acceptance remain OPEN. No native
program is executed by those DATA controls.

## Explicit public profile

All top-level fields are required:

`providerBootstrapVersion` (3 for native startup), `applicationMode`, `serviceStore`, `intakeStore`,
`offer`, `funding`, `service`, `transport`, `journal`, `chain`, `recovery`,
`witness`, `control` and the explicit `executionSetup` in version 3.

- `serviceStore` has databasePath, allowedRoot, busyTimeoutMs, maxStateBytes,
  maxOffers=1, maxGrants=1 and maxRequests=100..10000. `intakeStore` has its distinct
  databasePath/allowedRoot, ledgerDomain and maxChallenges. Database paths are
  canonical absolute direct children. Actual native owners repeat path, private
  ownership and format admission; JSON admission is not filesystem proof.
- `offer` is the existing complete model-v1 fixed offer. `funding` contains the
  public authorityRecord, complete five-field fixed terms, observerRoot,
  observerCatchUp, exact offer/holder/capability selection, resourceUrl,
  maxPendingReconciliations, maxIntakeAttempts and closeBudgetMs. No amount,
  payee, asset, expiration or unit total is defaulted; at least 100 units are
  explicit. Terms are never refreshed per call. Authority/chain/confirmation
  consistency is checked again by the actual native authority parser before
  opening the application stores. The existing resource preparer also checks
  exact resource/offer/terms/authority before TLS; FRESH also checks absolute expiry, while restored modes require the pinned original resource without a new issuance clock decision.
  Its candidate is not persisted or served; actual intake issuance still
  rechecks its own contract.
- Version 1 keeps the exact original funding fields and selects JOURNAL_ONLY.
  Version 2 requires one additional funding.pendingObservationMode field,
  exactly JOURNAL_ONLY or ORIGINAL_RPC. ORIGINAL_RPC is FRESH-only; recorded,
  journal and witnessed recovery remain journal-only. There is no default RPC
  activation or broad maintenance fallback. See the
  [original-only observation contract](ORIGINAL_FUNDING_CHAIN_OBSERVER.md).
- `chain` is the existing explicit selection, RPC URL and timeout contract from
  [fixed funding roles](ISSUED_PROVIDER_FUNDING_ROLES.md). Trust acknowledgements,
  chain profile and any DP event/endpoint match the original requirement. This
  does not establish running-network, canonicality or finality acceptance.
- `transport` has origin, generation, the complete existing bounded HTTPS limit
  record and bind. Its fixed nonzero port equals the selected HTTPS origin port;
  funding is exactly origin plus `/funding`. Existing TLS material is separate.
  Request/connection-start budgets must explicitly cover at least 106 starts
  for the 100-call/replay scenario and protocol overhead; no limit is raised or
  defaulted on the operator's behalf. This is not a capacity claim.
- `journal` explicitly names directory, allowedRoot, maxRecords and maxFileBytes.
  RUN requires an already initialized dedicated journal. It constructs
  the actual class with immutable existingOnly=true and loads it before store
  startup. A missing file/marker is refused; no initializer or empty replacement
  is selected. FRESH additionally refuses any existing journal records. Journal
  loading has the explicit operation observation budget; timeout retains its
  original pending read and never falls through to application startup. Journal
  provisioning has the separate explicit setup source mode above; RUN never
  selects it as a fallback. Native provisioning/lifecycle acceptance is OPEN.
- FRESH requires new service/intake files and null recovery/witness. RECORDED,
  JOURNAL and WITNESSED require existing stores and independent complete bound
  and official-outcome digest pins. JOURNAL supplies the same journal to the
  existing recovery entry. WITNESSED additionally takes directory, expectedDevice
  and explicit CREATE_NEW or READ_EXISTING witness mode. Existing witness rules
  remain unchanged; a read-only witness cannot authorize new writes.
- `control` explicitly supplies maxCommands, maxLineBytes, maxInputBytes,
  maxOutputBytes, closeWaitMs and operationBudgetMs. Existing channel ceilings
  remain 64 commands, 2 MiB input/output and a 1000 ms close observation maximum.
  Each operation/write is observed within its selected 1..60000 ms budget. Idle
  input waits without polling or a claimed wall-time bound. Budget exhaustion
  fences output and retains HELD; it does not cancel a chain transaction.

## Fixed receipt API candidate

The source profile explicitly selects service.productId=`execution-receipt-v1`
and offer.costPolicyId=`execution-receipt-unit-v1`; no arbitrary executor is loaded.
The existing authenticated service route accepts POST metadata for routeId
`execution-receipt.v1`, the empty-body SHA-256 commitment and application/json.
The cost callback admits only the original selected offer/grant binding and
charges one unit. The executor returns a domain-separated SHA-256 result code
over the actual durable execution ID, refusing an already aborted signal.

This is a deterministic receipt API source candidate, with no external business
effect or provider signature. It is not evidence that a production API product
has been selected or delivered. The roadmap's complete native 100-call/replay,
restart budgets, real pilot product, external buyer and economic acceptance are
still required. The receipt candidate cannot close those gates through a DATA
test or by narrowing the target to the receipt algorithm.

## Local control protocol

Each command is exactly `{version:1,id,operation,argument}` in canonical JSON plus
LF. IDs are distinct bounded identifiers; startup/shutdown are reserved. The
startup output is a local LISTENING callback observation. Command IDs and budgets
are not reset, and a duplicate ID never reenters an operation.

| Mode | Explicit operations |
| --- | --- |
| All | STATUS, CLOSE |
| FRESH | RESUME, ACTIVATE |
| RECORDED | READ_ORIGINAL_GRANT, ADMIT_ORIGINAL_RESULTS, ADMIT_ORIGINAL |
| JOURNAL | READ_ORIGINAL_GRANT, ADMIT_ORIGINAL_RESULTS, ADMIT_ORIGINAL, RECONCILE, RECOVER_FIRST |
| WITNESSED | READ_ORIGINAL_GRANT, ADMIT_ORIGINAL_RESULTS, ADMIT_ORIGINAL, RECONCILE, RECOVER_FIRST, HISTORY |

Arguments are null except ACTIVATE, whose argument is exactly observerFileName
and recordKey. The filename must be the existing `funding-observer-<hash>.sqlite`
name beneath the selected observer root. At most one actual existing observer
store is acquired. The existing activation path still verifies original bound
identity, committed observer evidence and authority; an ACK, BOUND, raw READY
flag, journal history or a supplied grant ID does not mint authority.

RESUME uses only the original pending continuation and the fixed journal-only
observer. It does not run general settlement maintenance or start fresh chain
observation. Recorded recovery does not regain a live continuation. HISTORY is
a none-authority read. No control operation replaces/resigns/resubmits a payment,
clears UNKNOWN, issues a second grant or resets spending/observation budgets.

CLOSE or input EOF fences new commands and closes the same provider first.
Only its known quiescent CLOSED/released view permits auxiliary observer/witness
retirement. A CLOSE reply follows those observations, then both command streams
close. The controller keeps one close deadline across those legs, requests the
original stops even after observation failure and never turns a late receipt
into a clean earlier result. Bootstrap descriptors have their same remaining
native close observation window. Unknown partial acquisition or release retains
the frame; there is no raw-close fallback after transfer, force-close, reopen,
automatic retry, migration or historical cleanup. SIGINT/SIGTERM handlers are
installed before the first descriptor acquisition. A sticky stop selector is
cached before callback entry: before control handoff it requests only the same
bootstrap pipe stop, and afterwards only the same control close. Repeated or
reentrant signals reuse that receipt. A stop before handoff refuses a later
handoff and every subsequent guarded acquisition. Late profile/TLS bytes are
wiped without opening the next resource. A stop interrupts startup journal
observation without canceling or releasing its entered read; the original
promise remains retained and cannot start roles on a late result. The first
stop begins the native close window; neither finalization nor a later signal
renews it. Both signal subscriptions are removed on the finalization path,
including partial subscription failures. The entry never uses process.exit
to manufacture release. Actual OS signal delivery is unqualified.

Exit 0 means the observed control/provider/channel closure completed; exit 1
means input was refused with known closure; exit 4 retains HELD/unknown. None
proves physical release, native durability, G1/G2, current chain identity,
testnet/pilot readiness or production behavior. Current qualification is pure
DATA with declared ports and parser-only native sources. Actual journal,
SDK/core, SQL, TLS/FIFO, fresh-process and Linux execution remain unexecuted.

## Recorded results for inactive grants

In RECORDED, JOURNAL and WITNESSED, the existing local ADMIT_ORIGINAL command
still derives the original funding identity from the independently pinned BOUND
row and settled custody record. It then reads the actual committed grant. An
ACTIVE grant selects DURABLE_EXECUTION, whose existing store checks decide each
new request. An EXPIRED or REVOKED original selects RECORDED_RESULT_ONLY. Its
admission result and provider snapshot report that mode explicitly. An ACTIVE
stored history row may also select result-only mode when the current grant read
observes expiry. No expiry, lifecycle, original payment, unit counter or authority
is refreshed. Fresh grant admission keeps its existing ACTIVE-only binding.

The result-only session uses the same existing scoped capability-proof admission
and getOriginalRequestExecutionSnapshot reader on the same borrowed store. It
accepts the original POST path and proof-bound request tuple. A committed original
success returns the same canonical success body. A new request ID, conflicting
request or NOT_INVOKED result returns 409. Unresolved and OUTCOME_UNKNOWN results
return 503; their reservations remain held. Known admission UNAVAILABLE also
returns 503 without replacing the reader or resetting its request budget.
Authentication and framing refusals
retain their ordinary 400/401/404/405 responses. No executor, reserve, prepare,
clock or timer port is passed to the result-only controller. No new HTTP endpoint,
grant, debit, execution, retry or payout is created. Reader close fences only
that reader; the existing provider owner retains store and ingress close order.
These reads still use the store's existing transaction machinery; this is not
an OS-readonly database mode or a distributed atomicity claim.

The current DATA controls use declared memory store/proof/writer/listener ports
and synthetic unsigned activation metadata. They do not execute native proof
authentication, SQLite, SDK, HTTPS or process reopen. The new source branch and
one current parser check are recorded in
[the local result](../qualification/inactive-grant-recorded-result.actual-local-result.json).
The failed close fixture is preserved in the failure inventory; the native reader
was unchanged. Native/Linux 100-call/replay/restart, physical release, late paid
obligations and delivery/compensation acceptance remain separate OPEN gates.

## Expired original funding without grant activation

The existing explicit FRESH ACTIVATE command distinguishes an original intent
that is already expired when preparation observes the trusted clock. The
selected native observer must still match the original row, authority, target,
chain profile and confirmation policy, with a READY outbox. A READY or SETTLED
tag alone is insufficient. The expired branch runs before construction of the
ordinary activation composition. It reads the actual selected offer and parsed
authority, then uses the existing committed-evidence projector/matcher and
verifyZenonIssuedFundingWithoutActivation to authenticate and rebind the whole
original funding context. No grant-store, activation, signing, payout, clock or
timer port is passed to the expired verification controller.

After verification the same owner rechecks its provider and exact BOUND row.
A known result returns FUNDED_NO_NEW_GRANT, grantActivation
NOT_ENTERED_THIS_OPERATION, grantExistence NOT_QUERIED and deliveryLiability
RECONCILIATION_REQUIRED. paymentAt is null: eligibilityObservedAt is preparation
time, not proof that the payment itself was late. Delivery and compensation
remain NOT_ESTABLISHED. Every action flag is false and authority is NONE. The
existing committed observer evidence and original funding rows remain the
recovery source. No database, schema, migration, endpoint, economic transaction
or compensation permission is added; net quantity owed is not established.

The known verification-only result leaves the provider open without grant
admission or a service session. The same owner cannot repeat verification or
switch to activation after a clock regression. Normal activation, commit/admission
receipt loss, invalid proof, row drift, opaque work and close during verification
retain their existing HELD boundaries. No generic activation error is converted
to a known no-grant result. Expiry first observed inside an ordinary activation
attempt still follows its existing outcome contract. Reconstructing this
observation after a lost operator response remains a separate recovery gate.

The 20 new DATA cases declare memory projector/verifier/provider/store ports and
synthetic unsigned records. They do not perform native signature verification,
SQLite, SDK or HTTPS. Twenty-five affected activation controls were rerun; the
remaining source-exact scopes were retained. See the
[local result](../qualification/expired-original-funding.actual-local-result.json)
and [V52 source profile](../qualification/profiles/api-credit-application-source-v52.json).
Native authentication, Linux, physical release and full G0-G5 remain OPEN.

## Read original grant without service admission

After an operator response is lost, select the existing RECORDED, JOURNAL or
WITNESSED profile with the original independent bound/outcome digests. The
canonical local control command is READ_ORIGINAL_GRANT, with argument null and
a new bounded command ID. FRESH refuses it. It uses the same already opened
provider, original funding identity and native readOriginalFundingGrant method.
It does not open another database or authenticate the funding again.

The original fourteen identity fields come from the pinned retained payment
and issued frame. Exact original BOUND/outcome rows and the same settled, idle
provider are checked before and after the synchronous history read. The existing
closed result schema is returned unchanged: RECORDED includes original grant ID,
stored lifecycle, expiry and available/held/consumed units; NOT_RECORDED has no
grant record. Neither result revalidates current grant authority or authenticates
current-chain payment evidence. Historical ACTIVE is not fresh service authority.
NOT_RECORDED does not prove no payment, no prior grant or no delivery liability.
Delivery liability is NOT_QUERIED, reservations are UNCHANGED, reconciliation is
required and every existing action flag is false. No compensation is authorized.

READ_ORIGINAL_GRANT never calls service admission, activation, execution, signing
or submission. ADMIT_ORIGINAL remains a separate explicit decision. Reads and
admission share the same sixteen-attempt owner budget; the existing outer
128-operation cap, command-ID deduplication and observation/output budgets stay
in force. A missing record cannot reset those budgets. Unknown lookup, changed
pins/rows/provider identity, opaque asynchronous work or close during lookup
remain HELD. Lost output is not retried and does not repair the old operation.
A later explicit read in a newly admitted recorded process observes existing
records only; it does not reconstruct a missing verification receipt or reopen
HELD ownership in the old process. No store, schema, migration or HTTP endpoint
is added. SQLite and original-history comparison library bytes are unchanged.

The 22 new DATA cases use memory store, provider, channel and timer ports and
synthetic unauthenticated activation metadata. State reconstruction here is
model reconstruction, not native fresh-process persistence evidence. Together
with 205 affected controls and three parser-only checks they passed locally;
1264 exact DATA controls and 44 parser receipts were retained without repetition.
See the [local result](../qualification/original-grant-inspection.actual-local-result.json)
and [V53 source profile](../qualification/profiles/api-credit-application-source-v53.json).
Native/Linux 100-call/replay/reopen, physical release and full G0-G5 remain OPEN.

## Explicit original result-only admission

RECORDED, JOURNAL and WITNESSED accept ADMIT_ORIGINAL_RESULTS with argument null
and a fresh bounded command ID. It derives the same original grant identity
from independently pinned BOUND/outcome records, reads existing original history,
and asks the same provider to open RECORDED_RESULT_ONLY on the existing POST
execution path. An actual matching stored grant is still required. It accepts
ACTIVE, EXPIRED and REVOKED originals without making stored lifecycle fresh
service authority. The default inactive-only comparator remains strict; a
separately named original-result comparator permits ACTIVE only for this reader.

ADMIT_ORIGINAL keeps its existing active execution admission. The new explicit
choice is for recovering committed results without opening an execution owner.
It reaches the unchanged native replayOnly branch and its existing scoped proof
admission and original request/execution snapshot reader. Cached original success
returns the existing canonical body. A new or conflicting request cannot reserve
or execute and receives 409; unfinished or UNKNOWN originals remain 503 with
reservations unchanged. Reading stored success does not prove service delivery
or authorize compensation. No payment, signing, SDK, funding reauthentication,
new grant, database, schema, migration or HTTP endpoint is introduced.

The same actual getGrant may observe an already elapsed expiry. This feature
never reactivates a grant, extends expiry/terms or resets units/budgets. All
fourteen original funding fields plus scheme, flow, payer and intent remain
compared. Exact original rows and provider transaction hash are rechecked around
the history read. Sixteen attempts are shared by grant inspection and both
admission choices. There is one session: a result-only owner cannot upgrade to
execution or create another session. The outer 128-operation limit is unchanged;
the fixed owned method allowlist is bounded at eight. FRESH refuses the command
and the internal restored-only mode selector. Lost/opaque admission receipts,
row/provider drift and uncertain close remain HELD and never retry or upgrade.

Qualification selected 466 pure DATA controls (24 new, 442 affected). The first
owned task completed 425 successfully, then reached its configured 16-command
record limit before the final DATA command; its UNKNOWN/CLOSED-FAILURE is retained.
With all source bytes unchanged, a separate four-command task ran only the
remaining 41 DATA controls and three parser checks. No completed DATA command was
repeated and no task policy or quota was raised. The combined proof identifies
each actual command origin; it does not reclassify the failed task as successful.
Another 1049 earlier source-exact DATA controls and 44 parser receipts were
retained without repetition.

All provider/store/session/proof/channel ports and activation metadata in these
cases are declared memory DATA. Model reconstruction and the 100-unit scenario
are not native persistence, fresh-process, Linux or 100-call acceptance. See the
[local result](../qualification/active-original-results.actual-local-result.json),
[failure inventory](../qualification/active-original-results.failure-inventory.json)
and [V54 source profile](../qualification/profiles/api-credit-application-source-v54.json).
Native/Linux, physical release, delivery/compensation and full G0-G5 remain OPEN.

## Current returned-owner close observations

The actual operator controller now reads the same provider and auxiliary owners again after auxiliary close, after a CLOSE result write and after command-channel close. Earlier successful stop observations cannot substitute for a current CLOSED, unheld, released provider with no active operations and a closed, unheld, inactive auxiliary owner. The final channel view must also have no read, write or write callback pending, both ends closed and a fulfilled void historical close. A conflict leaves the existing controller HELD and its final exit 4.

The fixed native launcher uses the same small pure contract after its final pipe and signal cleanup before preserving exit 0 or 1. It cannot upgrade an existing unknown result. The helper receives current observations and returns no authority or owner; it calls no stop, release, store, retry, funding, signing, activation or dispatch capability. Stop ordering and the same cached stop promises are preserved. A CLOSE reply already written is a historical observation; a later failure does not rewrite or resend that reply or turn it into final release proof.

These cooperative observations are not atomic owner fencing, an OS deadline or proof of physical release. The actual native launcher and its final cleanup path remain unexecuted. Current ownership can still require HELD; this change provides no takeover, reset or force-close protocol.

The provider catalog adds the one shared observation module and updates the controller/launcher rows. Its existing shared recorded-service-result row is also rebound to the already-current source: that row had retained a prior hash after the shared result change. The result implementation itself is unchanged here. All 504 catalog rows, 404 retained package rows, four bare edges and the 101-file provider source graph are checked as source policy; the buyer catalog and 167-file buyer graph are unchanged. Installed namespace, package hooks and native startup have not been qualified.

[Twenty-six new DATA controls](../qualification/provider-current-close-owners.actual-local-result.json) use the actual controller and shared contract over explicitly declared provider, auxiliary, channel, clock and timer memory ports. They cover clean shutdown, late provider/auxiliary changes, historical close output, EOF, one-stop behavior and irreversible HELD. The 160 affected controls were rerun; 1,431 retain exact runtime-input matches, giving 1,617 distinct DATA controls. Two changed native files passed parser-only checks; 45 prior file-parser receipts are retained. One CLOSED/SUCCESS 4 MiB task used ten commands under the unchanged sixteen-command policy.

Two preceding preparation records remain UNKNOWN with zero Node commands and no managed task: a private predecessor-reference error and the stale catalog row. Both original source/report versions are retained; the later prepared plan and qualification do not reclassify those records. No SDK/core package, SQLite, TLS/socket, key/proof/signature, nonce search, native child, real PREPARE or payment ran. The existing hosted 108-control profile and its 22 inputs remain separate and exclude the 26 new cases. Linux, native release and G0-G5 acceptance remain OPEN.

## Verification that crosses the original expiry

The existing activation operation has no new argument or command. Its fixed preparation explicitly chooses the original-verification expiry outcome mode. An eligible original that expires while the selected verifier is awaited can yield the same closed `FUNDED_NO_NEW_GRANT` receipt as an already-expired original, after every original funding field is checked. It cannot yield a fresh grant or refreshed terms. The owner rechecks its original BOUND row and lifecycle before presenting the result.

Reconcile the same original and its `RECONCILIATION_REQUIRED` delivery liability. Neither an expired receipt nor a callback-entry diagnostic authorizes grant admission, service, a second payment or compensation. UNKNOWN after grant-store entry remains HELD. The shared receipt validator preserves the existing closed fields and authority flags. See the [expiry-during-verification contract](ISSUED_ORIGINAL_FUNDING_ACTIVATION.md#expiry-during-original-verification). Native authentication, durable reconciliation and physical resource release have not been executed or established.
