# API credit operator command: source candidate

The candidate entry is:

```sh
node src/api-credit-cli.js --profile-fd 3 --key-fd 4 --input-fd 5 --output-fd 6 --bootstrap-ms 1000
```

This is the single proposed operator entry for the fixed API-credit product.
It is not an accepted installation, native launch or Linux product profile.
Do not use this command with a real key or payment until those gates pass.
The command has not been executed as part of its source/DATA qualification.
The existing `buyer-cli.js` modes retain their separate admission contracts.

The same source candidate also has an explicit original-funding grant-history
query mode, with two distinct owned FIFO ends and no key descriptor:

```sh
node src/api-credit-cli.js --funding-grant-query-fd 3 --output-fd 6 --bootstrap-ms 1000
```

Its canonical input retains the original checkpoint/pins, exact grant selection,
ready read proof and selected provider CA. One query and its own CLOSED receipt
precede result output; UNKNOWN retains uncertainty and spending reservations.
It is source/DATA-qualified only; the native CLI has not been executed. See the
[query contract](ORIGINAL_FUNDING_GRANT_QUERY_CLI.md). An explicit version-two
input instead selects only existing spending custody and independently pinned
original/full-profile expectations. Its source reader closes that same known
file before transport admission; it opens no payer V6 or key. The complete
[stored-profile contract](STORED_GRANT_QUERY_RECOVERY.md) keeps UNKNOWN and
spending reservations unchanged.

For RUN, the operator supplies four distinct POSIX FIFO ends with exclusive ownership:

| Descriptor | Input or output | Contract |
| --- | --- | --- |
| `--profile-fd` | Read | At most 262144 bytes of canonical, non-secret bootstrap JSON, then EOF |
| `--key-fd` | Read | Exactly 32 existing private-key bytes, then EOF; no mnemonic or generated key |
| `--input-fd` | Read | Explicit bounded original-funding/service commands |
| `--output-fd` | Write | Existing command results only |

All four numbers must be different integers from 3 through 1023. They must
refer to distinct FIFO objects owned by the current user and distinct from
stdio. The operator must supply the correct read/write ends and relinquish
other owners; `fstat` cannot authenticate those premises. There is no implicit
stdin, shell key interpolation, environment secret, secret-file path, module
selector or default product. `--help` only parses argv and prints static help.
Neither helper creates the FIFO objects or discovers a credential source.

## Runtime compatibility admission

The fixed operator entry requires Node.js `24.19.0`, the `node` release name,
and a Linux/macOS `x64` or `arm64` process. The same predicate applies to RUN
and the explicit history and query modes. Valid operational arguments on another
runtime produce `API_CREDIT_OPERATOR_RUNTIME_REFUSED` and exit status 1 before
any native launcher import, descriptor adoption, profile/credential read or
key/store acquisition. Static help and invalid-argument behavior are preserved.
The runtime policy is fixed source, not selected by argv, JSON or environment.

This is a compatibility gate for the recorded candidate profile. Matching
process metadata does not authenticate the Node binary, installed package
bytes or module resolution, and does not qualify native execution on any host.
The repository-wide `>=24` engine and other CLI modes keep their own contracts.
Installed dependency admission, the complete native application and Linux/G1/G2
acceptance remain OPEN; the four process combinations are not a support claim.

## Plain process context admission

The candidate uses the documented plain `node src/api-credit-cli.js ...`
process: no Node flags in `process.execArgv`, and `NODE_OPTIONS`, `NODE_PATH`
and `NODE_PRESERVE_SYMLINKS` unset. Empty strings and zero-like values are not
part of this fixed profile. Valid operational argv with another context produce
`API_CREDIT_OPERATOR_CONTEXT_REFUSED` and exit 1 before this entry imports a
native launcher or adopts a descriptor. The rule also applies to the three
keyless inspection modes. Help remains available; no environment value is
printed, parsed as a loader policy, changed or cleared by the gate.

