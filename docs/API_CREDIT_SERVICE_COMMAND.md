# Explicit service command assembly and original replay

`captureApiCreditServiceCommand` in `src/api-credit-service-command.js` assembles
one existing `submitService` command from explicit `id`, `serviceResourceUrl`,
`originalRequestJson`, `authorizationHeader` and `maxLineBytes` DATA. It validates
the actual buyer wire grammar before using the actual API-credit command codec.
The grant and request identities come from that validated original request.
There is no independent caller copy of either identity or of the empty body.

The frozen result contains `apiCreditServiceCommandVersion: 1`, `command` and
`line`. `line` is canonical command JSON followed by one LF. It contains private
existing proof DATA: write it only to the operator's already selected command
channel, never to public reports or logs. This helper opens no channel and sends
nothing. Byte limits are explicit and enforced by the existing command codec.

`captureApiCreditServiceReplayCommand(captured, newCommandId)` requires an actual
captured result and changes only the command-channel correlation ID. The frozen
input object, exact original request/proof/URL bytes, empty body and selected
line-byte limit are retained. It creates no replacement request, proof, payment,
grant, or authority to resolve an UNKNOWN outcome. Copying a captured result
does not create a replay preparation. Each command still needs an explicit
operator action and the existing application's own admission and custody.

For the G1 reference scenario, an operator can assemble 100 distinct existing
request/proof pairs and explicitly select one captured original for replay.
The DATA controls compose the real codec and buyer wire capture with the fixed
provider's cost/receipt callbacks and mock-activated reference ledger. They
check 100 unit debits/executions, no additional debit/execution on exact replay,
budget refusal, JSON reconstruction and retained UNKNOWN reservations.

Proof strings and activation are declared mock DATA in these controls. Grammar
validation does not authenticate a capability, authorize a grant or sign a
request. No installed SDK, SQLite, socket/TLS, key/signature, nonce search,
real PREPARE/payment or native application runs. Reconstruction is not native
reopen or durability. The helper is additive and does not change either native
entry or its package catalog. Native/Linux G1/G2 and G0-G5 acceptance remain OPEN.
