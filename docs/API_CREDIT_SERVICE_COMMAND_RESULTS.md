# Original-command-bound service replies

`decodeApiCreditServiceCommandResult(captured, line)` in
`src/api-credit-service-command.js` reads one complete canonical reply from the
operator's already selected private result channel. `captured` must be a genuine
object returned by `captureApiCreditServiceCommand` or
`captureApiCreditServiceReplayCommand`. Copies and fabricated objects cannot
select the original request or its byte budget.

```js
const original = captureApiCreditServiceCommand(existingRequestOptions);
// The caller exchanges original.line through its existing owned channel.
const first = decodeApiCreditServiceCommandResult(original, oneCompleteReplyLine);

const repeated = captureApiCreditServiceReplayCommand(original, uniqueReplayId);
// Explicit replay retains the exact request, proof and URL bytes.
const replayed = decodeApiCreditServiceCommandResult(repeated, replayReplyLine);
```

The caller supplies the capture for the command it is actually awaiting. The
existing host still enforces unique command IDs and its own resource/operation
limits. This reader opens no channel, sends no command and selects no retry.

The reply must identify the same command ID, operation, grant and request. Its
version and outcome, closed recorded-result shape and NONE-authority fields
must match the actual existing result encoder. The reader reproduces the entire
canonical reply using that encoder and compares the exact wire bytes before
returning the frozen recorded service-result DATA. Response JSON is preserved.

One LF is required. CRLF, missing or extra lines, duplicate/noncanonical JSON,
extra authority fields, legacy void callback acknowledgements and conflicting
response/result codes are refused. The captured JSON byte limit plus its one LF
applies before parsing; UTF-8 roundtrip, depth and node bounds are enforced.
No caller-provided serializer or opaque thenable is invoked.

A reply for the first command does not match a replay command with a new
correlation ID, even though both retain the same original request/proof/URL.
Correlation and grammar do not authenticate a provider or prove delivery. The
returned result retains `authority: 'NONE'` and
`serviceDelivery: 'NOT_ESTABLISHED'`. UNKNOWN, malformed or absent observations
cannot become a recorded service result. The original application/owner still
decides admission, recovery and close; the reader does not clear HELD.

The prepared command lines and result DATA may contain private request, proof
or service information. Keep them in the already selected operator channels;
they are not diagnostic or public-report payloads.

## Qualification

The new DATA controls use the actual command/result codecs. Their 100-request
case also uses the actual recorded-result product wrapper and reference ledger
with declared memory funding, grant, file, SQL, proof and native-child ports.
All 100 replies and the exact replay are decoded; counters remain one declared
funding/grant and 100 submissions/debits/executions. Original payment bytes,
model state and the exact response survive the replay.

The default native buyer/provider graphs, package catalogs and hosted
108-control/22-input selection are unchanged. This adds the response-reading
counterpart to the existing optional command assembly helper. Native
SDK/core/SQLite/HTTPS, proof authentication, physical release, fresh-process
reopen, Linux and G1/G2 acceptance remain OPEN. The current source profile and
actual local result identify the exact DATA and retained-control evidence.
