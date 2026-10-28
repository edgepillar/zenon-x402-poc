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

The operator supplies four distinct POSIX FIFO ends with exclusive ownership:

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
