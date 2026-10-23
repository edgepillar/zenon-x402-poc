# P1 V4 selected native composition - local qualification

## Exact observed result

**P1_NATIVE_V6_SCOPED_PASS.** One approved V4 attempt ran the old application
graph at [344acd0dbff40833bcdcde4d74b6c08fac825f4d](https://github.com/edgepillar/zenon-x402-poc/commit/344acd0dbff40833bcdcde4d74b6c08fac825f4d).
Actual Node exit was 0, both output captures were complete, and stderr was empty.
TAP recorded six tests: five selected cases and their parent, all passed, with
zero failures, skipped, cancelled or todo tests.

The [source pins, actual diagnostics and complete TAP](../qualification/p1-native-v6-two-sqlite-once-v4.actual-local-result.json)
are the evidence for this exact selected profile. They do not relabel the three
earlier failed native attempts.

| Selected case | Actual result |
| --- | --- |
| Pending preserves the same V6 original and SDK tuple | PASS |
| Success, explicit synthetic BOUND handoff and actual V6 service submit | PASS |
| Original service proof replay without another debit | PASS |
| Valid foreign grant refused at client and native service admission | PASS |
| Post-header response loss and normal reopen of the same two files | PASS |

## What the final case established

The real native client observed one deliberately lost response after the server
had committed its response headers/result. A later submit was refused with no
new native request. Client CLOSE_UNKNOWN remained latched; close returned the
local payer-store slot without converting an uncertain service outcome into a
success.

Normal reopen of the same V6 payer file preserved its BOUND revision 3,
independently pinned funding checkpoint, both original requests and dispatch
intents, the prior successful response, and the absence of a response for the
lost reply. The actual `getOriginalRequestCustodyQuarantine` API returned
CUSTODY_OUTCOME_UNKNOWN. The foreign original was absent.

The actual application closed with zero tracked sockets, requests, handlers
and timers. The backend then closed and its actual `openExisting` API reopened
the same ledger file. The reopened ledger matched the prior envelope. Actual
assertions observed selected consumed/available units 4/6, foreign consumed
units 0, and exactly two execution records/callbacks. No extra debit or proof
was created for replay.

All five completion rows returned their assertions, all five milestone flags
were set only after the corresponding checks, and the parent error was null.
The runner independently required TAP pass/fail totals and actual exit 0 before
recording the scoped pass. A success diagnostic alone was not acceptance.

## Source and execution boundary

The graph comprised 57 verified files / 1,245,227 source bytes. The V4 fixture
and resolve-only profile were the only changed inputs from the V3 graph;
the other 55 inputs were unchanged. Packages were existing
`@x402/core@2.23.0` and `zod@3.25.76`; Node was pinned to
24.19.0 / Darwin arm64.

The mandatory read-only API-surface gate ran successfully before task
allocation and before OpenSSL/Node. It matched 73 direct named call occurrences
and twelve imports, with no missing or unsupported names. This source check
is not a general JavaScript parser or argument/schema compatibility proof.
The separate fifteen Python source-gate regressions are not fifteen native
composition cases.

Exactly one new 4 MiB task, one test-TLS OpenSSL command and one direct Node
command ran. There were zero Node children. Eight loopback connections
completed eight authenticated TLS 1.3 handshakes, below the 48-connection cap.
Only two new synthetic SQLite files, two in-memory synthetic capability keypairs
and three capability signatures were used. There were three bare-import
resolve bindings, 53 declared files resolved and zero source transforms.
Ordinary installed-package namespace qualification and an OS/network sandbox
are **not** established by this selected namespace.

No install, Zenon SDK, external network, wallet/payment/provider signature,
nonce search, real PREPARE, application restart or live/economic pilot ran.
Facilitator verification, settlement, observation, service work, privileged
grant activation and the PREPARED-to-BOUND handoff were explicitly synthetic.
A funding ACK does not establish actual grant activation, provider authority,
chain inclusion or economic acceptance.

## Preservation and publication boundary

The task closed SUCCESS, but its unknown native child files correctly remain
HOLD. Their combined logical size is 77,824 bytes. They were not retroactively
registered, adopted, deleted, reset or reused. All six child files from the three
earlier failed tasks were rehashed unchanged. CAS reuse added ten unique
objects; the private root now retains 95 objects / 1,737,022 logical bytes.
These counts are not APFS physical reclaim.

The root now has four closed tasks at its four-task limit. Its existing free
floor, quotas, metadata and ownership were not rebound, and no new root,
historical cleanup or permission reuse occurred.

Main receives this report and its exact local result, plus a historical V3
report cross-reference. The tested graph is not the current main runtime graph:
four native application/client/router modules are absent there, and the
bounded ingress bytes differ. Native code stays together on the working
branch rather than publishing an incomplete mixture or calling the old main
ingress qualified by this experiment.

The separate native-host current-handoff invalidation change was **not imported,
parsed or executed** in V4. Its new close-Promise/current-snapshot distinction
remains source-only on the working branch, as does the actual native application
deadline binding. The previously tested shared deadline core is a separate
component result, not qualification of those bindings.

## Remaining gates

This establishes the five selected old-graph local composition cases, including
normal same-file reopen. It does not establish forced process death, commit-loss
recovery, application reconstruction, ordinary installed namespace behavior,
hosted CI, new native-host integration, actual funding/provider activation,
Dynamic Plasma signed-original flow or live delivery.

The one-shot V4 permission is consumed. There is no automatic native retry.
Hosted CI is NOT_RUN_NOT_GREEN; full P1 remains NOT_ESTABLISHED and economic
pilot remains NO_GO.
