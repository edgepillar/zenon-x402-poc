# P1 V2 native HTTPS and two-SQLite attempt

## Result

**FAILED_OR_INCOMPLETE.** One approved local attempt used the exact application
source at [67c2b96ba484ca208009b0f44235fd38a8ebd46c](https://github.com/edgepillar/zenon-x402-poc/commit/67c2b96ba484ca208009b0f44235fd38a8ebd46c).
The actual Node exit was 1; stdout/stderr capture completed. TAP recorded six
tests: four passes and two failures (one selected case plus its parent).
There were no skipped, cancelled or todo tests.

[Source-bound result and sanitized TAP](../qualification/p1-native-v6-two-sqlite-once-v2.failed-local-result.json)
are authoritative over the fixture's unconditional completion diagnostic.

| Selected case | Actual result |
| --- | --- |
| Pending retains the V6 original and same SDK tuple | PASS |
| Success, explicit synthetic BOUND handoff and actual V6 service submission | PASS |
| Original service proof replay without another debit | PASS |
| Valid foreign grant rejected at client and service admission | PASS |
| Response loss and completed normal reopen of both files | FAIL |

## Scope actually executed

One new 4 MiB owned task in the existing approved private store ran one OpenSSL
test-TLS command and one direct Node command, with zero Node children.
The reviewed runtime was Node 24.19.0 on Darwin arm64, with existing
`@x402/core@2.23.0` and `zod@3.25.76`. No package installation occurred.

The resolve-only namespace verified 57 files / 1,242,148 source bytes before
fixture execution, used three fixed bare-import bindings and zero transforms.
It resolved 53 declared files. This does not qualify an ordinary installed
package namespace or provide an OS/network sandbox.

Eight loopback connections completed eight authenticated TLS 1.3 handshakes,
within the 48-connection ceiling. The attempt used two new synthetic SQLite
files, two in-memory synthetic capability keypairs and three capability
signatures. There was no external network, Zenon SDK, wallet/payment/provider
signature, nonce search, real PREPARE, application restart or pilot.

The native server was the actual bounded server factory and the client used the
actual native transport and V6 original-payment client. Facilitator verification,
settlement, observation, service work, trusted grant activation and the
PREPARED-to-BOUND host handoff were explicitly synthetic. A funding ACK did not
authorize that privileged handoff or prove real funding-to-grant activation.

## What failed, and why the diagnostic is not a pass

V2 corrected the earlier timer-contract error: ingress cancel returns boolean;
the durable service adapter returns undefined. Its first four cases now passed.

The fifth case injected a real post-header response loss after the second
service execution. A subsequent submit was refused without increasing the
eight-request count. The actual payer close returned its underlying store slot,
and its file reopened normally with BOUND revision 3, both original requests,
both dispatch intents and the prior successful response observation.

It then failed at fixture line 360:

```text
f.raw.getOriginalCustodyQuarantine is not a function
```

The source exposes `getOriginalRequestCustodyQuarantine` instead. The correct
quarantine API assertion, the following foreign-original assertion, and normal
backend reopen/completion were not reached. The failure is in the fixture call;
it is not evidence that the implemented store method failed.

Node's `await t.test(...)` did not reject for that child failure. Consequently V2
still printed a completion diagnostic with hard-coded
`normalSameFileReopen: true` and `responseLossQuarantineRetained: true`.
Those values are declared data, not completed assertions. The launcher rejected
the attempt using actual exit 1 and TAP failures; the public record does too.
A null `parentErrorCode` in the attempt summary cannot override a child failure.

## Preserved state and limited byte inspection

The actual transport snapshot retained CLOSE_UNKNOWN with zero tracked requests,
sockets and timers; its local material release returned once. This is not
service-delivery proof or the native late-grace-expiry experiment. The actual
application ingress closed with all four tracked counts zero.

Both native child files remain HOLD, not adopted or deleted. The failed V1 task
and both of its file digests were rechecked unchanged. V2's child files contain
77,824 logical bytes. Source/CAS reuse added eleven unique objects; the root now
retains 76 objects / 1,464,698 logical bytes. These are logical sizes, not measured
physical APFS reclaim. No historical cleanup or policy rebinding occurred.

A separate bounded, read-only Python page/record decoder inspected the retained
SQLite bytes without opening a SQLite connection or executing SQL. It found:

- Backend revision 10, two recorded successful requests, selected-grant totals
  6 available / 0 held / 4 consumed, and foreign totals 10 / 0 / 0.
- Payer BOUND revision 3, two originals, two intents, one response observation,
  one checkpoint and one CUSTODY_OUTCOME_UNKNOWN quarantine.
- Quarantine authority NONE, all payment/sign/dispatch permissions false, and
  the response observation's deliveryConfirmed false.

This recorded data does not retroactively pass the missing API assertion,
establish normal backend reopen, authorize resend or prove service delivery.

## Follow-up, without another native attempt

V1 and the executed V2 sources and evidence remain unchanged.
A separate V3 source draft uses the real method, checks its prototype shape
before creating fixture resources, and records each selected case's completion.
A failed child stops progression and cannot emit a completion diagnostic.
Quarantine and both reopen milestones become true only after their assertions.

V3 has not been parsed or run. The new native-host/deadline-owner source draft
was not in V2's graph and is not in this V3 graph either. No V3 launcher or native
rerun was authorized by the consumed V2 one-shot permission.

P1 completion, native forced interruption, hosted CI, actual provider funding
authority and economic pilot remain unestablished. CI is NOT_RUN_NOT_GREEN;
the pilot remains NO_GO. Main may carry this honest result/documentation without
transferring unqualified native source or changing any default payment path.

