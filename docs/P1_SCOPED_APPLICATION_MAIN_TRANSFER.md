# Scoped P1 application graph - main transfer

## Outcome and exact evidence

This batch brings the existing opt-in application/client/router graph onto main
without changing the default buyer, server entry, signer or payment planner.
The five runtime files below must be transferred together. All 33 non-fixture
application inputs must then match the exact bytes selected by the earlier
[V4 native local qualification](P1_NATIVE_V6_V4_LOCAL_QUALIFICATION.md).

That earlier experiment passed five selected cases plus their parent (6/6) at
[344acd0dbff40833bcdcde4d74b6c08fac825f4d](https://github.com/edgepillar/zenon-x402-poc/commit/344acd0dbff40833bcdcde4d74b6c08fac825f4d).
Its record and source commit are unchanged. This is source-byte correspondence
to that selected experiment, **not** a new native run or a relabelled main result.

The [new exact component result](../qualification/official-x402-ingress-main-transfer.actual-local-result.json)
adds 27 selected passes against the actual ingress and binding sources:
Node 24.19.0 / Darwin arm64, exit 0, complete streams, empty stderr, no skipped,
cancelled or todo tests. Only the four declared source inputs were readable
through the selected Node filesystem permissions. This was not broad test
discovery or a run of the historical ingress suite.

## Cohesive runtime scope

| Runtime source | Purpose and retained boundary |
| --- | --- |
| service-credit-bounded-https-ingress-owner.js | Preserve POST-only factory; explicitly select exact GET /paid plus declared POST targets |
| service-credit-native-https-client-transport.js | Same-origin, bounded TLS client; retain CLOSE_UNKNOWN and never retry automatically |
| x402-official-service-credit-https-application.js | Actual official server plus one admitted-grant durable session on the same ingress; borrowed store |
| x402-official-upfront-https-router.js | Original-header pending continuation/cache; no receipt-to-grant activation |
| x402-official-v6-original-payment-client.js | Same actual V6 payer, independent checkpoint pins and original header; no signer or payment replacement |

The main ingress difference is limited to the explicit mixed-profile factory
and its method/route checks. The prior POST-only constructor continues to admit
POST on its declared targets and reject GET, including when /paid is declared.
In the explicit official profile, POST /paid and GET on service targets are
rejected. GET /paid additionally enforces its exact Host, zero-body framing and
original request-binding checks on every admission reinspection.

The new regressions exercise both constructors, exact positive method/targets,
query/trailing/encoded target refusals, wrong/duplicate Host, nonzero GET body
framing, transfer encoding, Expect/Upgrade, declared encryption and payment
header refusals. Mutations of method, target and Host during response setup,
and of framing during deadline setup, never reach downstream. Caller target-array
mutation cannot broaden the captured policy; terminal late callbacks stay inert.

These cases execute the **actual ingress**, using explicitly declared server,
socket, response and deadline capabilities. They create no actual listener,
socket, TLS session, SQLite connection, SDK object, application timer, key,
signature or nonce search. Declared encryption is not native authentication.

## Resource and execution limits

One direct Node command ran with four exact read allowlists, no child/worker
permission, no filesystem write permission and compile cache disabled. Captures
were bounded to 64 KiB stdout and 8 KiB stderr, with an external 20-second
observation bound. This is not an OS network sandbox or hard CPU guarantee.
The Node binary digest was streamed in 1 MiB chunks instead of loading the
121 MB executable into one Python bytes object.

No qualification scratch, task-storage task, new private root, archive or
payload copy was created. Existing held SQLite files, task-store limits and
all historical results remain untouched. No one-shot native permission was
reused. The selected fixture is opt-in and requires the pinned runtime/source
controls recorded in the result; it is not silently added to npm test.

## Exclusions and remaining work

The separate native application host and its native deadline binding remain on
the working branch, unparsed/unrun and excluded from this transfer. The P0
profile, workflows, package/lock bytes, normal CLI entry points and active
payment preparation path are unchanged.

V4 used an explicit resolve-only namespace with existing core 2.23.0/zod package
bytes. This transfer does not establish an ordinary installed namespace,
an --omit=dev installation, other-platform execution or hosted CI. Original
native evidence used synthetic facilitator/service work, privileged grant
activation and funding handoff; none becomes actual funding/provider authority.

This is progress on the single-application roadmap. Full P0/P1, DP signed-original
integration, forced-interruption recovery and economic pilot acceptance remain
separate. Hosted CI is NOT_RUN_NOT_GREEN and economic pilot remains NO_GO.