[Node 24.19 CLI documentation](https://nodejs.org/download/release/v24.19.0/docs/api/cli.html#node_optionsoptions)
describes preloading through NODE_OPTIONS and additional export conditions
through Node flags. [CommonJS lookup](https://nodejs.org/download/release/v24.19.0/docs/api/modules.html#loading-from-the-global-folders)
can use NODE_PATH; [ES import resolution](https://nodejs.org/download/release/v24.19.0/docs/api/esm.html#no-node_path)
does not. The gate checks only the visible declared execution inputs. It cannot
undo code Node already preloaded, detect hidden loader state, authenticate its
process metadata or establish a closed installed namespace. Default search
paths, binary/package identity and native acceptance still need their own
qualification. Historical fixed-resolver records are not normal-install proof.

## RUN package source admission candidate

After the runtime/context gates, RUN enters the fixed
[package source admission](API_CREDIT_MODULE_ADMISSION.md) before importing the
operator launcher or adopting any FIFO. It eagerly checks the reviewed source
and package catalog, installs synchronous pass-through resolve/load guards,
and checks their sticky state again after launcher import and before calling
it. Known preflight refusal exits 1 as API_CREDIT_OPERATOR_PACKAGES_REFUSED;
uncertain admission/import exits 4 with a sanitized status. No package path,
source bytes or exception is printed. The three keyless inspection modes keep
their SDK-free graph and do not require this RUN-only package catalog.

The catalog is source policy, not proof of an installed namespace. No installer,
cache fallback, old qualification resolver, bare-import override, transformation
or new authority is selected. The actual native reader/hooks/CLI and ordinary
installed SDK namespace have not run under this source/DATA qualification.

## Bootstrap DATA

The exact top-level fields are `operatorBootstrapVersion: 1`,
`productProfileVersion: 1`, `paymentRequiredHeader`, `publicCaPem`,
`configuration`, `spendingFile`, `spending` and `limits`. Use the repository
canonical JSON encoding without a trailing newline or duplicate properties.
The JSON depth/node and public-CA byte limits also apply. PEM framing is source
admission, not X.509 parsing or authentication of the selected provider.

The configuration uses the same funding, service, store, spending-file and
fixed-offer contracts as the existing product selector, with these differences:

- `fundingOptions` omits `keyPair`; `expectedAddress` and the fixed public key
  in `materialOptions` remain required.
- The two HTTPS transport records omit `ca`; the explicit `publicCaPem` bytes
  supply their separately owned trust copies.
- `serviceOptions` has `assetInfo` and `contextLimit` instead of an `official`
  callback. The application generates its exact fixed-offer validator.
- `spending` contains only `paymentId`. The launcher supplies a UTC day index
  from the clock; the existing durable spending rollback check still applies.
- The API-credit command limit must allow at least 106 commands. Its ceiling
  remains 128; custody and HTTPS starts must cover 100 distinct model calls
  and one replay. These are correctness prerequisites, not capacity results.

The complete keyless product/store/route/offer/spending grammar passes before
the credential pipe is read. The fixed SDK 1.0.5 constructor may then copy the
32 bytes and compare the actual public key/address with the previously admitted
identity. Source inspection does not qualify execution of that constructor,
installed package bytes, secret memory erasure or native signing.

The credential buffer is cleared after acquisition or refusal. Clearing known
buffers or observing a `clear()` return is not proof of memory erasure. Native
constructor failures with an unreturned partial owner remain unknown.

## Ownership and deadlines

One monotonic `--bootstrap-ms` budget (1 through 60000) spans public profile,
credential, key and session admission. Each stage receives a revocable guard.
The native binding rechecks it after SDK/module loading and at the actual
application admission boundary. Synchronous work cannot be cancelled by a
JavaScript timer; returning after the deadline does not authorize a new stage.

The existing key lease owns raw-key clearing and delegates an adopted key to
the original wallet owner. The command session owns successful command streams.
An opener owns selection trust-copy release once it is entered, including a
pending opener. The outer coordinator never clears an unreturned key, releases
a pending consumer's trust copies or raw-closes a transferred descriptor.
Late returned owners get one cached stop request; they cannot start commands
or upgrade an earlier UNKNOWN result. Known stops share one close budget.

The exit status is 0 for an observed clean command-host/owner result, 1 for a
clean pre-key bootstrap refusal, or 4 for unknown opening/outcome/close state.
Results remain historical observations, not settlement or service-delivery
proof. Sanitized status goes to stderr, never to the command-result pipe after
ownership/close. The process uses `exitCode`, not forced process termination.
No automatic reopen, payment retry, re-signing, grant or request is generated.

Failed application opening preserves the budget owner when a wallet constructor
or native client opener was entered without returning its owner. The outer
layer revokes new admission and retains the physical budget file; it cannot
infer release from a rejected opener. Before native client entry, a returned
wallet must complete its cached void stop and fresh clean view before physical
file close. [Opening-failure custody](API_CREDIT_OPENING_FAILURE_CUSTODY.md)
describes the source/DATA contract; actual native failure/release remains OPEN.

## Qualification boundary

The DATA suite uses declared byte/method/clock/timer ports and the actual pure
admission/coordinator code. Native launcher/key/FD/session sources are checked
for syntax and import contracts only. No actual CLI launch, SDK construction,
SQLite, TLS, socket, signature, nonce search, prepare or payment is admitted.
Prior source-bound native observations are retained with their original scope.

G1 remains OPEN for installed dependency/runtime admission, native launch,
one funding/grant with 100 distinct requests and exact replay, normal/fresh
reopen and Linux. G2 still requires source-bound funding ACK loss, signer
response loss, stale-owner fencing and actual native release/controlled HELD.
G3 trust/DP and G4/G5 pilot/economic acceptance remain separate gates.

## Explicit recorded-result inspection candidate

`node src/api-credit-cli.js --recorded-result-fd 3 --output-fd 6 --bootstrap-ms 1000`

This source candidate accepts the same one-original recovery envelope and EOF
as `--inspect-fd`, using two distinct exclusive owned FIFO ends. Independently
retained original funding checkpoint bytes/pins and the existing service proof
are required. It opens only the existing backend and V6 no-dispatch payer. It
never selects a key pipe, wallet, signer, nonce search, PREPARE, new payment or
service transport. Existing `--inspect-fd` output remains redacted.

The new closed output includes a bounded backend cached result, if available.
`responseJson` is the exact already-recorded local response only when it also
matches the cache and original funding context. A backend-only cache leaves
`responseJson: null`; an HTTP body is not fabricated. UNAUTHORIZED, absent or
unknown outcomes return no cache payload. Client reconciliation remains set
even when the backend claims cached success. No result clears a HELD/UNKNOWN
reservation, confirms delivery, renews authority or permits another dispatch.

The existing checkpoint is checked around the combined query; the V6 core also
compares original/funding/intent/response observations before and after it. The
payer's void close and fresh RELEASED view precede one backend close; any close
uncertainty withholds the result and retains unknown ownership. The result is
limited to 4096 bytes and is written only after store-owner close, within the
same operator startup budget. This is cooperative observation, not atomic
cross-store fencing, an OS deadline or a network sandbox.

DATA reconstruction and declared SQL/proof/epoch/channel ports do not establish
native proof verification, SQLite reopen, physical release or Linux acceptance.
The native entry remains unexecuted and G1/G2 acceptance remains OPEN.

## Same-core exact checkpoint reads

The recorded-result owner supplies independently retained serialized checkpoint
bytes to a module-branded V6 no-dispatch read. The same combined core checks
them before querying the backend and checks the identical checkpoint after it,
alongside its original/funding/intent/response fences. The outer product owner
no longer repeats those two reads. Legacy redacted inspection and the existing
three-argument core method stay unchanged; no method is added to the frozen
client facade. A copied, dispatch-enabled or closed connection cannot revive
this exact-read capability. The DATA call-chain checkpoint read count drops
from four to two; native latency and I/O improvement are not established.
Output and ordered-close bounds stay unchanged.

The current payer source configures and rechecks EXCLUSIVE locking and starts
its write transaction before incrementing owner_epoch.
[SQLite documents](https://www.sqlite.org/pragma.html#pragma_locking_mode) that
acquired EXCLUSIVE-mode locks persist across transactions until the connection
releases them. This supports a conditional source argument, not an executed
contention, physical-release or restart proof. No new takeover, lease or
cleanup protocol is inferred from the epoch counter.

## Funding-only history candidate

`node src/api-credit-cli.js --funding-inspect-fd 3 --output-fd 6 --bootstrap-ms 1000`

The same runtime/plain-process and exclusive-pipe admission supports one existing
V6 funding record before a grant or service proof is known. Independent original
checkpoint bytes/pins are still mandatory. A fixed no-SDK store reader compares
those bytes around the query and closes the known store before private output.
No new funding/payment, grant or spending decision is made. See the complete
[funding inspection input/output and ownership contract](API_CREDIT_FUNDING_INSPECTION.md).
The native entry, SQL writes at existing-store open, physical close and Linux
acceptance remain unexecuted.

## Returned client on failed opening

If opening fails after a native client returned but before a joined application
returned, the fixed returned-opening custody owner requests the client and
wallet stops independently once and revokes budget-file admission. Physical
file close additionally requires fresh clean views of both owners before and
after its one void close. A former clean client callback cannot justify close
when a later wallet completion observes that client HELD. Repeated claims join
the same owner; UNKNOWN cannot resume opening or retry a stop or file close.
A returned joined application still owns all of its stops. Unreturned borrowers
continue to use their separate conservative retained-file branch.

This describes source and declared DATA ports. Native client, wallet, SQLite
close, actual release and Linux acceptance remain unqualified.

## Original grant-query custody at product commit

The fixed native product now requires the existing canonical grant-query profile
as `originalGrantQueryProfile` beside the independent `expectedPins` in the
API-credit commit input. Its same spending owner retains and reads it back before
local payer commit; first submit checks it again. The selected four-table file
profile refuses older files without migration. No proof is generated by the
command. See [the custody contract](FUNDING_GRANT_QUERY_CUSTODY.md). This source
integration does not establish native persistence, ACK recovery or Linux acceptance.

The shared recovery coordinator now includes startup-timer retirement in one
absolute channel-close window. It requires void timer-cancel receipts and fresh
closed/time observations around cancellation and after the parent await.
Reentrant expiry, opaque handles and late results cannot publish or repair a
clean verdict. See the [channel-close contract](API_CREDIT_RECOVERY_CHANNEL_CLOSE.md).
This source/DATA change does not establish native FIFO, SQL, TLS or release
acceptance and does not expand history or payment authority.
