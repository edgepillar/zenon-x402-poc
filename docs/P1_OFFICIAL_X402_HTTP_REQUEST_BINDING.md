# P1 official x402 HTTP request binding

## Application change

The existing createOfficialSelectedSettlementServer now exposes an explicit
processHttpRequest(request) entry in addition to its original processRequest
scalar API. The new entry snapshots actual IncomingMessage-style own fields
before passing the original PAYMENT-SIGNATURE scalar into the SAME official
application operation. There is no new settlement owner, SDK instance, pending
owner, verify call, first-settlement allowance or automatic retry.

This closes the host-routing gap where the application adapter always supplied
GET /paid irrespective of the host's incoming method and target. It is only
a step toward the roadmap's one native-HTTPS/x402/V6 application composition;
that complete milestone is not established by this increment.

The original processRequest(null-or-header) API still exists and retains its
prior trusted-host route-binding obligation. Its accepted resource shape is not
silently narrowed. The new HTTP entry refuses any configured resource outside
its canonical HTTPS /paid profile, without falling back to the scalar API.

## Closed selected profile

The new entry requires:

- HTTP/1.1, exact GET and exact origin-form /paid; query strings, fragments,
  alternate paths, percent-encoded aliases and absolute-form targets are refused.
- One exact canonical Host matching the fixed resource authority, including any
  nondefault port. No proxy or forwarded-origin header is trusted.
- A socket object with an own encrypted: true data field. This field is a
  trusted-host premise, not authentication of a TLS socket, peer or listener.
- A dense rawHeaders array, at most 64 pairs and 16,384 counted header bytes.
  Names must be tokens and values visible ASCII; duplicate names are refused
  case-insensitively instead of relying on Node's joined-header view.
- Zero-body framing: absent Content-Length or exact 0, with no Transfer-Encoding,
  Expect, Upgrade or Trailer. Connection, when present, is close or keep-alive.
- No PAYMENT-SIGNATURE or one original nonempty whitespace-free scalar bounded
  to 8,192 bytes. The existing decoder still validates the actual x402 envelope.

Proxy/accessor inputs are refused without invoking their hooks. The result of
the capture is immutable copied DATA; mutating the original request/header array
later does not replace that selected scalar. No request stream is read, resumed,
destroyed, retained or closed by this boundary. The host must still own native
TLS, message framing/body drain, ingress admission, socket lifetime and output.

Invalid binding is rejected before the official operation, request budget,
schema callback, verification, first settlement or pending observer is entered.
Accepted calls share the existing operation's actual Promise and busy fence.
A continuation retains the original SDK tuple and consumed authority; request
metadata never permits replacing a signed payment, hash or original context.

## Qualification selections

qualification/official-x402-https-request-binding.behavior.draft.mjs contains
seven current standalone binding cases. It imports the new binding and Node
built-ins only. It does not import or qualify the official package or server.

qualification/official-x402-http-request-pending-composition.behavior.draft.mjs
contains three freshly selected actual @x402/core 2.23.0 client/server
compositions: pending to success, pending exhausted, and changed context while
the original pending continuation survives. Native-request fields, including
the encrypted flag, are declared DATA in these cases. They are not socket/TLS
tests. Eight route/framing refusals plus accessor/arity/proxy controls must leave
the original SDK counters unchanged.

The existing historical application-server fixture and result stay bound to
their original source graph and are not relabeled. Ordinary Node 24.19.0 P0
selection is unchanged and does not automatically import these new entries.
The installed package and its existing dependencies remain pinned; no version
upgrade or install is part of this change.

## Status and remaining P1 gate

SELECTED_LOCAL_CASES_PASSED_NOT_FULL_P1. Seven current binding cases and three
current actual-official-x402 composition cases passed in separate bounded
Node 24.19.0 commands. Each command exited 0 with complete output and empty
stderr; its closed records, retained streams, selected sources and original
preimage were reviewed separately without rerunning either experiment. See
qualification/official-x402-http-request-binding.actual-local-result.json.

The actual core 2.23.0 and Zod 3.25.76 ESM sources were loaded read-only in place
through a source-pinned synchronous same-thread Node resolver: 32 qualified
files, including 29 unchanged ESM files totaling 493,914 bytes. There was no
package installation, source rewrite, VM, worker, child, source alias or second
package/source copy. This qualifies that selected resolver execution only,
not the ordinary installed-package namespace or a production package layout.
The ordinary P0 test profile was not rerun or relabeled as this result; hosted
CI for this increment is NOT_RUN_NOT_GREEN.

The first pre-hardening seven-case result remains separate evidence. Header
control-character refusals were tightened before publication, and the final
seven-case pass binds the changed helper and fixture, not that earlier pass.
No native HTTPS session, V6 integration, delivery or economic authority is
claimed by either selection. The encrypted flag remains declared test DATA.

Next: connect this actual request entry to the bounded native HTTPS ingress
and the V6 payer/backend graph, retaining exact resource and selected-grant
bindings through success, pending, response loss, foreign grant and original
replay. Do not treat an x402 settlement receipt as grant activation, independent
funding authority, delivery, restart recovery or permission to sign again.
Existing provider/runtime acceptance gates and the pilot NO_GO remain in force.
