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
SDK/core/Noble package rows and the explicit core/server entry. The buyer entry,
graph and package policy remain unchanged; its catalog/reader are repinned for
the additive journal serialization export described below. No installer, module path, loader choice,
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

## Explicit public profile

All top-level fields are required:

`providerBootstrapVersion: 1`, `applicationMode`, `serviceStore`, `intakeStore`,
`offer`, `funding`, `service`, `transport`, `journal`, `chain`, `recovery`,
`witness`, `control`.

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
  exact resource/offer/terms/authority and absolute expiry before reading TLS.
  Its candidate is not persisted or served; actual intake issuance still
  rechecks its own contract.
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
| RECORDED | ADMIT_ORIGINAL |
| JOURNAL | ADMIT_ORIGINAL, RECONCILE, RECOVER_FIRST |
| WITNESSED | ADMIT_ORIGINAL, RECONCILE, RECOVER_FIRST, HISTORY |

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
