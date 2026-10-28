# V5 service commit and response-loss qualification

One separately approved synthetic native service-response-loss case passed on
28 October 2026. The source selection uses the actual existing SDK 1.0.5,
x402 core 2.23.0, SQLite custody and loopback HTTPS application. No pending or
clean case was rerun. See the [machine-readable result](../qualification/sdk105-issued-command-application-v5.service-response-loss.actual-local-result.json)
and the [updated roadmap](ROADMAP_20261028.md).

The exact request and authorization were retained independently before dispatch.
A deferred probe matched the original committed service request and revision
before requesting one stop of the actual response socket. The original client
command rejected. The backend held one `SUCCEEDED` request, one execution and
two consumed units. Native exact replay returned the cached `native.ok` result
without another debit or execution. A foreign-grant request returned 401; the
foreign grant was untouched and a second original-client request was absent.
The original signed transaction and funding packet remained unchanged.

| Observation | Actual selected result |
| --- | --- |
| Funding requests / signed transactions | 1 / 1 |
| Service executions / consumed units | 1 / 2 |
| Backend exact replays / foreign refusals | 1 / 1 |
| Matching commit revision / socket-stop attempts | 8 / 1 |
| Command owner / client close | HELD / UNKNOWN |
| Command-host close / channel close | CLOSE_UNKNOWN / CLOSED |
| Task-storage record | CLOSED / SUCCESS; unregistered child outputs remain HOLD |
| Physical drain and actual V6 release | NOT_QUALIFIED |

The command owner's HELD result is expected for this case. Closing the outer
qualification task does not turn the inner command owner into CLOSED or prove
physical resource release. The gate's `nativeDeliveryLoss` remains
`NOT_ESTABLISHED`; the result establishes the committed-stop/rejection and
backend replay assertions of this selection, not a universal network-delivery
proof or completion of every P1 loss case.

The exact profile has 135 application files, 404 installed-package files and
603 literal application edges. Its profile SHA-256 is
`b010d93c212086a3047d763887b4d0801b0fa84f03737fb13dc926633c4f2cac`.
The explicit existing Node 24.19.0 darwin-arm64 binary SHA-256 is
`3c9448363b9976bf3d9e8f4d320397975800131b42c7b1be342dadc05871dd25`.
Sources and binaries were not copied or transformed. The selected namespace is
not qualification of an ordinary fresh dependency installation or an OS/network
sandbox. Synthetic provider envelopes are not authenticated chain observations
or real economic funding.

One OpenSSL test-TLS command and one Node command completed; there were no Node
children or automatic retries. Reference work evaluated 626 candidates in one
window; aggregate reference/producer/verification reservation was 21,106 under
the approved 65,536 ceiling. Eight retained CAS objects were verified after task
closure without opening a SQLite engine again. Historical evidence was retained.

Funding reply loss, a fresh-process reopen of the same records, the complete
late-close success/error matrix and physical resource release remain open.
Current main application adoption, economic pilot and production acceptance
are separate. The existing authorized 108-control CI profile is unchanged.
