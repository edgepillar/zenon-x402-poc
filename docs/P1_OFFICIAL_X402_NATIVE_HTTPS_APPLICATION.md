# P1 official x402 / scoped service-credit HTTPS application

## Purpose and status

This increment connects the existing official x402 request entry to the existing
bounded HTTPS lifecycle and an explicitly scoped durable service session. It is
default-off; ordinary CLI/server, buyer, SDK, signer and provider defaults do not
change. It is not a new x402 mechanism or a new SQLite schema/version.

SOURCE_IMPLEMENTED with ten selected declared-callable/constructor contracts
passed on the current router/ingress sources. One bounded Node 24.19.0 command
exited 0 with complete stdout and empty stderr; its exact source, closed records
and streams were reviewed separately. See
qualification/official-x402-upfront-https-router.actual-local-result.json.
The application factory was reviewed as source, NOT parsed or executed. Native
HTTPS, actual SDK and V6 application qualification remain separate; the model
response-loss cases do not establish native recovery. Do not transfer earlier
component passes to this changed graph.

One separately authorized native experiment then loaded the pinned real SDK and
selected all three cases, but FAILED BEFORE LISTENING: the fixture requested a
2000 ms request deadline with only 1000 ms close grace. The existing ingress
correctly refused that configuration; zero native connections were attempted.
All three tests failed. The complete failed sources, command and streams remain
retained; see qualification/official-x402-native-https-pending.failed-local-result.json.
The fixture now uses 3000 ms close grace without weakening the production rule.
Three separately executed, source-bound network-free regressions passed for the
corrected dormant construction, rejected shorter grace and accepted equal
boundary. They read the native fixture as TEXT, never parse or execute it. See
qualification/official-x402-native-https-deadline-contract.actual-local-result.json.
The corrected native fixture has NOT been rerun; there is still no native HTTPS,
V6 or full-application pass to transfer to main.

## Actual application graph

createOfficialServiceCreditHttpsApplication creates:

- One actual createOfficialSelectedSettlementServer with the selected fixed
  requirement/resource and existing trusted facilitator/observer callbacks.
- One actual createDurableServiceCreditHttpSession over the host's borrowed,
  already-initialized ServiceCreditSqliteStore, always with admittedGrantId.
- One bounded router and the same existing HTTPS generation/connection owner.
  The explicitly selected mixed ingress accepts exact GET /paid for x402 and
  POST /service-credit/v1/execute for the existing service-credit admission.

The original createServiceCreditBoundedHttpsIngressOwner remains POST-only.
The new createServiceCreditBoundedHttpsIngressOwnerForOfficialX402 is explicit:
the declared target list must include /paid; POST /paid and GET on other targets
are not admitted. Every admission reinspection rechecks the original GET request
using the same application binding, in addition to the original descriptor,
header, TLS-policy, reservation and response-ownership fences. Existing native
budgets, one request per connection, deadlines and uncertain close stay owned
by that existing ingress. Its stricter Connection: close policy still applies.

The application's transport configuration contains origin, generation, limits,
deadlineRuntime and httpsServerFactory. Supply the existing
createServiceCreditBoundedNodeHttpsServerFactory explicitly to obtain the native
Node HTTPS path. The application never constructs arbitrary TLS material or
calls that factory during construction. Only an explicit start opens admission.
Transport DATA and the exact resource are captured before the first await.

The service configuration is the existing scoped session contract: store,
execute, deadlineRuntime, selectedDurationMs and admittedGrantId. It is an
administrative host configuration, not a grant selected by an HTTP caller.
The host retains ownership of the store and closes it after application close.
Raw store/admin methods are never returned to the HTTP client.

## Funding pending and exact original replay

The router calls only processHttpRequest for GET /paid, not the legacy scalar
API. It retains at most the configured 1..64 original paid headers and one active
funding operation. Invalid method/target/Host/body framing is refused before the
application call. The actual application's pre-operation input-refusal code
produces a bounded 400 reply, without replacing another pending tuple.

A later explicitly received identical header may resume only its already-owned
pending continuation. The original official owner enforces remaining observer
budget and consumed first-settlement authority. The router never retries in a
loop, creates a new payment, re-verifies an exhausted tuple or refreshes a quote.
Settled/exhausted replies are retained before the writer runs; exact replay uses
that retained DATA, not another first-settlement invocation.

This funding cache is MEMORY_ONLY. Reconstructing the application is NOT durable
replay or payment recovery authority. Native response loss can quarantine the
transport even when this cache retains an acknowledged settlement. Do not turn
a component cache-only replay result into native reconnect/restart evidence.

A funding 200 contains a settlement receipt and serviceDelivery NOT_ESTABLISHED.
It neither activates a grant nor invokes the service. POST service calls still
pass the separate actual grant/capability/debit/execute contract, including
foreign-grant rejection and exact original service-request replay.

## V6 is on the payer side

The server-side service ledger and the payer's V6 original-payment custody store
are different authorities. Do not replace the real payer with a second DB opened
by the server, and do not describe the server's ledger as a V6 payer store.

The remaining end-to-end application qualification must use the actual existing
V6 payer/client on the client side of this SAME HTTPS flow. It must retain the
original funding envelope/checkpoint before dispatch and use independently
retained binding/digest pins on every recovery read. The application constructor
does not create/migrate/open that payer store, derive pins from it, prepare/sign
a chain transaction, activate funding or clear quarantine.

## Close, errors and evidence boundary

The application returns the actual ingress start and close capabilities. The
router closes each retained pending continuation once and drains its actual
outstanding callbacks and durable session before a clean downstream verdict.
It drops its raw response/completion references on close and suppresses late
writes. Active/failed callbacks, failed continuation/session close, malformed
reply or response-write loss keep uncertainty; they are not repaired by a late
success. The borrowed service store is never closed by this application.

A callback that never settles can still prevent a clean downstream drain; the
existing ingress's bounded CLOSE_UNCERTAIN path is not proof of physical socket,
store or process release. No OS/network sandbox or hostile same-process-code
confinement is claimed.

qualification/official-x402-upfront-https-router.behavior.draft.mjs selects ten
declared-callable/constructor cases only. It does not import the official SDK,
application factory, native server factory or SQLite. Its response-loss and
pending models are not native connection, real SDK or V6 integration evidence.

Full P1 remains open until one current-source native-HTTPS/official-x402/V6 flow
covers success, pending, response loss, a foreign grant and exact original
replay. Exact-head hosted CI, ordinary installed-package namespace qualification,
physical lifecycle, provider/runtime acceptance and economic pilot NO_GO remain
separate. No protected real admission, PREPARE, payment or provider run is added
by source implementation or declared-callable tests.
