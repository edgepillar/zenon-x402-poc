# P1: actual issued funding POST and native scoped-service application

## Evidence boundary

Sixteen selected DATA component cases passed on the current pure application
binding. The new actual native application passed a syntax check only; it was
not imported or executed. This is substantive composition source progress, not
actual native HTTPS, SDK, SQLite, grant activation, service delivery or production
qualification. P0, P1, P2 and the full roadmap remain incomplete.

The selected evidence is
[`issued-funding-post-application-binding.actual-local-result.json`](../qualification/issued-funding-post-application-binding.actual-local-result.json).
At review, source and main parents were
`68fc5af3340a609a863143d9a70093c61d1a9013` and
`f416253ac6e0f69cb485fcbc71ff7df0a5d504ce`. These parents are not claimed to contain the new
files; exact new input hashes are recorded in the result.

## Actual default-off root

On `x402/p1-router-late-pending-close-integration-v2`,
`createOfficialIssuedFundingPostNativeApplication` hardwires:

1. The actual issued funding intake and official POST server composition.
2. The existing **POST-only** bounded native HTTPS ingress for both
   `POST /funding` and `POST /service-credit/v1/execute`.
3. A lazily constructed actual durable service session with one exact
   `admittedGrantId`.

It does not mount the old GET/paid application over a POST route, inject an
intake/SDK/store replacement, create TLS material, start a listener during
construction, create a grant from a receipt, or change ordinary buyer defaults.
The host explicitly supplies the existing native factory and TLS/bind settings.

The root's methods are `start()`, `close()`,
`resumeOriginalSettlement()`, `admitCommittedServiceGrant(grantId)` and
`snapshot()`. The actual native ingress owns listener/socket reservations and
the transport close verdict. Construction and local admission can perform
actual SQL work when explicitly executed; this turn did not invoke them.

## Preserve the actual funding POST-v1 contract

The existing funding client requires exact text responses:

- Unpaid: HTTP 402, body `Payment Required`, original `PAYMENT-REQUIRED`.
- Intake accepted: HTTP 202, body `BOUND`, **no** payment-required,
  payment-response or payment-signature header.

Both use `text/plain; charset=utf-8`. A JSON rendering of the intake record,
an official settlement receipt or a forwarded SDK pending header would violate
this contract. The new
[pure application binding](../src/x402-issued-funding-post-application-binding.js)
retains the exact issued challenge and forms the exact five-byte BOUND body.
Observer filenames, record keys and transaction identifiers never enter this
wire frame.

The actual source root supplies the genuine intake result before this mapping.
The pure component can only check DATA affinity and shape; it authenticates
neither issuance, BOUND nor a grant. Its inspection explicitly reports no such
authentication and no activation authority.

BOUND remains intake acknowledgement, not settlement, publication, inclusion,
finality, grant activation or service delivery. The private actual root keeps
official pending separate. An exact original-header replay is cache-only; a
separate local pending observation uses the same existing continuation. No HTTP
replay creates another verifier, first settlement, funding send or new quote.

## Open service only after the actual matching grant exists

The actual HTTP admission constructor snapshots its eligible grant index. A
session created before funding/activation cannot subsequently admit a new grant
without reconstruction. Also, the real grant ID can depend on the post-funding
activation record; requiring it before issuance would impose the wrong sequence.

The new root instead fixes offer/version/holder/capability selection before its
initialization await. Service initially returns unavailable. After separate
authorized activation has committed a grant, an explicit local caller passes
that resulting ID to `admitCommittedServiceGrant(grantId)`.

That method reads the actual configured SQL store using its captured prototype
method. It matches the requested ID, ACTIVE lifecycle, retained original
transaction, offer/version, holder/capability, network/chain, amount/asset/payee,
and exact issued resource/requirement/intent/funding commitments. Only then does
it construct the actual scoped durable session. A foreign request cannot choose
the grant or invoke this local admission operation. A not-ready or mismatching
record does not consume a successful session claim; attempts remain bounded.

This does not activate or authenticate a grant on its own. The model and external
activation/verifier authority remain responsible for that committed record.
The actual SQL `getGrant` is transactional and may persist a lifecycle refresh;
this is not presented as SQL that can never write.

## Startup and lifecycle

This named profile performs real zero-BOUND-row startup checks before and after
the actual SDK initialization await. The existing store returns an ordinary,
not frozen, array. A pre-existing BOUND row is refused; no row is erased, no
historical observer is silently opened, and no recovery proof is claimed.
Existing ISSUED selection reuse remains the actual intake's original-frame
operation. This fresh-start profile does not complete the P2 restart gate.

Public close fences local operator admission before entering the actual native
owner and returns its retained real close receipt. Funding admission and the
service session are independently closed at most once; late pending work stays
joined rather than becoming a fresh operation. Unknown, active abort and close
uncertainty remain held. No late outcome clears uncertainty, and neither
borrowed SQL store is closed by this root.

No callback facade, native-module alias or application-source transform was
used as a substitute for an actual native run. Trusted native factory/callbacks,
cooperative budgets and host-exclusive store ownership still require separate
qualification; they are not an OS sandbox or an activation guarantee.

## What ran and publication scope

The current selected run directly loaded only the pure binding, its closed
dependencies and the pure response-custody component on pinned Node 24.19.0
darwin-arm64. Sixteen tests entered and completed, with zero failures, skips,
cancellations or descriptor/proxy hooks. Source and output were bounded and
checked before/after; no child process or test discovery was used.

The cases cover funding text/header compatibility, no settlement-to-BOUND
alias, exact original replay and terminal phases, same-transaction grant scope,
separate commitment domains, explicit post-activation grant ID selection,
zero-hook DATA capture and refusal without renewed authority. The custody case
feeds **declared** closure events: it does not prove TLS, sockets or native
cleanup. Likewise, grant and intake inputs are declared DATA, not signed proof
or actual SQL records.

Two DATA commands and three syntax-only commands ran during development. The
first DATA run passed a superseded pre-funding-ID design; it is not retagged as
current coverage or added into a 32-case suite. Only the final 16-case pins
qualify the current pure code. Only the final syntax pins identify the current
actual application; earlier syntax passes are historical.

Current pure binding SHA-256:
`5e404dbeebc107f1aafe29d1ea37f1bf1f3bcede875864c44d88c81303f94468`.

Only four pure binding/test/result/document files are eligible for main.
The actual native application remains source/syntax-only on the source branch.
Existing main GET application/router/server blobs, historical results, the
absent native funding transport and the frozen pending full-DP profile stay
unchanged. No SDK, SQL, TLS/OpenSSL, signature, nonce, installation, managed
task/root or qualification scratch was used in this turn.

Both parent heads had zero checks, statuses and workflow runs. No current CI
pass is inferred and no workflow or PR mutation was dispatched.

Next: select and author an actual current-graph native vertical fixture that
connects this root to the actual client/V6, externally activated selected grant
and complete failure/close paths. Its SQL/observer files, TLS, signatures,
work limits and native owners must be enumerated and separately authorized
where required. Do not reuse the old TLS allowance or enlarge the frozen pending
full-DP profile, and do not label this application end-to-end qualified yet.
