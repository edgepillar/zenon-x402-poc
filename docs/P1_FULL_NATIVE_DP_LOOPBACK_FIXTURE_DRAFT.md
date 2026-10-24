# Full native DP loopback application fixture (unexecuted draft)

The selected test body now calls the actual local-qualification full factory:
`createZenonDynamicPlasmaNativeHttpsOriginalFundingSubmissionForLocalQualification`.
It does not inject a read owner, material producer, fetch function, SDK preflight,
V6 store substitute, native-builtin alias or source transform. The synthetic
server only supplies bounded declared RPC DATA and a funding POST response over
real loopback HTTPS when this separate suite is eventually authorized and run.

Current status: source admission and four JavaScript syntax checks passed.
**The actual full native application and all three native cases have NOT run.**
No new TLS command, key, signature, SQLite/pin file, nonce search, socket, task
or private storage root was created. This is concrete test/application wiring,
not full P1 completion or production qualification.

## Three authored cases

| Case | Actual path selected by the draft | Required observation, not a current result |
| --- | --- | --- |
| BOUND | Three retained HTTPS read owners -> bounded producer -> SDK signing/preflight -> independent pins -> actual V6 -> one original HTTPS POST | Original hash/header/checkpoint unchanged, one BOUND response, actual joined store close |
| Lost ACK | Same original through the durable attempt fence; server drops the socket after observing that POST | OUTCOME_UNKNOWN retains the original checkpoint; the actual V4 close veto prevents store.close; no retry or replacement |
| Expired horizon | Positive work and signing, then a sixth current read advances one Momentum beyond the allowed horizon | Refusal before custody/POST; no replacement or re-signing; empty V6 row and normal owner close |

The fixture checks exact role paths, Host, method, JSON-RPC IDs and parameters.
Funding must carry the exact retained original PAYMENT-SIGNATURE after the same
store reports ATTEMPT_FENCED. A positive test ACK is not a real provider grant,
payment, inclusion, finality or service-delivery observation. This suite does
not include the official x402 runtime/composition or a real chain endpoint.

## Closed entry and source binding

The launcher is SOURCE-ONLY by default. The actual source-only command admitted
74 application/profile files and five launcher inputs, and read the immutable
382-row package declaration. It did not read or execute the package files.
All 69 application modules and package.json match source parent
`0be13c3b5662f2181be356f7ff21a4545b4bea95`; none of those runtime modules changes in this batch.

The new public inventory is
`qualification/dynamic-plasma-full-native-loopback.inputs.json`, SHA-256
`a472e3bcd8840ef4236e395cb918ae5f2a84be9ca45d8f59417c0b77da291933`. Its 456-row source seal is
`e6617bdc907d1c2d362e459038bda0801e3eb71e62a8e637b8d5ebb9cedd89b1`. The old package inventory remains unchanged.

The read-only profile builder produces PRIVATE file URLs and physical
identities only when supplied the actual existing package root. Do not publish
that private profile. The native resolver verifies the declared bytes before
the fixture/SDK imports, permits only five pinned bare-import edges, and leaves
native builtins and module loading genuine. It is not an ordinary installed
namespace or an OS/filesystem/network sandbox. Actual native SQL uses no Node
Permission Model because its real fchmodSync must not be replaced.

A source-only check can be selected explicitly with a trusted Python runtime:

```text
python3 -B qualification/run-dp-full-native-loopback.local.py \
  --repo ABSOLUTE_REPOSITORY_ROOT \
  --manifest-sha256 a472e3bcd8840ef4236e395cb918ae5f2a84be9ca45d8f59417c0b77da291933 \
  --source-only
```

`--pre-native-plan` additionally requires explicit existing package, runtime,
manager and mounted-storage selections. It is read-only and grants no run.
`--execute` is a separate effectful branch: neither that flag nor this document,
the new manifest, a previous SDK test or a funding-only TLS allowance authorizes
it. Its actual package/binary/source/manager/disk/capacity admission has NOT run.

## Proposed future ceiling, not permission

One proposed full-suite attempt uses one Node process with no Node children and
one OpenSSL command for a NEW test-only TLS key/certificate covering localhost
and IPv4 loopback. Three NEW V6 databases and three independent pin files use
one new private managed root/task with a 4 MiB quota and the 10 GiB free-space
floor plus reservations/safety. The launcher never creates/adopts a root.

One new in-memory synthetic transaction key can sign at most three times.
Each producer search is capped at 4096 candidates. Three producer reservations
(12288), an independent reference bound of 32768 and a fixed-verification
reservation of 16384 remain below the aggregate 65536 ceiling. Reference
exhaustion does not authorize another key, range, search or run.

The actual retained read budgets stay 78/78/18 per case; two cases may each
perform one funding POST. Thus 524 loopback connections is the admission ceiling.
An all-pass transcript expects 270 RPC requests plus two funding requests:
272 TCP/TLS connections, not a measured performance result. These counters and
cooperative timeouts are not OS-enforced resource bounds.

Socket sets belong only to the new fixture server. Forced server cleanup is a
test failure. The intentionally HELD payer store is not force-closed, reopened
or replayed. Child-created database and pin files are not silently registered as
disposable scratch. Their cleanup HOLD, task close, test result and process-exit
cleanup must be reported separately; no historical evidence or roots are adopted.

## Publication and remaining gates

Only the ten selected draft/source-review files are eligible for the source
branch in this batch. No file is eligible for main yet. Main and unrelated
dirty work, branches, open PRs, workflows and historical evidence stay unchanged.
Parent heads have zero check runs/statuses/workflow runs; this is not green CI.

The next native step needs its own explicit full-graph authority and current
source/package/launcher/manager/mount/capacity review. Source-only checks do not
consume or expand any old one-shot grant. No installation, external network,
real wallet/payment/provider/capability signer, SDK PREPARE, live pilot,
default-buyer cutover or production authority is introduced.
