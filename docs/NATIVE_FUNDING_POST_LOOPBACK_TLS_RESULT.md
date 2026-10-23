# Native funding POST loopback TLS: failed selected qualification

Status: **FAILED / NO-GO**, 24 October 2026. This is a recorded local failure,
not a native transport qualification, full P1 result, current-main runtime
result, or production readiness statement.

The new opt-in funding POST transport was exercised with the actual Node
HTTPS implementation. Two authorized attempts were consumed. No third attempt
was launched. The default buyer, payment signer, main runtime and workflows
were not changed by this qualification.

## What actually ran

| Attempt | Native commands | Observed result |
| --- | --- | --- |
| 1 | One OpenSSL command; no Node command | TLS setup failed while expanding the configured RANDFILE environment variable. No network scenario entered. |
| 2 | One OpenSSL command and one direct Node command | Test TLS setup succeeded. The first BOUND case rejected with FUNDING_POST_NATIVE_HTTPS_OUTCOME_UNKNOWN. Node exited 1 with complete output capture. |

The second launch changed only the reproducible OpenSSL configuration to use
`./openssl.rnd` relative to its exact owned command directory. The production
transport and selected JavaScript inputs were identical across these two
attempts. Node 24.19.0, darwin/arm64 and the exact source/runtime digests are in
the [sanitized result](../qualification/funding-post-native-loopback-tls.actual-local-result.json).

| Selected native scenario | Actual status |
| --- | --- |
| Complete BOUND body plus actual request/socket close | Entered, failed; zero passing cases |
| Partial body retained as UNKNOWN | Not entered |
| Abort retained as UNKNOWN without replacement | Not entered |
| Wrong URL/method rejected before native start | Not entered |

The fixture stops starting further requests after any selected case fails.
The complete capture contains one entered test, zero passes and one failure,
not four passes. The generic error did not retain an event-stage witness.
The failing stage, successful authenticated-handshake count, actual connection
count and actual clean-close state are **not established** by this output.
Do not infer a certificate, framing, close-ordering or application defect
without additional evidence.

The header marker is unsigned synthetic data, not a valid signed payment.
No x402 package, Zenon SDK, SQLite, nonce search, capability/provider/payment
signing, external endpoint, original payment, grant or service delivery was
used or proved. The complete native DP composition was not imported.

## Post-failure code work, not a passing rerun

The source branch now contains a first-fault stage/code diagnostic and a
bounded fixture failure frame. The transport records the first reason once,
the last accepted stage and an allowlisted own-data native error code. It does
not retain an Error, raw message/stack, endpoint, header, response body,
certificate or key. Late errors/drain cannot replace the first fault or repair
UNKNOWN. Input, certificate/hostname/ALPN, framing, no-retry and close guards
remain enabled.

These changes were authored **after** the native failure. They were not parsed
or executed by Node, do not establish the root cause, and are not a verified
fix. Their current transport SHA-256 is
`cfd30efb8b2c48d3d301631fa8fc6ccaaa569fc3edb473c63bd170e8f603a0a1`;
the failed run instead used
`740fb2492c030728e9c27d3ad920252f6d71bd369400694e9a8b062dd1ec27bd`.

The historical input manifest deliberately retains the actually executed
source pins. It does not admit the changed follow-up transport/fixture; the
launcher refuses mismatched sources before creating a task. Neither editing
sources nor changing a selection resets the consumed two-attempt allowance.

The [source branch](https://github.com/edgepillar/zenon-x402-poc/tree/x402/p1-router-late-pending-close-integration-v2)
holds the adapter, selected fixture, retained historical input manifest,
launcher/policy and follow-up source review. Main receives only this report
and the sanitized failure result, not the failed adapter or unexecuted
diagnostic code. No PR, comment, workflow dispatch or branch protection bypass
is part of this update.

## Storage and execution limits

One new private managed root was used. Each task had a 4 MiB quota, a 10 GiB
free-space floor plus scoped existing reservations and a safety margin.
The mounted volume identity, fixed tools, sources and capacity were checked
before each native command. Maximum scope was eight 127.0.0.1 connections per
attempt, one test-key/certificate OpenSSL command and one Node command, with
zero Node child processes. The fixture hardcodes the loopback server.

Both tasks are CLOSED with FAILURE, not success. Complete command receipts and
original inputs are retained. The first task's 324-byte reproducible
configuration was promoted to CAS by normal owned-task closing; its scratch
alias was removed. The second task is cleanup HOLD because of unregistered
native TLS files. Its key/certificate and all failure evidence remain private;
no historical files were cleaned, rebound or adopted.

The fresh root measured 103,966 logical bytes and 262,144 allocated bytes
across 52 files after both tasks closed. These are local measurements, not APFS
reclaim claims or sustainable capacity evidence. No package download, extraction,
source copy tree or archive was needed.

Node file/child permissions were enabled with explicit read grants and no
write/child/addon grant. The launcher and connection ceiling are **not an OS or
network sandbox**, hard resource guarantee, or proof that unknown native
handles drained. Test-owned cleanup is never an application clean-close result.

## Roadmap consequence

Continue scoped local implementation independently of main/CI. Keep native
funding admission and full DP integration NO-GO until the actual failing stage
is established and the exact repaired source completes its newly authorized
selected qualification. Keep the earlier 20-case response-custody component
result as historical component evidence; it does not qualify native TLS.

Current source/main heads had zero check-runs, statuses and Actions runs at the
publication preflight. This means **CI not run**, not green. Economic pilot,
live payment, operator/provider authority and production gates remain closed.
