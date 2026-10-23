# Current-source native HTTPS v2: actual result

Status: **three native tests passed; the original launcher's classifier failed**.
This is a scoped local result, not full application, main-runtime or pilot acceptance.

## Executed source and result

The single authorized repeat used [source commit 6bf0c1b](https://github.com/edgepillar/zenon-x402-poc/commit/6bf0c1b80cad61c1c1e7ec17453f773414b25bd6),
Node 24.19.0 on macOS arm64, and existing core 2.23.0 / zod 3.25.76.
The pinned, same-process namespace verified 36 source inputs (701,939 bytes);
it changed only three fixed bare-import resolutions, not source or formats.

The three executed cases passed, with no failures, cancellations, skips or TODOs:

1. Original pending payment resumes once, then replays its acknowledgement.
2. Exhausted pending reconciliation retains the original without another first settlement.
3. Changed context is rejected while the original continuation remains usable.

The run made 15 authenticated TLS 1.3 / HTTP/1.1 loopback connections, below the
16-connection limit. Wrong method, path and Host were rejected before SDK entry.
Each original payload/header and selected tuple remained unchanged. All three
ingress owners and routers closed; tracked sockets, requests, handlers and timers
were zero. Exactly one OpenSSL command created one **test-only** TLS key/certificate;
one Node command ran, with no Node child processes.

## Reporter classification error is preserved

The Node command actually exited 0 with complete streams: 3,869 stdout bytes,
zero stderr, three passing results and three composition diagnostics. Its default
reporter was Node's built-in **Spec** reporter. The launcher parsed only TAP
prefixes and summaries, so it recognized no diagnostics and closed its managed
task as FAILURE. The archived launcher, original FAILURE outcome, command
receipts, raw streams and retained inputs are unchanged.

A separate read-only Python evaluator checked the original stream digest, exact
Spec results and summary, all three diagnostics, namespace marker, two complete
exit-0 command receipts, 36 retained source objects, closed-task CAS ownership and
owned scratch cleanup. This establishes the native test result independently;
it does **not** relabel the failed launcher workflow or re-execute the experiment.

The archived launcher has a known reporter-classification bug and is not a new
execution entrypoint. Its SHA-256 is
`7425233377f561ae1d9a0b7ab16fb55bba20dfe1bba9495a4fbb122f28c6950b`.
The separate capture evaluator's SHA-256 is
`61077d2d414b2d780574737e486758d0366c928b85da86e95be298e85e3f471c`.

The complete, privacy-reviewed native stdout is retained as Base64 in
[the actual result](../qualification/official-x402-native-https-pending-v2.actual-local-result.json).
No private paths, command environments, TLS PEM material, wallet material or
raw OpenSSL output are published. The old failed native attempt stays historical.

## Storage and scope

Only one new private managed task was used, with a 2 MiB quota and full capture
reservations. Existing held work and historical objects were preserved. The
combined free-space check used current other-project reservations; neither store
policy was rewritten or weakened. Registered scratch was cleaned after all
control, source, stream and test-TLS payloads were retained. This is not secure
erasure, an OS disk quota or measured APFS physical reclaim.

No install, external network, SQLite, Zenon SDK, wallet/capability/payment/provider
signing, nonce search, real PREPARE or payment ran. The TLS fixture is not payment
signing authority. File permissions and source guards are not an OS network or
hostile-code sandbox.

## Roadmap impact and remaining gates

This closes only the **three-case current-source native HTTPS qualification**
gate. It adds actual native evidence to the router's separate 32-pass component
result; those are distinct executions and are not counted as one test suite.

Service callbacks are still declared data. The complete application factory,
same-flow real V6 custody, service ledger/debit, grant activation, real provider
acceptance and service delivery were not exercised here. Ordinary installed
namespace, hosted CI and main runtime are not qualified by this branch result.
Full P0-P4 remains incomplete and the economic pilot remains **NO_GO**.

When this report is mirrored to main, that is a documentation/evidence transfer
only. It does not merge the working branch's application code or change the
executed-source attribution above.

